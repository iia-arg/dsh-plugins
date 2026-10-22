"""The real stand CLI on temporary segmented sources and a process-view fixture."""
import contextlib,hashlib,importlib.util,io,json,os,shutil,subprocess,sys,time,unittest
from unittest import mock
from pathlib import Path
import test_g_journal_size as legacy
import test_g_segments as wire

class SegmentStand(unittest.TestCase):
 def setUp(self):
  self.e=legacy.GSize();self.e.setUp();self.addCleanup(self.e.doCleanups)
  self.s=wire.Segments();self.s.setUp();self.addCleanup(self.s.doCleanups)
  self.e.add(self.e.unit,101,b'openai',self.s.root)
  self.e.writer.with_name('usage-limits.json').write_text(json.dumps(wire.POLICY))
 def run_stand(self):
  with mock.patch.object(self.e.m.time,'time_ns',return_value=wire.NOW*1000000):return self.e.run_stand()
 def test_valid_segmented_source_is_green_with_whole_source_metrics(self):
  self.s.seal();rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ЗЕЛЁНОЕ',out);self.assertIn('источник',out);self.assertIn('файлов segments 4',out);self.assertIn('676',out);self.assertIn('стартовые',out);self.assertNotIn('МиБ из 128',out)
 def test_nightly_keeps_actual_green_metrics_for_human_weekly_measurement(self):
  self.s.seal();rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('STEND-G-METRIC: ',out);self.assertIn('байт/с',out);self.assertIn('closedAt',out);self.assertIn('стартовые',out)
  source=(legacy.STAND.parent.parent/'dorabotki/vse-stendy-boevye.sh').read_text();start=source.index('    printf',source.index('    case "$s" in',source.index('    progress running "$s"')))
  # Execute the actual post-run transport stanza before result classification.
  end=source.index('    # B-N-2062',start);transport=source[start:end]
  q=subprocess.run(['bash','-c','out=$1\n'+transport,'_',out],capture_output=True,text=True,check=True);rows=[x for x in out.splitlines() if x.startswith('STEND-G-METRIC: ')];self.assertEqual(q.stdout.splitlines(),rows)
 def test_maximum_names_fastest_gateway_and_partial_measurement_then_restore(self):
  self.s.seal(size=100);others=[]
  for pid,name,size in [(201,'fast',1000),(202,'middle',200)]:
   source=wire.Segments();source.setUp();self.addCleanup(source.doCleanups);source.seal(size=size);unit='coder-gateway-'+name+'.service';self.e.add(unit,pid,b'openai',source.root);others.append((source,unit))
  def maximum(expected,unit,numerator,scope):
   rc,out=self.run_stand();self.assertEqual(rc,expected,out);rows=[x for x in out.splitlines() if x.startswith('STEND-G-METRIC: МАКСИМУМ')];self.assertEqual(len(rows),1,out);self.assertIn(unit,rows[0]);self.assertIn('closedBytes7d='+str(numerator),rows[0]);self.assertIn(scope,rows[0]);self.assertNotIn('closedBytes7d=1300',rows[0]);return out
  out=maximum(0,others[0][1],1000,'полный');rows=[x for x in out.splitlines() if x.startswith('STEND-G-METRIC: G ')];self.assertEqual(len(rows),3)
  for unit in [self.e.unit,others[0][1],others[1][1]]:self.assertEqual(sum(unit in row for row in rows),1)
  anchor=others[0][0].d/'gateway-v1.jsonl.source.json';good=anchor.read_bytes();anchor.unlink();self.assertFalse(anchor.exists());print('MAX-PORCHA fastest source.json removed SHA='+hashlib.sha256(good).hexdigest(),flush=True)
  maximum(2,others[1][1],200,'частичный');anchor.write_bytes(good);anchor.chmod(0o400);maximum(0,others[0][1],1000,'полный')
 def test_unmeasured_maximum_is_not_reported_as_measured_zero(self):
  saved=dict(self.e.units);self.e.units.clear();rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('МАКСИМУМ · не измерен',out);self.assertNotIn('скорость=0.',out)
  self.e.units.update(saved);rc,out=self.run_stand();self.assertEqual(rc,0,out);rows=[x for x in out.splitlines() if x.startswith('STEND-G-METRIC: МАКСИМУМ')];self.assertEqual(len(rows),1,out);self.assertIn('скорость=0.000000000',rows[0]);self.assertIn('полный',rows[0]);self.assertIn('измерено 1 из 1',rows[0])
 def test_nightly_transport_keeps_both_individual_and_maximum_rows(self):
  self.s.seal(size=123);rc,out=self.run_stand();self.assertEqual(rc,0,out)
  source=(legacy.STAND.parent.parent/'dorabotki/vse-stendy-boevye.sh').read_text();a=source.index('    printf',source.index('    case "$s" in',source.index('    progress running "$s"')));b=source.index('    # B-N-2062',a)
  q=subprocess.run(['bash','-c','out=$1\n'+source[a:b],'_',out],capture_output=True,text=True,check=True);rows=q.stdout.splitlines();self.assertEqual(len(rows),5,q.stdout);self.assertEqual(sum(x.startswith('STEND-G-METRIC: G ') for x in rows),1);maximum=next(x for x in rows if x.startswith('STEND-G-METRIC: МАКСИМУМ'));self.assertIn('closedBytes7d=123',maximum)
 def test_three_independent_rows_and_colorless_hourly_reference(self):
  file=self.s.seal();rc,out=self.run_stand();self.assertEqual(rc,0,out)
  def rows(text):
   gc=next((x for x in text.splitlines() if x.startswith('STEND-G-METRIC: GC · ')),None);growth=next((x for x in text.splitlines() if x.startswith('STEND-G-METRIC: G ')),None);info=next((x for x in text.splitlines() if x.startswith('STEND-G-METRIC: СПРАВКА · ')),None)
   self.assertIsNotNone(gc,text);self.assertIsNotNone(growth,text);self.assertIsNotNone(info,text);self.assertIn('Разрастание',growth);self.assertIn('ожидаемо при закрытии по часу: 344',info);self.assertIn('ожидаемо при закрытии по часу: 344 (2(N+1)+4+2)',info)
   for marker in ['FAIL','ЗЕЛЁНОЕ','ЖЁЛТОЕ','КРАСНОЕ','\x1b']:self.assertNotIn(marker,info)
   return gc,growth,info
  gc,growth,info=rows(out);self.assertIn('ЗЕЛЁНОЕ',gc);self.assertIn('ЗЕЛЁНОЕ',growth);self.assertIn('файлов источника 6',info);self.assertIn('файлов segments 4',info)
  original=(self.s.s/'manifest.json').read_bytes();entry=self.s.manifest['segments'][0];entry['closedAt']=wire.NOW-7*wire.DAY-3600001;self.s.write(self.s.s/'manifest.json',self.s.manifest,0o600);self.s.write(file.with_suffix('.seal.json'),entry,0o400);after=(self.s.s/'manifest.json').read_bytes();self.assertNotEqual(hashlib.sha256(original).hexdigest(),hashlib.sha256(after).hexdigest());self.assertEqual(json.loads(after)['segments'][0]['closedAt'],wire.NOW-7*wire.DAY-3600001);print('THREE-ROWS-PORCHA old closedAt SHA='+hashlib.sha256(original).hexdigest()+'->'+hashlib.sha256(after).hexdigest(),flush=True)
  rc,out=self.run_stand();self.assertEqual(rc,1,out);gc,growth,info=rows(out);self.assertIn('ЖЁЛТОЕ',gc);self.assertIn('GC отстаёт',gc);self.assertIn('ЗЕЛЁНОЕ',growth)
  entry['closedAt']=wire.NOW-3600000;self.s.write(self.s.s/'manifest.json',self.s.manifest,0o600);self.s.write(file.with_suffix('.seal.json'),entry,0o400);self.assertEqual(self.run_stand()[0],0)
 def test_count_corruption_then_restore_through_actual_stand(self):
  self.assertEqual(self.run_stand()[0],0);files=[]
  for i in range(675):
   file=self.s.s/('extra-'+str(i));file.touch(mode=0o600);files.append(file)
  self.assertEqual(len(os.listdir(self.s.s)),677);print('STAND-PORCHA extra-files=675 listdir=677',flush=True)
  rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('FAIL',out);self.assertIn('число файлов 677 > 676',out);self.assertIn(self.e.unit,out)
  for file in files:file.unlink()
  self.assertEqual(self.run_stand()[0],0)
 def test_old_closed_segment_warns_on_separate_gc_line_then_restore(self):
  file=self.s.seal(wire.NOW-7*wire.DAY-3600001);rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('FAIL G master',out);self.assertIn('GC отстаёт',out)
  e=self.s.manifest['segments'][0];e['closedAt']=wire.NOW-3600000;self.s.write(self.s.s/'manifest.json',self.s.manifest,0o600);self.s.write(file.with_suffix('.seal.json'),e,0o400);self.assertEqual(self.run_stand()[0],0)
 def test_no_anchor_is_blind_with_unit_then_restore(self):
  file=self.s.d/'gateway-v1.jsonl.source.json';good=file.read_bytes();before=hashlib.sha256(good).hexdigest();file.unlink();self.assertFalse(file.exists());print('STAND-PORCHA source.json removed SHA='+before,flush=True)
  rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('source.json',out);self.assertIn(self.e.unit,out);self.assertNotIn('ЗЕЛЁНОЕ',out)
  file.write_bytes(good);file.chmod(0o400);self.assertEqual(self.run_stand()[0],0)
 def test_total_over_128_mib_is_healthy_under_startup_gib(self):
  for _ in range(17):self.s.seal(size=8388608)
  rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ЗЕЛЁНОЕ',out);self.assertNotIn('SOURCE_GAP по размеру',out);self.assertNotIn('МиБ из 128',out)
 def test_bootstrap_gib_size_warning_uses_total_not_empty_active(self):
  for _ in range(129):self.s.seal(size=8388608)
  self.assertEqual((self.s.d/'gateway-v1.jsonl').stat().st_size,0)
  rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('размер источника',out);self.assertIn('стартовые',out);self.assertIn('ЖЁЛТОЕ',out)
 def test_unsafe_active_mode_still_yellow_then_return(self):
  file=self.s.d/'gateway-v1.jsonl';file.chmod(0o644);rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('G выключен шлюзом',out);file.chmod(0o600);self.assertEqual(self.run_stand()[0],0)
 def test_missing_g_for_new_process_is_yellow_not_schema_blindness(self):
  (self.s.d/'gateway-v1.jsonl').unlink();stamp=max(self.e.writer.stat().st_mtime_ns,self.e.writer.stat().st_ctime_ns)
  with mock.patch.object(self.e.m,'process_start_bounds',return_value=(stamp+1000000000,stamp+1010000000)):
   rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('G ожидается, файла нет',out)
 def test_schema3_rejects_old2_and_warning_fields_then_returns(self):
  file=self.e.writer.with_name('usage-limits.json');good=file.read_bytes();self.assertEqual(self.run_stand()[0],0)
  for damaged in [dict(wire.POLICY,schemaVersion=2),dict(wire.POLICY,directoryWarnBytes=1073741824,closedCountWarn=676)]:
   file.write_text(json.dumps(damaged));before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(file.read_bytes()).hexdigest();self.assertNotEqual(before,after);self.assertEqual(json.loads(file.read_bytes()),damaged);print('SCHEMA3-PORCHA policy='+str(damaged)+' SHA='+before+'->'+after,flush=True)
   rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('usage-limits.json',out);self.assertIn(self.e.unit,out);self.assertNotIn('ЗЕЛЁНОЕ',out);file.write_bytes(good);self.assertEqual(self.run_stand()[0],0)
 def test_rotation_stall_and_restore_keep_other_verdicts_independent(self):
  active=self.s.d/'gateway-v1.jsonl';manifest=self.s.s/'manifest.json';opened=wire.NOW-7200000;self.s.manifest['active']['openedAt']=opened;self.s.write(manifest,self.s.manifest,0o600)
  def record(at):active.write_text(json.dumps(dict(observedAt=at))+'\n')
  record(wire.NOW-60000);rc,out=self.run_stand();self.assertEqual(rc,0,out);good=active.read_bytes()
  self.assertIn('firstObservedAtMs='+str(wire.NOW-60000),out);self.assertIn('openedAtMs='+str(opened),out)
  record(opened);before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(active.read_bytes()).hexdigest();self.assertNotEqual(before,after)
  self.assertEqual(subprocess.check_output(['grep','-cF','"observedAt": '+str(opened),str(active)],text=True).strip(),'1');print('FIRST-OBSERVED-PORCHA grepF=1 SHA='+before+'->'+after,flush=True)
  os.utime(active,ns=(wire.NOW*1000000,wire.NOW*1000000));rc,out=self.run_stand();self.assertEqual(rc,1,out)
  rotation=next(x for x in out.splitlines() if x.startswith('STEND-G-METRIC: РОТАЦИЯ'));self.assertIn('FAIL ЖЁЛТОЕ',rotation);self.assertIn('ротация стоит: ',rotation);self.assertIn(self.e.unit,rotation);self.assertIn('первая запись ',rotation);self.assertIn('firstObservedAtMs='+str(opened),rotation)
  expected_date=subprocess.check_output(['date','-u','-d','@'+str(opened//1000),'+%Y-%m-%dT%H:%M:%S'],text=True).strip();self.assertIn(expected_date,rotation)
  self.assertIn('ЗЕЛЁНОЕ',next(x for x in out.splitlines() if x.startswith('STEND-G-METRIC: GC')));self.assertIn('ЗЕЛЁНОЕ',next(x for x in out.splitlines() if x.startswith('STEND-G-METRIC: G ')))
  source=(legacy.STAND.parent.parent/'dorabotki/vse-stendy-boevye.sh').read_text();a=source.index('    printf',source.index('    case "$s" in',source.index('    progress running "$s"')));b=source.index('    # B-N-2062',a);q=subprocess.run(['bash','-c','out=$1\n'+source[a:b],'_',out],capture_output=True,text=True,check=True);self.assertIn(rotation,q.stdout)
  active.write_bytes(good);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertNotIn('ротация стоит:',out)
 def test_rotation_uses_writer_policy_boundary_and_empty_is_neutral(self):
  active=self.s.d/'gateway-v1.jsonl';manifest=self.s.s/'manifest.json';policy=self.e.writer.with_name('usage-limits.json');self.s.manifest['active']['openedAt']=wire.NOW-7200000;self.s.write(manifest,self.s.manifest,0o600)
  rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ротация не требуется: active пуст',out)
  active.write_text(json.dumps(dict(schemaVersion=1,generation='rotation',seq=1,observedAt=wire.NOW-3600000,kind='watermark'))+'\n');self.s.manifest['active']['openedAt']=wire.NOW-3600000;self.s.write(manifest,self.s.manifest,0o600);self.assertEqual(self.run_stand()[0],0)
  good=policy.read_bytes();data=json.loads(good);data['segmentMaxAgeSeconds']=1800;policy.write_text(json.dumps(data));self.assertEqual(subprocess.check_output(['grep','-cF','"segmentMaxAgeSeconds": 1800',str(policy)],text=True).strip(),'1');self.assertNotEqual(hashlib.sha256(good).digest(),hashlib.sha256(policy.read_bytes()).digest());print('ROTATION-POLICY-PORCHA age3600->1800 SHA='+hashlib.sha256(good).hexdigest()+'->'+hashlib.sha256(policy.read_bytes()).hexdigest(),flush=True)
  rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('ротация стоит:',out);self.assertIn('2700',out);policy.write_bytes(good);self.assertEqual(self.run_stand()[0],0)
  for age,expected in [(4500000,0),(4500001,1),(0,0)]:
   active.write_text(json.dumps(dict(observedAt=wire.NOW-age))+'\n');rc,out=self.run_stand();self.assertEqual(rc,expected,out)
 def test_bad_segment_policy_is_named_blind(self):
  file=self.e.writer.with_name('usage-limits.json');file.write_text(json.dumps(dict(wire.POLICY,segmentMaxAgeSeconds=True)));rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('usage-limits.json',out);self.assertIn(self.e.unit,out)
 def test_segments_are_read_inside_process_root_not_host_decoy(self):
  self.assertEqual(self.run_stand()[0],0);namespace=self.e.root/'namespace';code=namespace/str(self.e.root).lstrip('/');code.mkdir(parents=True)
  for name in ['gateway.mjs','usage-producer.mjs','usage-limits.json']:shutil.copy2(self.e.root/name,code/name)
  home=namespace/str(self.s.root).lstrip('/');home.mkdir(parents=True);shutil.copytree(self.s.d,home/'.usage-meter');root=self.e.m.gateway.PROC/'101/root';root.unlink();root.symlink_to(namespace)
  anchor=home/'.usage-meter/gateway-v1.jsonl.source.json';raw=anchor.read_bytes();anchor.unlink();self.assertTrue((self.s.d/anchor.name).is_file());self.assertFalse(anchor.exists());print('NAMESPACE-PORCHA missing-source='+str(anchor)+' host-decoy=present SHA='+hashlib.sha256(raw).hexdigest(),flush=True)
  rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('source.json',out);self.assertNotIn('ЗЕЛЁНОЕ',out)
  anchor.write_bytes(raw);anchor.chmod(0o400);self.assertEqual(self.run_stand()[0],0)
 def test_segment_policy_compares_both_ap_numbers(self):
  spec=importlib.util.spec_from_file_location('segment_contract',legacy.STAND.with_name('g-source-contract.py'));contract=importlib.util.module_from_spec(spec);spec.loader.exec_module(contract)
  for name in ['engine-process.mjs','usage-segments.mjs']:shutil.copyfile(legacy.STAND.parent/'fixtures/g-producer-25d8'/name,self.e.writer.with_name(name))
  output=io.StringIO()
  with mock.patch.object(contract,'run',return_value=0),contextlib.redirect_stdout(output):
   result=contract.check_one(self.e.m,self.e.writer,str(self.e.writer),dict(value=134217728,record=65536,path='/fixture/usage_registration.py'))
  self.assertEqual(result,0,output.getvalue());self.assertIn('legacyFileMaxBytes=134217728',output.getvalue());self.assertIn('G_WRITER_LIMIT=134217728',output.getvalue());self.assertIn('maxRecordBytes=65536',output.getvalue());self.assertIn('G_RECORD_ALLOWANCE=65536',output.getvalue())
 def test_contract_invalid_policy_is_blind_without_traceback(self):
  file=self.e.writer.with_name('usage-limits.json');good=file.read_bytes();file.write_text(json.dumps(dict(wire.POLICY,segmentMaxAgeSeconds=True)))
  before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(file.read_bytes()).hexdigest();self.assertNotEqual(before,after);print('CONTRACT-POLICY-PORCHA boolean age SHA='+before+'->'+after,flush=True)
  q=subprocess.run([sys.executable,'-B',str(legacy.STAND.with_name('g-source-contract.py')),'--producer',str(self.e.writer)],capture_output=True,text=True,timeout=5);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('usage-limits.json',q.stdout);self.assertNotIn('Traceback',q.stderr)
  file.write_bytes(good)
 def test_parent_changed_after_early_path_check_is_blind_then_return(self):
  namespace=self.e.root/'namespace';code=namespace/str(self.e.root).lstrip('/');code.mkdir(parents=True)
  for name in ['gateway.mjs','usage-producer.mjs','usage-limits.json']:shutil.copy2(self.e.root/name,code/name)
  home=namespace/str(self.s.root).lstrip('/');home.mkdir(parents=True);shutil.copytree(self.s.d,home/'.usage-meter');root=self.e.m.gateway.PROC/'101/root';root.unlink();root.symlink_to(namespace)
  self.assertEqual(self.run_stand()[0],0);module=self.e.m.segment_module();real=module.inspect_source;saved=home.with_name(home.name+'-saved');changed=[]
  def substitute(*args,**kwargs):
   home.rename(saved);home.symlink_to(self.s.root);self.assertEqual(os.readlink(home),str(self.s.root));changed.append(True);print('LATE-PARENT-PORCHA symlink='+str(home)+'->'+os.readlink(home),flush=True);return real(*args,**kwargs)
  try:
   with mock.patch.object(self.e.m,'segment_module',return_value=module),mock.patch.object(module,'inspect_source',side_effect=substitute):rc,out=self.run_stand()
   self.assertTrue(changed);self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА',out);self.assertNotIn('ЗЕЛЁНОЕ',out)
  finally:
   if changed:home.unlink();saved.rename(home)
  self.assertEqual(self.run_stand()[0],0)
 def test_real_proc_cli_three_corruptions_and_returns(self):
  now=time.time_ns()//1000000;self.s.anchor['sourceCreatedAt']=now-wire.DAY;self.s.write(self.s.d/'gateway-v1.jsonl.source.json',self.s.anchor,0o400);self.s.manifest['active']['openedAt']=now;self.s.write(self.s.s/'manifest.json',self.s.manifest,0o600)
  code=self.e.root;entry=code/'gateway.mjs';ready=code/'ready';entry.write_text('import fs from "node:fs";fs.writeFileSync('+json.dumps(str(ready))+',"ready");setInterval(()=>{},1000);\n')
  child=subprocess.Popen([shutil.which('node'),str(entry)],env={'PATH':os.defpath,'GATEWAY_POSTAVSHIK':'openai','CODEX_HOME':str(self.s.root)})
  try:
   deadline=time.monotonic()+3
   while not ready.exists() and time.monotonic()<deadline:time.sleep(0.01)
   self.assertTrue(ready.is_file(),'dummy Node did not start')
   binary=self.e.root/'bin';binary.mkdir();ctl=binary/'systemctl';unit='coder-gateway-segments-probe.service'
   ctl.write_text('#!/usr/bin/python3\nimport sys\nif sys.argv[1]=="list-units":print('+repr(unit+' loaded active running probe')+')\nelse:print('+repr('Id='+unit+'\nMainPID='+str(child.pid))+')\n');ctl.chmod(0o755)
   def invoke(expected,needle):
    q=subprocess.run([sys.executable,'-B',str(legacy.STAND)],env={**os.environ,'PATH':str(binary)+':'+os.defpath},capture_output=True,text=True,timeout=5);print(q.stdout,flush=True);self.assertEqual(q.returncode,expected,q.stdout+q.stderr);self.assertIn(needle,q.stdout);self.assertIn(unit,q.stdout);return q.stdout
   self.assertIn(os.fsencode(entry),(Path('/proc')/str(child.pid)/'cmdline').read_bytes())
   invoke(0,'ЗЕЛЁНОЕ');extras=[]
   for i in range(675):
    file=self.s.s/('probe-'+str(i));file.touch(mode=0o600);extras.append(file)
   self.assertEqual(len(os.listdir(self.s.s)),677);print('CLI-PORCHA file-count listdir=677 created=675',flush=True);invoke(1,'число файлов 677 > 676')
   for file in extras:file.unlink()
   invoke(0,'ЗЕЛЁНОЕ');old=now-7*wire.DAY-3600001;file=self.s.seal(old);self.assertEqual(json.loads(file.with_suffix('.seal.json').read_bytes())['closedAt'],old);self.assertEqual(json.loads((self.s.s/'manifest.json').read_bytes())['segments'][0]['closedAt'],old);print('CLI-PORCHA inserted closedAt='+str(old)+' boundary='+str(now-7*wire.DAY-3600000),flush=True);invoke(1,'GC отстаёт')
   item=self.s.manifest['segments'][0];before=hashlib.sha256((self.s.s/'manifest.json').read_bytes()).hexdigest();item['closedAt']=now-3600000;self.s.write(self.s.s/'manifest.json',self.s.manifest,0o600);self.s.write(file.with_suffix('.seal.json'),item,0o400);after=hashlib.sha256((self.s.s/'manifest.json').read_bytes()).hexdigest();self.assertNotEqual(before,after);print('CLI-GC-RESTORE SHA='+before+'->'+after,flush=True);invoke(0,'ЗЕЛЁНОЕ')
   anchor=self.s.d/'gateway-v1.jsonl.source.json';good=anchor.read_bytes();anchor.unlink();self.assertFalse(anchor.exists());print('CLI-PORCHA removed source.json SHA='+hashlib.sha256(good).hexdigest(),flush=True);invoke(2,'source.json');anchor.write_bytes(good);anchor.chmod(0o400);invoke(0,'ЗЕЛЁНОЕ')
   active=self.s.d/'gateway-v1.jsonl';manifest=self.s.s/'manifest.json';self.s.manifest['active']['openedAt']=now-7200000;self.s.write(manifest,self.s.manifest,0o600)
   active.write_text(json.dumps(dict(observedAt=now-60000))+'\n');invoke(0,'ротация без отставания');good=active.read_bytes()
   active.write_text(json.dumps(dict(observedAt=now-7200000))+'\n');before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(active.read_bytes()).hexdigest();self.assertNotEqual(before,after);self.assertEqual(subprocess.check_output(['grep','-cF','"observedAt": '+str(now-7200000),str(active)],text=True).strip(),'1');print('REAL-CLI-FIRST-PORCHA grepF=1 SHA='+before+'->'+after,flush=True)
   out=invoke(1,'ротация стоит:');self.assertIn('первая запись ',out);self.assertIn('firstObservedAtMs='+str(now-7200000),out)
   active.write_bytes(good);invoke(0,'ротация без отставания');active.write_bytes(b'');invoke(0,'ротация не требуется: active пуст')


  finally:
   child.terminate()
   try:child.wait(timeout=2)
   except subprocess.TimeoutExpired:child.kill();child.wait(timeout=2)

if __name__=='__main__':unittest.main()
