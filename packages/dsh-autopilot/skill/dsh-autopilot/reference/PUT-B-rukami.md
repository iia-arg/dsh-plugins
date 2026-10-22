# Путь Б: окно установки Автопилота руками, без `scripts/`

**Что это.** Автопилот поднимается двумя путями (SKILL.md «Два пути»). Путь А — скрипты `scripts/` (`01`…`06`,
`otkat.sh`, `rotaciya-klyucha.sh`, общие функции `obshchee.sh`). Путь Б — этот файл: те же действия в том же порядке
руками root-исполнителя (агента или человека) и оператора. Форма — по решению владельца 15.10 21:46 МСК: шаг —
**Сделать** (одна-три команды или действие словами) → **Результат** (конкретный признак) → **Если не так** (первым —
стоп и разбор, затем что бывает). Исполнитель — думающая модель: сделал, дождался результата, сверил; не сошлось —
остановился и разобрался. Команды — образцы одного действия с подставленными значениями окна, не программа. Строка
`(В пути А: …) [А-…]` в конце шага — где это делает скрипт и номера его действий по описи (Приложение 1).

**Когда брать путь Б.** Скриптов нет или их суммы не сходятся с принятыми (комплект на ходу не чинить); на машине другие
имена и пути, чем в коде, а правка через ворота не успевает (подстановку — в журнал окна); нужно понять, что делает
скрипт, или разобрать его остановку. Иначе путь А точнее и быстрее.

**Что общее с путём А.** Тот же файл параметров (образец `scripts/PARAMS.obrazec.env`; как заполнять — SKILL.md
«Скрипты окна», «Подготовка») и тот же каталог страховки `<SAVE>` с теми же файлами (`operator-*.txt`, `view-before.txt`,
`files/…`, `restore-paths.txt`, `*-before.txt`, `key-timer-wants.absent`, `window-id.txt`, `child-window-ids.txt`,
`smf-result.txt`, `rollback-<id>.json`, `consolidated-aux/`, `posle.json`, `otkat-karantin/`, `window-times.txt`,
`journal-*.txt`, `vow-*-state`) — кроме `env.sh`: его путь Б не пишет. Свои у пути Б — журнал `ZHURNAL-B.txt` и рабочие
списки (`package-new.txt`, `dorabotki-*.txt`, `otkat-*.txt` и др., каждый назван в шаге). «Сверх скрипта» — место, где
путь Б только читает больше или останавливается там, где скрипт прошёл бы молча (сводка — Приложение 4).

## 1. Перед началом

**Обозначения.** `<AP_X>` — значение строки `AP_X` файла параметров, буквально. `<SAVE>` — каталог страховки окна (01-6;
вид `/var/backups/montazh/<AP_TASK>/<UTC>`); `<J>` = `<SAVE>/ZHURNAL-B.txt`; `<ID>` — основное окно монтажа
(`<SAVE>/window-id.txt`); `<CID>` — дочернее окно; `<STAGING>` — временный каталог полки (`<SAVE>/package-new.txt`);
`<AUX>` = `<SAVE>/consolidated-aux`. Постоянные машины (и в скриптах не параметры): `<PKG>` =
`/opt/autopilot/packages/<AP_PACKAGE_HEAD>`, `<KEY>` = `/etc/dsh-autopilot/razdacha-klyuch`, `<UNIT>` =
`dsh-autopilot-razdacha.service`, `<PUB>` = `/srv/autopilot/public`, `<OP>` = `<AP_OPERATOR>`.

**Руки.** root машины приложения (sadik) — одной root-оболочкой `sudo -i` на всё окно. Оператор — своей оболочкой
(`sudo -iu <OP>`) в 03 и 05. Машина входа, метка, учёт — раздел 9.

**Порядок.** Н-1, Н-2 → 01 → 02 (в 02-7 окно монтажа на 30 мин) → 03 → 04 → 05 → Д-1…Д-3 → Д-4 метка → 06 → Д-5 учёт.
Стоп после 02-7, который не разобрать вперёд, — откат (раздел 11). Ротация ключа (раздел 12) — отдельно, первым шагом
перед открытием ap1.

#### Н-1. Файл параметров окна
Сделать: `stat -c '%U %a %F' <файл>`; `grep -vcE '^(#.*|AP_[A-Z0-9_]+=.*|)$' <файл>`; `grep -c '^AP_OBRAZEC=' <файл>`;
`grep '^AP_RUKA=' <файл>`.
Результат: `root 644 regular file` (оператор его тоже читает); `0`; `0`; `AP_RUKA=Имя <имя@машина>` без кавычек (15.10:
`Zabava <zabava@aclaude>`).
Если не так: дальше не идти, исправить файл. Строка без `=` или имя не `AP_*` (и пробел в начале) — скрипт отказал бы
кодом 2. `AP_OBRAZEC` — это образец окна 15.10: скопировать, вписать своё, строку убрать. `AP_RUKA` в кавычках или голым
именем — `smontirovat-fajly` отвергнет её на первом файле 04 (SKILL «Поправки», п.1). Значения буквальны: кавычки станут
частью значения. `AP_PUBLIC_ROOT` из файла не действует — корень всегда `<PUB>`. Скрипт обрывается на первом ненулевом
коде (`set -euo pipefail`, `STOP: …`) — у пути Б то же, правило 1.
(В пути А: obshchee.sh:5, :7, :9–26) [А-ob-01 А-ob-02 А-ob-03 А-ob-04 А-ob-05 А-ob-06 А-ob-07 А-ob-08 А-ob-09 А-ob-10 А-ob-47]

#### Н-2. Одна рука на окно
Сделать: `pgrep -af '(0[1-6]-[a-z-]+|otkat|rotaciya-klyucha)\.sh'`;
`jq -r 'select(.task=="<AP_TASK>" and .phase=="open") | .id' /var/lib/montazh-okna/*.json`; `ls -d <AP_BACKUP_ROOT>/<AP_TASK>/*/`.
Результат: первые две — законно пусто: скрипты пути А не идут, открытых окон задачи нет (дочерние окна SMF несут ту же
задачу). Прежние SAVE задачи закрыты или откачены. Первые две повторить перед 02-7.
Если не так: дальше не идти — окно держит другой процесс или другая рука. Идёт скрипт — ждать и спросить ведущую окна.
Открыто окно задачи — чьё, видно по `actor` в его записи; своё прежнее закрыть или откатить тем путём, каким начато.
Ошибка `jq` — не «пусто». Замка у скриптов Автопилота нет (`/opt/autopilot/.install.lock` — замок установщика на 10 с),
поэтому правило: путь А не запускать, пока у задачи есть незакрытое окно пути Б (SAVE с `ZHURNAL-B.txt`); путь Б не
начинать, пока есть незакрытое окно пути А (SAVE с `env.sh`); путь Б ведёт один исполнитель в одной root-оболочке. По SAVE
пути Б скрипты не пойдут сами: `env.sh` нет, 02/04/06/`otkat.sh` откажут на страже (`obshchee.sh:35`). `env.sh` руками не
создавать никогда: окно пути Б закрывается или откатывается путём Б.
(В пути А: замка нет; страж `env.sh` — obshchee.sh:31–39)

## 2. Общие правила

1. Шаг сделан, когда результат увиден и сошёлся с признаком. Не сошлось — стоп и разбор, следующий шаг не начинать.
   Ненулевой код, который шаг не назвал годным, — стоп.
2. Пустой вывод там, где ждали значение (ID окна, сумма, путь, SHA, строка `ОКНО МОНТАЖА`, коммит метки), — стоп, а не
   успех; ошибка команды-списка — не «пустой список». Где пустое законно, шаг пишет «законно пусто».
3. Что нужно следующему шагу или откату — в файлах `<SAVE>` (`window-id.txt`, `child-window-ids.txt`,
   `restore-paths.txt`, `package-new.txt`, `posle.json`, `<J>`), не в переменных оболочки и не «в памяти». Держать в
   голове только путь `<SAVE>` (найти: `ls -d <AP_BACKUP_ROOT>/<AP_TASK>/*/`).
4. Журнал `<J>` — текстовый файл root 0600, одна строка — одно событие, только дописывать:
   `echo "$(date -u +%FT%TZ) | <шаг> | <итог>" >> <J>`. Итог каждого шага с записью — строкой журнала; затем `tail -1 <J>` —
   ровно она, иначе дальше не идти. Секреты — только `sha256[:16]`; ни `nginx -T`, ни `curl -v` (SKILL, ловушка 33).
5. Ничего не перезаписывать: новое — только на пустое место. Повтор шага, который уже писал (`restore-paths.txt`,
   `posle.json`, `consolidated-aux`, план отката, карантин), — стоп и разбор по журналу.
6. Срок окна: `otkryt` (02-7) даёт 1800 с; `zakryt` (06-9) позже срока вернёт 1 (`/usr/local/sbin/montazh-okno:1144–1152,
   1465–1466`). Ворота метки идут ~13 мин — всё готовить ДО 02-7: параметры, свежую основу реестра
   (`sha256sum /etc/agent-registry/plugins.yaml` перед самым окном), оператора и ведущую дерева на связи.
7. «Файл цел» — только `sha256sum`, `stat`, `cat`. 🔴 Никогда `cp -p <файл> /dev/null`: `-p` переносит владельца и режим
   на `/dev/null`.
8. Ключ раздачи — только приёмом П-2: ни `cat`, ни `xxd`, ни `grep` без `-q`/`-c`. Сверка — `grep -qxF -f <файл-ключа>
   <файл>`; заголовок — только файлом (`-H @файл`) (SKILL «Поправки», п.6).
9. Всё — из root-оболочки: `sudo cmd > x` пишет от агента, `sudo ls /0700/*` раскрывает маску агент. Окружение — одной
   команде (`env VAR=… cmd`): `SMF_REESTR_PL` в сеансе даёт у `smontirovat-fajly` «⚠️ ПОДМЕНА» (`:232–234`).
10. Код снимать сразу: `cmd; echo "код $?"`. В `a && b` неуспех `a` гасится молча — проверять по одной.
11. Ворота длиннее 300 с (`vypusk-tegom` ~13 мин) мост инструментов рвёт — запускать отвязанно (SKILL, ловушка 29).

## 3. Типовые приёмы

#### П-1. Начало root-фазы: каталог окна и журнал
Сделать: `stat -c '%U %a %F %n' <SAVE> <J>`; `ls <SAVE>/env.sh`; `tail -3 <J>`.
Результат: `root 700 directory`, `root 600 regular file`; `env.sh` — «Нет такого файла» (законно); последняя строка — итог
прошлой фазы, который ты помнишь.
Если не так: дальше не идти, разобрать. Не root или запись группе/прочим — кто-то трогал каталог окна (скрипт тут
отказывает: значения окна управляют действиями root); не `chmod` вслепую. Есть `env.sh` — это SAVE пути А (Н-2).
Журнал короче, чем помнишь, — разбор по файлам `<SAVE>`.
(В пути А: obshchee.sh:31–39 `ap_proverit_sostoyanie`) [А-ob-11 А-ob-12 А-ob-13 А-ob-14]

#### П-2. Ключ раздачи — проверка без значения
Сделать: `stat -c '%F %h %U:%G %a' <ключ>`; `grep -cxE '[0-9a-f]{64}' <ключ>`; `wc -c < <ключ>`; `sha256sum <ключ> | cut -c1-16`.
Результат: `regular file 1 root:root 600`; `1`; `64` или `65` (64 строчных hex и необязательный LF); 16 hex —
`key SHA256[:16]`, в журнал.
Если не так: дальше не идти. Ссылка, вторая жёсткая ссылка, иной владелец или режим, base64, заглавные, лишняя строка —
ключ не от установщика (`lib/credential.py`), служба с ним не стартует (ловушка 25). Пустой вывод `sha256sum` — ключа нет.
(В пути А: obshchee.sh:90–100 `ap_klyuch_proverit`) [А-ob-31]

#### П-3. Петля здоровья раздачи
Сделать: одной строкой — `t0=$(date +%s); for i in $(seq 15); do /usr/local/bin/razdacha-zdorova >/dev/null 2>&1 && break; sleep 1; done; echo "за $(( $(date +%s)-t0 )) с"; /usr/local/bin/razdacha-zdorova; echo "код $?"`.
Результат: `за N с`, вывод `razdacha-zdorova`, `код 0`. N — в журнал: замер для следующего окна (предел 15 с назначен, не
замер).
Если не так: дальше не идти. Решает последний вызов: не 0 — раздача нездорова (`systemctl status <UNIT>`,
`journalctl -u <UNIT> -n 50`). Голый вызов сразу после `enable --now`/`restart` даёт `000` — гонка старта, поэтому петля
(SKILL «Поправки», п.2). Что дальше — в шаге, где приём применён (04-5, РК-6).
(В пути А: obshchee.sh:105–111 `ap_zhdat_razdachu`) [А-ob-32 А-ob-33 А-ob-34 А-ob-35]

#### П-4. Сверка учёта доработок
Сделать: `<AP_DORABOTKI> --check > <SAVE>/dorabotki-check.txt 2>&1; echo "код $?"`; при коде 1 —
`sed -n '/^РАСХОЖДЕНИЙ НАЙДЕНО/,$p' <SAVE>/dorabotki-check.txt | sed -nE 's/^[-+][A-Z]\|([^|]+)\|.*/\1/p' | sort -u > <SAVE>/dorabotki-puti.txt`;
`wc -l < <SAVE>/dorabotki-puti.txt`; `grep -vxF -f <AP_P7_PATHS> <SAVE>/dorabotki-puti.txt`.
Результат: код 0 — «учёт сходится»; или код 1, путей N > 0, последняя законно пусто — «расхождений N, все из П7 окна».
Если не так: дальше не идти. Код 1 и N = 0 — расхождение не в файлах (пары, хозяин, вне учёта): причина не в окне. Есть
пути не из П7 — чужое, разбор до закрытия. Код 2 и иной — отказ прибора. `--save` здесь не звать (Д-5). Голый `--check`
под `set -e` обрывал закрытие на законной единице (SKILL «Поправки», п.3).
(В пути А: obshchee.sh:116–129 `ap_dorabotki_svoi`) [А-ob-36 А-ob-37 А-ob-38 А-ob-39 А-ob-40 А-ob-41 А-ob-42]

#### П-5. Личность git из `AP_RUKA`
Сделать: разложить `<AP_RUKA>` (`Имя <почта>`): имя — до ` <`, почта — между `<` и `>`; в коммит только через
`git -c user.name='<имя>' -c user.email='<почта>' …`.
Результат: оба непусты (`Zabava`, `zabava@aclaude`).
Если не так: дальше не идти: `AP_RUKA` не той формы (Н-1). Глобальный `git config` root не трогать; без `-c` коммит учёта
падает (SKILL «Поправки», п.4).
(В пути А: obshchee.sh:132–135 `ap_git_lichnost`) [А-ob-43]

#### П-6. Метка пакета стоит
Сделать: `git -c safe.directory=<AP_TREE_REPO> -C <AP_TREE_REPO> rev-parse -q --verify 'refs/tags/<AP_TAG>^{commit}'; echo "код $?"`.
Результат: 40 hex, `код 0` (15.10: `dsh-autopilot-v0.1.0` на `b15af9f1`).
Если не так: дальше не идти. Пусто и код 1 — метки нет: сперва Д-4, потом 06; правка реестра раньше метки поднимает
тревогу `metki-mimo-vorot-watch` (SKILL «Поправки», п.5). Пустые `AP_TREE_REPO`/`AP_TAG` — заполнить.
(В пути А: obshchee.sh:138–143 `ap_metka_est`) [А-ob-44 А-ob-45 А-ob-46]

**Новый файл — своим дочерним окном `smontirovat-fajly` (SMF): П-7 → П-8 → П-9 → П-10 на файл.** Строка таблицы шага
(04-3, 04-7, 04-9, 04-10) даёт `<ИСТ>`, `<ЦЕЛЬ>`, `<РЕЖИМ>`; `<имя>` — имя файла.

#### П-7. Цель и её каталог
Сделать: `basename` обоих; `stat -c '%F' <ИСТ>`; `ls -ld <ЦЕЛЬ>`; `stat -c '%F %a:%u:%g' $(dirname <ЦЕЛЬ>)`; каталога
нет — `install -d -m 0755 -o root -g root <каталог>`.
Результат: имена равны; `regular file`; цели нет (законно: файл новый); каталог `directory 755:0:0` (или создан таким).
Если не так: дальше не идти. Цель есть или висячая ссылка — нужен отдельный принятый update/join, путь Б его не делает.
Источник — ссылка; каталог не `755:0:0` или ссылка — отказ (скрипт — код 2). Созданный каталог откат уносит, только если
он путь П7 (15.10: все 11 целей 04 в П7, родителей отметил 02-3); вне П7 — назвать в журнале.
(В пути А: obshchee.sh:45–58) [А-ob-15 А-ob-16 А-ob-17 А-ob-18 А-ob-19 А-ob-20]

#### П-8. Прогон SMF
Сделать: `/usr/local/sbin/smontirovat-fajly --punkt <AP_TASK> --ruka '<AP_RUKA>' --progon --osnova <имя>=net --novyj --mode=<РЕЖИМ> --owner=0:0 $(dirname <ИСТ>) $(dirname <ЦЕЛЬ>) <имя>; echo "код $?"`.
Результат: `код 0`; план — ровно один новый файл `<ЦЕЛЬ>`, режим `<РЕЖИМ>`, владелец `0:0`, страховать нечего.
Если не так: дальше не идти. Код 2 — отказ до записи (форма `--ruka`, цель есть, режим с битами 022/6000); код 3
«монтировать нечего» для нового файла невозможен. Прогон ничего не пишет.
(В пути А: obshchee.sh:59–61) [А-ob-21]

