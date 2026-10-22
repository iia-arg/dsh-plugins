"""Actual watcher against temporary registries/headers; systemd, journal and alert are explicit stubs."""
import contextlib,io,json,os,runpy,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
BIN=Path(__file__).resolve().parents[1]/'bin/session-agent-preset-watch'
class LifecycleTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='preset-lifecycle-');self.addCleanup(self.tmp.cleanup);self.r=Path(self.tmp.name)
  with patch.dict(os.environ,{'DSH_PAMYAT_STOROZHA_CONF':str(self.r/'no-live-config')}):self.m=runpy.run_path(str(BIN),run_name='preset_candidate')
  self.props={'LoadState':'loaded','ActiveState':'inactive','ActiveEnterTimestamp':'','ExecMainStartTimestamp':'','InvocationID':''};self.journal='';self.journal_error='';self.show_rc=0;self.show_error='';self.query_timeout=False;self.alerts=[];self.calls=[]
  self.enterContext(patch.object(subprocess,'run',side_effect=self.command))
  self.ready=self.agent('ready',True);self.new=self.agent('new',False);self.reg=self.r/'registry.yaml';self.registry([self.ready,self.new])
 def agent(self,name,sessions):
  home=self.r/name
  if sessions:
   folder=home/'.dsh/sessions/project/run';folder.mkdir(parents=True);(folder/'session.jsonl').write_text(json.dumps({'type':'session','agentPreset':'fixture'})+'\n')
  return {'imya':name,'namerenie':{'dom':str(home),'sluzhba':name+'.service'}}
 def registry(self,agents):self.reg.write_text(json.dumps({'agenty':agents}))
 def command(self,args,**kw):
  args=list(map(str,args));self.calls.append(args)
  if args[0]=='/usr/bin/systemctl':
   if self.query_timeout:raise subprocess.TimeoutExpired(args,kw['timeout'])
   self.assertLessEqual(kw['timeout'],5);return subprocess.CompletedProcess(args,self.show_rc,'\n'.join(k+'='+v for k,v in self.props.items())+'\n',self.show_error)
  if args[0]=='/usr/bin/journalctl':
   self.assertLessEqual(kw['timeout'],5);self.assertIn('--output-fields=_SYSTEMD_UNIT',args);return subprocess.CompletedProcess(args,0,self.journal,self.journal_error)
  if args[0]==str(self.r/'alert-stub'):
   self.alerts.append(kw['input']);return subprocess.CompletedProcess(args,0,'','')
  self.fail('unexpected external command '+repr(args))
 def scan(self):return self.m['scan'](self.reg)
 def watch(self):
  with contextlib.redirect_stdout(io.StringIO()):return self.m['watch'](self.reg,self.r/'state',str(self.r/'alert-stub'))
 def test_missing_sessions_never_started_is_named_without_alarm(self):
  out=self.scan();self.assertEqual(out['code'],0,out);self.assertEqual(out['agents_scanned'],1);self.assertEqual(out['agents_total'],2);self.assertEqual(out['agents_not_started'],1);self.assertEqual([r['agent'] for r in out['not_started']],['new'])
  self.assertEqual(self.watch(),0);self.assertEqual(self.alerts,[]);state=json.loads((self.r/'state/last.json').read_text());self.assertEqual(state['coverage']['agents_not_started'],1)
 def test_missing_sessions_started_unit_still_alarms(self):
  self.props.update(ActiveState='active',ActiveEnterTimestamp='Thu 2026-10-15 11:00:00 UTC');out=self.scan();self.assertEqual(out['code'],2);self.assertTrue(out['errors']);self.watch();self.assertEqual(len(self.alerts),1);self.assertIn('new',self.alerts[0])
 def test_previous_active_timestamp_still_alarms_after_stop(self):
  self.props['ActiveEnterTimestamp']='Thu 2026-10-15 11:00:00 UTC';self.assertEqual(self.scan()['code'],2)
 def test_previous_invocation_still_alarms(self):
  self.props['InvocationID']='0123456789abcdef';self.assertEqual(self.scan()['code'],2)
 def test_unprivileged_history_reader_does_not_claim_never_started(self):
  with patch.object(os,'geteuid',return_value=12345):self.assertEqual(self.scan()['code'],2)
 def test_failed_start_before_active_timestamp_still_alarms(self):
  self.props['ExecMainStartTimestamp']='Thu 2026-10-15 11:00:00 UTC';self.assertEqual(self.scan()['code'],2)
 def test_retained_journal_still_alarms_when_timestamps_empty(self):
  self.journal='{"_SYSTEMD_UNIT":"new.service"}\n';self.assertEqual(self.scan()['code'],2)
 def test_lifecycle_query_errors_are_not_never_started(self):
  for kind in ('show_error','journal_error','timeout','missing_property','not_loaded'):
   with self.subTest(kind=kind):
    old=self.props.copy();self.show_rc=1 if kind=='show_error' else 0;self.journal_error='permission denied' if kind=='journal_error' else '';self.query_timeout=kind=='timeout'
    if kind=='missing_property':self.props.pop('ActiveEnterTimestamp')
    if kind=='not_loaded':self.props['LoadState']='not-found'
    out=self.scan();self.assertEqual(out['code'],2);self.assertEqual(out.get('agents_not_started',0),0);self.props=old
 def test_all_new_agents_are_waiting_not_scanned_or_false_alarm(self):
  self.registry([self.new]);out=self.scan();self.assertEqual(out['code'],0,out);self.assertEqual(out['agents_scanned'],0);self.assertEqual(out['agents_not_started'],1);self.assertEqual(out['headers_read'],0);self.watch();self.assertEqual(self.alerts,[])
 def test_existing_empty_sessions_directory_is_still_blindness(self):
  (Path(self.new['namerenie']['dom'])/'.dsh/sessions').mkdir(parents=True);out=self.scan();self.assertEqual(out['code'],2);self.assertEqual(out.get('agents_not_started',0),0)
 def test_existing_bad_header_still_fails(self):
  self.registry([self.ready]);f=Path(self.ready['namerenie']['dom'])/'.dsh/sessions/project/run/session.jsonl';f.write_text('{"type":"session"}\n');self.assertEqual(self.scan()['code'],1)
 def test_invalid_or_missing_unit_is_not_a_skip(self):
  for unit in ('','../../other.service','*'):
   with self.subTest(unit=unit):self.new['namerenie']['sluzhba']=unit;self.registry([self.ready,self.new]);self.assertEqual(self.scan()['code'],2)
if __name__=='__main__':unittest.main(verbosity=2)
