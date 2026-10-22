#!/usr/bin/env python3
"""Night accounting: readonly queue, terminal UNBOUND, account map and providers.
No credentials/status schema is guessed. 0 healthy/no subject,1 yellow,2 blind.
One pass30s, <=128units, subprocess3s, environ1MiB/config256KiB, retry0.
"""
from datetime import datetime
import argparse,hashlib,importlib.util,json,math,os,re,signal,stat,subprocess,time,tomllib
from pathlib import Path
import sys;sys.dont_write_bytecode=True  # 19.10 (наряд Забавы 05:11Z): загрузка stend-codex-app-server.py модулем не пишет __pycache__ в дерево (от root — чужой хозяин в дереве Искры)
spec=importlib.util.spec_from_file_location('accounting_gateway',Path(__file__).with_name('stend-codex-app-server.py'))
gateway=importlib.util.module_from_spec(spec);spec.loader.exec_module(gateway)
QUEUE=Path('/var/lib/autopilot-mail/mail.sqlite')
QUEUE_WARN=64
UNBOUND_WARN=8
EXPECTED_CODEX=11
CONFIG_MAX=256*1024
PREFIX='STEND-AP-METRIC: '

def queue_line(path=QUEUE,now=None):
 now=time.time() if now is None else now
 def query(sql):
  try:q=subprocess.run(['bwrap','--die-with-parent','--ro-bind','/','/','--unshare-net','sqlite3','-readonly','-json','-cmd','.timeout 1000',str(path),sql],capture_output=True,text=True,timeout=3)
  except (OSError,subprocess.TimeoutExpired):raise gateway.Blind('sqlite3 недоступен/timeout3с') from None
  if q.returncode:raise gateway.Blind('SQLite чтение/схема недоступны')
  if len(q.stdout)>4096:raise gateway.Blind('SQLite ответ больше4096байт')
  try:return json.loads(q.stdout)
  except (ValueError,RecursionError):raise gateway.Blind('SQLite негодный ответ') from None
 try:
  try:info=path.lstat()
  except FileNotFoundError:return 2,'ОЧЕРЕДЬ · СЛЕПОТА · БД отсутствует · '+str(path)
  if not stat.S_ISREG(info.st_mode):raise gateway.Blind('БД не обычный файл')
  schema="SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='usage_registrations';"
  subject=query(schema)
  if subject==[{'n':0}]:
   if query(schema)!=subject:raise gateway.Blind('usage_registrations появилась во время чтения')
   after=path.lstat()
   if (info.st_dev,info.st_ino)!=(after.st_dev,after.st_ino):raise gateway.Blind('БД подменена во время чтения')
   return 0,'ОЧЕРЕДЬ · нет предмета: таблицы usage_registrations нет · '+str(path)
  if subject!=[{'n':1}]:raise gateway.Blind('usage_registrations не определена')
  rows=query("BEGIN; SELECT COUNT(*) AS n, MIN(CAST(accepted_at AS REAL)) AS lo, MAX(CAST(accepted_at AS REAL)) AS hi, COALESCE(SUM(CASE WHEN typeof(accepted_at) NOT IN ('integer','real') OR accepted_at<0 OR accepted_at>"+str(float(now))+" THEN 1 ELSE 0 END),0) AS bad FROM usage_registrations; ROLLBACK;")
  if len(rows)!=1 or set(rows[0])!={'n','lo','hi','bad'}:raise gateway.Blind('usage_registrations негодная агрегация')
  row=rows[0];n=row['n']
  if type(n) is not int or n<0 or row['bad']!=0:raise gateway.Blind('usage_registrations негодные accepted_at')
  if n and any(type(row[k]) not in (int,float) or not math.isfinite(row[k]) for k in ('lo','hi')):raise gateway.Blind('usage_registrations негодные accepted_at')
  if not n and (row['lo'] is not None or row['hi'] is not None):raise gateway.Blind('usage_registrations несогласованный ноль')
  after=path.lstat()
  if (info.st_dev,info.st_ino)!=(after.st_dev,after.st_ino):raise gateway.Blind('БД подменена во время чтения')
  yellow=n>=QUEUE_WARN
  def number(value):return str(int(value)) if float(value).is_integer() else str(value)
  span='accepted_at=NULL..NULL' if n==0 else 'MIN accepted_at='+number(row['lo'])+' · MAX accepted_at='+number(row['hi'])+' · epoch-секунды UTC'
  return int(yellow),'ОЧЕРЕДЬ · '+('FAIL ЖЁЛТОЕ' if yellow else 'ЗЕЛЁНОЕ')+' · COUNT='+str(n)+' · '+span+' · WARN >=64 · '+str(path)
 except (gateway.Blind,OSError):return 2,'ОЧЕРЕДЬ · СЛЕПОТА · usage_registrations не измерена · '+str(path)

