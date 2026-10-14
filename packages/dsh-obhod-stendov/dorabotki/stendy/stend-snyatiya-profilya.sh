#!/bin/bash
# Стенд B-N-1564 (Михалыч): smontirovat-fajly --snyat профиля .dsh/profiles/<имя>/cordis.patch.yml — живому отказ с причиной,
# мёртвому снятие со страховкой. Запуск от root: bash stend-snyatiya-profilya.sh <инструмент>
# Подстава mktemp -d: дом $R/h/.dsh, заглушка systemctl (SMF_SYSTEMCTL), подставной /proc (SMF_PROC), каталог юнитов
# (SMF_UNIT_DIRS), учёт и ящик — свои. ⚠️ Пишет в НАСТОЯЩИЙ журнал инструмента (пункты PROBA-B1564-<pid>-*), страховки — в
# НАСТОЯЩИЙ /var/backups/montazh/PROBA-B1564-<pid>-*; стенд убирает свои пункты и подставу в конце.
# Ждём: P1 профиль в ExecStart загруженного юнита (bin.js <имя>, тот же DSH_HOME) — 2 «грузит юнит», файл цел · P2 файл юнита
#   на диске упоминает .dsh и имя — 2 «файл юнита» · P3 процесс bin.js --profile <имя> с тем же DSH_HOME — 2 «грузит процесс» ·
#   P4 рядом cordis.yml — 2 · P5 домашний .dsh/cordis.patch.yml — 2 «домашний профиль» · P6 процесс с тем же именем профиля,
#   но ЧУЖИМ DSH_HOME — не мешает, снят (0) · P7 мёртвый — 0: прежнего нет, .SNYATO-<дата> с той же суммой, страховка с членом,
#   в выводе «профиль мёртв» с основаниями · P8 systemctl не ответил — 2 «не получен», файл цел · P9 строки ПОДМЕНА SMF_PROC/SMF_UNIT_DIRS ·
#   r2: P10 юнит через node_modules/.bin/dsh — 2 «грузит юнит: petr.service» · P11 процесс node …/.bin/dsh --profile — 2 «процесс 4545».
set -u
I=$1; R=$(mktemp -d /var/tmp/b1564.XXXXXX) || exit 2; chmod 755 $R
export MO_STATE_DIR=$R/okna; mkdir -m 755 -- "$MO_STATE_DIR" || { echo "СЛЕПОТА: нет частного каталога окон"; exit 2; }   # B-N-2038: окна монтажа — частные, не боевой /var/lib/montazh-okna
trap 'rm -rf -- "${R:?}"' EXIT; trap 'exit 143' TERM; trap 'exit 130' INT   # B-N-1768 (короткая до P, условие Вениамина 15:50Z; полная — ниже): без этого TERM, пришедший не во время ожидания дочернего, убивает bash МИМО ловушки EXIT (замер: утечки 1/20 → 0/30)
H=$R/h/.dsh; mkdir -p $H/profiles/{zhivoj,fajl,proc,cordis,chuzhoj,myortvyj,binDsh,procDsh} $R/proc/4545 $R/units $R/proc/4242 $R/proc/4343 $R/proc/4444 $R/dorabotki $R/in $R/bin
for pr in zhivoj fajl proc cordis chuzhoj myortvyj binDsh procDsh; do printf 'id: %s\n' $pr > $H/profiles/$pr/cordis.patch.yml; chmod 644 $H/profiles/$pr/cordis.patch.yml; done
printf 'x\n' > $H/cordis.patch.yml; chmod 644 $H/cordis.patch.yml
printf 'name: cordis\n' > $H/profiles/cordis/cordis.yml
# заглушка systemctl: один загруженный юнит грузит профиль zhivoj
cat > $R/bin/systemctl <<SC
#!/bin/bash
[ -e $R/systemctl-padaet ] && exit 1
case "\$1" in
  list-units) echo "agent.service loaded active running A"; echo "drugoj.service loaded active running B"; echo "petr.service loaded active running C" ;;
  show) printf 'Id=agent.service\nEnvironment=DSH_HOME=$H DSH_TELEMETRY_DISABLED=1\nExecStart={ path=/usr/bin/node ; argv[]=/usr/bin/node /x/lib/bin.js zhivoj --port 1 ; ignore_errors=no }\n\nId=drugoj.service\nEnvironment=LANG=C\nExecStart={ path=/bin/true ; argv[]=/bin/true ; ignore_errors=no }\n\nId=petr.service\nEnvironment=DSH_HOME=$H\nExecStart={ path=/x/app/node_modules/.bin/dsh ; argv[]=/x/app/node_modules/.bin/dsh binDsh --port 2 ; ignore_errors=no }\n' ;;
