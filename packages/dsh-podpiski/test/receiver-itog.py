#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Стенд ЦЕПОЧКИ приёмник→единица→переключатель→ITOG_FILE (усл.3 Вениамина v4, B-N-1151, Искра).
# Проверяет: после УСПЕШНОГО /switch следующий ОТКАЗ по заслону доходит до владельца ТЕКСТОМ ОТКАЗА
# с подсказкой force, а НЕ прошлым «переключено». Приёмник берёт итог только если метка прогона свежее
# момента вызова (усл.2). ВСЁ на подставных: настоящий переключатель в подставном окружении, подставной
# systemctl-в-роли-запуска-единицы, ITOG_FILE во временном каталоге. Бой не трогается.
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
import os, runpy, subprocess, sys, tempfile, time, stat
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
if subprocess.run(["sudo", "-n", "true"], capture_output=True).returncode != 0:
    _nnp = [l.split()[1] for l in open("/proc/self/status") if l.startswith("NoNewPrivs")]
    print(f"СЛЕПОТА: нет sudo (NoNewPrivs {_nnp[0] if _nnp else '?'}) — стенд меряет через sudo, исход был бы ложным")
    sys.exit(2)

# по умолчанию — БОЙ; кандидата подавать SWITCH_BIN / PRIYOMNIK_BIN
SW = os.environ.get("SWITCH_BIN", str(ROOT / "sbin/pereklyuchatel-podpiski"))
PR = os.environ.get("PRIYOMNIK_BIN", str(ROOT / "sbin/sadik-komandy-priyomnik"))
for f in (SW, PR):
    if not os.access(f, os.R_OK):
        print("СЛЕПОТА: нет", f); sys.exit(2)
rab = tempfile.mkdtemp(prefix="stend-priyomnik-")
ED = os.path.join(rab, "etc"); LIM = os.path.join(rab, "lim"); BIN = os.path.join(rab, "bin")
for d in (ED, LIM, BIN):
    os.makedirs(d)
ITOG = os.path.join(rab, "itog"); OTM = os.path.join(rab, "otm")
ok = fail = 0


def w(path, s, mode=0o644):
    open(path, "w").write(s)
    os.chmod(path, mode)


