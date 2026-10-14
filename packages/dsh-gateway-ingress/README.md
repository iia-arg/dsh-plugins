Английская версия: [README.en.md](README.en.md) · ниже — русский текст

# dsh-gateway-ingress — входной узел шлюзов sadik

**Версия:** 3.1.2

Служебный софт sadik: при загрузке собирает правила nft «кто из учёток может звать какой шлюз» из реестра агентов
(`/etc/agent-registry/agents.yaml`) и списка дополнительных вызывающих (`/etc/dsh-gateway/allowed-callers.json`) и
ставит их с откатом; разовый установщик ключей входа.

Пакет служебный (группа Д): публикуется исходниками, без npm, после общих ворот секретов (`vorota-obezlichivaniya`).
**Временное правило (Вениамин, 07.10.2026):** пока у новых пакетов нет читателя «бой ↔ метка», любой файл пакета
меняется только вместе с новым номером пакета в том же окне.

Пакет — исходники без `package.json`: `libexec/` повторяет пути под `/usr/local/`, юнит — в `systemd/`
(под `/etc/systemd/system/`). Номер — заголовок CHANGELOG и метка `dsh-gateway-ingress-v<номер>`. Перенос с боя:
сумма каждого файла в дереве равна сумме боя.

Знаменатель снят с диска 07.10.2026: в `/usr/local/libexec/dsh-gateway-ingress/` ровно 4 файла (ключей и
созданных правил там нет), у юнита drop-in нет, юнитов вне пакета, исполняющих его файлы, нет.

## Файлы

git хранит только признак «исполняемый», поэтому режим и владелец на диске — в таблице (снято `stat` боя 07.10.2026).

| файл в пакете | путь на диске | кто зовёт | режим | владелец:группа |
|---|---|---|---|---|
| `libexec/dsh-gateway-ingress/boot.sh` | `/usr/local/libexec/dsh-gateway-ingress/boot.sh` | dsh-gateway-ingress.service (oneshot при загрузке) | 755 | root:root |
| `libexec/dsh-gateway-ingress/create-keys.py` | `/usr/local/libexec/dsh-gateway-ingress/create-keys.py` | рука root (разовый установщик ключей; существующие не заменяет) | 755 | root:root |
| `libexec/dsh-gateway-ingress/manage.sh` | `/usr/local/libexec/dsh-gateway-ingress/manage.sh` | boot.sh (apply); рука root (rollback) | 755 | root:root |
| `libexec/dsh-gateway-ingress/render.py` | `/usr/local/libexec/dsh-gateway-ingress/render.py` | boot.sh | 755 | root:root |
| `systemd/dsh-gateway-ingress.service` | `/etc/systemd/system/dsh-gateway-ingress.service` | systemd (WantedBy, при загрузке) | 644 | root:root |

Назначение файлов (по коду):
- `boot.sh` — собрать правила (`render.py`) и поставить их (`manage.sh apply`). Снимок прежних правил `manage.sh` пишет
  во временный каталог `/run/dsh-gateway-ingress/load-…`, а `boot.sh` удаляет этот каталог сразу после применения:
  после запуска службы или `reload` снимка на диске нет (см. ниже, как откатывать).
- `render.py` — правила nft из реестра агентов и `allowed-callers.json`. Ворота стоят на выходе через `lo` к ЛЮБОМУ
  адресу этой машины (`oifname "lo" fib daddr type local tcp dport @ports`, обе семьи адресов; с 1.0.4). Прежде — только
  к `127.0.0.0/8` и `::1`, и шлюз, слушающий `0.0.0.0`, был доступен местному вызывающему через внутренний или
  публичный адрес в обход проверки учётки.
- `manage.sh` — установщик правил: `apply` или `rollback` (только root, три довода).
- `create-keys.py` — разовый установщик ключей; значения не печатает, существующие не заменяет.

## Зависимости

- Программы: bash, python3 (модуль `yaml`), nft, systemctl.
- Реестр агентов `/etc/agent-registry/agents.yaml`, `/etc/dsh-gateway/allowed-callers.json`, ключи входа — в пакет не входят.

## Файл допуска `/etc/dsh-gateway/allowed-callers.json`

По умолчанию порт шлюза агента открыт только root и учётке самого агента (поле `polzovatel` реестра). Файл допуска
лишь ДОБАВЛЯЕТ вызывающих, сузить доступ им нельзя. Формат (по `render.py`) — объект JSON: ключ — имя агента
(`imya` записи реестра, у которой есть `raskladka.port_shlyuza`), значение — список записей с учёткой и доводом:

```json
{
  "<агент>": [
    {"user": "<учётка вызывающего>", "reason": "<зачем ей этот шлюз>"}
  ]
}
```

`render.py` падает, и правила не собираются, если: файл не JSON; JSON не объект или значение агента не список
объектов (с 1.0.4 — `ValueError` с именем файла и ожидаемым видом, прежде — трасса `AttributeError`); запись без `reason` или с пустым `reason`; учётки
`user` нет на машине; ключ — агент, которого нет в реестре или у которого нет порта шлюза. Нет файла вовсе — не ошибка:
пустой допуск и строка `WARNING` в журнале (с 1.0.3).

