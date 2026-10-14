#!/usr/bin/python3 -ISB
"""One-time, explicitly reviewed baseline; never called by the normal lift."""
import argparse,datetime,fcntl,hashlib,importlib.util,json,os,pathlib,re,stat,sys
spec=importlib.util.spec_from_file_location('sled',pathlib.Path(__file__).with_name('check-sled.py'))
sled=importlib.util.module_from_spec(spec);spec.loader.exec_module(sled)
LIMIT=16*1024*1024
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__);g=p.add_mutually_exclusive_group(required=True)
 g.add_argument('--plan',action='store_true');g.add_argument('--apply',metavar='REVIEWED_JSON')
 p.add_argument('--directory',required=True);p.add_argument('--services',nargs='+',required=True);p.add_argument('--operator',required=True)
 a=p.parse_args();root=pathlib.Path(a.directory).resolve();services=sorted(a.services)
 if len(services)!=len(set(services)) or any(not re.fullmatch(r'[a-z][a-z0-9-]*\.service',x) for x in services):raise ValueError('неоднозначные/негодные службы')
 if not re.fullmatch(r'[a-zA-Z0-9_.-]+',a.operator):raise ValueError('негодная рука базиса')
 journal=root/'zhurnal-podyomov.txt';locks=[]
 try:
  if a.apply:
   for service in services:
    path=root/('.podyom-'+service[:-8]+'.lock')
    try:
     fd=os.open(path,os.O_RDONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644);os.fchmod(fd,0o644)
    except FileExistsError:fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    locks.append(fd);st=os.fstat(fd);named=os.stat(path,follow_symlinks=False)
    if not stat.S_ISREG(st.st_mode) or (st.st_dev,st.st_ino)!=(named.st_dev,named.st_ino) or st.st_uid not in (0,root.stat().st_uid) or st.st_mode&0o022:raise ValueError('негодный lock '+str(path))
    fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  old=sled.read(journal,LIMIT);rows=[]
  for service in services:
   for prefix,phase,field in [('kanon-podyoma-','ДО','kanon_md5'),('snimok-kanonov-','ПОСЛЕ','snimok_md5')]:
    path=root/(prefix+service[:-8]+'.txt');data=sled.read(path,8*1024*1024)
    rows.append(dict(file=str(path),service=service,phase=phase,field=field,md5=hashlib.md5(data).hexdigest(),sha256=sha(data)))
  if sled.read(journal,LIMIT)!=old:raise ValueError('журнал изменился во время снимка')
  if a.plan:
   for line in old.decode().splitlines():
    cols=[c.strip() for c in line.split('|')]
    if len(cols)>=3 and cols[2] in services+['артефакт '+s for s in services] and any('md5 ' in c for c in cols[3:]):raise ValueError('опора MD5 уже есть; повторный базис запрещён')
   plan=dict(journal=str(journal),journal_sha256=sha(old),operator=a.operator,created=datetime.datetime.now(datetime.timezone.utc).isoformat(),rows=rows)
   print(json.dumps(plan,ensure_ascii=False,indent=2));return
  plan=json.loads(sled.read(a.apply,1024*1024))
  if plan['journal']!=str(journal) or plan['operator']!=a.operator or plan['rows']!=rows:raise ValueError('план не совпал с текущими файлами/рукой')
  # Field values come from freshly verified rows; timestamp from a validated ISO plan.
  when=datetime.datetime.fromisoformat(plan['created']).isoformat()
  suffix=''.join(f'{when} | БАЗИС-{r["phase"]} | артефакт {r["service"]} | {r["field"]} {r["md5"]} | рука {a.operator} | B-N-1218\n' for r in rows).encode()
  if old.endswith(suffix) and sha(old[:-len(suffix)])==plan['journal_sha256']:
   print('БАЗИС уже записан, добавлено 0');return
  if sha(old)!=plan['journal_sha256']:raise ValueError('журнал изменился после плана; отказ без записи')
  if old and not old.endswith(b'\n'):raise ValueError('неполная последняя строка журнала')
  if len(old)+len(suffix)>LIMIT:raise ValueError(f'журнал превысит предел {LIMIT} байт (16 МиБ)')
  fd=os.open(journal,os.O_WRONLY|os.O_APPEND|os.O_NOFOLLOW|os.O_NONBLOCK)
  try:
   if not stat.S_ISREG(os.fstat(fd).st_mode):raise ValueError('журнал не обычный файл')
   if sled.read(journal,LIMIT)!=old:raise ValueError('журнал изменился перед записью')
   if os.write(fd,suffix)!=len(suffix):raise ValueError('неполная запись базиса; требуется ручная сверка со страховкой')
   os.fsync(fd)
  finally:os.close(fd)
  if sled.read(journal,LIMIT)!=old+suffix:raise ValueError('пост-чтение журнала не совпало')
  print(f'БАЗИС записан: {len(rows)} строк, sha256 журнала {sha(old+suffix)}')
 finally:
  for fd in locks:os.close(fd)
if __name__=='__main__':
 try:main()
 except (OSError,ValueError,KeyError,TypeError) as e:print('ОТКАЗ БАЗИСА: '+str(e),file=sys.stderr);sys.exit(1)
