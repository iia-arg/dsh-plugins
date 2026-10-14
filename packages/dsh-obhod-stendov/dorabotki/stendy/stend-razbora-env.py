#!/usr/bin/env python3
# Стенд РАЗБОРА EnvironmentFile в agent-registry (B-H-081 Ш6, условие Вениамина а/б, 30.09.2026, Аврора).
# Истина — сам systemd: временный юнит `systemd-run --wait --pipe -p EnvironmentFile=<файл> env -0`. Сверяются
# (1) подставной файл со всеми трудными случаями и (2) все /etc/claude-oauth/instance-*.env.
# Значения сравниваются СУММОЙ; печатаются только имена ключей и «равно/не равно» (в env могут быть секреты).
# КОДЫ: 0 — разбор = systemd везде · 1 — расхождение (имена ключей) · 2 — слепота (нет root/systemd-run/функции/предмета).
# Запуск: под root (systemd-run). Путь к инструменту — INSTR (умолчание /usr/local/bin/agent-registry).
import glob, hashlib, importlib.machinery, importlib.util, os, re, subprocess, sys, tempfile
INSTR = os.environ.get("INSTR", "/usr/local/bin/agent-registry")
FIXTURE = '# комментарий решёткой\n; комментарий точкой с запятой\n   # комментарий с отступом\nT01=plain\nT02="dq value"\nT03=\'sq value\'\nT04=a\\ b\nT05=line1\\\ncont\n  T06  =  spaced  \nexport T07=exported\nT08=first\nT08=second\nT09=val # хвост\nT10="dq \\"esc\\" and \\\\ back"\nT11=\'sq \\ back\'\nT12=trail   \nT13=${HOME}x\nT14= "  lead"\nT15=a"b"c\nT16=\nT17="multi\nline"\nT18=tab\tinside\nT19=semi;colon\nT20=eq=in=value\nbad line without equals\nT21=last\nT22=keep\\ \nT23=\'a\'b\n# комментарий с косой в конце \\\nT24=poglocheno\nT25=\\x41\nT26="a"   "b"\nT27=  \\  lead\nT28="dq \\n не перевод"\nT29=a\\\\\nT30=end\n'
def slep(t): print("СЛЕПОТА: " + t); sys.exit(2)
if os.geteuid() != 0: slep("нужен root (systemd-run) — стенд под " + str(os.geteuid()))
try:
    l = importlib.machinery.SourceFileLoader("ar_stend", INSTR); sp = importlib.util.spec_from_loader("ar_stend", l)
    m = importlib.util.module_from_spec(sp); l.exec_module(m); razb = m._razobrat_env
except AttributeError: slep(INSTR + ": функции _razobrat_env нет (инструмент старше Ш6)")
except Exception as e: slep(INSTR + ": не загрузился — " + type(e).__name__)
h = lambda v: hashlib.sha256(v.encode("utf-8")).hexdigest()
def systemd(put):
    r = subprocess.run(["systemd-run", "--wait", "--pipe", "--quiet", "--collect", "-p", "EnvironmentFile=" + put,
                        "/usr/bin/env", "-0"], capture_output=True, timeout=60)
    if r.returncode != 0: return None
    return {k: h(v) for k, v in (x.split("=", 1) for x in r.stdout.decode("utf-8", "replace").split("\0") if "=" in x)}
bed = 0
def sverit(imya, put, tekst):
    global bed
    sd = systemd(put)
    if sd is None: slep(imya + ": systemd-run не отработал")
    my = {k: h(v) for k, v in razb(tekst).items()}
    if not my: slep(imya + ": разбор не дал ни одной пары — предмет пуст или не прочитан")
    raz = sorted(k for k in my if sd.get(k) != my[k])
    # ключ, который systemd принял, а разбор потерял: только объявленные В ФАЙЛЕ (не PATH/HOME/INVOCATION_ID среды юнита)
    lishn = sorted(k for k in sd if k not in my and re.search(r"(?m)^[ \t]*" + re.escape(k) + r"[ \t]*=", tekst))
    ok = not raz and not lishn
    bed += not ok
    print(f"  {'ok  ' if ok else 'FAIL'} {imya}: ключей {len(my)}" + ("" if ok else f" — не равно: {raz + lishn}"))
# B-N-1410 (02.10, Заря): подставной env — в /run, а не в /tmp: юнит обхода идёт с PrivateTmp=true, а systemd-run поднимает юнит
# в пространстве машины — файла из частного /tmp он не видит («systemd-run не отработал», ночь 02.10). /run PrivateTmp не прячет.
fd, put = tempfile.mkstemp(prefix="stend-razbora-env-", suffix=".env", dir="/run"); os.write(fd, FIXTURE.encode("utf-8")); os.close(fd)
try: sverit("подставной", put, FIXTURE)
finally: os.unlink(put)
envy = sorted(glob.glob("/etc/claude-oauth/instance-*.env"))
if not envy: slep("нет /etc/claude-oauth/instance-*.env")
for p in envy: sverit(os.path.basename(p), p, open(p, encoding="utf-8").read())
print(f"ИТОГ: файлов {1 + len(envy)}, расхождений {bed}")
sys.exit(1 if bed else 0)
