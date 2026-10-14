"""RU: Стенд починок сторожа: четыре различающие пробы на копии сторожа в подставном дереве.
EN: Watcher fixes stand: four discriminating probes on a copy of the watcher in a fake tree."""
# RU: Сторож — VYPUSK_TEST_WATCH (по умолчанию src/vypusk-okno-watch.sh), исполняется его КОПИЯ во временном каталоге.
#     Канал тревоги подменён собственной настройкой сторожа VYPUSK_ALERT: подставной отправитель дописывает довод в файл.
#     Пробы: (1) VYPUSK_NAPOMINAT не число → слепота с именем настройки, код 2, без ошибки оболочки;
#     (2) асимметрия по составу сверяет путь целиком: файл вне состава x.js не уносит из ожиданий x.js.map из состава;
#     (3) отметка доставки расхождения пишется атомарно: ссылка на месте файла состояния заменяется, цель не трогается;
#     (4) тихий режим не создаёт каталог состояния.
#     Не проверяет: живой канал, боевое дерево, расписание.
# EN: Watcher — VYPUSK_TEST_WATCH (src/vypusk-okno-watch.sh by default); its COPY runs in a temp directory.
#     The alert channel is replaced through the watcher's own VYPUSK_ALERT setting: a fake sender appends its argument to a file.
#     Probes: (1) non-numeric VYPUSK_NAPOMINAT → blindness naming the setting, exit 2, no shell error;
#     (2) the contents asymmetry matches the path whole: x.js outside the contents does not drop x.js.map (inside) from expectations;
#     (3) the mismatch delivery mark is written atomically: a symlink at the state path is replaced, its target untouched;
#     (4) quiet mode does not create the state directory.
#     Does not check: the live channel, the live tree, the schedule.
import os,shutil,subprocess,tempfile,hashlib,json,sys
from pathlib import Path
watch_src=Path(os.environ.get('VYPUSK_TEST_WATCH',Path(__file__).resolve().parents[1] / 'src/vypusk-okno-watch.sh')).resolve()
rows=[]
def proba(name,ok,detail=''):
 rows.append((name,ok));print(('✅ ' if ok else '❌ ')+name+('' if ok else ' — '+detail))
