# Настройки · Settings

Приборы берут частные значения из одного файла: `/etc/dsh-pribory/dsh-pribory.conf`; путь меняет переменная `DSH_PRIBORY_CONF`.

The tools take private values from one file: `/etc/dsh-pribory/dsh-pribory.conf`; the `DSH_PRIBORY_CONF` variable changes the path.

Формат: строки `КЛЮЧ=значение`; пробелы и табы вокруг `=` и по краям значения отбрасываются; строка с `#` в начале — комментарий, и только она: значение, в котором есть « #» (пробел или таб перед `#`), — громкий отказ с названием ключа, код `2` (см. [TROUBLESHOOTING.md](TROUBLESHOOTING.md), случай 2); `#` без пробела перед ним — часть значения; при повторе ключа действует последнее вхождение. Разборщик одинаков в трёх языках (bash, Python, Node) — это проверяет `test/stend-nastrojki.sh`, и строку фикстуры с хвостовыми пробелами он пишет `printf` с контролем внесения.

Format: `KEY=value` lines; spaces and tabs around `=` and at the edges of the value are dropped; a line starting with `#` is a comment, and only that: a value containing " #" (a space or tab before `#`) is a loud refusal naming the key, code `2` (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md), case 2); `#` without a space before it is part of the value; if a key repeats, the last occurrence wins. The parser is the same in three languages (bash, Python, Node) — `test/stend-nastrojki.sh` checks this and writes its trailing-whitespace fixture line with `printf` plus an insertion check.

Порядок значения: довод или переменная прибора (где предусмотрена) → файл → нейтральное умолчание (где оно есть). Нет ничего — прибор печатает `СЛЕПОТА` или `ОТКАЗ` с именем ключа и выходит с кодом `2`, ничего не делая.

Value order: the tool's argument or variable (where provided) → the file → a neutral default (where there is one). Nothing at all — the tool prints `СЛЕПОТА` or `ОТКАЗ` with the key name and exits with code `2`, doing nothing.

| Ключ · Key | Переменная окружения · Env | Прибор · Tool | Значение · Meaning | Нет значения · No value |
|---|---|---|---|---|
| `WAKE_HOME` | DSH_HOME | `agent-wake-cost` | дом DSH, если нет `--home` и `DSH_HOME` · DSH home if neither `--home` nor `DSH_HOME` | СЛЕПОТА, код 2 |
| `DVOJNIKI_DEREVYA` | DVOJNIKI_DEREVYA | `dvojniki` | деревья поиска тёзок через пробел · namesake search trees, space-separated | СЛЕПОТА, код 2 |
| `ISTORIYA_AGENT` | нет / none | `istoriya-profilya` | агент без довода · agent when no argument | ОТКАЗ, код 2 |
| `ISTORIYA_KATALOG` | нет / none | `istoriya-profilya` | каталог профилей, шаблон с `{agent}` · profiles directory, template with `{agent}` | `$HOME/.dsh/profiles` |
| `KTO_SLUZHBA` | нет / none | `kto-podnimal` | служба без довода · service when no argument | ОТКАЗ, код 2 |
| `KTO_OTKUDA` | нет / none | `kto-podnimal` | разряд «откуда» по юниту: `юнит[\|юнит]=текст;…` · "from where" text per unit | разряд по виду юнита (ssh, служба) · class by unit kind |
| `KTO_ZHURNAL_VOROT` | ZHURNAL_VOROT | `kto-podnimal` | журнал ворот подъёма · start gate log | сверки с воротами нет — СЛЕПОТА, код 2 · no gate check — blindness |
| `KTO_PRAVIL_FAJL` | нет / none | `kto-pravil-fajl` | файл без довода · file when no argument | ОТКАЗ, код 2 |
| `OBEIMI_RUKI` | нет / none | `obeimi-rukami` | известные руки машины для подсказки в отказе · known hands for the refusal hint | подсказка без перечня · hint without a list |
| `OBYORTKA_KATALOG` | нет / none | `obyortka-krasneet` | каталог обхода стендов без довода · stand walk root when no argument | СЛЕПОТА, код 2 |
| `POKRYTIE_KOREN` | нет / none | `pokrytie-ozhidaniem-prob.mjs` | корень обхода стендов без довода · stand walk root when no argument | СЛЕПОТА, код 2 |
| `OBREZKA_IDIOMY`, `OBREZKA_OBLAST` | IDIOMY, OBLAST | `proba-obrezki.sh` | перечень идиом; перечень каталогов обхода · idiom list; walk directory list | СЛЕПОТА, код 2 |
| `OBREZKA_MANIFEST` | MANIFEST_FAJL | `proba-obrezki.sh` | учёт своих файлов (`|путь|`) · own-file ledger | ОСЛАБЛЕНИЕ: все находки идут как свои · WEAKENING: all findings counted as own |
| `OBREZKA_ISKL` | ISKL | `proba-obrezki.sh` | известные исключения · known exceptions | исключений нет · none |
| `PROBA_BEZOPASNYJ` | PROBA_BEZOPASNYJ | `proba-v-katalog` | куда выйти перед удалением · where to step out before removal | `/` |
| `SKILL_LINKS_SOURCES` | SKILL_LINKS_SOURCES | `refresh-skill-links` | источники скиллов через `:`, порядок = приоритет · skill sources, `:`-separated, order = priority | СЛЕПОТА, код 2 (ссылок не трогает) |
| `PS_KATALOG` | PS_KATALOG | `sekrety-po-znacheniyu` | хранилище `pass` · the `pass` store | хранилище не обойдено — СЛЕПОТА · store not walked — blindness |
| `SEKRETY_FAJLY` | нет / none | `sekrety-po-znacheniyu` | файлы с секретами через пробел · secret files, space-separated | только хранилище · store only |
| `FILTR_PUT` | FILTR_PUT | `sekrety-po-znacheniyu` | модуль фильтра секретов (`filtr-vhoda.js` ядра памяти) · secret filter module | СЛЕПОТА, код 2 |
| `UBRAT_KORNI` | нет / none | `ubrat` | разрешённые корни уборки через пробел · allowed cleanup roots | СЛЕПОТА, код 2 |
| `UBRAT_KUDA` | нет / none | `ubrat` | куда советовать уйти, если вызывающий стоял в удалённом · where to advise going | `~` |

