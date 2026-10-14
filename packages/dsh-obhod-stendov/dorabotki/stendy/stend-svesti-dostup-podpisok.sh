#!/usr/bin/env bash
# Стенд svesti-dostup-podpisok + perehod-B-N-1621 (B-N-1621, Искра). ВСЁ на подставных в /var/tmp: каталог токенов,
# подписки Codex 3/4, дома шлюзов со ссылками auth.json, instance-*.env, поддельный systemctl (юниты из таблицы).
# Учётки НАСТОЯЩИЕ (spartak, coders, marc, varvara): чтение проверяется ЯДРОМ — runuser с группами юнита (включая 986,
# как у живого шлюза ДО перехода), а не разбором getfacl. Боевой /etc/claude-oauth не читается и не трогается.
# Учётка: ROOT (chown, runuser) — строка обхода «@root». Предмет по умолчанию — БОЙ; кандидатов подавать
# STEND_PREDMET (помощник) и STEND_PEREHOD (скрипт перехода). Коды: 0 все пробы зелёные · 1 есть красные · 2 слепота.
# r2 (ворота Вениамина 06:31Z): у spartak — ЖИВОЙ процесс (sleep под его учёткой, группы заданы setpriv; MainPID отдаёт
# поддельный systemctl): помощник обязан судить по живым группам (Ж1); переход — ДВА такта (takt1 без 986 → takt2).
# ЧЕГО НЕ ЛОВИТ: настоящие юниты и их EnvironmentFiles (systemctl подставной); боевые права (их сторожит
# `svesti-dostup-podpisok --proverit` на бою); переключатели целиком — их стенды отдельные (pk-sluchai, stend-pereklyuchatelya-podpiski).
set -u
P="${STEND_PREDMET:-/usr/local/sbin/svesti-dostup-podpisok}"
PH="${STEND_PEREHOD:-/usr/local/sbin/perehod-B-N-1621}"
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root (chown, runuser) — строка обхода «@root»"; exit 2; }
[ -r "$P" ] && [ -r "$PH" ] || { echo "СЛЕПОТА: нет предмета $P или $PH"; exit 2; }
for u in spartak coders marc varvara; do id "$u" >/dev/null 2>&1 || { echo "СЛЕПОТА: нет учётки $u"; exit 2; }; done
getent group claudeoauth >/dev/null || { echo "СЛЕПОТА: нет группы claudeoauth"; exit 2; }
RAB=$(mktemp -d /var/tmp/stend-sdp.XXXXXX) || { echo "СЛЕПОТА: mktemp в /var/tmp"; exit 2; }
PA=""; PB=""
# гасить ТОЛЬКО по сохранённым pid (урок 15.09: маска действия бьёт по чужому)
trap '[ -z "$PA" ] || kill "$PA" 2>/dev/null; [ -z "$PB" ] || kill "$PB" 2>/dev/null; rm -rf -- "${RAB:?}"' EXIT
chmod 711 "$RAB"
ok=0; bed=0
sud(){ if [ "$2" = 1 ]; then ok=$((ok+1)); echo "  ✅ $1"; else bed=$((bed+1)); echo "  🔴 $1 — ${3:-}"; fi; }
E="$RAB/etc"; D="$RAB/dom"; mkdir -p "$RAB/bin"

# ── юниты: имя|LoadState|UnitFileState|ActiveState|User|Group|SupplementaryGroups|EnvironmentFile|ExecStart
cat > "$RAB/units" <<'U'
claude-oauth-gateway@spartak.service|loaded|enabled|active|spartak|spartak|claudeoauth|instance-spartak.env|{ path=/usr/local/bin/node ; argv[]=/usr/local/bin/node /opt/claude-oauth/gateway.mjs ; }
claude-oauth-gateway@alfa.service|loaded|disabled|inactive|alfa|alfa|claudeoauth|instance-alfa.env|{ path=/usr/local/bin/node ; }
coder-gateway@alfa.service|loaded|enabled|active|coders|coders|claudeoauth|instance-alfa.env|{ path=/usr/local/bin/node ; }
coder-gateway-marc.service|loaded|enabled|active|marc|marc|claudeoauth|instance-marc.env|{ path=/usr/local/bin/node ; }
claude-oauth-gateway@varvara.service|loaded|enabled|active|varvara|varvara||instance-varvara.env|{ path=/opt/subscription-gateway-guest/systemd/guest-launch.sh ; }
U
cat > "$RAB/bin/systemctl" <<'PY'
#!/usr/bin/env python3
import os, sys
a = sys.argv[1:]
if a[:1] != ['show'] or len(a) < 2: sys.exit(1)
rows = {p[0]: p for p in (s.rstrip('\n').split('|') for s in open(os.environ['SDP_UNITS'])) if len(p) == 9}
r = rows.get(a[1])
if not r:
    print('LoadState=not-found\nUnitFileState=\nActiveState=inactive\nUser=\nEnvironmentFiles=\nExecStart='); sys.exit(0)
