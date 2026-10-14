#!/bin/bash
# RU: Стенд dsh-upstream-watch: три пробы — исправное молчит · порча краснеет, называя предмет · порча снята — снова зелёное.
# RU: Сеть НЕ трогается: npm и curl — подставные первыми в PATH; logger и канал тревоги — подставные (пишут в файл).
# RU: Состояние — во временном каталоге (DSH_SOSTOYANIE). Проверяется код кандидата из bin/ пакета.
# RU: Чего НЕ проверяет: живой реестр npm и GitHub (их ответ — вне стенда); сорт «бета» отдельно (идёт как альфа).
# EN: Stand for dsh-upstream-watch: three probes — healthy is quiet · fault turns red naming the subject · fault removed — green again.
# EN: The network is NOT touched: npm and curl are stubs first in PATH; logger and the alert channel are stubs (write to a file).
# EN: State lives in a temporary directory (DSH_SOSTOYANIE). The code under test is bin/ of this package.
# EN: Does NOT check: the live npm registry and GitHub (their answers are outside the stand); "beta" separately (handled as alpha).
# RU: Коды: 0 — все пробы прошли · 1 — расхождение · 2 — стенд слеп (порча не внесена / предмета нет).
# EN: Exit codes: 0 — all probes passed · 1 — mismatch · 2 — the stand is blind (fault not injected / no subject).
set -u
[ $# -eq 0 ] || { echo "ОТКАЗ: доводов не принимаю ($*)" >&2; exit 2; }
M="${MODUL:-$(cd "$(dirname "$0")/.." && pwd)/bin/dsh-upstream-watch.sh}"
[ -r "$M" ] || { echo "СЛЕПОТА: нет предмета $M"; exit 2; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/stub" "$T/in" "$T/log"
cat > "$T/stub/zapis" <<'EOF'
#!/bin/bash
n=$(basename "$0")
# RU: 1.0.2: отказ канала тревоги — файл $STUB_DIR/alert.otkaz (вызов не пишется, код 1).
[ "$n" = agent-alert ] && [ -f "$STUB_DIR/alert.otkaz" ] && exit 1
printf '%s|%s\n' "$n" "$*" >> "$STUB_LOG/$n.log"; exit 0
EOF
cat > "$T/stub/npm" <<'EOF'
#!/bin/bash
[ -f "$STUB_DIR/npm.out" ] && cat "$STUB_DIR/npm.out"; exit 0
EOF
cat > "$T/stub/curl" <<'EOF'
#!/usr/bin/python3
import os,json,sys
from pathlib import Path
root=Path(os.environ['STUB_DIR'])
if (root/'curl.kod').exists():sys.exit(int((root/'curl.kod').read_text()))
value=json.loads((root/'curl.out').read_text()) if (root/'curl.out').exists() else []
url=sys.argv[-1]
if isinstance(value,list) and '/releases/tags/' in url:
    tag=url.rsplit('/',1)[-1]
    row=next((v for v in value if v.get('tag_name')==tag),None)
    if row is None:sys.exit(22)
    value=row
print(json.dumps(value))
EOF
chmod 755 "$T/stub/"*
for n in logger agent-alert systemctl journalctl; do ln -s zapis "$T/stub/$n"; done
echo '{"dependencies":{"@deepseek-ai/dsh":"1.0.0"}}' > "$T/package.json"
ok=0; bad=0
progon() {  # -> KOD, VYVOD, TREVOG (новых вызовов канала за прогон)
  local do_=$(cat "$T/log/agent-alert.log" 2>/dev/null | grep -c '^agent-alert|')
  VYVOD=$(PATH="$T/stub:$PATH" STUB_LOG="$T/log" STUB_DIR="$T/in" DSH_SOSTOYANIE="$T/vidennye.txt" \
          DSH_ALERT="$T/stub/agent-alert" DSH_PACKAGE_JSON="$T/package.json" bash "$M" 2>&1); KOD=$?
  TREVOG=$(( $(cat "$T/log/agent-alert.log" 2>/dev/null | grep -c '^agent-alert|') - do_ ))
}
proverka() { if eval "$2"; then ok=$((ok+1)); echo "  ok   $1"; else bad=$((bad+1)); echo "  FAIL $1 (код $KOD, тревог $TREVOG): $VYVOD"; fi; }

# RU: 1. Исправное: в реестре только установленная и уже виденная версии → код 0, тревог 0.
# EN: 1. Healthy: the registry has only the installed and already-seen versions → exit 0, no alerts.
echo '0.9.0' > "$T/vidennye.txt"
echo '{"latest":"0.9.0","next":"1.0.0"}' > "$T/in/npm.out"
progon; proverka "исправное молчит · healthy is quiet" '[ "$KOD" -eq 0 ] && [ "$TREVOG" -eq 0 ]'

# RU: 2. Порча: в реестре появился релиз-кандидат 1.1.0-rc.1 → код 1, ровно одна тревога, в ней названа версия.
# EN: 2. Fault: a release candidate 1.1.0-rc.1 appears → exit 1, exactly one alert naming the version.
do_=$(cksum < "$T/in/npm.out")
echo '{"latest":"0.9.0","next":"1.0.0","rc":"1.1.0-rc.1"}' > "$T/in/npm.out"
posle=$(cksum < "$T/in/npm.out")
echo "  порча внесена · fault injected: cksum входа реестра $do_ → $posle"
[ "$do_" != "$posle" ] || { echo "СЛЕПОТА: порча не внесена"; exit 2; }
progon; proverka "порча краснеет и называет версию · fault is red and names the version" \
  '[ "$KOD" -eq 1 ] && [ "$TREVOG" -eq 1 ] && tail -1 "$T/log/agent-alert.log" | grep -qF "1.1.0-rc.1"'

# RU: 3. Порча снята: реестр как в п.1 → снова код 0 и тишина (виденная версия не тревожит повторно).
# EN: 3. Fault removed: registry as in step 1 → exit 0 and silence again (a seen version never alerts twice).
echo '{"latest":"0.9.0","next":"1.0.0"}' > "$T/in/npm.out"
progon; proverka "порча снята — снова зелёное · fault removed — green again" '[ "$KOD" -eq 0 ] && [ "$TREVOG" -eq 0 ]'

# RU: 4. Слепота: реестр молчит → код 2, тревог 0, вывод называет слепоту (не «нового нет»).
# EN: 4. Blindness: the registry is silent → exit 2, no alerts, output names blindness (not "nothing new").
rm -f "$T/in/npm.out"
progon; proverka "реестр молчит — слепота, не зелёное · silent registry is blindness" '[ "$KOD" -eq 2 ] && [ "$TREVOG" -eq 0 ] && printf "%s" "$VYVOD" | grep -qF "СЛЕПОТА"'

# RU: 5–7. 1.0.1: отказ источника описаний — слепота для альфы, не «молча».
echo '{"latest":"0.9.0","next":"1.0.0","alpha":"1.2.0-alpha.1"}' > "$T/in/npm.out"
echo 7 > "$T/in/curl.kod"; echo "  порча: curl отвечает кодом $(cat "$T/in/curl.kod")"
progon; proverka "1.0.1: curl отказал — альфа: слепота, код 2, не записана" \
  '[ "$KOD" -eq 2 ] && [ "$TREVOG" -eq 0 ] && printf "%s" "$VYVOD" | grep -qF "СЛЕПОТА: описание релизов" && ! grep -qxF 1.2.0-alpha.1 "$T/vidennye.txt"'
rm -f "$T/in/curl.kod"; echo '[{"tag_name":"v1.2.0-alpha.1","body":"fixes a security issue"}]' > "$T/in/curl.out"
progon; proverka "1.0.1: источник вернулся — альфа с безопасностью ПОВТОРЕНА, тревога ушла" \
  '[ "$KOD" -eq 1 ] && [ "$TREVOG" -eq 1 ] && tail -1 "$T/log/agent-alert.log" | grep -qF "1.2.0-alpha.1"'
echo '{"latest":"0.9.0","next":"1.0.0","alpha":"1.3.0-alpha.1"}' > "$T/in/npm.out"
echo '{"message":"API rate limit exceeded"}' > "$T/in/curl.out"
progon; proverka "1.0.1: ответ-объект при коде 0 (rate limit) — тоже слепота" \
  '[ "$KOD" -eq 2 ] && [ "$TREVOG" -eq 0 ] && printf "%s" "$VYVOD" | grep -qF "СЛЕПОТА: описание релизов"'
rm -f "$T/in/curl.out"

# RU: 8–9. 1.0.2: недоставленная тревога о rc — версия НЕ записана, код 3; канал вернулся — повтор.
echo '{"latest":"0.9.0","next":"1.0.0","rc":"1.4.0-rc.1"}' > "$T/in/npm.out"; touch "$T/in/alert.otkaz"
progon; proverka "1.0.2: канал отказал — rc не записан, код 3" '[ "$KOD" -eq 3 ] && [ "$TREVOG" -eq 0 ] && ! grep -qxF 1.4.0-rc.1 "$T/vidennye.txt" && printf "%s" "$VYVOD" | grep -qF "НЕ доставлена"'
rm -f "$T/in/alert.otkaz"
progon; proverka "1.0.2: канал вернулся — тревога о rc ПОВТОРЕНА, записан" '[ "$KOD" -eq 1 ] && [ "$TREVOG" -eq 1 ] && grep -qxF 1.4.0-rc.1 "$T/vidennye.txt"'

echo "ИТОГ: ok=$ok FAIL=$bad"
[ $((ok+bad)) -eq 9 ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из 9"; exit 2; }
[ "$bad" -eq 0 ]
