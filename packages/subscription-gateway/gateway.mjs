/**
 * Шлюз подписки Anthropic — общий системный сервис машины.
 *
 * ЗАЧЕМ. Агентов на машине несколько, каждый под своим пользователем. Если бы
 * подписочный токен клал себе каждый, секрет размножался бы по машине. Здесь он
 * живёт в ОДНОМ месте, под своим пользователем, а агенты получают точку входа.
 * Новый агент подключается строкой в конфиге и о токене не знает.
 *
 * 🔴 ПОЧЕМУ ВНУТРИ ОФИЦИАЛЬНЫЙ SDK, А НЕ РУЧНОЙ HTTP (урок 19.08.2026).
 * Сначала шлюз собирал запрос к API руками: подписочный токен, два бета-флага,
 * вынутые из бинаря. Авторизация проходила (с неверным токеном приходило 401,
 * с нашим — 429), но КАЖДЫЙ вызов отбивался лимитом, при полностью живой
 * подписке: в тот же момент на ней работали три агента. Перебрали и отбросили
 * четыре версии — заголовки клиента, привязку к модели, срок годности токена,
 * набор бета-флагов. Верным оказалось иное: сырой путь подписке просто не
 * отдают. Тот же токен, та же машина, тот же выход в сеть — SDK отвечает за
 * четыре секунды, ручной запрос получает отказ.
 * Вывод общего вида: НЕ ИЗОБРЕТАТЬ ПРОТОКОЛ ПОСТАВЩИКА. Вендорский код знает
 * тонкости, которых нет в документации, и переживёт их смену.
 *
 * 🔴 НЕЗАВИСИМОСТЬ ОТ ГЛАВНОЙ МАШИНЫ. SDK стоит ЗДЕСЬ, токен ЗДЕСЬ, выход в
 * сеть у машины свой. Главная машина в цепочке не участвует и может быть выключена —
 * это прямое требование владельца, проверенное живым вызовом.
 *
 * ГРАНИЦЫ. Слушает только петлю. Наружу не выставляется никогда: это доступ к
 * нашей подписке без пароля.
 *
 * 🔴 ИНСТРУМЕНТЫ ИСПОЛНЯЕТ ДВИЖОК, А НЕ ПЛАТФОРМА — И ОТСЮДА ВЫБОР ПОЛЬЗОВАТЕЛЯ.
 * SDK агентный: он сам ведёт цикл и сам выполняет оболочку, файлы, поиск, веб.
 * Значит «руки» агента — это тот пользователь, под которым идёт ЭТОТ процесс.
 * Поэтому служба запускается ЭКЗЕМПЛЯРОМ НА АГЕНТА (`<служба>@<агент>.service`), под
 * его собственным именем и на своём порту. Общий системный пользователь здесь
 * не годится структурно: у него нет доступа к дому агента, а все агенты машины
 * действовали бы одним лицом и топтали бы друг друга.
 * Что при этом ОСТАЁТСЯ общим: файл токена — один на машину, в конфиге агента
 * секрета нет, ротация в одном месте.
 * Что НЕ надо себе воображать: агент с sudo прочитает файл токена в любом
 * случае. Изоляция секрета реальна против агентов БЕЗ sudo.
 *
 * ГРАНИЦА ПРАВ. Подтверждения не запрашиваются (`bypassPermissions`): спросить
 * тут некого, на том конце не человек, а платформа. Реальная граница — права
 * пользователя экземпляра, и задаётся она в systemd, а не здесь.
 */

import http from 'node:http';
import fs from 'node:fs';
// 🔴 Глобальный crypto здесь — ВЕБ-версия: у неё есть randomUUID и нет
// createHash. Проверка синтаксиса это пропускает, падает первый же запрос
// (поймано пробой поведения 30.08.2026, до установки).
import nodeCrypto from 'node:crypto';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { shape } from './jsonschema-to-zod.mjs';

