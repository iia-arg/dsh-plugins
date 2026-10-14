#!/bin/bash
# СТЕНД B-N-1260/B-N-1266 (30.09.2026, Заря): model-podmena-watch — сторож подмены модели агента (Claude «модель X ≠ запрошена Y»,
# Codex «МОДЕЛЬ ПОДМЕНЕНА СЕРВЕРОМ», непустые remote-settings.json, слепота по юниту, рубеж только при доставке, остывание).
# 13 проб, каждый случай — отдельный такт предмета над общим состоянием во временном каталоге.
# Подставные: journalctl (записи из файла), systemctl (учётка из имени юнита), канал тревог (текст → файл), дома с remote-settings.
# Из реестра берётся снимок шлюзов; все дома подставные, включая новых гостей. Запуск: от iskra (своей учёткой обходчика), root не нужен.
# Предмет: MPW_PREDMET (по умолчанию боевой /usr/local/sbin/model-podmena-watch).
# 🔴 ПРЕДОХРАНИТЕЛЬ: предмет, не знающий подстановок MPW_KANAL/MPW_JOURNALCTL/MPW_SYSTEMCTL/MPW_KATALOG/MPW_DOMA, в прогоне
#   слал бы НАСТОЯЩИЕ тревоги владельцу (agent-alert), читал бы боевой журнал и писал боевое состояние — СЛЕПОТА, код 2, НЕ запуск.
# ГДЕ СЛЕП: предмет, который имена переменных содержит, но не читает (строки есть, кода нет); реестр без шлюзов — проба A покраснеет.
set -u
PREDMET=${MPW_PREDMET:-/usr/local/sbin/model-podmena-watch}
[ -r "$PREDMET" ] || { echo "СЛЕПОТА: предмета нет: $PREDMET"; exit 2; }
for k in MPW_KANAL MPW_JOURNALCTL MPW_SYSTEMCTL MPW_KATALOG MPW_DOMA MPW_REESTR; do
  grep -qF "\"$k\"" "$PREDMET" || { echo "СЛЕПОТА: предмет не знает $k — прогон задел бы боевой канал/журнал/состояние; не запускаю"; exit 2; }
done
echo "предмет: $PREDMET ($(sha256sum "$PREDMET" | cut -c1-16))"
exec python3 -B - "$PREDMET" <<'PY'
"""Стенд model-podmena-watch (B-N-1260, Заря). Запуск: python3 -B stend-model-podmena.py <сторож>
Подставные: journalctl (JSON-записи из файла, код задаётся), systemctl (учётка = хвост имени юнита), канал (текст → файл, код
задаётся), дома с .claude/remote-settings.json. Список шлюзов берётся из снимка реестра, дополненного тестовым гостем; настоящий реестр не меняется.
Каждый случай — отдельный такт сторожа (отдельный процесс) над общим состоянием, как в бою.
"""
import json, os, subprocess, sys, tempfile, shutil, hashlib, yaml

STOROZH = sys.argv[1]
T = tempfile.mkdtemp(prefix="stend-mpw-")
ok = vs = 0
def proba(imya, uslovie, podr=""):
    global ok, vs
    vs += 1; ok += bool(uslovie)
    print(("  ✅ " if uslovie else "  ❌ ") + imya + ("" if uslovie else " — " + str(podr)[:300]))

ZH, KAN = os.path.join(T, "zhurnal.jsonl"), os.path.join(T, "kanal.txt")
open(os.path.join(T, "journalctl"), "w").write('#!/bin/sh\necho "$@" >> "%s/jc-args"\ncat "%s"\nexit ${FAKE_JC_KOD:-0}\n' % (T, ZH))
open(os.path.join(T, "systemctl"), "w").write('#!/bin/sh\necho "$2" | sed -E "s/^claude-oauth-gateway@(.*)\\.service$/\\1/"\n')
open(os.path.join(T, "kanal"), "w").write('#!/bin/sh\nshift 2\nprintf "%%s\\n=====\\n" "$1" >> "%s"\nexit ${FAKE_KANAL_KOD:-0}\n' % KAN)
for f in ("journalctl", "systemctl", "kanal"):
    os.chmod(os.path.join(T, f), 0o755)
