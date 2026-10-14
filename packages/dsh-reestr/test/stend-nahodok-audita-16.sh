#!/usr/bin/env bash
# RU: stend-nahodok-audita-16.sh — пробы к находкам кода аудита 16 (A-N-1948, Заря, 10.10.2026).
# EN: stend-nahodok-audita-16.sh — probes for the code findings of audit 16.
#
# RU: Каждая проба называет номер находки и ждёт поведения ПОСЛЕ правки. На командах до правки (BIN=<bin основы>)
#     пробы исправленных находок обязаны краснеть — так стенд доказывает, что различает, а не проходит на всём.
#     Предмет — команды из BIN (умолчание: ../bin рядом со стендом). Всё во временном каталоге; боевые реестр,
#     состояние и канал тревог не трогаются: подставные пути и команда тревоги-заглушка. sudo не нужен.
# RU: ЧЕГО НЕ ПРОВЕРЯЕТ: №11 (умолчания по PATH — у sudo свой secure_path), №35 (минута 0 после загрузки),
#     №36 (порядок сортировки в чужой локали), №10/№18/№19 и прочие документные — они проверены чтением.
# RU: КОДЫ: 0 — все пробы сошлись; 1 — хоть одна красная; 2 — стенд не смог проверить.
# EN: EXIT: 0 — all probes passed; 1 — at least one red; 2 — the stand could not check.
set -uo pipefail
export LC_ALL=C.UTF-8
export PYTHONDONTWRITEBYTECODE=1   # проба №30 импортирует agent-plugins модулем: __pycache__ в чужом bin/ — мусор (правило B-N-1599)
BIN="${BIN:-$(cd "$(dirname "$(readlink -f "$0")")/../bin" && pwd)}"
for f in agent-plugins registry-watchdog.sh nezafiksirovano-watch sverka-montazha.sh sverka-zavisimostej.sh \
         preset-sverka shvy-mezhdu-paketami-watch srez-obshchego-kataloga.sh; do
  [ -f "$BIN/$f" ] || { echo "СЛЕПОТА: нет $BIN/$f — стенд недоказателен"; exit 2; }
done
command -v git >/dev/null && command -v python3 >/dev/null || { echo "СЛЕПОТА: нужны git и python3"; exit 2; }
for a in "$@"; do echo "ОТКАЗ: доводов нет, получен «$a»"; exit 2; done

