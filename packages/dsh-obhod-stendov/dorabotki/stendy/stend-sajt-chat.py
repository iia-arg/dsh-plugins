#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Стенд адаптера sajt-chat r15 — (+копии kopii детерминированы, P42 — Аврора) (+повтор ответа только на 429/5xx, 404 → otkaz; received_at = created_at; P39–P41 — Аврора) (+список разговоров страницами по 25, last_activity_at целыми секундами; P37–P38) (+формат push шлюза Марка: X-Ostrov-Signature над сырым телом, s числом; P36 — Аврора) (+страницы messages как Chatwoot 4.18: без параметров последние 20, after — до 100) (+захват .claimed-*; один токен шлюза API; дедуп ответов и неизвестный исход) ОПРОС Chatwoot API + срок 30 сут + останов/перезапуск (B-N-1499, Искра). Адаптер — отдельный процесс в режиме SAJT_STEND=1;
# каталоги, секреты, состояние — во временном каталоге; Chatwoot API (разговоры, сообщения, отправка), шлюз виджета и тревога —
# подставные на 127.0.0.1. Предмет по умолчанию — бой /usr/local/sbin/sajt-chat; кандидата подавать SAJT_BIN.
# Предохранитель: адаптер обязан напечатать «ПОДМЕНЕНО» с каталогами стенда, иначе слепота до первой пробы.
# ⚠️ НЕ ЛОВИТ: настоящий Chatwoot (права токена бота на список разговоров, формат ответа 4.18), сеть awg9, сторону Варвары.
import hashlib, hmac, json, os, signal, socket, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request, uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

BIN = os.environ.get("SAJT_BIN", "/usr/local/sbin/sajt-chat")
if not os.access(BIN, os.R_OK):
    print("СЛЕПОТА: нет", BIN); sys.exit(2)
rab = tempfile.mkdtemp(prefix="stend-sajt-chat-")
SP, ETC, ST = f"{rab}/spool", f"{rab}/etc", f"{rab}/state"
for d in (f"{SP}/vhod", f"{SP}/kopii", f"{SP}/vyhod/otkaz", ETC, ST):
    os.makedirs(d)
TOK = "stend-token-" + uuid.uuid4().hex   # токен шлюза API Марка (единственный токен адаптера)
GSEC = "stend-shlyuz-" + uuid.uuid4().hex
ok = fail = 0


