/**
 * Провайдер Claude по подписке Anthropic для платформы DSH.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Штатные провайдеры платформы ходят по API-ключу.
 * У нас подписка, а её токен живёт на пути Claude Code: он принимается обычным
 * API сообщений, но только с двумя бета-заголовками. Поэтому свой адаптер.
 *
 * ОТКУДА ВЗЯТЫ ЗАГОЛОВКИ. Не придуманы и не из документации: вытащены строками
 * из бинаря агентного SDK, который работает на aclaude, — `oauth-2025-04-20`
 * и `context-1m-2025-08-07`. Второй и даёт миллионное окно.
 *
 * ПРОВЕРЕНО ЖИВЫМ ЗАПРОСОМ 19.08.2026: с нашим токеном и этими заголовками
 * приходит 429 (лимит), с намеренно неверным токеном — 401. Разные ответы
 * доказывают, что авторизация проходит, а упирается всё в квоту.
 *
 * 🔴 СЕКРЕТА ЗДЕСЬ НЕТ ВООБЩЕ. Токен держит общий системный шлюз машины
 * (claude-oauth-gateway), а модуль ходит к нему по петле. Поэтому агенты —
 * Искра, Петрович и любой следующий — не получают подписочный токен ни в
 * каком виде: у них есть точка входа, а не секрет. Новый агент подключается
 * строкой в конфиге и о токене не знает.
 *
 * 🔴 И НИКОГДА НЕ ВЫСТАВЛЯТЬ ANTHROPIC_API_KEY РЯДОМ. На aclaude это правило
 * зафиксировано кровью: ключ перебивает подписочный токен, и работа начинает
 * оплачиваться вторым способом молча.
 */

import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { readFileSync } from 'node:fs';

export const name = 'subscription-gateway';
export const inject = ['llm', 'agents'];

/** Маршрут провайдера. Запрос выбирает адаптер строкой provider. */
const PROVIDER = 'claude-oauth';

/** Локальный шлюз, который и хранит подписочный токен. Только петля. */
const DEFAULT_GATEWAY = 'http://127.0.0.1:8788';

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_CONTEXT_WINDOW = 1_000_000;
const DEFAULT_MAX_TOKENS = 32_000;

/**
 * 🔴 ПРЕДЕЛ МОЛЧАНИЯ ПОТОКА. Почему он здесь и почему именно такой.
 *
 * БЕДА. Ход обрывался `TypeError: terminated` ровно через 300,2-300,4 с тишины
 * потока (ходы 81 и 101 журнала сессии). Рвал не поставщик, а КЛИЕНТ: у
 * встроенного в Node клиента undici два умолчания по 3e5 мс = 300 с —
 * `bodyTimeout` (молчание ПОСЛЕ начала ответа) и `headersTimeout` (ожидание
 * ПЕРВЫХ заголовков). Их никто не выбирал: это умолчание библиотеки.
 *
 * ЧИСЛО 1 800 000 (30 мин) — не «побольше», а два независимых довода:
 *  1) замер живых ходов: наибольшая ЗАКОННАЯ пауза между кусками потока —
 *     181,0 с (ход 29); пауз длиннее 300 с нет ни одной, потому что там и
 *     рвало. Выборка ЦЕНЗУРИРОВАНА самим пределом: сколько модель молчала бы
 *     без обрыва, мы не знаем. Поэтому запас берётся кратным (10x к 181 с),
 *     а не «чуть больше наблюдённого максимума»;
 *  2) слово координатора: столько же держит сторож раннера. Молчание дольше
 *     собственного сторожа означает, что что-то действительно умерло.
 *
 * 🔴 НОЛЬ (отключить) НЕ СТАВИТСЯ НИКОГДА. Защита без границы производит тот
 * вред, от которого защищает: с нулём зависшее соединение держится вечно и
 * занимает полосу. Предел обязан быть конечным.
 *
 * ЧЕГО ЭТА ПРАВКА НЕ ДЕЛАЕТ. Она не лечит ПРИЧИНУ молчания — почему модель
 * молчит по пять минут, вопрос отдельный. Она лечит только то, что клиент
 * рвал связь раньше времени.
 *
 * ГРАНИЦА ДЕЙСТВИЯ: правка касается ТОЛЬКО нашего запроса к шлюзу (участок
 * платформа -> шлюз). Дальше по цепи шлюз общается с бинарником SDK по stdio,
 * а тот ходит к API сам — там наши пределы не действуют вовсе.
 */
