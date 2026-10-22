"""Bounded resumable JSONL projection; prompt/tool-input strings are never retained.

Only the native metering/identity fields consumed by team_usage are materialized.
The grammar is checked even in discarded subtrees; duplicate keys are checked in
projected objects (duplicates inside discarded tool input have no metering use).
"""
import codecs
import hashlib
import json
import re

DEPTH=64
CHECKPOINT=512*1024
PROJECTION=256*1024
PATHS={tuple(p.split('.')) for p in (
 'type timestamp sessionId uuid parentUuid promptId agentId version isApiErrorMessage error '
 'payload.id payload.parent_thread_id payload.cli_version payload.multi_agent_version '
 'payload.source.subagent.thread_spawn.parent_thread_id payload.type payload.turn_id '
 'payload.response_id payload.root_turn_id payload.parent_turn_id '
 'payload.turn_attribution.parent_turn_id payload.turn_attribution.root_turn_id '
 'payload.name payload.call_id payload.reason message.id message.model message.role '
 'message.content.*.type message.content.*.id message.content.*.name').split()}
USAGE=(('payload','usage'),('message','usage'))
NUMBER=re.compile(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z')
class DecodeError(ValueError):pass
def fail(reason='SOURCE_JSON_INVALID'):raise DecodeError(reason)
def encoded(value):return json.dumps(value,separators=(',',':'),ensure_ascii=True)
def wanted(path):
 return path is not None and (any(p[:len(path)]==tuple(path) for p in PATHS) or any(tuple(path[:len(p)])==p or p[:len(path)]==tuple(path) for p in USAGE))

class Decoder:
 def __init__(self,checkpoint=None):
  self.utf8=codecs.getincrementaldecoder('utf-8')()
  self.s=json.loads(checkpoint) if checkpoint else dict(stack=[],token=None,root=None,done=False,touched=False,utf8=[])
  self.utf8.setstate((bytes(self.s['utf8']),0))
 def checkpoint(self):
  partial=sum(len(encoded(f['out']).encode()) for f in self.s['stack'] if f['out'] is not None)
  if self.s['root'] is not None:partial+=len(encoded(self.s['root']).encode())
  token=self.s['token']
  if token and token.get('keep'):partial+=len(encoded(token['buf']).encode())
  if partial>PROJECTION:fail('RAW_DECODER_LIMIT_EXCEEDED')
  self.s['utf8']=list(self.utf8.getstate()[0]);out=encoded(self.s)
  if len(out.encode())>CHECKPOINT:fail('RAW_DECODER_LIMIT_EXCEEDED')
  return out
 def _path(self):
  if not self.s['stack']:return []
  f=self.s['stack'][-1]
  if f['path'] is None:return None
  return f['path']+['*'] if f['kind']=='array' else f['next_path']
 def _accept(self,value,keep=True):
  if not self.s['stack']:
   if type(value) is not dict:fail('SOURCE_SCHEMA_INVALID')
   self.s.update(root=value,done=True);return
  f=self.s['stack'][-1]
  if keep and f['out'] is not None and wanted(self._path()) and not (value in ({},[]) and not any(tuple((self._path() or [])[:len(p)])==p for p in USAGE)):
   if f['kind']=='object':f['out'][f['key']]=value
   else:f['out'].append(value)
  f['state']='comma'
 def _start(self,kind):
  if len(self.s['stack'])>=DEPTH:fail('RAW_DECODER_LIMIT_EXCEEDED')
  path=self._path();keep=wanted(path)
  self.s['stack'].append(dict(kind=kind,path=path if keep else None,out=({} if kind=='object' else []) if keep else None,state='key_or_end' if kind=='object' else 'value_or_end',seen=[],key=None,next_path=None))
 def _close(self):
  f=self.s['stack'].pop();self._accept(f['out'])
 def _string(self,key):
  path=self._path()
  scalar=path is not None and (tuple(path) in PATHS or any(tuple(path[:len(p)])==p for p in USAGE))
  keep=key and self.s['stack'][-1]['path'] is not None or not key and scalar
  self.s['token']=dict(kind='string',key=key,keep=keep,buf='"' if keep else '',escape=False,unicode=0)
 def _finish_string(self,t):
  value=None
  if t['keep']:
   try:value=json.loads(t['buf']+'"')
   except ValueError:fail()
  self.s['token']=None
  if t['key']:
   f=self.s['stack'][-1];path=None
   if t['keep']:
    key_hash=hashlib.sha256(value.encode('utf-8','surrogatepass')).hexdigest()
    if key_hash in f['seen']:fail()
    f['seen'].append(key_hash);path=f['path']+[value]
   keep=wanted(path);f.update(key=value if keep else None,next_path=path if keep else None,state='colon')
  else:self._accept(value,t['keep'])
 def _char_string(self,c,t):
  if t['unicode']:
   if c not in '0123456789abcdefABCDEF':fail()
   t['unicode']-=1
  elif t['escape']:
   if c not in '"\\/bfnrtu':fail()
   if c=='u':t['unicode']=4
   t['escape']=False
  elif c=='"':
   self._finish_string(t);return
  elif c=='\\':t['escape']=True
  elif ord(c)<32:fail()
  if t['keep']:
   t['buf']+=c
   if len(t['buf'])>PROJECTION:fail('RAW_DECODER_LIMIT_EXCEEDED')
 def _atom_end(self,t):
  token=t['buf']
  if token not in ('true','false','null') and not NUMBER.fullmatch(token):fail()
  try:value=json.loads(token)
  except ValueError:fail()
  if type(value) is float and not (-float('inf')<value<float('inf')):fail()
  self.s['token']=None;self._accept(value)
 def _char(self,c):
  t=self.s['token']
  if t:
   if t['kind']=='string':self._char_string(c,t);return
   if c not in ' \t\r\n,]}':
    t['buf']+=c
    if len(t['buf'])>512:fail('RAW_DECODER_LIMIT_EXCEEDED')
    return
   self._atom_end(t)
  if self.s['done']:
   if c not in ' \t\r\n':fail()
   return
  if c in ' \t\r\n':return
  self.s['touched']=True
  if self.s['stack']:
   f=self.s['stack'][-1];state=f['state']
   if state in ('key_or_end','key'):
    if c=='}' and state=='key_or_end':self._close();return
    if c!='"':fail()
    self._string(True);return
   if state=='colon':
    if c!=':':fail()
    f['state']='value';return
   if state=='comma':
    if c==('}' if f['kind']=='object' else ']'):self._close();return
    if c!=',':fail()
    f['state']='key' if f['kind']=='object' else 'value';return
   if state=='value_or_end' and c==']':self._close();return
  if c=='{':self._start('object')
  elif c=='[':self._start('array')
  elif c=='"':self._string(False)
  elif c in '-0123456789tfn':self.s['token']=dict(kind='atom',buf=c)
  else:fail()
 def feed(self,data):
  try:text=self.utf8.decode(data)
  except UnicodeError:fail()
  out=[]
  for c in text:
   self._char(c)
   if c=='\n':
    if self.s['token'] or self.s['stack'] or self.s['touched'] and not self.s['done']:fail()
    if self.s['done']:
     row=self.s['root']
     if len(encoded(row).encode())>PROJECTION:fail('RAW_DECODER_LIMIT_EXCEEDED')
     out.append(row)
    self.s.update(stack=[],token=None,root=None,done=False,touched=False)
  self.checkpoint()
  return out
 def complete(self):return not self.s['token'] and not self.s['stack'] and not self.s['touched'] and not self.utf8.getstate()[0]
