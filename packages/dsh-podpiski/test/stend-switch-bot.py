#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Стенд B-N-2055 №1 (слово владельца 15.10 01:40 МСК): приёмник /switch слушает СВОЙ бот, а не бот тревог.
# Подставной Telegram (HTTP на 127.0.0.1) держит ДВЕ очереди обновлений, различая бота по токену в пути запроса:
# «бот тревог» (STENDALERT) и «бот переключателя» (STENDSWITCH). Приёмник — отдельный процесс в режиме SADIK_STEND=1;
# sudo подставной: пишет argv в unit-calls и кладёт свежий итог (боевой systemctl не зовётся ни разу).
# Пробы (команды у проб разные — исход каждой различим): K1 боевые умолчания приёмника — токен /etc/dsh-switch.token, offset — свой файл, не прежний; K2 команда
#   владельца боту переключателя → исполнена, ответ ушёл в бот переключателя; K3 та же команда боту тревог → не
#   исполнена, бот тревог приёмником не опрошен; K4 не-владелец → не исполнено, ответа нет; K5 «/switch-1@<бот
#   переключателя>» понят; «…@arg_dsh_alert_bot» — подсказка, не исполнение.
# Порча (довод --porcha-staryj-token): приёмнику подан токен бота тревог → K2 краснеет (новый бот глух), K3 — тоже
#   (старый снова исполняет). Коды: 0 — всё сошлось · 1 — расхождение · 2 — слепота.
# ⚠️ НЕ ЛОВИТ: настоящий Telegram (getMe/getWebhookInfo нового бота — проба в окне), права /etc/dsh-switch.token,
#   живой sadik-switch@*; стенд гоняет исполнитель-подставу, а не переключатели (их держит receiver-switch.py).
from pathlib import Path
import json, os, runpy, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

ROOT = Path(__file__).resolve().parents[1]
PR = os.environ.get("PRIYOMNIK_BIN", str(ROOT / "sbin/sadik-komandy-priyomnik"))
a = sys.argv[1:]
if a not in ([], ["--porcha-staryj-token"]):
    print("ОТКАЗ: stend-switch-bot.py [--porcha-staryj-token]"); sys.exit(2)
PORCHA = bool(a)
if not os.access(PR, os.R_OK):
    print("СЛЕПОТА: нет", PR); sys.exit(2)
rab = tempfile.mkdtemp(prefix="stend-switch-bot-")
OWNER, CHUZHOJ = 712345678, 42
ALERT, SWITCH = "STENDALERT", "STENDSWITCH"
ok = fail = 0


def w(path, s, mode=0o644):
    open(path, "w").write(s); os.chmod(path, mode)


def rd(path):
    try:
        return open(path).read()
    except OSError:
        return ""


def sud(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1; print(f"  ✅ {label}")
    else:
        fail += 1; print(f"  🔴 {label} — {detail}")


w(f"{rab}/alert.token", ALERT + "\n", 0o600); w(f"{rab}/switch.token", SWITCH + "\n", 0o600)
w(f"{rab}/owner", str(OWNER))
os.makedirs(f"{rab}/itog")
# подставной sudo: «sudo -n systemctl start --wait sadik-switch@X.service» → запись и свежий итог
w(f"{rab}/sudo", "#!/usr/bin/env python3\nimport sys,time,os\n"
  f"open({rab!r}+'/unit-calls','a').write(' '.join(sys.argv[1:])+'\\n')\n"
  "u=[x for x in sys.argv[1:] if x.endswith('.service')][0]\n"
  "fam=u.split('@')[1].split('.service')[0]\n"
  f"open({rab!r}+'/itog/switch-'+fam+'.txt','w').write(f'{{time.time()+0.001}}.{{os.getpid()}}\\tпереключено (подстава) '+fam)\n", 0o755)

ocheredi = {ALERT: [], SWITCH: []}       # обновления по боту
oprosy = {ALERT: 0, SWITCH: 0}           # сколько раз бота спросили getUpdates
otvety = {ALERT: [], SWITCH: []}         # sendMessage по боту
vydano = threading.Event()


class TG(BaseHTTPRequestHandler):
    def log_message(self, *x):
        pass

    def do_POST(self):
        dl = int(self.headers.get("Content-Length", 0))
        q = {k: v[0] for k, v in parse_qs(self.rfile.read(dl).decode()).items()}
        chasti = self.path.split("/")
        tok = chasti[1][3:] if len(chasti) > 2 and chasti[1].startswith("bot") else ""
        if tok not in ocheredi:
            body = {"ok": False, "error_code": 401, "description": "Unauthorized"}
        elif self.path.endswith("/getUpdates"):
            oprosy[tok] += 1
            off = int(q.get("offset", 0))
            res = [u for u in ocheredi[tok] if u["update_id"] >= off]
            if not res:
                vydano.set(); time.sleep(0.3)
            body = {"ok": True, "result": res}
        elif self.path.endswith("/sendMessage"):
            otvety[tok].append((int(q["chat_id"]), q["text"])); body = {"ok": True, "result": {}}
        else:
            body = {"ok": False}
        b = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)


