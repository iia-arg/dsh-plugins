#!/bin/bash
# СТЕНД dsh-compact-watch (B-N-1060, Заря, 26.09.2026): строка журнала байтами не роняет такт · печать «последнее из журнала» не выдаёт
# себя за основу порога · голос падения такта — одна тревога, остывание, отметка по доставке, снятие успехом. 9 проб.
# B-N-1063: +4 пробы (П9–П12) — «ЗАНЯТОСТЬ <агент>»: журнал с оговоркой о возрасте + «сейчас по прибору» (подставной прибор), без тревоги. Всего 13.
# A-N-1099 остаток (Заря): +П20–П23 — первый прогон без состояния: тревог 0 (П20 (а), П21 (б); стережёт ранний выход), история «тревог 0» (П22),
#   первый прогон не съедает остывание секретаря (П23).
# B-N-1161 (Искра, 28.09): +П24–П26 — «занято N из M» пишут ДВОЕ (шлюз от своего порога, nudzh от окна): обе строки печати
#   дают ОДИН % от порога ПРИБОРА (П24), «ДОСТИГНУТ» не зависит от чужого знаменателя (П25), при слепом приборе это сказано (П26).
# B-N-1162 (Искра, 28.09): +П27–П28 — максимум старше суток печатается с возрастом и без «ДОСТИГНУТ» (П27), свежий — как прежде (П28).
# B-N-1852 (Заря, 08.10): +П29–П31 — первый прогон на свежем состоянии говорит один раз «точки отсчёта нет» (П29), отказ канала —
#   состояния нет и заведение повторяется (П30), второй такт не повторяет ни заведения, ни слепоты первого (П31).
# Предмет: довод 1, иначе COMPACT_WATCH_BIN, иначе БОЕВОЙ /usr/local/sbin/dsh-compact-watch. Коды: 0 — все пробы, 1 — красные, 2 — слепота.
# Изоляция и пробы — в шапке Python-части ниже. Под обходчиком (учётка iskra): ~1 мин, sudo не нужен.
set -u
P="${1:-${COMPACT_WATCH_BIN:-/usr/local/sbin/dsh-compact-watch}}"
[ -r "$P" ] || { echo "СЛЕПОТА: предмет не читается: $P"; exit 2; }
exec python3 - "$P" <<'PY'
"""B-N-1060 · стенд dsh-compact-watch: строка журнала байтами, печать «последнее из журнала», голос падения такта.
Заря, 26.09.2026; каркас — стенд B-H-522 (stend-nachato.py). Запуск: python3 stend-b1060.py <путь к сторожу>
ИЗОЛЯЦИЯ: journalctl — подставной (через PATH, строки из файла стенда), канал — подставной (DSH_COMPACT_WATCH_KANAL:
пишет в файл, код ответа задаёт стенд), состояние — во временном каталоге (DSH_COMPACT_WATCH_KATALOG). Боевой бот,
боевое состояние и настоящий журнал не трогаются. Читается по-настоящему: /etc/agent-registry/agents.yaml (карта служб),
systemctl is-active, прибор kontekst-zamer (только чтение); их тревоги стенд не считает — считает только свои образцы.
П5–П8: причина падения СИНТЕТИЧЕСКАЯ (_SYSTEMD_UNIT списком — вживую journald так не пишет): нужна причина, которую
правка П2 не лечит, иначе голос падения нечем проверить."""
import json, os, re, subprocess, sys, tempfile, time, shutil

PREDMET = os.path.abspath(sys.argv[1])
TMP = tempfile.mkdtemp(prefix="zarya-b1060-")
BIN = os.path.join(TMP, "bin"); os.makedirs(BIN)
ZHURNAL = os.path.join(TMP, "zhurnal.jsonl"); open(ZHURNAL, "w").close()
OBRYV = os.path.join(TMP, "obryvy.tsv"); open(OBRYV, "w").close()   # 08.10: строки обрывов «служба<TAB>текст» для -o short-unix (пусто — как прежде)
KANAL_LOG = os.path.join(TMP, "kanal.log"); KANAL_RC = os.path.join(TMP, "kanal.rc")
open(KANAL_RC, "w").write("0")
# B-N-1063: подставной прибор занятости (DSH_COMPACT_WATCH_PRIBOR): вывод — из файла, код — из файла.
PRIBOR_OUT = os.path.join(TMP, "pribor.out"); PRIBOR_RC = os.path.join(TMP, "pribor.rc")
open(PRIBOR_OUT, "w").write("v=1 agent=zarya projected=300000 okno=1000000 porog=890000\nv=1 agent=spartak projected=100000 okno=1000000 porog=890000\n")
open(PRIBOR_RC, "w").write("0")
RAZDEL = "\n@@@\n"
SOST = os.path.join(TMP, "sostoyanie")

