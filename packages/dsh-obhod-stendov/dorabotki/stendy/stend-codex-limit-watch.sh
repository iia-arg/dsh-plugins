#!/usr/bin/env bash
# Стенд ночного обхода: сторож лимита Codex /usr/local/sbin/codex-limit-watch (B-N-1232, ключ CLW_STEND — B-N-1395, Заря).
# Гонит ВСЕ случаи clw-sluchai.sh (подставные дома/подписки/переключатель/тревога в /var/tmp, источник — JSON или
# подставной app-server fake-codex.py; боевые пути НЕ пишутся; случай X грузит модуль без запуска) и сверяет нормализованный
# вывод с эталоном stend-codex-limit-watch.etalon. Предмет по умолчанию — БОЙ; кандидата подавать STEND_PREDMET.
# Учётка: iskra, root НЕ нужен (замер 02.10: 44 с). Коды: 0 совпало · 1 расхождение (печатает diff) · 2 слепота.
# ЧЕГО НЕ ЛОВИТ: живой app-server и живой переключатель не зовутся; эталон снят с кандидата 746be7c0 — смена поведения
# сторожа требует нового эталона (это и есть сигнал), смена только формулировок — тоже.
set -u
D=$(dirname "$(readlink -f "$0")"); P="${STEND_PREDMET:-/usr/local/sbin/codex-limit-watch}"
[ -r "$P" ] && [ -r "$D/clw-sluchai.sh" ] && [ -r "$D/fake-codex.py" ] && [ -r "$D/stend-codex-limit-watch.etalon" ] || { echo "СЛЕПОТА: нет предмета/случаев/эталона"; exit 2; }
out=$(bash "$D/clw-sluchai.sh" "$P" N P F A Z H B O R E W Q S U D K L Y V X 2>&1); k=$?
[ $k -eq 0 ] || { echo "СЛЕПОТА: стенд случаев кончился кодом $k"; printf '%s\n' "$out" | tail -5; exit 2; }
printf '%s\n' "$out" | grep -aq 'СЛЕПОТА' && { echo "СЛЕПОТА в стенде случаев"; exit 2; }
norm(){ sed -E 's#/var/tmp/zclw-[A-Za-z0-9]+#<T>#g; s/\[[0-9]+ с\]//g; s/"at": [0-9.]+/"at": N/g'; }
r=$(diff <(norm < "$D/stend-codex-limit-watch.etalon") <(printf '%s\n' "$out" | norm)) && { echo "совпало с эталоном: $(printf '%s\n' "$out" | grep -ac '^===') случаев"; exit 0; }
echo "🔴 РАСХОЖДЕНИЕ с эталоном (предмет $P):"; printf '%s\n' "$r" | head -40; exit 1
