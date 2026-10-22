#!/usr/bin/env python3
"""Build fixture and nightly live prepareGatewayUsage/AP budget contracts."""
import argparse,hashlib,importlib.util,json,os,resource,shutil,signal,stat,subprocess,sys,tempfile,time
from pathlib import Path
HERE=Path(__file__).resolve().parent
AP_ROOT=Path('/opt/autopilot/current')
AP_IMPORT=r"""
import json,sys
from pathlib import Path
root=Path(sys.argv[1]);expected=root/'skill/tools/usage_registration.py'
if not expected.resolve(strict=True).is_relative_to(root):raise ValueError('AP module outside selected release')
sys.path.insert(0,str(expected.parent))
import usage_registration as module
if Path(module.__file__).resolve()!=expected.resolve():raise RuntimeError('wrong usage_registration origin')
value=module.G_WRITER_LIMIT
record=module.G_RECORD_ALLOWANCE if len(sys.argv)>2 and sys.argv[2]=='1' else None
if type(value) is not int or not 0<value<=2**53-1:raise ValueError('invalid G_WRITER_LIMIT')
if record is not None and (type(record) is not int or not 0<record<=value):raise ValueError('invalid G_RECORD_ALLOWANCE')
print(json.dumps({'value':value,'record':record,'module':str(expected)}))
"""
NODE_SCRIPT=r'''
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {prepareGatewayUsage}=await import(pathToFileURL(process.argv[1]).href);
const cases=JSON.parse(fs.readFileSync(0,'utf8'));
const results=cases.map(c=>{
 process.env.HOME=c.provider==='anthropic'?c.home:c.unused;
 process.env.CODEX_HOME=c.provider==='openai'?c.home:c.unused;
 const file=prepareGatewayUsage({provider:c.provider});
 return {name:c.name,file,uid:process.getuid()};
});
process.stdout.write(JSON.stringify(results));
'''

def load_stand(path):
 spec=importlib.util.spec_from_file_location('contract_g_size',path)
 stand=importlib.util.module_from_spec(spec);spec.loader.exec_module(stand);return stand

def policy_of(stand,source):
 try:return stand.writer_policy(source)
 except stand.gateway.Blind as error:raise ValueError(str(error)) from None

