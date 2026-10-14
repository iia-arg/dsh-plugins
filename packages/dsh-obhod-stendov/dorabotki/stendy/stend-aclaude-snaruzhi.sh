#!/usr/bin/env bash
# stend-aclaude-snaruzhi.sh — стенд внешнего прибора aclaude (C-H-088, 01.10.2026, Искра).
# Гоняет aclaude-snaruzhi-watch на ПОДСТАВЕ: каналы — файлы-заглушки, ssh — заглушка с выводом по договору v1,
# sshd — локальный слушатель (python, гасится по сохранённому pid). Боевые каналы, aclaude и /var/lib не трогаются:
# конфигурация стенда переопределяет SOST/ALERT_*/SSH_KOMANDA/ZHURNAL, и перед запуском это проверяется (иначе СЛЕПОТА, код 2).
# Пробы — условия Вениамина 04:48Z: (а) неверный порт в карте → sh2 красный поимённо; (б) свежесть сторожей 0 мин → красный;
# (в) неверный адрес одного пути → строка журнала, обоих → тревога после 3 промахов; (г) forced command отсутствует →
# «проба не исполнилась»; возврат — зелёный ВТОРЫМ прогоном (отбой). Плюс: цикл перезапусков, диск, пропуск sh2 при
# красном sh1, повтор не чаще часа, канал (@idomik отказал → запасной с названной подменой; оба → код 3), отказ на довод.
# Подставной вывод — формат proba-snaruzhi v1 Михалыча (konec strok=N). ГДЕ СЛЕП: настоящий ssh и настоящий proba-snaruzhi —
# проверяется только разбор договора;
# настоящие боты; systemd-такт. Использование: stend-aclaude-snaruzhi.sh [путь к скрипту] (по умолчанию боевой).
set -uo pipefail
SKRIPT="${1:-/usr/local/sbin/aclaude-snaruzhi-watch}"
[ -r "$SKRIPT" ] || { echo "СЛЕПОТА: нет предмета $SKRIPT"; exit 2; }
grep -qF 'SSH_KOMANDA' "$SKRIPT" && grep -qF 'SNARUZHI_KONF' "$SKRIPT" || { echo "СЛЕПОТА: предмет не понимает подмену (SSH_KOMANDA/SNARUZHI_KONF) — не запускаю, иначе настоящие тревоги"; exit 2; }
T=$(mktemp -d /tmp/stend-aclaude-snaruzhi.XXXXXX); LP=""
ubrat() { [ -n "$LP" ] && kill "$LP" 2>/dev/null; rm -rf "$T"; }
trap ubrat EXIT

# слушатель вместо sshd
python3 -c 'import socket,sys,time
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(50); print(s.getsockname()[1], flush=True)
while True:
    c,_=s.accept(); c.close()' > "$T/port" & LP=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$T/port" ] && break; sleep 0.2; done
ZHIV="127.0.0.1:$(cat "$T/port")"; MERTV="127.0.0.1:1"

# заглушки каналов: пишут текст в файл; *.otkaz — отказать
for k in idomik zapas; do
  printf '#!/bin/bash\n[ -e "%s/%s.otkaz" ] && exit 1\nprintf "%%s\\n" "${@: -1}" >> "%s/%s.log"\n' "$T" "$k" "$T" "$k" > "$T/$k"; chmod +x "$T/$k"
done
# заглушка ssh: печатает $T/proba.out; $T/net-komandy — как при отсутствии forced command
cat > "$T/ssh" <<EOF
#!/bin/bash
[ -e "$T/net-komandy" ] && { echo "bash: line 1: /usr/local/bin/proba-snaruzhi: No such file or directory" >&2; exit 127; }
: > "$T/ssh-zvan"
cat "$T/proba.out"
EOF
chmod +x "$T/ssh"
printf '#!/bin/bash\nprintf "%%s\\n" "$*" >> "%s/zhurnal"\n' "$T" > "$T/zhurnal-cmd"; chmod +x "$T/zhurnal-cmd"

