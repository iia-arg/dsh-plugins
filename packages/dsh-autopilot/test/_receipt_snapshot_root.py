"""Run the actual window snapshot reader in a disposable root namespace."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
import unittest

class ReceiptSnapshot(unittest.TestCase):
    def test_same_uid_namespaced_cut_and_historical_cut(self):
        package=Path(__file__).resolve().parents[1]
        root=Path('/var/lib/autopilot-usage');backup=Path('/var/backups/montazh/AP0111-P')
        backup.mkdir(parents=True,mode=0o700)
        for legacy in (False,True):
            run='old' if legacy else 'new';generation='a'*64
            raw=b'{"snapshot":"test"}\n';parts=[]
            for name in (('vintik',) if legacy else ('vintik','gayka')):
                who=pwd.getpwnam('vintik');home=root/'prepared/owners'/str(who.pw_uid)/run
                if not legacy:home=home/name
                home.mkdir(parents=True,mode=0o755)
                sources={}
                for kind in ('runtime','gateway'):
                    path=home/(kind+'.jsonl');path.write_text(name+' '+kind+'\n');path.chmod(0o600);os.chown(path,who.pw_uid,who.pw_gid);sources[kind]=str(path)
                sources['raw']=[];parts.append(dict(name=name,uid=who.pw_uid,gid=who.pw_gid,sources=sources))
            record=root/'prepared/records'/(run+'.json');record.parent.mkdir(parents=True,exist_ok=True)
            record.write_text(json.dumps(dict(runId=run,project='/srv/autopilot/projects/ap-test-0110',participants=parts)));record.chmod(0o600)
            public=root/'runs'/run/'public'/generation;public.mkdir(parents=True);(public/'receipt.json').write_bytes(raw)
            (public.parent.parent/'current.json').write_text(json.dumps(dict(generation=generation,receiptSha256=hashlib.sha256(raw).hexdigest())))
            snapshot=backup/run;snapshot.mkdir(mode=0o700)
            call=subprocess.run([sys.executable,'-I','-B',str(package/'window/receipt/save-receipt.py'),run,str(snapshot),generation],capture_output=True,text=True)
            self.assertEqual(call.returncode,0,call.stdout+call.stderr)
            saved=json.loads((snapshot/'prepared/record.json').read_text())
            self.assertEqual((snapshot/'receipt.json').read_bytes(),raw)
            self.assertEqual(len({p['sources']['runtime'] for p in saved['participants']}),len(parts))
            for p in saved['participants']:
                self.assertEqual(Path(p['sources']['runtime']).read_text(),p['name']+' runtime\n')
            print('SNAPSHOT_READBACK '+json.dumps(dict(run=run,participants=[p['name'] for p in saved['participants']])),flush=True)
            before=record.read_bytes();bad=json.loads(before)
            bad['participants'][0]['sources']['runtime']=str(home/'foreign'/'runtime.jsonl')
            record.write_text(json.dumps(bad));self.assertNotEqual(hashlib.sha256(before).digest(),hashlib.sha256(record.read_bytes()).digest())
            print('SNAPSHOT_DAMAGE '+hashlib.sha256(before).hexdigest()+' -> '+hashlib.sha256(record.read_bytes()).hexdigest(),flush=True)
            refused=backup/(run+'-foreign');refused.mkdir(mode=0o700)
            call=subprocess.run([sys.executable,'-I','-B',str(package/'window/receipt/save-receipt.py'),run,str(refused),generation],capture_output=True,text=True)
            self.assertEqual(call.returncode,2);self.assertIn('SOURCE_UNSAFE',call.stdout)
            record.write_bytes(before);returned=backup/(run+'-return');returned.mkdir(mode=0o700)
            call=subprocess.run([sys.executable,'-I','-B',str(package/'window/receipt/save-receipt.py'),run,str(returned),generation],capture_output=True,text=True)
            self.assertEqual(call.returncode,0,call.stdout+call.stderr)
