#!/usr/bin/python3
# Explicit installer candidate. Never print key contents; existing keys are not replaced.
import argparse,os,pwd,re,secrets,yaml,stat
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--registry',required=True);p.add_argument('--directory',required=True);a=p.parse_args()
if os.geteuid()!=0:raise SystemExit('root required')
root=Path(a.directory)
if not root.is_absolute():raise SystemExit('absolute directory required')
root.mkdir(mode=0o755,parents=True,exist_ok=True)
st=root.lstat()
if not stat.S_ISDIR(st.st_mode) or st.st_uid!=0 or st.st_mode&0o022:raise SystemExit('directory must be root-owned and not group/world writable')
for row in yaml.safe_load(open(a.registry))['agenty']:
 n=row['namerenie']
 if n.get('raskladka',{}).get('port_shlyuza') is None:continue
 name=row['imya']
 if not re.fullmatch('[a-z][a-z0-9_-]*',name):raise SystemExit('invalid registry agent key')
 u=pwd.getpwnam(n['polzovatel']);f=root/(name+'.key')
 try:
  fd=os.open(f,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 except FileExistsError:
  try: existing=os.open(f,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  except OSError as error: raise SystemExit(f'{name}: отказ: существующий файл не проверен: {error.strerror}')
  try:
   present=os.fstat(existing)
   if not stat.S_ISREG(present.st_mode):raise SystemExit(f'{name}: отказ: существующий ключ не обычный файл')
   if present.st_uid!=u.pw_uid:raise SystemExit(f'{name}: отказ: владелец UID {present.st_uid}, ожидается {u.pw_uid}')
   if stat.S_IMODE(present.st_mode)!=0o600:raise SystemExit(f'{name}: отказ: режим {stat.S_IMODE(present.st_mode):04o}, ожидается 0600')
  finally:os.close(existing)
  print(name+': есть, не трогаю')
  continue
 try:
  os.fchown(fd,u.pw_uid,u.pw_gid);os.write(fd,secrets.token_hex(32).encode());os.fsync(fd)
 finally:os.close(fd)
 print(name+': private ingress key created')
