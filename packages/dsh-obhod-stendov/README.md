Английская версия: [README.en.md](README.en.md) · ниже — русский текст

# dsh-obhod-stendov — ночной и недельный обход боевых стендов sadik

**Версия:** 3.1.51

Служебный софт sadik: обход стендов по таймеру (ночной 03:40 UTC и недельный ср 01:30 UTC), обходчик
`vse-stendy-boevye.sh` с перечнями стендов, сами стенды и их данные. Исход обхода читает `chitatel-obhoda`
(пакет **dsh-storozha-sadik**).

Пакет **не к публикации без отдельных ворот:** перечни и обходчик несут внутреннее устройство машины (пути, юниты, имена
агентов, исключения стендов, приёмы проверки боевых предметов).

**Временное правило (Вениамин, 07.10.2026):** пока у новых пакетов нет читателя «бой ↔ метка», любой файл пакета
меняется только вместе с новым номером пакета в том же окне.

⚠️ Боевой таймер исполняет код из рабочего каталога агента (`/opt/iskra/workspace/dorabotki`). Перенос в дерево этого
не меняет; вынос в `/usr/local` — отдельное решение.

Пакет — исходники без `package.json`: `dorabotki/` повторяет путь `/opt/iskra/workspace/dorabotki/` (владелец
`iskra:iskra`), юниты и drop-in — в `systemd/` (под `/etc/systemd/system/`). Номер — заголовок CHANGELOG и метка
`dsh-obhod-stendov-v<номер>`. Перенос с боя: сумма каждого файла в дереве равна сумме боя.

## Состав — по вызовам (снято 07.10.2026)

Прибор: для каждого файла — строки ядра (сценарии обхода, перечни, обходчик, стенды), где имя файла стоит НЕ в
комментарии; стенд в составе, только если его зовёт обход или стенд, которого зовёт обход. Обходчик каталог `stendy/`
не перебирает — только перечни. Из 54 спорных файлов корня `dorabotki` взяты 3 — данные и помощник, которые читает
`stend-kanarejki-shlyuza.sh`: `edinstvennye-sushchnosti-shlyuza.json`, `zayavlennye-proverki-kanarejki-shlyuza.json`,
`sreda-yunita.py`; остальные 51 — не в пакете (ниже).

## Файлы

git хранит только признак «исполняемый», поэтому режим и владелец на диске — в таблице (снято `stat` боя 07.10.2026).

