# Настройки · Settings

Настройки задаются в cordis YAML (профиль или пресет агента) в блоке `config`; схема — `Config` в `src/index.js` (schemastery). Переменных окружения пакет не читает. Поля `predel`, `poryadok`, `porogVery` можно передать и в сам вызов `otobrat(...)` — тогда они действуют только на этот вызов.

Settings are set in cordis YAML (agent profile or preset) in the `config` block; the schema is `Config` in `src/index.js` (schemastery). The package reads no environment variables. The `predel`, `poryadok`, `porogVery` fields can also be passed to an `otobrat(...)` call — then they apply to that call only.

```yaml
- insert:
    - name: dsh-pamyat-byudzhet
      id: dsh-pamyat-byudzhet
      config:
        predel: 2000
        poryadok: svezhest
        porogVery: 0.5
```

## `predel`

| Тип · Type | Умолчание · Default | Допуск · Valid range | Пример · Example |
|---|---|---|---|
| number | 2000 | ≥ 0, конечное · finite | `predel: 1500` |

Предел подъёма в единицах нашей меры (одна единица ≈ 4 символа содержимого и служебных полей). Отбор поднимает записи, пока их суммарная цена не превышает предела.

The raise limit in units of our measure (one unit ≈ 4 characters of content and service fields). Selection raises records while their total cost stays within the limit.

**Что сломается при неверном · What breaks if wrong:** отрицательное число, `NaN`, строка — отклоняются строкой «ОТКЛОНЕНО: predel = … — вне допуска [0, ∞); действует …», и действует прежнее годное (при старте — 2000). `0` — законно: не поднимается ничего, и это печатается отдельной строкой. Слишком малый предел — записи дороже предела попадут в причину «НЕ ВЛЕЗАЮТ ЦЕЛИКОМ» и не поднимутся никогда.

A negative number, `NaN`, a string — rejected with "ОТКЛОНЕНО: predel = … — вне допуска [0, ∞); действует …" (REJECTED … out of range; in force …), and the previous valid value applies (2000 at start-up). `0` is legitimate: nothing is raised, and a separate line says so. A too small limit — records costlier than the limit fall under "НЕ ВЛЕЗАЮТ ЦЕЛИКОМ" (do not fit at all) and are never raised.

## `poryadok`

| Тип · Type | Умолчание · Default | Допуск · Valid values | Пример · Example |
|---|---|---|---|
| string | `svezhest` | `svezhest`, `vera` | `poryadok: vera` |

Порядок важности: `svezhest` — новые записи впереди (по полю `sozdano`); `vera` — записи с высокой верой впереди, неизмеренная вера (`null`) — после высоких и перед низкими.

Importance order: `svezhest` — newest records first (by the `sozdano` field); `vera` — records with high confidence first, unmeasured confidence (`null`) after high and before low ones.

**Что сломается при неверном · What breaks if wrong:** неизвестное значение («svezhost») отклоняется при монтаже строкой «ОТКЛОНЕНО: poryadok = "svezhost" — есть только svezhest, vera; действует …»: в силе прежний годный порядок или умолчание `svezhest`. При `svezhest` время рождения берётся из `sozdano`, иначе из `kogda`; записи без обоих — ключ 0, в конце, в порядке входа.

An unknown value ("svezhost") is rejected at mount with an "ОТКЛОНЕНО: poryadok = "svezhost" — есть только svezhest, vera; действует …" line: the previous valid order or the default `svezhest` stays in force. Under `svezhest` the birth time is taken from `sozdano`, otherwise from `kogda`; records with neither — key 0, at the end, in input order.

## `porogVery`

| Тип · Type | Умолчание · Default | Допуск · Valid range | Пример · Example |
|---|---|---|---|
| number | 0.5 | [0, 1] | `porogVery: 0.6` |

Порог «низкой» веры. Используется **только для объяснения**: в сводке среди свойств отброшенных печатается «с верой ниже <порог>: N». На отбор не влияет ни при каком порядке.

The "low" confidence threshold. Used **only for explanation**: the summary lists "с верой ниже <threshold>: N" (with confidence below) among the properties of the dropped. It does not affect selection under any order.

**Что сломается при неверном · What breaks if wrong:** значение вне [0, 1] или не число — «ОТКЛОНЕНО: porogVery = …», действует прежнее годное (при старте — 0.5). Неудачный, но допустимый порог только меняет объяснение, не отбор.

A value outside [0, 1] or not a number — "ОТКЛОНЕНО: porogVery = …", the previous valid value applies (0.5 at start-up). A poor but valid threshold only changes the explanation, not the selection.

## Постоянные кода · Code constants

Это не настройки: меняются только правкой кода, потому что разные узлы обязаны считать одинаково.

These are not settings: they change only by editing the code, because different nodes must count the same way.

| Постоянная · Constant | Значение · Value | Где · Where | Что значит · Meaning |
|---|---|---|---|
| `SIMVOLOV_NA_EDINICU` | 4 | `src/mera.js` | символов на единицу нашей меры · characters per unit of our measure |
| `PORYADKI` | `['svezhest', 'vera']` | `src/otbor.js` | допустимые порядки · valid orders |
| `POLURASPAD_MS` | 14 суток · days | `src/teplo.js` | полураспад тепла (гипотеза) · warmth half-life (hypothesis) |
| `POROG_HOLODNOJ` | 0.25 | `src/teplo.js` | порог «холодной» (гипотеза; его же берёт сводка отбора в `src/otbor.js`) · "cold" threshold (hypothesis; the selection summary in `src/otbor.js` uses the same constant) |
| `VES_KASANIYA` | 0 | `src/teplo.js` | вес касания в тепле — выключен · touch weight in warmth — off |

## Поля записи · Record fields

Что пакет читает из записей, которые передаёт вызывающий:

What the package reads from records passed by the caller:

| Поле · Field | Для чего · Used for |
|---|---|
| `soderzhim`, `klass`, `istochnik` | цена записи (`ocenit`) · record cost |
| `sozdano` | порядок `svezhest` и тепло · `svezhest` order and warmth |
| `kogda` | тепло и порядок `svezhest` (синоним `sozdano` от слоя восстановления; `sozdano` важнее) · warmth and the `svezhest` order (synonym of `sozdano` from the restore layer; `sozdano` takes precedence) |
| `vera` | порядок `vera`; свойства отброшенных · `vera` order; properties of the dropped |
| `kasanij`, `poslednee_kasanie` | входы касаний в строке тепла (на отбор не влияют) · touch inputs in the warmth line (no effect on selection) |
