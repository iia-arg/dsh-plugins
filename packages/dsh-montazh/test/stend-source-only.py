"""B-N-2030 (Аврора, 14.10.2026; замысел Гаммы 51aa233e, MED Вениамина 00:4xZ): SOURCE_ONLY — пакет, чья единственная запись указывает
на сам каталог выпуска (dsh-pamyat-vyvoz). Гоняет НАСТОЯЩИЕ ворота (довод 1, иначе соседний ../bin/vypusk-tegom) на подставном мире:
пакет в git, реестр, полка (VYPUSK_POLKA_DIR) и журнал (VYPUSK_ZHURNAL_DIR) — во временном каталоге; архивы и журнал root:root кладёт
sudo -n. Боевые полка, журнал, реестр и метки не трогаются. Обходчик — подставной (пишет полученную область в файл).
Коды: 0 — все пробы; 1 — красные; 2 — слепота стенда. ЧЕГО НЕ ЛОВИТ: настоящий обходчик и стенды vyvoz; что архив полки — тот, что
положила рука выпуска (ворота сверяют полку с закреплённой суммой, а закрепление — дело принимавшего).
"""
from pathlib import Path
import hashlib,io,json,os,shutil,subprocess,sys,tarfile,tempfile,yaml
gate=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'bin/vypusk-tegom'
zapis=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else gate.parents[1]/'libexec/vypusk-tegom/zhurnal-zapis'
if not gate.is_file() or not os.access(zapis,os.X_OK):print('СЛЕПОТА: предмет или помощник журнала не найден');sys.exit(2)
if subprocess.run(['sudo','-n','true'],capture_output=True).returncode!=0:print('СЛЕПОТА: нужен sudo -n (архив root:root, журнал root)');sys.exit(2)
ok=bad=0
def check(imya,fn):
 global ok,bad
 try:fn();ok+=1;print('PASS',imya)
 except AssertionError as e:bad+=1;print('FAIL',imya,'—',str(e)[-1500:].replace('\n',' | '))
