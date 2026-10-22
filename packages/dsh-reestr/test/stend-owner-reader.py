#!/usr/bin/env python3
"""B-N-2104(2): real owner rule under iskra, root:coders0640 JSON, bounded sudo read. No live files/services."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,tempfile
if len(sys.argv)>2:raise SystemExit(2)
source=Path(sys.argv[1])if len(sys.argv)==2 else Path(__file__).resolve().parents[1]/'bin/agent-registry'
with tempfile.TemporaryDirectory(prefix='bn2104-owner-')as td:
 t=Path(td);t.chmod(0o755);code=t/'agent-registry';shutil.copyfile(source,code);code.chmod(0o644);assert hashlib.sha256(source.read_bytes()).digest()==hashlib.sha256(code.read_bytes()).digest()
 config=t/'A.yml';config.write_text('plugins:\n  - module: dsh-telegram-multiagent\n    config:\n      allowedUsers: [111, 222]\n      ownerChatId: 222\n      settingsFile: '+str(t/'delivery.json')+'\n');config.chmod(0o644)
 data=t/'delivery.json';data.write_text('{"ownerChatId":111}\n')
 subprocess.run(['sudo','-n','chown','root:coders',str(data)],check=True);subprocess.run(['sudo','-n','chmod','0640',str(data)],check=True)
 denied=t/'denied';denied.mkdir();(denied/'sudo').write_text('#!/bin/sh\nexit 1\n');(denied/'sudo').chmod(0o755)
 runner=t/'probe.py';runner.write_text('''import importlib.machinery,importlib.util,json,os,sys
loader=importlib.machinery.SourceFileLoader('owner_candidate',sys.argv[1]);spec=importlib.util.spec_from_loader(loader.name,loader);m=importlib.util.module_from_spec(spec);loader.exec_module(m)
assert m.moya_ruka()=='iskra';assert not os.access(sys.argv[3],os.R_OK),'fixture must cross DAC read boundary'
class Done(BaseException):pass
rows=[]
def emit(field,verdict,expected,actual):
 if field=='владелец-тревог':rows.append([verdict,actual]);raise Done()
try:m.sverit_proizvodnye({'istochnik_modeli':{'fajl':sys.argv[2]},'dom':'/nonexistent-owner-fixture'},'fixture',emit)
except Done:pass
assert len(rows)==1,rows
print(json.dumps({'uid':os.geteuid(),'rows':rows},ensure_ascii=False))
''');runner.chmod(0o644)
 results=[]
 for label,body,want,deny in [('healthy','{"ownerChatId":111}\n','ok',False),('wrong-owner','{"ownerChatId":333}\n','расхождение',False),('restored','{"ownerChatId":111}\n','ok',False),('sudo-denied','{"ownerChatId":111}\n','СЛЕПОТА',True),('invalid','[111]\n','расхождение',False),('null-no-config-fallback','{"ownerChatId":null}\n','расхождение',False)]:
  # Root writes only this disposable fixture; metadata is checked by the actual child DAC probe.
  writer='import pathlib,sys;p=pathlib.Path(sys.argv[1]);p.write_text(sys.argv[2])'
  subprocess.run(['sudo','-n','python3','-I','-B','-c',writer,str(data),body],check=True)
  env={**os.environ,'PATH':str(denied)+':'+os.environ['PATH']}if deny else dict(os.environ)
  r=subprocess.run(['sudo','-n','runuser','-u','iskra','--','env','PATH='+env['PATH'],'USER=not-iskra','python3','-I','-B',str(runner),str(code),str(config),str(data)],capture_output=True,text=True,timeout=25)
  if r.returncode:print('FAIL '+label+': fixture/reader '+r.stderr[-300:]);raise SystemExit(2)
  value=json.loads(r.stdout);actual=value['rows'][0][0];results.append({'case':label,'want':want,'actual':actual,'uid':value['uid'],'fixture_sha256':hashlib.sha256(body.encode()).hexdigest()})
  if actual!=want:print('FAIL '+json.dumps(results[-1],ensure_ascii=False));raise SystemExit(1)
 print('OWNER_READER_PASS '+json.dumps(results,ensure_ascii=False))
