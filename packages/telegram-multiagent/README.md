# dsh-telegram-multiagent

A Telegram channel for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): message
your agent from a phone, get answers back, keep one conversation per chat.

The harness ships no messenger channel — there is no channel abstraction in the product at all. This
plugin builds one out of the two ends the harness does give you:

```
in:   ctx.agents.create/resume(...) → agent.send(message)
out:  ctx.on('session/event', ...)  → send to Telegram
```

One chat = one session = one agent. Sessions live independently, the way the core intends.

## Install

```bash
# inside your profile directory ($DSH_HOME/profiles/<name>)
pnpm add dsh-telegram-multiagent
```

Then add one row to your **agent preset** (`agent.cordis.yml`), not to the profile patch layer —
see "Where to put the row" below:

```yaml
- insert:
    - name: dsh-telegram-multiagent
      config:
        agentName: my-agent            # log label only
        tokenFile: /etc/dsh/bot.token  # preferred: a file readable by this agent
        appDir: /opt/my-agent/app      # where THIS agent's harness is installed
        workspace: /opt/my-agent/work
        allowedUsers: [123456789]      # empty = everyone; you do not want that
```

## Configuration

| Field | Required | What it does |
|---|---|---|
| `tokenFile` | one of these | Path to a file holding the bot token. Preferred: the secret belongs to the machine, the config only carries a path. |
| `token` / `tokenEnv` | one of these | Literal token, or the name of an env var. For debugging. |
| `appDir` | yes | Directory where this agent's harness is installed. Platform packages are resolved from **here**, not from the plugin's own location — see "Why appDir" below. |
| `agentName` | no | Label in log lines. Useful when several bots run on one machine. |
| `allowedUsers` | no | Numeric user ids allowed to talk to the agent. **Empty means everyone** — an agent usually has real access to the machine, so set it. |
| `workspace` | no | Working directory handed to the agent session. |
| `preset` | no | Agent preset to mount for sessions created by this channel. |
| `provider` / `model` | no | Fallback if the deployment has no default model service. |
| `a2aDir` | no | Directory for a file-based agent-to-agent channel (`in/`, `out/`). Omit and no such channel exists. |
| `a2aSession` | no | Session id used for that channel. Default `a2a`. |
| `transcribeCommand` | no | External command for voice messages: `<cmd> <audio-file> auto` → transcript on stdout. Omit and voice is politely refused. |
| `goalUsers` | no | Telegram user ids allowed to run `/goal`. **Empty (default) = the command is refused for everyone.** Not inherited from `allowedUsers` on purpose: talking to an agent and starting a paid autonomous loop are different rights. |
| `goalA2ASenders` | no | Sender names allowed to run `/goal` from the agent-to-agent channel. The sender names itself in the first line of the file (`From: <name>`) — this is bookkeeping, not authentication; see 1.3.0 below. |

## Five things that cost us a day

Each of these fails **while looking like success**. They are commented inline in the source; this is
the short version.

**1. Polling belongs to the bot, not to the mount.** The harness mounts a composition more than once
per process and unmounts the extra one. With a single shared `running` flag you get two pollers
fighting over one bot and Telegram cuts both with `Conflict`. With a polite "new mount asks the old
one to step aside" you get *no* poller at all — because the new mount is the one that gets unmounted.
The fix is reference counting: the first mount starts polling, the last unmount stops it.

**2. Delete the incoming message only after it reached the agent.** Reading a file and unlinking it
immediately loses the message whenever the handoff fails — and the handoff *will* fail, see (3).
From the outside that is indistinguishable from "the bot ignored me".

**3. The agent factory appears later than the channel.** The first message can arrive before the
harness has registered it, and you get `no agent factory registered`. Wait for the platform instead
of assuming it is ready.

