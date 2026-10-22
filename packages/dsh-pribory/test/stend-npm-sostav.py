#!/usr/bin/env python3
# СТЕНД npm-sostav — общий стенд правила разбора `npm pack --json` / `npm view --json` (B-N-2048, 14.10.2026).
# Один набор входов (test/fiks-npm-sostav/: формы npm 11 и 12, {"error":…}, два состава, нет files, пусто,
# два документа, не JSON, элемент files не объект или без path, filename не строка и с «../») гоняет и помощник bin/npm-sostav, и jq-строку из записи реестра.
#
# Режимы:
#   stend-npm-sostav.py                       — помощник против ожиданий, снятых ИНАЧЕ: разбор фикстуры
#                                               на Python (json), без jq. Каталог помощника — STEND_BIN.
#   stend-npm-sostav.py --reestr ФАЙЛ [ID…]   — jq-строка из записи реестра (поля installed_check,
#                                               fingerprint_check, latest_check с `npm pack`/`npm view` и jq)
#                                               на тех же фикстурах; исход обязан совпасть с помощником:
#                                               принято/отказано одинаково, при приёме — строки равны (pack)
#                                               или запись(фикстура) = запись(вывод помощника) (view).
#                                               Без ID — все такие записи файла.
# Проб 32 (14.10: +3 на тип и сырой путь filename; +2 ворот: элемент files без path, --help в stderr;
# +2 3.1.3: ошибка внутри массива view — строкой и null; +2: те же входы для pack --files). Коды: 0 — всё сошлось; 1 — расхождение; 2 — слепота (нет помощника/jq/yaml, запись не разобрана, проб меньше
# объявленных — КАНАРЕЙКА).
# Чего НЕ проверяет: вызов npm (флаги, каталог, sudo) — у вызывающего; хвост конвейера записи после jq (grep,
# sort, sha256sum) — сравнивается только сам jq; поведение живого npm — только записанные его формы
# (pack-v11/view-v11 сняты npm 11.17.0, pack-v12/view-v12 — npm 12.2.0, 14.10.2026).
# EN: npm-sostav STAND — the shared stand of the `npm pack --json` / `npm view --json` parsing rule. One input set
#     (test/fiks-npm-sostav/) drives both the bin/npm-sostav helper and the jq string taken from a registry entry.
#     Default mode: the helper against expectations derived DIFFERENTLY (Python json, no jq); helper directory —
#     STEND_BIN. --reestr FILE [ID…]: the jq string from each registry entry (installed_check, fingerprint_check,
#     latest_check that run `npm pack`/`npm view` and jq) on the same fixtures; the outcome must match the helper:
#     accepted/refused alike, on acceptance equal lines (pack) or entry(fixture) = entry(helper output) (view).
#     Codes: 0 — all matched; 1 — divergence; 2 — blindness (no helper/jq/yaml, entry not parsed, fewer probes
#     than declared — CANARY). Not checked: the npm call itself, the pipeline tail after jq, live npm behaviour.
import json, os, shlex, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIKS = Path(__file__).resolve().parent / 'fiks-npm-sostav'
HELPER = Path(os.environ.get('STEND_BIN', ROOT / 'bin')) / 'npm-sostav'

PACK_PRINYAT = ['pack-v11.json', 'pack-v12.json']
# Отказ и причина, которую он обязан назвать (что пришло: тип, длина, ключи). EN: refusal and the reason it must name.
PACK_OTKAZ = {'pack-oshibka.json': 'не дал один состав — пришло object с ключами error',
              'pack-dva-massiv.json': 'не дал один состав — пришло array длины 2',
              'pack-dva-obekt.json': 'не дал один состав — пришло object с ключами drugoj,fix-p',
              'pack-bez-files.json': 'не дал files — пришло object с ключами',
              'pusto.json': 'не один JSON-документ, а 0',
              'pack-dva-dokumenta.json': 'не один JSON-документ, а 2',
              'ne-json.txt': 'parse error',
              'pack-files-ne-obekt.json': 'Cannot index string',
              'pack-files-bez-path.json': 'элемент files без строкового path',
              # та же «ошибка внутри массива» для pack: после [0] обязателен массив files — у ошибки его нет (3.1.3)
              'view-error-v-massive.json': 'не дал files',
              'view-error-null-v-massive.json': 'не дал files'}
