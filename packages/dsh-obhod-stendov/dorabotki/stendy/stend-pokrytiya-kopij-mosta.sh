#!/bin/bash
# stend-pokrytiya-kopij-mosta.sh — B-N-1982 (обход 3.1.8, Искра, 10.10.2026): КАЖДАЯ копия dsh-tool-bridge из реестра
# плагинов стоит в ночном обходе. Живое состояние, только чтение; sudo не зовёт.
# Ловит: копию моста, заведённую в реестр (запись dsh-tool-bridge*), но без строк перечня stend-cel-mosta /
#   stend-predelov-iz-fajla; чужую копию (не /opt/iskra) без строк ОБЛАСТИ «<путь стенда> @<учётка> <дом>/app», где учётка —
#   polzovatel агента-владельца дома из реестра агентов (живой случай 10.10: копия anna — 0 строк, B-N-1982).
# НЕ ЛОВИТ: копию, которой нет в реестре плагинов (её ловит agent-plugins verify «нет записи … для <агент>»); строку
#   области, стоящую в обходчике ВНЕ блока OBLAST_STENDOV (ищется целой строкой по всему файлу); зрячесть самих стендов
#   на копии (её судит обход); прочие пакеты копий (dsh-subscription-adapter и др.) — только мост.
# Доводы: PERECHEN_STENDOV, OBHODCHIK_BIN, PLUGINS_REGISTRY, AGENT_REGISTRY_BIN — подстава для пробы; по умолчанию боевые.
# Коды — договор обходчика: 0 — все копии покрыты · 1 — непокрытая копия (названа) · 2 — слепота (нечего читать).
set -u
PER="${PERECHEN_STENDOV:-/opt/iskra/workspace/dorabotki/perechen-boevyh-stendov.txt}"
OBH="${OBHODCHIK_BIN:-/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh}"
REG="${PLUGINS_REGISTRY:-/etc/agent-registry/plugins.yaml}"
AR="${AGENT_REGISTRY_BIN:-agent-registry}"
for f in "$PER" "$OBH" "$REG"; do [ -r "$f" ] || { echo "СЛЕПОТА: не читается $f"; exit 2; }; done
# Агенты: имя<TAB>дом<TAB>учётка — из реестра агентов (строки «имя  (роль)» + поля dom/polzovatel).
agenty=$("$AR" list 2>/dev/null | awk '/^[a-z][a-z0-9-]*  \(/{print $1}') || true
[ -n "$agenty" ] || { echo "СЛЕПОТА: реестр агентов пуст или не читается ($AR list)"; exit 2; }
doma=""
for a in $agenty; do
  d=$("$AR" pole "$a" dom 2>/dev/null); u=$("$AR" pole "$a" polzovatel 2>/dev/null)
  [ -n "$d" ] && [ -n "$u" ] || { echo "СЛЕПОТА: у агента $a нет dom/polzovatel в реестре"; exit 2; }
  doma="$doma$a"$'\t'"$d"$'\t'"$u"$'\n'
done
kopii=$(python3 -B - "$REG" <<'PY'
import sys, yaml
r = yaml.safe_load(open(sys.argv[1], encoding='utf-8'))
for p in r.get('plugins') or []:
    if str(p.get('id', '')).startswith('dsh-tool-bridge'): print(p['id'] + '\t' + str(p.get('path', '')).rstrip('/'))
PY
) || { echo "СЛЕПОТА: реестр плагинов $REG не разобран"; exit 2; }
[ -n "$kopii" ] || { echo "СЛЕПОТА: в реестре плагинов нет ни одной записи dsh-tool-bridge*"; exit 2; }
ok=0; bad=0; n=0
while IFS=$'\t' read -r id put; do
  n=$((n+1)); beda=""
  for st in stend-cel-mosta.mjs stend-predelov-iz-fajla.mjs; do
    grep -qxF -- "$put/test/$st" "$PER" || beda="$beda нет строки перечня $st;"
  done
  case "$put" in
    /opt/iskra/*) ;;   # своя копия — область обходчика по умолчанию (/opt/iskra/plugins/*), строки @ не нужны
    *) vlad=$(awk -F'\t' -v p="$put" 'index(p, $2 "/") == 1 { print $1 "\t" $2 "\t" $3; exit }' <<< "$doma")
       if [ -z "$vlad" ]; then beda="$beda дом-владелец не найден в реестре агентов;"
       else IFS=$'\t' read -r a d u <<< "$vlad"
         for st in stend-cel-mosta.mjs stend-predelov-iz-fajla.mjs; do
           grep -qxF -- "$put/test/$st @$u $d/app" "$OBH" || beda="$beda нет строки области «$st @$u $d/app»;"
         done
       fi ;;
  esac
  if [ -z "$beda" ]; then ok=$((ok+1)); echo "  ok    $id ($put)"; else bad=$((bad+1)); echo "  ❌ НЕПОКРЫТА $id ($put):$beda"; fi
done <<< "$kopii"
echo "  копий моста в реестре $n · покрыто $ok · непокрыто $bad"
[ "$bad" -eq 0 ] || exit 1
exit 0