#### П-9. Бой, ID дочернего окна, план отката
Сделать: тот же вызов с `--v-boj`: `… > <SAVE>/smf-last.txt; echo "код $?"`; `cat <SAVE>/smf-last.txt >> <SAVE>/smf-result.txt`;
`sed -nE 's/^ОКНО МОНТАЖА: ([0-9a-f]{32});.*/\1/p' <SAVE>/smf-last.txt` → `<CID>`; `echo <CID> >> <SAVE>/child-window-ids.txt`;
`jq -c .subjects /var/lib/montazh-okna/<CID>.json`;
`(set -C; jq -nc --arg t <ЦЕЛЬ> '{subjects:["file:"+$t],checks:[{kind:"absent",path:$t}]}' > <SAVE>/rollback-<CID>.json)`.
Результат: `код 0`; ровно одна строка 32 hex; `subjects` = `["file:<ЦЕЛЬ>"]`; `tail -1 child-window-ids.txt` = `<CID>`;
план лёг.
Если не так: дальше не идти. Нет строки `ОКНО МОНТАЖА` или их две — монтаж мог состояться: разбор по `smf-result.txt`, не
повтор. Для файла вне `derevo` SMF печатает `ОКНО МОНТАЖА: <id>; записи derevo в окне нет … закрыть сразу`
(`smontirovat-fajly:754`); «другие каталоги той же записи derevo — с --okno-id» (`:752`) — в окне есть `entry:`,
`subjects` не сойдутся: нужен принятый join-план. Код ≠ 0 — ID и план отката записать ДО разбора (иначе откат не найдёт
окно). По шапке SMF: 1 — отказ на записи или сверка не сошлась (SMF откатывает сам); 4 — файл лёг, письмо хозяйке
доработок нет; 5 — лёг, коммита учёта нет; при 4/5 окно открыто — решает ведущая (Р-12).
(В пути А: obshchee.sh:62–84) [А-ob-22 А-ob-23 А-ob-24 А-ob-25 А-ob-26 А-ob-27 А-ob-28]

#### П-10. Сверка и закрытие дочернего окна
Сделать: `cmp <ИСТ> <ЦЕЛЬ>; echo "код $?"`; `stat -c '%a %u:%g' <ЦЕЛЬ>`; `/usr/local/sbin/montazh-okno zakryt <CID>; echo "код $?"`;
`jq -r .phase /var/lib/montazh-okna/<CID>.json`.
Результат: `cmp` молчит, код 0; `<РЕЖИМ без ведущего 0> 0:0`; `zakryt` молчит, код 0; `closed`.
Если не так: дальше не идти. Файл лёг не тем — окно не закрывать, откат (раздел 11). `zakryt` код 1 (`НЕ ЗАКРЫТО: …` или
просрочка) — решает ведущая окна.
(В пути А: obshchee.sh:85–86) [А-ob-29 А-ob-30]

## 4. Фаза 01 — предполёт (root)

01-1…01-5 только читают; при обрыве — снова с 01-1. Каталог окна и журнал появляются в 01-6, туда же ложатся итоги 01-1…01-5.

#### 01-1. Начало
Сделать: `sudo -i`; `id -u`; Н-1; `sha256sum <файл параметров>`.
Результат: `0`; Н-1 зелёный; полная сумма файла параметров — для первой строки журнала.
Если не так: дальше не идти: 01, 02, 04, 06 — только от root; Н-1 красный — исправить файл до окна.
(В пути А: 01-predpolyot.sh:5–7) [А-01-01 А-01-02 А-01-03]

#### 01-2. Обязательные параметры
Сделать: `grep -cE '^AP_(TASK|PIN|TGZ|TGZ_SHA|ARCHIVE_STRIP|ROLLBACK_PLAN|PACKAGE_HEAD|BACKUP_ROOT|WINDOW_PLAN|P7_PATHS|ACTOR|VOW_ENV_JSON|RUKA|OPERATOR|ENGINE_SKILLS|AGENT_SERVICE|GATEWAY_SERVICE|MESH_IP|PORT|REMOTE_IP|DOMAIN|PLUGINS_REGISTRY|PLUGINS_CANDIDATE|PLUGINS_BASE_SHA|AGENTS_VERIFY|DORABOTKI)=.+' <файл>`.
Результат: `26`.
Если не так: дальше не идти. Меньше — какой-то пуст или его нет; больше — имя повторено (загрузчик берёт последнее).
Заполнить сейчас и те, что проверяются позже: `AP_LAYOUT_MANIFEST_SHA`, `AP_COUNTER_SHA`, `AP_COUNTER_TARGET`,
`AP_COUNTER_README_TARGET`, `AP_CONTROL_SHA`, `AP_PUBLIC_PATH`, `AP_TREE_REPO`, `AP_TAG`, `AP_USR_LOCAL_FILES`,
`AP_SYSTEMD_FILES` — окно идёт 30 мин.
(В пути А: 01-predpolyot.sh:8–24) [А-01-04 А-01-05 А-01-06 А-01-07 А-01-08 А-01-09 А-01-10 А-01-11 А-01-12 А-01-13 А-01-14 А-01-15 А-01-16 А-01-17 А-01-18 А-01-19 А-01-20]

#### 01-3. Форма PIN, коммита полки, суммы архива; постоянные
Сделать: `grep -cE '^(AP_PIN|AP_PACKAGE_HEAD)=[0-9a-f]{40}$|^AP_TGZ_SHA=[0-9a-f]{64}$' <файл>`; `ls -ld <PKG>`.
Результат: `3`; полки нет (законно; сверх скрипта — иначе откажет 02-13). Постоянные — `<PKG>`, `<KEY>`, `<UNIT>`, `<PUB>`.
Если не так: дальше не идти. Не 3 — короткий SHA, заглавные, пробел в конце. Полка есть — совпадающую путь не принимает
(Р-3): разбор с ведущей до окна.
(В пути А: 01-predpolyot.sh:25–30, :33–35) [А-01-21 А-01-23]

#### 01-4. Свежий upstream `main` = принятый PIN
Сделать: `timeout 30 git ls-remote https://github.com/nick-vels/skills.git refs/heads/main; echo "код $?"`.
Результат: одна строка `<40 hex>	refs/heads/main`, хеш = `<AP_PIN>`, `код 0`.
Если не так: дальше не идти. Пусто или код 124/128 — сеть или предел, а не «main не менялся». Хеш ≠ PIN — `main` ушёл
вперёд: разбор дельты upstream и новый lock через ворота (SKILL «Выбор версии upstream», ловушка 28). Адрес зашит в код (Р-5).
(В пути А: 01-predpolyot.sh:38–41) [А-01-25 А-01-26 А-01-27 А-01-28]

#### 01-5. Сумма архива пакета
Сделать: `sha256sum <AP_TGZ>`.
Результат: = `<AP_TGZ_SHA>` (15.10: `2af4f8f5…`).
Если не так: дальше не идти: архив не тот, что прошёл ворота, — не пересобирать на ходу; «Нет такого файла» — путь неверен.
(В пути А: 01-predpolyot.sh:42) [А-01-29]

#### 01-6. Каталог страховки окна и журнал
Сделать: `date -u +%FT%TZ` → `<UTC>`; `install -d -m 0700 -o root -g root <AP_BACKUP_ROOT>/<AP_TASK>/<UTC>` (это `<SAVE>`);
`(umask 077; set -C; : > <SAVE>/ZHURNAL-B.txt)`; первые строки журнала: начало (путь Б, пункт, `<AP_ACTOR>`), сумма файла
параметров, итоги 01-2…01-5.
Результат: `stat -c '%U %a' <SAVE> <J>` → `root 700`, `root 600`; `tail -5 <J>` — твои строки. Путь `<SAVE>` — себе в
заметки и ведущей окна.
Если не так: дальше не идти. Каталог уже был — взять новое время, чужой не занимать. `/var/tmp`, `/tmp`, `/run` для SAVE не
годятся: здесь страховки отката. SAVE не удалять — он часть окна.
(В пути А: 01-predpolyot.sh:36–37, :43–44) [А-01-24 А-01-30 А-01-31]

#### 01-7. Оператор — не root; снимки учётки и группы
Сделать: `id -u <OP>`; `id -g <OP>`; `getent passwd <OP> > <SAVE>/operator-passwd.txt`; `id <OP> > <SAVE>/operator-id.txt`;
`getent group autopilot-view > <SAVE>/view-before.txt; echo "код $?"`.
Результат: uid и gid ≠ 0; оба файла непусты, в `operator-id.txt` нет `autopilot-view`; `getent group` — код 0 или 2
(группы нет — законно, её создаст установщик в 02-16).
Если не так: дальше не идти. uid/gid 0 — Автопилот от root не работает. Пустой `operator-passwd.txt` — учётки нет.
Оператор уже в `autopilot-view` — установщик откажет: лечить источник членства (ловушка 34). Код 1/3 — ошибка.
(В пути А: 01-predpolyot.sh:45–49) [А-01-32 А-01-33 А-01-34 А-01-35 А-01-36]

#### 01-8. Сухая правка реестра против основы
Сделать: `sha256sum <AP_PLUGINS_REGISTRY>`;
`env PLUGINS_REGISTRY=<AP_PLUGINS_REGISTRY> SMF_REESTR_PL=<AP_PLUGINS_REGISTRY> /usr/local/bin/agent-plugins pravka <AP_PLUGINS_CANDIDATE> --osnova <AP_PLUGINS_BASE_SHA>; echo "код $?"`.
Результат: сумма = `<AP_PLUGINS_BASE_SHA>`; `код 0` (без `--ustanovit` записи нет; реестр не по умолчанию —
«ВНИМАНИЕ: реестр взят из PLUGINS_REGISTRY», `agent-plugins:1609`).
Если не так: дальше не идти. Основа не сошлась — реестр записали после снятия основы: снять заново и через ворота.
Переменные — только этой команде (правило 9). `<AP_PLUGINS_REGISTRY>` не `/etc/agent-registry/plugins.yaml` — 06 запишет
в боевой, а проверен другой (Р-6).
(В пути А: 01-predpolyot.sh:31–32, :50) [А-01-22 А-01-37]

#### 01-9. Итог 01
Сделать: строка журнала «фаза 01 принята; env.sh не пишется»; `ls <SAVE>`.
Результат: `ZHURNAL-B.txt`, `operator-passwd.txt`, `operator-id.txt`, `view-before.txt`; `env.sh` нет.
Если не так: дальше не идти: `env.sh` здесь быть не должно (Н-2) — откуда он; чужие файлы — чьи.
(В пути А: 01-predpolyot.sh:51 — `env.sh`, печать `SAVE=`) [А-01-38]

## 5. Фаза 02 — страховки, окно, полка, установщик (root)

#### 02-1. Начало
Сделать: П-1.
Результат: П-1 зелёный, последняя строка — «фаза 01 принята».
Если не так: дальше не идти: без принятой 01 фазы 02 нет.
(В пути А: 02-polka.sh:4–7) [А-02-01 А-02-02 А-02-03 А-02-04]

#### 02-2. Вход и перечень возврата
Сделать: `ls -l <SAVE>/restore-paths.txt`; `install -d -m 0700 <SAVE>/files`; `test -r <AP_P7_PATHS>; echo "код $?"`;
`{ cat <AP_P7_PATHS>; printf '%s\n' /etc/systemd/system/timers.target.wants/dsh-autopilot-key-check.timer /etc/systemd/system/multi-user.target.wants/<UNIT> /opt/autopilot/.install.lock; } | sort -u > <SAVE>/vhod-02.txt`;
`grep -c '^$' <SAVE>/vhod-02.txt`; `cp <SAVE>/vhod-02.txt <SAVE>/restore-paths.txt`.
Результат: перечня не было; `код 0`; пустых `0`; строк перечня = строк входа (15.10: 199 — три добавочных пути: ссылки
таймера ключа и раздачи, замок установщика `lib/install.py:280` — уже в П7).
Если не так: дальше не идти. Перечень уже есть — 02 уже шёл в этом SAVE: разбор по журналу, может быть, откат. П7 не
читается или с пустой строкой — данные окна битые: к ведущей.
(В пути А: 02-polka.sh:8, :11–20, :54) [А-02-05 А-02-55 А-02-56 А-02-57 А-02-58 А-02-06 А-02-59 А-02-07 А-02-60]

#### 02-3. Новые родители
Сделать: по каждому пути входа подниматься `dirname`, пока звена нет (`[ ! -e x ] && [ ! -L x ]`); каждому такому `<R>`:
`install -d -m 0700 <SAVE>/files$(dirname <R>)`; `: > <SAVE>/files<R>.absent`; `echo <R> >> <SAVE>/restore-paths.txt`.
Цикл по ~200 путям — как удобно.
Результат: на чистой машине — новые родители полки, release и раздачи (`/opt/autopilot`, `/usr/local/libexec/dsh-autopilot`…),
у каждого маркер и строка перечня (повторы законны: перечень читается множеством). Сколько — в журнал.
Если не так: дальше не идти. Пропущенный родитель после отката останется пустым каталогом (замер Гаммы 15.10: 191
отличие у прежнего отката). Родитель — висячая ссылка: откат такой путь не примет (ОТ-5) — разобрать до окна.
(В пути А: 02-polka.sh:21–28) [А-02-61 А-02-62 А-02-63]

#### 02-4. Страховки «до» каждого пути
Сделать: по каждому пути `<P>` входа, `<B>` = `<SAVE>/files<P>`, сперва `install -d -m 0700 $(dirname <B>)`. Пути нет —
`: > <B>.absent`. Файл или ссылка — `cp -a <P> <B>`; `stat -c '%a %u:%g %i %n' <P> >> <SAVE>/metadata-before.txt`; файлу
`sha256sum <P> >> <SAVE>/sums-before.txt`, ссылке `readlink <P> >> <SAVE>/links-before.txt`. Каталог — однострочник ниже
(метаданные и xattr в `<B>.dir-meta.json`, без перезаписи) и та же строка `stat`. Иной вид — стоп.
```
python3 -I -c 'import os,sys,json,stat,base64;p,o=sys.argv[1:];s=os.lstat(p);x={k:base64.b64encode(os.getxattr(p,k,follow_symlinks=False)).decode() for k in os.listxattr(p,follow_symlinks=False)};json.dump({"path":p,"mode":stat.S_IMODE(s.st_mode),"uid":s.st_uid,"gid":s.st_gid,"inode":s.st_ino,"xattr":x},open(o,"x"))' <P> <B>.dir-meta.json
```
Результат: `wc -l < metadata-before.txt` (есть) + `find <SAVE>/files -name '*.absent' | wc -l` (нет) =
`sort -u restore-paths.txt | wc -l`; каталоги в `<SAVE>/files` — 0700 root.
Если не так: дальше не идти. Сокет, устройство, FIFO — разбор, не пропускать. Числа не сходятся — путь без страховки, откат
на нём встанет (ОТ-5): доснять сейчас, пока окно не открыто. `FileExistsError` — шаг уже шёл.
(В пути А: 02-polka.sh:29–53) [А-02-08 А-02-09 А-02-10 А-02-11 А-02-12 А-02-13 А-02-14 А-02-15 А-02-16]

#### 02-5. Снимок юнитов и обратных зависимостей
Сделать: 11 юнитов — `<UNIT>`, `<AP_AGENT_SERVICE>`, `<AP_GATEWAY_SERVICE>`, `dsh-autopilot-key-check`, `montazh-okno-watch`,
`vypusk-okno-watch`, `registry-watchdog` (у четырёх последних — `.service` и `.timer`):
`systemctl show <юниты> -p Id -p LoadState -p ActiveState -p UnitFileState -p FragmentPath -p DropInPaths -p Requires -p RequiredBy -p Wants -p WantedBy -p BindsTo -p BoundBy -p Requisite -p RequisiteOf -p PartOf -p ConsistsOf -p Before -p After -p Triggers -p TriggeredBy -p MainPID >> <SAVE>/units-before.txt`;
по каждому `systemctl list-dependencies --reverse --all <юнит> --no-pager >> <SAVE>/reverse-before.txt`.
Результат: `grep -c '^Id=' <SAVE>/units-before.txt` → `11`; `reverse-before.txt` непуст.
Если не так: дальше не идти: снимок неполон — дописать недостающие.
(В пути А: 02-polka.sh:55–65) [А-02-17 А-02-18 А-02-19]

#### 02-6. Проверяльщика ключа ещё нет
Сделать: `systemctl show dsh-autopilot-key-check.service dsh-autopilot-key-check.timer -p LoadState --value`;
`ls -l /etc/systemd/system/dsh-autopilot-key-check.{service,timer} /etc/systemd/system/timers.target.wants/dsh-autopilot-key-check.timer`;
`: > <SAVE>/key-timer-wants.absent`.
Результат: два `not-found`; трижды «Нет такого файла» (законно); маркер лёг.
Если не так: дальше не идти: это не первичная установка — нужен иной принятый план отката (скрипт с дельты 3 тут тоже
стоп, Р-7).
(В пути А: 02-polka.sh:66–73) [А-02-20 А-02-21 А-02-22 А-02-23 А-02-24]

#### 02-7. Открыть окно монтажа
Сделать: Н-2 ещё раз; `date -u +%FT%TZ` → начало; `: > <SAVE>/child-window-ids.txt`;
`/usr/local/sbin/montazh-okno otkryt --plan <AP_WINDOW_PLAN> --task <AP_TASK> --actor <AP_ACTOR> --ttl 1800 > <SAVE>/window-id.txt; echo "код $?"`;
`cat <SAVE>/window-id.txt`; сразу строка журнала «окно <ID> открыто <начало>, zakryt до <начало + 30 мин>».
Результат: `код 0`; одна строка 32 hex (`montazh-okno:32, :1459`); `jq -r .phase /var/lib/montazh-okna/<ID>.json` → `open`.
План окна — root-owned JSON проверок `file` (путь, sha256, uid, gid, mode) раскладки А (15.10: 118 — полка 42, sources
48, releases 28).
Если не так: дальше не идти. Код ≠ 0 или не 32 hex — `otkryt` вслепую не повторять: сперва `jq` по задаче (Н-2). Окно
открыто, а строка журнала не легла — дописать до любого следующего действия (скрипт ради этого пишет `env.sh` сразу за
окном). С этой строки стоп, не разобранный вперёд, — откат (раздел 11); пошли 30 минут.
(В пути А: 02-polka.sh:74–82) [А-02-25 А-02-26 А-02-27 А-02-28 А-02-64 А-02-29]