VIEW_PRINYAT = ['view-v11.json', 'view-v12.json']
VIEW_OTKAZ = {'view-oshibka.json': 'не дал один объект — пришло object с ключами error',
              'pusto.json': 'не один JSON-документ, а 0',
              'pack-dva-massiv.json': 'не дал один объект — пришло array длины 2',
              'pack-dva-dokumenta.json': 'не один JSON-документ, а 2',
              # ошибка внутри массива из одного (находка Беты 14.10): после [0] тоже без "error"
              'view-error-v-massive.json': 'не дал один объект — пришло object с ключами error',
              'view-error-null-v-massive.json': 'не дал один объект — пришло object с ключами error'}


def slepota(prichina):
    print(f'СЛЕПОТА: {prichina}')
    sys.exit(2)


def pomoshchnik(rezhim, fajl):
    with open(FIKS / fajl, 'rb') as vhod:
        p = subprocess.run([str(HELPER), rezhim], stdin=vhod, capture_output=True, timeout=30)
    return p.returncode, p.stdout.decode(), p.stderr.decode()


def zhdu_pack(fajl):
    """Ожидание, снятое ИНАЧЕ: Python json, без jq. EN: expectation derived without jq."""
    d = json.loads((FIKS / fajl).read_text())
    sostav = d[0] if isinstance(d, list) else next(iter(d.values()))
    return [f['path'] for f in sostav['files']], sostav['filename']


def zhdu_view(fajl):
    d = json.loads((FIKS / fajl).read_text())
    return d[0] if isinstance(d, list) else d


def probnyj_nabor():
    if not HELPER.is_file() or not os.access(HELPER, os.X_OK):
        slepota(f'помощника нет или он не исполняемый: {HELPER}')
    if not shutil.which('jq'):
        slepota('нет jq в PATH — помощнику разбирать нечем')
    ZHDYOM = 34
    vsego = 0
    plohih = []

    def proba(imya, ok, podrobno=''):
        nonlocal vsego
        vsego += 1
        print(f"{'PASS' if ok else 'FAIL'} {imya}{(' — ' + podrobno) if (podrobno and not ok) else ''}")
        if not ok:
            plohih.append(imya)

    # Контроль зрячести: фикстуры несут ТО свойство, ради которого стенд существует (две разные формы).
    # EN: sight control: the fixtures carry the very property the stand exists for (two different shapes).
    f11 = json.loads((FIKS / 'pack-v11.json').read_text()); f12 = json.loads((FIKS / 'pack-v12.json').read_text())
    v11 = json.loads((FIKS / 'view-v11.json').read_text()); v12 = json.loads((FIKS / 'view-v12.json').read_text())
    proba('фикстуры: pack 11 — массив из 1, pack 12 — объект из 1, view 11 — объект, view 12 — массив из 1',
          isinstance(f11, list) and len(f11) == 1 and isinstance(f12, dict) and len(f12) == 1
          and isinstance(v11, dict) and isinstance(v12, list) and len(v12) == 1)

    puti11, _ = zhdu_pack('pack-v11.json')
    for f in PACK_PRINYAT:
        puti, imya_arhiva = zhdu_pack(f)
        kod, out, err = pomoshchnik('--files', f)
        proba(f'--files {f}: код 0, пути = разбору Python', kod == 0 and out.splitlines() == puti and puti == puti11,
              f'код {kod}, вывод {out.splitlines()!r}, ждали {puti!r}; {err.strip()}')
        kod, out, err = pomoshchnik('--filename', f)
        proba(f'--filename {f}: код 0, «{imya_arhiva}»', kod == 0 and out == imya_arhiva + '\n',
              f'код {kod}, вывод {out!r}; {err.strip()}')
    for f, prichina in PACK_OTKAZ.items():
        kod, out, err = pomoshchnik('--files', f)
        proba(f'--files {f}: ОТКАЗ код 2, stdout пуст, причина «{prichina}»',
              kod == 2 and out == '' and err.startswith('npm-sostav: ОТКАЗ') and prichina in err,
              f'код {kod}, stdout {out!r}, stderr {err.strip()!r}')
    for f in ['pack-oshibka.json', 'pusto.json']:
        kod, out, err = pomoshchnik('--filename', f)
        proba(f'--filename {f}: ОТКАЗ код 2, stdout пуст', kod == 2 and out == '',
              f'код {kod}, stdout {out!r}')
    # Тип filename судит помощник: текстовый вывод теряет тип JSON, и число/null у вызывающего уже не отличить
    # от строки «17»/«null» (находка Альфы 14.10). Путь он НЕ нормализует — «../x.tgz» доходит до проверки вызывающего.
    # EN: the helper judges the filename type (text output loses the JSON type); it does NOT normalize the path.
    for f in ['pack-filename-chislo.json', 'pack-filename-null.json']:
        kod, out, err = pomoshchnik('--filename', f)
        proba(f'--filename {f}: ОТКАЗ код 2, stdout пуст, причина «не дал filename»',
              kod == 2 and out == '' and 'не дал filename' in err, f'код {kod}, stdout {out!r}, stderr {err.strip()!r}')
    kod, out, err = pomoshchnik('--filename', 'pack-filename-put.json')
    proba('--filename pack-filename-put.json: код 0, «../x.tgz» как есть — путь судит вызывающий',
          kod == 0 and out == '../x.tgz\n', f'код {kod}, вывод {out!r}; {err.strip()}')
    vyvody = []
    for f in VIEW_PRINYAT:
        kod, out, err = pomoshchnik('--view', f)
        try:
            razobrano = json.loads(out)
        except ValueError:
            razobrano = None
        vyvody.append(razobrano)
        proba(f'--view {f}: код 0, одна строка, объект = разбору Python',
              kod == 0 and out.count('\n') == 1 and razobrano == zhdu_view(f), f'код {kod}, вывод {out!r}; {err.strip()}')
    proba('--view: формы 11 и 12 дают один и тот же объект', vyvody[0] is not None and vyvody[0] == vyvody[1])
    for f, prichina in VIEW_OTKAZ.items():
        kod, out, err = pomoshchnik('--view', f)
        proba(f'--view {f}: ОТКАЗ код 2, stdout пуст, причина «{prichina}»',
              kod == 2 and out == '' and err.startswith('npm-sostav: ОТКАЗ') and prichina in err,
              f'код {kod}, stdout {out!r}, stderr {err.strip()!r}')
    for dovody, imya in [([], 'без режима'), (['--files', '--view'], 'два режима'), (['--dry-run'], 'чужой флаг --dry-run')]:
        p = subprocess.run([str(HELPER)] + dovody, stdin=subprocess.DEVNULL, capture_output=True, timeout=30)
        proba(f'вызов {imya}: ОТКАЗ код 2', p.returncode == 2 and p.stdout == b'', f'код {p.returncode}')
    # Справка в конвейере не должна стать «путём» и не должна дать пустой stdout при коде 0 (ворота 14.10).
    # EN: in a pipeline help must not become a "path" nor an empty stdout with code 0.
    p = subprocess.run([str(HELPER), '--help'], stdin=subprocess.DEVNULL, capture_output=True, timeout=30)
    proba('вызов --help: stdout пуст, справка в stderr, код 2',
          p.returncode == 2 and p.stdout == b'' and b'--files' in p.stderr, f'код {p.returncode}, stdout {p.stdout!r}')

    if vsego != ZHDYOM:
        print(f'🔴 КАНАРЕЙКА: часть проверок не состоялась — проб {vsego}, объявлено {ZHDYOM}')
        sys.exit(2)
    print(f"ИТОГ: {vsego - len(plohih)} из {vsego}" + (f"; красные: {', '.join(plohih)}" if plohih else ''))
    sys.exit(1 if plohih else 0)


