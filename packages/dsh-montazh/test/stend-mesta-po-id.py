"""B-N-2033 (Аврора, 14.10.2026; замысел Гаммы 51aa233e, условия Вениамина 00:4xZ): несколько записей derevo одного subdir — единица
сверки по местам = registry ID, отбор — VYPUSK_KOPII. Гоняет НАСТОЯЩИЕ ворота (довод 1, иначе соседний ../bin/vypusk-tegom) на
подставном мире во временном каталоге: пакет, две записи derevo (места — файлы во временном каталоге), реестр, журнал; обходчик подставной.
Коды: 0 — все пробы; 1 — красные; 2 — слепота стенда. ЧЕГО НЕ ЛОВИТ: настоящий обходчик; режим дерева без package.json (PYD — одна запись,
не менялся); сторож vypusk-okno-watch (PY_DEREVO) — его стенды отдельно.
"""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,tempfile,yaml
gate=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'bin/vypusk-tegom'
if not gate.is_file():print('СЛЕПОТА: предмет не найден');sys.exit(2)
ok=bad=0
def check(imya,fn):
 global ok,bad
 try:fn();ok+=1;print('PASS',imya)
 except AssertionError as e:bad+=1;print('FAIL',imya,'—',str(e)[-1500:].replace('\n',' | '))
