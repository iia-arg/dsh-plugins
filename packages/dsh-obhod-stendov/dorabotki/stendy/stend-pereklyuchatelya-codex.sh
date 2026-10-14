#!/usr/bin/env bash
# Стенд ночного обхода: переключатель Codex /usr/local/sbin/pereklyuchatel-codex (codex-podpiska-4; ключ PK_STEND — B-N-1395, Заря).
# Гонит случаи G V R A F U K pk-sluchai.sh (подставные подписки и дома в /var/tmp; юниты — только systemctl show; боевые
# ссылки шлюзов ЧИТАЮТСЯ и сверяются до/после) и сверяет нормализованный вывод с эталоном stend-pereklyuchatelya-codex.etalon.
# Предмет по умолчанию — БОЙ; кандидата подавать STEND_PREDMET. Учётка: ROOT (проверка «читается учёткой юнита» — runuser;
# под iskra случай G ложно краснеет «НЕ читается»). Коды: 0 совпало · 1 расхождение · 2 слепота.
# ЧЕГО НЕ ЛОВИТ: смену живых шлюзов не делает; номер боевой подписки (3/4) из сверки вырезан — на него не смотрит.
set -u
D=$(dirname "$(readlink -f "$0")"); P="${STEND_PREDMET:-/usr/local/sbin/pereklyuchatel-codex}"
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root (runuser) — строка обхода «@root»"; exit 2; }
[ -r "$P" ] && [ -r "$D/pk-sluchai.sh" ] && [ -r "$D/stend-pereklyuchatelya-codex.etalon" ] || { echo "СЛЕПОТА: нет предмета/случаев/эталона"; exit 2; }
out=$(bash "$D/pk-sluchai.sh" "$P" G V R A F U K Д 2>&1); k=$?
[ $k -eq 0 ] || { echo "СЛЕПОТА: стенд случаев кончился кодом $k"; exit 2; }
printf '%s\n' "$out" | grep -aq 'СЛЕПОТА' && { echo "СЛЕПОТА в стенде случаев"; exit 2; }
boj=$(printf '%s\n' "$out" | grep -ao 'боевые ссылки до/после: [0-9a-f]* / [0-9a-f]*')
set -- $boj; [ -n "${4:-}" ] && [ "${4:-}" = "${6:-}" ] || { echo "🔴 БОЕВЫЕ ССЫЛКИ ИЗМЕНИЛИСЬ за прогон: $boj"; exit 1; }
norm(){ sed -E 's#codex-podpiska-[34]#codex-podpiska-N#g; s#до/после: [0-9a-f]+ / [0-9a-f]+#до/после: равны#'; }
r=$(diff <(norm < "$D/stend-pereklyuchatelya-codex.etalon") <(printf '%s\n' "$out" | norm)) && { echo "совпало с эталоном: $(printf '%s\n' "$out" | grep -ac '^===') случаев, боевые ссылки не тронуты"; exit 0; }
echo "🔴 РАСХОЖДЕНИЕ с эталоном (предмет $P):"; printf '%s\n' "$r" | head -40; exit 1
