#!/usr/bin/env python3
"""B-N-1501: опись слоя SDK по составу. Вызов: opis-sloya.py <каталог слоя> [--spisok]
Строка на объект: путь · вид (f/l/o) · sha256, цель ссылки или тип прочего объекта · режим. Итог — sha256 описи (без .sostoyanie.json — в нём время и рука).
Ссылки не разыменовываются; каталог слоя должен быть настоящим каталогом (ссылку на слой подавайте её целью).
Коды: 0 — опись снята; 2 — не тот предмет (нет пути, ссылка, не каталог); 3 — нет прав (опись НЕ снята)."""
import hashlib, os, stat, sys
if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and sys.argv[2] != '--spisok'):
    print('отказ: opis-sloya.py <каталог> [--spisok]'); sys.exit(2)
koren = sys.argv[1]
def net_prav(e):   # B-N-1501 (LOW Вениамина): отказ по правам — НЕ «нет предмета»; код 3, опись не печатается
    print(f'отказ: нет прав — {e.filename}: {e.strerror}; опись не снята (запускайте от владельца слоя или root)'); sys.exit(3)
try: st0 = os.lstat(koren)
except PermissionError as e: net_prav(e)
except FileNotFoundError: print(f'отказ: {koren} — нет такого пути'); sys.exit(2)
if stat.S_ISLNK(st0.st_mode) or not stat.S_ISDIR(st0.st_mode):
    print(f'отказ: {koren} — не настоящий каталог (ссылку подавайте её целью)'); sys.exit(2)
stroki = []
# onerror: без него os.walk МОЛЧА пропускает нечитаемый подкаталог — опись недосчитана, а код 0
def oshibka_obhoda(e):
    if isinstance(e, PermissionError): net_prav(e)
    raise e
for d, dirs, files in os.walk(koren, onerror=oshibka_obhoda):
    dirs.sort()
    for n in sorted(files + [x for x in dirs if os.path.islink(os.path.join(d, x))]):
        p = os.path.join(d, n); rel = os.path.relpath(p, koren)
        if rel == '.sostoyanie.json': continue
        st = os.lstat(p)
        if stat.S_ISLNK(st.st_mode): stroki.append(f'{rel}\tl\t{os.readlink(p)}\t-')
        elif stat.S_ISREG(st.st_mode):
            h = hashlib.sha256()
            try:
                with open(p, 'rb') as f:
                    for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
            except PermissionError as e: net_prav(e)
            stroki.append(f'{rel}\tf\t{h.hexdigest()}\t{oct(stat.S_IMODE(st.st_mode))}')
        else:
            # A-N-1948 №28: FIFO, сокет, устройство прежде пропускались МОЛЧА — опись с кодом 0 была неполной. Теперь третий
            # вид «o» с типом: объект входит в опись и в её сумму. Слой без таких объектов даёт прежнюю опись побайтно.
            vid = ('fifo' if stat.S_ISFIFO(st.st_mode) else 'sock' if stat.S_ISSOCK(st.st_mode) else
                   'chr' if stat.S_ISCHR(st.st_mode) else 'blk' if stat.S_ISBLK(st.st_mode) else 'inoe')
            stroki.append(f'{rel}\to\t{vid}\t{oct(stat.S_IMODE(st.st_mode))}')
    dirs[:] = [x for x in dirs if not os.path.islink(os.path.join(d, x))]
opis = '\n'.join(stroki) + '\n'
if len(sys.argv) == 3: sys.stdout.write(opis)
print(f'объектов {len(stroki)} · опись sha256 {hashlib.sha256(opis.encode()).hexdigest()}')