class Srv(HTTPServer):
    def handle_error(self, *x):
        pass


srv = Srv(("127.0.0.1", 0), TG)
threading.Thread(target=srv.serve_forever, daemon=True).start()
ENV = {"SADIK_STEND": "1", "SADIK_BOT_TOKEN_FILE": f"{rab}/{'alert' if PORCHA else 'switch'}.token",
       "SADIK_OWNER_FILE": f"{rab}/owner", "SADIK_OFFSET_FILE": f"{rab}/offset", "SADIK_SUDO": f"{rab}/sudo",
       "SADIK_SYSTEMCTL": "/bin/false", "SADIK_TG_API": f"http://127.0.0.1:{srv.server_port}",
       "SADIK_SWITCH_ITOG_DIR": f"{rab}/itog", "SADIK_ITOG_FILE": f"{rab}/old-itog", "VLADELEC_TG_ID_FILE": f"{rab}/owner"}
PATH = f"{rab}:/usr/bin:/bin"

try:
    # K1: боевые умолчания — читаются из самого приёмника без подмен (runpy без SADIK_STEND)
    sohr = dict(os.environ)
    for k in list(os.environ):
        if k.startswith("SADIK_"):
            del os.environ[k]
    try:
        boj = runpy.run_path(PR, run_name="stend_switch_bot")["BOJ"]
    finally:
        os.environ.clear(); os.environ.update(sohr)
    sud("K1 боевые умолчания: токен /etc/dsh-switch.token, offset — свой файл (не прежний /var/lib/sadik-komandy/offset)",
        boj.get("SADIK_BOT_TOKEN_FILE") == "/etc/dsh-switch.token"
        and boj.get("SADIK_OFFSET_FILE") not in ("/var/lib/sadik-komandy/offset", None),
        f"{boj.get('SADIK_BOT_TOKEN_FILE')} {boj.get('SADIK_OFFSET_FILE')}")

    def upd(n, text, frm=OWNER):
        return {"update_id": n, "message": {"message_id": n, "from": {"id": frm}, "chat": {"id": frm, "type": "private"}, "text": text}}

    ocheredi[SWITCH] = [upd(5001, "/switch-1"), upd(5002, "/sss_on", frm=CHUZHOJ),
                        upd(5003, "/switch-a@arg_dsh_switch_bot"), upd(5004, "/switch-b@arg_dsh_alert_bot")]
    ocheredi[ALERT] = [upd(9001, "/switch-2")]
    pr = subprocess.Popen([sys.executable, PR], env={**os.environ, **ENV, "PATH": PATH},
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    vydano.wait(40); time.sleep(0.5)
    pr.terminate()
    try:
        out = pr.communicate(timeout=5)[0]
    except subprocess.TimeoutExpired:
        pr.kill(); out = pr.communicate()[0]
    calls = rd(f"{rab}/unit-calls")
    print(f"     внесено: бот переключателя — {len(ocheredi[SWITCH])} обновл., бот тревог — {len(ocheredi[ALERT])}; "
          f"приёмнику подан {'ТОКЕН ТРЕВОГ (порча)' if PORCHA else 'токен переключателя'}; опросы: {oprosy}")
    sud("K2 /switch-1 владельца боту переключателя → исполнено (sadik-switch@1), итог ушёл в бот переключателя",
        "sadik-switch@1.service" in calls and any("переключено (подстава) 1" in t for _, t in otvety[SWITCH]),
        f"вызовы {calls!r} ответы {otvety[SWITCH][:3]}")
    sud("K3 /switch-2 владельца боту ТРЕВОГ → не исполнено, бот тревог не опрошен, ответов в нём нет",
        "sadik-switch@2.service" not in calls and oprosy[ALERT] == 0 and otvety[ALERT] == [],
        f"вызовы {calls!r} опросы тревог {oprosy[ALERT]} ответы {otvety[ALERT]}")
    sud("K4 /sss_on не-владельца (у владельца такой команды в стенде нет) → не исполнено, ему ни слова",
        "sadik-switch@sss-on.service" not in calls and not any(c == CHUZHOJ for c, _ in otvety[SWITCH] + otvety[ALERT]),
        f"вызовы {calls!r}")
    sud("K5 «/switch-a@arg_dsh_switch_bot» исполнено; «/switch-b@arg_dsh_alert_bot» — подсказка, не исполнение",
        "sadik-switch@a.service" in calls and "sadik-switch@b.service" not in calls
        and any("/switch-1" in t and "/sss_on" in t for _, t in otvety[SWITCH]),
        f"вызовы {calls!r}")
finally:
    srv.shutdown()
    subprocess.run(["rm", "-rf", "--", rab])

ZHDYOM = 5
print(f"\nитог: {ok} из {ok + fail}")
if ok + fail != ZHDYOM:
    print(f"🔴 КАНАРЕЙКА: проб {ok + fail}, ждём {ZHDYOM}"); sys.exit(2)
sys.exit(1 if fail else 0)
