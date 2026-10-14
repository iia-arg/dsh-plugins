#!/usr/bin/env python3
"""СТЕНД предела чтения журнала pamyat-fill-watch (B-N-2040, Заря, 14.10.2026).

Предмет: довод 1, иначе БОЕВОЙ /usr/local/libexec/pamyat-fill-watch.py. Модуль импортируется, зовутся ЕГО stream_json и
completions; вместо journalctl — подставной процесс python (sys.executable -c), журналы машины не читаются.
Пробы: П1 исправный поток — две записи, без отказа · П2 таймер оборвал строку → Unmeasured «предел», не JSONDecodeError ·
П3 таймер между строками → Unmeasured «предел» · П4 строка без \\n при выходе 0 → Unmeasured, не JSONDecodeError ·
П5 completions отбирает _TRANSPORT=stdout вместе с -u · П6 --grep без совпадений (код 1, пусто) — по-прежнему пусто, без отказа.
Различают редакции П2, П4, П5; П1, П3, П6 — охранные (зелёные и на прежней).
Коды: 0 — все пробы; 1 — красные; 2 — слепота стенда.
ЧЕГО НЕ ЛОВИТ: настоящую скорость journald (замер — отдельной пробой на машине); юнит и таймер сторожа; turns() и базы.
"""
import importlib.util
import os
import sys
import time

sys.dont_write_bytecode = True
P = sys.argv[1] if len(sys.argv) > 1 else "/usr/local/libexec/pamyat-fill-watch.py"
if not os.access(P, os.R_OK):
    print(f"СЛЕПОТА: предмет не читается: {P}"); sys.exit(2)
s = importlib.util.spec_from_file_location("pfw", P); w = importlib.util.module_from_spec(s); s.loader.exec_module(w)
ITOG = []


def proba(imya, ok, podrobno=""):
    ITOG.append(bool(ok)); print(("ОК   " if ok else "FAIL ") + imya + ("" if ok else f" :: {podrobno}"))


def fake(kod):
    return [sys.executable, "-c", "import sys,time\n" + kod]


# Как ночью: срок обхода далеко (240 c), срабатывает ТАЙМЕР чтения. Таймер модуля укорочен до 1.5 c подменой
# threading.Timer; короткий срок обхода вместо этого подменил бы предмет (сработала бы проверка «предел времени обхода»).
class Korotkij(w.threading.Timer):
    def __init__(self, interval, function, *a, **k):
        super().__init__(min(interval, 1.5), function, *a, **k)
w.threading.Timer = Korotkij


def progon(kod, otbor=False):
    t0 = time.monotonic()
    try:
        out = list(w.stream_json(fake(kod), [0], time.monotonic() + 240, otbor=otbor)); return out, None, time.monotonic() - t0
    except Exception as e:
        return None, e, time.monotonic() - t0


ZAPIS = 'sys.stdout.write(\'{"MESSAGE":"a"}\\n{"MESSAGE":"b"}\\n\');sys.stdout.flush()\n'
out, e, _ = progon(ZAPIS)
proba("П1 исправный поток — две записи", e is None and [x["MESSAGE"] for x in out] == ["a", "b"], f"{out} {e!r}")

out, e, dt = progon('sys.stdout.write(\'{"_TRANSPORT":"\');sys.stdout.flush();time.sleep(20)\n')
proba("П2 таймер оборвал строку → «предел», не JSONDecodeError",
      isinstance(e, w.Unmeasured) and "предел" in str(e) and dt < 6, f"{type(e).__name__}: {e} за {dt:.1f} c")

out, e, dt = progon('sys.stdout.write(\'{"MESSAGE":"a"}\\n\');sys.stdout.flush();time.sleep(20)\n')
proba("П3 таймер между строками → отказ «предел/таймаут»",
      isinstance(e, w.Unmeasured) and ("предел" in str(e) or "таймаут" in str(e)) and dt < 6, f"{type(e).__name__}: {e} за {dt:.1f} c")

out, e, _ = progon('sys.stdout.write(\'{"MESSAGE":"a"}\\n{"MESS\')\n')
proba("П4 строка без \\n при выходе 0 → Unmeasured, не JSONDecodeError", isinstance(e, w.Unmeasured), f"{type(e).__name__}: {e}")

vzyato = []
def lovushka(command, budget, deadline, otbor=False):
    vzyato.append(command); return iter(())
iskhod = w.stream_json; w.stream_json = lovushka
try:
    w.completions("x.service", 1.0, 2.0, time.monotonic() + 5)
finally:
    w.stream_json = iskhod
c = vzyato[0] if vzyato else []
proba("П5 completions отбирает _TRANSPORT=stdout вместе с -u",
      "-u" in c and c[c.index("-u") + 1] == "x.service" and "_TRANSPORT=stdout" in c, f"{c}")

out, e, _ = progon("sys.exit(1)\n", otbor=True)
proba("П6 --grep без совпадений (код 1, пусто) — пусто, без отказа", e is None and out == [], f"{out} {e!r}")

ok = sum(ITOG)
print(f"ИТОГ: {ok} из {len(ITOG)}")
sys.exit(0 if ok == len(ITOG) else 1)
