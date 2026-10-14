#!/usr/bin/env bash
# RU: Стенд проверки покрытия ядер dkms-kernel-coverage-check.sh: исправное молчит, порча
# RU: (ядро без модуля, починка не удалась) краснеет с именем ядра, порча снята — снова тихо.
# RU: Плюс проба «без настройки».
# EN: Stand for dkms-kernel-coverage-check.sh: healthy is silent, a fault (a kernel without the
# EN: module, repair failed) turns red naming the kernel, fault removed — quiet again. Plus a
# EN: "no settings" probe.
#
# RU: ВОЗДЕЙСТВИЕ: машина не меняется. dpkg-query, dpkg, dkms, apt-get, hostname, logger и
# RU: канал тревоги (agent-alert и запасное имя) — заглушки; PATH собран БЕЗ /usr/local/*, чтобы
# RU: настоящий канал не нашёлся ни под каким именем. Перед пробами — сверка, что каждое имя
# RU: разрешается в заглушку; нет — ОТКАЗ (код 2).
# EN: IMPACT: the machine is not changed. dpkg-query, dpkg, dkms, apt-get, hostname, logger and the
# EN: alert channel (agent-alert and the fallback name) are stubs; PATH is built WITHOUT /usr/local/*
# EN: so the real channel cannot be found under any name. Before probing every name is checked
# EN: to resolve to a stub; otherwise REFUSAL (exit 2).
#
# RU: ОХВАТ: ветки «всё покрыто», «не починилось», «без настройки». Ветка «починилось само» и
# RU: запасное имя канала здесь не проверяются (их проверял сравнительный стенд при переносе).
# RU: Настоящая сборка dkms и настоящий apt — НЕ проверяются: они подставные.
# EN: COVERAGE: "all covered", "repair failed", "no settings". The "repaired itself" branch and the
# EN: fallback channel name are not checked here (the comparison stand covered them during porting).
# EN: Real dkms builds and real apt are NOT checked: they are stubs.
set -uo pipefail
export LC_ALL=C.UTF-8
HERE="$(cd "$(dirname "$0")" && pwd)"
CEL="${CEL:-$HERE/../bin/dkms-kernel-coverage-check.sh}"
[ -r "$CEL" ] || { echo "СЛЕПОТА: нет $CEL"; exit 2; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
S="$T/stub"; mkdir -p "$S"
ok=0; bad=0
p() { echo "ok   $1"; ok=$((ok+1)); }
f() { echo "FAIL $1"; bad=$((bad+1)); }

# RU: Установленные ядра — файл $T/kernels; покрытие dkms — файл $T/covered.
# EN: Installed kernels — file $T/kernels; dkms coverage — file $T/covered.
printf '6.8.0-10-generic\n6.8.0-20-generic\n' > "$T/kernels"
cat > "$S/dpkg-query" <<EOF
#!/bin/sh
echo "dpkg-query \$*" >> "$T/calls"; sed 's/^/linux-image-/' "$T/kernels"
EOF
cat > "$S/dkms" <<EOF
#!/bin/sh
echo "dkms \$*" >> "$T/calls"
case "\$1" in
  status) while read -r k; do echo "probamod/1.0.1, \$k, x86_64: installed"; done < "$T/covered" ;;
  install) exit 1 ;;
