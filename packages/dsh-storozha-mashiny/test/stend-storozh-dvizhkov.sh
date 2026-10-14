#!/bin/bash
# RU: Стенд storozh-dvizhkov.sh — три пробы: исправное (под шлюзом один движок) молчит · порча (два движка дольше
# RU: порога) краснеет, называя число движков и их PID · порча снята — отметка снята, снова зелёное.
# RU: Плюс: короткое перекрытие молчит; шлюза нет — слепота; не настроен — говорит об этом.
# RU: `ps`, `pgrep`, `agent-alert`, `logger` и прочие — заглушки ПЕРВЫМИ в PATH (процессы машины не читаются);
# RU: отметка — во временном каталоге (SD_SOSTOYANIE). Любая учётка.
# EN: Test stand for storozh-dvizhkov.sh — three probes: healthy (one engine under the gateway) is quiet · fault (two
# EN: engines longer than the threshold) goes red naming the engine count and PIDs · fault removed — mark removed,
# EN: green again. Plus: a short overlap is quiet; no gateway — blindness; not configured — says so.
# EN: `ps`, `pgrep`, `agent-alert`, `logger` and others are stubs FIRST in PATH (machine processes are not read);
# EN: the mark is temporary (SD_SOSTOYANIE). Any account.
# RU: bash stend-storozh-dvizhkov.sh [сторож] · EN: bash stend-storozh-dvizhkov.sh [watchdog]
set -u
I=${1:-$(cd "$(dirname "$0")/.." && pwd)/bin/storozh-dvizhkov.sh}
R=$(mktemp -d /tmp/stend-dvizhkov.XXXXXX) || exit 2; trap 'rm -rf "$R"' EXIT
# RU: 1.0.6: файл настроек машины стенду не нужен — без этого живой /etc/dsh-storozha-mashiny/*.conf подменял пробы.
# EN: 1.0.6: isolate from the machine settings file (a live /etc/dsh-storozha-mashiny/*.conf altered the probes).
export DSH_STOROZHA_MASHINY_CONF="$R/net-fajla-nastroek.conf"
mkdir -p $R/path
# RU: заглушка ps: шлюз 500 (если есть файл $R/shlyuz), движки — PID из $R/dvizhki · EN: ps stub: gateway 500, engines from $R/dvizhki
cat > $R/path/ps <<EOS
#!/bin/sh
case "\$*" in
  "-eo pid=,comm=,args=") echo "  100 bash            bash -c pgrep -f /srv/gw/gateway.mjs"
                          [ -e $R/shlyuz ] && echo "  500 node            /usr/bin/node /srv/gw/gateway.mjs"
                          echo "  600 node            /usr/bin/node /srv/gw/gateway.mjs.bak"
                          [ -e $R/shlyuz2 ] && echo "  510 node            /usr/bin/node /srv/gw/gateway.mjs" ;;
  "-o comm= -p "*) echo claude ;;
  "-o ppid= -p "*) awk -v p="\$4" '\$1==p{print \$2}' $R/ppid 2>/dev/null ;;
  "-o etime= -p "*) echo "   07:00" ;;
  *) exit 1 ;;
