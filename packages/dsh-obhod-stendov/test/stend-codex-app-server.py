#!/usr/bin/env python3
"""B-N-2111 (27a): живые Codex-шлюзы должны явно работать через app-server.
Состав: systemctl list-units coder-gateway*, MainPID>0, живой GATEWAY_POSTAVSHIK=openai.
Не проверяет отсутствующие/остановленные шлюзы, версию G или полноту квитанций AP.
Один проход: <=128 юнитов, systemctl <=3 с/вызов, общий таймер30 с, environ<=1 MiB.
Коды:0 зелёное,1 красное,2 слепота; без записи состояния/перезапусков/чтения журналов.
"""
import argparse,os,re,signal,stat,subprocess,sys,time
from pathlib import Path
PROC=Path('/proc')
LIMIT=1024*1024
SECONDS=30
# Exactly the characters removed by gateway String.trim(); Unicode BOM is included.
JS_TRIM='\t\n\x0b\x0c\r \xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'

class Blind(Exception):pass
class Deadline(Exception):pass

def ctl(deadline,*args):
 left=deadline-time.monotonic()
 if left<=0:raise Deadline('предел 30 с')
 try:p=subprocess.run(['systemctl',*args],capture_output=True,text=True,timeout=min(3,left))
 except (OSError,subprocess.TimeoutExpired):raise Blind('systemctl недоступен или истёк timeout') from None
 if p.returncode:raise Blind('systemctl отказал, код '+str(p.returncode))
 return p.stdout

def units(deadline):
 text=ctl(deadline,'list-units','--all','--type=service','--no-legend','--plain','--no-pager','coder-gateway*')
 names=[line.split()[0] for line in text.splitlines() if line.strip()]
 if len(names)>128:raise Blind('перечень больше 128 юнитов')
 if len(names)!=len(set(names)) or any(not re.fullmatch(r'coder-gateway[-A-Za-z0-9_@.\\:]*\.service',u) for u in names):raise Blind('неоднозначный перечень coder-gateway*')
 return sorted(names)

def pid_of(deadline,unit):
 text=ctl(deadline,'show',unit,'-p','Id','-p','MainPID');props={}
 for line in text.splitlines():
  key,sep,value=line.partition('=')
  if key not in {'Id','MainPID'}:continue
  if key in props:raise Blind('повтор свойства systemctl')
  props[key]=value
 if props.get('Id')!=unit or not re.fullmatch(r'[0-9]+',props.get('MainPID','')):raise Blind('Id/MainPID не определён')
 return int(props['MainPID'])

def read_limited(path,limit):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 with os.fdopen(fd,'rb') as f:
  if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):raise Blind('proc-предмет не обычный файл')
  raw=f.read(limit+1)
 if len(raw)>limit:raise Blind('proc-предмет превысил предел чтения')
 return raw

def start_of(pid):
 raw=read_limited(PROC/str(pid)/'stat',16384)
 try:
  tail=raw.rsplit(b')',1)[1].split()
  if int(raw.split(b' ',1)[0])!=pid or not tail[19].isdigit():raise ValueError()
  return int(tail[19])
 except (IndexError,ValueError):raise Blind('stat/starttime не определён') from None

def selected_environment(pid):
 raw=read_limited(PROC/str(pid)/'environ',LIMIT)
 if not raw.endswith(b'\0'):raise Blind('environ не является полным NUL-срезом')
 fields={};wanted={b'GATEWAY_POSTAVSHIK',b'GATEWAY_CODEX_PUT'}
 for item in raw.split(b'\0'):
  key,sep,value=item.partition(b'=')
  if key not in wanted:continue
  if not sep or key in fields:raise Blind('неоднозначная переменная environ')
  fields[key]=value
 try:provider=fields.get(b'GATEWAY_POSTAVSHIK',b'').decode('utf-8').strip(JS_TRIM)
 except UnicodeDecodeError:raise Blind('GATEWAY_POSTAVSHIK не UTF-8') from None
 if not provider:raise Blind('GATEWAY_POSTAVSHIK не определён')
 return provider,fields.get(b'GATEWAY_CODEX_PUT')

def check():
 codex=app=bad=blind=0;deadline=time.monotonic()+SECONDS
 try:
  for unit in units(deadline):
   try:
    pid=pid_of(deadline,unit)
    if pid==0:continue
    start=start_of(pid);provider,mode=selected_environment(pid)
    if start_of(pid)!=start or pid_of(deadline,unit)!=pid:raise Blind('MainPID/starttime изменился во время чтения')
    if provider!='openai':
     print('ВНЕ ОБЛАСТИ '+unit+': поставщик не openai');continue
    codex+=1
    effective=(mode or b'').decode('utf-8',errors='replace').strip(JS_TRIM) or 'exec'
    if effective=='app-server':app+=1;print('ЗЕЛЁНОЕ '+unit+' MainPID='+str(pid))
    else:
     bad+=1;value='<нет>' if mode is None else ('exec' if effective=='exec' else '<иное>')
     print('КРАСНОЕ '+unit+' MainPID='+str(pid)+': GATEWAY_CODEX_PUT='+value+'; требуется app-server')
   except (Blind,OSError):
    error=sys.exc_info()[1];reason=str(error) if isinstance(error,Blind) else 'proc недоступен'
    blind+=1;print('СЛЕПОТА '+unit+': '+reason)
 except (Blind,Deadline) as error:blind+=1;print('СЛЕПОТА: '+str(error))
 if codex==0:blind+=1;print('СЛЕПОТА: живых Codex-шлюзов не обнаружено')
 print(f'Codex-шлюзов {codex} · app-server {app} · иначе {bad}')
 return 2 if blind else (1 if bad else 0)

def main(argv=None):
 argparse.ArgumentParser(description=__doc__,allow_abbrev=False).parse_args(argv)
 def expired(signum,frame):raise Deadline('предел 30 с')
 previous=signal.signal(signal.SIGALRM,expired);signal.alarm(SECONDS)
 try:return check()
 finally:signal.alarm(0);signal.signal(signal.SIGALRM,previous)

if __name__=='__main__':sys.exit(main())
