#!/bin/bash
# СТЕНД ТЕКСТА канала dsh-alert (A-N-1948 модуль №5, находки №3 и №37; Искра, 10.10.2026).
# Предмет: довод 1, иначе БОЕВОЙ /usr/local/bin/dsh-alert. Подставные curl и logger — первыми в PATH, в своём mktemp: curl пишет
#   ТОЛЬКО текст (text=…) и режим разметки, ввод с адресом и токеном читает в /dev/null, не сохраняя; logger пишет в файл стенда,
#   в журнал машины не попадает ничего. В Telegram не уходит ничего.
# Пробы: П1 вызов рукой (без INVOCATION_ID) → текст у curl начинается с «ПРОБА» (№3) · П2 вызов юнитом (INVOCATION_ID задан) →
#   текст без пометки · П3 длинный текст из «&» → в тексте с разметкой нет разрезанной сущности и после разбора ≤ 4096 (№37) ·
#   П4 разметку отвергли → запасной ход без разметки ≤ 4096 знаков (№37).
# Учётка: root (файл токена /etc/dsh-alert.token читает root). Коды: 0 — все пробы; 1 — красные; 2 — слепота.
# ЧЕГО НЕ ЛОВИТ: настоящий ответ Telegram (подставной curl отвечает сам); пустой/нечитаемый файл токена (путь зашит, №25 — чтением).
set -u
P="${1:-/usr/local/bin/dsh-alert}"
[ -r "$P" ] || { echo "СЛЕПОТА: предмет не читается: $P"; exit 2; }
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root (файл токена)"; exit 2; }
[ -s /etc/dsh-alert.token ] || { echo "СЛЕПОТА: /etc/dsh-alert.token пуст или нет — предмет не дойдёт до отправки"; exit 2; }
T=$(mktemp -d /tmp/stend-dsh-alert.XXXXXX) || { echo "СЛЕПОТА: mktemp"; exit 2; }
trap 'rm -rf -- "${T:?}"' EXIT
mkdir "$T/bin"
cat > "$T/bin/curl" <<'SH'
#!/bin/bash
cat > /dev/null
n=$(ls "$STEND_T"/vyzov.* 2>/dev/null | wc -l); rezh=plain; txt=""
while [ "$#" -gt 0 ]; do
  case "$1" in --data-urlencode) case "$2" in text=*) txt=${2#text=} ;; parse_mode=*) rezh=${2#parse_mode=} ;; esac; shift ;; esac; shift
done
printf '%s' "$txt" > "$STEND_T/vyzov.$n.$rezh"
if [ "$rezh" = HTML ] && [ -n "${STEND_OTKAZ_HTML:-}" ]; then echo '{"ok":false,"description":"stend: razmetka otvergnuta"}'; else echo '{"ok":true}'; fi
SH
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "$STEND_T/logger.log"\n' > "$T/bin/logger"; chmod 755 "$T/bin/curl" "$T/bin/logger"
ok=0; bad=0
pr() { if [ "$2" = 0 ]; then echo "✅ $1 — $3"; ok=$((ok+1)); else echo "❌ $1 — $3"; bad=$((bad+1)); fi; }
vyzov() { rm -f "$T"/vyzov.*; env -u INVOCATION_ID -u DSH_ALERT_BOEVOJ PATH="$T/bin:$PATH" STEND_T="$T" "$@" > "$T/out" 2>&1; }
dlina() { python3 -c 'import html,sys; t=open(sys.argv[1],encoding="utf-8").read(); print(len(html.unescape(t)) if sys.argv[2]=="HTML" else len(t))' "$1" "$2"; }
echo "== стенд текста dsh-alert: предмет $P ($(sha256sum "$P" | cut -c1-16))"
vyzov bash "$P" "служба перезапущена"; f=$(ls "$T"/vyzov.0.HTML 2>/dev/null); v=$(cat "$f" 2>/dev/null)
case "$v" in "ПРОБА (вызов рукой, не юнитом): служба перезапущена") r=0 ;; *) r=1 ;; esac; pr "П1 рукой → у curl «ПРОБА …»" $r "текст у curl: «${v:-нет вызова}»"
vyzov env INVOCATION_ID=stend bash "$P" "служба перезапущена"; v=$(cat "$T"/vyzov.0.HTML 2>/dev/null)
[ "$v" = "служба перезапущена" ]; pr "П2 юнитом → без пометки" $? "текст у curl: «${v:-нет вызова}»"
dl=$(python3 -c 'print("x"+"&"*3000)'); echo "   подстава П3: исходный текст ${#dl} знаков, из них «&» 3000"
vyzov env INVOCATION_ID=stend bash "$P" "$dl"; f="$T/vyzov.0.HTML"
if [ -r "$f" ]; then hv=$(head -1 "$f"); hv=${hv: -6}; n=$(dlina "$f" HTML)
  case "$hv" in *'&amp;'|*'&lt;'|*'&gt;') rz=0 ;; *'&'*) rz=1 ;; *) rz=0 ;; esac
  [ "$rz" = 0 ] && [ "$n" -le 4096 ]; pr "П3 обрезка не режет сущность, после разбора ≤ 4096" $? "конец первой строки «$hv», после разбора $n знаков"
else pr "П3 обрезка не режет сущность" 1 "вызова с разметкой нет"; fi
dl=$(python3 -c 'print("я"*5000)'); echo "   подстава П4: исходный текст ${#dl} знаков, разметку подставной curl отвергает"
STEND_OTKAZ_HTML=1; export STEND_OTKAZ_HTML; vyzov env INVOCATION_ID=stend bash "$P" "$dl"; unset STEND_OTKAZ_HTML; f="$T/vyzov.1.plain"
if [ -r "$f" ]; then n=$(dlina "$f" plain); [ "$n" -le 4096 ]; pr "П4 запасной ход ≤ 4096" $? "без разметки $n знаков"
else pr "П4 запасной ход ≤ 4096" 1 "запасного вызова нет ($(ls "$T" | tr '\n' ' '))"; fi
echo "итог: $ok из $((ok+bad))"; [ "$bad" = 0 ] || exit 1
