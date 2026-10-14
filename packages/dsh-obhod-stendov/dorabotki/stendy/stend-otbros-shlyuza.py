#!/usr/bin/env python3
"""Стенд читателя крика фильтра схем (B-N-1698 хвост) в dsh-compact-watch. Довод: путь к сторожу.
ИЗОЛЯЦИЯ как у stend-compact-watch.sh: journalctl — подставной (PATH, строки из файла), канал — подставной (файл, код задаёт
стенд), состояние — временный каталог. Карта служб — настоящий /etc/agent-registry/agents.yaml (только чтение).
Ожидания — в именах проверок (записаны до прогона). Коды: 0 — годно, 1 — расхождение, 2 — слепота."""
import json, os, subprocess, sys, tempfile, time, shutil
PREDMET = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "/usr/local/sbin/dsh-compact-watch")   # без довода — боевой предмет
TMP = tempfile.mkdtemp(prefix="stend-otbros-")
BIN = os.path.join(TMP, "bin"); os.makedirs(BIN)
ZH = os.path.join(TMP, "zhurnal.jsonl"); open(ZH, "w").close()
KL = os.path.join(TMP, "kanal.log"); KRC = os.path.join(TMP, "kanal.rc"); open(KRC, "w").write("0")
RAZDEL = "\n@@@\n"; SOST = os.path.join(TMP, "sost")
open(os.path.join(BIN, "journalctl"), "w").write(f"""#!/usr/bin/env python3
import sys, json, time
a = sys.argv[1:]
if "-o" not in a or a[a.index("-o") + 1] != "json": sys.exit(0)
units = {{a[i + 1] for i, x in enumerate(a) if x == "-u"}}
posle = int(a[a.index("--after-cursor") + 1][1:]) if "--after-cursor" in a else -1
for i, l in enumerate(open({ZH!r})):
    if i <= posle: continue
    z = json.loads(l)
    if units and z["unit"] not in units: continue
    print(json.dumps({{"__CURSOR": "c%d" % i, "__REALTIME_TIMESTAMP": str(int(z["ts"] * 1e6)), "_SYSTEMD_UNIT": z["unit"], "MESSAGE": z["msg"]}}, ensure_ascii=False))
""")
open(os.path.join(BIN, "kanal"), "w").write(f"#!/bin/sh\nprintf '%s{RAZDEL}' \"$1\" >> {KL!r}\nexit $(cat {KRC!r})\n")
open(os.path.join(BIN, "pribor"), "w").write("#!/bin/sh\nexit 0\n")
for x in ("journalctl", "kanal", "pribor"): os.chmod(os.path.join(BIN, x), 0o755)
GW, SL = "claude-oauth-gateway@zarya.service", "zarya.service"
PFX = "[subscription-gateway 1.4.47/3139b9b9] "
def most(g=(), e=(), prislano=44):
    gs = (" (" + ", ".join(json.dumps(x) for x in g) + ")") if g else ""
    es = (" (" + ", ".join(e) + ")") if e else ""
    red = "🔴 " if g or e else ""
    return f"{PFX}{red}мост у модели: прислано {prislano} · собрано {prislano - len(g) - len(e)} · отброшено шлюзом {len(g)}{gs} · пропущено движком {len(e)}{es} · сервер \"zaryadsh\" connected · путь HTTP"
N = [0]
def dopisat(*msgs, unit=GW):
    with open(ZH, "a") as f:
        for m in msgs:
            N[0] += 1; f.write(json.dumps({"unit": unit, "msg": m, "ts": time.time() - 100 + N[0] * 0.01}, ensure_ascii=False) + "\n")
def takt(snyato=None):
    n0 = len(open(KL).read().split(RAZDEL)) - 1 if os.path.exists(KL) else 0
    env = dict(os.environ, PATH=BIN + ":" + os.environ["PATH"], DSH_COMPACT_WATCH_KANAL=os.path.join(BIN, "kanal"),
               DSH_COMPACT_WATCH_KATALOG=SOST, DSH_COMPACT_WATCH_PRIBOR=os.path.join(BIN, "pribor"), PYTHONDONTWRITEBYTECODE="1")
    if snyato is not None: env["DSH_COMPACT_WATCH_OTBROS_SNYATO_S"] = str(snyato)
    r = subprocess.run([sys.executable, PREDMET], env=env, capture_output=True, text=True, timeout=180)
    vse = open(KL).read().split(RAZDEL)[:-1] if os.path.exists(KL) else []
    moi = [m for m in vse[n0:] if "до модели не дошли" in m or "инструменты снова доходят" in m]   # 08.10: короткие строки владельцу
    return r.returncode, moi, r.stdout + r.stderr