pf = os.path.join(os.path.dirname(os.environ['SDP_UNITS']), 'pid-' + r[0])
pid = open(pf).read().strip() if os.path.exists(pf) else '0'
print(f'LoadState={r[1]}\nUnitFileState={r[2]}\nActiveState={r[3]}\nUser={r[4]}\nGroup={r[5]}\nSupplementaryGroups={r[6]}\n'
      f'EnvironmentFiles=/etc/claude-oauth/{r[7]} (ignore_errors=no)\nExecStart={r[8]}\nMainPID={pid}')
PY
chmod +x "$RAB/bin/systemctl"
# обёртка помощника с подменами (её же зовёт скрипт перехода)
cat > "$RAB/bin/svesti" <<SH
#!/bin/bash
SDP_STEND=1 SDP_ENV_DIR="$E" SDP_KATALOG_TOKENOV="$E" SDP_KATALOG_CODEX="$E/codex-podpiska-{n}" \\
SDP_SYSTEMCTL="$RAB/bin/systemctl" SDP_ZAMOK="$RAB/zamok" SDP_UNITS="$RAB/units" exec python3 -B "$P" "\$@"
SH
chmod +x "$RAB/bin/svesti"
S(){ "$RAB/bin/svesti" "$@" > "$RAB/out" 2>&1; echo $?; }
PER(){ PEREHOD_STEND=1 PEREHOD_KATALOG="$E" PEREHOD_SVESTI="$RAB/bin/svesti" PEREHOD_STRAHOVKI="$RAB/strah" bash "$PH" "$@" > "$RAB/out" 2>&1; echo $?; }
snimok(){ getfacl -R -p "$E" 2>/dev/null | sha256sum | cut -c1-16; }
# чтение ядром: учётка + группы ЕЁ ЮНИТА (как у живого шлюза; 986 = claudeoauth)
chit(){ runuser -u "$1" -g "$1" -G claudeoauth -- test -r "$2"; }
pishet(){ runuser -u "$1" -g "$1" -G claudeoauth -- test -w "$2"; }
da(){ if "$@"; then echo 1; else echo 0; fi; }
net(){ if "$@"; then echo 0; else echo 1; fi; }
v(){ grep -qF -- "$1" "$RAB/out" && echo 1 || echo 0; }

# ── исходное «как сейчас на бою»: группа 986 читает всё, ACL по умолчанию u:coders на каталогах Codex
mkdir -p "$E" "$D/alfa" "$D/marc"
chown root:claudeoauth "$E"; chmod 750 "$E"; setfacl -m u:coders:--x "$E"
for n in 1 2; do echo "T$n" > "$E/token-podpiska-$n"; done; echo T2 > "$E/token"
chown root:claudeoauth "$E"/token*; chmod 640 "$E"/token*
for n in 3 4; do
  d="$E/codex-podpiska-$n"; mkdir -p "$d/polnyj"; chmod 700 "$d/polnyj"
  chown root:claudeoauth "$d"; chmod 750 "$d"; setfacl -m u:coders:--x "$d"; setfacl -d -m u:coders:r "$d"
  echo "{\"p\":$n}" > "$d/auth.json"; chown root:claudeoauth "$d/auth.json"; chmod 640 "$d/auth.json"
