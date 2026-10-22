#!/opt/omega/venv/bin/python3
"""Стенд шлюза OMEGA для гостей (B-N-1476, 03.10.2026, Аврора; B-N-1644 05.10: метка filter_tags и supersede своей записи — T0–T3, S1–S4; B-N-1847 08.10: гостю — только по полю dostupnost, G1–G4). Запуск: sudo /opt/omega/venv/bin/python3 -B stend-shlyuza-omega.py [шлюз.py]

ЗАЧЕМ. Шлюз держит границу «гость видит и правит только свой корень» поверх службы, у которой этой границы нет.
Граница зависит от поставщика (фильтр корня в semantic/phrase/unified, список инструментов, форма ответа similar) —
гонять ПОСЛЕ КАЖДОГО обновления OMEGA (строка в скилле update-omega) и после правки шлюза.

КАК. Всё на копиях: копия боевой базы (backup API от omega) во временном доме с копией лицензии (иначе free tier
режет записи), копия службы — временный юнит systemd-run (User=omega) на порту 8397; шлюз под проверкой — временный
юнит DynamicUser=yes (не omega, без групп) на 8398, ключ службы — EnvironmentFile временного дома; ключ гостя
`varvara` — случайный, в файле ключей только его сумма. Сеют две записи с меткой: V — через шлюз (корень гостя),
C — прямо в копию службы с корнем avrora; связь V→C (как auto-relate). Чужое = вхождения метки C в ответ шлюза.
Временные юниты гасятся по ИМЕНИ, дом и копия лицензии удаляются в finally. Боевая база — только чтение (копия).

КОДЫ: 0 — сошлось · 1 — расхождение · 2 — стенд не состоялся (слепота).
ЧЕГО НЕ ЛОВИТ: доставку ключа гостю и права файлов на боевой машине (это монтаж); поведение под нагрузкой;
режимы поставщика, которые шлюз и так не пропускает (их отказ проверяется, их содержимое — нет).
"""
import asyncio, hashlib, json, os, random, re, secrets, shutil, signal, sqlite3, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

SHLYUZ = Path(sys.argv[1] if len(sys.argv) > 1 else "/usr/local/lib/omega-shlyuz/omega-shlyuz-gostej.py").resolve()
P_UP, P_GW, P_GW_DEAD = 8397, 8398, 8399
U_UP, U_GW, U_GW_DEAD = "avr-stend-omega-kopiya", "avr-stend-omega-shlyuz", "avr-stend-omega-shlyuz-bez-sluzhby"
PY = "/opt/omega/venv/bin/python3"
EMB = ["OMEGA_EMBEDDING_MODEL=bge-m3", "OMEGA_EMBEDDING_MODEL_DIR=/var/lib/omega/.cache/omega/models/bge-m3-onnx",
       "OMEGA_EMBEDDING_DIM=1024", "OMEGA_EMBEDDING_POOLING=cls", "OMEGA_EMBEDDING_PAD_TOKEN=<pad>", "OMEGA_EMBEDDING_PAD_ID=1",
       "HF_HUB_OFFLINE=1", "OMEGA_RERANKER_AUTODOWNLOAD=0"]
# Предел памяти копии службы (19.10.2026, Вениамин 08:17 и 08:24 МСК): ЭМПИРИЧЕСКИЙ — 3/3 без OOM (memory.peak ≤ 3,456 ГиБ); ночной пик
#   19.10 > 4 ГиБ не измерен; при 6G, 19.10: 5×3,70 + 1×5,24 ·10⁹ Б (второй горб) → 7G — снова ОЦЕНКА СНИЗУ (порог снят
#   наблюдением); пересчитать по ряду ночных замеров. Пик печатается каждым прогоном (строка «ПАМЯТЬ копии»);
#   выше ZHELTOE_DOLYA предела — строка FAIL ЖЁЛТОЕ с числом и код 1: её несёт в ночной отчёт читатель обхода.
MEMORY_MAX = "7G"
ZHELTOE_DOLYA = 0.80
PIK = {}
ok = fail = slep = 0
def pas(n, d=""):
    global ok; ok += 1; print(f"{n:<66} ok {d}")
def bad(n, d=""):
    global fail; fail += 1; print(f"{n:<66} FAIL {d}")
def blind(n, d=""):
    global slep; slep += 1; print(f"{n:<66} СЛЕПОТА {d}")
def sh(*a, **k): return subprocess.run(list(a), capture_output=True, text=True, **k)
def stop(u):
    if u == U_UP:   # пик и предел копии — ДО остановки: после неё временный юнит собирается, счётчики пропадают
        cg = Path(f"/sys/fs/cgroup/system.slice/{u}.service")
        try: PIK.update(peak=int((cg / "memory.peak").read_text()), max=int((cg / "memory.max").read_text()))
        except (OSError, ValueError) as e: PIK.update(oshibka=f"{type(e).__name__}: {e}"[:120])
    sh("systemctl", "stop", u); sh("systemctl", "reset-failed", u)
def health(port, sek=90):
    for _ in range(sek):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}/health", headers={"Host": f"127.0.0.1:{port}"}), timeout=2) as r:
                if r.status == 200: return True
        except Exception: pass
        time.sleep(1)
    return False
def port_otkryt(port, sek=30):
    import socket
    for _ in range(sek * 2):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0: return True
        time.sleep(0.5)
    return False