def najti_jq(komanda, glubina=0):
    """Все вызовы jq в строке команды: [(флаги, программа)]; внутрь `bash -c`/`sh -c` — рекурсивно.
    EN: all jq calls in a command string, descending into `bash -c`/`sh -c` arguments."""
    if glubina > 3:
        return []
    lex = shlex.shlex(komanda, posix=True, punctuation_chars='|;&()')
    lex.whitespace_split = True
    try:
        toks = list(lex)
    except ValueError:
        return []
    najdeno = []
    i = 0
    while i < len(toks):
        t = toks[i]
        if t == 'jq' or t.endswith('/jq'):
            flagi = []
            j = i + 1
            while j < len(toks) and toks[j].startswith('-'):
                flagi.append(toks[j]); j += 1
            if j < len(toks):
                najdeno.append((flagi, toks[j]))
            i = j + 1
            continue
        if t in ('bash', 'sh', '/bin/bash', '/bin/sh') and i + 2 < len(toks) and toks[i + 1] == '-c':
            najdeno += najti_jq(toks[i + 2], glubina + 1)
            i += 3
            continue
        i += 1
    return najdeno


def zapis_jq(flagi, programma, fajl=None, tekst=None):
    vhod = (FIKS / fajl).read_bytes() if fajl else tekst.encode()
    p = subprocess.run(['jq'] + flagi + [programma], input=vhod, capture_output=True, timeout=30)
    return p.returncode, p.stdout.decode()


