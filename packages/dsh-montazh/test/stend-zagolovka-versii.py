"""B-N-2029 (Аврора, 14.10.2026; замысел Гаммы 51aa233e, условие Вениамина 00:4xZ): номер выпуска с дефисом внутри pre-release.
Гоняет НАСТОЯЩИЕ ворота (довод 1, иначе соседний ../bin/vypusk-tegom; довод 2 — помощник журнала, иначе соседний) на подставных пакетах: npm — с одной зарегистрированной копией,
равной выпуску (подставной реестр, STENDY_INACHE, подставной журнал); режим дерева — до строки «РЕЖИМ ДЕРЕВА … версия X» (репозиторий
подставлен несуществующим: дальше ворота законно слепнут, судим только извлечённый номер). Матрица — под LC_ALL=C и C.UTF-8.
Коды: 0 — все пробы; 1 — красные; 2 — слепота стенда. ЧЕГО НЕ ЛОВИТ: сравнение номеров по SemVer (ворота сравнивают строки), +build.
"""
from pathlib import Path
import json,os,subprocess,sys,tempfile,shutil,yaml
gate=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'bin/vypusk-tegom'
if not gate.is_file():print('СЛЕПОТА: предмет не найден '+str(gate));sys.exit(2)
zapis=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else gate.parents[1]/'libexec/vypusk-tegom/zhurnal-zapis'   # помощник журнала — тот же образец номера
if not os.access(zapis,os.X_OK):print('СЛЕПОТА: помощник журнала не исполняется '+str(zapis));sys.exit(2)
ok=bad=0
OTKAZ='верхний заголовок CHANGELOG не годится'
with tempfile.TemporaryDirectory(prefix='stend-zagolovka-',dir=os.environ.get('TMPDIR') or '/var/tmp') as td:
 root=Path(td);n=[0]
 def npm(ver,head,loc):
  n[0]+=1;d=root/('p%d'%n[0]);rel=d/'dsh-zagolovok-fixture';(rel/'src').mkdir(parents=True)
  (rel/'package.json').write_text(json.dumps({'name':'dsh-zagolovok-fixture','version':ver,'files':['src']}))
  (rel/'CHANGELOG.md').write_text('# History\n\n'+head+'\n\nтекст\n');(rel/'src/a.js').write_text('export const a=1;\n')
  shutil.copytree(rel,d/'copy');reg=d/'plugins.yaml';reg.write_text(yaml.safe_dump({'plugins':[{'id':'zagolovok-copy','path':str(d/'copy')}],'services':[]}))
  env={**os.environ,'LC_ALL':loc,'VYPUSK_REESTR':str(reg),'VYPUSK_ZHURNAL_DIR':str(d/'journal'),'VYPUSK_ZHURNAL_ZAPIS':str(zapis),'STENDY_INACHE':'B-N-2029: заголовок, стенды не нужны'}
  for k in ('VYPUSK_KOPII','VYPUSK_POLKA_DIR','VYPUSK_AGENTY'):env.pop(k,None)
  return subprocess.run(['bash',str(gate),str(rel)],text=True,errors='replace',capture_output=True,env=env,timeout=120)
 def derevo(head,loc):
  n[0]+=1;rel=root/('d%d'%n[0])/'dsh-zagolovok-derevo';rel.mkdir(parents=True)
  (rel/'CHANGELOG.md').write_text('# History\n\n'+head+'\n')
  env={**os.environ,'LC_ALL':loc,'VYPUSK_REPO':str(root/'net-repo'),'VYPUSK_REESTR':str(root/'net-reestr.yaml'),'VYPUSK_ZHURNAL_DIR':str(root/'journal')}
  return subprocess.run(['bash',str(gate),str(rel)],text=True,errors='replace',capture_output=True,env=env,timeout=60)
 def proba(imya,usl,p):
  global ok,bad
  if usl:ok+=1;print('PASS',imya)
  else:bad+=1;print('FAIL',imya,'— код',p.returncode,(p.stdout+p.stderr)[-600:].replace('\n',' | '))
 def prohod(p):return p.returncode==0 and OTKAZ not in p.stderr and 'СВЕРКА КОПИЙ: 1 из 1' in p.stdout
 def otkaz(p):return p.returncode==1 and OTKAZ in p.stderr
 for loc in ('C','C.UTF-8'):
  s=' ['+loc+']'
  # годные: законные ASCII-дефисы внутри pre-release, в т.ч. в конце идентификатора
  for v,h in [('1.3.0-b2027-notices2','## 1.3.0-b2027-notices2 — уведомления'),('1.3.0-alpha.1-beta','## 1.3.0-alpha.1-beta'),
              ('1.3.0-x-y-z.--','## 1.3.0-x-y-z.-- (крайний случай SemVer)')]:
   p=npm(v,h,loc);proba('годен дефис внутри pre-release: '+v+s,prohod(p),p)
  # прежние разделители после номера
  for h in ['## 1.3.0-b2027-notices2','## 1.3.0-b2027-notices2 текст','## 1.3.0-b2027-notices2 — текст','## 1.3.0-b2027-notices2 (текст)',
            '## 1.3.0-b2027-notices2(текст)','## 1.3.0-b2027-notices2 — кандидат Авроры']:
   p=npm('1.3.0-b2027-notices2',h,loc);proba('годен разделитель: «'+h+'»'+s,prohod(p),p)
  # отказы: префикс в обе стороны (условие Вениамина), строгий хвост B-N-1774, прежние пометки
  for v,h,imya in [('1.3.0-b2027','## 1.3.0-b2027-notices2','префикс: CHANGELOG длиннее манифеста'),
                   ('1.3.0-b2027-notices2','## 1.3.0-b2027','префикс: манифест длиннее CHANGELOG'),
                   ('1.3.0-b2027-notices2','## 1.3.0-b2027-notices3','другой номер'),
                   ('1.0.9','## 1.0.9-кандидат r20','кириллица не часть номера (B-N-1774)'),
                   ('1.3.0-b2027-notices2','## 1.3.0-b2027-notices2/заметка','«/» не годный хвост'),
                   ('1.3.0-b2027-notices2','## 1.3.0-b2027-notices2-','висящий «-» не годный хвост'),
                   ('1.3.0-b2027-notices2','## 1.3.0-b2027-notices2 (не выпущено)','«не выпущено»'),
                   ('1.3.0-b2027-notices2','## 1.3.0-b2027-notices2 — номер — при монтаже','«номер — при монтаже»'),
                   ('1.3.0-b2027-notices2','## 1.3.0-b2027-notices2 — кандидат к окну','«кандидат к »')]:
   p=npm(v,h,loc);proba('отказ 1: '+imya+' (манифест '+v+', «'+h+'»)'+s,otkaz(p),p)
  # режим дерева: номер извлекается целиком и судится тем же правилом
  p=derevo('## 1.3.0-b2027-notices2 — дерево',loc)
  proba('дерево: номер целиком, без отказа заголовка'+s,'версия 1.3.0-b2027-notices2 (заголовок CHANGELOG)' in p.stdout and OTKAZ not in p.stderr,p)
  p=derevo('## 1.0.9-кандидат r20',loc);proba('дерево: кириллица — отказ 1'+s,otkaz(p),p)
  p=derevo('## 1.3.0-b2027-notices2/заметка',loc);proba('дерево: «/» — отказ 1'+s,otkaz(p),p)
print(f'RESULT заголовок выпуска {ok} / {ok+bad}')
sys.exit(0 if bad==0 else 1)