async def mcp_call(port, key, tool, args):
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client
    async with streamablehttp_client(f"http://127.0.0.1:{port}/mcp", headers={"Authorization": f"Bearer {key}"}) as (r, w, _):
        async with ClientSession(r, w) as s:
            await s.initialize()
            if tool == "__list__":
                return sorted(t.name for t in (await s.list_tools()).tools)
            res = await s.call_tool(tool, args)
            return "".join(getattr(c, "text", "") for c in res.content)
def call(port, key, tool, args=None, sek=45):
    # 19.10.2026 (ночной обход, код 124): копия службы умерла OOM посреди посева, вызов ждал без предела до 120 с обходчика.
    #   Предел вызова — 45 с; исход — строка __ИСКЛЮЧЕНИЕ__, по ней блоки дают слепоту, а не висят.
    try: return asyncio.run(asyncio.wait_for(mcp_call(port, key, tool, args or {}), sek))
    except Exception as e: return f"__ИСКЛЮЧЕНИЕ__ {type(e).__name__}: {e}"
def http_kod(port, key):
    req = urllib.request.Request(f"http://127.0.0.1:{port}/mcp/", data=b'{"jsonrpc":"2.0","id":1,"method":"tools/list"}', method="POST",
          headers={"Host": f"127.0.0.1:{port}", "Content-Type": "application/json", "Accept": "application/json, text/event-stream",
                   **({"Authorization": f"Bearer {key}"} if key else {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as r: return r.status
    except urllib.error.HTTPError as e: return e.code
    except Exception as e: return f"{type(e).__name__}"

def imena_postavki():
    r = sh("sudo", "-u", "omega", PY, "-B", "-c", (
        "import importlib,re\nfrom omega.server import tool_schemas as ts\nimport omega.server.mcp_server as m\n"
        "src=open(m.__file__).read();a=list(ts.TOOL_SCHEMAS)\n"
        "for mo,v in re.findall(r'\\(\"(omega_platform\\.[a-z_.]+tool_schemas)\", \"([A-Z_]+)\"',src):\n"
        "  a+=list(getattr(importlib.import_module(mo),v))\n"
        "print('\\n'.join(sorted({t['name'] for t in a})))"), cwd="/")
    return set(r.stdout.split()) if r.returncode == 0 else None

def izvestnye_shlyuza(path):
    t = path.read_text(encoding="utf-8")
    m = re.search(r"IZVESTNYE = frozenset\(\{(.*?)\}\)", t, re.S)
    return set(re.findall(r'"([a-z_]+)"', m.group(1))) if m else None

# A-N-1722 r2 (условие Вениамина 05:14Z): обходчик рвёт стенд по пределу сигналом TERM — без обработчика Python умирает,
# finally не отрабатывает, временные юниты (от root) остаются, следующий прогон упирается в «юнит уже есть». TERM → SystemExit(143),
# finally гасит юниты. Против KILL — у юнитов RuntimeMaxSec=300 и CollectMode=inactive-or-failed (выгрузка и из failed).
VREMENNYJ = ["-p", "RuntimeMaxSec=300", "-p", "CollectMode=inactive-or-failed"]
# A-N-1722 r3 (рекомендация Вениамина 05:31Z): копия службы OMEGA — предел памяти 4G (пик замера 3,0 ГБ, 07.10 05:21Z) и без свопа:
# раздувшаяся копия умирает OOM в СВОЁМ юните (честный отказ стенда), а не уходит к OOM-killer машины или в общий своп рядом с живой OMEGA.

def main():
    signal.signal(signal.SIGTERM, lambda *a: sys.exit(143))
    if os.geteuid() != 0:
        print("ОТКАЗ: стенд запускается от root (sudo) — нужны sudo -u omega и systemd-run"); return 2
    if not SHLYUZ.is_file():
        blind("шлюз под проверкой", f"нет файла {SHLYUZ}"); return 2
    print(f"шлюз: {SHLYUZ} sha256 {hashlib.sha256(SHLYUZ.read_bytes()).hexdigest()[:16]}")
    # 08.10.2026 (Аврора; находка Искры, ночь 08.10): дом копии — в /run, НЕ в /var/tmp. У ночного обхода PrivateTmp=yes: его /var/tmp
    #   невидим юниту systemd-run (копия службы падала 200/CHDIR). /run (tmpfs) не в копии машины и не под сторожем покрытия; остаток
    #   после KILL исчезает при перезагрузке. Создаёт root, владелец — omega (у omega нет записи в /run).
    H = Path(tempfile.mkdtemp(prefix="avr-stend-shlyuz-", dir="/run")); shutil.chown(H, "omega", "omega")
    G = Path(tempfile.mkdtemp(prefix="avr-stend-shlyuz-gw-", dir="/run")); os.chmod(G, 0o755)
    try:
        # 0. копия службы
        for d in (".omega", ".cache/omega"): sh("sudo", "-u", "omega", "mkdir", "-p", str(H / d))
        sh("sudo", "-u", "omega", "ln", "-s", "/var/lib/omega/.cache/omega/models", str(H / ".cache/omega/models"))
        for f in ("license.json", "device.json"): sh("sudo", "-u", "omega", "cp", "-p", f"/var/lib/omega/.omega/{f}", str(H / ".omega" / f))
        r = sh("sudo", "-u", "omega", PY, "-B", "-c", f"import sqlite3;s=sqlite3.connect('file:/var/lib/omega/.omega/omega.db?mode=ro',uri=True);d=sqlite3.connect('{H}/.omega/omega.db');s.backup(d);d.close();print('ok')", cwd="/")
        if "ok" not in r.stdout: blind("копия базы", r.stderr[-200:]); return 2
        kup = secrets.token_urlsafe(32)
        (G / "upstream.env").write_text(f"OMEGA_MCP_API_KEY={kup}\n"); os.chmod(G / "upstream.env", 0o600)
        sh("sudo", "-u", "omega", "sh", "-c", f"umask 077; cat > {H}/.omega/mcp_api_key", input=kup + "\n")
        envs = sum([["-p", f"Environment={e}"] for e in [f"HOME={H}", f"OMEGA_HOME={H}/.omega", "OMEGA_TRANSPORT=http",
                    f"OMEGA_HTTP_PORT={P_UP}", "OMEGA_IDLE_TIMEOUT=0"] + EMB], [])
        r = sh("systemd-run", f"--unit={U_UP}", *VREMENNYJ, "-p", f"MemoryMax={MEMORY_MAX}", "-p", "MemorySwapMax=0", "-p", "User=omega", "-p", f"WorkingDirectory={H}", *envs, PY, "-m", "omega.server.mcp_server")
        if r.returncode != 0 or not health(P_UP): blind("копия службы поднялась", (r.stderr or "health нет")[-200:]); return 2
        pas("копия службы на копии базы поднялась", f"порт {P_UP}")
        # 1. шлюз под проверкой
        kg = secrets.token_urlsafe(32)
        (G / "klyuchi.txt").write_text(f"# стенд\n{hashlib.sha256(kg.encode()).hexdigest()} varvara\n")
        os.chmod(G / "klyuchi.txt", 0o644); shutil.copy(SHLYUZ, G / "shlyuz.py"); os.chmod(G / "shlyuz.py", 0o644)
        def gw(unit, port, up_port):
            return sh("systemd-run", f"--unit={unit}", *VREMENNYJ, "-p", "DynamicUser=yes", "-p", f"RuntimeDirectory={unit}",
                      "-p", f"EnvironmentFile={G}/upstream.env", "-p", f"Environment=SHLYUZ_UPSTREAM=http://127.0.0.1:{up_port}/mcp",
                      "-p", f"Environment=SHLYUZ_KLYUCHI={G}/klyuchi.txt", "-p", f"Environment=SHLYUZ_STATE=/run/{unit}",
                      "-p", f"Environment=SHLYUZ_PORT={port}", PY, "-B", str(G / "shlyuz.py"))
        r = gw(U_GW, P_GW, P_UP)
        if r.returncode != 0 or not port_otkryt(P_GW): blind("шлюз поднялся", (r.stderr or sh("journalctl", "-u", U_GW, "-n", "5", "--no-pager").stdout)[-300:]); return 2
        user = sh("systemctl", "show", U_GW, "-p", "MainPID", "--value").stdout.strip()
        uid = sh("ps", "-o", "user=", "-p", user).stdout.strip()
        (pas if uid not in ("omega", "root", "") else bad)("шлюз идёт не от omega и не от root", f"учётка {uid}")
        # 2. посев
        rnd = str(random.randint(10**8, 10**9)); V, C = f"VARVARA-METKA-{rnd}", f"CHUZHOE-METKA-{rnd}"
        rv = call(P_GW, kg, "omega_store", {"content": f"{V} гость пишет METKA {rnd}", "event_type": "fakt"})
        rc = call(P_UP, kup, "omega_store", {"content": f"{C} системная запись METKA {rnd}", "event_type": "fakt", "entity_id": "avrora"})
        idv, idc = (re.search(r"mem-[0-9a-f]{12}", rv) or [None])[0], (re.search(r"mem-[0-9a-f]{12}", rc) or [None])[0]
        if not idv or not idc:
            # итог юнита копии — из журнала: CollectMode=inactive-or-failed стирает Result, systemctl show дал бы «success/inactive»
            kop = [l for l in sh("journalctl", "-u", U_UP, "-n", "30", "--no-pager", "-o", "cat").stdout.splitlines() if "Failed with result" in l or "OOM" in l]
            blind("посев V (через шлюз) и C (в копию)", f"копия службы: {(kop or ['в журнале юнита отказа нет'])[-1][-80:]} · V: {rv[:120]} | C: {rc[:120]}"); return 2
        rl = call(P_UP, kup, "omega_call", {"tool": "omega_memory", "args": {"action": "link", "memory_id": idv, "target_id": idc}})
        if "Linked" not in rl: blind("связь V→C", rl[:160]); return 2
        pas("посев: V через шлюз, C в копию, связь V→C", f"{idv} {idc}")
        ent = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select json_extract(metadata,'$.entity_id') from memories where node_id='{idv}'").stdout.strip()
        (pas if ent == "varvara" else bad)("V легла в корень varvara (корень проставил шлюз, гость его не слал)", ent)
        # контроль зрячести: напрямую служба без корня C видит
        kz = call(P_UP, kup, "omega_query", {"query": f"METKA {rnd}"})
        (pas if C in kz else blind)("контроль: служба напрямую без корня видит C (прибор зряч)", f"чужих {kz.count(C)}")
        q = f"METKA {rnd}"
        def chuzh(n, t, nado_otkaz=False):
            if t.startswith("__ИСКЛЮЧЕНИЕ__"): bad(n, t[:160]); return
            if nado_otkaz:
                (pas if t.startswith("ОТКАЗ шлюза") and C not in t else bad)(n, t[:110].replace("\n", " "))
            else:
                (pas if C not in t and not t.startswith("ОТКАЗ") else bad)(n, f"чужих {t.count(C)} · своих {t.count(V)}")
        Q = [("Q1 query semantic без корня (vse_korni)", "omega_call", {"tool": "omega_query", "args": {"query": q}}, False),
             ("Q2 query semantic, корень avrora подставлен гостем", "omega_call", {"tool": "omega_query", "args": {"query": q, "entity_id": "avrora"}}, False),
             ("Q3 query phrase без корня", "omega_call", {"tool": "omega_query", "args": {"query": q, "mode": "phrase"}}, False),
             ("Q4 query phrase, корень avrora", "omega_call", {"tool": "omega_query", "args": {"query": q, "mode": "phrase", "entity_id": "avrora"}}, False),
             ("Q5 query browse → отказ", "omega_call", {"tool": "omega_query", "args": {"query": q, "mode": "browse"}}, True),
             ("Q6 query timeline → отказ", "omega_call", {"tool": "omega_query", "args": {"query": q, "mode": "timeline"}}, True),
             ("Q7 traverse от своей V → отказ", "omega_call", {"tool": "omega_memory", "args": {"action": "traverse", "memory_id": idv}}, True),
             ("Q8 similar от своей V — чужие соседи вычищены", "omega_call", {"tool": "omega_memory", "args": {"action": "similar", "memory_id": idv}}, False),
             ("Q8б similar от чужой C → отказ", "omega_call", {"tool": "omega_memory", "args": {"action": "similar", "memory_id": idc}}, True),
             ("Q9 query unified", "omega_call", {"tool": "omega_query", "args": {"query": q, "mode": "unified", "entity_id": "avrora"}}, False),
             ("Q10 welcome — свой", "omega_welcome", {"query": q}, False),
             ("Q11 правка чужой C по id → отказ", "omega_call", {"tool": "omega_memory", "args": {"action": "edit", "memory_id": idc, "new_content": "ПЕРЕПИСАНО"}}, True),
             ("Q11б удаление чужой C → отказ", "omega_call", {"tool": "omega_memory", "args": {"action": "delete", "memory_id": idc}}, True),
             ("З1 omega_call → omega_entity_list → отказ", "omega_call", {"tool": "omega_entity_list", "args": {}}, True),
             ("З2 прямой omega_query (не мета) → отказ", "omega_query", {"query": q}, True),
             ("З3 omega_store с items → отказ", "omega_store", {"items": [{"content": "x", "entity_id": "avrora"}]}, True),
             ("З4 omega_store с derived_from (связь в чужое) → отказ", "omega_store", {"content": "y", "derived_from": idc}, True),
             ("З5 omega_query с незнакомым аргументом → отказ", "omega_call", {"tool": "omega_query", "args": {"query": q, "project": "x"}}, True)]
        vyvod = {}
        for n, tool, a, nado in Q:
            t = call(P_GW, kg, tool, a); vyvod[n] = t; chuzh(n, t, nado)
        sup = call(P_UP, kup, "omega_call", {"tool": "omega_memory", "args": {"action": "similar", "memory_id": idv}})
        (pas if idc[:12] in sup else blind)("Q8 контроль: служба напрямую в similar от V отдаёт C (есть что вычищать)", f"C в ответе службы: {idc[:12] in sup}")
        ub = re.search(r"убрано чужих похожих записей — (\d+)", vyvod["Q8 similar от своей V — чужие соседи вычищены"])
        (pas if ub and int(ub.group(1)) >= 1 else bad)("Q8 шлюз назвал число вычищенных чужих соседей", ub.group(0) if ub else "строки нет")
        (pas if V in vyvod["Q8 similar от своей V — чужие соседи вычищены"] or idv[:12] in vyvod["Q8 similar от своей V — чужие соседи вычищены"] else bad)(
            "Q8 similar: своя запись в ответе есть (подтверждение «легло» живо)", vyvod["Q8 similar от своей V — чужие соседи вычищены"][:90].replace("\n", " "))
        rs = call(P_GW, kg, "omega_store", {"content": f"Z-{rnd} гость пытается в чужой корень", "event_type": "fakt", "entity_id": "avrora"})
        mz = re.search(r"mem-[0-9a-f]{12}", rs)
        ez = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select json_extract(metadata,'$.entity_id') from memories where node_id='{mz.group(0) if mz else ''}'").stdout.strip()
        (pas if ez == "varvara" else bad)("З6 store с entity_id=avrora легла в varvara (корень переписан)", ez or rs[:100])
        # 2б. B-N-1644: метка «для гостей» (filter_tags) и снятие своей записи (supersede)
        TEG = "dlya-gostej"
        VT, VN = f"VTEG-{rnd}", f"VNOTEG-{rnd}"
        rt = call(P_GW, kg, "omega_store", {"content": f"{VT} сведение для гостей METKA {rnd}", "event_type": "fakt", "metadata": {"dostupnost": "можно гостям"}})
        rn = call(P_GW, kg, "omega_store", {"content": f"{VN} служебное без метки METKA {rnd}", "event_type": "fakt"})
        rct = call(P_UP, kup, "omega_store", {"content": f"{C}-TEG чужая с меткой METKA {rnd}", "event_type": "fakt", "entity_id": "avrora", "metadata": {"tags": [TEG]}})
        idt, idn = (re.search(r"mem-[0-9a-f]{12}", rt) or [None])[0], (re.search(r"mem-[0-9a-f]{12}", rn) or [None])[0]
        if not idt or not idn or "mem-" not in rct: blind("посев T1: VT (метка), VN (без), чужая C с меткой", f"{rt[:80]} | {rn[:80]} | {rct[:80]}")
        else:
            tg = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select json_extract(metadata,'$.tags') from memories where node_id='{idt}'").stdout.strip()
            (pas if TEG in tg else bad)("T0 метка VT легла в metadata.tags через шлюз", tg[:80])
            kn = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20}})
            (pas if VN in kn else blind)("T контроль: без filter_tags VN (без метки) видна — прибор зряч", f"VN {kn.count(VN)}")
            t1 = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            (pas if VT in t1 and VN not in t1 and C not in t1 else bad)("T1 filter_tags: только своя помеченная (VN и чужая C с меткой — нет)",
                f"VT {t1.count(VT)} · VN {t1.count(VN)} · C {t1.count(C)}")
            t2 = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "entity_id": "avrora"}})
            (pas if C not in t2 and VT in t2 else bad)("T2 filter_tags + корень avrora от гостя — корень свой", f"C {t2.count(C)} · VT {t2.count(VT)}")
            t3 = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "filter_tags": TEG}})
            (pas if t3.startswith("ОТКАЗ шлюза") else bad)("T3 filter_tags не списком → отказ", t3[:90])
            # B-N-1644 r2 (замер Вениамина): ДРУГОЙ агент с прямым ключом службы пишет в корень varvara запись с меткой — мимо шлюза.
            PB = f"PODBROS-{rnd}"
            rpb = call(P_UP, kup, "omega_store", {"content": f"{PB} подброшенное сведение METKA {rnd}", "event_type": "fakt", "entity_id": "varvara", "metadata": {"tags": [TEG]}})
            idpb = (re.search(r"mem-[0-9a-f]{12}", rpb) or [None])[0]
            epb = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select json_extract(metadata,'$.entity_id')||'|'||json_extract(metadata,'$.tags') from memories where node_id='{idpb}'").stdout.strip()
            (pas if idpb and epb.startswith("varvara|") and TEG in epb else blind)("T4 контроль: служба напрямую приняла запись в корень varvara с меткой (подброс возможен)", epb[:80])
            t5 = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            (pas if PB not in t5 and VT in t5 else bad)("T5 поиск гостя по метке: подброс мимо шлюза НЕ виден, своя помеченная видна", f"подброс {t5.count(PB)} · VT {t5.count(VT)}")
            (pas if "Active Constraints" not in t5 else bad)("T6 поиск гостя по метке: хвост «Active Constraints» отрезан шлюзом", "хвост есть" if "Active Constraints" in t5 else "")
            # T8: своя помеченная запись длиннее 200 знаков (превью OMEGA с «...») — гостю видна (сумма превью считается как у OMEGA).
            DL = f"VDLINNAYA-{rnd}"
            call(P_GW, kg, "omega_store", {"content": f"{DL} METKA {rnd} " + "длинное сведение для гостей " * 15, "event_type": "fakt", "metadata": {"dostupnost": "можно гостям"}})
            t8 = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            (pas if DL in t8 else bad)("T8 своя помеченная длиннее 200 знаков — видна гостю (сумма превью с «...» совпала)", f"DL {t8.count(DL)}")
            # R1–R3 (B-N-1644 r3, рабочий режим): бессрочность, словесная пометка → тег, связь своих.
            R1 = f"VBEZTIPA-{rnd}"
            r1 = call(P_GW, kg, "omega_store", {"content": f"{R1} запись без типа METKA {rnd}"})
            idr1 = (re.search(r"mem-[0-9a-f]{12}", r1) or [None])[0]
            st1 = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select json_extract(metadata,'$.event_type')||'|'||coalesce(ttl_seconds,'вечно')||'|'||coalesce(json_extract(metadata,'$.tip_iskhodnyj'),'-') from memories where node_id='{idr1}'").stdout.strip()
            (pas if st1 == "fakt|вечно|memory" else bad)("R1 запись без типа — fakt, бессрочно, исходный тип сохранён", st1)
            R2 = f"VSLOVO-{rnd}"
            r2 = call(P_GW, kg, "omega_store", {"content": f"{R2} пометка словом METKA {rnd}", "metadata": {"dostupnost": "можно гостям"}})
            idr2 = (re.search(r"mem-[0-9a-f]{12}", r2) or [None])[0]
            tg2 = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select json_extract(metadata,'$.tags')||'|'||coalesce(ttl_seconds,'вечно') from memories where node_id='{idr2}'").stdout.strip()
            t9 = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            (pas if TEG in tg2 and tg2.endswith("|вечно") and R2 in t9 else bad)("R2 словесная пометка «можно гостям» → тег dlya-gostej, бессрочно, видна в поиске гостя", f"{tg2[:70]} · в поиске {t9.count(R2)}")
            # G1–G4 (B-N-1847, 08.10, Заря): гостю — ТОЛЬКО записи с явным полем dostupnost (значение целиком). Метка dlya-gostej в tags
            # без поля — не довод: OMEGA сама кладёт в tags слова текста (auto_capture), так ушла гостю mem-2efaa8c76cb9 (урок, метки
            # «dlya-gostej» и «dostupnost», поля нет). Контроли: запись легла в список своих (иначе основа тоже не отдала бы — проба слепа).
            def svoj_stroka(mid):
                for d in (f"/run/{U_GW}", f"/run/private/{U_GW}"):
                    try: return next((l for l in open(f"{d}/varvara.ids", encoding="utf-8").read().splitlines() if l.startswith(mid or "-")), None)
                    except OSError: pass
                return None
            def gst(): return call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            G1 = f"VTOLKOMETKA-{rnd}"
            ig1 = (re.search(r"mem-[0-9a-f]{12}", call(P_GW, kg, "omega_store", {"content": f"{G1} метка без поля METKA {rnd}", "event_type": "fakt", "metadata": {"tags": [TEG]}})) or [None])[0]
            G2 = f"VUPOMINANIE-{rnd}"
            ig2 = (re.search(r"mem-[0-9a-f]{12}", call(P_GW, kg, "omega_store", {"content": f"{G2} урок: гостевая пометка `dlya-gostej` ставится полем `dostupnost` при записи, METKA {rnd}", "event_type": "lesson_learned"})) or [None])[0]
            G3 = f"VVNUTRENNEE-{rnd}"
            ig3 = (re.search(r"mem-[0-9a-f]{12}", call(P_GW, kg, "omega_store", {"content": f"{G3} внутреннее сведение METKA {rnd}", "event_type": "fakt", "metadata": {"dostupnost": "внутреннее; для гостей — только по слову Марка или владельца"}})) or [None])[0]
            tg_g2 = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select coalesce(json_extract(metadata,'$.tags'),'[]')||'|'||coalesce(json_extract(metadata,'$.dostupnost'),'-') from memories where node_id='{ig2}'").stdout.strip()
            tg_g1 = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select coalesce(json_extract(metadata,'$.tags'),'[]') from memories where node_id='{ig1}'").stdout.strip()
            s1_, s2_, s3_, sr2 = svoj_stroka(ig1), svoj_stroka(ig2), svoj_stroka(ig3), svoj_stroka(idr2)
            (pas if s1_ and s2_ and s3_ and TEG in tg_g1 and '"dlya-gostej"' in tg_g2 and '"dostupnost"' in tg_g2 and tg_g2.endswith("|-") else blind)(
                "G контроль: G1 (метка), G2 (урок со словами) легли своими; у G2 OMEGA сама поставила метки dlya-gostej и dostupnost, поля нет",
                f"своих {bool(s1_)}/{bool(s2_)}/{bool(s3_)} · G2 {tg_g2[-60:]}")
            tgo = gst()
            (pas if G1 not in tgo else bad)("G1 своя с меткой dlya-gostej в tags, без поля dostupnost — гостю НЕ отдаётся", f"G1 {tgo.count(G1)}")
            (pas if G2 not in tgo else bad)("G2 урок, лишь УПОМИНАЮЩИЙ dlya-gostej/dostupnost (метки от OMEGA, поля нет) — гостю НЕ отдаётся", f"G2 {tgo.count(G2)}")
            (pas if G3 not in tgo else bad)("G3 dostupnost «внутреннее; для гостей — только по слову…» (подстрока, не целиком) — НЕ отдаётся", f"G3 {tgo.count(G3)}")
            (pas if sr2 and sr2.split()[2:] == ["gostyam"] and s1_ and s2_ and s3_ and "gostyam" not in (s1_ + s2_ + s3_) and R2 in tgo else bad)(
                "G4 признак gostyam в списке своих — у R2 (поле «можно гостям») есть и она видна; у G1–G3 нет", f"R2: {(sr2 or '-')[-10:]} · видна {tgo.count(R2)}")
            l1 = call(P_GW, kg, "omega_call", {"tool": "omega_memory", "args": {"action": "link", "memory_id": idr2, "target_id": idr1, "edge_type": "related"}})
            (pas if "Linked" in l1 else bad)("R3 link своей со своей — связано", l1[:80].replace(chr(10), " "))
            l2 = call(P_GW, kg, "omega_call", {"tool": "omega_memory", "args": {"action": "link", "memory_id": idr2, "target_id": idc}})
            l3 = call(P_GW, kg, "omega_call", {"tool": "omega_memory", "args": {"action": "link", "memory_id": idc, "target_id": idr2}})
            (pas if l2.startswith("ОТКАЗ шлюза") and l3.startswith("ОТКАЗ шлюза") else bad)("R3б link со чужой (в обе стороны) — отказ", f"{l2[:50]} | {l3[:50]}")
            # R4: помеченное гостям с эволюционным типом (decision) — пишется РОВНО fakt.
            r4 = call(P_GW, kg, "omega_store", {"content": f"VDECISION-{rnd} решение для гостей METKA {rnd}", "event_type": "decision", "metadata": {"tags": [TEG]}})
            idr4 = (re.search(r"mem-[0-9a-f]{12}", r4) or [None])[0]
            st4 = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select json_extract(metadata,'$.event_type')||'|'||coalesce(json_extract(metadata,'$.tip_iskhodnyj'),'-') from memories where node_id='{idr4}'").stdout.strip()
            (pas if st4 == "fakt|decision" else bad)("R4 помеченное с типом decision — записано fakt, исходный сохранён", st4)
            # R5: перезапись того же текста. Живая запись — OMEGA вернёт СТАРУЮ (склейка по тексту) без метки; после supersede старой — новая с меткой.
            Y = f"VPEREZAPIS-{rnd} сведение METKA {rnd}"
            y1 = (re.search(r"mem-[0-9a-f]{12}", call(P_GW, kg, "omega_store", {"content": Y, "event_type": "fakt"})) or [None])[0]
            y2 = (re.search(r"mem-[0-9a-f]{12}", call(P_GW, kg, "omega_store", {"content": Y, "metadata": {"dostupnost": "можно гостям"}})) or [None])[0]
            ty2 = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            (pas if y1 and y2 == y1 and f"VPEREZAPIS-{rnd}" not in ty2 else bad)("R5 ловушка: тот же текст поверх живой записи — OMEGA вернула старую, метки нет, гостю не видна", f"y1 {y1} · y2 {y2} · в поиске {ty2.count(f'VPEREZAPIS-{rnd}')}")
            sy = call(P_GW, kg, "omega_call", {"tool": "omega_memory", "args": {"action": "supersede", "memory_id": y1, "reason": "перезапись с меткой"}})
            y3 = (re.search(r"mem-[0-9a-f]{12}", call(P_GW, kg, "omega_store", {"content": Y, "metadata": {"dostupnost": "можно гостям"}})) or [None])[0]
            ty3 = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            (pas if not sy.startswith("ОТКАЗ") and y3 and y3 != y1 and f"VPEREZAPIS-{rnd}" in ty3 else bad)("R5б порядок «сначала supersede старой, потом запись» — новая запись с меткой, гостю видна", f"y3 {y3} · в поиске {ty3.count(f'VPEREZAPIS-{rnd}')}")
            # R6 (З1): тот же текст в другом регистре/с лишними пробелами — OMEGA склеивает (canonical_hash); шлюз НЕ переписывает сумму,
            # своя помеченная остаётся видна гостю, Варвара получает «не записано … сначала supersede».
            Z = f"Vsklejka-{rnd} сведение для гостей METKA {rnd}"
            z1 = (re.search(r"mem-[0-9a-f]{12}", call(P_GW, kg, "omega_store", {"content": Z, "metadata": {"dostupnost": "можно гостям"}})) or [None])[0]
            rz = call(P_GW, kg, "omega_store", {"content": "  " + Z.upper().replace(" ", "   ") + "  ", "metadata": {"dostupnost": "можно гостям"}})
            tz = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            (pas if z1 and z1 in rz and "не записано" in rz and f"Vsklejka-{rnd}" in tz else bad)("R6 склейка того же текста — сумма не переписана, своя видна гостю, ответ «не записано … supersede»",
                f"{rz[:60]!r} · видна {tz.count(f'Vsklejka-{rnd}')}")
            # R7 (З1): подброс через склейку — чужой агент кладёт текст с меткой в корень varvara, Варвара пишет тот же текст:
            # склейка вернёт ЧУЖОЙ id; шлюз не делает его своим — гостю не виден.
            PX = f"PODBROS2-{rnd} сведение METKA {rnd}"
            call(P_UP, kup, "omega_store", {"content": PX, "event_type": "fakt", "entity_id": "varvara", "metadata": {"tags": [TEG]}})
            rpx = call(P_GW, kg, "omega_store", {"content": PX, "metadata": {"tags": [TEG]}})
            tpx = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            (pas if "не записано" in rpx and f"PODBROS2-{rnd}" not in tpx else bad)("R7 подброс через склейку не становится своим — гостю не виден", f"{rpx[:50]!r} · виден {tpx.count(f'PODBROS2-{rnd}')}")
            # T7: правка ТЕКСТА своей помеченной записи по id чужим прямым ключом — запись гостю больше не отдаётся.
            ed = call(P_UP, kup, "omega_call", {"tool": "omega_memory", "args": {"action": "edit", "memory_id": idt, "new_content": f"{VT} ПОДМЕНА-{rnd} METKA {rnd}"}})
            t7 = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            (pas if "Updated memory" in ed and f"ПОДМЕНА-{rnd}" not in t7 and VT not in t7 and DL in t7 else bad)(
                "T7 подмена текста своей помеченной записи прямым ключом — гостю не отдаётся (прочие свои — да)", f"правка: {ed[:30]!r} · подмена {t7.count(f'ПОДМЕНА-{rnd}')} · DL {t7.count(DL)}")
            s2 = call(P_GW, kg, "omega_call", {"tool": "omega_memory", "args": {"action": "supersede", "memory_id": idc, "reason": "x"}})
            stc = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select status from memories where node_id='{idc}'").stdout.strip()
            (pas if s2.startswith("ОТКАЗ шлюза") and stc == "active" else bad)("S2 supersede чужой C → отказ, C действует", f"{s2[:70]} · статус C {stc}")
            s3 = call(P_GW, kg, "omega_call", {"tool": "omega_memory", "args": {"action": "supersede", "memory_id": idn, "target_id": idc}})
            (pas if s3.startswith("ОТКАЗ шлюза") else bad)("S3 supersede своей с заменой на чужую C → отказ", s3[:90])
            s4 = call(P_GW, kg, "omega_call", {"tool": "omega_memory", "args": {"action": "edit", "memory_id": idt, "new_content": "ПЕРЕПИСАНО"}})
            (pas if s4.startswith("ОТКАЗ шлюза") else bad)("S4 edit своей записи → по-прежнему отказ", s4[:90])
            s1 = call(P_GW, kg, "omega_call", {"tool": "omega_memory", "args": {"action": "supersede", "memory_id": idt, "reason": "снять пометку"}})
            stt = sh("sudo", "-u", "omega", "sqlite3", f"{H}/.omega/omega.db", f"select status from memories where node_id='{idt}'").stdout.strip()
            t4 = call(P_GW, kg, "omega_call", {"tool": "omega_query", "args": {"query": q, "limit": 20, "filter_tags": [TEG], "status": "active"}})
            (pas if not s1.startswith("ОТКАЗ") and stt == "superseded" and VT not in t4 else bad)("S1 supersede своей VT → снята, в поиске гостя её нет",
                f"{s1[:60].replace(chr(10), ' ')} · статус {stt} · VT в поиске {t4.count(VT)}")
        # 3. допуск
        (pas if http_kod(P_GW, None) == 401 else bad)("А1 без ключа → 401", str(http_kod(P_GW, None)))
        (pas if http_kod(P_GW, "ne-tot") == 401 else bad)("А2 чужой ключ → 401", str(http_kod(P_GW, "ne-tot")))
        (pas if http_kod(P_GW, kup) == 401 else bad)("А3 боевой ключ службы шлюзу не ключ → 401", str(http_kod(P_GW, kup)))
        spisok = call(P_GW, kg, "__list__")
        (pas if spisok == sorted(["omega_call", "omega_protocol", "omega_store", "omega_tools", "omega_welcome"]) else bad)("А4 tools/list шлюза — ровно 5 мета-инструментов", str(spisok))
        # 4. сбой службы → отказ
        r = gw(U_GW_DEAD, P_GW_DEAD, 8396)
        if port_otkryt(P_GW_DEAD):
            t = call(P_GW_DEAD, kg, "omega_call", {"tool": "omega_query", "args": {"query": q}})
            (pas if t.startswith("ОТКАЗ шлюза") else bad)("С1 служба не отвечает → ОТКАЗ, не проход", t[:110])
        else: blind("С1 шлюз без службы поднялся", "")
        # 5. перечень поставки против шлюза
        zhiv, izv = imena_postavki(), izvestnye_shlyuza(SHLYUZ)
        if zhiv is None or izv is None: blind("П1 перечень поставки / шлюза", "не снят")
        else:
            novye, ushli = sorted(zhiv - izv), sorted(izv - zhiv)
            (pas if not novye else bad)(f"П1 все {len(zhiv)} инструментов поставки известны шлюзу", f"НОВЫЕ: {novye}" if novye else "")
            print(f"   (сведения: в перечне шлюза, но нет в поставке: {ushli or 'нет'})")
    finally:
        for u in (U_GW_DEAD, U_GW, U_UP): stop(u)
        sh("rm", "-rf", "--", str(H)); shutil.rmtree(G, ignore_errors=True)
        ost = [p for p in (H, G) if p.exists()]
        print(f"   уборка: юниты погашены по имени, дом с копией лицензии и база удалены: {'да' if not ost else 'НЕТ ' + str(ost)}")
        # A-N-1722: каталог состояния шлюзов — RuntimeDirectory, systemd убирает его при остановке; StateDirectory
        # оставался в /var/lib и красил сторож покрытия копии. Остаток после остановки — дефект стенда, FAIL.
        sled = [p for u in (U_GW, U_GW_DEAD) for p in (f"/var/lib/{u}", f"/var/lib/private/{u}", f"/run/{u}", f"/run/private/{u}")
                if os.path.lexists(p)]
        (pas if not sled else bad)("У1 после стенда каталогов состояния шлюзов нет", "; ".join(sled))
        if "peak" in PIK:
            dolya = PIK["peak"] / PIK["max"]
            PIK["tekst"] = f"memory.peak={PIK['peak']} Б ({PIK['peak'] / 2**30:.3f} ГиБ) = {dolya:.0%} предела MemoryMax={MEMORY_MAX}"
            if dolya > ZHELTOE_DOLYA: bad("ПАМЯТЬ копии службы", f"ЖЁЛТОЕ · {PIK['tekst']} > {ZHELTOE_DOLYA:.0%} — поднять предел по ряду замеров")
            else: pas("ПАМЯТЬ копии службы", PIK["tekst"])
        else:
            PIK["tekst"] = f"memory.peak не снят ({PIK.get('oshibka', 'юнит копии уже собран')})"
            blind("ПАМЯТЬ копии службы", PIK["tekst"])
    print("-" * 70); print(f"сошлось: {ok}   FAIL: {fail}   ПРОПУЩЕНО: {slep}   ПАМЯТЬ копии: {PIK.get('tekst', '—')}")
    return 2 if slep else (1 if fail else 0)

if __name__ == "__main__":
    sys.exit(main())