**4. A session already on disk must be resumed, not created.** Calling `create()` with an existing
session id makes the persistence layer abort *every* turn with an id-collision error. Externally:
"accepted the message and went quiet" — the turn honestly starts and dies in milliseconds. It works
until the first restart, which is what makes it nasty. Use `resume()` when the session exists.

**5. `ctx.get()` returns nothing *quietly* while a service is still starting.** cordis hands back
`undefined` without throwing until the provider's fiber is active, so "this service is not in the
build" and "this service is thirty milliseconds away" arrive as the same value. Code written as
`const x = ctx.get('x'); if (x) {...}` then takes the "feature absent" branch and says nothing — the
agent is assembled, answers, and never mentions what it lost. This bit us three times in three days:
the agent factory (3), session persistence (4, the whole resume block was skipped), and the agent
preset — where a neighbouring agent's toolset dropped from 33 tools to 3 with no error and no log
line. Wait for the service with a stated deadline, and when the deadline passes, say so *and name
the consequence*. One helper for all of them: a fix applied to the instance instead of the class
guarantees a relapse, and the relapse looks like a new illness.

## Where to put the row

In the `web` profile the common-plane tools are **disabled on purpose**; the toolset comes from the
agent preset. A plugin row placed in the profile patch layer composes without a single error, is
listed as mounted — and never reaches the agent. Put the row in the agent preset.

The preset is also picked up when a **session is created**: editing the file does not affect a
running session. Restart the platform, or change the default preset in settings (hot-reloaded, takes
effect for the next created session).

## Why `appDir`

The plugin resolves `@deepseek-ai/dsh-llm` and `@deepseek-ai/dsh-agent` from the directory you pass
in `appDir`, not from its own location. That is deliberate: the module is meant to live once on a
machine and serve several agents, each with its own harness installation. Hard-linking it to one
agent's `node_modules` would mean that removing *that* agent breaks the channel for everybody else.

## Security notes

- `allowedUsers` empty means anyone who finds the bot talks to an agent that usually has shell access
  to the machine. Set it.
- A rejected stranger is logged and reported to the owner. A silent refusal hides a security event.
- The token is read from a file at startup; the config carries a path, not a secret.

## Status

Written for our own fleet and running in production on several agents. The harness is young
(`0.1.0-rc`) and its plugin API moves; expect to adapt. Inline comments are currently in Russian —
they carry the reasoning behind each non-obvious line, and a translation is welcome.

MIT.

## 1.1.0 — кто спросил, кому отвечено, и кто это видит

Три возможности, выросшие из одной задачи: с агентом работают ДВОЕ — владелец из личного чата и
координатор по служебному каналу, — и они должны делить одну память, не путаясь, кто есть кто.

**Пометка отправителя, которую нельзя подделать.** Каждое входящее помечается каналом, из которого
пришло. 🔴 Ключевое: перед тем как поставить свою пометку, модуль ВЫРЕЗАЕТ из текста всё похожее на
неё. Без этого пометка была бы подписью в тексте, а подпись подделывает любой, кто умеет печатать.
Проверено нападением: сообщение из личного чата с готовой строкой «служебный канал» приходит
агенту помеченным как личный чат.

**Общая память двух собеседников.** `mergeChatIntoA2A: <идентификатор чата>` — сообщения этого чата
идут не в свою сессию, а в служебную. Один агент, одна история разговора, два различаемых лица.
Побочно лечит столкновение имён инструментов: второй экземпляр набора не монтируется вовсе.

**Адресат ответа привязан к ХОДУ, а не к последнему сообщению.** Ответ помечается `[ответ: кто]` с
цитатой вопроса. 🔴 Почему не «отвечаем последнему спросившему»: если второй вопрос пришёл, пока
первый считается, ответы разъезжаются не тем — причём с правильными на вид пометками.

**Режим доставки — в файле ВНЕ кода.** Путь берётся из `settingsFile` (по умолчанию — файл токена с
расширением `.json`). Читается на лету по времени изменения: правка действует со следующего
сообщения, перезапуск не нужен. Файл переживает обновление модуля.