NAME='dsh-pamyat-vyvoz';V='0.0.1'
with tempfile.TemporaryDirectory(prefix='stend-source-only-',dir=os.environ.get('TMPDIR') or '/var/tmp') as td:
 root=Path(td);mg=root/'mg';kat=mg/NAME;(kat/'src').mkdir(parents=True);(kat/'test').mkdir()
 (kat/'package.json').write_text(json.dumps({'name':NAME,'version':V,'files':['src']}))
 (kat/'CHANGELOG.md').write_text('# History\n\n## '+V+' — fixture\n');(kat/'src/vyvoz.js').write_text('export const v = 1;\n')
 (kat/'src/vvoz.js').write_text('export const w = 2;\n');(kat/'test/stend-proba.sh').write_text('#!/bin/sh\nexit 0\n')
 g=['git','-C',str(mg),'-c','user.name=stend','-c','user.email=stend@sadik','-c','commit.gpgsign=false']
 for a in (['init','-q'],['add','-A'],['commit','-qm','B-N-2030 fixture']):subprocess.run(g+a,capture_output=True,check=True)
 zh=root/'ro'/'zhurnal';polka=root/'polka';polka.mkdir();(root/'ro').mkdir()
 subprocess.run(['sudo','-n','install','-d','-o','root','-g','root','-m','0755',str(zh)],check=True)
 pk=root/'pack';pk.mkdir();subprocess.run(['npm','pack','--ignore-scripts','--pack-destination',str(pk)],cwd=str(kat),capture_output=True,check=True)
 goden=(pk/(NAME+'-'+V+'.tgz')).read_bytes();S0=hashlib.sha256(goden).hexdigest();ARH=polka/(NAME+'-'+V+'.tgz')
 def chleny():
  with tarfile.open(fileobj=io.BytesIO(goden),mode='r:gz') as t:return [(m,t.extractfile(m).read() if m.isfile() else None) for m in t]
 def sobrat(zamena={},dop=(),bez=(),mtime=None):
  b=io.BytesIO()
  with tarfile.open(fileobj=b,mode='w:gz') as t:
   for m,d in chleny()+list(dop):
    if m.name in bez:continue
    if m.name in zamena:d=zamena[m.name];m.size=len(d)
    if mtime is not None:m.mtime=mtime
    t.addfile(m,io.BytesIO(d) if d is not None else None)
  return b.getvalue()
 def ti(name,typ,link=''):
  m=tarfile.TarInfo(name);m.type=typ;m.linkname=link;m.mode=0o644;return (m,None)
 def polozhit(data,rezhim='0644',owner='root'):
  if ARH.is_symlink() or ARH.exists():subprocess.run(['sudo','-n','rm','-f',str(ARH)],check=True)
  vr=root/'vr.tgz';vr.write_bytes(data)
  subprocess.run(['sudo','-n','install','-o',owner,'-g',owner,'-m',rezhim,str(vr),str(ARH)],check=True);vr.unlink()
  return hashlib.sha256(data).hexdigest()
 registry=root/'plugins.yaml';scope=root/'scope.json';walker=root/'walker.py';vidit=root/'vidit.json'
 def zapis_src(ident=NAME,polka_f='pin',sha=None,ver=V,path=None,src_type='local-dir'):
  r={'id':ident,'path':str(path or kat),'source':{'type':src_type,'address':str(path or kat)}}
  if polka_f=='pin':r['polka']={'version':ver,'sha256':sha or S0}
  elif polka_f is not None:r['polka']=polka_f
  return r
 def inv(plugins=None,services=(),ids=None,bypass=True,polka_dir=str(polka)):
  registry.write_text(yaml.safe_dump({'plugins':plugins if plugins is not None else [zapis_src()],'services':list(services)}))
  env={**os.environ,'VYPUSK_REESTR':str(registry),'VYPUSK_ZHURNAL_DIR':str(zh),'VYPUSK_ZHURNAL_ZAPIS':str(zapis),'VYPUSK_POLKA_DIR':polka_dir}
  for k in ('VYPUSK_KOPII','STENDY_INACHE','OBHODCHIK'):env.pop(k,None)
  if bypass:env['STENDY_INACHE']='B-N-2030: synthetic source-only fixture'
  else:env['OBHODCHIK']=str(walker)
  if ids is not None:scope.write_text(json.dumps({'package':NAME,'version':V,'copies':ids}));env['VYPUSK_KOPII']=str(scope)
  p=subprocess.run(['bash',str(gate),str(kat)],text=True,errors='replace',capture_output=True,env=env,timeout=180)
  return p,p.stdout+p.stderr
 def sledov():
  f=zh/'zhurnal.tsv';return len(f.read_text().splitlines()) if f.exists() else 0
 def godno(p,o,n0):
  assert p.returncode==0,o[-2500:]
  assert 'ИСТОЧНИК (не копия): '+NAME in o and 'SOURCE_ONLY '+NAME+' '+V+': источник '+NAME in o and 'SHA256='+S0+' = закреплённой' in o,o[-2500:]
  nf=sum(1 for m,d in chleny() if m.isfile())
  assert 'файлов '+str(nf)+' из '+str(nf) in o and 'СВЕРЕННЫЕ ЧЛЕНЫ ('+str(nf)+'): ' in o and 'src/vyvoz.js' in o,o[-2500:]
  assert 'АННОТАЦИЯ ОБЛАСТИ: source_only='+NAME+'; polka='+str(ARH)+'; sha256='+S0 in o,o[-2500:]
  assert 'СЛЕД ЗАПИСАН: '+NAME+'-v'+V in o and sledov()==n0+1,'след: '+str(n0)+' → '+str(sledov())+' '+o[-1500:]
  assert 'КОПИЯ ВЫПУСКА СВЕРЕНА' not in o and 'смонтирован' not in o,o[-1500:]
 def p_godno():
  n0=sledov();p,o=inv();godno(p,o,n0)
 def otkaz(kod,*nado,**kw):
  def f():
   n0=sledov();p,o=inv(**kw)
   assert p.returncode==kod and all(x in o for x in nado),'код '+str(p.returncode)+' '+o[-2500:]
   assert sledov()==n0,'след при отказе: '+str(n0)+' → '+str(sledov())
   assert '✅ можно' not in o,o[-1500:]
  return f
 polozhit(goden)
 check('1 исправное: источник единственный, архив полки = закреплённой = тарболу ворот → 0, SOURCE_ONLY, след',p_godno)
 # MED Вениамина: переупакованный из того же дерева архив (тот же состав, другая сумма — mtime gzip) ≠ закреплённой → ОТКАЗ 1
 per=sobrat(mtime=1234567890);s1=polozhit(per);print('ПОРЧА переупаковка: sha',S0[:16],'→',s1[:16],'(состав тот же)')
 check('2 переупакованный архив с другой суммой → 1 «≠ закреплённой», следа нет',otkaz(1,'≠ закреплённой в реестре '+S0))
 def p2b():
  p,o=inv(plugins=[zapis_src(sha=s1)])
  assert p.returncode==0 and 'SHA256='+s1+' = закреплённой' in o,o[-1500:]
 check('2б при закреплении суммы переупакованного (состав тот же) → 0: решает закрепление',p2b)
 polozhit(goden)
 check('3 поля polka нет → 2 «не закреплена»',otkaz(2,'сумма архива полки не закреплена',plugins=[zapis_src(polka_f=None)]))
 check('3б polka для другой версии → 2',otkaz(2,'закреплён архив выпуска 0.0.0',plugins=[zapis_src(ver='0.0.0')]))
 check('3в polka кривая (лишний ключ) → 2',otkaz(2,'поле polka записи',plugins=[zapis_src(polka_f={'version':V,'sha256':S0,'kto':'x'})]))
 check('3г polka кривая (сумма не 64 hex) → 2',otkaz(2,'поле polka записи',plugins=[zapis_src(polka_f={'version':V,'sha256':S0[:16]})]))
 isk=next(m.name for m,d in chleny() if m.name.endswith('src/vyvoz.js'));orig=dict((m.name,d) for m,d in chleny())[isk]
 isp=bytearray(orig);isp[0]^=1;bad1=sobrat(zamena={isk:bytes(isp)});s2=polozhit(bad1);print('ПОРЧА член src/vyvoz.js: sha',S0[:16],'→',s2[:16])
 check('4 порча члена, закреплена прежняя сумма → 1 «≠ закреплённой»',otkaz(1,'≠ закреплённой'))
 check('4б порча члена, закреплена сумма порченого → 1 «различаются: src/vyvoz.js»',otkaz(1,'≠ тарболу ворот','различаются: src/vyvoz.js',plugins=[zapis_src(sha=s2)]))
 polozhit(goden);check('4в возврат архива → 0',p_godno)
 check('5 архива нет → 2',(lambda:(subprocess.run(['sudo','-n','rm','-f',str(ARH)],check=True),otkaz(2,'архива полки нет')())[1]))
 polozhit(goden)
 tgt=root/'tgt.tgz';tgt.write_bytes(goden);subprocess.run(['sudo','-n','rm','-f',str(ARH)],check=True);ARH.symlink_to(tgt)
 check('5б ссылка вместо архива → 2',otkaz(2,'не открыт без перехода по ссылке'));ARH.unlink()
 me=subprocess.run(['id','-un'],capture_output=True,text=True).stdout.strip()
 polozhit(goden,owner=me);check('5в хозяин не root → 2',otkaz(2,'хозяин архива полки не root'))
 polozhit(goden,rezhim='0664');check('5г пишется группой → 2',otkaz(2,'пишется группой или прочими'))
 s3=polozhit(sobrat(dop=[ti('package/src/zlo.js',tarfile.SYMTYPE,'/etc/shadow')]))
 check('6 опасный член (ссылка) при закреплённой сумме → 1',otkaz(1,'символьная ссылка',plugins=[zapis_src(sha=s3)]))
 s4=polozhit(sobrat(bez=(isk,)));check('6б в архиве нет файла → 1 «нет в архиве»',otkaz(1,'нет в архиве: src/vyvoz.js',plugins=[zapis_src(sha=s4)]))
 polozhit(goden)
 # роль — только точная; прочее — прежняя слепота «сам каталог выпуска»
 SAM='сверка с собой ничего не доказывает'
 check('7 запись источника с id ≠ имени → прежняя 2',otkaz(2,SAM,plugins=[zapis_src(ident='vyvoz-drugoj')]))
 check('7б источник в services → прежняя 2 (нет точной роли)',otkaz(2,SAM,plugins=[],services=[zapis_src()]))
 check('7в явный VYPUSK_KOPII выбирает источник → 2, источник копией не становится',otkaz(2,SAM,ids=[NAME]))
 # настоящая копия рядом с источником судится обычным ходом
 kop=root/'kopiya'/NAME;shutil.copytree(kat,kop)   # копия несёт и стенды дерева — ворота сверяют их тоже
 dve=[zapis_src(),{'id':'vyvoz-kopiya','path':str(kop)}]
 def s_kopiej():
  n0=sledov();p,o=inv(plugins=dve)
  assert p.returncode==0 and 'ИСТОЧНИК (не копия): '+NAME in o and 'КОПИЯ ВЫПУСКА СВЕРЕНА: vyvoz-kopiya' in o and 'SOURCE_ONLY '+NAME+' '+V not in o,o[-2500:]
  assert 'ВНЕ ЭТОГО ВЫПУСКА (явный subset): нет' in o,'источник назван «вне выпуска» как копия: '+o[-1500:]
 check('8 источник + настоящая копия → копия сверена обычным ходом, SOURCE_ONLY не нужен',s_kopiej)
 (kop/'src/vvoz.js').write_text('export const w = 99; // B-N-2030 PORCHA\n')
 check('8б порча настоящей копии → 1 по её имени (SOURCE_ONLY её не прячет)',otkaz(1,'выпуск ≠ копия vyvoz-kopiya',plugins=dve))
 # чужой пакет, указывающий на себя, — прежняя слепота (перечень закрытый)
 chuzh=root/'chuzhoj'/'dsh-copy-fixture';(chuzh/'src').mkdir(parents=True)
 (chuzh/'package.json').write_text(json.dumps({'name':'dsh-copy-fixture','version':V,'files':['src']}));(chuzh/'CHANGELOG.md').write_text('# H\n\n## '+V+'\n');(chuzh/'src/a.js').write_text('1\n')
 def chuzhoj():
  registry.write_text(yaml.safe_dump({'plugins':[{'id':'dsh-copy-fixture','path':str(chuzh),'source':{'type':'local-dir','address':str(chuzh)},'polka':{'version':V,'sha256':S0}}],'services':[]}))
  env={**os.environ,'VYPUSK_REESTR':str(registry),'VYPUSK_ZHURNAL_DIR':str(zh),'VYPUSK_ZHURNAL_ZAPIS':str(zapis),'VYPUSK_POLKA_DIR':str(polka),'STENDY_INACHE':'B-N-2030'}
  env.pop('VYPUSK_KOPII',None);p=subprocess.run(['bash',str(gate),str(chuzh)],text=True,errors='replace',capture_output=True,env=env,timeout=120);o=p.stdout+p.stderr
  assert p.returncode==2 and SAM in o and 'SOURCE_ONLY' not in o,o[-1500:]
 check('9 чужой пакет source=self с полем polka → прежняя 2 (перечень закрытый)',chuzhoj)
 # план стендов: подставной обходчик пишет полученную область; область — дерево выпуска, не старая область обходчика
 walker.write_text('#!/usr/bin/python3\nimport os,json\nfrom pathlib import Path\n'
  'Path('+repr(str(vidit))+').write_text(json.dumps({k:os.environ.get(k) for k in ("OBLAST_STENDOV","PERECHEN_STENDOV")}))\n'
  'p=os.environ.get("PERECHEN_STENDOV");print("ПЕРЕЧЕНЬ:",Path(p).read_text().strip() if p else "нет")\n'
  'print("ПАКЕТ: зелёных 1 красных 0 слепых 0");print("КАТАЛОГ ПАКЕТА: '+str(kat)+'/")\n'
  'import sys;sys.exit(0)\n');walker.chmod(0o755)
 def plan():
  if vidit.exists():vidit.unlink()
  n0=sledov();p,o=inv(bypass=False);v=json.loads(vidit.read_text()) if vidit.exists() else {}
  assert p.returncode==0 and 'ОБЛАСТЬ СТЕНДОВ ВЫПУСКА: SOURCE_ONLY (источник '+NAME in o,o[-2500:]
  assert (v.get('OBLAST_STENDOV') or '').split('\n')[0]==str(kat.resolve())+'/','область обходчика: '+repr(v)
  assert 'ПЕРЕЧЕНЬ: '+str(kat.resolve())+'/test/stend-proba.sh' in o,o[-1500:]
 check('10 план SOURCE_ONLY: обходчик получил область = дерево выпуска и перечень его стенда',plan)
 # план и сверка разошлись (реестр сменился за прогон) → 2
 walker.write_text(walker.read_text().replace('import sys;sys.exit(0)','open('+repr(str(registry))+',"a").write("# смена реестра за прогон\\n")\nimport sys;sys.exit(0)'))
 def razoshlis():
  n0=sledov();p,o=inv(bypass=False)
  assert p.returncode==2 and 'план стендов и сверка разошлись в SOURCE_ONLY' in o and sledov()==n0,o[-2500:]
 check('11 реестр сменился между планом и сверкой → 2, следа нет',razoshlis)
 subprocess.run(['sudo','-n','rm','-rf','--',str(root/'ro'),str(ARH)],check=False)   # журнал и архив — root
print(f'RESULT source-only {ok} / {ok+bad}')
sys.exit(0 if bad==0 else 1)