done
mkdir -p "$E/codex"; chown root:claudeoauth "$E/codex"; chmod 750 "$E/codex"
chmod 711 "$D" "$D/alfa" "$D/marc"
for a in alfa marc; do ln -s "$E/codex-podpiska-3/auth.json" "$D/$a/auth.json"; done
env_(){ printf '%s\n' "${@:2}" > "$E/instance-$1.env"; }
env_ spartak GATEWAY_POSTAVSHIK=anthropic "GATEWAY_TOKEN_FILE=$E/token-podpiska-1" GATEWAY_PORT=1
env_ varvara GATEWAY_POSTAVSHIK=anthropic "GATEWAY_TOKEN_FILE=$E/token-podpiska-1" GATEWAY_INSTRUMENTY_DVIZHKA=net
env_ alfa GATEWAY_POSTAVSHIK=openai "CODEX_HOME=$D/alfa"
env_ marc GATEWAY_POSTAVSHIK=openai "CODEX_HOME=$D/marc"
chown spartak:spartak "$E/instance-spartak.env"; chown varvara:varvara "$E/instance-varvara.env"
chown coders:coders "$E/instance-alfa.env"; chown marc:marc "$E/instance-marc.env"; chmod 600 "$E"/instance-*.env
T1="$E/token-podpiska-1"; T2="$E/token-podpiska-2"; C3="$E/codex-podpiska-3/auth.json"; C4="$E/codex-podpiska-4/auth.json"
# контроль зрячести ПРИБОРА чтения: ДО перехода группа читает всё — chit обязан это видеть
[ "$(da chit spartak "$T2")$(da chit marc "$C4")" = 11 ] || { echo "СЛЕПОТА: прибор чтения не видит групповое чтение ДО перехода"; exit 2; }
S0=$(snimok)
# живой процесс шлюза spartak: его учётка + группы spartak и 986 (как у живого шлюза ДО перехода)
G986=$(getent group claudeoauth | cut -d: -f3); GSP=$(id -g spartak)
setpriv --reuid=spartak --regid=spartak --groups="$GSP,$G986" sleep 900 & PA=$!
echo "$PA" > "$RAB/pid-claude-oauth-gateway@spartak.service"; sleep 0.3
grep -q "^Groups:.*$G986" "/proc/$PA/status" || { echo "СЛЕПОТА: живой процесс spartak не поднялся с 986"; exit 2; }

echo "Д: до перехода и отказы"
k=$(S --proverit); sud "Д0 до перехода --proverit → код 1, имена: нет u:spartak на token-1, лишний u:coders на p4, ACL по умолчанию, env spartak" \
  "$([ "$k" = 1 ] && [ "$(v 'нет доступа  u:spartak:r--')$(v 'лишний доступ  u:coders')$(v 'ACL по умолчанию на каталоге')$(v 'instance-spartak.env')" = 1111 ] && echo 1)" "код $k: $(head -c 400 "$RAB/out")"
sud "Д0 ядро в стороже: spartak (живой pid, с 986) читает ЧУЖОЕ token-podpiska-2" "$(grep -q "ЯДРО: claude-oauth-gateway@spartak(spartak) читает ЧУЖОЕ $T2 (живой pid $PA)" "$RAB/out" && echo 1)" "$(grep -m2 ЯДРО "$RAB/out")"
# Ж1: живые группы, а не группы юнита — подменяю живой процесс на такой же БЕЗ 986
setpriv --reuid=spartak --regid=spartak --groups="$GSP" sleep 900 & PB=$!
echo "$PB" > "$RAB/pid-claude-oauth-gateway@spartak.service"; sleep 0.3
k=$(S --chtenie); zh=$(grep 'gateway@spartak' "$RAB/out")
rm -f "$RAB/pid-claude-oauth-gateway@spartak.service"; k2=$(S --chtenie); ju=$(grep 'gateway@spartak' "$RAB/out")
kill "$PB"; PB=""; echo "$PA" > "$RAB/pid-claude-oauth-gateway@spartak.service"
sud "Ж1 живой процесс без 986 → своё 0 из 1 (живой pid); без процесса → группы юнита (с 986) → своё 1 из 1" \
  "$([ "$k" = 1 ] && [[ "$zh" == *"своё 0 из 1"*"живой pid"* ]] && [[ "$ju" == *"своё 1 из 1"*"группы юнита"* ]] && echo 1)" "код $k: $zh | код $k2: $ju"
k=$(SDP_STEND=yes python3 -B "$P" --svesti > "$RAB/out" 2>&1; echo $?)
sud "Д1 SDP_STEND=yes → ОТКАЗ код 2 «допустимо только 1»" "$([ "$k" = 2 ] && [ "$(v 'допустимо только 1')" = 1 ] && echo 1)" "код $k"
for zov in '' '--dry-run' '-n' '--svesti --codex 4' '--dobavit --codex x'; do
  k=$(S $zov); sud "Д2 ввод «$zov» → ОТКАЗ код 2, права не тронуты" "$([ "$k" = 2 ] && [ "$(snimok)" = "$S0" ] && echo 1)" "код $k"
