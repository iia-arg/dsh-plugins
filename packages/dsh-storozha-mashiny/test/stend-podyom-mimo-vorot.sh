#!/bin/bash
# RU: Стенд podyom-mimo-vorot-watch — три пробы: исправное (прибор: всё через ворота) молчит · порча (прибор
# RU: нашёл подъём мимо ворот) краснеет, называя службу и время · порча снята (подъём уже сказан) — снова зелёное.
# RU: Плюс: ворота не ответили — слепота с тревогой; канал отказал — не запоминает, повторит.
# RU: Ворота (PMV_PODYOM), прибор (PMV_PRIBOR), канал (PMV_ALERT) — заглушки по переменным модуля; journalctl,
# RU: logger и прочие — заглушки ПЕРВЫМИ в PATH; состояние и итог — во временном каталоге. Любая учётка.
# EN: Test stand for podyom-mimo-vorot-watch — three probes: healthy (probe: all via the gate) is quiet · fault
# EN: (probe found a start bypassing the gate) goes red naming the service and time · fault removed (already
# EN: reported) — green again. Plus: gate did not answer — blindness with an alert; channel failed — not
# EN: remembered, will repeat. Gate (PMV_PODYOM), probe (PMV_PRIBOR), channel (PMV_ALERT) are stubs via the
# EN: module's variables; journalctl, logger and others are stubs FIRST in PATH; state and result are temporary.
# RU: bash stend-podyom-mimo-vorot.sh [сторож] · EN: bash stend-podyom-mimo-vorot.sh [watchdog]
set -u
I=${1:-$(cd "$(dirname "$0")/.." && pwd)/bin/podyom-mimo-vorot-watch}
R=$(mktemp -d /tmp/stend-pmv.XXXXXX) || exit 2; trap 'rm -rf "$R"' EXIT
mkdir -p $R/path
KOGDA=$(date -u -d '-2 hours' +%Y-%m-%dT%H:%M:%S+00:00)
# RU: journalctl: одна законная запись PID1 о multi-user.target (иначе сторож честно скажет «метаданные не проверены»).
# EN: journalctl: one valid PID1 record of multi-user.target (otherwise the watchdog honestly reports "metadata not checked").
cat > $R/path/journalctl <<EOS
#!/bin/sh
echo '{"_PID":"1","MESSAGE_ID":"39f53479d3a045ac8e11786248231fbf","JOB_TYPE":"start","JOB_RESULT":"done","_BOOT_ID":"0123456789abcdef0123456789abcdef","UNIT":"multi-user.target","__MONOTONIC_TIMESTAMP":"48700000","__REALTIME_TIMESTAMP":"1700000000000000"}'
EOS
for z in logger agent-alert claudeclaw-alert systemctl; do printf '#!/bin/sh\necho "%s $*" >> %s\nexit 0\n' "$z" "$R/chuzhie.txt" > $R/path/$z; done
cat > $R/podyom <<EOS
#!/bin/sh
[ "\$1" = --oblast ] || exit 9
[ "\$(cat $R/vorota)" = da ] || exit 2
echo "sluzhba-a.service sluzhba-b.service"
EOS
cat > $R/pribor <<EOS
#!/bin/sh
if [ "\$1" = sluzhba-b.service ] && [ "\$(cat $R/rezhim)" = mimo ]; then
  echo "🔴 ПОДЪЁМ МИМО ВОРОТ: $KOGDA — записи в журнале ворот нет."; exit 1
fi
echo "через ворота"; exit 0
EOS
cat > $R/alert <<EOS
#!/bin/sh
printf '%s\n===\n' "\$1" >> $R/kanal.txt
exit \$(cat $R/alert-kod)
EOS
chmod 755 $R/path/* $R/podyom $R/pribor $R/alert
export PATH="$R/path:$PATH" PMV_PODYOM=$R/podyom PMV_PRIBOR=$R/pribor PMV_ALERT=$R/alert PMV_SOST=$R/sost/soobshcheno.txt PMV_ITOG=$R/sost/last.json PMV_MASHINA=stend
unset PMV_SLUZHBY
echo 0 > $R/alert-kod; echo da > $R/vorota
ok=0; fail=0; sud() { if [ "$2" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
zov() { : > $R/kanal.txt; echo "$1" > $R/rezhim; "$I" > $R/out 2>&1; echo $?; }
itog() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["code"], d["dostavleno"])' $R/sost/last.json; }
k=$(zov chisto); sud "П1 исправное — код 0, канал молчит, итог «0 nechego»" "$([ $k = 0 ] && [ ! -s $R/kanal.txt ] && [ "$(itog)" = '0 nechego' ] && grep -q 'служб sluzhba-a, sluzhba-b' $R/out && echo 1)" "код $k · $(cat $R/out)"
echo 1 > $R/alert-kod
k=$(zov mimo); sud "П2а порча, канал отказал — код 3, «НЕ доставлена», не запомнено, итог «3 net»" "$([ $k = 3 ] && grep -q 'тревога НЕ доставлена' $R/out && ! grep -q sluzhba-b $R/sost/soobshcheno.txt && [ "$(itog)" = '3 net' ] && echo 1)" "код $k · $(cat $R/out)"
echo 0 > $R/alert-kod
k=$(zov mimo); sud "П2 порча — код 3, тревога называет службу и время, запомнено, итог «3 da»" "$([ $k = 3 ] && grep -qF "sluzhba-b.service $KOGDA" $R/kanal.txt && grep -q 'stend: подъём МИМО ВОРОТ' $R/kanal.txt && grep -qxF "sluzhba-b.service|$KOGDA" $R/sost/soobshcheno.txt && [ "$(itog)" = '3 da' ] && echo 1)" "код $k · $(cat $R/kanal.txt)"
k=$(zov mimo); sud "П2б тот же подъём повторно — не кричит, код 0" "$([ $k = 0 ] && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
k=$(zov chisto); sud "П3 порча снята — код 0, канал молчит, итог «0 nechego»" "$([ $k = 0 ] && [ ! -s $R/kanal.txt ] && [ "$(itog)" = '0 nechego' ] && echo 1)" "код $k · $(cat $R/out)"
echo net > $R/vorota
k=$(zov chisto); sud "П4 ворота не ответили — слепота с тревогой, код 2, не откат на список" "$([ $k = 2 ] && grep -q 'ОСЛЕП — область не получена' $R/kanal.txt && echo 1)" "код $k · $(cat $R/out)"
k=$(zov chisto); sud "П4б слепота в тот же день повторно не кричит" "$([ $k = 2 ] && [ ! -s $R/kanal.txt ] && echo 1)" "код $k"
sud "П5 чужие заглушки (logger/agent-alert/claudeclaw-alert/systemctl) не звались" "$([ ! -s $R/chuzhie.txt ] && echo 1)" "$(cat $R/chuzhie.txt 2>/dev/null)"
echo "ИТОГ: ok $ok · fail $fail"
[ $fail = 0 ]