# Issuer contract: Beta07207242 runtime/codex_account_map.py and window builder.
MAP=Path('/var/lib/autopilot-usage/codex-account-map.json')
AUTH_ROOT=Path('/etc/claude-oauth')

def file_stamp(s):return s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_uid,s.st_mode,s.st_nlink

def trusted_json(path,limit,mode=None):
 parents=[]
 for parent in path.parents:
  info=parent.lstat()
  if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise gateway.Blind('root JSON: небезопасный родитель')
  parents.append((parent,(info.st_dev,info.st_ino,info.st_mode,info.st_uid)))
 before=path.lstat()
 if not stat.S_ISREG(before.st_mode) or before.st_uid!=0 or before.st_mode&0o022 or before.st_nlink!=1 or mode is not None and stat.S_IMODE(before.st_mode)!=mode:raise gateway.Blind('root JSON: небезопасный файл')
 if before.st_size>limit:raise gateway.Blind('root JSON: превышен размер')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  if file_stamp(os.fstat(fd))!=file_stamp(before):raise gateway.Blind('root JSON изменился')
  raw=os.read(fd,limit+1)
  if len(raw)!=before.st_size or file_stamp(os.fstat(fd))!=file_stamp(before):raise gateway.Blind('root JSON изменился')
 finally:os.close(fd)
 def pairs(items):
  value={}
  for key,item in items:
   if key in value:raise ValueError('duplicate JSON key')
   value[key]=item
  return value
 try:value=json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda value:(_ for _ in ()).throw(ValueError('non-JSON number')))
 except (ValueError,UnicodeError,RecursionError):raise gateway.Blind('root JSON негодный') from None
 token=(path,file_stamp(before),parents);trusted_recheck(token);return value,token

def trusted_recheck(token):
 path,before,parents=token
 if file_stamp(path.lstat())!=before:raise gateway.Blind('root JSON изменился')
 for parent,stamp in parents:
  info=parent.lstat()
  if (info.st_dev,info.st_ino,info.st_mode,info.st_uid)!=stamp:raise gateway.Blind('root JSON родитель изменился')

