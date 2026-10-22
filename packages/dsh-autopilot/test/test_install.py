"""Root fixture tests: real offline installer; never writes the production root."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import hashlib
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import pwd
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

PACKAGE = Path(__file__).resolve().parents[1]


def fixture_directory(path):
    """Create a trusted fake system directory without changing the process umask."""
    path.mkdir(mode=0o700)
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fchmod(fd,0o755)
    finally:os.close(fd)


def seed_accounts(root):
    """Isolated NSS database; never copies secrets or alters live membership."""
    account = pwd.getpwnam('master')
    etc = root / 'etc'
    fixture_directory(etc)
    (etc / 'passwd').write_text('root:x:0:0:root:/root:/bin/bash\n' +
        f'master:x:{account.pw_uid}:{account.pw_gid}:Master:/nonexistent:/bin/bash\n')
    (etc / 'group').write_text(f'root:x:0:\nmaster:x:{account.pw_gid}:\n')
    (etc / 'gshadow').write_text('root:!::\nmaster:!::\n')
    (etc / 'gshadow').chmod(0o600)
    (etc / 'shadow').write_text('root:!:1:0:99999:7:::\nmaster:!:1:0:99999:7:::\n')
    (etc / 'shadow').chmod(0o600)
    (etc / 'login.defs').write_text('SYS_GID_MIN 100\nSYS_GID_MAX 999\n')
    for name in ('passwd','group','login.defs'):(etc/name).chmod(0o644)


def snapshot(root):
    result = {}
    for path in sorted(root.rglob('*')):
        st = path.lstat()
        content = os.readlink(path) if path.is_symlink() else (
            hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else '')
        result[str(path.relative_to(root))] = (st.st_mode, st.st_uid, st.st_gid,
                                              st.st_ino, st.st_mtime_ns,
                                              st.st_ctime_ns, content)
    return result


def listening_sockets():
    """Socket identity is stable when accept/backlog queues change."""
    rows = []
    for line in subprocess.check_output(['ss', '-ltnHe'], text=True).splitlines():
        fields = line.split()
        inodes = [part[4:] for part in fields if part.startswith('ino:')]
        if len(fields) < 6 or len(inodes) != 1 or not inodes[0].isdigit():
            raise ValueError('unrecognized ss listener row: ' + line)
        rows.append((fields[0], fields[3], fields[4], inodes[0]))
    return tuple(sorted(rows))


@unittest.skipUnless(os.geteuid() == 0, 'root fixture required')
class InstallTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='autopilot-install-test-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'root'
        fixture_directory(self.root)
        seed_accounts(self.root)
        self.initial = snapshot(self.root)
        self.package = Path(self.tmp.name) / 'package'
        shutil.copytree(PACKAGE, self.package)
        self.lock = json.loads((self.package / 'source-lock.json').read_text())
        self.release = self.root / 'opt/autopilot/releases' / (
            self.lock['upstream_sha'] + '-' + self.lock['local_revision'])

    def run_install(self, *args):
        script = self.package / 'install.sh'
        self.assertTrue(script.exists(), 'offline installer not implemented')
        return subprocess.run(['bash', str(script), *args],
                              env={**os.environ, 'DESTDIR': str(self.root)},
                              capture_output=True, text=True)

    def install(self):
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        # Catalogue installation is an explicit externally accepted bootstrap step.
        # Private fixture only: accept a complete deployment scope before first init.
        base=self.root/'var/lib/dsh-autopilot'
        if not (base/'bootstrap.json').exists():
            scope=self.root/'inventory-scope.json';scope.write_text(json.dumps(dict(schemaVersion=1,roots=[str(Path(self.tmp.name))],publicRoot=str(self.root/'srv/autopilot/public'))));scope.chmod(0o600)
            spec=importlib.util.spec_from_file_location('fixture_catalog',self.package/'runtime/run_catalog.py')
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            report=Path(self.tmp.name)/'legacy.json';report.write_text(json.dumps(module.scan_legacy(self.root))+'\n')
            module.bootstrap(base,self.root,report,hashlib.sha256(report.read_bytes()).hexdigest())
        return r

    def test_clean_repeat_deleted_file_repair(self):
        first = self.install()
        skill = self.root / 'opt/agent-skills/autopilot'
        self.assertEqual(skill.resolve(), self.release / 'skill')
        self.assertIn('CREATE', first.stdout)
        before = snapshot(self.root)
        second = self.install()
        self.assertIn('UNCHANGED', second.stdout)
        self.assertEqual(before, snapshot(self.root), 'repeat changed metadata/content')
        target = self.release / 'skill/tools/ap.py'
        old = hashlib.sha256(target.read_bytes()).hexdigest()
        target.unlink()
        self.assertFalse(target.exists())
        third = self.install()
        self.assertIn('REPAIR ' + str(target), third.stdout)
        self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), old)
        self.assertEqual(self.run_install('--check').returncode, 0)

    def test_dry_run_writes_nothing(self):
        before = snapshot(self.root)
        r = self.run_install('--dry-run')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('CREATE', r.stdout)
        self.assertEqual(snapshot(self.root), before)

    def test_check_missing_is_nonzero_readonly(self):
        r = self.run_install('--check')
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertEqual(snapshot(self.root), self.initial)

    def test_tampered_archive_refused_before_writes(self):
        archive = self.package / self.lock['archive']
        archive.write_bytes(archive.read_bytes() + b'corruption')
        r = self.run_install()
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('archive checksum', r.stderr)
        self.assertEqual(snapshot(self.root), self.initial)

    def test_directory_symlink_refused(self):
        outside = Path(self.tmp.name) / 'outside'
        _fixture_mkdir(outside, mode=0o755)
        (self.root / 'opt').symlink_to(outside, target_is_directory=True)
        r = self.run_install()
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('symlink', r.stderr)
        self.assertEqual(list(outside.iterdir()), [])

    def test_agent_owned_directory_refused_before_writes(self):
        folder = self.root / 'opt/autopilot/sources'
        _fixture_mkdir(folder, mode=0o755, parents=True)
        os.chown(folder, 65534, 65534)
        before = snapshot(self.root)
        r = self.run_install()
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('unsafe directory', r.stderr)
        self.assertEqual(snapshot(self.root), before)

    def test_writable_directory_refused_before_writes(self):
        folder = self.root / 'opt/autopilot/sources'
        _fixture_mkdir(folder, mode=0o755, parents=True)
        folder.chmod(0o777)
        before = snapshot(self.root)
        r = self.run_install()
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('unsafe directory', r.stderr)
        self.assertEqual(snapshot(self.root), before)

    def test_file_symlink_repaired_without_touching_target(self):
        self.install()
        outside = Path(self.tmp.name) / 'outside-file'
        outside.write_text('keep')
        target = self.release / 'skill/tools/ap.py'
        target.unlink()
        target.symlink_to(outside)
        self.install()
        self.assertFalse(target.is_symlink())
        self.assertEqual(outside.read_text(), 'keep')

    def test_unknown_argument_refused_readonly(self):
        r = self.run_install('--force')
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertEqual(snapshot(self.root), self.initial)

    def test_failed_new_release_keeps_previous_current(self):
        self.install()
        current = self.root / 'opt/autopilot/current'
        previous = os.readlink(current)
        next_revision = self.lock['local_revision'] + '-next'
        self.lock['local_revision'] = next_revision
        (self.package / 'source-lock.json').write_text(json.dumps(self.lock))
        spec = importlib.util.spec_from_file_location('fixture_installer',
                                                    self.package / 'lib/install.py')
        module = importlib.util.module_from_spec(spec)
        with patch.object(sys, 'path', [str(self.package / 'lib'), *sys.path]):
            spec.loader.exec_module(module)
        real_apply = module.apply

        def fail_last_file(path, entry):
            if str(path).endswith('-' + next_revision + '/skill/tools/ap.py'):
                raise OSError('simulated interrupted release')
            return real_apply(path, entry)

        with patch.dict(os.environ, {'DESTDIR': str(self.root)}), \
             patch.object(sys, 'argv', ['install.py']), \
             patch.object(module, 'apply', side_effect=fail_last_file):
            with self.assertRaisesRegex(OSError, 'interrupted release'):
                module.main()
        self.assertEqual(os.readlink(current), previous)

    def test_busy_lock_times_out_without_repair(self):
        self.install()
        target = self.release / 'skill/tools/ap.py'
        target.unlink()
        with (self.root / 'opt/autopilot/.install.lock').open('r+') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            process = subprocess.Popen(['bash', str(self.package / 'install.sh')],
                env={**os.environ, 'DESTDIR': str(self.root)},
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                started = time.monotonic()
                out, err = process.communicate(timeout=13)
                self.assertEqual(process.returncode, 2, out + err)
                self.assertIn('lock busy', err)
                self.assertLess(time.monotonic() - started, 13)
                self.assertFalse(target.exists())
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate()

    def test_nonroot_refused(self):
        # Give the dropped UID read access to the fixture, not to an agent's home.
        Path(self.tmp.name).chmod(0o755)
        script = self.package / 'install.sh'
        self.assertTrue(script.exists(), 'offline installer not implemented')
        r = subprocess.run(['setpriv', '--reuid=65534', '--regid=65534',
                            '--clear-groups', 'bash', str(script)],
                           env={**os.environ, 'DESTDIR': str(self.root)},
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('root required', r.stderr)

    def _role_anchor_refusal_and_return(self, kind):
        guard = self.package / 'lib/runtime-guard.py'
        original = guard.read_bytes()
        anchor = b".pw_name != 'master':"
        self.assertEqual(original.count(anchor), 1)
        changed = (original.replace(anchor, b".pw_name not in {'master'}:")
                   if kind == 'renamed' else b'# role shadow ' + anchor + b'\n' + original)
        self.assertEqual(changed.count(anchor), 0 if kind == 'renamed' else 2)
        self.assertNotEqual(hashlib.sha256(original).digest(), hashlib.sha256(changed).digest())
        lock_file = self.package / 'source-lock.json'
        saved_lock = lock_file.read_bytes()
        guard.write_bytes(changed)
        modified_lock = json.loads(saved_lock)
        modified_lock['runtime_guard_sha256'] = hashlib.sha256(changed).hexdigest()
        lock_file.write_text(json.dumps(modified_lock))
        print('ROLE-ANCHOR-CONTROL ' + json.dumps({'case': kind,
            'before_count': 1, 'bad_count': changed.count(anchor),
            'before_sha256': hashlib.sha256(original).hexdigest(),
            'bad_sha256': hashlib.sha256(changed).hexdigest()}))
        before = snapshot(self.root)
        result = self.run_install()
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn('guard role anchor', result.stderr)
        self.assertEqual(snapshot(self.root), before)
        guard.write_bytes(original)
        lock_file.write_bytes(saved_lock)
        self.install()
        mail = (self.release / 'pilot/pilot_mail.py').read_bytes()
        archive = (self.release / 'pilot/pilot_archive.py').read_bytes()
        raw_mail = (self.package / 'lib/pilot_mail.py').read_bytes().split(b'\n', 1)[1]
        raw_archive = (self.package / 'lib/pilot_archive.py').read_bytes().split(b'\n', 1)[1]
        self.assertTrue(mail.endswith(raw_mail))
        self.assertTrue(archive.endswith(raw_archive))
        self.assertEqual(mail[:-len(raw_mail)].count(b".pw_name not in {'master', 'coders'}:"), 1)
        self.assertEqual(archive[:-len(raw_archive)].count(anchor), 1)
        self.assertEqual(guard.read_bytes(), original)
        print('ROLE-ANCHOR-RETURN ' + json.dumps({'case': kind,
            'count': original.count(anchor),
            'sha256': hashlib.sha256(guard.read_bytes()).hexdigest()}))

    def test_pilot_mail_renamed_role_anchor_refused_and_return(self):
        self._role_anchor_refusal_and_return('renamed')

    def test_pilot_mail_duplicate_role_anchor_refused_and_return(self):
        self._role_anchor_refusal_and_return('duplicate')

    def test_root_runtime_refused_before_project_writes(self):
        self.install()
        project = Path(self.tmp.name) / 'project/.autopilot'
        _fixture_mkdir(project, mode=0o755, parents=True)
        ap = project / 'ap.py'
        shutil.copyfile(self.release / 'skill/tools/ap.py', ap)
        before = snapshot(project.parent)
        r = subprocess.run(['/usr/bin/python3', '-B', str(ap), 'init',
                            '--slug', 'root-refusal', '--no-serve'],
                           env={**os.environ, 'AUTOPILOT_NO_UPDATE_CHECK': '1'},
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('root runtime forbidden', r.stderr)
        self.assertEqual(snapshot(project.parent), before)

    def test_installer_does_not_execute_archived_python(self):
        marker = Path(self.tmp.name) / 'foreign-executed'
        archive = self.package / self.lock['archive']
        replacement = ('#!/usr/bin/env python3\nfrom pathlib import Path\nPath(' + repr(str(marker)) +
                       ').write_text("executed")\nif cmd == "finish" or opt.get("stop"):\n    pass\n').encode()
        destination = io.BytesIO()
        with tarfile.open(archive, 'r:gz') as src, \
             tarfile.open(fileobj=destination, mode='w:gz') as out:
            for member in src:
                data = src.extractfile(member).read() if member.isfile() else None
                if member.name == 'upstream/skills/autopilot/tools/ap.py':
                    data = replacement
                    member.size = len(data)
                out.addfile(member, io.BytesIO(data) if data is not None else None)
        archive.write_bytes(destination.getvalue())
        self.lock['archive_sha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
        (self.package / 'source-lock.json').write_text(json.dumps(self.lock))
        result = self.run_install()
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn('overlay base differs: tools/ap.py', result.stderr)
        self.assertFalse(marker.exists(), 'root installer executed foreign payload')
        self.assertEqual(snapshot(self.root), self.initial)

    def test_master_runtime_writes_operator_owned_state(self):
        self.install()
        Path(self.tmp.name).chmod(0o755)
        operator = pwd.getpwnam('master')
        project = Path(self.tmp.name) / 'operator-project'
        control = project / '.autopilot'
        project.mkdir(mode=0o700);control.mkdir(mode=0o700)
        for directory in (project, control):
            fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            try:os.fchown(fd,operator.pw_uid,operator.pw_gid);os.fchmod(fd,0o700)
            finally:os.close(fd)
        shutil.copyfile(self.release / 'skill/tools/ap.py', control / 'ap.py')
        shutil.copyfile(self.release / 'skill/tools/ap_sadik.py', control / 'ap_sadik.py')
        shutil.copyfile(self.release / 'skill/phases/dashboard-template.html',
                        control / 'dashboard.html')
        for name in ('ap.py', 'ap_sadik.py', 'dashboard.html'):
            (control / name).chmod(0o644)
        r = self.operator_call(control / 'ap.py', 'init', '--slug', 'operator-only',
                               '--skill-dir', str(self.release / 'skill'))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        state_file = control / 'state.js'
        self.assertEqual(state_file.stat().st_uid, operator.pw_uid)
        state = json.loads(state_file.read_text().split('=', 1)[1])
        self.assertEqual(state['skillDir'], str(self.release / 'skill'))
        self.assertFalse((control / 'serve.pid').exists())

    def test_other_account_runtime_refused(self):
        self.install()
        Path(self.tmp.name).chmod(0o755)
        r = subprocess.run(['setpriv', '--reuid=65534', '--regid=65534',
                            '--clear-groups', '/usr/bin/python3', '-B',
                            str(self.release / 'skill/tools/ap.py'), 'init',
                            '--slug', 'wrong-operator', '--no-serve'],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('operator master required', r.stderr)

    def test_public_without_master_membership_and_private_panels(self):
        self.install()
        row = next(line.split(':') for line in (self.root / 'etc/group').read_text().splitlines()
                   if line.startswith('autopilot-view:'))
        gid = int(row[2])
        self.assertNotIn('master', row[3].split(','))
        public = self.root / 'srv/autopilot/public'
        agent = public / 'master'
        account = pwd.getpwnam('master')
        self.assertEqual((public.stat().st_uid, public.stat().st_gid,
                          public.stat().st_mode & 0o7777), (0, gid, 0o2751))
        self.assertEqual((agent.stat().st_uid, agent.stat().st_gid,
                          agent.stat().st_mode & 0o7777), (account.pw_uid, gid, 0o2750))
        Path(self.tmp.name).chmod(0o755)
        panel = agent / 'state.js'
        r = subprocess.run(['setpriv', '--reuid='+str(account.pw_uid),
            '--regid='+str(account.pw_gid), '--clear-groups',
            '/usr/bin/python3', '-c', 'import os,sys; os.umask(0o027); p=sys.argv[1]; open(p+".tmp","w").write("panel"); os.rename(p+".tmp",p)',
            str(panel)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual((panel.stat().st_gid, panel.stat().st_mode & 0o777), (gid, 0o640))
        future = public / 'other-operator'
        _fixture_mkdir(future, mode=0o755)
        os.chown(future, 65534, gid)
        future.chmod(0o2750)
        future_panel = future / 'state.js'
        future_panel.write_text('other operator panel')
        os.chown(future_panel, 65534, gid)
        future_panel.chmod(0o640)
        master_other = subprocess.run(['setpriv', '--reuid='+str(account.pw_uid),
            '--regid='+str(account.pw_gid), '--clear-groups', '/bin/cat', str(future_panel)],
            capture_output=True, text=True)
        self.assertNotEqual(master_other.returncode, 0)
        reader = subprocess.run(['setpriv', '--reuid=65534', '--regid=65534',
            '--groups='+str(gid), '/bin/cat', str(panel)], capture_output=True, text=True)
        self.assertEqual((reader.returncode, reader.stdout), (0, 'panel'))
        outsider = pwd.getpwnam('varvara')
        outsider_call = ['setpriv', '--reuid='+str(outsider.pw_uid),
                         '--regid='+str(outsider.pw_gid), '--clear-groups']
        identity = subprocess.run([*outsider_call, '/usr/bin/id', '-u'],
                                  capture_output=True, text=True)
        self.assertEqual((identity.returncode, identity.stdout.strip()),
                         (0, str(pwd.getpwnam('varvara').pw_uid)), identity.stderr)
        other = subprocess.run([*outsider_call, '/bin/cat', str(panel)],
                               capture_output=True, text=True)
        self.assertNotEqual(other.returncode, 0)
        for path in (public, agent):
            other = subprocess.run([*outsider_call, '/bin/ls', str(path)],
                                   capture_output=True, text=True)
            self.assertNotEqual(other.returncode, 0)
        before = snapshot(self.root)
        self.install()
        self.assertEqual(snapshot(self.root), before)

    def test_public_permissions_repair_without_membership_changes(self):
        self.install()
        agent = self.root / 'srv/autopilot/public/master'
        agent.chmod(0o755)
        groupfile = self.root / 'etc/group'
        before_group = groupfile.read_bytes()
        public = self.root / 'srv/autopilot/public'
        public.chmod(0o2750)
        r = self.install()
        self.assertEqual(groupfile.read_bytes(), before_group)
        self.assertEqual(public.stat().st_mode & 0o7777, 0o2751)
        self.assertEqual(agent.stat().st_mode & 0o7777, 0o2750)
        self.assertIn('REPAIR', r.stdout)

    def test_existing_master_reader_membership_refused_readonly(self):
        self.install()
        groupfile = self.root / 'etc/group'
        text = groupfile.read_text()
        line = next(line for line in text.splitlines() if line.startswith('autopilot-view:'))
        groupfile.write_text(text.replace(line, line.rsplit(':', 1)[0] + ':master'))
        before = snapshot(self.root)
        for args in ((), ('--dry-run',), ('--check',)):
            result = self.run_install(*args)
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            self.assertIn('master must not be a member', result.stderr)
            self.assertEqual(snapshot(self.root), before)

    def test_existing_master_primary_reader_group_refused_readonly(self):
        self.install()
        gid = next(line.split(':')[2] for line in (self.root / 'etc/group').read_text().splitlines()
                   if line.startswith('autopilot-view:'))
        passwd = self.root / 'etc/passwd'
        text = passwd.read_text()
        old = next(line for line in text.splitlines() if line.startswith('master:'))
        fields = old.split(':')
        fields[3] = gid
        passwd.write_text(text.replace(old, ':'.join(fields)))
        before = snapshot(self.root)
        for args in ((), ('--dry-run',), ('--check',)):
            result = self.run_install(*args)
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            self.assertIn('master must not be a member', result.stderr)
            self.assertEqual(snapshot(self.root), before)

    def test_public_symlink_refused_before_nss_changes(self):
        outside = Path(self.tmp.name) / 'outside'
        _fixture_mkdir(outside, mode=0o755)
        (self.root / 'srv').symlink_to(outside, target_is_directory=True)
        before = snapshot(self.root)
        r = self.run_install()
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('symlink', r.stderr)
        self.assertEqual(snapshot(self.root), before)
        self.assertEqual(list(outside.iterdir()), [])

    def test_credential_created_private_and_preserved(self):
        first = self.install()
        folder = self.root / 'etc/dsh-autopilot'
        key = folder / 'razdacha-klyuch'
        self.assertTrue(key.exists(), 'service credential was not prepared')
        self.assertEqual(folder.stat().st_mode & 0o7777, 0o700)
        self.assertEqual((key.stat().st_uid, key.stat().st_gid, key.stat().st_mode & 0o7777),
                         (0, 0, 0o600))
        value = key.read_bytes()
        self.assertEqual(len(value), 65, 'credential must be 64 hex digits and LF')
        self.assertTrue(value.endswith(b'\n'))
        self.assertTrue(all(byte in b'0123456789abcdef' for byte in value[:-1]),
                        'credential must use lowercase hex only')
        before = snapshot(self.root)
        second = self.install()
        self.assertTrue(key.read_bytes() == value, 'existing credential changed')
        self.assertEqual(snapshot(self.root), before)
        self.assertFalse(value.decode().strip() in first.stdout + first.stderr +
                         second.stdout + second.stderr, 'credential leaked in installer output')
        Path(self.tmp.name).chmod(0o755)
        r = subprocess.run(['sudo', '-n', '-H', '-u', 'master', '/bin/cat', str(key)],
                           capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(r.stdout, '')

    def test_existing_empty_credential_refused_readonly(self):
        folder = self.root / 'etc/dsh-autopilot'
        folder.mkdir(mode=0o700)
        key = folder / 'razdacha-klyuch'
        key.touch(mode=0o600)
        before = snapshot(self.root)
        result = self.run_install()
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn('credential', result.stderr)
        self.assertEqual(snapshot(self.root), before)

    def test_existing_hex_credential_preserved_exactly(self):
        folder = self.root / 'etc/dsh-autopilot'
        folder.mkdir(mode=0o700)
        key = folder / 'razdacha-klyuch'
        for data in (b'a'*64, b'b'*64+b'\n'):
            key.write_bytes(data)
            key.chmod(0o600)
            before_key = key.stat()
            result = self.install()
            self.assertTrue(key.read_bytes() == data, 'existing key changed')
            after = key.stat()
            self.assertEqual((after.st_ino, after.st_mtime_ns, after.st_ctime_ns),
                             (before_key.st_ino, before_key.st_mtime_ns, before_key.st_ctime_ns))
            before = snapshot(self.root)
            self.install()
            self.assertEqual(snapshot(self.root), before)

    def test_credential_symlink_refused_readonly(self):
        folder = self.root / 'etc/dsh-autopilot'
        folder.mkdir(mode=0o700)
        outside = Path(self.tmp.name) / 'outside-key'
        outside.write_text('synthetic marker, not a production key')
        (folder / 'razdacha-klyuch').symlink_to(outside)
        before = snapshot(self.root)
        r = self.run_install()
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('credential', r.stderr)
        self.assertEqual(snapshot(self.root), before)

    def test_unsafe_existing_credential_refused_without_rotation(self):
        self.install()
        key = self.root / 'etc/dsh-autopilot/razdacha-klyuch'
        value = key.read_bytes()
        key.chmod(0o644)
        before = snapshot(self.root)
        r = self.run_install()
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('credential', r.stderr)
        self.assertTrue(key.read_bytes() == value, 'credential unexpectedly rotated')
        self.assertEqual(snapshot(self.root), before)
        key.chmod(0o600)
        self.assertEqual(self.run_install('--check').returncode, 0)

    def test_invalid_credential_content_refused_before_writes(self):
        folder = self.root / 'etc/dsh-autopilot'
        folder.mkdir(mode=0o700)
        key = folder / 'razdacha-klyuch'
        # Synthetic bad inputs, never production credentials.
        for data in [b'', b'short', b' \n ', b'a'*32, b'a'*63, b'a'*65,
                     b'a'*63+b'$', b'a'*63+b'"', b'a'*63+b'\\', b'a'*63+b';',
                     b'a'*63+b'A', b' '+b'a'*64, b'a'*64+b'\r\n', b'a'*64+b'\n\n',
                     b'x'*16+b'\x00', b'x'*16+b'\xff', b'x'*16+b'\r\nHeader']:
            key.write_bytes(data)
            key.chmod(0o600)
            before = snapshot(self.root)
            r = self.run_install()
            self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
            self.assertIn('credential', r.stderr)
            self.assertEqual(snapshot(self.root), before)

    def test_bytecode_archive_member_refused_before_writes(self):
        archive = self.package / self.lock['archive']
        original = archive.read_bytes()
        for name in ['upstream/skills/autopilot/tools/injected.pyc',
                     'upstream/__pycache__/not-code.txt']:
            data = io.BytesIO()
            with tarfile.open(fileobj=io.BytesIO(original), mode='r:gz') as src, \
                 tarfile.open(fileobj=data, mode='w:gz') as dst:
                for member in src:
                    dst.addfile(member, src.extractfile(member) if member.isfile() else None)
                if '__pycache__/' in name:
                    folder = tarfile.TarInfo('upstream/__pycache__')
                    folder.type = tarfile.DIRTYPE
                    folder.mode = 0o755
                    dst.addfile(folder)
                payload = b'synthetic bytecode corruption, not executable'
                member = tarfile.TarInfo(name)
                member.mode = 0o644
                member.size = len(payload)
                dst.addfile(member, io.BytesIO(payload))
            archive.write_bytes(data.getvalue())
            self.lock['archive_sha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
            (self.package / 'source-lock.json').write_text(json.dumps(self.lock))
            before = snapshot(self.root)
            r = self.run_install()
            self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
            self.assertIn('bytecode', r.stderr)
            self.assertEqual(snapshot(self.root), before)

    def test_shared_parent_modes_refused_without_repair(self):
        for rel in ['opt', 'opt/agent-skills', 'srv']:
            for mode in [0o2755, 0o750]:
                path = self.root / rel
                _fixture_mkdir(path, mode=0o755, parents=True, exist_ok=True)
                path.chmod(mode)
                before = snapshot(self.root)
                r = self.run_install()
                self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
                self.assertIn('shared parent', r.stderr)
                self.assertEqual(snapshot(self.root), before)
                path.chmod(0o755)

    def test_runtime_enforces_B_before_importing_project_module(self):
        self.install()
        Path(self.tmp.name).chmod(0o755)
        account = pwd.getpwnam('master')
        project = Path(self.tmp.name) / 'operator-bytecode'
        _fixture_mkdir(project, mode=0o755)
        os.chown(project, account.pw_uid, account.pw_gid)
        ap = project / 'ap.py'
        shutil.copyfile(self.release / 'skill/tools/ap.py', ap)
        # Run a real import after the installed guard, without -B from the caller.
        ap.write_bytes(ap.read_bytes().split(b'# DSH-AUTOPILOT-UPSTREAM-BEGIN\n', 1)[0] +
                       b'import probe_module, sys, os\nprint(str(int(sys.flags.dont_write_bytecode)) + ":" + os.environ.get("AUTOPILOT_NO_UPDATE_CHECK", "") + ":" + str("--no-serve" in sys.argv))\n')
        (project / 'probe_module.py').write_text('VALUE = 1\n')
        ap.chmod(0o644); (project / 'probe_module.py').chmod(0o644)
        command = ['setpriv', '--reuid='+str(account.pw_uid),
                   '--regid='+str(account.pw_gid), '--clear-groups', '/usr/bin/python3']
        environment = dict(os.environ)
        for name in ('PYTHONDONTWRITEBYTECODE', 'AUTOPILOT_NO_UPDATE_CHECK'):
            environment.pop(name, None)
        caller = subprocess.run([*command, '-c', 'import sys,os; print(str(int(sys.flags.dont_write_bytecode))+":"+os.environ.get("AUTOPILOT_NO_UPDATE_CHECK", ""))'],
                                env=environment, capture_output=True, text=True)
        self.assertEqual((caller.returncode, caller.stdout.strip()), (0, '0:'), caller.stderr)
        r = subprocess.run([*command, str(ap)], env=environment,
                           capture_output=True, text=True)
        self.assertEqual((r.returncode, r.stdout.strip()), (0, '1:1:True'), r.stderr)
        self.assertFalse((project / '__pycache__').exists())

    def operator_project(self):
        self.install()
        Path(self.tmp.name).chmod(0o755)
        account = pwd.getpwnam('master')
        project = Path(self.tmp.name) / 'pilot-project'
        control = project / '.autopilot'
        project.mkdir(mode=0o700);control.mkdir(mode=0o700)
        for folder in (project, control):
            fd=os.open(folder,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            try:os.fchown(fd,account.pw_uid,account.pw_gid);os.fchmod(fd,0o700)
            finally:os.close(fd)
        ap = control / 'ap.py'
        # Local copies exercise the guard's path/shebang regressions; B dispatches
        # accounting to the physical release. The publisher must stay in DESTDIR.
        shutil.copyfile(self.release / 'skill/tools/ap.py', ap)
        shutil.copyfile(self.release / 'skill/tools/ap_sadik.py', control / 'ap_sadik.py')
        (control / 'ap_sadik.py').chmod(0o644)
        ap.chmod(0o755)
        shutil.copyfile(self.release / 'skill/phases/dashboard-template.html', control / 'dashboard.html')
        (control / 'dashboard.html').chmod(0o644)
        return project, ap

    def operator_call(self, ap, *args, direct=False):
        command = [str(ap)] if direct else ['/usr/bin/python3', '-B', str(ap)]
        account = pwd.getpwnam('master')
        worker = ('import os,subprocess,sys; '
                  'e=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid())); '
                  'p=subprocess.run(sys.argv[1:],env=e);sys.exit(p.returncode)')
        return subprocess.run(['setpriv', '--reuid='+str(account.pw_uid),
                               '--regid='+str(account.pw_gid), '--clear-groups',
                               '/usr/bin/env', 'AUTOPILOT_NO_UPDATE_CHECK=',
                               'AUTOPILOT_AGENT=master',
                               'AUTOPILOT_PUBLIC_ROOT='+str(self.root / 'srv/autopilot/public'),
                               '/usr/bin/python3', '-B', '-c', worker, *command, *args],
                              capture_output=True, text=True)

    def test_pilot_serve_and_unknown_flags_refused_before_writes(self):
        project, ap = self.operator_project()
        before = snapshot(project)
        for args in [('serve',), ('sync', '--dry-run'), ('sync', '--check'),
                     ('sync', '-n'), ('init', '--slug', 'probe', '--check-update'),
                     ('--stop-now',)]:
            r = self.operator_call(ap, *args)
            self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
            self.assertEqual(snapshot(project), before)

    def test_pilot_default_no_server_and_physical_release(self):
        project, ap = self.operator_project()
        before = set(listening_sockets())
        r = self.operator_call(ap, 'init', '--slug', 'pilot-policy')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        state = json.loads((ap.parent / 'state.js').read_text().split('=', 1)[1])
        self.assertEqual(state['skillDir'], str(self.release / 'skill'))
        self.assertFalse((ap.parent / 'serve.pid').exists())
        self.assertFalse(set(listening_sockets()) - before, 'init opened a TCP listener')
        r = self.operator_call(ap, 'finish', '--result', 'done')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertFalse(set(listening_sockets()) - before, 'finish opened a TCP listener')

    def test_listener_snapshot_ignores_pending_queue_but_detects_new_socket(self):
        with socket.socket() as first:
            first.bind(('127.0.0.1', 0)); first.listen(2)
            inode = str(os.fstat(first.fileno()).st_ino)
            expected = ('LISTEN', '127.0.0.1:' + str(first.getsockname()[1]), '0.0.0.0:*', inode)
            before = set(listening_sockets()); self.assertIn(expected, before)
            with socket.create_connection(first.getsockname(), timeout=2):
                self.assertIn(expected, listening_sockets())
                with socket.socket() as extra:
                    extra.bind(('127.0.0.1', 0)); extra.listen(2)
                    added = ('LISTEN', '127.0.0.1:' + str(extra.getsockname()[1]), '0.0.0.0:*', str(os.fstat(extra.fileno()).st_ino))
                    self.assertIn(added, set(listening_sockets()) - before)
                self.assertNotIn(added, listening_sockets())
                self.assertIn(expected, listening_sockets())

    def test_pilot_home_current_and_state_path_override_refused(self):
        project, ap = self.operator_project()
        before = snapshot(project)
        r = self.operator_call(ap, 'init', '--slug', 'bad-path', '--skill-dir',
                               str(self.root / 'opt/autopilot/current/skill'))
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertEqual(snapshot(project), before)
        r = self.operator_call(ap, 'init', '--slug', 'pilot-path')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        before = snapshot(project)
        r = self.operator_call(ap, 'set', 'skillDir=/home/master/other-skill')
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertEqual(snapshot(project), before)

    def test_pilot_direct_executable_has_shebang(self):
        project, ap = self.operator_project()
        self.assertTrue(ap.read_bytes().startswith(b'#!/usr/bin/env python3\n'))
        r = self.operator_call(ap, 'init', '--slug', 'direct-pilot', direct=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_main_commits_allowed_with_no_arguments_only(self):
        project, ap = self.operator_project()
        r = self.operator_call(ap, 'init', '--slug', 'main-commits')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        r = self.operator_call(ap, 'commits')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('коммиты сданных тасков на месте', r.stdout)
        before = snapshot(project)
        for args in [('commits', 'extra'), ('commits', '--force'), ('commits', '--check')]:
            r = self.operator_call(ap, *args)
            self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
            self.assertEqual(snapshot(project), before)

    def test_pilot_symlink_dotdot_checks_upstream_state(self):
        project, ap = self.operator_project()
        self.assertEqual(self.operator_call(ap, 'init', '--slug', 'project-a').returncode, 0)
        account = pwd.getpwnam('master')
        other = Path(self.tmp.name) / 'project-b'
        control = other / '.autopilot'
        inner = other / 'inner'
        other.mkdir(mode=0o700);control.mkdir(mode=0o700);inner.mkdir(mode=0o700)
        for folder in (other, control, inner):
            fd=os.open(folder,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            try:os.fchown(fd,account.pw_uid,account.pw_gid);os.fchmod(fd,0o700)
            finally:os.close(fd)
        other_ap = control / 'ap.py'
        shutil.copyfile(ap, other_ap)
        shutil.copyfile(ap.parent / 'ap_sadik.py', control / 'ap_sadik.py')
        shutil.copyfile(ap.parent / 'dashboard.html', control / 'dashboard.html')
        for name in ('ap.py', 'ap_sadik.py', 'dashboard.html'):
            (control / name).chmod(0o644)
        self.assertEqual(self.operator_call(other_ap, 'init', '--slug', 'project-b').returncode, 0)
        state_path = ap.parent / 'state.js'
        state = json.loads(state_path.read_text().split('=', 1)[1])
        state['skillDir'] = str(self.release.parent / 'other-release/skill')
        state_path.write_text('window.STATE =\n' + json.dumps(state) + '\n')
        (project / 'bridge').symlink_to(inner, target_is_directory=True)
        alias = project / 'bridge' / '..' / '.autopilot' / 'ap.py'
        self.assertEqual(alias.resolve(), other_ap)
        before = (snapshot(project), snapshot(other))
        for entrypoint in (ap, alias):
            result = self.operator_call(entrypoint, 'sync')
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            self.assertEqual((snapshot(project), snapshot(other)), before)



class DirectoryCreationMode(unittest.TestCase):
    def setUp(self):
        sys.path.insert(0,str(PACKAGE/'lib'));self.addCleanup(lambda:sys.path.remove(str(PACKAGE/'lib')))
        spec=importlib.util.spec_from_file_location('directory_installer_fixture',PACKAGE/'lib/install.py')
        self.inst=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.inst)
    def test_new_directory_is_private_before_validation_even_with_umask0002(self):
        import stat
        self.assertEqual(os.geteuid(),0,'root fixture required')
        with tempfile.TemporaryDirectory(prefix='ap-apply-new-') as tmp:
            target=Path(tmp)/'new';self.assertFalse(target.exists());observed=[];real_open=self.inst.os.open
            def checked_open(value,*args,**kwargs):
                if Path(value)==target:observed.append(stat.S_IMODE(target.lstat().st_mode))
                return real_open(value,*args,**kwargs)
            previous=os.umask(0o002)
            try:
                self.assertIn('Umask:\t0002',Path('/proc/self/status').read_text())
                with patch.object(self.inst.os,'open',side_effect=checked_open):
                    try:self.inst.apply(target,('dir',0o755,None))
                    except ValueError as error:self.fail('new directory refused under0002: '+str(error))
            finally:os.umask(previous)
            self.assertEqual(observed,[0o700],'new directory was exposed before owner/mode validation')
            info=target.lstat();self.assertEqual((info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode)),(0,0,0o755))
            print('APPLY_NEW_DIR actual_umask=0002 before_validation=0700 final=0755 owner=root:root',flush=True)
    def test_existing0775_is_refused_without_repair_or_inode_change(self):
        import stat
        self.assertEqual(os.geteuid(),0,'root fixture required')
        with tempfile.TemporaryDirectory(prefix='ap-apply-existing-') as tmp:
            target=Path(tmp)/'existing';_fixture_mkdir(target, mode=0o755);target.chmod(0o775);before=target.lstat();previous=os.umask(0o002)
            try:
                with self.assertRaisesRegex(ValueError,'unsafe directory owner/permissions'):self.inst.apply(target,('dir',0o755,None))
            finally:os.umask(previous)
            after=target.lstat();self.assertEqual((before.st_dev,before.st_ino,before.st_uid,before.st_gid,stat.S_IMODE(before.st_mode)),(after.st_dev,after.st_ino,after.st_uid,after.st_gid,stat.S_IMODE(after.st_mode)));self.assertEqual(stat.S_IMODE(after.st_mode),0o775)
            print('APPLY_EXISTING_DIR refused0775 inode_and_mode_unchanged=True',flush=True)

    def test_new_public_directories_are_private_before_validation_under0002(self):
        import stat
        with tempfile.TemporaryDirectory(prefix='ap-public-new-') as tmp:
            root=Path(tmp)/'root';fixture_directory(root);seed_accounts(root)
            module=self.inst.public_tree;paths=[root/'srv',root/'srv/autopilot',root/'srv/autopilot/public',root/'srv/autopilot/public/master'];opened=[];real_open=module.os.open
            def checked_open(value,*args,**kwargs):
                if Path(value) in paths:opened.append((str(value),stat.S_IMODE(Path(value).lstat().st_mode)))
                return real_open(value,*args,**kwargs)
            previous=os.umask(0o002)
            try:
                self.assertIn('Umask:\t0002',Path('/proc/self/status').read_text())
                with patch.object(module.os,'open',side_effect=checked_open):
                    try:module.prepare(root)
                    except ValueError as error:self.fail('new public directory refused under0002: '+str(error))
            finally:os.umask(previous)
            self.assertEqual([path for path,mode in opened],[str(p) for p in paths]);self.assertTrue(all(mode in (0o700,0o2700) for path,mode in opened));self.assertEqual(module.inspect(root)[3],[])
            print('PUBLIC_NEW_DIRS actual_umask=0002 access0700_before_validation=4/4 inherited_sgid_allowed=True modes='+repr([oct(mode) for path,mode in opened])+' final_layout_verified=True',flush=True)
    def test_existing_public0775_is_refused_without_repair_or_nss_changes(self):
        with tempfile.TemporaryDirectory(prefix='ap-public-existing-') as tmp:
            root=Path(tmp)/'root';fixture_directory(root);seed_accounts(root);target=root/'srv';target.mkdir(mode=0o700);target.chmod(0o775);before=snapshot(root);previous=os.umask(0o002)
            try:
                with self.assertRaisesRegex(ValueError,'unsafe public/NSS directory'):self.inst.public_tree.prepare(root)
            finally:os.umask(previous)
            self.assertEqual(snapshot(root),before);print('PUBLIC_EXISTING0775 refused inode_mode_nss_unchanged=True',flush=True)

if __name__ == '__main__':
    unittest.main(verbosity=2)
