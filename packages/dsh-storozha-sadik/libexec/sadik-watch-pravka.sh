#!/bin/bash
# Общий код 2г: вызывают sadik-watch и узкий stend-pravki-mimo.
# log/gruppa и BEDY предоставляет вызывающий; состояние/каналы остаются его.
# Один проход, без повторов; остывание тревоги 21600 с задаёт прежний gruppa.
# Сам по себе source не читает реестр и не делает внешних действий.
# ── 2г. РЕЕСТР ПЛАГИНОВ ПРАВЛЕН МИМО pravka (B-N-898, 25.09.2026) ────────────────────────────────────────────────────────
# 🔴 ЗАЧЕМ. 25.09 07:38–12:46Z plugins.yaml правили 25 раз install+mv мимо `agent-plugins pravka` — без её проверок (форма,
#   повторы ключей, разделы, убыль, копия, приёмка чтением), и этого не видел никто. С B-N-898 pravka пишет в журнал
#   «pravka: установлено <реестр> sha256 <полный> …» (logger -t agent-plugins).
# Признак: sha256 ЖИВОГО файла ≠ sha последней такой строки → «правлен мимо pravka» с последним коммитом git; строк нет вовсе →
#   «установок pravka в журнале нет». Состав группы — живой sha[:16]: новая правка мимо — новая тревога; вернули через
#   pravka — «снова в порядке».
# ⚠️ ЧЕГО НЕ ЛОВИТ: правку pravka-ой, а потом «откат руками» того же содержимого (sha совпадёт); правку, которую pravka
#   поставила неверно по смыслу (её судит verify); журнал, обрезанный ротацией journald до последней установки — тогда
#   ложное «нет установок» (громко, не тихо). Реестр агентов agents.yaml — не здесь (у него pravka нет).
# 🔴 ТОЛЬКО _UID=0 (условие Вениамина 25.09): тег -t agent-plugins поставит любая учётка (`logger -t agent-plugins …` от
#   iskra/zarya) и навсегда погасит тревогу. _UID journald пишет сам по отправителю; pravka ставит только под root.
#   Не ловит: подложную строку от root (любой sudo logger) — это рука с правом писать и сам реестр.
sadik_proverit_pravku() {
  REESTR_PL="${SADIK_REESTR_PLAGINOV:-/etc/agent-registry/plugins.yaml}"
  GR_PRAVKA=""; GR_PRAVKA_TXT=""
  _zhiv=$(sha256sum "$REESTR_PL" 2>/dev/null | cut -d' ' -f1)
  _posl=$(journalctl -t agent-plugins _UID=0 -o cat --no-pager -q 2>/dev/null | grep -aF "pravka: установлено $REESTR_PL sha256 " | tail -1 | sed -n 's/.* sha256 \([0-9a-f]\{64\}\).*/\1/p')
  _kommit=$(git --no-optional-locks -C "$(dirname "$REESTR_PL")" log -1 --format='%h %ad «%s»' --date=format-local:%d.%m\ %H:%MZ -- "$(basename "$REESTR_PL")" 2>/dev/null | cut -c1-120)
  if [ -z "$_zhiv" ]; then
    GR_PRAVKA="ne-prochitan"; GR_PRAVKA_TXT="реестр плагинов не прочитан: $REESTR_PL"; BEDY=$((BEDY+1))
  elif [ -z "$_posl" ]; then
    GR_PRAVKA="${_zhiv:0:16}"; GR_PRAVKA_TXT="реестр плагинов: установок pravka в журнале НЕТ — живой ${_zhiv:0:16} поставлен мимо неё (последний коммит: ${_kommit:-не найден})"; BEDY=$((BEDY+1))
  elif [ "$_zhiv" != "$_posl" ]; then
    GR_PRAVKA="${_zhiv:0:16}"; GR_PRAVKA_TXT="реестр плагинов ПРАВЛЕН МИМО pravka: живой ${_zhiv:0:16}, последняя установка pravka ${_posl:0:16} (последний коммит: ${_kommit:-не найден})"; BEDY=$((BEDY+1))
  else
    log "   реестр плагинов: живой ${_zhiv:0:16} = последняя установка pravka"
  fi
  gruppa pravka "$GR_PRAVKA" "$GR_PRAVKA_TXT" 21600
}
