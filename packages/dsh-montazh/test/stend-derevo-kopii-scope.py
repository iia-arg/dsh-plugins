"""B-N-VYPUSK-KOPII: automatic places unless directory copies make scope ambiguous."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,tempfile,yaml
gate=Path(sys.argv[1]).resolve() if len(sys.argv)==2 else Path(__file__).resolve().parents[1]/'bin/vypusk-tegom'
assert len(sys.argv)<=2 and gate.is_file()
ok=bad=0
with tempfile.TemporaryDirectory(prefix='vypusk-derevo-scope-',dir=os.environ.get('TMPDIR') or '/var/tmp') as temp:
 root=Path(temp);source=root/'packages/dsh-scope-fixture';(source/'src').mkdir(parents=True)
 (source/'package.json').write_text(json.dumps(dict(name='dsh-scope-fixture',version='0.0.1',files=['src'])))
 (source/'CHANGELOG.md').write_text('# H\n\n## 0.0.1 — scope fixture\n')
 (source/'src/main.js').write_text('module.exports = 1;\n')
 copy=root/'copy';shutil.copytree(source,copy);external=root/'external.js';external.write_bytes((source/'src/main.js').read_bytes())
 metadata=root/'installed-package.json';metadata.write_bytes((source/'package.json').read_bytes())
 registry=root/'plugins.yaml';scope=root/'scope.json'
 row=dict(id='scope-fixture',path=str(copy),derevo=dict(subdir='packages/dsh-scope-fixture',files=[dict(remote='package.json',local=str(metadata)),dict(remote='src/main.js',local=str(external))]))
 def invoke(explicit=False,derevo=True,copy_exists=True,bypass=True,release=source,subdir='packages/dsh-scope-fixture'):
  item=dict(row)
  if not derevo:item.pop('derevo')
  else:item['derevo']=dict(row['derevo'],subdir=subdir)
  registry.write_text(yaml.safe_dump(dict(plugins=[item],services=[])))
  env={k:v for k,v in os.environ.items() if not k.startswith('VYPUSK_')}
  env.update(VYPUSK_REESTR=str(registry),VYPUSK_ZHURNAL_DIR=str(root/'journal'),STENDY_INACHE='private byte-scope regression, not behavioral release tests',npm_config_cache=str(root/'npm-cache'))
  if not bypass:
   env.pop('STENDY_INACHE');env['OBHODCHIK']=str(root/'walker');env['OBYORTKA_KRASNEET']=str(root/'no-wrapper-probe')
  if explicit:scope.write_text(json.dumps(dict(package='dsh-scope-fixture',version='0.0.1',copies=['scope-fixture'])));env['VYPUSK_KOPII']=str(scope)
  if not copy_exists:copy.rename(root/'offline-copy')
  try:return subprocess.run(['bash',str(gate),str(release)],env=env,capture_output=True,text=True,timeout=30)
  finally:
   if not copy_exists:(root/'offline-copy').rename(copy)
 def check(name,fn):
  global ok,bad
  try:fn();ok+=1;print('PASS',name,flush=True)
  except AssertionError as error:bad+=1;print('FAIL',name,str(error)[-1800:],flush=True)
 def absent(copy_exists):
  q=invoke(copy_exists=copy_exists);assert q.returncode==2 and 'область не задана' in q.stdout and 'scope-fixture' in q.stdout,(q.returncode,q.stdout,q.stderr)
 def healthy():
  q=invoke(explicit=True);assert q.returncode==0 and 'МЕСТА СВЕРЕНЫ: scope-fixture — 2 из 2' in q.stdout,(q.returncode,q.stdout,q.stderr)
 def automatic_places():
  q=invoke(copy_exists=False);assert q.returncode==0 and 'МЕСТА СВЕРЕНЫ: scope-fixture — 2 из 2' in q.stdout and not scope.exists(),(q.returncode,q.stdout,q.stderr)
 check('no directory copy: automatic K3 places, no default scope file',automatic_places)
 check('directory copy appears: missing scope refuses with named ID',lambda:absent(True))
 alias=root/'renamed-source';shutil.copytree(source,alias)
 def alias_refusal():
  q=invoke(release=alias);assert q.returncode==2 and 'область не задана' in q.stdout+q.stderr,(q.returncode,q.stdout,q.stderr)
 check('renamed release directory cannot hide same-family copy derevo',alias_refusal)
 for invalid,label in [(None,'null'),('','empty'),(5,'number')]:
  def invalid_record(value=invalid):
   q=invoke(subdir=value);assert q.returncode==2 and 'derevo' in q.stdout+q.stderr and 'scope-fixture' in q.stdout+q.stderr,(q.returncode,q.stdout,q.stderr)
  check('same-family malformed derevo subdir '+label+' refuses',invalid_record)
 walker=root/'walker';called=root/'WALKER_CALLED'
 walker.write_text('#!/bin/sh\ntouch '+str(called)+'\necho "ПАКЕТ: зелёных 1 красных 0 слепых 0"\necho "КАТАЛОГ ПАКЕТА: '+str(copy)+'/"\n');walker.chmod(0o755)
 def no_fallback():
  q=invoke(bypass=False);assert q.returncode==2 and 'область не задана' in q.stdout+q.stderr and not called.exists(),(q.returncode,q.stdout,q.stderr)
 check('missing scope stops before fallback behavioral walker',no_fallback)
 check('explicit derevo healthy',healthy)
 original=external.read_bytes();before=hashlib.sha256(original).hexdigest();external.write_bytes(original+b'// B_N_EXTERNAL_DAMAGE\n')
 count=subprocess.check_output(['grep','-cF','B_N_EXTERNAL_DAMAGE',str(external)],text=True).strip();after=hashlib.sha256(external.read_bytes()).hexdigest();assert count=='1' and before!=after;print('DAMAGE_INSERTED',str(external),before,after,'grep-cF='+count,flush=True)
 def damaged(release=source):
  q=invoke(explicit=True,release=release);assert q.returncode==1 and str(external) in q.stdout and 'scope-fixture' in q.stdout,(q.returncode,q.stdout,q.stderr)
 check('one damaged external place refuses and names destination',damaged)
 check('renamed source with explicit derevo still checks external place',lambda:damaged(alias))
 external.write_bytes(original);assert hashlib.sha256(external.read_bytes()).hexdigest()==before
 check('external place restored',healthy)
 def no_derevo():
  q=invoke(derevo=False);assert q.returncode==0 and 'СВЕРКА КОПИЙ: 1 из 1' in q.stdout,(q.returncode,q.stdout,q.stderr)
 check('package without derevo keeps automatic copy path',no_derevo)
print(f'RESULT scope {ok}/{ok+bad}')
sys.exit(0 if bad==0 else 1)
