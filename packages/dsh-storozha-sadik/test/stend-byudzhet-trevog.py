#!/usr/bin/env python3
"""СТЕНД «бюджет тревог и предел юнита» сторожа sessiya-uderzhana-watch (A-N-1948 модуль №5, находка №27; Искра, 10.10.2026).

Предмет: довод 1, иначе БОЕВОЙ /usr/local/sbin/sessiya-uderzhana-watch. Прогон в дочернем процессе: модуль грузится из файла,
подменены список ledger (три агента) и чтение ledger (у каждого одно удержание сверх порога); канал SUW_ALERT — подставной
скрипт, который «висит» ZAVIS_S с на каждую тревогу; состояние — в своём mktemp. Ledger, реестр и канал машины не трогаются.
Масштаб (назван, не скрыт): предел юнита 180 с изображает timeout PREDEL_S=10; бюджет кандидата на время пробы — 6 с
(BUDZHET_TREVOG_S, у основы такой величины нет — это и есть дефект).
Пробы: П1 три зависших тревоги → процесс укладывается в предел, печатает ИТОГ и пишет состояние · П2 исправный канал → все три
тревоги ушли, в состоянии три ключа.
Коды: 0 — все пробы; 1 — красные; 2 — слепота.
ЧЕГО НЕ ЛОВИТ: настоящий счёт времени юнита (systemd); чтение настоящих ledger (inspect подменён); agent-alert.
"""
import hashlib, json, os, subprocess, sys, tempfile, time

P = sys.argv[1] if len(sys.argv) > 1 else "/usr/local/sbin/sessiya-uderzhana-watch"
if not os.access(P, os.R_OK):
    print(f"СЛЕПОТА: предмет не читается: {P}"); sys.exit(2)
PREDEL_S, ZAVIS_S = 10, 4
BEGUN = r'''
import importlib.machinery, importlib.util, sys
sys.dont_write_bytecode = True
P = sys.argv[1]
z = importlib.machinery.SourceFileLoader("suw_stend", P); sp = importlib.util.spec_from_loader("suw_stend", z)
m = importlib.util.module_from_spec(sp); z.exec_module(m)
if hasattr(m, "BUDZHET_TREVOG_S"): m.BUDZHET_TREVOG_S = 6
m.ledgers = lambda registry: [(f"agent{i}", f"/stend/ledger{i}.sqlite") for i in range(3)]
m.inspect = lambda path, now_ms: ([{"receipt_id": "r-" + path[-8:-7], "phase": "prepared", "route_key": "rk", "session": "s",
                                     "sverh_sroka_ms": 3_600_000, "items": "нет", "reason": ""}], 0)
sys.argv = [P]
sys.exit(m.main())
'''


def progon(zavis):
    t = tempfile.mkdtemp(prefix="stend-byudzhet.")
    kanal = os.path.join(t, "kanal")
    with open(kanal, "w") as f:
        f.write(f"#!/bin/sh\nsleep {zavis}\nexit 0\n")
    os.chmod(kanal, 0o755)
    env = dict(os.environ, SUW_ALERT=kanal, SUW_STATE=os.path.join(t, "state.json"), SUW_REGISTRY="/nonexistent/stend")
    t0 = time.monotonic()
    r = subprocess.run(["timeout", str(PREDEL_S), sys.executable, "-c", BEGUN, P], env=env, capture_output=True, text=True)
    dl = time.monotonic() - t0
    sost = None
    try:
        sost = json.load(open(os.path.join(t, "state.json")))
    except (OSError, ValueError):
        pass
    itog = [ln for ln in r.stdout.splitlines() if "ИТОГ:" in ln]
    subprocess.run(["rm", "-rf", "--", t])
    return r.returncode, dl, itog, sost


ok = bad = 0


def pr(imya, uslovie, podrobno):
    global ok, bad
    if uslovie:
        ok += 1; print(f"✅ {imya} — {podrobno}")
    else:
        bad += 1; print(f"❌ {imya} — {podrobno}")


print(f"== стенд бюджета тревог: предмет {P} ({hashlib.sha256(open(P, 'rb').read()).hexdigest()[:16]}), предел {PREDEL_S} с")
kod, dl, itog, sost = progon(ZAVIS_S)
pr("П1 три зависших тревоги → в пределе, ИТОГ и состояние", kod != 124 and itog and sost is not None,
   f"код {kod}{' (убит пределом)' if kod == 124 else ''}, {dl:.1f} с, {itog[0].split('] ')[-1] if itog else 'ИТОГА нет'}, "
   f"состояние: {'нет' if sost is None else f'ключей {len(sost)}'}")
kod, dl, itog, sost = progon(0)
pr("П2 исправный канал → три тревоги, три ключа", kod == 0 and sost is not None and len(sost) == 3,
   f"код {kod}, {dl:.1f} с, {itog[0].split('] ')[-1] if itog else 'ИТОГА нет'}, ключей {0 if sost is None else len(sost)}")
print(f"итог: {ok} из {ok + bad}")
sys.exit(1 if bad else 0)