def run(stand_path=HERE/'stend-g-journal-size.py',producer=None,label=None):
 if os.getuid()!=0:print('СЛЕПОТА: договорный тест требует root для чужого uid');return 2
 fixture=HERE/'fixtures/g-producer-359a'
 try:
  if producer is None:
   origin=json.loads((fixture/'SOURCE.json').read_text())
   if origin['commit']!='359a5066f90c193957c56c5a0e8d88fe2def039e' or {x['path'] for x in origin['files']}!={'usage-producer.mjs','engine-process.mjs','usage-limits.json'}:raise ValueError('origin')
   for entry in origin['files']:
    if hashlib.sha256((fixture/entry['path']).read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('fixture hash '+entry['path'])
  source=Path(producer) if producer is not None else fixture/'usage-producer.mjs'
  shown=label or str(source)
  if not source.is_absolute() or source.name!='usage-producer.mjs' or not stat.S_ISREG(source.lstat().st_mode):raise ValueError('producer не обычный абсолютный usage-producer.mjs')
  stand=load_stand(stand_path);policy=policy_of(stand,source);node=shutil.which('node')
  if policy.get('legacyInline'):
   print('НЕЙТРАЛЬНО · нет предмета initializer prepareGatewayUsage в G 3.1.6 · producer '+shown)
   return 0
  if not node:raise ValueError('Node не найден')
  with tempfile.TemporaryDirectory(prefix='g-contract-') as tmp:
   root=Path(tmp);cases=[]
   for provider in ['openai','anthropic']:
    for directory in ['0700','0755','symlink','foreign-uid']:
     for kind in ['0600','0644','nlink-2','symlink','directory','missing','foreign-uid']:
      name=provider+'/'+directory+'/'+kind;home=root/(provider+'-'+directory+'-'+kind);home.mkdir()
      meter=home/'.usage-meter';target=home/'target' if directory=='symlink' else meter;target.mkdir(mode=0o700)
      file=target/'gateway-v1.jsonl'
      if kind=='directory':file.mkdir(mode=0o600)
      elif kind=='symlink':
       (home/'file-target').write_bytes(b'');(home/'file-target').chmod(0o600);file.symlink_to(home/'file-target')
      elif kind!='missing':
       file.write_bytes(b'');file.chmod(0o644 if kind=='0644' else 0o600)
       if kind=='nlink-2':os.link(file,home/'hardlink')
       if kind=='foreign-uid':os.chown(file,1,-1)
      if directory=='0755':target.chmod(0o755)
      if directory=='foreign-uid':os.chown(target,1,-1)
      if directory=='symlink':meter.symlink_to(target)
      cases.append(dict(name=name,home=str(home),unused=str(home/'unused-provider-home'),provider=provider,missing=kind=='missing',safe_directory=directory=='0700'))
   command=[node,'--input-type=module','-e',NODE_SCRIPT,str(source)]
   if producer is not None:
    bubble=shutil.which('bwrap')
    if not bubble:raise ValueError('bwrap не найден: живой producer без изоляции не исполняется')
    # Bind the process-view source before replacing /proc. Its actual imports stay read-only.
    command=[bubble,'--die-with-parent','--ro-bind','/','/','--tmpfs','/run','--dir','/run/g-contract-source']
    # A directory bind retains its foreign 0750 owner and becomes unreadable after cap-drop.
    # Mount only the known initializer files into our readable directory; no capabilities added.
    for name,_ in build_stamp(stand,source):
     command+=['--ro-bind',str(source.with_name(name)),'/run/g-contract-source/'+name]
    command+=['--dev','/dev','--proc','/proc','--tmpfs','/tmp','--tmpfs','/var/tmp','--bind',str(root),str(root),'--unshare-pid','--unshare-net','--cap-drop','ALL',node,'--input-type=module','-e',NODE_SCRIPT,'/run/g-contract-source/usage-producer.mjs']
   def child_limits():resource.setrlimit(resource.RLIMIT_FSIZE,(256*1024,256*1024))
   with tempfile.TemporaryFile() as output,tempfile.TemporaryFile() as errors:
    q=subprocess.run(command,input=json.dumps(cases).encode(),stdout=output,stderr=errors,timeout=15,preexec_fn=child_limits,env={'PATH':os.defpath,'HOME':str(root),'CODEX_HOME':str(root)})
    if q.returncode:
     errors.seek(0);detail=errors.read(300).decode('utf8','replace')
     raise ValueError('prepareGatewayUsage: Node завершился с '+str(q.returncode)+': '+detail)
    output.seek(0);raw=output.read(256*1024+1)
    if len(raw)>256*1024:raise ValueError('ответ Node больше 256 KiB')
    results=json.loads(raw)

   if len(results)!=len(cases) or [x['name'] for x in results]!=[x['name'] for x in cases]:raise ValueError('неполный перечень Node')
   failed=0
   for case,result in zip(cases,results):
    fields={b'HOME':os.fsencode(case['home'] if case['provider']=='anthropic' else case['unused']),b'CODEX_HOME':os.fsencode(case['home'] if case['provider']=='openai' else case['unused'])}
    path=stand.g_path(fields,case['provider']);size,reason=stand.g_safety(path,result['uid']);enabled=result['file'] is not None
    if policy['schemaVersion']==3 and size is not None and reason is None:
     module=stand.segment_module()
     try:module.inspect_source(path,result['uid'],policy,time.time_ns()//1000000)
     except module.Unsafe as error:reason=str(error)
     except module.Blind as error:raise ValueError(case['name']+': '+str(error)) from None
    expected_path=str(path/'gateway-v1.jsonl')
    matched=((enabled and size is not None and reason is None and result['file']==expected_path) or (not enabled and reason is not None))
    if case['missing'] and case['safe_directory']:
     info=(path/'gateway-v1.jsonl').lstat();matched=matched and stat.S_ISREG(info.st_mode) and info.st_size==0 and info.st_mode&0o777==0o600 and info.st_uid==result['uid'] and info.st_nlink==1
    if not Path(case['unused']).exists():pass
    else:matched=False
    failed+=not matched
    print(('FAIL КРАСНОЕ' if not matched else 'OK')+' '+case['name']+' · prepare='+('enabled' if enabled else 'disabled')+' · stand='+('yellow: '+reason if reason else ('green' if size is not None else 'missing'))+' · producer '+shown)
   print('договор prepareGatewayUsage · producer '+shown+': '+str(len(cases)-failed)+' из '+str(len(cases))+' · расхождений '+str(failed))
   return 1 if failed else 0
 except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as error:
  print('СЛЕПОТА договора · producer '+str(label or producer or fixture/'usage-producer.mjs')+': '+str(error));return 2

def source_stamp(source):
 info=source.lstat()
 if not stat.S_ISREG(info.st_mode):raise ValueError('producer не обычный файл')
 return info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,info.st_ctime_ns

def build_stamp(stand,source):
 """The static initializer imports, including the segment predicate since 3.1.8."""
 policy=policy_of(stand,source)
 names=['usage-producer.mjs','engine-process.mjs']
 if not policy.get('legacyInline'):names.append('usage-limits.json')
 if policy['schemaVersion']==3:names.append('usage-segments.mjs')
 if source.with_name('child-capture.mjs').exists():names+=['child-capture.mjs','source-version.mjs','child-source-versions.json']
 return tuple((name,source_stamp(source.with_name(name))) for name in names)

def ap_stamp():
 root=AP_ROOT.resolve(strict=True);module=root/'skill/tools/usage_registration.py';resolved=module.resolve(strict=True)
 if not resolved.is_relative_to(root):raise ValueError('AP module выходит за выбранный release: '+str(resolved))
 policy=module.with_name('usage-reader-limits.json');sidecar=None
 try:
  target=policy.resolve(strict=True)
  if not target.is_relative_to(root):raise ValueError('AP policy выходит за выбранный release: '+str(target))
  sidecar=(str(target),source_stamp(policy))
 except FileNotFoundError:pass
 return str(root),str(resolved),source_stamp(module),sidecar

def ap_limit(need_record=False):
 shown=AP_ROOT/'skill/tools/usage_registration.py'
 try:
  before=ap_stamp()
  if need_record and before[3] is None:raise ValueError('AP usage-reader-limits.json отсутствует: '+str(shown.with_name('usage-reader-limits.json')))
  environment={'PATH':os.defpath}
  # Preserve HOME's value: omitting it makes Python startup query NSS before import.
  if 'HOME' in os.environ:environment['HOME']=os.environ['HOME']
  def child_limits():resource.setrlimit(resource.RLIMIT_FSIZE,(65536,65536))
  with tempfile.TemporaryFile() as output,tempfile.TemporaryFile() as errors:
   result=subprocess.run([sys.executable,'-I','-B','-c',AP_IMPORT,before[0],'1' if need_record else '0'],stdout=output,stderr=errors,timeout=3,preexec_fn=child_limits,env=environment)
   if result.returncode:raise ValueError('импорт usage_registration/'+('G_WRITER_LIMIT/G_RECORD_ALLOWANCE' if need_record else 'G_WRITER_LIMIT')+' завершился с кодом '+str(result.returncode))
   output.seek(0);raw=output.read(65537)
   if len(raw)>65536:raise ValueError('ответ импорта больше 64 KiB')
   value=json.loads(raw)
  if (not isinstance(value,dict) or set(value)!={'value','record','module'} or type(value['value']) is not int or not 0<value['value']<=2**53-1
      or value['module']!=str(Path(before[0])/'skill/tools/usage_registration.py')):raise ValueError('негодный G_WRITER_LIMIT/адрес модуля')
  if need_record and (type(value['record']) is not int or not 0<value['record']<=value['value']):raise ValueError('негодный G_RECORD_ALLOWANCE: '+str(shown))
  if ap_stamp()!=before:raise ValueError('AP изменился во время импорта')
  return dict(value=value['value'],record=value['record'],path=str(shown),stamp=before)
 except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as error:
  raise ValueError('AP usage_registration не прочитан: '+str(shown)+' · '+str(error)) from None

def limit_agreement(stand,source,label,ap):
 policy=policy_of(stand,source);limits=source if policy.get('legacyInline') else source.with_name('usage-limits.json');before=source_stamp(limits);policy=policy_of(stand,source)
 if source_stamp(limits)!=before:raise ValueError('предел producer изменился во время чтения: '+str(limits))
 if ap is None:raise ValueError('AP: договорные пределы не получены')
 if policy['schemaVersion']==3:
  if type(ap.get('record')) is not int or ap['record']<=0:raise ValueError('AP G_RECORD_ALLOWANCE не получен: '+ap['path'])
  pairs=[('legacyFileMaxBytes','G_WRITER_LIMIT',policy['legacyFileMaxBytes'],ap['value']),('maxRecordBytes','G_RECORD_ALLOWANCE',policy['maxRecordBytes'],ap['record'])]
  mismatches=[item for item in pairs if item[2]!=item[3]]
  if mismatches:
   print('FAIL КРАСНОЕ · договор двух лимитов AP/producer разошёлся (schema3)')
   for field,export,writer,reader in mismatches:print('FAIL '+field+' ↔ AP '+export+': producer='+str(writer)+' · AP='+str(reader)+' байт')
   print('FAIL AP · '+ap['path'])
   print('FAIL producer · '+str(Path(label).with_name('usage-limits.json')))
  else:
   for field,export,writer,reader in pairs:print('ЗЕЛЁНОЕ · '+field+'='+str(writer)+' ↔ AP '+export+'='+str(reader)+' байт')
  return int(bool(mismatches)),before
 value=policy['gatewayV1FileMaxBytes']
 shown=str(label) if policy.get('legacyInline') else str(Path(label).with_name('usage-limits.json'))
 field='inline guard' if policy.get('legacyInline') else 'gatewayV1FileMaxBytes'
 reason=('регистрация отказывает раньше писателя (ложные BUDGET_EXCEEDED)' if ap['value']<value else 'договор разошёлся, бюджет AP больше предела писателя')
 if ap['value']!=value:
  print('FAIL КРАСНОЕ · '+reason)
  print('FAIL AP G_WRITER_LIMIT='+str(ap['value'])+' байт · '+ap['path'])
  print('FAIL producer '+field+'='+str(value)+' байт · '+shown)
 else:print('ЗЕЛЁНОЕ · AP='+str(ap['value'])+' байт · '+ap['path']+' · producer='+str(value)+' байт · '+shown)
 return int(ap['value']!=value),before

def check_one(stand,source,label,ap):
 budget=0;stamp=None;build=None;limits=source.with_name('usage-limits.json')
 try:
  build=build_stamp(stand,source)
  if policy_of(stand,source).get('legacyInline'):limits=source
  budget,stamp=limit_agreement(stand,source,label,ap)
 except (OSError,ValueError,stand.gateway.Blind) as error:
  budget=2;print('СЛЕПОТА договора лимитов · producer '+label+': '+str(error))
 predicate=run(producer=source,label=label)
 if build is not None:
  try:
   if build_stamp(stand,source)!=build:raise ValueError('состав initializer изменился во время договора')
  except (OSError,ValueError) as error:budget=2;print('СЛЕПОТА договора · producer '+label+': '+str(error))
 if stamp is not None:
  try:
   if source_stamp(limits)!=stamp:raise ValueError('предел producer изменился: '+str(limits))
  except (OSError,ValueError) as error:budget=2;print('СЛЕПОТА договора лимитов · producer '+label+': '+str(error))
 return 2 if 2 in (budget,predicate) else (1 if 1 in (budget,predicate) else 0)

def check_live():
 if os.getuid()!=0:print('СЛЕПОТА: живой договор требует root');return 2
 stand=load_stand(HERE/'stend-g-journal-size.py');gateway=stand.gateway;deadline=time.monotonic()+90
 groups={};count=without=blind=failures=checked=0
 try:
  for unit in stand.units(deadline):
   try:
    pid=gateway.pid_of(deadline,unit)
    if not pid:continue
    start=gateway.start_of(pid);provider,fields=stand.environment(pid)
    if gateway.pid_of(deadline,unit)!=pid or gateway.start_of(pid)!=start:raise gateway.Blind('MainPID/starttime изменился')
    if provider not in {'openai','anthropic'}:continue
    count+=1;uid=stand.process_uid(pid);source,display=stand.producer_source(pid)
    try:stamp=source_stamp(source)
    except FileNotFoundError:
     if stand.g_size(fields,provider) is not None:raise gateway.Blind('G-файл есть, producer не найден: '+str(display))
     if gateway.pid_of(deadline,unit)!=pid or gateway.start_of(pid)!=start or stand.process_uid(pid)!=uid or stand.producer_source(pid)!=(source,display):raise gateway.Blind('процесс/uid/путь изменился')
     if stand.g_size(fields,provider) is not None:raise gateway.Blind('G появился во время замера: '+str(display))
     try:source_stamp(source)
     except FileNotFoundError:pass
     else:raise gateway.Blind('producer появился во время замера: '+str(display))
     without+=1;print('G договор ['+unit+']: G не ведётся (сборка без G) · producer '+str(display));continue
    build=build_stamp(stand,source);parent=source.parent.stat();key=(parent.st_dev,parent.st_ino,stamp[0],stamp[1])
    groups.setdefault(key,[]).append((unit,pid,start,uid,source,display,stamp,build))
   except (OSError,ValueError,gateway.Blind) as error:
    blind+=1;print('СЛЕПОТА договора ['+unit+']: '+str(error))
  ap=None;need_record=False
  for entries in groups.values():
   try:
    policy=policy_of(stand,entries[0][4]);need_record|=policy['schemaVersion']==3
   except (OSError,ValueError,gateway.Blind) as error:blind+=1;print('СЛЕПОТА договора policy · '+str(entries[0][5])+': '+str(error))
  try:ap=ap_limit(need_record=need_record)
  except ValueError as error:blind+=1;print('СЛЕПОТА договора AP: '+str(error))
  for entries in groups.values():
   unit,pid,start,uid,source,display,stamp,build=entries[0]
   label=str(display);names=', '.join(x[0] for x in entries)
   print('G договор ['+names+'] · producer '+label,flush=True)
   result=check_one(stand,source,label,ap);checked+=1
   failures+=result==1;blind+=result==2
   for unit,pid,start,uid,source,display,stamp,build in entries:
    try:
     if gateway.pid_of(deadline,unit)!=pid or gateway.start_of(pid)!=start or stand.process_uid(pid)!=uid or stand.producer_source(pid)!=(source,display) or source_stamp(source)!=stamp or build_stamp(stand,source)!=build:raise gateway.Blind('MainPID/starttime/uid/путь или состав initializer изменился')
    except (OSError,ValueError,gateway.Blind) as error:
     blind+=1;print('СЛЕПОТА договора ['+unit+'] · producer '+str(display)+': '+str(error))
  if ap is not None:
   try:
    if ap_stamp()!=ap['stamp']:raise ValueError('AP изменился во время договора')
   except (OSError,ValueError) as error:blind+=1;print('СЛЕПОТА договора AP · '+ap['path']+': '+str(error))
 except (gateway.Blind,gateway.Deadline) as error:blind+=1;print('СЛЕПОТА договора: '+str(error))
 if not count:blind+=1;print('СЛЕПОТА договора: живых Codex/Claude-шлюзов не обнаружено')
 print(f'договор: шлюзов {count} · сборок с producer {len(groups)} · проверено {checked} · без producer {without} · расхождений {failures} · слепот {blind}')
 return 2 if blind else (1 if failures else 0)

def main():
 parser=argparse.ArgumentParser(description='No arguments: live per-process contract; --producer: explicit producer; run() defaults to build fixture.',allow_abbrev=False)
 parser.add_argument('--producer',type=Path);args=parser.parse_args()
 def expired(signum,frame):raise TimeoutError('предел живого договора 90 с')
 previous=signal.signal(signal.SIGALRM,expired);signal.alarm(90)
 try:
  if args.producer is None:return check_live()
  stand=load_stand(HERE/'stend-g-journal-size.py');policy=policy_of(stand,args.producer);ap=ap_limit(need_record=policy['schemaVersion']==3);result=check_one(stand,args.producer,str(args.producer),ap)
  if ap is not None and ap_stamp()!=ap['stamp']:raise ValueError('AP изменился во время договора: '+ap['path'])
  return result
 except (OSError,ValueError) as error:print('СЛЕПОТА договора: '+str(error));return 2
 except TimeoutError as error:print('СЛЕПОТА договора: '+str(error));return 2
 finally:signal.alarm(0);signal.signal(signal.SIGALRM,previous)
if __name__=='__main__':raise SystemExit(main())
