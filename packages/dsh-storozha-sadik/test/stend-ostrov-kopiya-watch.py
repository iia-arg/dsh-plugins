#!/usr/bin/env python3
"""СТЕНД сторожа ostrov-kopiya-watch (B-N-2018, Аврора, 12.10.2026).

Предмет: довод 1, иначе БОЕВОЙ /usr/local/sbin/ostrov-kopiya-watch. Запускается отдельным процессом со ВСЕМИ подменами OKW_*:
копия, health (свой HTTP на 127.0.0.1), каталоги релизов, полка архивов, состояние — во временном каталоге; канал — заглушка,
пишущая след в файл. Боевые копия, сайт, дом Марка и agent-alert не трогаются.
Пробы: П1 исправное молчит · П2 разошлось → тревога с парой релизов и строками tar+установщик (пути — shlex) · П3 та же пара —
без повтора · П3б сутки спустя — повтор · П4 копия обновлена → «снова в порядке» · П4б дальше молчит · П5 health 500 → СЛЕПОТА,
не «в порядке» · П5б та же слепота — без повтора · П5в health 503 (другой текст, тот же класс) — без повтора · П6 ISTOCHNIK ≠
manifest → СЛЕПОТА · П6б слепота снята → одна «снова видит» · П6в дальше молчит · П7 канал отказал → следующий такт
повторяет · П8 архив на полке → строка с ним, без tar · П9 релиз не найден → «не найден», без tar.
Коды: 0 — все пробы; 1 — красные; 2 — слепота стенда.
ЧЕГО НЕ ЛОВИТ: настоящий сайт и настоящий установщик (строки только печатаются); таймер и юнит.
"""
import http.server
import json
import hashlib
import io
import os
import shlex
import subprocess
import sys
import tempfile
import threading
import tarfile

sys.dont_write_bytecode = True
P = sys.argv[1] if len(sys.argv) > 1 else "/usr/local/sbin/ostrov-kopiya-watch"
if not os.access(P, os.R_OK):
    print(f"СЛЕПОТА: предмет не читается: {P}"); sys.exit(2)
A, B = "aaaaaaaaaaaa", "bbbbbbbbbbbb"
T = tempfile.mkdtemp(prefix="stend-okw-")
SAJT = {"rel": A, "kod": 200}


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        telo = json.dumps({"ok": True, "release": SAJT["rel"]}).encode()
        self.send_response(SAJT["kod"]); self.end_headers(); self.wfile.write(telo)

    def log_message(self, *a):
        pass


srv = http.server.HTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

KOP = os.path.join(T, "ostrov-api")
SLED = os.path.join(T, "kanal.sled")
OTKAZ = os.path.join(T, "kanal.otkaz")
KANAL = os.path.join(T, "kanal")
with open(KANAL, "w") as f:
    f.write(f'#!/bin/sh\n[ -e {shlex.quote(OTKAZ)} ] && exit 1\nprintf "%s\\n\\036\\n" "$3" >> {shlex.quote(SLED)}\n')
os.chmod(KANAL, 0o755)
MARC = os.path.join(T, "marc")
REL_KAT = os.path.join(MARC, "w 1;touch zlo", "accounts-release")   # имя с пробелом и «;» — строка обязана быть закавычена
os.makedirs(os.path.join(REL_KAT, "deployment")); os.makedirs(os.path.join(REL_KAT, "candidate", "app"))
with open(os.path.join(REL_KAT, "deployment", "manifest.json"), "w") as f:
    json.dump({"artifact": B, "files": {}}, f)
POLKA = os.path.join(T, "polka")
os.makedirs(os.path.join(T, "backups", "x"))
ENV = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", OKW_KOPIYA=KOP, OKW_HEALTH=f"http://127.0.0.1:{srv.server_port}/h",
           OKW_KATALOG=os.path.join(T, "sost"), OKW_KANAL=KANAL, OKW_RELIZY=os.path.join(MARC, "*", "*", "deployment", "manifest.json"),
           OKW_ARHIVY=os.path.join(T, "backups", "*", "ostrov-api-{rel}-raskladka.tar.gz"), OKW_POLKA=POLKA)


def kopiya(rel_ist, rel_man=None):
    os.makedirs(KOP, exist_ok=True)
    with open(os.path.join(KOP, "ISTOCHNIK"), "w") as f:
        f.write(f"архив /x.tar.gz\nsha256 0\nрелиз {rel_ist}\nустановлено 2026-10-12 00:00:00Z\n")
    with open(os.path.join(KOP, "manifest.json"), "w") as f:
        json.dump({"artifact": rel_man or rel_ist, "files": {}}, f)