```json
{ "deliveryMode": "personal" }
```
| режим | кто что видит |
|---|---|
| `personal` (умолчание) | каждый видит только свои вопросы и ответы |
| `broadcast` | оба видят весь обмен, чужое помечено «адресовано не вам» |
| `owner-all` | владелец видит всё, координатор только своё |

🔴 Умолчание выбрано самым тихим намеренно: испорченный или недоступный файл настроек НЕ должен
внезапно раскрыть переписку в чужой канал. Ошибка чтения = `personal`, и о ней говорится в журнал.

Копируются и вопросы, и ответы: половина разговора без второй половины нечитаема.

## 1.2.0 — отправка переживает сбой сети

🔴 **Отправка теперь повторяется.** До этой версии одна неудачная попытка теряла сообщение
НАВСЕГДА и не оставляла следа — снаружи это неотличимо от «агент промолчал».

Поймано числами: на нашей машине `fetch failed` случается 6-10 раз в час. Копия вопроса не
дошла, а соседняя отправка четырьмя секундами позже прошла — то есть терялось не по логике, а по
случайности. Мы к тому моменту полдня искали причину молчания агента в коде, в настройках и в
чужих ботах.

Как сделано: три попытки с растущей паузой (0.4 с, 0.8 с), в журнал пишется, с какой попытки
удалось. Повторяются **только сетевые сбои**; отказ Telegram по существу (нет прав, чат не найден,
пустой текст) не повторяется — он воспроизведётся. Длинный опрос намеренно оставлен без повторов:
у него свой цикл, повтор лишь задержал бы следующий заход.

**Урок общий:** канал доставки без повтора — это тихая потеря. Отказ, о котором никто не узнал,
дороже отказа громкого: его невозможно даже сосчитать.

## 1.3.0 — постановка цели прямо из канала

🔴 **Зачем это вообще нужно.** Если цикл агента ведёт внешний движок — например, агент работает
через подписку, а не через родной цикл платформы, — родные инструменты платформы до модели **не
доходят вовсе**. Доходит только то, что имеет форму сообщения. Значит поставить агенту цель изнутри
разговора нельзя: руками в веб-интерфейсе можно, а из чата нет. Здесь мы даём постановку из любого
канала: сервису целей не нужен инструмент модели, он доступен коду плагина напрямую.

Команды одинаковы в обоих каналах:

```
/goal                     показать состояние цели
/goal <замысел>           поставить цель
/goal stop                снять цель
```

**Кто вправе — двумя отдельными списками, оба по умолчанию ПУСТЫЕ, то есть команда отказывает
всем.** Право не наследуется от `allowedUsers` сознательно: «с кем я разговариваю» и «кто вправе
завести дорогой автономный цикл» — разные вопросы, а в `allowedUsers` завтра добавят гостя.

```yaml
goalUsers: [123456789]          # из Telegram — по числовому id
goalA2ASenders: ["coordinator"] # из служебного канала — по имени в заголовке
```

🔴 **Чем за это платят, сказать обязано само описание.** Проверки платформы
(`currentInitiator`, `hasDirectHumanInput`, права на корневого агента) живут в её инструменте целей
и на этом пути **не участвуют**. Плагин не обходит политику — он пишет её заново, и две строки выше
есть вся политика целиком. Ставя `goalUsers`, вы соглашаетесь именно на это.

**Счётчик постановок: не более трёх за скользящий час на канал.** Предел раундов у платформы стоит
на ЦЕЛЬ, а не на агента: новая цель — новый счётчик, и поток целей ничем не ограничен. А каталог
входящих принадлежит самому агенту, то есть в автономном раунде он способен положить себе файл
`/goal …` и продлить цикл собственными руками.

