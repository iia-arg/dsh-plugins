"""B-N-ZV-ROTACIYA delta: real filesystem ctime, mocked service clock/channel.
Removing the ctime fallback or skipping node_modules must fail these probes.
Only process/journal times are supplied by fixtures; ctime is never backdated.
"""
import datetime
import hashlib
import json
import os
import subprocess
from pathlib import Path
import time
import unittest
import test_zhivaya_rotaciya as R


class CopyCtime(unittest.TestCase):
    def setUp(self):
        self.r = R.Rotaciya()
        self.r.setUp()
        self.addCleanup(self.r.doCleanups)
        self.f = self.r.f
        self.u = self.r.u
        self.root = self.r.disk.parent
        (self.root/'src').mkdir()
        self.file = self.root/'src/code.js'
        self.file.write_text('good code\n')
        self.start = int(time.time())+2
        self.set_start(self.start)
        self.u['_boots'][0]['first_entry'] = (self.start+7200)*1000000

    def set_start(self, n):
        self.u['ExecMainStartTimestamp'] = datetime.datetime.fromtimestamp(n,datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')

    def run_watch(self):
        return self.r.run_watch()

    def test_newer_process_is_counted_by_time_not_version(self):
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertIn('сошлось по времени запуска',p.stdout)
        self.assertIn('по времени 1',p.stdout)
        self.assertIn('сошлось 0',p.stdout)
        self.assertEqual(alerts,[])

    def test_process_older_than_copy_alerts_instead_of_silent_history(self):
        self.set_start(int(time.time())-10)
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode,1,p.stdout+p.stderr)
        self.assertIn('ПОДОЗРЕНИЕ',p.stdout)
        self.assertIn('fixture.service · dsh-tool-bridge',p.stdout)
        self.assertIn('старше своих файлов',p.stdout)
        self.assertEqual(len(alerts),1)

    def test_equal_ctime_second_is_blind(self):
        self.set_start(max(x.stat().st_ctime_ns for x in [self.root,self.root/'src',self.r.disk,self.file])//10**9)
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode,2,p.stdout+p.stderr)
        self.assertIn('СЛЕПОТА',p.stdout)
        self.assertEqual(len(alerts),1)

    def test_unreadable_dependency_ctime_is_blind(self):
        (self.root/'node_modules').symlink_to(self.f.root/'missing-dependencies',target_is_directory=True)
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode,2,p.stdout+p.stderr)
        self.assertIn('СЛЕПОТА',p.stdout)
        self.assertEqual(len(alerts),1)

    def test_whole_copy_unavailable_is_history_inside_blindness(self):
        ctl=self.f.bin/'systemctl'
        s=ctl.read_text()
        s+='\nif "ExecMainStartTimestamp" in sys.argv:\n import shutil\n shutil.rmtree('+repr(str(self.root))+',ignore_errors=True)\n'
        ctl.write_text(s)
        p,alerts=self.run_watch()
        self.assertEqual(p.returncode,2,p.stdout+p.stderr)
        self.assertIn('СЛЕПОТА',p.stdout)
        self.assertIn('ИСТОРИЯ',p.stdout)
        self.assertEqual(len(alerts),1)

    def test_nested_node_modules_symlink_is_in_scope(self):
        deps=self.f.root/'dependencies';deps.mkdir()
        nested=deps/'nested';nested.mkdir();late=nested/'module.js';late.write_text('old\n')
        (self.root/'node_modules').symlink_to(deps,target_is_directory=True)
        p,_=self.run_watch();self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        time.sleep(max(0,self.start+1.05-time.time()))
        before=late.stat();before_sha=hashlib.sha256(late.read_bytes()).hexdigest()
        late.write_text('changed dependency\n')
        after=late.stat();after_sha=hashlib.sha256(late.read_bytes()).hexdigest()
        grep=subprocess.run(['grep','-cF','changed dependency',str(late)],capture_output=True,text=True)
        self.assertEqual((grep.returncode,grep.stdout.strip()),(0,'1'))
        self.assertGreater(after.st_ctime_ns,before.st_ctime_ns)
        self.assertNotEqual(before_sha,after_sha)
        print(json.dumps(dict(probe='node_modules',grepFixedCount=1,beforeSHA=before_sha,afterSHA=after_sha,beforeCtimeNs=before.st_ctime_ns,afterCtimeNs=after.st_ctime_ns)))
        p,alerts=self.run_watch();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertEqual(len(alerts),1)
        self.set_start(after.st_ctime_ns//10**9+2)
        p,_=self.run_watch();self.assertEqual(p.returncode,0,p.stdout+p.stderr)

    def test_intermediate_links_and_target_path_components(self):
        for component in [False, True]:
            with self.subTest(component=component):
                deps=[]
                for n in [1,2]:
                    d=self.f.root/('deps-'+str(component)+'-'+str(n));d.mkdir()
                    (d/'modules').mkdir();(d/'modules/code.js').write_text('old dependency\n')
                    deps.append(d)
                link=self.f.root/('external-'+str(component))
                link.symlink_to(deps[0] if component else deps[0]/'modules',target_is_directory=True)
                nm=self.root/'node_modules';nm.unlink(missing_ok=True)
                nm.symlink_to(link/'modules' if component else link,target_is_directory=True)
                self.start=int(time.time())+2;self.set_start(self.start)
                p,_=self.run_watch();self.assertEqual(p.returncode,0,p.stdout+p.stderr)
                time.sleep(max(0,self.start+1.05-time.time()))
                before=link.lstat();before_sha=hashlib.sha256(os.readlink(link).encode()).hexdigest()
                new=link.with_suffix('.new');new.symlink_to(deps[1] if component else deps[1]/'modules',target_is_directory=True);os.replace(new,link)
                after=link.lstat();after_sha=hashlib.sha256(os.readlink(link).encode()).hexdigest()
                grep=subprocess.run(['grep','-cF',str(deps[1])],input=os.readlink(link)+'\n',capture_output=True,text=True)
                self.assertEqual((grep.returncode,grep.stdout.strip()),(0,'1'))
                self.assertGreater(after.st_ctime_ns,before.st_ctime_ns);self.assertNotEqual(before_sha,after_sha);self.assertNotEqual(before.st_ino,after.st_ino)
                print(json.dumps(dict(probe='intermediate-link',component=component,grepFixedCount=1,beforeSHA=before_sha,afterSHA=after_sha,beforeCtimeNs=before.st_ctime_ns,afterCtimeNs=after.st_ctime_ns,beforeInode=before.st_ino,afterInode=after.st_ino)))
                p,alerts=self.run_watch();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertEqual(len(alerts),1)
                self.set_start(after.st_ctime_ns//10**9+2)
                p,_=self.run_watch();self.assertEqual(p.returncode,0,p.stdout+p.stderr)

    def test_kernel_invalid_file_components_are_blind(self):
        nm=self.root/'node_modules'
        for suffix in ['/../', '/.', '/']:
            with self.subTest(suffix=suffix):
                nm.unlink(missing_ok=True);nm.symlink_to(str(self.file)+suffix)
                with self.assertRaises(OSError):nm.stat()
                self.set_start(int(time.time())+3600);self.f.sost.unlink(missing_ok=True)
                p,alerts=self.run_watch();self.assertEqual(p.returncode,2,p.stdout+p.stderr);self.assertEqual(len(alerts),1)

    def test_cycles_are_bounded(self):
        nm=self.root/'node_modules';nm.symlink_to(self.root,target_is_directory=True)
        p,_=self.run_watch();self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        nm.unlink();nm.symlink_to('cycle-a')
        (self.root/'cycle-a').symlink_to('cycle-b');(self.root/'cycle-b').symlink_to('cycle-a')
        p,alerts=self.run_watch();self.assertEqual(p.returncode,2,p.stdout+p.stderr);self.assertEqual(len(alerts),1)

    def test_touch_and_atomic_replacement_then_restart_return(self):
        for action in ['touch','replace']:
            with self.subTest(action=action):
                self.start=int(time.time())+2;self.set_start(self.start)
                p,_=self.run_watch();self.assertEqual(p.returncode,0,p.stdout+p.stderr)
                time.sleep(max(0,self.start+1.05-time.time()))
                before=self.file.stat();before_sha=hashlib.sha256(self.file.read_bytes()).hexdigest()
                if action=='touch':os.utime(self.file,None)
                else:
                    new=self.file.with_suffix('.new');new.write_text('replaced code\n');os.replace(new,self.file)
                after=self.file.stat();after_sha=hashlib.sha256(self.file.read_bytes()).hexdigest()
                grep=subprocess.run(['grep','-cF','good code' if action=='touch' else 'replaced code',str(self.file)],capture_output=True,text=True)
                self.assertEqual((grep.returncode,grep.stdout.strip()),(0,'1'))
                self.assertGreater(after.st_ctime_ns,before.st_ctime_ns)
                self.assertEqual(before_sha,after_sha) if action=='touch' else self.assertNotEqual(before_sha,after_sha)
                print(json.dumps(dict(probe=action,grepFixedCount=1,beforeSHA=before_sha,afterSHA=after_sha,beforeCtimeNs=before.st_ctime_ns,afterCtimeNs=after.st_ctime_ns,beforeInode=before.st_ino,afterInode=after.st_ino)))
                p,alerts=self.run_watch();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertEqual(len(alerts),1)
                self.set_start(after.st_ctime_ns//10**9+2)
                p,_=self.run_watch();self.assertEqual(p.returncode,0,p.stdout+p.stderr)


if __name__=='__main__':unittest.main()