| файл в пакете | путь на диске | кто зовёт | режим | владелец:группа |
|---|---|---|---|---|
| `libexec/stend-varvara-fs-deny.mjs` (с 3.1.15) | `/usr/local/libexec/stend-varvara-fs-deny.mjs` | ночной обход, `@varvara /opt/varvara/app`; 15 с, caller 30 с | 644 | root:root |
| `dorabotki/omega-b-p-060/stend-b-p-060.sh` | `/opt/iskra/workspace/dorabotki/omega-b-p-060/stend-b-p-060.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/omega-b-p-060/stend-b-p-060.py` | `/opt/iskra/workspace/dorabotki/omega-b-p-060/stend-b-p-060.py` | стенд stend-b-p-060.sh (зовёт его python OMEGA `/opt/omega/venv/bin/python3 -B`) | 755 | iskra:iskra |
| `dorabotki/perechen-boevyh-stendov.txt` | `/opt/iskra/workspace/dorabotki/perechen-boevyh-stendov.txt` | обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/perechen-nedelnyh-stendov.txt` | `/opt/iskra/workspace/dorabotki/perechen-nedelnyh-stendov.txt` | vse-stendy-nedelnye.sh | 644 | iskra:iskra |
| `dorabotki/stend-373-svodki-vne-vydachi.mjs` | `/opt/iskra/workspace/dorabotki/stend-373-svodki-vne-vydachi.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-agent-limits.sh` | `/opt/iskra/workspace/dorabotki/stend-agent-limits.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-apt-notify.sh` | `/opt/iskra/workspace/dorabotki/stend-apt-notify.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-B14-snimok.sh` | `/opt/iskra/workspace/dorabotki/stend-B14-snimok.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-atsiklichnosti.sh` | `/opt/iskra/workspace/dorabotki/stend-atsiklichnosti.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stend-cepi-pamyati.mjs` | `/opt/iskra/workspace/dorabotki/stend-cepi-pamyati.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-compaction-zaveden.mjs` | `/opt/iskra/workspace/dorabotki/stend-compaction-zaveden.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-izmeritelya.sh` | `/opt/iskra/workspace/dorabotki/stend-izmeritelya.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-kanarejki-shlyuza.sh` | `/opt/iskra/workspace/dorabotki/stend-kanarejki-shlyuza.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-kurera.sh` | `/opt/iskra/workspace/dorabotki/stend-kurera.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-needrestart.sh` | `/opt/iskra/workspace/dorabotki/stend-needrestart.sh` | недельный обход (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh с ключом `--zhivaya-mashina` | 755 | iskra:iskra |
| `dorabotki/stend-obyavlenij-profilej.sh` | `/opt/iskra/workspace/dorabotki/stend-obyavlenij-profilej.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-ohvat-i-sverka.mjs` | `/opt/iskra/workspace/dorabotki/stend-ohvat-i-sverka.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-otmetki-priyomki.sh` | `/opt/iskra/workspace/dorabotki/stend-otmetki-priyomki.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-pochtalona.sh` | `/opt/iskra/workspace/dorabotki/stend-pochtalona.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-pokrytiya.sh` | `/opt/iskra/workspace/dorabotki/stend-pokrytiya.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-poteri-pisem.mjs` | `/opt/iskra/workspace/dorabotki/stend-poteri-pisem.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-hranilishcha-sekretov.sh` | `/opt/iskra/workspace/dorabotki/stend-hranilishcha-sekretov.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-vozrast-pisma.mjs` | `/opt/iskra/workspace/dorabotki/stend-vozrast-pisma.mjs` | ночной обход (perechen-boevyh-stendov.txt) — исключение ОЖИДАЕМО; обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-pravki-reestra.sh` | `/opt/iskra/workspace/dorabotki/stend-pravki-reestra.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priyomki-kopii.sh` | `/opt/iskra/workspace/dorabotki/stend-priyomki-kopii.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priyomki-po-raspisaniyu.sh` | `/opt/iskra/workspace/dorabotki/stend-priyomki-po-raspisaniyu.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priznaka-oblasti.sh` | `/opt/iskra/workspace/dorabotki/stend-priznaka-oblasti.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-proverki-opory.mjs` | `/opt/iskra/workspace/dorabotki/stend-proverki-opory.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-razmer-kopii-watch.sh` | `/opt/iskra/workspace/dorabotki/stend-razmer-kopii-watch.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-reestra-agentov.sh` | `/opt/iskra/workspace/dorabotki/stend-reestra-agentov.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-registry-json.sh` | `/opt/iskra/workspace/dorabotki/stend-registry-json.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-sekretov-na-mestah.sh` | `/opt/iskra/workspace/dorabotki/stend-sekretov-na-mestah.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-skill-links.sh` | `/opt/iskra/workspace/dorabotki/stend-skill-links.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-snyatie-ogranichitelej.mjs` | `/opt/iskra/workspace/dorabotki/stend-snyatie-ogranichitelej.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-soglasie-sloev.sh` | `/opt/iskra/workspace/dorabotki/stend-soglasie-sloev.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-stop-pobudok.mjs` | `/opt/iskra/workspace/dorabotki/stend-stop-pobudok.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-storozha-reestrov.sh` | `/opt/iskra/workspace/dorabotki/stend-storozha-reestrov.sh` | недельный обход (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stend-svershchika.sh` | `/opt/iskra/workspace/dorabotki/stend-svershchika.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-svyazok-podpisok.sh` | `/opt/iskra/workspace/dorabotki/stend-svyazok-podpisok.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-U0-istochnik.mjs` | `/opt/iskra/workspace/dorabotki/stend-U0-istochnik.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-uborki-pisma.mjs` | `/opt/iskra/workspace/dorabotki/stend-uborki-pisma.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-verdiktov-istochniki.mjs` | `/opt/iskra/workspace/dorabotki/stend-verdiktov-istochniki.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-vidimosti-a2a.sh` | `/opt/iskra/workspace/dorabotki/stend-vidimosti-a2a.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-vtoroj-vhod-svodki.mjs` | `/opt/iskra/workspace/dorabotki/stend-vtoroj-vhod-svodki.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-vzaimnogo-nabludeniya.sh` | `/opt/iskra/workspace/dorabotki/stend-vzaimnogo-nabludeniya.sh` | недельный обход (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh с ключом `--zhivaya-mashina` | 755 | iskra:iskra |
| `dorabotki/stendy/clw-sluchai.sh` | `/opt/iskra/workspace/dorabotki/stendy/clw-sluchai.sh` | стенд stend-codex-limit-watch.sh | 755 | iskra:iskra |
| `dorabotki/stendy/fake-codex.py` | `/opt/iskra/workspace/dorabotki/stendy/fake-codex.py` | стенд clw-sluchai.sh | 755 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-napominaniya.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-napominaniya.mjs` | стенд stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-podgotovit.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-podgotovit.mjs` | стенд stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-proverit.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-proverit.mjs` | стенд stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-tg.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-tg.mjs` | стенд mail-stop-hold-napominaniya.mjs | 644 | iskra:iskra |
| `dorabotki/stendy/pk-sluchai.sh` | `/opt/iskra/workspace/dorabotki/stendy/pk-sluchai.sh` | стенд stend-pereklyuchatelya-codex.sh | 755 | iskra:iskra |
| `dorabotki/stendy/poll-fixture.mjs` | `/opt/iskra/workspace/dorabotki/stendy/poll-fixture.mjs` | стенд stend-a2a-owner-copy-watch.sh | 644 | iskra:iskra |
| `dorabotki/stendy/priyomnik-imeni-v2.mjs` | `/opt/iskra/workspace/dorabotki/stendy/priyomnik-imeni-v2.mjs` | стенд stend-imeni-v2.sh | 644 | iskra:iskra |
| `dorabotki/stendy/proba-kopij.sh` | `/opt/iskra/workspace/dorabotki/stendy/proba-kopij.sh` | стенд stend-mest-kopij.sh | 755 | iskra:iskra |
| `dorabotki/stendy/proba-prav-domov.sh` | `/opt/iskra/workspace/dorabotki/stendy/proba-prav-domov.sh` | стенд stend-prav-domov.sh | 755 | iskra:iskra |
| `dorabotki/stendy/smv-atomic-probe.py` | `/opt/iskra/workspace/dorabotki/stendy/smv-atomic-probe.py` | стенд stend-smontirovat-vypusk-rezhimy.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-a2a-owner-copy-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-a2a-owner-copy-watch.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-aclaude-snaruzhi.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-aclaude-snaruzhi.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-chitatelya-obhoda.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-chitatelya-obhoda.py` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-codex-limit-watch.etalon` | `/opt/iskra/workspace/dorabotki/stendy/stend-codex-limit-watch.etalon` | стенд stend-codex-limit-watch.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-codex-limit-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-codex-limit-watch.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-compact-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-compact-watch.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-doli-preseta.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-doli-preseta.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-dogovora-trevogi.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-dogovora-trevogi.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-hvostov.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-hvostov.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-imeni-v2.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-imeni-v2.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-isklyuchenij-obhodchika.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-isklyuchenij-obhodchika.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-osnovy-versii.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-osnovy-versii.py` | ночной обход; po_osnove: своя bare/suffix основа проходит, чужая отказывает; без доводов проверяет соседний vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mashinnoj-redakcii.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-mashinnoj-redakcii.py` | ночной обход; юниты systemd трёх пакетов дерево↔бой по рабочим строкам за вычетом данных /etc/agent-registry/ozhidaemye-razlichiya.yaml; живые drop-in вне дерева не видит | 644 | iskra:iskra |
| `dorabotki/stendy/stend-limity-pereklyuchatelya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-limity-pereklyuchatelya.py` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mail-stop-hold.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mail-stop-hold.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-mcp-spiska-dvizhkom.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-mcp-spiska-dvizhkom.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mest-kopij.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mest-kopij.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-mihalycha.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mihalycha.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-modeli-omega.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-modeli-omega.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-model-podmena.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-model-podmena.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-montazha.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-montazha.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-nemoty-posle-szhatiya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-nemoty-posle-szhatiya.py` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-oblasti-fajlom.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-oblasti-fajlom.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-obnovitel-prava.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-obnovitel-prava.py` | стенд stend-obnovitel-prava.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-obnovitel-prava.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-obnovitel-prava.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-obsluzhivaniya-store-pin.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-obsluzhivaniya-store-pin.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-opisat-kartinku.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-opisat-kartinku.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-osnova.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-osnova.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-otbros-shlyuza.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-otbros-shlyuza.py` | ночной обход (perechen-boevyh-stendov.txt) | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pered-podyomom.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-pered-podyomom.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-codex.etalon` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-codex.etalon` | стенд stend-pereklyuchatelya-codex.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-codex.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-codex.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-podpiski.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-podpiski.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-prav-domov.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-prav-domov.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-pravki-mimo.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pravki-mimo.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh; vse-stendy-po-tajmeru.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-pravki-postavki-omega.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pravki-postavki-omega.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-priyomnik-itog.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-priyomnik-itog.py` | стенд stend-priyomnik-itog.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-priyomnik-itog.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-priyomnik-itog.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-profil.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-profil.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root, HODPRIBOR, довод /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-razbora-env.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-razbora-env.py` | стенд stend-razbora-env.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-razbora-env.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-razbora-env.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-rezhim-novogo.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-rezhim-novogo.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root, довод /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-rolej-shlyuza.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-rolej-shlyuza.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-bez-sredy.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-bez-sredy.sh` | недельный обход (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-voice-root.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-voice-root.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-zastryal.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-zastryal.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sajt-chat.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-sajt-chat.py` | стенд stend-sajt-chat.sh | 444 | iskra:iskra |
| `dorabotki/stendy/stend-sajt-chat.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sajt-chat.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 555 | iskra:iskra |
| `dorabotki/stendy/stend-sborshchika-kopii.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sborshchika-kopii.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-args.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-args.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-git.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-git.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-rezhimy.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-rezhimy.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-strahovka.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-strahovka.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-snyatiya-profilya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya-profilya.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root, довод /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-snyatiya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root, довод /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sobrat-kuda.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sobrat-kuda.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-storozha-nad-storozhami.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-storozha-nad-storozhami.sh` | недельный обход (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svesti-dostup-podpisok.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svesti-dostup-podpisok.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svesti-dostup-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svesti-dostup-watch.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svodki-doveriya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svodki-doveriya.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-switch-1.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-switch-1.py` | стенд stend-switch-1.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-switch-1.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-switch-1.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-trust-sverka.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-trust-sverka.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root, довод /usr/local/sbin/mail-stop-trust-sverka.mjs) | 644 | iskra:iskra |
| `dorabotki/stendy/stend-ucheta-git.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-ucheta-git.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-ucheta.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-ucheta.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-vorot-perenosa.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-vorot-perenosa.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-vorot-vypuska.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-vorot-vypuska.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-zhivaya-versiya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-zhivaya-versiya.py` | ночной обход (perechen-boevyh-stendov.txt) | 644 | iskra:iskra |
| `dorabotki/skaner-zhivoj-mashiny.py` | `/opt/iskra/workspace/dorabotki/skaner-zhivoj-mashiny.py` | обходчик vse-stendy-boevye.sh (С1 перед каждым стендом, правила для суда С2); берётся из каталога обходчика — ставить рядом | 755 | iskra:iskra |
| `dorabotki/vse-stendy-boevye.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh` | vse-stendy-po-tajmeru.sh | 755 | iskra:iskra |
| `dorabotki/vse-stendy-nedelnye.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-nedelnye.sh` | vse-stendy-nedelnye.service (User=iskra) | 755 | iskra:iskra |
| `dorabotki/vse-stendy-po-tajmeru.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-po-tajmeru.sh` | vse-stendy-boevye.service (User=iskra) | 755 | iskra:iskra |
| `dorabotki/edinstvennye-sushchnosti-shlyuza.json` | `/opt/iskra/workspace/dorabotki/edinstvennye-sushchnosti-shlyuza.json` | стенд stend-kanarejki-shlyuza.sh | 644 | iskra:iskra |
| `dorabotki/zayavlennye-proverki-kanarejki-shlyuza.json` | `/opt/iskra/workspace/dorabotki/zayavlennye-proverki-kanarejki-shlyuza.json` | стенд stend-kanarejki-shlyuza.sh | 644 | iskra:iskra |
| `dorabotki/sreda-yunita.py` | `/opt/iskra/workspace/dorabotki/sreda-yunita.py` | стенд stend-kanarejki-shlyuza.sh | 755 | iskra:iskra |
| `systemd/vse-stendy-boevye.service` | `/etc/systemd/system/vse-stendy-boevye.service` | свой .timer 03:40 UTC | 644 | root:root |
| `systemd/vse-stendy-boevye.service.d/30-stend-nabora.conf` | `/etc/systemd/system/vse-stendy-boevye.service.d/30-stend-nabora.conf` | drop-in: STEND_POLKA, STEND_PLAGINY для стенда набора | 644 | root:root |
| `systemd/vse-stendy-boevye.service.d/60-bash-padenie-70.conf` | `/etc/systemd/system/vse-stendy-boevye.service.d/60-bash-padenie-70.conf` | drop-in: запуск через bash-padenie-70 | 644 | root:root |
| `systemd/vse-stendy-boevye.timer` | `/etc/systemd/system/vse-stendy-boevye.timer` | systemd (включён) | 644 | root:root |
| `systemd/vse-stendy-nedelnye.service` | `/etc/systemd/system/vse-stendy-nedelnye.service` | свой .timer ср 01:30 UTC | 644 | root:root |
| `systemd/vse-stendy-nedelnye.service.d/60-bash-padenie-70.conf` | `/etc/systemd/system/vse-stendy-nedelnye.service.d/60-bash-padenie-70.conf` | drop-in: запуск через bash-padenie-70 | 644 | root:root |
| `systemd/vse-stendy-nedelnye.timer` | `/etc/systemd/system/vse-stendy-nedelnye.timer` | systemd (включён) | 644 | root:root |

