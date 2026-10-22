# Устройство · Architecture

Пакет — набор из двадцати самостоятельных приборов в `bin/`. Общего процесса, службы или состояния у них нет: каждый прибор запускается рукой или сторожем, отвечает строками вывода и кодом возврата и завершается. Общее у них одно — файл настройки и порядок, в котором прибор ищет значение.

The package is a set of twenty standalone tools in `bin/`. They share no process, service or state: each tool is run by a hand or a watcher, answers with output lines and an exit code, and exits. The only shared thing is the settings file and the order in which a tool looks up a value.

## Порядок значения · Value lookup order

```mermaid
flowchart TD
    A["Довод командной строки · Command-line argument"] -->|есть · present| V["Значение · Value"]
    A -->|нет · absent| B["Переменная окружения · Environment variable"]
    B -->|непустая · non-empty| V
    B -->|нет · absent| C["Файл DSH_PRIBORY_CONF<br/>(умолчание · default /etc/dsh-pribory/dsh-pribory.conf)"]
    C -->|ключ есть · key present| V
    C -->|нет · absent| D{"Нейтральное умолчание? · Neutral default?"}
    D -->|есть · yes| V
    D -->|нет · no| X["СЛЕПОТА или ОТКАЗ, код 2 · BLINDNESS or REFUSAL, code 2"]
```

Файл читается построчно: `КЛЮЧ=значение`, строка с `#` в начале — комментарий, пробелы и табуляции по краям ключа и значения срезаются, при повторе ключа действует последнее вхождение. Разборщик написан трижды — на bash, Python и Node — и копии в модулях одного языка побайтно равны; это проверяет `test/stend-nastrojki.sh`.

The file is read line by line: `KEY=value`, a line starting with `#` is a comment, spaces and tabs around the key and value are trimmed, and for a repeated key the last occurrence wins. The parser is written three times — in bash, Python and Node — and the copies inside modules of one language are byte-identical; `test/stend-nastrojki.sh` checks that.

Пустая переменная окружения ведёт себя по-разному в зависимости от языка модуля: в bash (`${X:-…}`) пустая строка проваливается в файл, в Node (`??`) пустая строка остаётся значением. Это касается `PS_KATALOG` и `FILTR_PUT` у `sekrety-po-znacheniyu`.

An empty environment variable behaves differently by module language: in bash (`${X:-…}`) an empty string falls through to the file, in Node (`??`) an empty string stays the value. This applies to `PS_KATALOG` and `FILTR_PUT` of `sekrety-po-znacheniyu`.

## Три рода приборов · Three kinds of tools

```mermaid
flowchart LR
    subgraph R["Читающие · Reading"]
        r1["dvojniki · kto-podnimal · kto-pravil-fajl<br/>obyortka-krasneet · pokrytie-ozhidaniem-prob.mjs<br/>proba-obrezki.sh · iskat-miny-oblasti.mjs<br/>priznak-vzyatiya.mjs · sekrety-po-znacheniyu<br/>agent-wake-cost"]
    end
    subgraph W["Действующие · Acting"]
        w1["pogasit · ubrat · polozhit<br/>proba-v-katalog · istoriya-profilya<br/>refresh-skill-links · dsh-dump-kopiya"]
    end
    subgraph O["Обёртки · Wrappers"]
        o1["progon · obeimi-rukami"]
    end
    H["Рука или сторож · Hand or watcher"] --> R
    H --> W
    H --> O
    R -->|"строки + код 0/1/2 · lines + code 0/1/2"| H
    W -->|"строки + код · lines + code"| H
    O -->|"код обёрнутой команды · wrapped command's code"| H
```

Читающие ничего не меняют и отвечают по контракту `0` — сошлось, `1` — найдено расхождение, `2` — проверять нечем (слепота). Действующие меняют только то, что названо точно: порт или юнит, каталог внутри разрешённого корня, файл по пути, каталог ссылок скиллов. Обёртки исполняют чужую команду и добавляют к её ответу то, что рука обычно теряет: настоящий код возврата или сверку ответов двух учёток.

Reading tools change nothing and answer by the contract `0` — matches, `1` — a divergence found, `2` — nothing to check with (blindness). Acting tools change only what is named exactly: a port or unit, a directory inside an allowed root, a file by path, the skill link directory. Wrappers run someone else's command and add what a hand usually loses: the real exit code or a comparison of two accounts' answers.

## Поток одного вызова: `kto-podnimal` · One call: `kto-podnimal`

```mermaid
sequenceDiagram
    participant H as Рука · Hand
    participant K as kto-podnimal
    participant J as journalctl
    participant G as Журнал ворот · Gate log
    H->>K: служба, окно · service, window
    K->>J: читается ли журнал этой рукой · is the journal readable by this hand
    alt не читается · unreadable
        K-->>H: СЛЕПОТА (права, а не подъёмы), код 2
    end
    K->>J: подъёмы службы в окне · service starts in window
    J-->>K: моменты подъёмов · start moments
    alt подъёмов нет · no starts
        K-->>H: «подъёмов службы в окне НЕ БЫЛО», код 0
    else подъёмы есть · starts exist
        K->>J: след sudo рядом с подъёмом · sudo trace near the start
        J-->>K: рука, юнит, соседи по заходу · hand, unit, neighbours
        K->>G: есть ли запись ворот на каждый подъём · gate record per start
        alt журнала ворот нет · no gate log
            K-->>H: «ИТОГ: 2 — СЛЕПОТА», код 2
        else подъём без записи · start without record
            K-->>H: «ИТОГ: 1 — ОБХОД НАЙДЕН И ДОКАЗАН», код 1
        else все записаны · all recorded
            K-->>H: «ИТОГ: 0 — … (сверено с журналом ворот)», код 0
        end
    end
```

## Где лежат строки вывода · Output lines

Строки вывода — на русском языке, и это интерфейс: сторожа и стенды разбирают их как текст («сверено с журналом ворот», «СЛЕПОТА», «ОБХОД НАЙДЕН»). Переименование такой строки ломает читающего молча, поэтому строки не переводятся.

Output lines are in Russian, and they are an interface: watchers and stands parse them as text. Renaming such a line breaks the reader silently, so the lines are not translated.
