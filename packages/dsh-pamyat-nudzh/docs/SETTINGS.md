# Настройки · Settings

Пакет настраивается тремя ключами в блоке `config` плагина (cordis YAML профиля или пресета агента). Переменных окружения и файлов настроек у пакета нет. Схема (`Config` в `src/index.js`) знает только типы; границы значений проверяет `apply` при каждом вызове — и при старте, и при горячей загрузке (правка настройки без перезапуска процесса).

The package is configured by three keys in the plugin's `config` block (the cordis YAML of the agent's profile or preset). The package has no environment variables and no settings files. The schema (`Config` in `src/index.js`) knows only types; value bounds are checked by `apply` on every call — both at start-up and on hot reload (a settings edit without restarting the process).

```yaml
- insert:
    - name: dsh-pamyat-nudzh
      id: dsh-pamyat-nudzh
      config:
        predel: 1000000
        dolyaTrevogi: 0.8
        otmetkiPuti: [0.5, 0.6, 0.7]
```

С этими значениями порог тревоги — 800 000 токенов занятости, отметки печатаются на 500 000, 600 000 и 700 000.

With these values the alarm threshold is 800,000 tokens of occupancy, marks are printed at 500,000, 600,000 and 700,000.

## `predel`

| | |
|---|---|
| тип · type | число · number |
| умолчание · default | 0 |
| допуск · range | [0, ∞), конечное · finite |
| при негодном · if invalid | «ОТКЛОНЕНО: predel = … — вне допуска [0, ∞); действует …» |

Предел контекста — окно модели в токенах провайдера, то самое число, с которым сравнивается занятость. Ставьте **объявленное** окно модели: занятость сравнивается с ним напрямую, а защита от недостоверного счёта срабатывает выше полутора `predel`. `0` — предел неизвестен: пакет считает расход, отвечает «неизвестно», печатает при подъёме «предел контекста НЕ ЗАДАН (predel: 0) …» и не вставляет напоминаний вовсе.

The context limit is the model window in provider tokens, the very number occupancy is compared with. Set the model's **declared** window: occupancy is compared with it directly, and the non-credible count guard fires above one and a half `predel`. `0` means the limit is unknown: the package counts spend, answers "unknown", prints "предел контекста НЕ ЗАДАН (predel: 0) …" (context limit NOT SET) at start-up and inserts no reminders at all.

Строка отказа, снятая с модуля · A rejection line taken from the module:

```text
[dsh-pamyat-nudzh <версия>] ОТКЛОНЕНО: predel = -1 — вне допуска [0, ∞); действует 1000 (прежнее годное).
```

## `dolyaTrevogi`

| | |
|---|---|
| тип · type | число · number |
| умолчание · default | 0.8 |
| допуск · range | (0, 1] |
| при негодном · if invalid | «ОТКЛОНЕНО: dolyaTrevogi = … — вне допуска (0, 1]; действует …» |

Доля предела, с которой пора подталкивать: порог = `predel × dolyaTrevogi`, сравнение «не меньше». `1` — подталкивать только при полном окне, что на практике поздно: занятость известна после вызова, а отказ по длине случается на вызове. Ноль и отрицательные значения отклоняются: «подталкивать всегда» — это не настройка, а шум.

The fraction of the limit from which to nudge: threshold = `predel × dolyaTrevogi`, compared with "at least". `1` means nudging only at a full window, which in practice is too late: occupancy is known after a call, while a length rejection happens at the call. Zero and negative values are rejected: "always nudge" is not a setting but noise.

```text
[dsh-pamyat-nudzh <версия>] ОТКЛОНЕНО: dolyaTrevogi = 7 — вне допуска (0, 1]; действует 0.8 (прежнее годное).
```

## `otmetkiPuti`

| | |
|---|---|
| тип · type | массив чисел · array of numbers |
| умолчание · default | `[]` |
| годные значения · valid values | строго между 0 и 1 · strictly between 0 and 1 |
| при негодном · if invalid | отбрасывается со строкой «ОТКЛОНЕНО: otmetkiPuti — вне допуска (0, 1) отброшены …; действуют …» · dropped with an "ОТКЛОНЕНО" line naming the dropped and the effective marks |