def sud(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1; print("  ✅", label)
    else:
        fail += 1; print("  🔴", label, "—", detail)


# ── подставной Chatwoot: разговоры и сообщения в памяти ──
LOCK = threading.RLock()   # повторный: P33 держит его вокруг пачки dobavit (r11)
RAZG = {}          # conv -> {"inbox":int, "akt":float, "msgs":[...]}
NEXT = [5000]
posty, get_tokens = [], []
CW_SBOJ = [0]      # >0 — отвечать 500 на GET столько раз
CW_KOD, popytki = {}, {}   # r14: текст ответа → (код, сколько раз; None — всегда); popytki — все попытки POST по тексту
CW_POST = {"obryv": 0, "500": 0}   # POST: оборвать без ответа (исход неизвестен) / ответить 500 (не принято) столько раз


def dobavit(conv, text="Здравствуйте, сколько стоит занятие?", mt=0, private=False, sender="contact", vlozh=None, inbox=1, mid=None):
    """mid — явный id (поздний commit: id меньше уже выданных, а created_at — сейчас); список хранится в порядке created_at."""
    with LOCK:
        if mid is None:
            NEXT[0] += 1; mid = NEXT[0]
        r = RAZG.setdefault(conv, {"inbox": inbox, "akt": 0.0, "msgs": []})
        r["msgs"].append({"id": mid, "content": text, "message_type": mt, "private": private, "created_at": int(time.time()),
                          "sender": {"type": sender}, "attachments": vlozh or []})
        r["akt"] = time.time() + NEXT[0] * 1e-6 + len(r["msgs"]) * 1e-9
        return mid


class CW(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def otvet(self, obj, kod=200):
        b = json.dumps(obj).encode()
        self.send_response(kod); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        get_tokens.append(self.headers.get("api_access_token"))
        # как шлюз API Марка: чужой токен — 401
        if self.headers.get("api_access_token") != TOK:
            return self.otvet({"error": "unauthorized"}, 401)
        if CW_SBOJ[0] > 0:
            CW_SBOJ[0] -= 1; return self.otvet({"error": "x"}, 500)
        u = urlparse(self.path); parts = u.path.split("/")
        with LOCK:
            if u.path.endswith("/conversations"):
                # r13 как ConversationFinder 4.18 (исходник живого образа, 21:4xZ): last_activity_at убыв., 25 на страницу,
                # page с 1; last_activity_at — ЦЕЛЫЕ секунды (живая проба 21:08Z)
                q = parse_qs(u.query); stranica = int((q.get("page") or ["1"])[0])
                vse = sorted(RAZG.items(), key=lambda kv: (int(kv[1]["akt"]), kv[0]), reverse=True)
                pl = [{"id": c, "inbox_id": r["inbox"], "last_activity_at": int(r["akt"])} for c, r in vse[(stranica - 1) * 25:stranica * 25]]
                return self.otvet({"data": {"meta": {}, "payload": pl}})
            if u.path.endswith("/messages"):
                # как MessageFinder Chatwoot 4.18 (исходник живого образа, Марк 20:1xZ): без параметров — последние 20 по created_at;
                # after=<id> — id > after, по created_at, не больше 100; иное адаптер слать не должен — 400
                c = int(parts[-2]); q = parse_qs(u.query); ms = list(RAZG.get(c, {}).get("msgs", []))
                if not q:
                    return self.otvet({"meta": {}, "payload": ms[-20:]})
                if set(q) == {"after"}:
                    a = int(q["after"][0]); return self.otvet({"meta": {}, "payload": [m for m in ms if m["id"] > a][:100]})
                return self.otvet({"error": "stend: неожиданные параметры " + u.query}, 400)
        self.otvet({}, 404)

    def do_POST(self):
        b = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if self.headers.get("api_access_token") != TOK:
            return self.otvet({"error": "unauthorized"}, 401)
        if CW_POST["500"] > 0:
            CW_POST["500"] -= 1; return self.otvet({"error": "x"}, 500)
        t = (json.loads(b or b"{}") or {}).get("content")
        popytki[t] = popytki.get(t, 0) + 1
        k = CW_KOD.get(t)
        if k and k[1] != 0:      # r14: заданный код на этот текст (404 удалённого разговора — всегда; 429 — N раз)
            CW_KOD[t] = (k[0], None if k[1] is None else k[1] - 1); return self.otvet({"error": "stend"}, k[0])
        posty.append({"path": self.path, "token": self.headers.get("api_access_token"), "body": json.loads(b)})
        if CW_POST["obryv"] > 0:            # принято, но ответа нет — отправитель не знает исхода
            CW_POST["obryv"] -= 1; self.close_connection = True; return
        self.otvet({"id": 1})


shlyuz, prinyato = [], []
GW_SBOJ = [False]   # B-N-1860: шлюз «лежит» — 503 до приёма (в shlyuz не пишется: P36 судит только дошедшие до приёмника)


class GW(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        # r11: модель приёмника по коду шлюза Марка (gate.py dd981900): подпись X-Ostrov-Signature над СЫРЫМ телом, иначе 401;
        # тело ровно {otkryto: bool, s: число ±30 с, n: целое > 0}, иначе 400; n < последнего — 400; n == последнего: то же тело —
        # 200 БЕЗ нового приёма (повтор не продлевает), другое — 400; n больше — принято, 200.
        b = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if GW_SBOJ[0]:
            self.send_response(503); self.send_header("Content-Length", "0"); self.end_headers(); return
        podp = hmac.compare_digest("sha256=" + hmac.new(GSEC.encode(), b, hashlib.sha256).hexdigest(), self.headers.get("X-Ostrov-Signature", ""))
        try:
            t = json.loads(b)
        except ValueError:
            t = {}
        zap = {"at": time.time(), "body": t, "raw": b, "podpis": podp, "prinyat": False}
        shlyuz.append(zap)
        kod = 401
        if podp:
            n = t.get("n") if isinstance(t, dict) else None
            vid_ok = isinstance(t, dict) and set(t) == {"otkryto", "s", "n"} and type(t["otkryto"]) is bool \
                and type(t["s"]) in (int, float) and abs(time.time() - t["s"]) <= 30 and type(n) is int and n > 0
            dig = hashlib.sha256(json.dumps(t, sort_keys=True, separators=(",", ":")).encode()).hexdigest() if vid_ok else None
            if not vid_ok or (prinyato and n < prinyato[-1][0]):
                kod = 400
            elif prinyato and n == prinyato[-1][0]:
                kod = 200 if dig == prinyato[-1][1] else 400
            else:
                prinyato.append((n, dig)); zap["prinyat"] = True; kod = 200
        self.send_response(kod); self.send_header("Content-Length", "0"); self.end_headers()


cw = HTTPServer(("127.0.0.1", 0), CW); threading.Thread(target=cw.serve_forever, daemon=True).start()
gw = HTTPServer(("127.0.0.1", 0), GW); threading.Thread(target=gw.serve_forever, daemon=True).start()
open(f"{ETC}/api.token", "w").write(TOK)
open(f"{ETC}/chatwoot-api", "w").write(f"http://127.0.0.1:{cw.server_port}")
open(f"{ETC}/shlyuz-url", "w").write(f"http://127.0.0.1:{gw.server_port}/_ostrov/sss")
open(f"{ETC}/shlyuz.secret", "w").write(GSEC)
ALERT_LOG = f"{rab}/trevogi"
open(f"{rab}/alert", "w").write(f'#!/bin/sh\necho "$1" >> "{ALERT_LOG}"\n'); os.chmod(f"{rab}/alert", 0o755)
# история ДО первого запуска — не должна проиграться
dobavit(900, "старое сообщение до запуска адаптера")
ENV = {**os.environ, "SAJT_STEND": "1", "SAJT_SPOOL": SP, "SAJT_STATE": f"{ST}/zakryto", "SAJT_DB": f"{rab}/db/adapter.db",
       "SAJT_ETC": ETC, "SAJT_ALERT": f"{rab}/alert", "SAJT_CAP_HOUR": "100", "SAJT_MAX_LIVE": "8", "SAJT_NE_ZABRANO": "3",
       "SAJT_POLL": "0.2", "SAJT_KOPII_K": "5", "SAJT_KOPII_VSEGO": "12", "SAJT_KOPII_OKNO": "4", "SAJT_SHLYUZ_SERDCE": "1", "SAJT_CHISTKA_PERIOD": "1", "SAJT_STRANIC": "1"}
LOGF = open(f"{rab}/adapter.log", "w")
pr = subprocess.Popen([sys.executable, "-B", BIN], env=ENV, stdout=LOGF, stderr=subprocess.STDOUT)


def zhurnal():
    return open(f"{rab}/adapter.log").read()


def zhdat(cond, sek=4.0):
    t = time.time() + sek
    while time.time() < t:
        if cond():
            return True
        time.sleep(0.05)
    return cond()


zhdat(lambda: "первый запуск" in zhurnal(), 5)
if not (zhurnal().startswith("ПОДМЕНЕНО:") and "SAJT_SPOOL" in zhurnal().split("\n")[0] and "SAJT_ETC" in zhurnal().split("\n")[0]):
    pr.kill(); print("🔴 СЛЕПОТА: адаптер не взял подмены —", zhurnal()[:200]); sys.exit(2)


def spisok(p):
    return sorted(f for f in os.listdir(f"{SP}/{p}") if f.endswith(".json"))


def chitat(p):
    out = []
    for f in spisok(p):
        try:
            out.append(json.load(open(f"{SP}/{p}/{f}")))
        except (OSError, ValueError):
            pass
    return out


def ochistit():
    time.sleep(0.5)
    for p in ("vhod", "kopii", "vyhod"):
        for f in spisok(p):
            os.unlink(f"{SP}/{p}/{f}")
    posty.clear()


def trevog():
    return open(ALERT_LOG).read().count("sajt-chat") if os.path.exists(ALERT_LOG) else 0


def v_vhod(conv, n=1):
    return zhdat(lambda: len([x for x in chitat("vhod") if x["conversation_id"] == conv]) >= n)


def zapisat_otvet(imya, o):
    open(f"{SP}/vyhod/.{imya}.tmp", "w").write(json.dumps(o)); os.replace(f"{SP}/vyhod/.{imya}.tmp", f"{SP}/vyhod/{imya}.json")


try:
    time.sleep(0.6)
    sud("P0 первый запуск: история до запуска не проиграна (vhod/kopii пусты), «отмечены прочитанными» в журнале",
        not spisok("vhod") and not spisok("kopii") and "первый запуск: 1 разговоров" in zhurnal(), zhurnal()[-300:])
    m1 = dobavit(101)
    v_vhod(101)
    v = chitat("vhod")
    sud("P1 новое входящее в новом разговоре → один конверт vhod с текстом, разговором и id cw-<разговор>-<сообщение>",
        len(v) == 1 and v[0]["conversation_id"] == 101 and v[0]["text"].startswith("Здравствуйте") and v[0]["id"] == f"cw-101-{m1}", f"{v}")
    na_A = v[0]["id"]
    time.sleep(0.8)
    sud("P2 повторные опросы не дают второго конверта на то же сообщение", len(spisok("vhod")) == 1, f"{spisok('vhod')}")
    sud("P3 запросы к API — только токеном шлюза (чужой — 401), адаптер не слушает сеть (LISTEN у его pid нет)",
        get_tokens and set(get_tokens) == {TOK} and subprocess.run(["ss", "-ltnpH"], capture_output=True, text=True).stdout.count(f"pid={pr.pid},") == 0,
        f"{set(get_tokens)} ")
    dobavit(102, "чужой ящик", inbox=9); time.sleep(0.8)
    sud("P4 разговор чужого ящика (inbox 9) → не обработан", not [x for x in chitat("vhod") + chitat("kopii") if x["conversation_id"] == 102], "")
    ochistit()
    dobavit(103, "я" * 2001)
    zhdat(lambda: any(p["path"].endswith("/conversations/103/messages") for p in posty))
    sud("P5 длиннее 2000 → kopii «otsecheno», автоответ, vhod пуст",
        not spisok("vhod") and any(x["kind"] == "otsecheno" and "2000" in x["reason"] for x in chitat("kopii"))
        and any("длинное" in p["body"]["content"] for p in posty), f"{chitat('kopii')}")
    ochistit()
    for i in range(7):
        dobavit(104, f"сообщение {i}")
    zhdat(lambda: len(spisok("vhod")) >= 6 and any("медленнее" in p["body"]["content"] for p in posty))
    sud("P6 седьмое за минуту в один разговор → vhod 6, седьмое в kopii, автоответ «медленнее»",
        len(spisok("vhod")) == 6 and any(x["kind"] == "otsecheno" for x in chitat("kopii")), f"{len(spisok('vhod'))}")
    ochistit()
    dobavit(105, "вот файл", vlozh=[{"file_type": "image", "data_url": "https://x/y.png", "file_size": 1234}])
    zhdat(lambda: any("словами" in p["body"]["content"] for p in posty))
    sud("P7 вложение → kopii «vlozhenie» с размером, автоответ «опишите словами», vhod пуст",
        not spisok("vhod") and any(x["kind"] == "vlozhenie" and "1234" in x["text"] for x in chitat("kopii")), f"{chitat('kopii')}")
    ochistit()
    for c in (201, 202, 203, 204, 205, 206):
        dobavit(c, "привет")
    zhdat(lambda: len(spisok("vhod")) >= 6)
    t0 = trevog()
    dobavit(299, "привет")
    # тревога поднимается ПОСЛЕ автоответа — ждать обоих (гонка стенда с r1, поймана прогоном от iskra 19:5xZ)
    zhdat(lambda: any(p["path"].endswith("/299/messages") for p in posty) and trevog() >= t0 + 1)
    sud("P8 девятый живой разговор (предел 8) → kopii, «недоступен», одна тревога",
        any(x["conversation_id"] == 299 for x in chitat("kopii")) and any("недоступен" in p["body"]["content"] for p in posty) and trevog() == t0 + 1, f"{trevog()-t0}")
    # ── ответы: адресат ──
    ochistit()
    zapisat_otvet("o1", {"v": 1, "conversation_id": 101, "na": na_A, "text": "Занятие стоит 1000 рублей.", "written_at": time.time()})
    zhdat(lambda: not spisok("vyhod"))
    sud("P9 ответ с верным na → POST в разговор 101 токеном бота, outgoing, не private; файл убран",
        any(p["path"].endswith("/conversations/101/messages") and p["token"] == TOK and p["body"]["content"].startswith("Занятие")
            and p["body"]["message_type"] == "outgoing" and p["body"]["private"] is False for p in posty) and not spisok("vyhod"), f"{posty}")
    # ── P47–P49 (B-N-1913, Аврора): na пишет Варвара и он входит в тревогу владельцу — пропускается только форма конверта адаптера.
    #    Стоят ДО P10: тревога «otvet-adresat» в паузе 3600 с, после P10 след пробы был бы подавлен паузой (слепая проба).
    posty.clear()
    NA_VR = "СРОЧНО: " * 300
    zapisat_otvet("o47", {"v": 1, "conversation_id": 101, "na": NA_VR, "text": "вредный na", "written_at": time.time()})
    zhdat(lambda: os.path.exists(f"{SP}/vyhod/otkaz/o47.json") and os.path.exists(ALERT_LOG), 4)
    trv = open(ALERT_LOG).read() if os.path.exists(ALERT_LOG) else ""
    sud(f"P47 na чужой формы ({len(NA_VR)} зн. «СРОЧНО: …») → otkaz, не отправлен; тревога в подставном канале «na неверной формы "
        f"(длина {len(NA_VR)})», текста na нет ни в тревоге, ни в журнале",
        not posty and os.path.exists(f"{SP}/vyhod/otkaz/o47.json") and f"na неверной формы (длина {len(NA_VR)})" in trv
        and "СРОЧНО" not in trv and "СРОЧНО" not in zhurnal(),
        f"POST {len(posty)} otkaz {os.path.exists(f'{SP}/vyhod/otkaz/o47.json')} «СРОЧНО» в тревоге {trv.count('СРОЧНО')}, "
        f"в журнале {zhurnal().count('СРОЧНО')}; тревога: {trv[-160:]!r}")
    zapisat_otvet("o48", {"v": 1, "conversation_id": 101, "na": "cw-101-999999", "text": "нет конверта", "written_at": time.time()})
    zhdat(lambda: os.path.exists(f"{SP}/vyhod/otkaz/o48.json"), 4)
    sud("P48 na формы конверта, но конверта нет → прежний путь: otkaz, «нет входящего конверта cw-101-999999» в журнале",
        not posty and os.path.exists(f"{SP}/vyhod/otkaz/o48.json") and "нет входящего конверта cw-101-999999" in zhurnal(),
        f"POST {len(posty)} otkaz {os.path.exists(f'{SP}/vyhod/otkaz/o48.json')}")
    for x in ("o47", "o48"):
        os.unlink(f"{SP}/vyhod/otkaz/{x}.json")
    # P49 (B-N-1913 r2): решает НАЛИЧИЕ конверта, не форма id — конверт с id иной формы (так кладёт фикстура telegram stend-site-adapter;
    #    1.0.6 отвергал его по форме — откат 06:48Z) вписан прямо в базу стенда; ответ на него обязан уйти.
    import sqlite3
    bz = sqlite3.connect(f"{rab}/db/adapter.db", timeout=5)
    bz.execute("INSERT OR IGNORE INTO konverty(id,conv,at) VALUES(?,?,?)", ("delivery-b1913", 101, time.time())); bz.commit(); bz.close()
    zapisat_otvet("o49", {"v": 1, "conversation_id": 101, "na": "delivery-b1913", "text": "Ответ на конверт иной формы.", "written_at": time.time()})
    zhdat(lambda: any(p["body"].get("content") == "Ответ на конверт иной формы." for p in posty) or os.path.exists(f"{SP}/vyhod/otkaz/o49.json"), 4)
    sud("P49 конверт с id иной формы есть в базе → ответ ушёл в разговор 101 (форма na решает только текст тревоги)",
        any(p["path"].endswith("/conversations/101/messages") and p["body"].get("content") == "Ответ на конверт иной формы." for p in posty)
        and not os.path.exists(f"{SP}/vyhod/otkaz/o49.json"),
        f"POST {len(posty)} otkaz {os.path.exists(f'{SP}/vyhod/otkaz/o49.json')}")
    if os.path.exists(f"{SP}/vyhod/otkaz/o49.json"):
        os.unlink(f"{SP}/vyhod/otkaz/o49.json")
    posty.clear()
    zapisat_otvet("o2", {"v": 1, "conversation_id": 202, "na": na_A, "text": "чужой", "written_at": time.time()})
    zapisat_otvet("o3", {"v": 1, "conversation_id": 101, "na": "net", "text": "без конверта", "written_at": time.time()})
    zhdat(lambda: not spisok("vyhod"))
    sud("P10 ответ с чужим разговором и без конверта → не отправлены, оба в otkaz",
        not posty and sorted(os.listdir(f"{SP}/vyhod/otkaz")) == ["o2.json", "o3.json"], f"{posty}")
    # ── /sss + шлюз ──
    ochistit(); shlyuz.clear()
    open(f"{ST}/zakryto", "w").write("{}")
    zhdat(lambda: any(s["body"]["otkryto"] is False for s in shlyuz))
    zak = [s for s in shlyuz if s["body"]["otkryto"] is False]
    sud("P11 /sss → шлюзу виджета ушло «закрыто» с верной подписью", bool(zak) and all(s["podpis"] for s in zak), f"{shlyuz[-3:]}")
    dobavit(101, "вы тут?"); dobavit(101, "ау?")
    zhdat(lambda: len([x for x in chitat("kopii") if "закрыт" in x["reason"]]) >= 2)
    nedost = [p for p in posty if "недоступен" in p["body"]["content"]]
    sud("P12 закрыто: оба сообщения в kopii «закрыт», vhod пуст, «недоступен» ровно один раз",
        not spisok("vhod") and len([x for x in chitat("kopii") if "закрыт" in x["reason"]]) == 2 and len(nedost) == 1, f"{nedost}")
    posty.clear()
    zapisat_otvet("o4", {"v": 1, "conversation_id": 101, "na": na_A, "text": "поздний", "written_at": time.time()})
    zhdat(lambda: not spisok("vyhod"))
    sud("P13 закрыто: ответ из vyhod не отправлен, убран", not posty and not spisok("vyhod"), f"{posty}")
    shlyuz.clear()
    time.sleep(1.5)
    sud("P14 сердцебиение: при неизменном «закрыто» шлюз получает повторы (раз в 1 с на стенде)",
        len(shlyuz) >= 1 and all(s["body"]["otkryto"] is False and s["podpis"] for s in shlyuz), f"{shlyuz}")
    os.unlink(f"{ST}/zakryto")
    zhdat(lambda: any(s["body"]["otkryto"] is True for s in shlyuz))
    dobavit(101, "а теперь?")
    v_vhod(101)
    sud("P15 /sss_on → шлюзу «открыто», сообщение снова в vhod", any(s["body"]["otkryto"] is True for s in shlyuz) and len(spisok("vhod")) == 1, f"{spisok('vhod')}")
    # ── не забирает ──
    t2 = trevog(); posty.clear()
    zhdat(lambda: not spisok("vhod") and trevog() >= t2 + 1 and any("недоступен" in p["body"]["content"] for p in posty), 8)
    time.sleep(0.5)
    sud("P16 конверт не забран за 3 с → убран, kopii «ne-zabrano» с текстом, «недоступен», одна тревога",
        not spisok("vhod") and any(x["kind"] == "ne-zabrano" and x["text"] == "а теперь?" for x in chitat("kopii")) and trevog() == t2 + 1, f"{trevog()-t2}")
    # ── оператор, бот, заметка ──
    ochistit()
    dobavit(101, "Отвечу я, оператор", mt=1, sender="user"); dobavit(101, "ответ бота", mt=1, sender="agent_bot"); dobavit(101, "заметка", private=True)
    zhdat(lambda: any(x["kind"] == "operator" for x in chitat("kopii")))
    time.sleep(0.6)
    kk = chitat("kopii")
    sud("P17 ответ человека-оператора → kopii «operator»; ответ бота и приватная заметка — пропущены",
        len(kk) == 1 and kk[0]["kind"] == "operator" and not spisok("vhod"), f"{kk}")
    # ── предел копий (условие 18:17Z): флуд 200 в один разговор; другой разговор доставлен в срок.
    #    Живых разговоров уже 8 (= предел стенда) — флуд и проверки идут по ним: 203 (флуд), 204 (другой), 201,202,205,206 (общий) ──
    ochistit()
    time.sleep(4.1 - (time.time() % 4))   # начать с нового окна копий (стенд: окно 4 с)
    for i in range(200):
        dobavit(203, f"флуд {i}")
    t_drug = time.time(); dobavit(204, "мне просто спросить")
    dostavlen = v_vhod(204, 1); za = time.time() - t_drug
    zhdat(lambda: any(x["kind"] == "svodka" and x["conversation_id"] == 203 for x in chitat("kopii")), 9)
    k401 = [x for x in chitat("kopii") if x["conversation_id"] == 203 and x["kind"] in ("otsecheno", "svodka")]
    svod = [x for x in k401 if x["kind"] == "svodka"]
    sud("P18 флуд 200 в разговор 203 → копий отсечённого ≤ K+1 (5 + одна сводка «ещё N…»)",
        len(k401) <= 6 and len(svod) == 1 and "ещё" in svod[0]["reason"], f"{len(k401)} {[x['reason'] for x in svod]}")
    sud("P19 во время флуда сообщение другого разговора доставлено в vhod за ≤ 2 с", dostavlen and za <= 2.0, f"{za:.2f} с")
    # общий предел: 4 разговора по 5 отсечений = 20 > G=12 в одном окне
    ochistit()
    time.sleep(4.1 - (time.time() % 4))
    for c in (201, 202, 205, 206):
        for i in range(12):
            dobavit(c, f"флуд {c} {i}")
    zhdat(lambda: any(x["kind"] == "svodka" and x["conversation_id"] == 0 for x in chitat("kopii")), 10)
    vse = [x for x in chitat("kopii") if x["kind"] == "otsecheno" and x["conversation_id"] in (201, 202, 205, 206)]
    sud("P20 общий предел копий (12 на окно): отсечённых копий по всем разговорам ≤ 12, есть сводка «все разговоры»",
        len(vse) <= 12 and any(x["kind"] == "svodka" and "все разговоры" in x["reason"] for x in chitat("kopii")), f"{len(vse)}")
    # ── сбой API ──
    t3 = trevog(); CW_SBOJ[0] = 8
    zhdat(lambda: trevog() >= t3 + 1, 6)
    zhdat(lambda: CW_SBOJ[0] == 0, 4)
    dobavit(101, "после сбоя")
    zhdat(lambda: any(x["conversation_id"] == 101 and x["text"] == "после сбоя" for x in chitat("vhod")), 4)
    sud("P21 API отвечает 500 восемь раз подряд → одна тревога «опрос», адаптер жив и после сбоя снова доставляет",
        trevog() == t3 + 1 and pr.poll() is None and any(x["conversation_id"] == 101 and x["text"] == "после сбоя" for x in chitat("vhod")), f"{trevog()-t3} {pr.poll()}")
    z = zhurnal()
    sud("P22 в журнале нет токена, секрета шлюза и текстов посетителей", TOK not in z and GSEC not in z and "сколько стоит" not in z and "Занятие стоит" not in z, "утечка")
    # ── срок хранения 30 сут (r4): 31 сут — удалить, 29 сут — оставить; kursor не трогать ──
    import sqlite3
    STARO, MOLODO = time.time() - 31 * 86400, time.time() - 29 * 86400
    for pap in ("kopii", "vyhod/otkaz"):
        for imya, t in (("srok-staryj", STARO), ("srok-molodoj", MOLODO)):
            f = f"{SP}/{pap}/{imya}.json"; open(f, "w").write('{"text":"срок"}'); os.utime(f, (t, t))
    db = sqlite3.connect(f"{rab}/db/adapter.db", timeout=5)
    for imya, t in (("srok-staryj", STARO), ("srok-molodoj", MOLODO)):
        db.execute("INSERT INTO dostavki(id,at) VALUES(?,?)", (imya, t))
        db.execute("INSERT INTO avto(kluch,at) VALUES(?,?)", (imya, t))
        db.execute("INSERT INTO konverty(id,conv,at) VALUES(?,?,?)", (imya, 777, t))
    db.execute("INSERT OR REPLACE INTO kursor(conv,msg,akt) VALUES(778,1,?)", (STARO,))
    db.commit()
    zhdat(lambda: "чистка срока 30 сут" in zhurnal(), 4)
    fajly = {pap: sorted(f for f in os.listdir(f"{SP}/{pap}") if f.startswith("srok-")) for pap in ("kopii", "vyhod/otkaz")}
    stroki = {t: sorted(r[0] for r in db.execute(f"SELECT {k} FROM {t} WHERE {k} LIKE 'srok-%'"))
              for t, k in (("dostavki", "id"), ("avto", "kluch"), ("konverty", "id"))}
    kurs = db.execute("SELECT COUNT(*) FROM kursor WHERE conv=778").fetchone()[0]
    db.close()
    sud("P23 срок 30 сут: файлы и строки старше — удалены, моложе — остались, kursor цел, в журнале счёт «файлов 2, строк базы 3»",
        all(v == ["srok-molodoj.json"] for v in fajly.values()) and all(v == ["srok-molodoj"] for v in stroki.values())
        and kurs == 1 and "чистка срока 30 сут: файлов 2, строк базы 3" in zhurnal(), f"{fajly} {stroki} kursor={kurs}")
    # ── r5: останов → «закрыто» шлюзу до выхода; перезапуск между опросами → ни одного второго конверта ──
    ochistit()
    n_shl = len(shlyuz)
    pr.terminate()
    try:
        pr.wait(5)
    except subprocess.TimeoutExpired:
        pr.kill()
    zak_stop = [x for x in shlyuz[n_shl:] if x["body"]["otkryto"] is False and x["podpis"]]
    sud("P24 останов (SIGTERM) → шлюзу виджета «закрыто» с подписью до выхода; в журнале «останов: шлюзу виджета ЗАКРЫТО»",
        bool(zak_stop) and "останов: шлюзу виджета ЗАКРЫТО" in zhurnal(), f"{shlyuz[n_shl:]}")
    n_start = zhurnal().count("опрос Chatwoot раз в")
    pr = subprocess.Popen([sys.executable, "-B", BIN], env=ENV, stdout=LOGF, stderr=subprocess.STDOUT)
    zhdat(lambda: zhurnal().count("опрос Chatwoot раз в") > n_start, 5)
    time.sleep(1.5)
    staroe = chitat("vhod") + [x for x in chitat("kopii") if x["kind"] != "svodka"]
    dobavit(101, "после перезапуска")
    zhdat(lambda: any(x["text"] == "после перезапуска" for x in chitat("vhod")), 4)
    time.sleep(0.6)
    vh = chitat("vhod")
    sud("P25 перезапуск между опросами: старое не проиграно (vhod/kopii пусты), новое — ровно один конверт, «первый запуск» не повторён",
        zhurnal().count("опрос Chatwoot раз в") == n_start + 1 and not staroe and len(vh) == 1 and vh[0]["text"] == "после перезапуска"
        and zhurnal().count("первый запуск") == 1, f"старых {len(staroe)} vhod {[x['text'] for x in vh]}")
    # ── r6: конверт, захваченный Варварой переименованием в vhod/.claimed-*.json (договор v2), читатель «не забрано» не трогает ──
    zahv = f"{SP}/vhod/.claimed-cw-101-proba.json"
    open(zahv, "w").write(json.dumps({"v": 1, "id": "cw-101-proba", "conversation_id": 101, "message_id": 1, "text": "захвачено",
                                      "received_at": time.time() - 10}))
    os.utime(zahv, (time.time() - 10, time.time() - 10))
    time.sleep(1.5)
    sud("P26 vhod/.claimed-*.json старше предела «не забрано» — адаптер не трогает: файл на месте, копии ne-zabrano нет",
        os.path.exists(zahv) and not [x for x in chitat("kopii") if x.get("id") == "cw-101-proba"],
        f"файл {os.path.exists(zahv)} копий {[x['kind'] for x in chitat('kopii') if x.get('id') == 'cw-101-proba']}")
    tochka = f"{SP}/vyhod/.chuzhoj.json"
    open(tochka, "w").write(json.dumps({"v": 1, "conversation_id": 101, "na": "net-takogo", "text": "точечный", "written_at": time.time()}))
    time.sleep(1.5)
    sud("P27 vyhod/.*.json — адаптер не трогает: файл на месте, не в otkaz, не отправлен",
        os.path.exists(tochka) and not os.path.exists(f"{SP}/vyhod/otkaz/.chuzhoj.json")
        and not [p for p in posty if p["body"].get("content") == "точечный"],   # только свой текст: чужой автоответ P25 не в счёт (гонка с r6)
        f"на месте {os.path.exists(tochka)} otkaz {os.path.exists(f'{SP}/vyhod/otkaz/.chuzhoj.json')} постов «точечный» {len([p for p in posty if p['body'].get('content') == 'точечный'])}")
    # ── r9: повтор того же ответа и неизвестный исход отправки (стык Альфы, п.5) ──
    def otv(imya, tekst):
        zapisat_otvet(imya, {"v": 1, "conversation_id": 101, "na": na_A, "text": tekst, "written_at": time.time()})

    def postov(tekst):
        return len([p for p in posty if p["body"].get("content") == tekst])
    otv("povtor", "Повтор-1"); zhdat(lambda: not os.path.exists(f"{SP}/vyhod/povtor.json")); time.sleep(0.4)
    otv("povtor", "Повтор-1"); zhdat(lambda: not os.path.exists(f"{SP}/vyhod/povtor.json")); time.sleep(0.6)
    sud("P28 тот же ответ (то же имя vyhod) записан повторно после отправки → в Chatwoot ровно один POST, второй файл убран",
        postov("Повтор-1") == 1 and not os.path.exists(f"{SP}/vyhod/povtor.json") and "уже отправлялся" in zhurnal(),
        f"POST {postov('Повтор-1')}")
    t5 = trevog(); CW_POST["obryv"] = 1
    otv("obryv", "Обрыв-1"); zhdat(lambda: os.path.exists(f"{SP}/vyhod/otkaz/obryv.json"), 4); time.sleep(1.0)
    sud("P29 обрыв на отправке (исход неизвестен) → слепого повтора нет: POST ровно один, файл в otkaz, одна тревога",
        postov("Обрыв-1") == 1 and os.path.exists(f"{SP}/vyhod/otkaz/obryv.json") and trevog() == t5 + 1,
        f"POST {postov('Обрыв-1')} otkaz {os.path.exists(f'{SP}/vyhod/otkaz/obryv.json')} тревог {trevog() - t5}")
    CW_POST["500"] = 2
    otv("pyatsot", "Пятьсот-1"); zhdat(lambda: not os.path.exists(f"{SP}/vyhod/pyatsot.json"), 6); time.sleep(0.4)
    sud("P30 Chatwoot ответил 500 дважды (исход известен: не принято) → повтор, ровно один принятый POST, файл убран, не в otkaz",
        postov("Пятьсот-1") == 1 and not os.path.exists(f"{SP}/vyhod/pyatsot.json") and not os.path.exists(f"{SP}/vyhod/otkaz/pyatsot.json"),
        f"POST {postov('Пятьсот-1')}")
    db = sqlite3.connect(f"{rab}/db/adapter.db", timeout=5)
    db.execute("INSERT INTO otpravleno(imya,at,ishod) VALUES('padenie.json',?,'v-polyote')", (time.time(),)); db.commit(); db.close()
    otv("padenie", "Падение-1"); zhdat(lambda: os.path.exists(f"{SP}/vyhod/otkaz/padenie.json"), 4); time.sleep(0.4)
    sud("P31 отметка «в полёте» от прежнего запуска (падение во время отправки) → не повторяет: POST нет, файл в otkaz",
        postov("Падение-1") == 0 and os.path.exists(f"{SP}/vyhod/otkaz/padenie.json"), f"POST {postov('Падение-1')}")
    # ── r14 (Аврора): повтор ответа ТОЛЬКО на 429/5xx; прочие 4xx → otkaz + тревога; received_at = created_at ──
    t6 = trevog(); CW_KOD["Удалён-1"] = (404, None)
    otv("udalen", "Удалён-1"); zhdat(lambda: os.path.exists(f"{SP}/vyhod/otkaz/udalen.json"), 4); time.sleep(4.5)
    sud("P39 Chatwoot ответил 404 (удалённый разговор) → без повтора: попытка ровно одна за 4,5 с, файл в otkaz, одна тревога",
        popytki.get("Удалён-1") == 1 and os.path.exists(f"{SP}/vyhod/otkaz/udalen.json") and not os.path.exists(f"{SP}/vyhod/udalen.json")
        and trevog() == t6 + 1,
        f"попыток {popytki.get('Удалён-1')} otkaz {os.path.exists(f'{SP}/vyhod/otkaz/udalen.json')} тревог {trevog() - t6}")
    CW_KOD["Лимит-1"] = (429, 2)
    otv("limit", "Лимит-1"); zhdat(lambda: not os.path.exists(f"{SP}/vyhod/limit.json"), 6); time.sleep(0.4)
    sud("P40 Chatwoot ответил 429 дважды (временно) → повтор: попыток 3, принят один POST, файл убран, не в otkaz",
        popytki.get("Лимит-1") == 3 and postov("Лимит-1") == 1 and not os.path.exists(f"{SP}/vyhod/limit.json")
        and not os.path.exists(f"{SP}/vyhod/otkaz/limit.json"), f"попыток {popytki.get('Лимит-1')} POST {postov('Лимит-1')}")
    # разговор 101 уже живой: новый разговор после P37 (31 оживший) отсекается пределом SAJT_MAX_LIVE=20 → в vhod не попал бы
    mid_p = dobavit(101, "повторный разбор"); kid_p = f"cw-101-{mid_p}"; fp = f"{SP}/vhod/{kid_p}.json"
    zhdat(lambda: os.path.exists(fp), 4); time.sleep(0.3)
    raw_a = open(fp, "rb").read() if os.path.exists(fp) else b""
    pr.send_signal(signal.SIGSTOP); time.sleep(0.3)   # падение между конвертом и отметками: конверт забран, dostavki и курсор — как до разбора
    if os.path.exists(fp):
        os.unlink(fp)
    db = sqlite3.connect(f"{rab}/db/adapter.db", timeout=5)
    db.execute("DELETE FROM dostavki WHERE id=?", (kid_p,)); db.execute("UPDATE kursor SET akt=0 WHERE conv=101"); db.commit(); db.close()
    time.sleep(1.1); pr.send_signal(signal.SIGCONT)
    zhdat(lambda: os.path.exists(fp), 6); time.sleep(0.3)
    raw_b = open(fp, "rb").read() if os.path.exists(fp) else b""
    sozd = [m for m in RAZG[101]["msgs"] if m["id"] == mid_p][0]["created_at"]
    sud("P41 повторный разбор того же сообщения (падение до отметки dostavki) → конверт побайтно тот же, received_at = created_at",
        bool(raw_a) and raw_a == raw_b and json.loads(raw_a).get("received_at") == sozd,
        ("СЛЕПОТА пробы: первый конверт не появился в vhod; " if not raw_a else "") + f"A {len(raw_a)} Б, B {len(raw_b)} Б, равны {raw_a == raw_b}, received_at {json.loads(raw_a).get('received_at') if raw_a else '—'} / created_at {sozd}")
    # ── r15 (Аврора, хвост Искры 23:14Z): копия kopii при повторном разборе — те же байты (at = created_at, причина без счётчиков).
    # Копия оператора: её не режет предел копий — повторная запись гарантирована, иначе проба была бы слепой.
    mid_k = dobavit(101, "ответ оператора на сайте", mt=1, sender="user"); kid_k = f"cw-101-{mid_k}"; fk = f"{SP}/kopii/operator-{kid_k}.json"
    zhdat(lambda: os.path.exists(fk), 4); time.sleep(0.3)
    kop_a = open(fk, "rb").read() if os.path.exists(fk) else b""
    pr.send_signal(signal.SIGSTOP); time.sleep(0.3)
    if os.path.exists(fk):
        os.unlink(fk)
    db = sqlite3.connect(f"{rab}/db/adapter.db", timeout=5)
    db.execute("DELETE FROM dostavki WHERE id=?", (kid_k,)); db.execute("UPDATE kursor SET akt=0 WHERE conv=101"); db.commit(); db.close()
    time.sleep(1.1); pr.send_signal(signal.SIGCONT)
    zhdat(lambda: os.path.exists(fk), 6); time.sleep(0.3)
    kop_b = open(fk, "rb").read() if os.path.exists(fk) else b""
    sozd_k = [m for m in RAZG[101]["msgs"] if m["id"] == mid_k][0]["created_at"]
    sud("P42 повторный разбор → копия kopii побайтно та же, at = created_at сообщения",
        bool(kop_a) and kop_a == kop_b and json.loads(kop_a).get("at") == sozd_k,
        ("СЛЕПОТА пробы: первая копия не появилась в kopii; " if not kop_a else "") +
        f"A {len(kop_a)} Б, B {len(kop_b)} Б, равны {kop_a == kop_b}, at {json.loads(kop_a).get('at') if kop_a else '—'} / created_at {sozd_k}")
    # ── r10: номер n в подписанном теле push — строго растёт по всем отправкам, включая останов и перезапуск (P24/P25) ──
    ns = [x["body"].get("n") for x in shlyuz]
    sud("P32 push шлюзу: в каждом подписанном теле номер n, строго растущий через весь прогон (с остановом и перезапуском)",
        len(ns) > 10 and all(isinstance(v, int) for v in ns) and all(b > a for a, b in zip(ns, ns[1:])) and all(x["podpis"] for x in shlyuz),
        f"всего {len(ns)}, без n {sum(1 for v in ns if not isinstance(v, int))}, нарушений {sum(1 for a, b in zip(ns, ns[1:]) if isinstance(a, int) and isinstance(b, int) and b <= a)}")
    # ── r11: страницы. Стенд держит SAJT_STRANIC=1 (одна страница за проход) — остаток обязан дочитаться следующими проходами ──
    def dostavleno(conv):
        db = sqlite3.connect(f"{rab}/db/adapter.db", timeout=5)
        n = db.execute("SELECT COUNT(*) FROM dostavki WHERE id LIKE ?", (f"cw-{conv}-%",)).fetchone()[0]; db.close(); return n
    with LOCK:
        for i in range(150):
            dobavit(401, f"всплеск {i}")
    zhdat(lambda: dostavleno(401) >= 150, 10)
    sud("P33 всплеск 150 сообщений в один разговор между опросами → учтены ВСЕ 150 (страницами after, по одной за проход)",
        dostavleno(401) == 150, f"учтено {dostavleno(401)} из 150")
    dobavit(101, "поздний commit", mid=4000)       # id меньше всех выданных, created_at — сейчас
    zhdat(lambda: any(x.get("text") == "поздний commit" for x in chitat("vhod") + chitat("kopii")), 4)
    sud("P34 поздний commit (id меньше курсора, свежий created_at) → пойман сверочным проходом последних 20",
        any(x.get("text") == "поздний commit" for x in chitat("vhod") + chitat("kopii")), "не пойман")
    dobavit(900, "новое в старом разговоре")
    # «доставлено» = vhod ИЛИ kopii: к этому мигу живых разговоров больше предела стенда (8), новое законно уходит копией
    zhdat(lambda: any(x.get("text") == "новое в старом разговоре" for x in chitat("vhod") + chitat("kopii")), 4); time.sleep(0.6)
    sud("P35 активность в разговоре, бывшем до первого запуска → доставлено только новое, история до запуска не проиграна сверкой",
        any(x.get("text") == "новое в старом разговоре" for x in chitat("vhod") + chitat("kopii"))
        and not any(x.get("text") == "старое сообщение до запуска адаптера" for x in chitat("vhod") + chitat("kopii")), "")
    def kursor_akt(conv):
        db = sqlite3.connect(f"{rab}/db/adapter.db", timeout=5)
        r = db.execute("SELECT akt FROM kursor WHERE conv=?", (conv,)).fetchone(); db.close(); return r[0] if r else -1
    # ── r13: больше страницы оживших разговоров (25 на страницу) и второе сообщение в ту же целую секунду ──
    pr.send_signal(signal.SIGSTOP); time.sleep(0.3)
    for c in range(601, 632):
        dobavit(c, f"разговор {c}")
    pr.send_signal(signal.SIGCONT)
    zhdat(lambda: all(dostavleno(c) >= 1 for c in range(601, 632)), 12)
    nevid = [c for c in range(601, 632) if dostavleno(c) < 1]
    sud("P37 31 разговор ожил между опросами (больше страницы 25) → увидены все 31", not nevid, f"не увидены {nevid}")
    sekunda = None
    for popytka in range(4):
        cnv = 701 + popytka
        while time.time() % 1 > 0.1:
            time.sleep(0.01)
        t0 = int(time.time()); dobavit(cnv, "первое")
        # ждём, пока адаптер ДОЧИТАЛ разговор: курсор записан с akt ≥ t0−1: бой пишет t0, r13 — t0−1; до дочитки — 0 (стенд держит SAJT_STRANIC=1 — дочитка вторым проходом)
        zhdat(lambda: kursor_akt(cnv) >= t0 - 1, 0.85)
        if dostavleno(cnv) >= 1 and kursor_akt(cnv) >= t0 - 1 and int(time.time()) == t0:
            dobavit(cnv, "второе в ту же секунду"); sekunda = (cnv, t0)
            if int(RAZG[cnv]["akt"]) == t0:
                break
        sekunda = None
    if sekunda:
        zhdat(lambda: dostavleno(sekunda[0]) >= 2, 8)
    sud("P38 второе сообщение в ту же целую секунду, что первое (уже прочитанное) → тоже учтено",
        bool(sekunda) and dostavleno(sekunda[0]) == 2,
        f"разговор {sekunda} учтено {dostavleno(sekunda[0]) if sekunda else '—'} из 2" if sekunda else "СЛЕПОТА пробы: не уложила оба в одну секунду за 4 попытки")
    # ── P43–P46 (B-N-1860, Заря): отбой тревоги шлюза виджета — после сбоя ОДНА строка «✅ … снова принимает» тем же каналом,
    #    следующие такты молчат; без сбоя отбоя нет. Канал — заглушка стенда (ALERT_LOG), боевой не зовётся.
    def stroki(obr):
        return sum(1 for l in (open(ALERT_LOG).read().splitlines() if os.path.exists(ALERT_LOG) else []) if obr in l)
    KR, OT = "шлюз виджета Марка не принимает", "✅ sajt-chat: шлюз виджета Марка снова принимает"
    k0, o0 = stroki(KR), stroki(OT); time.sleep(3)
    sud("P43 шлюз исправен — ни красной о шлюзе, ни отбоя (3 с, сердцебиение 1 с)",
        stroki(KR) == k0 and stroki(OT) == o0 == 0, f"красных +{stroki(KR) - k0}, отбоев {stroki(OT)}")
    GW_SBOJ[0] = True
    zhdat(lambda: stroki(KR) >= k0 + 1, 6)
    sud("P44 шлюз лёг (503) — ровно одна красная «не принимает», отбоя нет",
        stroki(KR) == k0 + 1 and stroki(OT) == 0, f"красных +{stroki(KR) - k0}, отбоев {stroki(OT)}")
    GW_SBOJ[0] = False
    zhdat(lambda: stroki(OT) >= 1, 6)
    sud("P45 шлюз поднялся — ровно один отбой «✅ … снова принимает», новой красной нет",
        stroki(OT) == 1 and stroki(KR) == k0 + 1 and "✅ отбой [shlyuz]" in zhurnal(), f"отбоев {stroki(OT)}, красных +{stroki(KR) - k0}")
    time.sleep(3)
    sud("P46 следующие такты (3 с) — отбой не повторён", stroki(OT) == 1, f"отбоев {stroki(OT)}")
    # ── r11 (Аврора): формат шлюза Марка — каждая отправка принята его правилом; сам приёмник отказывает повтору n и ISO-метке ──
    pr.send_signal(signal.SIGSTOP); time.sleep(0.5)   # адаптер на паузе: его сердцебиение не вклинится между «последнее принятое» и повтором
    ne_prin = [x for x in shlyuz if not x["prinyat"]]
    gw_url = open(f"{ETC}/shlyuz-url").read().strip()
    def kod(telo, sig=None):
        r = urllib.request.Request(gw_url, data=telo, method="POST", headers={"Content-Type": "application/json",
            "X-Ostrov-Signature": sig or "sha256=" + hmac.new(GSEC.encode(), telo, hashlib.sha256).hexdigest()})
        try:
            return urllib.request.urlopen(r, timeout=3).status
        except urllib.error.HTTPError as e:
            return e.code
    prin = [x for x in shlyuz if x["prinyat"]]
    posl = prin[-1]["raw"] if prin else b"{}"
    do_povtora = len(prinyato)
    k_povtor = kod(posl)
    povtor_bez_priema = len(prinyato) == do_povtora
    k_staryj = kod(json.dumps({"otkryto": True, "s": int(time.time()), "n": prinyato[-1][0] - 1 if prinyato else 1}).encode())
    k_iso = kod(json.dumps({"otkryto": True, "s": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "n": 10 ** 15}).encode())
    k_chislo = kod(json.dumps({"otkryto": False, "s": int(time.time()), "n": 10 ** 15}).encode())
    sud("P36 формат Марка: все отправки адаптера приняты (X-Ostrov-Signature над сырым телом, s числом, n растёт); "
        "приёмник (модель gate.py Марка): точный повтор — 200 без приёма, старый n — 400, ISO-метка — 400, верное «закрыто» — 200",
        bool(shlyuz) and not ne_prin and k_povtor == 200 and povtor_bez_priema and k_staryj == 400 and k_iso == 400 and k_chislo == 200,
        f"не принято {len(ne_prin)} из {len(shlyuz)} {[x['body'] for x in ne_prin[:2]]}; повтор {k_povtor} (без приёма {povtor_bez_priema}), старый n {k_staryj}, ISO {k_iso}, число {k_chislo}")
    pr.send_signal(signal.SIGCONT)
finally:
    pr.terminate()
    try:
        pr.wait(5)
    except subprocess.TimeoutExpired:
        pr.kill()
    cw.shutdown(); gw.shutdown()
subprocess.run(["rm", "-rf", rab])
print(f"\nитог: {ok} из {ok + fail}")
ZHDYOM = 50
if ok + fail != ZHDYOM:
    print(f"🔴 КАНАРЕЙКА: проб {ok + fail}, ждём {ZHDYOM}"); sys.exit(2)
sys.exit(1 if fail else 0)
