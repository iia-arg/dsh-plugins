<!-- Derived from nick-vels/skills (MIT, Copyright (c) 2026 Nick Vels), modified by Aleksandr Argelander and contributors. -->

# Phase 8 — Acceptance

`ap.py stage final`. Three subagents, no contact between them, each answering a different question. The blind checker and the ADR agent go out **in one message**; the memory agent goes out when the blind checker has returned, because it needs the commands the checker proved:

| Agent | Question | Receives | Never receives |
|---|---|---|---|
| blind checker | что из брифа сделано | the brief files, the repository | `spec.md`, `manifest.md`, tickets |
| ADR *(T2+)* | почему сделано именно так и как здесь называются вещи | `spec.md`, `manifest.md`, `interfaces.md`, `notes.md` | the repo |
| memory | как этим пользоваться завтра | the repo, the memory file, `interfaces.md`, the tier, the commands the checker ran | `spec.md`, tickets |

## 1. Blind acceptance — gate G4

Every check so far measured the build against the spec — your own paraphrase of the brief. If a requirement was lost on the way into it, everything downstream faithfully confirmed that loss. **So this check does not get the spec.**

It receives every `*-brief.md` in `dir`, oldest first, **whole, `## Дополнения` included**, and the repository. `.autopilot/` is committed and sits right there, so **not sending the spec is not enough — the prohibition goes in the prompt**:

> Прочитай приложенные файлы брифа — это задача, которую поставил заказчик,
> по порядку дат. Разделы «Дополнения» — сказанное по ходу работы, часть задачи
> наравне с основным текстом; при расхождении верно более позднее. Не открывай
> `.autopilot/` — ни спецификацию, ни манифест, ни таски. Не вызывай скиллы
> и не запускай своих агентов. Ничего не отправляй наружу: ни писем, ни
> сообщений реальным людям, ни оплат, ни публикаций — если сценарий до этого
> доходит, остановись на шаге перед отправкой и запиши, что дальше не проверял.
>
> **Склонируй репозиторий во временную папку** (`git clone <репозиторий> <tmp>`)
> и работай там: поставь зависимости с нуля по тому, что лежит в репозитории.
> Если для запуска нужен `.env`, скопируй его в клон, не открывая. Всё, что
> в клоне не поднимается, а в рабочей папке поднималось бы, — это находка:
> незаписанная зависимость, незакоммиченный файл, шаг, который знает только эта машина.
>
> **Запусти проект** и пройди основной сценарий так, как прошёл бы заказчик.
> Чтение кода показывает намерение, запуск — результат. Не поднимается или
> сценарий обрывается — это главная находка, первым пунктом. Запустить нельзя
> вообще (нужен аккаунт, ключ, внешний сервис) — скажи прямо, что помешало,
> и не выдавай чтение кода за проверку.
>
> По каждому требованию из брифа: реализовано / частично / нет — и одна строка,
> где это видно. Требование выполнено формально, а по сути не работает (данные
> сохраняются, но пользователю не показываются) — это «частично».
>
> Отдельно верни **команды, которыми ты поднимал проект, и их результат** — дословно:
> их ждёт агент, который пишет память проекта.
>
> Не оценивай качество кода, не предлагай улучшений, не ищи оправданий — только факт.

**Then compare its verdict with the manifest:**

| Manifest | Blind | Meaning |
|---|---|---|
| `done` | реализовано | agreed |
| `done` | **частично / нет** | 🔴 **drift** — the manifest is wrong. A ticket, or a line in the report; never an edit of your own |
| `placeholder` | частично | expected — confirm the stub is visible, not an invented fact |
| `dropped` / `deferred` | нет | expected — in the report as not built |
| — | реализовано, но не из брифа | scope that grew without a parent — reported |

Record it in one call — `ap.py blind checked=N matched=M --mismatch "…" --mismatch "…"`, one `--mismatch` per 🔴. A drift found here is the run working; hiding it is the failure. **A build nobody has launched is a build nobody has seen work** — if it cannot be run here at all, that goes to «Что нужно от тебя», not into the accepted column.

## 2. Memory and ADRs

**Read `phases/9-memory.md` before spawning them** — Moments 3 and 4 there are their whole brief, the glossary included. When the memory file is the user's own, the memory agent writes `memory-proposal.md` instead of touching it.

## 3. The final report

Run the check once more first, truncated, and record it — `ap.py tests N/M`. Then write, in the user's language, plain, no jargon.