const PREDEL_MOLCHANIYA_MS = 1_800_000;

/**
 * Класс Agent встроенного undici. Пакета `undici` в дереве НЕТ (проверено:
 * import даёт ERR_MODULE_NOT_FOUND, `node:undici` не существует), а класс
 * нужен, чтобы задать пределы. Берём его из глобального диспетчера, который
 * undici заводит при первом fetch: символ `undici.globalDispatcher.N`.
 *
 * 🔴 ЭТО ОПОРА НА ВНУТРЕННИЙ СИМВОЛ. Сменится его имя — способ перестанет
 * работать. Поэтому неудача здесь ГРОМКАЯ: пишем в журнал и работаем по
 * старому пути. Молчаливой деградации быть не должно — иначе предел тихо
 * вернётся к 300 с, и обрывы начнутся снова без единой строки о причине.
 */
let dispetcherPredela = null;
let dispetcherProboval = false;

function poluchitDispetcher(log) {
  if (dispetcherProboval) return dispetcherPredela;
  dispetcherProboval = true;
  try {
    const najti = () => Object.getOwnPropertySymbols(globalThis)
      .find((x) => /undici\.globalDispatcher/.test(x.toString()));
    const klyuch = najti();
    if (!klyuch) {
      // Символа нет даже после прогрева — значит устройство undici сменилось.
      // 🔴 Молчать здесь нельзя: без строки предел тихо вернётся к 300 с.
      log?.('🔴 предел молчания НЕ задан: символ глобального диспетчера undici '
        + 'не найден даже после прогрева. Остаётся умолчание 300 000 мс — '
        + 'обрывы terminated через 5 минут тишины вернутся.');
      return null;
    }
    const Agent = Object.getPrototypeOf(globalThis[klyuch]).constructor;
    dispetcherPredela = new Agent({
      bodyTimeout: PREDEL_MOLCHANIYA_MS,
      headersTimeout: PREDEL_MOLCHANIYA_MS,
    });
    log?.(`предел молчания потока: ${PREDEL_MOLCHANIYA_MS} мс (bodyTimeout и `
      + `headersTimeout), вместо умолчания undici 300 000`);
    return dispetcherPredela;
  } catch (e) {
    log?.('🔴 предел молчания НЕ задан, остаётся умолчание undici 300 000 мс — '
      + `обрывы terminated через 5 минут тишины вернутся. Причина: ${String(e?.message ?? e).slice(0, 160)}`);
    return null;
  }
}

class ClaudeOauthAdapter extends LlmAdapter {
  constructor(options) {
    super();
    this.baseURL = options.baseURL;
    this.models = options.models;
    this.contextWindow = options.contextWindow;
    this.maxTokens = options.maxTokens;
    this.log = options.log;
    /**
     * Поставщик описания моста инструментов. Возвращает описание с ОДНОРАЗОВЫМ
     * ПРОПУСКОМ для ТЕКУЩЕГО хода либо undefined, когда моста нет или инициатор
     * неизвестен. Вызывается на каждый запрос: пропуск у каждого хода свой.
     * Личность здесь НЕ отдаётся наружу — её знает только платформа.
     */
    this.bridgeFor = options.bridgeFor;
  }

  providerInfo(provider) {
    return { id: provider, name: 'Claude (подписка Anthropic)' };
  }

  async listModels(provider) {
    return this.models.map((m) => ({
      provider,
      id: m.id,
      name: m.name ?? m.id,
      description: m.description,
    }));
  }

