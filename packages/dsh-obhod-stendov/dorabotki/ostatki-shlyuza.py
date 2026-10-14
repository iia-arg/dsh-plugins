#!/usr/bin/env python3
"""Проверка РЕЗУЛЬТАТА: не уцелело ли у копии боевое значение.

Берутся ВСЕ непустые значения боевого окружения (юнит: Environment= + EnvironmentFile=), а не перечень подмен.
Поэтому новая настройка шлюза, о которой никто не подумал, останавливает пробу:
её значение уцелеет, в bezvrednye её нет — и канарейка откажет с именем ключа.
Так спотыкается механизм, а не человек.
"""
import json, sys

env_ekz, itog, spisok, out = sys.argv[1:5]
bezvred = set(json.load(open(spisok, encoding='utf-8')).get('bezvrednye', {}))

boevye = {}
for line in open(env_ekz, encoding='utf-8'):
    line = line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    k, v = line.split('=', 1)
    if v.strip():
        boevye[k] = v

kopiya = {}
for line in open(itog, encoding='utf-8'):
    line = line.rstrip('\n')
    if '=' in line:
        k, v = line.split('=', 1)
        kopiya[k] = v

# RU: Печатается только ИМЯ ключа: в полном окружении юнита есть секреты (ключ OMEGA из EnvironmentFile),
#     прежние 40 знаков значения унесли бы их в вывод и журнал.
# EN: Only the key NAME is printed: the full unit environment holds secrets (the OMEGA key from an EnvironmentFile);
#     the former 40 value characters would have carried them into the output and the journal.
ostalos = [k for k, v in boevye.items()
           if k not in bezvred and kopiya.get(k) == v]
open(out, 'w', encoding='utf-8').write('\n'.join(ostalos))