## Вне обхода — стенды в `dorabotki`, которых обход не зовёт (в пакет не взяты)

- корень: stend-kanarejki.sh — «РУЧНОЙ НАМЕРЕННО» (так в перечне, 1.0.12: копия наследует личность живого агента);
  stend-needrestart.sh с 3.1.1 в пакете (таблица выше), его зовёт недельный обход;
  stend-hranilishcha-sekretov.sh и stend-vozrast-pisma.mjs — с 1.0.12 в пакете и в ночном обходе (vozrast-pisma — с исключением ОЖИДАЕМО);
- stendy/CHITAT-PERED-PROGONOM-nabor-vorot.txt, stendy/stend-podyoma.sh — `stendy/stend-podyoma.sh` «вне обхода намеренно» (так в перечне); `CHITAT-PERED-PROGONOM-nabor-vorot.txt` — записка для руки.
- ручной `stend-krug-samoproverki.sh` — «ИСКЛЮЧЁН, ручной» (так в перечне); его источник — дерево dsh-reestr
  (`/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-krug-samoproverki.sh`), копия в `dorabotki` снята в 1.0.50.

## Не в пакете — предметы проверки и прочее (решение координатора отдельно)

- Предметы, которые стенды пакета проверяют (инструменты других областей): `montazh-iz-tega`,
  `ozhidaemyj-razmer.py`, `priznak-oblasti-podklyucheniya.sh`, `proverit-publikacii.py` (+ его настройка `karta-publikacij.yaml`),
  `proverka-opory.mjs`, `verdikty-priyomki.sh`; исходники боевых инструментов с парой в `/usr/local` (уже в своих пакетах).
