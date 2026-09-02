#!/usr/bin/env python3
"""Строит подмены единственных сущностей ИЗ СПИСКА и дописывает их в окружение копии.

Забыл добавить сущность в список — она не подменится, и это поймает не эта
программа, а проверка результата (ostatki-shlyuza.py): она смотрит, не уцелело ли
боевое значение. Здесь же ловится другое: вид подмены, которого мы не умеем делать.
"""
import json, sys

spisok, port, token, vrem, sreda = sys.argv[1:6]
chem = {'svobodnyj-port': port, 'podstavnoj-token': token,
        'vremennyj-katalog': vrem, 'pusto': ''}
d = json.load(open(spisok, encoding='utf-8'))
stroki = []
print(f"  подмены из списка ({len(d['sushchnosti'])}):")
for s in d['sushchnosti']:
    k, v = s['klyuch'], s.get('podmena')
    if v not in chem:
        print(f"🔴 неизвестный вид подмены {v!r} у {k}", file=sys.stderr)
        sys.exit(1)
    stroki.append(f'{k}={chem[v]}')
    print(f"    {k:<19} -> {v:<18} {s['zachem'][:72]}")
open(sreda, 'a', encoding='utf-8').write('\n'.join(stroki) + '\n')
