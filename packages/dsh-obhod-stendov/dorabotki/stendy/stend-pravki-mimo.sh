#!/bin/bash
# СТЕНД B-N-898: pravka кладёт копию в montazh/<пункт>/ и пишет sha в журнал; sadik-watch (ветка 2г) видит правку мимо pravka.
# Всё подставное: реестр — временный git-каталог, корень копий — временный, logger/journalctl подменены (строки журнала — в файл),
# канал тревог — заглушка. Боевой /etc/agent-registry, /var/backups/montazh и журнал не трогаются.
# Ждём: A1 установка без --punkt — отказ, ничего не записано; A2 с --punkt — копия в montazh/<пункт>/, рядом с реестром нет,
# строка журнала несёт sha легшего; A3 кривой пункт — отказ; A4 ротация по montazh: дубль git старше 30 — удалён, уникальный —
# цел, копия рядом с реестром не тронута. B1 исправное — молчит; B2 порча install+mv мимо pravka — тревога с коммитом;
# B3 снять (установка pravka) — «снова в порядке»; B4 подложная строка «установлено» от не-root не гасит тревогу;
# B5 та же строка от root — гасит (sadik-watch читает только _UID=0). Звать: рука при правке agent-plugins/sadik-watch (B2–B3 гоняют весь
# sadik-watch ~74 с каждая — ~4 мин; в ночной обход не входит). Звать от iskra (не root): подложная строка B4 пишется от id -u,
# а sadik-watch верит только _UID=0 — под root «не-root» подлога нет, и B4/B5 невоспроизводимы: печатаются СЛЕПОТОЙ, код 2.
set -u
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
AP="${AGENT_PLUGINS_BIN:-/usr/local/bin/agent-plugins}"; SW="${SADIK_WATCH_BIN:-/usr/local/sbin/sadik-watch}"
T=$(mktemp -d /tmp/stend-pravki-mimo.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }; chmod 755 "$T"
trap 'sudo -n rm -rf "$T"' EXIT
ok=0; bad=0; slep=0
slepo() { slep=$((slep+1)); echo "  СЛЕПОТА $1"; }
sud() { if [ "$2" = ok ]; then ok=$((ok+1)); echo "  ok    $1"; else bad=$((bad+1)); echo "  FAIL  $1 — $3"; fi; }
R="$T/reestr"; mkdir -p "$R" "$T/montazh" "$T/shim"
sudo -n cp /etc/agent-registry/plugins.yaml "$R/plugins.yaml"; sudo -n chown "$(id -u):$(id -g)" "$R/plugins.yaml"
git -C "$R" init -q; git -C "$R" -c user.name=stend -c user.email=s@s add plugins.yaml; git -C "$R" -c user.name=stend -c user.email=s@s commit -qm v1
# журнал подставной, но с _UID отправителя, как у journald: строка «uid<TAB>текст»; STEND_UID подменяет uid (pravka в бою
# идёт под sudo — в стенде её строки пишутся как от root, uid 0); journalctl исполняет отбор _UID=N, как настоящий
printf '#!/bin/bash\nshift 2; [ "$1" = "--" ] && shift; printf "%%s\\t%%s\\n" "${STEND_UID:-$(id -u)}" "$*" >> %s/zhurnal\n' "$T" > "$T/shim/logger"
cat > "$T/shim/journalctl" <<SH
#!/bin/bash
case " \$* " in *" -t agent-plugins "*)
  u=""; for a in "\$@"; do case "\$a" in _UID=*) u="\${a#_UID=}" ;; esac; done
  awk -F'\t' -v u="\$u" 'u=="" || \$1==u { sub(/^[^\t]*\t/, ""); print }' "$T/zhurnal" 2>/dev/null; exit 0 ;; esac
exec /usr/bin/journalctl "\$@"
SH
chmod 755 "$T/shim/"*
novaya() { python3 - "$R/plugins.yaml" "$T/novaya.yaml" "$1" <<'PY'
import sys; s=open(sys.argv[1]).read(); open(sys.argv[2],'w').write(s+'\n# правка стенда '+sys.argv[3]+'\n')
PY
}
# B-N-985: установка требует --osnova — сумму реестра, снятую ДО установки (редакция novaya собирается в отдельный файл, реестр не трогает)
osn() { sha256sum < "$R/plugins.yaml" | cut -c1-16; }
ap() { env STEND_UID=0 PATH="$T/shim:$PATH" PLUGINS_REGISTRY="$R/plugins.yaml" AGENT_PLUGINS_STRAHOVKI="$T/montazh" "$AP" "$@" > "$T/vyvod" 2>&1; echo $?; }
# A1
novaya 1; s0=$(sha256sum < "$R/plugins.yaml"); K=$(ap pravka "$T/novaya.yaml" --ustanovit --osnova "$(osn)")
[ "$K" = 3 ] && grep -qF "ОТКАЗ: установка без --punkt" "$T/vyvod" && [ "$(sha256sum < "$R/plugins.yaml")" = "$s0" ] && [ -z "$(ls "$T/montazh")" ] \
  && sud "A1 --ustanovit без --punkt — отказ, реестр цел, копий нет" ok || sud "A1" fail "код $K; $(tail -2 "$T/vyvod" | tr '\n' ' ')"
