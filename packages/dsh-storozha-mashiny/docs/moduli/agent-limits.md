# agent-limits — читатель пределов агентов · agents' limits reader

Командная утилита, которая показывает системные пределы и политики агента (сколько запусков подряд и в сутки, токенные пределы, часовой пояс суток и т. п.) вместе с ИСТОЧНИКОМ каждого значения, и проверяет форму всех файлов пределов. Ничего не пишет — по построению.

A command-line tool that shows an agent's system limits and policies (consecutive and daily runs, token limits, day time zone, etc.) together with the SOURCE of each value, and checks the shape of all limits files. It writes nothing — by construction.

## Файлы · Files

| Файл · File | Что это · What |
|---|---|
| `bin/agent-limits` | утилита (Python 3, модуль `yaml`) · the tool (Python 3, `yaml` module) |
| `test/stend-agent-limits.sh` | приёмочный стенд, 27 проверок · acceptance stand, 27 checks |

Юнита нет: утилиту зовут люди, агенты и скрипты напрямую.

There is no unit: people, agents and scripts call the tool directly.

## Как работает · How it works

Значение собирается из трёх слоёв: умолчание кода → общий файл `obshchee.yml` → файл агента `<агент>.yml`. Слоёв ровно два плюс умолчание: третий слой сделал бы невидимым, перебито ли значение. Каждое значение печатается с источником; умолчание кода называется словами «умолчание кода».

A value is merged from three layers: code default → shared file `obshchee.yml` → agent file `<agent>.yml`. Exactly two layers plus the default: a third would hide whether a value was overridden. Every value is printed with its source; a code default is labelled "умолчание кода".

Токенный предел проверяется МЕЖДУ ходами, поэтому перерасход на цену последнего хода гарантирован. Цена хода — «квант» (`zamer.kvantTokenovNaHod`). Рядом с предельным значением печатается допуск; предел меньше двух квантов помечается «ЗАЩИТЫ НЕТ».

A token limit is checked BETWEEN turns, so overspending by the cost of the last turn is guaranteed. The turn cost is the "quantum" (`zamer.kvantTokenovNaHod`). The tolerance is printed next to the limit; a limit below two quanta is marked "NO PROTECTION".

Подкоманды · Subcommands:

```
agent-limits pokazhi <agent> [key] [--json]   # все значения с источником / одно значение
agent-limits proverit [--json]                # форма всех файлов каталога
```

`proverit` проверяет: разбирается ли каждый файл; есть ли единица измерения в имени числового предела (`Count`, `Seconds`, `Minutes`, `Tokens`…); не меньше ли токенный предел двух квантов; у каждого ключа файла есть ли «читатель» — файл-потребитель в корнях `proverka.korniPotrebitelej`, где встречаются и имя ключа, и путь каталога из `AGENT_LIMITS_DIR` либо слово `agent-limits`. Ключи из `proverka.bezChitatelyaNarochno` намеренно исключены и печатаются числом.

`proverit` checks: does every file parse; does every numeric limit have a unit in its name; is no token limit below two quanta; does every key have a "reader" — a consumer file under `proverka.korniPotrebitelej` containing the key name plus either the directory path from `AGENT_LIMITS_DIR` or the word `agent-limits`. Keys in `proverka.bezChitatelyaNarochno` are deliberately excluded and printed as a count.

## Настройки · Settings

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `AGENT_LIMITS_DIR` | каталог · dir | `/etc/ai-agent-limits` | где лежат `obshchee.yml` и `<agent>.yml` · where the files live | `/etc/ai-agent-limits` | нет каталога → `pokazhi` работает на умолчаниях кода и пишет «файла агента нет»; `proverit` — СЛЕПОТА, код 2 · missing → `pokazhi` uses code defaults and says "файла агента нет"; `proverit` → BLINDNESS, exit 2 |

`AGENT_LIMITS_DIR` читается через `lib/nastrojka`: окружение → файл настроек пакета → умолчание. Для одинакового каталога у всех вызывающих задавайте его в `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf`; непустое окружение имеет приоритет.

`AGENT_LIMITS_DIR` is read through `lib/nastrojka`: environment → package settings file → default. To use the same directory for all callers, set it in `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf`; a nonempty environment value wins.

Разделы файла пределов · Limits-file sections: `predely` (пределы · limits), `politiki` (политики · policies), `prava` (права · rights), `zamer` (замеры, квант · measurements, quantum), `proverka` (рамка проверки читателей · reader-check scope); верхний ключ `perehod_zavershyon: false` — файл ещё никем не читается, утилита говорит об этом при каждом показе.

`perehod_zavershyon: false` at top level means nobody reads the file yet; the tool says so on every display.

## Что ловит и чего НЕ ловит · What it catches and what it does NOT

Ловит: битый YAML (код 2 с именем файла, а не тихое умолчание); предел без единицы в имени; токенный предел ниже двух квантов; ключ, который никто не читает; незавершённый переход. Битый файл одного агента не гасит проверку остальных.

Catches: broken YAML (exit 2 naming the file, not a silent default); a limit without a unit in its name; a token limit below two quanta; a key nobody reads; an unfinished transition. One agent's broken file does not stop checking the others.

НЕ ловит: действуют ли пределы на деле (это приёмка потребителей); верны ли значения по смыслу; признак «читателя» приблизителен — упоминание ключа в комментарии потребителя считается чтением. С 1.0.1 читатель — файл, где есть путь каталога `AGENT_LIMITS_DIR` или вызов `agent-limits`, и имя ключа (прежде искалось только слово `agent-limits`).

Does NOT catch: whether limits are actually enforced (consumers' acceptance); whether values make sense; the "reader" sign is approximate — a key mentioned in a consumer's comment counts as read. Since 1.0.1 a reader is a file with the `AGENT_LIMITS_DIR` path or an `agent-limits` call, plus the key name (before, only the word `agent-limits` was searched).

## Куда кричит · Where it alerts

Никуда: это утилита. Отказы — в stderr, stdout при отказе пуст (НОЛЬ байт), чтобы конвейер не подавился мусором. В конвейере берите код через `PIPESTATUS` или `set -o pipefail`.

Nowhere: it is a tool. Refusals go to stderr, stdout stays empty (ZERO bytes) so a pipeline does not choke. In pipelines use `PIPESTATUS` or `set -o pipefail`.

## Коды выхода · Exit codes

| Код · Code | Значение · Meaning |
|---|---|
| 0 | показано / форма сходится · shown / shape OK |
| 1 | `proverit`: найдены беды · problems found |
| 2 | файл не разбирается, нет модуля `yaml`, нет каталога (`proverit`) · unparsable file, no `yaml`, no directory |
| 3 | нет такого параметра, не указан агент, неизвестная подкоманда · unknown key, no agent, unknown subcommand |
