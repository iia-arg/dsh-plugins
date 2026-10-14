#!/bin/bash
# СТЕНД ВОРОТ ПЕРЕНОСА (perenos-v-derevo). Искра, 07.09.2026.
#
# 🔴 ЗАЧЕМ. Это единственный наш инструмент, который МОЖЕТ УДАЛЯТЬ файлы: перенос
# диск→дерево идёт с --delete, и без ворот он стирал бы молча то, что живёт только
# в дереве. Стенда у него не было; замер 07.09 показал, что стендов в dorabotki три
# на десятки инструментов, и этот — с самой высокой ценой ошибки.
#
# НАПРАВЛЕНИЕ, КОТОРОГО ЖДЁМ: ждём МОЛЧАЛИВОЕ УДАЛЕНИЕ, а не ложный отказ. Ложный отказ
# виден сразу и стоит одного круга; тихое стирание вскроется, когда файл понадобится.
# Поэтому главная проба — не «отказал ли», а «ЦЕЛ ЛИ ФАЙЛ после отказа».
#
# ЧЕГО СТЕНД НЕ ПРОВЕРЯЕТ:
#   · верность самого rsync — это чужой инструмент, мы проверяем НАШИ ворота вокруг него;
#   · ветку «rsync не найден» (слепота): подменить наличие команды нечем, не ломая машину;
#   · поведение на боевых каталогах — корни подменены намеренно, боевое не участвует.
set -u
# №7 аудита A-N-1948 (10.10.2026): ворота — там, куда их ставит dsh-montazh (/usr/local/bin); копия в dorabotki на sadik
# побайтно та же (4ff937e9, замер 10.10 01:2xZ). Другой путь — PERENOS_BIN.
VOROTA="${PERENOS_BIN:-/usr/local/bin/perenos-v-derevo}"
VSEGO=0; PROVAL=0
B=$(mktemp -d "${TMPDIR:-/tmp}/stend-perenosa.XXXXXX") || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$B"' EXIT INT TERM
[ -x "$VOROTA" ] || { echo "СЛЕПОТА: ворот нет или не исполняются ($VOROTA)"; exit 2; }
command -v rsync >/dev/null || { echo "СЛЕПОТА: rsync не найден — стенд проверять нечем"; exit 2; }

svezhaya_para() {            # чистая пара «диск» + «дерево», одинаковые
  rm -rf "$B/disk" "$B/derevo"
  mkdir -p "$B/disk/paket/src" "$B/derevo/paket/src"
  printf 'общий\n' > "$B/disk/paket/src/a.js"; printf 'общий\n' > "$B/derevo/paket/src/a.js"
}
zovi() { DISK_KOREN="$B/disk" DEREVO_KOREN="$B/derevo" "$VOROTA" "$@" 2>&1; }

proba() {                    # имя · ожидаемый код · ожидаемая строка (пусто = не проверять)
  local imya="$1" zhdem="$2" stroka="$3"; shift 3
  VSEGO=$((VSEGO+1))
  local out; out=$(zovi "$@"); local kod=$?
  local beda=""
  [ "$kod" = "$zhdem" ] || beda="код $kod, ждали $zhdem"
  [ -n "$stroka" ] && ! printf '%s' "$out" | grep -qF "$stroka" && beda="${beda:+$beda; }нет строки «$stroka»"
  if [ -n "$beda" ]; then PROVAL=$((PROVAL+1)); echo "🔴 $imya: $beda"; else echo "  ✅ $imya"; fi
}

echo "── ЗРЯЧЕСТЬ ПЕРВОЙ: на одинаковой паре ворота молчат ──"
svezhaya_para
proba "П1 пара одинакова → переносить нечего" 0 "" paket

echo "── ШТАТНЫЙ ПЕРЕНОС ──"
svezhaya_para; printf 'новое\n' > "$B/disk/paket/src/b.js"
proba "П2 новый файл на диске → переносится" 0 "" paket
VSEGO=$((VSEGO+1))
if [ -f "$B/derevo/paket/src/b.js" ]; then echo "  ✅ П3 файл доехал в дерево"
else PROVAL=$((PROVAL+1)); echo "🔴 П3 файл в дерево НЕ доехал"; fi

echo "── ГЛАВНОЕ: файл, живущий только в дереве ──"
svezhaya_para; printf 'только в дереве\n' > "$B/derevo/paket/src/tolko-tut.js"
proba "П4 удаление грозит → ОТКАЗ" 1 "ОТКАЗ" paket
VSEGO=$((VSEGO+1))
if [ -f "$B/derevo/paket/src/tolko-tut.js" ]; then echo "  ✅ П5 после отказа файл ЦЕЛ"
else PROVAL=$((PROVAL+1)); echo "🔴 П5 файл СТЁРТ при отказе — ворота не защитили"; fi

echo "── ОБХОД: только с названной причиной ──"
svezhaya_para; printf 'только в дереве\n' > "$B/derevo/paket/src/tolko-tut.js"
proba "П6 обход с причиной → переносит" 0 "" paket "--soglasna-udalit=проба стенда"
VSEGO=$((VSEGO+1))
if [ ! -f "$B/derevo/paket/src/tolko-tut.js" ]; then echo "  ✅ П7 при обходе файл удалён (как и объявлено)"
else PROVAL=$((PROVAL+1)); echo "🔴 П7 обход объявлен, а файл на месте — обход не работает"; fi

svezhaya_para
proba "П8 обход с ПУСТОЙ причиной → отказ" 2 "ПУСТОЙ причиной" paket "--soglasna-udalit="

echo "── СЛЕПОТЫ: незнание не выдаётся за успех ──"
svezhaya_para
proba "П9 нет пакета на диске → слепота" 2 "СЛЕПОТА" net-takogo
svezhaya_para; rm -rf "$B/derevo/paket"
proba "П10 нет пакета в дереве → слепота" 2 "СЛЕПОТА" paket
proba "П11 пакет не назван → отказ, не молчание" 2 "perenos-v-derevo"
proba "П12 неизвестный ключ → отказ" 2 "неизвестный ключ" paket "--vydumannyj"

echo "── ЗРЯЧЕСТЬ ПОСЛЕ ПОРЧ ──"
svezhaya_para
proba "П13 снова одинаковая пара → чисто" 0 "" paket

echo "итог: $((VSEGO-PROVAL)) из $VSEGO"
[ "$PROVAL" -gt 0 ] && exit 1
exit 0
