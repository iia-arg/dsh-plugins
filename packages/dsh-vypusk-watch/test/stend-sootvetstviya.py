# RU: стенд СООТВЕТСТВИЙ сторожа выпуска (с 0.1.0-alpha.4, 26.09) — пакет, чей бой живёт вне корней по имени (шлюз в /opt/<gateway-home>).
# EN: CORRESPONDENCE test bench for the release watcher (since 0.1.0-alpha.4, 26.09) — a package whose installed copy lives outside the by-name roots (a gateway in /opt/<gateway-home>).
# RU: Подставная раскладка: дерево с меткой, «бой» — каталог с мусором дома учётки вне состава. Сторож — копия src/ этого пакета
#     (после монтажа она же /usr/local/sbin: тождество пары держит probe.py). Бой, дерево, канал — не трогаются.
# EN: Fake layout: a tree with a tag, the "installed copy" is a directory with account-home clutter outside the package contents. The watcher
#     is a copy of this package's src/ (after install it equals /usr/local/sbin: probe.py holds that identity). Live copy, tree, channel — untouched.
# RU: Подставы: временный git-репозиторий (пакет gw-pkg 1.0.0, метка gw-v1.0.0, "files" с элементом-каталогом и именем с точкой),
#     каталог «боя» с файлами состава и пятью файлами вне состава, подставной канал тревоги (дописывает в файл), пустой список
#     исключений, пустые корни; соответствие VYPUSK_SOOTVETSTVIYA=gw=<каталог боя>.
# EN: Fixtures: a temporary git repository (package gw-pkg 1.0.0, tag gw-v1.0.0, "files" with a directory entry and a dotted name),
#     an "installed" directory with the package files plus five files outside the contents, a fake alert channel (appends to a file),
#     an empty exception list, empty roots; correspondence VYPUSK_SOOTVETSTVIYA=gw=<installed dir>.
# RU: ⚠️ ЧЕГО НЕ ЛОВИТ: верность путей соответствия на живой машине (здесь пути подставные) · поведение под root.
#     Канал проверяется общим правилом: его зовут ровно в прогонах с кодом ≠ 0 (последняя проба); настройки VYPUSK_* вызывающего не наследуются.
# EN: ⚠️ WHAT IT DOES NOT CATCH: correctness of correspondence paths on the live machine (paths here are fake) · behaviour as root.
#     The channel is checked by a general rule: it fires exactly in runs with exit code ≠ 0 (the last probe); the caller's VYPUSK_* settings are not inherited.
from pathlib import Path
import tempfile, subprocess, os, shutil, hashlib, json

src = Path(os.environ.get('VYPUSK_TEST_WATCH', Path(__file__).resolve().parent.parent / 'src/vypusk-okno-watch.sh')).resolve()
itog = []
# RU: Записывает исход одной пробы и печатает строку ok/FAIL; итог стенда — по всем записанным исходам.
# EN: Records one probe's outcome and prints an ok/FAIL line; the bench result is computed over all recorded outcomes.
def proba(imya, ok, podrobno=''):
    itog.append(ok); print(('ok   ' if ok else 'FAIL ') + imya + (' · ' + podrobno if podrobno else ''))