# A3
K=$(ap pravka "$T/novaya.yaml" --ustanovit --punkt '../vne' --osnova "$(osn)"); [ "$K" = 3 ] && [ ! -e "$T/vne" ] && grep -qF -- "--punkt «../vne»" "$T/vyvod" && sud "A3 кривой пункт «../vne» — отказ" ok || sud "A3" fail "код $K"
# A2
K=$(ap pravka "$T/novaya.yaml" --ustanovit --punkt PROBA-1 --osnova "$(osn)"); leg=$(sha256sum "$R/plugins.yaml" | cut -d' ' -f1)
kop=$(ls "$T/montazh/PROBA-1/" 2>/dev/null | grep -c '^plugins.yaml.bak-pre-pravka-'); ryadom=$(ls "$R" | grep -c 'bak-pre-pravka')
if [ "$K" = 0 ] && [ "$kop" = 1 ] && [ "$ryadom" = 0 ] && grep -qF "pravka: установлено $R/plugins.yaml sha256 $leg пункт PROBA-1" "$T/zhurnal"; then sud "A2 с --punkt — копия в montazh/PROBA-1, рядом 0, журнал несёт sha легшего" ok
else sud "A2" fail "код $K, копий в пункте $kop, рядом $ryadom, журнал: $(tail -1 "$T/zhurnal" 2>/dev/null | cut -c1-120)"; fi
git -C "$R" -c user.name=stend -c user.email=s@s commit -qam v2
# A4 ротация: 31 дубль v2 в montazh/STARYE (старше новых), 1 уникальный старейший, 1 копия рядом с реестром — точной формы
mkdir -p "$T/montazh/STARYE"; for i in $(seq -w 1 31); do cp "$R/plugins.yaml" "$T/montazh/STARYE/plugins.yaml.bak-pre-pravka-20200101-0000$i"; done
echo unik > "$T/montazh/STARYE/plugins.yaml.bak-pre-pravka-20190101-000000"; cp "$R/plugins.yaml" "$R/plugins.yaml.bak-pre-pravka-20180101-000000"
novaya 3; K=$(ap pravka "$T/novaya.yaml" --ustanovit --punkt PROBA-2 --osnova "$(osn)")
vsego=$(find "$T/montazh" -name 'plugins.yaml.bak-pre-pravka-*' | wc -l)
[ "$K" = 0 ] && [ -e "$T/montazh/STARYE/plugins.yaml.bak-pre-pravka-20190101-000000" ] && [ -e "$R/plugins.yaml.bak-pre-pravka-20180101-000000" ] && [ "$vsego" = 31 ] \
  && sud "A4 ротация по montazh: осталось 30 последних + 1 уникальный, копия рядом с реестром цела" ok || sud "A4" fail "код $K, копий в montazh $vsego (ждали 31); $(grep -a 'страховок' "$T/vyvod" | tail -1)"
