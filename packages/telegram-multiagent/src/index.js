/**
 * Канал Telegram для DeepSeek Harness — ОБЩИЙ МОДУЛЬ МАШИНЫ.
 *
 * Написан нами, а не взят из каталога плагинов, сознательно: к боту заходят
 * живые люди, а чужие плагины в этой экосистеме публикуются в том числе без
 * исходников, и проверять там нечего.
 *
 * 🔴 ОДИН КОД — МНОГО АГЕНТОВ (требование владельца 19.08.2026). Раньше модуль
 * назывался именем агента и стоял в его личном каталоге; второму агенту канал
 * пришлось бы копировать, и дальше две копии расходятся молча. Теперь код
 * лежит в системном каталоге в ЕДИНСТВЕННОМ экземпляре, а всё различающее
 * агентов живёт в НАСТРОЙКЕ: токен, кто допущен, модель, рабочий каталог, имя
 * в журнале, каталог межагентского обмена. Подключение нового бота — строка в
 * слое профиля плюс файл токена, без единой правки кода.
 *
 * ГДЕ ТОКЕН. Никогда в конфиге агента и не в переменной окружения по умолчанию:
 * `tokenFile` — путь к файлу, который читает только этот агент (как сделано с
 * подпиской). Значение через `token`/переменную оставлено для отладки.
 *
 * УСТРОЙСТВО. Своего понятия «канал» у dsh нет — контракт складывается из двух концов:
 *   вход:  ctx.agents.create(...) → agent.followup(сообщение)
 *   выход: ctx.on('session/event') → отправка в Telegram
 * Один чат = одна сессия = один агент. Сессии живут независимо, как и задумано ядром.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { TelegramClient } from './client.js';
import { createRequire } from 'node:module';

/**
 * 🔴 ПАКЕТЫ ПЛАТФОРМЫ РАЗРЕШАЕМ ОТ КАТАЛОГА АГЕНТА, А НЕ ОТ СВОЕГО.
 * Код общий и лежит в системном каталоге, где никакой платформы рядом нет.
 * Обычный импорт искал бы её рядом с собой и падал, а привязка к установке
 * одного агента (симлинк на его node_modules) означала бы, что снос ЕГО
 * платформы ломает канал у ВСЕХ остальных. Поэтому каждый агент передаёт
 * `appDir` — свою установку, — и связь остаётся его собственной.
 * `installModelSelection` берём из dsh-agent, а не dsh-session: проверено по
 * импортам самого продукта.
 */
let platformCache = null;
function platformOf(config, log) {
  if (platformCache) return platformCache;
  const from = config.appDir || process.env.DSH_APP_DIR;
  if (!from) {
    log('🔴 не задан appDir: канал не знает, где установлена платформа этого агента');
    return null;
  }
  try {
    const req = createRequire(path.join(from, 'разрешение-зависимостей.js'));
    platformCache = {
      createUserMessage: req('@deepseek-ai/dsh-llm').createUserMessage,
      installModelSelection: req('@deepseek-ai/dsh-agent').installModelSelection,
    };
    return platformCache;
  } catch (e) {
    log(`🔴 пакеты платформы не разрешились от ${from}: ${e?.message ?? e}`);
    return null;
  }
}

/**
 * Опросы Telegram, живущие в ЭТОМ процессе, по токену бота. Нужен именно
 * общий на модуль реестр: платформа монтирует состав несколько раз, и без него
 * два опроса одного бота дерутся, а Telegram рвёт обоих ошибкой Conflict.
 */
const ACTIVE_POLLERS = new Map();

export const name = 'dsh-telegram-multiagent';
export const inject = ['agents'];

/**
 * Токен бота: файл (наш способ) → значение в конфиге → переменная окружения.
 * Файл предпочтителен: секрет принадлежит машине, права выдаются агенту, а в
 * составе профиля лежит только ПУТЬ, который не жалко ни в журнале, ни в копии.
 */
function readTokenFrom(config, log) {
  if (config.tokenFile) {
    try {
      const t = fs.readFileSync(config.tokenFile, 'utf8').trim();
      if (t) return t;
      log(`🔴 файл токена ${config.tokenFile} пуст`);
    } catch (e) {
      // Не глотать: «бот молчит» и «мне не дали прочитать токен» — разные беды,
      // а выглядят снаружи одинаково.
      log(`🔴 не прочитан файл токена ${config.tokenFile}: ${e?.message ?? e}`);
    }
    return null;
  }
  const t = config.token || process.env[config.tokenEnv || 'DSH_TELEGRAM_BOT_TOKEN'];
  if (t) return t;
  log('🔴 нет токена: задайте config.tokenFile (предпочтительно), config.token или переменную окружения');
  return null;
}

