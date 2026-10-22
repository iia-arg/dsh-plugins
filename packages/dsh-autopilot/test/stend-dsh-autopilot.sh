#!/usr/bin/env bash
# Root prepares disposable fixtures; Autopilot events run only as master.
set -euo pipefail
if (( $# )); then printf '%s\n' 'СЛЕПОТА: аргументы не поддерживаются' >&2; exit 2; fi
package_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
exec /usr/bin/python3 -I -B - "$package_dir" <<'PY'
import importlib.util
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time

DECLARED = (
    'test_time_history.py','test_time_usage.py','test_receipt_v5.py','test_time_publication_root.py','test_time_collection_root.py',
    'test_end_index_store_root.py','test_expired_jobs.py','test_expired_release_root.py','test_end_final_root.py','test_final_publication_root.py','test_receipt_v4.py',
    'test_usage_byte_limit.py','test_deadline_policy.py','test_session_ownership.py','test_ownership_cursor.py','test_session_owner_export.py','test_ownership_projection.py','test_ownership_root.py',
    'test_binding_refusal.py','test_finish_durability.py','test_runtime_gap_cut.py','test_run_coverage.py','test_operator_cut.py',
    'test_owner_inventory.py', 'test_accepted_inventory.py', 'test_attestation_pin.py', 'test_census_pin_policy.py', 'test_root_usage.py', 'test_legacy_window.py', 'test_run_catalog.py', 'test_runtime_catalog.py', 'test_rollback_catalog_cli.py',
    'test_codex_account_map_root.py','test_gateway_segments.py','test_registration_queue.py','test_gateway_receipt_source.py','test_raw_supplier.py','test_raw_index.py','test_raw_decoder.py','test_raw_supplier_cached.py','test_native_synthetic.py','test_child_witness_reason.py','test_usage_registration.py','test_usage_registration_root.py','test_runtime_receipt_source.py','test_runtime_incremental.py','test_runtime_receipt_source_root.py','test_team_usage.py','test_child_usage.py','test_team_usage_projection.py','test_composition.py', 'test_dashboard_ui.py', 'test_usage_contract.py', 'test_measure_claude.py', 'test_g4.py', 'test_install.py', 'test_mail_pilot.py',
    'test_part_b_layout.py', 'test_pilot_scope_limits.py', 'test_privileged.py', 'test_sadik.py',
    'test_dedicated_mail.py', 'test_pilot_notice.py', 'test_pilot_nonroot_mail.py', 'test_pilot_transport.py',
    'test_post_core.py', 'test_post_capacity.py', 'test_post_retention.py', 'test_post_callers.py',
    'test_post_failure.py', 'test_post_receive_cli.py', 'test_post_copies.py', 'test_copy_transport.py', 'test_mail_tls.py', 'test_tls_preparation.py', 'test_copy_connect.py',
)
PACKAGE = Path(sys.argv[1])
PRIVATE_SOURCE_TESTS = {'test_runtime_receipt_source.py','test_runtime_incremental.py'}
ROOT_TESTS = PRIVATE_SOURCE_TESTS | {'test_time_collection_root.py','test_time_publication_root.py','test_usage_byte_limit.py','test_end_index_store_root.py','test_expired_release_root.py','test_end_final_root.py','test_final_publication_root.py','test_ownership_root.py','test_finish_durability.py','test_codex_account_map_root.py','test_usage_registration_root.py','test_runtime_receipt_source_root.py','test_owner_inventory.py','test_accepted_inventory.py', 'test_attestation_pin.py', 'test_census_pin_policy.py','test_root_usage.py','test_legacy_window.py','test_run_catalog.py','test_runtime_catalog.py','test_rollback_catalog_cli.py','test_composition.py', 'test_install.py', 'test_privileged.py',
    'test_dedicated_mail.py','test_pilot_notice.py','test_post_core.py','test_post_capacity.py',
    'test_post_retention.py','test_post_callers.py','test_post_failure.py','test_post_copies.py','test_copy_transport.py','test_mail_tls.py','test_copy_connect.py'}
SEARCH_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
LIMIT = 600  # 70 declared lifecycle/raw modules; product owner/G budgets unchanged
deadline = time.monotonic() + LIMIT


def summary(green, failed, blind, covered):
    print(f'стендов {len(DECLARED)} · зелёных {green} · провалов {failed} · слепых {blind}', flush=True)
    print(f'покрытие: {covered} из {len(DECLARED)} объявленных test_*.py', flush=True)


def refuse(reason):
    print('СЛЕПОТА: ' + reason, flush=True)
    summary(0, 0, len(DECLARED), 0)
    raise SystemExit(2)


def live_queue_snapshot(path):
    # Missing mail is explicit, not an empty queue. Never open SQLite in rw mode.
    try:path.lstat()
    except FileNotFoundError:return dict(state='ABSENT')
    if path.is_symlink():raise ValueError('live mail database is a symlink')
    with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=3) as db:
        db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
        rows=db.execute('SELECT run_id,request_sha FROM usage_registrations ORDER BY run_id,request_sha').fetchall()
        count=db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0]
        if count!=len(rows):raise ValueError('inconsistent live queue snapshot')
    return dict(state='PRESENT',count=count,identitySHA256=hashlib.sha256(json.dumps(rows,separators=(',',':')).encode()).hexdigest(),runIds=[row[0] for row in rows])


