# Устройство · Architecture

## Части · Parts

Пакет состоит из одного файла данных — реестра — и десяти команд вокруг него. Реестр — YAML со списком записей `plugins:`; каждая запись описывает одно вмешательство в машину: где лежит, откуда взято, чья рука, кто им пользуется, что сломается без него и какой командой проверить версию и отпечаток.
The package is one data file — the registry — and ten commands around it. The registry is YAML with a `plugins:` list; each entry describes one intervention on the host: where it lives, where it came from, whose hand maintains it, who uses it, what breaks without it, and which command checks its version and fingerprint.

```mermaid
flowchart TB
  subgraph DATA["Данные · Data"]
    R[("plugins.yaml<br/>записи · entries")]
    B[("копии до правки<br/>pre-edit backups")]
    G[("git реестра<br/>registry git")]
  end
  subgraph TOOLS["Команды · Commands"]
    AP[agent-plugins]
    WD[registry-watchdog]
    NZ[nezafiksirovano-watch]
    SH[shvy-mezhdu-paketami-watch]
    LC[agent-plugins-lock-check]
    CHK["sverka-montazha · priznak-oblasti<br/>srez-obshchego-kataloga · sverka-zavisimostej · preset-sverka"]
  end
  AP -- list/check/verify/diff --> R
  AP -- pravka --> B
  AP -- pravka --> R
  AP -- pravka: коммит только реестра · commit registry only --> G
  WD -- verify --> AP
  NZ -- git status --> G
  CHK -. только чтение · read-only .-> R
```

## Правка реестра · Registry edit

```mermaid
sequenceDiagram
  participant O as Оператор · Operator
  participant AP as agent-plugins pravka
  participant R as Реестр · Registry
  O->>AP: pravka cand.yaml --osnova SHA
  AP->>R: sha256(живой · live) == SHA ?
  alt бой ≠ основе · live ≠ base
    AP-->>O: отказ, бой не тронут · refuse, live untouched
  else совпало · matches
    AP->>AP: разбор, счёт записей, проверки · parse, count, checks
    AP-->>O: разница по полям (сухой) · per-field diff (dry run)
    O->>AP: … --ustanovit --punkt LABEL
    AP->>AP: копия до правки · pre-edit backup
    AP->>R: временный файл → os.replace · temp file → os.replace
    AP->>R: отдельное чтение установленного · separate read-back
    AP->>AP: коммит реестра в git · commit registry to git
  end
```

`--osnova` — сумма реестра, с которого собран кандидат. Если живой файл с тех пор изменился, правка поверх него затёрла бы чужое; поэтому установка без совпадения основы невозможна.
`--osnova` is the sha256 of the registry the candidate was built from. If the live file has changed since, editing over it would erase someone else's change; installation is therefore impossible without a base match.

## Исходы сторожа · Watchdog outcomes

```mermaid
stateDiagram-v2
  [*] --> Меряю · Measuring
  Меряю · Measuring --> ЗЕЛЕНО · GREEN: всё проверенное сошлось · all checked matched
  Меряю · Measuring --> РАСХОЖДЕНИЕ · DRIFT: записанное ≠ машине · record ≠ host
  Меряю · Measuring --> СЛЕПОТА · BLIND: не смог измерить или сказать · could not measure or report
  РАСХОЖДЕНИЕ · DRIFT --> Тревога · Alert
  СЛЕПОТА · BLIND --> Тревога · Alert
  ЗЕЛЕНО · GREEN --> [*]
  Тревога · Alert --> [*]
```

Недоставленная тревога — тоже СЛЕПОТА (код 2): юнит обязан числиться упавшим, иначе молчание сойдёт за спокойствие.
An undelivered alert is also BLIND (exit 2): the unit must show as failed, otherwise silence passes for calm.

## Потоки данных · Data flow

Реестр пишет только `agent-plugins pravka`: новая редакция самого реестра, копия до правки, коммит в git реестра и строка в системный журнал (`logger -t agent-plugins`, sha256 легшего файла). Сторож реестров пишет своё состояние — отметки прогона и голоса в `REGWD_STATE` (по умолчанию `/var/lib/registry-watchdog`). Прочие команды только читают. Ни одна команда не ставит пакеты, не правит юниты и не перезапускает службы.
Only `agent-plugins pravka` writes the registry: the new revision itself, the pre-edit backup, a commit in the registry's git and a system journal line (`logger -t agent-plugins`, sha256 of the file that landed). The registry watchdog writes its own state — run and voice stamps in `REGWD_STATE` (default `/var/lib/registry-watchdog`). All other commands are read-only. No command installs packages, edits units or restarts services.
