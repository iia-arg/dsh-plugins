# RU: стенд B-N-1738 (Искра, 07.10.2026): у пакета по соответствию несколько копий («путь:путь», шлюз — /opt/claude-oauth и
#     гостевая копия); каждая копия — своя единица и своя строка исхода; отпечаток «невыпущенного» несёт сумму состава копии,
#     и новая правка той же рабочей версии не глушится как повтор. Подставы как в stend-sootvetstviya.py: временное дерево с
#     меткой gw-v1.0.0, каталоги «боя», канал-файл. Бой, дерево, канал машины — не трогаются.
#     Коды: 0 — все пробы; 1 — есть красная. ЧЕГО НЕ ЛОВИТ: верность путей на живой машине; поведение под root; копии, не
#     названные ни соответствием, ни корнями (их сторож не видит по построению).
# EN: B-N-1738 bench: several mapped copies per package, a per-copy outcome line, and an unreleased fingerprint that includes the
#     copy's contents sum so that a new edit under the same working version is not suppressed as a repeat.
from pathlib import Path
import tempfile, subprocess, os, shutil, hashlib, json

import sys
if sys.argv[1:]: print('ОТКАЗ: доводов стенд не принимает (сторож — из VYPUSK_TEST_WATCH):', ' '.join(sys.argv[1:])); raise SystemExit(2)
src = Path(os.environ.get('VYPUSK_TEST_WATCH', Path(__file__).resolve().parent.parent / 'src/vypusk-okno-watch.sh')).resolve()
itog = []
def proba(imya, ok, podrobno=''):
    itog.append(ok); print(('ok   ' if ok else 'FAIL ') + imya + (' · ' + podrobno if podrobno else ''))