done

echo "П: переход и чтение ядром"
getfacl -R -p "$E" > "$RAB/rannyaya.acl" 2>/dev/null
k=$(PER takt2 "$RAB/rannyaya.acl")
sud "П0 takt2 ДО takt1 → ОТКАЗ код 2 «проба такта 1 сейчас красная», права не тронуты" \
  "$([ "$k" = 2 ] && [ "$(v 'проба такта 1 сейчас красная')" = 1 ] && [ "$(snimok)" = "$S0" ] && echo 1)" "код $k: $(tail -c 300 "$RAB/out")"
k=$(PER vypolnit); sud "П0 старый зов «vypolnit» → ОТКАЗ код 2" "$([ "$k" = 2 ] && [ "$(snimok)" = "$S0" ] && echo 1)" "код $k"
k=$(PER takt1); F=$(sed -n 's/^страховка: \([^ ]*\) .*/\1/p' "$RAB/out")
r="$(da chit spartak "$T2")$(da chit marc "$C4")"
sud "П1 takt1 → код 0 «ТАКТ 1 СОШЁЛСЯ» (своё без 986 у всех, spartak — живой pid), страховка есть; группа ЕЩЁ читает чужое ($r)" \
  "$([ "$k" = 0 ] && [ "$(v 'ТАКТ 1 СОШЁЛСЯ')" = 1 ] && grep -q 'gateway@spartak(spartak): своё 1 из 1.*живой pid' "$RAB/out" && [ -s "$F" ] && [ "$r" = 11 ] && echo 1)" "код $k: $(tail -c 500 "$RAB/out")"
# ПОРЧА Вениамина (06:59Z, условие 2): после такта 1 у spartak пропала u:-запись на СВОЮ подписку (T1) при ЖИВОЙ 986 → takt2 ОТКАЗ 2
p0=$(getfacl -p "$T1" 2>/dev/null | grep -c '^user:spartak:'); setfacl -x u:spartak "$T1"; pf=$(getfacl -p "$T1" 2>/dev/null | grep -c '^user:spartak:')
echo "  ПОРЧА внесена: u:spartak на СВОЕЙ $T1 — записей до $p0, после $pf; группа 986 всё ещё читает: $(da chit spartak "$T1")"
S1=$(snimok); k=$(PER takt2 "$F")
sud "П1б порча «u:spartak на свою подписку не выдан при живой 986» → takt2 ОТКАЗ код 2 до закрытия, права не тронуты" \
  "$([ "$p0" = 1 ] && [ "$pf" = 0 ] && [ "$k" = 2 ] && [ "$(v 'проба такта 1 сейчас красная')" = 1 ] && [ "$(snimok)" = "$S1" ] && echo 1)" "код $k, записей $p0→$pf: $(tail -c 300 "$RAB/out")"
k=$(S --dobavit)
sud "П1б возврат: --dobavit вернул u:spartak на $T1 (код $k)" "$([ "$k" = 0 ] && [ "$(getfacl -p "$T1" 2>/dev/null | grep -c '^user:spartak:')" = 1 ] && echo 1)" "код $k"
k=$(PER takt2 "$F")
sud "П1 takt2 → код 0 «ПЕРЕШЛО» (сторож: ядро с живыми группами, своё 1/1, чужие 0)" "$([ "$k" = 0 ] && [ "$(v 'ПЕРЕШЛО')" = 1 ] && echo 1)" "код $k: $(tail -c 500 "$RAB/out")"
sud "П1а гость и двойник: в составе нет claude-oauth-gateway@alfa, varvara — гость" \
  "$([ "$(v 'гости по LoadCredential: claude-oauth-gateway@varvara')" = 1 ] && ! grep -q 'claude-oauth-gateway@alfa(' "$RAB/out" && echo 1)" "$(grep -m1 'шлюзов' "$RAB/out")"
