# Вызов слоя Б из установщика А

Основа назначена Забавой 14.10.2026 19:55:55Z: main `46060c3efc19a3e5cb740415cdfb601d126c29fd`. `source-lock` А должен закрепить тот же SHA и соответствующий архив. Отсутствие его обновления не отменяет прямого назначения, но установку с прежним stable SHA слой Б отвергнет.

Владелец installer/layout и его композиционных проб — Альфа. Гамма не меняет её файлы. Прежний patch на a2 удалён из этого комплекта; приведённый ниже API заменяет его.

```python
sys.path.insert(0, str(PACKAGE / 'runtime'))
from part_b_layout import overlay
adapted = overlay(lock, dict(raw_entries))
```

`raw_entries` — полный проверенный mapping `PurePosixPath -> (kind, mode, content)` после явно объявленных исключений источника А. `overlay` возвращает новый полный mapping; исходные mapping/lock не изменяет. Изменяются только восемь файлов под `skills/autopilot/`, перечисленных в `part-b-lock.json`. Нет сетевых вызовов, subprocess, записи или исполнения upstream. Старый `release_entries` оставлен внутренним помощником с skill-relative результатом; installer должен вызывать именно `overlay`.

В `source-lock` нужны новый `local_revision` с компонентом `b4` и `part_b_manifest_sha256` — SHA256 точных байтов manifest Б. Префикс местной версии выбирается от актуальной А, например `a6-b4`; пример не разрешает откат номера А. Формат parent `release.json` остаётся договором А, отдельное schema-поле не добавляется.

Installer пишет `sources/<sha>` из `raw_entries`, а release skill — из `adapted` с удалением префикса `skills/autopilot`. Master-only guard А добавляется **после overlay AP**, перед любым runtime import. Historical cache исключается по договору А; код Б это не выдаёт за исполненный или проверенный upstream. `release.json` находится рядом со skill. Данные публикуются только после полной раскладки, затем переключается current. Root не запускает AP/publisher.

Для поставки Б нужны `runtime/`, `overlay/`, `part-b-lock.json`, `patches/part-b-upstream.patch`, `OVERLAY-INTEGRATION.md` и документы `B-*.md`. В release из них попадают только шесть phase-файлов, AP и `ap_sadik.py`; build-helper `part_b_layout.py` не является runtime-командой. Полный список, before/result SHA и режимы — в manifest.

Root/layout/caller и accepted integration проверяются отдельными пробами А: raw source неизменён, Б присутствует в release, root/иной UID отвергается до I/O, operator export/resume работают, повтор и repair идемпотентны, выключение caller краснит композицию, возврат снова зелёный. Авторские runtime/full-map пробы Б этих ворот не заменяют.

Права согласованы окончательным письмом Забавы 19:34:57Z: public-root `2751 root:autopilot-view`, operator-root `2750 master:autopilot-view`, master без reader membership. Worker Б выставляет umask027, mkdir наследует SGID/GID без chmod каталогов, файлы получают0640 до rename. Заранее созданный раздел обязателен; exporter его не заводит.

## Обнаруженный блокер свежего guard А6

После собственных прогонов с guard А5/f56980… на диске Альфы появился guard А6/83910bb1…. Его command allowlist пока не содержит `commits` и `resume`: на собственной копии перед AP оба получили2/unsupported subcommand, ledger не менялся. Обычный `sync` из нового current успешно передал управление старому pin; предположение о его блокировке проверкой physicalpath не подтвердилось.

Это блокер **общей композиции А6+Б**, не отсутствие команд в AP/strict parser Б. Guard не входит в артефакт Б и чужой рукой не менялся. Перед монтажом Альфа должна согласовать поддержку этих команд, сохранив свои проверки роли/безопасности, и повторить композиционные пробы. Нельзя обходить или молча вырезать её guard. Точная авторская compatibility-проба: evidence/ALPHA-A6-GUARD-COMPATIBILITY.json/log в каталоге сдачи. Таблица33/30/2/2 использовала конкретный guard А5, а не объявляет А6 совместимым.