esac
EOF
printf '#!/bin/sh\necho "dpkg $*" >> "%s/calls"\necho "ii  linux-headers"\n' "$T" > "$S/dpkg"
for c in apt-get logger agent-alert; do printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\n' "$c" "$T" > "$S/$c"; done
printf '#!/bin/sh\necho proba-host\n' > "$S/hostname"
# RU: 1.0.1: заглушка канала сохраняет и ТЕКСТ тревоги целиком (переводы строк видны).
printf '#!/bin/sh\necho "agent-alert $*" >> "%s/calls"\nprintf "%%s" "$1" > "%s/msg"\n' "$T" "$T" > "$S/agent-alert"
chmod +x "$S"/*
export PATH="$S:/usr/sbin:/usr/bin:/sbin:/bin"
for c in dpkg-query dkms dpkg apt-get logger agent-alert hostname; do
  [ "$(command -v "$c")" = "$S/$c" ] || { echo "ОТКАЗ: $c → $(command -v "$c"), не заглушка — пробы не начаты"; exit 2; }
done
progon() { : > "$T/calls"; OUT="$(DKMS_COVERAGE_MODULE=probamod bash "$CEL" 2>&1)"; RC=$?; }

echo "── 1. исправное: оба ядра покрыты · healthy: both kernels covered"
cp "$T/kernels" "$T/covered"; progon
[ "$RC" = 0 ] && [ -z "$OUT" ] && ! grep -q '^agent-alert' "$T/calls" \
  && p "исправное: код 0, тишина, тревог 0" || f "исправное: код $RC | $OUT | $(cat "$T/calls")"

echo "── 2. порча: ядро 6.8.0-20-generic без модуля, dkms install отказывает"
echo "   fault: kernel 6.8.0-20-generic lacks the module, dkms install fails"
grep -vxF 6.8.0-20-generic "$T/kernels" > "$T/covered"
echo "  порча внесена · fault injected: покрыто $(wc -l < "$T/covered") из $(wc -l < "$T/kernels") ядер"
progon
# RU: 1.0.1: текст тревоги многострочный — ищем в полном тексте ($T/msg), а не в строке журнала вызовов.
[ "$RC" = 1 ] && grep -q '^agent-alert' "$T/calls" && grep -qF 'НЕ собран' "$T/msg" && grep -qF 6.8.0-20-generic "$T/msg" && grep -q '^logger -t dkms-coverage FAILED: 6.8.0-20-generic' "$T/calls" \
  && p "порча: код 1, тревога и журнал называют 6.8.0-20-generic" || f "порча: код $RC | $(cat "$T/calls")"

echo "── 3. порча снята — снова тихо · fault removed — quiet again"
cp "$T/kernels" "$T/covered"
echo "  порча снята · fault removed: покрыто $(wc -l < "$T/covered") из $(wc -l < "$T/kernels") ядер"
progon
[ "$RC" = 0 ] && [ -z "$OUT" ] && ! grep -q '^agent-alert' "$T/calls" \
  && p "после снятия: код 0, тишина" || f "после снятия: код $RC | $OUT"

echo "── 4. без настройки: проверка выключена и говорит об этом · no settings: off and says so"
: > "$T/calls"; OUT="$(bash "$CEL" 2>&1)"; RC=$?
# RU: r2 (условие ворот): без модуля — провал кодом 2 и «НЕ НАСТРОЕНО», не «выключено молча».
# EN: r2 (gate condition): no module — failure exit 2 and "НЕ НАСТРОЕНО", not "silently off".
[ "$RC" = 2 ] && grep -qF 'НЕ НАСТРОЕНО: DKMS_COVERAGE_MODULE не задан' <<<"$OUT" && [ ! -s "$T/calls" ] \
  && p "без настройки: код 2, «НЕ НАСТРОЕНО», ни одного вызова" || f "без настройки: код $RC | $OUT | $(cat "$T/calls")"

echo "── 5. 1.0.1: dpkg-query не назвал ни одного ядра — слепота, не «покрыто»"
cp "$T/kernels" "$T/kernels.sohr"; : > "$T/kernels"; echo "  порча: ядер в ответе $(wc -l < "$T/kernels")"
progon
[ "$RC" = 2 ] && grep -qF 'СЛЕПОТА: dpkg-query не назвал ни одного' <<<"$OUT" && ! grep -q '^agent-alert' "$T/calls" \
  && p "пустой dpkg-query: код 2, «СЛЕПОТА»" || f "пустой dpkg-query: код $RC | $OUT"
cp "$T/kernels.sohr" "$T/kernels"

echo "── 6. 1.0.1: dkms status не знает модуля — слепота"
: > "$T/covered"; echo "  порча: строк dkms status $(wc -l < "$T/covered")"
progon
[ "$RC" = 2 ] && grep -qF 'СЛЕПОТА: dkms status не знает модуля probamod' <<<"$OUT" \
  && p "dkms без модуля: код 2, «СЛЕПОТА» с именем модуля" || f "dkms без модуля: код $RC | $OUT"
cp "$T/kernels" "$T/covered"

echo "── 7. 1.0.1: текст тревоги — настоящие переводы строк, без %0A"
grep -vxF 6.8.0-20-generic "$T/kernels" > "$T/covered"; rm -f "$T/msg"; progon
[ -s "$T/msg" ] && ! grep -qF '%0A' "$T/msg" && [ "$(wc -l < "$T/msg")" -ge 2 ] \
  && p "тревога: %0A нет, строк $(($(wc -l < "$T/msg")+1))" || f "тревога: $(cat "$T/msg" 2>/dev/null | head -c 200)"
cp "$T/kernels" "$T/covered"

echo; echo "ИТОГ: ok=$ok fail=$bad"
[ $((ok+bad)) -eq 7 ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из 7"; exit 2; }
[ "$bad" -eq 0 ] || exit 1
exit 0