export function apply(ctx, config = {}) {
  // Имя агента — только для журнала: при нескольких ботах на машине нужно
  // видеть, чья строка. К логике отношения не имеет.
  const who = config.agentName || 'telegram';
  const who_ = config.agentName || 'агент';   // для текстов, видимых собеседнику
  const log = (m) => console.error(`[${who}] ${m}`);

  const token = readTokenFrom(config, log);
  if (!token) return;

  const platform = platformOf(config, log);
  if (!platform) return;  // без пакетов платформы канал бесполезен — молчать нельзя, выше уже сказано почему

  // Белый список: пусто = пускать всех. Понятия «пользователь» в ядре нет,
  // ограничение доступа целиком на нашей стороне.
  const allowed = new Set((config.allowedUsers ?? []).map(Number));
  const isAllowed = (userId) => allowed.size === 0 || allowed.has(Number(userId));

  const tg = new TelegramClient(token, log);
  const chats = new Map();          // chatId → { handle, sessionId }
  // 🔴 ОТКУДА ПРИШЁЛ ПОСЛЕДНИЙ ВОПРОС (20.08.2026). Владелец захотел общаться с
  // ОДНИМ экземпляром агента, а не с двумя копиями: раньше чат в мессенджере и
  // межагентский канал были РАЗНЫМИ сессиями, то есть буквально двумя агентами
  // с разной памятью разговора. Теперь их можно свести в одну сессию — но тогда
  // ответ надо возвращать туда, откуда пришёл вопрос, иначе ответ координатору
  // улетит в чат владельца. Ключ — сессия, значение — 'a2a' или 'tg'.
  const lastOrigin = new Map();

  // 🔴 СЛИЯНИЕ КАНАЛОВ В ОДНУ ПАМЯТЬ (20.08.2026, решение Александра).
  // mergeChatIntoA2A: <идентификатор чата> — сообщения этого чата попадают НЕ в
  // свою сессию `telegram-<чат>`, а в служебную. Тогда владелец и координатор
  // говорят с ОДНИМ агентом и одной памятью разговора, а различает он их по
  // пометке канала (её ставит код доставки, подделать нельзя).
  // Побочно это лечит столкновение: второй экземпляр набора не монтируется
  // вовсе, а значит имя инструмента памяти не может оказаться занятым.
  const MERGE_CHAT = config.mergeChatIntoA2A ? String(config.mergeChatIntoA2A) : null;
  // Куда отвечать в мессенджер, если сессия общая: sessionId → числовой чат.
  const tgChatFor = new Map();

  // 🔴 КОМУ АДРЕСОВАН ОТВЕТ (21.08.2026, задача Александра).
  // Пометка на ВХОДЕ решает «кто спросил», но не решает «кому отвечено»: когда в
  // одной памяти сидят двое, ответ без адреса читается обоими как свой. И хуже:
  // маршрут «отвечаем последнему спросившему» ломается, если второй вопрос
  // пришёл, пока первый ещё считается, — ответ уедет не тому.
  // Поэтому происхождение привязано к ХОДУ, а не к последнему сообщению: на
  // входе кладём в очередь, на turn/start снимаем, ответ метим тем, что сняли.
  // ── НАСТРОЙКА ДОСТАВКИ, ОТДЕЛЬНЫМ ФАЙЛОМ (21.08.2026, задача Александра)
  //
  // Файл живёт ВНЕ модуля и переживает его обновление: код можно переписать,
  // перевыпустить, поставить заново — настройка останется. Читается на лету,
  // по времени изменения: поправил файл — следующий ответ уже по-новому,
  // перезапуск не нужен.
  //
  //   { "deliveryMode": "personal" | "broadcast" | "owner-all" }
  //     personal   — каждый видит только свои ответы (по умолчанию);
  //     broadcast  — оба видят всё, с пометкой кому адресовано;
  //     owner-all  — владелец видит всё, координатор только своё.
  //
  // 🔴 Умолчание выбрано самым тихим: сломанный или пустой файл НЕ должен
  // внезапно раскрывать переписку в чужой канал. Ошибка чтения = personal,
  // и о ней говорим в журнал ГРОМКО, а не молча.
  const SETTINGS_FILE = config.settingsFile
    || (config.tokenFile ? String(config.tokenFile).replace(/\.token$/, '.json') : null);
  let _setCache = { mtime: 0, data: {} };
  function settings() {
    if (!SETTINGS_FILE) return {};
    try {
      const st = fs.statSync(SETTINGS_FILE);
      if (st.mtimeMs !== _setCache.mtime) {
        _setCache = { mtime: st.mtimeMs, data: JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
        log(`настройки перечитаны из ${SETTINGS_FILE}: режим доставки = ${_setCache.data.deliveryMode ?? 'personal (умолчание)'}`);
      }
      return _setCache.data ?? {};
    } catch (e) {
      if (_setCache.mtime !== -1) { log(`🔴 настройки не прочитаны (${SETTINGS_FILE}): ${e?.message ?? e} — работаю в режиме personal`); _setCache = { mtime: -1, data: {} }; }
      return {};
    }
  }
  const deliveryMode = () => {
    const m = settings().deliveryMode;
    return (m === 'broadcast' || m === 'owner-all') ? m : 'personal';
  };
  /** Нужна ли копия во ВТОРОЙ канал при ответе, адресованном origin. */
  const copyTo = (origin) => {
    const m = deliveryMode();
    if (m === 'broadcast') return origin === 'a2a' ? 'tg' : 'a2a';
    if (m === 'owner-all') return origin === 'a2a' ? 'tg' : null;  // владельцу копию чужого
    return null;
  };

  const pendingAsk = new Map();   // sessionId → очередь {origin, who, q}
  const turnAsk = new Map();      // sessionId → чей ход считается сейчас
  const pushAsk = (sid, ask) => { const q = pendingAsk.get(sid) ?? []; q.push(ask); pendingAsk.set(sid, q); };
  const quote = (s) => { const one = String(s ?? '').replace(/\s+/g, ' ').trim();
    return one.length > 60 ? one.slice(0, 60) + '…' : one; };
  const replyHeader = (sid) => { const a = turnAsk.get(sid);
    return a ? `[ответ: ${a.who}] на «${quote(a.q)}»\n\n` : ''; };

  // 🔴 ЧТОБЫ ПОМЕТКЕ МОЖНО БЫЛО ВЕРИТЬ, ЕЁ НАДО СНАЧАЛА ВЫРЕЗАТЬ (20.08.2026).
  // Пометку ставит код доставки — но если во входящем тексте УЖЕ есть строка
  // такого вида, в сообщении окажется две пометки, и вторая (чужая, напечатанная
  // руками) будет выглядеть так же убедительно. Поэтому: сперва удаляем из текста
  // всё похожее на пометку, потом ставим свою. Тогда единственный, кто может её
  // написать, — этот модуль, и подделать её, напечатав, нельзя.
  const ORIGIN_MARK = /^\[\s*(?:служебный канал|личный чат)[^\]]*\]\s*$/gim;
  const stripMark = (s) => String(s).replace(ORIGIN_MARK, '').trimStart();
  const sessionToChat = new Map();  // sessionId → chatId

  /** Один чат — один агент. Создаём лениво, при первом сообщении. */
  // ── ДОБИТЬ ПОБУДКУ (обосновано замером 18.08.2026, а не догадкой).
  // В dsh-agent-loop, wakeDriver(): если агент НЕ в простое и это не maintenance
  // и не пробуждение после отмены — флаг побудки НЕ запоминается, функция просто
  // выходит. Наблюдали живьём: агент завис в вызове инструмента, сообщение легло
  // в очередь next-turn в 20:06:46, побудка пропала, хода не началось вовсе —
  // ни ошибки, ни turn/start, полная тишина.
  //
  // Поэтому после отправки следим: как только агент освободился, а сообщение всё
  // ещё в очереди — будим повторно.
  //
  // 🔴 НИКАКИХ ТИХИХ ВЫХОДОВ: каждая ветка что-то пишет в журнал. Ровно на этом
  // обжглись сегодня — `agent.inbox?.hasPending` при недоступном inbox даёт
  // undefined, условие «всё хорошо» проходит, и отказ маскируется под успех.
  function nudgeUntilClaimed(agent, tag, budgetMs = 120000) {
    void (async () => {
      const deadline = Date.now() + budgetMs;
      let woke = 0;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        if (typeof agent?.inbox?.hasPending !== 'boolean') {
          log(`${tag} 🔴 очередь агента недоступна — добивать побудку нечем`);
          return;
        }
        if (agent.status === 'running') continue;
        if (!agent.inbox.hasPending) {
          if (woke) log(`${tag} сообщение забрано после ${woke} повторных побудок`);
          return;
        }
        if (typeof agent.wakeDriver !== 'function') {
          log(`${tag} 🔴 сообщение висит в очереди, а wakeDriver недоступен`);
          return;
        }
        agent.wakeDriver();
        woke += 1;
      }
      log(`${tag} 🔴 за ${budgetMs} мс сообщение так и не забрали (побудок: ${woke})`);
    })();
  }

  /**
   * 🔴 ФАБРИКА АГЕНТОВ ПОЯВЛЯЕТСЯ ПОЗЖЕ КАНАЛА (поймано 19.08.2026 инструментовкой).
   * Канал монтируется раньше, чем платформа регистрирует фабрику, и первое же
   * сообщение падало с «no agent factory registered». Снаружи — «написал боту,
   * он молчит», причём вопрос к тому моменту уже был удалён из входящих.
   * Поэтому ждём готовности платформы, а не считаем её данностью.
   */
  async function withFactoryRetry(tag, fn, tries = 60) {
    for (let i = 0; i < tries; i++) {
      try {
        return await fn();
      } catch (e) {
        const why = String(e?.message ?? e);
        if (!why.includes('no agent factory registered')) throw e;  // другая беда — наверх, не глотать
        if (i === 0) log(`${tag} фабрика агентов ещё не зарегистрирована — жду платформу`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error(`фабрика агентов не появилась за ${tries} с`);
  }

  async function agentFor(chatId) {
    const key = String(chatId);
    const found = chats.get(key);
    if (found) return found;
    const sessionId = `telegram-${key}`;
    // 🔴 Модель берём из штатного сервиса agentDefaultModel, а НЕ хардкодом,
    // и передаём setup с installModelSelection — ровно так создаёт агента сам
    // продукт (образец в dsh-headless). Без setup агент собирается неполным:
    // в запрос к модели не попадает поле tools вообще, и агент физически не
    // может вызвать ни один инструмент, хотя они смонтированы (проверено
    // 2026-08-18 по событию request/header в журнале сессии).
    const presets = ctx.get('agentPresets');
    const presetId = presets ? (await presets.resolve(config.preset)).id : undefined;
    const defaultModel = ctx.get('agentDefaultModel');
    const selection = defaultModel?.currentSelection?.() ?? {
      provider: config.provider,
      model: config.model,
    };
    const setupFn = async (agentCtx) => {
      platform.installModelSelection(agentCtx, { current: selection, assembled: undefined });
      if (presets && presetId) await presets.mount(agentCtx, presetId);
    };

    // 🔴 СЕССИЮ, КОТОРАЯ УЖЕ ЛЕЖИТ НА ДИСКЕ, НАДО ПРОДОЛЖАТЬ, А НЕ СОЗДАВАТЬ ЗАНОВО.
    // Раньше здесь всегда звался create() с тем же sessionId. Продукт при этом
    // заводит НОВУЮ живую сессию, её семя не сходится с сохранёнными событиями,
    // и dsh-session-persistence обрывает КАЖДЫЙ ход ошибкой:
    //   session "..." is already persisted with N event(s) that do not match
    //   this live session (id collision)
    // Снаружи это выглядело как «принял сообщение и замолчал»: ход честно
    // начинался и умирал за 7 мс. Работало только пока сессии не было на диске —
    // то есть до первого перезапуска. Поймано 18.08.2026 печатью event.data
    // события turn/end (раньше плагин печатал только тип события).
    // Правильный путь — ctx.agents.resume(): «загрузить сохранённую сессию и
    // продолжить агента на ней» (dsh-agent/lib/index.js, resume()).
    const persistence = ctx.get('sessionPersistence');
    let handle;
    if (persistence) {
      let onDisk = false;
      try {
        onDisk = (await persistence.list()).some((h) => h.id === sessionId);
      } catch (e) {
        log(`не смогла перечислить сохранённые сессии: ${e?.message ?? e}`);
      }
      if (onDisk) {
        try {
          handle = await ctx.agents.resume({
            resumeSessionId: sessionId,
            agentOptions: { provider: selection.provider, model: selection.model },
            setup: setupFn,
          });
          log(`сессия ${sessionId} продолжена с диска (история сохранена)`);
        } catch (e) {
          log(`🔴 продолжить сессию ${sessionId} не удалось: ${e?.message ?? e}`);
        }
      }
    }

    if (handle === undefined) handle = await withFactoryRetry(`[${key}]`, () => ctx.agents.create({
      sessionId,
      meta: { cwd: config.workspace ?? process.cwd() },
      agentOptions: { provider: selection.provider, model: selection.model },
      // 🔴 ПРЕСЕТ ОБЯЗАТЕЛЕН, иначе агент остаётся БЕЗ ИНСТРУМЕНТОВ.
      // В профиле web инструменты на общем плане ВЫКЛЮЧЕНЫ намеренно
      // (в его сборке 9 строк с disabled: true) — набор приходит из
      // агент-пресета, и его надо примонтировать явно. Без монтирования
      // в запрос к модели не попадает поле tools вообще: агент отвечает
      // «сейчас выполню команду» и не выполняет ничего, ход при этом
      // честно завершается completed. Образец — composeAgent в dsh-host-apiproxy.
      agentPreset: presetId,
      setup: setupFn,
    }));
    const entry = { handle, sessionId };
    chats.set(key, entry);
    sessionToChat.set(sessionId, chatId);
    log(`создан агент для чата ${key} (сессия ${sessionId})`);
    return entry;
  }

  /** Копия ВОПРОСА во второй канал (21.08.2026: владелец хочет видеть и входящие,
   *  а не только ответы — иначе видна половина разговора и она непонятна). */
  function copyAsk(origin, who, q) {
    const target = copyTo(origin);
    if (!target) return;
    const text = `📨 вопрос от: ${who}\n\n${q}`;
    log(`[копия] вопрос от ${who} → ${target} (режим ${deliveryMode()})`);
    if (target === 'tg') {
      const chat = MERGE_CHAT ?? [...tgChatFor.values()][0];
      if (chat) tg.send(chat, text)
        .then(() => log(`[копия] вопрос доставлен в Telegram чат ${chat}`))
        .catch((e) => log(`🔴 копия вопроса в Telegram не ушла: ${e?.message ?? e}`));
      else log('копию вопроса в Telegram отправить некуда: чат владельца неизвестен');
    } else if (A2A_OUT) {
      try { fs.mkdirSync(A2A_OUT, { recursive: true }); fs.writeFileSync(path.join(A2A_OUT, `${Date.now()}-ask.txt`), text); }
      catch (e) { log(`🔴 копия вопроса в служебный канал не ушла: ${e?.message ?? e}`); }
    }
  }

  /** Копия ответа во второй канал — с пометкой, что это не тебе. */
  function sendCopy(target, sid, body) {
    const head = replyHeader(sid).trim();
    const text = `📄 копия (адресовано не вам)\n${head}\n\n${body}`;
    log(`[копия] ответ → ${target} (режим ${deliveryMode()})`);
    if (target === 'tg') {
      const chat = MERGE_CHAT ?? [...tgChatFor.values()][0];
      if (chat) tg.send(chat, text)
        .then(() => log(`[копия] ответ доставлен в Telegram чат ${chat}`))
        .catch((e) => log(`🔴 копия в Telegram не ушла: ${e?.message ?? e}`));
      else log('копию в Telegram отправить некуда: чат владельца неизвестен');
    } else if (A2A_OUT) {
      try { fs.mkdirSync(A2A_OUT, { recursive: true }); fs.writeFileSync(path.join(A2A_OUT, `${Date.now()}-copy.txt`), text); }
      catch (e) { log(`🔴 копия в служебный канал не ушла: ${e?.message ?? e}`); }
    }
  }

  // ── ВЫХОД: события сессии → сообщения в Telegram
  ctx.on('session/event', (session, event) => {
    // 🔴 DEBUG 2026-08-18: все типы событий
    log(`[event] type=${event.type} session.id=${session?.id} knownSessions=${[...sessionToChat.keys()].join('|')}`);
    const sid = String(session?.id ?? '');
    // 🔴 При слиянии sessionToChat указывает на КЛЮЧ служебной сессии, а не на
    // числовой чат — отправка по нему молча не дойдёт. Настоящий чат берём из
    // карты, заполняемой на входе из мессенджера.
    const chatId = tgChatFor.get(sid) ?? sessionToChat.get(sid);
    if (chatId === undefined) {
      if (event.type === 'assistant/message') log(`[event] chatId undefined для session ${session?.id} — игнорирую`);
      return;
    }
    try {
      if (event.type === 'turn/start') {
        const q = pendingAsk.get(sid) ?? [];
        if (q.length) turnAsk.set(sid, q.shift());
        void tg.typing(chatId);
      } else if (event.type === 'turn/end' && event.data?.reason?.kind === 'error') {
        // 🔴 18.08.2026: ход может оборваться с внятной ошибкой, и она приходит
        // ИМЕННО ЗДЕСЬ, в event.data.reason. Раньше плагин печатал только тип
        // события и выбрасывал содержимое — снаружи это выглядело как «принял
        // и замолчал», и на выдумывание причин ушёл вечер. Настоящая ошибка
        // (столкновение идентификаторов сессии) лежала в потоке всё это время.
        // Правило: причину обрыва показывать ВСЕГДА, и в журнал, и собеседнику.
        const why = event.data.reason.error?.message ?? 'без описания';
        log(`🔴 ход оборван ошибкой: ${why}`);
        if (chatId === A2A_CHAT) {
          try {
            fs.mkdirSync(A2A_OUT, { recursive: true });
            fs.writeFileSync(path.join(A2A_OUT, `${Date.now()}.txt`), `🔴 ход оборван ошибкой: ${why}`);
          } catch { /* канал и так сломан, писать больше некуда */ }
        } else {
          void tg.send(chatId, `Не смог выполнить ход: ${why}`);
        }
      } else if (event.type === 'assistant/message'
                 && (turnAsk.get(sid)?.origin ?? lastOrigin.get(sid) ?? (chatId === A2A_CHAT ? 'a2a' : 'tg')) === 'a2a') {
        // ответ координатору — в файл, Telegram тут ни при чём
        const blocks = event.data?.message?.content ?? [];
        const text = blocks.filter((b) => b?.type === 'text').map((b) => b.text).join('\n').trim();
        if (text) {
          try {
            fs.mkdirSync(A2A_OUT, { recursive: true });
            fs.writeFileSync(path.join(A2A_OUT, `${Date.now()}.txt`), replyHeader(sid) + text);
            { const c = copyTo('a2a'); if (c) sendCopy(c, sid, text); }
            log(`[a2a] ответ координатору записан (${text.length} знаков)`);
          } catch (e) { log(`[a2a] не смог записать ответ: ${e?.message ?? e}`); }
        }
      } else if (event.type === 'assistant/message') {
        // Берём только видимый текст: рассуждения модели наружу не отдаём.
        const blocks = event.data?.message?.content ?? [];
        const text = blocks
          .filter((b) => b?.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        if (text) {
          log(`[event] отправляю в Telegram chatId=${chatId} (${text.length} знаков)`);
          { const c = copyTo('tg'); if (c) sendCopy(c, sid, text); }
          tg.send(chatId, replyHeader(sid) + text).catch((e) => log(`🔴 send к chatId=${chatId} не удался: ${e?.message ?? e}`));
        }
      }
    } catch (e) {
      log(`ошибка обработки события для чата ${chatId}: ${e?.message ?? e}`);
    }
  });

  // ── ВХОД: длинный опрос Telegram → сообщения агенту
  // Скачивает файл Telegram по file_id и возвращает временный путь.
  async function downloadTelegramFile(fileId) {
    const filePath = await tg.getFilePath(fileId);
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const ext = path.extname(filePath) || '.oga';
    const tmp = path.join(os.tmpdir(), `dsh-voice-${Date.now()}${ext}`);
    // 🔴 Скачиваем ВСТРОЕННЫМ fetch, а не curl: адрес содержит токен бота, а
    // строка запуска процесса (/proc/<pid>/cmdline) читается ЛЮБЫМ пользователем
    // машины. Через curl токен утекал бы при КАЖДОМ голосовом сообщении.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`telegram file download: HTTP ${res.status}`);
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    return tmp;
  }

  // Транскрибирует голосовое сообщение через нашу локальную цепочку.
  // Возвращает строку с текстом или null при ошибке.
  async function transcribeVoice(fileId) {
    let tmpAudio = null;
    try {
      tmpAudio = await downloadTelegramFile(fileId);
      // transcribe-local-shared — наша цепочка: sage-corrector → transcribe-whispercpp-core → whisper-warm.service
      // 🔴 Внешняя команда расшифровки — НАСТРОЙКА, а не зашитый путь: у каждого
      // своя цепочка. Не задана — голосовые просто не расшифровываются, и об этом
      // говорится в журнал, а не молча игнорируется.
      if (!config.transcribeCommand) {
        log('голосовые не расшифровываются: не задан config.transcribeCommand');
        return null;
      }
      const transcript = execFileSync(config.transcribeCommand,
        [tmpAudio, 'auto'], { timeout: 120_000 }).toString().trim();
      return transcript || null;
    } catch (e) {
      log(`transcribeVoice: ошибка: ${e?.message ?? e}`);
      return null;
    } finally {
      if (tmpAudio) try { fs.unlinkSync(tmpAudio); } catch { /* уже удалён */ }
    }
  }

  async function handleUpdate(u) {
    const msg = u.message;
    // Принимаем текст И голосовые/аудио. Всё остальное молча пропускаем.
    const isVoice = !!(msg?.voice || msg?.audio);
    if (!msg?.text && !isVoice) return;
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    let text;
    if (isVoice) {
      const fileId = (msg.voice ?? msg.audio).file_id;
      void tg.typing(chatId);
      const transcript = await transcribeVoice(fileId);
      if (!transcript) {
        await tg.send(chatId, '⚠️ Не смог расшифровать голосовое сообщение. Попробуйте ещё раз.');
        return;
      }
      text = `[Voice transcript]: ${transcript}`;
      log(`голосовое расшифровано: ${transcript.length} знаков`);
    } else {
      text = msg.text.trim();
    }

    if (!isAllowed(userId)) {
      // 🔴 Чужой стучится к агенту, у которого полный доступ к серверу.
      // Отказываем И поднимаем тревогу владельцу — молча отказывать нельзя:
      // сам факт попытки это событие безопасности, а не бытовая мелочь.
      const who = msg.from ?? {};
      const alert = `🔴 Чужой написал агенту ${who_}\n` +
        `id: ${userId}\n` +
        `имя: ${who.first_name ?? '?'} ${who.last_name ?? ''}`.trim() + `\n` +
        `ник: ${who.username ? '@' + who.username : 'нет'}\n` +
        `чат: ${chatId}\n` +
        `текст: ${text.slice(0, 200)}`;
      log(`ОТКАЗ чужому ${userId} (@${who.username ?? '—'}): ${text.slice(0, 60)}`);
      for (const owner of allowed) {
        try { await tg.send(owner, alert); } catch (e) { log(`тревога не ушла: ${e?.message ?? e}`); }
      }
      await tg.send(chatId, 'Извините, у меня нет разрешения с вами работать.');
      return;
    }

    // Команды обрабатываем сами, до агента.
    if (text === '/start' || text === '/help') {
      await tg.send(chatId, `${who_} на связи. Пишите задачу обычным сообщением.\n` +
        '/new — начать разговор заново.');
      return;
    }
    if (text === '/new') {
      const old = chats.get(String(chatId));
      if (old) {
        try { await old.handle.dispose(); } catch { /* уже мог отвалиться */ }
        chats.delete(String(chatId));
        sessionToChat.delete(old.sessionId);
      }
      await tg.send(chatId, 'Начал заново.');
      return;
    }

    // При включённом слиянии владелец попадает в ту же сессию, что и служебный
    // канал: одна память на двоих. Ответ при этом обязан вернуться в мессенджер,
    // поэтому запоминаем настоящий чат отдельно.
    const routeKey = (MERGE_CHAT && String(chatId) === MERGE_CHAT) ? A2A_CHAT : chatId;
    const { handle, sessionId } = await agentFor(routeKey);
    tgChatFor.set(sessionId, chatId);
    // 🔴 ТОЛЬКО send(), НЕ followup(). Проверено на установленной версии 0.1.0-rc.7:
    // followup объявлен в описании типов, но В КОДЕ ЕГО НЕТ — вызов молча не делает
    // ничего, и снаружи это выглядит как «бот принял сообщение и замолчал».
    // Правильный вызов подсмотрен в самом продукте: this.send(input, "next-turn", true).
    //   next-turn — обычный следующий ход;
    //   true      — разбудить исполнителя, иначе сообщение будет ждать вечно.
    lastOrigin.set(sessionId, 'tg');
    pushAsk(sessionId, { origin: 'tg', who: msg.from?.first_name ?? 'владелец', q: text });
    copyAsk('tg', msg.from?.first_name ?? 'владелец', text);
    // Симметрично: сообщение из мессенджера помечается как пришедшее из чата.
    text = `[личный чат, от ${msg.from?.first_name ?? 'владельца'}]\n${stripMark(text)}`;
    const userMsg = platform.createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    });
    try {
      // 🔴 Ждём, пока агент домотает replay. send() во время replay молча
      // игнорируется (wakeDriver не срабатывает) — снаружи это выглядит как
      // «бот принял сообщение и замолчал». Диагноз 18.08.2026.
      // Ожидание ОБЯЗАНО быть с пределом: whenIdle() не обязан разрешиться,
      // а ожидание без границы превращает «не потеряли» в «висим вечно».
      await Promise.race([
        handle.agent.whenIdle(),
        new Promise((r) => setTimeout(r, 15000)),
      ]);
      handle.agent.send(userMsg, 'next-turn', true);
      nudgeUntilClaimed(handle.agent, '');
      log(`сообщение передано агенту чата ${chatId} (${text.length} знаков)`);
    } catch (e) {
      log(`🔴 не удалось передать сообщение агенту: ${e?.message ?? e}`);
      await tg.send(chatId, 'Не смог передать ваше сообщение агенту. Разбираюсь.');
    }
  }

  // ── КАНАЛ АГЕНТ↔АГЕНТ (координатор ↔ агент), через файлы.
  //
  // Telegram тут не годится: у агента нет и не может быть учётной записи
  // пользователя, а бот боту не пишет — так устроен мессенджер. Поэтому связь
  // через каталог обмена, он же работает поверх ssh с любой машины фермы.
  //
  //   входящие мне:  <a2aDir>/in/*.txt   — кладёт координатор, я передаю агенту
  //   исходящие ей:  <a2aDir>/out/*.txt  — пишет агент, забирает координатор
  // Каталог обмена задаётся настройкой: у каждого агента он свой. Не задан —
  // межагентского канала у этого агента просто нет, и опрос не ведётся вовсе
  // (молчаливое создание чужих каталогов было бы хуже отсутствия связи).
  const A2A_DIR = config.a2aDir || null;
  const A2A_IN = A2A_DIR ? path.join(A2A_DIR, 'in') : null;
  const A2A_OUT = A2A_DIR ? path.join(A2A_DIR, 'out') : null;
  const A2A_CHAT = config.a2aSession || 'a2a';  // отдельная сессия, не смешивается с Telegram

  async function pollA2A() {
    if (!A2A_DIR) return;
    let files = [];
    try {
      fs.mkdirSync(A2A_IN, { recursive: true });
      fs.mkdirSync(A2A_OUT, { recursive: true });
      files = fs.readdirSync(A2A_IN).filter((f) => f.endsWith('.txt')).sort();
    } catch { return; }
    for (const f of files) {
      const full = path.join(A2A_IN, f);
      let text = '';
      try {
        text = fs.readFileSync(full, 'utf-8').trim();
      } catch (e) {
        // 🔴 НЕ ГЛОТАТЬ. Раньше здесь стоял `catch { continue; }` — и файл,
        // который нам не по правам (например 600 root:root), молча оставался
        // лежать во входящих. Снаружи это «агент не отвечает», а на деле
        // мы даже не смогли прочитать вопрос. Поймано 18.08.2026.
        log(`[a2a] 🔴 не смогла прочитать ${f}: ${e?.message ?? e} (права: попробуй chown dsh:dsh + chmod 644)`);
        continue;
      }
      if (!text) continue;
      try {
        const { handle, sessionId: a2aSessionId } = await agentFor(A2A_CHAT);
        lastOrigin.set(a2aSessionId, 'a2a');
        pushAsk(a2aSessionId, { origin: 'a2a', who: 'координатор', q: text });
        copyAsk('a2a', 'координатор', text);
        // 🔴 ПОМЕТКУ СТАВИТ КАНАЛ, А НЕ ОТПРАВИТЕЛЬ (20.08.2026). Когда личный
        // чат владельца и служебный канал сведены в ОДНУ сессию, агент не может
        // отличить, кто говорит: подпись в тексте подделывается тривиально.
        // Наш агент на этом верно упёрся — отказался выполнять просьбу,
        // подписанную чужим именем, пришедшую не из своего канала. Значит
        // происхождение обязан сообщать код доставки, которому подделать нечем.
        text = `[служебный канал, от координатора]\n${stripMark(text)}`;
        handle.agent.send(platform.createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'user' },
        }), 'next-turn', true);
        nudgeUntilClaimed(handle.agent, '[a2a]');
        // 🔴 УДАЛЯЕМ ТОЛЬКО ПОСЛЕ УСПЕШНОЙ ПЕРЕДАЧИ (19.08.2026). Раньше файл
        // стирался сразу после чтения — и когда передача падала (фабрика
        // агентов ещё не поднялась), вопрос исчезал молча: ни ответа, ни следа.
        try { fs.unlinkSync(full); } catch { /* уже убрали — не беда */ }
        log(`[a2a] принято (${text.length} знаков)`);
      } catch (e) {
        log(`[a2a] 🔴 не удалось передать агенту: ${e?.message ?? e} — файл ${f} ОСТАВЛЕН во входящих, попробую снова`);
      }
    }
  }

  async function loop(run) {
    while (run.alive) {
      try {
        await pollA2A();
        const updates = await tg.poll(25);
        for (const u of updates) {
          try { await handleUpdate(u); }
          catch (e) { log(`ошибка обработки обновления: ${e?.message ?? e}`); }
        }
      } catch (e) {
        // Сеть моргнула или Telegram ответил ошибкой — ждём и продолжаем.
        log(`опрос не удался: ${e?.message ?? e}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    run.finished = true;
  }

  // ctx.effect — регистрация с обязательным откатом: при выгрузке плагина
  // опрос корректно останавливается, а не остаётся висеть.
  //
  // 🔴 ОДИН ОПРОС НА БОТА, СЧЁТЧИК МОНТАЖЕЙ — А НЕ ЭСТАФЕТА (19.08.2026, три
  // неверные попытки подряд, поэтому пишу подробно).
  //
  // Платформа за один запуск процесса монтирует канал ДВАЖДЫ и второй монтаж
  // тут же снимает. Что из этого выходило:
  //   1) общий флаг `running`: откат гасил его, но второй цикл жил дальше →
  //      два опроса одного бота → Telegram рвёт обоих ошибкой Conflict;
  //   2) «своя жизнь у каждого запуска» + вежливая передача эстафеты: новый
  //      монтаж просил прежний уступить, а сам был снят платформой → не
  //      опрашивал НИКТО, при этом в журнале честно значилось «подключён как».
  //      Снаружи неотличимо от работающего канала — бот просто молчит.
  //
  // Верная модель: опрос принадлежит БОТУ, а не монтажу. Монтажи лишь считают
  // ссылки: первый поднимает опрос, последний снятый — гасит. Снятие ОДНОГО из
  // двух монтажей ничего не останавливает.
  ctx.effect(() => {
    let state = ACTIVE_POLLERS.get(token);
    if (!state) {
      state = { refs: 0, run: null };
      ACTIVE_POLLERS.set(token, state);
    }
    state.refs += 1;

    if (!state.run) {
      const run = { alive: true, finished: false };
      state.run = run;
      void (async () => {
        tg.whoAmI()
          .then((me) => log(`подключён как @${me.username} (${me.first_name})`))
          .catch((e) => log(`не удалось представиться Telegram: ${e?.message ?? e}`));
        log(`опрос запущен (монтажей: ${state.refs})`);
        await loop(run);
        log('опрос завершён');
      })();
    } else {
      log(`опрос уже идёт — второй не поднимаю (монтажей: ${state.refs})`);
    }

    return () => {
      state.refs -= 1;
      if (state.refs > 0) {
        log(`монтаж снят, опрос продолжается (осталось монтажей: ${state.refs})`);
        return;
      }
      if (state.run) {
        state.run.alive = false;
        state.run = null;
      }
      log('снят последний монтаж — опрос остановлен');
    };
  }, 'dsh-telegram-multiagent.poll');
}