def takt(bez_maski=False):
    n0 = sled_n()
    env = dict(ENV)
    cmd = [sys.executable, "-B", P]
    if bez_maski:
        env.pop("OKW_RELIZY")
        # Map the external workspace boundary, preserving the candidate's default masks.
        wrapper = os.path.join(T, "default-masks.py")
        with open(wrapper, "w") as f:
            f.write("import glob,runpy,sys\nreal=glob.glob\nglob.glob=lambda p: real(p.replace('/opt/marc/workspace',sys.argv[2]))\nrunpy.run_path(sys.argv[1],run_name='__main__')\n")
        cmd = [sys.executable, "-B", wrapper, P, MARC]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        print(f"СЛЕПОТА: предмет код {r.returncode}: {r.stderr.strip()[-300:]}"); sys.exit(2)
    return r.stdout.strip(), sled()[n0:]


def sled():
    try:
        return [x.strip("\n") for x in open(SLED, encoding="utf-8").read().split("\x1e\n") if x.strip()]
    except FileNotFoundError:
        return []


def sled_n():
    return len(sled())


ITOG = []


def proba(imya, uslovie, pochemu):
    ITOG.append(uslovie)
    print(("✅ " if uslovie else "❌ ") + imya + ("" if uslovie else f" — {pochemu}"))


kopiya(A)
out, t = takt()
proba("П1 исправное молчит", t == [] and "в порядке" in out, f"тревог {len(t)}, вывод {out!r}")
SAJT["rel"] = B
out, t = takt()
st = [x for x in (t[0].splitlines() if t else []) if x.startswith("sudo ")]
tar = next((shlex.split(x) for x in st if " tar " in x), None)
proba("П2 разошлось → тревога со строками и crm-caller", len(t) == 1 and f"копия {A}, сайт {B}" in t[0] and "РАЗОШЛОСЬ" in out
      and "stend-crm-caller" in t[0] and tar is not None and REL_KAT in tar and "--exclude=__pycache__" in tar and any("kopiya-ostrov-api.sh" in x and B in x for x in st),
      f"тревог {len(t)}, строки {st}")
out, t = takt()
proba("П3 та же пара — без повтора", t == [] and "РАЗОШЛОСЬ" in out, f"тревог {len(t)}")
s = json.load(open(os.path.join(T, "sost", "sostoyanie.json")))
if "beda" in s:   # нет отметки — П3б покраснеет сама, без падения стенда
    s["beda"]["t"] -= 86400
    json.dump(s, open(os.path.join(T, "sost", "sostoyanie.json"), "w"))
out, t = takt()
proba("П3б сутки спустя — повтор", len(t) == 1 and "ОТСТАЛА" in t[0], f"тревог {len(t)}")
kopiya(B)
out, t = takt()
proba("П4 снятие → «снова в порядке»", len(t) == 1 and "снова в порядке" in t[0] and "в порядке" in out, f"тревог {t}")
out, t = takt()
proba("П4б дальше молчит", t == [], f"тревог {t}")
SAJT["kod"] = 500
out, t = takt()
proba("П5 health 500 → СЛЕПОТА", len(t) == 1 and "СЛЕПОТА" in t[0] and "СЛЕПОТА" in out and "в порядке" not in out, f"{out!r} {t}")
out, t = takt()
proba("П5б та же слепота — без повтора", t == [] and "СЛЕПОТА" in out, f"тревог {len(t)}")
SAJT["kod"] = 503
out, t = takt()
proba("П5в health 503 — тот же класс, без повтора", t == [] and "503" in out, f"тревог {len(t)}, {out!r}")
SAJT["kod"] = 200
kopiya(B, A)
out, t = takt()
proba("П6 ISTOCHNIK ≠ manifest → СЛЕПОТА", len(t) == 1 and "≠ manifest.json artifact" in t[0], f"{out!r} {t}")
kopiya(B)
out, t = takt()
proba("П6б слепота снята → одна «снова видит»", len(t) == 1 and "снова видит" in t[0] and "в порядке" in out, f"{out!r} {t}")
out, t = takt()
proba("П6в дальше молчит", t == [], f"тревог {t}")
kopiya(A)
open(OTKAZ, "w").close()
out, t = takt()
proba("П7а канал отказал — тревога не дошла", t == [] and "НЕ ДОШЛА" in out, f"{out!r}")
os.unlink(OTKAZ)
out, t = takt()
proba("П7б следующий такт повторяет", len(t) == 1 and "ОТСТАЛА" in t[0], f"тревог {len(t)}")
arh = os.path.join(T, "backups", "x", f"ostrov-api-{B}-raskladka.tar.gz")
open(arh, "w").close()
kopiya("cccccccccccc")
out, t = takt()
st = [x for x in (t[0].splitlines() if t else []) if x.startswith("sudo ")]
proba("П8 архив на полке → строка с ним, без tar", len(t) == 1 and len(st) == 1 and arh in shlex.split(st[0]) and " tar " not in t[0], f"{st}")
os.unlink(arh)
SAJT["rel"] = "dddddddddddd"
out, t = takt()
proba("П9 релиз не найден → «не найден», без tar", len(t) == 1 and "не найден" in t[0] and " tar " not in t[0], f"{t}")