NAME='dsh-mesta-fixture';V='1.3.2'
with tempfile.TemporaryDirectory(prefix='stend-mesta-po-id-',dir=os.environ.get('TMPDIR') or '/var/tmp') as td:
 root=Path(td);kat=root/'dsh-plugins'/'packages'/NAME;(kat/'src').mkdir(parents=True);(kat/'test').mkdir()
 (kat/'package.json').write_text(json.dumps({'name':NAME,'version':V,'files':['src']}))
 (kat/'CHANGELOG.md').write_text('# H\n\n## '+V+' — fixture\n');(kat/'src/a.js').write_text('export const a = 132;\n');(kat/'src/b.js').write_text('export const b = 2;\n')
 (kat/'test/stend-m.sh').write_text('#!/bin/sh\necho PASS m\n')
 mA=root/'anna';mV=root/'varvara'
 for m in (mA,mV):m.mkdir();shutil.copy2(kat/'src/a.js',m/'a.js');shutil.copy2(kat/'src/b.js',m/'b.js')
 def zap(ident,m,files=None,extra=None):
  return {'id':ident,'path':'см. derevo.files','source':{'type':'git','address':'x'},'derevo':{'subdir':'packages/'+NAME,
          'files':files if files is not None else [{'remote':'src/a.js','local':str(m/'a.js')},{'remote':'src/b.js','local':str(m/'b.js')}],**(extra or {})}}
 registry=root/'plugins.yaml';scope=root/'scope.json';walker=root/'walker.py';vidit=root/'vidit.json'
 DVE=[zap('socseti-anna',mA),zap('socseti',mV)]
 def inv(services=None,ids=None,ver=V,bypass=True,raw_scope=None):
  registry.write_text(yaml.safe_dump({'plugins':[],'services':services if services is not None else DVE}))
  env={**os.environ,'VYPUSK_REESTR':str(registry),'VYPUSK_ZHURNAL_DIR':str(root/'zh')}
  for k in ('VYPUSK_KOPII','STENDY_INACHE','OBHODCHIK','VYPUSK_POLKA_DIR'):env.pop(k,None)
  if bypass:env['STENDY_INACHE']='B-N-2033: synthetic places fixture'
  else:env['OBHODCHIK']=str(walker)
  if ids is not None or raw_scope is not None:
   scope.write_text(raw_scope if raw_scope is not None else json.dumps({'package':NAME,'version':ver,'copies':ids}));env['VYPUSK_KOPII']=str(scope)
  p=subprocess.run(['bash',str(gate),str(kat)],text=True,errors='replace',capture_output=True,env=env,timeout=180)
  return p,p.stdout+p.stderr
 def isxod(kod,*nado,net=(),**kw):
  def f():
   p,o=inv(**kw)
   assert p.returncode==kod and all(x in o for x in nado) and not any(x in o for x in net),'код '+str(p.returncode)+' '+o[-2500:]
  return f
 OBA='МЕСТА СВЕРЕНЫ: socseti — 2 из 2'
 check('1 две записи одного subdir, оба места = выпуску → 0, названы оба ID',isxod(0,OBA,'МЕСТА СВЕРЕНЫ: socseti-anna — 2 из 2','АННОТАЦИЯ ОБЛАСТИ: derevo=socseti,socseti-anna;'))
 check('1б порядок записей обратный → тот же набор и исход',isxod(0,OBA,'derevo=socseti,socseti-anna;',services=list(reversed(DVE))))
 # старый бой Варвары: без области — отказ по её ID (не выбор «совпавшей»); с областью Анны — 0, Варвара «вне выпуска»
 before=hashlib.sha256((mV/'a.js').read_bytes()).hexdigest()[:16];(mV/'a.js').write_text('export const a = 125; // B-N-2033 STARYJ BOJ\n')
 print('ПОРЧА старый бой Варвары a.js:',before,'→',hashlib.sha256((mV/'a.js').read_bytes()).hexdigest()[:16])
 check('2 без области старый бой одной записи → 1 по её ID',isxod(1,'ОТКАЗ: выпуск ≠ бою по местам (socseti): src/a.js → '+str(mV/'a.js'),net=('(socseti-anna):',)))
 check('2б область [socseti-anna] → 0, socseti названа вне выпуска',isxod(0,'МЕСТА СВЕРЕНЫ: socseti-anna — 2 из 2','ВНЕ ЭТОГО ВЫПУСКА (явный subset): socseti',net=('МЕСТА СВЕРЕНЫ: socseti —',),ids=['socseti-anna']))
 shutil.copy2(kat/'src/a.js',mV/'a.js')
 bA=hashlib.sha256((mA/'b.js').read_bytes()).hexdigest()[:16];(mA/'b.js').write_text('B-N-2033 PORCHA\n');print('ПОРЧА место Анны b.js:',bA,'→',hashlib.sha256((mA/'b.js').read_bytes()).hexdigest()[:16])
 check('3 порча выбранного места → 1 с ID, remote и local',isxod(1,'ОТКАЗ: выпуск ≠ бою по местам (socseti-anna): src/b.js → '+str(mA/'b.js')))
 check('3б порча места, исключённого областью [socseti] → 0, исключённая названа',isxod(0,OBA,'ВНЕ ЭТОГО ВЫПУСКА (явный subset): socseti-anna',ids=['socseti']))
 shutil.copy2(kat/'src/b.js',mA/'b.js');check('3в возврат → 0',isxod(0,OBA))
 S='СЛЕПОТА'
 check('4 неизвестный ID в области → 2',isxod(2,S,ids=['socseti-net']))
 check('4б повторный ID → 2',isxod(2,S,ids=['socseti','socseti']))
 check('4в пустая область → 2',isxod(2,S,ids=[]))
 check('4г область другого номера → 2',isxod(2,S,ids=['socseti'],ver='1.2.5'))
 check('4д смешанная область (derevo + чужой id) → 2',isxod(2,'смешивает записи derevo',services=DVE+[{'id':'kopiya-x','path':'/net'}],ids=['socseti','kopiya-x']))
 check('5 одна запись без files при другой хорошей → 2',isxod(2,'в записи derevo socseti нет files',services=[zap('socseti-anna',mA),zap('socseti',mV,files=[])]))
 check('5б у одной все files прощены → 2',isxod(2,'socseti: сверять нечего',services=[zap('socseti-anna',mA),zap('socseti',mV,extra={'expected_diff_files':['src/a.js','src/b.js']})]))
 def p5v():
  (mV/'a.js').write_text('B-N-2033 STARYJ\n')
  try:isxod(1,'ОТКАЗ: выпуск ≠ бою по местам (socseti): src/a.js',services=[zap('socseti-anna',mA,extra={'expected_diff_files':['src/a.js']}),zap('socseti',mV)])()
  finally:shutil.copy2(kat/'src/a.js',mV/'a.js')
 check('5в expected_diff_files одной записи не прощает место другой',p5v)
 check('6 кривой remote → 2',isxod(2,'небезопасный remote',services=[zap('socseti-anna',mA),zap('socseti',mV,files=[{'remote':'../x','local':str(mV/'a.js')}])]))
 check('6б повторный remote внутри ID → 2',isxod(2,'повторный remote в derevo socseti',services=[zap('socseti-anna',mA),zap('socseti',mV,files=[{'remote':'src/a.js','local':str(mV/'a.js')},{'remote':'src/a.js','local':str(mV/'b.js')}])]))
 check('6в файла нет в дереве выпуска → 2',isxod(2,'запись отстала',services=[zap('socseti-anna',mA),zap('socseti',mV,files=[{'remote':'src/net.js','local':str(mV/'a.js')}])]))
 check('6г места нет на диске → 1',isxod(1,'(socseti): src/a.js → '+str(root/'net'/'a.js'),services=[zap('socseti-anna',mA),zap('socseti',mV,files=[{'remote':'src/a.js','local':str(root/'net'/'a.js')}])]))
 check('7 общая цель двух ID (тот же remote) → названа, не два диска',isxod(0,'ОБЩИЕ ЦЕЛИ нескольких записей (2)',services=[zap('socseti-anna',mA),zap('socseti',mA)]))
 check('7б общая цель с разным remote → 2',isxod(2,'несовместимая привязка',services=[zap('socseti-anna',mA),zap('socseti',mV,files=[{'remote':'src/b.js','local':str(mA/'a.js')}])]))
 mnogo=[{'remote':'src/f%d.js'%i,'local':str(root/'f'/str(i))} for i in range(9000)]
 check('8 больше 16384 мест на выпуск → 2 с числом и порогом',isxod(2,'мест derevo в выпуске 18000 (2 записей) — больше порога 16384',services=[zap('socseti-anna',mA,files=mnogo),zap('socseti',mV,files=mnogo)]))
 # план стендов: стенды дерева выпуска один раз на набор ID; план = сверке; реестр сменился за прогон → 2
 walker.write_text('#!/usr/bin/python3\nimport os,json\nfrom pathlib import Path\n'
  'Path('+repr(str(vidit))+').write_text(json.dumps({k:os.environ.get(k) for k in ("OBLAST_STENDOV","PERECHEN_STENDOV")}))\n'
  'print("ПАКЕТ: зелёных 1 красных 0 слепых 0");print("КАТАЛОГ ПАКЕТА: '+str(kat)+'/")\n#SMENA\n');walker.chmod(0o755)
 def plan(ids,nabor):
  def f():
   if vidit.exists():vidit.unlink()
   p,o=inv(bypass=False,ids=ids);v=json.loads(vidit.read_text()) if vidit.exists() else {}
   assert p.returncode==0 and 'ОБЛАСТЬ СТЕНДОВ ВЫПУСКА: пакет по местам (derevo '+nabor+')' in o and 'derevo='+nabor+';' in o,o[-2500:]
   assert (v.get('OBLAST_STENDOV') or '').split('\n')[0]==str(kat.resolve())+'/' and Path(v.get('PERECHEN_STENDOV') or '/net').name=='perechen-vypuska','область: '+repr(v)
  return f
 check('9 план без области: стенды дерева выпуска, набор ID плана = сверки',plan(None,'socseti,socseti-anna'))
 check('9б план с областью [socseti-anna]: план DEREVO принят под VYPUSK_KOPII',plan(['socseti-anna'],'socseti-anna'))
 walker.write_text(walker.read_text().replace('#SMENA','open('+repr(str(registry))+',"a").write("# смена реестра за прогон\\n")'))
 check('10 реестр сменился между планом и сверкой → 2',isxod(2,'план стендов и сверка разошлись в записях derevo',bypass=False))
print(f'RESULT места по ID {ok} / {ok+bad}')
sys.exit(0 if bad==0 else 1)
