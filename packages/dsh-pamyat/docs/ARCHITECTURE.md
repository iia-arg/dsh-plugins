# Устройство · Architecture — dsh-pamyat

## Из чего состоит пакет · What the package is made of

| Файл · File | Роль · Role |
|---|---|
| `package.json` | объявляет членов набора зависимостями в точных версиях · declares the members as dependencies at exact versions |
| `sostav.json` | для каждого члена: версия, сумма предмета, число файлов; способ счёта · per member: version, subject checksum, file count; how it was counted |
| `summa-predmeta-2` | единственная реализация способа счёта суммы предмета (bash) · the only implementation of the subject-checksum method (bash) |
| `test/stend-sostava.mjs` | стенд: сверяет объявление с фактом, 11 проб · the stand: checks declaration against facts, 11 probes |
| `README.md`, `README.en.md` | описание; оба обязаны называть состав поимённо и поверсионно · description; both must list the composition by name and version |

В пакете нет кода, который исполняется в сессии агента. Всё, что в нём «работает», — это стенд и инструмент счёта, и оба запускаются человеком или обходом стендов.

The package has no code that runs inside an agent session. Everything that "runs" in it is the stand and the counting tool, and both are started by a person or by a stand sweep.

## Поток проверки · Verification flow

```mermaid
flowchart TD
    A["npm test<br/>запуск стенда · run the stand"] --> B{"Найдены инструмент и соседи?<br/>Tool and siblings found?"}
    B -- "нет · no" --> BL["проба 1 краснеет как слепота<br/>probe 1 fails as blindness"]
    B -- "да · yes" --> C["summa-predmeta-2 --kontrol<br/>контроль зрячести инструмента · tool sight check"]
    C --> D["sha256 инструмента = sostav.json?<br/>tool sha256 matches sostav.json?"]
    D --> E["dependencies = точный номер = составу = версии члена в дереве<br/>exact version = composition = member version in the tree; no ranges"]
    E --> F["распаковать архив члена → summa-predmeta-2<br/>unpack member archive → summa-predmeta-2"]
    F --> G["сумма и число файлов = sostav.json?<br/>checksum and file count match?"]
    G --> H["версия = установленный плагин?<br/>version = installed plugin?"]
    H --> I["всё читаемое стендом есть в npm pack?<br/>everything the stand reads is in npm pack?"]
    I --> J["README.md и README.en.md называют состав?<br/>both READMEs list the composition?"]
    J --> K["итог и код возврата 0/1/2<br/>total and exit code 0/1/2"]
    BL --> K
```

## Один прогон · One run

```mermaid
sequenceDiagram
    participant U as Человек или обход · Person or sweep
    participant S as Стенд · Stand
    participant T as summa-predmeta-2
    participant P as Полка архивов · Archive shelf
    participant I as Установленные плагины · Installed plugins
    U->>S: npm test
    S->>T: --kontrol
    T-->>S: «контроль зрячести: ПРОЙДЕН» · "sight check: PASSED"
    loop каждый член · each member
        S->>P: tar xzf <пакет-версия>.tgz
        S->>T: <распакованный каталог · unpacked dir>
        T-->>S: <сумма> файлов N · <checksum> files N
        S->>I: <пакет>/package.json → version
    end
    S-->>U: ✅/❌ по каждой пробе, итог N из 11, код 0/1/2 · per-probe ✅/❌, total N of 11, exit 0/1/2
```

## Как стенд находит соседей · How the stand finds its siblings

Стенд не знает заранее, где он запущен, и пробует раскладки по очереди. Инструмент и соседние пакеты ищутся **отдельно** — это разные вопросы, и у получателя пакета из реестра они лежат в разных местах.

The stand does not know in advance where it runs and tries layouts in turn. The tool and the sibling packages are looked up **separately** — they are different questions, and for someone installing from a registry they live in different places.

| Что ищется · What | Где пробуется, по порядку · Tried where, in order |
|---|---|
| `summa-predmeta-2` | внутри пакета → рядом с пакетом → в корне дерева · inside the package → next to it → at the tree root |
| соседи (`dsh-pamyat-core/package.json`) · siblings | родительский каталог (ящик поставки, `node_modules`) → дерево `packages/` · parent dir (delivery box, `node_modules`) → `packages/` tree |

Найденное печатается первыми строками прогона: без этого непонятно, о какой раскладке говорят числа.

What was found is printed in the first lines of the run: otherwise it is unclear which layout the numbers describe.

## Решение о коде возврата · Exit-code decision

```mermaid
stateDiagram-v2
    [*] --> Все_прошли: все пробы ✅ · all probes ✅
    [*] --> Есть_провал: хоть одна ❌ · any ❌
    Все_прошли --> Код0: exit 0
    Есть_провал --> Код1: есть провал по существу · a substantive failure
    Есть_провал --> Код2: все провалы — пробы, требующие соседей, и соседей нет · all failures need siblings and none were found
    Код0 --> [*]
    Код1 --> [*]
    Код2 --> [*]
```

Провал не считается «по существу» в двух случаях: проба требует соседей, а дерева семейства нет, — или сама проба назвала провал «СЛЕПОТА» (нет полки, каталога установки, инструмент сумм или `npm pack` не исполнились). Всё остальное — по существу. Расхождение важнее слепоты — хоть один провал по существу даёт код 1; одни слепые провалы — код 2.

A failure is not "substantive" in two cases: the probe needs siblings and the family tree is not found — or the probe itself named the failure "СЛЕПОТА" (blindness: no shelf, no installation directory, the checksum tool or `npm pack` did not run). Everything else is substantive. Divergence outranks blindness — a single substantive failure yields exit code 1; blind failures alone yield exit code 2.

⚠️ Следствие этого правила: если соседи найдены, а нет полки архивов или каталога установленных плагинов, проба пишет «СЛЕПОТА», по существу не считается, и стенд возвращает 2, если других провалов нет (см. [GUARDS.md](GUARDS.md#kody)).

⚠️ A consequence of this rule: if siblings are found but the archive shelf or the installed-plugins directory is missing, the probe says "СЛЕПОТА" (blindness), is not counted as substantive, and the stand exits with 2 when there are no other failures (see [GUARDS.md](GUARDS.md#kody)).

## Временные файлы · Temporary files

Стенд распаковывает архивы во временный каталог и убирает его на любом выходе: обычном, падении пробы, `process.exit`, SIGTERM и SIGINT. От SIGKILL не защищает ничто.

The stand unpacks archives into a temporary directory and removes it on any exit: normal, a failing probe, `process.exit`, SIGTERM and SIGINT. Nothing protects against SIGKILL.
