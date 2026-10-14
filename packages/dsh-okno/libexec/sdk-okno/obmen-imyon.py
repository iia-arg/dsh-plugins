#!/usr/bin/env python3
"""B-N-1501: атомарный ОБМЕН двух имён в одном каталоге (renameat2 RENAME_EXCHANGE, ext4/Linux ≥3.15).
Вызов: obmen-imyon.py <имя1> <имя2> — оба должны существовать (lexists) и лежать в ОДНОМ каталоге.
Зачем: превратить каталог sdk-runtime в ссылку без мгновения, когда имени нет (mv+ln оставляет зазор — ход упал бы с ENOENT).
Неизвестный ввод и любой отказ ядра — ОТКАЗ, код 2; ничего не делается наполовину: обмен либо случился целиком, либо нет."""
import ctypes, ctypes.util, os, sys
if len(sys.argv) != 3 or any(a.startswith('-') for a in sys.argv[1:]):
    print('отказ: obmen-imyon.py <имя1> <имя2>  (ключей нет)'); sys.exit(2)
a, b = (os.path.abspath(x) for x in sys.argv[1:])
if os.path.dirname(a) != os.path.dirname(b):
    print(f'отказ: имена в разных каталогах ({os.path.dirname(a)} ≠ {os.path.dirname(b)})'); sys.exit(2)
for x in (a, b):
    if not os.path.lexists(x): print(f'отказ: нет {x}'); sys.exit(2)
libc = ctypes.CDLL(ctypes.util.find_library('c'), use_errno=True)
AT_FDCWD, RENAME_EXCHANGE = -100, 2
if libc.renameat2(AT_FDCWD, a.encode(), AT_FDCWD, b.encode(), RENAME_EXCHANGE) != 0:
    e = ctypes.get_errno(); print(f'отказ: renameat2 EXCHANGE — {os.strerror(e)} (errno {e}); ничего не изменено'); sys.exit(2)
print(f'обменяны: {a} ⇄ {b}')
