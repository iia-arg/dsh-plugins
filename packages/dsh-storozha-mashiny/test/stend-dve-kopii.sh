#!/bin/bash
# RU: Стенд dve-kopii-watch — три пробы: исправное (копии совпали кодом) молчит · порча (в копии app изменён файл)
# RU: краснеет, называя пакет, установку и файл · порча снята — одна строка «снова совпадают», потом тишина.
# RU: Плюс: «не настроено» говорит, а не молчит; «нет в app» — не красное; разный только package.json — не красное.
# RU: Деревья — подставные (--osnova/--app); канал (DKW_ALERT) и logger — заглушки; состояние во временном каталоге.
# EN: Test stand for dve-kopii-watch — three probes: healthy (copies equal in code) is quiet · fault (a file changed
# EN: in the app copy) goes red naming package, installation and file · fault removed — one "match again" line, then
# EN: silence. Plus: "not configured" speaks rather than stays silent; "not in app" is not red; a package.json-only
# EN: difference is not red. Trees are fake (--osnova/--app); channel (DKW_ALERT) and logger are stubs; state is temporary.
# RU: bash stend-dve-kopii.sh [сторож] · EN: bash stend-dve-kopii.sh [watchdog]
set -u
I=${1:-$(cd "$(dirname "$0")/.." && pwd)/bin/dve-kopii-watch}
R=$(mktemp -d /tmp/stend-dve-kopii.XXXXXX) || exit 2; trap 'rm -rf "$R"' EXIT
mkdir -p $R/path
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> %s\n' "$R/zhurnal.txt" > $R/path/logger
for z in agent-alert claudeclaw-alert systemctl journalctl; do printf '#!/bin/sh\necho "%s $*" >> %s\nexit 0\n' "$z" "$R/chuzhie.txt" > $R/path/$z; done
printf '#!/bin/sh\n[ "$1" = --plain ] && [ "$2" = -- ] || exit 2\nprintf "%%s\\n===\\n" "$3" >> %s\nexit 0\n' "$R/kanal.txt" > $R/alert
chmod 755 $R/path/* $R/alert
export PATH="$R/path:$PATH" DKW_ALERT=$R/alert DKW_SOSTOYANIE=$R/sost/posledniy-ishod DKW_MASHINA=stend
unset DKW_OSNOVA DKW_APPS
PK='@deepseek-ai/cordis @deepseek-ai/cosmokit @deepseek-ai/schemastery @deepseek-ai/dsh-attachment @deepseek-ai/dsh-brand @deepseek-ai/dsh-invariants @deepseek-ai/dsh-llm @deepseek-ai/dsh-timeout @standard-schema/spec'
for kor in $R/osnova $R/app1; do for p in $PK; do mkdir -p $kor/$p/lib; echo "kod $p" > $kor/$p/lib/index.js; echo '{"version":"1.0.0"}' > $kor/$p/package.json; done; done
ok=0; fail=0; sud() { if [ "$2" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
zov() { : > $R/kanal.txt; "$I" "$@" > $R/out 2>&1; echo $?; }
k=$(zov); sud "П0 не настроено (нет DKW_OSNOVA/DKW_APPS) — говорит «НЕ НАСТРОЕНО», код 2, канал молчит" \
  "$([ $k = 2 ] && grep -q '^НЕ НАСТРОЕНО: нет DKW_OSNOVA' $R/out && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
export DKW_OSNOVA=$R/osnova DKW_APPS="ust1=$R/app1"
echo '{"version":"1.0.1"}' > $R/app1/@deepseek-ai/dsh-llm/package.json
k=$(zov); sud "П1 исправное (код совпал; разный только package.json) — код 0, канал молчит" \
  "$([ $k = 0 ] && grep -q 'пар сравнено 9 · совпало 9 · разошлось 0' $R/out && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(tail -1 $R/out)"
echo 'drugoj kod' > $R/app1/@deepseek-ai/dsh-llm/lib/index.js
k=$(zov); sud "П2 порча (dsh-llm в ust1 разошёлся кодом) — код 1, тревога называет пакет, установку и файл" \
  "$([ $k = 1 ] && grep -q '@deepseek-ai/dsh-llm \[ust1\]' $R/kanal.txt && grep -q 'разный lib/index.js' $R/kanal.txt && grep -q 'разошлись КОДОМ' $R/kanal.txt && echo 1)" "код $k · $(cat $R/kanal.txt)"
echo "kod @deepseek-ai/dsh-llm" > $R/app1/@deepseek-ai/dsh-llm/lib/index.js
k=$(zov); sud "П3 порча снята — код 0, одна строка «снова совпадают»" "$([ $k = 0 ] && grep -q 'снова совпадают кодом' $R/kanal.txt && echo 1)" "код $k · $(cat $R/kanal.txt)"
k=$(zov); sud "П3б снова зелёное — канал молчит" "$([ $k = 0 ] && [ ! -s $R/kanal.txt ] && echo 1)" "$(cat $R/kanal.txt)"
rm -rf $R/app1/@standard-schema
k=$(zov); sud "П4 пакета нет в app — строка «нет в app», не красное" "$([ $k = 0 ] && grep -q 'нет в app ust1: @standard-schema/spec' $R/out && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
sud "П5 итог каждого прогона — в logger (заглушку), чужие заглушки не звались" "$(grep -q '^-t dve-kopii-watch пакетов 9' $R/zhurnal.txt && [ ! -s $R/chuzhie.txt ] && echo 1)" "$(tail -1 $R/zhurnal.txt) · $(cat $R/chuzhie.txt 2>/dev/null)"
echo "ИТОГ: ok $ok · fail $fail"
[ $fail = 0 ]
