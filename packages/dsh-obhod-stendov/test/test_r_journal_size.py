#!/usr/bin/env python3
"""Пробы сторожа R (stend-r-journal-size.py, учёт 0.1.10): три КРАСНЫХ (а)(б)(в), жёлтого нет. Нужен root (sudo -n): policy — root-файл,
каталоги и R — чужого uid (nobody), «службы TG» — временные юниты systemd-run со своими именами (стоп — по сохранённым именам, не по маске).
Каждая порча печатает факт внесения; после каждой — возврат и снова «молчит». Боевые policy, R и службы не трогаются.
CLI: --otlozheno, отказы, (а) и профиль источников Гаммы (--istochniki: participants[].name/uid/runtimeSource.raw/tgService) — исправное,
его порчи и (б) через профиль; прочий суд (б)(в) — функция sudit() пробы, тот же код.
Довод: [путь к пробе] (умолч. stend-r-journal-size.py рядом). Код: 0 — все сошлись, 1 — нет, 2 — слепота стенда."""
import importlib.util,json,os,re,shutil,subprocess,sys,tempfile,time,uuid
sys.dont_write_bytecode=True   # загрузка пробы через importlib иначе пишет test/__pycache__ в дерево (python3 -I не видит PYTHONDONTWRITEBYTECODE) — класс ИП 3.1.111
from pathlib import Path
PROBA=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().with_name('stend-r-journal-size.py')
FILTR=re.compile(r'^STEND-(TEMP|EXEC|G-METRIC|AP-METRIC|R-METRIC): ')   # копия фильтра обхода 3.1.111
N=33554432;R=65536;UID=65534
POLE='tgService'   # поле службы участника — договор с профилем Гаммы (3e8f1713), тест знает его сам, не из модуля пробы
if os.geteuid()!=0:print('СЛЕПОТА стенда: нужен root (policy root, R чужого uid, systemd-run)');sys.exit(2)
sp=importlib.util.spec_from_file_location('stend_r',PROBA);M=importlib.util.module_from_spec(sp);sp.loader.exec_module(M)
B=Path(tempfile.mkdtemp(prefix='stend-r-',dir=os.environ.get('TMPDIR','/var/tmp')));os.chmod(B,0o755)
RND=uuid.uuid4().hex[:8];UNITS=[];ok=fail=0
def ochet(imya,kod,out,ozh,est=(),net=()):
 global ok,fail
 beda=[f'строка не пройдёт фильтр обхода: «{x[:60]}»' for x in out.splitlines() if x and not x.startswith('ОТКАЗ') and not FILTR.match(x)]
 if kod!=ozh:beda.append(f'код {kod} ≠ {ozh}')
 beda+=[f'нет «{s}»' for s in est if s not in out]+[f'есть «{s}»' for s in net if s in out]
 if beda:fail+=1;print(f'FAIL {imya} — '+'; '.join(beda));print('       '+out.strip().replace('\n','\n       ')[-1500:])
 else:ok+=1;print(f'ok   {imya}')
def cli(imya,args,ozh,est=(),net=()):
 q=subprocess.run([sys.executable,'-I',str(PROBA),*args],capture_output=True,text=True,timeout=60);ochet(imya,q.returncode,q.stdout+q.stderr,ozh,est,net)
def sud(imya,ozh,est=(),net=()):
 k,lines=M.sudit(str(P),SRC);ochet(imya,k,'\n'.join(lines),ozh,est,net)