#### 02-8. Родительские каталоги полки
Сделать: `namei -l /opt/autopilot/packages`; `install -d -m 0755 -o root -g root /opt/autopilot/packages`;
`stat -c '%a %U:%G %n' /opt/autopilot /opt/autopilot/packages`.
Результат: каждое существующее звено — каталог root без `w` у группы и прочих; затем оба `755 root:root`.
Если не так: дальше не идти. Ссылка, не root, `g+w`/`o+w` — общие каталоги с неожиданными правами не «лечить» (SKILL
«Источник и установщик»). Существующий родитель 0700 `install -d` молча сделает 0755 (Р-14) — увидеть по `namei` до
`install` и спросить ведущую.
(В пути А: 02-polka.sh:83–92) [А-02-30 А-02-31 А-02-32]

#### 02-9. Staging полки
Сделать: `mktemp -d /opt/autopilot/packages/.package-new.XXXXXX > <SAVE>/package-new.txt`; `cat` его → `<STAGING>`;
`install -d -m 0700 <SAVE>/files/opt/autopilot/packages`; `: > <SAVE>/files<STAGING>.absent`;
`echo <STAGING> >> <SAVE>/restore-paths.txt`.
Результат: один путь `/opt/autopilot/packages/.package-new.XXXXXX`, `root 700` (та же ФС, `mv -T` атомарен); маркер есть;
`tail -1 restore-paths.txt` = `<STAGING>`.
Если не так: дальше не идти. Пустой `package-new.txt` — не «создать руками». Без маркера и строки перечня откат staging не
унесёт — дописать сейчас. Руками не удалять.
(В пути А: 02-polka.sh:93–97) [А-02-33 А-02-65 А-02-66]

#### 02-10. Разбор архива до распаковки
Сделать: `tar -tvzf <AP_TGZ> | cut -c1 | sort | uniq -c`; `tar -tzf <AP_TGZ> | grep -cE '^/|(^|/)\.\.(/|$)'`;
`tar -tzf <AP_TGZ> | sed -E 's#/$##' | sort | uniq -d`; при `AP_ARCHIVE_STRIP=1` — `tar -tzf <AP_TGZ> | cut -d/ -f1 | sort -u`
и дубли после снятия первого звена.
Результат: только `-` и `d`; `0`; дублей нет (законно пусто); при strip 1 — один префикс, и он каталог.
Если не так: дальше не идти, откат: ссылка (`l`), жёсткая (`h`), устройство, абсолютный путь, `..`, дубль, два префикса,
strip не 0/1 — архив не принимается (скрипт то же делает python-разбором `tarfile`).
(В пути А: 02-polka.sh:98–115) [А-02-34]

#### 02-11. Распаковка в staging
Сделать: `ls -A <STAGING>`; `sha256sum <AP_TGZ>`; `tar -xzf <AP_TGZ> --strip-components=<AP_ARCHIVE_STRIP> --no-same-owner -C <STAGING>; echo "код $?"`.
Результат: staging законно пуст; сумма = `<AP_TGZ_SHA>` (снова — была пауза); `код 0`; `find <STAGING> -type f | wc -l` > 0.
Если не так: дальше не идти: staging не пуст или сумма другая — кто-то трогал; ошибка `tar` — откат (staging в перечне).
(В пути А: 02-polka.sh:116) [А-02-35]

#### 02-12. `checks`, `razdacha`, `tools` — в страховку окна
Сделать: `ls -ld <AUX>`; `install -d -m 0700 -o root -g root <AUX>`; `stat -c '%F %n' <STAGING>/{checks,razdacha,tools}`;
`mv <STAGING>/checks <STAGING>/razdacha <STAGING>/tools <AUX>/`; `ls <AUX>/*`.
Результат: `<AUX>` не было; три `directory`; `razdacha` — `razdacha.py`, `razdacha-zdorova`,
`dsh-autopilot-razdacha.service`; `checks` — шесть файлов 04-7; `tools` — `measure-run-codex.py`,
`README-measure-run-codex.md`. На полку они не попадают.
Если не так: дальше не идти. `<AUX>` уже есть — шаг шёл. Каталога нет или это ссылка — архив не тот: откат.
(В пути А: 02-polka.sh:117–131) [А-02-36 А-02-37 А-02-38 А-02-39 А-02-40 А-02-41]

#### 02-13. Полка: владелец, права, `mv -T` без перезаписи
Сделать: `chown -R root:root <STAGING>`; `chmod 0755 <STAGING>`; `ls -ld <PKG>`; `mv -T <STAGING> <PKG>`. Сверх скрипта:
`jq -r --arg d <PKG>/ '.checks[]|select(.kind=="file" and (.path|startswith($d)))|"\(.sha256)  \(.path)"' <AP_WINDOW_PLAN> > <SAVE>/plan-polki.txt`;
`sha256sum -c --quiet <SAVE>/plan-polki.txt; echo "код $?"`; `wc -l < <SAVE>/plan-polki.txt`; `find <PKG> -type f | wc -l`.
Результат: полки не было; затем `drwxr-xr-x root root`; сверка молчит, `код 0`; два числа равны и > 0 (15.10: 42 и 42).
Если не так: дальше не идти. Полка есть (и висячей ссылкой) — не перезаписывать (Р-3). Сумма или число не сошлись —
архив и план окна разошлись, `zakryt` 06-9 откажет: откат (полка в П7 и в плане). Иначе ряды полки проверит только
`zakryt` (Р-4).
(В пути А: 02-polka.sh:132–135) [А-02-42 А-02-43 А-02-44 А-02-45]

#### 02-14. `source-lock.json` полки
Сделать: `jq -r '.upstream_sha, .runtime_operator, .local_revision' <PKG>/source-lock.json`;
`grep -c '^/opt/autopilot/releases/<AP_PIN>-<local_revision>/' <AP_P7_PATHS>`.
Результат: `<AP_PIN>`, `<OP>`, `local_revision` (15.10: `a12-b4-c2`); release окна — в журнал; путей release в П7 > 0
(сверх скрипта).
Если не так: дальше не идти, откат. PIN или оператор не те — полка от другого выпуска; `null` — поля нет; release не в
П7 — откат его не покроет.
(В пути А: 02-polka.sh:136–139) [А-02-46 А-02-47 А-02-48]

#### 02-15. `install.sh --dry-run`
Сделать: `DESTDIR=/ bash <PKG>/install.sh --dry-run > <SAVE>/install-dry-run.txt; echo "код $?"`;
`grep -oE ' /[^ ]+' <SAVE>/install-dry-run.txt | sed 's/^ //' | sort -u | grep -vxF -f <AP_P7_PATHS>`.
Результат: `код 0`; адресный план (`lib/install.py:267–273`), ничего не записано, даже замок; последняя законно пусто —
все пути плана в П7.
Если не так: дальше не идти, установщик не звать. Код 2 — отказ (например, оператор в `autopilot-view`); путь вне П7 —
откат его не покроет: разбор, откат.
(В пути А: 02-polka.sh:140) [А-02-49]

#### 02-16. Установка и снимок «после»
Сделать: `DESTDIR=/ bash <PKG>/install.sh; echo "код $?"`; сразу, ничего не делая между, — снимок «после»:
```
python3 -I -c 'import os,sys,json,hashlib,stat;s=sys.argv[1];f=lambda p:None if not os.path.lexists(p) else (lambda t:["link:"+os.readlink(p) if stat.S_ISLNK(t.st_mode) else hashlib.sha256(open(p,"rb").read()).hexdigest() if stat.S_ISREG(t.st_mode) else "vid:"+oct(stat.S_IFMT(t.st_mode)),stat.S_IMODE(t.st_mode),t.st_uid,t.st_gid])(os.lstat(p));P={t:f(t) for t in sorted(set(open(s+"/restore-paths.txt").read().splitlines())-{""}) if os.path.islink(s+"/files"+t) or os.path.isfile(s+"/files"+t)};json.dump(P,open(s+"/posle.json","x"));print("снимок «после»:",len(P),"путей")' <SAVE>
```
Результат: установка `код 0`; N путей; `jq length <SAVE>/posle.json` = N =
`find <SAVE>/files \( -type f -o -type l \) ! -name '*.absent' ! -name '*.dir-meta.json' | wc -l`. Снимок —
`{"<путь>": [<sha256 | link:<цель> | vid:<тип>>, <mode>, <uid>, <gid>]}`, пропавший путь — `null`. Установщик поставил
sources, release, `current`, ссылку скилла, группу `autopilot-view` (если не было), права `<PUB>*` и ключ `<KEY>`
(`root:root 0600`, каталог 0700 — только если файла не было; SKILL «Стык А↔Д — ключ раздачи»).
Если не так: дальше не идти. Код установщика ≠ 0 — снимок НЕ делать (у скрипта его тоже нет): откат примет только «живой
= до», и бывший файл, который установщик успел переписать (`/etc/group`), даст стоп сверки — ручной путь.
`FileExistsError` — снимок уже есть, не перезаписывать. Числа не равны — разбор. Между установкой и снимком — ничего:
чужая правка легла бы в «после» как своя (дельта 4в, условие Вениамина 15.10 19:05Z). `posle.json` не удалять.
(В пути А: 02-polka.sh:141, :144–161) [А-02-50 А-02-67]

#### 02-17. `install.sh --check`
Сделать: `DESTDIR=/ bash <PKG>/install.sh --check; echo "код $?"`; сверх скрипта —
`jq -r '.checks[]|select(.kind=="file")|"\(.sha256)  \(.path)"' <AP_WINDOW_PLAN> | sha256sum -c --quiet -; echo "код $?"`.
Результат: `UNCHANGED: pinned source, release and links match`, `код 0`; сверка всего плана молчит, `код 0` (15.10: 118).
Если не так: дальше не идти. Код 1 и `REPAIR …` — раскладку тронули после установки: разбор, не «повторить установку».
Код 2 — откат.
(В пути А: 02-polka.sh:162) [А-02-51]

#### 02-18. Права корня панелей и группа
Сделать: `stat -c '%a %U:%G %n' <PUB> <PUB>/<OP>`; `getent group autopilot-view`.
Результат: по SKILL «Стык А↔Д — права панелей» — `2751 root:autopilot-view …/public`, `2750 <OP>:autopilot-view …/<OP>`,
`autopilot-view:x:<gid>:` — оператора среди членов нет.
Если не так: дальше не идти: без группы и корня раздача не стартует (ловушка 16); оператор в группе — ошибка прав
(ловушка 27). Скрипт тут только печатает (Р-15).
(В пути А: 02-polka.sh:163–164) [А-02-52 А-02-53]

#### 02-19. Итог 02
Сделать: строка журнала «фаза 02 принята, окно <ID>, zakryt до <время>»; `ls <SAVE>`.
Результат: `files/`, `restore-paths.txt`, `metadata-before.txt`, `units-before.txt`, `reverse-before.txt`,
`key-timer-wants.absent`, `window-id.txt`, пустой `child-window-ids.txt`, `package-new.txt`, `consolidated-aux/`,
`posle.json`; `env.sh` нет.
Если не так: дальше не идти: чего-то нет — шаг 02 не сделан; найти по журналу до 03.
(В пути А: 02-polka.sh:165 — `env.sh`, печать `WINDOW=`) [А-02-54]

## 6. Фаза 03 — контрольный файл (рука оператора, после 02)

#### 03-1. Оператор, не root
Сделать: из root-оболочки `sudo -iu <OP>`; `id -u`; `cat <файл параметров> >/dev/null; echo "код $?"`.
Результат: uid ≠ 0; `код 0`.
Если не так: дальше не идти: от root контрольный файл ляжет не тем владельцем.
(В пути А: 03-operator-kontrol.sh:4–6) [А-03-01 А-03-02 А-03-03]

#### 03-2. Каталог и `state.js` в своём public
Сделать: оператором — `umask 027`; `mkdir <PUB>/<OP>/okno-probe`; `mkdir <PUB>/<OP>/okno-probe/run-probe`;
`(set -C; printf 'window.STATE={"window_probe":true};\n' > <…>/run-probe/state.js.tmp)`; `chmod 0640 <…>/state.js.tmp`;
`mv -T <…>/state.js.tmp <…>/state.js`.
Результат: оба каталога созданы этим шагом; `state.js` есть, `.tmp` нет; путь `<OP>/okno-probe/run-probe/state.js` =
`<AP_PUBLIC_PATH>` (сверх скрипта).
Если не так: дальше не идти. «File exists» — шаг уже шёл (без `exist_ok`): разбор, не удалять. `Permission denied` —
корень `<PUB>/<OP>` не тот (02-18). Путь ≠ `AP_PUBLIC_PATH` — по нему ведётся mesh-проба (Д-2): исправить параметр. Откат
данных панели не трогает (SKILL, раздел 4).
(В пути А: 03-operator-kontrol.sh:7–15) [А-03-04 А-03-05]

#### 03-3. Признак: права и сумма
Сделать: `stat -c '%a %u:%g %n' <…>/run-probe <…>/run-probe/state.js`; `sha256sum <…>/run-probe/state.js`; root — строка журнала.
Результат: `2750 <uid OP>:<gid autopilot-view>` (setgid и группа от `<PUB>/<OP>`), `640 <uid>:<gid>`; сумма =
`<AP_CONTROL_SHA>` (`223f01c6…`, тело постоянно).
Если не так: дальше не идти. `750` без `2` — группа не `autopilot-view`, раздача файл не отдаст. Сумма другая — тело не то.
(В пути А: 03-operator-kontrol.sh:16–19) [А-03-06 А-03-07 А-03-08]

## 7. Фаза 04 — ключ, раздача, проверяльщик ключа, счётчик (root, после 02 и 03)

#### 04-1. Начало
Сделать: П-1.
Результат: зелёный; последняя строка журнала — итог 03.
Если не так: дальше не идти: без 03 порядок окна сбит.
(В пути А: 04-razdacha.sh:5–7) [А-04-01 А-04-02 А-04-03]

#### 04-2. Ключ раздачи
Сделать: П-2 по `<KEY>`.
Результат: зелёный; `key SHA256[:16]` в журнале.
Если не так: дальше не идти: ключ не от установщика — служба не стартует (ловушка 25); ключа нет — 02-16 не доведён.
(В пути А: 04-razdacha.sh:8) [А-04-04]

#### 04-3. Три файла раздачи
Сделать: П-7 → П-10 на каждую строку:

| `<ИСТ>` | `<ЦЕЛЬ>` | `<РЕЖИМ>` |
|---|---|---|
| `<AUX>/razdacha/razdacha.py` | `/usr/local/libexec/dsh-autopilot/razdacha.py` | `0755` |
| `<AUX>/razdacha/razdacha-zdorova` | `/usr/local/bin/razdacha-zdorova` | `0755` |
| `<AUX>/razdacha/dsh-autopilot-razdacha.service` | `/etc/systemd/system/dsh-autopilot-razdacha.service` | `0644` |

Результат: три зелёных П-10; `wc -l < child-window-ids.txt` → `3`.
Если не так: дальше не идти: стоп на том файле, разбор по П-9/П-10.
(В пути А: 04-razdacha.sh:9–11) [А-04-05 А-04-06 А-04-07]

#### 04-4. Проверка юнита, перечитывание, `enable --now`
Сделать: 02-18 и 04-2 зелёные; `systemd-analyze verify /etc/systemd/system/dsh-autopilot-razdacha.service`;
`systemctl daemon-reload`; `systemctl enable --now <UNIT>`.
Результат: `verify` молчит; `Created symlink …/multi-user.target.wants/dsh-autopilot-razdacha.service → …`.
Если не так: дальше не идти. Без группы, корня `2751` или ключа служба уходит в `Restart`, после 10 попыток — `failed`
(ловушка 16). `000` у голого `razdacha-zdorova` сразу после `enable` — гонка старта, дальше 04-5. Откат — раздел 11.
(В пути А: 04-razdacha.sh:12–14) [А-04-08 А-04-09 А-04-10]

#### 04-5. Петля здоровья
Сделать: П-3.
Результат: `за N с`, `код 0`.
Если не так: дальше не идти: не поднялась за 15 с — разбор по П-3, иначе откат (раздел 11).
(В пути А: 04-razdacha.sh:16) [А-04-11]

#### 04-6. Признаки службы
Сделать: `systemctl show <UNIT> -p MainPID -p ActiveState -p DynamicUser -p SupplementaryGroups -p FragmentPath -p DropInPaths`;
`ss -ltnH 'sport = :<AP_PORT>'`; `curl --fail --silent --show-error --max-time 5 http://<AP_MESH_IP>:<AP_PORT>/__zhivoj; echo`.
Результат: `active`, `DynamicUser=yes`, `SupplementaryGroups=autopilot-view`, `FragmentPath=/etc/systemd/system/dsh-autopilot-razdacha.service`,
`DropInPaths=` пусто, `MainPID` ≠ 0; одна строка `LISTEN` на `<AP_MESH_IP>:<AP_PORT>` (15.10: `192.168.99.6:8787`); `zhiv`.
Если не так: дальше не идти. Слушает на `0.0.0.0`/`::` — раздача шире mesh: откат. Drop-in — чужая настройка поверх
юнита: разбор. Свой адрес отдаёт только `/__zhivoj` (SKILL «Служба раздачи»).
(В пути А: 04-razdacha.sh:17–19) [А-04-12 А-04-13 А-04-14]

#### 04-7. Проверяльщик ключа: шесть целей условия (б)
Сделать: `grep -cE '^AP_LAYOUT_MANIFEST_SHA=[0-9a-f]{64}$' <файл параметров>`; П-7 → П-10 на каждую строку:

