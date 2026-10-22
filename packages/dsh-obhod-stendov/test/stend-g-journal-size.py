#!/usr/bin/env python3
"""G каждого живого Codex/Claude шлюза: сегменты, объём, скорость и GC.
Metadata/stat и observedAt первой строки active; содержимое G не выводится.
0: зелёное/не ведётся, 1: жёлтое/красное для читателя обхода, 2: слепота.
Один проход: <=128 units, systemctl<=3с, общий таймер30с, environ<=1MiB.
"""
import argparse,hashlib,json,math,os,re,signal,stat,time
import importlib.util
from pathlib import Path
import sys;sys.dont_write_bytecode=True  # 19.10 (наряд Забавы 05:11Z): загрузка stend-codex-app-server.py модулем не пишет __pycache__ в дерево (от root — чужой хозяин в дереве Искры)
spec=importlib.util.spec_from_file_location('gateway_probe',Path(__file__).with_name('stend-codex-app-server.py'))
gateway=importlib.util.module_from_spec(spec);spec.loader.exec_module(gateway)
MIB=1024*1024
# Shipped AP0.1.9 G3.1.6 has an inline guard and no policy/initializer.
LEGACY_019_SHA256='a8183a3530a3a37453aff2d8c641842436df5951ef4e3c4eb70686ffa2f7547c'