Отметки пути — доли предела, при пересечении которых печатается строка «отметка пути N%: занято … из …». Это наблюдение, а не тревога: на поведение пакета отметки не влияют, вставок не делают. Каждая отметка печатается один раз за цикл и сбрасывается вместе с тревогой. Отметка выше `dolyaTrevogi` тоже печатается. Порядок в настройке не важен: отметки сортируются по возрастанию.

Path marks are fractions of the limit at which a line "отметка пути N%: занято … из …" (path mark N%: occupied … of …) is printed. They are an observation, not an alarm: marks do not influence the package's behaviour and make no insertions. Each mark is printed once per cycle and is reset together with the alarm. A mark above `dolyaTrevogi` is printed too. Order in the settings does not matter: marks are sorted ascending.

Значения вне (0, 1) отбрасываются в `apply` со строкой «ОТКЛОНЕНО», как у `predel` и `dolyaTrevogi` (с 0.1.0-alpha.25 — прежняя нумерация, выпуск 3.1.1 это уже содержит; прежде — молча: `otmetkiPuti: [0.5, 1.5]` давала строку только для 50 %). Опечатка в процентах (`[50, 60]` вместо `[0.5, 0.6]`) теперь видна строкой «отброшены 50, 60; действуют никакие». Проверка: после перехода нужной доли в журнале должна быть строка «отметка пути».

Values outside (0, 1) are dropped in `apply` with an "ОТКЛОНЕНО" line, as for `predel` and `dolyaTrevogi` (since 0.1.0-alpha.25 — old numbering, release 3.1.1 already includes this; previously silently: `otmetkiPuti: [0.5, 1.5]` gave a line only for 50 %). A typo in percent (`[50, 60]` instead of `[0.5, 0.6]`) is now visible as "отброшены 50, 60; действуют никакие". Check: after the fraction is crossed, there must be an "отметка пути" line in the log.

Цена отметок замерена 05.09.2026: журнал службы — 17 665 строк в сутки при 274 ходах; шесть отметок на цикл при семи циклах в сутки дают около 42 строк, то есть 0,24 % журнала.

The cost of marks was measured on 05.09.2026: the service log has 17,665 lines a day at 274 turns; six marks per cycle at seven cycles a day give about 42 lines, i.e. 0.24 % of the log.

## Прежнее годное · The previous valid value

Негодное значение не принимается: действует прежнее годное, а если его ещё не было — умолчание. Прежнее годное хранится на уровне модуля, потому что при правке настройки без смены имени загрузчик cordis модуль не перечитывает и зовёт `apply` заново. Одно значение на процесс: если разные узлы одного процесса зададут разные пороги, «прежним годным» станет последнее принятое у любого из них.

An invalid value is not accepted: the previous valid value stays in force, or the default if there was none. The previous valid value is stored at module level, because on a settings edit without a name change the cordis loader does not re-read the module and calls `apply` again. One value per process: if different nodes of one process set different thresholds, the "previous valid" becomes the last one accepted from any of them.

## Постоянные кода · Code constants

| имя · name | значение · value | где · where | смысл · meaning |
|---|---|---|---|
| `NEVOZMOZHNO` | 1.5 | `src/index.js` | занятость больше `predel × 1.5` объявляется недостоверной: тревога не подаётся · occupancy above `predel × 1.5` is declared non-credible: no alarm |
| состав входа · input composition | `inputTokens + cacheReadTokens + cacheWriteTokens` | `src/schet.js` | контракт провайдера (DISJOINT), а не выбор · the provider contract (DISJOINT), not a choice |

Это не настройки сознательно: состав суммы — свойство контракта провайдера, а запас недостоверности защищает от ложных тревог, которые иначе толкали бы к компакту, которому нечего сжимать.

These are deliberately not settings: the sum's composition is a property of the provider contract, and the non-credibility margin protects against false alarms that would otherwise push towards a compaction with nothing to compress.
