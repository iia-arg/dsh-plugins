#!/usr/bin/env python3
"""Строит подмены единственных сущностей ИЗ СПИСКА и дописывает их в окружение копии.

Забыл добавить сущность в список — она не подменится, и это поймает не эта
программа, а проверка результата (ostatki-shlyuza.py): она смотрит, не уцелело ли
боевое значение. Здесь же ловится другое: вид подмены, которого мы не умеем делать.
"""
import json, os, shutil, sys

spisok, port, token, vrem, sreda = sys.argv[1:6]
# B-N-1049: порт моста Codex копии — замером в канарейке (6-й довод). Нет довода — вида нет, и
# запись с ним даст отказ «неизвестный вид», а не пустоту с умолчанием кода «порт + 100».
port_mosta = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] else None
# B-N-1045: база сессий — ФАЙЛ (pusto нельзя: умолчание в коде шлюза — живая база iskra);
# дом Codex — подставной auth.json, иначе /health копии честно ответит 503.
codex_dom = os.path.join(vrem, 'codex-dom')
chem = {'svobodnyj-port': port, 'podstavnoj-token': token,
        'vremennyj-katalog': vrem, 'pusto': '',
        'vremennaya-baza': os.path.join(vrem, 'sessii.db'),
        'podstavnoj-dom-codex': codex_dom}
if port_mosta: chem['svobodnyj-port-mosta'] = port_mosta
if len(sys.argv) > 7 and sys.argv[7]: chem['podstavnoj-ingress'] = sys.argv[7]
# RU: Боевые значения — из окружения экземпляра, уже лежащего в sreda (подмены дописываются ниже и побеждают последним
#     вхождением). Нужны видам «копия»: канарейка не должна читать живой путь, поэтому получает копию во временном каталоге.
# EN: Live values come from the instance environment already in sreda (substitutions are appended below and win as the
#     last occurrence). The "copy" kinds need them: the canary must not read a live path, so it gets a copy in the temp dir.
boevye = {}
for _l in open(sreda, encoding='utf-8'):
    if '=' in _l and not _l.startswith('#'):
        _k, _v = _l.rstrip('\n').split('=', 1); boevye[_k] = _v


def kopiya_kataloga_modulya(k):
    """Копия каталога модуля (только файлы *.mjs, *.js, *.txt, *.json и подкаталог nastrojki/, без *.bak*); путь к копии того же
    файла. Боевого значения нет или файла нет — пусто (модуль не подключается, как у боевого без ключа).
    Copy of the module directory (only *.mjs, *.js, *.txt, *.json and the nastrojki/ subdirectory, no *.bak*); path to the copy
    of the same file. No live value or no file — empty (module not loaded, as for a live unit without the key)."""
    src = boevye.get(k, '')
    if not src or not os.path.isfile(src):
        return ''
    # RU: Отбор явный (B-N-1550): файлы верхнего уровня по расширению и ОДИН подкаталог nastrojki/, ссылки — ссылками
    #     (symlinks=True). Прежний copytree отбирал только файлы, а подкаталоги брал все и с переходом по ссылкам —
    #     ссылка node_modules в каталоге модуля утащила бы весь общий node_modules.
    # EN: Explicit selection (B-N-1550): top-level files by extension and ONE subdirectory nastrojki/, links kept as links
    #     (symlinks=True). The former copytree filtered only files and took every subdirectory, following links — a
    #     node_modules link in the module directory would have dragged in the whole shared node_modules.
    ishodnyj, kuda = os.path.dirname(src), os.path.join(vrem, 'kopiya-' + k.lower())
    os.makedirs(kuda)
    for i in os.listdir(ishodnyj):
        p = os.path.join(ishodnyj, i)
        if '.bak' not in i and os.path.isfile(p) and i.endswith(('.mjs', '.js', '.txt', '.json')):
            shutil.copy2(p, kuda)
    nastr = os.path.join(ishodnyj, 'nastrojki')
    if os.path.isdir(nastr) and not os.path.islink(nastr):
        shutil.copytree(nastr, os.path.join(kuda, 'nastrojki'), symlinks=True,
                        ignore=lambda d, imena: [i for i in imena if '.bak' in i])
    return os.path.join(kuda, os.path.basename(src))


def kopiya_fajla(k):
    """Копия файла во временном каталоге; боевого нет или не читается — путь в никуда (читатель скажет «не читается»).
    A copy of the file in the temp dir; no live file or unreadable — a path to nowhere (the reader says "unreadable")."""
    kuda = os.path.join(vrem, 'kopiya-' + k.lower())
    src = boevye.get(k, '')
    try:
        if src:
            shutil.copyfile(src, kuda)
    except OSError:
        pass
    return kuda


d = json.load(open(spisok, encoding='utf-8'))
stroki = []
print(f"  подмены из списка ({len(d['sushchnosti'])}):")
for s in d['sushchnosti']:
    k, v = s['klyuch'], s.get('podmena')
    if v == 'put-v-nikuda':
        # RU: Несуществующий путь в своём временном каталоге (B-N-1550): копия и её дети не дойдут до живого
        #     хранилища (gnupg, pass, настройки gws, дом DSH). · EN: A nonexistent path in our temp dir (B-N-1550):
        #     the copy and its children cannot reach a live store (gnupg, pass, gws settings, DSH home).
        chem[v] = os.path.join(vrem, 'nikuda-' + k.lower())
    elif v == 'kopiya-kataloga-modulya':
        chem[v] = kopiya_kataloga_modulya(k)
    elif v == 'kopiya-fajla':
        chem[v] = kopiya_fajla(k)
    if v not in chem:
        print(f"🔴 неизвестный вид подмены {v!r} у {k}", file=sys.stderr)
        sys.exit(1)
    if v == 'podstavnoj-dom-codex' and not os.path.exists(codex_dom):
        os.makedirs(codex_dom, mode=0o700)
        fd = os.open(os.path.join(codex_dom, 'auth.json'), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.write(fd, b'{"podstavnoj":"kanarejka"}\n'); os.close(fd)
    stroki.append(f'{k}={chem[v]}')
    print(f"    {k:<19} -> {v:<18} {s['zachem'][:72]}")
open(sreda, 'a', encoding='utf-8').write('\n'.join(stroki) + '\n')