def utc_ms(value):
 try:return time.strftime('%Y-%m-%dT%H:%M:%S',time.gmtime(value//1000))+f'.{value%1000:03d}Z'
 except (OSError,ValueError,OverflowError):raise gateway.Blind('active timestamp: UTC-время не представимо') from None

def producer_source(pid):
 """Node gateway entrypoint from the live process, read in its mount namespace."""
 proc=gateway.PROC/str(pid);raw=gateway.read_limited(proc/'cmdline',65536)
 if not raw or not raw.endswith(b'\0'):raise gateway.Blind('producer G: cmdline не полный NUL-срез')
 args=raw[:-1].split(b'\0')
 try:
  executable=Path(os.readlink(proc/'exe').removesuffix(' (deleted)')).name
  script=Path(args[1].decode('utf-8')) if len(args)>=2 else None
 except (UnicodeError,OSError):raise gateway.Blind('producer G: cmdline/exe недоступен или не UTF-8') from None
 if executable not in {'node','nodejs'} or script is None or script.name!='gateway.mjs' or args[1].startswith(b'-'):
  raise gateway.Blind('producer G: неизвестная форма запуска Node gateway.mjs')
 parts=script.parts[1:] if script.is_absolute() else script.parts
 if '..' in parts:raise gateway.Blind('producer G: .. в entrypoint не поддержан')
 if script.is_absolute():entry=proc/'root'
 else:
  cwd=os.readlink(proc/'cwd')
  try:cwd.encode('utf-8')
  except UnicodeError:raise gateway.Blind('producer G: cwd не UTF-8') from None
  if not Path(cwd).is_absolute() or cwd.endswith(' (deleted)'):raise gateway.Blind('producer G: cwd не определён')
  entry=proc/'cwd';script=Path(cwd)/script
 for part in parts[:-1]:
  entry=entry/part
  if not stat.S_ISDIR(entry.lstat().st_mode):raise gateway.Blind('producer G: родитель entrypoint не обычный каталог (ссылки не поддержаны)')
 entry=entry/parts[-1]
 if not stat.S_ISREG(entry.lstat().st_mode):raise gateway.Blind('producer G: entrypoint не обычный файл (ссылки не поддержаны)')
 return entry.parent/'usage-producer.mjs',script.parent/'usage-producer.mjs'

def segment_module():
 spec=importlib.util.spec_from_file_location('g_segment_source',Path(__file__).with_name('g_segment_source.py'))
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def writer_policy(source):
 path=source.with_name('usage-limits.json')
 try:code=gateway.read_limited(source,256*1024)
 except (OSError,gateway.Blind):raise gateway.Blind('producer G: исходник не прочитан: '+str(source)) from None
 if hashlib.sha256(code).hexdigest()==LEGACY_019_SHA256:
  try:path.lstat()
  except FileNotFoundError:pass
  else:raise gateway.Blind('G 3.1.6 не читает usage-limits.json: смешанная поставка · '+str(path))
  guards=re.findall(rb"if\(info\.size\+Buffer\.byteLength\(raw\)>([1-9][0-9]*)\*1024\*1024\)throw Error\('SOURCE_GAP'\)",code)
  if len(guards)!=1:raise gateway.Blind('G 3.1.6: guard размера не установлен · '+str(source))
  return dict(schemaVersion=1,gatewayV1FileMaxBytes=int(guards[0])*MIB,legacyInline=True)
 def object_pairs(pairs):
  if len({k for k,v in pairs})!=len(pairs):raise ValueError('duplicate key')
  return dict(pairs)
 def invalid_constant(value):raise ValueError('invalid JSON constant')
 try:
  raw=gateway.read_limited(path,256*1024).decode('utf-8-sig')
  limits=json.loads(raw,object_pairs_hook=object_pairs,parse_constant=invalid_constant)
 except (OSError,UnicodeError,ValueError,RecursionError,gateway.Blind):raise gateway.Blind('usage-limits.json не прочитан или содержит негодный JSON: '+str(path)) from None
 if isinstance(limits,dict) and type(limits.get('schemaVersion')) is int and limits['schemaVersion']==3:
  module=segment_module()
  try:return module.validate_policy(limits)
  except module.Blind as error:raise gateway.Blind('usage-limits.json: '+str(error)+' · '+str(path)) from None
 if (not isinstance(limits,dict) or set(limits)!={'schemaVersion','gatewayV1FileMaxBytes'}
     or type(limits['schemaVersion']) not in {int,float} or limits['schemaVersion']!=1
     or type(limits['gatewayV1FileMaxBytes']) not in {int,float}):
  raise gateway.Blind('usage-limits.json: негодная схема: '+str(path))
 value=limits['gatewayV1FileMaxBytes']
 if not 65536<value<=2**53-1 or not math.isfinite(value) or int(value)!=value:
  raise gateway.Blind('usage-limits.json: негодный gatewayV1FileMaxBytes: '+str(path))
 return dict(schemaVersion=1,gatewayV1FileMaxBytes=int(value))

def writer_limit(source):
 policy=writer_policy(source)
 if policy['schemaVersion']!=1:raise gateway.Blind('usage-limits.json: сегментный источник не имеет прежнего предела одного файла')
 return policy['gatewayV1FileMaxBytes']

def thresholds(source):
 limit=writer_limit(source)
 return (limit*3+3)//4,limit

def units(deadline):
 text=gateway.ctl(deadline,'list-units','--all','--type=service','--no-legend','--plain','--no-pager','coder-gateway*','claude-oauth-gateway*')
 names=[line.split()[0] for line in text.splitlines() if line.strip()]
 if len(names)>128 or len(names)!=len(set(names)) or any(not re.fullmatch(r'(?:coder-gateway|claude-oauth-gateway)[-A-Za-z0-9_@.\\:]*\.service',x) for x in names):raise gateway.Blind('неоднозначный перечень или больше 128 юнитов')
 return sorted(names)

def environment(pid):
 raw=gateway.read_limited(gateway.PROC/str(pid)/'environ',gateway.LIMIT)
 if not raw.endswith(b'\0'):raise gateway.Blind('environ не полный NUL-срез')
 fields={};wanted={b'GATEWAY_POSTAVSHIK',b'CODEX_HOME',b'HOME'}
 for item in raw.split(b'\0'):
  key,sep,value=item.partition(b'=')
  if key not in wanted:continue
  if not sep or key in fields:raise gateway.Blind('неоднозначная переменная environ')
  fields[key]=value
 try:provider=fields.get(b'GATEWAY_POSTAVSHIK',b'').decode('utf-8').strip(gateway.JS_TRIM)
 except UnicodeDecodeError:raise gateway.Blind('поставщик не UTF-8') from None
 if not provider:raise gateway.Blind('поставщик не определён')
 return provider,fields

def g_path(fields,provider):
 key=b'CODEX_HOME' if provider=='openai' else b'HOME'
 try:home=fields.get(key,b'').decode('utf-8')
 except UnicodeDecodeError:raise gateway.Blind('дом G не UTF-8') from None
 if not home or not Path(home).is_absolute():raise gateway.Blind('дом G не задан абсолютным путём')
 return Path(os.path.normpath(home))/'.usage-meter'

def process_g_path(pid,fields,provider):
 """Process-root path plus parent identities for the final process recheck."""
 path=g_path(fields,provider);entry=gateway.PROC/str(pid)/'root';root=entry.stat();parents=[(root.st_dev,root.st_ino)]
 for part in path.parts[1:-1]:
  entry=entry/part
  try:info=entry.lstat()
  except FileNotFoundError:parents.append(None);continue
  if not stat.S_ISDIR(info.st_mode):raise gateway.Blind('дом G: родитель не обычный каталог (ссылки не поддержаны): '+str(path.parent))
  parents.append((info.st_dev,info.st_ino,info.st_mode,info.st_uid))
 return entry/path.name,tuple(parents)

def g_size(fields,provider):
 # Legacy builds without producer have no initializer; retain strict presence checks.
 path=g_path(fields,provider)
 try:
  if not stat.S_ISDIR(path.lstat().st_mode):raise gateway.Blind('каталог G не обычный каталог')
  info=(path/'gateway-v1.jsonl').lstat()
 except FileNotFoundError:return None
 if not stat.S_ISREG(info.st_mode):raise gateway.Blind('G не обычный файл')
 return info.st_size

def process_uid(pid):
 raw=gateway.read_limited(gateway.PROC/str(pid)/'status',65536)
 rows=re.findall(rb'^Uid:[ \t]+([0-9]+)[ \t]+[0-9]+[ \t]+[0-9]+[ \t]+[0-9]+[ \t]*$',raw,re.M)
 if len(rows)!=1 or len(rows[0])>10 or int(rows[0])>2**32-1:raise gateway.Blind('реальный UID шлюза не определён')
 return int(rows[0])

def g_safety(path,uid):
 """Read-only prepareGatewayUsage guards, in its order; None size means missing G."""
 try:directory=path.lstat()
 except FileNotFoundError:return None,None
 if not stat.S_ISDIR(directory.st_mode):return None,'каталог G не обычный каталог (ссылка или другой тип)'
 if directory.st_uid!=uid:return None,'uid каталога G не равен uid шлюза'
 if directory.st_mode&0o777!=0o700:return None,'режим каталога G не 0700'
 try:info=(path/'gateway-v1.jsonl').lstat()
 except FileNotFoundError:return None,None
 if not stat.S_ISREG(info.st_mode):return None,'G не обычный файл (ссылка или другой тип)'
 if info.st_uid!=uid:return info.st_size,'uid файла G не равен uid шлюза'
 if info.st_mode&0o777!=0o600:return info.st_size,'режим файла G не 0600'
 if info.st_nlink!=1:return info.st_size,'nlink файла G не 1'
 return info.st_size,None

def participant(unit):
 stem=unit.removesuffix('.service')
 return stem.split('@',1)[1] if '@' in stem else stem.removeprefix('coder-gateway-')

def process_start_bounds(start):
 """Map proc clock ticks to realtime, retaining one tick and clock-sample width."""
 try:
  hz=os.sysconf('SC_CLK_TCK');before=time.time_ns()
  boot=time.clock_gettime_ns(time.CLOCK_BOOTTIME);after=time.time_ns()
 except (OSError,ValueError,AttributeError):raise gateway.Blind('время старта: часы недоступны') from None
 if type(hz) is not int or hz<=0 or after<before or start<0 or start*1000000000>boot*hz:raise gateway.Blind('время старта: часы/starttime не согласованы')
 return before-boot+start*1000000000//hz,after-boot+((start+1)*1000000000+hz-1)//hz

def missing_g_status(start,source):
 try:info=source.lstat()
 except FileNotFoundError:return 'G не ведётся (сборка без G)',False
 if not stat.S_ISREG(info.st_mode):raise gateway.Blind('producer G не обычный файл')
 lower,upper=process_start_bounds(start);installed=max(info.st_mtime_ns,info.st_ctime_ns)
 if installed>time.time_ns():raise gateway.Blind('producer G: время файла в будущем')
 if lower>installed:return 'ЖЁЛТОЕ · G ожидается, файла нет',True
 if upper<installed:return 'G не ведётся (процесс до монтажа G)',False
 raise gateway.Blind('неразличимы время старта и монтаж producer G')

def check():
 count=present=absent=disabled=blind=alerts=0;deadline=time.monotonic()+gateway.SECONDS;rates=[]
 try:
  for unit in units(deadline):
   try:
    pid=gateway.pid_of(deadline,unit)
    if not pid:continue
    start=gateway.start_of(pid);provider,fields=environment(pid)
    if gateway.start_of(pid)!=start or gateway.pid_of(deadline,unit)!=pid:raise gateway.Blind('MainPID/starttime изменился')
    if provider not in {'openai','anthropic'}:
     print('ВНЕ ОБЛАСТИ '+unit+': поставщик не Codex/Claude');continue
    count+=1;uid=process_uid(pid);source,display=producer_source(pid);g_view=None
    def recheck():
     if gateway.start_of(pid)!=start or gateway.pid_of(deadline,unit)!=pid or process_uid(pid)!=uid or producer_source(pid)!=(source,display):
      raise gateway.Blind('MainPID/starttime/uid или путь producer изменился')
     if g_view is not None and process_g_path(pid,fields,provider)!=g_view:raise gateway.Blind('родитель пути G изменился')
    label='G '+participant(unit)+' ['+unit+']'
    try:info=source.lstat()
    except FileNotFoundError:
     size=g_size(fields,provider);recheck()
     if size is not None:
      present+=1;raise gateway.Blind('G-файл есть, предел не прочитать: producer не найден в '+str(display.parent))
     absent+=1;print(label+': G не ведётся (сборка без G) · producer '+str(display));continue
    if not stat.S_ISREG(info.st_mode):raise gateway.Blind('producer G не обычный файл')
    policy=writer_policy(source)
    if policy['schemaVersion']==3:g_view=process_g_path(pid,fields,provider)
    directory=g_view[0] if g_view is not None else g_path(fields,provider)
    size,reason=g_safety(directory,uid)
    if reason:
     recheck();disabled+=1;alerts+=1;print('FAIL '+label+': ЖЁЛТОЕ · G выключен шлюзом: '+reason);continue
    if size is None:
     absent+=1
     if policy.get('legacyInline'):message,alert='G 3.1.6: файл создаётся при первом запросе, пока не ведётся',False
     else:message,alert=missing_g_status(start,source)
     recheck()
     alerts+=int(alert);print(('FAIL ' if alert else '')+label+': '+message+' · producer '+str(display));continue
    if policy['schemaVersion']==3:
     module=segment_module()
     try:snapshot=module.inspect_source(directory,uid,policy,time.time_ns()//1000000)
     except module.Unsafe as error:
      recheck();disabled+=1;alerts+=1;print('FAIL '+label+': ЖЁЛТОЕ · G выключен шлюзом: '+str(error));continue
     except module.Blind as error:raise gateway.Blind(str(error)) from None
     result=module.assess(snapshot,policy,time.time_ns()//1000000)
     first=None if snapshot['firstObservedAt'] is None else utc_ms(snapshot['firstObservedAt'])
     recheck();present+=1
     rates.append((snapshot['closedBytes7d'],snapshot['rateBytesPerSecond'],label))
     warning=result['warnings'];alerts+=bool(warning)
     oldest=snapshot['oldestClosedAt'];gc=result['gcLagging'];age='нет закрытых сегментов' if oldest is None else 'oldestClosedAtMs='+str(oldest)+' · возраст '+str((time.time_ns()//1000000-oldest)//1000)+' с'
     print('STEND-G-METRIC: GC · '+('FAIL ' if gc else '')+label+': '+('ЖЁЛТОЕ · GC отстаёт' if gc else 'ЗЕЛЁНОЕ · GC без отставания')+' · '+age)
     rotation=result['rotationLagging']
     if snapshot['activeBytes']==0:rotation_text='НЕЙТРАЛЬНО · '+label+' · ротация не требуется: active пуст'
     elif rotation:rotation_text='FAIL ЖЁЛТОЕ · ротация стоит: '+label+', первая запись '+first
     else:rotation_text='ЗЕЛЁНОЕ · ротация без отставания: '+label+', первая запись '+first
     print('STEND-G-METRIC: РОТАЦИЯ · '+rotation_text+' · openedAtMs='+str(snapshot['activeOpenedAt'])+' · firstObservedAtMs='+str(snapshot['firstObservedAt'])+' · segmentMaxAgeSeconds='+str(policy['segmentMaxAgeSeconds'])+' · WARN возраст > '+str(result['rotationWarnAfterSeconds'])+' с')
     growth=result['growthWarnings']
     print('STEND-G-METRIC: '+label+' · Разрастание · '+('FAIL ЖЁЛТОЕ' if growth else 'ЗЕЛЁНОЕ')+' · measuredAtMs='+str(time.time_ns()//1000000)+' · источник '+str(snapshot['bytes'])+' байт · totalBytes='+str(snapshot['bytes'])+' · allocatedBytes='+str(snapshot['allocated'])+' · segmentFiles='+str(snapshot['segmentFiles'])+' · closedBytes7d='+str(snapshot['closedBytes7d'])+' · скорость='+f"{snapshot['rateBytesPerSecond']:.9f}"+' байт/с · closedAt за 7 сут (active не входит) · WARN > '+str(result['fileWarnAbove'])+' файлов · размер WARN > '+str(result['byteWarnAbove'])+' байт · пороги '+result['thresholdStage']+(' · '+'; '.join(growth) if growth else ''))
     print('STEND-G-METRIC: СПРАВКА · '+label+' · фактически файлов источника '+str(snapshot['sourceFiles'])+' · файлов segments '+str(snapshot['segmentFiles'])+' · ожидаемо при закрытии по часу: '+str(result['hourlyExpectedFiles'])+' (2(N+1)+4+2) · Гамма')
     for reason in result['extraWarnings']:print('FAIL '+label+': ЖЁЛТОЕ · '+reason)
     continue
    warning,limit=thresholds(source)
    present+=1;recheck()
    color='КРАСНОЕ' if size>=limit else ('ЖЁЛТОЕ' if size>=warning else 'ЗЕЛЁНОЕ')
    alert=color!='ЗЕЛЁНОЕ';alerts+=int(alert)
    # FAIL is the existing nightly reader's cause selector, including warnings.
    print(('FAIL ' if alert else '')+label+f': {size/MIB:.6f} МиБ из {limit/MIB:g} · {color} · {size} байт'+(' · риск SOURCE_GAP по размеру' if alert else ''))
   except (gateway.Blind,OSError) as error:
    blind+=1;reason=str(error) if isinstance(error,gateway.Blind) else 'источник недоступен'
    print('СЛЕПОТА '+unit+': '+reason)
 except (gateway.Blind,gateway.Deadline) as error:blind+=1;print('СЛЕПОТА: '+str(error))
 if not count:blind+=1;print('СЛЕПОТА: живых Codex/Claude-шлюзов не обнаружено')
 if rates:
  largest,rate,label=max(rates,key=lambda sample:sample[0]);scope='частичный' if blind or len(rates)!=count else 'полный'
  print('STEND-G-METRIC: МАКСИМУМ · '+label+' · скорость='+f'{rate:.9f}'+' байт/с · closedBytes7d='+str(largest)+' / 604800 с · измерено '+str(len(rates))+' из '+str(count)+' · '+scope+' замер; порог выбирать по самому быстрому шлюзу')
 else:print('STEND-G-METRIC: МАКСИМУМ · не измерен · измерено 0 из '+str(count)+' шлюзов; нет измеренных schema3-источников')
 print(f'шлюзов {count} · с G {present} · без G {absent} · G выключен {disabled}')
 return 2 if blind else (1 if alerts else 0)

def main(argv=None):
 argparse.ArgumentParser(description=__doc__,allow_abbrev=False).parse_args(argv)
 def expired(signum,frame):raise gateway.Deadline('предел 30 с')
 previous=signal.signal(signal.SIGALRM,expired);signal.alarm(gateway.SECONDS)
 try:return check()
 finally:signal.alarm(0);signal.signal(signal.SIGALRM,previous)
if __name__=='__main__':raise SystemExit(main())
