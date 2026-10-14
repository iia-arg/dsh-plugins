#!/bin/bash
# RU: Стенд inet6-poyavlenie-watch — три пробы: исправное молчит · порча (появился глобальный IPv6) краснеет,
# RU: называя предмет · порча снята — снова зелёное (и одна строка «исчез»). Плюс слепота ip.
# RU: `ip`, `logger`, `agent-alert` (и claudeclaw-alert/systemctl/journalctl) — заглушки ПЕРВЫМИ в PATH; каталог
# RU: состояния — во временном каталоге (INET6_STATE_DIR). Сеть машины и боевой журнал не трогаются. Любая учётка.
# EN: Test stand for inet6-poyavlenie-watch — three probes: healthy is quiet · fault (a global IPv6 appeared) goes red
# EN: naming the subject · fault removed — green again (and one "disappeared" line). Plus ip blindness.
# EN: `ip`, `logger`, `agent-alert` (and claudeclaw-alert/systemctl/journalctl) are stubs FIRST in PATH; the state
# EN: directory is temporary (INET6_STATE_DIR). The machine's network and the real journal are untouched. Any account.
# RU: bash stend-inet6-poyavlenie.sh [сторож] · EN: bash stend-inet6-poyavlenie.sh [watchdog]
set -u
I=${1:-$(cd "$(dirname "$0")/.." && pwd)/bin/inet6-poyavlenie-watch}
R=$(mktemp -d /tmp/stend-inet6.XXXXXX) || exit 2; trap 'rm -rf "$R"' EXIT
mkdir -p $R/path $R/sost
# RU: заглушка ip: режим из файла $R/rezhim (net | est | otkaz) · EN: ip stub: mode from $R/rezhim (net | est | otkaz)
cat > $R/path/ip <<EOS
#!/bin/sh
r=\$(cat $R/rezhim)
[ "\$r" = otkaz ] && { echo "RTNETLINK answers: Operation not permitted" >&2; exit 1; }
[ "\$r" = est ] || exit 0
case "\$*" in
  *addr*) printf '2: eth0: <BROADCAST,MULTICAST,UP>\n    inet6 2001:db8::1/64 scope global\n' ;;
  *route*) printf 'default via fe80::1 dev eth0 proto ra\n' ;;
esac
EOS
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> %s\n' "$R/zhurnal.txt" > $R/path/logger
printf '#!/bin/sh\n[ -e %s ] && exit 1\nprintf "%%s\\n===\\n" "$1" >> %s\nexit 0\n' "$R/otkaz-kanala" "$R/kanal.txt" > $R/path/agent-alert
for z in claudeclaw-alert systemctl journalctl; do printf '#!/bin/sh\necho "%s $*" >> %s\nexit 0\n' "$z" "$R/chuzhie.txt" > $R/path/$z; done
chmod 755 $R/path/*
export PATH="$R/path:$PATH" INET6_STATE_DIR=$R/sost
ok=0; fail=0; sud() { if [ "$2" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
zov() { : > $R/kanal.txt; : > $R/zhurnal.txt; echo "$1" > $R/rezhim; "$I" > $R/out 2>&1; echo $?; }
k=$(zov net); sud "П1 исправное (глобального IPv6 нет) — молчит: код 0, канал пуст, состояния нет, в журнал «чисто»" \
  "$([ $k = 0 ] && [ ! -s $R/kanal.txt ] && [ ! -e $R/sost/est-inet6 ] && grep -q '^-t inet6-poyavlenie-watch чисто' $R/zhurnal.txt && echo 1)" "код $k · $(cat $R/out $R/kanal.txt)"
k=$(zov est); sud "П2 порча (появился 2001:db8::1 и маршрут v6) — тревога называет предмет, состояние заведено" \
  "$([ $k = 0 ] && grep -q 'появился глобальный IPv6' $R/kanal.txt && grep -q 'Глобальных inet6: 1 · маршрутов v6 по умолчанию: 1' $R/kanal.txt && [ -s $R/sost/est-inet6 ] && echo 1)" "код $k · $(cat $R/kanal.txt)"
k=$(zov est); sud "П2б порча держится — повтор молчит (анти-спам)" "$([ $k = 0 ] && [ ! -s $R/kanal.txt ] && echo 1)" "$(cat $R/kanal.txt)"
k=$(zov net); sud "П3 порча снята — одна строка «исчез», состояние снято, журнал «чисто»" \
  "$([ $k = 0 ] && grep -q 'глобальный IPv6 исчез' $R/kanal.txt && [ ! -e $R/sost/est-inet6 ] && grep -q 'чисто' $R/zhurnal.txt && echo 1)" "код $k · $(cat $R/kanal.txt)"
k=$(zov net); sud "П3б снова зелёное — канал молчит" "$([ $k = 0 ] && [ ! -s $R/kanal.txt ] && echo 1)" "$(cat $R/kanal.txt)"
k=$(zov otkaz); sud "П4 ip отказал — слепота: код 2, «СЛЕПОТА» в stderr и в журнал, тревоги нет" \
  "$([ $k = 2 ] && grep -q 'СЛЕПОТА: не добыто глобальные IPv6-адреса' $R/out && grep -q 'СЛЕПОТА' $R/zhurnal.txt && [ ! -s $R/kanal.txt ] && echo 1)" "код $k · $(cat $R/out)"
sud "П5 чужие заглушки (claudeclaw-alert/systemctl/journalctl) не звались" "$([ ! -s $R/chuzhie.txt ] && echo 1)" "$(cat $R/chuzhie.txt 2>/dev/null)"
# RU: 1.0.1: недоставка не пишет состояние — тревога повторяется.
touch $R/otkaz-kanala; rm -f $R/sost/est-inet6
k=$(zov est); sud "П6 1.0.1: канал отказал при появлении — код 1, состояние НЕ заведено, «НЕ доставлена»" "$([ $k = 1 ] && [ ! -e $R/sost/est-inet6 ] && grep -q 'НЕ доставлена' $R/out && echo 1)" "код $k · $(cat $R/out)"
rm -f $R/otkaz-kanala
k=$(zov est); sud "П6б 1.0.1: канал вернулся — тревога ПОВТОРЕНА, состояние заведено, код 0" "$([ $k = 0 ] && grep -q 'появился глобальный IPv6' $R/kanal.txt && [ -s $R/sost/est-inet6 ] && echo 1)" "код $k · $(cat $R/out)"
touch $R/otkaz-kanala
k=$(zov net); sud "П7 1.0.1: канал отказал при исчезновении — код 1, состояние СОХРАНЕНО" "$([ $k = 1 ] && [ -e $R/sost/est-inet6 ] && echo 1)" "код $k · $(cat $R/out)"
rm -f $R/otkaz-kanala
k=$(zov net); sud "П7б 1.0.1: канал вернулся — «исчез» доставлено, состояние снято" "$([ $k = 0 ] && grep -q 'глобальный IPv6 исчез' $R/kanal.txt && [ ! -e $R/sost/est-inet6 ] && echo 1)" "код $k · $(cat $R/out)"
[ $((ok+fail)) = 11 ] || { echo "СЛЕПОТА: проверок $((ok+fail)) из 11"; exit 2; }
echo "ИТОГ: ok $ok · fail $fail"
[ $fail = 0 ]