@contextmanager
def live_queue_guard(path=Path('/var/lib/autopilot-mail/mail.sqlite')):
    try:before=live_queue_snapshot(path)
    except (OSError,sqlite3.Error,ValueError,TypeError) as error:
        print('СЛЕПОТА: LIVE_QUEUE_UNREADABLE before: '+str(error),flush=True)
        raise SystemExit(2)
    before_ids=set(before.pop('runIds',[]))
    print('LIVE_QUEUE_BEFORE '+json.dumps(before),flush=True)
    try:yield
    finally:
        prior=sys.exc_info()[1]
        try:after=live_queue_snapshot(path)
        except (OSError,sqlite3.Error,ValueError,TypeError) as error:
            print('СЛЕПОТА: LIVE_QUEUE_UNREADABLE after: '+str(error),flush=True)
            raise SystemExit(2)
        after_ids=set(after.pop('runIds',[]))
        print('LIVE_QUEUE_AFTER '+json.dumps(after),flush=True)
        if before!=after:
            print('FAIL: LIVE_QUEUE_CHANGED '+json.dumps(dict(addedRunIds=sorted(after_ids-before_ids),removedRunIds=sorted(before_ids-after_ids))),flush=True)
            if not (isinstance(prior,SystemExit) and prior.code==2):raise SystemExit(1)
        else:print('LIVE_QUEUE_EQUAL',flush=True)


if not DECLARED:
    refuse('объявленный список тестов пуст')
print('Объявлены: ' + ', '.join(DECLARED), flush=True)
# The receiver runtime is measured through its installed command, not a version guess.
deadline_gate=subprocess.run([sys.executable,'-I','-B',str(PACKAGE/'checks/deadline-check.py'),
    '--ap',str(PACKAGE/'lib/pilot_mail.py'),'--limits',str(PACKAGE/'lib/task_limits.py')],
    capture_output=True,text=True,timeout=5)
print(deadline_gate.stdout+deadline_gate.stderr,flush=True)
if deadline_gate.returncode:raise SystemExit(1)

actual = {p.name for p in (PACKAGE / 'test').glob('test_*.py')}
if actual != set(DECLARED):
    refuse('не совпал список: нет ' + repr(sorted(set(DECLARED) - actual)) +
           '; не объявлены ' + repr(sorted(actual - set(DECLARED))))
if any((PACKAGE / 'test' / name).is_symlink() for name in DECLARED):
    refuse('объявленный тест — ссылка')
if os.geteuid() != 0:
    refuse('нужен root для fixture установщика/UID, runtime выполняется как master')
for command in ('sudo', 'git', 'node', 'groupadd', 'usermod', 'setpriv', 'ss', 'bash', 'getent', 'bwrap'):
    if shutil.which(command, path=SEARCH_PATH) is None:
        refuse('нет команды ' + command)
try:
    operator = pwd.getpwnam('master')
    postal_fixture = pwd.getpwnam('coders')
    for user in ('coders', 'varvara', 'nobody'):
        pwd.getpwnam(user)
except KeyError as error:
    refuse('нет fixture-учётки: ' + str(error))