const PORT = Number(process.env.GATEWAY_PORT || 8788);
const HOST = '127.0.0.1';
const TOKEN_FILE = process.env.GATEWAY_TOKEN_FILE || '/etc/subscription-gateway/token';
const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_MAX_TURNS = Number(process.env.GATEWAY_MAX_TURNS || 60);
/**
 * Внешние серверы инструментов (MCP) для агента этого экземпляра. Задаются
 * переменной GATEWAY_MCP как JSON: {"omega":{"type":"http","url":"..."}}.
 * Пусто — агент работает без них, это не ошибка.
 */
const MCP_SERVERS = (() => {
  const raw = process.env.GATEWAY_MCP;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && Object.keys(v).length ? v : null;
  } catch (e) {
    // Молча игнорировать нельзя: агент останется без памяти, и это будет
    // выглядеть как «память не работает», а не как «я неверно записала строку».
    console.error(`[subscription-gateway] 🔴 GATEWAY_MCP не разобран: ${e?.message}`);
    return null;
  }
})();

/** Рабочий каталог инструментов по умолчанию — дом пользователя экземпляра. */
const WORK_DIR = process.env.GATEWAY_WORK_DIR || process.env.HOME || '/tmp';

// 🔴 ВЕРСИЯ ЧИТАЕТСЯ ИЗ СВОЕГО МАНИФЕСТА, А НЕ ПИШЕТСЯ ЛИТЕРАЛОМ (долг 106, 04.09.2026).
// ЗАЧЕМ. Шлюз писал в журнал только имя, без номера, и редакцию работающего экземпляра нельзя
// было установить НИЧЕМ: время файлов не годится (npm ставит всем файлам в тарболе одну метку
// 1985-10-26 08:15:00), сумма на диске отвечает про диск, а не про то, что процесс прочитал
// при старте. В тот же день строка `[dsh-pamyat-core <версия>]` у соседнего пакета трижды
// закрывала спор о том, что в бою, — здесь такой строки не было.
// ПОЧЕМУ НЕ ЛИТЕРАЛ: он разойдётся с манифестом молча. Манифест не прочитан — печатаем
// «неизвестна», а не выдуманное число: выдуманное хуже честного «не знаю».
// 🔴 ДВА ПРИЗНАКА, А НЕ ОДИН — и вторая половина куплена заменом (04.09.2026).
// Версия из манифеста работает В ПАКЕТЕ, но в ЖИВОМ каталоге манифест другой: это манифест
// установки зависимостей (private, без поля version), и правка дала бы «неизвестна». Проверено
// на копии живого каталога ДО того, как трогать боевой файл.
// Поэтому рядом печатается КОРОТКАЯ СУММА САМОГО ФАЙЛА: она не зависит ни от манифеста, ни от
// того, кто и как разложил установку, и опознаёт редакцию однозначно. Версия отвечает «какой
// выпуск», сумма — «этот ли ровно файл». Разойдутся — сразу видно, что установка не из пакета.
const VERSIYA = (() => {
  try {
    const put = new URL('./package.json', import.meta.url);
    return JSON.parse(fs.readFileSync(put, 'utf8')).version ?? 'неизвестна';
  } catch { return 'неизвестна'; }
})();
const SUMMA = (() => {
  try {
    const svoj = fs.readFileSync(new URL(import.meta.url));
    return nodeCrypto.createHash('sha256').update(svoj).digest('hex').slice(0, 8);
  } catch { return '????????'; }
})();

const log = (m) => console.error(`[subscription-gateway ${VERSIYA}/${SUMMA}] ${m}`);

/**
 * «exited with code N» от SDK — это только код без причины; истина в транскрипте
 * сессии. Ищем attachment.type == "max_turns_reached" и возвращаем человеческую
 * строку с числами. Не нашли — прежний текст + явное «причина не установлена»,
 * БЕЗ додумывания правдоподобной причины.
 */
