"""Actual pinned segment writer, temporary HOME and the real nightly contract row."""
import contextlib,hashlib,importlib.util,io,json,os,shutil,subprocess,tempfile,time,unittest
from pathlib import Path
import test_g_live_contract as live
from unittest import mock

HERE=Path(__file__).resolve().parent
FIXTURE=HERE/'fixtures/g-producer-25d8'
COMMIT='25d8092059192ee3a456d99fd7e91123955d21cb'
OWNER_SCRIPT=r'''
import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const source=process.argv[1],home=process.argv[2];let now=Date.now();Date.now=()=>now;
const p=await import(pathToFileURL(source).href),s=await import(pathToFileURL(source.replace('usage-producer.mjs','usage-segments.mjs')).href);
const file=p.prepareGatewayUsage({provider:'openai',env:{CODEX_HOME:home}});
if(!file)throw Error('prepare refused');
const anchor=()=>JSON.parse(fs.readFileSync(file+'.source.json','utf8'));
const before=anchor();s.appendGatewaySegment(file,JSON.stringify({schemaVersion:1,generation:'owner-case',seq:1,observedAt:now,kind:'watermark'})+'\n');
now+=3600001;s.maintainGatewaySegments(file);s.closeGatewaySegments(file);
if(p.prepareGatewayUsage({provider:'openai',env:{CODEX_HOME:home}})!==file)throw Error('restart refused');
const after=anchor();s.closeGatewaySegments(file);process.stdout.write(JSON.stringify({file,before,after,now}));
'''

