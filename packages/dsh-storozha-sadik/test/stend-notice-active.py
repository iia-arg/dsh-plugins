#!/usr/bin/python3 -B
"""Persistent notice liveness in the actual daily loop; command inputs and alert channel are private."""
from pathlib import Path
import hashlib,importlib.util,json,os,shutil,subprocess,unittest
P=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('notice_numeric_fixture',P/'test/stend-autopilot-notice-sutochnye.py');legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
U=legacy.UNITS;NOW=legacy.NOW;PROPS='Id,LoadState,ActiveState,MainPID,InactiveExitTimestamp'

class ActiveNotice(unittest.TestCase):
 def setUp(self):
  self.h=legacy.NoticeSutochnye('runTest');self.h.setUp();self.addCleanup(self.h.doCleanups)
  self.h.config.write_text(''.join(u+' active\n' for u in U));self.h.data.update(live={},live_error={},age={u:4200 for u in U})
  shim=r'''#!/usr/bin/python3
import json,os,pathlib,sys
args=sys.argv[1:];kind=pathlib.Path(sys.argv[0]).name;r=pathlib.Path(os.environ['FIXTURE_ROOT']);d=json.loads((r/'model.json').read_text());units=UNITS
with (r/'calls.jsonl').open('a')as f:f.write(json.dumps([kind,*args])+'\n')
if kind=='alert':
 with (r/'alerts.jsonl').open('a')as f:f.write(json.dumps(args,ensure_ascii=False)+'\n')
 sys.exit(0)
if kind=='date':
 if args==['+%s']:print(NOW);sys.exit(0)
 os.execv('/usr/bin/date',['date',*args])
if kind=='systemctl':
 if args[0]=='is-failed':sys.exit(0 if args[-1]in d['failed']else 1)
 if args[0]=='list-timers':
  for u in units:print('- - - - '+u.replace('.service','.timer')+' '+u)
  sys.exit(0)
 if args[0]=='show' and PROPS in args:
  u=next(x for x in args if x in units)
  if u in d['live_error']:sys.exit(d['live_error'][u])
  row=dict(Id=u,LoadState='loaded',ActiveState='active',MainPID='1234',InactiveExitTimestamp='@'+str(NOW-4200));row.update(d['live'].get(u,{}))
  if '_raw' in row:print(row['_raw']);sys.exit(0)
  for k,v in row.items():print(k+'='+v)
  sys.exit(0)
 if args[0]=='show' and 'Id'in args:
  for u in units:print('Id='+u.replace('.service','.timer')+'\nFragmentPath=/etc/systemd/system/autopilot-mail-notice@.timer\nLoadState=loaded\nUnitFileState=enabled\n')
  sys.exit(0)
 if args[0]=='show':print('inactive');sys.exit(0)
if kind=='journalctl':
 u=next(a[5:]for a in args if a.startswith('UNIT='))
 if u not in d['missing']:print(json.dumps({'__REALTIME_TIMESTAMP':str((NOW-d['age'].get(u,5))*1000000)}))
 sys.exit(0)
raise SystemExit('unexpected fixture input '+repr([kind,*args]))
'''.replace('UNITS',repr(U)).replace('PROPS',repr(PROPS)).replace('NOW',str(NOW))
  for name in ['systemctl','journalctl','alert','date']:
   f=self.h.bin/name;f.write_text(shim);f.chmod(0o755)
  self.h.save_model()
 def run_reader(self):self.h.save_model();return self.h.run_reader()
 def test_seven_active_after_seventy_minutes_ignore_missing_start_jobs(self):
  self.h.data['missing']=list(U);out,alert=self.run_reader();self.assertIn('RESULT 0',out);self.assertEqual(alert,'')
  calls=[json.loads(x) for x in self.h.calls.read_text().splitlines()];self.assertFalse(any(x[0]=='journalctl' for x in calls));print('CASE seven-active70/nojournal:0alerts',flush=True)
 def test_one_stopped_is_named_and_exact_return_recovers_once(self):
  out,alert=self.run_reader();self.assertIn('RESULT 0',out);self.assertEqual(alert,'');raw=self.h.model.read_bytes();old=hashlib.sha256(raw).hexdigest()
  self.h.data['live'][U[2]]={'ActiveState':'inactive','MainPID':'0'};self.h.save_model();bad=hashlib.sha256(self.h.model.read_bytes()).hexdigest();self.assertNotEqual(old,bad);count=subprocess.run(['grep','-cF','"ActiveState":"inactive"',str(self.h.model)],capture_output=True,text=True);self.assertEqual(count.stdout.strip(),'1');print('DAMAGE stopped grep-F=1 SHA '+old+' -> '+bad,flush=True)
  out,alert=self.run_reader();self.assertIn('RESULT 1',out);self.assertIn(U[2],alert);self.assertIn('inactive',alert)
  for u in U:
   if u!=U[2]:self.assertNotIn(u,alert)
  self.h.data['live']={};out,alert=self.run_reader();self.assertEqual(hashlib.sha256(self.h.model.read_bytes()).hexdigest(),old);self.assertIn('RESULT 0',out);self.assertIn('снова в порядке',alert);out,alert=self.run_reader();self.assertEqual(alert,'');print('RETURN stopped exact SHA '+old,flush=True)
 def test_failed_and_active_without_pid_are_named(self):
  for state,pid in [('failed','0'),('active','0'),('deactivating','0')]:
   with self.subTest(state=state):
    self.h.data['live'][U[1]]={'ActiveState':state,'MainPID':pid};out,_=self.run_reader();self.assertIn('RESULT 1',out);self.assertIn(U[1],out);self.assertNotIn('строка перечня негодна',out);self.assertNotIn('СЛЕПОТА',out)
 def test_activating_grace_thirty_seconds_then_named(self):
  for age,want in [(20,0),(30,0),(31,1)]:
   with self.subTest(age=age):
    self.h.data['live'][U[0]]={'ActiveState':'activating','MainPID':'0','InactiveExitTimestamp':'@'+str(NOW-age)};out,_=self.run_reader();self.assertIn('RESULT '+str(want),out);self.assertNotIn('строка перечня негодна',out)
    if want:self.assertIn('activating',out);self.assertIn(U[0],out)
 def test_unreadable_unknown_missing_and_malformed_are_blind(self):
  cases=[('read-error',{},1),('unknown',{'ActiveState':'unknown'},0),('missing',{'LoadState':'not-found'},0),('bad-pid',{'MainPID':'?'},0),('wrong-id',{'Id':'other.service'},0),('missing-row',{'_raw':''},0),('duplicate',{'_raw':'Id='+U[0]+'\nId='+U[0]},0),('activating-no-time',{'ActiveState':'activating','InactiveExitTimestamp':''},0),('activating-future',{'ActiveState':'activating','InactiveExitTimestamp':'@'+str(NOW+1)},0)]
  for label,row,rc in cases:
   with self.subTest(label=label):
    self.h.data['live']={U[0]:row};self.h.data['live_error']={U[0]:rc} if rc else {};out,_=self.run_reader();self.assertIn('RESULT 1',out);self.assertIn('СЛЕПОТА',out);self.assertIn(U[0],out)
 def test_current_numeric_list_output_is_byte_identical_to_327(self):
  old=(P/'test/fixtures/sutochnye-3.1.27.section').read_text();current=self.h.script.read_text();self.h.config.write_text((P/'test/fixtures/storozha-sutochnye-numeric-3.1.27.txt').read_text());a=current.index('# ── 2в. СТОРОЖ НАД СТОРОЖАМИ');b=current.index('\nprintf "RESULT',a);baseline=current[:a]+old+current[b:]
  for label,age,failed,missing in [('healthy',{},[],[]),('stale',{U[0]:3601},[],[]),('failed',{},[U[1]],[]),('no-history',{},[],[U[2]])]:
   outputs=[]
   for text in [baseline,current]:
    self.h.script.write_text(text);shutil.rmtree(self.h.state);self.h.state.mkdir()
    for f in [self.h.alerts,self.h.calls]:
     if f.exists():f.unlink()
    self.h.data.update(age=age,failed=failed,missing=missing);outputs.append(self.run_reader())
   self.assertEqual(outputs[0],outputs[1],label);print('NUMERIC identical '+label,flush=True)
 def test_released_fragment_is_seven_active_instances(self):
  self.assertEqual(legacy.entries(legacy.FRAGMENT.read_text()),[[u,'active']for u in U]);self.h.config.write_text(legacy.FRAGMENT.read_text());out,alert=self.run_reader();self.assertIn('RESULT 0',out);self.assertEqual(alert,'')

if __name__=='__main__':unittest.main(verbosity=2)