- Прочие файлы корня `dorabotki`, которые ядро упоминает только в комментариях, файлы `*.SNYATO*`, страховки `*.bak*`, учёт `nashi-dorabotki.sh`/`manifest.txt`.

## Зависимости

- Программы: bash, python3, node, systemctl, journalctl, sudo, `systemd-run` (scope каждого стенда), `setpriv` (учётка стенда
  в scope с теми же группами), `setfacl` из пакета acl (журнал гостевого агента), `timeout` (предел стенда); `bash-padenie-70` из пакета
  **dsh-storozha-mashiny** (drop-in обоих юнитов).
- Недельный `stend-needrestart.sh` проверяет `/opt/iskra/workspace/dorabotki/proverka-needrestart.pl` и боевой
  `/etc/needrestart/conf.d/50-agent-services.conf` — в пакеты они не входят; нет любого — СЛЕПОТА, код 2. Под ключом
  `--zhivaya-mashina` он берёт замки dpkg/apt на прогон и пишет и снимает `99-STEND-*.conf` в живом `/etc/needrestart/conf.d`.
- `stendy/stend-vorot-perenosa.sh` проверяет установленные ворота `/usr/local/bin/perenos-v-derevo` (пакет dsh-montazh), другой путь — `PERENOS_BIN`.
- Модуль python `yaml` (PyYAML; пакет ОС `python3-yaml`): им обходчик читает `/etc/agent-registry/stend-exceptions.yaml`. Без модуля
  файл исключений «не разобран», и итог обхода не ниже 2. Его же импортируют 18 стендов пакета.
