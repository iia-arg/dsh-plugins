# Настройки · Settings — dsh-pamyat

У метапакета нет настроек времени работы: он ничего не исполняет в сессии агента. «Настройки» здесь — это данные, которыми набор объявляет себя, и одна переменная окружения стенда. Имена ключей оставлены как в коде: это интерфейс.

The metapackage has no runtime settings: it executes nothing inside an agent session. "Settings" here are the data by which the set declares itself, plus one stand environment variable. Key names are kept as in the code: they are the interface.

<a id="dependencies"></a>
## `package.json` → `dependencies`

| Поле · Field | Тип · Type | Умолчание · Default | Что значит · Meaning |
|---|---|---|---|
| `<имя члена · member name>` | строка · string | нет · none | точный номер члена, равный `versiya` в составе и версии члена в дереве (A-N-1873) · the member's exact version, equal to `versiya` in the composition and to the member version in the tree |

Пример · Example:

```json
"dsh-pamyat-core": "1.1.109"
```

**Что сломается при неверном · What breaks if wrong.** Версия не та, что в `sostav.json`, не равна версии члена в дереве, член отсутствует в дереве или лишний член — краснеет проба «зависимости = точные номера членов: равны составу и версии члена в дереве». Диапазон (`^`, `~`, `*`, `>`, `<`, `x` как целый разряд) — краснеет проба «версии точные».

A version different from `sostav.json` or from the member version in the tree, a member missing from the tree, or an extra member fails the probe "dependencies are exact member versions equal to the composition and the member version in the tree". A range (`^`, `~`, `*`, `>`, `<`, `x` as a whole version part) fails the probe "versions are exact".

<a id="sostav"></a>
## `sostav.json` → `sostav[]`

| Поле · Field | Тип · Type | Обязательно · Required | Что значит · Meaning | Что сломается · What breaks |
|---|---|---|---|---|
| `paket` | строка · string | да · yes | имя члена · member name | несовпадение с `dependencies` · mismatch with `dependencies` |
| `versiya` | строка · string | да · yes | точная версия · exact version | пробы версий, сумм и README · version, checksum and README probes |
| `predmet` | 16 hex | да · yes | сумма предмета по `summa-predmeta-2` · subject checksum by `summa-predmeta-2` | проба «суммы предметов» · "subject checksums" probe |
| `faylov` | число · number | да · yes | число файлов предмета, из того же вызова инструмента · subject file count, from the same tool call | проба «число файлов» · "file count" probe |
| `prob` | число или `null` · number or `null` | нет · no | число проб стендов члена; `null` — не снималось (пустота ≠ ноль) · member stand probe count; `null` — not measured (empty ≠ zero) | ничего не проверяет · nothing checks it |
| `katalog` | путь · path | нет · no | член ставится каталогом, а не архивом; сумма считается по каталогу · the member is installed as a directory, not an archive; the checksum is computed over the directory | в `dependencies` — точный номер, как у остальных (A-N-1873); каталог нужен только сверке суммы · `dependencies` hold the exact version like the others; the directory is used only for checksum verification |
| `pochemu_katalog` | строка · string | нет · no | объяснение, почему каталог · explanation why a directory | — |

Числа `predmet` и `faylov` никогда не пишутся рукой: их снимает `summa-predmeta-2` по распакованному архиву (или каталогу) члена.

The `predmet` and `faylov` numbers are never typed by hand: `summa-predmeta-2` produces them from the member's unpacked archive (or directory).

<a id="kak_schitano"></a>
## `sostav.json` → `kak_schitano`

| Поле · Field | Что значит · Meaning |
|---|---|
| `instrument` | имя инструмента счёта · counting tool name (`summa-predmeta-2`) |
| `summa_instrumenta` | первые 16 знаков sha256 самого файла инструмента · first 16 hex of the tool file's sha256 |
| `kontrol` | как убедиться, что инструмент видит правку · how to confirm the tool notices an edit (`summa-predmeta-2 --kontrol`) |
| `pochemu_ne_prozoy` | почему способ живёт файлом, а не описанием · why the method lives in a file, not in prose |
| прочие текстовые поля · other text fields | пояснения к числам, читаются людьми · explanations for humans |

Проба «состав называет способ» требует первые четыре поля. Проба «сумма инструмента» сверяет `summa_instrumenta` с файлом на диске: инструмент, исправленный на месте, краснеет.

The "composition names its method" probe requires the first four fields. The "tool checksum" probe compares `summa_instrumenta` with the file on disk: a tool edited in place fails.

<a id="stend_boj"></a>
## Переменные окружения стенда · Stand environment variables

| Имя · Name | Тип · Type | Умолчание · Default | Что значит · Meaning |
|---|---|---|---|
| `STEND_POLKA` | путь к каталогу · directory path | нет — обязательна · none — required | полка архивов членов набора (`<полка>/<пакет>-<версия>.tgz`) · the shelf of set member archives (`<shelf>/<package>-<version>.tgz`) |
| `STEND_PLAGINY` | путь к каталогу · directory path | нет — обязательна · none — required | каталог установленных плагинов; его `node_modules` — установка, с которой сверяются версии; поле `katalog` в `sostav.json` — путь относительно него · the installed-plugins directory; its `node_modules` is the installation versions are compared with; the `katalog` field in `sostav.json` is relative to it |
| `STEND_BOJ` | путь к каталогу · directory path | `$STEND_PLAGINY/node_modules` | подменяет только каталог установки для сверки версий · overrides only the installation directory used for the version comparison |

Пример · Example: `STEND_POLKA=<archive-shelf> STEND_PLAGINY=<plugins-dir> npm test`

**Что сломается при неверном · What breaks if wrong.** `STEND_POLKA` или `STEND_PLAGINY` не задана — стенд до всех проб пишет «СЛЕПОТА: не задана …» с именем переменной и выходит с кодом 2. Каталога нет — проба «версии равны установленным» пишет «СЛЕПОТА» и по существу не считается: без других провалов стенд вернёт код 2 (см. [GUARDS.md](GUARDS.md#kody)). Каталог другой установки — проба честно сравнит с ней и покраснеет на любом отличии; проба зависимостей сверяет номера с составом и деревом и от этих переменных не зависит (A-N-1873).

`STEND_POLKA` or `STEND_PLAGINY` unset — before any probe the stand prints "СЛЕПОТА: не задана …" (blindness: not set) with the variable name and exits with code 2. The directory is missing — the "versions equal installed" probe says "СЛЕПОТА" and is not counted as substantive: with no other failures the stand exits with 2 (see [GUARDS.md](GUARDS.md#kody)). A directory of a different installation — the probe honestly compares against it and fails on any difference; the dependencies probe compares versions with the composition and the tree and does not depend on these variables (A-N-1873).

## Пути в `dependencies` · Paths in `dependencies`

С A-N-1873 зависимости `package.json` — точные номера, путей полки в них нет. До выпуска 3.1.4 `npm install` набора из дерева завершается кодом 0, не поставив ни одного члена: члены ставятся по отдельности с `--install-links` (см. README). Полка (`STEND_POLKA`) нужна только стенду — сверить суммы архивов под этими номерами.

Since A-N-1873 the `package.json` dependencies are exact versions with no shelf paths. Until release 3.1.4, `npm install` of the set from the tree exits with code 0 without installing a single member: members are installed one by one with `--install-links` (see README). The shelf (`STEND_POLKA`) is needed only by the stand, to verify archive checksums under these versions.