def account_line():
 try:
  value,map_token=trusted_json(MAP,65536,0o644)
  if type(value) is not dict or set(value)!={'schemaVersion','accounts'} or type(value['schemaVersion']) is not int or value['schemaVersion']!=1:raise gateway.Blind('негодная схема карты')
  accounts=value['accounts']
  if type(accounts) is not dict or not 1<=len(accounts)<=2 or any(type(k) is not str or not re.fullmatch('[0-9a-f]{64}',k) or type(v) is not str or v not in {'codex-3','codex-4'} for k,v in accounts.items()) or len(set(accounts.values()))!=len(accounts):raise gateway.Blind('негодные accounts карты')
  expected={};tokens=[map_token];duplicate=False
  for number in (3,4):
   path=AUTH_ROOT/('codex-podpiska-'+str(number))/'auth.json';source,token=trusted_json(path,1048576);tokens.append(token)
   selected=source.get('tokens') if type(source) is dict else None;selected=selected.get('account_id') if type(selected) is dict else None
   if type(selected) is not str or not 0<len(selected)<=4096:raise gateway.Blind('account_id не определён')
   digest=hashlib.sha256(selected.encode('utf-8')).hexdigest();duplicate=duplicate or digest in expected;expected[digest]='codex-'+str(number)
  for token in tokens:trusted_recheck(token)
  stale=duplicate or accounts!=expected
  return int(stale),'КАРТА · '+('FAIL ЖЁЛТОЕ · карта устарела' if stale else 'ЗЕЛЁНОЕ · совпадает')+' · проверены auth.json 2 из 2 слотов codex-3/codex-4 · '+str(MAP)
 except (gateway.Blind,OSError,ValueError,UnicodeError):return 2,'КАРТА · СЛЕПОТА · карта/auth.json/владелец/схема не подтверждены · '+str(MAP)

STATUS_ROOT=Path('/var/lib/autopilot-usage/registrations')
MAX_STATUSES=4096
MAX_STATUS_TOTAL=32*1024*1024

def utc_seconds(value):
 if type(value) is not str or len(value)>64:raise gateway.Blind('негодная UTC-дата root-статуса')
 try:stamp=datetime.fromisoformat(value.replace('Z','+00:00'))
 except ValueError:raise gateway.Blind('негодная UTC-дата root-статуса') from None
 if stamp.utcoffset() is None or stamp.utcoffset().total_seconds()!=0:raise gateway.Blind('дата root-статуса не UTC')
 return stamp.timestamp()

def unbound_line(root=STATUS_ROOT,now=None):
 now=time.time() if now is None else now
 try:
  before=root.lstat();parents=[]
  for directory in [root,*root.parents]:
   info=directory.lstat()
   if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise gateway.Blind('небезопасный каталог root-статусов')
   parents.append((directory,(info.st_dev,info.st_ino,info.st_mode,info.st_uid)))
  paths=[]
  with os.scandir(root) as entries:
   for entry in entries:
    if len(paths)>=MAX_STATUSES:raise gateway.Blind('root-статусов больше4096')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.json',entry.name):raise gateway.Blind('неизвестное имя root-статуса')
    paths.append(root/entry.name)
  keys={'schemaVersion','runId','projectRef','requestSHA256','state','reason','startedAt','acceptedAt','registeredAt','checkedAt','terminal','retryUntil'}
  counts={};tokens=[];total=window=selected=0
  for path in sorted(paths):
   row,token=trusted_json(path,min(16384,MAX_STATUS_TOTAL-total));tokens.append(token);total+=token[1][2]
   if type(row) is not dict or set(row)!=keys or type(row['schemaVersion']) is not int or row['schemaVersion']!=1 or row['runId']!=path.stem or type(row['terminal']) is not bool or row['state'] not in ('UNBOUND','REGISTERED'):raise gateway.Blind('негодная схема root-статуса')
   if any(type(row[k]) is not str or re.fullmatch('[0-9a-f]{64}',row[k]) is None for k in ('projectRef','requestSHA256')):raise gateway.Blind('негодная identity root-статуса')
   if row['state']=='UNBOUND':
    if type(row['reason']) is not str or re.fullmatch('[A-Z][A-Z0-9_]{0,79}',row['reason']) is None or row['registeredAt'] is not None:raise gateway.Blind('негодный UNBOUND root-статус')
   elif row['reason'] is not None or not row['terminal'] or type(row['registeredAt']) is not str:raise gateway.Blind('негодный REGISTERED root-статус')
   if row['terminal'] and row['retryUntil'] is not None:raise gateway.Blind('негодный terminal retryUntil')
   accepted=utc_seconds(row['acceptedAt']);utc_seconds(row['startedAt']);utc_seconds(row['checkedAt'])
   if row['state']=='REGISTERED':utc_seconds(row['registeredAt'])
   if not row['terminal']:
    if row['reason'] not in {'REGISTRATION_CONTEXT_UNAVAILABLE','REGISTRATION_SOURCE_LAG','REGISTRATION_IN_PROGRESS'} or utc_seconds(row['retryUntil'])<accepted:raise gateway.Blind('негодный pending root-статус')
   if not 0<=accepted<=now:raise gateway.Blind('acceptedAt вне диапазона')
   if not now-86400<accepted<=now:continue
   window+=1
   if row['state']=='UNBOUND' and row['terminal']:
    selected+=1;reason=row['reason'];counts[reason]=counts.get(reason,0)+1
    if len(counts)>128:raise gateway.Blind('причин UNBOUND больше128')
  for token in tokens:trusted_recheck(token)
  for directory,old in parents:
   info=directory.lstat()
   if (info.st_dev,info.st_ino,info.st_mode,info.st_uid)!=old:raise gateway.Blind('каталог root-статусов изменился')
  if file_stamp(root.lstat())!=file_stamp(before):raise gateway.Blind('набор root-статусов изменился')
  yellow=any(value>UNBOUND_WARN for value in counts.values());groups=' · '.join(reason+'='+str(counts[reason]) for reason in sorted(counts)) or 'нет конечных UNBOUND'
  return int(yellow),'UNBOUND · '+('FAIL ЖЁЛТОЕ' if yellow else 'ЗЕЛЁНОЕ')+' · принятые за 24 ч заявки, сейчас конечные UNBOUND (по причинам) · по acceptedAt: '+str(selected)+' из '+str(window)+' root-статусов заявок в окне · '+groups+' · WARN причина >'+str(UNBOUND_WARN)+' (стартовая) · просмотрено '+str(len(paths))+' root-статусов · старые заявки, ставшие terminal сегодня, вне окна · '+str(root)
 except (gateway.Blind,OSError,ValueError,TypeError,OverflowError):return 2,'UNBOUND · СЛЕПОТА · root-статусы/схема/окно acceptedAt не подтверждены · '+str(root)

