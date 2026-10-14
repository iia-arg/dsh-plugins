#!/usr/bin/env python3
import argparse,os,stat,pwd,secrets,hmac,re

def directory(path,uid,gid,mode):
 if not os.path.isabs(path) or os.path.normpath(path)!=path:raise ValueError('canonical absolute directory required')
 fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
 try:
  for name in path.strip('/').split('/'):
   nxt=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=nxt
  s=os.fstat(fd)
  if (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))!=(uid,gid,mode):raise ValueError('directory owner/mode rejected')
  return fd
 except:os.close(fd);raise

def read(fd,name,uid,gid,mode,env=False):
 try:f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
 except FileNotFoundError:return None
 try:
  s=os.fstat(f)
  if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))!=(uid,gid,mode):raise ValueError('key owner/mode rejected')
  text=os.read(f,256).decode('ascii');pattern=r'SOCSETI_MCP_KEY=([a-f0-9]{64})\n' if env else r'([a-f0-9]{64})\n?'
  m=re.fullmatch(pattern,text)
  if not m:raise ValueError('key file format rejected')
  return m[1]
 finally:os.close(f)

def write(fd,name,value,uid,gid,mode,env=False):
 f=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode,dir_fd=fd)
 try:
  os.fchown(f,uid,gid);os.fchmod(f,mode);data=((('SOCSETI_MCP_KEY=' if env else '')+value)+'\n').encode();os.write(f,data);os.fsync(f)
 finally:os.close(f)
 os.fsync(fd)

def main():
 p=argparse.ArgumentParser(allow_abbrev=False)
 for name in ['server-dir','service-user']:p.add_argument('--'+name,required=True)
 a=p.parse_args()
 if os.geteuid()!=0:raise ValueError('root required')
 su=pwd.getpwnam(a.service_user)
 sf=directory(a.server_dir,0,su.pw_gid,0o750)
 try:
  server=read(sf,'varvara.key',0,su.pw_gid,0o640);client=read(sf,'varvara-mcp.env',0,0,0o600,True);monitor=read(sf,'monitor.key',0,su.pw_gid,0o640)
  if server and client and not hmac.compare_digest(server,client):raise ValueError('existing keys conflict; not replaced')
  key=server or client or secrets.token_hex(32)
  if monitor and hmac.compare_digest(key,monitor):raise ValueError('role keys must differ')
  for name,value,gid,mode,env,existing in [('varvara.key',key,su.pw_gid,0o640,False,server),('varvara-mcp.env',key,0,0o600,True,client),('monitor.key',monitor or secrets.token_hex(32),su.pw_gid,0o640,False,monitor)]:
   if existing:print(name+': есть, не трогаю')
   else:write(sf,name,value,0,gid,mode,env);print(name+': создан')
 finally:os.close(sf)
if __name__=='__main__':
 try:main()
 except (ValueError,OSError,UnicodeError,KeyError):raise SystemExit('provision refused: verify directory/key ownership, modes, format and role separation')