🔴 **Где счётчик НЕ применяется — назвать важнее, чем сам счётчик.** Он защищает от РАЗГОНА:
от петли, в которую механизм вошёл сам, от ошибки в коде, от лавины повторов. Он **не** защищает от
намеренного действия агента с правами администратора: такой агент снимет и счётчик, и предел
раундов одной командой. Изоляция здесь **поведенческая**, технической границы против самого агента
не существует. Настоящий сторож живёт снаружи машины. Снятию цели (`/goal stop`) счётчик не мешает
никогда: механизм, включаемый снаружи и невыключаемый, хуже отсутствия механизма.

**Заголовок отправителя — учёт, а не защита.** Служебный канал файловый, и вид источника получает
любое сообщение в нём; правом «всем, кто пишет в канал» вы раздали бы дорогие циклы кому попало.
Поэтому отправитель называет себя первой строкой файла:

```
From: coordinator
/goal разобрать вчерашние отказы и доложить
```

Имя подделает любой, кто может положить файл в каталог входящих. Настоящая граница здесь — права
ОС на этот каталог. Нужна проверка сильнее самоназвания — это общий секрет в файле с правами, и
заводить его надо отдельным решением, а не походя.

**Об исходе цели плагин сообщает сам.** Доводчик платформы при упоре в предел раундов переводит
цель в `blocked` — и делает это молча: снаружи автономный цикл просто перестаёт просыпаться, что
неотличимо от поломки. Плагин говорит об исходе ровно один раз и в тот канал, из которого цель
ставили.

**Служебный маркер цели вырезается из всего, что уходит наружу.** Его дело — остановить цикл, а не
попасть человеку в чат. Вырезается маркер последней строки; маркер в середине текста оставлен
видимым нарочно — он и так отвергнут, и пусть будет заметен читателю.

### Ожидание сервисов: где оно есть и где его нет — решение по каждому месту

`ctx.get()` возвращает `undefined` **молча**, пока волокно поставщика не активно. «Сервиса нет в
сборке» и «сервис ещё поднимается» приходят одним и тем же значением — и код, написанный как
`const x = ctx.get('x'); if (x)`, тихо уходит по ветке «этой возможности просто нет».

| место | ожидание | почему |
|---|---|---|
| заведение агента (пресет, модель, персистенция) | **есть**, до 30 с | идёт вплотную к подъёму платформы, отказ молчалив и разрушителен |
| `/goal` → сервисы целей, маркера, моста | **есть**, коротко | ответ «сервис не подключён» был бы диагнозом, которого код поставить не может; но на том конце живой собеседник, и полминуты молчания в чате читаются как «бот умер» |
| вырезание маркера из исходящего | **нет** | место синхронное, а отказ не молчалив: маркер уедет в чат видимым текстом |
| сообщение об исходе цели | **нет** | сюда попадают только сессии, где цель уже поставлена, — значит пустота означает не «ещё не поднялся», а «сервис пропал», и это надо сказать, а не переждать |

Замечено на живом: порядок готовности волокон **меняется от подъёма к подъёму**. В одном подъёме
ждала фабрика агентов, в другом — набор пресета, причём гонка была в обоих. Значит судить о гонке
по соседнему сервису нельзя, и ожидание ставится по устройству места, а не по тому, где однажды
видели примету.

### Чего эта версия НЕ делает

- **не даёт модели инструмент постановки цели** — команда приходит от человека или от координатора
  через канал, модель её не вызывает и в заголовке запроса плагин невидим;
- **не заменяет права платформы** — она их здесь не применяет вовсе (см. выше);
- **не защищает от агента с правами администратора** — вся защита поведенческая;
- **не проверяет подлинность отправителя** в служебном канале — только самоназвание;
- **не переносит цель через перезапуск процесса**: счётчик постановок обнуляется, а связь
  «сессия → куда сообщить об исходе» живёт в памяти процесса. Сама цель хранится платформой и
  переживает перезапуск, а вот сообщение об её исходе после перезапуска не придёт.