  async resolveModel(provider, model) {
    const known = this.models.find((m) => m.id === model);
    // Неизвестная модель НЕ отвергается — контракт прямо требует пропускать
    // незаявленные идентификаторы. Но окно тогда берётся общее, и это честнее,
    // чем притвориться, что мы знаем ёмкость.
    return {
      provider,
      id: model,
      name: known?.name ?? model,
      description: known?.description,
      context: { contextWindow: known?.contextWindow ?? this.contextWindow },
      defaultMaxTokens: known?.maxTokens ?? this.maxTokens,
    };
  }

  /**
   * Проверка, что рядом не завёлся API-ключ. Тихое сосуществование двух
   * способов оплаты — худший исход: работа идёт, деньги списываются дважды.
   */
  warnIfApiKey() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.log?.('🔴 рядом задан ANTHROPIC_API_KEY — он перебивает подписку. Убрать.');
    }
  }

  /** Сообщения платформы → формат Anthropic. Неизвестное НЕ выбрасываем молча. */
  toAnthropicMessages(messages) {
    const out = [];
    for (const m of messages ?? []) {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const c = m.content;
      if (typeof c === 'string') {
        out.push({ role, content: c });
        continue;
      }
      if (Array.isArray(c)) {
        const blocks = [];
        for (const b of c) {
          if (b?.type === 'text' && typeof b.text === 'string') {
            blocks.push({ type: 'text', text: b.text });
          } else if (b?.type) {
            this.log?.(`блок типа ${b.type} не перенесён в запрос — пока не поддержан`);
          }
        }
        if (blocks.length) out.push({ role, content: blocks });
        continue;
      }
      this.log?.('сообщение неизвестной формы пропущено');
    }
    return out;
  }

  async *stream(options) {
    this.warnIfApiKey();
    const body = {
      model: options.model || DEFAULT_MODEL,
      maxTokens: options.maxTokens ?? this.maxTokens,
      messages: options.messages ?? [],
    };
    if (options.system) body.system = options.system;

    // 🔴 МОСТ ИНСТРУМЕНТОВ. Шлюз не знает, чей запрос: в теле до сегодняшнего
    // дня было ровно четыре ключа (model, maxTokens, messages, system — снято
    // живым срезом 22.08.2026), а полей опознания нет ни одного. Отсюда мы
    // добавляем ОДИН ключ — описание моста с одноразовым пропуском. Личности в
    // нём нет: шлюз носит непрозрачную строку и про агентов ничего не знает.
    // Без моста поле не добавляется вовсе — старое поведение сохраняется байт
    // в байт (доказано: неизвестное шлюзу maxTokens приходит в каждом настоящем
    // запросе, 99 ходов без отказа).
    const attach = this.bridgeFor?.();
    if (attach) body.bridge = attach;

    let res;
    try {
      // Прогрев: символ глобального диспетчера undici появляется только после
      // первого fetch в процессе. Будим его отказом на закрытый локальный порт
      // (мгновенный ECONNREFUSED, наружу не ходит) — один раз за жизнь процесса.
      if (!dispetcherProboval) {
        await fetch('http://127.0.0.1:1/').catch(() => {});
      }
      const dispatcher = poluchitDispetcher(this.log);
      res = await fetch(`${this.baseURL}/v1/agent-stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: options.signal,
        ...(dispatcher ? { dispatcher } : {}),
      });
    } catch (e) {
      throw this.wrapFailure(e);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw this.wrapFailure({ status: res.status, message: text.slice(0, 300) });
    }

    // Шлюз отдаёт по строке JSON на событие. Разметку блоков выставляем сами:
    // поток без block-start/block-end собеседник видит как молчание модели.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let index = -1;
    let openBlock = null;
    let finished = false;
    // 🔴 ТЕКСТ БЛОКА КОПИМ САМИ (поймано 19.08.2026 разбором сохранённой сессии).
    // Платформа берёт ИТОГ блока из `block-end`, а не из суммы `text-delta`.
    // Мы закрывали блок пустой строкой — и в сохранённой сессии оказывалось
    // сообщение ассистента с ОДНИМ пустым текстовым блоком. Снаружи это
    // «модель ответила, но ответа нет»: куски потока идут, ход завершается
    // успешно, в чат уходит пустота. Ровно поэтому же безоконный прогон
    // «не печатал ответ» — я приняла это за мелочь, а это был тот же дефект.
    let acc = '';

    const closeBlock = () => ({
      type: 'block-end',
      index,
      block: { type: openBlock === 'reasoning' ? 'thinking' : 'text', text: acc },
    });

    const openIfNeeded = function* (kind) {
      if (openBlock === kind) return;
      if (openBlock !== null) yield closeBlock();
      index += 1;
      openBlock = kind;
      acc = '';
      yield { type: 'block-start', index, blockType: kind };
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev;
          try {
            ev = JSON.parse(line);
          } catch {
            this.log?.(`строка потока не разобрана: ${line.slice(0, 80)}`);
            continue;
          }
          if (ev.type === 'text') {
            yield* openIfNeeded('text');
            acc += ev.text ?? '';
            yield { type: 'text-delta', index, text: ev.text };
          } else if (ev.type === 'thinking') {
            yield* openIfNeeded('reasoning');
            acc += ev.text ?? '';
            yield { type: 'reasoning-delta', index, text: ev.text };
          } else if (ev.type === 'usage') {
            yield {
              type: 'usage',
              usage: {
                inputTokens: ev.inputTokens ?? 0,
                outputTokens: ev.outputTokens ?? 0,
                cacheReadTokens: ev.cacheReadTokens,
                cacheWriteTokens: ev.cacheWriteTokens,
              },
            };
          } else if (ev.type === 'error') {
            // Ошибка ПРИШЛА В ПОТОКЕ — это не обрыв, а внятная причина. Не глотаем.
            const err = new Error(ev.message || 'шлюз сообщил об ошибке');
            err.code = 'GATEWAY_ERROR';
            throw err;
          } else if (ev.type === 'done') {
            finished = true;
          }
        }
      }
      if (openBlock !== null) yield closeBlock();
      if (!finished) {
        // Поток кончился без «готово» — это обрыв, и молчать о нём нельзя.
        const err = new Error('шлюз оборвал поток, не сказав «готово»');
        err.code = 'INCOMPLETE_STREAM';
        throw err;
      }
      yield { type: 'finish', reason: 'stop' };
    } catch (e) {
      throw this.wrapFailure(e);
    }
  }

  finishReason(stop) {
    if (stop === 'max_tokens') return 'length';
    if (stop === 'tool_use') return 'tool-call';
    return 'stop';
  }

  /**
   * Сбой провайдера → машинный код. Особо важен 429: платформа сама умеет
   * повторять, но только если увидит код, а не безымянную ошибку сети.
   */
  wrapFailure(e) {
    const status = e?.status ?? e?.response?.status;
    const err = new Error(e?.message ?? 'сбой обращения к Anthropic');
    err.status = status;
    err.requestId = e?.request_id ?? e?.requestID;
    if (status === 503) err.code = 'GATEWAY_NO_CREDENTIAL';
    else if (status === 401 || status === 403) err.code = 'INVALID_CREDENTIAL';
    else if (status === 429) err.code = 'RATE_LIMIT';
    else if (e?.name === 'AbortError') err.code = 'ABORTED';
    else if (status >= 500) err.code = 'PROVIDER_ERROR';
    else err.code = 'REQUEST_FAILED';
    const retry = e?.headers?.['retry-after'];
    if (retry) err.providerRetryAfterMs = Number(retry) * 1000;
    return err;
  }
}

export function apply(ctx, config = {}) {
  const log = (m) => console.error(`[claude-oauth] ${m}`);

  // 🔴 СТРОКА ПОДЪЁМА С ИМЕНЕМ ПАКЕТА И ВЕРСИЕЙ (долг 108, закрыт для этого пакета
  // 05.09.2026). Прибор «перед подъёмом» сверяет бой по строке, которую пакет печатает
  // о себе; без неё он честно пишет «НЕ СВЕРЯЕМ», и пакет выпадает из проверки подъёма.
  // 🔴 У ЭТОГО ПРЕДМЕТА ТРИ РАЗНЫХ ИМЕНИ, и это не мелочь:
  //     каталог   claude-oauth
  //     пакет     dsh-subscription-adapter   ← по нему ищет прибор
  //     экспорт   subscription-gateway       ← им подписаны прочие строки в журнале
  // Прибор ищет ИМЯ ПАКЕТА. Напечатай мы здесь любое из двух других — он не нашёл бы
  // ничего и молчал бы дальше, а мы считали бы пакет сверенным.
  // Версия берётся из манифеста, а не строкой в коде: строка разошлась бы молча.
  try {
    const m = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    console.error(`[${m.name} ${m.version}] подъём`);
  } catch (e) {
    console.error(`[dsh-subscription-adapter версия НЕ ПРОЧИТАНА] подъём: ${e?.message ?? e}`);
  }

  /**
   * Личность текущего хода + описание моста. Пусто — если мост не смонтирован
   * (у агента с родным циклом он не нужен) или ход идёт вне границы
   * инициатора. Молча пустое здесь правильно: это не сбой, а «мост не наш».
   */
  const bridgeFor = () => {
    const bridge = ctx.get('mcpBridge');
    if (!bridge) return undefined;
    const agent = ctx.get('agents')?.currentInitiator();
    if (!agent) {
      log('мост есть, но инициатор хода неизвестен — инструменты не подключены');
      return undefined;
    }
    // Личность уходит В МОСТ, а не в тело запроса: мост заводит на неё пропуск
    // и отдаёт только его.
    return bridge.descriptor(String(agent.id));
  };

  const adapter = new ClaudeOauthAdapter({
    bridgeFor,
    baseURL: config.baseURL ?? DEFAULT_GATEWAY,
    contextWindow: config.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    models: config.models ?? [
      {
        id: DEFAULT_MODEL,
        name: 'Claude Opus 5',
        description: 'Подписка Anthropic, окно 1M',
        contextWindow: DEFAULT_CONTEXT_WINDOW,
      },
    ],
    log,
  });

  const handle = ctx.llm.registerAdapter([PROVIDER], adapter);
  // 🔴 ИСТОЧНИК ОКНА ПЕЧАТАЕТСЯ РЯДОМ С ЧИСЛОМ (03.09.2026). Прежде строка называла
  // только само число, и «настройка» была неотличима от «умолчания». А умолчание здесь
  // ОБЪЯВЛЕНО НАМИ, а не спрошено у провайдера ЗДЕСЬ И СЕЙЧАС: наш шлюз проксирует лишь
  // /v1/agent-stream и /health, списка моделей у него нет (замер 03.09: /v1/models -> 404).
  // Ходить в сеть при подъёме модуль не должен: старт стал бы зависеть от доступности
  // чужой службы, а окно нужно ему сразу.
  //
  // 🔴 НО ЧИСЛО БОЛЬШЕ НЕ ДОГАДКА. 03.09.2026 оно сверено с первоисточником — прямым
  // запросом GET https://api.anthropic.com/v1/models/claude-opus-5, поле max_input_tokens
  // (не context_window: такого поля не существует). Ответ: 1000000, совпал с объявленным.
  // Утром того же дня я писала «спросить нечем», померив три пути и не проверив четвёртый.
  // Поэтому строка называет не «умолчание», а СПОСОБ ПЕРЕПРОВЕРКИ: число без способа
  // через месяц снова станет догадкой, и отличить его от замера будет нечем.
  const istochnikOkna = config.contextWindow == null ? 'умолчание модуля' : 'настройка профиля';
  log(
    `маршрут «${PROVIDER}» зарегистрирован; модель по умолчанию ${DEFAULT_MODEL}, ` +
      `окно ${adapter.contextWindow ?? DEFAULT_CONTEXT_WINDOW} (${istochnikOkna}; ` +
      `вживую при подъёме НЕ спрашивается — шлюз списка моделей не отдаёт. ` +
      `Сверить с первоисточником: dorabotki/sverka-okna-s-provajderom.sh), ` +
      `через шлюз ${adapter.baseURL} (секрета в модуле нет)`,
  );

  ctx.on('dispose', () => {
    try {
      handle?.dispose?.();
    } catch {
      /* платформа гасится, жаловаться некому */
    }
  });
}
