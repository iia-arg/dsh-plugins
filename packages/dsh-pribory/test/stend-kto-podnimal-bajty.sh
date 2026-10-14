#!/usr/bin/env bash
# СТЕНД: kto-podnimal на записи sudo НЕ в UTF-8 (обрезанная буква). journald отдаёт такую MESSAGE
# в -o json СПИСКОМ БАЙТОВ, а в обычном тексте без -a — «[NB blob data]» (замер 26.09 на живой записи 08:18:51Z).
# 🔴 Всё на ПОДСТАВНОМ journalctl первым в PATH: боевые журналы не трогаются. Подстава повторяет СНЯТОЕ поведение
# (json — список чисел; текст без -a — blob; с -a — сырые байты), а не придуманное.
# ЧЕГО НЕ ЛОВИТ: иные формы порчи журнала (обрыв json, чужая кодировка целиком); проверку журнала ворот — у
# stend-kontrakt-kodov.sh.
# EN: STAND: kto-podnimal on a sudo record NOT in UTF-8 (a cut letter). journald returns such a MESSAGE in -o
#     json AS A LIST OF BYTES, and in plain text without -a as "[NB blob data]" (measured 26.09 on the live
#     record 08:18:51Z).
#     🔴 Everything on a STAND-IN journalctl first on PATH: production logs are not touched. The stand-in repeats
#     the OBSERVED behaviour (json — a list of numbers; text without -a — blob; with -a — raw bytes), not an
#     invented one.
#     WHAT IT DOES NOT CATCH: other forms of log corruption (broken json, an entirely different encoding);
#     checking the gate log is stend-kontrakt-kodov.sh's job.
set -u
K=${STEND_PRIBOR:-$(dirname "$0")/../bin/kto-podnimal}
RAB=$(mktemp -d); trap 'rm -rf "$RAB"' EXIT
# Прибору — своя настройка стенда: карта «откуда» для юнита шлюза подставного агента. STEND_KONF заменяет её целиком.
# EN: The tool gets the stand's own settings: the "from where" map for the stand-in agent's gateway unit.
#     STEND_KONF replaces it entirely.
printf 'KTO_OTKUDA=claude-oauth-gateway@agenta.service=изнутри хода агента agenta (юнит шлюза)\n' > "$RAB/k.conf"
export DSH_PRIBORY_CONF="${STEND_KONF:-$RAB/k.conf}"
trap 'exit 143' TERM; trap 'exit 130' INT
mkdir -p "$RAB/bin"
cat > "$RAB/bin/journalctl" <<'SHIM'
#!/usr/bin/env python3
import sys, json, os
a = sys.argv[1:]; rezhim = os.environ.get('STEND_REZHIM', 'bajty'); ruka = os.environb.get(b'STEND_RUKA', b'agenta')
cmd = b'   ' + ruka + b' : PWD=/var/lib/dsh-pribory ; USER=root ; COMMAND=/usr/bin/systemctl restart proba.service'
sosed = b'   ' + ruka + b' : PWD=/var/lib/dsh-pribory ; USER=root ; COMMAND=/usr/bin/grep -c \xd1\x80\xd0'
hvost = b' \xd1' if rezhim == 'bajty' else b''
out = sys.stdout.buffer
def msg(b): return list(b) if rezhim == 'bajty' else b.decode('utf-8')
if '-n' in a:
    out.write(b'proba\n')
elif '-u' in a:
    out.write(b'2026-09-26T10:00:05+0000 host systemd[1]: Started proba.service - Proba.\n')
elif '_COMM=sudo' in a and 'json' in a:
    if any(x.startswith('--output-fields') for x in a):
        out.write((json.dumps({'__REALTIME_TIMESTAMP': str((1790416800+4)*10**6), '_SYSTEMD_UNIT': 'claude-oauth-gateway@agenta.service', 'MESSAGE': msg(cmd + hvost)}) + '\n').encode())
    else:
        for m, t in ((cmd + hvost, 4), (sosed, 3)):
            out.write((json.dumps({'_AUDIT_SESSION': '777', '__REALTIME_TIMESTAMP': str((1790416800 + t) * 10**6),
                                   'MESSAGE': msg(m if rezhim == 'bajty' else m.replace(b'\xd1\x80\xd0', b'rab'))}) + '\n').encode())
else:
    if rezhim == 'bajty' and '-a' not in a:
        out.write(b'sep 26 10:00:04 host sudo[4242]: [%dB blob data]\n' % len(cmd + hvost))
    else:
        out.write(b'2026-09-26T10:00:04+0000 host sudo[4242]: ' + cmd + hvost + b'\n')
SHIM
chmod +x "$RAB/bin/journalctl"
printf '2026-09-26 10:00:00 UTC | ДО   | proba.service |\n' > "$RAB/vorota.log"
ok=0; bad=0
gon() { STEND_REZHIM=$1 ZHURNAL_VOROT="$RAB/vorota.log" PATH="$RAB/bin:$PATH" timeout 60 bash "$K" proba.service 2026-09-26 > "$RAB/out.$1" 2>&1; echo $? > "$RAB/kod.$1"; }
sud() { if [ "$2" = 0 ]; then ok=$((ok+1)); echo "  ✅ $1"; else bad=$((bad+1)); echo "  🔴 $1${3:+ — $3}"; fi; }
est() { grep -a -q -F "$2" "$RAB/out.$1"; }
gon bajty; gon stroka; STEND_RUKA=agent-2_x gon ruka
# зрячесть подставы: без -a она обязана отдавать blob (иначе проба 1 бессильна по построению)
# EN: the stand-in is sighted: without -a it must return blob (otherwise probe 1 is powerless by construction)
PATH="$RAB/bin:$PATH" STEND_REZHIM=bajty journalctl --since x --until y --no-pager | grep -q 'blob data'; sud "подстава зрячая: текст без -a — blob" $?
est bajty 'рука: agenta';                 sud "1 байты: рука названа (текст с -a)" $? "$(grep -a -m1 -E 'рука' "$RAB/out.bajty")"
est bajty 'изнутри хода агента agenta';          sud "2 байты: откуда — юнит шлюза агента (json, MESSAGE списком)" $? "$(grep -a -m1 'откуда' "$RAB/out.bajty")"
est bajty 'что делала ЭТА ЖЕ рука';      sud "3 байты: соседи по заходу найдены (json, сессия и соседи)" $?
! grep -a -q 'Traceback' "$RAB/out.bajty" && [ "$(cat "$RAB/kod.bajty")" -le 1 ]; sud "4 байты: прибор не падает (Traceback 0, код ≤1)" $? "код $(cat "$RAB/kod.bajty")"
est stroka 'рука: agenta' && est stroka 'изнутри хода агента agenta'; sud "5 контроль: строка UTF-8 — рука и откуда названы" $?
# учётка с цифрой, дефисом и подчёркиванием называется сама, а не строкой журнала целиком
# EN: an account with a digit, hyphen and underscore is named itself, not as the whole journal line
grep -a -q -E 'рука: agent-2_x( |$)' "$RAB/out.ruka"; sud "6 рука: учётка agent-2_x названа именем" $? "$(grep -a -m1 'рука' "$RAB/out.ruka" | cut -c1-120)"
echo "итог: $ok из $((ok+bad))"
[ "$bad" = 0 ]