- Учётка обхода (iskra) — с беспарольным `sudo -n`: им идут scope-юнит каждого стенда, суд журнала `journalctl` после
  прогона и стенды чужих учёток. Без него С2 слепнет, и обход кончается кодом 2 (если нет причины для 1).
- Каталог `/opt/iskra/workspace/tmp-stendov` (iskra:iskra 0750) создаёт монтаж, не пакет: это `TMPDIR` стенда ворот
  `stend-vorot-vypuska.sh` и `/usr/local/libexec/stend-metki-vorot.sh` (строки `SREDA_STENDOV` обходчика). В юните обхода
  `/tmp` и `/var/tmp` частные, а оба стенда зовут отдельные службы `systemd-run` (ворота — обходчик, проба 6б — сторож меток),
  которым частный каталог не виден. Нет каталога — оба стенда слепнут.
- `/etc/agent-registry/stend-exceptions.yaml` (исключения стендов), реестр, боевые предметы стендов — в пакет не входят.

## Установка и снятие (руками root)

Файлы `dorabotki/` — в `/opt/iskra/workspace/dorabotki/` владельцем `iskra:iskra` с режимом из таблицы; юниты и drop-in —
в `/etc/systemd/system/`, `systemctl daemon-reload`, `systemctl enable --now vse-stendy-boevye.timer vse-stendy-nedelnye.timer`.