r="$(da chit spartak "$T1")$(net chit spartak "$T2")$(net chit spartak "$E/token")$(net chit spartak "$C3")$(net chit spartak "$C4")"
sud "П2 spartak (с 986!) читает token-1 и НЕ читает token-2, token, p3, p4" "$([ "$r" = 11111 ] && echo 1)" "$r"
r="$(da chit coders "$C3")$(net chit coders "$C4")$(net chit coders "$T1")$(da chit marc "$C3")$(net chit marc "$C4")$(net chit marc "$T1")"
sud "П2 coders и marc читают p3 и НЕ читают p4 и token-1" "$([ "$r" = 111111 ] && echo 1)" "$r"
r="$(net chit varvara "$T1")$(net chit varvara "$T2")$(net pishet spartak "$E/instance-spartak.env")$(net pishet coders "$E/instance-alfa.env")"
sud "П2 гость без ACL ни на один токен; агенты НЕ пишут свой instance-*.env (§5)" "$([ "$r" = 1111 ] && echo 1)" "$r"
k=$(S --proverit); sud "П2 --proverit после перехода → код 0 СОШЛОСЬ" "$([ "$k" = 0 ] && [ "$(v 'СОШЛОСЬ')" = 1 ] && echo 1)" "код $k: $(head -c 400 "$RAB/out")"

echo "П3: переключение Claude 1→2 (цель без ACL → выдан → переключено → старая отозвана)"
r0=$(net chit spartak "$T2")
sed -i "s#^GATEWAY_TOKEN_FILE=.*#GATEWAY_TOKEN_FILE=$T2#" "$E/instance-spartak.env"
k=$(S --dobavit); r1="$(da chit spartak "$T2")$(da chit spartak "$T1")"
k2=$(S --svesti); r2="$(da chit spartak "$T2")$(net chit spartak "$T1")"
sud "П3 цель без ACL ($r0) → --dobavit код $k: читает 2 И ещё 1 ($r1) → --svesti код $k2: 2 да, 1 нет ($r2)" \
  "$([ "$r0$k$r1$k2$r2" = 1011011 ] && echo 1)" "$r0 $k $r1 $k2 $r2"

echo "П4: переключение Codex 3→4"
r0="$(net chit coders "$C4")$(net chit marc "$C4")"
k=$(S --dobavit --codex 4); r1="$(da chit coders "$C4")$(da chit coders "$C3")$(da chit marc "$C4")"
for a in alfa marc; do ln -sfn "$C4" "$D/$a/auth.json"; done
k2=$(S --svesti); r2="$(da chit coders "$C4")$(net chit coders "$C3")$(da chit marc "$C4")$(net chit marc "$C3")"
sud "П4 цель без ACL ($r0) → --dobavit --codex 4 код $k: читают 4 и 3 ($r1) → ссылки на 4 → --svesti код $k2: 4 да, 3 нет ($r2)" \
  "$([ "$r0$k$r1$k2$r2" = 11011101111 ] && echo 1)" "$r0 $k $r1 $k2 $r2"
k=$(S --proverit); sud "П4 --proverit после двух переключений → код 0" "$([ "$k" = 0 ] && echo 1)" "код $k: $(head -c 300 "$RAB/out")"

echo "П5–П7: порча → красное с именем → возврат → зелёное"
setfacl -m u:spartak:r "$T1"; echo "    порча П5 внесена: $(getfacl -c "$T1" 2>/dev/null | grep -c '^user:spartak:') запись u:spartak на token-1"
k=$(S --proverit); sud "П5 чужая подписка выдана → --proverit код 1 «лишний доступ  u:spartak … token-podpiska-1» и ЯДРО «читает ЧУЖОЕ»" \
  "$([ "$k" = 1 ] && grep -q "лишний доступ  u:spartak:r--  $T1" "$RAB/out" && grep -q "ЯДРО: claude-oauth-gateway@spartak(spartak) читает ЧУЖОЕ $T1" "$RAB/out" && echo 1)" "код $k: $(head -c 300 "$RAB/out")"
S --svesti >/dev/null; k=$(S --proverit); sud "П5 возврат --svesti → --proverit код 0, spartak не читает token-1" "$([ "$k" = 0 ] && [ "$(net chit spartak "$T1")" = 1 ] && echo 1)" "код $k"
chmod 600 "$T2"; echo "    порча П6 внесена: $(getfacl -c "$T2" 2>/dev/null | grep -c 'effective:---') записей с #effective:---"
k=$(S --proverit); r=$(net chit spartak "$T2")
sud "П6 chmod 600 погасил маску → --proverit код 1 «нет доступа  u:spartak … (сейчас ---)», ядро: не читает" \
  "$([ "$k" = 1 ] && [ "$(v 'нет доступа  u:spartak:r--')$(v '(сейчас ---)')$(v 'своё читает 0 из 1')" = 111 ] && [ "$r" = 1 ] && echo 1)" "код $k ядро $r: $(head -c 300 "$RAB/out")"
