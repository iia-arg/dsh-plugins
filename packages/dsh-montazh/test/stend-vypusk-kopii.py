"""B-N-1823: execute actual release gate against synthetic registered copies."""
from pathlib import Path
import tempfile,subprocess,json,hashlib,shutil,os,sys,yaml
gate=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'bin/vypusk-tegom'
passed=failed=blind=0
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='gamma-vypusk-copies-',dir=os.environ.get('TMPDIR') or '/var/tmp') as td:
 root=Path(td);release=root/'dsh-copy-fixture';release.mkdir();(release/'src').mkdir()
 (release/'package.json').write_text(json.dumps({'name':'dsh-copy-fixture','version':'0.0.1','files':['src']}))
 (release/'CHANGELOG.md').write_text('# History\n\n## 0.0.1 — fixture\n')
 (release/'src/main.js').write_text('export const fixture = 1;\n')
 first=root/'first';second=root/'second';third=root/'third'
 for p in [first,second,third]:shutil.copytree(release,p)
 registry=root/'plugins.yaml';scope=root/'scope.json'
 # B-N-2019: synthetic scoped copies have registered homes, users and real loaded caller unit.
 import pwd
 me=pwd.getpwuid(os.getuid()).pw_name
 live_agents=yaml.safe_load(Path('/etc/agent-registry/agents.yaml').read_text())['agenty']
 caller=next((a['namerenie'] for a in live_agents if a['namerenie']['polzovatel']==me),None)
 if caller is None:
  print('СЛЕПОТА: scoped пробы требуют учётку зарегистрированного агента, текущая '+me);sys.exit(2)
 fixture_agents=root/'agents.yaml'
 def actor_env(paths):
  agents=[]
  for number,copy in enumerate(paths):
   app=copy/'app'
   if not app.exists():app.symlink_to(Path(caller['dom'])/'app',target_is_directory=True)
   agents.append({'imya':'fixture-'+str(number),'namerenie':{'dom':str(copy),'polzovatel':me,'sluzhba':caller['sluzhba']}})
  fixture_agents.write_text(yaml.safe_dump({'agenty':agents}))
  return {'VYPUSK_AGENTY':str(fixture_agents),'VYPUSK_ZHURNAL_DIR':str(root/'journal')}
 rows=[{'id':'dsh-copy-fixture','path':str(first)},{'id':'dsh-copy-fixture-two','path':str(second)},{'id':'dsh-copy-fixture-old','path':str(third)}]
 def setrows(items):registry.write_text(yaml.safe_dump({'plugins':items,'services':[]}))
 def invoke(ids=None,bypass=True,extra=None):
  env={**os.environ,'VYPUSK_REESTR':str(registry),**actor_env([first,second,third])};env.pop('VYPUSK_KOPII',None);env.pop('STENDY_INACHE',None)
  if bypass:env['STENDY_INACHE']='B-N-1823: synthetic fixture, behavioral fleet tests deliberately not run'
  if ids is not None:scope.write_text(json.dumps({'package':'dsh-copy-fixture','version':'0.0.1','copies':ids}));env['VYPUSK_KOPII']=str(scope)
  if extra:env.update(extra)
  p=subprocess.run(['bash',str(gate),str(release)],text=True,capture_output=True,env=env,timeout=25)
  return p
 def check(name,fn):
  global passed,failed
  try:fn();passed+=1;print('PASS',name)
  except Exception as e:failed+=1;print('FAIL',name,str(e)[-1000:])
 # B-N-1949: две пробы различают только при НЕпривилегированном зовущем (chmod 0 закрывает каталог не для root; группы берутся
 # от зовущего). Под root (uid 0) они краснели на любом коде — теперь СЛЕПОТА с причиной: «не измерено», а не FAIL и не PASS.
 def check_neroot(name,fn):
  global blind
  if os.geteuid()==0:blind+=1;print('СЛЕПОТА',name,'— зовущий root (uid 0): проба различает только при непривилегированном зовущем; запустите от учётки агента');return
  check(name,fn)
 def valid(p):
  assert p.returncode==0,p.stdout+p.stderr
  assert 'СВЕРКА КОПИЙ: 2 из 2' in p.stdout,p.stdout
  for ident in ['dsh-copy-fixture','dsh-copy-fixture-two']:assert 'КОПИЯ ВЫПУСКА СВЕРЕНА: '+ident+' → ' in p.stdout,p.stdout
 def refused(p):assert p.returncode in [1,2],p.stdout+p.stderr
 setrows(rows[:2])
 check('all two registered copies healthy',lambda:valid(invoke()))
 original=(second/'src/main.js').read_bytes();before=sha(second/'src/main.js')
 (second/'src/main.js').write_text('export const fixture = 99; // B-N-1823 CORRUPTION\n')
 count=subprocess.run(['grep','-cF','B-N-1823 CORRUPTION',str(second/'src/main.js')],capture_output=True,text=True)
 assert count.stdout.strip()=='1' and before!=sha(second/'src/main.js')
 print('CORRUPTION second fixedCount=1 SHA',before,'->',sha(second/'src/main.js'))
 def bad_second():
  p=invoke();refused(p);assert 'dsh-copy-fixture-two' in p.stdout+p.stderr and str(second) in p.stdout+p.stderr
 check('second copy corruption refuses and names exact copy',bad_second)
 (second/'src/main.js').write_bytes(original);assert sha(second/'src/main.js')==before
 check('after corruption restoration all two copies healthy again',lambda:valid(invoke()))
 (third/'package.json').write_text(json.dumps({'name':'dsh-copy-fixture','version':'0.0.0','files':['src']}));setrows(rows)
 check('default all includes incompatible old copy and refuses',lambda:refused(invoke()))
 def subset():
  p=invoke(['dsh-copy-fixture','dsh-copy-fixture-two']);valid(p);assert 'ВНЕ ЭТОГО ВЫПУСКА (явный subset): dsh-copy-fixture-old' in p.stdout and sha(scope) in p.stdout
 check('explicit mixed-version release names excluded copy and checks two',subset)
 check('empty explicit copy list refuses',lambda:refused(invoke([])))
 check('unknown explicit copy id refuses',lambda:refused(invoke(['absent-copy'])))
 check('duplicate explicit copy id refuses',lambda:refused(invoke(['dsh-copy-fixture','dsh-copy-fixture'])))
 (second/'src/main.js').unlink()
 check('missing file in second selected copy refuses',lambda:refused(invoke(['dsh-copy-fixture','dsh-copy-fixture-two'])))
 (second/'src/main.js').write_bytes(original)
 check('restored missing file passes selected release',lambda:valid(invoke(['dsh-copy-fixture','dsh-copy-fixture-two'])))
 (second/'test').mkdir();(second/'test/stend-extra.sh').write_text('#!/bin/sh\nexit 0\n')
 check('extra deployed stand in second copy refuses',lambda:refused(invoke(['dsh-copy-fixture','dsh-copy-fixture-two'])))
 shutil.rmtree(second/'test')
 scope.write_text(json.dumps({'package':'dsh-copy-fixture','version':'0.0.2','copies':['dsh-copy-fixture']}))
 check('manifest bound to wrong version refuses',lambda:refused(invoke(extra={'VYPUSK_KOPII':str(scope)})))
 (second/'package.json').write_text('[]')
 check('malformed copy package metadata is blindness',lambda:refused(invoke(['dsh-copy-fixture','dsh-copy-fixture-two'])))
 shutil.copy2(release/'package.json',second/'package.json')
 check('explicit empty registry variable refuses',lambda:refused(invoke(extra={'VYPUSK_REESTR':''})))
 check('explicit empty scope variable refuses',lambda:refused(invoke(extra={'VYPUSK_KOPII':''})))
 setrows(rows[:2])
 walker=root/'walker.sh'
 walker.write_text(chr(10).join(['#!/usr/bin/python3', 'print('+repr('ПАКЕТ: зелёных 1 красных 0 слепых 0')+')', 'print('+repr('КАТАЛОГ ПАКЕТА: '+str(first)+'/')+')'])+chr(10))
 walker.chmod(0o755)
 check('normal behavior walker plus all copy comparison passes',lambda:valid(invoke(bypass=False,extra={'OBHODCHIK':str(walker)})))
 walker.write_text(chr(10).join(['#!/usr/bin/python3', 'print('+repr('ПАКЕТ: зелёных 1 красных 0 слепых 0')+')', 'print('+repr('КАТАЛОГ ПАКЕТА: '+str(first)+'/')+')', 'from pathlib import Path', 'Path('+repr(str(second/'src/main.js'))+').write_text('+repr('changed after behavior')+')'])+chr(10))
 walker.chmod(0o755)
 check('second copy changed by behavior run refuses in final comparison',lambda:refused(invoke(bypass=False,extra={'OBHODCHIK':str(walker)})))
 (second/'src/main.js').write_bytes(original)
 setrows(rows[:2]);check('final restore passes without creating tag',lambda:valid(invoke()))
 # A behavior walker may name an older copy outside this explicit release.
 setrows(rows)
 walker.write_text(chr(10).join(['#!/usr/bin/python3', 'print('+repr('ПАКЕТ: зелёных 1 красных 0 слепых 0')+')', 'print('+repr('КАТАЛОГ ПАКЕТА: '+str(third)+'/')+')'])+chr(10));walker.chmod(0o755)
 check('explicit release subset does not compare older behavioral copy',lambda:valid(invoke(['dsh-copy-fixture','dsh-copy-fixture-two'],bypass=False,extra={'OBHODCHIK':str(walker)})))
 # Family must follow package.json.name, never spelling of registry id.
 alias={**rows[1],'id':'telegram-multiagent'}
 setrows([rows[0],alias])
 def alias_found():
  p=invoke();assert p.returncode==0,p.stdout+p.stderr
  assert 'СВЕРКА КОПИЙ: 2 из 2' in p.stdout and 'КОПИЯ ВЫПУСКА СВЕРЕНА: telegram-multiagent → '+str(second) in p.stdout,p.stdout
 check('id different from npm name still discovers second family copy',alias_found)
 # A-N-1948 шаг 0 (рука Зари, 1.0.22): id реестра переименуется в dsh-telegram-multiagent — та же проба под НОВОЙ формой id.
 # Ворота семью по id не строят (семья — по package.json.name); проба держит, что новая форма id это не меняет.
 alias_n={**rows[1],'id':'dsh-telegram-multiagent'}
 setrows([rows[0],alias_n])
 def alias_n_found():
  p=invoke();assert p.returncode==0,p.stdout+p.stderr
  assert 'СВЕРКА КОПИЙ: 2 из 2' in p.stdout and 'КОПИЯ ВЫПУСКА СВЕРЕНА: dsh-telegram-multiagent → '+str(second) in p.stdout,p.stdout
 check('new-form id dsh-telegram-multiagent still discovers second family copy',alias_n_found)
 setrows([rows[0],alias])
 alien=root/'alien';shutil.copytree(release,alien)
 (alien/'package.json').write_text(json.dumps({'name':'dsh-copy-fixture-dsh','version':'0.0.1'}))
 foreign={'id':'dsh-copy-fixture-dsh','path':str(alien)}
 setrows(rows[:2]+[foreign])
 def collision():
  p=invoke();valid(p);assert 'ВНЕ СЕМЬИ' in p.stdout and foreign['id'] in p.stdout,p.stdout
  assert 'КОПИЯ ВЫПУСКА СВЕРЕНА: '+foreign['id']+' → ' not in p.stdout,p.stdout
 check('prefix collision with another package is named outside family',collision)
 check('explicit foreign package id refuses',lambda:refused(invoke([foreign['id']])))
 no_package=root/'no-package';no_package.mkdir()
 unjudged={'id':'no-package-entry','path':str(no_package)}
 setrows(rows[:2]+[unjudged])
 def no_metadata():
  p=invoke();valid(p);assert 'НЕ СУДИМЫ: 1' in p.stdout and unjudged['id'] in p.stdout and str(no_package) in p.stdout,p.stdout
 check('registry directory without package metadata is named unjudged',no_metadata)
 check('explicit unjudged copy refuses',lambda:refused(invoke([unjudged['id']])))
 setrows(rows[:2]+[{'id':'unavailable','path':str(root/'missing-directory')}])
 def unavailable():
  p=invoke(['unavailable']);assert p.returncode==2 and 'unavailable' in p.stdout+p.stderr,p.stdout+p.stderr
 check('selected unavailable registry path is blindness',lambda:unavailable())
 def missing_metadata_path():
  p=invoke();valid(p);assert 'НЕ СУДИМЫ: 1' in p.stdout and 'unavailable' in p.stdout,p.stdout
 check('absent package metadata outside chosen family is named unjudged',missing_metadata_path)
 unreadable=root/'unreadable';shutil.copytree(release,unreadable)
 setrows(rows[:2]+[{'id':'unreadable','path':str(unreadable)}])
 shim=root/'unprivileged';shim.mkdir();(shim/'sudo').write_text('#!/bin/bash\n[ "${1:-}" = -n ] && shift\nexec "$@"\n');(shim/'sudo').chmod(0o755)
 unreadable.chmod(0)
 def inaccessible():
  p=invoke(extra={'PATH':str(shim)+':'+os.environ['PATH']});assert p.returncode==2 and 'unreadable' in p.stdout+p.stderr,p.stdout+p.stderr
 check_neroot('unreadable metadata is blindness rather than unjudged',inaccessible)
 unreadable.chmod(0o755)
 setrows([rows[0],alias]);alias_before=sha(second/'src/main.js')
 (second/'src/main.js').write_text('ALIAS CORRUPTION B-N-1823')
 alias_count=subprocess.run(['grep','-cF','ALIAS CORRUPTION B-N-1823',str(second/'src/main.js')],capture_output=True,text=True)
 assert alias_count.stdout.strip()=='1' and alias_before!=sha(second/'src/main.js')
 print('CORRUPTION nonprefix alias fixedCount=1 SHA',alias_before,'->',sha(second/'src/main.js'))
 check('nonprefix alias corruption is caught by default all',lambda:refused(invoke()))
 (second/'src/main.js').write_bytes(original)
 check('nonprefix alias restoration passes',alias_found)
 # B-N-1893: копии пакета в services (шлюз подписки): каталог — source.address при local-dir, адрес-файл → его каталог.
 def setsvc(plugins,services):registry.write_text(yaml.safe_dump({'plugins':plugins,'services':services}))
 svc_dir={'id':'svc-copy-dir','path':'свободный текст, не путь','source':{'type':'local-dir','address':str(second)}}
 svc_file={'id':'svc-copy-file','path':'свободный текст','source':{'type':'local-dir','address':str(second/'package.json')}}
 def svc_valid(p,ident):
  assert p.returncode==0,p.stdout+p.stderr
  assert 'СВЕРКА КОПИЙ: 2 из 2' in p.stdout and 'КОПИЯ ВЫПУСКА СВЕРЕНА: '+ident+' → '+str(second) in p.stdout,p.stdout
 setsvc([rows[0]],[svc_dir])
 check('B-N-1893 services copy (local-dir directory) is found and compared',lambda:svc_valid(invoke(),'svc-copy-dir'))
 setsvc([rows[0]],[svc_file])
 check('B-N-1893 services copy (local-dir file address -> its directory) is found',lambda:svc_valid(invoke(),'svc-copy-file'))
 svc_before=sha(second/'src/main.js');(second/'src/main.js').write_text('SERVICES CORRUPTION B-N-1893')
 svc_count=subprocess.run(['grep','-cF','SERVICES CORRUPTION B-N-1893',str(second/'src/main.js')],capture_output=True,text=True)
 assert svc_count.stdout.strip()=='1' and svc_before!=sha(second/'src/main.js')
 print('CORRUPTION services copy fixedCount=1 SHA',svc_before,'->',sha(second/'src/main.js'))
 def svc_bad():
  p=invoke();assert p.returncode==1,p.stdout+p.stderr;assert 'svc-copy-file' in p.stdout and str(second) in p.stdout,p.stdout
 check('B-N-1893 services copy corruption refuses and names the copy',svc_bad)
 (second/'src/main.js').write_bytes(original);assert sha(second/'src/main.js')==svc_before
 check('B-N-1893 services copy restored passes again',lambda:svc_valid(invoke(),'svc-copy-file'))
 check('B-N-1893 explicit VYPUSK_KOPII accepts services id',lambda:svc_valid(invoke(['dsh-copy-fixture','svc-copy-file']),'svc-copy-file'))
 svc_alien={'id':'svc-alien','source':{'type':'local-dir','address':str(alien)}}
 svc_git={'id':'svc-git','source':{'type':'git','address':str(root)}}
 setsvc([rows[0]],[svc_file,svc_alien,svc_git])
 def svc_foreign(ident):
  p=invoke(['dsh-copy-fixture',ident]);assert p.returncode==2 and ident in p.stdout+p.stderr,p.stdout+p.stderr
 check('B-N-1893 explicit foreign services id (other package) refuses',lambda:svc_foreign('svc-alien'))
 check('B-N-1893 explicit services id without local-dir refuses',lambda:svc_foreign('svc-git'))
 def svc_not_unjudged():
  p=invoke();svc_valid(p,'svc-copy-file');assert 'НЕ СУДИМЫ: 0' in p.stdout and 'SERVICES НЕ КОПИИ ПАКЕТА (не local-dir или без package.json): 1' in p.stdout,p.stdout
 check('B-N-1893 services row without local-dir is counted apart, not unjudged',svc_not_unjudged)
 # Забава 04:0xZ: path = настоящая копия, source.address = источник (дерево) — сверяется path, а не источник
 svc_src={'id':'svc-path-copy','path':str(second),'source':{'type':'local-dir','address':str(release)}}
 setsvc([rows[0]],[svc_src])
 check('B-N-1893 services path (real copy) wins over source.address (source tree)',lambda:svc_valid(invoke(),'svc-path-copy'))
 src_before=sha(second/'src/main.js');(second/'src/main.js').write_text('PATH COPY CORRUPTION B-N-1893')
 src_count=subprocess.run(['grep','-cF','PATH COPY CORRUPTION B-N-1893',str(second/'src/main.js')],capture_output=True,text=True)
 assert src_count.stdout.strip()=='1' and src_before!=sha(second/'src/main.js')
 print('CORRUPTION services path copy fixedCount=1 SHA',src_before,'->',sha(second/'src/main.js'))
 def src_bad():
  p=invoke();assert p.returncode==1 and 'svc-path-copy' in p.stdout and str(second) in p.stdout,p.stdout+p.stderr
 check('B-N-1893 corruption of services path copy refuses (source tree is not compared instead)',src_bad)
 (second/'src/main.js').write_bytes(original);assert sha(second/'src/main.js')==src_before
 check('B-N-1893 services path copy restored passes',lambda:svc_valid(invoke(),'svc-path-copy'))
 setsvc([rows[0]],[{'id':'svc-self','source':{'type':'local-dir','address':str(release)}}])
 def svc_self():
  p=invoke();assert p.returncode==2 and 'svc-self' in p.stdout and 'сам каталог выпуска' in p.stdout,p.stdout+p.stderr
 check('B-N-1893 services copy equal to release directory is blindness (tautology)',svc_self)
 # B-N-1904 К3: копий-каталогов нет, пакет разложен ПО МЕСТАМ файлами — сверка files.local с деревом выпуска по записи derevo.
 mesta=root/'mesta';mesta.mkdir()
 shutil.copy2(release/'src/main.js',mesta/'main.js');shutil.copy2(release/'package.json',mesta/'package.json')
 dv_files=[{'remote':'src/main.js','local':str(mesta/'main.js')},{'remote':'package.json','local':str(mesta/'package.json')}]
 def setderevo(files=dv_files,plugins=None,extra=None):
  zap={'id':'svc-derevo','path':'см. derevo.files','source':{'type':'git','address':'x'},'derevo':{'subdir':'dsh-copy-fixture','files':files,**(extra or {})}}
  registry.write_text(yaml.safe_dump({'plugins':plugins or [],'services':[zap]}))
 def mesta_ok(p,n=2):
  assert p.returncode==0,p.stdout+p.stderr
  assert 'МЕСТА СВЕРЕНЫ: svc-derevo — '+str(n)+' из '+str(n) in p.stdout and 'АННОТАЦИЯ ОБЛАСТИ: derevo=svc-derevo' in p.stdout,p.stdout
 setderevo()
 check('B-N-1904 no directory copies, derevo places equal release -> places compared',lambda:mesta_ok(invoke()))
 m_before=sha(mesta/'main.js');(mesta/'main.js').write_text('PLACE CORRUPTION B-N-1904')
 m_count=subprocess.run(['grep','-cF','PLACE CORRUPTION B-N-1904',str(mesta/'main.js')],capture_output=True,text=True)
 assert m_count.stdout.strip()=='1' and m_before!=sha(mesta/'main.js')
 print('CORRUPTION derevo place fixedCount=1 SHA',m_before,'->',sha(mesta/'main.js'))
 def mesto_bad():
  p=invoke();assert p.returncode==1 and 'ОТКАЗ' in p.stdout and 'src/main.js → '+str(mesta/'main.js') in p.stdout,p.stdout+p.stderr
 check('B-N-1904 corrupted place refuses and names remote and place',mesto_bad)
 check('B-N-1904 corrupted place listed in expected_diff_files is skipped',lambda:(setderevo(extra={'expected_diff_files':['src/main.js']}),mesta_ok(invoke(),1))[1])
 def nechego():
  setderevo(extra={'expected_diff_files':['src/main.js','package.json']});p=invoke()
  assert p.returncode==2 and 'сверять нечего' in p.stdout and 'МЕСТА СВЕРЕНЫ' not in p.stdout,p.stdout+p.stderr
 check('B-N-1904 all derevo files in expected_diff_files -> blindness, not 0 of 0',nechego)
 setderevo()
 (mesta/'main.js').write_bytes(original);assert sha(mesta/'main.js')==m_before
 check('B-N-1904 restored place passes again',lambda:mesta_ok(invoke()))
 registry.write_text(yaml.safe_dump({'plugins':[],'services':[]}))
 def no_derevo():
  p=invoke();assert p.returncode==2 and 'нет зарегистрированных копий' in p.stdout and 'МЕСТА' not in p.stdout,p.stdout+p.stderr
 check('B-N-1904 no copies and no derevo record keeps previous blindness',no_derevo)
 setderevo(files=dv_files+[{'remote':'src/absent.js','local':str(mesta/'absent.js')}])
 def stale_record():
  p=invoke();assert p.returncode==2 and 'запись отстала' in p.stdout,p.stdout+p.stderr
 check('B-N-1904 derevo naming a file absent from release is blindness',stale_record)
 setderevo(plugins=rows[:2])
 def copies_win():
  p=invoke();valid(p);assert 'МЕСТА СВЕРЕНЫ' not in p.stdout,p.stdout
 check('B-N-1904 directory copies present -> copies compared, derevo not used',copies_win)
 # B-N-1914: этап стендов — НАСТОЯЩИЙ обходчик (без STENDY_INACHE). Отдельная подстава, чтобы стенды дерева не трогали пробы выше.
 r14=root/'p1914';rel14=r14/'dsh-st-1914';(rel14/'src').mkdir(parents=True);(rel14/'test').mkdir()
 (rel14/'package.json').write_text(json.dumps({'name':'dsh-st-1914','version':'0.0.1','files':['src']}))
 (rel14/'CHANGELOG.md').write_text('# History\n\n## 0.0.1 — fixture\n');(rel14/'src/main.js').write_text('export const x = 1;\n')
 (rel14/'test/stend-a.sh').write_text('#!/bin/sh\ntouch "$(dirname "$0")/../RAN-A"\necho PASS a\n');(rel14/'test/stend-a.sh').chmod(0o755)
 kA=r14/'kopiya-a';kB=r14/'kopiya-b';shutil.copytree(rel14,kA);shutil.copytree(rel14,kB)
 (kB/'test/stend-a.sh').unlink();(kB/'test/stend-b.sh').write_text('#!/bin/sh\ntouch "$(dirname "$0")/../RAN-B"\necho PASS b\n');(kB/'test/stend-b.sh').chmod(0o755)
 reg14=r14/'plugins.yaml';sc14=r14/'scope.json'
 def inv14(ids=None,services=None,plugins=None,rel=rel14):
  reg14.write_text(yaml.safe_dump({'plugins':plugins if plugins is not None else [{'id':'kop-a','path':str(kA)},{'id':'kop-b','path':str(kB)}],'services':services or []}))
  env={**os.environ,'VYPUSK_REESTR':str(reg14),**actor_env([kA,kB])};env.pop('VYPUSK_KOPII',None);env.pop('STENDY_INACHE',None)
  if ids is not None:sc14.write_text(json.dumps({'package':'dsh-st-1914','version':'0.0.1','copies':ids}));env['VYPUSK_KOPII']=str(sc14)
  for m in (kA/'RAN-A',kB/'RAN-B',rel/'RAN-A'):
   if m.exists():m.unlink()
  return subprocess.run(['bash',str(gate),str(rel)],text=True,capture_output=True,env=env,timeout=180)
 def kopiya_a():
  p=inv14(['kop-a']);o=p.stdout+p.stderr
  assert 'ОБЛАСТЬ СТЕНДОВ ВЫПУСКА: копия kop-a → '+str(kA.resolve()) in o,o[-3000:]
  assert (kA/'RAN-A').exists(),'стенд копии A не прогнан: '+o[-2000:]
  assert not (kB/'RAN-B').exists(),'стенд копии B прогнан, хотя B не выбрана'
  assert 'КАТАЛОГ ПАКЕТА: '+str(kA.resolve())+'/' in o and 'КАТАЛОГ ПАКЕТА: '+str(kB.resolve()) not in o,o[-3000:]
  assert p.returncode==0 and 'КОПИЯ ВЫПУСКА СВЕРЕНА: kop-a' in o,o[-3000:]
 check('B-N-1914 VYPUSK_KOPII=[A] -> stands of copy A run, copy B stands not run',kopiya_a)
 def kopiya_b_otkaz():
  p=inv14(['kop-b']);o=p.stdout+p.stderr
  assert not (kA/'RAN-A').exists() and p.returncode in (1,2),o[-3000:]
  assert 'НА ДИСКЕ ЕСТЬ, В ПЕРЕЧНЕ НЕТ' in o or 'В ПЕРЕЧНЕ ЕСТЬ, НА ДИСКЕ НЕТ' in o,o[-3000:]
 def neizvestnyj_id():
  pr=r14/'perechen-staroj-oblasti.txt';pr.write_text(str(kA.resolve())+'/test/stend-a.sh\n')
  reg14.write_text('')
  global_env={'OBLAST_STENDOV':str(kA.resolve())+'/','PERECHEN_STENDOV':str(pr)}  # прежняя область указывает на копию A — как боевая на копию Искры
  reg14.write_text(yaml.safe_dump({'plugins':[{'id':'kop-a','path':str(kA)},{'id':'kop-b','path':str(kB)}],'services':[]}))
  sc14.write_text(json.dumps({'package':'dsh-st-1914','version':'0.0.1','copies':['net-takoj-kopii']}))
  for m in (kA/'RAN-A',kB/'RAN-B'):
   if m.exists():m.unlink()
  env={**os.environ,'VYPUSK_REESTR':str(reg14),'VYPUSK_KOPII':str(sc14),**global_env};env.pop('STENDY_INACHE',None)
  p=subprocess.run(['bash',str(gate),str(rel14)],text=True,capture_output=True,env=env,timeout=180);o=p.stdout+p.stderr
  assert p.returncode==2 and 'СЛЕПОТА' in o,o[-3000:]
  assert not (kA/'RAN-A').exists() and not (kB/'RAN-B').exists(),'стенд прогнан при неизвестном id в VYPUSK_KOPII: '+o[-2000:]
 check('B-N-1914 LOW: VYPUSK_KOPII with unknown id -> code 2 at once, no stand run (old area is not used)',neizvestnyj_id)
 check('B-N-1914 VYPUSK_KOPII=[B] (stands differ from release) -> coverage refuses, copy A not run',kopiya_b_otkaz)
 mesta14=r14/'mesta';mesta14.mkdir();shutil.copy2(rel14/'src/main.js',mesta14/'main.js')
 dv14=[{'id':'svc-1914','source':{'type':'git','address':'x'},'derevo':{'subdir':'dsh-st-1914','files':[{'remote':'src/main.js','local':str(mesta14/'main.js')}]}}]
 def derevo_stendy():
  p=inv14(services=dv14,plugins=[]);o=p.stdout+p.stderr
  assert 'ОБЛАСТЬ СТЕНДОВ ВЫПУСКА: пакет по местам' in o and (rel14/'RAN-A').exists(),o[-3000:]
  assert p.returncode==0 and 'МЕСТА СВЕРЕНЫ: svc-1914' in o,o[-3000:]
 check('B-N-1914 package by places (derevo) -> release-tree stands run, places compared, no early blindness',derevo_stendy)
 rel0=r14/'bez-stendov'/'dsh-st-1914';shutil.copytree(rel14,rel0);shutil.rmtree(rel0/'test')
 dv0=[{'id':'svc-1914','source':{'type':'git','address':'x'},'derevo':{'subdir':'bez-stendov/dsh-st-1914','files':[{'remote':'src/main.js','local':str(mesta14/'main.js')}]}}]
 def derevo_bez_stendov():
  p=inv14(services=dv0,plugins=[],rel=rel0);o=p.stdout+p.stderr
  assert p.returncode==2 and 'в дереве выпуска стендов нет' in o,o[-3000:]
 check('B-N-1914 package by places without stands in release tree -> honest blindness "no stands"',derevo_bez_stendov)
 # B-N-1909: исход ворот НЕ зависит от групп зовущего. Стенд копии читает файл, доступный только группе шлюза 986 (claudeoauth):
 # оболочка агента под шлюзом её несёт, ночная служба (User=учётка, initgroups) — нет. Зовём ворота с лишней группой (sudo setpriv) и без.
 import pwd,grp
 me=pwd.getpwuid(os.getuid()).pw_name
 r09=root/'p1909';rel09=r09/'dsh-st-1909';(rel09/'src').mkdir(parents=True);(rel09/'test').mkdir()
 (rel09/'package.json').write_text(json.dumps({'name':'dsh-st-1909','version':'0.0.1','files':['src']}))
 (rel09/'CHANGELOG.md').write_text('# History\n\n## 0.0.1 — fixture\n');(rel09/'src/main.js').write_text('export const y = 1;\n')
 (rel09/'test/stend-gruppa.sh').write_text('#!/bin/sh\nid -Gn > "$(dirname "$0")/../GRUPPY"\nif test -r /opt/claude-oauth/package.json; then echo PASS slój viden; else echo "FAIL: /opt/claude-oauth не читается этой средой (группы: $(id -Gn))"; exit 1; fi\n')
 (rel09/'test/stend-gruppa.sh').chmod(0o755)
 k09=r09/'kopiya';shutil.copytree(rel09,k09);reg09=r09/'plugins.yaml';sc09=r09/'scope.json'
 reg09.write_text(yaml.safe_dump({'plugins':[{'id':'kop-09','path':str(k09)}],'services':[]}));sc09.write_text(json.dumps({'package':'dsh-st-1909','version':'0.0.1','copies':['kop-09']}))
 def gate09(lishnyaya):
  env={**os.environ,'VYPUSK_REESTR':str(reg09),'VYPUSK_KOPII':str(sc09),**actor_env([k09])};env.pop('STENDY_INACHE',None)
  cmd=['bash',str(gate),str(rel09)]
  if lishnyaya:
   gr=','.join(str(g) for g in sorted(set(os.getgrouplist(me,pwd.getpwnam(me).pw_gid))|{grp.getgrnam('claudeoauth').gr_gid}))
   # B-N-1934 (Аврора): TMPDIR — ДОВОДОМ через env, не --preserve-env: glibc вычищает TMPDIR у setuid sudo при запуске (небезопасная
   #   переменная), sudo её не видит вовсе. Без неё ворота клали $VREM в /tmp зовущего — под PrivateTmp обходчик его не видел.
   tmp=['env','TMPDIR='+os.environ['TMPDIR']] if os.environ.get('TMPDIR') else []
   cmd=['sudo','-n','--preserve-env=VYPUSK_REESTR,VYPUSK_KOPII,VYPUSK_AGENTY,VYPUSK_ZHURNAL_DIR,PATH,HOME,USER,LOGNAME','setpriv','--reuid='+me,'--regid='+me,'--groups='+gr]+tmp+cmd
  p=subprocess.run(cmd,text=True,capture_output=True,env=env,timeout=180);g=(k09/'GRUPPY').read_text().split() if (k09/'GRUPPY').exists() else None
  return p,g
 def nezavisimo_ot_grupp():
  p1,g1=gate09(True);p0,g0=gate09(False)
  assert g1 is not None and g0 is not None,'стенд не прогнан: '+(p1.stdout+p1.stderr)[-1500:]
  assert 'claudeoauth' not in g1,'стенд получил группу зовущего 986: '+' '.join(g1)
  assert p1.returncode==p0.returncode==1,(p1.returncode,p0.returncode,(p1.stdout+p1.stderr)[-1500:])
  assert 'у зовущего сверх них: claudeoauth' in p1.stdout+p1.stderr,(p1.stdout+p1.stderr)[-1500:]
 check_neroot('B-N-1909 gate verdict does not depend on caller groups: extra group 986 not passed to stands (same result as clean account)',nezavisimo_ot_grupp)
 # B-N-1909 LOW: обходчик убит по пределу → не «ОТКАЗ: не зелёный», а СЛЕПОТА «оборван». Подставной обходчик спит 10 с, потом даёт зелёный итог.
 setrows(rows[:2]);w09=root/'walker-sonnyj.sh'
 w09.write_text('#!/bin/bash\nsleep 10\necho "ПАКЕТ: зелёных 1 красных 0 слепых 0"\necho "КАТАЛОГ ПАКЕТА: '+str(first)+'/"\necho "ПОКРЫТИЕ: прошло 1 из 1"\nexit 0\n');w09.chmod(0o755)
 def oborvan():
  p=invoke(bypass=False,extra={'OBHODCHIK':str(w09),'VYPUSK_OBH_PREDEL_SEK':'2'});o=p.stdout+p.stderr
  assert p.returncode==2 and 'оборван' in o and 'ПОДМЕНА предела обходчика: 2 с' in o and 'не зелёный' not in o,str(p.returncode)+o[-2000:]
 check('B-N-1909 LOW: walker killed by RuntimeMaxSec -> blindness "оборван" with reason, not "ОТКАЗ: не зелёный"',oborvan)
 # B-N-2019: two same-UID copies still receive their distinct registered app, through actual reader.
 r19=root/'p2019';rel19=r19/'dsh-st-2019';(rel19/'test').mkdir(parents=True);(rel19/'src').mkdir()
 (rel19/'package.json').write_text(json.dumps({'name':'dsh-st-2019','version':'0.0.1','files':['src']}))
 (rel19/'CHANGELOG.md').write_text('# History\n\n## 0.0.1 — fixture\n');(rel19/'src/main.js').write_text('export const x=1;\n')
 stand19=rel19/'test/stend-app.sh'
 stand19.write_text('#!/bin/bash\ncopy=$(cd -- "$(dirname "$0")/.." && pwd -P)\nexpected="${EXPECTED_APP:-$copy/app}"\nprintf "%s %s\\n" "$(id -un)" "${STEND_APP:-missing}" > "$copy/RAN"\n[ "${STEND_APP:-}" = "$expected" ] || { echo "FAIL per-copy STEND_APP"; exit 1; }\necho PASS copy app\n');stand19.chmod(0o755)
 copies19=[r19/'copy-a',r19/'copy-b']
 for c in copies19:shutil.copytree(rel19,c)
 reg19=r19/'plugins.yaml';scope19=r19/'scope.json'
 reg19.write_text(yaml.safe_dump({'plugins':[{'id':'c'+str(i),'path':str(c)} for i,c in enumerate(copies19)],'services':[]}));scope19.write_text(json.dumps({'package':'dsh-st-2019','version':'0.0.1','copies':['c0','c1']}))
 def inv19(edit=None,extra=None):
  env={**os.environ,**actor_env(copies19),'VYPUSK_REESTR':str(reg19),'VYPUSK_KOPII':str(scope19)};env.pop('STENDY_INACHE',None)
  if edit:
   doc=yaml.safe_load(fixture_agents.read_text());edit(doc);fixture_agents.write_text(yaml.safe_dump(doc))
  if extra:env.update(extra)
  for c in copies19:
   if (c/'RAN').exists():(c/'RAN').unlink()
  p=subprocess.run(['bash',str(gate),str(rel19)],text=True,capture_output=True,env=env,timeout=180)
  return p,p.stdout+p.stderr
 def own_apps():
  p,o=inv19();assert p.returncode==0,o[-3000:]
  for c in copies19:assert (c/'RAN').read_text().strip()==me+' '+str(c.resolve()/'app'),o[-3000:]
 check('B-N-2019 same actor as caller: distinct registered app per copy, STEND_APP forwarded',own_apps)
 def refused_actor(edit):
  p,o=inv19(edit);assert p.returncode==2 and 'СЛЕПОТА' in o,o[-3000:]
  assert all(not (c/'RAN').exists() for c in copies19),'a partial plan ran a stand'
 check('B-N-2019 unknown home: fail closed before any stand',lambda:refused_actor(lambda d:d['agenty'].pop()))
 check('B-N-2019 duplicate home: fail closed before any stand',lambda:refused_actor(lambda d:d['agenty'].append(d['agenty'][0])))
 check('B-N-2019 unit User differs from registered user: refuse partial plan',lambda:refused_actor(lambda d:d['agenty'][1]['namerenie'].update(polzovatel='root')))
 check('B-N-2019 unloaded unit: refuse before any stand',lambda:refused_actor(lambda d:d['agenty'][1]['namerenie'].update(sluzhba='b2019-absent.service')))
 check('B-N-2019 empty unit User is not inferred as root',lambda:refused_actor(lambda d:d['agenty'][1]['namerenie'].update(polzovatel='root',sluzhba='systemd-journald.service')))
 def override_app():
  app=r19/'explicit-app';app.mkdir(exist_ok=True)
  sreda='\n'.join(str(c/'test/stend-app.sh')+' STEND_APP='+str(app)+' EXPECTED_APP='+str(app) for c in copies19)
  p,o=inv19(extra={'SREDA_STENDOV':sreda});assert p.returncode==0,o[-3000:]
  assert all((c/'RAN').read_text().strip()==me+' '+str(app) for c in copies19),o[-3000:]
 check('B-N-2019 explicit stand STEND_APP overrides per-copy default',override_app)
 check('B-N-2019 restored actor metadata passes',own_apps)
 def custom_registry_without_journal():
  p,o=inv19(extra={'VYPUSK_ZHURNAL_DIR':''});assert p.returncode==2 and 'подмена реестра агентов только' in o,o[-3000:]
 check('B-N-2019 agent-registry substitution cannot write normal gate certificate',custom_registry_without_journal)
 # A-N-1975 (замысел Искры 440906ea, ГОДНО Вениамина с условиями 1–3): МЕТАПАКЕТ из закрытого перечня ворот (dsh-pamyat) — копий
 # в бою нет, копия выпуска — архив полки. Полка (VYPUSK_POLKA_DIR) и журнал (VYPUSK_ZHURNAL_DIR, каталог root) — подставные,
 # внутри временного; архивы root:root кладёт sudo -n. Боевой журнал не трогается: без подставного журнала подмена полки — ОТКАЗ
 # (проба 11), и проба 11 идёт на каталоге вне git — даже сломанные ворота там следа не пишут («БЕЗ СЛЕДА», код 4 помощника).
 import tarfile,io
 r75=root/'p1975';ro75=r75/'root-owned';zh75=ro75/'zhurnal';polka=r75/'polka';naruzhu=r75/'naruzhu'
 def proby_1975():
  global blind
  if subprocess.run(['sudo','-n','true'],capture_output=True).returncode!=0:
   blind+=1;print('СЛЕПОТА A-N-1975 metapackage probes — sudo -n недоступен: архив root:root и журнал root не положить');return
  meta=r75/'mg'/'dsh-pamyat';(meta/'src').mkdir(parents=True);polka.mkdir();naruzhu.mkdir()
  (meta/'package.json').write_text(json.dumps({'name':'dsh-pamyat','version':'0.0.1','files':['src']}))
  (meta/'CHANGELOG.md').write_text('# History\n\n## 0.0.1 — fixture\n');(meta/'src/sostav.js').write_text('export const sostav = 1;\n')
  g=['git','-C',str(r75/'mg'),'-c','user.name=stend','-c','user.email=stend@sadik','-c','commit.gpgsign=false']
  for a in (['init','-q'],['add','-A'],['commit','-qm','A-N-1975 fixture']):subprocess.run(g+a,capture_output=True,check=True)
  meta_ng=r75/'ng'/'dsh-pamyat';shutil.copytree(meta,meta_ng)   # тот же пакет вне git
  subprocess.run(['sudo','-n','install','-d','-o','root','-g','root','-m','0755',str(zh75)],check=True)
  pk=r75/'pack';pk.mkdir()
  for kat in (meta,release):subprocess.run(['npm','pack','--ignore-scripts','--pack-destination',str(pk)],cwd=str(kat),capture_output=True,check=True)
  goden=(pk/'dsh-pamyat-0.0.1.tgz').read_bytes()
  def chleny():
   with tarfile.open(fileobj=io.BytesIO(goden),mode='r:gz') as t:return [(m,t.extractfile(m).read() if m.isfile() else None) for m in t]
  def sobrat(zamena={},dop=(),bez=()):
   b=io.BytesIO()
   with tarfile.open(fileobj=b,mode='w:gz') as t:
    for m,d in chleny()+list(dop):
     if m.name in bez:continue
     if m.name in zamena:d=zamena[m.name];m.size=len(d)
     t.addfile(m,io.BytesIO(d) if d is not None else None)
   return b.getvalue()
  def ti(name,typ=tarfile.REGTYPE,link='',data=b'vzlom\n'):
   m=tarfile.TarInfo(name);m.type=typ;m.linkname=link;m.mode=0o644;m.size=len(data) if typ==tarfile.REGTYPE else 0
   return (m,data if typ==tarfile.REGTYPE else None)
  def polozhit(data,cel=polka/'dsh-pamyat-0.0.1.tgz',rezhim='0644'):
   if cel.is_symlink() or cel.exists():cel.unlink()
   vr=r75/'vr.tgz';vr.write_bytes(data)
   subprocess.run(['sudo','-n','install','-o','root','-g','root','-m',rezhim,str(vr),str(cel)],check=True);vr.unlink()
   return hashlib.sha256(data).hexdigest()
  def inv(kat=meta,zhurnal=True,reg=None,ids=None,polka_dir=str(polka),vorota=None,zd=None):
   registry.write_text(yaml.safe_dump(reg or {'plugins':[],'services':[]}))
   env={**os.environ,'VYPUSK_REESTR':str(registry),'STENDY_INACHE':'A-N-1975: synthetic metapackage fixture, behavioral fleet tests deliberately not run'}
   for k in ('VYPUSK_KOPII','VYPUSK_POLKA_DIR','VYPUSK_ZHURNAL_DIR'):env.pop(k,None)
   if polka_dir is not None:env['VYPUSK_POLKA_DIR']=polka_dir
   if zhurnal:env['VYPUSK_ZHURNAL_DIR']=zd or str(zh75)
   if ids is not None:scope.write_text(json.dumps({'package':'dsh-pamyat','version':'0.0.1','copies':ids}));env['VYPUSK_KOPII']=str(scope)
   return subprocess.run(['bash',str(vorota or gate),str(kat)],text=True,capture_output=True,env=env,timeout=60)
  def sledov():
   f=zh75/'zhurnal.tsv';return len(f.read_text().splitlines()) if f.exists() else 0
  n_f=sum(1 for m,d in chleny() if m.isfile());arh=str(polka/'dsh-pamyat-0.0.1.tgz')
  def p1():
   n=sledov();p=inv();o=p.stdout+p.stderr
   assert p.returncode==0,o[-3000:]
   assert 'МЕТАПАКЕТ dsh-pamyat 0.0.1: копий в бою нет по построению; копия выпуска — архив полки '+arh+' SHA256='+hashlib.sha256(goden).hexdigest()+'; файлов '+str(n_f)+' из '+str(n_f) in p.stdout,o[-3000:]
   assert 'ПОДМЕНА полки: '+str(polka) in p.stdout and 'СЛЕД ЗАПИСАН: dsh-pamyat-v0.0.1' in o,o[-3000:]
   assert sledov()==n+1,'след не лёг в подставной журнал: строк '+str(n)+' → '+str(sledov())
  def otkaz(*nado,kod=1,kat=meta):
   def f():
    n=sledov();p=inv(kat=kat);o=p.stdout+p.stderr
    assert p.returncode==kod and all(x in o for x in nado),str(p.returncode)+' '+o[-3000:]
    assert sledov()==n,'след при отказе: строк '+str(n)+' → '+str(sledov())
   return f
  polozhit(goden)
  check('A-N-1975 1: metapackage, no copies, shelf archive = gate tarball -> code 0, files N of N, trace in substitute journal',p1)
  isk=next(m.name for m,d in chleny() if m.name.endswith('src/sostav.js'));orig=dict((m.name,d) for m,d in chleny())[isk]
  isp=bytearray(orig);isp[0]^=1;s0=hashlib.sha256(goden).hexdigest();s1=polozhit(sobrat(zamena={isk:bytes(isp)}))
  assert s0!=s1;print('CORRUPTION A-N-1975 archive member',isk,'1 byte; archive SHA',s0,'->',s1)
  check('A-N-1975 2: one byte corrupted inside shelf archive -> ОТКАЗ code 1 naming the file, no trace',otkaz('ОТКАЗ: МЕТАПАКЕТ dsh-pamyat','различаются: src/sostav.js'))
  polozhit(goden);check('A-N-1975 3: corruption removed -> code 0 and trace again',p1)
  polozhit(sobrat(dop=[ti('package/src/lishnij.js')]))
  check('A-N-1975 4a: extra file in shelf archive -> ОТКАЗ naming it',otkaz('лишние в архиве: src/lishnij.js'))
  polozhit(sobrat(bez=(isk,)))
  check('A-N-1975 4b: file missing from shelf archive -> ОТКАЗ naming it',otkaz('нет в архиве: src/sostav.js'))
  polozhit((pk/'dsh-copy-fixture-0.0.1.tgz').read_bytes(),cel=polka/'dsh-copy-fixture-0.0.1.tgz');polozhit(goden)
  def p5():
   p=inv(kat=release);o=p.stdout+p.stderr
   assert p.returncode==2 and 'нет зарегистрированных копий dsh-copy-fixture' in o and 'МЕТАПАКЕТ' not in o,str(p.returncode)+' '+o[-3000:]
  check('A-N-1975 5 (MAIN): ordinary package not in list, no copies, its archive on shelf -> previous blindness "нет зарегистрированных копий"',p5)
  kop=r75/'kopiya-mp';shutil.copytree(meta,kop);s_p=polozhit(sobrat(zamena={isk:bytes(isp)}))
  print('CORRUPTION A-N-1975 shelf archive kept corrupted during probe 6, SHA',s_p)
  def p6():
   p=inv(reg={'plugins':[{'id':'dsh-pamyat-kopiya','path':str(kop)}],'services':[]});o=p.stdout+p.stderr
   assert p.returncode==0 and 'СВЕРКА КОПИЙ: 1 из 1' in p.stdout and 'КОПИЯ ВЫПУСКА СВЕРЕНА: dsh-pamyat-kopiya → ' in p.stdout,o[-3000:]
   assert 'МЕТАПАКЕТ' not in o,o[-3000:]
  check('A-N-1975 6: metapackage with registered copy -> ordinary copy comparison, branch not taken (corrupted shelf archive not read)',p6)
  cel=polka/'dsh-pamyat-0.0.1.tgz';cel.unlink();cel.write_bytes(goden)
  check('A-N-1975 7a: shelf archive owner not root -> blindness with path',otkaz('хозяин архива полки не root',arh,kod=2))
  polozhit(goden,rezhim='0664')
  check('A-N-1975 7b: shelf archive group-writable -> blindness with path',otkaz('пишется группой или прочими',arh,kod=2))
  drug=r75/'drugaya';drug.mkdir();polozhit(goden,cel=drug/'dsh-pamyat-0.0.1.tgz');cel.unlink();cel.symlink_to(drug/'dsh-pamyat-0.0.1.tgz')
  check('A-N-1975 7c: shelf archive is a symlink (to root archive) -> blindness with path',otkaz('не открыт без перехода по ссылке',arh,kod=2))
  cel.unlink()
  check('A-N-1975 8: no shelf archive -> blindness with path',otkaz('архива полки нет: '+arh,kod=2))
  polozhit(goden)
  def p9():
   p=inv(ids=['net-takogo-id']);o=p.stdout+p.stderr
   assert p.returncode==2 and 'неизвестный id' in o and 'МЕТАПАКЕТ' not in o,str(p.returncode)+' '+o[-3000:]
  check('A-N-1975 9: metapackage with VYPUSK_KOPII -> previous "неизвестный id" unchanged',p9)
  sekret=r75/'sekret';sekret.write_text('chuzhoe\n')
  dd='package/'+'../'*16+str(naruzhu/'vzlom-g').lstrip('/')
  for bukva,dop,nado in (('а',[ti('package/ssylka',tarfile.SYMTYPE,link=str(naruzhu)),ti('package/ssylka/vzlom-a')],'package/ssylka — символьная ссылка'),
                         ('б',[ti('package/zhestkaya',tarfile.LNKTYPE,link=str(sekret))],'package/zhestkaya — жёсткая ссылка'),
                         ('в',[ti(str(naruzhu/'vzlom-v'))],str(naruzhu/'vzlom-v')+' — абсолютный путь'),
                         ('г',[ti(dd)],dd+' — «..» в пути'),
                         ('д',[ti('package/fifo',tarfile.FIFOTYPE)],'package/fifo — не обычный файл'),
                         ('е',[ti('package/ustrojstvo',tarfile.CHRTYPE)],'package/ustrojstvo — не обычный файл')):
   polozhit(sobrat(dop=dop))
   def p10(nado=nado):
    otkaz('ОТКАЗ: МЕТАПАКЕТ dsh-pamyat',nado)()
    assert list(naruzhu.iterdir())==[] and sekret.stat().st_nlink==1 and sekret.read_text()=='chuzhoe\n','вне временного появилось: '+str(list(naruzhu.iterdir()))
   check('A-N-1975 10'+bukva+': archive member '+nado.split(' — ')[1]+' -> ОТКАЗ naming the member, nothing outside temp',p10)
  polozhit(goden)
  boevoj=Path('/var/lib/vypusk-tegom/zhurnal.tsv')
  def p11(polka_dir=str(polka)):
   b0=boevoj.stat().st_size if boevoj.exists() else -1
   p=inv(kat=meta_ng,zhurnal=False,polka_dir=polka_dir);o=p.stdout+p.stderr
   assert p.returncode==2 and 'ОТКАЗ: VYPUSK_POLKA_DIR задан без VYPUSK_ZHURNAL_DIR' in p.stderr,str(p.returncode)+' '+o[-3000:]
   assert 'МЕТАПАКЕТ' not in o and 'СЛЕД' not in o and 'БЕЗ СЛЕДА' not in o,o[-3000:]
   assert (boevoj.stat().st_size if boevoj.exists() else -1)==b0,'боевой журнал изменился'
  check('A-N-1975 11: VYPUSK_POLKA_DIR without substitute journal -> ОТКАЗ before comparison, no trace',p11)
  check('A-N-1975 11: VYPUSK_POLKA_DIR set empty without substitute journal -> same ОТКАЗ',lambda:p11(''))
  # 11в (условие Вениамина 11:2xZ): явный VYPUSK_ZHURNAL_DIR = боевой журнал. Константа боевого пути подменена в КОПИИ ворот на свой
  # каталог root — настоящий /var/lib/vypusk-tegom проба не называет никогда; без отказа след лёг бы в подставной «боевой».
  bj=ro75/'boevoj-podstava';subprocess.run(['sudo','-n','install','-d','-o','root','-g','root','-m','0755',str(bj)],check=True)
  konst='BOEVOJ_ZHURNAL_DIR=/var/lib/vypusk-tegom\n';tekst=Path(gate).read_text();vor11=r75/'vorota-11v'
  if tekst.count(konst)==1:vor11.write_text(tekst.replace(konst,'BOEVOJ_ZHURNAL_DIR='+str(bj)+'\n'))
  ssylka=r75/'ssylka-na-boevoj';ssylka.symlink_to(bj)
  def p11v(zd):
   assert vor11.exists(),'в воротах нет ровно одной строки '+konst.strip()+' — подставить боевой путь нечем'
   p=inv(vorota=vor11,zd=zd);o=p.stdout+p.stderr
   assert p.returncode==2 and 'ОТКАЗ: VYPUSK_ZHURNAL_DIR='+zd+' — боевой журнал '+str(bj) in p.stderr,str(p.returncode)+' '+o[-3000:]
   assert 'МЕТАПАКЕТ' not in o and 'СЛЕД' not in o and not (bj/'zhurnal.tsv').exists(),'след в «боевом»: '+o[-3000:]
  check('A-N-1975 11в: VYPUSK_POLKA_DIR with explicit battle journal (substituted constant) -> ОТКАЗ, no trace',lambda:p11v(str(bj)))
  check('A-N-1975 11в: battle journal named through a symlink -> same ОТКАЗ (realpath)',lambda:p11v(str(ssylka)))
 try:proby_1975()
 finally:
  if ro75.exists():
   assert str(ro75).startswith(td+'/');subprocess.run(['sudo','-n','rm','-rf','--',str(ro75)])
 setrows(rows[:2])
 for option in ['--dry-run','-n','--check']:
  p=subprocess.run(['bash',str(gate),option],text=True,capture_output=True,timeout=5)
  check('unknown argument '+option+' refuses before release',lambda p=p:refused(p))
 print('RESULT release-copy gates',passed,'/',passed+failed+blind,'· СЛЕПОТА',blind,'(не измерено)' if blind else '')
sys.exit(1 if failed else 2 if blind else 0)