| `<ИСТ>` | `<ЦЕЛЬ>` | `<РЕЖИМ>` |
|---|---|---|
| `<AUX>/checks/key-check.py` | `/usr/local/libexec/dsh-autopilot/key-check.py` | `0755` |
| `<AUX>/checks/key-health.py` | `/usr/local/libexec/dsh-autopilot/key-health.py` | `0755` |
| `<AUX>/checks/layout-check.py` | `/usr/local/libexec/dsh-autopilot/layout-check.py` | `0755` |
| `<AUX>/checks/layout-expected.json` | `/usr/local/libexec/dsh-autopilot/layout-expected.json` | `0644` |
| `<AUX>/checks/dsh-autopilot-key-check.service` | `/etc/systemd/system/dsh-autopilot-key-check.service` | `0644` |
| `<AUX>/checks/dsh-autopilot-key-check.timer` | `/etc/systemd/system/dsh-autopilot-key-check.timer` | `0644` |

Результат: `1`; шесть зелёных П-10; дочерних окон `9`.
Если не так: дальше не идти. `0` — нет принятой суммы манифеста из реестра, 05-3 нечем проверять. Иначе стоп на том
файле, разбор по П-9/П-10.
(В пути А: 04-razdacha.sh:20–26) [А-04-15 А-04-16 А-04-17 А-04-18 А-04-19 А-04-20 А-04-21]

#### 04-8. Проверяльщик ключа — запуск и таймер
Сделать: `systemd-analyze verify /etc/systemd/system/dsh-autopilot-key-check.{service,timer}`; `systemctl daemon-reload`;
`systemctl start dsh-autopilot-key-check.service`; `systemctl enable --now dsh-autopilot-key-check.timer`;
`systemctl show dsh-autopilot-key-check.service -p User -p Group -p ExecStart -p FragmentPath -p DropInPaths -p ExecMainCode -p ExecMainStatus -p ExecMainExitTimestampMonotonic`;
`systemctl is-active dsh-autopilot-key-check.timer`.
Результат: `verify` молчит; `ExecMainStatus=0`, `FragmentPath=/etc/systemd/system/dsh-autopilot-key-check.service`,
`DropInPaths=` пусто; `active`.
Если не так: дальше не идти. `ExecMainStatus` ≠ 0 — ключ нездоров по проверяльщику: `journalctl -u
dsh-autopilot-key-check.service -n 30`, иначе откат. Проверка ключа — только root-юнитом; sudo-допуск читателю для
`registry-watchdog` не заводить (условие (б)).
(В пути А: 04-razdacha.sh:27–32) [А-04-22 А-04-23 А-04-24 А-04-25 А-04-26 А-04-27]

#### 04-9. Счётчик модели
Сделать: `grep -cE '^AP_COUNTER_(SHA|TARGET)=.+' <файл параметров>`; `sha256sum <AUX>/tools/measure-run-codex.py`; П-7 → П-10:
`<AUX>/tools/measure-run-codex.py` → `<AP_COUNTER_TARGET>` (15.10: `/usr/local/libexec/dsh-autopilot/measure-run-codex.py`), `0755`.
Результат: `2`; сумма = `<AP_COUNTER_SHA>` (`5ee037f3…`); П-10 зелёный.
Если не так: дальше не идти: сумма другая — не тот адаптер (принят точный).
(В пути А: 04-razdacha.sh:33–36) [А-04-28 А-04-29 А-04-30 А-04-31]

#### 04-10. README счётчика
Сделать: `grep -cE '^AP_COUNTER_README_TARGET=.+' <файл параметров>`; П-7 → П-10: `<AUX>/tools/README-measure-run-codex.md`
→ `<AP_COUNTER_README_TARGET>` (15.10: `/usr/local/share/doc/dsh-autopilot/README-measure-run-codex.md`), `0644`.
Результат: `1`; П-10 зелёный; каталог создал П-7.
Если не так: дальше не идти: разбор по П-9/П-10. В git `/usr/local` путь `share/doc/…` закрыт `.gitignore` — в 06-8 `add -f`.
(В пути А: 04-razdacha.sh:37–38) [А-04-32 А-04-33]

#### 04-11. Итог 04
Сделать: `wc -l < <SAVE>/child-window-ids.txt`; `ls <SAVE>/rollback-*.json | wc -l`; строка журнала «фаза 04 принята».
Результат: `11` и `11` (3 раздачи + 6 проверяльщика + 2 счётчика).
Если не так: дальше не идти: ID без плана отката — откат на нём встанет; разбор по `smf-result.txt`.
(В пути А: 04-razdacha.sh:40 — `env.sh`, печать `04-RAZDACHA-OK`) [А-04-34]

## 8. Фаза 05 — проверки обычным читателем (рука оператора, после 04)

#### 05-1. Оператор, не root
Сделать: как 03-1.
Результат: uid ≠ 0, параметры читаются.
Если не так: дальше не идти: смысл фазы — обычный читатель без root.
(В пути А: 05-operator-proverki.sh:4–6) [А-05-01 А-05-02 А-05-03]

#### 05-2. Здоровье ключа без root
Сделать: `/usr/bin/python3 -I -B /usr/local/libexec/dsh-autopilot/key-health.py; echo "код $?"`.
Результат: `код 0` — здоровье видно, ключ не читается.
Если не так: дальше не идти: сверить с 04-8; нет прав на итог проверяльщика — разбор прав, не sudo-допуск оператору.
(В пути А: 05-operator-proverki.sh:7) [А-05-04]

#### 05-3. Раскладка против манифеста реестра
Сделать: `/usr/bin/python3 -I -B /usr/local/libexec/dsh-autopilot/layout-check.py --manifest /usr/local/libexec/dsh-autopilot/layout-expected.json --sha <AP_LAYOUT_MANIFEST_SHA>; echo "код $?"`;
root — строка журнала «05: key-health 0, layout-check 0».
Результат: `код 0`.
Если не так: дальше не идти: раскладка ≠ манифесту — что-то легло не тем или манифест не той версии; разбор до 06.
(В пути А: 05-operator-proverki.sh:8–10) [А-05-05 А-05-06]

## 9. Другие руки (в скриптах этого нет)

Чужая машина или чужая рука (SKILL «Скрипты окна», «Рукой, потому что…»); команды машины входа не выдуманы — они в
названных подразделах SKILL и в пакете Михалыча. Не в этом окне: §7 почта команды — своё окно; §8 пилот (блоки 15–18) —
решает ведущая (подъём юнитов оператора, когда он свободен; шлюз ≥ 3.1.5; срок 02-7 не продлевается; параметры —
`scripts/PARAMS.obrazec.env:68–75`).

#### Д-1. Перенос ключа на vps-ru (блок 7)
Сделать: после 04-6 — Михалычу: служба живая, `key SHA256[:16]`; он переносит `perenos-klyucha.sh` (`dd87092a`) с aclaude,
ssh→ssh, только суммы (SKILL «Вход снаружи», ловушки 13, 33).
Результат: от Михалыча — сумма на vps-ru = журналу, `nginx -t` прошёл.
Если не так: дальше не идти: суммы разошлись — vhost не открывать; без файла ключа лежат ВСЕ сайты vps-ru (ловушка 30).
🔴 Перед открытием ap1 — ротация (раздел 12).
(В пути А: нет — рука машины входа)

#### Д-2. Mesh- и контейнерная пробы (блок 9)
Сделать: Михалыч на vps-ru, по контрольному файлу 03 (`<AP_PUBLIC_PATH>`), заголовок только файлом.
Результат: с ключом файл отдаётся, без ключа 403; из контейнера — таймаут 5 с, счётчик правила `ap1-zapret-konteineram`
растёт.
Если не так: дальше не идти: refused за ~17 мс при стоящем правиле — правило не сработало (ловушка 24); контейнеры с
сетью хоста второй слой не ловит (ловушка 31).
(В пути А: нет — рука машины входа)

#### Д-3. vhost ap1, TLS, `VYKL` (блоки 12, 24–27)
Сделать: Михалыч по PLAN r4: файл ключа ДО vhost, vhost с `VYKL`, пробы.
Результат: без пароля 401, неверный 401, верный 200, чужой путь 404, `VYKL` → 503. Снять `VYKL` — только прямой командой
Александра.
Если не так: дальше не идти, `VYKL` не снимать; `allow`/`deny` по адресу sadik — 403 всем (ловушка 23).
(В пути А: нет — рука машины входа)

#### Д-4. Метка пакета `dsh-autopilot-v<номер>`
Сделать: ведущая дерева своей учёткой по `/var/tmp/dsh-autopilot/TREE-e922054b/TAG-ORDER.md` через `vypusk-tegom` (~13 мин,
отвязанно). Порядок «файлы → метка → правка реестра»: после 04, до 06-4.
Результат: П-6 → 40 hex.
Если не так: дальше не идти: без метки 06 не начинать; срок окна идёт — не успели, решает ведущая.
(В пути А: нет — 06-2 только проверяет)

#### Д-5. `--save` учёта — после закрытия окна
Сделать: рука учёта после 06-12: `<AP_DORABOTKI> --check`, пути как в П-4, сравнить с `<SAVE>/dorabotki-puti.txt`;
совпали — `--save`, затем `--check`.
Результат: те же пути; `--save` и `--check` — `код 0`.
Если не так: дальше не идти, `--save` не звать: новое расхождение — чужое, легшее после сверки; `--save` узаконил бы его
вместе со своим (SKILL «Поправки», п.3).
(В пути А: нет — 06 только печатает подсказку)

## 10. Фаза 06 — закрытие (root, ТОЛЬКО после метки)

#### 06-1. Начало и срок
Сделать: П-1; `date -u +%FT%TZ` против «zakryt до» из строки 02-7.
Результат: зелёный; до срока хватает на 06-4…06-9.
Если не так: дальше не идти: срок прошёл или вот-вот — к ведущей до записи реестра (просроченное окно `zakryt` не закроет).
(В пути А: 06-zakrytie.sh:5–7) [А-06-01 А-06-02 А-06-03]

#### 06-2. Метка стоит
Сделать: П-6.
Результат: 40 hex.
Если не так: дальше не идти: без метки реестр не писать (Д-4).
(В пути А: 06-zakrytie.sh:8) [А-06-04]

#### 06-3. Личность git
Сделать: П-5; имя и почту — в журнал (их берёт 06-8).
Результат: оба непусты.
Если не так: дальше не идти: без личности коммит учёта упадёт.
(В пути А: 06-zakrytie.sh:9) [А-06-05]

#### 06-4. Правка реестра — запись
Сделать: сверх скрипта — `<AP_PLUGINS_REGISTRY>` = `/etc/agent-registry/plugins.yaml` и его сумма = `<AP_PLUGINS_BASE_SHA>`;
`/usr/local/bin/agent-plugins pravka <AP_PLUGINS_CANDIDATE> --osnova <AP_PLUGINS_BASE_SHA> --ustanovit --punkt <AP_TASK>; echo "код $?"`.
Результат: `код 0`.
Если не так: дальше не идти. Отказ по основе — реестр записали после 01-8: разбор, не «снять основу и повторить» без
ворот. Реестр не боевой — скрипт всё равно пишет боевой (Р-6). Эту запись откат (раздел 11) не возвращает — только рукой
по страховке реестра (SKILL раздел 4).
(В пути А: 06-zakrytie.sh:10–11) [А-06-06]

#### 06-5. Установка и оба реестра совпадают с машиной
Сделать: `DESTDIR=/ bash <PKG>/install.sh --check; echo "код $?"`; `/usr/local/bin/agent-plugins verify; echo "код $?"`;
`<AP_AGENTS_VERIFY> verify; echo "код $?"`.
Результат: три `код 0`; `UNCHANGED…`; «реестр совпадает с машиной»; agents — совпадает (SKILL раздел 4).
Если не так: дальше не идти: разошлось после записи — разбор по выводу до закрытия.
(В пути А: 06-zakrytie.sh:12–14) [А-06-07 А-06-08 А-06-09]

#### 06-6. Сверка учёта
Сделать: П-4.
Результат: «сходится» или «расхождений N, все из П7 окна»; `dorabotki-puti.txt` — для Д-5.
Если не так: дальше не идти: чужое расхождение — разбор до закрытия.
(В пути А: 06-zakrytie.sh:15) [А-06-10]

#### 06-7. Сторож выпуска с окружением службы — режим окна
Сделать: `stat -c '%U %a %F' <AP_VOW_ENV_JSON>`;
`jq -e '.schema==1 and (.captured_at_utc|type=="string") and (.commands|type=="array") and .units["vypusk-okno-watch.service"].properties.Id=="vypusk-okno-watch.service" and .units["vypusk-okno-watch.service"].properties.LoadState=="loaded"' <AP_VOW_ENV_JSON>`;
`jq -r '.units["vypusk-okno-watch.service"].configured_environment|to_entries[]|"\(.key)=\(.value)"' <AP_VOW_ENV_JSON> > <SAVE>/vow-env.txt`;
`grep -vc '^VYPUSK_' <SAVE>/vow-env.txt`; `grep -cE '^VYPUSK_(REPO|REESTR)=.+' <SAVE>/vow-env.txt`; `env | grep -c '^VYPUSK_'`;
`env $(cat <SAVE>/vow-env.txt) VYPUSK_TIHO=1 VYPUSK_SOSTOYANIE=<SAVE>/vow-manual-state /usr/local/sbin/vypusk-okno-watch.sh --avto-montazh; echo "код $?"`.
Результат: `root`, без `w` у группы и прочих, `regular file`; `true`; `0`; `2`; `0`; код сторожа 0 или 4 (отсрочка
открытым окном).
Если не так: дальше не идти. Иной код — сторож нашёл не только отсрочку. Окружение — из принятого снимка, не из
`EnvironmentFile` (не shell-файл). Значение с пробелом так не передать — разбор, снимок не править. Свои `VYPUSK_*` в
оболочке — `env -u ИМЯ`. В SKILL раздел 4 инструмент другой (`systemctl start`), смысл тот же (Р-10).
(В пути А: 06-zakrytie.sh:16–36) [А-06-11 А-06-12 А-06-13]

#### 06-8. git-учёт `/usr/local` и `/etc/systemd/system`
Сделать: два прохода — `/usr/local` с `<AP_USR_LOCAL_FILES>`, `/etc/systemd/system` с `<AP_SYSTEMD_FILES>`. В каждом:
`tr '\0' '\n' < <перечень> > <SAVE>/git-<имя>.txt`; `grep -cE '^/|(^|/)\.\.(/|$)|[][*?]' <SAVE>/git-<имя>.txt`;
`git -C <корень> diff --cached --name-only` (до add, сверх скрипта); `git -C <корень> add -f --pathspec-from-file=<перечень> --pathspec-file-nul`;
`git -C <корень> diff --cached --name-only | grep -vxF -f <SAVE>/git-<имя>.txt`;
`git -C <корень> -c user.name='<имя>' -c user.email='<почта>' commit -m '<AP_TASK>: install accepted Autopilot files'` (если
есть staged); `git -C <корень> status --porcelain`; `git -C <корень> rev-parse HEAD`.
Результат: перечень непуст, плохих строк `0`; до add и после add (индекс ⊆ перечню) — законно пусто; коммит (или нечего
коммитить); в `status` нет путей окна; HEAD 40 hex — в журнал.
Если не так: дальше не идти. До add уже staged — чужое (скрипт проверяет только после add, и такой путь ушёл бы в коммит
под личностью окна — Р-9). Чужой путь после add — снять из индекса только его, разбор. Коммит учёта не переписывать,
откат его не трогает. `/opt/agent-plugins` скрипт не учитывает (Р-9) — рукой учёта по слову ведущей.
(В пути А: 06-zakrytie.sh:37–58) [А-06-14 А-06-15 А-06-16 А-06-17 А-06-18 А-06-19 А-06-20 А-06-21 А-06-22]

#### 06-9. Закрыть окно и дочерние окна
Сделать: `/usr/local/sbin/montazh-okno zakryt <ID>; echo "код $?"`; затем `zakryt <CID>` по каждой строке `child-window-ids.txt`.
Результат: молча, `код 0` у всех (дочерние уже закрыты — повтор строго перепроверяет); фаза `<ID>` — `closed`.
Если не так: дальше не идти. `НЕ ЗАКРЫТО: …` — предмет окна изменён: разбор по пути. Код 1 без сообщения после 1800 с —
окно просрочено (`montazh-okno:1144–1152, 1465–1466`); `vosstanovit <id>` (`closed_late`, `:1198, :1487–1500`) — решение
ведущей, не руки.
(В пути А: 06-zakrytie.sh:59–62) [А-06-23 А-06-24]

#### 06-10. Строгий сторож выпуска
Сделать: как запуск 06-7, но `VYPUSK_SOSTOYANIE=<SAVE>/vow-final-state` и без `--avto-montazh`.
Результат: `код 0`.
Если не так: дальше не идти: после закрытия отсрочки быть не должно — разбор по выводу сторожа.
(В пути А: 06-zakrytie.sh:63) [А-06-25]

#### 06-11. Время окна и журналы служб
Сделать: `date -u +%FT%TZ` → конец; `printf '%s\n%s\n' <начало из 02-7> <конец> > <SAVE>/window-times.txt`; для `<UNIT>`,
`<AP_AGENT_SERVICE>`, `<AP_GATEWAY_SERVICE>`, `montazh-okno-watch.service`, `vypusk-okno-watch.service`,
`registry-watchdog.service`: `journalctl -u <служба> --since <начало> --until <конец> -o short-iso --no-pager > <SAVE>/journal-<служба>.txt`.
Результат: `window-times.txt` — две строки; шесть `journal-*.txt`; строка «фаза 06 принята». Тревоги `agent-alert` за окно —
поимённо в отчёт (SKILL раздел 4).
Если не так: дальше не идти: файла нет или `journalctl` отказал — имя службы неверно; журналы — доказательство окна.
(В пути А: 06-zakrytie.sh:64–71) [А-06-26 А-06-27 А-06-28 А-06-29]

#### 06-12. Передать учёт руке учёта
Сделать: строка журнала «дальше рукой учёта (Д-5)»; руке учёта — путь `<SAVE>/dorabotki-puti.txt`.
Результат: рука учёта получила список 06-6.
Если не так: дальше не идти: `--save` внутри окна не звать; руки учёта нет — учёт ждёт её.
(В пути А: 06-zakrytie.sh:72–74) [А-06-30]

## 11. Откат — к состоянию ДО окна (root)