if not watch_src.is_file() or not os.access(watch_src, os.R_OK): print('СЛЕПОТА: предмет не читается:', watch_src); sys.exit(2)
with tempfile.TemporaryDirectory() as tmp:
 r=Path(tmp);watch=r/'watch.sh';shutil.copyfile(watch_src,watch)
 print('проверяем копию:',watch_src,'sha256',hashlib.sha256(watch.read_bytes()).hexdigest()[:16])
 def git(repo,*a):subprocess.run(['git','-C',str(repo),*a],check=True,capture_output=True)
 # RU: Подставное дерево: пакет demo 1.0.0 с составом files=[index.js, x.js.map]; x.js — вне состава; метка demo-v1.0.0.
 # EN: Fake tree: package demo 1.0.0 with files=[index.js, x.js.map]; x.js is outside the contents; tag demo-v1.0.0.
 repo=r/'repo';pk=repo/'packages/demo';pk.mkdir(parents=True)
 (pk/'package.json').write_text(json.dumps({'name':'demo','version':'1.0.0','files':['index.js','x.js.map']}))
 (pk/'CHANGELOG.md').write_text('## 1.0.0\n\nFirst release.\n')
 for n,c in [('index.js','original\n'),('x.js','outside\n'),('x.js.map','map\n')]:(pk/n).write_text(c)
 git(repo,'init');git(repo,'add','.');git(repo,'-c','user.name=probe','-c','user.email=probe@localhost','commit','-m','fixture');git(repo,'tag','demo-v1.0.0')
 root=r/'agent-a'/'plugins';root.mkdir(parents=True);shutil.copytree(pk,root/'demo')
 alert=r/'alert';alert.write_text('#!/bin/sh\nprintf "%s\\n" "$1" >> "$PROBE_CHANNEL"\n');alert.chmod(0o755)
 exceptions=r/'exceptions';exceptions.write_text('')
 # RU: Окружение — только своё: настройки сторожа вызывающего (VYPUSK_*) не наследуются.
 # EN: The environment is our own only: the caller's watcher settings (VYPUSK_*) are not inherited.
 base={k:v for k,v in os.environ.items() if not k.startswith('VYPUSK_')}
 env0={**base,'VYPUSK_REPO':str(repo),'VYPUSK_KORNI':str(r/'empty'),'VYPUSK_AGENT_KORNI':str(root),'VYPUSK_INFO_KORNI':'','VYPUSK_ISKLYUCHENIYA':str(exceptions),'VYPUSK_SSYLKI':'','VYPUSK_RASKLADKA':'','VYPUSK_REESTR':'','VYPUSK_SOOTVETSTVIYA':'','VYPUSK_ALERT':str(alert),'VYPUSK_TIHO':'0','VYPUSK_NAPOMINAT':'86400','PROBE_CHANNEL':str(r/'channel')}
 def run(**over):
  (r/'channel').write_text('')
  return subprocess.run(['bash',str(watch)],env={**env0,**over},capture_output=True,text=True)
 # RU: Копия в бою без x.js и без x.js.map: x.js (вне состава) законно отсутствует, x.js.map (в составе) — расхождение.
 # EN: The live copy lacks x.js and x.js.map: x.js (outside the contents) is legitimately absent, x.js.map (inside) is a mismatch.
 (root/'demo/x.js').unlink();(root/'demo/x.js.map').unlink()
 st=r/'st1'/'poslednyaya.txt'
 # (2)
 p=run(VYPUSK_SOSTOYANIE=str(st))
 proba('(2) файл состава x.js.map, которого нет в бою, — расхождение (x.js вне состава его не уносит)',p.returncode==1 and 'x.js.map' in p.stdout,f'rc={p.returncode} {p.stdout[-300:]}')
 # (1)
 (root/'demo/x.js.map').write_text('map\n')
 p=run(VYPUSK_SOSTOYANIE=str(r/'st0'/'s.txt'),VYPUSK_TIHO='1')
 proba('исправное (x.js.map на месте) — код 0',p.returncode==0,f'rc={p.returncode} {p.stdout[-300:]}')
 p=run(VYPUSK_SOSTOYANIE=str(r/'st0'/'s.txt'),VYPUSK_TIHO='1',VYPUSK_NAPOMINAT='sutki')
 proba('(1) VYPUSK_NAPOMINAT=sutki — слепота с именем настройки, код 2, без ошибки оболочки',p.returncode==2 and 'VYPUSK_NAPOMINAT' in p.stdout and 'integer expression' not in p.stderr,f'rc={p.returncode} out={p.stdout[-200:]} err={p.stderr[-200:]}')
 # (3)
 (root/'demo/index.js').write_text('changed\n')
 d3=r/'st3';d3.mkdir();lovushka=r/'lovushka';lovushka.write_text('ne trogat\n');(d3/'poslednyaya.txt').symlink_to(lovushka)
 p=run(VYPUSK_SOSTOYANIE=str(d3/'poslednyaya.txt'))
 s=d3/'poslednyaya.txt'
 ok=p.returncode==1 and (r/'channel').read_text()!='' and lovushka.read_text()=='ne trogat\n' and not s.is_symlink() and s.is_file() and len(s.read_text().split())==2 and not list(d3.glob('poslednyaya.txt.*'))
 proba('(3) отметка расхождения — новым файлом через mv: ссылка заменена, её цель не тронута, временных нет',ok,f'rc={p.returncode} lovushka={lovushka.read_text()!r} link={s.is_symlink()}')
 # (4)
 d4=r/'net-kataloga'
 p=run(VYPUSK_SOSTOYANIE=str(d4/'poslednyaya.txt'),VYPUSK_TIHO='1')
 proba('(4) тихий режим (VYPUSK_TIHO=1) — каталог состояния не создан',p.returncode==1 and not d4.exists(),f'rc={p.returncode} exists={d4.exists()}')
 (root/'demo/index.js').write_text('original\n')
print(f'итог: {sum(ok for _,ok in rows)} из {len(rows)}')
raise SystemExit(0 if all(ok for _,ok in rows) else 1)