def root(i):return B/i/'.message-receipts'
def f(i):return root(i)/'usage-runtime-v1.jsonl'
try:
 pd=B/'pol';pd.mkdir(mode=0o755);os.chmod(pd,0o755);P=pd/'usage-runtime-policy.json'
 GOOD=json.dumps(dict(schemaVersion=1,fileMaxBytes=N,recordMaxBytes=R));P.write_text(GOOD);os.chmod(P,0o644)
 SRC=[]
 for i,akt in (('alfa',True),('beta',True),('gamma',False)):
  root(i).mkdir(parents=True);os.chmod(root(i),0o700);os.chown(root(i),UID,UID)
  u=f'stend-r-{RND}-{i}.service'
  if akt:subprocess.run(['systemd-run','--quiet','--unit='+u,'-p','RuntimeMaxSec=600','--collect','/bin/sleep','590'],check=True);UNITS.append(u)
  if akt:f(i).touch();os.chmod(f(i),0o600);os.chown(f(i),UID,UID);os.truncate(f(i),1000)
  SRC.append(dict(istochnik=i,uid=UID,root=str(root(i)),r=str(f(i)),sluzhba=u))
 time.sleep(1)
 A=['--policy',str(P)]
 cli('--otlozheno → «не ведётся», код 0',['--otlozheno'],0,['не ведётся, включение отложено'],['FAIL','СЛЕПОТА'])
 cli('без доводов: policy боя на машине пока нет → (а) КРАСНОЕ с путём',[],1,['FAIL (а) policy /etc/dsh-telegram-multiagent/usage-runtime-policy.json'])
 cli('чужое слово --dry-run → ОТКАЗ код 2',['--dry-run'],2,['ОТКАЗ'])
 cli('--otlozheno вместе с --policy → ОТКАЗ',['--otlozheno',*A],2,['ОТКАЗ'])
 cli('policy годна, конфиг источников не задан → СЛЕПОТА «не задан», не свой список',A,2,['ПОДМЕНА policy','СЛЕПОТА конфиг источников не задан'],['FAIL'])
 prd=B/'prof';prd.mkdir(mode=0o755);os.chmod(prd,0o755);PR=prd/'source-profile.json'
 def prof(**izm):
  uch=[dict(name=x['istochnik'],uid=UID,gid=UID,home=str(B/x['istochnik']),engine='codex',sources={},runtimeSource=dict(home=str(B/x['istochnik']),raw=x['r'],ledger=x['r']+'.ledger',native=[]),tgService=x['sluzhba']) for x in SRC]
  for k,v in izm.items():
   for u in uch:
    if v is None:u.pop(k,None)
    else:u[k]=v
  PR.write_text(json.dumps(dict(schemaVersion=1,mailDatabase='/x',projectRoots=['/x'],participants=uch)));os.chmod(PR,0o644)
 I=[*A,'--istochniki',str(PR)]
 cli('--istochniki: профиля нет → СЛЕПОТА с путём, не свой список',I,2,[f'СЛЕПОТА профиль источников {PR}: нет'],['FAIL'])
 prof();print(f'   профиль положен: {len(SRC)} участника, поле службы {POLE}')
 cli('--istochniki: профиль годен, исправное → молчит',I,0,['alfa · 1000 Б из 33554432','норма','inactive, R нет · не судится','источников 3','КРАСНЫХ 0'],['FAIL','СЛЕПОТА'])
 prof(tgService=None);print(f'   порча профиля: поле {POLE} убрано у всех')
 cli('профиль без поля службы → СЛЕПОТА «(в) не проверить», не красное',I,2,[f'нет поля службы {POLE}'],['FAIL'])
 prof(uid='65534');print('   порча профиля: uid строкой');cli('профиль: uid не целое → СЛЕПОТА',I,2,['uid не целое'],['FAIL'])
 prof();os.chmod(PR,0o666);print('   порча: профиль 644 → 666');cli('профиль доступен на запись прочим → СЛЕПОТА «не защищён»',I,2,['не защищён'],['FAIL'])
 prof();print('   возврат: профиль годен');cli('возврат → молчит',I,0,['КРАСНЫХ 0'],['FAIL','СЛЕПОТА'])
 os.truncate(f('alfa'),N+1);print(f"   (б) порча через профиль: alfa {f('alfa').stat().st_size} Б");cli('(б) через профиль → КРАСНОЕ с источником из name',I,1,['FAIL alfa','КРАСНОЕ (б)'])
 os.truncate(f('alfa'),1000);print('   возврат: alfa 1000 Б');cli('возврат → молчит',I,0,['КРАСНЫХ 0'],['FAIL'])
 os.rename(P,pd/'x');print('   (а) порча: policy убрана (переименована)');cli('(а) policy нет → КРАСНОЕ с путём',A,1,[f'FAIL (а) policy {P}: нет','итог · КРАСНОЕ (а)'])
 os.rename(pd/'x',P);print('   возврат: policy на месте');cli('возврат → снова «конфиг источников не задан», без (а)',A,2,['конфиг источников не задан'],['FAIL'])
 P.write_text(json.dumps(dict(schemaVersion=1,fileMaxBytes=N,recordMaxBytes=R,warningPercent=75)));print('   (а) порча: лишнее поле warningPercent')
 cli('(а) форма не та (лишний ключ) → КРАСНОЕ',A,1,['FAIL (а) policy','форма не та'])
 P.write_text(json.dumps(dict(schemaVersion=1,recordMaxBytes=R)));print('   (а) порча: fileMaxBytes убран');cli('(а) нет fileMaxBytes → КРАСНОЕ, запасного числа нет',A,1,['форма не та'])
 P.write_text(GOOD);os.chmod(P,0o666);print('   (а) порча: режим policy 644 → 666');cli('(а) policy доступна на запись прочим → КРАСНОЕ',A,1,['не защищена'])
 os.chmod(P,0o644);print('   возврат: policy 644, форма годна');cli('возврат → без (а)',A,2,['конфиг источников не задан'],['FAIL'])
 sud('исправное: alfa/beta active, R 1000 Б свежие, gamma не active без R → молчит',0,['alfa · 1000 Б из 33554432','норма','gamma · служба stend-r-','inactive, R нет · не судится (писать некому)','КРАСНЫХ 0'],['FAIL'])
 os.truncate(f('alfa'),N);print(f"   (б) граница: alfa {f('alfa').stat().st_size} Б = fileMaxBytes");sud('(б) ровно fileMaxBytes → молчит (предел законен)',0,['alfa · 33554432 Б'],['FAIL'])
 os.truncate(f('alfa'),N+1);print(f"   (б) порча: alfa {f('alfa').stat().st_size} Б");sud('(б) > fileMaxBytes → КРАСНОЕ с источником',1,['FAIL alfa','КРАСНОЕ (б) обрезка не сработала · 33554433 Б > fileMaxBytes 33554432 Б','КРАСНЫХ 1 (б 1, в 0)'],['FAIL beta'])
 os.truncate(f('alfa'),1000);print('   возврат: alfa 1000 Б');sud('возврат → молчит',0,['КРАСНЫХ 0'],['FAIL'])
 P.write_text(json.dumps(dict(schemaVersion=1,fileMaxBytes=900,recordMaxBytes=100)));print('   policy: fileMaxBytes 33554432 → 900 (меньше R по 1000 Б)')
 sud('смена предела в policy → порог сторожа сменился: (б) у обоих',1,['КРАСНОЕ (б) обрезка не сработала · 1000 Б > fileMaxBytes 900 Б','FAIL alfa','FAIL beta','fileMaxBytes 900'])
 P.write_text(GOOD);print('   возврат: policy исходная');sud('возврат → молчит',0,['fileMaxBytes 33554432'],['FAIL'])
 t=time.time()-(M.MOLCHANIE_S+1);os.utime(f('alfa'),(t,t));print(f"   (в) порча: mtime alfa на {M.MOLCHANIE_S+1} с назад");sud('(в) active, mtime > 300 с → КРАСНОЕ «писатель молчит»',1,['FAIL alfa','КРАСНОЕ (в) писатель молчит','КРАСНЫХ 1 (б 0, в 1)'])
 t=time.time()-(M.MOLCHANIE_S-30);os.utime(f('alfa'),(t,t));print(f"   (в) граница: mtime alfa на {M.MOLCHANIE_S-30} с назад");sud('(в) 270 с → молчит',0,['КРАСНЫХ 0'],['FAIL'])
 os.utime(f('alfa'));os.rename(f('beta'),root('beta')/'x');print('   (в) порча: R beta убран, служба active')
 sud('(в) active, R нет → КРАСНОЕ «писатель молчит» с путём',1,['FAIL beta · КРАСНОЕ (в) писатель молчит','а R нет'])
 os.rename(root('beta')/'x',f('beta'));os.utime(f('beta'));print('   возврат: R beta на месте');sud('возврат → молчит',0,['КРАСНЫХ 0'],['FAIL'])
 f('gamma').touch();os.chmod(f('gamma'),0o600);os.chown(f('gamma'),UID,UID);t=time.time()-3600;os.utime(f('gamma'),(t,t));print('   gamma: R есть, mtime час назад, служба не active')
 sud('служба не active, старый R → не «молчит» (ложного красного нет)',0,['gamma · 0 Б','служба inactive · норма'],['FAIL'])
 f('gamma').unlink()
 os.chmod(f('alfa'),0o644);print(f"   порча: режим R alfa 600 → {oct(f('alfa').stat().st_mode&0o777)[2:]}");sud('unsafe R → СЛЕПОТА, не красное',2,['СЛЕПОТА alfa: R unsafe','СЛЕПОТА 1 из 3'],['FAIL'])
 os.chmod(f('alfa'),0o600);print('   возврат: 600');sud('возврат → молчит',0,['КРАСНЫХ 0'],['СЛЕПОТА','FAIL'])
finally:
 for u in UNITS:subprocess.run(['systemctl','stop',u],capture_output=True)
 shutil.rmtree(B,ignore_errors=True)
print(f'ИТОГ: сошлось {ok} из {ok+fail}');sys.exit(0 if not fail else 1)
