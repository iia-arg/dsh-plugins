"""Core-release selection verification and registry candidate, no runtime execution.

Root-accepted legacy bootstrap and the shared guarded-runtime catalogue provide
run admission. Legacy physical runtimes require the separately enforced operator
window and a fresh accepted census bound to that window.
"""
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import signal
import stat
import subprocess
import tempfile
import time
import uuid

import yaml

PACKAGE = Path(__file__).resolve().parents[1]
RELEASE = re.compile(r'[0-9a-f]{40}-[A-Za-z0-9][A-Za-z0-9._-]{0,100}\Z')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def _read_registry(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != 0 or
                before.st_nlink != 1 or before.st_mode & 0o002 or before.st_size > 8 * 1024 * 1024):
            raise ValueError('REGISTRY_UNSAFE')
        chunks = []
        while chunk := os.read(fd, 65536):
            chunks.append(chunk)
            if sum(map(len, chunks)) > 8 * 1024 * 1024:
                raise ValueError('REGISTRY_TOO_LARGE')
        identity = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid,
                              s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        if identity(before) != identity(os.fstat(fd)) or identity(before) != identity(path.lstat()):
            raise ValueError('REGISTRY_CHANGED_DURING_READ')
        return b''.join(chunks)
    finally:
        os.close(fd)


class _RegistryLoader(yaml.SafeLoader):
    def compose_node(self, parent, index):
        if self.check_event(yaml.AliasEvent):
            raise ValueError('REGISTRY_ALIAS_UNSUPPORTED')
        return super().compose_node(parent, index)


def _mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str) or key in result:
            raise ValueError('REGISTRY_DUPLICATE_OR_NONSTRING_KEY')
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


_RegistryLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapping)


def _registry(data):
    try:
        doc = yaml.load(data, Loader=_RegistryLoader)
    except (yaml.YAMLError, UnicodeError, TypeError) as exc:
        raise ValueError('REGISTRY_INVALID') from exc
    if not isinstance(doc, dict):
        raise ValueError('REGISTRY_INVALID')
    entries = [(group, i, item) for group, items in doc.items() if isinstance(items, list)
               for i, item in enumerate(items) if isinstance(item, dict) and item.get('id') == 'dsh-autopilot']
    if len(entries) != 1:
        raise ValueError('REGISTRY_AP_ENTRY_NOT_UNIQUE')
    return doc, entries[0]


def _manifest_binding(root, entry):
    try:
        if not isinstance(entry.get('installed_check'), str):
            raise ValueError()
        argv = shlex.split(entry['installed_check'])
        if (len(argv) not in (8, 10) or argv[:3] != ['/usr/bin/python3', '-I', '-B'] or
                not argv[3].endswith('/layout-check.py') or argv[4] != '--manifest' or argv[6] != '--sha'):
            raise ValueError()
        if len(argv) == 10 and (argv[8] != '--root' or Path(argv[9]) != root):
            raise ValueError()
        if root != Path('/') and len(argv) != 10:
            raise ValueError()
        path = Path(argv[5])
        checker_path = Path(argv[3])
        if (not path.is_absolute() or '..' in path.parts or
                not any(path.is_relative_to(root / prefix) for prefix in
                        ('usr/local/libexec/dsh-autopilot', 'opt/autopilot/selection-manifests')) or
                not re.fullmatch('[0-9a-f]{64}', argv[7])):
            raise ValueError()
        if (not checker_path.is_absolute() or '..' in checker_path.parts or
                not any(checker_path.is_relative_to(root / prefix) for prefix in
                        ('usr/local/libexec/dsh-autopilot', 'opt/autopilot/packages'))):
            raise ValueError()
        return path, argv[7], checker_path
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError('MANIFEST_BINDING_INVALID') from exc