with open(os.path.join(BIN, "journalctl"), "w") as f:
    f.write(f"""#!/usr/bin/env python3
import sys, json, time, os
a = sys.argv[1:]
units = {{a[i + 1] for i, x in enumerate(a) if x == "-u"}}
if "-o" in a and a[a.index("-o") + 1] == "short-unix":   # 08.10: ветка обрывов — строки из OBRYV, каждая своей секундой
    # B-N-1855: база времени — mtime файла обрывов (пишется стендом ОДИН раз), не time.time() вызова: сторож зовёт журнал
    #   отдельно на каждый шлюз и потом на службы; смена секунды между вызовами сдвигала метки служб на метки шлюза — «5» вместо «6».
    baza = int(os.path.getmtime({OBRYV!r}))
    for k, l in enumerate(open({OBRYV!r})):
        u, t = l.rstrip("\\n").split("\\t", 1)
        if u in units: print("%d.000001 sadik %s: %s" % (baza - 100 + k, u, t))
    sys.exit(0)
if "-o" not in a or a[a.index("-o") + 1] != "json":
    sys.exit(0)            # прочие режимы («опрос жив») — пусто
posle = int(a[a.index("--after-cursor") + 1][1:]) if "--after-cursor" in a else -1
for i, l in enumerate(open({ZHURNAL!r})):
    if i <= posle: continue
    z = json.loads(l)
    if units and z["unit"] not in units and z["unit"] != "init.scope": continue
    print(json.dumps({{"__CURSOR": "c%d" % i, "__REALTIME_TIMESTAMP": str(int(z.get("ts", time.time()) * 1e6)),
                      "_SYSTEMD_UNIT": z.get("unit_v_vyvode", z["unit"]), "MESSAGE": z["msg"]}}, ensure_ascii=False))
""")
with open(os.path.join(BIN, "kanal"), "w") as f:
    f.write(f"""#!/bin/sh
printf '%s{RAZDEL}' "$1" >> {KANAL_LOG!r}
exit $(cat {KANAL_RC!r})
""")
with open(os.path.join(BIN, "pribor"), "w") as f:
    f.write(f"""#!/bin/sh
cat {PRIBOR_OUT!r}
exit $(cat {PRIBOR_RC!r})
""")
for x in ("journalctl", "kanal", "pribor"):
    os.chmod(os.path.join(BIN, x), 0o755)


def dopisat(*zapisi):
    with open(ZHURNAL, "a") as f:
        for z in zapisi:
            f.write(json.dumps(z, ensure_ascii=False) + "\n")


def takt(predmet=PREDMET, molchat=""):
    # 08.10.2026: molchat="" — голос всех видов (прежние пробы стерегут ЛОГИКУ); None — умолчание сторожа (М1–М4).
    n0 = len(open(KANAL_LOG).read().split(RAZDEL)) - 1 if os.path.exists(KANAL_LOG) else 0
    env = dict(os.environ, PATH=BIN + ":" + os.environ["PATH"], DSH_COMPACT_WATCH_KANAL=os.path.join(BIN, "kanal"),
               DSH_COMPACT_WATCH_KATALOG=SOST, PYTHONDONTWRITEBYTECODE="1",
               DSH_COMPACT_WATCH_PRIBOR=os.path.join(BIN, "pribor"))
    env.pop("DSH_COMPACT_WATCH_MOLCHAT", None)
    if molchat is not None: env["DSH_COMPACT_WATCH_MOLCHAT"] = molchat
    r = subprocess.run([sys.executable, predmet], env=env, capture_output=True, text=True, timeout=180)
    vse = open(KANAL_LOG).read().split(RAZDEL)[:-1] if os.path.exists(KANAL_LOG) else []
    return r.returncode, vse[n0:], r.stdout + r.stderr


itog, krasnyh = [], 0
def proverka(imya, ok, podrobno=""):
    global krasnyh
    itog.append(f"{'✅' if ok else '❌'} {imya}" + (f" — {podrobno}" if podrobno else ""))
    krasnyh += 0 if ok else 1