class SegmentWriterContract(unittest.TestCase):
 def setUp(self):
  origin=json.loads((FIXTURE/'SOURCE.json').read_bytes());self.assertEqual(origin['commit'],COMMIT)
  self.assertEqual(hashlib.sha256((FIXTURE/'usage-limits.json').read_bytes()).hexdigest(),'84d88b527afbc003f5931e90b1c43cd1be134e5c8d982773b4b1edde2282e0d4','policy differs from approved writer25d80920 golden blob')
  self.assertEqual({x['path'] for x in origin['files']},{'usage-producer.mjs','usage-segments.mjs','usage-limits.json','engine-process.mjs'})
  for entry in origin['files']:self.assertEqual(hashlib.sha256((FIXTURE/entry['path']).read_bytes()).hexdigest(),entry['sha256'])
  spec=importlib.util.spec_from_file_location('writer_contract',HERE/'g-source-contract.py');self.c=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.c)
 def test_real_segment_prepare_table_matches_full_metadata_predicate(self):
  output=io.StringIO()
  with contextlib.redirect_stdout(output):result=self.c.run(producer=FIXTURE/'usage-producer.mjs')
  print(output.getvalue(),end='');self.assertEqual(result,0,output.getvalue());self.assertIn('56 из 56 · расхождений 0',output.getvalue())
 def test_real_rotation_and_reopen_keep_birth_and_match_monitor(self):
  with tempfile.TemporaryDirectory(prefix='g-segment-owner-') as temp:
   home=Path(temp);q=subprocess.run([shutil.which('node'),'--input-type=module','-e',OWNER_SCRIPT,str(FIXTURE/'usage-producer.mjs'),str(home)],env={'PATH':os.defpath,'HOME':str(home),'CODEX_HOME':str(home)},capture_output=True,text=True,timeout=10);self.assertEqual(q.returncode,0,q.stdout+q.stderr);result=json.loads(q.stdout)
   before,after=result['before'],result['after'];self.assertEqual(before,after);self.assertIs(type(after['sourceCreatedAt']),int)
   anchor=home/'.usage-meter/gateway-v1.jsonl.source.json';self.assertEqual(json.loads(anchor.read_bytes()),after);self.assertEqual(subprocess.check_output(['stat','-c','%a',str(anchor)],text=True).strip(),'400')
   stand=self.c.load_stand(HERE/'stend-g-journal-size.py');policy=stand.writer_policy(FIXTURE/'usage-producer.mjs');module=stand.segment_module();snapshot=module.inspect_source(home/'.usage-meter',os.getuid(),policy,result['now']);self.assertEqual(snapshot['closedSegments'],1);self.assertEqual(snapshot['segmentFiles'],4);self.assertEqual(snapshot['activeNo'],1);self.assertEqual(snapshot['sourceCreatedAt'],after['sourceCreatedAt']);self.assertEqual(module.assess(snapshot,policy,result['now'])['warnings'],[])
   print('ACTUAL-OWNER birth='+str(after['sourceCreatedAt'])+' closed=1 activeNo=1 files=4 anchorMode=400',flush=True)
 def test_actual_anchor_missing_birth_is_refused_then_restored(self):
  with tempfile.TemporaryDirectory(prefix='g-real-birth-') as temp:
   home=Path(temp);script="import {pathToFileURL} from 'node:url';const p=await import(pathToFileURL(process.argv[1]).href);const file=p.prepareGatewayUsage({provider:'openai',env:{CODEX_HOME:process.argv[2]}});process.stdout.write(JSON.stringify({file}));"
   def prepare():
    q=subprocess.run([shutil.which('node'),'--input-type=module','-e',script,str(FIXTURE/'usage-producer.mjs'),str(home)],env={'PATH':os.defpath,'HOME':str(home),'CODEX_HOME':str(home)},capture_output=True,text=True,timeout=10);self.assertEqual(q.returncode,0,q.stdout+q.stderr);return json.loads(q.stdout)['file']
   file=home/'.usage-meter/gateway-v1.jsonl';self.assertEqual(prepare(),str(file));anchor=file.with_name(file.name+'.source.json');good=anchor.read_bytes();value=json.loads(good);birth=value.pop('sourceCreatedAt');anchor.write_text(json.dumps(value));anchor.chmod(0o400);self.assertNotIn('sourceCreatedAt',json.loads(anchor.read_bytes()));before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(anchor.read_bytes()).hexdigest();self.assertNotEqual(before,after);print('ACTUAL-BIRTH-PORCHA removed=sourceCreatedAt value='+str(birth)+' SHA='+before+'->'+after,flush=True)
   self.assertIsNone(prepare());stand=self.c.load_stand(HERE/'stend-g-journal-size.py');policy=stand.writer_policy(FIXTURE/'usage-producer.mjs');module=stand.segment_module()
   with self.assertRaisesRegex(module.Blind,'source.json'):module.inspect_source(file.parent,os.getuid(),policy,time.time_ns()//1000000)
   anchor.write_bytes(good);anchor.chmod(0o400);self.assertEqual(prepare(),str(file));snapshot=module.inspect_source(file.parent,os.getuid(),policy,time.time_ns()//1000000);self.assertEqual(snapshot['sourceCreatedAt'],birth);self.assertEqual(module.assess(snapshot,policy,time.time_ns()//1000000)['warnings'],[])
 def test_writer_candidate_real_mainpid_has_three_independent_rows(self):
  with tempfile.TemporaryDirectory(prefix='g-candidate-owner-') as temp:
   root=Path(temp);code=root/'code';code.mkdir();home=root/'home';home.mkdir();ready=root/'ready.json'
   for name in ['usage-producer.mjs','usage-segments.mjs','usage-limits.json','engine-process.mjs']:shutil.copyfile(FIXTURE/name,code/name)
   entry=code/'gateway.mjs';entry.write_text("import fs from 'node:fs';import {prepareGatewayUsage} from './usage-producer.mjs';import {appendGatewaySegment,prepareGatewaySegments} from './usage-segments.mjs';const file=prepareGatewayUsage({provider:'openai'});if(!file)throw Error('prepare refused');for(let seq=1;seq<=174;seq++){appendGatewaySegment(file,JSON.stringify({schemaVersion:1,generation:'candidate-owner',seq,observedAt:Date.now(),kind:'watermark'})+'\\n');prepareGatewaySegments(file).seal();}fs.writeFileSync("+json.dumps(str(ready))+",JSON.stringify({file,anchor:JSON.parse(fs.readFileSync(file+'.source.json','utf8'))}));setInterval(()=>{},1000);\n")
   earliest_birth=time.time_ns()//1000000
   child=subprocess.Popen([shutil.which('node'),str(entry)],env={'PATH':os.defpath,'HOME':str(home),'CODEX_HOME':str(home),'GATEWAY_POSTAVSHIK':'openai'})
   try:
    deadline=time.monotonic()+10
    while not ready.exists() and time.monotonic()<deadline:time.sleep(0.01)
    self.assertTrue(ready.is_file(),'actual candidate writer did not initialize');owner=json.loads(ready.read_bytes());anchor=Path(owner['file']+'.source.json');birth_bytes=anchor.read_bytes();self.assertEqual(json.loads(birth_bytes),owner['anchor']);self.assertIs(type(owner['anchor']['sourceCreatedAt']),int);self.assertLessEqual(earliest_birth,owner['anchor']['sourceCreatedAt']);self.assertLessEqual(owner['anchor']['sourceCreatedAt'],time.time_ns()//1000000)
    actual_files=subprocess.check_output(['rg','--files','--hidden','--no-ignore',str(home/'.usage-meter')],text=True).splitlines();self.assertEqual(len(actual_files),352);self.assertGreater(len(actual_files),344);print('ACTUAL-OWNER-FORCED-SEALS files='+str(len(actual_files))+' closed=174 reference344 below alarm676',flush=True)
    binary=root/'bin';binary.mkdir();ctl=binary/'systemctl';unit='coder-gateway-candidate-owner.service';ctl.write_text('#!/usr/bin/python3\nimport sys\nif sys.argv[1]=="list-units":print('+repr(unit+' loaded active running probe')+')\nelse:print('+repr('Id='+unit+'\nMainPID='+str(child.pid))+')\n');ctl.chmod(0o755)
    def invoke(expected):
     q=subprocess.run([shutil.which('python3'),'-B',str(HERE/'stend-g-journal-size.py')],env={**os.environ,'PATH':str(binary)+':'+os.environ['PATH']},capture_output=True,text=True,timeout=5);print(q.stdout,flush=True);self.assertEqual(q.returncode,expected,q.stdout+q.stderr);gc=next(x for x in q.stdout.splitlines() if x.startswith('STEND-G-METRIC: GC · '));growth=next(x for x in q.stdout.splitlines() if x.startswith('STEND-G-METRIC: G '));info=next(x for x in q.stdout.splitlines() if x.startswith('STEND-G-METRIC: СПРАВКА · '));self.assertIn('ожидаемо при закрытии по часу: 344',info)
     for marker in ['FAIL','ЗЕЛЁНОЕ','ЖЁЛТОЕ','КРАСНОЕ','\x1b']:self.assertNotIn(marker,info)
     return gc,growth
    gc,growth=invoke(0);self.assertIn('ЗЕЛЁНОЕ',gc);self.assertIn('ЗЕЛЁНОЕ',growth)
    manifest=home/'.usage-meter/segments/manifest.json';good=manifest.read_bytes();m=json.loads(good);seal=manifest.parent/m['segments'][0]['file'].replace('.jsonl','.seal.json');good_seal=seal.read_bytes();old=time.time_ns()//1000000-7*86400000-3600001;m['segments'][0]['closedAt']=old;manifest.write_text(json.dumps(m));seal.write_text(json.dumps(m['segments'][0]));self.assertEqual(json.loads(manifest.read_bytes())['segments'][0]['closedAt'],old);self.assertEqual(json.loads(seal.read_bytes())['closedAt'],old);self.assertNotEqual(hashlib.sha256(good).hexdigest(),hashlib.sha256(manifest.read_bytes()).hexdigest());print('APPROVED-OWNER-PORCHA closedAt='+str(old)+' SHA='+hashlib.sha256(good).hexdigest()+'->'+hashlib.sha256(manifest.read_bytes()).hexdigest(),flush=True)
    gc,growth=invoke(1);self.assertIn('GC отстаёт',gc);self.assertIn('ЖЁЛТОЕ',gc);self.assertIn('ЗЕЛЁНОЕ',growth);manifest.write_bytes(good);seal.write_bytes(good_seal);self.assertEqual(anchor.read_bytes(),birth_bytes);invoke(0)
   finally:
    child.terminate()
    try:child.wait(timeout=2)
    except subprocess.TimeoutExpired:child.kill();child.wait(timeout=2)
 def test_real_nightly_row_catches_weaker_segment_writer_and_return(self):
  e=live.LiveContract();e.setUp()
  try:
   code=e.add('segment-night')
   for name in ['usage-producer.mjs','usage-segments.mjs','usage-limits.json','engine-process.mjs']:shutil.copyfile(FIXTURE/name,code/name)
   # Actual AP0516 exports the two independently checked schema3 limits.
   e.segment_ap();q=e.night();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('G_WRITER_LIMIT',q.stdout);self.assertIn('G_RECORD_ALLOWANCE',q.stdout)
   changes=[('usage-producer.mjs',b'(info.mode&0o777)!==0o600',b'![0o600,0o644].includes(info.mode&0o777)'),('usage-segments.mjs',b'(s.mode&0o777)!==mode',b'(mode===0o600?![0o600,0o644].includes(s.mode&0o777):(s.mode&0o777)!==mode)')];saved={}
   for name,old,new in changes:
    file=code/name;good=file.read_bytes();self.assertEqual(good.count(old),1);saved[name]=good;file.write_bytes(good.replace(old,new,1));self.assertEqual(subprocess.check_output(['grep','-cF',new.decode(),str(file)],text=True).strip(),'1');before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(file.read_bytes()).hexdigest();self.assertNotEqual(before,after);print('SEGMENT-WRITER-PORCHA '+name+' replacements=1 grep-cF=1 SHA='+before+'->'+after,flush=True)
   q=e.night();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('FAIL КРАСНОЕ openai/0700/0644',q.stdout);self.assertIn('FAIL КРАСНОЕ anthropic/0700/0644',q.stdout);self.assertIn(str(code/'usage-producer.mjs'),q.stdout);self.assertIn('openai/0700/0644',e.causes(q.stdout))
   for name,good in saved.items():(code/name).write_bytes(good);self.assertEqual(hashlib.sha256((code/name).read_bytes()).digest(),hashlib.sha256(good).digest())
   q=e.night();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('56 из 56',q.stdout)
  finally:e.doCleanups()
 def test_segment_helper_drift_during_live_contract_is_blind_then_return(self):
  e=live.LiveContract();e.setUp()
  try:
   code=e.add('segment-drift')
   for name in ['usage-producer.mjs','usage-segments.mjs','usage-limits.json','engine-process.mjs']:shutil.copyfile(FIXTURE/name,code/name)
   e.segment_ap();self.c.AP_ROOT=e.ap;helper=code/'usage-segments.mjs';good=helper.read_bytes();original=self.c.run;changed=[]
   def invoke():
    output=io.StringIO()
    with mock.patch.dict(os.environ,e.env),contextlib.redirect_stdout(output):result=self.c.check_live()
    print(output.getvalue(),end='');return result,output.getvalue()
   self.assertEqual(invoke()[0],0)
   def mutate_after_real_cases(**kwargs):
    result=original(**kwargs);self.assertEqual(result,0);helper.write_bytes(good+b"\nthrow Error('REVIEW_DEPENDENCY_CHANGED');\n");before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(helper.read_bytes()).hexdigest();self.assertNotEqual(before,after);self.assertEqual(subprocess.check_output(['grep','-cF','REVIEW_DEPENDENCY_CHANGED',str(helper)],text=True).strip(),'1');changed.append(True);print('HELPER-DRIFT-PORCHA replacements=1 grep-cF=1 SHA='+before+'->'+after,flush=True);return result
   try:
    with mock.patch.object(self.c,'run',side_effect=mutate_after_real_cases):result,output=invoke()
    self.assertTrue(changed);self.assertEqual(result,2,output);self.assertIn('измен',output);self.assertIn(str(code/'usage-producer.mjs'),output)
   finally:helper.write_bytes(good)
   self.assertEqual(invoke()[0],0)
  finally:e.doCleanups()

if __name__=='__main__':unittest.main()
