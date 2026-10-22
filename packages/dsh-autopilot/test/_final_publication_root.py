import hashlib,importlib.util,json,os,pwd,shutil,subprocess,sys,unittest
from pathlib import Path
import _end_final_root as fixture
class PublicationTests(unittest.TestCase):
 def setUp(self):
  self.c=fixture.FinalTests();self.c.setUp();self.addCleanup(self.c.doCleanups);c=self.c;c.seed(True);c.finalize(c.end,now='2026-10-20T00:03:00Z');self.expected=json.loads(c.receipt()[1]);self.uid=pwd.getpwnam('master').pw_uid;self.gid=pwd.getpwnam('master').pw_gid
  self.root=c.c.root;self.root.chmod(0o755)
  # Finance context stays private; only the public receipt path is traversable.
  for path in (c.c.output.parent,c.c.output,c.c.output/'r',c.c.output/'r/public'):path.chmod(0o755)
  self.public=self.root/'panels';self.public.mkdir(mode=0o755);os.chown(self.public,0,self.gid);self.public.chmod(0o2751);self.agent=self.public/'master';self.agent.mkdir();os.chown(self.agent,self.uid,self.gid);self.agent.chmod(0o2750)
  self.skill=self.root/'release/skill';(self.skill/'phases').mkdir(parents=True);(self.skill/'phases/dashboard-template.html').write_bytes(Path('/run/package/overlay/phases/dashboard-template.html').read_bytes());(self.skill.parent/'release.json').write_text(json.dumps(dict(upstream_sha='0'*40,local_revision='fixture')))
  spec=importlib.util.spec_from_file_location('publisher',Path('/run/package/runtime/ap_sadik.py'));ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
  self.meta=dict(run_id='new-run',root=str(c.project),release=ap.release_pin(self.skill),public_root=str(self.public),agent='master',project_id='project')
  self.state=c.project/'.autopilot/state.js';self.state.write_text('window.STATE='+json.dumps(dict(title='CURRENT-RUN-B-PRIVATE',rev=8,_sadik=self.meta)));os.chown(self.state,self.uid,self.gid)
  self.before=self.state.read_bytes();self.operator=c.project/'.autopilot/operator.json';self.operator.write_bytes(b'{"fixture":"UNCHANGED-OPERATOR"}');os.chown(self.operator,self.uid,self.gid)
 def call(self,run='r'):
  code="import sys,importlib.util;sys.excepthook=sys.__excepthook__;from pathlib import Path;s=importlib.util.spec_from_file_location('p','/run/package/runtime/ap_sadik.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);core=m.team_module();core.TEAM_USAGE_ROOT=Path(sys.argv[2]);m.team_module=lambda:core;print(m.publish_team(sys.argv[1],sys.argv[3]))"
  return subprocess.run([sys.executable,'-I','-B','-c',code,str(self.c.project),str(self.c.c.output),run],user=self.uid,group=self.gid,extra_groups=[],capture_output=True,text=True,timeout=10,cwd='/run')
 def test_retry_uses_skill_tools_publisher_in_installed_layout(self):
  package=Path('/run/package');tools=self.skill.parent/'tools';tools.mkdir(mode=0o755)
  skill_tools=self.skill/'tools';skill_tools.mkdir(mode=0o755)
  for source in (package/'runtime').iterdir():
   if source.is_file() and source.name not in {'ap_sadik.py','team_usage.py'}:shutil.copyfile(source,tools/source.name)
  for name in ('ap_sadik.py','team_usage.py'):shutil.copyfile(package/'runtime'/name,skill_tools/name)
  pilot=self.skill.parent/'pilot';pilot.mkdir(mode=0o755);shutil.copyfile(package/'lib/task_limits.py',pilot/'task_limits.py')
  spec=importlib.util.spec_from_file_location('installed_publisher',skill_tools/'ap_sadik.py');ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
  state=json.loads(self.state.read_text().split('=',1)[1]);state['_sadik']['release']=ap.release_pin(self.skill);self.state.write_text('window.STATE='+json.dumps(state));self.before=self.state.read_bytes()
  root_receipts=Path('/var/lib/autopilot-usage/runs');root_receipts.parent.mkdir(mode=0o755,parents=True);shutil.copytree(self.c.c.output,root_receipts)
  spec=importlib.util.spec_from_file_location('installed_retry',tools/'runtime_receipt_source.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.PUBLIC_PANELS=self.public
  self.assertEqual(m.CONSUMER,skill_tools/'team_usage.py');self.assertFalse((tools/'ap_sadik.py').exists());self.assertTrue((skill_tools/'ap_sadik.py').is_file())
  root_before=self.c.receipt();self.assertEqual(m.core.read_public('r',self.c.project),self.expected)
  debts=m.closed_publication_debts(self.c.c.index,self.c.c.output);self.assertEqual([(x['runId'],x['reason']) for x in debts],[('r','PUBLISH_LAG')])
  retried=m.retry_closed_publications(self.c.c.index,self.c.c.output)
  self.assertEqual(self.c.receipt(),root_before);self.assertEqual(m.core.read_public('r',self.c.project),self.expected)
  self.assertEqual(retried,[],'retry failed to find the publisher beside its actual consumer')
  page=self.agent/'project/r/state.js';published=json.loads(page.read_text().split('=',1)[1]);self.assertEqual(published['usageTeam'],self.expected)
  self.assertEqual(self.c.receipt(),root_before);self.assertEqual(m.core.read_public('r',self.c.project),self.expected);self.assertEqual(self.state.read_bytes(),self.before)

 def test_absent_archived_page_is_published_without_touching_current_run(self):
  q=self.call();self.assertEqual(q.returncode,0,q.stderr);page=self.agent/'project/r/state.js';data=json.loads(page.read_text().split('=',1)[1]);self.assertEqual(data['usageTeam'],self.expected);self.assertNotIn('CURRENT-RUN-B-PRIVATE',page.read_text());self.assertEqual(self.state.read_bytes(),self.before);self.assertEqual(self.operator.read_bytes(),b'{"fixture":"UNCHANGED-OPERATOR"}')
  self.assertIn('project/r',json.loads((self.agent/'index.json').read_text()));self.assertEqual((page.parent.stat().st_mode&0o7777),0o2750)
  old=page.read_bytes();self.assertEqual(self.call().returncode,0);self.assertEqual(page.read_bytes(),old)
 def test_existing_archived_page_preserves_its_work_history_and_rejects_symlink(self):
  project=self.agent/'project';project.mkdir();os.chown(project,self.uid,self.gid);project.chmod(0o2750);run=project/'r';run.mkdir();os.chown(run,self.uid,self.gid);run.chmod(0o2750)
  for name,body in [('state.js','window.STATE='+json.dumps(dict(title='OLD-A',rev=2,tickets=[dict(id='T1',status='done')]))),('dashboard.html','old page')]:p=run/name;p.write_text(body);os.chown(p,self.uid,self.gid)
  index=self.agent/'index.json';index.write_text(json.dumps({'project/r':{}}));os.chown(index,self.uid,self.gid)
  q=self.call();self.assertEqual(q.returncode,0,q.stderr);page=run/'state.js';state=json.loads(page.read_text().split('=',1)[1]);self.assertEqual(state['title'],'OLD-A');self.assertEqual(state['tickets'],[dict(id='T1',status='done')]);self.assertEqual(state['usageTeam'],self.expected)
  good=page.read_bytes();page.unlink();page.symlink_to(self.state);self.assertNotEqual(page.lstat().st_ino,self.state.stat().st_ino);self.assertNotEqual(self.call().returncode,0);self.assertEqual(self.state.read_bytes(),self.before)
  page.unlink();page.write_bytes(good);os.chown(page,self.uid,self.gid);self.assertEqual(self.call().returncode,0)