esac
SC
chmod 755 $R/bin/systemctl
# файл юнита на диске (не загружен): DSH_HOME и профиль fajl
printf '[Service]\nEnvironment=DSH_HOME=%s\nExecStart=/usr/bin/node /x/lib/bin.js fajl\n' $H > $R/units/fajl-agent.service
# процессы: 4242 — bin.js --profile proc с тем же DSH_HOME; 4343 — chuzhoj, но чужой DSH_HOME; 4444 — не dsh
printf 'node\0/x/lib/bin.js\0--profile\0proc\0' > $R/proc/4242/cmdline; printf 'DSH_HOME=%s\0HOME=/x\0' $H > $R/proc/4242/environ
printf 'node\0/x/lib/bin.js\0chuzhoj\0' > $R/proc/4343/cmdline; printf 'DSH_HOME=/drugoj/.dsh\0' > $R/proc/4343/environ
printf 'bash\0-c\0sleep\0' > $R/proc/4444/cmdline; printf 'X=1\0' > $R/proc/4444/environ
printf 'node\0/x/app/node_modules/.bin/dsh\0--profile\0procDsh\0' > $R/proc/4545/cmdline; printf 'DSH_HOME=%s\0' $H > $R/proc/4545/environ
printf '%s|%s\n' "$R/net-ish" "$R/net-boj" > $R/pary.txt; : > $R/nashi.sh; : > $R/manifest.txt; : > $R/plugins.yaml   # B-N-2036: пустой учёт пар — отказ smontirovat-fajly (B-N-971); пара вне предмета
export SMF_SYSTEMCTL=$R/bin/systemctl SMF_PROC=$R/proc SMF_UNIT_DIRS=$R/units SMF_PARY=$R/pary.txt SMF_DORABOTKI=$R/dorabotki \
       SMF_ISKRA_IN=$R/in SMF_NASHI=$R/nashi.sh SMF_MANIFEST=$R/manifest.txt SMF_REESTR_PL=$R/plugins.yaml
D=$(date -u +%Y%m%d); P=PROBA-B1564-$$
trap 'rm -rf "$R" /var/backups/montazh/$P-* /var/backups/montazh-s-klyuchom/$P-*' EXIT
ok=0; fail=0; sud() { if [ "${2:-}" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
s() { sha256sum "$1" 2>/dev/null | cut -c1-64 || echo net; }
otk() {  # otk <№> <профиль-относительно-H> <фраза> <подпись>
  local f=$H/$2 s0 o k; s0=$(s $f)
  o=$("$I" --punkt $P-$1 --v-boj --snyat $R/h .dsh/$2 2>&1); k=$?
  [ $k = 2 ] && grep -qF "$3" <<< "$o" && [ "$(s $f)" = "$s0" ] && sud "$4 — отказ «$3», файл цел" 1 || sud "$4" 0 "код $k; $(echo "$o" | grep -E 'ОТКАЗ|мёртв' | tail -1)"
}
otk 1 profiles/zhivoj/cordis.patch.yml 'профиль грузит юнит: agent.service' "P1 профиль в ExecStart загруженного юнита"
otk 2 profiles/fajl/cordis.patch.yml 'файл юнита упоминает' "P2 профиль в файле юнита на диске"
otk 3 profiles/proc/cordis.patch.yml 'профиль грузит процесс 4242' "P3 процесс bin.js --profile с тем же DSH_HOME"
otk 4 profiles/cordis/cordis.patch.yml 'cordis.yml' "P4 рядом cordis.yml"
otk 5 cordis.patch.yml 'домашний профиль' "P5 домашний профиль"
otk 10 profiles/binDsh/cordis.patch.yml 'профиль грузит юнит: petr.service' "P10 юнит через лаунчер node_modules/.bin/dsh (r2)"
otk 11 profiles/procDsh/cordis.patch.yml 'профиль грузит процесс 4545' "P11 процесс через .bin/dsh --profile (r2)"
snyat() {  # snyat <№> <профиль> <подпись>
  local f=$H/profiles/$2/cordis.patch.yml s0 o k st; s0=$(s $f)
  o=$("$I" --punkt $P-$1 --v-boj --snyat $R/h .dsh/profiles/$2/cordis.patch.yml 2>&1); k=$?
  st=$(ls /var/backups/montazh/$P-$1/ 2>/dev/null | wc -l)
  [ $k = 0 ] && [ ! -e $f ] && [ "$(s $f.SNYATO-$D)" = "$s0" ] && [ "$st" = 1 ] && tar -tf /var/backups/montazh/$P-$1/*.tar | grep -qx "${f#/}" \
    && grep -qF 'профиль мёртв:' <<< "$o" && grep -qF 'юнитов с ним 0 из 3 загруженных' <<< "$o" \
    && sud "$3 — снят: .SNYATO-$D с той же суммой, страховка с членом, основания в выводе" 1 || sud "$3" 0 "код $k стр $st; $(echo "$o" | grep -E 'ОТКАЗ|мёртв' | tail -1)"
}
snyat 6 chuzhoj "P6 тот же профиль у процесса с ЧУЖИМ DSH_HOME — не мешает"
snyat 7 myortvyj "P7 мёртвый профиль"
touch $R/systemctl-padaet; printf 'id: m2\n' > $H/profiles/myortvyj/cordis.patch.yml
otk 8 profiles/myortvyj/cordis.patch.yml 'список служб не получен' "P8 systemctl не ответил — слепота"
rm -f $R/systemctl-padaet
o=$("$I" --punkt $P-9 --progon --snyat $R/h .dsh/profiles/myortvyj/cordis.patch.yml 2>&1)
grep -qF 'ПОДМЕНА: SMF_PROC=' <<< "$o" && grep -qF 'ПОДМЕНА: SMF_UNIT_DIRS=' <<< "$o" && sud "P9 строки ПОДМЕНА SMF_PROC/SMF_UNIT_DIRS" 1 || sud "P9" 0 "нет строк ПОДМЕНА"
rm -rf /var/backups/montazh/$P-* /var/backups/montazh-s-klyuchom/$P-* $R
echo "ИТОГ: ok=$ok fail=$fail"; [ "$fail" = 0 ] && [ "$ok" = 11 ]
