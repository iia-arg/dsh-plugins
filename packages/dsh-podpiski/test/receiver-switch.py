#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Стенд /switch-1 /switch-a /switch-2 /switch-b (слово владельца 03.10 20:30 и 20:55 МСК, наряды Забавы 17:30Z/17:56Z, Искра)
# и выключателя чата сайта /sss /sss_on (B-N-1499, слово владельца 21:10 МСК): файл-состояние — во временном каталоге стенда.
# Пара команд на семейство: 1/2 — без проверок (мёртвая цель → всё равно переключено), a/b — с проверкой живости цели
# (живая → переключено, мёртвая/неизвестная → ОТКАЗ без изменений); каждая — в обе стороны.
# Цепочка целиком на подставных: подставной Telegram (HTTP на 127.0.0.1) → приёмник (main, отдельный процесс)
# → подставной systemctl-в-роли-юнита → исполнитель sadik-switch-exec → НАСТОЯЩИЕ переключатели в режиме стенда
# (Claude: SWITCH_STEND=1; Codex: PK_STEND=1, подставные шлюзы по образцу тестов Гаммы B-N-1438) → итог → ответ владельцу. Боевой юнит не зовётся: приёмник проверяется на
# подмены ДО запуска; в PATH процессов цепочки первыми стоят подставные systemctl/sudo, которые только пишут
# «ОПАСНО» и отказывают — так даже забытая подмена не дойдёт до боевых шлюзов.
# ⚠️ НЕ ЛОВИТ: настоящий sudoers и юниты sadik-switch@*, настоящие источники живости (aclaude limity, codex-limit-watch) —
#   здесь их ответы подставные; это живая проба после монтажа.
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
import json, os, runpy, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

PR = os.environ.get("PRIYOMNIK_BIN", str(ROOT / "sbin/sadik-komandy-priyomnik"))
EX = os.environ.get("EXEC_BIN", str(ROOT / "libexec/sadik-switch-exec"))
SW = os.environ.get("SWITCH_BIN", str(ROOT / "sbin/pereklyuchatel-podpiski"))
CXP = os.environ.get("CODEX_BIN", str(ROOT / "sbin/pereklyuchatel-codex"))
for f in (PR, EX, SW, CXP):
    if not os.access(f, os.R_OK):
        print("СЛЕПОТА: нет", f); sys.exit(2)
rab = tempfile.mkdtemp(prefix="stend-switch-1-")
BIN, ED, LIM, ST, IT = (os.path.join(rab, x) for x in ("bin", "etc", "lim", "state", "itog"))
for d in (BIN, ED, LIM, ST, IT):
    os.makedirs(d)
ok = fail = 0
OWNER = 712345678


def w(path, s, mode=0o644):
    open(path, "w").write(s); os.chmod(path, mode)


