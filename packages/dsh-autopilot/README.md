# dsh-autopilot 0.1.16 — проектная работа команды агентов

[English](README.en.md) · [История серверных кандидатов](HISTORY.md)

[Образцы настроек E01–E05](config/examples/) · [Ручная настройка (RU)](config/examples/INSTALL-NOTES.md)

Автопилот ведёт проект от требований и плана до заданий, реализации, независимой проверки и завершения. Задания и результаты остаются в проекте, а состояние команды видно на веб-витрине. Оператор задаёт цель и принимает решения; исполнители получают задания по отдельной почте.

Это серверная адаптация **Autopilot Никиты Велеса** для DeepSeek Harness (DSH). Исходный skill и замысел — [nick-vels/skills](https://github.com/nick-vels/skills). Мы добавили закреплённые ядра запусков, разделение Unix-учёток, почту команды, публикацию витрины и приблизительную статистику ходов. Лицензия MIT; атрибуция и состав заимствований сохранены в [NOTICE](NOTICE) и [LICENSE](LICENSE).

Поставка рассчитана на Linux-сервер с администратором и уже настроенным DSH. Ниже описан серверный профиль с оператором Master через Codex app-server, пятью исполнителями Codex и Совой через Claude. Для другого маршрута модели сначала адаптируются профиль и ограда; отметка «Python-ядро не импортирует шлюз» не означает, что его можно убрать из этого профиля. В версии 0.1.16 серверный профиль закрепляет семь имён: **master, vintik, shpuntik, gayka, shurup, sova, tumbler**. Другой состав требует адаптации кода и проверки. Установщик размещает ядро и создаёт его файловую опору; почта, агенты, доступ к витрине и первоначальный каталог RUN настраиваются отдельными шагами ниже.

## Из чего состоит

| Часть | Назначение |
|---|---|
| Закреплённый skill и фазы | Требования → спецификация → план → исполнение → review → приёмка. Upstream зафиксирован в source-lock.json, архив включён в vendor/. |
| Ядро и каталог RUN | Физическая release-полка, operator.lock и привязка проекта к ядру. Обновление current не переносит уже начатую работу на новый код. |
| Почта | Отдельный TLS-защищённый Unix-сокет, SQLite-хранилище, доставка заданий и результатов, подтверждения и ограничения срока/размера. |
| TG-уведомления | Короткое уведомление будит адресата; исходное письмо он забирает из проверенного сокета. Текст в Telegram не заменяет проверку отправителя. |
| Витрина | Статические dashboard.html/state.js и отдельная служба чтения. Приватное состояние проекта и публичная проекция разделены. |
| Статистика 0.1.16 | Суммирование end-строк по временному окну RUN, знак ≈ и отдельное состояние счётчика. Это статистика, а не счёт провайдера. |

## Какие пакеты нужны

Минимальный контракт Codex end-строки появился в gateway 3.1.5; описанная связка закреплена на 3.1.10. Gateway Master обязателен и для первого bootstrap: штатная ограда требует master.service и coder-gateway-master.service под UID Master. Версия 3.1.5 — граница появления end-row ABI, не проверенный минимум всей установки. AP-notice в TG появился в 3.1.11, для Claude end-строк нужен 3.1.15. Эти нижние границы сняты по коду/CHANGELOG, не полным перебором старых выпусков. Универсальный исторический минимум DSH и SDK для всей связки не установлен: совместимость выбранного DSH-профиля проверяется отдельно.

Ниже версии **дерева этого репозитория**, а не обещание наличия этих номеров в npm. Общий перечень — [каталог 41 пакета](../../docs/PACKAGES.ru.md). Для повторяемой установки сохраняйте Git SHA своего checkout.

| Компонент | Версия в дереве | Когда нужен |
|---|---|---|
| [dsh-autopilot](./) | 0.1.16 | Ядро, почтовый runtime, учёт и раздача входят в этот пакет. |
| [dsh-telegram-multiagent](../dsh-telegram-multiagent) | 3.1.15 | Telegram-канал, приём AP-notice, квитанции и end-писатель Claude. Нужен для описанного командного профиля. |
| [dsh-pamyat-core](../dsh-pamyat-core) | 3.1.3 | Необязательный помощник событий DSH; рекомендован и выбран в примере ниже. Без него TG читает session.events или snapshotEvents(); без обоих native API квитанции явно отказывают. Это не обязательная зависимость AP. |
| [dsh-subscription-gateway](../dsh-subscription-gateway) | 3.1.10 | Нужен описанному профилю Master/Codex. Минимальный ABI end-строки — 3.1.5; здесь закреплён 3.1.10. Это граница функции, а не проверенная рекомендация понизить всю поставку. |
| [dsh-subscription-adapter](../dsh-subscription-adapter) | 3.1.3 | Связь DSH с подписочным шлюзом. Нужен при выборе этого маршрута. |
| [dsh-tool-bridge](../dsh-tool-bridge) | 3.1.9 | Доступ внешнего движка к инструментам DSH; подключается вместе с таким движком, а не для Python-ядра как такового. |
| [dsh-trevogi](../dsh-trevogi) | 3.1.10 | Канал agent-alert и спул: их проверяют поставляемые почтовые unit-файлы перед запуском. |
| [dsh-montazh](../dsh-montazh) | 3.1.46 | Учитываемое окно развёртывания и его root-квитанция; её использует bootstrap каталога. |
| [dsh-podyom](../dsh-podyom) | 3.1.4 | Дополнительные средства администратора для нашего порядка подъёма; не вызываются самим тиком AP. |
| [dsh-reestr](../dsh-reestr) | 3.1.10 | Реестр при использовании нашего полного маршрута монтажа/подъёма; не импортируется автономным ap.py. |
| [dsh-storozha-sadik](../dsh-storozha-sadik) | 3.1.28 | Необязательный мониторинг persistent notice; нужен при переносе нашего контроля почты, не самому счётчику. |

Для профиля именно из этой инструкции установите dsh-autopilot, TG, gateway, adapter, tool-bridge, trevogi и montazh из таблицы. В описанном внешнем движке adapter и tool-bridge обязательны. Пример дополнительно устанавливает рекомендуемый pamyat-core 3.1.3; полный запуск TG без него здесь не проверен. Для полного маршрута учёта файлов montazh подготовьте dsh-reestr 3.1.10, а для чтения реестра — PyYAML. Ветка publication/copies дополнительно требует [dsh-pribory 3.1.4](../dsh-pribory) (минимум функции 3.1.2, npm-sostav требует jq) и [dsh-vypusk-watch 3.1.8](../dsh-vypusk-watch) (copy-compare.sh). Эти два helper не являются требованиями каждого произвольного montazh-okno или тика AP; показанный ниже bootstrap не включает publication/copies. Исторический минимум dsh-vypusk-watch не установлен. dsh-podyom и dsh-storozha-sadik добавляют эксплуатационные проверки; команды ниже используют systemctl напрямую. Не включайте все таймеры montazh: его дополнительные сторожа и обходчик — отдельный, зависящий от машины контур.

Семейство dsh-pamyat целиком, OMEGA, голосовой стек, соцсети и все сторожа sadik не являются импортами ядра AP. Они устанавливаются отдельно, если нужны выбранному агенту или способу эксплуатации. Почта AP встроена в dsh-autopilot: это отдельный транспорт, не пересылка заданий через a2a-send из dsh-pochta.

Внешние предпосылки: Linux с systemd и cgroup v2; Python **3.10+** со stdlib/SQLite/SSL, Bash, Git, coreutils, util-linux, инструменты Unix-учёток, ACL и OpenSSL. Для TG 3.1.15 нужен **Node.js 24+**. Сначала установите DSH по его инструкции, затем настройте модель и инструменты каждого агента. Токены подписок/ботов и доступ к моделям в репозиторий не входят. Для оператора окна montazh-okno нужен PyYAML (python3-yaml).

## Установка из репозитория

Шаги разделены по тому, кто их выполняет. Администратор размещает файлы и службы; непривилегированный master ведёт проекты. Не выполняйте root-команды из README на машине с существующим AP как процедуру обновления: для неё нужны страховка, сохранение RUN и отдельное окно.

Порядок для новой машины составлен по коду и по нашей действующей ферме; установка с нуля на чистом сервере не прогонялась.

Заполняемые образцы E01–E05 и порядок ручной настройки — [INSTALL-NOTES.md](config/examples/INSTALL-NOTES.md); ограничения имён и связанной раскладки — [FIXED-NAMES.md](config/examples/FIXED-NAMES.md). Это дополнение к шагам ниже, не installer всей фермы: заглушки надо заполнить для своего хоста, фиксированные Unix-имена сохранить.

### 1. Получить дерево и проверить состав

~~~sh
git clone https://github.com/iia-arg/dsh-plugins.git
cd dsh-plugins
REPO="$(pwd -P)"
export REPO
git rev-parse HEAD
python3 -c 'import json; print(json.load(open("packages/dsh-autopilot/package.json"))["version"])'
bash tools/check-readme-count.sh
bash tools/check-readme-index.sh
~~~

Для этой инструкции версия AP — 0.1.16. Копируйте связанные пакеты из одного checkout. Установка только npm-пакета dsh-autopilot не готовит сервер.

### 2. Подготовить учётки, DSH и вспомогательные пакеты

Сначала подготовьте по инструкциям DSH и gateway работающие экземпляры агентов: это внешняя предпосылка AP, а не результат его install.sh. В примере учётки имеют HOME /opt/<имя>, workspace /opt/<имя>/workspace, DSH app /opt/<имя>/app; пути должны совпасть с вашими units и профилями. Создайте семь отдельных непривилегированных учёток команды, их рабочие каталоги и DSH-профили. Оператор называется master. Для почты создайте отдельные служебные учётки autopilot-post и autopilot-copy и группу autopilot-mail; обе службы и команда должны иметь предусмотренный доступ к этой группе. Не давайте исполнителям доступ к чужим HOME и общей обычной почте.

Перед размещением AP должны работать модель и инструменты каждого агента. Проверьте master.service и coder-gateway-master.service, реальные HOME/workspace/CODEX_HOME, ботов, адрес владельца и traffic chat. Эти DSH/gateway-профили, начальный реестр и внешний TLS/auth задаёт администратор по документации соответствующих пакетов; готового универсального файла фермы в AP нет. Холодный путь от чистой ОС до первого задания целиком пока не проверен. Примеры ниже проверяют и описывают AP-слой поверх подготовленной фермы.

Членство autopilot-mail: семь учёток команды, autopilot-post и autopilot-copy; посторонних участников быть не должно. У всех разные UID и собственные primary groups. Исполнители, autopilot-post и autopilot-copy не входят в a2a-pochta; исключение для обычной почты допускается только master. Это проверяет production_accounts() почтовой службы.

Соберите агентные модули из этого checkout в tarball и установите архивы в каждый соответствующий профиль DSH. Это обычные файлы пакетов, не публикация в npm. Путь TARS должен быть доступен учёткам агентов; REPO — сохранённый абсолютный путь checkout. Команды установки выполняются под владельцем профиля:

~~~sh
# From the repository, as the administrator who prepares public package archives:
TARS=/var/tmp/dsh-ap-package-tars
install -d -m 0755 "$TARS"
npm pack "$REPO/packages/dsh-pamyat-core" --ignore-scripts --offline --pack-destination "$TARS"
npm pack "$REPO/packages/dsh-telegram-multiagent" --ignore-scripts --offline --pack-destination "$TARS"
~~~

Затем под владельцем нужного профиля (здесь пример для master; путь должен существовать после настройки DSH):

~~~sh
TARS=/var/tmp/dsh-ap-package-tars
PROFILE=/opt/master/.dsh/profiles/web
cd "$PROFILE"
npm install "$TARS/dsh-pamyat-core-3.1.3.tgz" "$TARS/dsh-telegram-multiagent-3.1.15.tgz"
~~~

Для подписочного маршрута отдельно следуйте инструкциям gateway, adapter и tool-bridge из таблицы: шлюз — служба, а не строка DSH-плагина. Имена master.service и coder-gateway-master.service используются root-окном каталога; произвольное переименование этих служб текущий профиль не поддерживает.

Серверные пакеты dsh-trevogi, dsh-montazh, dsh-reestr и dsh-podyom поставляют инструменты и шаблоны для машины. Разместите их по собственным README и настройте реестр, канал тревог и права. Их исходники не являются универсальными npm-установщиками новой ОС.

### 3. Разместить ядро

Проверьте, что учётка master уже существует и **не входит в autopilot-view**. Группу чтения витрины и public-каталоги создаст installer. Следующий пример сохраняет копию пакета под root-защитой; каталог версии должен быть новым:

~~~sh
AP_PACKAGE=/opt/autopilot/packages/0.1.16
test ! -e "$AP_PACKAGE"
sudo install -d -m 0755 /opt/autopilot/packages
sudo cp -R "$REPO/packages/dsh-autopilot" "$AP_PACKAGE"
sudo chown -R root:root "$AP_PACKAGE"
sudo chmod -R go-w "$AP_PACKAGE"
sudo bash "$AP_PACKAGE/install.sh" --dry-run
sudo bash "$AP_PACKAGE/install.sh"
sudo bash "$AP_PACKAGE/install.sh" --check
~~~

Перед выполнением root-блоков используйте shell с set -e и pipefail; при любой ошибке остановите последовательность. REPO сохраняет путь checkout из шага1, даже если вы переходили в профиль DSH. Успешный --check даёт rc 0. Installer проверяет vendor-архив и закреплённые суммы; не загружает upstream из сети и не запускает его ap.py. Он создаёт sources/, releases/, current, ссылку /opt/agent-skills/autopilot, public-опору и закрытый ключ раздачи. Он **не включает службы и не выполняет bootstrap**.

Для прогона файловой установки на копии есть DESTDIR: это новый root-owned каталог без чужой записи, со своими etc/passwd и etc/group. Пример и проверка — [test/test_install.py](test/test_install.py). DESTDIR не превращает полный серверный профиль в контейнерный установщик.

### 4. Настроить почту и уведомления

Почтовая полка независима от current. Её точный состав задаёт [lib/post_layout.py](lib/post_layout.py), функция entries(); в этом дереве RUNTIME — /opt/autopilot/post/0.1.10. Администратор размещает эти root-owned файлы с объявленными mode и ссылку /usr/local/bin/autopilot-mail на bin/autopilot-mail этой полки.

Полка почты 0.1.10 — отдельный номер совместимого транспорта, не версия AP. На новой машине состав можно разместить следующим блоком; он откажет при существующей полке или клиенте. Это размещение файлов, службы пока выключены:

~~~sh
WORK=/var/lib/dsh-autopilot-setup
sudo install -d -o root -g root -m 0700 "$WORK"
sudo python3 -B - "$AP_PACKAGE" <<'PY'
from pathlib import Path
import importlib.util, os, sys
package=Path(sys.argv[1])
target=Path('/opt/autopilot/post/0.1.10')
link=Path('/usr/local/bin/autopilot-mail')
assert not target.exists() and not target.is_symlink(), 'postal target already exists'
assert not os.path.lexists(link), 'mail client already installed'
spec=importlib.util.spec_from_file_location('post_layout',package/'lib/post_layout.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
entries=module.entries()
target.mkdir(parents=True,mode=0o755)
for name,(kind,mode,body) in entries.items():
    assert kind=='file' and not Path(name).is_absolute() and '..' not in Path(name).parts
    file=target/name;file.parent.mkdir(parents=True,exist_ok=True)
    file.write_bytes(body);file.chmod(mode);os.chown(file,0,0)
link.symlink_to(target/'bin/autopilot-mail')
PY
REL="$(realpath /opt/autopilot/current)"
sudo python3 -B "$AP_PACKAGE/lib/post_layout.py" \
  --preflight-ap "$REL" --post-candidate /opt/autopilot/post/0.1.10 \
  --post-target /opt/autopilot/post/0.1.10 | sudo tee "$WORK/post-layout.json" >/dev/null
sudo install -d -m 0700 "$WORK/units"
sudo cp /opt/autopilot/post/0.1.10/units/* "$WORK/units/"
sudo sed -i 's@/opt/autopilot/post/0.1.3/@/opt/autopilot/post/0.1.10/@g' \
  "$WORK/units/autopilot-copy.service" "$WORK/units/autopilot-mail-failed@.service"
~~~

Проверьте **каждый ExecStart** скопированных unit-файлов: mail использует post/0.1.10, а copy/failure-шаблоны сохраняют post/0.1.3 для уже существующей установки sadik. На чистой машине разместите выбранный совместимый postal runtime и укажите его физический путь в локальных копиях units; не создавайте пустую 0.1.3 и не считайте её установленной. Исходники пакета ради этого не переписываются.

Подготовьте TLS-пару в новом закрытом каталоге:

~~~sh
sudo python3 "$AP_PACKAGE/tools/prepare-mail-tls.py" --directory /var/tmp/autopilot-mail-tls-new
sudo install -d -o root -g root -m 0755 /etc/autopilot-mail
sudo install -d -o autopilot-post -g autopilot-post -m 0700 /var/lib/autopilot-mail
sudo install -o root -g root -m 0644 /var/tmp/autopilot-mail-tls-new/server.pem /etc/autopilot-mail/server.pem
sudo install -o autopilot-post -g autopilot-post -m 0600 /var/tmp/autopilot-mail-tls-new/server.key /var/lib/autopilot-mail/server.key
~~~

Сертификат установите в /etc/autopilot-mail/server.pem (root:root 0644), приватный ключ — в /var/lib/autopilot-mail/server.key (autopilot-post 0600). Утилита только готовит пару; готовая серверная настройка должна использовать один сертификат у службы и клиента. Значения ключей не выводятся и в репозиторий не копируются.

В /etc/autopilot-mail/ разместите retention.json и свою copy.json по [retention.json](config/retention.json) и [copy.example.json](config/copy.example.json). Замените **все** учебные bot_user_id, chat_id, списки получателей и пути token_file. Для копий квитанций нужны ключи ботов команды: файлы root:autopilot-copy 0640 в root:autopilot-copy каталоге 0750. Сама конфигурация — root:root 0644. Пути спула и ACL перечислены в [config/dsh-trevogi-spul-acl.conf](config/dsh-trevogi-spul-acl.conf). На подготовленном спуле выдайте wx на /var/spool/dsh-trevogi/tmp и /var/spool/dsh-trevogi/vhod учётке autopilot-post и семи учёткам команды: setfacl -m u:<name>:wx <directory>. Не переносите чужие учётки из образца. Доступ к итогам тревог и проверку agent-alert --proverit-nastrojku под autopilot-post подготовьте по dsh-trevogi.

В TG-профиле каждого участника задайте собственные appDir, workspace, tokenFile, разрешённого владельца и autopilotMail. Например, **объект настройки модуля**, а не готовый профиль DSH:

~~~json
{
  "agentName": "master",
  "appDir": "/opt/master/app",
  "workspace": "/opt/master/workspace",
  "tokenFile": "/etc/dsh-telegram/master.token",
  "allowedUsers": [123456789],
  "ownerChatId": 123456789,
  "autopilotMail": {
    "noticeDir": "/opt/master/a2a/zakryto/master",
    "trafficChatId": -1001234567890,
    "publisherBotIds": [100000001,100000002,100000003,100000004,100000005,100000006,100000007],
    "names": ["master"]
  }
}
~~~

Все ID в примере вымышлены. Для остальных участников меняются имя, пути, бот и разрешённые адресаты. noticeDir должен совпасть с --directory его autopilot-mail-notice@.service. Встроенный unit использует /opt/%i/a2a/zakryto/%i. Настройки собственных профилей и способ подключения модуля описаны в [TG README](../dsh-telegram-multiagent/README.md).

Проверьте конфигурации до запуска: загрузчики lib/mail_retention.py:load_config и lib/mail_copies.py:load_config валидируют root-owned retention.json и copy.json без отправки сообщений. Их импорт допустим из подготовленного postal/pilot, а не запуск mail_service.py вручную:

~~~sh
sudo python3 -B - <<'PY'
from pathlib import Path
import sys
sys.path.insert(0,'/opt/autopilot/post/0.1.10/pilot')
from mail_retention import load_config as retention_config
from mail_copies import load_config as copy_config
retention_config(Path('/etc/autopilot-mail/retention.json'))
copy_config(Path('/etc/autopilot-mail/copy.json'))
print('MAIL_CONFIG_OK')
PY
~~~

Почтовый комплект — autopilot-mail.service (autopilot-post), autopilot-copy.service (autopilot-copy), autopilot-mail-failed@.service (autopilot-post), autopilot-mail-notice@.service и .timer (семь учёток команды). Источник — локальные исправленные копии $WORK/units/. До запуска создайте noticeDir каждого участника с владельцем этой учётки и режимом 0700. Установите эти пять шаблонов в /etc/systemd/system/, проверьте systemd-analyze verify, выполните daemon-reload. Затем включите autopilot-mail.service, autopilot-copy.service и семь экземпляров autopilot-mail-notice@<name>.timer через systemctl enable --now. Шаблон failed и notice service отдельно не включаются. Не запускайте все шаблоны без списка команды и готовых ботов. Общая почта и AP-почта — разные каналы; nonce-уведомление само по себе не подтверждает доставку задания.

### 5. Создать каталог RUN под оградой

До первого init нужна подтверждённая опора /var/lib/dsh-autopilot. Существование папки не заменяет bootstrap. Сначала подготовьте и проверьте службы оператора, затем откройте учитываемое окно по dsh-montazh. Для forward-установки предназначен [window/katalog-okno.py](window/katalog-okno.py): он держит собственную ограниченную ограду двух служб оператора, проверяет idle/PID/cgroup, принимает census по явному критерию и вызывает bootstrap.

~~~sh
WORK=/var/lib/dsh-autopilot-setup
sudo python3 -B - "$AP_PACKAGE" <<'PY' | sudo tee "$WORK/package-rows.tsv" >/dev/null
from pathlib import Path
import hashlib,stat,sys
for file in sorted(Path(sys.argv[1]).rglob('*')):
    assert not file.is_symlink(), str(file)
    if not file.is_file(): continue
    info=file.stat()
    print(str(file),hashlib.sha256(file.read_bytes()).hexdigest(),
          info.st_uid,info.st_gid,format(stat.S_IMODE(info.st_mode),'o'),sep='\t')
PY
WINDOW_ID="$(sudo montazh-okno podgotovit --rows "$WORK/package-rows.tsv" \
  --task ap-first-bootstrap --actor root --ttl 1800)"
printf '%s\n' "$WINDOW_ID" | sudo tee "$WORK/window.id" >/dev/null
HOLDER="ap-bootstrap-$(date +%s).service"
FENCE="$WORK/fence.json"
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" hod --kod "$AP_PACKAGE"
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" ograda vkl \
  --kod "$AP_PACKAGE" --edinica "$HOLDER" --zapis "$FENCE" --predel 900
sudo python3 -B "$AP_PACKAGE/tools/ap-run-inventory.py" scan \
  | sudo tee "$WORK/census.json" >/dev/null
SHA="$(sudo sha256sum "$WORK/census.json" | awk '{print $1}')"
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" bootstrap \
  --kod "$AP_PACKAGE" --edinica "$HOLDER" --zapis "$FENCE" \
  --census "$WORK/census.json" --sha "$SHA" --okno-fajl "$WORK/window.id"
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" prava --kod "$AP_PACKAGE"
sudo python3 -B "$AP_PACKAGE/tools/ap-run-inventory.py" scan \
  | sudo tee "$WORK/census-after.json" >/dev/null
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" sravnit \
  --kod "$AP_PACKAGE" --edinica "$HOLDER" --zapis "$FENCE" \
  --census "$WORK/census.json" --scan "$WORK/census-after.json"
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" ograda vykl \
  --kod "$AP_PACKAGE" --edinica "$HOLDER" --zapis "$FENCE"
sudo montazh-okno zakryt "$WINDOW_ID"
~~~

Полный census охватывает видимые локальные файловые системы. Для первого развёртывания он должен быть complete, без errors, активных RUN и potentialProductionPin. Порядок под оградой: ograda vkl → scan и приёмка его SHA → bootstrap с --census/--sha/--okno-fajl → prava → повторный scan и sravnit → снятие своей ограды → закрытие окна. Проба init выполняется после разморозки, в шаге 7. У bootstrap должны оставаться минимум 120 с ограды; общий предел helper по умолчанию 900 с, допустимо 5–1800 с.

Любой отказ — стоп: не повторяйте bootstrap и не редактируйте census/квитанции ради зелёного. Снимите только свою ограду командой ograda vykl с теми же HOLDER/FENCE; её RuntimeMaxSec также ограничивает freeze 900 секундами. Не закрывайте окно как успешное после отказа. Первую пробу init из следующего шага выполняйте после разморозки.

Параметры --edinica, --zapis и --okno-fajl — **реальные** unit, квитанция ограды и запись окна вашей машины. Их нельзя заменить вымышленными JSON. Прямой ap-run-inventory.py bootstrap требует ограды rollback-окна; для первоначального forward-развёртывания используйте названный helper. Внутренние [листы окна](window/) содержат договоры и пробы нашей машины, а не готовые настройки вашего сервера.

### 6. Подключить статистику и витрину

До включения autopilot-usage.timer создайте root-owned /var/lib/autopilot-usage/source-profile.json (schemaVersion=1). Каталог и registrations должны оставаться проходимыми для почтового prune: root 0755, профиль/index/time-state root 0600, ACK root 0644. Не закрывайте весь каталог правами 0700. В profile задаются participants, их uid/gid и engine, projectRoots и mailDatabase. Для Codex поле home указывает на **CODEX_HOME шлюза**, где пишется dsh-usage-hodov.jsonl; для Claude runtimeSource.raw указывает на usage-runtime-v1.jsonl, рядом с которым TG пишет ap-usage-hodov-v1.jsonl. UID должен совпадать с реальным владельцем end-файла.

Пример создаёт профиль **именно для путей этого руководства** и получает UID/GID из целевой системы. Перед выполнением убедитесь, что шесть Codex gateway действительно используют указанные CODEX_HOME, а workspace Совы — /opt/sova/workspace. При иных путях исправляется профиль, не счётчик. Если index.json ещё отсутствует, collector сам создаёт пустой канонический индекс и index-origin под своим lock; не подставляйте произвольный index без origin.

~~~sh
sudo install -d -o master -g "$(id -gn master)" -m 0750 /srv/autopilot/projects
sudo install -d -o root -g root -m 0755 /var/lib/autopilot-usage
sudo python3 -B - <<'PY'
from pathlib import Path
import json,os,pwd
base=Path('/var/lib/autopilot-usage')
profile=base/'source-profile.json'
assert not profile.exists(), 'profile already exists: inspect, do not overwrite'
people=[]
for name in ('master','vintik','shpuntik','gayka','shurup','tumbler','sova'):
    account=pwd.getpwnam(name)
    person=dict(name=name,uid=account.pw_uid,gid=account.pw_gid,
                engine='claude' if name=='sova' else 'codex',
                home='/var/lib/coder-gateway-'+name+'/codex-home')
    if name=='sova':
        person['home']=account.pw_dir
        person['runtimeSource']={'raw':'/opt/sova/workspace/.message-receipts/usage-runtime-v1.jsonl'}
    people.append(person)
value=dict(schemaVersion=1,mailDatabase='/var/lib/autopilot-mail/mail.sqlite',
           projectRoots=['/srv/autopilot/projects'],participants=people)
profile.write_text(json.dumps(value,indent=2)+'\n');profile.chmod(0o600);os.chown(profile,0,0)
PY
~~~

Основной вход нового RUN — очередь usage_registrations почтовой SQLite, которую сборщик читает только mode=ro. Он единственный пишет индекс и JSON-state; старый drain/prepare не включаются рядом с ним. Прямое чтение init-state/catalog в текущем 0.1.16 не является входом сборщика. Подробный актуальный контракт — начало [ONLINE-USAGE.md](ONLINE-USAGE.md). В той же записи ниже сохранены старые схемы; их нельзя смешивать с v3/v5.

После запуска и проверки почты установите сборщик из этого же пакета. Вызывающий — autopilot-usage.timer; он запускает root-службу раз в 60 с, TimeoutStartSec=70. На существующей машине прежде нужен согласованный останов старого сборщика.

~~~sh
sudo install -o root -g root -m 0644 "$AP_PACKAGE/systemd/autopilot-usage.service" /etc/systemd/system/
sudo install -o root -g root -m 0644 "$AP_PACKAGE/systemd/autopilot-usage.timer" /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/autopilot-usage.service /etc/systemd/system/autopilot-usage.timer
sudo systemctl daemon-reload
sudo systemctl enable --now autopilot-usage.timer
sudo systemctl list-timers autopilot-usage.timer
~~~

Раздача находится в [razdacha/](razdacha/). Локально адаптируйте адрес прослушивания, разрешённый адрес прокси, порт и внешний TLS/auth; значения 192.168.99.* из шаблона относятся к sadik. Служба читает public-проекцию с группой autopilot-view и получает ключ через LoadCredential. Не открывайте приватную .autopilot и ключи как статику. Читатель витрины и сборщик расходов — разные службы.

Шаблон — [razdacha/dsh-autopilot-razdacha.service](razdacha/dsh-autopilot-razdacha.service), программа — [razdacha/razdacha.py](razdacha/razdacha.py). Разместите программу root:root 0755 по ExecStart (/usr/local/libexec/dsh-autopilot/razdacha.py), unit root:root 0644 в /etc/systemd/system/. Исправьте ExecStart (--adres, --vpusk, --port) и IPAddressAllow вместе, сохранив LoadCredential и ограничения доступа. После systemd-analyze verify и daemon-reload запускается dsh-autopilot-razdacha.service через enable --now. Признак на разрешённом локальном адресе: GET /__zhivoj → 200 zhiv; это проверяет службу, но не внешний прокси. URL панели относительно настроенного HTTPS-прокси — /master/<slug>/<run_id>/dashboard.html; значения берутся из /srv/autopilot/public/master/index.json. Прокси обязан передавать X-AP-Klyuch из приватного файла и требовать свою аутентификацию. Готового переносимого nginx/TLS-конфига пакет не поставляет; до его подготовки внешняя панель не включена.

### 7. Проверить запуск проектом

Под master, из разрешённого физического Git-проекта, закрепите skill в механизме инструкций используемого движка. Если модель работает через внешний движок, наличие skill только в DSH ещё не доказывает, что движок его видит.

Перед командами ниже администратор создаёт новый каталог проекта; пример рассчитан на ещё не существующий example:

~~~sh
test ! -e /srv/autopilot/projects/example
sudo install -d -o master -g "$(id -gn master)" -m 0750 /srv/autopilot/projects/example
~~~

~~~sh
sudo -iu master
cd /srv/autopilot/projects/example
git init
# Set your Git user.name and user.email before the first working commit.
export AUTOPILOT_OPERATOR_PID=$$
REL="$(realpath /opt/autopilot/current)"
python3 -B "$REL/skill/tools/ap.py" --no-serve init --slug example --skill-dir "$REL/skill"
~~~

Root не является оператором. Для дальнейших команд используйте skill_dir из приватного состояния этого RUN; не подменяйте его новым current и не удаляйте operator.lock.

Сначала, из shell master, проверьте транспорт независимо от заданий:

~~~sh
/usr/local/bin/autopilot-mail status
/usr/local/bin/autopilot-mail inbox
printf '%s\n' 'AP transport setup probe; no domain task' \
  | /usr/local/bin/autopilot-mail send vintik --request /opt/master/ap-mail-probe.json --subject AP-setup-probe
~~~

Адресат vintik должен увидеть уведомление и получить исходное письмо своим autopilot-mail inbox/read; отправка выводит ID. Это транспортная проба, не задание модели. Для настоящей учебной задачи Master сначала оформляет требование R1 и утверждённый ticket HELLO-1 в плане проекта, закрепляет полномочия исполнителя и проверяет исходный Git HEAD. Текст владельца «создать docs/hello.md со строкой Hello в этом проекте» — вход для подготовки задания, а не прямая команда CLI. Затем под master из этого проекта можно подготовить форму ниже; deadline действует 900 с, устаревшую форму не отправляйте. Все значения — пример для нового разрешённого задания, не обход фаз skill.

До submit Master фиксирует исходный Git HEAD и утверждённый план своим коммитом. Для отдельной учётки vintik администратор открывает только рабочую зону и чтение контрольных объектов. Не давайте запись в .git, .autopilot или инструкции. В этом простом проекте инструкция — AGENTS.md; если план добавил вложенные инструкции/иной memory, выдайте чтение и им.

~~~sh
# In a separate administrator shell, after Master initialized and prepared the project:
PROJECT=/srv/autopilot/projects/example
sudo install -d -o master -g "$(id -gn master)" -m 0750 "$PROJECT/docs"
sudo install -d -o master -g "$(id -gn master)" -m 0711 "$PROJECT/receiver-state"
sudo install -d -o vintik -g "$(id -gn vintik)" -m 0700 "$PROJECT/receiver-state/vintik"
sudo setfacl -m u:vintik:--x /srv/autopilot/projects "$PROJECT/.autopilot"
sudo setfacl -m u:vintik:r-x "$PROJECT"
sudo setfacl -R -m u:vintik:rX "$PROJECT/.git"
sudo setfacl -m u:vintik:rwx "$PROJECT/docs"
for file in AGENTS.md CLAUDE.md .autopilot/PROGRESS.md; do
  if sudo test -f "$PROJECT/$file"; then
    sudo setfacl -m u:vintik:r-- "$PROJECT/$file"
  fi
done
~~~

Под vintik проверьте git rev-parse через safe.directory для этого проекта (см. README-PILOT), чтение контрольных файлов и создание/удаление пробного файла только в docs. Его RECEIVER_STATE — /srv/autopilot/projects/example/receiver-state/vintik/state.json; private state.js Мастера ему не открывается. Вернитесь в shell master в корне проекта перед следующими командами. Для reviewer создаётся своя разрешённая зона и state тем же способом.

~~~sh
umask 077
git rev-parse --verify HEAD
PROJECT=/srv/autopilot/projects/example
export PROJECT
python3 -B - <<'PY'
from pathlib import Path
import json,os,time
project=Path(os.environ['PROJECT'])
raw=(project/'.autopilot/state.js').read_text()
prefix,sep,body=raw.partition('=')
assert sep and prefix.strip()=='window.STATE'
meta=json.loads(body.strip().rstrip(';'))['_sadik']
assert meta['root']==str(project.resolve())
binding=dict(run=meta['run_id'],release=str(Path(meta['release']['skill_dir']).parent))
(project/'first-binding.json').write_text(json.dumps(binding)+'\n')
task=dict(job_id='hello-1',ticket='HELLO-1',recipient='vintik',role='executor',
          cwd=str(project),zone=['docs/hello.md'],requirements=['R1'],
          brief='Create docs/hello.md containing Hello. Stay inside the assigned project and zone.',
          deadline=int(time.time())+900,context_request='fresh',parent_job_id=None,context_ref=None)
(project/'job.json').write_text(json.dumps(task)+'\n')
PY
RUN="$(python3 -c 'import json; print(json.load(open("first-binding.json"))["run"])')"
REL="$(python3 -c 'import json; print(json.load(open("first-binding.json"))["release"])')"
PYTHONPATH=/opt/autopilot/post/0.1.10/pilot PYTHONNOUSERSITE=1 \
  python3 -s -B "$REL/pilot/pilot_mail.py" \
  --state "$PROJECT/.autopilot/pilot/master.json" --project "$PROJECT" \
  --run "$RUN" --memory AGENTS.md submit < "$PROJECT/job.json"
~~~

Форма проверяется lib/pilot_mail.py. README-PILOT.md содержит RU и EN; раздел EN объясняет общие shell-команды. PLACED подтверждает постановку в транспорт, не выполнение. Отдельный reviewer получает своё непересекающееся задание после результата; приёмку и события проекта ведёт Master.

Проверьте: один RUN в каталоге, state.js и dashboard.html в проекте, публичную проекцию, приём задания адресатом через проверенную почту, независимый результат/review и первый тик статистики. Повтор тика без новых end-байтов не должен перечитывать их и удваивать итог. Строка в очереди, ACK, получение письма, выполнение и приёмка — разные признаки.

После первого зарегистрированного RUN дождитесь тика таймера и прочтите journalctl -u autopilot-usage.service, root-owned /var/lib/autopilot-usage/time-state.json и карточку ≈ в public state. Первый тик должен увидеть семь участников из source-profile; повтор без новых end-строк — 0 новых байт и прежний итог. Наличие данных проверяет статистику, а не выдачу/приёмку задания.

## Ограничения и обновления

- Статистика приблизительная: время RUN может пересекаться с другой работой, завершение/потеря/ротация источника ограничивают полноту. Нет доказанного тарифа, исторической подписки и полной стоимости SDK-детей. Неизвестное — null, не 0.
- В 0.1.16 grace после завершения — 600 с; хранятся ограниченные история и курсоры, затем итог RUN замораживается. История не гарантирует полноту при переполнении. Старые закрытые квитанции не пересчитываются в новые ≈-итоги.
- Это профиль с отдельными Unix-учётками и фиксированной командой, не средство запуска недоверенного кода в общей учётке. Текст задания не расширяет полномочия исполнителя.
- Публичная проекция фильтруется, но не заменяет контроль секретов и доступа администратором. Публикуется только public-дерево.
- Обновление AP, почты, TG-писателя и активных RUN проводится согласованно. Переключение current само по себе не мигрирует RUN и не делает старый reader совместимым с новым state.
- Исторические описания выпусков и измерений — [HISTORY.md](HISTORY.md) / [HISTORY.en.md](HISTORY.en.md). Рабочие договоры — [README-CORE.md](README-CORE.md), [README-PILOT.md](README-PILOT.md), [FORMAT-CONTRACT.md](FORMAT-CONTRACT.md). Их даты и область измерения существенны.

Upstream закреплён на 9fc898cbe941d5b8a369f1dd657e9119676eb44f; локальная версия AP 0.1.16 — отдельный номер. Перед обновлением сравнивайте upstream, локальные patches/overlay, почтовую совместимость и данные существующих RUN. Исходный архив и лицензии доступны в этом checkout.
