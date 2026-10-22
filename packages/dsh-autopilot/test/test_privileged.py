"""Root provisions only test permissions; ALL runtime executes as master."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys
import tempfile
import unittest


@unittest.skipUnless(os.geteuid()==0,'fixture ownership needs root')
class UnixBoundary(unittest.TestCase):
    def test_nonmember_operator_exports_reader_group_under_umask_077(self):
        skill=Path(os.environ['AUTOPILOT_TEST_SKILL']).resolve()
        master=pwd.getpwnam('master');reader=pwd.getpwnam('nobody')
        with tempfile.TemporaryDirectory(prefix='ap-reader-boundary-') as directory:
            root=Path(directory);root.chmod(0o755)
            public=root/'public';public.mkdir(mode=0o755);os.chown(public,0,reader.pw_gid);public.chmod(0o2751)
            agent=public/'reader';_fixture_mkdir(agent, mode=0o755);os.chown(agent,master.pw_uid,reader.pw_gid);agent.chmod(0o2750)
            project=root/'project';project.mkdir(mode=0o700);os.chown(project,master.pw_uid,master.pw_gid)
            home=root/'home';home.mkdir(mode=0o700);os.chown(home,master.pw_uid,master.pw_gid)
            worker="import os,subprocess,sys;assert int(sys.argv[4]) not in os.getgroups();print('OPERATOR NONMEMBER',int(sys.argv[4]),flush=True);os.umask(0o077);e=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid()),AUTOPILOT_PUBLIC_ROOT=sys.argv[1],AUTOPILOT_AGENT='reader',AUTOPILOT_NO_UPDATE_CHECK='1');q=subprocess.run([sys.executable,'-B',sys.argv[2],'--no-serve','init','--slug','reader'],env=e,cwd=sys.argv[3],capture_output=True,text=True);print(q.stdout+q.stderr);sys.exit(q.returncode)"
            q=subprocess.run(['sudo','-n','-u','master','env','HOME='+str(home),'PYTHONDONTWRITEBYTECODE=1','AUTOPILOT_USAGE_MAIL_SOCKET='+str(root/'no-registration-endpoint/post.sock'),sys.executable,'-B','-c',worker,str(public),str(skill/'tools/ap.py'),str(project),str(reader.pw_gid)],capture_output=True,text=True)
            self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertNotIn('панель не обновлена',q.stdout+q.stderr)
            registration=json.loads((project/'.autopilot/state.js').read_text().split('=',1)[1])['usageRegistration']
            self.assertEqual(registration['state'],'UNBOUND','INIT_REGISTRATION_ESCAPED_FIXTURE')
            print('TEST_MAIL_ISOLATED '+json.dumps(dict(probe='reader-boundary',socket=str(root/'no-registration-endpoint/post.sock'),registration=registration)),flush=True)
            files=list(agent.glob('*/*/state.js'));self.assertEqual(len(files),1)
            target=files[0];self.assertEqual(target.stat().st_gid,reader.pw_gid)
            for directory in (target.parent.parent,target.parent):
                self.assertEqual(directory.stat().st_mode&0o7777,0o2750)
                self.assertEqual(directory.stat().st_gid,reader.pw_gid)
            self.assertEqual(target.stat().st_mode&0o777,0o640)
            code="import os,pathlib,sys;os.setgroups([int(sys.argv[2])]);os.setgid(int(sys.argv[2]));os.setuid(int(sys.argv[1]));data=pathlib.Path(sys.argv[3]).read_bytes();assert b'window.STATE=' in data;print(len(data))"
            q=subprocess.run([sys.executable,'-B','-c',code,str(reader.pw_uid),str(reader.pw_gid),str(target)],capture_output=True,text=True)
            self.assertEqual(q.returncode,0,q.stderr);self.assertGreater(int(q.stdout),0)
            print('READER UID',reader.pw_uid,'GID',reader.pw_gid,'READ BYTES',q.stdout.strip(),'umask077',flush=True)
            coders=pwd.getpwnam('coders')
            denied=subprocess.run([sys.executable,'-B','-c',code,str(coders.pw_uid),str(coders.pw_gid),str(target)],capture_output=True,text=True)
            self.assertNotEqual(denied.returncode,0);self.assertIn('PermissionError',denied.stderr)
            print('EXECUTOR coders UID',coders.pw_uid,'read refused',flush=True)


    def test_foreign_uid_directory_refuses_and_permission_recovery(self):
        skill=Path(os.environ['AUTOPILOT_TEST_SKILL']).resolve()
        master=pwd.getpwnam('master');nobody=pwd.getpwnam('nobody')
        with tempfile.TemporaryDirectory(prefix='ap-unix-boundary-') as directory:
            root=Path(directory);root.chmod(0o755);public=root/'public';public.mkdir(mode=0o755);os.chown(public,0,master.pw_gid);public.chmod(0o2751)
            agent=public/'other';agent.mkdir(mode=0o755);(agent/'sentinel').write_text('untouched')
            os.chown(agent,nobody.pw_uid,nobody.pw_gid)
            project=root/'project';project.mkdir(mode=0o700);os.chown(project,master.pw_uid,master.pw_gid)
            home=root/'home';home.mkdir(mode=0o700);os.chown(home,master.pw_uid,master.pw_gid)
            code='''import json,os,subprocess,sys
from pathlib import Path
p=Path(sys.argv[1]);skill=Path(sys.argv[2]);e=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid()),AUTOPILOT_AGENT='other',AUTOPILOT_PUBLIC_ROOT=sys.argv[3],AUTOPILOT_NO_UPDATE_CHECK='1')
for args in [['init','--slug','unix','--skill-dir',str(skill)],['answered']]:
 q=subprocess.run([sys.executable,'-B',str(skill/'tools/ap.py'),'--no-serve',*args],cwd=p,env=e,capture_output=True,text=True)
 print(json.dumps(dict(code=q.returncode,output=q.stdout+q.stderr)),flush=True)
 if args[0]=='init':sys.stdin.readline()
'''
            child=subprocess.Popen(['sudo','-n','-u','master','env','HOME='+str(home),'PYTHONDONTWRITEBYTECODE=1','AUTOPILOT_USAGE_MAIL_SOCKET='+str(root/'no-registration-endpoint/post.sock'),sys.executable,'-u','-c',code,str(project),str(skill),str(public)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
            try:
                before=json.loads(child.stdout.readline());self.assertEqual(before['code'],0,before);self.assertIn('панель не обновлена',before['output'])
                self.assertEqual({p.name for p in agent.iterdir()},{'sentinel'});self.assertEqual((agent/'sentinel').read_text(),'untouched')
                state=project/'.autopilot/state.js';self.assertEqual(state.stat().st_uid,master.pw_uid)
                registration=json.loads(state.read_text().split('=',1)[1])['usageRegistration']
                self.assertEqual(registration['state'],'UNBOUND','INIT_REGISTRATION_ESCAPED_FIXTURE')
                print('TEST_MAIL_ISOLATED '+json.dumps(dict(probe='unix-boundary',socket=str(root/'no-registration-endpoint/post.sock'),registration=registration)),flush=True)
                print('FOREIGN UID REFUSED owner',agent.stat().st_uid,'operator',master.pw_uid,flush=True)
                os.chown(agent,master.pw_uid,master.pw_gid);agent.chmod(0o2750);child.stdin.write('restore\n');child.stdin.flush()
                after=json.loads(child.stdout.readline());self.assertEqual(after['code'],0,after);self.assertNotIn('панель не обновлена',after['output']);self.assertTrue((agent/'index.json').is_file())
                child.wait(timeout=10);self.assertEqual(child.returncode,0)
            finally:
                if child.poll() is None:child.kill();child.wait(timeout=3)
                child.stdin.close();child.stdout.close()


if __name__=='__main__':unittest.main(verbosity=2)