# A packaged release has no external deployment/manifest.json.
packed = os.path.join(MARC, "w 2;touch zlo", "deployment", "candidate-08853c4a5871.tar")
os.makedirs(os.path.dirname(packed))
ENV["OKW_RELIZY"] += ":" + os.path.join(MARC, "*", "deployment", "candidate-*.tar")
SAJT["rel"] = "08853c4a5871"
def packed_write(mutation=None):
    data = b"# server\n"
    manifest = {"artifact": "ffffffffffff" if mutation == "artifact" else SAJT["rel"],
                "files": {"server.py": hashlib.sha256(data).hexdigest()}}
    if mutation == "no_server":
        manifest["files"] = {"README.txt": hashlib.sha256(data).hexdigest()}
    if mutation == "file_parent":
        manifest["files"]["server.py/nested.txt"] = hashlib.sha256(b"nested").hexdigest()
    if mutation in ("symlink", "device"):
        manifest["files"]["forbidden"] = hashlib.sha256(data if mutation == "symlink" else b"").hexdigest()
    with tarfile.open(packed, "w") as a:
        rows = [("manifest.json", json.dumps(manifest).encode()), ("app/README.txt" if mutation == "no_server" else "app/server.py", b"changed" if mutation == "hash" else data)]
        if mutation == "extra": rows.append(("app/extra.txt", b"extra"))
        if mutation == "file_parent": rows.append(("app/server.py/nested.txt", b"nested"))
        for name, body in rows:
            m = tarfile.TarInfo(name); m.size = len(body); a.addfile(m, io.BytesIO(body))
        if mutation == "dir_parent":
            m = tarfile.TarInfo("app/server.py/emptydir"); m.type = tarfile.DIRTYPE; a.addfile(m)
        if mutation in ("symlink", "device"):
            m = tarfile.TarInfo("app/forbidden")
            if mutation == "symlink": m.type = tarfile.SYMTYPE; m.linkname = "server.py"
            else: m.type = tarfile.CHRTYPE; m.devmajor = 1; m.devminor = 3
            a.addfile(m)
def new_pair():
    s = json.load(open(os.path.join(T, "sost", "sostoyanie.json"))); s.pop("beda", None)
    json.dump(s, open(os.path.join(T, "sost", "sostoyanie.json"), "w"))
packed_write();new_pair()
out,t=takt();st=[x for x in (t[0].splitlines() if t else []) if x.startswith("sudo ")]
proba("П10 tar Марка → одна готовая строка без перепаковки", len(t)==1 and len(st)==1 and packed in shlex.split(st[0]) and SAJT["rel"] in shlex.split(st[0]) and " tar " not in t[0], f"{st} {t}")
for mutation, why in [("extra", "extra.txt"), ("artifact", "ffffffffffff"), ("hash", "server.py"), ("no_server", "server.py"), ("file_parent", "server.py/nested.txt"), ("dir_parent", "server.py/emptydir")]:
    packed_write(mutation);new_pair();out,t=takt()
    st=[x for x in (t[0].splitlines() if t else []) if x.startswith("sudo ")]
    proba("П11 tar порча " + mutation + " → именованный отказ без готовой строки", len(t)==1 and packed in t[0] and why in t[0] and all(packed not in shlex.split(x) for x in st), f"{st} {t}")
for mutation in ("symlink", "device"):
    packed_write(mutation);new_pair();out,t=takt()
    st=[x for x in (t[0].splitlines() if t else []) if x.startswith("sudo ")]
    proba("П14 tar " + mutation + " → нерегулярный предмет без строки установки", len(t)==1 and packed in t[0] and "нерегулярный предмет app/forbidden" in t[0] and st==[], f"{st} {t}")
packed_write();new_pair();out,t=takt()
st=[x for x in (t[0].splitlines() if t else []) if x.startswith("sudo ")]
proba("П12 tar возврат → снова готовая строка", len(st)==1 and packed in shlex.split(st[0]), f"{st}")
new_pair();out,t=takt(bez_maski=True)
st=[x for x in (t[0].splitlines() if t else []) if x.startswith("sudo ")]
proba("П13 штатные маски находят tar без OKW_RELIZY", len(st)==1 and packed in shlex.split(st[0]), f"{st}")
proba("П0 «;» из имени каталога не исполнялось", not os.path.exists(os.path.join(T, "zlo")) and not os.path.exists("zlo"), "файл zlo появился")
srv.shutdown()
ok = sum(ITOG)
print(f"ИТОГ: {ok} из {len(ITOG)}")
subprocess.run(["rm", "-rf", "--", T])
sys.exit(0 if ok == len(ITOG) else 1)
