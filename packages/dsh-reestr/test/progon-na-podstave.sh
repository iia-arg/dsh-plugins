#!/usr/bin/env bash
# RU: progon-na-podstave.sh — стенды пакета на ПОДСТАВНОЙ настройке (B-N-1856, Заря, 08.10.2026).
# EN: progon-na-podstave.sh — the package stands on a SUBSTITUTE configuration (B-N-1856).
#
# RU: ЗАЧЕМ. Стенды судят инструменты по настройке /etc/dsh-reestr. Там, где пакет не установлен (sadik: своя машинная
#     редакция инструментов, реестр в /etc/agent-registry), они слепнут или судят ЧУЖОЙ предмет: по умолчанию берут
#     /usr/local/bin/agent-plugins, а это не инструмент пакета. Замер 08.10 на метке v2.0.5: 3 из 5 не судят
#     (krug 0/11, pravki и storozha — СЛЕПОТА «нет /etc/dsh-reestr/plugins.yaml»).
#     Здесь строится свой временный корень: реестр-образец (одна запись на подставной файл, зелёная на любой машине),
#     реестр агентов с одним агентом без мест (обратная сверка verify чиста) — и стенды зовут
#     инструменты ЭТОГО пакета (bin/ рядом) через переменные, которые пакет уже читает:
#     PLUGINS_REGISTRY, AGENTS_REGISTRY, PRAVKA_INSTRUMENT, INSTRUMENT, SUT, VERIFY_CMD, HEALTH_CMD, AGENTS_VERIFY_CMD, PEER_ENABLED, PRIBOR.
#     Код стендов и инструментов не меняется.
# RU: ЧТО ГОНЯЕТСЯ (3.1.1): priznak, pravki, storozha, uchteno-v, nahodki-audita-16 и svezhaya-osnova.
#     Первые три получают подставное окружение; остальные строят собственную временную область.
#     Пробы montage-mode (смена uid требует root) вызываются отдельно через test/stend-montazh-mode.sh.
#     🔴 stend-krug-samoproverki НЕ ГОНЯЕТСЯ: он по замыслу стопит/стартует ЖИВЫЕ таймеры и размаскирует
#     apt-daily-upgrade.timer (шапка: «только вручную, с разрешения»). Подстава реестра его предмет не заменяет.
#     В итоге он назван «ручной, не гонялся» и в счёт N из N не входит.
# RU: ЧЕГО НЕ ЛОВИТ: поведение инструментов на настоящем реестре машины (образец — одна запись); учёт доработок
#     (DORABOTKI_CMD) — storozha сам называет пропуск случая 13; agent-registry verify подменён командой `true`
#     (это другой реестр машины, не предмет пакета); соседа сторожа (PEER_ENABLED=0).
# RU: КОДЫ: 0 — все гонявшиеся стенды сошлись; 1 — хоть один красный; 2 — хоть один слепой (суждения нет).
# EN: EXIT: 0 — all stands that ran passed; 1 — at least one red; 2 — at least one blind.
set -uo pipefail
PAKET="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
# RU: 2.0.9 (B-N-1922, Михалыч): lib и файла настройки нет — пакет = боевая редакция; реестры подаются переменными PLUGINS_REGISTRY/AGENTS_REGISTRY.
[ -x "$PAKET/bin/agent-plugins" ] && [ -x "$PAKET/bin/registry-watchdog.sh" ] && [ -x "$PAKET/bin/priznak-oblasti-podklyucheniya.sh" ] \
  || { echo "СЛЕПОТА: пакет неполон в $PAKET (bin/agent-plugins, bin/registry-watchdog.sh, bin/priznak-oblasti-podklyucheniya.sh)"; exit 2; }
for a in "$@"; do echo "ОТКАЗ: доводов нет, получен «$a» (krug отсюда не зовётся — только вручную, по шапке)"; exit 2; done