def _checker():
    spec = importlib.util.spec_from_file_location('rollback_layout_checker', PACKAGE / 'checks/layout-check.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def inspect_selection(root, target, *, deadline=None):
    """Read exact recorded release contents and derive a selector-only manifest."""
    root = Path(root)
    deadline = time.monotonic() + 60 if deadline is None else deadline
    if not root.is_absolute() or '..' in root.parts or root.resolve() != root:
        raise ValueError('ROOT_UNSAFE')
    if not isinstance(target, str) or not RELEASE.fullmatch(target):
        raise ValueError('RELEASE_NAME_INVALID')
    current_path = root / 'opt/autopilot/current'
    info = current_path.lstat()
    if not stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_gid != 0:
        raise ValueError('CURRENT_SELECTOR_UNSAFE')
    current_link = os.readlink(current_path)
    if not current_link.startswith('releases/') or not RELEASE.fullmatch(current_link[9:]):
        raise ValueError('CURRENT_SELECTOR_INVALID')
    current = current_link[9:]
    if current == target:
        raise ValueError('RELEASE_ALREADY_CURRENT')
    registry_path = root / 'etc/agent-registry/plugins.yaml'
    registry_bytes = _read_registry(registry_path)
    doc, (group, index, entry) = _registry(registry_bytes)
    manifest_path, manifest_sha, checker_path = _manifest_binding(root, entry)
    checker = _checker()
    try:
        manifest = checker.manifest(manifest_path, manifest_sha)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise ValueError('MANIFEST_INVALID') from exc
    roots = ['/opt/autopilot/releases/' + name for name in (current, target)]
    recorded = {row['path']: row for row in manifest['rows']}
    checker_row = recorded.get('/' + checker_path.relative_to(root).as_posix())
    if (not checker_row or checker_row.get('kind') != 'file' or
            (checker_row['uid'], checker_row['gid']) != (0, 0) or checker_row['mode'] not in (0o644, 0o755)):
        raise ValueError('INSTALLED_CHECKER_NOT_RECORDED')
    for release_root in roots:
        if release_root not in manifest.get('managed', []):
            raise ValueError('RELEASE_NOT_RECORDED: ' + release_root)
        if any(recorded.get(release_root + suffix, {}).get('kind') != 'file'
               for suffix in ('/release.json', '/skill/SKILL.md', '/skill/tools/ap.py', '/skill/tools/ap_sadik.py')):
            raise ValueError('RELEASE_RECORD_INCOMPLETE: ' + release_root)
    selector = recorded.get('/opt/autopilot/current')
    if not selector or selector.get('kind') != 'link' or selector.get('target') != current_link:
        raise ValueError('CURRENT_MANIFEST_MISMATCH')
    # Preserve the complete accepted layout, including retained postal bytes.
    checked = _verify_manifest(root, manifest_path, manifest_sha, deadline)
    if checked['rc'] or checked['timeout']:
        raise ValueError('RELEASE_INTEGRITY: ' + checked['stderr'][:600])
    selected = copy.deepcopy(manifest)
    next(row for row in selected['rows'] if row['path'] == '/opt/autopilot/current')['target'] = 'releases/' + target
    return dict(root=root, current=current, target=target, registry_path=registry_path,
                registry_bytes=registry_bytes, registry_sha=digest(registry_bytes), registry=doc,
                entry_group=group, entry_index=index, manifest_path=manifest_path,
                manifest_sha=manifest_sha, checker_path=checker_path, selected_manifest=selected, deadline=deadline)


def registry_candidate(plan, manifest_path, manifest_sha, operation):
    """Produce bytes for native pravka, preserving unrelated YAML bytes/fields."""
    if not re.fullmatch('[0-9a-f]{64}', manifest_sha) or not re.fullmatch('[0-9a-f]{16,32}', operation):
        raise ValueError('REGISTRY_SELECTION_METADATA_INVALID')
    expected = copy.deepcopy(plan['registry'])
    entry = expected[plan['entry_group']][plan['entry_index']]
    if not isinstance(entry.get('note', ''), str):
        raise ValueError('REGISTRY_AP_NOTE_INVALID')
    command = ['/usr/bin/python3', '-I', '-B', str(plan['checker_path']),
               '--manifest', str(manifest_path), '--sha', manifest_sha]
    if plan['root'] != Path('/'):
        command += ['--root', str(plan['root'])]
    entry['installed_check'] = shlex.join(command)
    entry['channel'] = 'selected core ' + plan['target'] + '; package and postal runtime retained'
    entry['note'] = entry.get('note', '') + '; core selector operation ' + operation
    text = plan['registry_bytes'].decode('utf-8')
    # Locate the accepted entry using YAML marks, then splice only changed scalar
    # values. Indentation, folding, comments and unrelated entries stay byte-exact.
    try:
        document, (group, index, _) = _registry(plan['registry_bytes'])
    except ValueError as exc:
        if str(exc) == 'REGISTRY_AP_ENTRY_NOT_UNIQUE':
            raise ValueError('REGISTRY_AP_BLOCK_AMBIGUOUS') from exc
        raise
    if document != plan['registry'] or (group, index) != (plan['entry_group'], plan['entry_index']):
        raise ValueError('REGISTRY_SELECTION_ESCAPED_AP_ENTRY')
    node = yaml.compose(text, Loader=_RegistryLoader)
    sequence = next(value for key, value in node.value if key.value == group)
    item = sequence.value[index]
    fields = {key.value: value for key, value in item.value}
    edits = []
    missing = []
    for key in ('installed_check', 'channel', 'note'):
        value = json.dumps(entry[key], ensure_ascii=False)
        if key in fields:
            scalar = fields[key]
            start, end = scalar.start_mark.index, scalar.end_mark.index
            if not isinstance(scalar, yaml.ScalarNode) and not scalar.flow_style:
                # Ignore block-end marks and comments after the last value.
                end = max(token.end_mark.index for token in yaml.scan(text)
                          if start <= token.start_mark.index < token.end_mark.index <= end)
            # Scalar tokens may include a block's terminal newline. Keep all
            # trailing layout outside the replacement, for every value shape.
            while end > start and text[end - 1] in ' \t\r\n\x85\u2028\u2029':
                end -= 1
            if start == end:
                value = ' ' + value  # Empty YAML scalar can start immediately after ':'.
            edits.append((start, end, value))
        else:
            missing.append((key, value))
    if missing:
        if item.flow_style:
            position = item.end_mark.index - 1
            trailing = any(isinstance(token, yaml.FlowEntryToken) and item.value[-1][1].end_mark.index <= token.start_mark.index < position for token in yaml.scan(text))
            addition = (' ' if trailing else ', ') + ', '.join(key + ': ' + value for key, value in missing)
        else:
            position = item.end_mark.index
            line = position - item.end_mark.column
            if not text[line:position].strip():
                position = line
            indent = ' ' * item.value[0][0].start_mark.column
            addition = ('' if not position or text[position-1] == '\n' else '\n')
            addition += ''.join(indent + key + ': ' + value + '\n' for key, value in missing)
        edits.append((position, position, addition))
    result = text
    # At the same position, append missing fields first so an empty last
    # value is inserted before them. Do not let replacement text break ties.
    for start, end, replacement in sorted(reversed(edits), key=lambda edit: edit[:2], reverse=True):
        result = result[:start] + replacement + result[end:]
    if _registry(result.encode())[0] != expected:
        raise ValueError('REGISTRY_SELECTION_ESCAPED_AP_ENTRY')
    return result


def _stop_child(child):
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        return child.communicate(timeout=0.5)
    except subprocess.TimeoutExpired as exc:
        stdout, stderr = exc.output or b'', exc.stderr or b''
        child.stdout.close()
        child.stderr.close()
        try:
            child.wait(timeout=0.5)
        except subprocess.TimeoutExpired as pending:
            raise ValueError('SUBPROCESS_NOT_REAPED') from pending
        return stdout, stderr


def _command(argv, env, limit):
    child = subprocess.Popen(argv, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             start_new_session=True)
    timeout = False
    try:
        stdout, stderr = child.communicate(timeout=limit)
    except subprocess.TimeoutExpired:
        timeout = True
        stdout, stderr = _stop_child(child)
    except BaseException:
        _stop_child(child)
        raise
    return dict(rc=child.returncode, timeout=timeout, stdout=stdout.decode(errors='replace'),
                stderr=stderr.decode(errors='replace'))


def _remaining(deadline, cap):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValueError('ROLLBACK_DEADLINE_EXPIRED')
    return min(remaining, cap)


def _verify_manifest(root, path, sha, deadline, checker_path=None):
    checker_path = PACKAGE / 'checks/layout-check.py' if checker_path is None else checker_path
    argv = ['/usr/bin/python3', '-I', '-B', str(checker_path),
            '--manifest', str(path), '--sha', sha, '--root', str(root)]
    return _command(argv, dict(os.environ), _remaining(deadline, 10))


def master_idle(root, *, deadline=None):
    """Use the accepted shared HOD predicate, refusing unknown/distillation states."""
    root = Path(root)
    deadline = time.monotonic() + 60 if deadline is None else deadline
    env = dict(os.environ)
    if root == Path('/') and any(key.startswith('HOD_') for key in env):
        raise ValueError('MASTER_PROBE_OVERRIDE_REFUSED')
    env['PATH'] = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    result = _command(['/usr/local/libexec/agent-hod/hod-sluzhby', 'master.service'], env, _remaining(deadline, 5))
    if result['rc'] != 0 or result['timeout']:
        raise ValueError('MASTER_IDLE_UNPROVEN')
    lines = result['stdout'].splitlines()
    if len(lines) != 1:
        raise ValueError('MASTER_IDLE_UNPROVEN')
    if lines[0] == 'pid=0 start=0 end=0 poslednee= zhurnal=net-processa':
        return result
    if not re.fullmatch(r'pid=[1-9][0-9]* start=[0-9]+ end=[0-9]+ '
                        r'poslednee=(?:turn/end|) zhurnal=est distill=net', lines[0]):
        raise ValueError('MASTER_IDLE_UNPROVEN')
    return result


def publish_registry(plan, candidate, point, *, dry_run=False):
    """Delegate only to native pravka; report observed bytes even on rc5/timeout.

    The transaction coordinator must perform admission before calling this helper.
    This function does not assert that the selected release has been activated.
    """
    if os.geteuid() != 0:
        raise ValueError('ROOT_REQUIRED')
    if not re.fullmatch(r'AP-ROLLBACK-[A-Za-z0-9-]{1,64}', point):
        raise ValueError('REGISTRY_POINT_INVALID')
    candidate = Path(candidate)
    candidate_bytes = _read_registry(candidate)
    argv = ['/usr/local/bin/agent-plugins', 'pravka', str(candidate), '--osnova', plan['registry_sha']]
    if not dry_run:
        argv += ['--ustanovit', '--punkt', point]
    env = dict(os.environ)
    for key in list(env):
        if key.startswith('GIT_') or key in {'PLUGINS_REGISTRY', 'AGENT_PLUGINS_STRAHOVKI', 'AGENT_PLUGINS_RUKI'}:
            env.pop(key)
    env.update(PLUGINS_REGISTRY=str(plan['registry_path']),
               AGENT_PLUGINS_STRAHOVKI=str(plan['root'] / 'var/backups/montazh'),
               GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_NOSYSTEM='1',
               PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin')
    result = _command(argv, env, _remaining(plan['deadline'], 20))
    actual = _read_registry(plan['registry_path'])
    result.update(actual_sha=digest(actual), candidate_sha=digest(candidate_bytes), old_sha=plan['registry_sha'],
                  candidate_installed=actual == candidate_bytes, original_retained=actual == plan['registry_bytes'])
    return result


def _directory(path, mode):
    if not path.exists() and not path.is_symlink():
        path.mkdir(mode=mode)
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_gid != 0 or
            stat.S_IMODE(info.st_mode) != mode):
        raise ValueError('ROLLBACK_DIRECTORY_UNSAFE: ' + str(path))


def _write(path, data, mode):
    fd, temporary = tempfile.mkstemp(prefix='.rollback-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
            os.fchown(f.fileno(), 0, 0)
            os.fchmod(f.fileno(), mode)
        os.replace(temporary, path)
    finally:
        if os.path.lexists(temporary):
            os.unlink(temporary)


def _selector(path, value, ownership=None):
    temporary = path.parent / ('.current-' + uuid.uuid4().hex)
    link_fd = None
    try:
        os.symlink(value, temporary)
        os.lchown(temporary, 0, 0)
        link_fd = os.open(temporary, os.O_PATH | os.O_NOFOLLOW)
        if ownership is not None:
            ownership['fd'] = link_fd
        os.replace(temporary, path)
        info = os.fstat(link_fd)
        identity = (info.st_dev, info.st_ino, info.st_ctime_ns)
        if ownership is not None:
            ownership['identity'] = identity
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        if link_fd is not None and (ownership is None or ownership.get('fd') != link_fd):
            os.close(link_fd)
        if os.path.lexists(temporary):
            os.unlink(temporary)
    info = path.lstat()
    if ((info.st_dev, info.st_ino, info.st_ctime_ns) != identity or
            not stat.S_ISLNK(info.st_mode) or os.readlink(path) != value):
        raise ValueError('SELECTOR_READBACK_FAILED')
    return identity


def _ap_entry(raw):
    doc, (group, index, _) = _registry(raw)
    return doc[group][index]


def _owns_selector(path, ownership, target):
    info = path.lstat()
    if ownership.get('fd') is not None:
        original = os.fstat(ownership['fd'])
        expected = (original.st_dev, original.st_ino, original.st_ctime_ns)
    else:
        expected = ownership.get('identity')
    return (expected == (info.st_dev, info.st_ino, info.st_ctime_ns) and
            stat.S_ISLNK(info.st_mode) and os.readlink(path) == 'releases/' + target)


def _reconcile_selection(plan, ownership, selected, selected_bytes, candidate):
    """Observe actual fields; recover known old registry with a separate5s budget."""
    deadline = time.monotonic() + 5
    current = plan['root'] / 'opt/autopilot/current'
    actual = _read_registry(plan['registry_path'])
    entry = _ap_entry(actual)
    actual_target = os.readlink(current)
    observed = dict(registryActual=digest(actual), actualCurrentTarget=actual_target)
    old_entry = _ap_entry(plan['registry_bytes'])
    expected_entry = _ap_entry(candidate.read_bytes()) if candidate is not None and candidate.is_file() else None
    if entry == old_entry and actual_target == 'releases/' + plan['current']:
        return dict(phase='refused-original-selection-retained', changed=False, **observed)
    own = _owns_selector(current, ownership, plan['target'])
    if entry == expected_entry and own:
        return dict(phase='selected-registry-command-unconfirmed', changed=True, **observed)
    if entry == old_entry and own and selected is not None and selected_bytes is not None:
        verified = _verify_manifest(plan['root'], selected, digest(selected_bytes), deadline, plan['checker_path'])
        if verified['rc'] or verified['timeout']:
            return dict(phase='failed-needs-inspection', changed=True, recoveryVerification=verified, **observed)
        _remaining(deadline, 1)
        if (_ap_entry(_read_registry(plan['registry_path'])) != old_entry or
                not _owns_selector(current, ownership, plan['target'])):
            return dict(phase='concurrent-state-needs-inspection', changed=True, **observed)
        _selector(current, 'releases/' + plan['current'])
        return dict(phase='registry-refused-selector-restored', changed=False,
                    actualCurrentTarget=os.readlink(current), registryActual=digest(_read_registry(plan['registry_path'])))
    return dict(phase='concurrent-state-needs-inspection', changed=actual_target != 'releases/' + plan['current'], **observed)


def apply_admitted_selection(plan, admission, *, before_select=None, after_select=None):
    """Transaction building block; caller supplies verified admission, not argv.

    The public CLI holds the shared catalogue lock throughout this transaction.
    Direct component tests must state their synthetic admission assumption.
    """
    if os.geteuid() != 0 or not callable(admission):
        raise ValueError('ROLLBACK_ADMISSION_REQUIRED')
    root = plan['root']
    current = root / 'opt/autopilot/current'
    admissions = []

    def admit():
        proof = admission(plan)
        if not isinstance(proof, dict) or len(json.dumps(proof).encode()) > 65536:
            raise ValueError('ADMISSION_TRACE_MISSING_OR_INVALID')
        admissions.append(proof)

    admit()
    fd = os.open(root / 'opt/autopilot/.install.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    operation = uuid.uuid4().hex
    record = dict(schemaVersion=1, operation=operation, current=plan['current'], target=plan['target'],
                  phase='admission', changed=False, admissionChecks=admissions)
    record_path = None
    selected = selected_bytes = candidate = None
    ownership = {}
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o077:
            raise ValueError('INSTALL_LOCK_UNSAFE')
        deadline = min(plan['deadline'], time.monotonic() + 3)
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise ValueError('INSTALL_LOCK_BUSY')
                time.sleep(0.05)
        fresh = inspect_selection(root, plan['target'], deadline=plan['deadline'])
        if fresh['current'] != plan['current'] or fresh['registry_bytes'] != plan['registry_bytes']:
            raise ValueError('ROLLBACK_PLAN_STALE')
        admit()
        for path, mode in [(root / 'var', 0o755), (root / 'var/lib', 0o755),
                           (root / 'var/lib/dsh-autopilot', 0o755),
                           (root / 'var/lib/dsh-autopilot/rollback', 0o700),
                           (root / 'opt/autopilot/selection-manifests', 0o755)]:
            _directory(path, mode)
        folder = root / 'var/lib/dsh-autopilot/rollback' / operation
        folder.mkdir(mode=0o700)
        record_path = folder / 'record.json'

        def checkpoint(phase, **fields):
            record.update(phase=phase, **fields)
            _write(record_path, (json.dumps(record, ensure_ascii=False, indent=2) + '\n').encode(), 0o600)

        selected = root / 'opt/autopilot/selection-manifests' / (operation + '.json')
        selected_bytes = (json.dumps(plan['selected_manifest'], ensure_ascii=False, indent=2) + '\n').encode()
        _write(selected, selected_bytes, 0o644)
        _write(folder / 'registry-before.yaml', plan['registry_bytes'], 0o600)
        candidate = folder / 'registry-candidate.yaml'
        _write(candidate, registry_candidate(plan, selected, digest(selected_bytes), operation).encode(), 0o600)
        checkpoint('prepared', registryBefore=plan['registry_sha'], selectedManifest=str(selected),
                   selectedManifestSha256=digest(selected_bytes))
        checked = publish_registry(plan, candidate, 'AP-ROLLBACK-' + operation, dry_run=True)
        if checked['rc'] or checked['timeout']:
            checkpoint('registry-dry-run-refused', registryTool=checked)
            return 2, record
        fresh = inspect_selection(root, plan['target'], deadline=plan['deadline'])
        if fresh['registry_bytes'] != plan['registry_bytes'] or fresh['current'] != plan['current']:
            checkpoint('plan-changed-before-selection')
            return 2, record
        admit()
        if plan['deadline'] - time.monotonic() < 3:
            checkpoint('insufficient-time-before-selection')
            return 2, record
        if before_select is not None:before_select(plan)
        identity = _selector(current, 'releases/' + plan['target'], ownership)
        checkpoint('selected', changed=True, selectorIdentity=list(identity))
        if after_select is not None:after_select(plan)
        result = publish_registry(plan, candidate, 'AP-ROLLBACK-' + operation)
        actual = _read_registry(plan['registry_path'])
        entry = _ap_entry(actual)
        expected_entry = _ap_entry(candidate.read_bytes())
        if entry == expected_entry:
            verified = _verify_manifest(root, selected, digest(selected_bytes), plan['deadline'], plan['checker_path'])
            if verified['rc'] or verified['timeout']:
                checkpoint('selected-postcheck-failed', registryTool=result, verification=verified)
                return 2, record
            phase = 'complete' if result['rc'] == 0 and not result['timeout'] else 'selected-registry-command-unconfirmed'
            checkpoint(phase, registryTool=result, registryActual=digest(actual))
            return (0 if phase == 'complete' else 2), record
        reconciled = _reconcile_selection(plan, ownership, selected, selected_bytes, candidate)
        phase = reconciled.pop('phase')
        checkpoint(phase, registryTool=result, **reconciled)
        return 2, record
    except BaseException as exc:
        if record_path is not None:
            try:
                reconciled = _reconcile_selection(plan, ownership, selected, selected_bytes, candidate)
            except (OSError, ValueError) as recovery_error:
                reconciled = dict(phase='failed-needs-inspection', recoveryError=str(recovery_error))
            record.update(reconciled, error=type(exc).__name__, reason=str(exc))
            _write(record_path, (json.dumps(record, ensure_ascii=False, indent=2) + '\n').encode(), 0o600)
            return 2, record
        raise
    finally:
        try:
            if ownership.get('fd') is not None:
                os.close(ownership.pop('fd'))
        finally:
            os.close(fd)


def assert_no_live_pins(plan, catalog):
    return catalog.assert_no_live_pins(plan['current'])


def legacy_runtimes(plan):
    legacy=[]
    recorded={row['path'] for row in plan['selected_manifest']['rows'] if row['kind']=='file'}
    for name in (plan['current'],plan['target']):
        release=plan['root']/'opt/autopilot/releases'/name
        meta=json.loads((release/'release.json').read_bytes())
        protocol=meta.get('run_inventory_protocol')
        if protocol is None or type(protocol) is int and protocol==0:
            legacy.append(name)
        elif type(protocol) is not int or protocol!=1:
            raise ValueError('RUNTIME_PROTOCOL_UNSUPPORTED: '+name)
        elif '/opt/autopilot/releases/'+name+'/skill/tools/run_catalog.py' not in recorded:
            raise ValueError('GUARDED_RUNTIME_NOT_RECORDED: '+name)
    return legacy


def rollback(root, release):
    plan = inspect_selection(root, release)
    legacy=legacy_runtimes(plan)

    def interrupted(signum, _):
        raise KeyboardInterrupt('ROLLBACK_INTERRUPTED: signal ' + str(signum))

    previous = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        import sys
        sys.path.insert(0, str(PACKAGE / 'runtime'))
        from run_catalog import Catalog
        with Catalog(root / 'var/lib/dsh-autopilot') as catalog:
            window=None
            if legacy:
                from operator_window import assert_fenced
                window=assert_fenced(root)
                if catalog.stamp.get('windowId')!=window['id']:
                    raise ValueError('RUN_INVENTORY_UNPROVEN: accepted census is not bound to this fenced window')

            def admission(selected):
                master_idle(selected['root'], deadline=selected['deadline'])
                if legacy:
                    fresh=assert_fenced(root)
                    if fresh['id']!=window['id']:raise ValueError('OPERATOR_WINDOW_OWNER_CHANGED')
                proof=assert_no_live_pins(selected,catalog)
                if window:proof['windowId']=window['id']
                return proof

            def before(selected):
                if selected['target'] in legacy:
                    assert_fenced(root)
                    catalog.invalidate(selected['target'],window['id'])

            def after(selected):
                if selected['target'] in legacy:
                    catalog.invalidate(selected['target'],window['id'],selected_already=True)

            rc, record = apply_admitted_selection(plan,admission,before_select=before,after_select=after)
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    print(json.dumps({key: record[key] for key in ('operation', 'phase', 'changed', 'current', 'target')}))
    return rc