function explainExit(err, sessionId, cwd) {
  const raw = String(err?.message ?? err);
  if (!/(?:exited with code|returned an error result)/.test(raw)) return raw;
  try {
    const slug = cwd.replaceAll('/', '-');
    const file = `${process.env.HOME || WORK_DIR}/.claude/projects/${slug}/${sessionId}.jsonl`;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('max_turns_reached')) continue;
      const a = JSON.parse(line)?.attachment;
      if (a?.type === 'max_turns_reached') {
        return `агент упёрся в лимит ходов: дошёл до ${a.turnCount} при пороге ${a.maxTurns} (max_turns_reached)`;
      }
    }
  } catch {
    return `${raw} — причина не установлена (транскрипт не прочитан)`;
  }
  return `${raw} — причина не установлена (в свежем транскрипте записи max_turns_reached нет)`;
}

/** Токен читаем при КАЖДОМ запросе: смена секрета не требует перезапуска. */
function readToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/** Короткая подпись к вызову инструмента: что именно он делает, одной строкой. */
function briefOf(input) {
  if (!input || typeof input !== 'object') return '';
  const v = input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.path ?? input.query;
  return typeof v === 'string' ? v.slice(0, 200) : '';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Собираем один текстовый запрос из сообщений.
 *
 * Осознанное упрощение: SDK принимает подсказку строкой. Историю склеиваем
 * ролевыми метками — модель их понимает, а платформа всё равно держит свою
 * историю у себя. Когда дойдут руки до инструментов, здесь появится настоящая
 * передача сообщений, а не склейка.
 */
function buildPrompt(messages) {
  const parts = [];
  for (const m of messages ?? []) {
    const who = m.role === 'assistant' ? 'Ассистент' : 'Пользователь';
    const c = m.content;
    const text =
      typeof c === 'string'
        ? c
        : Array.isArray(c)
          ? c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n')
          : '';
    if (text) parts.push(`${who}: ${text}`);
  }
  return parts.join('\n\n');
}

/**
 * МЕЖХОДОВОЙ КЭШ ПОДСКАЗКИ.
 *
 * Беда, ради которой это написано (замер 30.08.2026): платформа присылает всю
 * историю каждый ход, buildPrompt склеивает её в ОДИН блок, и этот блок
 * меняется целиком — кэш подсказки не попадает ни разу. На 128 ходах: запись
 * кэша 31,6 млн токенов на первых запросах ходов, то есть около 15% всей
 * условной стоимости уходит на переписывание того, что уже было записано.
 *
 * Лечение: SDK умеет продолжать свою сессию (`resume`). Тогда история едет
 * тем же байтом, что и в прошлый раз, и попадает в кэш целиком — замерено
 * A/B на живом SDK: та же история прежним способом даёт запись 22 128, через
 * resume — чтение 37 630 при записи 44.
 *
 * 🔴 ГДЕ ЭТО НЕ ДЕЙСТВУЕТ И ЧЕГО НЕ ДЕЛАЕТ:
 *  - не сокращает историю: это делает сжатие, отдельный рычаг;
 *  - не переживает перезапуск шлюза — состояние живёт в памяти процесса.
 *    После перезапуска первый ход каждой беседы снова холодный. Это осознанно:
 *    состояние на диске пришлось бы сводить с историей платформы, а расхождение
 *    двух источников правды дороже одного холодного хода;
 *  - не действует, если платформа переписала прошлые сообщения (сжатие,
 *    усечение, правка): префикс сверяется хэшем, не сошёлся — идём прежним
 *    путём с полной историей. Молчаливого расхождения быть не должно;
 *  - выключается целиком переменной GATEWAY_RESUME=0 без правки кода.
 *
 * 🔴 ИСТОЧНИК ПРАВДЫ — ПЛАТФОРМА. Транскрипт SDK здесь только кэш: его потеря
 * означает холодный ход, а не потерю разговора. Поэтому отказ возобновления
 * ловится и переигрывается полной историей, а не отдаётся наружу.
 */
const RESUME_ON = (process.env.GATEWAY_RESUME ?? '1') !== '0';
const SESSII = new Map(); // ключ беседы -> { sessionId, otdano, hashPref }
const SESSII_MAX = 8;     // бесед у агента единицы; предел от утечки памяти

function hashText(s) {
  return nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 32);
}