def environment(pid):
 raw=gateway.read_limited(gateway.PROC/str(pid)/'environ',gateway.LIMIT)
 if not raw.endswith(b'\0'):raise gateway.Blind('environ неполный')
 fields={}
 for item in raw.split(b'\0'):
  key,sep,value=item.partition(b'=')
  if key not in {b'GATEWAY_POSTAVSHIK',b'CODEX_HOME'}:continue
  if not sep or key in fields:raise gateway.Blind('environ неоднозначный')
  fields[key]=value
 try:provider=fields.get(b'GATEWAY_POSTAVSHIK',b'').decode('utf-8').strip(gateway.JS_TRIM)
 except UnicodeError:raise gateway.Blind('provider не UTF8') from None
 if not provider:raise gateway.Blind('provider не определён')
 return provider,fields

def config_path(pid,fields):
 try:home=Path(fields.get(b'CODEX_HOME',b'').decode('utf-8'))
 except UnicodeError:raise gateway.Blind('CODEX_HOME не UTF8') from None
 if not home.is_absolute() or '..' in home.parts:raise gateway.Blind('CODEX_HOME не абсолютный/неоднозначный')
 root=gateway.PROC/str(pid)/'root';at=root;parents=[]
 for part in home.parts[1:]:
  at=at/part;s=at.lstat()
  if not stat.S_ISDIR(s.st_mode):raise gateway.Blind('CODEX_HOME родитель не обычный каталог')
  parents.append((s.st_dev,s.st_ino,s.st_mode,s.st_uid))
 return at/'config.toml',str(home/'config.toml'),tuple(parents)