with tempfile.TemporaryDirectory() as tmp:
    r = Path(tmp); watch = r / 'watch.sh'; shutil.copyfile(src, watch)
    print('сторож:', src, 'sha256', hashlib.sha256(watch.read_bytes()).hexdigest()[:16])
    repo = r / 'repo'; pk = repo / 'packages/gw'; pk.mkdir(parents=True)
    (pk / 'package.json').write_text(json.dumps({'name': 'gw-pkg', 'version': '1.0.0', 'files': ['gateway.mjs', 'CHANGELOG.md']}))
    (pk / 'CHANGELOG.md').write_text('## 1.0.0\n\nПервый выпуск.\n'); (pk / 'gateway.mjs').write_text('original\n')
    def git(*a): subprocess.run(['git', '-C', str(repo), *a], check=True, capture_output=True)
    git('init'); git('add', '.'); git('-c', 'user.name=probe', '-c', 'user.email=probe@localhost', 'commit', '-m', 'fixture'); git('tag', 'gw-v1.0.0')
    boj = [r / 'boj-claude', r / 'boj-gost']
    for b in boj:
        b.mkdir()
        for f in ['package.json', 'CHANGELOG.md', 'gateway.mjs']: shutil.copyfile(pk / f, b / f)
        (b / 'sdk-runtime').mkdir(); (b / 'sdk-runtime/big.bin').write_text('вне состава\n')
    alert = r / 'alert'; alert.write_text('#!/bin/sh\nprintf "%s\\n" "$1" >> "$PROBE_CHANNEL"\n'); alert.chmod(0o755)
    (r / 'exc').write_text(''); (r / 'empty').mkdir()
    env = {**{k: v for k, v in os.environ.items() if not k.startswith('VYPUSK_')}, 'VYPUSK_TIHO': '0', 'VYPUSK_REPO': str(repo),
           'VYPUSK_KORNI': str(r / 'empty'), 'VYPUSK_AGENT_KORNI': '', 'VYPUSK_INFO_KORNI': '',
           'VYPUSK_ISKLYUCHENIYA': str(r / 'exc'), 'VYPUSK_ALERT': str(alert), 'PROBE_CHANNEL': str(r / 'channel'),
           'VYPUSK_SOSTOYANIE': str(r / 'state'), 'VYPUSK_SSYLKI': '', 'VYPUSK_RASKLADKA': '', 'VYPUSK_REESTR': '', 'VYPUSK_SOOTVETSTVIYA': f'gw={boj[0]}:{boj[1]}'}
    def run(keep=False, **over):
        if not keep: (r / 'state').unlink(missing_ok=True)
        (r / 'channel').write_text('')
        p = subprocess.run(['bash', str(watch)], env={**env, **over}, capture_output=True, text=True)
        return p.returncode, p.stdout, (r / 'channel').read_text() != ''
    def porcha(path, text):
        do = hashlib.sha256(path.read_bytes()).hexdigest()[:16]; path.write_text(text)
        posle = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
        print(f'  порча {path.relative_to(r)}: sha256 {do} → {posle}'); assert do != posle, 'порча не внесена'
    soshlos = lambda out, b: f'сошлось: gw-pkg [копия {b}]' in out

    # 1) обе копии исправны
    rc, out, ch = run()
    proba('две копии по соответствию «путь:путь» — обе сверены и сошлись, код 0', rc == 0 and soshlos(out, boj[0]) and soshlos(out, boj[1]) and 'копий пакетов с боем 2' in out,
          f'rc {rc}; ' + ' | '.join(l for l in out.splitlines() if 'gw-pkg' in l or 'копий' in l)[:400])
    # 2) порча файла во второй копии
    porcha(boj[1] / 'gateway.mjs', 'сдвинуто\n')
    rc, out, ch = run()
    krasn = [l for l in out.splitlines() if '🔴' in l and str(boj[1]) in l]
    proba('порча gateway.mjs во второй копии → красное с именем копии и файла, первая сошлась', rc != 0 and ch and any('gateway.mjs' in l for l in krasn + out.splitlines()) and bool(krasn) and soshlos(out, boj[0]) and not soshlos(out, boj[1]),
          f'rc {rc}; ' + ' | '.join(krasn)[:400])
    # 3) возврат
    shutil.copyfile(pk / 'gateway.mjs', boj[1] / 'gateway.mjs')
    rc, out, ch = run()
    proba('возврат → обе сошлись, код 0', rc == 0 and soshlos(out, boj[0]) and soshlos(out, boj[1]), f'rc {rc}')
    # 4) путь соответствия без каталога — слепота этой копии, прочие сверяются
    net = r / 'boj-net'
    rc, out, ch = run(VYPUSK_SOOTVETSTVIYA=f'gw={boj[0]}:{net}')
    proba('путь без каталога → слепота с этим путём; живая копия сверена', rc != 0 and f'соответствие названо ({net}), каталога нет' in out and soshlos(out, boj[0]), f'rc {rc}')
    # 5) невыпущенное: повтор глушится, НОВАЯ правка той же рабочей версии — новая картина
    pj = json.loads((boj[0] / 'package.json').read_text()); pj['version'] = '1.0.1-b1'; (boj[0] / 'package.json').write_text(json.dumps(pj))
    # одна копия в соответствии — проба различает отпечаток и на прежнем стороже (у него нет «путь:путь»)
    odna = {'VYPUSK_SOOTVETSTVIYA': f'gw={boj[0]}'}
    rc1, out1, ch1 = run(**odna)
    rc2, out2, ch2 = run(keep=True, **odna)
    porcha(boj[0] / 'gateway.mjs', 'рабочая правка без смены номера\n')
    rc3, out3, ch3 = run(keep=True, **odna)
    proba('невыпущенное: первая тревога звучит, строка несёт «состав <сумма>»', rc1 != 0 and ch1 and 'смонтировано невыпущенное' in out1 and '; состав ' in out1, f'rc {rc1}')
    proba('невыпущенное: та же картина — повтор глушится', rc2 != 0 and not ch2 and 'повтор глушится' in out2, f'rc {rc2}, канал {"звали" if ch2 else "молчал"}')
    proba('невыпущенное: правка той же рабочей версии — НОВАЯ картина, канал звучит', rc3 != 0 and ch3 and 'повтор глушится' not in out3,
          f'rc {rc3}, канал {"звали" if ch3 else "молчал"}')

print(f'итог: {sum(itog)} из {len(itog)}')
raise SystemExit(0 if all(itog) else 1)