with tempfile.TemporaryDirectory() as tmp:
    r = Path(tmp); watch = r / 'watch.sh'; shutil.copyfile(src, watch)
    print('сторож:', src, 'sha256', hashlib.sha256(watch.read_bytes()).hexdigest()[:16])
    repo = r / 'repo'; pk = repo / 'packages/gw'; (pk / 'systemd').mkdir(parents=True)
    (pk / 'package.json').write_text(json.dumps({'name': 'gw-pkg', 'version': '1.0.0',
        'files': ['gateway.mjs', 'systemd', 'CHANGELOG.md', '.env.example']}))
    # RU: LOW 2: имя с точкой в files — обязано быть в составе.
    # EN: LOW 2: a dotted name in files must be part of the contents.
    (pk / '.env.example').write_text('KEY=\n')
    (pk / 'CHANGELOG.md').write_text('## 1.0.0\n\nПервый выпуск.\n')
    (pk / 'gateway.mjs').write_text('original\n'); (pk / 'systemd/gw.service').write_text('[Unit]\n')
    # RU: вне состава: .npmignore в бою нет; package-lock.json в бою иной (LOW 1).
    # EN: outside the contents: .npmignore is absent from the installed copy; package-lock.json differs there (LOW 1).
    (pk / '.npmignore').write_text('x\n'); (pk / 'package-lock.json').write_text('{}\n')
    def git(*a): subprocess.run(['git', '-C', str(repo), *a], check=True, capture_output=True)
    git('init'); git('add', '.'); git('-c', 'user.name=probe', '-c', 'user.email=probe@localhost', 'commit', '-m', 'fixture'); git('tag', 'gw-v1.0.0')
    # RU: «Бой»: точные копии пяти файлов состава.
    # EN: "Installed copy": exact copies of the five package-content files.
    boj = r / 'boj'; boj.mkdir()
    for f in ['package.json', 'CHANGELOG.md', 'gateway.mjs', 'systemd/gw.service', '.env.example']:
        (boj / f).parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(pk / f, boj / f)
    # RU: Мусор дома учётки — пять файлов вне состава. LOW 1: вне состава, в метке '{}' — суммы разные.
    # EN: Account-home clutter — five files outside the contents. LOW 1: outside the contents, '{}' in the tag — checksums differ.
    for f, t in [('.npm/_cacache/x', 'кэш\n'), ('.claude.json', '{}\n'), ('gateway.mjs.resume', 'старое\n'), ('sdk-runtime/package.json', '{}\n'), ('package-lock.json', '{"lockfileVersion": 3}\n')]:
        (boj / f).parent.mkdir(parents=True, exist_ok=True); (boj / f).write_text(t)
    alert = r / 'alert'; alert.write_text('#!/bin/sh\nprintf "%s\\n" "$1" >> "$PROBE_CHANNEL"\n'); alert.chmod(0o755)
    (r / 'exc').write_text(''); (r / 'empty').mkdir()
    # RU: Окружение: корни по имени — пустой каталог, корни агентов и зона сведений пусты, ссылки монтажа отключены;
    #     единственный путь к «бою» — соответствие gw=<boj>.
    # EN: Environment: by-name roots — an empty directory, agent roots and informational zone empty, install links disabled;
    #     the only route to the "installed copy" is the correspondence gw=<boj>.
    env = {**{k: v for k, v in os.environ.items() if not k.startswith('VYPUSK_')}, 'VYPUSK_TIHO': '0', 'VYPUSK_REPO': str(repo), 'VYPUSK_KORNI': str(r / 'empty'), 'VYPUSK_AGENT_KORNI': '', 'VYPUSK_INFO_KORNI': '',
           'VYPUSK_ISKLYUCHENIYA': str(r / 'exc'), 'VYPUSK_ALERT': str(alert), 'PROBE_CHANNEL': str(r / 'channel'),
           'VYPUSK_SOSTOYANIE': str(r / 'state'), 'VYPUSK_SSYLKI': '', 'VYPUSK_RASKLADKA': '', 'VYPUSK_REESTR': '', 'VYPUSK_SOOTVETSTVIYA': f'gw={boj}'}
    # RU: Один прогон сторожа со сброшенными состоянием и каналом; over — переопределение переменных окружения.
    # EN: One watcher run with state and channel reset; over — environment variable overrides.
    narusheniya = []
    def run(**over):
        (r / 'state').unlink(missing_ok=True); (r / 'channel').write_text('')
        p = subprocess.run(['bash', str(watch)], env={**env, **over}, capture_output=True, text=True)
        # RU: Канал обязан звучать ровно при коде ≠ 0 (состояние чистое — подавления повтора нет); нарушение копится и краснит итоговую пробу.
        # EN: The channel must fire exactly when the exit code is ≠ 0 (clean state — no repeat suppression); a violation is collected and fails the final probe.
        zvali = (r / 'channel').read_text() != ''
        if zvali != (p.returncode != 0): narusheniya.append(f'rc {p.returncode}, канал {"звали" if zvali else "молчал"}')
        return p.returncode, p.stdout
    # RU: Порча с доказательством внесения: печатает sha256 до → после и падает, если суммы равны (порча не легла).
    # EN: Corruption with proof of application: prints sha256 before → after and fails if they are equal (nothing changed).
    def porcha(path, text):
        do = hashlib.sha256(path.read_bytes()).hexdigest()[:16]; path.write_text(text)
        posle = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
        print(f'  порча {path.relative_to(r)}: sha256 {do} → {posle}'); assert do != posle, 'порча не внесена'

    # RU: Без соответствия пакет вне области: код 0, «копий с боем 0», «вне области: gw-pkg». Контроль: без пары сторож бой не видит.
    # EN: Without the correspondence the package is out of scope: exit 0, zero installed copies, listed as out of scope. Control: no pair, no view.
    rc, out = run(VYPUSK_SOOTVETSTVIYA='')
    proba('без соответствия: пакет вне области, копий с боем 0', rc == 0 and 'копий пакетов с боем 0' in out and 'вне области: gw-pkg' in out, f'rc {rc}')
    # RU: Исправное: сошлось по составу, пять файлов вне состава названы «не считается». Ловит красное от мусора дома учётки.
    # EN: Healthy: matches by contents, the five files outside are reported as not counted. Catches red raised by account-home clutter.
    rc, out = run()
    proba('исправное: сошлось по составу, мусор дома вне состава не считается, копий с боем 1',
          rc == 0 and 'копий пакетов с боем 1 · сошлось 1' in out and 'сошлось: gw-pkg' in out and 'не считается 5 файлов' in out, f'rc {rc}')
    # RU: Тот же прогон: package-lock.json вне состава с разными суммами в метке и бою не упоминается и не краснит.
    # EN: Same run: package-lock.json outside the contents, with different checksums in tag and installed copy, is not mentioned and not red.
    proba('LOW 1: package-lock.json вне состава, в метке и в бою суммы разные → не считается',
          rc == 0 and 'package-lock' not in out and 'сошлось 1' in out, f'rc {rc}')
    # RU: Порча .env.example (элемент files с точкой) → код 1 с именем файла; затем возврат. Ловит выпадение имён с точкой из состава.
    # EN: Corrupt .env.example (a dotted files entry) → exit 1 naming the file; then restore. Catches dotted names dropped from the contents.
    e = boj / '.env.example'; porcha(e, 'KEY=porcha\n'); rc, out = run()
    proba('LOW 2: .env.example из files изменён в бою → разошлось (элемент files с точкой в составе)', rc == 1 and 'иные суммы: ./.env.example' in out, f'rc {rc}')
    e.write_text('KEY=\n')
    # RU: Порча gateway.mjs → код 1, «разошлось 1», имя файла в строке «иные суммы».
    # EN: Corrupt gateway.mjs → exit 1, "разошлось 1", file name in the "иные суммы" line.
    g = boj / 'gateway.mjs'; porcha(g, 'originaX\n'); rc, out = run()
    proba('порча gateway.mjs в бою → разошлось, названо имя файла', rc == 1 and 'разошлось 1' in out and 'иные суммы: ./gateway.mjs' in out, f'rc {rc}')
    # RU: Возврат → снова сошлось (код 0): красное гаснет после снятия порчи.
    # EN: Restore → matches again (exit 0): red clears once the corruption is removed.
    g.write_text('original\n'); rc, out = run()
    proba('возврат → сошлось', rc == 0 and 'сошлось 1' in out, f'rc {rc}')
    # RU: Удалён файл из каталога-элемента files (systemd/) → код 1, «только в метке». Ловит пропуск отсутствующих файлов состава.
    # EN: A file under a directory files entry (systemd/) removed → exit 1, "только в метке". Catches missing content files going unnoticed.
    s = boj / 'systemd/gw.service'; s.unlink(); print('  порча: удалён systemd/gw.service в бою'); rc, out = run()
    proba('файл состава отсутствует в бою → разошлось, «только в метке»', rc == 1 and 'только в метке: ./systemd/gw.service' in out, f'rc {rc}')
    shutil.copyfile(pk / 'systemd/gw.service', s)
    # RU: Граница: правка файла вне состава (gateway.mjs.resume) → код 0. Ловит расширение сверки на весь каталог дома.
    # EN: Boundary: editing a file outside the contents (gateway.mjs.resume) → exit 0. Catches the comparison spreading to the whole home dir.
    porcha(boj / 'gateway.mjs.resume', 'другое старое\n'); rc, out = run()
    proba('правка файла ВНЕ состава в бою → не считается (граница)', rc == 0 and 'сошлось 1' in out, f'rc {rc}')
    # RU: Бой впереди метки: версия 1.1.0 и новый код без метки 1.1.0 → код 1, «бой=1.1.0», «своей метки нет».
    #     Ловит монтаж в обход выпуска. Состояние «боя» после этой пробы не возвращается — она предпоследняя.
    # EN: Installed copy ahead of the tag: version 1.1.0 and new code without a 1.1.0 tag → exit 1, "бой=1.1.0", "своей метки нет".
    #     Catches installs that bypass a release. The "installed" state is not restored after this probe — it is the second to last.
    (boj / 'package.json').write_text(json.dumps({'name': 'gw-pkg', 'version': '1.1.0', 'files': ['gateway.mjs', 'systemd', 'CHANGELOG.md', '.env.example']}))
    porcha(g, 'new code\n'); rc, out = run()
    proba('бой впереди метки (правка + 1.1.0 без метки) → разошлось', rc == 1 and 'бой=1.1.0' in out and 'своей метки нет' in out, f'rc {rc}')
    # RU: Соответствие на несуществующий каталог → код 2 (слепота) со строкой «соответствие названо». Ловит молчаливое «вне области».
    # EN: Correspondence pointing at a nonexistent directory → exit 2 (blindness) with "соответствие названо". Catches a silent "out of scope".
    rc, out = run(VYPUSK_SOOTVETSTVIYA=f'gw={r / "net-takogo"}')
    proba('соответствие на несуществующий каталог → СЛЕПОТА с именем', rc == 2 and 'соответствие названо' in out, f'rc {rc}')
    proba('канал тревоги звали ровно в прогонах с кодом ≠ 0 (во всех прогонах стенда)', not narusheniya, '; '.join(narusheniya))

n = len(itog); z = sum(itog)
print(f'итог: {z} из {n}')
raise SystemExit(0 if z == n else 1)