/** Текст сообщения в том же виде, в каком его склеивает buildPrompt. */
function tekstSoobshcheniya(m) {
  const c = m?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
  return '';
}

/** Ключ беседы: первое сообщение. Сменилось — это другая беседа. */
function kluchBesedy(messages) {
  const first = (messages ?? [])[0];
  if (!first) return null;
  return hashText((first.role ?? '') + '\u0000' + tekstSoobshcheniya(first));
}

/** Отпечаток первых n сообщений — сторож против молчаливой правки истории. */
function hashPrefiksa(messages, n) {
  const parts = [];
  for (let i = 0; i < n && i < messages.length; i++) {
    parts.push((messages[i].role ?? '') + '\u0000' + tekstSoobshcheniya(messages[i]));
  }
  return hashText(parts.join('\u0001'));
}

/**
 * Решение: продолжать сессию или начинать заново. Возвращает и то, чем потом
 * обновить состояние, — чтобы обновление шло по ФАКТУ отправленного, а не по
 * намерению.
 */
function planZaprosa(messages) {
  const msgs = messages ?? [];
  const kluch = kluchBesedy(msgs);
  const polnyj = { kluch, resume: null, prompt: buildPrompt(msgs), otdano: msgs.length, pochemu: 'полная история' };
  if (!RESUME_ON || !kluch) return polnyj;
  const st = SESSII.get(kluch);
  if (!st) return polnyj;
  if (msgs.length <= st.otdano) return polnyj;
  if (hashPrefiksa(msgs, st.otdano) !== st.hashPref) {
    // История переписана на той стороне. Говорим вслух: молчаливое расхождение
    // двух картин разговора — худшее, что здесь может случиться.
    log('история изменена платформой — продолжение сессии отменено, иду полной историей');
    SESSII.delete(kluch);
    return polnyj;
  }
  // Ответ прошлого хода SDK уже записал у себя; повторно его не шлём.
  let i = st.otdano;
  while (i < msgs.length && msgs[i]?.role === 'assistant') i++;
  if (i >= msgs.length) return polnyj;
  return {
    kluch,
    resume: st.sessionId,
    prompt: buildPrompt(msgs.slice(i)),
    otdano: msgs.length,
    pochemu: `продолжаю сессию, новых сообщений ${msgs.length - i} из ${msgs.length}`,
  };
}

/** Запоминаем ФАКТ: что именно отдано и каким был префикс. */
function zapomnit(plan, sessionId, messages) {
  if (!plan.kluch) return;
  if (SESSII.size >= SESSII_MAX && !SESSII.has(plan.kluch)) {
    SESSII.delete(SESSII.keys().next().value); // самая старая
  }
  SESSII.set(plan.kluch, {
    sessionId,
    otdano: plan.otdano,
    hashPref: hashPrefiksa(messages, plan.otdano),
  });
}

/**
 * МОСТ ИНСТРУМЕНТОВ ПЛАТФОРМЫ.
 *
 * Инструменты исполняет движок, поэтому его набор — единственный, который
 * видит модель. Плагины платформы до неё не доходят вовсе. Мост собирает из
 * описания, присланного платформой, MCP-сервер и проксирует вызовы обратно.
 *
 * 🔴 ШЛЮЗ НЕ ЗНАЕТ, ЧТО ЭТО ЗА ИНСТРУМЕНТЫ. Имена, описания и схемы приходят с
 * той стороны; здесь только транспорт. Следующий агент с другим набором
 * подключается без правки этого файла — это и есть общее решение, а не
 * заплатка под одного.
 *
 * ТРАНСПОРТ sdk, А НЕ stdio: sdk-сервер живёт в этом же процессе и не
 * порождает дочернего. Всё, что SDK передаёт дочернему процессу, уходит
 * аргументом --mcp-config и читается любым пользователем машины через
 * /proc/<pid>/cmdline (444) — проверено живым наблюдателем 22.08.2026.
 * Поэтому ПРОПУСК моста при sdk не утекает: он остаётся в памяти двух
 * процессов и в теле запроса по петле.
 *
 * 🔴 ЧТО ИМЕННО НОСИТ ШЛЮЗ. Не личность и не общий секрет, а ОДНОРАЗОВЫЙ
 * ПРОПУСК, выданный платформой на этот ход. Шлюз не знает, чей он: поля
 * личности агента в этом файле нет ни одного — ни в коде, ни в комментариях
 * (нарочно не пишем здесь и само имя поля: иначе проверка грепом нашла бы
 * собственную оговорку и приняла её за вхождение). Платформа сама достаёт
 * личность по пропуску из своей таблицы. Значит заявить чужую личность отсюда
 * нечем — ни модели, ни самому шлюзу.
 */