itog, krasnyh = [], 0
def pr(imya, ok, podr=""):
    global krasnyh
    itog.append(f"{'✅' if ok else '❌'} {imya}" + (f" — {podr}" if podr else "")); krasnyh += 0 if ok else 1
kr = lambda tr: " | ".join(t.replace("\n", " ⏎ ")[:160] for t in tr)
try:
    dopisat(most())
    rc, tr, vyv = takt()
    if "первый прогон" not in vyv: print("СЛЕПОТА: сторож не отметил первый прогон —", vyv.strip()[-200:]); sys.exit(2)
    pr("Т0 первый прогон: отметка, тревог 0", rc == 0 and not tr, f"код {rc}, {len(tr)}")
    dopisat(most(), most())
    rc, tr, _ = takt(); pr("С1 отброшено 0 — молчит", rc == 0 and not tr, f"код {rc}, {kr(tr)}")
    dopisat(most(g=["bad_tool"]))
    rc, tr, _ = takt(); pr("С2 отброшен 1 — одна тревога с агентом и именем", rc == 0 and len(tr) == 1 and "1 инстр. (шлюз): bad_tool" in tr[0] and "Заря" in tr[0], kr(tr))
    dopisat(most(g=["bad_tool"]), most(), most(g=["bad_tool"]))
    rc, tr, _ = takt(); pr("С3 повтор того же набора (и чистые ходы между) — молчит", rc == 0 and not tr, kr(tr))
    dopisat(most(g=["bad_tool", "other_tool"]))
    rc, tr, _ = takt(); pr("С4 новый набор — тревога, «новые в эпизоде: other_tool»", len(tr) == 1 and "2 инстр. (шлюз)" in tr[0] and "новые: other_tool" in tr[0], kr(tr))
    dopisat(most(e=["omega_store"]))
    rc, tr, _ = takt(); pr("С5 движок пропустил мимо фильтра — тревога «движок пропустил 1: omega_store»", len(tr) == 1 and "движок пропустил 1: omega_store" in tr[0], kr(tr))
    dopisat(most())
    rc, tr, _ = takt(); pr("С6 возврат к 0 до выдержки (6 ч по умолчанию) — «снято» НЕ шлёт", rc == 0 and not tr, kr(tr))
    dopisat(most())
    rc, tr, _ = takt(snyato=0); pr("С7 возврат к 0 после выдержки — «✅ СНЯТО» одно", len(tr) == 1 and tr[0].startswith("✅") and "снова доходят" in tr[0], kr(tr))
    dopisat(most())
    rc, tr, _ = takt(snyato=0); pr("С8 после «снято» чистые ходы — молчит", not tr, kr(tr))
    open(KRC, "w").write("1"); dopisat(most(g=["x_tool"]))
    rc, tr, _ = takt(); open(KRC, "w").write("0")
    rc2, tr2, _ = takt(); pr("С9 канал отказал — эпизод откатан, следующий такт шлёт ту же тревогу", len(tr) == 1 and len(tr2) == 1 and "x_tool" in tr2[0], f"{len(tr)}→{len(tr2)}: {kr(tr2)}")
    dopisat(f"вывод инструмента: {most(g=['podloga'])}", unit=SL)
    dopisat("[kompakt-dsh 1.1.31] " + most(g=["podloga"]), unit=GW)
    rc, tr, _ = takt(); pr("С10 якорь: та же строка не с начала (вывод инструмента, чужой префикс) — молчит", not tr, kr(tr))
finally:
    shutil.rmtree(TMP, ignore_errors=True)
print("\n".join(itog)); print(f"итог: {len(itog) - krasnyh} из {len(itog)}")
sys.exit(1 if krasnyh else 0)
