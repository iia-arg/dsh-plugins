"""Live-path contract on actual dummy MainPIDs, actual producer and private nightly row."""
import contextlib,importlib.util,io,hashlib,json,os,shutil,subprocess,sys,tempfile,time,unittest
from pathlib import Path
from unittest import mock
HERE=Path(__file__).resolve().parent;PKG=HERE.parent;SCRIPT=HERE/'g-source-contract.py';WRAPPER=HERE/'stend-g-source-contract.py'
class LiveContract(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='g-live-contract-');self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.children=[];self.addCleanup(self.stop)
  self.ap_install=self.root/'ap-install';self.ap=self.ap_install/'fixture-release';(self.ap/'skill/tools').mkdir(parents=True);(self.ap_install/'current').symlink_to('fixture-release',target_is_directory=True);self.ap_module=self.ap/'skill/tools/usage_registration.py';self.ap_module.write_text('import sys\nassert sys.flags.isolated and sys.flags.dont_write_bytecode\nG_WRITER_LIMIT=sum((1<<26,1<<26))\n')
  self.bin=self.root/'bin';self.bin.mkdir();self.config=self.root/'units.json';self.config.write_text('{}')
  ctl=self.bin/'systemctl';ctl.write_text("#!/usr/bin/python3\nimport json,sys\nk=json.load(open("+repr(str(self.config))+"))\na=sys.argv[1:]\nif a[0]=='list-units':\n for u in k:print(u+' loaded active running fixture')\nelif a[0]=='show':print('Id='+a[1]+'\\nMainPID='+str(k[a[1]]))\nelse:sys.exit(3)\n");ctl.chmod(0o755)
  self.env={**os.environ,'PATH':str(self.bin)+':'+os.environ['PATH'],'PYTHONDONTWRITEBYTECODE':'1'};self.units={}
 def stop(self):
  for p in self.children:
   p.terminate()
   try:p.wait(timeout=2)
   except subprocess.TimeoutExpired:p.kill();p.wait(timeout=2)
 def add(self,name,provider='openai',producer=True,code=None):
  code=code or self.root/name;code.mkdir(exist_ok=True);entry=code/'gateway.mjs';entry.write_text('setInterval(()=>{},1000);\n')
  if producer:
   for n in ['usage-producer.mjs','engine-process.mjs','usage-limits.json']:shutil.copyfile(HERE/'fixtures/g-producer-359a'/n,code/n)
  home=self.root/(name+'-home');home.mkdir();node=shutil.which('node');self.assertIsNotNone(node)
  p=subprocess.Popen([node,str(entry)],env={'PATH':os.defpath,'GATEWAY_POSTAVSHIK':provider,'HOME':str(home),'CODEX_HOME':str(home)});self.children.append(p)
  self.units['coder-gateway-'+name+'.service']=p.pid;self.config.write_text(json.dumps(self.units));return code
 def segment_ap(self,allowance=65536):
  fixture=HERE/'fixtures/ap-limits-0516';origin=json.loads((fixture/'SOURCE.json').read_bytes());self.assertEqual(origin['commit'],'0516b410a1d9c7531f209a0f8259fbe086e46d99')
  for entry in origin['files']:
   file=fixture/entry['path'];self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(),entry['sha256']);shutil.copyfile(file,self.ap_module.with_name(entry['path']))
  limits=self.ap_module.with_name('usage-reader-limits.json');data=json.loads(limits.read_bytes());data['recordAllowanceBytes']=allowance;limits.write_text(json.dumps(data));return limits
 def segment(self,name,record=65536):
  code=self.add(name)
  for file in ['usage-producer.mjs','usage-segments.mjs','usage-limits.json','engine-process.mjs']:shutil.copyfile(HERE/'fixtures/g-producer-25d8'/file,code/file)
  limits=code/'usage-limits.json';data=json.loads(limits.read_bytes());data['maxRecordBytes']=record
  limits.write_text(json.dumps(data));return code
 def isolated_ap(self,command):
  return ['bwrap','--die-with-parent','--ro-bind','/','/','--ro-bind',str(self.ap_install),'/opt/autopilot','--dev','/dev','--tmpfs','/tmp','--bind',str(self.root),str(self.root),'--tmpfs','/var/tmp','--tmpfs','/run','--unshare-net',*command]
 def invoke(self,script=SCRIPT):
  q=subprocess.run(self.isolated_ap([sys.executable,'-B',str(script)]),env=self.env,capture_output=True,text=True,timeout=100);print(q.stdout,flush=True);return q
 def causes(self,output):
  source=(PKG/'dorabotki/vse-stendy-boevye.sh').read_text();a=source.index('korotkaya_prichina() {');short=source[a:source.index('est_fajl()',a)]
  a=source.index('      pr=$(awk -v MAXP=5');reader=source[a:source.index('      # A-N-965',a)]
  q=subprocess.run(['bash','-c',short+'\nout=$1\n'+reader+'\nprintf \'%s\\n\' "$pr"','_',output],capture_output=True,text=True,check=True);return q.stdout
 def night(self):
  source=(PKG/'dorabotki/vse-stendy-boevye.sh').read_text()
  def block(a,b):return source[source.index(a):source.index(b,source.index(a))]
  defs=next(x for x in source.splitlines() if x.startswith('est_fajl()'))+'\n'+block('stendy_kataloga() {','# B-N-1412: стенды-файлы')+'\n'+next(x for x in source.splitlines() if x.startswith('bez_otdelnyh()'))+'\n'+block('razobrat_oblast() {','oblasti=()')+'\n'+next(x for x in source.splitlines() if x.startswith('predel_stenda()'))+'\n'+block('prognat_stend() (','medlennye=()')
  a=source.index('    case "$s" in',source.index('    progress running "$s"'));case=source[a:source.index('    esac',a)+len('    esac')]
  runner=self.root/'night-row.sh';runner.write_text(defs+\
   '\nOTDELNYE=""; PREDEL_STENDOV=""; S2_N=1; pk=dsh-obhod-stendov; zapusk=(env); sreda=(); dovody=()\n'\
   's2_obertka() { shift; "$@"; }\n'\
   'o=$(razobrat_oblast "$1") || exit 2\nIFS=$\'\\t\' read -r shablon kto app <<< "$o"\n'\
   '[ "$kto" = root ] && [ "$(id -u)" = 0 ] || exit 2\n'\
   'mapfile -t selected < <(stendy_kataloga "$shablon")\n[ "${#selected[@]}" = 1 ] || exit 2\ns="${selected[0]}"\n'+case+'\nprintf \'%s\\n\' "$out"\nexit "$k"\n')
  row=next(x for x in source.splitlines() if x.endswith('/test/stend-g-source-contract.py @root /opt/iskra/app'));row=row.replace('/opt/iskra/workspace/dsh-plugins/packages/dsh-obhod-stendov',str(PKG),1)
  q=subprocess.run(self.isolated_ap(['bash',str(runner),row]),env=self.env,capture_output=True,text=True,timeout=100);print(q.stdout,flush=True);return q
 def legacy316(self,name):
  code=self.add(name);fixture=HERE/'fixtures/g-producer-316'
  for file in ['usage-producer.mjs','engine-process.mjs']:shutil.copyfile(fixture/file,code/file)
  (code/'usage-limits.json').unlink();return code
 def test_legacy316_checks_AP_limit_but_has_no_initializer_subject(self):
  code=self.legacy316('legacy316');q=self.night();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('нет предмета',q.stdout);self.assertIn('3.1.6',q.stdout);self.assertIn(str(code/'usage-producer.mjs'),q.stdout);self.assertIn('AP=134217728',q.stdout);self.assertNotIn('56 из 56',q.stdout);self.assertNotIn('СЛЕПОТА',q.stdout)
 def test_legacy316_AP_limit_mismatch_red_and_return(self):
  code=self.legacy316('legacy-budget');good=self.ap_module.read_bytes();self.assertEqual(self.night().returncode,0);bad=good+b'G_WRITER_LIMIT=67108864\n';self.ap_module.write_bytes(bad);self.assertNotEqual(hashlib.sha256(good).digest(),hashlib.sha256(bad).digest());self.assertEqual(subprocess.check_output(['grep','-cF','G_WRITER_LIMIT=67108864',str(self.ap_module)],text=True).strip(),'1');print('LEGACY-AP-PORCHA append=1 grep-cF=1 SHA='+hashlib.sha256(good).hexdigest()+'->'+hashlib.sha256(bad).hexdigest(),flush=True)
  q=self.night();self.assertEqual(q.returncode,1,q.stdout+q.stderr)
  for value in ['FAIL КРАСНОЕ','67108864','134217728',str(code/'usage-producer.mjs'),'G_WRITER_LIMIT']:self.assertIn(value,q.stdout)
  self.ap_module.write_bytes(good);self.assertEqual(self.night().returncode,0)
 def test_new_initializer_missing_policy_stays_blind_and_returns(self):
  code=self.add('modern-policy');file=code/'usage-limits.json';good=file.read_bytes();self.assertEqual(self.night().returncode,0);file.unlink();self.assertFalse(file.exists());print('MODERN-POLICY-PORCHA removed='+str(file)+' SHA-before='+hashlib.sha256(good).hexdigest(),flush=True);q=self.night();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('usage-limits.json',q.stdout);self.assertIn(str(code),q.stdout);file.write_bytes(good);self.assertEqual(self.night().returncode,0)
 def test_real_nightly_row_detects_live_producer_change_and_return(self):
  code=self.add('night');source=code/'usage-producer.mjs';good=source.read_bytes();self.assertEqual(self.night().returncode,0)
  old=b'(info.mode&0o777)!==0o600';new=b'![0o600,0o644].includes(info.mode&0o777)';self.assertEqual(good[:good.index(b'const queue=')].count(old),1);source.write_bytes(good.replace(old,new,1));before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(source.read_bytes()).hexdigest();self.assertNotEqual(before,after);self.assertEqual(subprocess.check_output(['grep','-cF',new.decode(),str(source)],text=True).strip(),'1');print('NIGHT-PRODUCER-PORCHA replacements=1 grep-cF=1 SHA='+before+'->'+after,flush=True)
  q=self.night();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('FAIL КРАСНОЕ openai/0700/0644',q.stdout);self.assertIn(str(source),q.stdout)
  # Existing nightly reader's cause selector must retain the case and source.
  selected=self.causes(q.stdout);self.assertIn('openai/0700/0644',selected);self.assertIn(str(source),selected)
  source.write_bytes(good);self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),before);q=self.night();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
 def test_foreign_owned_0750_build_stays_readable_after_capability_drop(self):
  code=self.add('closed-build');os.chown(code,1,1);code.chmod(0o750)
  self.assertEqual(code.stat().st_mode&0o777,0o750);self.assertEqual(code.stat().st_uid,1)
  q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  self.assertIn('56 из 56',q.stdout);self.assertNotIn('СЛЕПОТА',q.stdout)
 def test_foreign_owned_build_binds_child_capture_import_closure(self):
  code=self.add('closed-child');source=code/'usage-producer.mjs';source.write_text("import './child-capture.mjs';\n"+source.read_text())
  (code/'child-capture.mjs').write_text("import './source-version.mjs';\n")
  (code/'source-version.mjs').write_text("import fs from 'node:fs'; JSON.parse(fs.readFileSync(new URL('./child-source-versions.json',import.meta.url),'utf8'));\n")
  (code/'child-source-versions.json').write_text('{"schemaVersion":1,"supported":[]}\n')
  os.chown(code,1,1);code.chmod(0o750)
  q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('56 из 56',q.stdout)
 def test_broken_import_names_error_in_first_300_stderr_bytes(self):
  code=self.add('missing-import');source=code/'usage-producer.mjs';good=source.read_bytes();bad=b"import './MISSING-contract-import.mjs';\n"+good
  source.write_bytes(bad);self.assertNotEqual(hashlib.sha256(good).hexdigest(),hashlib.sha256(source.read_bytes()).hexdigest())
  self.assertEqual(subprocess.check_output(['grep','-cF',"MISSING-contract-import.mjs",str(source)],text=True).strip(),'1')
  print('IMPORT-PORCHA replacements=1 grep-cF=1 SHA='+hashlib.sha256(good).hexdigest()+'->'+hashlib.sha256(source.read_bytes()).hexdigest(),flush=True)
  q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  self.assertIn('ERR_MODULE_NOT_FOUND',q.stdout);self.assertIn('MISSING-contract-import.mjs',q.stdout)
  cause=self.causes(q.stdout);self.assertIn('ERR_MODULE_NOT_FOUND',cause);self.assertIn('MISSING-contract-import.mjs',cause)
  source.write_bytes(good);self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),hashlib.sha256(good).hexdigest());self.assertEqual(self.invoke().returncode,0)
 def test_node_stderr_is_cut_at_300_bytes_before_utf8_decode(self):
  code=self.add('stderr-bytes');source=code/'usage-producer.mjs';good=source.read_bytes()
  source.write_bytes("process.stderr.write('Ж'.repeat(151)+'STDERR-TAIL-MUST-NOT-LEAK');process.exit(7);\n".encode()+good)
  self.assertNotEqual(hashlib.sha256(good).hexdigest(),hashlib.sha256(source.read_bytes()).hexdigest())
  self.assertEqual(subprocess.check_output(['grep','-cF','STDERR-TAIL-MUST-NOT-LEAK',str(source)],text=True).strip(),'1')
  print('STDERR-PORCHA replacements=1 grep-cF=1 SHA='+hashlib.sha256(good).hexdigest()+'->'+hashlib.sha256(source.read_bytes()).hexdigest(),flush=True)
  q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  self.assertIn('Node завершился с 7: '+'Ж'*150,q.stdout);self.assertNotIn('Ж'*151,q.stdout);self.assertNotIn('STDERR-TAIL-MUST-NOT-LEAK',q.stdout)
  source.write_bytes(good);self.assertEqual(self.invoke().returncode,0)
 def test_shared_build_is_once_and_nonstandard_producer_is_independent(self):
  main=self.add('one');self.add('two',code=main);other=self.add('other','anthropic')
  q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(q.stdout.count('56 из 56'),2)
  for name in ['one','two','other']:self.assertIn('coder-gateway-'+name+'.service',q.stdout)
  self.assertIn(str(main/'usage-producer.mjs'),q.stdout);self.assertIn(str(other/'usage-producer.mjs'),q.stdout);self.assertIn('сборок с producer 2 · проверено 2',q.stdout)
 def pair_n_plus_one(self,field,export,before_value,after_value):
  allowance=65535 if field=='maxRecordBytes' else 65536;self.segment_ap(allowance);code=self.segment('two-limits',record=allowance);limits=code/'usage-limits.json';good=limits.read_bytes();self.assertEqual(json.loads(good)[field],before_value);q=self.night();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  data=json.loads(good);data[field]=after_value;limits.write_text(json.dumps(data,sort_keys=True));self.assertEqual(subprocess.check_output(['grep','-cF','"'+field+'": '+str(after_value),str(limits)],text=True).strip(),'1');old=hashlib.sha256(good).hexdigest();new=hashlib.sha256(limits.read_bytes()).hexdigest();self.assertNotEqual(old,new);print('TWO-LIMITS-PORCHA '+field+' replacements=1 grep-cF=1 SHA='+old+'->'+new,flush=True)
  q=self.night();self.assertEqual(q.returncode,1,q.stdout+q.stderr);cause=self.causes(q.stdout)
  for value in [field,export,str(before_value),str(after_value),'/opt/autopilot/current/skill/tools/usage_registration.py',str(limits)]:self.assertIn(value,cause)
  limits.write_bytes(good);self.assertEqual(hashlib.sha256(limits.read_bytes()).hexdigest(),old);q=self.night();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
 def test_schema3_legacy_limit_n_plus_one_is_red_then_restore(self):self.pair_n_plus_one('legacyFileMaxBytes','G_WRITER_LIMIT',134217728,134217729)
 def test_schema3_record_limit_n_plus_one_is_red_then_restore(self):self.pair_n_plus_one('maxRecordBytes','G_RECORD_ALLOWANCE',65535,65536)
 def test_both_schema3_mismatches_and_paths_fit_actual_cause_reader(self):
  self.segment_ap(65535);code=self.segment('two-at-once',record=65535);file=code/'usage-limits.json';good=file.read_bytes();data=json.loads(good);data['legacyFileMaxBytes']+=1;data['maxRecordBytes']+=1;file.write_text(json.dumps(data));self.assertNotEqual(hashlib.sha256(good).digest(),hashlib.sha256(file.read_bytes()).digest());print('DOUBLE-PORCHA fields=2 SHA='+hashlib.sha256(good).hexdigest()+'->'+hashlib.sha256(file.read_bytes()).hexdigest(),flush=True);q=self.night();self.assertEqual(q.returncode,1,q.stdout+q.stderr);causes=self.causes(q.stdout)
  for value in ['legacyFileMaxBytes','G_WRITER_LIMIT','134217728','134217729','maxRecordBytes','G_RECORD_ALLOWANCE','65535','65536','/opt/autopilot/current/skill/tools/usage_registration.py',str(file)]:self.assertIn(value,causes)
  file.write_bytes(good);self.assertEqual(self.night().returncode,0)
 def test_schema1_and_schema3_both_work_with_real_ap_limits(self):
  self.segment_ap();self.add('legacy');self.segment('modern');q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('G_RECORD_ALLOWANCE',q.stdout);self.assertIn('G_WRITER_LIMIT',q.stdout);self.assertEqual(q.stdout.count('56 из 56'),2)
 def test_schema3_missing_record_export_is_blind_then_restore(self):
  self.segment_ap();self.segment('missing-record');good=self.ap_module.read_bytes();self.ap_module.write_bytes(good+b'\ndel G_RECORD_ALLOWANCE\n');self.assertNotEqual(hashlib.sha256(good).digest(),hashlib.sha256(self.ap_module.read_bytes()).digest());print('AP-EXPORT-PORCHA deleted G_RECORD_ALLOWANCE SHA='+hashlib.sha256(good).hexdigest()+'->'+hashlib.sha256(self.ap_module.read_bytes()).hexdigest(),flush=True);q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('G_RECORD_ALLOWANCE',q.stdout);self.ap_module.write_bytes(good);self.assertEqual(self.invoke().returncode,0)
 def test_ap_policy_sidecar_drift_during_real_predicate_is_blind(self):
  limits=self.segment_ap();self.segment('ap-policy-drift');spec=importlib.util.spec_from_file_location('contract_policy_drift',SCRIPT);contract=importlib.util.module_from_spec(spec);spec.loader.exec_module(contract);contract.AP_ROOT=self.ap;real=contract.run;good=limits.read_bytes();output=io.StringIO()
  def mutate(**kwargs):
   code=real(**kwargs);self.assertEqual(code,0);data=json.loads(good);data['recordAllowanceBytes']-=1;limits.write_text(json.dumps(data));self.assertNotEqual(hashlib.sha256(good).digest(),hashlib.sha256(limits.read_bytes()).digest());print('AP-POLICY-PORCHA SHA='+hashlib.sha256(good).hexdigest()+'->'+hashlib.sha256(limits.read_bytes()).hexdigest(),flush=True);return code
  try:
   with mock.patch.object(contract,'run',side_effect=mutate),mock.patch.dict(os.environ,self.env),contextlib.redirect_stdout(output):code=contract.check_live()
   self.assertEqual(code,2,output.getvalue());self.assertIn('AP изменился',output.getvalue())
  finally:limits.write_bytes(good)
  self.assertEqual(self.invoke().returncode,0)
 def test_broken_live_module_is_blind_without_fixture_fallback(self):
  code=self.add('broken');(code/'usage-producer.mjs').write_text('export const unrelated=1;')
  q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('СЛЕПОТА',q.stdout);self.assertIn(str(code/'usage-producer.mjs'),q.stdout);self.assertNotIn('56 из 56',q.stdout)
 def test_producer_appearing_during_legacy_check_is_blind(self):
  code=self.add('race','anthropic',False)
  spec=importlib.util.spec_from_file_location('contract_race',SCRIPT);contract=importlib.util.module_from_spec(spec);spec.loader.exec_module(contract);contract.AP_ROOT=self.ap;stand=contract.load_stand(HERE/'stend-g-journal-size.py');original=stand.g_size
  def appear(fields,provider):
   result=original(fields,provider);path=code/'usage-producer.mjs'
   if not path.exists():
    path.write_bytes((HERE/'fixtures/g-producer-359a/usage-producer.mjs').read_bytes());self.assertTrue(path.is_file());print('RACE-PORCHA created=1 SHA='+hashlib.sha256(path.read_bytes()).hexdigest(),flush=True)
   return result
  out=io.StringIO()
  with mock.patch.object(contract,'load_stand',return_value=stand),mock.patch.object(stand,'g_size',side_effect=appear),mock.patch.dict(os.environ,self.env),contextlib.redirect_stdout(out):rc=contract.check_live()
  print(out.getvalue(),flush=True);self.assertEqual(rc,2,out.getvalue());self.assertIn('СЛЕПОТА',out.getvalue());self.assertIn('coder-gateway-race.service',out.getvalue())
 def test_live_import_cannot_write_back_into_producer_directory(self):
  code=self.add('readonly');source=code/'usage-producer.mjs';source.write_text("try{fs.writeFileSync(new URL('./host-marker',import.meta.url),'bad')}catch{}\n"+source.read_text())
  q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn(str(source),q.stdout);self.assertFalse((code/'host-marker').exists())
 def test_live_module_excess_output_is_bounded_blindness(self):
  code=self.add('loud');source=code/'usage-producer.mjs';source.write_text("console.log('x'.repeat(300000));\n"+source.read_text())
  q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn(str(source),q.stdout);self.assertIn('СЛЕПОТА',q.stdout);self.assertLess(len(q.stdout),20000)
 def test_ap_limit_n_plus_one_is_red_then_return_green(self):
  code=self.add('aplimit');file=code/'usage-limits.json';good=file.read_bytes();q=self.night();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  doc=json.loads(good);doc['gatewayV1FileMaxBytes']=134217729;file.write_text(json.dumps(doc,sort_keys=True));before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(file.read_bytes()).hexdigest();self.assertNotEqual(before,after);self.assertEqual(subprocess.check_output(['grep','-cF','"gatewayV1FileMaxBytes": 134217729',str(file)],text=True).strip(),'1');print('AP-LIMIT-PORCHA replacements=1 grep-cF=1 SHA='+before+'->'+after,flush=True)
  q=self.night();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('регистрация отказывает раньше писателя (ложные BUDGET_EXCEEDED)',q.stdout)
  for value in ['134217728','134217729','/opt/autopilot/current/skill/tools/usage_registration.py',str(file)]:self.assertIn(value,q.stdout)
  causes=self.causes(q.stdout)
  for value in ['134217728','134217729','/opt/autopilot/current/skill/tools/usage_registration.py',str(file)]:self.assertIn(value,causes)
  file.write_bytes(good);self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(),before);q=self.night();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
 def test_ap_greater_than_writer_has_a_distinct_reason(self):
  code=self.add('apsmallerwriter');(code/'usage-limits.json').write_text('{"schemaVersion":1,"gatewayV1FileMaxBytes":67108864}')
  q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('договор разошёлся, бюджет AP больше предела писателя',q.stdout);self.assertNotIn('ложные BUDGET_EXCEEDED',q.stdout)
  for value in ['134217728','67108864','usage_registration.py',str(code/'usage-limits.json')]:self.assertIn(value,q.stdout)
 def test_missing_ap_is_named_blind_even_without_producer(self):
  self.add('apmissing','anthropic',False);self.ap_module.unlink();q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('СЛЕПОТА',q.stdout);self.assertIn('AP',q.stdout);self.assertIn('usage_registration.py',q.stdout)
 def test_ap_uses_an_isolated_import_not_pythonpath_or_source_regex(self):
  self.add('apimport');poison=self.root/'poison';poison.mkdir();(poison/'usage_registration.py').write_text('G_WRITER_LIMIT=1\n');self.env['PYTHONPATH']=str(poison)
  # The fixture requires -I/-B and computes its value; no literal assignment to parse.
  q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('AP',q.stdout);self.assertIn('134217728',q.stdout)
 def test_ap_import_keeps_existing_home_and_filters_other_environment(self):
  self.add('ap-environment');home=self.root/'parent-home';home.mkdir();self.env['HOME']=str(home);self.env['UNRELATED_TEST']='ignore-me';self.ap_module.write_text('import os,sys\nassert sys.flags.isolated and sys.flags.dont_write_bytecode\nassert os.environ.get("HOME")=='+repr(str(home))+'\nassert "UNRELATED_TEST" not in os.environ\nG_WRITER_LIMIT=134217728\n');q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
 def test_ap_invalid_constant_and_import_failure_are_blind(self):
  self.add('apbad')
  for text in ['G_WRITER_LIMIT=True','G_WRITER_LIMIT="134217728"','raise RuntimeError("fixture failure")']:
   self.ap_module.write_text(text);q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('СЛЕПОТА',q.stdout);self.assertIn('usage_registration.py',q.stdout)
 def test_ap_change_during_predicate_is_blind(self):
  self.add('apdrift');spec=importlib.util.spec_from_file_location('contract_ap_race',SCRIPT);contract=importlib.util.module_from_spec(spec);spec.loader.exec_module(contract);contract.AP_ROOT=self.ap
  def changed(**kwargs):
   before=hashlib.sha256(self.ap_module.read_bytes()).hexdigest();self.ap_module.write_text('G_WRITER_LIMIT=134217729\n');after=hashlib.sha256(self.ap_module.read_bytes()).hexdigest();self.assertNotEqual(before,after);print('AP-DRIFT-PORCHA SHA='+before+'->'+after,flush=True);return 0
  out=io.StringIO()
  with mock.patch.object(contract,'run',side_effect=changed),mock.patch.dict(os.environ,self.env),contextlib.redirect_stdout(out):rc=contract.check_live()
  print(out.getvalue(),flush=True);self.assertEqual(rc,2,out.getvalue());self.assertIn('AP изменился во время договора',out.getvalue())
 def test_ap_origin_cannot_escape_selected_release(self):
  self.add('aporigin');outside=self.root/'external-tools';(self.ap/'skill/tools').rename(outside);(self.ap/'skill/tools').symlink_to(outside,target_is_directory=True);marker=self.root/'external-imported'
  (outside/'usage_registration.py').write_text('from pathlib import Path\nPath('+repr(str(marker))+').write_text("imported")\nG_WRITER_LIMIT=134217728\n')
  self.assertFalse((self.ap/'skill/tools/usage_registration.py').resolve().is_relative_to(self.ap));q=self.invoke();print('AP-ORIGIN-PORCHA symlink='+str(self.ap/'skill/tools')+' target='+str(outside)+' imported='+str(marker.exists()),flush=True);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertFalse(marker.exists());self.assertIn('СЛЕПОТА',q.stdout)
 def test_no_live_units_is_blind_without_pinned_fallback(self):
  q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('СЛЕПОТА',q.stdout)
 def test_guest_without_producer_is_neutral_and_named(self):
  code=self.add('guest','anthropic',False);q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('сборка без G',q.stdout);self.assertIn(str(code/'usage-producer.mjs'),q.stdout);self.assertNotIn('56 из 56',q.stdout)
 def test_actual_live_source_weakening_is_red_then_restore_green(self):
  code=self.add('main');guest=self.add('guest','anthropic',False);q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  source=code/'usage-producer.mjs';good=source.read_bytes();old=b'(info.mode&0o777)!==0o600';new=b'![0o600,0o644].includes(info.mode&0o777)';self.assertEqual(good[:good.index(b'const queue=')].count(old),1);source.write_bytes(good.replace(old,new,1));before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(source.read_bytes()).hexdigest();self.assertNotEqual(before,after);count=subprocess.check_output(['grep','-cF',new.decode(),str(source)],text=True).strip();self.assertEqual(count,'1');print('PRODUCER-PORCHA replacements=1 grep-cF=1 SHA='+before+'->'+after,flush=True)
  q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('КРАСНОЕ openai/0700/0644',q.stdout);self.assertIn(str(source),q.stdout);self.assertIn('coder-gateway-main.service',q.stdout)
  source.write_bytes(good);self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),before);q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('56 из 56',q.stdout)
 def test_nightly_inventory_has_root_wrapper_and_executes_live_mode(self):
  row='/opt/iskra/workspace/dsh-plugins/packages/dsh-obhod-stendov/test/stend-g-source-contract.py'
  self.assertEqual((PKG/'dorabotki/perechen-boevyh-stendov.txt').read_text().splitlines().count(row),1)
  self.assertEqual((PKG/'dorabotki/vse-stendy-boevye.sh').read_text().splitlines().count(row+' @root /opt/iskra/app'),1)
  self.assertTrue(WRAPPER.is_file());self.add('main');q=self.invoke(WRAPPER);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('coder-gateway-main.service',q.stdout)
if __name__=='__main__':unittest.main()