function buildBridgeServer(bridge) {
  if (!bridge?.url || !bridge?.ticket || !Array.isArray(bridge.tools) || !bridge.tools.length) return null;

  // 🔴 ШЛЮЗ НЕ ЗНАЕТ, ЧЕЙ ЭТО ЗАПРОС, И ЗНАТЬ НЕ ДОЛЖЕН. Он носит непрозрачный
  // одноразовый пропуск, выданный платформой на этот ход, и предъявляет его на
  // двери. Личность по пропуску достаёт сама платформа из своей таблицы.
  // Личность НЕ передаётся: тот, кто её заявляет, не должен быть тем, кто её
  // назначает. Пропуск живёт в ЗАМЫКАНИИ этого обработчика — при транспорте sdk
  // он не уходит ни в командную строку, ни в окружение (замерено: 0 попаданий
  // при 275 просмотренных процессах).
  const callBridge = async (toolName, args) => {
    const r = await fetch(bridge.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bridge-ticket': bridge.ticket },
      body: JSON.stringify({ tool: toolName, args }),
    });
    if (!r.ok) throw new Error(`мост ответил ${r.status}`);
    const out = await r.json();
    if (out?.ok !== true) throw new Error(String(out?.error ?? 'мост отказал без причины'));
    return out.value;
  };

  const tools = [];
  for (const t of bridge.tools) {
    let inputShape;
    try {
      inputShape = shape(t.inputSchema ?? { type: 'object', properties: {} });
    } catch (e) {
      // Инструмент со схемой, которую мы не умеем собрать, НЕ выставляем
      // «как есть»: модель получила бы инструмент без формы параметров и
      // ошибалась бы на исполнении. Пропуск громкий, остальные работают.
      log(`🔴 инструмент ${t.name} пропущен: ${e?.message}`);
      continue;
    }
    tools.push(
      tool(
        t.name,
        t.description ?? '',
        inputShape,
        async (args) => {
          try {
            const value = await callBridge(t.name, args ?? {});
            return { content: [{ type: 'text', text: JSON.stringify(value ?? null) }] };
          } catch (e) {
            // Отказ отдаём текстом, а не исключением: модель должна прочитать
            // причину и решить, что делать, а не увидеть обрыв инструмента.
            return { content: [{ type: 'text', text: `ОТКАЗ: ${e?.message ?? e}` }], isError: true };
          }
        },
      ),
    );
  }
  if (!tools.length) return null;

  // alwaysLoad: иначе инструменты уходят за поиск по каталогу и в системном
  // заголовке их не видно — а именно заголовок у нас признак приёмки.
  return createSdkMcpServer({ name: bridge.name || 'dsh', version: '0.1.0', tools, alwaysLoad: true });
}