```ini
# /etc/dsh-pribory/dsh-pribory.conf — пример; <…> заменить своими путями · example; replace <…> with your paths
KTO_SLUZHBA=<агент>.service
KTO_OTKUDA=claude-oauth-gateway@<агент>.service=изнутри хода агента (юнит шлюза)
UBRAT_KORNI=<дом агента>/workspace/vremennoe
SKILL_LINKS_SOURCES=<полка агента>:<общий набор>
DVOJNIKI_DEREVYA=<дом агента>/workspace /usr/local/lib
```

## Переменные без ключа · Variables without a settings key

| Переменная · Variable | Где · Tool | Умолчание · Default | Договор · Contract |
|---|---|---|---|
| PROGON_UCHYOT | progon | $HOME/workspace/.progon-primeneniya | файл учёта, отказ записи не меняет код команды · accounting file, write failure preserves the command code |
| DVOJNIKI_PATH_KAT | dvojniki | /usr/local/bin /usr/local/sbin | каталоги PATH через пробел · space-separated PATH directories |
| DVOJNIKI_GLUBINA | dvojniki | 4 | предел глубины find · find depth |
| POLOZHIT_SUMMA_PRI_SYOME | polozhit | пусто · empty | прежний MD5; несовпадение —5 до записи · legacy MD5; mismatch —5 before writing |
| POLOZHIT_PROGON / POLOZHIT_CHERNOVIK | polozhit | пусто · empty | явно заданная команда / путь временного файла, который даёт инструмент · explicit command / temporary path supplied by the tool |
| SVOYA_UCHYOTKA | kto-pravil-fajl | id -un | своя учётка в строках sudo · own account in sudo records |
| OBEIMI_KTO | obeimi-rukami | нет · none | обязательная вторая рука; нет допуска sudo — слепота2 · required second account; no sudo authorization — blindness2 |
| SKILL_LINKS_TARGET | refresh-skill-links | $HOME/.claude/skills | настоящий каталог ссылок · real link directory |
| SKILL_LINKS_AGENT | refresh-skill-links | id -un | чьи navyki читать из agent-registry · whose navyki to read from agent-registry |
| NODE | dsh-dump-kopiya | node из PATH · from PATH | исполняемый интерпретатор, не строка флагов · executable interpreter, not a flag string |

Нет OBREZKA_MANIFEST или манифест не читается — все находки идут как свои с предупреждением. Читаемый пустой манифест означает пустой перечень своих файлов; остальные находки названы «вне учёта». Пустой OBREZKA_ISKL не включает фильтр исключений. Неполный обход при отсутствии своих находок даёт слепоту2.

An absent/unreadable OBREZKA_MANIFEST counts every finding as own and warns. A readable empty manifest declares no own files; other findings are named outside the ledger. Empty OBREZKA_ISKL disables the exclusion filter. An incomplete sweep with no own findings returns blindness2.