T=$(mktemp -d /tmp/stend-audit16.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$T"' EXIT
printf '#!/bin/sh\nprintf "%%s\\n" "$1" >> "%s/trevogi.log"\n' "$T" > "$T/alert"; chmod +x "$T/alert"
ok=0; bad=0
sud() { # имя, «да»/«нет», подробность
  if [ "$2" = da ]; then ok=$((ok+1)); printf '  ok    %s\n' "$1"
  else bad=$((bad+1)); printf '  FAIL  %s — %s\n' "$1" "$3"; fi
}
est() { grep -qF -- "$1" "$2"; }
AP() { env -u PLUGINS_REGISTRY PLUGINS_REGISTRY="$1" python3 "$BIN/agent-plugins" "${@:2}" >"$T/v" 2>&1; echo $?; }

echo "== стенд находок аудита 16: $BIN"

# ── agent-plugins: реестр не прочитан — СЛЕПОТА, код 2, без трассы (№6, №7, №8)
: > "$T/pustoj.yaml"
k=$(AP "$T/pustoj.yaml" list)
[ "$k" = 2 ] && ! est Traceback "$T/v" && est "реестр не прочитан" "$T/v" && r=da || r=net
sud "№6 пустой реестр: код 2, «реестр не прочитан», без трассы" $r "код $k, трасса $(grep -c Traceback "$T/v")"
printf -- '- a\n- b\n' > "$T/spisok.yaml"
k=$(AP "$T/spisok.yaml" list)
[ "$k" = 2 ] && ! est Traceback "$T/v" && r=da || r=net
sud "№6 верхний уровень — список: код 2, без трассы" $r "код $k, трасса $(grep -c Traceback "$T/v")"
printf 'plugins:\n  - idd: opechatka\n    name: x\n' > "$T/bez-id.yaml"
k=$(AP "$T/bez-id.yaml" list)
[ "$k" = 2 ] && ! est Traceback "$T/v" && est "запись №1 без строкового id" "$T/v" && r=da || r=net
sud "№7 запись без id: list — код 2 с номером записи, без трассы" $r "код $k, трасса $(grep -c Traceback "$T/v")"
k=$(AP "$T/net-takogo.yaml" verify)
[ "$k" = 2 ] && r=da || r=net
sud "№8 реестра нет: verify — код 2 (слепота), не 1" $r "код $k"
# pravka: кандидат с записью plugins без id — отказ до установки (сухой прогон)
printf 'plugins:\n  - id: est\n    name: x\n' > "$T/tekushchij.yaml"
printf 'plugins:\n  - id: est\n    name: x\n  - idd: bez\n    name: y\n' > "$T/kandidat.yaml"
k=$(AP "$T/tekushchij.yaml" pravka "$T/kandidat.yaml")
[ "$k" = 1 ] && est "без строкового id" "$T/v" && r=da || r=net
sud "№7 pravka: кандидат с записью plugins без id — отказ 1" $r "код $k"
# diff: пара published.files без local — «НЕ СВЕРЕНО», без трассы (github: до сети дело не доходит)
cat > "$T/diff.yaml" <<EOF
plugins:
  - id: d
    name: x
    published: {type: github, address: nobody/nothing, files: [{remote: a}]}
EOF
k=$(AP "$T/diff.yaml" diff d)
! est Traceback "$T/v" && est "пара без local/remote" "$T/v" && r=da || r=net
sud "№39 diff: пара без local — НЕ СВЕРЕНО, без трассы" $r "код $k, трасса $(grep -c Traceback "$T/v")"
# №30: таблица рук — из файла машины, не из кода
printf 'kto-to\tKto To <kto@proba>\n' > "$T/ruki.tsv"
ruka=$(SUDO_USER=kto-to AGENT_PLUGINS_RUKI="$T/ruki.tsv" PLUGINS_REGISTRY="$T/tekushchij.yaml" python3 -c "
import importlib.machinery as m, sys
mod = m.SourceFileLoader('ap', sys.argv[1]).load_module(); print(mod._ruka()[0])" "$BIN/agent-plugins" 2>&1)
[ "$ruka" = "Kto To <kto@proba>" ] && r=da || r=net
sud "№30 рука коммита берётся из файла AGENT_PLUGINS_RUKI" $r "получено: ${ruka:0:80}"

# ── registry-watchdog (№3, №9, №31, №34)
WD() { env -i PATH=/usr/bin:/bin HOME="$T" REGWD_ALERT="$T/alert" HEALTH_ENABLED=0 PEER_ENABLED=0 "$@" bash "$BIN/registry-watchdog.sh" >"$T/w" 2>&1; echo $?; }
k=$(WD REGWD_CONF=/dev/null REGWD_STATE="$T/st3" VERIFY_CMD=true AGENTS_VERIFY_CMD=true)
[ "$k" = 0 ] && est "реестр доработок: не задан" "$T/w" && r=da || r=net
sud "№3 DORABOTKI_CMD не задан — блок пропущен со строкой, код 0 (а не 127 и слепота)" $r "код $k"
rm -f "$T/trevogi.log"
k=$(env -i PATH=/usr/bin:/bin REGWD_CONF=/dev/null REGWD_STATE="$T/st9" REGWD_ALERT="$T/alert" bash "$BIN/registry-watchdog.sh" --help >"$T/w" 2>&1; echo $?)
[ "$k" = 0 ] && [ ! -e "$T/st9" ] && [ ! -e "$T/trevogi.log" ] && r=da || r=net
sud "№9 --help: справка, код 0, состояние не создано, тревоги нет" $r "код $k, состояние $( [ -e "$T/st9" ] && echo есть || echo нет ), тревог $( [ -e "$T/trevogi.log" ] && wc -l < "$T/trevogi.log" || echo 0 )"
printf 'touch %s/conf-ispolnen\n' "$T" > "$T/kriv.conf"; chmod 0664 "$T/kriv.conf"
k=$(WD REGWD_CONF="$T/kriv.conf" REGWD_STATE="$T/st31" VERIFY_CMD=true AGENTS_VERIFY_CMD=true DORABOTKI_CMD=true)
[ "$k" = 2 ] && [ ! -e "$T/conf-ispolnen" ] && est "НЕ прочитан" "$T/w" && r=da || r=net
sud "№31 файл настройки с записью группе — не исполнен, СЛЕПОТА с причиной" $r "код $k, исполнен $( [ -e "$T/conf-ispolnen" ] && echo да || echo нет )"
: > "$T/fajl"
k=$(WD REGWD_CONF=/dev/null REGWD_STATE="$T/fajl/st" VERIFY_CMD="sh -c 'echo neponyatno; exit 2'" AGENTS_VERIFY_CMD=true DORABOTKI_CMD=true)
est "вывод не узнан" "$T/w" && r=da || r=net
sud "№34 состояние без записи не прячет «вывод verify не узнан»" $r "код $k"

# ── nezafiksirovano-watch (№12, №13, №37)
git init -q "$T/uchet" && printf 'x\n' > "$T/uchet/f" && git -C "$T/uchet" add f \
  && git -C "$T/uchet" -c user.name=s -c user.email=s@p commit -q -m f || { echo "СЛЕПОТА: учёт-образец не собран"; exit 2; }
NZ() { env -i PATH=/usr/bin:/bin HOME="$T" NEZAF_ALERT="$T/alert" "$@" python3 "$BIN/nezafiksirovano-watch" >"$T/n" 2>&1; echo $?; }
if [ "$(id -u)" != 0 ]; then
  k=$(NZ NEZAF_UCHYOTY="$T/uchet")
  [ "$k" = 0 ] && ! est PermissionError "$T/n" && r=da || r=net
  sud "№12 свой учёт от не-root учётки — «чисто», без PermissionError" $r "код $k"
else
  echo "  ПРОПУСК №12 — стенд идёт от root, а находка про не-root учётку"; ok=$((ok+1))
fi
k=$(NZ)
[ "$k" = 2 ] && est "не задан" "$T/n" && r=da || r=net
sud "№13 перечень учётов не задан — СЛЕПОТА «не задан», код 2" $r "код $k"
k=$(NZ NEZAF_UCHYOTY="$T/uchet" NEZAF_PREDEL_CH=abc)
[ "$k" = 2 ] && ! est Traceback "$T/n" && r=da || r=net
sud "№37 NEZAF_PREDEL_CH=abc — СЛЕПОТА код 2, без трассы" $r "код $k, трасса $(grep -c Traceback "$T/n")"

# ── sverka-montazha (№14), sverka-zavisimostej (№15)
mkdir -p "$T/mesto/plagin" "$T/fakebin"; printf '#!/bin/sh\nexit 1\n' > "$T/fakebin/sudo"; chmod +x "$T/fakebin/sudo"
printf 'plugins:\n  - id: p\n    path: %s/mesto/plagin\n' "$T" > "$T/zakryt.yaml"; chmod 000 "$T/zakryt.yaml"
k=$(env -i PATH="$T/fakebin:/usr/bin:/bin" PLUGINS_REGISTRY="$T/zakryt.yaml" SVERKA_MESTA="$T/mesto" bash "$BIN/sverka-montazha.sh" >"$T/s" 2>&1; echo $?)
chmod 600 "$T/zakryt.yaml"
if [ "$(id -u)" = 0 ]; then echo "  ПРОПУСК №14а — под root закрытый файл читается"; ok=$((ok+1))
else
  [ "$k" = 2 ] && ! est "ВНЕ РЕЕСТРА" "$T/s" && est "sudo -n отказал" "$T/s" && r=da || r=net
  sud "№14 реестр закрыт и sudo отказал — СЛЕПОТА с причиной, не «ВНЕ РЕЕСТРА»" $r "код $k"
fi
k=$(env -i PATH=/usr/bin:/bin bash "$BIN/sverka-montazha.sh" >"$T/s" 2>&1; echo $?)
[ "$k" = 2 ] && est "SVERKA_MESTA" "$T/s" && r=da || r=net
sud "№14 места монтажа не заданы — СЛЕПОТА с именем переменной" $r "код $k"
k=$(env -i PATH=/usr/bin:/bin:/usr/local/bin bash "$BIN/sverka-zavisimostej.sh" >"$T/z" 2>&1; echo $?)
[ "$k" = 2 ] && est "SVERKA_PLAGINY" "$T/z" && r=da || r=net
sud "№15 перечень плагинов не задан — СЛЕПОТА с именем переменной" $r "код $k"

# ── preset-sverka (№16), shvy (№17), srez (№9, №33)
k=$(env -i PATH=/usr/bin:/bin PRESET_SVERKA_NASH="$T/net1" PRESET_SVERKA_ZAVOD="$T/net2" PRESET_SVERKA_NASH_ID=x python3 "$BIN/preset-sverka" >"$T/p" 2>&1; echo $?)
[ "$k" = 2 ] && est "СЛЕПОТА" "$T/p" && r=da || r=net
sud "№16 слепота preset-sverka — код 2, а не 1" $r "код $k"
k=$(env -i PATH=/usr/bin:/bin python3 "$BIN/preset-sverka" >"$T/p" 2>&1; echo $?)
[ "$k" = 2 ] && est "PRESET_SVERKA_NASH_ID" "$T/p" && r=da || r=net
sud "№16 не заданы пути и id — СЛЕПОТА с именами переменных" $r "код $k"
mkdir -p "$T/koren/node_modules/pkt"; printf 'export function f() {}\n' > "$T/koren/node_modules/pkt/index.js"
k=$(env -i PATH=/usr/bin:/bin SHVY_KOREN="$T/koren/node_modules" python3 "$BIN/shvy-mezhdu-paketami-watch" >"$T/h" 2>&1; echo $?)
[ "$k" = 0 ] && est "Ш3 НЕ ПРОВЕРЯЛСЯ" "$T/h" && r=da || r=net
sud "№17 потребители не заданы — Ш3 пропущен и назван, код 0" $r "код $k: $(head -1 "$T/h" | cut -c1-80)"
mkdir -p "$T/srez/it's"; printf '{"version":"1.2.3"}\n' > "$T/srez/it's/package.json"
bash "$BIN/srez-obshchego-kataloga.sh" "$T/srez" > "$T/r" 2>&1
grep -F "it's" "$T/r" | grep -qF "1.2.3" && r=da || r=net
sud "№33 каталог с кавычкой в имени — версия прочитана (путь через argv)" $r "$(grep -F "it's" "$T/r" | tr -s ' ' | cut -c1-60)"
k=$(bash "$BIN/srez-obshchego-kataloga.sh" --help >"$T/r" 2>&1; echo $?)
[ "$k" = 0 ] && ! est "каталог: --help" "$T/r" && r=da || r=net
sud "№9 srez --help — справка, код 0, а не «каталог --help»" $r "код $k"

echo
echo "  ok=$ok  FAIL=$bad"
ZHDYOM=22
if [ $((ok+bad)) -ne $ZHDYOM ]; then echo "СЛЕПОТА: проб $((ok+bad)) вместо $ZHDYOM — часть стенда не состоялась"; exit 2; fi
[ "$bad" -eq 0 ] || exit 1
echo "✅ находки кода аудита 16 закрыты на этих командах"
exit 0