RUNNER = '''import json, sys, unittest
from pathlib import Path
loader = unittest.TestLoader()
suite = loader.loadTestsFromName(sys.argv[1])
expected = suite.countTestCases()
if loader.errors or not expected:
    print('СЛЕПОТА: пустой/не загруженный unittest ' + sys.argv[1])
    for error in loader.errors: print(error)
    raise SystemExit(2)
result = unittest.TextTestRunner(verbosity=2).run(suite)
print('unittest: %d из %d' % (result.testsRun, expected))
if result.failures or result.errors:
    code = 1
elif result.skipped or result.expectedFailures or result.unexpectedSuccesses or result.testsRun != expected:
    code = 2
else:
    code = 0
if code == 2: print('СЛЕПОТА: пропуск/expectedFailure/unexpectedSuccess/неполный набор ' + sys.argv[1])
Path(sys.argv[2]).write_text(json.dumps(dict(code=code, run=result.testsRun, expected=expected)))
raise SystemExit(code)
'''

with live_queue_guard(), tempfile.TemporaryDirectory(prefix='dsh-autopilot-root-',dir='/root') as protected_directory, tempfile.TemporaryDirectory(prefix='dsh-autopilot-stend-') as directory:
    stage = Path(directory)
    stage.chmod(0o755)
    try:
        # Copy reviewed package bytes, never run the production installer/root AP.
        package = stage / 'package'
        shutil.copytree(PACKAGE, package, ignore=shutil.ignore_patterns('__pycache__'))
        protected_package = Path(protected_directory) / 'package'
        shutil.copytree(PACKAGE, protected_package, ignore=shutil.ignore_patterns('__pycache__'))
        sys.path.insert(0, str(package / 'test'))
        from _fixture_dirs import fixture_mkdir
        sys.path.insert(0, str(package / 'lib'))
        spec = importlib.util.spec_from_file_location('stand_installer', package / 'lib/install.py')
        installer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(installer)
        lock, raw = installer.source()
        sys.path.insert(0, str(package / 'runtime'))
        from part_b_layout import overlay
        adapted = overlay(lock, dict(raw))
        role = (package / 'lib/runtime-guard.py').read_bytes().split(b"\nif __name__ == '__main__':\n", 1)[0]
        # B tests relocate their own release; only the role prefix is portable.
        # Full A pin/argv guard is separately exercised by test_install/composition.
        for root, entries in ((stage / 'upstream', raw), (stage / 'adapted', adapted)):
            for rel, (kind, mode, data) in entries.items():
                path = root / rel
                fixture_mkdir(path.parent, mode=0o755, parents=True, exist_ok=True)
                if kind == 'dir': fixture_mkdir(path, mode=mode, exist_ok=True)
                elif kind == 'link': path.symlink_to(data)
                else:
                    if root.name == 'adapted' and rel.as_posix() in (
                            'skills/autopilot/tools/ap.py', 'skills/autopilot/tools/ap_sadik.py'):
                        if rel.name == 'ap.py':
                            first, body = data.split(b'\n', 1)
                            data = first + b'\n' + role + b'\n' + body
                        else: data = role + b'\n' + data
                    if root.name == 'adapted' and rel.as_posix() == 'skills/autopilot/tools/run_catalog.py':
                        data = data.replace(b"BASE = Path('/var/lib/dsh-autopilot')", ('BASE = Path('+repr(str(stage/'run-inventory'))+')').encode())
                    path.write_bytes(data); path.chmod(mode)
        (stage / 'adapted/skills/release.json').write_text(json.dumps(lock))
        # Catalogue identities use the real immutable release-name layout.
        physical_skill = stage/'fixture-releases'/(lock['upstream_sha']+'-'+lock['local_revision'])/'skill'
        shutil.copytree(stage/'adapted/skills/autopilot',physical_skill)
        (physical_skill.parent/'release.json').write_text(json.dumps(lock))
        (physical_skill.parent/'pilot').mkdir(mode=0o755)
        shutil.copyfile(package/'lib/task_limits.py',physical_skill.parent/'pilot/task_limits.py')
        # A synthetic accepted empty legacy HOME, not the live Master inventory.
        spec = importlib.util.spec_from_file_location('fixture_catalog', package/'runtime/run_catalog.py')
        inventory = importlib.util.module_from_spec(spec); spec.loader.exec_module(inventory)
        legacy_home = stage  # explicit whole private deployment, never HOME-only
        scope=legacy_home/'inventory-scope.json';scope.write_text(json.dumps(dict(schemaVersion=1,roots=[str(stage)],publicRoot=str(stage/'public'))));scope.chmod(0o600)
        report = stage/'legacy.json';report.write_text(json.dumps(inventory.scan_legacy(legacy_home))+'\n')
        inventory.bootstrap(stage/'run-inventory',legacy_home,report,__import__('hashlib').sha256(report.read_bytes()).hexdigest())
        root_home = stage / 'home-root'; root_home.mkdir(mode=0o700)
        home = stage / 'home-master'; home.mkdir(mode=0o700)
        os.chown(home, operator.pw_uid, operator.pw_gid)
        postal_home = stage / 'home-postal'; postal_home.mkdir(mode=0o700)
        os.chown(postal_home, postal_fixture.pw_uid, postal_fixture.pw_gid)
    except Exception as error:
        refuse('подготовка fixture: ' + str(error))
    green = failed = blind = 0
    def exhausted(index):
        print(f'СЛЕПОТА: общий предел {LIMIT} с: ' + DECLARED[index], flush=True)
        for pending in DECLARED[index + 1:]:
            print('СЛЕПОТА: не запущен после общего предела: ' + pending, flush=True)
        return len(DECLARED) - index

    for index, name in enumerate(DECLARED):
        if time.monotonic() >= deadline:
            blind += exhausted(index)
            break
        print('СТЕНД ' + name, flush=True)
        selected_home = root_home if name in ROOT_TESTS else postal_home if name == 'test_pilot_nonroot_mail.py' else home
        selected_user = 'coders' if name == 'test_pilot_nonroot_mail.py' else 'master'
        env = {'PATH': SEARCH_PATH, 'HOME': str(selected_home),
               'PYTHONDONTWRITEBYTECODE': '1', 'AUTOPILOT_NO_UPDATE_CHECK': '1',
               'AUTOPILOT_USAGE_MAIL_SOCKET': str(stage/'no-registration-endpoint/post.sock'),
               'AUTOPILOT_TEST_UPSTREAM': str(stage / 'upstream'),
               'AUTOPILOT_TEST_SKILL': str(physical_skill),
               'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1'}
        if 'VYPUSK_REESTR' in os.environ:env['VYPUSK_REESTR']=os.environ['VYPUSK_REESTR']
        receipt = selected_home / (name + '.result.json')
        command = ['/usr/bin/python3', '-B', '-c', RUNNER, name[:-3], str(receipt)]
        if name in PRIVATE_SOURCE_TESTS:
            command = ['/usr/bin/python3', '-I', '-B', str(package/'test/_runtime_sources_private.py'), name[:-3], str(receipt)]
        if name not in ROOT_TESTS:
            command = ['sudo', '-n', '-u', selected_user, 'env', '-i', *[k+'='+v for k,v in env.items()], *command]
        test_package = package
        if name == 'test_root_usage.py':
            test_package = protected_package
            command = ['unshare','--mount','--propagation','private',*command]
        child = subprocess.Popen(command, cwd=test_package / 'test', env=env, start_new_session=True)
        try:
            code = child.wait(timeout=max(0, deadline - time.monotonic()))
            timed_out = time.monotonic() >= deadline
        except subprocess.TimeoutExpired:
            timed_out = True
        if timed_out:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
            blind += exhausted(index)
            break
        try:
            result = json.loads(receipt.read_text())
            if result['code'] != code or not 0 < result['run'] == result['expected']:
                raise ValueError('incomplete execution')
        except (OSError, ValueError, KeyError, TypeError):
            print('СЛЕПОТА: нет полного результата ' + name, flush=True); code = 2
        if code == 0: green += 1
        elif code == 1: failed += 1; print('FAIL: ' + name, flush=True)
        else: blind += 1; print('СЛЕПОТА: ' + name + ' код ' + str(code), flush=True)
    summary(green, failed, blind, green + failed)
    raise SystemExit(1 if failed else 2 if blind else 0)
PY