def sverit_zapis(ident, pole, komanda):
    vid = 'pack' if 'npm pack' in komanda else 'view'
    vyzovy = najti_jq(komanda)
    if len(vyzovy) != 1:
        return 'СЛЕПОТА', f'{ident} {pole}: вызовов jq найдено {len(vyzovy)}, нужен ровно один'
    flagi, programma = vyzovy[0]
    nabor = PACK_PRINYAT + list(PACK_OTKAZ) if vid == 'pack' else VIEW_PRINYAT + list(VIEW_OTKAZ)
    for f in nabor:
        kod_z, out_z = zapis_jq(flagi, programma, fajl=f)
        if vid == 'pack':
            kod_p, out_p, _ = pomoshchnik('--files', f)
            if (kod_z == 0) != (kod_p == 0):
                return 'РАЗОШЛОСЬ', (f'{ident} {pole}: {f} — запись код {kod_z} ({len(out_z.splitlines())} строк), '
                                     f'помощник код {kod_p}')
            if kod_p == 0 and out_z.splitlines() != out_p.splitlines():
                return 'РАЗОШЛОСЬ', f'{ident} {pole}: {f} — строки записи {out_z.splitlines()!r} ≠ помощника {out_p.splitlines()!r}'
        else:
            kod_p, out_p, _ = pomoshchnik('--view', f)
            if (kod_z == 0) != (kod_p == 0):
                return 'РАЗОШЛОСЬ', f'{ident} {pole}: {f} — запись код {kod_z}, помощник код {kod_p}'
            if kod_p == 0:
                kod_n, out_n = zapis_jq(flagi, programma, tekst=out_p)
                if kod_n != 0 or out_n != out_z or not out_z.strip():
                    return 'РАЗОШЛОСЬ', (f'{ident} {pole}: {f} — запись(фикстура) {out_z.strip()!r} ≠ '
                                         f'запись(вывод помощника) {out_n.strip()!r} (код {kod_n})')
    return 'СОШЛОСЬ', f'{ident} {pole} ({vid}, флаги jq {" ".join(flagi) or "—"}): {len(nabor)} фикстур'


def rezhim_reestra(fajl, idy):
    if not HELPER.is_file() or not shutil.which('jq'):
        slepota(f'нет помощника ({HELPER}) или jq — сравнивать не с чем')
    try:
        import yaml
    except ImportError:
        slepota('нет python3-yaml — реестр не прочитать')
    try:
        dannye = yaml.safe_load(Path(fajl).read_text())
    except (OSError, yaml.YAMLError) as e:
        slepota(f'реестр {fajl} не прочитан: {e}')
    zapisi = []

    def obojti(u):
        if isinstance(u, dict):
            if isinstance(u.get('id'), str):
                zapisi.append(u)
            for v in u.values():
                obojti(v)
        elif isinstance(u, list):
            for v in u:
                obojti(v)
    obojti(dannye)
    if idy:
        nenajdeno = [i for i in idy if not any(z['id'] == i for z in zapisi)]
        if nenajdeno:
            slepota(f'в реестре нет записей: {", ".join(nenajdeno)}')
    sudim = []
    for z in zapisi:
        if idy and z['id'] not in idy:
            continue
        for pole in ('installed_check', 'fingerprint_check', 'latest_check'):
            k = z.get(pole)
            if isinstance(k, str) and ('npm pack' in k or 'npm view' in k) and 'jq' in k:
                sudim.append((z['id'], pole, k))
    if not sudim:
        slepota('ни одной записи с npm pack/npm view и jq — судить нечего (0 — про запрос, не про реестр)')
    itog = {'СОШЛОСЬ': 0, 'РАЗОШЛОСЬ': 0, 'СЛЕПОТА': 0}
    for ident, pole, k in sudim:
        ishod, stroka = sverit_zapis(ident, pole, k)
        itog[ishod] += 1
        print(f'{ishod}: {stroka}')
    print(f"ИТОГ реестра: команд {len(sudim)} · сошлось {itog['СОШЛОСЬ']} · разошлось {itog['РАЗОШЛОСЬ']} · "
          f"слепота {itog['СЛЕПОТА']}")
    sys.exit(2 if itog['СЛЕПОТА'] else 1 if itog['РАЗОШЛОСЬ'] else 0)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        probnyj_nabor()
    elif a[0] == '--reestr' and len(a) >= 2:
        rezhim_reestra(a[1], a[2:])
    else:
        print('ОТКАЗ: stend-npm-sostav.py [--reestr ФАЙЛ [ID…]]')
        sys.exit(2)