Годится до первого прогона оператора и после обрыва в 02 или 04 (`otkat.sh:6–7`); после прогона — отдельный принятый план
миграции (SKILL раздел 4, ловушка 35). Порядок: сверка без действий (ОТ-3…ОТ-8) → снять службы (ОТ-9) → повторная сверка
(ОТ-10) → возврат (ОТ-11…ОТ-13) → `daemon-reload`, `not-found` (ОТ-14) → `otkat-proveren` детей (ОТ-15) и основного
(ОТ-16). **`mask` не ставится нигде**: службы до окна не было, ссылка `mask` → `/dev/null` — новый предмет против
«отсутствовал» (`otkat.sh:10–11`). SAVE, перечень, снимок и карантин не удалять. Реестр после 06-4 и ключ на vps-ru раздел
не возвращает. Ход возврата — строками `в карантин: …` / `из страховки: …` в `<SAVE>/otkat-vyvod.txt`.

#### ОТ-1. Закрыть вход; доказать «до первого прогона»
Сделать: Михалычу — `VYKL` на vps-ru (`touch /etc/nginx/ap1.insmat.ru.VYKL`), если vhost ap1 поднят; ведущая доказывает,
что прогонов оператора на новом release не было.
Результат: ap1 `/` → 503 (или vhost не поднимался); доказательство — в журнале.
Если не так: дальше не идти: вход не закрыт — не начинать; прогон был — раздел не годится (исправление вперёд или план
миграции).
(В пути А: otkat.sh:5 — до скрипта, рукой входа)

#### ОТ-2. Открывалось ли окно
Сделать: П-1; `cat <SAVE>/window-id.txt`; `grep ' | 02-7 | ' <J>`.
Результат: (а) файла нет — 02 оборвался до первого изменения машины, `jq` по задаче (Н-2) пусто: «откатывать нечего»,
раздел кончен — это успех; (б) одна строка 32 hex, та же, что в 02-7: строка журнала «откат начат, окно <ID>».
Если не так: дальше не идти, разбор рукой: файла нет, а окно задачи открыто; ID ≠ журналу; файл пуст или не 32 hex.
(В пути А: otkat.sh:15–23) [А-otkat-01 А-otkat-02 А-otkat-03 А-otkat-04]

#### ОТ-3. Перечень возврата есть, карантин свободен
Сделать: `stat -c '%F' <SAVE>/restore-paths.txt`; `test -f <SAVE>/child-window-ids.txt || : > <SAVE>/child-window-ids.txt`;
`wc -l < <SAVE>/child-window-ids.txt`; `ls -ld <SAVE>/otkat-karantin`.
Результат: `regular file`; дочерних окон 0…11; карантина нет (законно).
Если не так: дальше не идти. Перечня нет — SAVE до дельты 4: возврат не доказуем, ручной путь (SKILL раздел 4). Карантин
есть — откат уже шёл, возможно наполовину: не повторять, разбор по журналу и `otkat-vyvod.txt`.
(В пути А: otkat.sh:24–29) [А-otkat-05 А-otkat-06 А-otkat-07 А-otkat-08]

#### ОТ-4. Перечень вместе с целями дочерних окон
Сделать: по каждому `<CID>` — `jq -c '[(.checks|length), .checks[0].kind, .checks[0].path]' <SAVE>/rollback-<CID>.json` и
`jq -r '.checks[0].path' … >> <SAVE>/otkat-deti.txt`; `sort -u <SAVE>/restore-paths.txt <SAVE>/otkat-deti.txt | grep -v '^$' > <SAVE>/otkat-puti.txt`.
Результат: у каждого `[1,"absent","<путь>"]`; `otkat-puti.txt` — перечень и цели детей без повторов (число — в журнал).
Если не так: дальше не идти, СТОП до первого действия: план не «один absent» или его нет — ручной путь. Цель вне П7 идёт
в список, но её новый каталог перечень не покрывает — назвать.
(В пути А: otkat.sh:32–46) [А-otkat-09 А-otkat-10 А-otkat-11]

#### ОТ-5. Каждый путь: нормальный, вне SAVE, без ссылок в родителях, со страховкой «до»
Сделать: `grep -vE '^(/[^/]+)+$' <SAVE>/otkat-puti.txt`; `grep -E '/\.\.?(/|$)' …`; `grep -xE '<SAVE>(/.*)?|<предки SAVE>' …`
(на sadik `/var`, `/var/backups`, `/var/backups/montazh`, `…/<AP_TASK>`); затем два однострочника и
`cut -d' ' -f1 <SAVE>/otkat-vidy.txt | sort | uniq -c`:
```
while read -r p; do d=${p%/*}; while [ -n "$d" ]; do [ -L "$d" ] && echo "родитель-ссылка: $p"; d=${d%/*}; done; done < <SAVE>/otkat-puti.txt
while read -r p; do b=<SAVE>/files$p; if [ -f "$b.absent" ]; then k=absent; elif [ -f "$b.dir-meta.json" ]; then k=directory; elif [ -L "$b" ] || [ -f "$b" ]; then k=file; elif grep -qxF -- "$p" <SAVE>/otkat-deti.txt; then k=absent; else k=NET; fi; echo "$k $p"; done < <SAVE>/otkat-puti.txt > <SAVE>/otkat-vidy.txt
```
По каждой `directory <путь>`: `jq -r .path …dir-meta.json` = `<путь>` и `stat -c '%F' <путь>` → `directory`. Цели детей:
`awk '$1!="absent"{print $2}' <SAVE>/otkat-vidy.txt | grep -xF -f <SAVE>/otkat-deti.txt`.
Результат: все `grep` и первый однострочник — законно пусто; виды только `absent`, `file`, `directory` (нет `NET`);
каталоги свои и сейчас каталоги; цели детей все `absent`. Счёт видов — в журнал.
Если не так: дальше не идти, СТОП до первого действия — ручной путь (SKILL раздел 4), разбор по имени пути: не нормальный
или пересекает SAVE; родитель — ссылка; `NET` — «существующее на месте» без страховки; страховка каталога от другого пути
или он сейчас не каталог; цель ребёнка была до окна.
(В пути А: otkat.sh:47–64) [А-otkat-12 А-otkat-13]

#### ОТ-6. План основного окна против страховок
Сделать: `jq -r '.checks[].kind' <AP_ROLLBACK_PLAN> | sort | uniq -c`;
`jq -r '.checks[]|"\(.kind) \(.path)"' <AP_ROLLBACK_PLAN> | grep -vxF -f <SAVE>/otkat-vidy.txt`; для `file` (если есть) —
`jq -r '.checks[]|select(.kind=="file")|"\(.sha256)  <SAVE>/files\(.path)"' <AP_ROLLBACK_PLAN> | sha256sum -c --quiet -`,
страховка не ссылка, `stat -c '%a %u %g'` страховки = `mode` (в плане десятичное), `uid`, `gid`.
Результат: виды только `absent`/`file` (15.10: 118, все `absent`); вторая законно пусто; суммы молчат; метаданные равны.
Если не так: дальше не идти, СТОП до первого действия — ручной путь: путь плана вне перечня; `absent` ↔ «был»; `file` ↔
страховка не файл, ссылка, другая сумма или метаданные; иной вид проверки.
(В пути А: otkat.sh:66–79) [А-otkat-14]

#### ОТ-7. Бывший файл: живой = «до» или = «после»
Сделать: `stat -c '%F %U' <SAVE>/posle.json`; однострочник по всем `file`:
```
python3 -I -c 'import os,sys,json,hashlib,stat;s=sys.argv[1];f=lambda p:None if not os.path.lexists(p) else (lambda t:["link:"+os.readlink(p) if stat.S_ISLNK(t.st_mode) else hashlib.sha256(open(p,"rb").read()).hexdigest() if stat.S_ISREG(t.st_mode) else "vid:"+oct(stat.S_IFMT(t.st_mode)),stat.S_IMODE(t.st_mode),t.st_uid,t.st_gid])(os.lstat(p));P=json.load(open(s+"/posle.json")) if os.path.lexists(s+"/posle.json") else {};F=[l[5:] for l in open(s+"/otkat-vidy.txt").read().splitlines() if l.startswith("file ")];B=[p for p in F if f(p)!=f(s+"/files"+p) and P.get(p,0)!=f(p)];print("file-путей",len(F),"чужая правка",len(B));[print("ЧУЖАЯ ПРАВКА:",p) for p in B]' <SAVE>
```
Результат: `regular file root` (или снимка нет: 02 оборвался до 02-16 — годно только «живой = до», однострочник это
учитывает); `file-путей F чужая правка 0`.
Если не так: дальше не идти, СТОП до первого действия — ручной путь (дельта 4в). `ЧУЖАЯ ПРАВКА: <путь>` — файл правили
поверх окна (учётки соседнего окна в `/etc/group`), байты «до» стёрли бы чужую правку. `posle.json` — ссылка или не
обычный файл — стоп.
(В пути А: otkat.sh:80–97) [А-otkat-33 А-otkat-34]

#### ОТ-8. Итог сверки
Сделать: строка журнала «сверка: путей N {absent a, file f, directory d}; план основного окна M проверок — сходится».
Результат: N = `wc -l < otkat-vidy.txt` = a + f + d; ни одного стопа в ОТ-3…ОТ-7. Ничего не сдвинуто: службы работают,
файлы на месте.
Если не так: дальше не идти: ОТ-9 и дальше НЕ делать; ручной путь (SKILL раздел 4).
(В пути А: otkat.sh:98–100, :125–129 — режим `proverit`) [А-otkat-15 А-otkat-16 А-otkat-22]

#### ОТ-9. Снять службы окна — только загруженные
Сделать: `systemctl show dsh-autopilot-key-check.timer dsh-autopilot-key-check.service <UNIT> -p Id -p LoadState`; у
`loaded` по порядку: `systemctl disable --now dsh-autopilot-key-check.timer`; `systemctl stop dsh-autopilot-key-check.service`;
`systemctl disable --now <UNIT>`; незагруженный — пропустить (после обрыва в 02 юнитов 04 нет).
Результат: `-p ActiveState -p UnitFileState` → `inactive`, `disabled` (у непоставленных `LoadState=not-found`).
Если не так: дальше не идти: служба не останавливается — разбор (`systemctl status`), файлы при живой службе не
возвращать. Оставшуюся enable-ссылку унесёт ОТ-11. `mask` не ставить.
(В пути А: otkat.sh:130–137) [А-otkat-23 А-otkat-24 А-otkat-25 А-otkat-26]

#### ОТ-10. Повторная сверка перед возвратом
Сделать: сразу перед первым переносом — снова ОТ-5 и ОТ-7.
Результат: те же числа, `чужая правка 0`.
Если не так: дальше не идти, СТОП до первого действия: что-то поменялось между сверкой и возвратом — ручной путь.
(В пути А: otkat.sh:138 — `vernut` повторяет сверку) [А-otkat-27]

#### ОТ-11. Новое — в карантин
Сделать: `mkdir -m 0700 <SAVE>/otkat-karantin`;
`awk '$1=="absent"{print $2}' <SAVE>/otkat-vidy.txt | awk -F/ '{print NF"\t"$0}' | sort -rn | cut -f2- > <SAVE>/otkat-absent.txt`
(глубже — раньше); каждый, который есть (или ссылка): `mv -T <путь> <SAVE>/otkat-karantin/<n>-<имя>` (n — сколько уже в
карантине), строка `в карантин: <путь>` в `otkat-vyvod.txt`.
Результат: `mkdir` прошёл; затем `while read -r p; do [ -e "$p" ] || [ -L "$p" ] && echo "ОСТАЛОСЬ: $p"; done < <SAVE>/otkat-absent.txt`
— законно пусто. В карантине (root, не шире 0700) — полка, sources, release, ключ, файлы и юниты раздачи и проверяльщика,
новые каталоги, enable-ссылки, замок установщика, staging.
Если не так: дальше не идти, разбор по `otkat-vyvod.txt`: «File exists» — откат уже шёл; путь остался — повторить только
его. Карантин не удалять и не возвращать из него без решения ведущей.
(В пути А: otkat.sh:101–109) [А-otkat-17 А-otkat-18]

#### ОТ-12. Бывшие файлы и ссылки — из страховки
Сделать: по каждой `file <путь>`: `cp -a <SAVE>/files<путь> <каталог>/.otkat-<имя>`; путь есть —
`mv -T <путь> <SAVE>/otkat-karantin/<n>-<имя>`; `mv -T <каталог>/.otkat-<имя> <путь>`; строка `из страховки: <путь>`.
Результат: у файла `sha256sum` и `stat -c '%a %u:%g'`, у ссылки `readlink` и владелец = страховке; `.otkat-*` не осталось.
Обычно `/etc/group`, `group-`, `gshadow`, `gshadow-` (15.10 — в П7).
Если не так: дальше не идти: лёг не тем — повторить только его и разобрать; `.otkat-*` остался — убрать, когда путь на месте.
(В пути А: otkat.sh:114–123) [А-otkat-20]

#### ОТ-13. Каталоги «до» и итог возврата
Сделать: по каждой `directory <путь>`: `jq -r '"\(.mode) \(.uid) \(.gid)"' <SAVE>/files<путь>.dir-meta.json`;
`chown <uid>:<gid> <путь>`; `chmod $(printf '%o' <mode>) <путь>`; xattr — `jq -c .xattr …` против
`python3 -I -c 'import os,sys;print(os.listxattr(sys.argv[1],follow_symlinks=False))' <путь>`; затем строка
`возвращено путей: N ; карантин: <SAVE>/otkat-karantin` — в `otkat-vyvod.txt` и журнал.
Результат: `stat -c '%a %u %g'` = страховке; xattr `{}` и `[]` (обычно), иначе приведены, как `otkat.sh:112–113`; N =
строк `otkat-vidy.txt`.
Если не так: дальше не идти: права общего каталога (`/etc`, `/usr/local/bin`) не те — машина сломана, разбор.
Содержимое каталога шаг не трогает — его пути в перечне сами.
(В пути А: otkat.sh:110–113, :124) [А-otkat-19 А-otkat-21]

#### ОТ-14. Перечитать systemd; юниты, которых не было, — `not-found`
Сделать: `systemctl daemon-reload`; для `<UNIT>`, `dsh-autopilot-key-check.service`, `.timer` с маркером
`<SAVE>/files/etc/systemd/system/<юнит>.absent` — `systemctl show <юнит> -p LoadState --value`.
Результат: `not-found` у каждого (15.10 — три строки).
Если не так: дальше не идти: иное — где-то ещё файл юнита или drop-in, разбор. Юнит без маркера шаг пропускает, как код.
(В пути А: otkat.sh:139–147) [А-otkat-28 А-otkat-29]

#### ОТ-15. Дочерние окна — `otkat-proveren`
Сделать: по каждому `<CID>`: `/usr/local/sbin/montazh-okno otkat-proveren --plan <SAVE>/rollback-<CID>.json <CID>; echo "код $?"`.
Результат: `код 0`, фаза `rolled_back`. `otkat-proveren` ничего не удаляет — сверяет план по `lstat` и ставит фазу
(`montazh-okno:567–572, :1469–1481, :1493`).
Если не так: дальше не идти: `new file has not been removed: <путь>` — ОТ-11 не унёс цель: разбор рукой.
(В пути А: otkat.sh:148–150) [А-otkat-30]

#### ОТ-16. Основное окно — последним
Сделать: `/usr/local/sbin/montazh-okno otkat-proveren --plan <AP_ROLLBACK_PLAN> <ID>; echo "код $?"`; строка журнала
«окно <ID> откачено, OTKAT-OK».
Результат: `код 0`, `rolled_back`. Раскладку А вернул ОТ-11 по этому же плану, сверенному в ОТ-6.
Если не так: дальше не идти: `НЕ ЗАКРЫТО: …` — разбор по имени пути, повторять только этот шаг.
(В пути А: otkat.sh:151, :153) [А-otkat-31 А-otkat-32]

После отката новая установка — в НОВЫЙ SAVE с 01-1; `unmask` не нужен, П-7 пройдёт. Где «до» не вернётся (SKILL «Дельта
4»): `/etc/.pwd.lock` вне П7 окна 15.10 останется, если его не было; каталог, созданный П-7 для цели вне П7, не покрыт;
живой systemd и настоящий `montazh-okno` в откате не прогонялись — только fake-root прибора Гаммы и стенд.

## 12. Ротация ключа раздачи (root sadik)

Первый шаг перед открытием ap1; сама ap1 не открывает. Порядок (SKILL «Ротация ключа раздачи»): п.1 `VYKL` (Михалыч) →
РК-1…РК-7 (п.3, п.2, перезапуск, часть п.5) → п.4–6 (Михалыч) → РК-8…РК-10 (п.7) → п.8 снятие `VYKL` — только прямой
командой Александра и только после п.1–7 (15.10 нарушено). `<ПУНКТ>` — пункт ротации; `<OLD>` =
`/var/backups/montazh/<ПУНКТ>/razdacha-klyuch.old`; `<ПОЛКА>` — полка пакета; `<JR>` =
`/var/backups/montazh/<ПУНКТ>/zhurnal-rotacii.txt` (root 0600, одна строка — одно событие; у скрипта его нет).

#### РК-1. Пункт, root, полка, страховка свободна
Сделать: `<ПУНКТ>` — латиница, цифры, дефис; `id -u`; `ls -l <ПОЛКА>/install.sh`; `ls -l <OLD>`; от Михалыча — `VYKL` стоит.
Результат: пункт годен; `0`; `install.sh` есть; `<OLD>` нет (законно); ap1 `/` → 503.
Если не так: дальше не идти. `<OLD>` есть — прежняя ротация не закрыта п.7 (сначала РК-8…РК-10). Нет `install.sh` — не
полка. `VYKL` нет — ключ не трогать.
(В пути А: rotaciya-klyucha.sh:9–13, :17–20, :60–61, :65) [А-rot-01 А-rot-02 А-rot-03 А-rot-04 А-rot-06 А-rot-07 А-rot-08 А-rot-09]

