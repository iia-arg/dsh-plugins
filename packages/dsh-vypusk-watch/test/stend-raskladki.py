#!/usr/bin/env python3
"""Стенд сверки по раскладке (VYPUSK_RASKLADKA) — пакеты без package.json: файл пакета bin|sbin|libexec|lib/… стоит в
/usr/local/…, systemd/… — в /etc/systemd/system/…; сверка с новейшей меткой <каталог>-vX.Y.Z.
Предмет — VYPUSK_TEST_WATCH (по умолчанию ../src/vypusk-okno-watch.sh). Всё во временном каталоге: подставное дерево с
метками и подставной «диск» через VYPUSK_RASKLADKA_PRISTAVKA. Боевой диск, боевое дерево и канал тревог не трогаются:
канал — подставной сценарий, считающий вызовы.
Пробы: исправное молчит (код 0, канал 0) · порча одного файла — КРАСНОЕ с пакетом и путём · возврат — снова 0 ·
бой целиком = старой метке — 0 и INFO «не смонтирован» · удалённый файл — КРАСНОЕ «нет на диске» · иной верх в метке,
имя без каталога, пакет с package.json — СЛЕПОТА (2) · охват распределён без «ОХВАТ НЕ СОШЁЛСЯ» во всех прогонах.
ЧЕГО НЕ ПРОВЕРЯЕТ: боевые пути без приставки (их даёт только живой прогон после монтажа) · права и владельца.
Код: 0 — все пробы, 1 — есть красная проба, 2 — стенд слеп.
"""
import hashlib, os, shutil, subprocess, sys, tempfile
from pathlib import Path

watch = Path(os.environ.get('VYPUSK_TEST_WATCH', Path(__file__).resolve().parent.parent / 'src/vypusk-okno-watch.sh')).resolve()
if not watch.is_file(): print('СЛЕПОТА: предмета нет:', watch); sys.exit(2)
r = Path(tempfile.mkdtemp(prefix='stend-raskladki-'))
proshlo = vsego = 0
def proba(imya, uslovie, p=None):
    global proshlo, vsego
    vsego += 1
    if uslovie: proshlo += 1; print('  ✅', imya)
    else: print('  ❌', imya, '— код', p.returncode if p else '?', '| вывод:', (p.stdout + p.stderr)[-600:].replace('\n', ' ⏎ ') if p else '')
