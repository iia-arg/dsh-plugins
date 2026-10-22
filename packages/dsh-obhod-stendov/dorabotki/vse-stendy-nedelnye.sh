#!/bin/bash
# НЕДЕЛЬНЫЙ ПРОГОН ДОЛГИХ СТЕНДОВ (B-N-1074, 26.09.2026, Аврора; решение Забавы). Зовёт vse-stendy-nedelnye.timer (среда 01:30Z).
# ЗАЧЕМ ОТДЕЛЬНО: stend-vzaimnogo-nabludeniya (~922 с) и stend-storozha-reestrov (~938 с + ~70 с предварительной пробы B-N-1073)
#   дали бы ночному обходу +31 мин при его пределе службы 50 мин. Без зовущего они стояли красными незамеченными (B-N-1064).
# КАК: нового кода нет — тот же обходчик vse-stendy-boevye.sh и та же обёртка vse-stendy-po-tajmeru.sh (тревога agent-alert только
#   при неожиданном; зелёное и ожидаемое — строкой в журнал; поломка сторожа — код 3, юнит failed → sadik-watch, storozha-sutochnye).
#   Здесь только то, что в Environment= юнита не положить: многострочные область и пределы.
# ⚠️ ЧЕГО НЕ ДЕЛАЕТ: не берёт stend-krug-samoproverki (ручной: трогает живой apt-daily.timer и пишет drop-in в /etc/systemd).
#   Текст тревоги — общий с ночным обходом («обходчик стендов sadik…»); различает их имя стенда в тревоге и юнит в журнале.
set -u
# B-N-1808 (08.10, Михалыч): stend-needrestart — в ОБЛАСТЬ недельного (без строки области перечень давал «вне области», недельный 08.10 07:14Z); под iskra, sudo внутри стенда; предел 300 с (замок ждёт до 60 с)
K=/opt/iskra/workspace/dorabotki
export OBLAST_STENDOV="${OBLAST_STENDOV-$K/stend-vzaimnogo-nabludeniya.sh
$K/stend-storozha-reestrov.sh
$K/stendy/stend-sadik-watch-bez-sredy.sh
$K/stendy/stend-storozha-nad-storozhami.sh
$K/stend-needrestart.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-vsplesk.py @root /opt/iskra/app}"
export PERECHEN_STENDOV="${PERECHEN_STENDOV:-$K/perechen-nedelnyh-stendov.txt}"
# предел стенда = замер × ~2,4 (как B-N-991): 922/938 с (+70 с пробы B-N-1073) → 2400 с; весь прогон — сумма с запасом
export PREDEL_STENDOV="${PREDEL_STENDOV-$K/stend-vzaimnogo-nabludeniya.sh 2400
$K/stend-storozha-reestrov.sh 2400
$K/stendy/stend-sadik-watch-bez-sredy.sh 220
$K/stendy/stend-storozha-nad-storozhami.sh 3200
$K/stend-needrestart.sh 300
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-vsplesk.py 300}"
# B-N-1768 (07.10): +stend-sadik-watch-bez-sredy (90 с → 220) и stend-storozha-nad-storozhami (1330 с → 3200), замер Авроры 07.10 × ~2,4.
#   Весь прогон: худший замер 1209+1008+1330+90 ≈ 3640 с < 5400 < TimeoutStartSec юнита 95 мин (5700 с) — общий предел не меняю.
export VSE_STENDY_PREDEL="${VSE_STENDY_PREDEL:-5400}"
# 3.1.63 (15.10, Искра; находка С1 → маркер Авроры в dsh-trevogi 3.1.4): stend-vsplesk.py — живой (подставные юниты на
#   настоящем systemd), из ночного обхода перенесён сюда; ключ --zhivaya-mashina поимённо, предел 300 с (замер ~5 с), @root.
# B-N-1929 (Заря; условие Вениамина 10:36Z п.1): недельный — ЗАКОННЫЙ зовущий живых стендов. Ключ --zhivaya-mashina подаётся ЯВНО и
#   ПОИМЁННО только строкам SREDA ниже (было две; 3.1.63 — третья) (через «--» в SREDA_STENDOV: обходчик отдаёт стенду всё после «--»), не всем подряд. Ночной обход и
#   ворота выпуска ключ НЕ подают — у них SREDA обходчика, где этого слова нет. Свой SREDA здесь замещает умолчание обходчика целиком:
#   из пяти стендов недельного ни одному строк умолчания не нужно (замер 09.10: в SREDA обходчика их имён нет).
export SREDA_STENDOV="${SREDA_STENDOV-$K/stend-vzaimnogo-nabludeniya.sh -- --zhivaya-mashina
$K/stend-needrestart.sh -- --zhivaya-mashina
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-vsplesk.py -- --zhivaya-mashina}"
printf 'недельный обход подаёт --zhivaya-mashina (живая машина, ручной ключ недельного): %s\n' "$K/stend-vzaimnogo-nabludeniya.sh" "$K/stend-needrestart.sh" "/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-vsplesk.py"
exec bash "${OBERTKA:-$K/vse-stendy-po-tajmeru.sh}"
