#!/usr/bin/python3
"""Root-only key form/permissions. Never writes, logs value, or changes a key.
Caller: dsh-autopilot-key-check.service, polled by its timer every60s.
Reader: service exit status/journal and registered nonroot healthcheck.
0 valid,1 named defect,2 cannot verify/root required; no network or subprocess.
Does not prove nginx copied the same key or TLS/auth availability.
"""
import argparse,os,re,stat,sys
from pathlib import Path

def check(root):
 if not root.is_absolute() or '..' in root.parts:raise ValueError('root path invalid')
 for parent in (root,*root.parents):
  st=parent.lstat()
  if not stat.S_ISDIR(st.st_mode) or st.st_uid!=0 or (st.st_mode&0o022 and not st.st_mode&stat.S_ISVTX):
   raise ValueError('parent symlink/type/owner')
 etc=root/'etc';st=etc.lstat()
 if not stat.S_ISDIR(st.st_mode) or st.st_uid!=0 or st.st_mode&0o022:raise ValueError('parent symlink/type/owner')
 directory=etc/'dsh-autopilot';st=directory.lstat()
 if not stat.S_ISDIR(st.st_mode) or (stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid)!=(0o700,0,0):raise ValueError('directory mode/owner')
 key=directory/'razdacha-klyuch';st=key.lstat()
 if not stat.S_ISREG(st.st_mode) or (stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid,st.st_nlink)!=(0o600,0,0,1):raise ValueError('key type/mode/owner')
 identity=lambda s:(s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
 fd=os.open(key,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  if identity(os.fstat(fd))!=identity(st):raise ValueError('key changed during check')
  data=os.read(fd,66)
  if not re.fullmatch(rb'[0-9a-f]{64}\n?',data):raise ValueError('key form')
  if identity(os.fstat(fd))!=identity(st) or identity(key.lstat())!=identity(st):raise ValueError('key changed during check')
 finally:os.close(fd)
 # A root writer racing ancestor replacement remains outside this bounded check.
 return 0

def main():
 if os.geteuid()!=0:print('BLIND: root required',file=sys.stderr);return 2
 parser=argparse.ArgumentParser(allow_abbrev=False);parser.add_argument('--root',type=Path,default=Path('/'));args=parser.parse_args()
 try:check(args.root)
 except ValueError as e:print('KEY INVALID /etc/dsh-autopilot/razdacha-klyuch: '+str(e),file=sys.stderr);return 1
 except OSError:print('KEY INVALID /etc/dsh-autopilot/razdacha-klyuch: missing/unreadable',file=sys.stderr);return 1
 print('KEY OK');return 0
if __name__=='__main__':sys.exit(main())