# Список заморожен на весь прогон: новый агент в бою не добавит настоящий дом между тактами.
REESTR_SRC = os.environ.get("MPW_REESTR", "/etc/agent-registry/agents.yaml")
try:
    raw = open(REESTR_SRC, "rb").read()
    registry = yaml.safe_load(raw)
    units = sorted({u for e in registry["agenty"] for u in e["namerenie"].get("zavisit_ot", [])
                    if isinstance(u, str) and u.endswith(".service") and
                    (u.startswith("claude-oauth-gateway@") or u.startswith("coder-gateway"))})
except Exception as e:
    shutil.rmtree(T, ignore_errors=True)
    print("СЛЕПОТА: снимок реестра не прочитан:", type(e).__name__); sys.exit(2)
print("реестр:", REESTR_SRC, "sha256=" + hashlib.sha256(raw).hexdigest())
EXTRA = "claude-oauth-gateway@mpw-stend-gost.service"
assert EXTRA not in units, "имя тестового шлюза занято в реестре"
REESTR = os.path.join(T, "registry.json")
with open(REESTR, "w") as stream:
    json.dump({"agenty": [{"namerenie": {"zavisit_ot": units + [EXTRA]}}]}, stream)
users = {"iskra", "zarya", "avrora", "spartak"}
users.update(u[len("claude-oauth-gateway@"): -len(".service")] for u in units + [EXTRA]
             if u.startswith("claude-oauth-gateway@"))
DOMA = {}
for u in sorted(users):
    dom = tempfile.mkdtemp(prefix="dom-", dir=T)
    d = os.path.join(dom, ".claude"); os.makedirs(d)
    open(os.path.join(d, "remote-settings.json"), "w").write("{}")
    DOMA[u] = dom

n = 0
def zapis(unit, msg):
    global n
    n += 1
    return json.dumps({"__CURSOR": f"c{n}", "__REALTIME_TIMESTAMP": str(1790800000000000 + n), "_SYSTEMD_UNIT": unit, "MESSAGE": msg}, ensure_ascii=False)
def hod(x, y="claude-opus-5-5"):
    return f"модель {x} · effort: ветка anthropic · запрошен high · применён high · модель запрошена {y}"

def takt(stroki, jc_kod=0, kanal_kod=0):
    open(ZH, "w").write("\n".join(stroki) + ("\n" if stroki else ""))
    pered = open(KAN).read() if os.path.exists(KAN) else ""
    env = dict(os.environ, MPW_KATALOG=os.path.join(T, "sost"), MPW_KANAL=os.path.join(T, "kanal"),
               MPW_JOURNALCTL=os.path.join(T, "journalctl"), MPW_SYSTEMCTL=os.path.join(T, "systemctl"),
               MPW_DOMA=json.dumps(DOMA), MPW_REESTR=REESTR, FAKE_JC_KOD=str(jc_kod), FAKE_KANAL_KOD=str(kanal_kod))
    r = subprocess.run([sys.executable, "-B", STOROZH], capture_output=True, text=True, env=env, timeout=120)
    posle = open(KAN).read() if os.path.exists(KAN) else ""
    novye = [t for t in posle[len(pered):].split("\n=====\n") if t.strip()]
    s = json.load(open(os.path.join(T, "sost", "sostoyanie.json")))
    return r, novye, s
def remote(u, obj):
    open(os.path.join(DOMA[u], ".claude", "remote-settings.json"), "w").write(json.dumps(obj))

# A. исправное
r, t, s = takt([zapis("claude-oauth-gateway@iskra.service", hod("claude-opus-5-5")), zapis("claude-oauth-gateway@zarya.service", hod("?")),
                zapis("claude-oauth-gateway@avrora.service", hod("<synthetic>")), zapis("coder-gateway@beta.service", "[codex-app-server] ход начат")])
queried = open(os.path.join(T, "jc-args")).read().split() if os.path.exists(os.path.join(T, "jc-args")) else []
missing = [u for u in units + [EXTRA] if u not in queried]
proba("A исправное: тревог 0, слепоты 0, рубеж = последняя запись, код 0", r.returncode == 0 and not t and s["kursor"] == f"c{n}" and "слепота 0" in r.stdout
      and bool(units) and not missing, r.stdout + r.stderr + str(t) + f"; исходных шлюзов {len(units)}, не запрошены {missing}")