Снятие юнита — `systemctl mask` (правило фермы 9): наш юнит с файлом в `/etc/systemd/system` mask не примет —
файл в страховку (`mv`), `daemon-reload`, `mask`; вернуть — `unmask` и файл назад.

## Как обходчик гонит стенды

Перед прогоном обходчик снимает журнал службы гостевого агента (имя юнита зашито в обходчике) с момента её подъёма в файл своего прогона: каталог `mktemp` в
`TMPDIR` с правами 711, файл 600 и ACL на чтение учётке этого агента (`setfacl`). Первая строка — шапка `#MOST_ZHURNAL_YUNITA <юнит> <старт>`.
Путь получает стенд этого агента `stend-cel-mosta.mjs` переменной `MOST_ZHURNAL_YUNITA` (строка `SREDA_STENDOV`). Снять не удалось —
файла нет, стенд слепнет, а не зеленеет.

**С1 — предупреждение до запуска, не красное.** Перед каждым стендом `skaner-zhivoj-mashiny.py` читает его текст и ищет команды,
меняющие живую машину: `systemctl` с меняющим глаголом, `useradd` и родню, запись в `/etc`, замки dpkg/apt, инструменты с ключом
действия. Стенд чужой учётки читается её рукой и подаётся сканеру через stdin. Маркеры в тексте стенда: `# ZHIVAYA-MASHINA: <что
меняет>` (ручной стенд, меняет живое) и `# ZHIVAYA-MASHINA-NET: <чем подменено>` (живого не трогает). В сводке обхода — строки
«⚠️ С1: <стенд>» с первыми находками, «С1 (предупреждение, не красное): …», «NET без проверки С2 (@root): N» (объявление NET у стенда
@root С2 проверить не может). Код обхода С1 не меняет.