def config_state(path):
 try:before=path.lstat()
 except FileNotFoundError:return False,None
 def stamp(s):return s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns
 if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1 or before.st_size>CONFIG_MAX:raise gateway.Blind('config.toml негодный тип/размер/nlink')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  if stamp(os.fstat(fd))!=stamp(before):raise gateway.Blind('config.toml изменился')
  raw=os.read(fd,CONFIG_MAX+1)
  if len(raw)!=before.st_size or stamp(os.fstat(fd))!=stamp(before):raise gateway.Blind('config.toml изменился')
 finally:os.close(fd)
 if stamp(path.lstat())!=stamp(before):raise gateway.Blind('config.toml изменился')
 try:value=tomllib.loads(raw.decode('utf-8'))
 except (ValueError,UnicodeError,RecursionError):raise gateway.Blind('config.toml негодный TOML') from None
 profiles=value.get('profiles',{})
 if not isinstance(profiles,dict) or any(not isinstance(profile,dict) for profile in profiles.values()):raise gateway.Blind('config.toml: profiles не таблица профилей')
 return 'model_provider' in value or 'model_providers' in value or any('model_provider' in profile for profile in profiles.values()),stamp(before)

def provider_lines():
 deadline=time.monotonic()+30;count=measured=0;rc=0;rows=[]
 try:
  for unit in gateway.units(deadline):
   try:
    pid=gateway.pid_of(deadline,unit)
    if not pid:continue
    start=gateway.start_of(pid);provider,fields=environment(pid)
    if provider!='openai':
     if gateway.pid_of(deadline,unit)!=pid or gateway.start_of(pid)!=start or environment(pid)!=(provider,fields):raise gateway.Blind('исключённый процесс изменился')
     continue
    count+=1;path,display,parents=config_path(pid,fields);custom,stamp=config_state(path)
    if gateway.pid_of(deadline,unit)!=pid or gateway.start_of(pid)!=start or environment(pid)!=(provider,fields) or config_path(pid,fields)[2]!=parents or config_state(path)!=(custom,stamp):raise gateway.Blind('процесс/config изменился при чтении')
    measured+=1;rc=max(rc,int(custom));rows.append('ПРОВАЙДЕР · '+unit+' · '+('FAIL ЖЁЛТОЕ · свой провайдер — подписка по account/read не доказывает' if custom else 'ЗЕЛЁНОЕ · переопределений нет')+' · '+display)
   except (gateway.Blind,OSError,ValueError):rc=2;rows.append('ПРОВАЙДЕР · СЛЕПОТА · '+unit+' · процесс/CODEX_HOME/config не измерен')
 except (gateway.Blind,gateway.Deadline):rc=2;rows.append('ПРОВАЙДЕР · СЛЕПОТА · перечень шлюзов неполон')
 if count!=EXPECTED_CODEX or measured!=count:rc=2
 rows.append('ПРОВАЙДЕР · '+('СЛЕПОТА · ' if rc==2 else '')+'проверено '+str(measured)+' из '+str(count)+' обнаруженных Codex-шлюзов · ожидается '+str(EXPECTED_CODEX))
 return rc,rows

def main(argv=None):
 argparse.ArgumentParser(description=__doc__,allow_abbrev=False).parse_args(argv)
 if os.geteuid()!=0:print(PREFIX+'СЛЕПОТА · требуется root');return 2
 def expired(signum,frame):raise gateway.Deadline('общий предел30с')
 old=signal.signal(signal.SIGALRM,expired);signal.alarm(30)
 try:
  rc,row=queue_line();print(PREFIX+row)
  unbound_rc,unbound_row=unbound_line();print(PREFIX+unbound_row);rc=max(rc,unbound_rc)
  map_rc,map_row=account_line();print(PREFIX+map_row);rc=max(rc,map_rc)
  code,rows=provider_lines()
  for row in rows:print(PREFIX+row)
  return max(rc,code)
 except gateway.Deadline:print(PREFIX+'СЛЕПОТА · общий предел30с, неполный проход');return 2
 finally:signal.alarm(0);signal.signal(signal.SIGALRM,old)
if __name__=='__main__':raise SystemExit(main())
