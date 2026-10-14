// RU: Адаптер provider-маршрута DSH: переводит gateway NDJSON в content blocks, доставляет trusted session/bridge/control descriptors. Подписочного токена здесь нет; отдельный ingress key читается перед HTTP.
// EN: DSH provider adapter: converts gateway NDJSON into content blocks and carries trusted session/bridge/control descriptors. It has no subscription token; a separate ingress key is read before HTTP.
// RU: Имя npm пакета, exportname и provider ID — разные интерфейсы. Регистрация модели задаёт заявленные окна, не измеряет сервер; фактическую model/provider проверяет шлюз.
// EN: The npm package name, exported plugin name and provider ID are distinct interfaces. Model registration declares context windows without measuring the server; the gateway verifies actual model/provider.
import {readIngressKey} from './ingress-auth.js';
import {conversationForAgent,checkConversationCapability} from './conversation-identity.js';

import { LlmAdapter, LlmError, CONTEXT_WINDOW_EXCEEDED_CODE, isContextWindowExceededError } from '@deepseek-ai/dsh-llm';
import { readFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createLivePressure} from './live-pressure.js';
// RU: Версия, байты и PID захватываются при загрузке, не перечитываются как живые на каждом ходе.
// EN: Capture loaded code identity once; never present later disk bytes as loaded code.
let pressureIdentity=null, pressureScope=null;
try {
  const sha=file=>createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex');
  const stat=readFileSync(`/proc/${process.pid}/stat`,'utf8');
  pressureIdentity={pid:process.pid,startTicks:stat.slice(stat.lastIndexOf(') ')+2).trim().split(/\s+/)[19],
    version:JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version,
    sourceSha:sha('./index.js'),policySha:sha('./live-pressure.js')};
  for(const origin of [process.argv[1],import.meta.url].filter(Boolean)) {
    try { pressureScope=createRequire(origin)('@deepseek-ai/dsh-scope').scopeTarget; if(typeof pressureScope==='function')break; }
    catch {}
  }
} catch { pressureIdentity=null; }


export const name = 'subscription-gateway';
export const inject = ['llm', 'agents'];

const PROVIDER = 'claude-oauth';

const DEFAULT_GATEWAY = 'http://127.0.0.1:8788';

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_CONTEXT_WINDOW = 1_000_000;

const PREDEL_MOLCHANIYA_MS = 1_800_000;

let dispetcherPredela = null;
let dispetcherProboval = false;