S --svesti >/dev/null; k=$(S --proverit); sud "П6 возврат --svesti → код 0, spartak снова читает token-2" "$([ "$k" = 0 ] && [ "$(da chit spartak "$T2")" = 1 ] && echo 1)" "код $k"
chown spartak:spartak "$E/instance-spartak.env"; echo "    порча П7 внесена: владелец $(stat -c %U "$E/instance-spartak.env")"
k=$(S --proverit); sud "П7 env отдан агенту → --proverit код 1 с именем instance-spartak.env" "$([ "$k" = 1 ] && [ "$(v 'instance-spartak.env')" = 1 ] && echo 1)" "код $k"
chown root:root "$E/instance-spartak.env"; k=$(S --proverit); sud "П7 возврат → код 0" "$([ "$k" = 0 ] && echo 1)" "код $k"

echo "П8: неизвестное — отказ ДО записей"
cp -p "$E/instance-alfa.env" "$RAB/alfa.bak"; s=$(snimok)
sed -i 's/^GATEWAY_POSTAVSHIK=.*/GATEWAY_POSTAVSHIK=deepseek/' "$E/instance-alfa.env"
k=$(S --svesti); sud "П8 неизвестный поставщик → код 2, права не тронуты" "$([ "$k" = 2 ] && [ "$(snimok)" = "$s" ] && [ "$(v 'неизвестен')" = 1 ] && echo 1)" "код $k"
cp -p "$RAB/alfa.bak" "$E/instance-alfa.env"
sed -i "s#^GATEWAY_TOKEN_FILE=.*#GATEWAY_TOKEN_FILE=/etc/claude-oauth/token-podpiska-2#" "$E/instance-spartak.env"
k=$(S --svesti); sud "П8 токен вне каталога (боевой путь из стенда) → код 2, права не тронуты" "$([ "$k" = 2 ] && [ "$(snimok)" = "$s" ] && echo 1)" "код $k"
sed -i "s#^GATEWAY_TOKEN_FILE=.*#GATEWAY_TOKEN_FILE=$T2#" "$E/instance-spartak.env"
ln -sfn "$RAB/chuzhoj.json" "$D/marc/auth.json"; echo '{}' > "$RAB/chuzhoj.json"
k=$(S --svesti); sud "П8 ссылка не на зарегистрированную подписку → код 2, права не тронуты" "$([ "$k" = 2 ] && [ "$(snimok)" = "$s" ] && echo 1)" "код $k"
ln -sfn "$C4" "$D/marc/auth.json"
k=$(SDP_STEND=1 SDP_ENV_DIR="$RAB/pusto" SDP_KATALOG_TOKENOV="$E" SDP_KATALOG_CODEX="$E/codex-podpiska-{n}" SDP_SYSTEMCTL="$RAB/bin/systemctl" \
  SDP_ZAMOK="$RAB/zamok" SDP_UNITS="$RAB/units" python3 -B "$P" --svesti > "$RAB/out" 2>&1; echo $?)
sud "П9 нет каталога env → СЛЕПОТА код 2" "$([ "$k" = 2 ] && [ "$(v 'СЛЕПОТА')" = 1 ] && echo 1)" "код $k"

echo "П10: откат перехода"
k=$(PER otkat "$F"); sud "П10 perehod otkat → код 0, права и владельцы = снимку ДО перехода" "$([ "$k" = 0 ] && [ "$(snimok)" = "$S0" ] && echo 1)" "код $k: $(tail -c 300 "$RAB/out")"
r="$(da chit spartak "$T2")$(da chit marc "$C3")"; sud "П10 после отката группа снова читает всё (как до перехода)" "$([ "$r" = 11 ] && echo 1)" "$r"
k=$(PER otkat "$RAB/units"); sud "П10 otkat не-страховкой → ОТКАЗ код 2" "$([ "$k" = 2 ] && echo 1)" "код $k"

echo "ИТОГ: зелёных $ok, красных $bed"
[ "$bed" = 0 ] && exit 0 || exit 1
