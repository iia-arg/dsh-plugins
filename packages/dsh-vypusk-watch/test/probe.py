# RU: Стенд копий выпуска сторожа окна выпуска. Две части.
# EN: Release-copies test bench for the release-window watcher. Two parts.
# RU: (1) Тождество: снимок src/vypusk-okno-watch.sh побайтно (SHA-256) равен эталону — по умолчанию установленному
#     /usr/local/sbin/vypusk-okno-watch.sh, либо файлу из VYPUSK_TEST_REFERENCE. Неравенство → код 1, нечитаемая пара → код 2.
# EN: (1) Identity: the snapshot src/vypusk-okno-watch.sh is byte-equal (SHA-256) to the reference — by default the installed
#     /usr/local/sbin/vypusk-okno-watch.sh, or the file named by VYPUSK_TEST_REFERENCE. Mismatch → exit 1, unreadable pair → exit 2.
# RU: (2) Сценарии на КОПИИ сторожа (VYPUSK_TEST_WATCH, по умолчанию установленный файл) во временном каталоге.
#     Подставы: временный git-репозиторий с пакетом demo и меткой demo-v1.0.0; три подставных корня плагинов агентов
#     с копией пакета, третий из них объявлен областью сведений (VYPUSK_INFO_KORNI — чужая зона ответственности);
#     подставной канал тревоги — скрипт, дописывающий текст тревоги в файл; пустой список исключений; файл состояния
#     во временном каталоге; ссылки монтажа отключены.
# EN: (2) Scenarios run on a COPY of the watcher (VYPUSK_TEST_WATCH, the installed file by default) in a temp directory.
#     Fixtures: a temporary git repository with package demo and tag demo-v1.0.0; three fake agent plugin roots holding
#     a copy of the package, the third one declared an informational area (VYPUSK_INFO_KORNI — someone else's zone);
#     a fake alert channel — a script that appends the alert text to a file; an empty exception list; a state file
#     in the temp directory; install links disabled.
# RU: ЧЕГО НЕ ПРОВЕРЯЕТ: поиск корней агентов по живой машине (корни заданы явно), запуск под root, соответствия
#     (VYPUSK_SOOTVETSTVIYA не задан и берётся из окружения вызывающего), напоминание по VYPUSK_NAPOMINAT, доставку
#     тревоги человеку — только факт вызова канала.
# EN: WHAT IT DOES NOT CHECK: discovery of agent roots on the live machine (roots are given explicitly), running as root,
#     correspondences (VYPUSK_SOOTVETSTVIYA is not set and is inherited from the caller), the VYPUSK_NAPOMINAT reminder,
#     delivery of the alert to a human — only that the channel was called.
from pathlib import Path
import tempfile,subprocess,os,json,shutil,hashlib
watch=Path(os.environ.get('VYPUSK_TEST_WATCH', '/usr/local/sbin/vypusk-okno-watch.sh')).resolve()
# RU: снимок выпуска обязан совпадать с действующим сторожем.
# EN: the release snapshot must match the watcher in service.
snapshot=Path(__file__).resolve().parent.parent/'src/vypusk-okno-watch.sh'
live=Path(os.environ.get('VYPUSK_TEST_REFERENCE', '/usr/local/sbin/vypusk-okno-watch.sh')).resolve()
# RU: Подмена эталона объявляется вслух: это приёмка кандидата, а не доказательство равенства установленному файлу.
# EN: A substituted reference is announced: this is candidate acceptance, not proof of equality to the installed file.
if 'VYPUSK_TEST_REFERENCE' in os.environ: print('ПОДМЕНА эталона: проверка кандидата, НЕ равенство бою:', live)
# RU: Нечитаемая пара — слепота (код 2), а не расхождение: отказ чтения не выдаётся за ответ о содержимом.
# EN: An unreadable pair is blindness (exit 2), not a mismatch: a read failure is not reported as an answer about content.
try:
 source_hash=hashlib.sha256(snapshot.read_bytes()).hexdigest()
 live_hash=hashlib.sha256(live.read_bytes()).hexdigest()
