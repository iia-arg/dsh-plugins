#!/usr/bin/env python3
"""Run the actual collector/reader with external systemd/registry boundaries replaced."""
import hashlib,json,os,shlex,subprocess,tempfile,unittest
from pathlib import Path
PKG=Path(__file__).resolve().parents[1]
LIB=PKG/'libexec/sadik-watch-enabled.sh'
WATCH=PKG/'sbin/sadik-watch'
class Enabled(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
  self.data={'podyom':['first.service'],'agents':{'first':'first.service','coder':'code.service'},'states':{'first.service':['active','enabled'],'code.service':['active','enabled']},'apActors':['first']}
  self.ap_extra_units={}
  self.ap_units={
   'autopilot-mail.service':'[Service]\nExecStart=/bin/true\n[Install]\nWantedBy=multi-user.target\n',
   'autopilot-copy.service':'[Service]\nExecStart=/bin/true\n[Install]\nWantedBy=multi-user.target\n',
   'autopilot-mail-notice@.timer':'[Timer]\nOnBootSec=5\n[Install]\nWantedBy=timers.target\n',
   'autopilot-mail-notice@.service':'[Service]\nExecStart=/bin/true\n',
   'autopilot-mail-failed@.service':'[Service]\nExecStart=/bin/true\n'}
  stub=self.root/'systemctl'
  stub.write_text('''#!/usr/bin/python3
import json,os,sys
from pathlib import Path
v=json.loads(Path(os.environ['DATA']).read_text());a=sys.argv[1:]
with open(Path(os.environ['DATA']).with_suffix('.calls'),'a') as f:f.write(json.dumps(['systemctl',*a])+'\\n')
if a[:1]==['--root']:
 assert a[2]=='is-enabled';units=a[3:];assert units
 for unit in units[:-1] if v.get('apOmitLast') else units:print(v.get('apStates',{}).get(unit,'enabled'))
 sys.exit(v.get('apRC',0))
assert a[0]=='show' and a[-2]=='-p';units=a[1:-2];fields=a[-1].split(',');assert units
if v.get('omitLast'):units=units[:-1]
if v.get('duplicateUnit'):units=units+units[:1]
for unit in units:
 print('Id='+v.get('aliasId',{}).get(unit,unit));print('Names='+v.get('unitNames',{}).get(v.get('aliasId',{}).get(unit,unit),unit+' '+v.get('aliasId',{}).get(unit,unit)))
 if fields==['Id','Names','After','Wants']:
  dep=v.get('dependencies',{}).get(unit,{});print('After='+dep.get('After',''))
  if not v.get('showMissingWants'):print('Wants='+dep.get('Wants',''))
 else:
  assert fields==['Id','Names','ActiveState','UnitFileState']
  state=v['states'][unit];print('ActiveState='+state[0]);print('UnitFileState='+state[1])
 print()
sys.exit(v.get('showRC',0) if fields==['Id','Names','After','Wants'] else v.get('stateShowRC',0))
''');stub.chmod(0o755)
  registry=self.root/'agent-registry'
  registry.write_text('''import json,os
from pathlib import Path
def zagruzit():
 v=json.loads(Path(os.environ['DATA']).read_text())
 with open(Path(os.environ['DATA']).with_suffix('.calls'),'a') as f:f.write(json.dumps(['registry-load'])+'\\n')
 if v.get('registryExit'):raise SystemExit(2)
 if v.get('registryRC'):raise ValueError('registry fixture load refused')
 rows=[dict(imya=n,namerenie=dict(sluzhba=u,raskladka=dict(autopilot_pochta=v.get('apFlag',n in v.get('apActors',[]))))) for n,u in v['agents'].items()]
 if v.get('registryDrift'):rows.append(dict(imya='extra',namerenie=dict(sluzhba='extra.service')))
 return dict(agenty=rows)
def namerenie(row):return row['namerenie']
def obyazatelnoe(n,agent,key):return n[key]
''');registry.chmod(0o755)
 def ap_fixture(self):
  package=self.root/'opt/autopilot/packages/fixture';(package/'systemd').mkdir(parents=True,exist_ok=True)
  for name,body in self.ap_units.items():(package/'systemd'/name).write_text(body)
  manifest={'schema':1,'package':'dsh-autopilot','system_units':[{'source':'systemd/'+name,'target':'/etc/systemd/system/'+name} for name in self.ap_units]}
  if self.data.get('apEmpty'):manifest['system_units']=[]
  (package/'MAIL-LAYOUT.json').write_text('{broken' if self.data.get('apBadJSON') else json.dumps(manifest))
  for name,body in self.ap_extra_units.items():
   out=package/name;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(body)
  config=self.root/'etc/agent-registry';config.mkdir(parents=True,exist_ok=True)
  (config/'plugins.yaml').write_text('plugins: [broken' if self.data.get('apBadYAML') else json.dumps({'plugins':[] if self.data.get('apMissing') else [{'id':'dsh-autopilot','path':'/opt/autopilot/packages/fixture','derevo':{'files':self.data.get('apExtraFiles',[])}}]}))
 def collect(self):
  self.ap_fixture()
  data=self.root/'data.json';data.write_text(json.dumps(self.data));env={**os.environ,'PATH':str(self.root)+':'+os.environ['PATH'],'DATA':str(data)}
  return subprocess.run(['bash','-c','source "$1"; sadik_enabled_collect "$2" "$3"','_',str(LIB),json.dumps({'doma':{k:'/irrelevant/'+k for k in self.data['agents'] if k not in self.data.get('omitted',[])},'nepolnye':[{'imya':k} for k in self.data.get('omitted',[])]}),str(self.root)],env=env,capture_output=True,text=True,timeout=10)
 def check(self,text):
  functions=WATCH.read_text().split('kanal() {',1)[1].split('# ── ПОДТВЕРЖДЕНИЕ ПОДЪЁМА',1)[0]
  logfn=next(line for line in WATCH.read_text().splitlines() if line.startswith('log() {'))
  script='set -uo pipefail\nsource "$1" || exit 2\nSOST="$2"; BEDY=0; SEYCHAS=1; ALERT="$SOST/alert-stub"; A2A=/bin/false; ZAPASNOJ_ADRESAT=fixture\n'+logfn+'\nkanal() {'+functions+'\nsadik_enabled_check "$(cat "$3")"; rc=$?\nprintf "%s" "$BEDY" >"$SOST/bedy"; exit "$rc"\n'
  stub=self.root/'alert-stub';stub.write_text('#!/bin/bash\nprintf "%s\\n" "$*" >>"'+str(self.root/'alert')+'"\n');stub.chmod(0o755)
  p=self.root/'snapshot';p.write_text(text)
  return subprocess.run(['bash','-c',script,'_',str(LIB),str(self.root),str(p)],capture_output=True,text=True,timeout=10)
 def alert(self):return (self.root/'alert').read_text() if (self.root/'alert').exists() else ''
 def test_bulk_missing_unit_is_refused(self):
  self.data['omitLast']=True;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('потеряна служба',q.stdout)
 def test_bulk_duplicate_unit_is_refused(self):
  self.data['duplicateUnit']=True;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('повторный Id',q.stdout)
 def test_registry_scope_drift_is_refused(self):
  self.data['registryDrift']=True;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('состав агентов',q.stdout)
 def test_unknown_bulk_state_is_refused(self):
  self.data['states']['code.service'][1]='unknown';q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('code.service: UnitFileState неизвестен',q.stdout)
 def test_registry_systemexit_has_diagnostic_stdout(self):
  self.data['registryExit']=True;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('REGISTRY_ERROR|',q.stdout);self.assertIn('registry',q.stdout)
 def test_alias_unit_keeps_requested_name_and_named_alert(self):
  self.data['aliasId']={'code.service':'canonical.service'}
  q=self.collect();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('ENABLED_UNIT|code.service|active|alias',q.stdout)
  self.check(q.stdout);self.assertIn('code.service (alias)',self.alert())
 def test_alias_and_primary_rows_are_both_kept(self):
  self.data['agents']={'first':'canonical.service','coder':'alias.service'};self.data['aliasId']={'alias.service':'canonical.service'}
  self.data['unitNames']={'canonical.service':'canonical.service alias.service'};self.data['states']={u:['active','enabled'] for u in self.data['agents'].values()}
  q=self.collect();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('ENABLED_UNIT|alias.service|active|alias',q.stdout);self.assertIn('ENABLED_UNIT|canonical.service|active|enabled',q.stdout)
 def test_bulk_query_budget(self):
  q=self.collect();self.assertEqual(q.returncode,0,q.stderr)
  rows=[json.loads(l) for l in (self.root/'data.calls').read_text().splitlines()]
  self.assertEqual(sum(r[0]=='systemctl' for r in rows),3,rows)
  self.assertFalse(any(r[0]=='systemctl' and r[1] in ('is-active','is-enabled') for r in rows),rows)
  self.assertEqual(sum(r[0] in ('agent-registry','registry-load') for r in rows),1,rows)
 def test_dynamic_union_is_checked_and_healthy_silent(self):
  q=self.collect();self.assertEqual(q.returncode,0,q.stderr);self.assertIn('code.service',q.stdout)
  self.assertIn('ENABLED_AP_SCOPE|3|1',q.stdout);self.assertEqual(q.stderr,'')
  r=self.check(q.stdout);self.assertEqual(r.returncode,0,r.stderr);self.assertIn('AP: юнитов 3, получателей 1',r.stdout);self.assertEqual(self.alert(),'');self.assertEqual((self.root/'bedy').read_text(),'0')
  self.data['apActors']=['first','coder'];q=self.collect();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('ENABLED_AP_SCOPE|4|2',q.stdout);before=hashlib.sha256((self.root/'data.json').read_bytes()).hexdigest()
  self.data['apActors']=['first'];q=self.collect();after=hashlib.sha256((self.root/'data.json').read_bytes()).hexdigest();self.assertNotEqual(before,after);self.assertEqual(json.loads((self.root/'data.json').read_text())['apActors'],['first']);self.assertIn('ENABLED_AP_SCOPE|3|1',q.stdout);r=self.check(q.stdout);self.assertIn('AP: юнитов 3, получателей 1',r.stdout);self.assertEqual(self.alert(),'');self.assertEqual((self.root/'bedy').read_text(),'0')
  self.data['apActors']=['first','coder'];q=self.collect();self.assertEqual(hashlib.sha256((self.root/'data.json').read_bytes()).hexdigest(),before);self.assertIn('ENABLED_AP_SCOPE|4|2',q.stdout);r=self.check(q.stdout);self.assertIn('AP: юнитов 4, получателей 2',r.stdout);self.assertEqual(self.alert(),'')
  source=WATCH.read_text();body=source.split('snyat() {',1)[1].split('\n}',1)[0]
  closing=next(line for line in source.splitlines() if line.startswith("' ") and '_kod_ssh=$?' in line)
  redirect=closing.split(')";',1)[0][1:].strip();self.assertEqual(redirect,'2>/dev/null')
  frame=json.dumps({'doma':{k:'/irrelevant/'+k for k in self.data['agents']},'nepolnye':[]})
  command='source '+shlex.quote(str(LIB))+'; sadik_enabled_collect '+shlex.quote(frame)+' '+shlex.quote(str(self.root))
  script='MESTNO=1\nsnyat() {'+body+'\n}\nSREZ="$(snyat "$1" '+redirect+')"\nprintf "%s" "$SREZ"\n'
  env={**os.environ,'PATH':str(self.root)+':'+os.environ['PATH'],'DATA':str(self.root/'data.json')}
  routed=subprocess.run(['bash','-c',script,'_',command],capture_output=True,text=True,env=env,timeout=10);self.assertEqual(routed.returncode,0,routed.stdout+routed.stderr);self.assertEqual(routed.stderr,'');self.assertNotIn('AP:',routed.stdout);self.assertIn('ENABLED_AP_SCOPE|4|2',routed.stdout)
  read=self.check(routed.stdout);self.assertEqual(read.returncode,0,read.stderr);self.assertIn('AP: юнитов 4, получателей 2',read.stdout);self.assertEqual(self.alert(),'')
  print('AP_SCOPE actors2->1->2 SHA',before,'->',after,'->',before,'BEDY0/no alerts; actual snyat+outer stderr suppression; real reader log visible',flush=True)
 def test_disabled_names_unit_and_return_announces_recovery(self):
  self.data['states']['code.service'][1]='disabled';q=self.collect();self.assertEqual(q.returncode,0,q.stderr)
  r=self.check(q.stdout);self.assertEqual(r.returncode,0,r.stderr);self.assertIn('code.service',self.alert());self.assertIn('disabled',self.alert());self.assertEqual((self.root/'bedy').read_text(),'1')
  (self.root/'alert').unlink();self.data['states']['code.service'][1]='enabled';r=self.check(self.collect().stdout);self.assertEqual(r.returncode,0,r.stderr);self.assertIn('снова в порядке: code.service (disabled)',self.alert())
 def test_after_only_gateway_is_in_scope_and_named(self):
  self.data['dependencies']={'first.service':{'After':'network.target coder-gateway-other.service'}};self.data['states']['coder-gateway-other.service']=['active','disabled']
  q=self.collect();self.assertEqual(q.returncode,0,q.stderr);self.assertIn('coder-gateway-other.service',q.stdout);r=self.check(q.stdout);self.assertEqual(r.returncode,0,r.stderr);self.assertIn('coder-gateway-other.service (disabled)',self.alert())
 def test_wants_gateway_template_and_shared_dependency_deduplicate(self):
  self.data['dependencies']={x:{'Wants':'claude-oauth-gateway@different.service'} for x in ['first.service','code.service']};self.data['states']['claude-oauth-gateway@different.service']=['active','enabled']
  q=self.collect();self.assertEqual(q.returncode,0,q.stderr);self.assertIn('ENABLED_SCOPE|6',q.stdout);self.assertEqual(q.stdout.count('ENABLED_UNIT|claude-oauth-gateway@different.service|'),1);r=self.check(q.stdout);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(self.alert(),'')
 def test_dependency_query_failure_is_refused(self):
  self.data['showRC']=1;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('systemctl show',q.stdout+q.stderr)
 def test_missing_dependency_property_is_refused(self):
  self.data['showMissingWants']=True;q=self.collect();self.assertEqual(q.returncode,2)
 def test_empty_agent_registry_is_refusal(self):
  self.data['agents']={};q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('пуст',q.stdout+q.stderr)
 def test_nonzero_state_query_is_not_healthy(self):
  self.data['stateShowRC']=1;q=self.collect();self.assertEqual(q.returncode,2)
 def test_registry_failure_is_refusal(self):
  self.data['registryRC']=2;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('registry',q.stdout+q.stderr)
 def test_missing_snapshot_is_refusal_not_green(self):
  q=self.check('');self.assertEqual(q.returncode,2);self.assertIn('СЛЕПОТА',self.alert())
 def test_truncated_snapshot_is_refusal(self):
  q=self.collect();self.assertEqual(q.returncode,0,q.stderr);r=self.check('\n'.join(q.stdout.splitlines()[:-1]));self.assertEqual(r.returncode,2);self.assertIn('СЛЕПОТА',self.alert())
 def test_persistent_enable_required_runtime_only_not_enough(self):
  self.data['states']['code.service'][1]='enabled-runtime';q=self.check(self.collect().stdout);self.assertEqual(q.returncode,0,q.stderr);self.assertIn('enabled-runtime',self.alert())
 def test_bad_service_data_is_refused(self):
  self.data['agents']['coder']='../evil.service';q=self.collect();self.assertEqual(q.returncode,2)
 def test_incomplete_registry_agent_is_not_silently_skipped(self):
  self.data['omitted']=['coder'];self.data['states']['code.service'][1]='disabled';q=self.collect();self.assertEqual(q.returncode,0,q.stderr);self.assertIn('code.service',q.stdout);self.check(q.stdout);self.assertIn('code.service',self.alert())
 def test_invalid_status_in_snapshot_is_refusal(self):
  q=self.check('ENABLED_SCOPE|1\nENABLED_UNIT|first.service|nonsense|enabled\n');self.assertEqual(q.returncode,2);self.assertIn('СЛЕПОТА',self.alert())
 def test_inactive_disabled_is_outside_active_mismatch(self):
  self.data['states']['code.service']=['inactive','disabled'];q=self.check(self.collect().stdout);self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.alert(),'')
 def test_autopilot_declared_unit_is_collected(self):
  q=self.collect();self.assertEqual(q.returncode,0,q.stderr)
  self.assertIn('ENABLED_REQUIRED|autopilot-mail.service|enabled',q.stdout)
 def test_required_timer_disabled_without_activity_is_named(self):
  q=self.check('ENABLED_SCOPE|1\nENABLED_REQUIRED|autopilot-mail-notice@first.timer|disabled\n')
  self.assertEqual(q.returncode,0,q.stderr);self.assertIn('autopilot-mail-notice@first.timer (disabled)',self.alert());self.assertEqual((self.root/'bedy').read_text(),'1')
 def test_ap_scope_uses_intent_even_when_instance_not_enabled(self):
  self.data['apActors']=['coder'];self.data['apStates']={'autopilot-mail-notice@coder.timer':'disabled'}
  q=self.collect();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('ENABLED_REQUIRED|autopilot-mail-notice@coder.timer|disabled',q.stdout)
  self.assertNotIn('ENABLED_REQUIRED|autopilot-mail-notice@first.timer',q.stdout);self.check(q.stdout);self.assertIn('@coder.timer (disabled)',self.alert())
 def test_ap_static_templates_are_not_required_instances(self):
  q=self.collect();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  self.assertIn('ENABLED_SKIP|autopilot-mail-failed@.service|template',q.stdout);self.assertNotIn('ENABLED_REQUIRED|autopilot-mail-notice@.timer',q.stdout)
 def test_declared_extra_unit_is_discovered_without_code_list(self):
  self.ap_units['new-plugin-unit.service']='[Service]\nExecStart=/bin/true\n[Install]\nWantedBy=multi-user.target\n'
  self.data['apStates']={'new-plugin-unit.service':'disabled'}
  q=self.collect();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.check(q.stdout);self.assertIn('new-plugin-unit.service (disabled)',self.alert())
 def test_ap_static_unit_is_named_and_not_required(self):
  self.ap_units['static-helper.service']='[Service]\nExecStart=/bin/true\n';q=self.collect();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('ENABLED_SKIP|static-helper.service|static',q.stdout);self.assertNotIn('ENABLED_REQUIRED|static-helper.service',q.stdout)
 def test_ap_default_instance_is_expanded(self):
  self.ap_units['other@.service']='[Service]\nExecStart=/bin/true\n[Install]\nWantedBy=multi-user.target\nDefaultInstance=chosen\n';q=self.collect();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('ENABLED_REQUIRED|other@chosen.service|enabled',q.stdout)
 def test_ap_unknown_template_is_blind(self):
  self.ap_units['unknown@.service']='[Service]\nExecStart=/bin/true\n[Install]\nWantedBy=multi-user.target\n';q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('неизвестное раскрытие шаблона unknown@.service',q.stdout)
 def test_ap_missing_plugin_is_blind(self):
  self.data['apMissing']=True;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('dsh-autopilot отсутствует',q.stdout)
 def test_ap_empty_declaration_is_blind(self):
  self.data['apEmpty']=True;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('MAIL-LAYOUT.system_units',q.stdout)
 def test_ap_no_actor_intent_is_blind(self):
  self.data['apActors']=[];q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('пустой список autopilot_pochta',q.stdout)
 def test_ap_flag_must_be_boolean(self):
  self.data['apFlag']='true';q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('autopilot_pochta не boolean',q.stdout)
 def test_ap_missing_query_row_is_blind(self):
  self.data['apOmitLast']=True;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('systemctl is-enabled',q.stdout)
 def test_ap_runtime_only_enable_and_not_found_are_named(self):
  for state in ['enabled-runtime','not-found']:
   self.data['apStates']={'autopilot-mail.service':state};q=self.collect();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.check(q.stdout);self.assertIn('autopilot-mail.service ('+state+')',self.alert())
 def test_unknown_cli_does_not_collect(self):
  for args in [[],['--dry-run'],['autopilot','--root'],['autopilot','--root',str(self.root),'extra']]:
   q=subprocess.run(['bash',str(LIB),*args],capture_output=True,text=True);self.assertEqual(q.returncode,2);self.assertIn('ОТКАЗ',q.stdout+q.stderr)
 def test_native_root_healthy_disabled_restored(self):
  self.ap_fixture();data=self.root/'data.json';data.write_text(json.dumps(self.data));native=self.root/'native';native.mkdir();(native/'agent-registry').symlink_to(self.root/'agent-registry');(native/'systemctl').symlink_to('/usr/bin/systemctl')
  unitdir=self.root/'etc/systemd/system';unitdir.mkdir(parents=True)
  for name,body in self.ap_units.items():(unitdir/name).write_text(body)
  names=['autopilot-mail.service','autopilot-copy.service','autopilot-mail-notice@first.timer'];systemctl=['/usr/bin/systemctl','--root',str(self.root)]
  subprocess.run(systemctl+['enable',*names],capture_output=True,text=True,check=True)
  env={**os.environ,'PATH':str(native)+':'+os.environ['PATH'],'DATA':str(data)}
  def collect():
   q=subprocess.run(['bash',str(LIB),'autopilot','--root',str(self.root)],env=env,capture_output=True,text=True,timeout=10);self.assertEqual(q.returncode,0,q.stdout+q.stderr);return q.stdout
  def inventory():return '\n'.join(sorted(str(p.relative_to(unitdir))+' -> '+os.readlink(p) for p in unitdir.rglob('*') if p.is_symlink())).encode()
  self.check(collect());self.assertEqual(self.alert(),'');link=unitdir/'timers.target.wants/autopilot-mail-notice@first.timer';self.assertTrue(link.is_symlink());before=hashlib.sha256(inventory()).hexdigest()
  subprocess.run(systemctl+['disable',names[-1]],capture_output=True,text=True,check=True);self.assertFalse(os.path.lexists(link));after=hashlib.sha256(inventory()).hexdigest();self.assertNotEqual(before,after)
  measured=subprocess.run(systemctl+['is-enabled',names[-1]],capture_output=True,text=True);self.assertNotEqual(measured.returncode,0);print('DAMAGE removed_timer_link=1 SHA',before,'->',after,'native_state='+measured.stdout.strip(),flush=True)
  self.check(collect());self.assertIn(names[-1]+' (disabled)',self.alert());self.assertEqual((self.root/'bedy').read_text(),'1')
  (self.root/'alert').unlink();subprocess.run(systemctl+['enable',names[-1]],capture_output=True,text=True,check=True);self.assertTrue(link.is_symlink());self.assertEqual(hashlib.sha256(inventory()).hexdigest(),before);self.check(collect());self.assertEqual((self.root/'bedy').read_text(),'0');self.assertIn('снова в порядке',self.alert())
  (self.root/'alert').unlink();self.check(collect());self.assertEqual(self.alert(),'');print('RESTORED original symlink inventory SHA',before,'BEDY=0; repeated green silent',flush=True)
 def test_bad_ap_yaml_is_named_blindness(self):
  self.data['apBadYAML']=True;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('AP: plugins.yaml',q.stdout)
 def test_bad_ap_json_is_named_blindness(self):
  self.data['apBadJSON']=True;q=self.collect();self.assertEqual(q.returncode,2);self.assertIn('AP: MAIL-LAYOUT.json',q.stdout)
 def test_derevo_only_timer_is_discovered_without_manifest_row(self):
  self.ap_extra_units['extra/registered.timer']='[Timer]\nOnBootSec=5\n[Install]\nWantedBy=timers.target\n'
  self.data['apExtraFiles']=[{'local':'/etc/systemd/system/registered.timer','remote':'extra/registered.timer'}];self.data['apStates']={'registered.timer':'disabled'}
  q=self.collect();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('ENABLED_REQUIRED|registered.timer|disabled',q.stdout);self.check(q.stdout);self.assertIn('registered.timer (disabled)',self.alert())
if __name__=='__main__':unittest.main(verbosity=2)