// RU: Настроить silence/header timeout1800000мс через внутренний undici dispatcher. Попытка одна на процесс; при несовместимом internal symbol логировать fallback, не объявлять30минут применёнными.
// EN: Configure1800000ms body/header silence limits through the internal undici dispatcher. Attempt once per process; an incompatible internal symbol logs fallback instead of claiming30minutes applied.
function poluchitDispetcher(log) {
  if (dispetcherProboval) return dispetcherPredela;
  dispetcherProboval = true;
  try {
    const najti = () => Object.getOwnPropertySymbols(globalThis)
      .find((x) => /undici\.globalDispatcher/.test(x.toString()));
    const klyuch = najti();
    if (!klyuch) {

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
// RU: Захватить provider options; inputModalities проверяются только как массив, остальные числовые свойства здесь полноценно не валидируются.
// EN: Capture provider options; inputModalities is checked only as an array, other numeric properties are not fully validated here.
  constructor(options) {
    super();
    this.baseURL = options.baseURL.replace(/\/+$/, '');
    const target=new URL(this.baseURL);
    if(target.protocol==='http:'&&!(target.hostname==='localhost'||target.hostname==='[::1]'||/^127\.\d+\.\d+\.\d+$/.test(target.hostname)))options.log?.('REMOTE_HTTP_GATEWAY: ingress key and request data use cleartext HTTP; use loopback or HTTPS');
    this.ingressKeyFile = options.ingressKeyFile;
    this.models = options.models;
    for (const model of this.models) {
      if (model.inputModalities !== undefined && !Array.isArray(model.inputModalities)) throw new TypeError(`model ${model.id}: inputModalities must be an array`);
    }
    this.contextWindow = options.contextWindow;
    this.log = options.log;
    this.upstreamProvider = null;
    this.providerObservationRevision = 0;
    this.onProviderInfoChanged = null;

    this.bridgeFor = options.bridgeFor;
    this.taskControlFor = options.taskControlFor;
    this.mailStopCapable = options.mailStopCapable;
    this.conversationFor = options.conversationFor;
    this.spoolConversationFor = options.spoolConversationFor;
    this.livePressureFor = options.livePressureFor;
  }

// RU: Vendor label берётся из наблюдённого health; route ID сохраняется. До ответа/при неизвестной ветке имя нейтрально, model ID не используется для угадывания.
// EN: Use the observed health vendor label and preserve route ID. Before a response or for unknown branches use a neutral name, never infer from model ID.
  providerInfo(provider) {
    const names = { anthropic: 'Anthropic (подписочный шлюз)', openai: 'OpenAI (подписочный шлюз)' };
    return { id: provider, name: names[this.upstreamProvider] ?? 'Подписочный шлюз (поставщик не подтверждён)' };
  }

// RU: Обновить только metadata, не сменить route/SDK. Регистрация LlmRuntime копирует имя, поэтому вызывающий refresh должен обновить и её.
// EN: Update metadata only, not the route/SDK. LlmRuntime snapshots names, so the caller refresh must also update registration.
  observeProvider(health) {
    this.providerObservationRevision += 1;
    const kind = ['anthropic', 'openai'].includes(health?.postavshchik) ? health.postavshchik : null;
    if (kind === this.upstreamProvider) return;
    this.upstreamProvider = kind;
    try { this.onProviderInfoChanged?.(); } catch (e) { this.log?.(`metadata поставщика не обновилась в реестре: ${e?.code ?? e?.name ?? 'ошибка'}`); }
  }

// RU: Одна bounded metadata-проба при mount: deadline5000ms и disposal signal, без повторов и credential-вызова. Ошибка не блокирует SDK путь, но не выдумывает поставщика.
// EN: One bounded mount metadata probe: 5000ms deadline plus disposal signal, no retries or credential call. Failure preserves SDK routing without inventing the supplier.
  async probeProvider(signal) {
    const revision = this.providerObservationRevision;
    try {
      const timeout = AbortSignal.timeout(5000);
      const response = await fetch(`${this.baseURL}/health`, {redirect:'error',signal:signal ? AbortSignal.any([signal,timeout]) : timeout});
      if (!response.ok) throw Object.assign(new Error('gateway health not ready'), {status:response.status});
      const health = await response.json();
      if (signal?.aborted || revision !== this.providerObservationRevision) return;
      this.observeProvider(health);
    } catch (e) {
      if (signal?.aborted || revision !== this.providerObservationRevision) return;
      this.observeProvider(null);
      this.log?.(`поставщик шлюза не подтверждён по health: ${e?.name ?? 'ошибка'}`);
    }
  }

// RU: Перенести модели и копию modalities, не выполнять network model discovery.
// EN: Return configured models and a copied modalities list without network model discovery.
  async listModels(provider) {
    return this.models.map((m) => ({
      provider,
      id: m.id,
      name: m.name ?? m.id,
      description: m.description,
      ...(m.inputModalities === undefined ? {} : { inputModalities: [...m.inputModalities] }),
    }));
  }

// RU: Незаявленный model ID допустим: окно берётся из adapter fallback. Предел выхода не объявляется — шлюз его не применяет.
// EN: Unknown model IDs use the adapter context fallback. No output cap is advertised because the gateway does not enforce one.
  async resolveModel(provider, model) {
    const known = this.models.find((m) => m.id === model);

    return {
      provider,
      id: model,
      name: known?.name ?? model,
      description: known?.description,
      ...(known?.inputModalities === undefined ? {} : { inputModalities: [...known.inputModalities] }),
      context: { contextWindow: known?.contextWindow ?? this.contextWindow },
    };
  }

// RU: Обнаружить наличие ANTHROPIC_API_KEY только предупреждением; значение не удаляется и маршрут не блокируется.
// EN: Detect ANTHROPIC_API_KEY presence by warning only; the value is neither removed nor blocked.
  warnIfApiKey() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.log?.('🔴 рядом задан ANTHROPIC_API_KEY — он перебивает подписку. Убрать.');
    }
  }

// RU: Legacy helper переносит только текст, неизвестные блоки журналирует. stream передаёт исходные messages и не вызывает этот helper.
// EN: The legacy helper carries text only and logs unknown blocks. stream forwards original messages without calling this helper.
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

// RU: Читать ingress key, проверить v2 capability при envelope, прикрепить bridge и lease. Lease всегда закрывается в finally; network errors не разрешают скрытый SDK повтор.
// EN: Read the ingress key, check v2 capability when an envelope is present, attach bridge and a lease. finally closes the lease; network failures do not authorize hidden SDK retries.
  async *stream(options) {
    this.warnIfApiKey();
    const ingressKey = readIngressKey(this.ingressKeyFile ?? process.env.GATEWAY_INGRESS_KEY_FILE);
    const body = {
      model: options.model || DEFAULT_MODEL,
      messages: options.messages ?? [],
    };
    body.livePressure = this.livePressureFor?.(options) ?? {error:'live-pressure-unavailable'};
    if (options.system) body.system = options.system;

    const conversation = this.conversationFor?.();
    const spoolAddress = this.spoolConversationFor?.();
    let spoolCapable=false;
    let inputDelivery=false,terminalDelivery=false;
    if (conversation !== undefined) {
      try { const health = await checkConversationCapability(this.baseURL, options.signal); this.observeProvider(health); spoolCapable=health.spoolConversation===1; inputDelivery=health.inputDelivery===1; terminalDelivery=health.mailStopTerminal===1; } catch(error) { throw this.wrapFailure(error); }
      body.conversation = conversation;
      if (conversation.cwd) body.cwd = conversation.cwd;
    } else if(this.mailStopCapable?.()||spoolAddress) {
      try { const health=await checkConversationCapability(this.baseURL,options.signal);terminalDelivery=health.mailStopTerminal===1;spoolCapable=health.spoolConversation===1; }
      catch { terminalDelivery=false; }
    }
    const attach = this.bridgeFor?.();
    if (attach) body.bridge = attach;

    const controlLease = this.taskControlFor?.({inputDelivery,terminalDelivery});
    if (controlLease) body.taskControl = controlLease.descriptor;
    try {
    let res;
    try {

      if (!dispetcherProboval) {
        await fetch('http://127.0.0.1:1/').catch(() => {});
      }
      const dispatcher = poluchitDispetcher(this.log);
      res = await fetch(`${this.baseURL}/${conversation === undefined ? 'v1' : 'v2'}/agent-stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer '+ingressKey, ...(spoolCapable&&spoolAddress?{'x-dsh-spool-conversation':spoolAddress}:{}) },
        redirect: 'error',
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

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal:true });
// RU: Применить единый parser к полным строкам и EOF остаткам, включая done. Битый JSON прерывает поток видимой неповторяемой ошибкой без сырых данных в журнале.
// EN: Use the same parser for complete lines and EOF remainders, including done. Bad JSON aborts with a visible nonretryable error without raw payload logging.
    let buf = '';
    let lineNumber = 0;
    let index = -1;
    let openBlock = null;
    let finished = false;

    let acc = '';

// RU: block-end содержит накопленный полный text, а не пустую строку: DSH сохраняет итог блока, не сумму дельт.
// EN: block-end carries the complete accumulated text, not an empty string: DSH stores the final block, not the sum of deltas.
    const closeBlock = () => ({
      type: 'block-end',
      index,

      block: { type: openBlock === 'reasoning' ? 'reasoning' : 'text', text: acc },
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
        buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        if (done && buf.trim()) { lines.push(buf); buf = ''; }
        for (const line of lines) {
          lineNumber += 1;
          if (!line.trim()) continue;
          let ev;
          try {
            ev = JSON.parse(line);
          } catch {
            throw new Error(`NDJSON: строка ${lineNumber} — некорректный JSON; содержимое не журналируется`);
          }
          if (!ev || typeof ev !== 'object' || Array.isArray(ev) || typeof ev.type !== 'string') throw new Error(`NDJSON: строка ${lineNumber} — не событие`);
          if(ev.type==='input-status'||ev.type==='task-status'){
            try{
              const receive=ev.type==='input-status'?controlLease?.inputEvent:controlLease?.taskEvent;
              if(typeof receive!=='function')throw Error('control event has no scoped reader');
              await receive.call(controlLease,ev);
            }catch(cause){
              this.log?.(`CONTROL_EVENT_REJECTED: ${ev.type}; stream stopped, no automatic retry`);
              throw Object.assign(new Error('control event rejected by its scoped receiver',{cause}),{code:'CONTROL_EVENT_REJECTED'});
            }
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
// RU: Отсутствующий input/output usage заменяется0, не unknown; не считать это точным замером vendor usage.
// EN: Missing input/output usage becomes0, not unknown; do not treat this as exact vendor usage measurement.
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

            const err = new Error(ev.message || 'шлюз сообщил об ошибке');
            err.code = 'GATEWAY_ERROR';
            throw err;
          } else if (ev.type === 'done') {
            finished = true;
          }
        }
        if (done) break;
      }
      if (openBlock !== null) yield closeBlock();
      if (!finished) {

        const err = new Error('шлюз оборвал поток, не сказав «готово»');
        err.code = 'INCOMPLETE_STREAM';
        throw err;
      }
      yield { type: 'finish', reason: 'stop' };
    } catch (e) {
      throw this.wrapFailure(e);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    } finally { controlLease?.close(); }
  }

// RU: Справочный mapping stop-reasons; текущий gateway done закрывает поток reason stop, этот helper не выбирает реальный итог stream.
// EN: A stop-reason mapping helper; current gateway done finishes with reason stop, and this helper does not select the stream outcome.
  finishReason(stop) {
    if (stop === 'max_tokens') return 'length';
    if (stop === 'tool_use') return 'tool-call';
    return 'stop';
  }

// RU: Передавать overflow как LlmError для platform compaction; retry categories только HTTP429 и refused connection. Остальные ошибки обычные Error, потому что SDK side effects могли уже исполниться.
// EN: Return overflow as LlmError for platform compaction; retry categories are limited to HTTP429 and refused connections. Other failures remain ordinary errors because SDK side effects may already have run.
  wrapFailure(e) {
    const status = e?.status ?? e?.response?.status;

    const tekstOtkaza = String(e?.message ?? '');
    if (tekstOtkaza && (isContextWindowExceededError(tekstOtkaza) || /\bprompt is too long\b/i.test(tekstOtkaza))) {
      return new LlmError(tekstOtkaza, CONTEXT_WINDOW_EXCEEDED_CODE, {
        cause: e,
        ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
      });
    }

    if (status === 429) return new LlmError(tekstOtkaza || 'шлюз: 429', 'RATE_LIMIT', { cause: e, status });
    if (e?.cause?.code === 'ECONNREFUSED') return new LlmError(tekstOtkaza || 'шлюз недоступен', 'TRANSPORT', { cause: e });
    const err = new Error(e?.message ?? 'сбой обращения к шлюзу',{cause:e});
    err.status = status;
    err.requestId = e?.request_id ?? e?.requestID;
    if (status === 503) err.code = 'GATEWAY_NO_CREDENTIAL';
    else if (status === 401 || status === 403) err.code = 'INVALID_CREDENTIAL';
    else if (status === 429) err.code = 'RATE_LIMIT';
    else if (e?.name === 'AbortError') err.code = 'ABORTED';
    else if (status >= 500) err.code = 'PROVIDER_ERROR';
    else err.code = typeof e?.code==='string'?e.code:'REQUEST_FAILED';
    const retry = e?.headers?.['retry-after'];
    if (retry) err.providerRetryAfterMs = Number(retry) * 1000;
    return err;
  }
}

// RU: Зарегистрировать route через LlmRuntime, который сам привязывает detach к Cordis fiber. При provide failure выполнить handle cleanup сразу; не ждать несуществующего dispose события.
// EN: Register through LlmRuntime, which binds detachment to the Cordis fiber. On provide failure run handle cleanup immediately instead of waiting for a nonexistent dispose event.
export function apply(ctx, config = {}) {
  const log = (m) => console.error(`[claude-oauth] ${m}`);

  try {
    const m = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    console.error(`[${m.name} ${m.version}] подъём`);
  } catch (e) {
    console.error(`[dsh-subscription-adapter версия НЕ ПРОЧИТАНА] подъём: ${e?.message ?? e}`);
  }

  const bridgeFor = () => {
    const bridge = ctx.get('mcpBridge');
    if (!bridge) return undefined;
    const agent = ctx.get('agents')?.currentInitiator();
    if (!agent) {
      log('мост есть, но инициатор хода неизвестен — инструменты не подключены');
      return undefined;
    }

    return bridge.descriptor(String(agent.id));
  };

  let pressureUnavailableLogged=false;
  const adapter = new ClaudeOauthAdapter({
    conversationFor:()=>{
      const value=conversationForAgent(ctx.get('agents')?.currentInitiator());
      if(value?.id && ctx.get('newConversationRestore')?.version!==1)throw Error('Restore нового поколения не подтверждён; запрос не отправлен');
      return value;
    },
    bridgeFor,
    spoolConversationFor:()=>{
      const service=ctx.get('spoolConversation');
      return service?.version===1?service.forAgent(ctx.get('agents')?.currentInitiator()):undefined;
    },
    livePressureFor: options => createLivePressure(ctx, {scopeTarget:pressureScope,
      agent:ctx.get('agents')?.currentInitiator(),model:options.model||DEFAULT_MODEL,
      window:adapter.models.find(m=>m.id===(options.model||DEFAULT_MODEL))?.contextWindow??adapter.contextWindow,
      maxTokens:options.maxTokens??0,identity:pressureIdentity,onUnavailable:reason=>{if(!pressureUnavailableLogged){pressureUnavailableLogged=true;log(`live-pressure-unavailable: ${reason}; gateway fallback applies`);}}}),
    mailStopCapable:()=>ctx.get('taskControlCodex')?.mailStopVersion===1,
    taskControlFor: ({inputDelivery=false,terminalDelivery=false}={}) => {
      const service = ctx.get('taskControlCodex');
      const agent = ctx.get('agents')?.currentInitiator();
      if (service?.telegramStopVersion === 1) return service.attach(agent, adapter.baseURL, {allowCancel:config.taskControlCodex === true,...(inputDelivery&&service.sdkInputVersion===1?{allowMessage:true}:{}),...(terminalDelivery&&service.mailStopVersion===1?{terminal:true}:{})});
      return config.taskControlCodex === true ? service?.attach(agent, adapter.baseURL) : undefined;
    },
    baseURL: config.baseURL ?? DEFAULT_GATEWAY,
    ingressKeyFile: config.ingressKeyFile,
    contextWindow: config.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
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
  try { ctx.provide?.('conversationIdentity', {version:2, check:signal=>{if(ctx.get('newConversationRestore')?.version!==1)throw Error('Restore нового поколения не подтверждён');return checkConversationCapability(adapter.baseURL,signal);}}); } catch(error) { handle(); throw error; }

  // RU: Проверка metadata не задерживает синхронную регистрацию. Dispose отменяет pending health и закрывает поздний refresh.
  // EN: Metadata checking preserves synchronous registration. Disposal cancels pending health and prevents a late refresh.
  const metadataAbort = new AbortController();
  let metadataActive = true;
  adapter.onProviderInfoChanged = () => {
    if (!metadataActive) return;
    if (typeof handle.replace === 'function') handle.replace([PROVIDER]);
  };
  ctx.effect?.(() => () => { metadataActive = false; metadataAbort.abort(); });
  void adapter.probeProvider(metadataAbort.signal);

  const istochnikOkna = config.contextWindow == null ? 'умолчание модуля' : 'настройка профиля';
  log(
    `маршрут «${PROVIDER}» зарегистрирован; модель по умолчанию ${DEFAULT_MODEL}, ` +
      `окно ${adapter.contextWindow ?? DEFAULT_CONTEXT_WINDOW} (${istochnikOkna}; ` +
      `вживую при подъёме НЕ спрашивается — шлюз списка моделей не отдаёт. ` +
      `Декларации и источники проверки: docs/SETTINGS.md), ` +
      `через шлюз ${adapter.baseURL} (ключ входа читается из файла; подписочный токен остаётся у шлюза)`,
  );

}