#### РК-2. п.3 до всего: обратные зависимости
Сделать: `systemctl show -p RequiredBy -p WantedBy -p BoundBy -p ConsistsOf <UNIT> | sort`.
Результат: ровно `BoundBy=`, `ConsistsOf=`, `RequiredBy=`, `WantedBy=multi-user.target` — набор `[Install]` пакета.
Если не так: дальше не идти: чужая обратная зависимость — разбор ДО ключа (строже SKILL, Р-8).
(В пути А: rotaciya-klyucha.sh:21–24) [А-rot-10]

#### РК-3. Сумма старого ключа, каталог страховки, журнал ротации
Сделать: П-2 по `<KEY>` → `<OLD16>`; `install -d -m 0700 -o root -g root /var/backups/montazh/<ПУНКТ>`;
`(umask 077; set -C; : > <JR>)`; строка `<JR>` «старый ключ sha256[:16] <OLD16>».
Результат: П-2 зелёный; каталог `root 700`; `<JR>` `root 600`, строка легла (сверх скрипта: сумма переживёт обрыв).
Если не так: дальше не идти: ключ не прошёл П-2 — разбор; `<JR>` уже был — прежняя ротация пункта.
(В пути А: rotaciya-klyucha.sh:25, :27) [А-rot-11 А-rot-12]

#### РК-4. п.2: старый в сторону, план, новый ключ
Сделать: подряд, без посторонних пауз — `mv -T <KEY> <OLD>`;
`DESTDIR=/ bash <ПОЛКА>/install.sh --dry-run > /var/backups/montazh/<ПУНКТ>/plan.txt; echo "код $?"`; `cat` плана; при ровно
одной строке `CREATE credential /etc/dsh-autopilot/razdacha-klyuch (root:root 0600)` — `DESTDIR=/ bash <ПОЛКА>/install.sh; echo "код $?"`
и `… --check; echo "код $?"`.
Результат: план — ровно эта строка (`lib/credential.py:24`); установка и `--check` — `код 0`; `stat -c '%U:%G %a' <OLD>` →
`root:root 600` (тот же inode).
Если не так: дальше не идти, но сперва вернуть ключ. Дрейф (иная строка, `REPAIR`, отказ dry-run) — `mv -T <OLD> <KEY>`,
установщик НЕ звать (повторный install шире ключа: чинит права `<PUB>*` и полку — ворота Вениамина 07:26:02Z). Установщик
упал: нового ключа нет — `mv -T <OLD> <KEY>`; есть — не трогать, разбор. Пока ключа нет, проверяльщик (такт 60 с) может
раз покраснеть — ожидаемо. Вернуть старый после успеха — только до `restart` и решением ведущей.
(В пути А: rotaciya-klyucha.sh:28–38) [А-rot-13 А-rot-14 А-rot-15 А-rot-16 А-rot-17]

#### РК-5. Новый ключ ≠ старому
Сделать: П-2 по `<KEY>` → `<NEW16>`; сравнить с `<OLD16>` из `<JR>`; строка `<JR>` «новый <NEW16>».
Результат: обе суммы непусты и различны.
Если не так: дальше не идти: равны — ключ не сменился; пусто — ключа нет. Разбор до `restart`.
(В пути А: rotaciya-klyucha.sh:39–40) [А-rot-18 А-rot-19]

#### РК-6. Перезапуск раздачи и петля
Сделать: `systemctl restart <UNIT>` (ключ берётся через `LoadCredential` при старте); П-3.
Результат: П-3 зелёный (15.10 — ≤1 с).
Если не так: дальше не идти: разбор (`journalctl -u <UNIT> -n 50`); старый ключ в `<OLD>`, вернуть — решением ведущей.
(В пути А: rotaciya-klyucha.sh:41–42) [А-rot-20 А-rot-21]

#### РК-7. Итог смены — Михалычу
Сделать: Михалычу (без значения) `<OLD16>` и `<NEW16>`; его п.4 (`perenos-klyucha.sh`; `.bak` прежнего include — носитель
СТАРОГО ключа для п.6), п.5 (сумма на vps-ru), п.6 (mesh-проба `http://192.168.99.6:8787/`, заголовок файлом).
Результат: п.5 — на vps-ru `<NEW16>`, ≠ `<OLD16>`; п.6 — без ключа 403, со старым 403, с новым не 403. Строки `<JR>`.
Если не так: дальше не идти: суммы разошлись или со старым не 403 — уничтожать рано, разбор с Михалычем; `VYKL` не снимать.
(В пути А: rotaciya-klyucha.sh:43–44) [А-rot-22]

#### РК-8. Признаки п.5–6 получены
Сделать: перечитать `<JR>`.
Результат: строки п.5 и п.6 есть — ручной аналог `--priznaki-5-6-proshli`.
Если не так: дальше не идти: без п.5–6 старый не уничтожать.
(В пути А: rotaciya-klyucha.sh:62–64) [А-rot-05]

#### РК-9. Старый на месте и ≠ живому
Сделать: `id -u`; `stat -c '%F' <OLD>`; П-2 по `<OLD>` и по `<KEY>`.
Результат: `0`; `regular file`; суммы непусты и различны.
Если не так: дальше не идти: равны — старый вернули на место, это не ротация: живой ключ не трогать. `<OLD>` нет — уже
уничтожен или не тот пункт.
(В пути А: rotaciya-klyucha.sh:49–54) [А-rot-23 А-rot-24 А-rot-25 А-rot-26]

#### РК-10. п.7: уничтожить старый
Сделать: `shred -u <OLD>`; `ls -l <OLD>`; строка `<JR>` «старый <OLD16> уничтожен»; Михалычу — уничтожить `.bak` include
с прежним ключом на vps-ru (ВСЕГДА после проверки 403).
Результат: «Нет такого файла»; на vps-ru `.bak` нет, только боевой `/etc/nginx/ap1.insmat.ru.klyuch.conf` (root 600).
`include` в vhost — точный путь, не шаблон: `.bak` он не подключает (и `conf.d/*.conf`, `sites-enabled/*` не захватывают).
Затем п.8 — `VYKL` снимается только прямой командой Александра.
Если не так: дальше не идти: файл остался — повторить `shred -u`; `.bak` не уничтожен — `VYKL` не снимать. Страховка
старому не нужна: он скомпрометирован, возвращать некуда.
(В пути А: rotaciya-klyucha.sh:55–57) [А-rot-27 А-rot-28 А-rot-29]

---

## Приложение 1. Опись действий скриптов

Каждая исполняемая команда, вызов функции, проверка `test`/`[[ ]]`, `: "${…:?}"` и python-вставка девяти скриптов —
отдельное действие; присваивания без побочных действий сгруппированы с соседней командой. Строки кода — по коду дельты 4в
(`567442af`, 15.10; код не менялся). Столбец «шаг Б» — шаг, в чьих скобках `[А-…]` номер стоит.

