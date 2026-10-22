# Снимок расхода для панели — schema1

Вызывающий writer — Мастер, после завершённой волны и перед финальной приёмкой. Команда выполняется через ap.py закреплённой версии0.1.7 из рабочего проекта. Новые прогоны получают её приinit; существующие pins автоматически не меняются.

1. Codex сохраняет принятый маршрут: Мастер меряет собственные источники и вызывает writer своего run.
2. Claude измеряет только координатор/root снаружи хода: `python3 -I -B <physical-release>/tools/measure-run-claude-root.py --run-id RUN`. Вход получает все AP envelope.run задания из mail, точные receipt/claimed_turn, реальные границы DSH и parent/recursive child SDK set. Модель не поставляет числа/границы/request IDs. Root не запускает writer или модель.
3. Root публикует `/var/lib/autopilot-usage/RUN/public/claude.json`, UID0:0644, protected root ancestors/public0755. Координатор передаёт PATH следующим ходом в исходную сессию Мастера. Мастер из того же проекта вызывает `.autopilot/ap.py --no-serve usage claude --snapshot PATH`. Claude UID0-only; Codex root-or-selfUID. Письмо — триггер, не источник чисел/полномочий.
4. Writer проверяет flat v1/runId/счёт/окно/свежесть, меняет только выбранную приватную корзину; lock/save/rev/export остаются штатными. Правильность чисел подтверждается отдельно root-чтением источников. Оба барьера показа Claude в AP017 сохранены.

Пример числовой коллекции Codex (вместо угловых параметров — точные данные своего закреплённогоrun; не исполнять как готовую боевую пробу):

```bash
umask 077
timeout -k 2s 60s python3 <physical-release>/tools/measure-run-codex.py \
  --measure-run /opt/autopilot/sources/9fc898cbe941d5b8a369f1dd657e9119676eb44f/tools/measure-run.py \
  --codex-home /var/lib/coder-gateway-master/codex-home --potok <thread-id> \
  --s <start-UTC> --po <last-completed-end-UTC> --snapshot-json --run-id <_sadik.run_id> > <private-codex.json>
python3 .autopilot/ap.py --no-serve usage codex --snapshot <private-codex.json>
```

Claude в этом выпуске НЕ публикуется и не рисуется даже при observed. Для показа нужны одна наблюдаемая живая root→Master writer проба, внешнее принятие и следующий пакетный выпуск со снятием обоих барьеров. Исторический G0/copy это не заменяют.

`--g0-record DIR` — отдельная ветка root-входа для настоящего исторического pusk/book с совпавшей SHA письма. Ручной G0-манифест не аттестует обычный AP run. Legacy builder0b/reader G0 команды остаются диагностикой, не новым caller. Полный контракт, ограничения и формат времени — [FORMAT-CONTRACT.md](../FORMAT-CONTRACT.md).


```bash
umask 077
timeout -k 2s 60s python3 <physical-release>/tools/measure-run-claude.py --manifest <private-manifest.json> > <private-claude.json>
```

Master после получения числового файла: `python3 .autopilot/ap.py --no-serve usage claude --snapshot <private-claude.json>`. Не объединять эти команды через `&&` дляrc2: incomplete/not_measured — не успешный замер, но валидный matching-run снимок сnull можно по явному решению записать. stdoutreader одинJSON; подробностиClaude только отдельным `--details` вstderr и не идут вstate/панель.

Поля wire и state: `{schemaVersion:1,runId,byEngine:{codex|claude:{status,measuredAt,windowStart,windowEnd,source,scope,coverage,modelCalls,inputTokens,uncachedInputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}}}`. Wire содержит один engine; приватный state содержит оба, public — только Codex до отдельного принятого включения Claude. Снимок файла≤16KiB, regular/single-link, владелец root для Claude, текущийUIDилиroot для Codex, без group/worldwrite и ссылок в пути. Весь JSON строгий, duplicate/nonfinite/unknown отказывают.

Числа0..9007199254740991, bool не число. Вход полный = uncached+read+write; Codexсыройinput уже включаеткеш, повторно его не прибавляют. Outputвключаетthinking/reasoning. observed требует все6чисел, UTCметки и окноstart<end≤measuredAt. incomplete/not_measured дают6null; отсутствие источника не становится нулём. Дата/окно индивидуальны дляengine. Source/scope/coverage — фиксированныеenum, не произвольные пути, команды или body.

Codexпокрытие root_gateway_only/root_gateway_and_children: gatewayсверка только корневого потока, дети — найденные потомки, наблюдённые записи; не биллинг провайдера и не другие почтовыеHOME. Claude: declared_parent_and_children требует children=explicit и доказанной полноты SDK-spawn дерева; пропущенный потомок даёт incomplete/null. declared_parent_only допустим только при явном children=excluded и не заявляет полноты детей. Посторонние сессии вне заданного run остаются вне области. Writerне исправляетсемантическиложное,нотипизированноечисло: сравнение16→27делает отдельныйsourceoracle.

Панель использует только публичный Codex numericstate; приватный Claude в неё не попадает. Текстовый старыйcounterreport по-прежнему самостоятельная диагностика и не разбирается какмашинныйAPI. Поля usage добавлены вpublicschema; неизвестное отображается «не измерено», корректный измеренный0 —0. Реальныйcollector/writerвживомrun запускаетназначеннаярукапослемонтажа, авторскиепробырелизанеявляютсятакимпуском.

Прежнее предложение Sova-export T1/T2/T3 не является активным путём этого выпуска: принят прямой root-сбор из источников, поэтому дополнительного export-хода нет. Original-Master-session и след штатного usage claude проверяет координатор в живой приёмке; отдельного автоматического ingest/threadguard этот пакет не добавляет.