# B. подмена Claude
r, t, s = takt([zapis("claude-oauth-gateway@iskra.service", hod("claude-opus-4-8"))])
proba("B Claude 4.8 вместо 5.5: тревога называет шлюз и обе модели", len(t) == 1 and "claude-oauth-gateway@iskra.service" in t[0] and "ответила claude-opus-4-8, запрошена claude-opus-5-5" in t[0], t)
# C. подмена Codex
r, t, s = takt([zapis("coder-gateway@beta.service", "[codex-app-server] 🔴 МОДЕЛЬ ПОДМЕНЕНА СЕРВЕРОМ: model/rerouted gpt-6-astra → gpt-6-mini (highRiskCyberActivity) — ход обрываю (B-N-1260)")])
proba("C Codex model/rerouted: тревога называет шлюз, модели и причину", len(t) == 1 and "coder-gateway@beta.service" in t[0] and "gpt-6-astra → gpt-6-mini (highRiskCyberActivity)" in t[0], t)
# D. remote-settings: порча → тревога; тот же → тишина; {} → тишина и отметка снята; снова → тревога
remote("avrora", {"fallbackModel": ["claude-opus-4-8"]})
r, t, s = takt([])
proba("D1 remote-settings непуст: тревога с ключом fallbackModel и учёткой", len(t) == 1 and "fallbackModel" in t[0] and "(avrora)" in t[0], t)
r, t, s = takt([])
proba("D2 то же содержимое: тишина (одна тревога на содержимое)", not t, t)
remote("avrora", {})
r, t, s = takt([])
proba("D3 вернулось к {}: тишина, отметка снята", not t and not s["remote"], (t, s["remote"]))
remote("avrora", {"fallbackModel": ["claude-opus-4-8"]})
r, t, s = takt([])
proba("D4 непуст снова: тревога снова", len(t) == 1 and "fallbackModel" in t[0], t)
remote("avrora", {})
takt([])
# E. канал отказал → рубеж не двинут; канал жив → повтор
k0 = s["kursor"] if False else json.load(open(os.path.join(T, "sost", "sostoyanie.json")))["kursor"]
r, t, s = takt([zapis("claude-oauth-gateway@iskra.service", hod("claude-opus-4-8"))], kanal_kod=1)
proba("E1 канал отказал: попытка была, рубеж НЕ двинут", len(t) == 1 and s["kursor"] == k0 and "НЕ ДОШЛА" in r.stdout, (s["kursor"], k0, r.stdout))
r, t, s = takt([zapis("claude-oauth-gateway@iskra.service", hod("claude-opus-4-8"))])
proba("E2 канал жив: тревога повторена, рубеж двинут", len(t) == 1 and s["kursor"] != k0, (t, s["kursor"]))
# F. journalctl отказал → слепота; повтор в пределах часа — тишина
r, t, s = takt([], jc_kod=1)
proba("F1 journalctl отказал: тревога СЛЕПОТЫ с причиной", len(t) == 1 and "СЛЕПОТА" in t[0] and "journalctl код 1" in t[0], t)
r, t, s = takt([], jc_kod=1)
proba("F2 тот же отказ в пределах часа: тишина (остывание)", not t and "СЛЕПОТА" in r.stdout, (t, r.stdout))
# G. шлюз не обновлён: строки хода без «модель запрошена»
r, t, s = takt([zapis("claude-oauth-gateway@iskra.service", "модель claude-opus-4-8 · effort: ветка anthropic · запрошен high · применён high")])
proba("G строки без «модель запрошена»: СЛЕПОТА «шлюз не обновлён», не тишина", len(t) == 1 and "не обновлён" in t[0], t)
# H. условие Вениамина: один шлюз на старом коде при другом обновлённом — слепота называет ИМЕННО его
r, t, s = takt([zapis("claude-oauth-gateway@avrora.service", "модель claude-opus-5-5 · effort: ветка anthropic · запрошен high · применён high"),
                zapis("claude-oauth-gateway@zarya.service", hod("claude-opus-5-5"))])
proba("H один необновлённый (avrora) среди обновлённых (zarya): СЛЕПОТА называет avrora и не называет zarya",
      len(t) == 1 and "claude-oauth-gateway@avrora.service" in t[0] and "не обновлён" in t[0] and "zarya" not in t[0], t)
print(f"итог: {ok} из {vs}")
shutil.rmtree(T, ignore_errors=True)
sys.exit(0 if ok == vs else 1)
PY