| А | файл:строка | что делает | шаг Б |
|---|---|---|---|
| А-ob-01 | obshchee.sh:5 | `set -euo pipefail` для всех подключивших | Н-1 |
| А-ob-02 | obshchee.sh:7 | `ap_stop`: «STOP: …» в stderr, выход 2 | Н-1 |
| А-ob-03 | obshchee.sh:10 | `AP_PARAMS` задан, иначе отказ | Н-1 |
| А-ob-04 | obshchee.sh:12,18 | построчное чтение файла параметров, последняя строка без LF тоже | Н-1 |
| А-ob-05 | obshchee.sh:13 | пропуск пустых строк и строк с `#` | Н-1 |
| А-ob-06 | obshchee.sh:14 | строка без `=` → STOP | Н-1 |
| А-ob-07 | obshchee.sh:15–16 | имя до первого `=`, значение буквально; имя не `AP_*` → STOP | Н-1 |
| А-ob-08 | obshchee.sh:17 | присвоить и `export` | Н-1 |
| А-ob-09 | obshchee.sh:19 | непустой `AP_OBRAZEC` → STOP | Н-1 |
| А-ob-10 | obshchee.sh:21–22 | `AP_RUKA` не «Имя <имя@машина>» → STOP | Н-1 |
| А-ob-47 | obshchee.sh:25 | постоянная `AP_PUBLIC_ROOT=/srv/autopilot/public` после файла параметров (дельта 3) | Н-1 |
| А-ob-11 | obshchee.sh:33 | путь SAVE абсолютный | П-1 |
| А-ob-12 | obshchee.sh:34–35 | каталог и `env.sh` существуют | П-1 |
| А-ob-13 | obshchee.sh:36 | владелец — uid 0 | П-1 |
| А-ob-14 | obshchee.sh:37 | нет записи группе и прочим | П-1 |
| А-ob-15 | obshchee.sh:45 | имя источника = имени цели | П-7 |
| А-ob-16 | obshchee.sh:47 | источник — обычный файл, не ссылка; иначе STOP, код 2 (охрана `{ A && B; } ||`) | П-7 |
| А-ob-17 | obshchee.sh:48–51 | цели нет и это не ссылка, иначе STOP «новый файл» | П-7 |
| А-ob-18 | obshchee.sh:52–53 | каталог цели есть → ровно `755:0:0` | П-7 |
| А-ob-19 | obshchee.sh:54–55 | каталога нет → `install -d -m 0755 -o root -g root` | П-7 |
| А-ob-20 | obshchee.sh:56–57 | каталог — ссылка или не каталог → код 2 | П-7 |
| А-ob-21 | obshchee.sh:59–61 | `smontirovat-fajly --progon --novyj --mode --owner=0:0` | П-8 |
| А-ob-22 | obshchee.sh:62–65 | `smontirovat-fajly --v-boj …`, вывод и код запоминаются | П-9 |
| А-ob-23 | obshchee.sh:66,68 | вывод боя дописывается в `smf-result.txt` | П-9 |
| А-ob-24 | obshchee.sh:70 | разбор ID из строки «ОКНО МОНТАЖА: <32 hex>;» | П-9 |
| А-ob-25 | obshchee.sh:71–72 | ID ровно один и 32 hex; иначе STOP, код 2 (охрана `{ A && B; } ||`) | П-9 |
| А-ob-26 | obshchee.sh:73 | ID дописывается в `child-window-ids.txt` | П-9 |
| А-ob-27 | obshchee.sh:74–83 | python: subjects окна = `[file:<цель>]`; план `rollback-<id>.json` с `absent` без перезаписи | П-9 |
| А-ob-28 | obshchee.sh:84 | код боя ≠ 0 → STOP с этим кодом (ID сохранён) | П-9 |
| А-ob-29 | obshchee.sh:85 | `cmp` источника и цели | П-10 |
| А-ob-30 | obshchee.sh:86 | `montazh-okno zakryt <ID>` дочернего окна | П-10 |
| А-ob-31 | obshchee.sh:91–99 | python: ключ обычный, nlink 1, `0:0 0600`, 64 hex ±LF; печать `sha256[:16]` | П-2 |
| А-ob-32 | obshchee.sh:107 | время начала петли | П-3 |
| А-ob-33 | obshchee.sh:108 | до 15 вызовов здоровья раз в 1 с | П-3 |
| А-ob-34 | obshchee.sh:109 | печать фактического времени или «не поднялась за 15 с» | П-3 |
| А-ob-35 | obshchee.sh:110 | последний вызов здоровья решает код | П-3 |
| А-ob-36 | obshchee.sh:118 | `$AP_DORABOTKI --check`, код снимается без `set -e` | П-4 |
| А-ob-37 | obshchee.sh:119–121 | код 0 → «учёт: сходится» | П-4 |
| А-ob-38 | obshchee.sh:122–123 | код не 0/1 → вывод и STOP | П-4 |
| А-ob-39 | obshchee.sh:124 | пути расхождений после «РАСХОЖДЕНИЙ НАЙДЕНО», `sort -u` | П-4 |
| А-ob-40 | obshchee.sh:125 | код 1 без строк расхождений → STOP | П-4 |
| А-ob-41 | obshchee.sh:126–127 | путь не из `AP_P7_PATHS` → STOP | П-4 |
| А-ob-42 | obshchee.sh:128 | итог «расхождений N, все из П7 окна» | П-4 |
| А-ob-43 | obshchee.sh:133–134 | имя и почта git из `AP_RUKA` | П-5 |
| А-ob-44 | obshchee.sh:139 | `AP_TREE_REPO` и `AP_TAG` заданы | П-6 |
| А-ob-45 | obshchee.sh:140–141 | `rev-parse` метки `^{commit}`, нет → STOP | П-6 |
| А-ob-46 | obshchee.sh:142 | печать «метка … стоит» | П-6 |
| А-01-01 | 01-predpolyot.sh:5 | подключить `obshchee.sh` | 01-1 |
| А-01-02 | 01-predpolyot.sh:6 | `ap_zagruzit_params` | 01-1 |
| А-01-03 | 01-predpolyot.sh:7 | `set -euo pipefail` | 01-1 |
| А-01-04 | 01-predpolyot.sh:8 | `AP_TASK`, `AP_PIN` заданы | 01-2 |
| А-01-05 | 01-predpolyot.sh:9 | `AP_TGZ`, `AP_TGZ_SHA` заданы | 01-2 |
| А-01-06 | 01-predpolyot.sh:10 | `AP_ARCHIVE_STRIP` задан | 01-2 |
| А-01-07 | 01-predpolyot.sh:11 | `AP_ROLLBACK_PLAN` задан | 01-2 |
| А-01-08 | 01-predpolyot.sh:12 | `AP_PACKAGE_HEAD`, `AP_BACKUP_ROOT` заданы | 01-2 |
| А-01-09 | 01-predpolyot.sh:13 | `AP_WINDOW_PLAN` задан | 01-2 |
| А-01-10 | 01-predpolyot.sh:14 | `AP_P7_PATHS`, `AP_ACTOR` заданы | 01-2 |
| А-01-11 | 01-predpolyot.sh:15 | `AP_VOW_ENV_JSON` задан | 01-2 |
| А-01-12 | 01-predpolyot.sh:16 | `AP_RUKA` задан | 01-2 |
| А-01-13 | 01-predpolyot.sh:17 | `AP_OPERATOR`, `AP_ENGINE_SKILLS` заданы | 01-2 |
| А-01-14 | 01-predpolyot.sh:18 | `AP_AGENT_SERVICE`, `AP_GATEWAY_SERVICE` заданы | 01-2 |
| А-01-15 | 01-predpolyot.sh:19 | `AP_MESH_IP`, `AP_PORT` заданы | 01-2 |
| А-01-16 | 01-predpolyot.sh:20 | `AP_REMOTE_IP`, `AP_DOMAIN` заданы | 01-2 |
| А-01-17 | 01-predpolyot.sh:21 | `AP_PLUGINS_REGISTRY`, `AP_PLUGINS_CANDIDATE` заданы | 01-2 |
| А-01-18 | 01-predpolyot.sh:22 | `AP_PLUGINS_BASE_SHA` задан | 01-2 |
| А-01-19 | 01-predpolyot.sh:23 | `AP_AGENTS_VERIFY` задан | 01-2 |
| А-01-20 | 01-predpolyot.sh:24 | `AP_DORABOTKI` задан | 01-2 |
| А-01-21 | 01-predpolyot.sh:25–30 | python: PIN и HEAD — 40 hex, сумма архива — 64 hex | 01-3 |
| А-01-22 | 01-predpolyot.sh:31–32 | `export PLUGINS_REGISTRY`, `SMF_REESTR_PL` = живой реестр | 01-8 |
| А-01-23 | 01-predpolyot.sh:33–35 | постоянные: полка, ключ, юнит (`AP_PUBLIC_ROOT` — в загрузчике, ob-47) | 01-3 |
| А-01-24 | 01-predpolyot.sh:36–37 | время документа и путь SAVE | 01-6 |
| А-01-25 | 01-predpolyot.sh:38 | `git ls-remote … refs/heads/main`, предел 30 с | 01-4 |
| А-01-26 | 01-predpolyot.sh:39 | SHA ветки из вывода | 01-4 |
| А-01-27 | 01-predpolyot.sh:40 | ровно одна строка | 01-4 |
| А-01-28 | 01-predpolyot.sh:41 | SHA `main` = `AP_PIN`, иначе STOP | 01-4 |
| А-01-29 | 01-predpolyot.sh:42 | `sha256sum -c` архива | 01-5 |
| А-01-30 | 01-predpolyot.sh:43 | исполнитель — root | 01-6 |
| А-01-31 | 01-predpolyot.sh:44 | `install -d -m 0700 root` каталога SAVE | 01-6 |
| А-01-32 | 01-predpolyot.sh:45 | uid оператора ≠ 0 | 01-7 |
| А-01-33 | 01-predpolyot.sh:46 | gid оператора ≠ 0 | 01-7 |
| А-01-34 | 01-predpolyot.sh:47 | `getent passwd` оператора → `operator-passwd.txt` | 01-7 |
| А-01-35 | 01-predpolyot.sh:48 | `id` оператора → `operator-id.txt` | 01-7 |
| А-01-36 | 01-predpolyot.sh:49 | `getent group autopilot-view` → `view-before.txt`, код 2 годен | 01-7 |
| А-01-37 | 01-predpolyot.sh:50 | `agent-plugins pravka <кандидат> --osnova` — сухая | 01-8 |
| А-01-38 | 01-predpolyot.sh:51 | `declare -p` AP_* → `env.sh`; печать `SAVE=` | 01-9 |
| А-02-01 | 02-polka.sh:4 | подключить `obshchee.sh` | 02-1 |
| А-02-02 | 02-polka.sh:5 | `ap_proverit_sostoyanie <SAVE>` | 02-1 |
| А-02-03 | 02-polka.sh:6 | `set -euo pipefail` | 02-1 |
| А-02-04 | 02-polka.sh:7 | `source env.sh` | 02-1 |
| А-02-05 | 02-polka.sh:8 | `install -d -m 0700 <SAVE>/files` | 02-2 |
| А-02-55 | 02-polka.sh:11–12 | путь перечня возврата `<SAVE>/restore-paths.txt`; уже есть (или ссылка) → STOP (дельта 4) | 02-2 |
| А-02-56 | 02-polka.sh:13 | перечень возврата — пустой файл (дельта 4) | 02-2 |
| А-02-57 | 02-polka.sh:14–16 | три добавочных пути: enable-ссылка таймера ключа (до цикла), enable-ссылка раздачи, замок установщика (дельта 4) | 02-2 |
| А-02-58 | 02-polka.sh:17 | П7 читается, иначе STOP (дельта 4) | 02-2 |
| А-02-06 | 02-polka.sh:18 | цикл по строкам входа (вход и конец цикла — А-02-59) | 02-2 |
| А-02-59 | 02-polka.sh:54 | конец цикла; вход: П7 и три добавочных пути, `sort -u` (дельта 4) | 02-2 |
| А-02-07 | 02-polka.sh:19 | строка непуста | 02-2 |
| А-02-60 | 02-polka.sh:20 | путь → перечень возврата (дельта 4) | 02-2 |
| А-02-61 | 02-polka.sh:22–23,27 | цикл `dirname` вверх, пока родителя нет и это не ссылка (дельта 4) | 02-3 |
| А-02-62 | 02-polka.sh:24–25 | новый родитель: каталог страховки 0700, маркер `<SAVE>/files<родитель>.absent` (дельта 4) | 02-3 |
| А-02-63 | 02-polka.sh:26 | новый родитель → перечень возврата (дельта 4) | 02-3 |
| А-02-08 | 02-polka.sh:29–30 | путь страховки, его каталог 0700 | 02-4 |
| А-02-09 | 02-polka.sh:31 | ветвление: путь есть (или ссылка) / нет | 02-4 |
| А-02-10 | 02-polka.sh:32–39 | каталог → python: метаданные и xattr в `.dir-meta.json` | 02-4 |
| А-02-11 | 02-polka.sh:40–41 | файл или ссылка → `cp -a` | 02-4 |
| А-02-12 | 02-polka.sh:42–43 | иной вид → STOP | 02-4 |
| А-02-13 | 02-polka.sh:45 | `stat` → `metadata-before.txt` | 02-4 |
| А-02-14 | 02-polka.sh:46–47 | файл → `sha256sum` → `sums-before.txt` | 02-4 |
| А-02-15 | 02-polka.sh:48–49 | ссылка → `readlink` → `links-before.txt` | 02-4 |
| А-02-16 | 02-polka.sh:51–52 | пути нет → маркер `.absent` | 02-4 |
| А-02-17 | 02-polka.sh:55–59 | цикл по 11 юнитам | 02-5 |
| А-02-18 | 02-polka.sh:60–63 | `systemctl show` свойств → `units-before.txt` | 02-5 |
| А-02-19 | 02-polka.sh:64 | `list-dependencies --reverse` → `reverse-before.txt` | 02-5 |
| А-02-20 | 02-polka.sh:67,71 | цикл по двум key-юнитам | 02-6 |
| А-02-21 | 02-polka.sh:68 | `LoadState=not-found` | 02-6 |
| А-02-22 | 02-polka.sh:69–70 | файла и ссылки юнита в `/etc/systemd/system` нет, иначе STOP | 02-6 |
| А-02-23 | 02-polka.sh:72 | ссылки таймера в `timers.target.wants` нет, иначе STOP (путь задан в :14, А-02-57) | 02-6 |
| А-02-24 | 02-polka.sh:73 | маркер `key-timer-wants.absent` | 02-6 |
| А-02-25 | 02-polka.sh:74 | время начала окна | 02-7 |
| А-02-26 | 02-polka.sh:75–76 | пустой `child-window-ids.txt` | 02-7 |
| А-02-27 | 02-polka.sh:77–78 | `montazh-okno otkryt --plan --task --actor --ttl 1800` | 02-7 |
| А-02-28 | 02-polka.sh:79 | ID окна → `window-id.txt` | 02-7 |
| А-02-64 | 02-polka.sh:81 | `declare -p` → `env.sh` сразу после окна — откат годен при обрыве дальше (дельта 4) | 02-7 |
| А-02-29 | 02-polka.sh:82 | `AP_P7_PATHS`, `AP_ACTOR` заданы | 02-7 |
| А-02-30 | 02-polka.sh:83 | родительский каталог полки | 02-8 |
| А-02-31 | 02-polka.sh:84–91 | python: звенья — каталоги root без `g+w`/`o+w` | 02-8 |
| А-02-32 | 02-polka.sh:92 | `install -d -m 0755 root` родителя | 02-8 |
| А-02-33 | 02-polka.sh:93 | `mktemp -d .package-new.XXXXXX` рядом с полкой | 02-9 |
| А-02-65 | 02-polka.sh:95–96 | staging: каталог страховки 0700, маркер `<SAVE>/files<staging>.absent` (дельта 4) | 02-9 |
| А-02-66 | 02-polka.sh:97 | staging → перечень возврата (дельта 4) | 02-9 |
| А-02-34 | 02-polka.sh:98–115 | python-разбор архива: пути, виды, дубли, префикс | 02-10 |
| А-02-35 | 02-polka.sh:116 | `tar -xzf --strip-components --no-same-owner` в staging | 02-11 |
| А-02-36 | 02-polka.sh:118 | staging и SAVE заданы | 02-12 |
| А-02-37 | 02-polka.sh:119–120 | `consolidated-aux` ещё нет, иначе STOP | 02-12 |
| А-02-38 | 02-polka.sh:121 | `install -d -m 0700 root` `consolidated-aux` | 02-12 |
| А-02-39 | 02-polka.sh:122–124 | `checks`, `razdacha`, `tools` — каталоги, не ссылки; иначе STOP | 02-12 |
| А-02-40 | 02-polka.sh:125 | `mv` их в `consolidated-aux` | 02-12 |
| А-02-41 | 02-polka.sh:127–130 | пути stage для 04 | 02-12 |
| А-02-42 | 02-polka.sh:132 | `chown -R root:root` staging | 02-13 |
| А-02-43 | 02-polka.sh:133 | `chmod 0755` staging | 02-13 |
| А-02-44 | 02-polka.sh:134 | полки ещё нет, иначе STOP | 02-13 |
| А-02-45 | 02-polka.sh:135 | `mv -T` staging → полка | 02-13 |
| А-02-46 | 02-polka.sh:136–137 | `local_revision` из `source-lock.json`, путь release | 02-14 |
| А-02-47 | 02-polka.sh:138 | `upstream_sha` = `AP_PIN` | 02-14 |
| А-02-48 | 02-polka.sh:139 | `runtime_operator` = `AP_OPERATOR` | 02-14 |
| А-02-49 | 02-polka.sh:140 | `install.sh --dry-run` | 02-15 |
| А-02-50 | 02-polka.sh:141 | `install.sh` | 02-16 |
| А-02-67 | 02-polka.sh:144–161 | python: снимок «после» — по путям перечня возврата со страховкой-файлом или ссылкой `[сумма или link: или vid:, mode, uid, gid]` → `<SAVE>/posle.json` (`x`, без перезаписи); печать числа путей (дельта 4в) | 02-16 |
| А-02-51 | 02-polka.sh:162 | `install.sh --check` | 02-17 |
| А-02-52 | 02-polka.sh:163 | `stat` корня public и раздела оператора | 02-18 |
| А-02-53 | 02-polka.sh:164 | `getent group autopilot-view` | 02-18 |
| А-02-54 | 02-polka.sh:165 | `declare -p` → `env.sh`; печать `WINDOW=` | 02-19 |
| А-03-01 | 03-operator-kontrol.sh:4 | подключить `obshchee.sh` | 03-1 |
| А-03-02 | 03-operator-kontrol.sh:5 | `ap_zagruzit_params` | 03-1 |
| А-03-03 | 03-operator-kontrol.sh:6 | исполнитель — не root | 03-1 |
| А-03-04 | 03-operator-kontrol.sh:7–8 | путь контрольного каталога из `AP_PUBLIC_ROOT` (задаёт загрузчик, ob-47; Р-1 исправлено); `AP_PUBLIC_PATH` перезаписан | 03-2 |
| А-03-05 | 03-operator-kontrol.sh:9–15 | python: umask 027, два каталога 0750, `state.js` через tmp 0640 + rename | 03-2 |
| А-03-06 | 03-operator-kontrol.sh:16 | `stat` каталога и файла | 03-3 |
| А-03-07 | 03-operator-kontrol.sh:17 | `sha256sum` файла | 03-3 |
| А-03-08 | 03-operator-kontrol.sh:19 | сумма = `AP_CONTROL_SHA` | 03-3 |
| А-04-01 | 04-razdacha.sh:5 | подключить `obshchee.sh` | 04-1 |
| А-04-02 | 04-razdacha.sh:6 | `ap_proverit_sostoyanie <SAVE>` | 04-1 |
| А-04-03 | 04-razdacha.sh:7 | `source env.sh` | 04-1 |
| А-04-04 | 04-razdacha.sh:8 | `ap_klyuch_proverit` ключа раздачи | 04-2 |
| А-04-05 | 04-razdacha.sh:9 | `ap_new_file` `razdacha.py` 0755 | 04-3 |
| А-04-06 | 04-razdacha.sh:10 | `ap_new_file` `razdacha-zdorova` 0755 | 04-3 |
| А-04-07 | 04-razdacha.sh:11 | `ap_new_file` юнит раздачи 0644 | 04-3 |
| А-04-08 | 04-razdacha.sh:12 | `systemd-analyze verify` юнита раздачи | 04-4 |
| А-04-09 | 04-razdacha.sh:13 | `systemctl daemon-reload` | 04-4 |
| А-04-10 | 04-razdacha.sh:14 | `systemctl enable --now` раздачи | 04-4 |
| А-04-11 | 04-razdacha.sh:16 | `ap_zhdat_razdachu razdacha-zdorova` | 04-5 |
| А-04-12 | 04-razdacha.sh:17 | `systemctl show` свойств раздачи | 04-6 |
| А-04-13 | 04-razdacha.sh:18 | `ss -ltnH` порта | 04-6 |
| А-04-14 | 04-razdacha.sh:19 | `curl /__zhivoj` по mesh | 04-6 |
| А-04-15 | 04-razdacha.sh:20 | stage проверяльщика и SHA манифеста заданы | 04-7 |
| А-04-16 | 04-razdacha.sh:21 | `ap_new_file` `key-check.py` 0755 | 04-7 |
| А-04-17 | 04-razdacha.sh:22 | `ap_new_file` `key-health.py` 0755 | 04-7 |
| А-04-18 | 04-razdacha.sh:23 | `ap_new_file` `layout-check.py` 0755 | 04-7 |
| А-04-19 | 04-razdacha.sh:24 | `ap_new_file` `layout-expected.json` 0644 | 04-7 |
| А-04-20 | 04-razdacha.sh:25 | `ap_new_file` `dsh-autopilot-key-check.service` 0644 | 04-7 |
| А-04-21 | 04-razdacha.sh:26 | `ap_new_file` `dsh-autopilot-key-check.timer` 0644 | 04-7 |
| А-04-22 | 04-razdacha.sh:27 | `systemd-analyze verify` key-юнитов | 04-8 |
| А-04-23 | 04-razdacha.sh:28 | `systemctl daemon-reload` | 04-8 |
| А-04-24 | 04-razdacha.sh:29 | `systemctl start dsh-autopilot-key-check.service` | 04-8 |
| А-04-25 | 04-razdacha.sh:30 | `systemctl enable --now` таймера | 04-8 |
| А-04-26 | 04-razdacha.sh:31 | `systemctl show` key-check (статус выхода) | 04-8 |
| А-04-27 | 04-razdacha.sh:32 | `systemctl is-active` таймера | 04-8 |
| А-04-28 | 04-razdacha.sh:33 | источник и SHA счётчика заданы | 04-9 |
| А-04-29 | 04-razdacha.sh:34 | цель счётчика задана | 04-9 |
| А-04-30 | 04-razdacha.sh:35 | `sha256sum -c` счётчика | 04-9 |
| А-04-31 | 04-razdacha.sh:36 | `ap_new_file` счётчика 0755 | 04-9 |
| А-04-32 | 04-razdacha.sh:37 | источник и цель README заданы | 04-10 |
| А-04-33 | 04-razdacha.sh:38 | `ap_new_file` README 0644 | 04-10 |
| А-04-34 | 04-razdacha.sh:40 | `declare -p` → `env.sh`; `04-RAZDACHA-OK` | 04-11 |
| А-05-01 | 05-operator-proverki.sh:4 | подключить `obshchee.sh` | 05-1 |
| А-05-02 | 05-operator-proverki.sh:5 | `ap_zagruzit_params` | 05-1 |
| А-05-03 | 05-operator-proverki.sh:6 | исполнитель — не root | 05-1 |
| А-05-04 | 05-operator-proverki.sh:7 | `key-health.py` обычным читателем | 05-2 |
| А-05-05 | 05-operator-proverki.sh:8 | SHA манифеста задан | 05-3 |
| А-05-06 | 05-operator-proverki.sh:9–10 | `layout-check.py --manifest --sha` | 05-3 |
| А-06-01 | 06-zakrytie.sh:5 | подключить `obshchee.sh` | 06-1 |
| А-06-02 | 06-zakrytie.sh:6 | `ap_proverit_sostoyanie <SAVE>` | 06-1 |
| А-06-03 | 06-zakrytie.sh:7 | `source env.sh` | 06-1 |
| А-06-04 | 06-zakrytie.sh:8 | `ap_metka_est` | 06-2 |
| А-06-05 | 06-zakrytie.sh:9 | `ap_git_lichnost` | 06-3 |
| А-06-06 | 06-zakrytie.sh:10–11 | `agent-plugins pravka --ustanovit --punkt` | 06-4 |
| А-06-07 | 06-zakrytie.sh:12 | `install.sh --check` | 06-5 |
| А-06-08 | 06-zakrytie.sh:13 | `agent-plugins verify` | 06-5 |
| А-06-09 | 06-zakrytie.sh:14 | `$AP_AGENTS_VERIFY verify` | 06-5 |
| А-06-10 | 06-zakrytie.sh:15 | `ap_dorabotki_svoi` | 06-6 |
| А-06-11 | 06-zakrytie.sh:18–34 | `ap_vow`: python-проверка снимка окружения и запуск `vypusk-okno-watch.sh` | 06-7 |
| А-06-12 | 06-zakrytie.sh:35 | `ap_vow vow-manual-state window`, код снимается | 06-7 |
| А-06-13 | 06-zakrytie.sh:36 | годны только коды 0 и 4 | 06-7 |
| А-06-14 | 06-zakrytie.sh:37 | перечни git-учёта заданы | 06-8 |
| А-06-15 | 06-zakrytie.sh:38–39 | цикл по двум корням git | 06-8 |
| А-06-16 | 06-zakrytie.sh:40 | перечень — файл | 06-8 |
| А-06-17 | 06-zakrytie.sh:42 | `git add -f --pathspec-from-file --pathspec-file-nul` | 06-8 |
| А-06-18 | 06-zakrytie.sh:43 | `git diff --cached --name-only` | 06-8 |
| А-06-19 | 06-zakrytie.sh:44–52 | python: индекс ⊆ перечню, иначе STOP | 06-8 |
| А-06-20 | 06-zakrytie.sh:53–55 | `commit` с `-c user.name/-c user.email`, если есть staged | 06-8 |
| А-06-21 | 06-zakrytie.sh:56 | `git status --porcelain` | 06-8 |
| А-06-22 | 06-zakrytie.sh:57 | `git rev-parse HEAD` | 06-8 |
| А-06-23 | 06-zakrytie.sh:59 | `montazh-okno zakryt` окна | 06-9 |
| А-06-24 | 06-zakrytie.sh:60–62 | `zakryt` каждого дочернего окна | 06-9 |
| А-06-25 | 06-zakrytie.sh:63 | `ap_vow vow-final-state strict` | 06-10 |
| А-06-26 | 06-zakrytie.sh:64 | время конца окна | 06-11 |
| А-06-27 | 06-zakrytie.sh:65 | `window-times.txt` | 06-11 |
| А-06-28 | 06-zakrytie.sh:66–70 | `journalctl` шести служб за окно → `journal-*.txt` | 06-11 |
| А-06-29 | 06-zakrytie.sh:71 | `06-ZAKRYTIE-OK` | 06-11 |
| А-06-30 | 06-zakrytie.sh:74 | подсказка: `--check`, затем `--save` рукой | 06-12 |
| А-otkat-01 | otkat.sh:15 | подключить `obshchee.sh` | ОТ-2 |
| А-otkat-02 | otkat.sh:16 | `ap_proverit_sostoyanie <SAVE>` | ОТ-2 |
| А-otkat-03 | otkat.sh:17 | `source env.sh` | ОТ-2 |
| А-otkat-04 | otkat.sh:19–23 | нет `window-id.txt` → «откатывать нечего», `OTKAT-OK`, код 0 | ОТ-2 |
| А-otkat-05 | otkat.sh:24 | `AP_RESTORE_PATHS` задан (SAVE по дельте 4), иначе отказ | ОТ-3 |
| А-otkat-06 | otkat.sh:25 | перечень = `<SAVE>/restore-paths.txt`, иначе STOP | ОТ-3 |
| А-otkat-07 | otkat.sh:26–27 | `AP_CHILD_IDS` по умолчанию в SAVE; нет файла → пустой | ОТ-3 |
| А-otkat-08 | otkat.sh:28–29 | карантин `<SAVE>/otkat-karantin` ещё не существует, иначе STOP | ОТ-3 |
| А-otkat-09 | otkat.sh:32–37,125 | `ap_vozvrat <режим>`: python с перечнем, ID детей, планом окна, карантином; `stop` → код 2 | ОТ-4 |
| А-otkat-10 | otkat.sh:38–39 | перечень — обычный файл, не ссылка; пути множеством | ОТ-4 |
| А-otkat-11 | otkat.sh:41–46 | план каждого дочернего окна — ровно один `absent`, иначе STOP; цели — в множество | ОТ-4 |
| А-otkat-12 | otkat.sh:47–52 | путь абсолютный, нормальный, не `/`; не пересекает SAVE; родитель не ссылка — иначе STOP | ОТ-5 |
| А-otkat-13 | otkat.sh:53–64 | вид страховки: `.absent` / `.dir-meta.json` (тот же путь, сейчас каталог) / файл или ссылка / цель ребёнка; иначе STOP «существующее на месте»; цель ребёнка, бывшая до окна, — STOP | ОТ-5 |
| А-otkat-14 | otkat.sh:66–79 | план основного окна: путь в перечне; `absent` ↔ отсутствовал; `file` ↔ сумма и `mode`/`uid`/`gid` страховки; иной вид — STOP | ОТ-6 |
| А-otkat-33 | otkat.sh:83–92 | `sost` — состояние `[сумма или link: или vid:, mode, uid, gid]`; `posle.json` ссылка или не обычный файл → STOP; нет снимка — пустой (дельта 4в) | ОТ-7 |
| А-otkat-34 | otkat.sh:93–97 | каждый `file` перечня: живой = «до» (страховка) или = записи `posle.json`, иначе STOP «чужая правка, ручной путь» — до действия, в обоих режимах (дельта 4в) | ОТ-7 |
| А-otkat-15 | otkat.sh:98–99 | печать «перечень возврата: N путей {…} ; план основного окна: M проверок — сходится» | ОТ-8 |
| А-otkat-16 | otkat.sh:100 | режим `proverit` → выход 0 без действий | ОТ-8 |
| А-otkat-17 | otkat.sh:101–105 | `mkdir` карантина 0700; перенос в карантин под номером `<n>-<имя>` | ОТ-11 |
| А-otkat-18 | otkat.sh:107–109 | обход глубже — раньше; `absent` → в карантин | ОТ-11 |
| А-otkat-19 | otkat.sh:110–113 | каталог «до» → владелец, режим, xattr из `.dir-meta.json` | ОТ-13 |
| А-otkat-20 | otkat.sh:114–123 | файл/ссылка → нынешнее в карантин, страховка через temp + `os.replace` с владельцем и режимом | ОТ-12 |
| А-otkat-21 | otkat.sh:124 | печать «возвращено путей: N ; карантин: …» | ОТ-13 |
| А-otkat-22 | otkat.sh:129 | `ap_vozvrat proverit` — сверка до первого действия | ОТ-8 |
| А-otkat-23 | otkat.sh:131–134 | `ap_snyat`: `systemctl show UNIT -p LoadState --value` = `loaded` → `systemctl <действие>`, иначе «пропускаю» | ОТ-9 |
| А-otkat-24 | otkat.sh:135 | `disable --now` таймера проверяльщика ключа | ОТ-9 |
| А-otkat-25 | otkat.sh:136 | `stop` службы проверяльщика ключа | ОТ-9 |
| А-otkat-26 | otkat.sh:137 | `disable --now` раздачи | ОТ-9 |
| А-otkat-27 | otkat.sh:138 | `ap_vozvrat vernut` — повторная сверка и возврат | ОТ-10 |
| А-otkat-28 | otkat.sh:139 | `systemctl daemon-reload` | ОТ-14 |
| А-otkat-29 | otkat.sh:141–147 | юниты с маркером `.absent` → `LoadState=not-found`, иначе STOP; `mask` нет | ОТ-14 |
| А-otkat-30 | otkat.sh:148–150 | `otkat-proveren` каждого дочернего по `rollback-<id>.json` | ОТ-15 |
| А-otkat-31 | otkat.sh:151 | `otkat-proveren --plan AP_ROLLBACK_PLAN` основного окна — последним | ОТ-16 |
| А-otkat-32 | otkat.sh:153 | `OTKAT-OK` | ОТ-16 |
| А-rot-01 | rotaciya-klyucha.sh:9 | подключить `obshchee.sh` | РК-1 |
| А-rot-02 | rotaciya-klyucha.sh:10–12 | постоянные: ключ, юнит, ожидаемая строка плана | РК-1 |
| А-rot-03 | rotaciya-klyucha.sh:13 | `ap_summa16`: `ap_klyuch_proverit` → 16 hex | РК-1 |
| А-rot-04 | rotaciya-klyucha.sh:60–61 | `smenit` с 2 аргументами, пункт `[A-Za-z0-9-]` → `ap_smenit` | РК-1 |
| А-rot-05 | rotaciya-klyucha.sh:62–64 | `unichtozhit-staryj <пункт> --priznaki-5-6-proshli` → `ap_unichtozhit` | РК-8 |
| А-rot-06 | rotaciya-klyucha.sh:65 | иные аргументы → STOP | РК-1 |
| А-rot-07 | rotaciya-klyucha.sh:17 | smenit: root | РК-1 |
| А-rot-08 | rotaciya-klyucha.sh:18 | есть `<полка>/install.sh` | РК-1 |
| А-rot-09 | rotaciya-klyucha.sh:19–20 | страховки старого ключа ещё нет | РК-1 |
| А-rot-10 | rotaciya-klyucha.sh:22–24 | обратные зависимости ровно пакетные | РК-2 |
| А-rot-11 | rotaciya-klyucha.sh:25 | сумма старого ключа | РК-3 |
| А-rot-12 | rotaciya-klyucha.sh:27 | `install -d -m 0700 root` каталога страховки | РК-3 |
| А-rot-13 | rotaciya-klyucha.sh:28 | `mv -T` ключа в страховку | РК-4 |
| А-rot-14 | rotaciya-klyucha.sh:29 | план `install.sh --dry-run` | РК-4 |
| А-rot-15 | rotaciya-klyucha.sh:30–33 | план ≠ одной строке → вернуть старый, STOP | РК-4 |
| А-rot-16 | rotaciya-klyucha.sh:34–37 | установщик упал → вернуть старый, если нового нет; STOP | РК-4 |
| А-rot-17 | rotaciya-klyucha.sh:38 | `install.sh --check` | РК-4 |
| А-rot-18 | rotaciya-klyucha.sh:39 | сумма нового ключа | РК-5 |
| А-rot-19 | rotaciya-klyucha.sh:40 | новый ≠ старому | РК-5 |
| А-rot-20 | rotaciya-klyucha.sh:41 | `systemctl restart` раздачи | РК-6 |
| А-rot-21 | rotaciya-klyucha.sh:42 | `ap_zhdat_razdachu` | РК-6 |
| А-rot-22 | rotaciya-klyucha.sh:43–44 | печать сумм и следующих пунктов | РК-7 |
| А-rot-23 | rotaciya-klyucha.sh:49 | unichtozhit: root | РК-9 |
| А-rot-24 | rotaciya-klyucha.sh:50–51 | старый ключ — файл в страховке | РК-9 |
| А-rot-25 | rotaciya-klyucha.sh:53 | суммы старого и живого | РК-9 |
| А-rot-26 | rotaciya-klyucha.sh:54 | обе прочитаны и различны | РК-9 |
| А-rot-27 | rotaciya-klyucha.sh:55 | `shred -u` старого | РК-10 |
| А-rot-28 | rotaciya-klyucha.sh:56 | старого нет | РК-10 |
| А-rot-29 | rotaciya-klyucha.sh:57 | печать «уничтожен» | РК-10 |

