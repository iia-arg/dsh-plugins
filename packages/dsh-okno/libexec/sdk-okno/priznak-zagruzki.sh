#!/bin/bash
# Признак (б) окна SDK (Заря 14.10.2026, по уроку master): что ТЕКУЩИЙ процесс каждого шлюза взял из слоя (строка gateway.mjs «SDK <пакет> <версия> взят из слоя»).
# Вызов: sudo priznak-zagruzki.sh <claude-версия> <codex-версия>. Коды: 0 — у всех загрузивших новые; 1 — есть старая (смесь/не перезапущен);
# 2 — СЛЕПОТА хоть у одного юнита (журнал процесса не прочитан или пуст, нет MainPID) либо вызов неверен / не root.
# «не загружал» — допустимо, дозакрыть после первого хода; ставится, только когда строки журнала процесса ЕСТЬ, а SDK-строки среди них нет.
# Журнал — по _PID текущего MainPID с момента его старта.
# НЕ ловит: (а) SDK-строку, потерянную лимитом journald при живых соседних строках, — читается как «не загружал»;
#   (б) перечень 16 юнитов зашит в текст, как в dopusk-sh5 — новый шлюз вносить строкой, иначе он вне признака;
#   (в) ExecMainStartTimestamp подаётся в --since текстом — разбор при смене пояса/локали не проверялся.
set -u
[[ $# -eq 2 ]] || { echo "отказ: priznak-zagruzki.sh <claude-agent-sdk версия> <codex-sdk версия>"; exit 2; }
# MED Вениамина 14.10: не root журнал чужих процессов не читает — каждый юнит стал бы «не загружал» при нуле измерений
[[ $(id -u) -eq 0 ]] || { echo "отказ: звать от root (sudo) — журнал процессов шлюзов иначе не читается"; exit 2; }
VC=$1 VX=$2 plohie=() nezagr=() slepye=()
OSH=$(mktemp) || { echo "СЛЕПОТА: не создать временный файл"; exit 2; }
trap 'rm -f "$OSH"' EXIT
for u in claude-oauth-gateway@{avrora,iskra,spartak,zarya,varvara,sova} coder-gateway@{alfa,beta,gamma} coder-gateway-{marc,anna,master,vintik,shpuntik,gayka,shurup,tumbler}; do
  pid=$(systemctl show $u.service -p MainPID --value); ts=$(systemctl show $u.service -p ExecMainStartTimestamp --value)
  if [[ -z $pid || $pid == 0 ]]; then echo "  $u: СЛЕПОТА — MainPID нет"; slepye+=($u); continue; fi
  zh=$(journalctl _PID=$pid --since "$ts" -o cat --no-pager 2>"$OSH"); jk=$?
  n=$(grep -c '' <<<"$zh"); [[ -z $zh ]] && n=0
  if (( jk != 0 || n == 0 )); then
    echo "  $u: pid $pid с $ts — СЛЕПОТА: журнал процесса $( ((jk)) && echo "не прочитан (journalctl код $jk)" || echo 'пуст') — $(head -1 "$OSH")"; slepye+=($u); continue
  fi
  st=$(grep -oE 'SDK @(anthropic-ai/claude-agent-sdk|openai/codex-sdk) [^ ]+ взят из слоя' <<<"$zh" | sed -E 's/^SDK @[^/]+\/([^ ]+) ([^ ]+) .*/\1=\2/' | sort -u | tr '\n' ' ')
  if [[ -z $st ]]; then echo "  $u: pid $pid с $ts — не загружал (строк журнала $n)"; nezagr+=($u); continue; fi
  # каждый ЗАГРУЖЕННЫЙ пакет — новой версии (шлюз Claude грузит только claude-agent-sdk; кодер — оба)
  ok=1; for x in $st; do [[ $x == "claude-agent-sdk=$VC" || $x == "codex-sdk=$VX" ]] || ok=0; done
  if (( ok )); then echo "  $u: pid $pid — $st— новые"
  else echo "  $u: pid $pid с $ts — $st— 🔴 СТАРАЯ/СМЕСЬ, поднять повторно"; plohie+=($u); fi
done
echo "итог: старых ${#plohie[@]} (${plohie[*]:-—}); слепота ${#slepye[@]} (${slepye[*]:-—}); не загружали ${#nezagr[@]} (${nezagr[*]:-—})"
(( ${#plohie[@]} )) && exit 1
(( ${#slepye[@]} )) && exit 2
exit 0