def sh(*a, **k): return subprocess.run(a, check=True, capture_output=True, text=True, **k)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()[:16]
try:
    repo = r / 'repo'; pa = repo / 'packages/pk-a'
    for d in ('bin', 'sbin', 'systemd/u.service.d'): (pa / d).mkdir(parents=True)
    (pa / 'bin/x').write_text('x-1.0.0\n'); (pa / 'sbin/y').write_text('y\n')
    (pa / 'systemd/u.service').write_text('[Service]\nExecStart=/usr/local/sbin/y\n'); (pa / 'systemd/u.service.d/a.conf').write_text('[Service]\nNice=5\n')
    (pa / 'README.md').write_text('readme\n'); (pa / 'CHANGELOG.md').write_text('## 1.0.0 — первый\n')
    pc = repo / 'packages/pk-c'; (pc / 'share').mkdir(parents=True); (pc / 'share/z').write_text('z\n'); (pc / 'CHANGELOG.md').write_text('## 1.0.0 — c\n')
    pm = repo / 'packages/pk-m'; pm.mkdir(); (pm / 'package.json').write_text('{"name":"pk-m","version":"1.0.0"}\n')
    g = ['git', '-C', str(repo), '-c', 'user.name=stend', '-c', 'user.email=stend@local']
    sh('git', 'init', '-q', str(repo)); sh(*g, 'add', '-A'); sh(*g, 'commit', '-qm', 'v1.0.0')
    sh(*g, 'tag', 'pk-a-v1.0.0'); sh(*g, 'tag', 'pk-c-v1.0.0')
    (pa / 'bin/x').write_text('x-1.0.1\n'); (pa / 'systemd/new.timer').write_text('[Timer]\nOnCalendar=daily\n')
    (pa / 'CHANGELOG.md').write_text('## 1.0.1 — второй\n\n## 1.0.0 — первый\n')
    sh(*g, 'add', '-A'); sh(*g, 'commit', '-qm', 'v1.0.1'); sh(*g, 'tag', 'pk-a-v1.0.1')
    pre = r / 'disk'
    def postavit(ref):
        if pre.exists(): shutil.rmtree(pre)
        tmp = r / 'arh'; shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir()
        sh('bash', '-c', f'git -C "{repo}" archive {ref} packages/pk-a | tar x -C "{tmp}"')
        for f in (tmp / 'packages/pk-a').rglob('*'):
            if not f.is_file(): continue
            rel = f.relative_to(tmp / 'packages/pk-a'); top = rel.parts[0]
            if top in ('README.md', 'CHANGELOG.md'): continue
            base = {'bin': 'usr/local/bin', 'sbin': 'usr/local/sbin', 'systemd': 'etc/systemd/system'}[top]
            dst = pre / base / Path(*rel.parts[1:]); dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(f, dst)
    (r / 'empty').mkdir(); (r / 'iskl').write_text(''); calls = r / 'calls'
    alert = r / 'alert'; alert.write_text(f'#!/bin/bash\necho CALL >> "{calls}"\n'); alert.chmod(0o755)  # одна строка на вызов: текст тревоги многострочный
    def zapusk(raskladka, **dop):
        env = {k: v for k, v in os.environ.items() if not k.startswith('VYPUSK_')}
        env.update(VYPUSK_REPO=str(repo), VYPUSK_KORNI=str(r / 'empty'), VYPUSK_AGENT_KORNI='', VYPUSK_INFO_KORNI='',
                   VYPUSK_SOOTVETSTVIYA='', VYPUSK_SSYLKI='', VYPUSK_RASKLADKA=raskladka, VYPUSK_REESTR='', VYPUSK_RASKLADKA_PRISTAVKA=str(pre),
                   VYPUSK_TIHO='0', VYPUSK_ALERT=str(alert), VYPUSK_SOSTOYANIE=str(r / 'state'), VYPUSK_ISKLYUCHENIYA=str(r / 'iskl'), **dop)
        for f in (r / 'state', r / 'state.slepota'):
            if f.exists(): f.unlink()
        if calls.exists(): calls.unlink()
        p = subprocess.run(['bash', str(watch)], env=env, capture_output=True, text=True, timeout=120)
        p.kanal = len(calls.read_text().splitlines()) if calls.exists() else 0
        p.ohvat_ok = 'ОХВАТ НЕ СОШЁЛСЯ' not in p.stdout and 'не распределены' not in p.stdout and 'распределены дважды' not in p.stdout
        return p
    print('предмет:', watch, 'sha256', sha(watch))
    postavit('pk-a-v1.0.1')
    p = zapusk('pk-a')
    proba('исправное: бой = новейшей метке → код 0, «пакетов 1 · сошлось 1 · разошлось 0», канал 0',
          p.returncode == 0 and 'пакетов 1 · сошлось 1 · разошлось 0 · слепота 0' in p.stdout and p.kanal == 0 and p.ohvat_ok, p)
    x = pre / 'usr/local/bin/x'; do = sha(x); x.write_text('x-ПОРЧА\n'); posle = sha(x)
    print(f'  порча внесена: {x} сумма {do} → {posle}')
    p = zapusk('pk-a')
    proba('порча одного файла → код 1, КРАСНОЕ с пакетом pk-a и путём файла, канал 1',
          do != posle and p.returncode == 1 and '🔴 pk-a [раскладка' in p.stdout and str(x) in p.stdout and p.kanal == 1 and p.ohvat_ok, p)
    postavit('pk-a-v1.0.1'); print('  возврат: сумма', sha(x))
    p = zapusk('pk-a')
    proba('возврат → снова код 0, сошлось 1, канал 0', p.returncode == 0 and 'сошлось 1 · разошлось 0' in p.stdout and p.kanal == 0, p)
    postavit('pk-a-v1.0.0')
    p = zapusk('pk-a')
    proba('бой целиком = старой метке 1.0.0 → код 0 и INFO «выпуск pk-a-v1.0.1 новее боя … не смонтирован»',
          p.returncode == 0 and 'INFO: pk-a [раскладка]: выпуск pk-a-v1.0.1 новее боя (бой = pk-a-v1.0.0)' in p.stdout and p.kanal == 0, p)
    postavit('pk-a-v1.0.1'); u = pre / 'etc/systemd/system/u.service'; u.unlink(); print('  порча: удалён', u)
    p = zapusk('pk-a')
    proba('удалён юнит пакета → код 1, «нет на диске» с путём', p.returncode == 1 and 'нет на диске:' in p.stdout and str(u) in p.stdout, p)
    postavit('pk-a-v1.0.1')
    p = zapusk('pk-a:pk-c')
    proba('иной верх в метке (share/) → СЛЕПОТА, код 2, «куда ставится, не знаю»', p.returncode == 2 and 'куда ставится, не знаю' in p.stdout + p.stderr and p.ohvat_ok, p)
    p = zapusk('pk-a:pk-net')
    proba('имя в VYPUSK_RASKLADKA без каталога → СЛЕПОТА, код 2, с именем', p.returncode == 2 and 'pk-net: назван в VYPUSK_RASKLADKA, каталога' in p.stdout + p.stderr and p.ohvat_ok, p)
    p = zapusk('pk-a:pk-m')
    proba('назван пакет с package.json → СЛЕПОТА, код 2', p.returncode == 2 and 'pk-m: назван в VYPUSK_RASKLADKA, но у него есть package.json' in p.stdout + p.stderr, p)
    p = zapusk('pk-a:a b')
    proba('негодное имя в VYPUSK_RASKLADKA → СЛЕПОТА, код 2', p.returncode == 2 and 'негодное имя' in p.stdout + p.stderr, p)
    p = zapusk('')
    proba('VYPUSK_RASKLADKA пусто → сверка выключена: pk-a «без манифеста», как прежде, код 0',
          p.returncode == 0 and 'без манифеста: pk-a' in p.stdout and 'пакетов 0 · сошлось 0' in p.stdout, p)
except subprocess.CalledProcessError as e:
    print('СЛЕПОТА стенда:', e, e.stderr); shutil.rmtree(r, ignore_errors=True); sys.exit(2)
shutil.rmtree(r, ignore_errors=True)
print(f'итог: {proshlo} из {vsego}')
sys.exit(0 if proshlo == vsego else 1)