except OSError as error:
 print(f'СЛЕПОТА: не прочитана пара {snapshot} / {live}: {error}')
 raise SystemExit(2)
# RU: Ловит снимок в пакете, разошедшийся с установленным сторожем (выпуск описывает не тот код, что работает).
# EN: Catches a package snapshot that drifted from the installed watcher (the release describes code that is not running).
if source_hash != live_hash:
 print(f'РАСХОЖДЕНИЕ: {snapshot} sha256={source_hash} != {live} sha256={live_hash}')
 raise SystemExit(1)
print('тождество src/эталон OK', str(live), source_hash)
with tempfile.TemporaryDirectory() as tmp:
 r=Path(tmp)
 # RU: Бой только читаем: сценарии исполняют отдельную копию, не ExecStart-файл.
 # EN: The installed file is read-only here: scenarios run a separate copy, not the ExecStart file.
 source=watch;watch=r/'watch.sh';shutil.copyfile(source,watch)
 checker=source.parent/'copy-compare.sh'
 if checker.is_file(): shutil.copyfile(checker,r/'copy-compare.sh');(r/'copy-compare.sh').chmod(0o755)
 assert watch.read_bytes()==source.read_bytes()
 print('проверяем копию:',source,'sha256',hashlib.sha256(watch.read_bytes()).hexdigest())
 # RU: Подставное дерево: пакет demo 1.0.0 (package.json, CHANGELOG, index.js), один коммит и метка demo-v1.0.0.
 # EN: Fake tree: package demo 1.0.0 (package.json, CHANGELOG, index.js), one commit and tag demo-v1.0.0.
 repo=r/'repo';pk=repo/'packages/demo';pk.mkdir(parents=True)
 (pk/'package.json').write_text('{"name":"demo","version":"1.0.0"}')
 (pk/'CHANGELOG.md').write_text('## 1.0.0\n\nFirst release.\n');(pk/'index.js').write_text('original\n')
 def git(*args):subprocess.run(['git','-C',str(repo),*args],check=True,capture_output=True)
 git('init');git('add','.');git('-c','user.name=probe','-c','user.email=probe@localhost','commit','-m','fixture');git('tag','demo-v1.0.0')
 # RU: Три подставных корня агентов <root>/<agent>/plugins, в каждом копия пакета demo.
 # EN: Three fake agent roots <root>/<agent>/plugins, each holding a copy of package demo.
 roots=[]
 for name in ['agent-a','agent-b','agent-c']:
  root=r/name/'plugins';root.mkdir(parents=True);shutil.copytree(pk,root/'demo');roots.append(root)
 # RU: Подставной канал тревоги: каждый вызов дописывает первый довод в файл PROBE_CHANNEL; непустой файл = канал звали.
 # EN: Fake alert channel: each call appends its first argument to PROBE_CHANNEL; a non-empty file = the channel was called.
 alert=r/'alert';alert.write_text('#!/bin/sh\nprintf "%s\\n" "$1" >> "$PROBE_CHANNEL"\n');alert.chmod(0o755)
 exceptions=r/'exceptions';exceptions.write_text('')
 # RU: Окружение сторожа: корни по имени — несуществующий путь (пусто), корни агентов — три подставных, третий —
 #     область сведений; ссылки монтажа и соответствия отключены явно пустыми значениями; канал включён (VYPUSK_TIHO=0), чтобы вызов был виден.
 # EN: Watcher environment: by-name roots — a nonexistent path (empty), agent roots — the three fakes, the third being
 #     the informational area; install links and correspondences disabled by explicit empty values; channel enabled (VYPUSK_TIHO=0) so that a call is observable.
 env={**{k:v for k,v in os.environ.items() if not k.startswith('VYPUSK_')},'VYPUSK_REPO':str(repo),'VYPUSK_KORNI':str(r/'empty'),'VYPUSK_AGENT_KORNI':':'.join(map(str,roots)),'VYPUSK_INFO_KORNI':str(roots[2]),'VYPUSK_ISKLYUCHENIYA':str(exceptions),'VYPUSK_SSYLKI':'','VYPUSK_RASKLADKA':'','VYPUSK_REESTR':'','VYPUSK_SOOTVETSTVIYA':'','VYPUSK_ALERT':str(alert),'VYPUSK_TIHO':'0','VYPUSK_SOSTOYANIE':str(r/'state'),'PROBE_CHANNEL':str(r/'channel')}
 # RU: Один прогон сторожа с чистыми каналом и состоянием. Проверяет код выхода, подстроку вывода, был ли вызван канал,
 #     отсутствие ошибок учёта охвата; для двух сценариев порчи — строку «копии разошлись:», для зоны сведений — без 🔴.
 # EN: One watcher run with a clean channel and state. Checks the exit code, an output substring, whether the channel
 #     was called, no coverage-accounting errors; for both corruption scenarios — the "копии разошлись:" line, for the
 #     informational zone — no 🔴.
 def run(label,rc,text='',channel=False):
  (r/'channel').write_text('');(r/'state').unlink(missing_ok=True)
  p=subprocess.run(['bash',str(watch)],env=env,capture_output=True,text=True)
  assert p.returncode==rc and text in p.stdout,(label,p.returncode,p.stdout,p.stderr)
  assert bool((r/'channel').read_text())==channel,(label,'channel')
  assert 'распределены дважды' not in p.stdout and 'ОХВАТ НЕ СОШЁЛСЯ' not in p.stdout,p.stdout
  if label in ['own differs','foreign informational']: assert 'копии разошлись:' in p.stdout,p.stdout
  if label=='foreign informational': assert '🔴' not in p.stdout,p.stdout
  print(label,'OK',rc)
 # RU: Исправное: три копии равны метке → код 0, «копий пакетов с боем 3», канал молчит.
 # EN: Healthy: three copies equal the tag → exit 0, "копий пакетов с боем 3", channel silent.
 run('healthy',0,'копий пакетов с боем 3')
 # RU: Порча копии во втором корне (своя зона): печатает факт внесения (sha256 до → после), ожидает код 1, имя корня
 #     в выводе и вызов канала; возврат → снова код 0. Ловит сторожа, не замечающего расхождение одной копии из трёх.
 # EN: Corrupt the copy in the second root (own zone): prints proof of the change (sha256 before → after), expects exit 1,
 #     the root name in output and a channel call; restore → exit 0 again. Catches a watcher blind to one copy out of three.
 f=roots[1]/'demo/index.js';f.write_text('changed\n');print('порча agent-b: 1 строка, sha256',hashlib.sha256(b'original\n').hexdigest(), '→',hashlib.sha256(f.read_bytes()).hexdigest());assert f.read_text().splitlines()==['changed'];run('own differs',1,'agent-b',True);f.write_text('original\n');run('restored',0)
 # RU: Порча копии в третьем корне (зона сведений): ожидает код 0, строку «вне зоны, расхождение — сведение владельцу»,
 #     канал молчит, 🔴 нет; возврат → код 0. Ловит тревогу по чужой зоне и, наоборот, молчаливый пропуск её расхождения.
 # EN: Corrupt the copy in the third root (informational zone): expects exit 0, the "out of zone, mismatch — notice to owner"
 #     line, channel silent, no 🔴; restore → exit 0. Catches alerting on someone else's zone and, conversely, silently
 #     dropping its mismatch.
 f=roots[2]/'demo/index.js';f.write_text('foreign\n');print('порча agent-c: 1 строка, sha256',hashlib.sha256(b'original\n').hexdigest(), '→',hashlib.sha256(f.read_bytes()).hexdigest());assert f.read_text().splitlines()==['foreign'];run('foreign informational',0,'agent-c: вне зоны, расхождение — сведение владельцу');f.write_text('original\n');run('foreign restored',0)