**С2 — обнаружение после, не защита.** Каждый стенд идёт в своём `sudo -n systemd-run --scope --unit=obhod-stend-<pid>-<N>` через
`setpriv` с теми же uid, gid, группами и umask; среда передаётся файлом 0600 в рабочем каталоге прогона (в командной строке её
увидели бы все). После прогона один запрос `sudo -n journalctl` по окну прогона судит записи sudo и shadow-utils каждого юнита
по правилам С1. Находка — «🔴 С2: стенд <путь> изменил живую машину». Стоп и сброс своих временных юнитов (`systemd-run --unit=`
из того же стенда) находкой не считаются. Зрячесть проверяется каждым прогоном: юнит №0 зовёт `sudo -n /usr/bin/true obhod-stend-<pid>-0`; его записи в журнале
нет или scope не поднялся — «СЛЕПОТА С2». С 3.1.9 запрос берёт записи и по `SYSLOG_IDENTIFIER`: journald, принявший запись
после выхода процесса, кладёт её без `_COMM` и `_SYSTEMD_UNIT`. Пробу зрячести узнаём по метке прогона; прочие такие записи своей
учётки и shadow-utils считаются («записей без привязки к юниту N»), меняющая из них — «⚠️ С2 БЕЗ ПРИВЯЗКИ», код 2: источник не установить —
стенд обхода или иной процесс той же учётки (например, служба агента), работавший в окне прогона.
Собственный запрос С2 вложенного обходчика (точная форма целиком) находкой не считается; прочие `journalctl` — на суде сканера. С2 не видит действий стендов @root (всё внутри идёт от root без своей записи sudo, кроме
shadow-utils), команд внутри `sudo bash <скрипт>` и действий в отдельных юнитах, которые стенд поднимает сам (`systemd-run` без
`--scope`).

**Живые стенды — только с ключом** (их два: `stend-vzaimnogo-nabludeniya.sh` и `stend-needrestart.sh`). `stend-vzaimnogo-nabludeniya.sh` без `--zhivaya-mashina` отказывает строкой
«ОТКАЗ-ZHIVAYA-MASHINA», кодом 2 и ничего не трогает; с ключом он на секунды останавливает боевой `agent-watchdog.timer`
(отключается `BEZ_PORCHI_PREDMETA=1`). Ключ подаёт только недельный обход: `vse-stendy-nedelnye.sh` задаёт свои `OBLAST_STENDOV`,
`PERECHEN_STENDOV`, `PREDEL_STENDOV` и `SREDA_STENDOV`, а `SREDA_STENDOV` целиком замещает умолчание обходчика и подаёт ключ
поимённо (хвост строки после `--`). Ночной обход и ворота выпуска ключ не подают. С2-находки стенда под ключом печатаются
строкой «ЖИВОЙ ПО КЛЮЧУ: …» и красными не считаются.

Стенды, которые сами поднимают временные юниты: `stend-reestra-agentov.sh` — `sudo -n systemd-run --unit=b1890s<pid>-<агент>
-p RuntimeDirectory=…` для трёх проб гостя (нет `sudo -n` — пробы пропускаются); `stendy/stend-razbora-env.sh` (@root) — через
`stend-razbora-env.py` временные `systemd-run --wait --pipe`. Их действия внутри этих юнитов С2 по стенду не видит.

Коды обходчика: 0 — чисто; 3 — только ожидаемое (исключения действуют); 1 — неожиданное: красный или слепой стенд без
исключения, просроченное или неподтверждённое исключение, охват разошёлся с перечнем, **находка С2** (исключения её не снимают);
2 — полнота неустановима: стендов нет, перечня нет, файл исключений не прочитан, **С2 слеп** (если нет причины для 1).

## Проверка

Сумма каждого файла пакета = сумма боя (`sha256sum`), права = таблице (`stat -c '%a %U:%G'`); исход обхода — читатель `chitatel-obhoda`.