def sud(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1; print("  ✅", label)
    else:
        fail += 1; print("  🔴", label, "—", detail)


# подставные приборы для переключателя
w(f"{BIN}/live", '#!/usr/bin/env python3\nimport sys,os\nf=os.environ["RAB"]+"/state/live-"+sys.argv[1]\nprint(open(f).read().strip() if os.path.exists(f) else "")\n', 0o755)
w(f"{BIN}/hodil", '#!/usr/bin/env python3\nimport sys,os\nprint("" if os.path.exists(os.environ["RAB"]+"/state/nehod-"+sys.argv[1]) else "ходил")\n', 0o755)
w(f"{BIN}/sysctl", '#!/usr/bin/env python3\nimport sys,os\na=sys.argv[1:]\nRAB=os.environ["RAB"]\nif a[:1]==["list-units"]:\n    print(open(RAB+"/units").read()); sys.exit(0)\nif "show" in a: print("1000"); sys.exit(0)\nif a[:1]==["is-active"]: print("active"); sys.exit(0)\nif a[:1]==["restart"]:\n    ag=a[1].split("@")[1].split(".")[0]\n    import re; ef=RAB+"/etc/instance-"+ag+".env"\n    m=re.search(r"token-podpiska-([12])",open(ef).read())\n    if m: open(RAB+"/state/live-"+ag,"w").write(m.group(1))\n    sys.exit(0)\nsys.exit(0)\n', 0o755)

os.makedirs(f"{rab}/state", exist_ok=True)


def rasklad(*pairs):
    for f in os.listdir(f"{rab}/state"):
        os.remove(f"{rab}/state/{f}")
    for f in os.listdir(LIM):
        os.remove(f"{LIM}/{f}")
    units = []
    for p in pairs:
        a, _, n = p.partition(":")
        units.append(f"claude-oauth-gateway@{a}.service")
        w(f"{ED}/instance-{a}.env", f"GATEWAY_TOKEN_FILE={ED}/token-podpiska-{n or 1}\nDUMMY=x\n")
        w(f"{rab}/state/live-{a}", (n or "") + "\n")
    w(f"{rab}/units", "\n".join(units) + "\n")


w(f"{ED}/token-podpiska-1", ""); w(f"{ED}/token-podpiska-2", "")

# подставной «systemctl» для ПРИЁМНИКА: `start --wait pereklyuchatel-podpiski@X.service` → зовёт настоящий
# переключатель $SW X.. в подставном окружении. Возвращает его код. (роль systemd-единицы в тесте)
# B-N-1410 (02.10, Заря): после B-N-1394 переключатель берёт SWITCH_* ТОЛЬКО при SWITCH_STEND=1 — без ключа он шёл по БОЕВЫМ путям
# («/switch 2 force», ночь 02.10 — остановили лишь права iskra); после B-N-1390 у заслона второй источник — живые лимиты aclaude
# (SWITCH_LIMITY_READER, по SSH): подставной отвечает «unknown» (код 20), заслон судится только по подставным следам стенда.
w(f"{BIN}/limity", '#!/bin/sh\nprintf "unknown\\tподставной читатель стенда\\n"; exit 20\n', 0o755)
# B-N-1482: B-N-1472 добавил ожидание хода; в этом стенде состояние только подставное.
w(f"{BIN}/turn", '#!/usr/bin/env python3\nimport os,sys\nwith open(os.environ["RAB"]+"/state/turn-probes", "a") as f: f.write(sys.argv[1]+"\\n")\nprint("pid=1 start=1 end=1 poslednee=turn/end zhurnal=est")\n', 0o755)
# B-N-1668 (05.10, Искра): с B-N-1621 (05.10 07:5xZ) переключатель при SWITCH_STEND=1 требует подменённого помощника доступа
# (SWITCH_SVESTI, иначе ОТКАЗ код 2 — этот стенд краснел «итог не получен», 5 из 8); страховки — в стенд (SWITCH_BAK_DIR),
# без подмены они уходят в боевой /var/backups/montazh/pereklyuchatel-podpiski. Образец — stend-switch-1.py:67.
w(f"{BIN}/svesti",
  "#!/usr/bin/env python3\nimport sys\n"
  f"open({rab!r}+'/svesti.log','a').write(' '.join(sys.argv[1:])+'\\n')\n", 0o755)
# 07.10 (Искра; хозяйка — слово Забавы 16:42Z): с редакции 730bf32f (08:44Z, своя подписка по реестру) переключатель при SWITCH_STEND=1
# требует и подставной реестр (SWITCH_REGISTRY, иначе ОТКАЗ код 2 — этот стенд краснел «итог не получен», 5 из 8). Образец —
# stend-pereklyuchatelya-podpiski.sh:152: подставной agent-registry отвечает на «pole <агент> podpiska --json»; здесь у всех
# агентов стенда — общая подписка ("obshchaya-claude"), как было до своей подписки; прочие вызовы — код 9.
w(f"{BIN}/reestr",
  "#!/bin/sh\n[ \"$1\" = pole ] && [ \"$3\" = podpiska ] && [ \"$4\" = --json ] || { echo \"reestr: неожиданный вызов $*\" >&2; exit 9; }\n"
  "echo '\"obshchaya-claude\"'\n", 0o755)
ENV_SW = {  # окружение переключателя (SWITCH_*)
    "SWITCH_STEND": "1", "SWITCH_LIMITY_READER": f"{BIN}/limity",
    "SWITCH_SVESTI": f"{BIN}/svesti", "SWITCH_BAK_DIR": f"{rab}/bak", "SWITCH_REGISTRY": f"{BIN}/reestr",
    "SWITCH_TURN_CMD": f"{BIN}/turn", "SWITCH_TURN_WAIT": "2", "SWITCH_TURN_POLL": "1", "SWITCH_TURN_PROBE": "1",
    "SWITCH_ENV_DIR": ED, "SWITCH_SYSTEMCTL": f"{BIN}/sysctl", "SWITCH_LIMIT_DIR": LIM,
    "SWITCH_ALERT": "/bin/true", "SWITCH_LIVE_TOKEN_CMD": f"{BIN}/live", "SWITCH_HOD_CMD": f"{BIN}/hodil",
    "SWITCH_OTMETKA": OTM, "SWITCH_ITOG_FILE": ITOG, "SWITCH_MIN_INTERVAL": "0", "SWITCH_SLEEP": "0", "RAB": rab,
}
runner = (
    "#!/usr/bin/env python3\nimport sys,os,subprocess\n"
    f"SW={SW!r}\nENV={ENV_SW!r}\n"
    "a=sys.argv[1:]\n"
    "u=[x for x in a if x.endswith('.service')][0]\n"
    "inst=u.split('@')[1].split('.service')[0]\n"
    "args=inst.split('-') if '-' in inst else [inst]\n"
    "e=dict(os.environ); e.update(ENV)\n"
    "p=subprocess.run([SW,*args],env=e)\n"
    "sys.exit(p.returncode)\n"
)
w(f"{BIN}/sysctl_unit", runner, 0o755)

w(f"{BIN}/nosudo", '#!/bin/sh\n[ "$1" = "-n" ] && shift\nexec "$@"\n', 0o755)
ENV_PR = {**os.environ, "SADIK_SYSTEMCTL": f"{BIN}/sysctl_unit", "SADIK_SUDO": f"{BIN}/nosudo",
          "SADIK_ITOG_FILE": ITOG, "SADIK_UNIT_PREFIX": "pereklyuchatel-podpiski@", "RAB": rab,
          "SADIK_STEND": "1"}  # B-N-1417: приёмник берёт SADIK_* только при ключе
old = dict(os.environ); os.environ.update(ENV_PR)
ns = runpy.run_path(PR, run_name="stend_priyomnik")  # main() не вызывается
ispolnit = ns["ispolnit"]
# B-N-1417 ПРЕДОХРАНИТЕЛЬ (урок B-N-1410): у iskra sudo NOPASSWD ALL — если приёмник НЕ взял подставные systemctl/sudo
# (не тот ключ, другая редакция), ispolnit позвал бы БОЕВОЙ «sudo systemctl start pereklyuchatel-podpiski@…».
# Сверяем ДО первого вызова; не подставные → слепота, код 2, ни одного действия.
if ns.get("SYSTEMCTL") != f"{BIN}/sysctl_unit" or ns.get("SUDO") != f"{BIN}/nosudo":
    os.environ.clear(); os.environ.update(old); subprocess.run(["sudo", "-n", "rm", "-rf", "--", rab])  # B-N-1668: bak — root
    print(f"🔴 СЛЕПОТА: приёмник не взял подмены (SYSTEMCTL={ns.get('SYSTEMCTL')!r}, SUDO={ns.get('SUDO')!r}) — "
          "вызовов не было"); sys.exit(2)

try:
    # 1. успех: все на 1, /switch 2 force → «переключено»
    rasklad("iskra:1", "zarya:1")
    r1 = ispolnit(["2", "force"])
    sud("успешный /switch 2 force → владельцу «переключено»", "переключено" in r1 and "подписку 2" in r1, r1)

    probes = os.path.join(rab, "state", "turn-probes")
    calls = open(probes).read().splitlines() if os.path.exists(probes) else []
    sud("проверка хода обоих агентов прошла через подставной прибор",
        bool(calls) and set(calls) == {"iskra.service", "zarya.service"}, repr(calls))

    # 2. СЛЕДОМ отказ по заслону: все на 1, /switch 1 (на 1 никто «не ходил») → владельцу ТЕКСТ ОТКАЗА с force,
    #    а НЕ прошлое «переключено» (усл.3)
    rasklad("iskra:2", "zarya:2")   # все на 2 → на цель 1 живых шлюзов нет → «расход неизвестен»
    r2 = ispolnit(["1"])
    sud("следом отказ по заслону → владельцу текст ОТКАЗА с подсказкой force (не прошлое «переключено»)",
        ("force" in r2) and ("переключено" not in r2) and ("НЕИЗВЕСТЕН" in r2 or "лимит" in r2), r2)

    # 3. несвежий итог: приёмник НЕ показывает прошлый текст, если метка старее вызова
    rasklad("iskra:1")
    open(ITOG, "w").write("111.999\tстарый итог прошлого прогона\n")  # метка 111 — заведомо старая
    # systemctl-роль, которая НЕ трогает ITOG (эмуляция: единица упала до записи)
    w(f"{BIN}/sysctl_noop", "#!/usr/bin/env python3\nimport sys\nsys.exit(7)\n", 0o755)
    os.environ["SADIK_SYSTEMCTL"] = f"{BIN}/sysctl_noop"
    ns2 = runpy.run_path(PR, run_name="stend_priyomnik2")
    r3 = ns2["ispolnit"](["2"])
    sud("несвежий итог (метка старее вызова) → НЕ показываем прошлый текст, «итог не получен»",
        ("старый итог" not in r3) and ("итог не получен" in r3), r3)
finally:
    os.environ.clear(); os.environ.update(old)
    subprocess.run(["sudo", "-n", "rm", "-rf", "--", rab])  # B-N-1668: bak — root

# B-N-1417 к1–к4: ключ подмен приёмника. Только загрузка модуля (runpy, не __main__) и сверка его переменных —
# main()/ispolnit не зовутся, ни Telegram, ни sudo не трогаются.
import contextlib, io
def zagruzka(dop, ubrat=()):
    sohr = dict(os.environ)
    for k in list(os.environ):
        if k.startswith("SADIK_"): del os.environ[k]
    os.environ.update(dop)
    for k in ubrat: os.environ.pop(k, None)
    out, err, kod, mod = io.StringIO(), io.StringIO(), None, {}
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            mod = runpy.run_path(PR, run_name="stend_klyuch")
    except SystemExit as e:
        kod = e.code
    finally:
        os.environ.clear(); os.environ.update(sohr)
    return mod, out.getvalue(), err.getvalue(), kod
POD = {"SADIK_SYSTEMCTL": "/bin/false", "SADIK_SUDO": "/bin/false", "SADIK_TG_API": "http://127.0.0.1:9"}
m1, o1, e1, k1 = zagruzka({**POD, "SADIK_STEND": "1"})
sud("к1 ключ=1 → «ПОДМЕНЕНО» первой строкой и подмены взяты",
    o1.startswith("ПОДМЕНЕНО: ") and m1.get("SYSTEMCTL") == "/bin/false" and m1.get("SUDO") == "/bin/false", o1 or e1)
m2, o2, e2, k2 = zagruzka(POD, ubrat=("SADIK_STEND",))
sud("к2 без ключа → «ИГНОРИРУЮ», берутся боевые systemctl/sudo/API",
    "ИГНОРИРУЮ" in e2 and "ПОДМЕНЕНО" not in o2 and m2.get("SYSTEMCTL") == "/usr/bin/systemctl"
    and m2.get("SUDO") == "sudo" and m2.get("API") == "https://api.telegram.org", (e2 or o2) + f" SYSTEMCTL={m2.get('SYSTEMCTL')!r}")
m3, o3, e3, k3 = zagruzka({**POD, "SADIK_STEND": "2"})
sud("к3 ключ=2 → отказ кодом 2 при загрузке, подмен нет", k3 == 2 and "ПОДМЕНЕНО" not in o3, f"код {k3}; {e3 or o3}")
m4, o4, e4, k4 = zagruzka({**POD, "SADIK_STEND": ""})
sud("к4 ключ пустой → отказ кодом 2", k4 == 2 and "ПОДМЕНЕНО" not in o4, f"код {k4}; {e4 or o4}")

print(f"\nитог: {ok} из {ok+fail}")
ZHDYOM = 8
if ok + fail != ZHDYOM:
    print(f"🔴 КАНАРЕЙКА: проб {ok+fail}, ждём {ZHDYOM}"); sys.exit(2)
sys.exit(1 if fail else 0)
