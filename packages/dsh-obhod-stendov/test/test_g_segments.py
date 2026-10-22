"""Transport metadata and volume; temporary sources, never installed writer/HOME."""
import hashlib,importlib.util,json,os,stat,subprocess,tempfile,unittest
from pathlib import Path
from unittest import mock
MODULE=Path(__file__).with_name('g_segment_source.py')
NOW=1800000000000;DAY=86400000;SOURCE='11111111-1111-4111-8111-111111111111';EPOCH='22222222-2222-4222-8222-222222222222'
POLICY=dict(schemaVersion=3,legacyFileMaxBytes=134217728,segmentMaxBytes=8388608,segmentMaxAgeSeconds=3600,rawRetentionSeconds=604800,maxRecordBytes=65536)
class Segments(unittest.TestCase):
 def setUp(self):
  self.assertTrue(MODULE.is_file(),'segment metadata implementation is missing')
  spec=importlib.util.spec_from_file_location('segments',MODULE);self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.d=self.root/'.usage-meter';self.s=self.d/'segments';self.s.mkdir(parents=True,mode=0o700);self.d.chmod(0o700)
  self.anchor=dict(schemaVersion=1,sourceId=SOURCE,sourceEpoch=EPOCH,sourceCreatedAt=NOW-DAY)
  self.manifest=dict(schemaVersion=1,sourceId=SOURCE,sourceEpoch=EPOCH,active=dict(segmentNo=0,openedAt=NOW,origins={}),segments=[],deletedMaxObservedAt=None,retainedFrom=0)
  self.write(self.d/'gateway-v1.jsonl.source.json',self.anchor,0o400);self.write(self.s/'manifest.json',self.manifest,0o600);(self.d/'gateway-v1.jsonl').write_bytes(b'');(self.d/'gateway-v1.jsonl').chmod(0o600);(self.s/'writer.lock').touch(mode=0o600)
 def write(self,path,obj,mode):path.write_text(json.dumps(obj));path.chmod(mode)
 def seal(self,closed_at=NOW-3600000,size=None):
  no=self.manifest['active']['segmentNo'];name=EPOCH+'-'+str(no)+'.jsonl';raw=(json.dumps(dict(schemaVersion=1,generation='g'+str(no),seq=1,observedAt=closed_at,kind='watermark'))+'\n').encode();file=self.s/name;file.write_bytes(raw)
  if size is not None:
   with file.open('r+b') as f:f.truncate(size)
  file.chmod(0o400)
  entry=dict(schemaVersion=1,sourceId=SOURCE,sourceEpoch=EPOCH,segmentNo=no,file=name,closedAt=closed_at,byteLength=file.stat().st_size,sha256=hashlib.sha256(raw).hexdigest(),generations=[dict(generation='g'+str(no),firstSeq=1,finalSeq=1,finalObservedAt=closed_at,maxObservedAt=closed_at,firstSegmentNo=no)])
  self.write(file.with_suffix('.seal.json'),entry,0o400);self.manifest['segments'].append(entry);self.manifest['active']['segmentNo']=no+1;self.write(self.s/'manifest.json',self.manifest,0o600);return file
 def inspect(self):return self.m.inspect_source(self.d,os.getuid(),POLICY,NOW)
 def assess(self,snapshot):return self.m.assess(snapshot,POLICY,NOW)
 def test_healthy_source_exact_count_total_and_bootstrap_threshold(self):
  self.seal();s=self.inspect();self.assertEqual(s['segmentFiles'],4);self.assertEqual(s['closedSegments'],1);self.assertEqual(s['sourceCreatedAt'],NOW-DAY)
  files=[self.d/'gateway-v1.jsonl',self.d/'gateway-v1.jsonl.source.json',self.s/'manifest.json',self.s/'writer.lock',self.s/(EPOCH+'-0.jsonl'),self.s/(EPOCH+'-0.seal.json')]
  independent=sum(int(subprocess.check_output(['stat','-c','%s',str(x)],text=True)) for x in files);self.assertEqual(s['bytes'],independent)
  a=self.assess(s);self.assertEqual((a['expectedFiles'],a['fileWarnAbove'],a['byteWarnAbove']),(338,676,1073741824));self.assertTrue(a['startupThreshold']);self.assertEqual(a['warnings'],[])
 def test_extra_files_cross_count_boundary_then_return(self):
  s=self.inspect();self.assertEqual(self.assess(s)['warnings'],[]);created=[]
  for i in range(675):
   p=self.s/('orphan-'+str(i)+'.new');p.touch(mode=0o600);created.append(p)
  count=len(os.listdir(self.s));self.assertEqual(count,677);print('COUNT-PORCHA created=675 listdir='+str(count),flush=True)
  s=self.inspect();self.assertEqual(s['segmentFiles'],count);self.assertTrue(any('число файлов' in x and '676' in x for x in self.assess(s)['warnings']))
  for p in created:p.unlink()
  self.assertEqual(self.assess(self.inspect())['warnings'],[])
 def test_old_closed_at_is_gc_warning_then_return(self):
  old=NOW-7*DAY-3600001;file=self.seal(old);self.assertEqual(json.loads(file.with_suffix('.seal.json').read_bytes())['closedAt'],old);self.assertEqual(json.loads((self.s/'manifest.json').read_bytes())['segments'][0]['closedAt'],old);print('GC-PORCHA inserted closedAt='+str(old)+' boundary='+str(NOW-7*DAY-3600000),flush=True);self.assertTrue(any('GC отстаёт' in x for x in self.assess(self.inspect())['warnings']))
  entry=self.manifest['segments'][0];before=hashlib.sha256((self.s/'manifest.json').read_bytes()).hexdigest();entry['closedAt']=NOW-3600000;self.write(self.s/'manifest.json',self.manifest,0o600);self.write(file.with_suffix('.seal.json'),entry,0o400);after=hashlib.sha256((self.s/'manifest.json').read_bytes()).hexdigest();self.assertNotEqual(before,after);print('GC-PORCHA removed old closedAt SHA='+before+'->'+after,flush=True);self.assertEqual(self.assess(self.inspect())['warnings'],[])
 def test_missing_source_is_blind_and_restore_is_healthy(self):
  p=self.d/'gateway-v1.jsonl.source.json';raw=p.read_bytes();p.unlink();self.assertFalse(p.exists());print('SOURCE-PORCHA removed='+str(p),flush=True)
  with self.assertRaisesRegex(self.m.Blind,'source.json'):self.inspect()
  p.write_bytes(raw);p.chmod(0o400);self.assertEqual(self.assess(self.inspect())['warnings'],[])
 def test_source_created_at_required_safe_and_not_in_future(self):
  for value in [None,True,1.5,NOW+1]:
   a=dict(self.anchor)
   if value is None:del a['sourceCreatedAt']
   else:a['sourceCreatedAt']=value
   self.write(self.d/'gateway-v1.jsonl.source.json',a,0o400)
   with self.assertRaises(self.m.Blind):self.inspect()
 def test_missing_closed_raw_or_seal_and_wrong_size_are_blind(self):
  file=self.seal();raw=file.read_bytes();file.unlink()
  with self.assertRaisesRegex(self.m.Blind,'MISSING'):self.inspect()
  file.write_bytes(raw+b'x');file.chmod(0o400)
  with self.assertRaisesRegex(self.m.Blind,'byteLength'):self.inspect()
  file.write_bytes(raw);file.chmod(0o400);file.with_suffix('.seal.json').unlink()
  with self.assertRaisesRegex(self.m.Blind,'MISSING'):self.inspect()
 def test_unsafe_mode_uid_links_and_symlinks_are_not_healthy(self):
  file=self.seal();file.chmod(0o644)
  with self.assertRaises(self.m.Unsafe):self.inspect()
  file.chmod(0o400);os.link(file,self.root/'hardlink')
  with self.assertRaises(self.m.Unsafe):self.inspect()
  (self.root/'hardlink').unlink();raw=file.read_bytes();file.unlink();target=self.root/'target';target.write_bytes(raw);file.symlink_to(target)
  with self.assertRaises(self.m.Unsafe):self.inspect()
 def test_manifest_seal_disagreement_and_bad_schema_are_blind(self):
  file=self.seal();entry=dict(self.manifest['segments'][0]);entry['closedAt']-=1;self.write(file.with_suffix('.seal.json'),entry,0o400)
  with self.assertRaises(self.m.Blind):self.inspect()
  self.write(file.with_suffix('.seal.json'),self.manifest['segments'][0],0o400)
  self.write(self.s/'manifest.json',dict(self.manifest,extra=True),0o600)
  with self.assertRaisesRegex(self.m.Blind,'схема manifest'):self.inspect()
 def test_seal_types_must_match_manifest_then_restore(self):
  file=self.seal();seal=file.with_suffix('.seal.json');original=seal.read_bytes();before=hashlib.sha256(original).hexdigest()
  for label in ['boolean-schema','float-length','nested-boolean-seq']:
   entry=json.loads(original)
   if label=='boolean-schema':entry['schemaVersion']=True
   elif label=='float-length':entry['byteLength']=float(entry['byteLength'])
   else:entry['generations'][0]['firstSeq']=True
   self.write(seal,entry,0o400);after=hashlib.sha256(seal.read_bytes()).hexdigest();self.assertNotEqual(before,after);print('SEAL-PORCHA '+label+' SHA='+before+'->'+after,flush=True)
   with self.assertRaises(self.m.Blind,msg=label):self.inspect()
   seal.write_bytes(original);seal.chmod(0o400);self.assertEqual(self.assess(self.inspect())['warnings'],[])
 def test_root_orphan_counts_towards_total_then_restore(self):
  original=self.inspect()['bytes'];file=self.d/'orphan.new'
  with file.open('wb') as f:f.truncate(2*1073741824)
  file.chmod(0o600);self.assertEqual(int(subprocess.check_output(['stat','-c','%s',str(file)],text=True)),2*1073741824);print('ROOT-PORCHA sparse bytes='+str(file.stat().st_size),flush=True)
  snapshot=self.inspect();self.assertEqual(snapshot['segmentFiles'],2);self.assertEqual(snapshot['bytes'],original+file.stat().st_size);self.assertTrue(any('размер источника' in x for x in self.assess(snapshot)['warnings']))
  file.unlink();self.assertEqual(self.assess(self.inspect())['warnings'],[])
 def test_intent_is_unstable_snapshot_not_healthy_metadata(self):
  file=self.s/'intent.json';self.write(file,{'op':'unknown'},0o600)
  with self.assertRaisesRegex(self.m.Blind,'intent'):self.inspect()
  file.unlink();self.assertEqual(self.assess(self.inspect())['warnings'],[])
 def test_total_source_not_active_file_drives_size_warning(self):
  for i in range(129):self.seal(size=8388608)
  s=self.inspect();self.assertEqual((self.d/'gateway-v1.jsonl').stat().st_size,0);self.assertGreater(s['bytes'],1073741824);self.assertTrue(any('размер источника' in x for x in self.assess(s)['warnings']))
 def test_active_opened_at_comes_from_manifest_not_mtime(self):
  active=self.d/'gateway-v1.jsonl';manifest=self.s/'manifest.json';good=manifest.read_bytes();opened=NOW-7200000;self.manifest['active']['openedAt']=opened;self.write(manifest,self.manifest,0o600)
  before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(manifest.read_bytes()).hexdigest();self.assertNotEqual(before,after);self.assertEqual(json.loads(manifest.read_bytes())['active']['openedAt'],opened)
  self.assertEqual(subprocess.check_output(['grep','-cF','"openedAt": '+str(opened),str(manifest)],text=True).strip(),'1');print('OPENED-AT-PORCHA JSONopenedAt='+str(opened)+' grepF=1 SHA='+before+'->'+after,flush=True)
  os.utime(active,ns=((NOW-600000)*1000000,(NOW-600000)*1000000));self.assertEqual(active.stat().st_mtime_ns,(NOW-600000)*1000000);self.assertEqual(self.inspect().get('activeOpenedAt'),opened)
  os.utime(active,ns=(NOW*1000000,NOW*1000000));self.assertEqual(active.stat().st_mtime_ns,NOW*1000000);self.assertEqual(self.inspect().get('activeOpenedAt'),opened)
  manifest.write_bytes(good);self.manifest=json.loads(good);self.assertEqual(self.inspect().get('activeOpenedAt'),NOW)
 def test_rotation_age_uses_first_record_policy_grace_and_ignores_empty_active(self):
  active=self.d/'gateway-v1.jsonl';self.manifest['active']['openedAt']=NOW-7200000;self.write(self.s/'manifest.json',self.manifest,0o600)
  self.assertFalse(self.assess(self.inspect()).get('rotationLagging'));self.assertIsNone(self.inspect().get('firstObservedAt'))
  for age,expected in [(60000,False),(7200000,True),(4500000,False),(4500001,True),(0,False)]:
   active.write_text(json.dumps(dict(observedAt=NOW-age))+'\n'+json.dumps(dict(observedAt=NOW))+'\n');snap=self.inspect()
   self.assertEqual(snap.get('firstObservedAt'),NOW-age);self.assertIs(self.assess(snap).get('rotationLagging'),expected)
  active.write_text(json.dumps(dict(observedAt=NOW-3600000))+'\n');snap=self.inspect()
  self.assertTrue(self.m.assess(snap,dict(POLICY,segmentMaxAgeSeconds=1800),NOW).get('rotationLagging'));self.assertFalse(self.m.assess(snap,dict(POLICY,segmentMaxAgeSeconds=7200),NOW).get('rotationLagging'))
 def test_first_record_invalid_or_unbounded_is_blind_then_restore(self):
  active=self.d/'gateway-v1.jsonl';good=b'{"observedAt": 1800000000000}\n';active.write_bytes(good);self.assertFalse(self.assess(self.inspect())['rotationLagging'])
  for raw in [b'{}\n',b'{"observedAt":true}\n',b'{"observedAt":1800000000001}\n',b'{"observedAt":1,"observedAt":2}\n',b'{"observedAt":1}',b'x'*65537+b'\n',b'[]\n',b'\xff\n']:
   active.write_bytes(raw)
   with self.subTest(raw=raw[:40]),self.assertRaises(self.m.Blind):self.inspect()
   active.write_bytes(good);self.assertFalse(self.assess(self.inspect())['rotationLagging'])
 def test_first_record_actual_fd_read_never_exceeds_policy_budget(self):
  active=self.d/'gateway-v1.jsonl';active.write_bytes(b'{"observedAt":1800000000000}\n'+b' '*100000);positions=[];close=os.close
  def measured_close(fd):
   if os.readlink('/proc/self/fd/'+str(fd))==str(active):positions.append(os.lseek(fd,0,os.SEEK_CUR))
   return close(fd)
  with mock.patch.object(self.m.os,'close',side_effect=measured_close):
   self.m.inspect_source(self.d,os.getuid(),dict(POLICY,maxRecordBytes=64),NOW)
  self.assertTrue(positions);self.assertLessEqual(max(positions),65,positions)
 def test_first_record_uses_active_security_guards(self):
  active=self.d/'gateway-v1.jsonl';active.write_bytes(b'{"observedAt":1800000000000}\n');active.chmod(0o644)
  with self.assertRaises(self.m.Unsafe):self.inspect()
  active.chmod(0o600);self.assertEqual(self.inspect().get('firstObservedAt'),NOW)
  if os.getuid()==0:
   os.chown(active,65534,-1)
   with self.assertRaises(self.m.Unsafe):self.inspect()
   os.chown(active,0,-1);self.assertEqual(self.inspect().get('firstObservedAt'),NOW)
 def test_policy_schema_three_validation(self):
  self.assertEqual(self.m.validate_policy(POLICY),POLICY)
  for fields in [dict(POLICY,schemaVersion=1),dict(POLICY,maxRecordBytes=True),dict(POLICY,extra=1),dict(POLICY,segmentMaxBytes=1)]:
   with self.assertRaises(self.m.Blind):self.m.validate_policy(fields)
 def test_writer_schema3_requires_exact_five_limits_and_rejects_old2(self):
  try:result=self.m.validate_policy(POLICY)
  except self.m.Blind as error:self.fail('writer schema3 refused: '+str(error))
  self.assertEqual(result,POLICY)
  for fields in [dict(POLICY,schemaVersion=2),dict(POLICY,schemaVersion=3.0),dict(POLICY,directoryWarnBytes=1),dict(POLICY,closedCountWarn=1),dict(POLICY,directoryWarnBytes=1,closedCountWarn=1)]:
   with self.subTest(fields=fields),self.assertRaises(self.m.Blind):self.m.validate_policy(fields)
  self.assertEqual(self.m.assess(self.inspect(),POLICY,NOW)['byteWarnAbove'],1073741824)
 def test_rate_uses_retained_closed_seals_in_seven_day_window_without_state(self):
  self.seal(NOW-7*DAY,size=100);self.seal(NOW-7*DAY+1,size=200);self.seal(NOW-3600000,size=300)
  s=self.inspect();self.assertEqual(s.get('closedBytes7d'),500);self.assertEqual(s.get('closedCount7d'),2);self.assertAlmostEqual(s.get('rateBytesPerSecond'),500/604800)
  # A GC removing the expired prefix must not erase the rate of retained seals.
  old=self.manifest['segments'].pop(0);self.manifest['retainedFrom']=1;self.manifest['deletedMaxObservedAt']=old['generations'][0]['maxObservedAt'];self.write(self.s/'manifest.json',self.manifest,0o600)
  for name in [old['file'],old['file'].replace('.jsonl','.seal.json')]:(self.s/name).unlink()
  self.assertEqual(self.inspect().get('closedBytes7d'),500)
 def test_thresholds_are_fixed_while_rate_and_source_age_change(self):
  self.seal(NOW-3600000,size=100);s=self.inspect();a=self.assess(s);self.assertEqual((a['fileWarnAbove'],a['byteWarnAbove']),(676,1073741824))
  self.seal(NOW,size=1000);s=self.inspect();self.assertEqual(self.assess(s)['byteWarnAbove'],1073741824);self.assertTrue(self.assess(s)['startupThreshold']);self.assertEqual(self.assess(s).get('thresholdStage'),'стартовые')
 def test_gc_grace_remains_an_hour_when_rotation_interval_changes(self):
  self.seal(NOW-7*DAY-45*60000);s=self.inspect();p=dict(POLICY,segmentMaxAgeSeconds=1800)
  self.assertFalse(any('GC отстаёт' in x for x in self.m.assess(s,p,NOW)['warnings']))
 def test_hourly_reference_is_separate_from_growth_alarm(self):
  snapshot=self.inspect();result=self.assess(snapshot);self.assertEqual(snapshot.get('sourceFiles'),4);self.assertEqual(result.get('hourlyExpectedFiles'),344);self.assertEqual(result.get('growthWarnings'),[]);self.assertFalse(result.get('gcLagging'))
 def test_oldest_closed_segment_alone_drives_gc_lag(self):
  self.seal(NOW-7*DAY-3600001);result=self.assess(self.inspect());self.assertTrue(result.get('gcLagging'));self.assertEqual(result.get('growthWarnings'),[]);self.assertTrue(any('GC отстаёт' in x for x in result['warnings']))
if __name__=='__main__':unittest.main()