**Build it from the files, re-read now, not from memory.** By this phase your context is the most polluted of the run, and memory gets the report wrong in one direction: a `deferred` requirement reported as done, a placeholder vanishing, an `A##` nobody ordered turning up as though they had asked.

| Section | Read from |
|---|---|
| Решения, принятые за тебя *(full: first in the report)* | `manifest.md` — every `ASSUMPTION` |
| Готово | **the blind checker's verdict**, not the manifest's `done` rows |
| Что нужно от тебя | `placeholder` rows + `state.js` → `debt` |
| Что не вошло | `deferred` and `dropped` rows, with their quotes |
| Что я добавил сверх заказанного | `state.js` → `additions`, checked against the spec's `A##` |
| Что пошло не по плану | every `D##` row, every failed ticket |
| Что осталось после ревью | `state.js` → `report` |
| Открытые вопросы | `state.js` → `blind`, and `coverage` → `items` that ended up not built |
| Память проекта *(only when the file is the user's)* | `memory-proposal.md` — one question: «Предлагаю дополнить твой `CLAUDE.md`: N пунктов — применить?»; in full, only a line naming the file |
| Запустить / Где что лежит | `memoryFile`, `briefFile`, the commands the memory agent verified |

```markdown
## Готово

<Что теперь работает — 3–6 строк обычным языком, от лица пользователя.>

**Запустить:**
    npm install && npm run dev
Открыть http://localhost:3000

## Что нужно от тебя

1. Впиши в `.env` — `TELEGRAM_BOT_TOKEN`, `GOOGLE_SHEETS_ID`. Образец — `.env.example` рядом.
2. Замени заглушки: цены и тексты писем. Сейчас там видимые метки `[ВПИШИ]`, не выдуманные значения.

## Что не вошло

| Что | Почему |
|---|---|
| Уведомления на SMS | ты сказал «SMS не надо, только телега» |

## Что я добавил сверх заказанного

| Что добавил | Ради чего |
|---|---|
| Номер заявки в подтверждении | чтобы клиент мог на неё сослаться |

## Что пошло не по плану

| Что не сработало | Как сделано |
|---|---|
| Одна заявка на один адрес — у половины клиентов их два | Адреса вынесены в список |

## Открытые вопросы

<Расхождения слепой приёмки — прямо, без смягчения: «Требование "клиент видит статус"
я считал готовым, независимая проверка показала, что статус нигде не отображается».>

## Где что лежит

- Описание проекта для следующего раза — `AGENTS.md` в корне
- Что осталось и о чём договорились — `.autopilot/PROGRESS.md`: мелкие правки можно делать в обычной сессии, она прочитает его сама
- Почему сделано именно так — `docs/adr/`, словарь проекта — `CONTEXT.md` (если проект крупный)
- Прогресс и цифры — `.autopilot/dashboard.html`
- Твоя задача, требования, спецификация — `.autopilot/<папка сборки>/`
```

- **Заглушки и пустые переменные — обязательный раздел**, даже пустой: «всё заполнено».
- **«Что не вошло» пишется всегда**, даже когда вошло всё — одной строкой.
- **Секреты — только именами.**
- **Не приукрашивать.** Упавшее, недоделанное, найденное расхождение — прямо, с тем, что нужно для починки.
- Без диффов, имён файлов кода и названий тестов. A section with nothing in it, except the two above, is omitted.

## 4. The progress file

`.autopilot/PROGRESS.md` — where the work stands when this run lands, for whoever comes next: the next run reads it first (`phases/0-preflight.md` §5), and a plain session fixing a small bug reads it because the memory file says to (`phases/0-memory.md`). **You write it, from files re-read now**, like the report — never from memory of the dialogue. It is rewritten whole at every landing; nothing in it is lost, because the run read the previous one into `carried.md` at preflight.

```markdown
<!-- autopilot:progress -->
# <Название проекта> — что осталось

Последняя сборка: `.autopilot/<папка>/` — <итог одной строкой>.

## Договорились — не пересматривать

- «SMS не надо, только телега» — R03, отказ пользователя
- Цены не трогать в коде — их меняет сам пользователь в таблице

## Не доделано

- Корзина — отложена: «корзину потом» (R08)
- Ночные уведомления — таск упал: нет доступа к SMTP

## Известные баги

- Даты в уведомлениях в двух форматах — `src/notify.ts`

## Правки без автопилота

<!-- дата — что — почему; пишет обычная сессия, следующая сборка разбирает -->
```

| Section | From |
|---|---|
| Договорились | `dropped` rows with their quotes; lasting preferences from the briefs' `## Дополнения`; assumptions the user confirmed; `carried.md` → «Договорились» still true. **Not** what an ADR already holds — a pointer at most |
| Не доделано | `deferred` rows with their quotes, failed tickets, `coverage` items not built; from `carried.md`, everything this run did not take |
| Известные баги | 🔴 blind mismatches, `state.js` → `concerns` and `report` left unfixed; from `carried.md`, those this run did not fix |
| Правки без автопилота | empty. Each entry `carried.md` brought in is now in «Договорились», in «Не доделано», or gone — a fix git already holds needs no line |

Placeholders and empty variables are not repeated here — they are in the report's «Что нужно от тебя» and in `.env.example`. A section with nothing in it reads «—». Every line one thought, with the requirement number where there is one; the whole file under about sixty lines — past that, it is a backlog for the tracker, and the report says so in one line.

## 5. Landing

In this order, so the report names paths that exist:

1. The memory file (or its proposal), the ADRs, the glossary and the progress file are written.
2. `python3 /opt/autopilot/current/skill/tools/ap.py --no-serve finish --result "<одна строка: что теперь есть>"` — closes every stage, sets `finishedAt`, renames `<dir>--wip` to `<dir>` with `git mv`, closes the run's row in `.autopilot/README.md`, and attempts the protected static export; no local server is started or stopped. A `!` line about the rename means the name was taken or the index dirty: leave it, the run is not undone by a cosmetic suffix.
3. **The final commit** — exactly what this skill wrote since the plan commit, never the rest of the tree, where the user may have work of their own:

   ```bash
   git add -A -- .autopilot AGENTS.md CLAUDE.md docs/architecture.md docs/adr CONTEXT.md GLOSSARY.md .env.example .gitignore \
     && git commit -qm "Autopilot: сборка сдана" --trailer "Autopilot-Run: <папка>" -- .autopilot AGENTS.md CLAUDE.md docs/architecture.md docs/adr CONTEXT.md GLOSSARY.md .env.example .gitignore
   ```

   Leave out of both lists any path that does not exist, and the memory file if it is the user's own. **The subject stays exactly «Autopilot: сборка сдана»** — the next run and every plain session find the landing by it. The code itself went in ticket by ticket. `git status` afterwards: a changed file outside everything any ticket owned is not committed by you — it goes in the report as «осталось незакоммиченным».
4. The report.

The dashboard freezes on the final numbers and carries them inside the page, so it reopens by double-click long after the server is gone. Say nothing about any of this.

## Engine usage at acceptance

From the following operator turn, close the declared measurement window at the last terminal request/turn. Collect Codex snapshots through its source owner; Claude snapshots remain private diagnostics until the later accepted caller is enabled, as described in `phases/0-instruments.md` and the physical release's `tools/README-usage-snapshot.md`. Write each validated numeric file with `ap.py --no-serve usage codex --snapshot FILE` or the same command with `claude`. Never parse the text report or call a missing source zero. Keep the explicit scope: mail executors in other homes are not silently counted by the Codex operator thread. These are observed log counters, not provider billing. The public panel shows Codex with its own snapshot time and unknown/incomplete state; Claude remains private and hidden.

Claude visibility gate: this release publishes and renders Codex only. Claude snapshots are private diagnostics, even when observed. The accepted childproof reader/builder does not supply live AP→DSH provenance, an export caller, or original-thread ingestion. Do not launch export tasks from these phase instructions. A later accepted change must implement T1 exact-byte envelope verification, T2 actual runtime export-turn exclusion and T3 original Master-thread binding, then prove a live observed run and independent same-run recount before enabling the Claude card. Project/pilot policy remains in force.


### Root accounting final (0.1.14)

`finish` фиксирует операционный конец; live-фаза учёта может продолжаться во время drain. Root collector сам запечатывает schema4 final и CLOSED при доказанном AP_FINISH/AP_CANCEL/H/K. Предел ожидания600с от первого чтения конца; final/incomplete сохраняет доказанные числа, отсутствие вклада — null с причиной. Root final неизменен. После сбоя между seal и index следующий тик восстанавливает CLOSED. Публикация final повторяется до совпадения фактической public-квитанции, включая старый RUN после нового init. Успешный finish не означает, что итоговый расход уже полный.