/**
 * Слить серверы инструментов, НЕ давая мосту затереть чужой сервер своим именем.
 *
 * 🔴 ПРАВИЛО ИМЁН (главная, 22.08.2026): имена серверов не должны совпадать —
 * ни с уже подключёнными здесь, ни между уровнями корень/помощник. Цена
 * совпадения молчаливая и в обе стороны:
 *   * здесь простой спред затёр бы одноимённый сервер (например omega) целиком,
 *     и модель получила бы вместо него мост, ничего об этом не узнав;
 *   * у помощника (опыт Б, 22.08) сервер с ИМЕНЕМ КОРНЯ поднимается со своим
 *     окружением, а отвечает всё равно корневой — по факту старта кажется, что
 *     настройка работает.
 * Поэтому столкновение — отказ подключить мост, а не тихая замена: без моста
 * агент работает хуже, с подменённым сервером — неверно.
 */
function mergeMcpServers(base, bridgeName, bridgeServer) {
  const servers = { ...(base ?? {}) };
  if (!bridgeServer) return { servers, mounted: false, conflict: null };
  if (Object.prototype.hasOwnProperty.call(servers, bridgeName)) {
    return { servers, mounted: false, conflict: bridgeName };
  }
  servers[bridgeName] = bridgeServer;
  return { servers, mounted: true, conflict: null };
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    const ok = Boolean(readToken());
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
    // Здоровьем считаем НАЛИЧИЕ секрета, а не «процесс жив»: без токена служба
    // поднята, но бесполезна, и это должно быть видно снаружи.
    res.end(JSON.stringify({ ok, token: ok ? 'есть' : 'НЕТ', sdk: true }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/v1/agent-stream') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'неизвестный путь; есть /v1/agent-stream и /health' }));
    return;
  }

  const token = readToken();
  if (!token) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'no_credential', message: 'нет подписочного токена' } }));
    log('🔴 запрос отклонён: токен не прочитан');
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'bad_json', message: 'тело запроса не разобрано' } }));
    return;
  }

  // Поток событий строками JSON: одна строка — одно событие. Формат наш
  // собственный и намеренно простой; переводом в протокол платформы занимается
  // модуль на стороне агента.
  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache',
  });
  const send = (o) => res.write(JSON.stringify(o) + '\n');

  const started = Date.now();
  const cwd = body.cwd || WORK_DIR;
  let plan = planZaprosa(body.messages);
  // Свой id нужен и при возобновлении: SDK его сохраняет (проверено — id после
  // resume тот же), а нам он нужен для объяснения отказа в explainExit.
  const sessionId = plan.resume || crypto.randomUUID(); // Node >=19, у нас v24

  // Мост инструментов платформы: подключается ТОЛЬКО когда та сторона прислала
  // описание с пропуском. Нет его — поведение прежнее, байт в байт.
  let bridgeServer = null;
  try {
    bridgeServer = buildBridgeServer(body.bridge);
  } catch (e) {
    // Сбой сборки моста не должен рушить сам запрос: без инструментов агент
    // работает хуже, но работает. Молчать при этом нельзя.
    log(`🔴 мост не собран: ${e?.message}`);
  }
  const bridgeName = body.bridge?.name || 'dsh';
  const merged = mergeMcpServers(MCP_SERVERS, bridgeName, bridgeServer);
  const mcpAll = merged.servers;
  // Строка «подключён» печатается ПОСЛЕ слияния и только при удаче: она у нас
  // признак приёмки, и врать ей нельзя.
  if (merged.mounted) log(`мост подключён: инструментов ${body.bridge.tools.length}, сервер "${bridgeName}" (личность несёт пропуск, шлюз её не знает)`);
  else if (merged.conflict) log(`🔴 мост НЕ подключён: имя сервера "${merged.conflict}" уже занято другим сервером инструментов`);
  try {
    let model = null;
    let otdanoSobytij = 0;
    // Откат возможен, только пока наружу не ушло ни одного события: после
    // первого отданного куска переиграть ход уже нельзя, иначе платформа
    // получит два начала одного ответа.
    const otdat = (o) => { otdanoSobytij++; send(o); };

    const progon = async (tekushchij) => {
    const iter = query({
      prompt: tekushchij.prompt,
      options: {
        model: body.model || DEFAULT_MODEL,
        // Цикл с инструментами: одного хода хватает только на разговор. Предел
        // держим, чтобы заклинивший агент не крутился вечно, но с запасом.
        maxTurns: Number(body.maxTurns) > 0 ? Number(body.maxTurns) : DEFAULT_MAX_TURNS,
        permissionMode: 'bypassPermissions',
        // Продолжаем свою же сессию, когда префикс сошёлся: тогда история
        // едет тем же байтом и попадает в кэш подсказки целиком.
        ...(tekushchij.resume ? { resume: tekushchij.resume } : { sessionId }),
        // 🔴 ВНЕШНИЕ СЕРВЕРЫ ИНСТРУМЕНТОВ ПОДКЛЮЧАЮТСЯ ЗДЕСЬ, А НЕ В ПЛАТФОРМЕ
        // (19.08.2026, стоило часа). Инструменты исполняет движок, поэтому его
        // набор — единственный, который агент видит. Плагин-клиент на стороне
        // платформы подключается без ошибок, числится в составе — и до агента
        // не доходит вовсе: платформа в этой схеме только шасси.
        ...(Object.keys(mcpAll).length ? { mcpServers: mcpAll } : {}),
        ...(body.cwd ? { cwd: body.cwd } : { cwd: WORK_DIR }),
        ...(body.system ? { systemPrompt: { type: 'preset', preset: 'claude_code', append: body.system } } : {}),
        env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token },
      },
    });

    for await (const m of iter) {
      if (m.type === 'assistant') {
        model = m.message?.model ?? model;
        for (const b of m.message?.content ?? []) {
          if (b.type === 'text') otdat({ type: 'text', text: b.text });
          else if (b.type === 'thinking') otdat({ type: 'thinking', text: b.thinking });
          // Работу инструментами отдаём наружу СОБЫТИЕМ, а не молчанием: иначе
          // долгий заход выглядит как зависший, и платформе нечего показать.
          // Ввод инструмента не пересылаем целиком — там бывают секреты и
          // мегабайты; только имя и короткая подпись.
          else if (b.type === 'tool_use') otdat({ type: 'tool', name: b.name, brief: briefOf(b.input) });
        }
        const u = m.message?.usage;
        if (u) {
          otdat({
            type: 'usage',
            inputTokens: u.input_tokens ?? 0,
            outputTokens: u.output_tokens ?? 0,
            cacheReadTokens: u.cache_read_input_tokens,
            cacheWriteTokens: u.cache_creation_input_tokens,
          });
        }
      }
    }
    };

    log(`подсказка: ${plan.pochemu}`);
    try {
      await progon(plan);
    } catch (e) {
      // Транскрипт SDK — кэш, а не источник правды. Его потеря (чистка,
      // перезапуск, чужая рука) не должна стоить хода: переигрываем полной
      // историей и говорим об этом вслух.
      if (!plan.resume || otdanoSobytij > 0) throw e;
      log(`🔴 продолжение сессии ${plan.resume} не удалось (${String(e?.message ?? e).slice(0, 140)}) — повторяю полной историей`);
      SESSII.delete(plan.kluch);
      plan = planZaprosa(body.messages);
      await progon(plan);
    }
    zapomnit(plan, plan.resume || sessionId, body.messages);
    send({ type: 'done', model, tookMs: Date.now() - started });
  } catch (e) {
    // Ошибку отдаём В ПОТОКЕ, а не молчанием: оборванный поток без причины
    // читается как «модель замолчала», и разбираться приходится с нуля.
    const message = explainExit(e, sessionId, cwd);
    log(`🔴 сбой вызова: ${message}`);
    send({ type: 'error', message: message.slice(0, 500) });
  } finally {
    res.end();
  }
});

server.listen(PORT, HOST, () => {
  log(`слушаю ${HOST}:${PORT}; токен из ${TOKEN_FILE}; движок — официальный SDK`);
  if (!readToken()) log('🔴 предупреждение: токен сейчас НЕ читается, запросы будут отклоняться');
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log(`получен ${sig}, закрываюсь`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