Правка файла применяется только `systemctl reload dsh-gateway-ingress`. Ошибка в файле при `reload`: `boot.sh`
выходит до `manage.sh apply`, правила остаются прежними, `reload` возвращает ненулевой код. Та же ошибка, не замеченная
до перезагрузки машины, валит службу при загрузке, а с ней — все шлюзы с `Requires=dsh-gateway-ingress`. Поэтому после
каждой правки — `reload` и проверка его кода, а не ожидание загрузки.

## Ключи входа шлюзов (`create-keys.py`)

Шлюз читает свой ключ из файла, названного в его юните переменной `GATEWAY_INGRESS_KEY_FILE`; на sadik это
`/etc/dsh-gateway/ingress/<агент>.key`. Создать недостающие ключи (только root):

```bash
sudo /usr/local/libexec/dsh-gateway-ingress/create-keys.py --registry /etc/agent-registry/agents.yaml --directory /etc/dsh-gateway/ingress
```

Оба довода обязательны, каталог — абсолютный путь. Каталог создаётся при нужде (0755); он обязан принадлежать root и
не быть доступным на запись группе и прочим, иначе отказ. Для каждого агента реестра с портом шлюза пишется
`<агент>.key`: 64 шестнадцатеричных знака, 0600, владелец — учётка агента. Существующий ключ не заменяется: если он
не обычный файл, владелец не тот или режим не 0600 — отказ с именем агента. Значения не печатаются; итог — строки
`<агент>: private ingress key created` или `<агент>: есть, не трогаю`. Код 0 — все агенты пройдены; отказ — код 1 и
причина одной строкой (ключи агентов, пройденных до отказа, уже созданы).

## Установка и снятие (руками root)

Установка файла: `install -o root -g root -m <режим из таблицы> <файл в пакете> <путь на диске>`; в бою — через
`smontirovat-fajly` по воротам. Юнит: в `/etc/systemd/system/`, `systemctl daemon-reload`, `systemctl enable dsh-gateway-ingress`.
При установке создать `/etc/dsh-gateway/allowed-callers.json` с `{}` (root:root 0644), если его нет: без файла до 1.0.3 `render.py` падал и гасил все шлюзы с `Requires=`; с 1.0.3 нет файла — пустой допуск (порт шлюза открыт только root и учётке агента) и строка `WARNING` в журнале ingress (B-N-1869). Битый файл (не JSON, запись без `reason`, неизвестный агент или учётка) по-прежнему роняет `render.py`, а с ним службу и шлюзы с `Requires=`.
Перерисовать правила (новый агент, порт, `allowed-callers.json`, замена `render.py` или `boot.sh`) — `systemctl reload dsh-gateway-ingress` (с 1.0.2): правила собирает `boot.sh` при запуске, новый `render.py` без `reload` в силу не вступит. 🔴 НЕ
`restart`/`stop`: `Requires=` шлюзов переносит их на ВСЕ шлюзы машины (B-N-1850). Признак: код `reload` 0, порты таблицы
`nft list set inet dsh_gateway_ingress ports` — прежние + новый, `ActiveEnterTimestamp` шлюзов прежние.
⚠️ Правила входа: неверная правка отрезает агентов от шлюзов. Готового снимка для отката после `reload` нет — его снимают
руками ДО правки и держат до проверки:

```bash
sudo nft -s list table inet dsh_gateway_ingress | sudo tee /root/dsh-gateway-ingress-do-pravki.nft >/dev/null
# правка allowed-callers.json или реестра, затем reload и проверка
sudo /usr/local/libexec/dsh-gateway-ingress/manage.sh rollback /dev/null /root/dsh-gateway-ingress-do-pravki.nft
```

`manage.sh rollback` требует три довода; второй (файл правил) при откате не читается, поэтому годится `/dev/null`.
Откат удаляет нынешнюю таблицу `dsh_gateway_ingress` и грузит снимок; файл снимка обязан существовать, иначе отказ, код 2.

Снятие юнита — `systemctl mask` (правило фермы 9): наш юнит с файлом в `/etc/systemd/system` mask не примет —
файл в страховку (`mv`), `daemon-reload`, `mask`; вернуть — `unmask` и файл назад.

## Проверка

Сумма каждого файла пакета = сумма боя (`sha256sum`), права = таблице (`stat -c '%a %U:%G'`).

В журнале службы (`journalctl -u dsh-gateway-ingress`) после каждого запуска и `reload` есть строка
`dsh-gateway-ingress: registry rules applied; rollback is explicit, service stop retains protection`. Строка
`dsh-gateway-ingress: WARNING no extras file /etc/dsh-gateway/allowed-callers.json: extra callers empty (agent owner and root only)`
значит, что файла дополнительных вызывающих нет и правила собраны без них: если вызывающие нужны, файл вернуть и сделать `reload`.