git -C "$R" -c user.name=stend -c user.email=s@s commit -qam v3
# B — sadik-watch ветка 2г (весь sadik-watch под root: состояние временное, канал — заглушка)
printf '#!/bin/sh\necho "$1" >> %s/trevogi\n' "$T" > "$T/alert"; chmod 755 "$T/alert"; mkdir -p "$T/sost"; : > "$T/perechen-sut"
# B-N-991 (условие Вениамина): ЗАПАСНОЙ канал sadik-watch (a2a-send Искре при отказе основного, :100–110) — тоже заглушка.
# Без неё отказ $T/alert (скажем, $T уже убран) отправил бы Искре НАСТОЯЩЕЕ письмо из пробы. Нет $T — нет и заглушки,
# а sadik-watch зовёт запасной только если он исполняем: письмо не уйдёт никуда.
printf '#!/bin/sh\necho x >> %s/a2a-schyot\ncat >> %s/a2a-pisma\nexit 0\n' "$T" "$T" > "$T/a2a"; chmod 755 "$T/a2a"
# временный реестр — мой, sadik-watch — root: без safe.directory git ответит «dubious ownership», и строка коммита выйдет пустой
sw() { rm -f "$T/trevogi"; sudo -n env GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$R" PATH="$T/shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" SADIK_WATCH_MESTNO=1 SADIK_WATCH_SOST="$T/sost" \
  SADIK_ALERT_BIN="$T/alert" SADIK_A2A_BIN="$T/a2a" SADIK_SUTOCHNYE="$T/perechen-sut" SADIK_REESTR_PLAGINOV="$R/plugins.yaml" "$SW" > "$T/sw" 2>&1; }
sw; grep -qF "реестр плагинов: живой ${leg:0:0}" "$T/sw" && ! grep -qF "реестр плагинов" "$T/trevogi" 2>/dev/null \
  && sud "B1 исправное (живой = последняя установка pravka) — молчит" ok || sud "B1" fail "$(grep -a 'реестр плагинов' "$T/sw" | head -1 | cut -c1-150)"
# B2 порча: install+mv мимо pravka + коммит
novaya 4; install -m 644 "$T/novaya.yaml" "$R/.pl.new"; mv "$R/.pl.new" "$R/plugins.yaml"; git -C "$R" -c user.name=stend -c user.email=s@s commit -qam "порча мимо pravka"
kom=$(git -C "$R" log -1 --format=%h); sw
grep -qF "ПРАВЛЕН МИМО pravka" "$T/trevogi" 2>/dev/null && grep -qF "$kom" "$T/trevogi" \
  && sud "B2 порча install+mv мимо pravka — тревога с коммитом $kom" ok || sud "B2" fail "тревоги: $(cut -c1-160 "$T/trevogi" 2>/dev/null)"
# B3 снять: установка pravka
novaya 5; ap pravka "$T/novaya.yaml" --ustanovit --punkt PROBA-3 --osnova "$(osn)" >/dev/null; sw
grep -qF "снова в порядке" "$T/trevogi" 2>/dev/null && ! grep -qF "ПРАВЛЕН МИМО" "$T/trevogi" \
  && sud "B3 снять (установка pravka) — «снова в порядке»" ok || sud "B3" fail "тревоги: $(cut -c1-160 "$T/trevogi" 2>/dev/null)"
# B4 порча мимо pravka + подложная строка «установлено <живой sha>» от НЕ-root (условие Вениамина) — тревога НЕ гаснет
if [ "$(id -u)" = 0 ]; then
  slepo "B4 рукой root: подложной строки от не-root не сделать (заглушка logger пишет от id -u) — не проверялось"
  slepo "B5 рукой root: без B4 «гасит только root» не отличить — не проверялось"
else
novaya 6; install -m 644 "$T/novaya.yaml" "$R/.pl.new"; mv "$R/.pl.new" "$R/plugins.yaml"; git -C "$R" -c user.name=stend -c user.email=s@s commit -qam "мимо pravka с подлогом"
kom=$(git -C "$R" log -1 --format=%h); zh=$(sha256sum "$R/plugins.yaml" | cut -d' ' -f1)
env STEND_UID="$(id -u)" "$T/shim/logger" -t agent-plugins -- "pravka: установлено $R/plugins.yaml sha256 $zh пункт PODLOG"
grep -qF "$(id -u)	pravka: установлено $R/plugins.yaml sha256 $zh" "$T/zhurnal" || echo "  (подлог НЕ внесён в журнал — B4 без предмета)"
sw; grep -qF "ПРАВЛЕН МИМО pravka" "$T/trevogi" 2>/dev/null && grep -qF "$kom" "$T/trevogi" \
  && sud "B4 подложная строка от uid $(id -u) не гасит тревогу — ПРАВЛЕН МИМО, коммит $kom" ok || sud "B4" fail "тревоги: $(cut -c1-160 "$T/trevogi" 2>/dev/null)"
# B5 та же строка от root (uid 0) — гасит
env STEND_UID=0 "$T/shim/logger" -t agent-plugins -- "pravka: установлено $R/plugins.yaml sha256 $zh пункт ROOT"
sw; grep -qF "снова в порядке" "$T/trevogi" 2>/dev/null && ! grep -qF "ПРАВЛЕН МИМО" "$T/trevogi" \
  && sud "B5 та же строка от root — «снова в порядке»" ok || sud "B5" fail "тревоги: $(cut -c1-160 "$T/trevogi" 2>/dev/null)"
fi
echo "  запасной канал (заглушка a2a) звался: $(cat "$T/a2a-schyot" 2>/dev/null | wc -l) раз"
echo "  ok=$ok  FAIL=$bad  СЛЕПОТА=$slep"
ZHDYOM=9
[ $((ok+bad+slep)) -eq $ZHDYOM ] || { echo "СЛЕПОТА: проверок $((ok+bad+slep)) из $ZHDYOM"; exit 2; }
[ "$bad" -eq 0 ] || exit 1
[ "$slep" -eq 0 ] || { echo "СЛЕПОТА: $slep проверок не состоялось — это не успех"; exit 2; }
exit 0
