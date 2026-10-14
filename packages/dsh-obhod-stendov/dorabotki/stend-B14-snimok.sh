#!/bin/bash
# Стенд второй половины Б14: цель разряда «В БОЮ» берётся из СНИМКА КАНОНОВ, а не с диска.
# 🔴 ПРОБЫ ЖИВЫЕ: прибор реально запускается, снимок подставляется через SNIMOK_KANONOV.
# Боевой снимок не трогается — стенд пишет свои файлы во временный каталог.
set -u
P=/opt/iskra/workspace/dorabotki/pered-podyomom.mjs
SL=iskra.service
RAB=$(mktemp -d); trap 'rm -rf "$RAB"' EXIT
VHOD=$(systemctl show "$SL" -p ActiveEnterTimestamp --value)
BED=0; VSEGO=0

# боевая версия core — её и подставляем в снимок как «канон при подъёме»
BOJ_CORE=$(node "$P" --posle --cel-s-diska --sluzhba "$SL" 2>/dev/null | grep -oP '\[dsh-pamyat-core \K[^\]]+')
[ -n "$BOJ_CORE" ] || { echo "🔴 СЛЕПОТА: боевая версия core не снялась — стенд недействителен"; exit 2; }
echo "боевая core: $BOJ_CORE · ActiveEnter: $VHOD"

snimok() {  # $1 файл · $2 ActiveEnter · $3 версия core · $4 zavershyon|obryv|pusto
  { printf '=== СНИМОК КАНОНОВ ДИСКА ПРИ ПОДЪЁМЕ ===\n'
    printf 'служба: %s · ActiveEnter: %s · снято: %s\n' "$SL" "$2" "$(date -u '+%F %T UTC')"
    if [ "$4" != pusto ]; then
      printf '%-28s %-18s %s  %s\n' dsh-pamyat-core "$3" 0123456789abcdef /opt/x/core
      printf '%-28s %-18s %s  %s\n' dsh-pamyat-omega 0.1.0-alpha.13 fedcba9876543210 /opt/x/omega
    fi
    printf 'пакетов в снимке: 2\n'
    [ "$4" = obryv ] || printf 'ЗАВЕРШЁН\n'
  } > "$1"
}

proba() { # $1 имя · $2 файл-снимка(или ПУСТО) · $3 образец, который ОБЯЗАН найтись
  VSEGO=$((VSEGO+1))
  local v
  if [ -z "$2" ]; then v=$(node "$P" --posle --cel-s-diska --sluzhba "$SL" 2>&1)
  else v=$(SNIMOK_KANONOV="$2" node "$P" --posle --cel-s-diska --sluzhba "$SL" 2>&1); fi
  if grep -qF "$3" <<<"$v"; then echo "  ✅ $1"
  else BED=$((BED+1)); echo "  🔴 $1"; echo "     ждала строку: $3"
       echo "     было: $(grep -E 'СНИМ|цель разряда|dsh-pamyat-core' <<<"$v" | head -3 | tr '\n' '|')"; fi
}

echo "── исправное ──"
snimok "$RAB/svoj.txt" "$VHOD" "$BOJ_CORE" zavershyon
proba "снимок свой и целый — цель берётся ИЗ СНИМКА" "$RAB/svoj.txt" "цель разряда — КАНОН ДИСКА ПРИ ПОДЪЁМЕ"
proba "версии сошлись — core помечен целью"          "$RAB/svoj.txt" "[dsh-pamyat-core $BOJ_CORE] ✅ цель"

echo "── порча 1: [внесена] версия в снимке подменена на 0.1.0-alpha.99 ──"
snimok "$RAB/inaya.txt" "$VHOD" 0.1.0-alpha.99 zavershyon
proba "цель ИЗ СНИМКА, а не с диска (доказано расхождением)" "$RAB/inaya.txt" "🔴 ЦЕЛЬ 0.1.0-alpha.99"

echo "── порча 2: [внесена] снимок от ЧУЖОГО подъёма ──"
snimok "$RAB/chuzhoj.txt" "Mon 2020-01-01 00:00:00 UTC" 0.1.0-alpha.99 zavershyon
proba "чужой снимок НЕ используется и назван"        "$RAB/chuzhoj.txt" "СНИМОК ПРО ДРУГОЙ ПОДЪЁМ"

echo "── порча 3: [внесена] снимок оборван (нет строки ЗАВЕРШЁН) ──"
snimok "$RAB/obryv.txt" "$VHOD" "$BOJ_CORE" obryv
proba "недописанный снимок НЕ используется и назван" "$RAB/obryv.txt" "СНИМОК КАНОНОВ НЕ ЦЕЛЫЙ"

echo "── порча 4: [внесена] снимок целый, но без пакетов ──"
snimok "$RAB/pusto.txt" "$VHOD" "$BOJ_CORE" pusto
proba "пустой снимок НЕ используется и назван"       "$RAB/pusto.txt" "СНИМОК ЦЕЛ, НО ПУСТ"

echo "── снять порчу: снимка нет вовсе ──"
proba "отсутствие снимка названо, откат к диску вслух" "$RAB/netu.txt" "СНИМКА КАНОНОВ НЕТ"

ZHDYOM=7
[ "$VSEGO" = "$ZHDYOM" ] || { echo "🔴 КАНАРЕЙКА: проб $VSEGO, ЖДЁМ $ZHDYOM"; exit 2; }
echo; echo "итог: $((VSEGO-BED)) из $VSEGO"
[ "$BED" = 0 ]