K=$(mktemp -d /tmp/dsh-reestr-podstava.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$K"' EXIT
echo "предмет стендов: пакет $PAKET; подставной корень: $K"
printf 'предмет стендов dsh-reestr\n' > "$K/predmet.txt"; printf '1\n' > "$K/versiya.txt"; mkdir -p "$K/dom-agenta"
cat > "$K/plugins.yaml" <<EOF
plugins: []
services:
  - id: stend-predmet
    name: "подставной предмет стендов dsh-reestr"
    version: "1"
    origin: ours
    path: $K/predmet.txt
    installed_check: "cat $K/versiya.txt"
    fingerprint: "$(sha256sum "$K/predmet.txt" | cut -c1-16)"
    fingerprint_check: "sha256sum $K/predmet.txt | cut -c1-16"
    healthcheck: "test -r $K/predmet.txt && echo предмет-на-месте"
EOF
printf 'agenty:\n  - imya: stend-agent\n    namerenie:\n      dom: %s\n' "$K/dom-agenta" > "$K/agents.yaml"

# RU: Зрячесть подставы — до стендов: образец обязан сходиться с машиной, иначе красное стендов было бы про подставу.
v=$(env PLUGINS_REGISTRY="$K/plugins.yaml" AGENTS_REGISTRY="$K/agents.yaml" "$PAKET/bin/agent-plugins" verify 2>&1); vk=$?
if [ "$vk" -ne 0 ] || ! printf '%s' "$v" | grep -qF "реестр совпадает с машиной"; then
  echo "СЛЕПОТА: образец не сошёлся с машиной (verify код $vk) — стенды на нём недоказательны:"; printf '%s\n' "$v" | tail -3; exit 2
fi
echo "образец: verify код 0 «реестр совпадает с машиной»"

PODSTAVA=(REESTR="$K/plugins.yaml" PLUGINS_REGISTRY="$K/plugins.yaml" AGENTS_REGISTRY="$K/agents.yaml" PRAVKA_INSTRUMENT="$PAKET/bin/agent-plugins" INSTRUMENT="$PAKET/bin/agent-plugins"
  SUT="$PAKET/bin/registry-watchdog.sh" VERIFY_CMD="$PAKET/bin/agent-plugins verify" HEALTH_CMD="$PAKET/bin/agent-plugins list --health"
  AGENTS_VERIFY_CMD=true PEER_ENABLED=0 PRIBOR="$PAKET/bin/priznak-oblasti-podklyucheniya.sh")
zelenyh=0; krasnyh=0; slepyh=0; vsego=0
progon() { # RU: имя стенда, затем «podstava» или «kak-est»
  local s="$PAKET/test/$1" kod hv
  vsego=$((vsego+1))
  if [ "$2" = podstava ]; then hv=$(env "${PODSTAVA[@]}" bash "$s" 2>&1); kod=$?
  elif [ "$2" = python ]; then hv=$(python3 -B "$s" 2>&1); kod=$?;
  else hv=$(bash "$s" 2>&1); kod=$?; fi
  case $kod in 0) zelenyh=$((zelenyh+1)); z="зелёный";; 1) krasnyh=$((krasnyh+1)); z="КРАСНЫЙ";; *) slepyh=$((slepyh+1)); z="СЛЕПОТА";; esac
  printf '  %-30s %-9s код %s · %s\n' "$1" "$z" "$kod" "$(printf '%s' "$hv" | grep -vE '^\s*$' | tail -1 | cut -c1-90)"
  [ "$kod" = 0 ] || printf '%s\n' "$hv" | grep -E 'FAIL|СЛЕПОТА|ОТКАЗ' | head -5 | sed 's/^/      /'
}
progon stend-priznaka-oblasti.sh podstava
progon stend-pravki-reestra.sh podstava
progon stend-storozha-reestrov.sh podstava
progon stend-uchteno-v.sh kak-est   # №26 аудита 16: свой стенд uchteno_v — в счёт; ему подстава не нужна (временный реестр сам)
progon stend-nahodok-audita-16.sh kak-est   # пробы к находкам кода аудита 16 на bin/ пакета
progon stend-svezhej-osnovy.py python
progon stend-owner-reader.py python   # B-N-2104(2): actual UIDiskra/root0640 JSON, bounded privileged reader
# №19 аудита 16: под root у stend-pravki-reestra пять проб EPERM слепы по построению (root их не воспроизводит) — это
# названо, а не скрыто: зелёный pravki — только от не-root учётки с sudo -n (docs/GUARDS.md).
[ "$(id -u)" = 0 ] && echo "  ⚠️ прогон под root: stend-pravki-reestra слеп на 5 пробах EPERM по построению — гоняйте от учётки с sudo -n"
echo "  stend-krug-samoproverki.sh     РУЧНОЙ   не гонялся: трогает живые таймеры и маску apt-daily-upgrade — только вручную, с разрешения"
echo "стенды на подставе: зелёных $zelenyh из $vsego (красных $krasnyh, слепых $slepyh); вне счёта: krug (ручной)"
[ "$slepyh" -gt 0 ] && exit 2
[ "$krasnyh" -gt 0 ] && exit 1
exit 0