## Приложение 2. Функции `obshchee.sh` ↔ приёмы и шаги Б

| функция | obshchee.sh | действия | приём Б | где зовётся в пути А | шаги Б, где применён |
|---|---|---|---|---|---|
| `set -euo pipefail`, `ap_stop` | :5, :7 | ob-01, ob-02 | Н-1, общее правило 1 | все скрипты | все шаги |
| `ap_zagruzit_params` | :9–26 | ob-03…10, ob-47 | Н-1 | 01:6, 03:5, 05:5 | 01-1, 03-1, 05-1 |
| `ap_proverit_sostoyanie` | :31–39 | ob-11…14 | П-1 (журнал `ZHURNAL-B.txt` вместо `env.sh`) | 02:5, 04:6, 06:6, otkat:16 | 02-1, 04-1, 06-1, ОТ-2 |
| `ap_new_file` | :42–87 | ob-15…30 | П-7 → П-8 → П-9 → П-10 | 04:9–11, 21–26, 36, 38 | 04-3, 04-7, 04-9, 04-10 |
| `ap_klyuch_proverit` | :90–100 | ob-31 | П-2 | 04:8; rot:13 (через `ap_summa16`) | 04-2, РК-3, РК-5, РК-9 |
| `ap_zhdat_razdachu` | :105–111 | ob-32…35 | П-3 | 04:16, rot:42 | 04-5, РК-6 |
| `ap_dorabotki_svoi` | :116–129 | ob-36…42 | П-4 | 06:15 | 06-6, Д-5 |
| `ap_git_lichnost` | :132–135 | ob-43 | П-5 | 06:9 | 06-3, 06-8 |
| `ap_metka_est` | :138–143 | ob-44…46 | П-6 | 06:8 | 06-2, Д-4 |

## Приложение 3. Признак полноты

`F` — этот файл, `S` — каталог `scripts/` рядом со скиллом. Обе проверки — только чтение; `F` можно подменить копией
(так делается проба порчей).

**Срез 1.** Множество номеров описи (Приложение 1) = множеству номеров в скобках `[А-…]` шагов (текст до Приложения 1),
и пары (номер, «шаг Б» описи) = пары (номер, шаг, в чьих скобках он стоит). Ожидается: обе разности пусты, пары
расходятся 0.
```bash
F=${F:-/opt/iskra/workspace/kandidaty/autopilot-skripty/wt011/packages/dsh-autopilot/skill/dsh-autopilot/reference/PUT-B-rukami.md}
python3 -I - "$F" <<'PY'
import re,sys
t=open(sys.argv[1],encoding='utf-8').read(); i1=t.index('\n## Приложение 1.'); i2=t.index('\n## Приложение 2.')
o=set(re.findall(r'^\| (А-[0-9a-z]+-[0-9]+) \| [^|]+ \| .* \| ([^ |]+) \|$',t[i1:i2],re.M)); s=set(); cur=None
for l in t[:i1].splitlines():
    h=re.match(r'^#### (\S+)\. ',l); cur=h.group(1) if h else cur
    for g in re.findall(r'\[(А-[^\]]*)\]',l): s.update((a,cur) for a in re.findall(r'А-[0-9a-z]+-[0-9]+',g))
ao={a for a,_ in o}; as_={a for a,_ in s}
print('опись',len(ao),'строк описи',len(re.findall(r'^\| А-',t[i1:i2],re.M)),'в скобках шагов',len(as_))
print('в описи, нет в шагах:',sorted(ao-as_)); print('в шагах, нет в описи:',sorted(as_-ao))
print('пар (А, шаг): опись',len(o),'шаги',len(s),'расходятся',len(o^s),sorted(o^s))
PY
```

**Срез 2.** Каждая исполняемая строка девяти скриптов стоит в диапазоне `файл:строки` ровно одной строки описи. Не
считаются исполняемыми: пустые строки, комментарии, шебанг, объявления `local`, заголовки функций `имя() {` и одиночные
`}`, `fi`, `else`, `done`, `esac`. Тела python-вставок входят в диапазон своего действия. Строка под двумя действиями —
тоже отказ: вынутое из описи действие она бы спрятала. Ожидается: без действия 0, под двумя 0.
```bash
F=${F:-/opt/iskra/workspace/kandidaty/autopilot-skripty/wt011/packages/dsh-autopilot/skill/dsh-autopilot/reference/PUT-B-rukami.md}
S=${S:-/opt/iskra/workspace/kandidaty/autopilot-skripty/wt011/packages/dsh-autopilot/skill/dsh-autopilot/scripts}
python3 -I - "$F" "$S" <<'PY'
import re,sys,os
md,sd=sys.argv[1:]; t=open(md,encoding='utf-8').read(); opis=t[t.index('\n## Приложение 1.'):t.index('\n## Приложение 2.')]; cov={}
for a,f,rng in re.findall(r'^\| (А-[0-9a-z]+-[0-9]+) \| ([0-9a-z-]+\.sh):([0-9,–]+) \|',opis,re.M):
    for part in rng.split(','):
        x,_,y=part.partition('–')
        for n in range(int(x),int(y or x)+1): cov.setdefault((f,n),[]).append(a)
skip=re.compile(r'^\s*($|#|local\b|[a-z_0-9]+\(\) \{\s*$|(\}|fi|else|done|esac)\s*$)'); vsego=0; bez=[]; dvoe=[]
for f in ['obshchee.sh','01-predpolyot.sh','02-polka.sh','03-operator-kontrol.sh','04-razdacha.sh','05-operator-proverki.sh','06-zakrytie.sh','otkat.sh','rotaciya-klyucha.sh']:
    k=0
    for n,l in enumerate(open(os.path.join(sd,f),encoding='utf-8'),1):
        if skip.match(l): continue
        k+=1
        if (f,n) not in cov: bez.append('%s:%d %s'%(f,n,l.strip()[:60]))
        elif len(cov[(f,n)])>1: dvoe.append('%s:%d %s'%(f,n,' '.join(cov[(f,n)])))
    vsego+=k; print(f,k)
print('исполняемых строк',vsego,'без действия описи',len(bez),'под двумя действиями',len(dvoe)); print('\n'.join(bez+dvoe))
PY
```
Итог на дату записи (код дельты 4в `567442af`, 15.10; файл — форма «сделать → результат → если не так»). Срез 1: опись 293
номера (ob 47, 01 38, 02 67, 03 8, 04 34, 05 6, 06 30, otkat 34, rot 29), строк описи 293, в скобках шагов 293; обе
разности пусты; пар 293 и 293, расходятся 0. Срез 2: 547 исполняемых строк (obshchee 81, 01 47, 02 142, 03 15, 04 34,
05 7, 06 60, otkat 118, rot 43), без действия 0, под двумя 0. Проба порчей на копии: без строки описи А-02-62 срез 2
называет `02-polka.sh:24` и `:25`, без А-otkat-34 — `otkat.sh:93–97`, без А-ob-31 — `obshchee.sh:91–99`; срез 1 в каждом
случае называет вынутый номер в «в шагах, нет в описи» и одну расходящуюся пару; номер, вынутый из скобок шага (А-02-62),
срез 1 называет в «в описи, нет в шагах». После возврата — снова 0.

Номера устойчивы: новое действие получает следующий номер своего скрипта (ob-47 — дельта 3; 02-55…02-66 — дельта 4;
02-67, otkat-33…34 — дельта 4в). Правка скрипта и этого файла — одним тактом, полнота — заново (SKILL «Два пути»).

## Приложение 4. Расхождения кода со скиллом (и где путь Б строже)

- **Р-1.** `03:7` — `AP_PUBLIC_ROOT` не был задан у оператора: исправлено дельтой 3 (загрузчик, `obshchee.sh:23–25`).
  Остаётся: `03:8` перезаписывает `AP_PUBLIC_PATH` и не читает его — сверка с параметром у пути Б (03-2).
- **Р-2.** Откат не возвращал «до» (дельта 3: 191 отличие, 23 → 212 путей — `mask` → `/dev/null`, раскладка А, NSS
  `/etc/group*`): исправлено дельтой 4 (перечень возврата, сверка до действия, `not-found` без `mask`; прибор Гаммы
  `probe.py` `1a87ae08` 5/5, стенд `stend-otkat-iskra.py` 9/9) и 4в (`567442af`: снимок «после», живой ∈ {до, после},
  иначе стоп; проба с чужой строкой в `/etc/group` — прежний стёр, новый код 2). Путь Б — раздел 11, 02-2/3/7/9/16.
  Остаётся: `/etc/.pwd.lock` вне П7; каталог цели ребёнка вне П7; живой systemd и `montazh-okno` в откате не прогонялись.
- **Р-3.** `02:134` — существующая полка всегда стоп, SKILL допускает «точное совпадение 34/34». Путь Б видит раньше (01-3).
- **Р-4.** Сверки staging «34/34» в 02 нет (только `01:42` и `02:98–115`; ряды проверит `zakryt`). Путь Б — 02-13, 02-17.
- **Р-5.** `01:38` — адрес upstream зашит; SKILL — «из `source-lock.json`».
- **Р-6.** `01:31–32` даёт реестр только сухой правке, `06:10` пишет в боевой (`agent-plugins:84,91`). Путь Б — стоп в 01-8, 06-4.
- **Р-7.** `a && b` под `set -e` — исправлено дельтой 3 (`02:69–70, :72, :120, :123–124`, `obshchee.sh:47, :71–72`).
  Путь Б проверяет по одной (правило 10).
- **Р-8.** Ротация: п.3 до п.2 (`rot:21–24`), набор зависимостей строже SKILL, «новый ≠ старому» до `restart`
  (`:39–41`), `install -d -m 0700` вместо `mkdir -p`. Путь Б — порядок скрипта и журнал ротации (РК-2…РК-6).
- **Р-9.** git `/opt/agent-plugins` (SKILL раздел 4) в 06 нет; комментарий `06:41` «проверен до add» неверен — проверка
  `:44–52` после `add`. Путь Б проверяет и до (06-8).
- **Р-10.** Сторож выпуска: SKILL — `systemctl start vypusk-okno-watch.service`; 06 — сам скрипт с окружением снимка
  (`06:18–34, 63`). Смысл тот же (06-7, 06-10).
- **Р-11.** SKILL раздел 4: `--check` → 0; поправка 3 и `06:15` законно принимают 1 со своими путями (П-4).
- **Р-12.** Коды 4/5 SMF (`obshchee.sh:84`) — стоп при открытом дочернем окне; что дальше, SKILL не говорит: по журналу,
  не повтор, решает ведущая (П-9).
- **Р-13.** Срок окна 1800 с (`02:77–78`) в SKILL среди причин стопа не назван; после срока `zakryt` (`06:59`) — код 1.
  Путь Б — правило 6, 06-1, 06-9.
- **Р-14.** `02:92` `install -d -m 0755` на существующем родителе сделает его 0755 (по устройству coreutils, пробой не
  проверено), проверка `:84–91` ловит только `g+w`/`o+w`. Путь Б — `namei` до `install` (02-8).
- **Р-15.** `02:163–164` только печатают права public и группу. Путь Б сверяет (02-18).