esac
EOS
printf '#!/bin/sh\n[ "$1" = -P ] && [ "$2" = 500 ] && cat %s\nexit 0\n' "$R/dvizhki" > $R/path/pgrep
printf '#!/bin/sh\nprintf "%%s\\n===\\n" "$1" >> %s\nexit 0\n' "$R/kanal.txt" > $R/path/agent-alert
for z in logger claudeclaw-alert systemctl journalctl; do printf '#!/bin/sh\necho "%s $*" >> %s\nexit 0\n' "$z" "$R/chuzhie.txt" > $R/path/$z; done
chmod 755 $R/path/*
export PATH="$R/path:$PATH" SD_SOSTOYANIE=$R/otmetka SD_MASHINA=stend
unset SD_SHLYUZ SD_PRIPISKA SD_SLUZHBA_PLATFORMY
ok=0; fail=0; sud() { if [ "$2" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
zov() { : > $R/kanal.txt; printf '%s\n' $1 > $R/dvizhki; "$I" > $R/out 2>&1; echo $?; }
touch $R/shlyuz
k=$(zov "701"); sud "П0 не настроено (нет SD_SHLYUZ) — «НЕ НАСТРОЕНО», код 2" "$([ $k = 2 ] && grep -q '^НЕ НАСТРОЕНО: нет SD_SHLYUZ' $R/out && echo 1)" "код $k · $(cat $R/out)"
export SD_SHLYUZ=/srv/gw/gateway.mjs
k=$(zov "701"); sud "П1 исправное (один движок под шлюзом 500, свой bash и чужой .bak не в счёт) — код 0, канал молчит" "$([ $k = 0 ] && grep -q 'движков под шлюзом 500: 1' $R/out && grep -q 'ok: доживших ходов нет' $R/out && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
k=$(zov "701 702"); sud "П2а два движка впервые — отметка заведена, молчит (короткое перекрытие законно)" "$([ $k = 0 ] && [ -s $R/otmetka ] && grep -q 'перекрытие замечено сейчас' $R/out && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
k=$(zov "701 702"); sud "П2б перекрытие короче порога — молчит" "$([ $k = 0 ] && grep -q 'молчу, это ещё законно' $R/out && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
echo $(( $(date +%s) - 400 )) > $R/otmetka
k=$(zov "701 702"); sud "П2 порча: два движка дольше порога — код 1, тревога называет число и PID" "$([ $k = 1 ] && grep -q 'stend: ходов агента больше одного' $R/kanal.txt && grep -q 'движков под шлюзом: 2 при норме 1' $R/kanal.txt && grep -q '• 702 07:00' $R/kanal.txt && echo 1)" "код $k · $(cat $R/kanal.txt)"
k=$(zov "701"); sud "П3 порча снята — отметка снята, код 0, канал молчит" "$([ $k = 0 ] && [ ! -e $R/otmetka ] && grep -q 'отметка снята' $R/out && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
rm -f $R/shlyuz
k=$(zov "701"); sud "П4 шлюза нет — слепота, код 2 (не «чисто»)" "$([ $k = 2 ] && grep -q 'СЛЕПОТА: шлюз не найден' $R/out && echo 1)" "код $k · $(cat $R/out)"
# RU: 2.0.10: с 2.0.9 сторож ЗАКОННО спрашивает systemctl о службе платформы (LoadState/MainPID/ExecMainStartTimestampMonotonic) —
# RU: они не «чужие»; любой другой вызов logger/claudeclaw-alert/systemctl/journalctl — по-прежнему провал.
# EN: 2.0.10: since 2.0.9 the watchdog LEGITIMATELY asks systemctl about the platform unit; any other stub call still fails.
grep -vE '^systemctl show -p (LoadState|MainPID|ExecMainStartTimestampMonotonic) --value ' $R/chuzhie.txt 2>/dev/null > $R/chuzhie-prochie.txt
sud "П5 чужие заглушки (logger/claudeclaw-alert/journalctl; systemctl — кроме вопросов о службе платформы) не звались" "$([ ! -s $R/chuzhie-prochie.txt ] && echo 1)" "$(cat $R/chuzhie-prochie.txt 2>/dev/null)"
# RU: 1.0.1: несколько шлюзов с одним скриптом. Свой systemctl: MainPID из файла $R/mainpid.
touch $R/shlyuz $R/shlyuz2; rm -f $R/otmetka
printf '#!/bin/sh\n[ "$1" = show ] && cat %s/mainpid\nexit 0\n' "$R" > $R/path/systemctl; chmod 755 $R/path/systemctl
k=$(zov "701"); sud "П6 1.0.1: два шлюза, юнит не задан — слепота «шлюзов … 2», код 2 (не первый попавшийся)" "$([ $k = 2 ] && grep -q 'СЛЕПОТА: шлюзов с /srv/gw/gateway.mjs — 2' $R/out && echo 1)" "код $k: $(head -2 $R/out)"
echo 510 > $R/mainpid
k=$(SD_SHLYUZ_SLUZHBA=gw@b.service zov "701"); sud "П7 1.0.1: юнит задан (MainPID 510) — считает под шлюзом 510, а не под первым 500" "$([ $k = 0 ] && grep -q 'движков под шлюзом 510' $R/out && echo 1)" "код $k: $(head -2 $R/out)"
echo 0 > $R/mainpid
echo 999 > $R/mainpid
k=$(SD_SHLYUZ_SLUZHBA=gw@b.service zov "701"); sud "П9 1.0.4: MainPID юнита (999) не среди найденных шлюзов (500/510) — слепота «не node с …», код 2" "$([ $k = 2 ] && grep -q 'не node с /srv/gw/gateway.mjs' $R/out && echo 1)" "код $k: $(head -2 $R/out)"
echo 0 > $R/mainpid
k=$(SD_SHLYUZ_SLUZHBA=gw@b.service zov "701"); sud "П8 1.0.1: у юнита нет главного процесса — слепота, код 2" "$([ $k = 2 ] && grep -q 'нет главного процесса' $R/out && echo 1)" "код $k: $(head -2 $R/out)"
rm -f $R/shlyuz2
# RU: 2.0.10 (B-N-1866, пробы Михалыча N1/N4): режим «по старту» — платформа загружена (MainPID 123), стартовала в 0 мкс,
# RU: поэтому «рождён раньше старта» не срабатывает и судит ТОЛЬКО цепочка родителей. Родители — из $R/ppid («pid ppid»).
# EN: 2.0.10 (B-N-1866, Mikhalych's probes N1/N4): "by start" mode — the platform is loaded (MainPID 123) and started at 0 µs,
# EN: so "born before start" cannot fire and ONLY the parent chain decides. Parents come from $R/ppid ("pid ppid").
printf '#!/bin/sh\ncase "$3" in LoadState) echo loaded;; MainPID) echo 123;; ExecMainStartTimestampMonotonic) echo 0;; esac\nexit 0\n' > $R/path/systemctl; chmod 755 $R/path/systemctl
export SD_SLUZHBA_PLATFORMY=platforma-stend.service; rm -f $R/otmetka
printf '703 650\n650 500\n' > $R/ppid
k=$(zov "703"); sud "N1 2.0.10: вложенный движок (шлюз 500 → оболочка 650 → claude 703), рождён после старта — законный, код 0, канал молчит" "$([ $k = 0 ] && grep -q 'законных 1, доживших 0' $R/out && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
printf '704 1\n' > $R/ppid; rm -f $R/otmetka
k=$(zov "704"); sud "N4а 2.0.10: сирота (родитель 1) впервые — ДОЖИЛ в списке, но отметка заведена и канал молчит (гонка подъёма ≠ тревога)" "$([ $k = 0 ] && grep -q 'ДОЖИЛ: цепочка родителей от 1 не доходит до шлюза 500' $R/out && [ -s $R/otmetka ] && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
echo $(( $(date +%s) - 400 )) > $R/otmetka
k=$(zov "704"); sud "N4 2.0.10: сирота держится дольше порога — код 1, тревога называет ДОЖИЛ и причину" "$([ $k = 1 ] && grep -q 'цепочка родителей от 1 не доходит до шлюза 500' $R/kanal.txt && echo 1)" "код $k · $(cat $R/out) · канал: $(cat $R/kanal.txt)"
printf '703 650\n650 500\n' > $R/ppid
k=$(zov "703"); sud "N5 2.0.10: сирота ушёл, остался вложенный законный — отметка снята, код 0" "$([ $k = 0 ] && [ ! -e $R/otmetka ] && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
unset SD_SLUZHBA_PLATFORMY
[ $((ok+fail)) = 16 ] || { echo "СЛЕПОТА: проверок $((ok+fail)) из 16"; exit 2; }
echo "ИТОГ: ok $ok · fail $fail"
[ $fail = 0 ]