def sud(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1; print("  ✅", label)
    else:
        fail += 1; print("  🔴", label, "—", detail)


def rd(path):
    return open(path).read() if os.path.exists(path) else ""


# ── сторожа в PATH: боевые имена, которые НЕ должны звучать ──
w(f"{BIN}/systemctl", f'#!/bin/sh\necho "ОПАСНО systemctl $*" >> "{ST}/opasno"\nexit 99\n', 0o755)
# sudo: переключатель снимает страховку и правит настройку шлюза (`sudo cp -p`, `sudo sed -i`). Пропускаем ТОЛЬКО cp/sed, все пути которых внутри
# каталога стенда; любое иное — «ОПАСНО» и отказ.
# B-N-1500 хвост (03.10.2026, Михалыч): с B-N-1498 переключатель кладёт страховки в каталог прогона и ротирует их —
# `sudo install -d`, `sudo find`, `sudo rm -rf`. Пропускаем их ТЕМ ЖЕ условием: все пути — внутри каталога стенда.
# Каталог страховок подменён ниже (SWITCH_BAK_DIR); без подмены install/find уходят в /var/backups/montazh → «ОПАСНО».
w(f"{BIN}/sudo",
  "#!/usr/bin/env python3\nimport os,sys\n"
  f"RAB={rab!r}; ST={ST!r}\n"
  "a=sys.argv[1:]; a=a[1:] if a[:1]==['-n'] else a\n"
  "puti=[x for x in a[1:] if x.startswith('/')]\n"
  "if a[:1] in (['cp'],['sed'],['install'],['find'],['rm']) and puti and all(os.path.realpath(x).startswith(RAB+'/') for x in puti):\n"
  "    os.execvp(a[0],a)\n"
  "open(ST+'/opasno','a').write('ОПАСНО sudo '+' '.join(sys.argv[1:])+'\\n'); sys.exit(99)\n", 0o755)
PATH = f"{BIN}:{os.environ.get('PATH', '/usr/bin:/bin')}"
# B-N-1621: помощник доступа к токенам — самописец: пишет доводы, отвечает «готово» (код 0). ACL и порядок
# «выдать ДО restart» проверяют стенды переключателей и помощника; здесь — что цепочка бота его зовёт.
w(f"{BIN}/svesti",
  "#!/usr/bin/env python3\nimport sys\n"
  f"open({rab!r}+'/svesti.log','a').write(' '.join(sys.argv[1:])+'\\n')\n", 0o755)

# ── подставные шлюзы для настоящего переключателя (как в stend-priyomnik-itog.py) ──
w(f"{BIN}/live", f'#!/usr/bin/env python3\nimport sys,os\nf="{ST}/live-"+sys.argv[1]\nprint(open(f).read().strip() if os.path.exists(f) else "")\n', 0o755)
w(f"{BIN}/hodil", '#!/bin/sh\necho ходил\n', 0o755)
w(f"{BIN}/turn", '#!/bin/sh\necho "pid=1 start=1 end=1 poslednee=turn/end zhurnal=est"\n', 0o755)
# живость цели Claude — подставной читатель лимитов aclaude: состояние из файла (free / blocked / иное = unknown)
w(f"{BIN}/limity", f'#!/bin/sh\ns=$(cat "{ST}/limity" 2>/dev/null)\ncase "$s" in\n free) printf "free\\tподставной: свободна\\n"; exit 0;;\n blocked) printf "blocked\\tподставной: лимит выбран\\n"; exit 10;;\n *) printf "unknown\\tподставной: замера нет\\n"; exit 20;;\nesac\n', 0o755)
w(f"{BIN}/sysctl_gw",
  "#!/usr/bin/env python3\nimport sys,os,re\na=sys.argv[1:]\n"
  f"ST={ST!r}; ED={ED!r}\n"
  "if a[:1]==['list-units']: print(open(ST+'/units').read()); sys.exit(0)\n"
  "if 'show' in a: print('1000'); sys.exit(0)\n"
  "if a[:1]==['is-active']: print('active'); sys.exit(0)\n"
  "if a[:1]==['restart']:\n"
  "    ag=a[1].split('@')[1].split('.')[0]\n"
  "    m=re.search(r'token-podpiska-([123])',open(ED+'/instance-'+ag+'.env').read())\n"   # 07.10: и подписка 3 (круг 1→2→3→1)
  "    if m: open(ST+'/live-'+ag,'w').write(m.group(1))\n"
  "sys.exit(0)\n", 0o755)
w(f"{ED}/token-podpiska-1", ""); w(f"{ED}/token-podpiska-2", ""); w(f"{ED}/token-podpiska-3", "")


def rasklad(n):
    for a in ("iskra", "zarya"):
        w(f"{ED}/instance-{a}.env", f"GATEWAY_TOKEN_FILE={ED}/token-podpiska-{n}\nDUMMY=x\n")
        w(f"{ST}/live-{a}", n + "\n")
    w(f"{ST}/units", "claude-oauth-gateway@iskra.service\nclaude-oauth-gateway@zarya.service\n")


def zhivye():
    return {a: rd(f"{ST}/live-{a}").strip() for a in ("iskra", "zarya")}


ENV_SW = {"SWITCH_STEND": "1", "SWITCH_LIMITY_READER": f"{BIN}/limity", "SWITCH_TURN_CMD": f"{BIN}/turn",
          "SWITCH_TURN_WAIT": "2", "SWITCH_TURN_POLL": "1", "SWITCH_TURN_PROBE": "1", "SWITCH_ENV_DIR": ED,
          "SWITCH_SYSTEMCTL": f"{BIN}/sysctl_gw", "SWITCH_LIMIT_DIR": LIM, "SWITCH_ALERT": "/bin/true",
          "SWITCH_LIVE_TOKEN_CMD": f"{BIN}/live", "SWITCH_HOD_CMD": f"{BIN}/hodil",
          "SWITCH_OTMETKA": f"{ST}/otm", "SWITCH_ITOG_FILE": f"{ST}/sw-itog", "SWITCH_MIN_INTERVAL": "0",
          "SWITCH_SLEEP": "0", "SWITCH_BAK_DIR": f"{rab}/bak", "SWITCH_SVESTI": f"{BIN}/svesti", "SWITCH_REGISTRY": f"{BIN}/reestr"}  # 07.10: реестр — подставной, все общие   # B-N-1500 хвост: страховки переключателя — в стенд
# 07.10 (своя подписка по реестру): подставной agent-registry — «pole <a> podpiska --json» → общая у всех агентов стенда
w(f"{BIN}/reestr", '#!/bin/sh\n[ "$1" = pole ] && [ "$3" = podpiska ] || exit 9\necho \'"obshchaya-claude"\'\n', 0o755)
# переключатель для исполнителя: пишет свои аргументы и зовёт НАСТОЯЩИЙ $SW в окружении стенда
w(f"{BIN}/claude",
  "#!/usr/bin/env python3\nimport sys,os,subprocess\n"
  f"open({ST!r}+'/claude-args','a').write(' '.join(sys.argv[1:]) or '-')\n"
  f"open({ST!r}+'/claude-args','a').write('\\n')\n"
  f"e=dict(os.environ); e.update({ENV_SW!r})\n"
  f"sys.exit(subprocess.run([{SW!r},*sys.argv[1:]],env=e).returncode)\n", 0o755)
# ── Codex: подставные шлюзы one/two, носители p3/p4, /proc, systemctl/runuser/journalctl (образец test-codex.py Гаммы)
import base64, pwd
CX = os.path.join(rab, "cx"); CXBIN = os.path.join(CX, "bin")
for n in ("bin", "proc", "p3/polnyj", "p4/polnyj", "one", "two"):
    os.makedirs(os.path.join(CX, n))
_enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
for n in ("3", "4"):
    _d = {"tokens": {"access_token": "x." + _enc({"exp": time.time() + 7200}) + ".x", "refresh_token": "", "account_id": "stend" + n}}
    for _p in (f"{CX}/p{n}/auth.json", f"{CX}/p{n}/polnyj/auth.json"):
        w(_p, json.dumps(_d))
w(f"{CXBIN}/systemctl", "#!/usr/bin/env python3\nimport sys\nx=sys.argv\nif 'MainPID' in x:\n print('101' if 'one.service' in x else '102'); sys.exit(0)\n"
  f"print('LoadState=loaded\\nUser={pwd.getpwuid(os.getuid()).pw_name}\\nGroup=\\nSupplementaryGroups=')\n", 0o755)
w(f"{CXBIN}/runuser", '#!/usr/bin/env python3\nimport os,sys\na=sys.argv[sys.argv.index("--")+1:];os.execvp(a[0],a)\n', 0o755)
w(f"{CXBIN}/journalctl", "#!/usr/bin/env python3\nimport json\n"
  f"for line in open({CX + '/limits'!r}).read().splitlines():\n print(json.dumps({{'MESSAGE':line,'_SYSTEMD_INVOCATION_ID':'stend','_TRANSPORT':'stdout'}}))\n", 0o755)


def cx_state(n):
    for name, pid in (("one", 101), ("two", 102)):
        d = f"{CX}/{name}"; link = f"{d}/auth.json"
        if os.path.lexists(link):
            os.unlink(link)
        os.symlink(f"{CX}/p{n}/auth.json", link)
        pr = f"{CX}/proc/{pid}"; os.makedirs(pr, exist_ok=True)
        open(f"{pr}/environ", "wb").write(b"CODEX_HOME=" + d.encode() + b"\0")
        w(f"{pr}/stat", f"{pid} (stend gateway) S " + " ".join(["0"] * 18 + ["999"] + ["0"] * 5))


def cx_limits(cel, rezhim):
    """живость цели Codex — замер сторожа: zhiva (свежий, 10%), ischerpan (100%), net (замера нет)."""
    if rezhim == "net":
        w(f"{CX}/limits", ""); return
    used = 100 if rezhim == "ischerpan" else 10
    d = {"subscription": cel, "at": time.time(), "ordinaryUsageAllowed": True, "spendControlReached": False, "limitIds": ["codex"],
         "primary": {"usedPercent": used, "windowDurationMins": 10080, "resetsAt": time.time() + 3600}, "secondary": None}
    w(f"{CX}/limits", "RATE_LIMITS " + json.dumps(d))


def cx_nums():
    return [os.readlink(f"{CX}/{n}/auth.json").split("/p")[-1].split("/")[0] for n in ("one", "two")]


ENV_CX = {"PK_STEND": "1", "PK_KATALOG": f"{CX}/p{{n}}", "PK_DOMA": f"{CX}/one:one.service {CX}/two:two.service",
          "PK_ZAMOK": f"{CX}/lock", "PK_ALERT": "/bin/false", "PK_PROC_ROOT": f"{CX}/proc",
          "PK_SVESTI": f"{BIN}/svesti"}
w(f"{BIN}/codex",
  "#!/usr/bin/env python3\nimport sys,os,subprocess\n"
  f"open({ST!r}+'/codex-args','a').write(' '.join(sys.argv[1:])+'\\n')\n"
  f"e=dict(os.environ); e.update({ENV_CX!r}); e['PATH']={CXBIN!r}+':'+e.get('PATH','')\n"
  f"sys.exit(subprocess.run([sys.executable,{CXP!r},*sys.argv[1:]],env=e).returncode)\n", 0o755)
SAJT = os.path.join(rab, "sajt"); os.makedirs(SAJT)
ENV_EX = {"SADIK_STEND": "1", "SADIK_EXEC_CLAUDE": f"{BIN}/claude", "SADIK_EXEC_CODEX": f"{BIN}/codex",
          "SADIK_EXEC_RESULT": IT, "SADIK_EXEC_LOCK": f"{ST}/lock", "SADIK_EXEC_SAJT_STATE": f"{SAJT}/zakryto"}
# systemctl-в-роли-юнита для приёмника: `start --wait sadik-switch@X.service` → исполнитель X
w(f"{BIN}/sysctl_unit",
  "#!/usr/bin/env python3\nimport sys,os,subprocess\n"
  f"open({ST!r}+'/unit-calls','a').write(' '.join(sys.argv[1:])+'\\n')\n"
  "u=[x for x in sys.argv[1:] if x.endswith('.service')][0]\n"
  "if not u.startswith('sadik-switch@'): sys.exit(98)\n"
  "fam=u.split('@')[1].split('.service')[0]\n"
  f"e=dict(os.environ); e.update({ENV_EX!r})\n"
  f"p=subprocess.run([{EX!r},fam],env=e,capture_output=True,text=True)\n"
  f"open({ST!r}+'/exec-out','a').write(p.stdout+p.stderr)\n"
  "sys.exit(p.returncode)\n", 0o755)
w(f"{BIN}/nosudo", '#!/bin/sh\n[ "$1" = "-n" ] && shift\nexec "$@"\n', 0o755)
w(f"{rab}/token", "STENDTOKEN"); w(f"{rab}/owner", str(OWNER))

# ── подставной Telegram ──
otvety, obnovleniya = [], []
vydano = threading.Event()


class TG(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        dl = int(self.headers.get("Content-Length", 0))
        q = {k: v[0] for k, v in parse_qs(self.rfile.read(dl).decode()).items()}
        if self.path.endswith("/getUpdates"):
            off = int(q.get("offset", 0))
            res = [u for u in obnovleniya if u["update_id"] >= off]
            if not res:
                vydano.set(); time.sleep(0.3)
            body = {"ok": True, "result": res}
        elif self.path.endswith("/sendMessage"):
            otvety.append((int(q["chat_id"]), q["text"])); body = {"ok": True, "result": {}}
        else:
            body = {"ok": False}
        b = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)


class Srv(HTTPServer):
    def handle_error(self, *a):   # обрыв long-poll при terminate приёмника — не находка
        pass


srv = Srv(("127.0.0.1", 0), TG)
threading.Thread(target=srv.serve_forever, daemon=True).start()
ENV_PR = {"SADIK_STEND": "1", "SADIK_BOT_TOKEN_FILE": f"{rab}/token", "SADIK_OWNER_FILE": f"{rab}/owner",
          "SADIK_OFFSET_FILE": f"{ST}/offset", "SADIK_SYSTEMCTL": f"{BIN}/sysctl_unit", "SADIK_SUDO": f"{BIN}/nosudo",
          "SADIK_TG_API": f"http://127.0.0.1:{srv.server_port}", "SADIK_SWITCH_ITOG_DIR": IT,
          "SADIK_ITOG_FILE": f"{ST}/old-itog", "SADIK_UNIT_PREFIX": "pereklyuchatel-podpiski@"}

# ПРЕДОХРАНИТЕЛЬ: приёмник обязан взять подмены — сверка модулем ДО запуска процесса
sohr = dict(os.environ); os.environ.update(ENV_PR)
try:
    ns = runpy.run_path(PR, run_name="stend_switch")
finally:
    os.environ.clear(); os.environ.update(sohr)
if (ns.get("SYSTEMCTL"), ns.get("SUDO"), ns.get("API")) != (ENV_PR["SADIK_SYSTEMCTL"], ENV_PR["SADIK_SUDO"], ENV_PR["SADIK_TG_API"]):
    subprocess.run(["rm", "-rf", rab])
    print("🔴 СЛЕПОТА: приёмник не взял подмены — процесс не запускался"); sys.exit(2)

uid = [1000]


def upd(text, frm=OWNER, chat_type="private", chat=None):
    uid[0] += 1
    return {"update_id": uid[0], "message": {"message_id": uid[0], "from": {"id": frm},
            "chat": {"id": chat if chat is not None else frm, "type": chat_type}, "text": text}}


def progon(updates, limit=60):
    """Подать пачку обновлений одному процессу приёмника; дождаться, пока он заберёт пустой ответ после пачки."""
    global obnovleniya
    otvety.clear(); obnovleniya = updates; vydano.clear()
    for f in ("unit-calls", "claude-args", "codex-args", "exec-out"):
        if os.path.exists(f"{ST}/{f}"):
            os.remove(f"{ST}/{f}")
    pr = subprocess.Popen([sys.executable, PR], env={**os.environ, **ENV_PR, "PATH": PATH},
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    vydano.wait(limit)
    pr.terminate()
    try:
        out = pr.communicate(timeout=5)[0]
    except subprocess.TimeoutExpired:
        pr.kill(); out = pr.communicate()[0]
    return out


PODSK = ("/switch-1", "/switch-a", "/switch-2", "/switch-b", "/sss", "/sss_on")


def itog_est(slovo):
    return any(slovo in t for _, t in otvety)


try:
    # ── Claude: /switch-1 — без проверок, мёртвая цель (живость не установлена) → всё равно переключено, обе стороны
    rasklad("1"); w(f"{ST}/limity", "unknown")
    out1 = progon([upd("/switch-1")])
    sud("C1 /switch-1, цель 2 мёртвая → юнит @1, переключатель «force» без цели, шлюзы 1→2, итог «переключено»",
        "sadik-switch@1.service" in rd(f"{ST}/unit-calls") and rd(f"{ST}/claude-args").split() == ["force"]
        and zhivye() == {"iskra": "2", "zarya": "2"} and itog_est("переключено"),
        f"{rd(f'{ST}/unit-calls')!r} {rd(f'{ST}/claude-args')!r} {zhivye()} {otvety}")
    sud("G1 ПОДМЕНЕНО у приёмника и исполнителя", out1.startswith("ПОДМЕНЕНО:") and "ПОДМЕНЕНО: CLAUDE CODEX RESULT LOCK" in rd(f"{ST}/exec-out"),
        out1[:120] + "|" + rd(f"{ST}/exec-out")[:120])
    rasklad("2"); w(f"{ST}/limity", "unknown")
    progon([upd("/switch-1@arg_dsh_switch_bot")])
    # 07.10 (условие Вениамина 08:38Z): /switch-1 и /switch-a — без цели, цель выбирает переключатель ПО КРУГУ 1→2→3→1
    #   (слово владельца 05.10 23:45 МСК, переключатель стр. 205–208); с 2 следующая — 3, не 1. Прежнее «2→1» — маятник 1↔2 до 05.10:
    #   C2/C4 краснели в обходе 06.10 и 07.10 («переключение оборвано на подписку 3»: подставной шлюз не знал подписку 3).
    sud("C2 /switch-1@бот, без цели с 2 → по кругу на 3 (слово владельца 05.10 23:45 МСК), шлюзы 2→3",
        rd(f"{ST}/claude-args").split() == ["force"] and zhivye() == {"iskra": "3", "zarya": "3"}, f"{rd(f'{ST}/claude-args')!r} {zhivye()}")
    # ── Claude: /switch-a — с проверкой живости цели
    rasklad("1"); w(f"{ST}/limity", "free")
    progon([upd("/switch-a")])
    sud("C3 /switch-a, цель 2 живая (замер лимитов: свободна) → без force, шлюзы 1→2",
        rd(f"{ST}/claude-args").strip() == "-" and zhivye() == {"iskra": "2", "zarya": "2"} and itog_est("переключено"),
        f"{rd(f'{ST}/claude-args')!r} {zhivye()} {otvety}")
    rasklad("2"); w(f"{ST}/limity", "free")
    progon([upd("/switch-a")])
    sud("C4 /switch-a, без цели с 2 → по кругу на 3 (живая) → шлюзы 2→3", zhivye() == {"iskra": "3", "zarya": "3"} and itog_est("переключено"), f"{zhivye()} {otvety}")
    rasklad("1"); w(f"{ST}/limity", "unknown")
    progon([upd("/switch-a")])
    sud("C5 /switch-a, живость цели не установлена → ОТКАЗ, шлюзы на 1",
        zhivye() == {"iskra": "1", "zarya": "1"} and itog_est("ОТКАЗ") and itog_est("НЕИЗВЕСТЕН"), f"{zhivye()} {otvety}")
    rasklad("1"); w(f"{ST}/limity", "blocked")
    progon([upd("/switch-a")])
    sud("C6 /switch-a, у цели лимит выбран → ОТКАЗ, шлюзы на 1",
        zhivye() == {"iskra": "1", "zarya": "1"} and itog_est("ОТКАЗ") and itog_est("лимит выбран"), f"{zhivye()} {otvety}")
    # ── Codex: /switch-2 — без проверок, мёртвая цель → всё равно переключено, обе стороны
    cx_state("3"); cx_limits("4", "ischerpan")
    progon([upd("/switch-2")])
    sud("X1 /switch-2, цель 4 мёртвая (100%) → юнит @2, «toggle-force», шлюзы 3→4",
        "sadik-switch@2.service" in rd(f"{ST}/unit-calls") and rd(f"{ST}/codex-args").split() == ["toggle-force"]
        and cx_nums() == ["4", "4"] and itog_est("переключено"), f"{rd(f'{ST}/unit-calls')!r} {rd(f'{ST}/codex-args')!r} {cx_nums()} {otvety}")
    sud("G2 ПОДМЕНЕНО у переключателя Codex", "ПОДМЕНЕНО: KATALOG DOMA ALERT ZAMOK PROC_ROOT" in rd(f"{ST}/exec-out"), rd(f"{ST}/exec-out")[:200])
    cx_state("4"); cx_limits("3", "net")
    progon([upd("/switch-2@arg_dsh_switch_bot")])
    sud("X2 /switch-2@бот, замера цели 3 нет → шлюзы 4→3", cx_nums() == ["3", "3"] and itog_est("переключено"), f"{cx_nums()} {otvety}")
    # ── Codex: /switch-b — с проверкой живости цели
    cx_state("3"); cx_limits("4", "zhiva")
    progon([upd("/switch-b")])
    sud("X3 /switch-b, цель 4 живая (свежий замер, 10%) → «toggle», шлюзы 3→4",
        rd(f"{ST}/codex-args").split() == ["toggle"] and cx_nums() == ["4", "4"] and itog_est("переключено"), f"{rd(f'{ST}/codex-args')!r} {cx_nums()} {otvety}")
    cx_state("4"); cx_limits("3", "zhiva")
    progon([upd("/switch-b")])
    sud("X4 /switch-b, цель 3 живая → шлюзы 4→3", cx_nums() == ["3", "3"] and itog_est("переключено"), f"{cx_nums()} {otvety}")
    cx_state("3"); cx_limits("4", "ischerpan")
    progon([upd("/switch-b")])
    sud("X5 /switch-b, у цели лимит выбран (100%) → ОТКАЗ, шлюзы на 3", cx_nums() == ["3", "3"] and itog_est("ОТКАЗ"), f"{cx_nums()} {otvety}")
    cx_state("3"); cx_limits("4", "net")
    progon([upd("/switch-b")])
    sud("X6 /switch-b, замера цели нет (живость не установлена) → ОТКАЗ, шлюзы на 3", cx_nums() == ["3", "3"] and itog_est("ОТКАЗ"), f"{cx_nums()} {otvety}")
    # ── подсказка, чужие, исполнитель
    progon([upd("/foo"), upd("привет"), upd("/switch"), upd("/switch-2 4")])
    tx = [t for c, t in otvety if c == OWNER]
    sud("H1 незнакомое/текст/«/switch»/команда с аргументом → 4 подсказки, юнит не звали",
        len(tx) == 4 and not rd(f"{ST}/unit-calls"), f"{len(tx)} {rd(f'{ST}/unit-calls')!r}")
    sud("H2 подсказка: настоящие переводы строк, нет литерала \\n, все шесть команд, «без проверки живости»",
        bool(tx) and all(("\n" in t) and ("\\n" not in t) and all(c in t for c in PODSK) and "без проверки живости" in t for t in tx), repr(tx[:1]))
    # ── выключатель чата сайта /sss /sss_on (B-N-1499) ──
    zak = f"{SAJT}/zakryto"
    progon([upd("/sss")])
    sud("S1 /sss от владельца → юнит sadik-switch@sss, файл-состояние создан (kto=sadik-bot), ответ «ЗАКРЫТ», без «Переключаю»",
        "sadik-switch@sss.service" in rd(f"{ST}/unit-calls") and os.path.exists(zak) and json.loads(rd(zak))["kto"] == "sadik-bot"
        and any("ЗАКРЫТ" in t for _, t in otvety) and not any("Переключаю" in t for _, t in otvety), f"{rd(f'{ST}/unit-calls')!r} {os.path.exists(zak)} {otvety}")
    progon([upd("/sss@arg_dsh_switch_bot")])
    sud("S2 /sss повторно (с именем бота) → «уже закрыт», файл на месте", os.path.exists(zak) and any("уже закрыт" in t for _, t in otvety), f"{otvety}")
    progon([upd("/sss_on")])
    sud("S3 /sss_on → юнит sadik-switch@sss-on, файл убран, ответ «ОТКРЫТ»",
        "sadik-switch@sss-on.service" in rd(f"{ST}/unit-calls") and not os.path.exists(zak) and any("ОТКРЫТ" in t for _, t in otvety), f"{otvety}")
    progon([upd("/sss", frm=42), upd("/sss", chat_type="group", chat=-100)])
    sud("S4 /sss от не-владельца и в группе → тишина, юнит не звали, файла нет",
        otvety == [] and not rd(f"{ST}/unit-calls") and not os.path.exists(zak), f"{otvety} {rd(f'{ST}/unit-calls')!r}")
    progon([upd("/switch-2", frm=42), upd("/foo", frm=42), upd("/switch-1", chat_type="group", chat=-100)])
    sud("N1 не-владелец и группа → тишина и ни одного вызова юнита",
        otvety == [] and not rd(f"{ST}/unit-calls"), f"{otvety} {rd(f'{ST}/unit-calls')!r}")
    p = subprocess.run([EX, "3"], env={**os.environ, **ENV_EX, "PATH": PATH}, capture_output=True, text=True)
    sud("E1 исполнитель: семейство «3» → отказ кодом 2", p.returncode == 2 and "ОТКАЗ" in p.stderr, f"{p.returncode} {p.stderr}")
    sv = rd(f"{rab}/svesti.log").splitlines()
    sud("Д1 B-N-1621: цепочка бота зовёт помощника доступа — Claude: --dobavit и --svesti; Codex: --dobavit --codex N и --svesti",
        "--dobavit" in sv and "--svesti" in sv and any(x.startswith("--dobavit --codex ") for x in sv), f"{sv[:12]}")
    sud("G3 боевые systemctl/sudo не звучали ни разу", not rd(f"{ST}/opasno"), rd(f"{ST}/opasno"))
finally:
    srv.shutdown()
    subprocess.run(["rm", "-rf", rab])

print(f"\nитог: {ok} из {ok + fail}")
ZHDYOM = 24
if ok + fail != ZHDYOM:
    print(f"🔴 КАНАРЕЙКА: проб {ok + fail}, ждём {ZHDYOM}"); sys.exit(2)
sys.exit(1 if fail else 0)