ISPRAVNAYA() {  # формат proba-snaruzhi v1 Михалыча (образец живого прогона 01.10 ~07:50 МСК)
  local n=0 i p=3100
  say() { printf '%s\n' "$*"; n=$((n+1)); }
  say "proba-snaruzhi v1 host=aclaude now=1790830287"
  for i in claudeclaw coder ostrov lyudmila server upiter zinaida yuna nika veniamin; do say "unit claudeclaw-$i.service state=active vozrast_s=7300"; done
  for i in claudeclaw coder ostrov lyudmila server upiter zinaida yuna nika veniamin; do say "health $p $i kod=200"; p=$((p+1)); done
  say "disk / zanyato_pct=74"
  say "storozh mesto-aclaude-watch.timer proshlo_s=200"; say "storozh claudeclaw-stuck-watch.timer proshlo_s=200"
  echo "konec strok=$n"
}
konf() {  # $1 — доп. строки
  cat > "$T/conf" <<EOF
SOST="$T/sost"; ALERT_IDOMIK="$T/idomik"; ALERT_ZAPAS="$T/zapas"; PAUZY="0 0"
SSH_KOMANDA="$T/ssh"; ZHURNAL="$T/zhurnal-cmd"
PUTI="$ZHIV $ZHIV"
$1
EOF
}
nachalo() { rm -rf "$T/sost" "$T"/*.log "$T"/*.otkaz "$T/net-komandy" "$T/zhurnal"; ISPRAVNAYA > "$T/proba.out"; konf "${1:-}"; }
progon() { SNARUZHI_KONF="$T/conf" bash "$SKRIPT" "$@" >/dev/null 2>&1; echo $?; }
chislo() { [ -f "$T/$1.log" ] || { echo 0; return; }; grep -cF -- "$2" "$T/$1.log"; }  # grep -c при 0 даёт код 1 — не дописывать второй 0
# защитный: конфигурация стенда действительно уводит всё в подставу
nachalo; . "$T/conf"; case "$SOST$ALERT_IDOMIK$ALERT_ZAPAS$SSH_KOMANDA" in *"$T"*"$T"*"$T"*"$T"*) ;; *) echo "СЛЕПОТА: подстава не взята"; exit 2;; esac

PROV=0; PROVAL=0
p() { PROV=$((PROV+1)); if [ "$2" = "$3" ]; then echo "  ✓ $1"; else PROVAL=$((PROVAL+1)); echo "  ✗ $1 — ждали «$3», есть «$2»"; fi; }

echo "== П1 исправное: sh1 и sh2 по два прогона — тишина"
nachalo; for _ in 1 2; do progon sh1 >/dev/null; progon sh2 >/dev/null; done
p "П1 тревог 0" "$(chislo idomik '')$(chislo zapas '')" "00"

echo "== П2 (в) один путь мёртв — строка журнала, тревоги нет"
nachalo "PUTI=\"$MERTV $ZHIV\""; for _ in 1 2 3 4; do progon sh1 >/dev/null; done
p "П2 тревог 0" "$(chislo idomik '')" "0"
p "П2 в журнале путь назван «НЕТ»" "$(grep -cF "$MERTV НЕТ" "$T/zhurnal")" "4"

echo "== П3 (в) оба пути мертвы — тревога на 3-м промахе, не раньше; 4-й не повторяет"
nachalo "PUTI=\"$MERTV $MERTV\""
progon sh1 >/dev/null; progon sh1 >/dev/null; p "П3 после 2 промахов тревог 0" "$(chislo idomik '')" "0"
progon sh1 >/dev/null; p "П3 после 3-го — «НЕДОСТУПЕН»" "$(chislo idomik 'aclaude НЕДОСТУПЕН')" "1"
progon sh1 >/dev/null; p "П3 4-й промах не повторяет (повтор раз в час)" "$(chislo idomik '')" "1"
p "П3 метка «[снаружи, с sadik]»" "$(chislo idomik '[снаружи, с sadik]')" "1"
echo "== П4 sh2 при красном sh1 не гоняется"
: > "$T/net-komandy"; progon sh2 >/dev/null; progon sh2 >/dev/null
p "П4 «пропущен» в журнале, тревоги sh2 нет" "$(grep -cF 'sh2: пропущен' "$T/zhurnal")/$(chislo idomik 'НЕ ИСПОЛНИЛАСЬ')" "2/0"
rm -f "$T/net-komandy"
echo "== П5 возврат sh1: отбой только ВТОРЫМ зелёным"
sed -i "s|^PUTI=.*|PUTI=\"$ZHIV $MERTV\"|" "$T/conf"
progon sh1 >/dev/null; p "П5 первый зелёный — отбоя нет" "$(chislo idomik 'снято')" "0"
progon sh1 >/dev/null; p "П5 второй зелёный — «снято»" "$(chislo idomik 'снято')" "1"

echo "== П6 (а) неверный порт в карте (nika:3118) — красный поимённо на 2-м прогоне"
nachalo 'KARTA="claudeclaw:3100 coder:3101 ostrov:3102 lyudmila:3103 server:3104 upiter:3105 zinaida:3106 yuna:3107 nika:3118 veniamin:3109"'
progon sh2 >/dev/null; p "П6 первый красный — тревоги нет" "$(chislo idomik '')" "0"
progon sh2 >/dev/null; p "П6 тревога называет nika и :3118" "$(chislo idomik 'nika: вебхук-сервер :3118 — строки нет в пробе')" "1"
p "П6 других инстансов в тревоге нет" "$(cat "$T/idomik.log" 2>/dev/null | grep -cE 'coder:|yuna:|ostrov:')" "0"
p "П6 текст не говорит «агент жив»" "$(cat "$T/idomik.log" 2>/dev/null | grep -ciF 'агент жив')" "0"
sed -i 's/nika:3118/nika:3108/' "$T/conf"
progon sh2 >/dev/null; p "П6 возврат: первый зелёный — отбоя нет" "$(chislo idomik 'снято')" "0"
progon sh2 >/dev/null; p "П6 возврат: второй — «снято»" "$(chislo idomik 'снято')" "1"

echo "== П7 (б) свежесть сторожей 0 мин — красный с именами сторожей"
nachalo 'SVEZHEST_MIN=0'; progon sh2 >/dev/null; progon sh2 >/dev/null
p "П7 названы оба сторожа" "$(chislo idomik 'mesto-aclaude-watch.timer не запускался')$(chislo idomik 'claudeclaw-stuck-watch.timer не запускался')" "11"
sed -i 's/^SVEZHEST_MIN=0/SVEZHEST_MIN=15/' "$T/conf"; progon sh2 >/dev/null; progon sh2 >/dev/null
p "П7 возврат — «снято»" "$(chislo idomik 'снято')" "1"

echo "== П8 (г) forced command отсутствует — «проба не исполнилась»"
nachalo; : > "$T/net-komandy"; progon sh2 >/dev/null; progon sh2 >/dev/null
p "П8 «НЕ ИСПОЛНИЛАСЬ» с текстом ssh" "$(chislo idomik 'НЕ ИСПОЛНИЛАСЬ')$(chislo idomik 'код 127')" "11"
p "П8 не выдаёт себя за «красное по инстансам»" "$(chislo idomik 'красно')" "0"
rm -f "$T/net-komandy"; progon sh2 >/dev/null; progon sh2 >/dev/null
p "П8 возврат — «снято»" "$(chislo idomik 'снято')" "1"
echo "== П8б оборванный вывод (нет KONEC) — тоже «не исполнилась»"
nachalo; ISPRAVNAYA | head -5 > "$T/proba.out"; progon sh2 >/dev/null; progon sh2 >/dev/null
p "П8б «НЕ ИСПОЛНИЛАСЬ»" "$(chislo idomik 'НЕ ИСПОЛНИЛАСЬ')" "1"
echo "== П8в konec есть, но счёт строк не сошёлся (строка выпала посередине) — «не исполнилась»"
nachalo; ISPRAVNAYA | grep -v '^health 3105 ' > "$T/proba.out"; progon sh2 >/dev/null; progon sh2 >/dev/null
p "П8в «НЕ ИСПОЛНИЛАСЬ», не «красно»" "$(chislo idomik 'НЕ ИСПОЛНИЛАСЬ')/$(chislo idomik 'красно')" "1/0"
echo "== П8г поле «?» с oshibka — красный поимённо, причина в тексте"
nachalo; ISPRAVNAYA | sed -e 's/^unit claudeclaw-coder.service state=active vozrast_s=7300$/unit claudeclaw-coder.service state=? vozrast_s=? oshibka=systemctl:Failed_to_connect_to_bus/' \
  -e 's/^storozh mesto-aclaude-watch.timer proshlo_s=200$/storozh mesto-aclaude-watch.timer proshlo_s=? oshibka=net_vremeni/' -e 's/^disk \/ zanyato_pct=74$/disk \/ zanyato_pct=?/' > "$T/proba.out"
grep -cF 'state=? ' "$T/proba.out" > "$T/vneseno"; progon sh2 >/dev/null; progon sh2 >/dev/null
p "П8г порча внесена (state=? строк 1)" "$(cat "$T/vneseno")" "1"
p "П8г coder: не снято, причина названа" "$(chislo idomik 'coder: состояние юнита не снято (systemctl:Failed_to_connect_to_bus)')" "1"
p "П8г сторож и диск: не снято" "$(chislo idomik 'mesto-aclaude-watch.timer: время запуска не снято (net_vremeni)')$(chislo idomik 'заполнение диска / не снято (?)')" "11"
echo "== П8д карты разошлись: у aclaude :3102 — не ostrov"
nachalo; ISPRAVNAYA | sed 's/^health 3102 ostrov kod=200$/health 3102 lyudmila kod=200/' > "$T/proba.out"; progon sh2 >/dev/null; progon sh2 >/dev/null
p "П8д «карта разошлась» поимённо" "$(chislo idomik 'карта разошлась: у sadik :3102 — ostrov, у aclaude — lyudmila')" "1"

echo "== П9 цикл перезапусков (nika 5 с, yuna activating) и диск 98% — поимённо"
nachalo; ISPRAVNAYA | sed -e 's/^unit claudeclaw-nika.service state=active vozrast_s=7300/unit claudeclaw-nika.service state=active vozrast_s=5/' \
  -e 's/^unit claudeclaw-yuna.service state=active vozrast_s=7300/unit claudeclaw-yuna.service state=activating vozrast_s=3/' -e 's/^disk \/ zanyato_pct=74/disk \/ zanyato_pct=98/' > "$T/proba.out"
progon sh2 >/dev/null; progon sh2 >/dev/null
p "П9 nika моложе 120 с" "$(chislo idomik 'nika: процесс моложе 120 с (5 с)')" "1"
p "П9 yuna activating" "$(chislo idomik 'yuna: юнит activating')" "1"
p "П9 диск 98%" "$(chislo idomik 'диск / заполнен 98%')" "1"
p "П9 всего красных пунктов ровно 3" "$(chislo idomik 'красно 3:')" "1"

echo "== П9б вебхук-сервер есть в пробе, но отвечает не 200 (nika :3108 kod=000, yuna :3107 kod=502)"
nachalo; ISPRAVNAYA | sed -e 's/^health 3108 nika kod=200$/health 3108 nika kod=000/' -e 's/^health 3107 yuna kod=200$/health 3107 yuna kod=502/' > "$T/proba.out"
progon sh2 >/dev/null; progon sh2 >/dev/null
p "П9б nika код 000 и yuna код 502 поимённо" "$(chislo idomik 'nika: вебхук-сервер :3108 не отвечает (код 000)')$(chislo idomik 'yuna: вебхук-сервер :3107 не отвечает (код 502)')" "11"

echo "== П10 канал: @idomik отказал — запасной с названной подменой; оба — код 3 и повтор следующим"
nachalo "PUTI=\"$MERTV $MERTV\""; : > "$T/idomik.otkaz"
progon sh1 >/dev/null; progon sh1 >/dev/null; k=$(progon sh1)
p "П10 запасной получил с текстом подмены, код 0" "$(chislo zapas 'канал @idomik_bot с sadik не отправил; тревога про aclaude')/$k" "1/0"
nachalo "PUTI=\"$MERTV $MERTV\""; : > "$T/idomik.otkaz"; : > "$T/zapas.otkaz"
progon sh1 >/dev/null; progon sh1 >/dev/null; k=$(progon sh1)
p "П10 оба отказали — код 3, тревога не помечена" "$k/$( [ -f "$T/sost/sh1.trevoga" ] && echo pomechena || echo net)" "3/net"
rm -f "$T/idomik.otkaz" "$T/zapas.otkaz"; k=$(progon sh1)
p "П10 следующий прогон досылает" "$k/$(chislo idomik 'НЕДОСТУПЕН')" "0/1"

echo "== П11 довод: --dry-run и пусто — отказ, код 2, ничего не отправлено"
nachalo; a=$(progon --dry-run); b=$(SNARUZHI_KONF="$T/conf" bash "$SKRIPT" >/dev/null 2>&1; echo $?)
p "П11 коды 2/2, тревог 0" "$a/$b/$(chislo idomik '')" "2/2/0"

echo "== П12 sh2 без учётки и ключа (без подставы ssh) — код 4, не ходит"
nachalo; sed -i 's/^SSH_KOMANDA=.*//' "$T/conf"; echo "POLZOVATEL=\"\"" >> "$T/conf"
p "П12 код 4, тревог 0" "$(progon sh2)/$(chislo idomik '')" "4/0"

echo "== П13 подмена ssh в боевом окружении — отказ, код 2, ssh не зван (замечание Вениамина; вывод зелёный и прогон один —"
echo "   даже без охраны отправлять было бы нечего: настоящий канал не зовётся)"
for boevoe in ALERT_IDOMIK SOST "ALERT_IDOMIK ALERT_ZAPAS"; do
  nachalo; for v in $boevoe; do sed -i "s|$v=\"[^\"]*\"; *||" "$T/conf"; done
  vneseno=$(for v in $boevoe; do grep -cF "$v=" "$T/conf"; done | tr '\n' ' ')
  rm -f "$T/ssh-zvan"; k=$(progon sh2)
  p "П13 боевое [$boevoe] (строк в conf после выреза: ${vneseno% }): код 2, ssh не зван" "$k/$( [ -e "$T/ssh-zvan" ] && echo zvan || echo net)" "2/net"
done
nachalo; rm -f "$T/ssh-zvan"; k=$(progon sh2)
p "П13 возврат: всё подменено — код 0, ssh зван" "$k/$( [ -e "$T/ssh-zvan" ] && echo zvan || echo net)" "0/zvan"

echo "ИТОГ: проб $PROV, провалов $PROVAL"
[ "$PROVAL" -eq 0 ]