SL = "zarya.service"
FON = "[заря] [event] type=turn/start session.id=telegram-a2a"
ZAN = "[dsh-pamyat-nudzh 0.1.0-alpha.13] занято 612345 из 1000000"
END = "[заря] [event] type=compaction/end session.id=telegram-a2a knownSessions=telegram-a2a"
# Живая форма беды: запись sudo, где образец grep обрезан посреди русской буквы (0xD0 без пары) — байты, не UTF-8.
BAJTY = list("    zarya : COMMAND=/usr/bin/grep -cF 'рабо".encode()) + [0xD0] + list("' /tmp/x".encode())
kompakt = lambda tr: [m for m in tr if "🗜 Заря: сжатие" in m]   # 08.10: владельцу — короткая строка, полное — в журнал
padaet = lambda tr: [m for m in tr if "Сторож сжатий падает" in m]
T = time.time()
try:
    # Т0 — первый прогон: только рубеж.
    dopisat({"unit": SL, "msg": FON, "ts": T - 600})
    rc, tr, _ = takt()
    proverka("Т0 первый прогон: код 0", rc == 0, f"код {rc}")
    # П1 — исправное: фон и «занято» ⇒ код 0, о падении ни слова.
    dopisat({"unit": SL, "msg": FON, "ts": T - 300}, {"unit": SL, "msg": ZAN, "ts": T - 290})
    rc, tr, vyv = takt()
    proverka("П1 исправное: код 0, «ТАКТ ПАДАЕТ» нет", rc == 0 and not padaet(tr), f"код {rc}, о падении {len(padaet(tr))}")
    # П2 — строка байтами, за ней завершение сжатия в том же такте ⇒ код 0 и ровно одна «КОМПАКТ ЗАВЕРШЁН».
    dopisat({"unit": SL, "msg": BAJTY, "ts": T - 200}, {"unit": SL, "msg": END, "ts": T - 190})
    rc, tr, vyv = takt()
    proverka("П2 строка байтами не роняет такт; сжатие после неё замечено", rc == 0 and len(kompakt(tr)) == 1,
             f"код {rc}, «КОМПАКТ ЗАВЕРШЁН» {len(kompakt(tr))}" + ("" if rc == 0 else " · " + vyv.strip().splitlines()[-1][:120]))
    # П3 — следующий такт: рубеж сдвинут, байтовая строка и сжатие НЕ перечитаны.
    dopisat({"unit": SL, "msg": FON, "ts": T - 100})
    rc, tr, _ = takt()
    proverka("П3 рубеж сдвинут: повтора нет", rc == 0 and not kompakt(tr), f"код {rc}, повторов {len(kompakt(tr))}")
    # П4 — печать сохранённого замера не выдаёт себя за основу порога.
    proverka("П4 печать: «ПОРОГ С НИМ НЕ СРАВНИВАЕТСЯ», прежней фразы нет",
             "ПОРОГ С НИМ НЕ СРАВНИВАЕТСЯ" in vyv and "с ним и сравнивается" not in vyv,
             "; ".join(l[:110] for l in vyv.splitlines() if "zarya занято" in l)[:230])
    # П5 — такт падает (синтетика): ровно одна тревога «ТАКТ ПАДАЕТ» с именем ошибки, код 1.
    dopisat({"unit": SL, "unit_v_vyvode": [SL], "msg": ZAN, "ts": T - 50})
    rc, tr, _ = takt()
    proverka("П5 падение такта: код 1, ровно одна «ТАКТ ПАДАЕТ» с TypeError",
             rc == 1 and len(padaet(tr)) == 1 and "TypeError" in padaet(tr)[0], f"код {rc}, тревог {len(padaet(tr))}")
    # П6 — падает снова: остывание, тревоги нет.
    rc, tr, _ = takt()
    proverka("П6 падает снова: остывание, тревоги нет", rc == 1 and not padaet(tr), f"код {rc}, тревог {len(padaet(tr))}")
    # П7 — отметка по доставке: канал отказал ⇒ отметка не записана ⇒ после оживления канала тревога дошла.
    os.remove(os.path.join(SOST, "padenie.json"))
    open(KANAL_RC, "w").write("1")
    rc1, tr1, _ = takt()
    open(KANAL_RC, "w").write("0")
    rc2, tr2, _ = takt()
    proverka("П7 отказ канала не ставит отметку: следующий такт шлёт",
             rc1 == 1 and len(padaet(tr1)) == 1 and rc2 == 1 and len(padaet(tr2)) == 1,
             f"при отказе попыток {len(padaet(tr1))}, после оживления {len(padaet(tr2))}")
    # П8 — такт без исключения снимает отметку: поправить ядовитую строку нельзя (рубеж стоит на ней),
    #      поэтому дописываем исправную и сдвигаем рубеж в состоянии на неё — как после починки причины.
    dopisat({"unit": SL, "msg": FON, "ts": T - 10})
    s = json.load(open(os.path.join(SOST, "sostoyanie.json")))
    s["kursor"] = "c%d" % (sum(1 for _ in open(ZHURNAL)) - 2)
    json.dump(s, open(os.path.join(SOST, "sostoyanie.json"), "w"), ensure_ascii=False)
    rc, tr, _ = takt()
    proverka("П8 такт без исключения снял отметку падения", rc == 0 and not os.path.exists(os.path.join(SOST, "padenie.json")),
             f"код {rc}, отметка {'есть' if os.path.exists(os.path.join(SOST, 'padenie.json')) else 'снята'}")
    # П9–П12 (B-N-1063): «ЗАНЯТОСТЬ <агент>» — журнал с оговоркой о возрасте и СВЕЖЕЕ число прибора; печать, не тревога.
    zan_stroka = lambda vyv, kto: next((l for l in vyv.splitlines() if f"ЗАНЯТОСТЬ {kto}:" in l), "")
    dopisat({"unit": SL, "msg": ZAN, "ts": time.time()})
    rc, tr9a, _ = takt()          # печать занятости идёт ДО чтения журнала: строка этого такта видна в следующем
    dopisat({"unit": SL, "msg": FON, "ts": time.time()})
    rc, tr9, vyv = takt(); tr9 = tr9a + tr9
    z = zan_stroka(vyv, "zarya")
    proverka("П9 журнал и прибор рядом: «из журнала 612,345 …НЕ свежесть» + «сейчас по прибору 300,000 … порога 890,000»",
             "из журнала 612,345 = 68.8% порога 890,000 (61.2% окна 1,000,000)" in z and "НЕ свежесть" in z and "сейчас по прибору 300,000 из 1,000,000 (33.7% порога 890,000)" in z, z[:230])
    z = zan_stroka(vyv, "spartak")
    proverka("П10 строк «занято» не было, прибор дал число — так и сказано", "с последнего сжатия строки «занято» не было" in z and "сейчас по прибору 100,000" in z, z[:200])
    open(PRIBOR_RC, "w").write("2")
    dopisat({"unit": SL, "msg": FON, "ts": time.time()})
    rc, tr11, vyv = takt()
    open(PRIBOR_RC, "w").write("0")
    z = zan_stroka(vyv, "zarya")
    proverka("П11 прибор слеп — «прибор числа не дал», числа прибора нет", "прибор числа не дал" in z and "сейчас по прибору" not in z, z[:200])
    proverka("П12 печать занятости в канал тревог НЕ идёт", not any("ЗАНЯТОСТЬ" in m for m in tr9 + tr11), f"в канал: {len(tr9) + len(tr11)} сообщ.")
    # П24–П26 (B-N-1161, Искра): одно число «занято» в одну секунду пишут шлюз (от СВОЕГО порога, у кодеров не действует)
    # и nudzh (от окна). Живой случай beta 28.09 15:16Z: 617 809 печаталось как 83,8% и 67,0%.
    SHL = lambda n, m: (f"[subscription-gateway 0.4.13/stend] занято {n} из {m} (84% порога компакта, ступень 2 из 3) — "
                        "шлюзовой компакт ВЫКЛЮЧЕН, этот порог НЕ действует; действующий — платформенный, в пресете агента")
    NUD = lambda n, m: f"[dsh-pamyat-nudzh 0.1.0-alpha.20] отметка пути 60%: занято {n} из {m}. Это НАБЛЮДЕНИЕ, не тревога"
    por_stroka = lambda vyv, kto: next((l for l in vyv.splitlines() if f": {kto} НАИБОЛЬШЕЕ ЗА" in l), "")
    proc_poroga = lambda l: re.findall(r"= (\d+\.\d)% порога 890,000", l)
    t24 = time.time()
    dopisat({"unit": SL, "msg": SHL(700000, 737454), "ts": t24}, {"unit": SL, "msg": NUD(700000, 921818), "ts": t24})
    takt()                                   # такт читает обе строки
    dopisat({"unit": SL, "msg": FON, "ts": time.time()})
    rc, _, vyv = takt()                      # печать — в следующем такте
    pl, zl = por_stroka(vyv, "zarya"), zan_stroka(vyv, "zarya")
    proverka("П24 два писателя одного числа: строка порога и ЗАНЯТОСТЬ дают ОДИН % от порога прибора (78.7% порога 890,000)",
             proc_poroga(pl) == ["78.7"] and proc_poroga(zl) == ["78.7"], f"порог: {pl[:170]} · занятость: {zl[:170]}")
    proverka("П25 «ДОСТИГНУТ» не по чужому знаменателю: 700 000 = 94.9% порога шлюза, но 78.7% порога прибора → «не достигнут»",
             "порог не достигнут: zarya" in pl, pl[:200])
    open(PRIBOR_RC, "w").write("2")
    dopisat({"unit": SL, "msg": FON, "ts": time.time()})
    rc, _, vyv = takt()
    open(PRIBOR_RC, "w").write("0")
    pl = por_stroka(vyv, "zarya")
    proverka("П26 прибор слеп: знаменатель из строки журнала — и это СКАЗАНО в строке порога",
             "знаменатель из строки журнала" in pl and "прибор числа не дал" in pl, pl[:220])
    # П27–П28 (B-N-1162, Искра): max_zan заменяется только новым наблюдением — у молчащего агента «за сутки» держалось неделями.
    s = json.load(open(os.path.join(SOST, "sostoyanie.json")))
    s["max_zan"]["zarya"][1] = time.time() - 5 * 86400          # максимум zarya — пятидневной давности, строк «занято» не добавляем
    json.dump(s, open(os.path.join(SOST, "sostoyanie.json"), "w"), ensure_ascii=False)
    dopisat({"unit": SL, "msg": FON, "ts": time.time()})
    rc, _, vyv = takt()
    pl = por_stroka(vyv, "zarya") or next((l for l in vyv.splitlines() if ": zarya последний максимум" in l), "")
    proverka("П27 максимум старше суток: «НЕ ОЦЕНЁН за сутки … 5.0 сут назад», без «ДОСТИГНУТ»/«не достигнут» и без «ЗА СУТКИ»",
             "НЕ ОЦЕНЁН за сутки: zarya" in pl and "5.0 сут назад" in pl and "ДОСТИГНУТ" not in pl
             and "не достигнут" not in pl and "ЗА СУТКИ" not in pl, pl[:230])
    dopisat({"unit": SL, "msg": NUD(600000, 921818), "ts": time.time()})
    takt()                                   # 600 000 < 700 000: заменит ТОЛЬКО потому, что старый старше суток
    dopisat({"unit": SL, "msg": FON, "ts": time.time()})
    rc, _, vyv = takt()
    pl = por_stroka(vyv, "zarya")
    proverka("П28 свежее наблюдение (меньше старого): снова «НАИБОЛЬШЕЕ ЗА СУТКИ 600,000» с оценкой порога",
             "НАИБОЛЬШЕЕ ЗА СУТКИ 600,000" in pl and "порог не достигнут: zarya" in pl, pl[:200])
    # П13–П16 (A-N-1099, Аврора): отказ НАШЕЙ сводки kompakt-dsh — читатель в стороже. Строка — ровно по шаблону писателя.
    otkaz = lambda tr: [m for m in tr if "Заря: своя сводка не вышла" in m]
    OK_SV = "[kompakt-dsh 0.1.0-alpha.11] наша сводка: 12593 зн. из 121582 зн. прозы · хвост 105803 зн. (72 сообщ.) — подан, не пересказывается"
    OTKAZ_SV = ("[kompakt-dsh 0.1.0-alpha.11] 🔴 наша сводка НЕ СОСТОЯЛАСЬ (сводка: HTTP 400 {\"error\":{\"message\":"
                "\"The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed deepseek-v4-flash.\"}}) — отдаю родной")
    dopisat({"unit": SL, "msg": OK_SV, "ts": time.time()})
    rc, tr, _ = takt()
    proverka("П13 удачная наша сводка: тревоги об отказе нет", rc == 0 and not otkaz(tr), f"код {rc}, тревог {len(otkaz(tr))}")
    dopisat({"unit": SL, "msg": OTKAZ_SV, "ts": time.time()})
    rc, tr, vyv = takt()
    o = otkaz(tr)
    proverka("П14 строка отказа: ровно одна тревога — агент, причина (HTTP 400 …); полное с временем — в журнале",
             rc == 0 and len(o) == 1 and "сводка: HTTP 400" in o[0] and "полностью: 🔴 НАША СВОДКА НЕ СОСТОЯЛАСЬ — zarya" in vyv
             and "когда: " in vyv, f"код {rc}, тревог {len(o)}")
    dopisat({"unit": SL, "msg": FON, "ts": time.time()})
    rc, tr, _ = takt()
    proverka("П15 следующий такт: та же строка не повторена", rc == 0 and not otkaz(tr), f"код {rc}, тревог {len(otkaz(tr))}")
    PISATEL = os.environ.get("KOMPAKT_DSH_BIN", "/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh/index.mjs")
    try: tekst_p = open(PISATEL, encoding="utf-8").read()
    except OSError as e: tekst_p = ""; print(f"СЛЕПОТА П16: писатель не читается: {PISATEL}: {e}")
    proverka("П16 шаблон писателя kompakt-dsh на месте: «🔴 наша сводка НЕ СОСТОЯЛАСЬ (…) — отдаю родной»",
             "🔴 наша сводка НЕ СОСТОЯЛАСЬ (" in tekst_p and ") — отдаю родной" in tekst_p, PISATEL)
    # П17–П19 (A-N-1099, расширение): отказ модели у СЕКРЕТАРЯ — строка на каждое окно; остывание по «исход + HTTP-код».
    sek = lambda tr: [m for m in tr if "Заря: знания не извлечены" in m]
    SEK = lambda n, rid: (f"[dsh-pamyat-secretary 0.1.0-alpha.86 2026-09-26T19:50:0{n}.000Z] выбор тем не состоялся [ne-sprosili]: HTTP 400: "
                          f"{{\"error\":{{\"message\":\"The supported API model names are deepseek-flash (request_id: {rid})\"}}}}"
                          " - не опознан как временный, повтора не будет")
    dopisat({"unit": SL, "msg": SEK(1, "b41bbc2c-8384"), "ts": time.time()})
    rc, tr, vyv = takt()
    o = sek(tr)
    proverka("П17 отказ секретаря: ровно одна тревога — агент, исход, причина HTTP 400; полное с временем — в журнале",
             rc == 0 and len(o) == 1 and "ne-sprosili" in o[0] and "HTTP 400" in o[0]
             and "полностью: 🔴 СЕКРЕТАРЬ НЕ СПРОСИЛ МОДЕЛЬ — zarya" in vyv and "когда: " in vyv, f"код {rc}, тревог {len(o)}")
    dopisat({"unit": SL, "msg": SEK(2, "9f00aa11-7777"), "ts": time.time()})
    rc, tr, _ = takt()
    proverka("П18 следующее окно, та же форма (другой request_id): остывание — тревоги нет", rc == 0 and not sek(tr),
             f"код {rc}, тревог {len(sek(tr))}")
    SEKR = os.environ.get("SEKRETAR_BIN", "/opt/agent-plugins/node_modules/dsh-pamyat-secretary/src/distill-shov.js")
    try: tekst_s = open(SEKR, encoding="utf-8").read()
    except OSError as e: tekst_s = ""; print(f"СЛЕПОТА П19: писатель не читается: {SEKR}: {e}")
    proverka("П19 шаблон писателя секретаря на месте: «выбор тем не состоялся [» + исход + «]: »",
             "'выбор тем не состоялся [' + s1.ishod + ']: '" in tekst_s, SEKR)
    # П20–П21 (A-N-1099 остаток, Заря; находка Вениамина): ПЕРВЫЙ прогон (новая машина / снятое состояние) не шлёт историю.
    # Состояние снесено, в журнале — свежие строки отказа ОБОИХ видов; ждём тревог 0 у каждой ветки. Зрячесть: такт первый и строки прочёл.
    shutil.rmtree(SOST, ignore_errors=True); open(ZHURNAL, "w").close()   # новая машина: свой журнал (в старом — синтетическая строка-яд П5)
    dopisat({"unit": SL, "msg": OTKAZ_SV, "ts": time.time()}, {"unit": SL, "msg": SEK(3, "c0ffee00-2020"), "ts": time.time()})
    rc, tr, vyv = takt()
    m = re.search(r"первый прогон: отметка снята, строк (\d+)", vyv); prochel = int(m.group(1)) if m else 0
    proverka("П20 (а) первый прогон без состояния: строка отказа НАШЕЙ сводки в журнале — тревог 0",
             rc == 0 and prochel > 0 and not otkaz(tr), f"код {rc}, первый прогон прочёл строк {prochel}, тревог {len(otkaz(tr))}")
    proverka("П21 (б) тот же первый прогон: строка отказа СЕКРЕТАРЯ в журнале — тревог 0",
             rc == 0 and prochel > 0 and not sek(tr), f"код {rc}, первый прогон прочёл строк {prochel}, тревог {len(sek(tr))}")
    # П20/П21 стережёт РАННИЙ ВЫХОД первого прогона (return 0 до отправки), а не «not pervyj». Запрет «not pervyj» виден иначе:
    # (а) и (б) без него кладут тревогу в список, который первый прогон выбрасывает, — запись истории лжёт «тревог N» (П22);
    # (б) без него ещё и ставит отметку остывания секретаря в СОХРАНЯЕМОЕ состояние — следующий настоящий отказ той же формы молчит час (П23).
    try: ist = [json.loads(l) for l in open(os.path.join(SOST, "istoriya.jsonl"), encoding="utf-8") if l.strip()]
    except OSError as e: ist = []; print(f"СЛЕПОТА П22: истории нет: {e}")
    pz = [z for z in ist if z.get("pervyj")]
    proverka("П22 запись первого прогона в истории: «тревог 0» (запрет not pervyj у обеих веток — собранное и выброшенное не считается)",
             len(pz) == 1 and pz[0].get("trevog") == 0, f"записей первого прогона {len(pz)}, тревог {[z.get('trevog') for z in pz]}")
    dopisat({"unit": SL, "msg": SEK(4, "d00dfeed-3030"), "ts": time.time()})
    rc, tr, _ = takt()
    proverka("П23 (б) после первого прогона — отказ секретаря той же формы: ровно одна тревога (первый прогон не съел остывание)",
             rc == 0 and len(sek(tr)) == 1, f"код {rc}, тревог {len(sek(tr))}")
    # П29–П31 (B-N-1852, Заря; находка Авроры, скилл install-dsh-harness r6): первый прогон на СВЕЖЕМ состоянии говорит ОДИН раз —
    #   «точки отсчёта нет», история не проверена, текущая слепота названа; не доставлено — состояния нет, следующий такт повторит.
    zaveden = lambda tr: [m for m in tr if m.startswith("⚠️ Сторож сжатий заведён заново")]
    ne_vizhu = lambda tr: [m for m in tr if m.startswith("⚠️ Не вижу заполнение")]
    SF = os.path.join(SOST, "sostoyanie.json")
    shutil.rmtree(SOST, ignore_errors=True); dopisat({"unit": SL, "msg": FON, "ts": time.time()})
    rc, tr, vyv = takt()
    proverka("П29 первый прогон на свежем состоянии НЕ молчит: в канал ровно одна строка «заведён заново: история не проверена», "
             "полное «ПЕРВЫЙ ПРОГОН — точки отсчёта нет» — в журнале, состояние записано",
             rc == 0 and len(zaveden(tr)) == 1 and len(tr) == 1 and "ПЕРВЫЙ ПРОГОН — точки отсчёта нет" in vyv and os.path.exists(SF),
             f"код {rc}, строк в канал {len(tr)}: {[m[:70] for m in tr]}, состояние {os.path.exists(SF)}")
    dopisat({"unit": SL, "msg": FON, "ts": time.time()}); rc, tr, vyv = takt()
    proverka("П31 второй такт: «заведён заново» не повторён, слепота первого прогона («Не вижу заполнение») не повторена",
             rc == 0 and not zaveden(tr) and not ne_vizhu(tr), f"код {rc}, заведение {len(zaveden(tr))}, «не вижу» {len(ne_vizhu(tr))}")
    shutil.rmtree(SOST, ignore_errors=True); open(KANAL_RC, "w").write("1")
    dopisat({"unit": SL, "msg": FON, "ts": time.time()}); rc, tr, vyv = takt()
    otm = lambda: (json.load(open(SF)) if os.path.exists(SF) else {}).get("zavedenie_ne_skazano")
    otm_posle_otkaza = otm()   # файл пишут и пороги (свой путь записи) — судим отметку, не наличие файла
    open(KANAL_RC, "w").write("0")
    dopisat({"unit": SL, "msg": FON, "ts": time.time()}); rc2, tr2, _ = takt()
    proverka("П30 канал отказал на первом прогоне: код 1, отметка «заведение не сказано» осталась; канал вернулся — заведение сказано снова, отметка снята",
             rc == 1 and otm_posle_otkaza is True and len(zaveden(tr)) == 1 and rc2 == 0 and len(zaveden(tr2)) == 1 and otm() is None,
             f"отказ: код {rc}, попытка {len(zaveden(tr))}, отметка {otm_posle_otkaza}; после: код {rc2}, заведение {len(zaveden(tr2))}, отметка {otm()}")
    # ── М1–М4 (08.10.2026, Аврора; наряд Забавы «один сторож — одно событие»): о заполнении и ПЛАТФОРМЕННОМ сжатии говорит
    #    dsh-pamyat-storozha; этот сторож по ним молчит НА КАНАЛЕ (считает и пишет в журнал как прежде). Шлюзовое — говорит.
    dopisat({"unit": SL, "msg": "[заря] [event] type=compaction/end session.id=telegram-m1 knownSessions=telegram-m1", "ts": time.time()})
    rc, tr, vyv = takt(molchat=None)
    proverka("М1 умолчание: платформенное сжатие — в канал НЕТ, в журнале «молчу на канале (szhatie-platformy …)»",
             rc == 0 and not kompakt(tr) and "молчу на канале (szhatie-platformy" in vyv, f"код {rc}, в канал {len(kompakt(tr))}")
    dopisat({"unit": SL, "msg": "[subscription-gateway 1.2.3] компакт: занято 800000 -> сводка 9000 зн. (вход 120000 из 300000 зн. прозы, 40 ходов, отброшено 0 зн.)", "ts": time.time()})
    rc, tr, vyv = takt(molchat=None)
    proverka("М2 умолчание: ШЛЮЗОВОЕ сжатие (с числами) — в канал, как прежде",
             rc == 0 and len(kompakt(tr)) == 1 and "шлюз" in kompakt(tr)[0], f"код {rc}, в канал {len(kompakt(tr))}")
    open(PRIBOR_OUT, "w").write("v=1 agent=zarya projected=850000 okno=1000000 porog=890000\nv=1 agent=spartak projected=100000 okno=1000000 porog=890000\n")
    dopisat({"unit": SL, "msg": FON, "ts": time.time()})   # такт без строк журнала — «я ослеп», код 2 (так и задумано)
    rc, tr, vyv = takt(molchat=None)
    zap = [m for m in tr if ": контекст " in m or "перешагнул" in m]
    proverka("М3 умолчание: заполнение 85/90 — в канал НЕТ, в журнале «молчу на канале (zapolnenie …)»",
             rc == 0 and not zap and vyv.count("молчу на канале (zapolnenie") == 2, f"код {rc}, в канал {len(zap)}, молчу {vyv.count('молчу на канале (zapolnenie')}")
    open(PRIBOR_OUT, "w").write("v=1 agent=zarya projected=850000 okno=1000000 porog=890000\nv=1 agent=spartak projected=850000 okno=1000000 porog=890000\n")
    dopisat({"unit": SL, "msg": FON, "ts": time.time()})
    rc, tr, vyv = takt(molchat="")
    zap = [m for m in tr if "Спартак: контекст" in m]   # 08.10: короткая строка владельцу
    proverka("М4 голос включён (DSH_COMPACT_WATCH_MOLCHAT пуст): логика порогов прежняя — 🟡 и 🟠 у spartak",
             rc == 0 and len(zap) == 2 and zap[0].startswith("🟡") and zap[1].startswith("🟠"), f"код {rc}, строк {len(zap)}")
    # ── Д1–Д3 (08.10.2026, порция 2 текстов; слово владельца 00:46 МСК «минимум слов, максимум полезной информации») ──
    DAV = ("[subscription-gateway 1.4.49-b1742/3139b9b9] 🔴 ДАВЛЕНИЕ: Codex внутри хода занял 535915 ≥ порога платформы 534654 "
           "(окно Codex 921818) — платформа сожмёт только после хода, Codex сожмёт сам на своём пороге · 2026-10-07 21:41:45 · чтение rollout в ходе")
    dopisat({"unit": SL, "msg": DAV, "ts": time.time()})
    rc, tr, vyv = takt()
    dv = [m for m in tr if "в ходе" in m]
    proverka("Д1 давление внутри хода → одна строка «🟠 Заря: в ходе 536 тыс. ≥ порога 535 тыс. (окно 922 тыс.) — сожмёт Codex сам»",
             rc == 0 and dv == ["🟠 Заря: в ходе 536 тыс. ≥ порога 535 тыс. (окно 922 тыс.) — сожмёт Codex сам"], f"код {rc}: {dv}")
    proverka("Д2 полная строка давления (со строкой шлюза) — в журнале, не в канале",
             "полностью: 🔴 ДАВЛЕНИЕ ВНУТРИ ХОДА — zarya" in vyv and not any("строка шлюза" in m for m in tr), vyv[-200:])
    # Д4–Д5: серия обрывов (5 и больше моментов за окно) → одна строка с именем и числом; окно опустело → одно «кончились».
    with open(OBRYV, "w") as f:
        for _ in range(3): f.write("zarya.service\tход оборван ошибкой: Claude Code returned an error result: session limit\n")
        for _ in range(3): f.write("claude-oauth-gateway@zarya.service\t[subscription-gateway 1.4.49] 🔴 сбой вызова: session limit\n")
    dopisat({"unit": SL, "msg": FON, "ts": time.time()}); rc, tr, vyv = takt()   # фон: такт без строк журнала — «я ослеп»
    ob = [m for m in tr if m.startswith("🔴 Обрывы ходов")]
    proverka("Д4 серия обрывов → одна строка «🔴 Обрывы ходов: 6 за 30 мин · Заря ×3 · session limit»",
             rc == 0 and ob == ["🔴 Обрывы ходов: 6 за 30 мин · Заря ×3 · session limit"] and "полностью: 🔴 СЕРИЯ ОБРЫВОВ ХОДА" in vyv, f"код {rc}: {ob}")
    open(OBRYV, "w").close()
    dopisat({"unit": SL, "msg": FON, "ts": time.time()}); rc, tr, vyv = takt()
    ob = [m for m in tr if "Обрывы ходов" in m]
    proverka("Д5 окно опустело → одна строка «✅ Обрывы ходов кончились (шли 0 мин)»", rc == 0 and ob == ["✅ Обрывы ходов кончились (шли 0 мин)"], f"код {rc}: {ob}")
    vse_k = open(KANAL_LOG).read().split(RAZDEL)[:-1]
    plohie = [m for m in vse_k if "\n" in m or len(m) > 130 or "машина: sadik" in m or "dsh-compact-watch" in m]
    proverka("Д3 всё, что ушло в канал за прогон, — одна строка ≤ 130 знаков, без «машина: sadik» и имени сторожа",
             vse_k and not plohie, " ¦ ".join(x.replace("\n", " ⏎ ")[:90] for x in plohie[:4]))
except Exception as e:
    proverka("стенд доработал до конца", False, str(e)[:300])
finally:
    for l in itog: print(l)
    print(f"итог: {len(itog) - krasnyh} из {len(itog)} · предмет {PREDMET}")
    shutil.rmtree(TMP, ignore_errors=True)
    sys.exit(1 if krasnyh else 0)
PY
