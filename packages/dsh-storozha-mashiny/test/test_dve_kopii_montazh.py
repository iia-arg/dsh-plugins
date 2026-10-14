"""The real comparison CLI with two small filesystem trees, no live services."""
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest

PKG = Path(__file__).resolve().parents[1]
SUT = PKG / 'bin/dve-kopii-watch'
HELPER = PKG.parent / 'dsh-montazh/sbin/montazh-okno'


class Copies(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='b2025-copies-'))
        self.base,self.app = self.root/'base',self.root/'app'
        packages = next(ast.literal_eval(n.value) for n in ast.parse(SUT.read_text()).body
            if isinstance(n,ast.Assign) and any(isinstance(v,ast.Name) and v.id=='PAKETY' for v in n.targets))
        for name in packages:
            for tree in [self.base,self.app]:
                d = tree/name
                d.mkdir(parents=True)
                (d/'code.js').write_text('healthy\n')
        self.a,self.b = self.base/packages[0]/'code.js',self.app/packages[0]/'code.js'
        self.b.write_text('mounted\n')
        self.state = self.root/'windows'
        self.state.mkdir(mode=0o755)
        self.ident = '4'*32
        now = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record = {'schema':1,'id':self.ident,'task':'B-N-2025','actor':'fixture',
            'boot_id':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
            'opened_ns':now,'deadline_ns':now+1800*10**9,
            'expires_utc':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=1800)).isoformat(),
            'phase':'open','subjects':['file:'+str(self.a),'file:'+str(self.b)],
            'checks':[{'kind':'file','path':str(p),'sha256':hashlib.sha256(b'mounted\n').hexdigest()} for p in [self.a,self.b]]}
        self.window = self.state/(self.ident+'.json')
        self.window.write_text(json.dumps(self.record))
        self.commands = self.root/'commands'
        self.commands.mkdir()
        logger = self.commands/'logger'
        logger.write_text('#!/bin/sh\nexit 0\n');logger.chmod(0o755)
        self.trace = self.root/'alerts'
        alert = self.commands/'alert'
        alert.write_text('#!/bin/sh\nprintf called >> '+str(self.trace)+'\n');alert.chmod(0o755)
        self.snapshot = self.root/'snapshot'
        self.env = {**os.environ,'MO_STATE_DIR':str(self.state),'MONTAZH_OKNO_BIN':str(HELPER),
            'PATH':str(self.commands)+':'+os.environ['PATH'],'DKW_ALERT':str(alert),
            'DKW_SOSTOYANIE':str(self.snapshot)}

    def tearDown(self):
        shutil.rmtree(self.root)

    def cli(self,*args):
        return subprocess.run(['python3',str(SUT),'--osnova',str(self.base),'--app','fixture='+str(self.app),*args],
            env=self.env,capture_output=True,text=True,timeout=10)

    def test_healthy_control_and_manual_red(self):
        self.a.write_text('mounted\n')
        self.assertEqual(self.cli('--tolko-pechat').returncode,0)
        self.a.write_text('healthy\n')
        p = self.cli('--tolko-pechat')
        self.assertEqual(p.returncode,1,p.stdout+p.stderr)
        self.assertNotIn('ОТЛОЖЕНО',p.stdout)

    def test_auto_exact_file_pair_deferred_not_green(self):
        self.snapshot.write_text('1\n')
        p = self.cli('--avto-montazh')
        self.assertEqual(p.returncode,4,p.stdout+p.stderr)
        self.assertIn(self.ident,p.stdout)
        self.assertFalse(self.trace.exists())
        self.assertEqual(self.snapshot.read_text(),'1\n')

    def test_uncovered_file_in_same_package_is_red(self):
        (self.b.parent/'outside.js').write_text('outside\n')
        p = self.cli('--avto-montazh')
        self.assertEqual(p.returncode,1,p.stdout+p.stderr)
        self.assertIn('outside.js',p.stdout)
        self.assertTrue(self.trace.exists())

    def test_one_side_scope_is_not_a_pair(self):
        self.record['subjects'] = ['file:'+str(self.b)]
        self.record['checks'] = self.record['checks'][1:]
        self.window.write_text(json.dumps(self.record))
        p = self.cli('--avto-montazh','--tolko-pechat')
        self.assertEqual(p.returncode,1,p.stdout+p.stderr)

    def test_invalid_window_is_strict(self):
        self.window.chmod(0o666)
        p = self.cli('--avto-montazh','--tolko-pechat')
        self.assertEqual(p.returncode,1,p.stdout+p.stderr)
        self.assertNotIn('ОТЛОЖЕНО',p.stdout)

    def close_during_query(self, remove=False):
        wrapper = self.root/'close-query'
        once = self.root/'once'
        body = ('#!/usr/bin/python3\nimport subprocess,sys\nfrom pathlib import Path\n'
            +'once=Path('+repr(str(once))+')\n'
            +'if not once.exists():\n once.write_text("changed")\n'
            +' Path('+repr(str(self.a))+').write_text("mounted\\n")\n'
            +' subprocess.run('+repr([str(HELPER),'zakryt',self.ident])+',check=True,capture_output=True)\n'
            +'p=subprocess.run(['+repr(str(HELPER))+']+sys.argv[1:],capture_output=True,text=True)\n')
        if remove:
            body += ('if p.returncode==6:\n'
                +' Path('+repr(str(self.a))+').unlink(missing_ok=True)\n'
                +' Path('+repr(str(self.b))+').unlink(missing_ok=True)\n')
        body += 'print(p.stdout,end="")\nprint(p.stderr,end="",file=sys.stderr)\nsys.exit(p.returncode)\n'
        wrapper.write_text(body);wrapper.chmod(0o755)
        self.env['MONTAZH_OKNO_BIN'] = str(wrapper)

    def test_closed_window_rereads_current_pair(self):
        self.close_during_query()
        p = self.cli('--avto-montazh','--tolko-pechat')
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        self.assertEqual(json.loads(self.window.read_text())['phase'],'closed')
        self.assertNotIn('РАЗОШЁЛСЯ',p.stdout)

    def test_empty_pair_after_late_check_is_not_green(self):
        self.close_during_query(remove=True)
        p = self.cli('--avto-montazh','--tolko-pechat')
        self.assertEqual(p.returncode,2,p.stdout+p.stderr)

    def test_final_expiry_cannot_return_four(self):
        wrapper=self.root/'expiry-helper';counter=self.root/'calls'
        real=HELPER
        wrapper.write_text('#!/usr/bin/python3\nimport subprocess,sys,json,time\nfrom pathlib import Path\na=sys.argv[1:]\n'
            +'p=subprocess.run('+repr([str(real)])+'+a,capture_output=True,text=True)\n'
            +'if a[0]=="otlozheno" and p.returncode==4:\n c=Path('+repr(str(counter))+');n=int(c.read_text())+1 if c.exists() else 1;c.write_text(str(n))\n'
            +' if n==2:\n  f=Path('+repr(str(self.window))+');d=json.loads(f.read_text());d["deadline_ns"]=time.clock_gettime_ns(time.CLOCK_BOOTTIME)-1;d["opened_ns"]=d["deadline_ns"]-1800*10**9;f.write_text(json.dumps(d))\n'
            +'print(p.stdout,end="");sys.exit(p.returncode)\n')
        wrapper.chmod(0o755);self.env['MONTAZH_OKNO_BIN']=str(wrapper)
        p=self.cli('--avto-montazh');self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertTrue(self.trace.exists());self.assertEqual(counter.read_text(),'2')


if __name__=='__main__':
    assert os.getuid()==0,'root-owned metadata fixture'
    unittest.main()
