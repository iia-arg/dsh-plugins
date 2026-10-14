// RU: Сервис шлюза на экземпляр агента: проверяет ingress bearer, отделяет идентичность беседы от текста, ведёт SDK ход и отдаёт NDJSON. Учётка шлюза исполняет инструменты; bypassPermissions не заменяет Unix-изоляцию.
// EN: Per-agent gateway service: validates ingress bearer, separates conversation identity from text, runs the SDK turn and emits NDJSON. The gateway account executes tools; bypassPermissions does not replace Unix isolation.
import {admitIngress,ingressBearerVeren,readIngressKey} from './ingress-auth.mjs';
import {vychistit} from './secret-redact.mjs';
import {prochestReestr, maskirovatTekst, raskrytZnachenie, podnyatPosrednika, PUSTOJ_REESTR} from './pdn-maska.mjs';
import { resolveConversation, installConversationSchema, writeConversation, CONVERSATION_IDENTITY_VERSION } from './conversation-identity.mjs';
import {hasMcpImageCalls, stripMcpImages, compactMcpHistory} from './image-history.mjs';
import {readBridgeReply, mcpImageResponse} from './mcp-image.mjs';

import http from 'node:http';
import fs from 'node:fs';
import { watchCodexCompactions, davlenieCodex } from './codex-compaction-watch.mjs';
import {createContextStatus} from './context-status.mjs';
import { progonAppServer, tekstProdolzheniya } from './codex-app-server.mjs';
import {selectLivePressure,ContinuationCounters} from './live-pressure.mjs';
import { TaskControlRouter } from './task-control.mjs';
import {TurnInboxQueue,parseInboxPayload,HOOK_BYTES} from './inbox-input.mjs';
// RU: Router принадлежит процессу; generation и capabilities не переживают restart.
// EN: The router belongs to this process; generations and capabilities do not survive restart.
const TASK_CONTROLS = new TaskControlRouter();

// RU: Прочитать mode-файл только с явно настроенным allowlist; пустой список или неверный ввод сохраняет mailbox путь. Список <=128 ключей, <=4096 знаков, файл <=4096 байт.
// EN: Read the mode file only with an explicit allowlist; an empty list or invalid input preserves the mailbox route. Up to128 keys/4096 characters; file up to4096 bytes.
function codexMarkerEnabled(agent, file = process.env.GATEWAY_CONTINUATION_MODE_FILE || './continuation-mode.json') {
  try {
    const raw=process.env.GATEWAY_CONTINUATION_ALLOWLIST || '[]';
    if(raw.length>4096)throw Error('allowlist exceeds 4096 chars');
    const allowed=JSON.parse(raw);
    if(!Array.isArray(allowed)||allowed.length>128||allowed.some(x=>typeof x!=='string'||! /^[A-Za-z0-9_-]{1,64}$/.test(x)))throw Error('invalid continuation allowlist');
    if(!allowed.length)return false;
    const bytes=fs.readFileSync(file);if(bytes.length>4096)throw Error('mode exceeds 4096 bytes');
    const d=JSON.parse(bytes);
    if(d?.version!==1||!Array.isArray(d.codex_marker)||d.codex_marker.some(x=>!allowed.includes(x))||Object.keys(d).some(k=>!['version','codex_marker'].includes(k)))throw Error('invalid continuation mode');
    return d.codex_marker.includes(agent);
  } catch(e) {
    log(`🔴 continuation mode unreadable (${e.code||e.name}); прежний путь письма Codex сохранён`);
    return false;
  }
}

import nodeCrypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile, spawn as spawnProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const KOREN_SDK = new URL('./sdk-runtime/node_modules/', import.meta.url);
const SDK_KESH = new Map();

// RU: Выбрать import exports SDK, затем module/main fallback; require.resolve не гарантирует ESM-only вход.
// EN: Select SDK import exports before module/main fallback; require.resolve cannot guarantee ESM-only entries.
function vhodPaketa(pj) {
  const e = pj.exports?.['.'] ?? pj.exports;
  if (typeof e === 'string') return e;
  const v = e?.import ?? e?.default ?? e?.node;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return v.default ?? v.import;
  return pj.module ?? pj.main ?? './index.js';
}

// RU: Загрузить SDK лениво из соседнего sdk-runtime и кешировать модуль до рестарта. Отсутствие runtime и ошибка import сообщаются раздельно.
// EN: Lazily load SDK from adjacent sdk-runtime and cache it until restart. Missing runtime and import failure are distinct diagnostics.
async function zagruzitSdk(imya) {
  if (SDK_KESH.has(imya)) return SDK_KESH.get(imya);
  const baza = new URL(imya + '/', KOREN_SDK);
  let pj;
  try {
    pj = JSON.parse(fs.readFileSync(new URL('package.json', baza), 'utf8'));
  } catch (e) {
    throw new Error(
      `SDK «${imya}» НЕ УСТАНОВЛЕН в слое среды (${KOREN_SDK.pathname}). ` +
      `Это НЕ поломка пакета: сам пакет цел, отсутствует слой. ` +
      `ЛЕЧЕНИЕ: node ${new URL('./gateway-sdk.mjs', import.meta.url).pathname} update ` +
      `${imya.includes('anthropic') ? 'anthropic' : 'codex'} ` +
      `· причина чтения: ${e?.code ?? e?.message}`,
    );
  }
  let mod;
  try {
    mod = await import(new URL(vhodPaketa(pj), baza).href);
  } catch (e) {
    throw new Error(
      `SDK «${imya}» ${pj.version ?? '?'} найден, но НЕ ЗАГРУЖАЕТСЯ: ${e?.code ?? ''} ${e?.message}. ` +
      `Состав слоя мог остаться частичным (обрыв установки). ` +
      `ЛЕЧЕНИЕ: node ${new URL('./gateway-sdk.mjs', import.meta.url).pathname} update ` +
      `${imya.includes('anthropic') ? 'anthropic' : 'codex'}`,
    );
  }
  SDK_KESH.set(imya, mod);
  log(`[shlyuz] SDK ${imya} ${pj.version ?? '?'} взят из слоя среды: ${baza.pathname}`);
  return mod;
}

import {loadCompaction} from './compaction-runtime.mjs';
// RU: Адрес задаёт оператор; пустое умолчание отключает только backend-функции. Контракт проверяется один раз, для восстановления нужен restart.
// EN: Operators supply the location; an empty default disables backend features only. Validate once; recovery requires restart.
const COMPACTION = await loadCompaction(String(process.env.GATEWAY_COMPACTION_MODULE ?? '').trim());
const {stupenZanjatosti,putSessii,fizicheskiyKompakt,porogIzPreseta,
       KOMPAKT_POROG,KOMPAKT_STUPENI,STUPEN_SESSII,KOMPAKT_SHLYUZOVOJ,KOMPAKT_PLATFORMENNYJ,
       reshitKompakt,polnayaZanyatost,vedraPoImeni,zanyatostIzZhurnala} = COMPACTION.api;

import { shape } from './jsonschema-to-zod.mjs';

const PORT = Number(process.env.GATEWAY_PORT || 8788);
const HOST = '127.0.0.1';
const TOKEN_FILE = process.env.GATEWAY_TOKEN_FILE || '/etc/subscription-gateway/token';
const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_MAX_TURNS = Number(process.env.GATEWAY_MAX_TURNS || 60);

const EFFORT_PO_VETKE = {
  anthropic: ['low', 'medium', 'high', 'xhigh', 'max'],
  openai: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'persistent'],
};
const EFFORT_VETKA = String(process.env.GATEWAY_POSTAVSHIK ?? '').trim();
const EFFORT_DOPUSTIMYE = EFFORT_PO_VETKE[EFFORT_VETKA] ?? [];
const EFFORT_SYROE = String(process.env.GATEWAY_EFFORT ?? '').trim();
const EFFORT = EFFORT_DOPUSTIMYE.includes(EFFORT_SYROE) ? EFFORT_SYROE : null;

const MCP_SERVERS = (() => {
  const raw = process.env.GATEWAY_MCP;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && Object.keys(v).length ? v : null;
  } catch (e) {

    console.error(vychistit(`[subscription-gateway] 🔴 GATEWAY_MCP не разобран: ${e?.message}`));
    return null;
  }
})();

const WORK_DIR = process.env.GATEWAY_WORK_DIR || process.env.HOME || '/tmp';

const VERSIYA = (() => {
  try {
    const put = new URL('./package.json', import.meta.url);
    return JSON.parse(fs.readFileSync(put, 'utf8')).version ?? 'неизвестна';
  } catch { return 'неизвестна'; }
})();

// RU: Суммировать только согласованные response_id текущего хода; пропуск/конфликт usage даёт complete=false, не выдуманные нули.
// EN: Sum only consistent response_id records for the current turn; missing/conflicting usage produces complete=false rather than invented zeros.
function turnUsage(events, turnId) {
  const records = new Map(), counts = new Set();
  let active = null, finished = false, bad = false, cumulative = null;
  for (const event of events) {
    const p = event.payload ?? {};
    if (p.type === 'task_started') active = p.turn_id;
    if (active === turnId && p.type === 'token_count') {
      if (!p.info?.total_token_usage || !p.info?.last_token_usage) bad = true;
      else counts.add(JSON.stringify(p.info.total_token_usage));
    }
    if (event.type === 'token_usage_record' && p.turn_id === turnId) {
      if (typeof p.response_id !== 'string' || !p.response_id) { bad = true; continue; }
      const u = p.usage;
      const valid = u && [u.input_tokens, u.output_tokens].every(n => Number.isSafeInteger(n) && n >= 0);
      if (!valid) { bad = true; continue; }
      const pair = [u.input_tokens, u.output_tokens];
      if (records.has(p.response_id) && JSON.stringify(records.get(p.response_id)) !== JSON.stringify(pair)) bad = true;
      records.set(p.response_id, pair);

      const c = p.turn_token_usage;
      if (c && [c.input_tokens, c.output_tokens].every(n => Number.isSafeInteger(n) && n >= 0)) {
        if (!cumulative || c.input_tokens + c.output_tokens > cumulative[0] + cumulative[1]) cumulative = [c.input_tokens, c.output_tokens];
      } else bad = true;
    }
    if (p.type === 'task_complete' && p.turn_id === turnId) { finished = true; active = null; }
  }
  let input = 0, output = 0;
  for (const [i, o] of records.values()) { input += i; output += o; }
  const complete = !bad && finished && records.size > 0 && counts.size === records.size
    && Number.isSafeInteger(input) && Number.isSafeInteger(output)
    && cumulative?.[0] === input && cumulative?.[1] === output;
  return { input: complete ? input : null, output: complete ? output : null,
    responses: records.size, complete, reason: complete ? null : 'missing_or_conflicting_rollout_usage' };
}
// RU: Отслеживать добавленный rollout и удерживать неполную строку между чтениями. Смена/усечение файла сбрасывает позицию, результат относится к наблюдавшемуся окну.
// EN: Follow appended rollout data and retain incomplete lines across reads. Rotation/truncation resets the offset; results apply to the observed window.
function watchTurnUsage(resolveFile, writeLog) {
  const started = Date.now(); let closed = false, snapshot = null, failure = null, readBytes = 0;
  let carry = Buffer.alloc(0);
  const readAt = (fd, size, offset) => {
    const b = Buffer.alloc(size), n = fs.readSync(fd, b, 0, size, offset);
    readBytes += n;
    if (n !== size) throw Error('rollout_short_read');
    return b;
  };

  try {
    const file = resolveFile();
    if (file) {
      const fd = fs.openSync(file, 'r');
      try {
        const st = fs.fstatSync(fd);
        snapshot = { file, dev: st.dev, ino: st.ino, size: st.size };
        if (st.size && readAt(fd, 1, st.size - 1)[0] !== 10) {
          let offset = st.size;
          while (offset > 0) {
            const n = Math.min(4096, offset); offset -= n;
            carry = Buffer.concat([readAt(fd, n, offset), carry]);
            const last = carry.lastIndexOf(10);
            if (last >= 0) { carry = carry.subarray(last + 1); break; }
            if (carry.length > 1024 * 1024) throw Error('rollout_boundary_too_long');
          }
        }
      } finally { fs.closeSync(fd); }
    }
  } catch (e) { failure = e.code === 'ENOENT' ? 'baseline_unavailable' : e.message; }
  return { close() {
    if (closed) return; closed = true;
    let id = '?', result = { input: null, output: null, responses: null, complete: false, reason: 'rollout_unavailable' };
    try {
      if (failure) throw Error(failure);
      const file = resolveFile(), fd = fs.openSync(file, 'r');
      const events = [];

      const parse = (line, final = false) => {
        if (!line.length) return;
        let e; try { e = JSON.parse(line.toString('utf8')); }
        catch { throw Error(final ? 'rollout_partial_tail' : 'rollout_invalid_json'); }
        const type = e.payload?.type;
        if (e.type === 'token_usage_record') events.push({ type: e.type, payload: e.payload });
        else if (['task_started', 'task_complete', 'token_count'].includes(type))
          events.push({ timestamp: e.timestamp, payload: { type, turn_id: e.payload.turn_id, info: e.payload.info } });
      };
      try {
        const st = fs.fstatSync(fd);
        if (snapshot && (snapshot.file !== file || snapshot.ino !== st.ino || snapshot.dev !== st.dev)) throw Error('rollout_replaced');
        if (snapshot && st.size < snapshot.size) throw Error('rollout_truncated');
        let offset = snapshot?.size ?? 0;
        while (offset < st.size) {
          const n = Math.min(65536, st.size - offset);
          carry = Buffer.concat([carry, readAt(fd, n, offset)]); offset += n;
          let pos;
          while ((pos = carry.indexOf(10)) >= 0) { parse(carry.subarray(0, pos)); carry = carry.subarray(pos + 1); }
        }

        parse(carry, true);
        const after = fs.statSync(file);
        if (after.ino !== st.ino || after.dev !== st.dev) throw Error('rollout_replaced');
        if (after.size < st.size) throw Error('rollout_truncated');
      } finally { fs.closeSync(fd); }
      const ids = [...new Set(events.filter(e => e.payload?.type === 'task_started'
        && (snapshot || Date.parse(e.timestamp) >= started)).map(e => e.payload.turn_id))];
      if (ids.length !== 1) throw Error('turn_boundary_unknown');
      id = ids[0]; result = turnUsage(events, id);
    } catch (e) { result.reason = e.code ? 'rollout_unavailable' : e.message; }
    writeLog(`turnUsage in=${result.input ?? 'неизвестно'} out=${result.output ?? 'неизвестно'} ответов=${result.responses ?? 'неизвестно'} (из rollout, response_id) единица=токены turn=${id} complete=${result.complete}${result.complete ? '' : ' reason=' + result.reason} read_bytes=${readBytes}`);
  } };
}

const SUMMA = (() => {
  try {
    const svoj = fs.readFileSync(new URL(import.meta.url));
    return nodeCrypto.createHash('sha256').update(svoj).digest('hex').slice(0, 8);
  } catch { return '????????'; }
})();

const log = (m) => console.error(vychistit(maskaZhurnala(`[subscription-gateway ${VERSIYA}/${SUMMA}] ${m}`)));

// RU: B-N-1899 (Михалыч 09.10.2026) — ГИГИЕНА, НЕ ЗАЩИТА. Движку не отдаём служебные GATEWAY_* (они нужны только шлюзу), кроме
// RU: GATEWAY_MOST_PROPUSK (подстановка в заголовок моста); токен подписки подаём дескриптором 3 (CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR),
// RU: а не env, — его нет ни в env Bash модели, ни в /proc/<движок>/environ. OMEGA_MCP_API_KEY движку нужен (заголовок omega) и остаётся.
// RU: НЕ ЛОВИТ (учётка шлюза = учётка движка = учётка Bash): файл токена GATEWAY_TOKEN_FILE учётка агента читает по ACL; у avrora, iskra,
// RU: zarya sudo NOPASSWD ALL; /proc/<шлюз>/environ (OMEGA_MCP_API_KEY, GATEWAY_*) той же учётке открыт; OMEGA_MCP_API_KEY и пропуск хода
// RU: остаются в env движка и Bash. Ветку Codex (app-server, ...process.env) не трогает.
// EN: B-N-1899 — HYGIENE, NOT PROTECTION: engine gets no gateway-only GATEWAY_* vars (except GATEWAY_MOST_PROPUSK) and the subscription token
// EN: via fd 3 instead of env. Does not stop: token file readable via ACL, sudo of three agents, /proc/<gateway>/environ of the same uid.
const ENV_DVIZHKU_IZ_GATEWAY = new Set(['GATEWAY_MOST_PROPUSK']);
function envDvizhka(dop) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GATEWAY_') || ENV_DVIZHKU_IZ_GATEWAY.has(k)) env[k] = v;
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  return { ...env, ...dop };
}
function spawnDvizhkaSTokenom(o, token) {
  const env = { ...o.env, CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR: '3' };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  // RU: как spawnLocalProcess SDK (stdio pipe ×3, signal, windowsHide) + fd 3 — труба с токеном, закрывается сразу после записи.
  const child = spawnProcess(o.command, o.args, { cwd: o.cwd, env, signal: o.signal, stdio: ['pipe', 'pipe', 'pipe', 'pipe'], windowsHide: true });
  child.stdio[3].on('error', (e) => log(`🔴 движок: труба токена (fd 3) отказала: ${e?.code ?? e?.message}`));
  child.stdio[3].end(String(token ?? ''));
  // RU: SDK при своём запуске копит хвост stderr для «exited with code N»; при нашем — копим сами и пишем в журнал (через vychistit).
  let hvost = '';
  child.stderr.on('data', (b) => { hvost = (hvost + b).slice(-4000); });
  child.once('exit', (kod, sig) => { if (kod) log(`🔴 движок вышел с кодом ${kod}${sig ? ` (${sig})` : ''}; хвост stderr: ${hvost.slice(-600).replace(/\s+/g, ' ')}`); });
  return child;
}

// B-N-1776 такт 2 (Заря): событие лимита SDK (rate_limit_event) → приёмная службы лимитов dsh-limity на sadik.
// Без токена и без текста хода: одна строка JSON на окно, атомарно .tmp → rename. Подписка — номер из имени
// GATEWAY_TOKEN_FILE (token-podpiska-N). Доля — utilization как есть (проба А 07.10: доля 0..1, resetsAt — секунды unix);
// окна — из unifiedWindows (недокументированное поле CLI, проба А), без него — rateLimitType. status относится ТОЛЬКО к окну
// rateLimitType. Нет номера, нет доли, нет приёмной — замер не пишется, строка журнала; ход не страдает.
// Пустая GATEWAY_LIMITY_VHOD — выключено. ЧЕГО НЕ ЛОВИТ: rejected без доли; подписку без трафика (события нет).
const LIMITY_VHOD = process.env.GATEWAY_LIMITY_VHOD ?? '/var/spool/dsh-limity/vhod';
let limitySchet = 0;
function strokiLimita(info, podpiska, otkuda, sejchas) {
  if (!info || typeof info !== 'object') return { stroki: [], prichina: 'событие без rate_limit_info' };
  if (!Number.isSafeInteger(podpiska)) return { stroki: [], prichina: 'номер подписки не выведен из GATEWAY_TOKEN_FILE' };
  const OKNA = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet'];
  const chislo = (x) => typeof x === 'number' && Number.isFinite(x);
  const sbros = (x) => chislo(x) && x > 1.6e9 && x < 1e11 ? x : null;
  const uw = info.unifiedWindows && typeof info.unifiedWindows === 'object' ? info.unifiedWindows : {};
  const okna = new Map();
  for (const k of OKNA) if (uw[k] && chislo(uw[k].utilization)) okna.set(k, { dolya: uw[k].utilization, sbros: sbros(uw[k].resetsAt) });
  const t = info.rateLimitType;
  if (OKNA.includes(t) && !okna.has(t) && chislo(info.utilization)) okna.set(t, { dolya: info.utilization, sbros: sbros(info.resetsAt) });
  const stroki = [...okna].filter(([, o]) => o.dolya >= 0 && o.dolya <= 1.5).map(([okno, o]) => ({
    moment_utc: sejchas, provajder: 'claude', podpiska, okno, dolya: o.dolya, sbros_utc: o.sbros,
    status: okno === t && ['allowed', 'allowed_warning', 'rejected'].includes(info.status) ? info.status : null,
    izmereno: 1, prichina: null, istochnik: 'sdk_event', otkuda }));
  return { stroki, prichina: stroki.length ? null : 'в событии нет доли 0..1.5 ни по одному окну' };
}
function zapisatLimit(info) {
  if (!LIMITY_VHOD) return;
  const nomer = /token-podpiska-(\d+)$/.exec(TOKEN_FILE);
  const { stroki, prichina } = strokiLimita(info, nomer ? Number(nomer[1]) : null, `gateway@${os.userInfo().username}`.slice(0, 80), Date.now() / 1000);
  if (!stroki.length) { log(`лимиты: замер НЕ записан — ${prichina}`); return; }
  try {
    for (const z of stroki) {
      const imya = `${Date.now()}-${process.pid}-${++limitySchet}-${z.okno}.json`;
      const tmp = path.join(LIMITY_VHOD, `.${imya}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(z), { mode: 0o640, flag: 'wx' });
      fs.renameSync(tmp, path.join(LIMITY_VHOD, imya));
    }
    log(`лимиты: подписка ${stroki[0].podpiska} · ` + stroki.map((z) => `${z.okno} ${Math.round(z.dolya * 100)}%${z.status ? ' ' + z.status : ''}`).join(' · ') + ' → приёмная');
  } catch (e) { log(`лимиты: 🔴 замер НЕ записан в ${LIMITY_VHOD} — ${e?.code ?? e?.message}`); }
}

// RU: Гостевая маска ПДн: GATEWAY_MASKA_PDN=1 включает посредника SDK → поставщик, разрешённый набор моделей и рабочий каталог только из настройки. Иное значение или неполная настройка — отказ при старте.
// EN: Guest PII mask: GATEWAY_MASKA_PDN=1 enables the SDK → provider intermediary, an allowed model set and the configured working directory only. Any other value or incomplete settings refuse at startup.
const MASKA_PDN = (() => {
  const v = process.env.GATEWAY_MASKA_PDN;
  if (v === undefined || v === '') return null;
  const otkaz = (m) => { console.error(vychistit(`[subscription-gateway] 🔴 ОТКАЗ: ${m}`)); process.exit(2); };
  if (v !== '1') otkaz('GATEWAY_MASKA_PDN знает только значение 1');
  const katalog = process.env.GATEWAY_GOST_REESTR;
  const modeli = (process.env.GATEWAY_GOST_MODELI ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!katalog || !modeli.length) otkaz('маска ПДн требует GATEWAY_GOST_REESTR и GATEWAY_GOST_MODELI');
  // RU: B-N-1547 r6: публичные контакты — текстовый белый список (GATEWAY_GOST_BELYJ_SPISOK); прежняя JSON-переменная — отказ, не тихий пропуск.
  // EN: B-N-1547 r6: public contacts are a text whitelist (GATEWAY_GOST_BELYJ_SPISOK); the old JSON variable refuses instead of being ignored.
  if (process.env.GATEWAY_GOST_PUBLICHNYE) otkaz('GATEWAY_GOST_PUBLICHNYE заменена на GATEWAY_GOST_BELYJ_SPISOK (текстовый белый список, B-N-1547 r6)');
  // RU: Сводка белого списка без ПДн (счёт и номера строк) пишется мимо маски журнала: маска сама читает список, через log был бы круг.
  // EN: The whitelist summary carries no PII (counts, line numbers) and bypasses the log mask, which reads the list itself.
  const zapisBelogo = (m) => console.error(vychistit(`[subscription-gateway ${VERSIYA}/${SUMMA}] ${m}`));
  const reestr = () => prochestReestr(katalog, process.env.GATEWAY_GOST_BELYJ_SPISOK, zapisBelogo);
  try { reestr(); } catch (e) { otkaz(`реестр гостей не прочитан при старте (${String(e?.code ?? e?.name ?? 'ошибка')})`); }
  return { reestr, modeli };
})();
function maskaZhurnala(s) {
  if (!MASKA_PDN) return s;
  let r = PUSTOJ_REESTR;
  try { r = MASKA_PDN.reestr(); } catch {}
  return maskirovatTekst(s, r);
}

const DAVLENIE_ZNAYU = ['storozh', 'signal'];
const DAVLENIE = (() => {
  const syroe = String(process.env.GATEWAY_DAVLENIE ?? '').trim();
  if (!syroe) return new Set();
  const slova = syroe.split(/[\s,]+/).filter(Boolean);
  const chuzhie = slova.filter((x) => !DAVLENIE_ZNAYU.includes(x));
  if (chuzhie.length) {
    log(`🔴 GATEWAY_DAVLENIE: незнакомые слова ${chuzhie.join(', ')} (знаю: ${DAVLENIE_ZNAYU.join(', ')}) — давление ВЫКЛЮЧЕНО целиком`);
    return new Set();
  }
  return new Set(slova);
})();

const DAVLENIE_OKNO_PEREBIV = String(process.env.GATEWAY_DAVLENIE_OKNO ?? '').trim();

const DAVLENIE_SLEPOTA = (() => {
  const syroe = String(process.env.GATEWAY_DAVLENIE_SLEPOTA ?? '').trim();
  if (!syroe) return 5;
  const n = Number(syroe);
  if (Number.isInteger(n) && n >= 1) return n;
  log(`🔴 GATEWAY_DAVLENIE_SLEPOTA «${syroe}» не целое ≥ 1 — беру умолчание 5`);
  return 5;
})();
let slepyhPodryad = 0;

// RU: Брать threshold из shared compaction reader, optional window override не меняет долю. Некорректный override возвращает причину без порога.
// EN: Get thresholds from the shared compaction reader; optional window override does not change the ratio. Invalid overrides return a reason without a threshold.
function porogPlatformy() {
  const p = porogIzPreseta();
  if (p.porog === undefined || !DAVLENIE_OKNO_PEREBIV) return p;
  const okno = Number(DAVLENIE_OKNO_PEREBIV);
  if (!(Number.isInteger(okno) && okno > 0)) return { prichina: `окно платформы «${DAVLENIE_OKNO_PEREBIV}» не целое положительное` };
  return { ...p, porog: Math.floor(okno * p.dolya), okno, otkudaOkno: 'перебив GATEWAY_DAVLENIE_OKNO' };
}
// RU: Старый клиент без поля сохраняет D; присланный proof требует живой сверки, негодный — отказ.
// EN: Legacy requests without the field retain D; supplied proofs require live verification and fail closed.
const compactSeen = new Map();
function pressureForRequest(body) {
  if(!Object.hasOwn(body,'livePressure'))return porogPlatformy();
  const p=selectLivePressure(body.livePressure,{model:body.model||DEFAULT_MODEL,
    adapterDir:path.join(process.env.HOME||path.dirname(WORK_DIR),'plugins/dsh-subscription-adapter')});
  if(p.porog===undefined) { log(`🔴 давление слепо: ${p.prichina}; действие выключено`); return p; }
  const disk=porogPlatformy();
  if(disk.porog!==p.porog)log(`порог: живой ${p.porog}; D ${disk.porog??'?'}; PID ${p.pid}`);
  if(p.compact) {
    const key=JSON.stringify([p.session.id,p.session.createdAt]);
    if(p.compact.endSeq>(compactSeen.get(key)??-1)) {
      log(`сжатие платформы: compaction/end ${p.compact.id}; seq ${p.compact.endSeq}; session ${p.session.id}; UTC ${new Date(p.compact.time).toISOString()}`);
      compactSeen.set(key,p.compact.endSeq);
      if(compactSeen.size>128)compactSeen.delete(compactSeen.keys().next().value);
    }
  }
  return p;
}
let oknoSdkProshloe = null;
// RU: Сопоставить окно, reserve и platform threshold, назвать смену против прошлого хода. Состояние сравнения теряется при рестарте.
// EN: Compare context window, reserve and platform threshold and report changes since the previous turn. Comparison state resets on restart.
function strokaOknaSdk(cu, p) {
  const zapas = (cu.categories ?? []).filter((c) => c.kind === 'buffer').reduce((a, c) => a + c.tokens, 0);
  const okno = cu.rawMaxTokens, porogSdk = okno - zapas;
  const krasnoe = [];
  if (p.porog === undefined) krasnoe.push(`порог платформы НЕ ПРОЧИТАН (${p.prichina}) — сравнить не с чем`);
  else {
    if (okno < p.okno) krasnoe.push(`окно SDK ${okno} МЕНЬШЕ окна платформы ${p.okno}`);
    if (porogSdk <= p.porog) krasnoe.push(`порог SDK ${porogSdk} НЕ ВЫШЕ порога платформы ${p.porog} — SDK сожмёт раньше платформы`);
  }
  const sejchas = `${okno}/${zapas}`;
  if (oknoSdkProshloe !== null && oknoSdkProshloe !== sejchas) krasnoe.push(`окно/запас СМЕНИЛИСЬ против прошлого хода (было ${oknoSdkProshloe})`);
  oknoSdkProshloe = sejchas;
  return `давление: окно SDK ${okno}, запас ${zapas}, порог SDK ${porogSdk} · порог платформы ${p.porog ?? '?'} · занято ${cu.totalTokens}`
    + (krasnoe.length ? ` · 🔴 ДАВЛЕНИЕ: ${krasnoe.join('; ')}` : '');
}
const tekstSignala = (zanyato, p) => `[сигнал шлюза] Контекст этого хода занят на ${zanyato} токенов — выше порога сжатия `
  + `платформы ${p.porog}. Доведи текущий шаг до безопасной точки и сохрани файл состояния на диске: что сделано, что осталось `
  + `и точную следующую точку работы. Если работали помощники (подагенты), перечисли их задачи и состояние в этом файле, `
  + `включая остановленных, чтобы после сжатия поднять их заново. Закончи ход промежуточным ответом; начни его строкой `
  + `«⏸ стоп по давлению шлюза — это НЕ конец задачи; после сжатия продолжу с <точки>», заменив <точки> конкретным шагом. `
  + `Далее укажи путь к файлу состояния. Не пиши, что работа остановлена или завершена, и не проси указаний: задача продолжается. `
  + `Новых долгих операций в этом ходе не начинай: сжатие проверяется по compaction/end. Перед продолжением сперва `
  + `перечитай файл состояния с диска, затем продолжи задачу и подними нужных помощников заново.`;

// 🔴 pressure-source-boundary RU: Граница signal-фрагмента source-extraction теста. EN: Signal fragment boundary for the source-extraction test.
const postavshchikDavleniya = String(process.env.GATEWAY_POSTAVSHIK ?? '').trim();
if (DAVLENIE.size && postavshchikDavleniya !== 'anthropic') {
  log(`🔴 давление внутри хода: GATEWAY_DAVLENIE задан (${[...DAVLENIE].join(', ')}), но поставщик «${postavshchikDavleniya}» — `
    + `давление НЕ исполняется (есть только на пути anthropic); переменную для этого шлюза снять`);
} else if (DAVLENIE.size) {
  const p = porogPlatformy();
  log(`давление внутри хода: ВКЛЮЧЕНО (${[...DAVLENIE].join(', ')}) · D на диске `
    + (p.porog !== undefined ? `${p.porog} (${p.okno} × ${p.dolya}; окно — ${p.otkudaOkno}; доля — пресет ${p.otkudaDolya})` : `НЕ ПРОЧИТАН: ${p.prichina}`));
} else log('давление внутри хода: выключено (GATEWAY_DAVLENIE пуст)');

if (postavshchikDavleniya === 'openai') {
  const p = porogPlatformy();
  log(`давление Codex внутри хода: строки по token_count rollout ВКЛЮЧЕНЫ (всегда; без действия — только видимость) · D на диске `
    + (p.porog !== undefined ? `${p.porog} (${p.okno} × ${p.dolya})` : `НЕ ПРОЧИТАН: ${p.prichina}`));
}

const PAMYAT_BAZA = String(process.env.GATEWAY_PAMYAT_BAZA ?? '').trim();
const PAMYAT_AGENT = String(process.env.KOMPAKT_AGENT ?? '').trim();
// RU: Экспорт сводок использует явно выбранный модуль; пустое значение отказывает только этой функции, transcript сохраняется.
// EN: Summary export uses an explicitly selected module; empty configuration refuses only this feature and preserves the transcript.
const PAMYAT_MODULE = String(process.env.GATEWAY_MEMORY_MODULE ?? '').trim();
let pamyatSdk = null;

// RU: Найти конкретную summary по UUID, не последнюю похожую строку произвольной сессии.
// EN: Locate a specific summary by UUID, not the latest similar record in an arbitrary session.
function svodkaIzTranskripta(put, uuid) {
  const stroki = fs.readFileSync(put, 'utf8').split('\n');
  const i = stroki.findIndex((s) => s.includes(uuid) && s.includes('"compact_boundary"'));
  if (i < 0) return null;
  for (const s of stroki.slice(i + 1)) {
    if (!s.includes('"isCompactSummary":true')) continue;
    const c = JSON.parse(s).message?.content;
    return typeof c === 'string' ? c : (c ?? []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
  }
  return null;
}

// RU: Передать SDK compaction summaries в явно настроенную memory DB. Эта запись не делает physical compaction и не гарантирует доступность другой службы.
// EN: Transfer SDK compaction summaries into the explicitly configured memory DB. Writing does not itself compact data or guarantee another service is available.
async function svodkiSdkVPamyat(granicy, cwd) {
  if (!COMPACTION.available) { log(`🔴 сводки SDK/rollout НЕДОСТУПНЫ: ${COMPACTION.reason}`); return; }
  for (const g of granicy) {
    const put = putSessii(g.sessiya, cwd);
    const gde = `транскрипт ${put}, граница ${g.uuid}`;
    try {
      const tekst = svodkaIzTranskripta(put, g.uuid);
      if (!tekst) { log(`🔴 сводка сжатия SDK НЕ найдена (${gde}) — в память не записана`); continue; }
      if (!PAMYAT_BAZA || !PAMYAT_AGENT) {
        log(`⚠️ сводка сжатия SDK (${tekst.length} знаков) НЕ записана в память: не задан ` +
            `${!PAMYAT_BAZA ? 'GATEWAY_PAMYAT_BAZA' : 'KOMPAKT_AGENT'} — текст только в ${gde}`);
        continue;
      }
      if (!pamyatSdk) {
        if (!PAMYAT_MODULE) throw new Error('GATEWAY_MEMORY_MODULE не задан — экспорт сводки недоступен');
        const { apply } = await import(pathToFileURL(path.resolve(PAMYAT_MODULE)).href);
        if (typeof apply !== 'function') throw new Error('memory module не предоставляет apply');
        const sl = {};
        apply({ provide: (i, o) => { sl[i] = o; }, on() {}, logger: { error: (...a) => log('[ядро памяти] ' + a.join(' ')) } },
              { putBazy: PAMYAT_BAZA, agent: PAMYAT_AGENT });
        if (!sl.pamyat?.dostupna?.()) throw new Error('память недоступна: ' + (sl.pamyat?.pochemuNedostupna?.() ?? 'службы нет'));
        pamyatSdk = sl.pamyat;
      }
      const m = g.meta ?? {};
      const id = pamyatSdk.zapisat({
        klass: 'svodka-kompakcii',
        soderzhim: `[СВОДКА СЖАТИЯ SDK — собрана движком внутри хода, не платформой]\n\n${tekst}`,
        istochnik: `SDK: ${put}#${g.uuid} (${m.trigger ?? '?'}, было ${m.pre_tokens ?? '?'} → стало ${m.post_tokens ?? '?'})`,
        otvechayushchegoNetVVyzove: true,
      });
      log(`сводка сжатия SDK ЗАПИСАНА в память: id ${id}, класс svodka-kompakcii, знаков ${tekst.length}, источник SDK, ${gde}`);
    } catch (e) {
      log(`🔴 сводка сжатия SDK НЕ записана в память (${e?.code ?? ''} ${e?.message ?? e}) — текст остался: ${gde}`);
    }
  }
}

if (EFFORT_SYROE && !(EFFORT_VETKA in EFFORT_PO_VETKE)) {
  log(`🔴 ВЕТКА НЕИЗВЕСТНА: GATEWAY_POSTAVSHIK=«${EFFORT_VETKA}». effort НЕ передаётся ни в какую ветку. Ожидается: ${Object.keys(EFFORT_PO_VETKE).join(' | ')}`);
} else if (EFFORT_SYROE && !EFFORT) {
  log(`🔴 GATEWAY_EFFORT НЕГОДНО для ветки ${EFFORT_VETKA || '?'}: «${EFFORT_SYROE}» — НЕ передаётся, действует умолчание SDK. Допустимо в этой ветке: ${EFFORT_DOPUSTIMYE.join(' | ') || 'перечня для ветки нет'}`);
} else {
  log(`effort при подъёме: ветка ${EFFORT_VETKA || '?'} · ${EFFORT ? EFFORT + ' (GATEWAY_EFFORT)' : 'НЕ ЗАДАН — параметр не передаётся, умолчание SDK'}`);
}

if ((process.env.CLAUDE_CODE_EFFORT_LEVEL ?? '').trim()) {
  log(`⚠️ CLAUDE_CODE_EFFORT_LEVEL=«${process.env.CLAUDE_CODE_EFFORT_LEVEL.trim()}» в окружении шлюза — по описанию SDK перебивает запрошенный уровень`);
}

// RU: Дополнить отказ коротким diagnostic tail правильного SDK session log; не пытаться объяснить успех другой сессии.
// EN: Augment failure with a short diagnostic tail from the correct SDK session log, not another session success.
function explainExit(err, sessionId, cwd) {
  const raw = String(err?.message ?? err);
  if (!/(?:exited with code|returned an error result)/.test(raw)) return raw;
  try {
    // RU: Правило CLI Claude (бинарь SDK 0.3.x, функция cP): всё не латиница/цифра → «-»; длиннее 200 — срез 200 + «-» + хеш CLI. Хеш не воспроизводим — длинный путь ищется по началу среди каталогов с этим транскриптом (аудит №23).
    // EN: Claude CLI rule (SDK 0.3.x binary, function cP): every non-alphanumeric → '-'; longer than 200 — 200-char slice + '-' + CLI hash. The hash is not reproduced — a long path is found by prefix among directories holding this transcript (audit #23).
    const kornProektov = `${process.env.HOME || WORK_DIR}/.claude/projects`;
    let slug = cwd.replace(/[^a-zA-Z0-9]/g, '-');
    if (slug.length > 200) slug = fs.readdirSync(kornProektov).find((d) => d.startsWith(slug.slice(0, 200) + '-') && fs.existsSync(`${kornProektov}/${d}/${sessionId}.jsonl`)) ?? slug;
    const file = `${kornProektov}/${slug}/${sessionId}.jsonl`;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('max_turns_reached')) continue;
      const a = JSON.parse(line)?.attachment;
      if (a?.type === 'max_turns_reached') {
        return `агент упёрся в лимит ходов: дошёл до ${a.turnCount} при пороге ${a.maxTurns} (max_turns_reached)`;
      }
    }
  } catch {
    return `${raw} (лимит ходов проверить не удалось: транскрипт не прочитан)`;
  }
  return `${raw} (лимит ходов исключён: записи max_turns_reached в свежем транскрипте нет; прочие причины — в тексте ошибки выше)`;
}

// RU: Читать авторизацию нужной provider ветки; отсутствие токена не подменяет поставщика.
// EN: Read credentials for the selected provider branch; missing tokens do not switch providers.
function readToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

// RU: Сократить диагностический аргумент инструмента до200символов; журналы могут содержать чувствительные пути/команды.
// EN: Truncate a diagnostic tool argument to200characters; logs can still contain sensitive paths or commands.
function briefOf(input) {
  if (!input || typeof input !== 'object') return '';
  const v = input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.path ?? input.query;
  return typeof v === 'string' ? v.slice(0, 200) : '';
}

// RU: Буферизовать JSON после ingress admission. Отдельного размера/deadline reader не задаёт; localhost и bearer не являются защитой от перегрузки авторизованным клиентом.
// EN: Buffer JSON after ingress admission. The reader sets no separate size/deadline ceiling; localhost and a bearer do not prevent overload by an authorized client.
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

// RU: Представить историю как текст с ролями; это compatibility вход SDK, не сохранение полноценного platform event protocol.
// EN: Represent history as role-labelled text; this is SDK compatibility input, not the complete platform event protocol.
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

const RESUME_ON = (process.env.GATEWAY_RESUME ?? '1') !== '0';
const SESSII = new Map();
const SESSII_MAX = 8;

// RU: Без явного GATEWAY_BAZA_SESSIJ база находится в WORK_DIR/sessions.db. Каждый экземпляр должен иметь свой writable адрес; при миграции прежний путь закрепить настройкой.
// EN: Without GATEWAY_BAZA_SESSIJ use WORK_DIR/sessions.db. Each instance needs its own writable location; pin the previous path when migrating.
const PUT_BAZY_SESSIJ = (process.env.GATEWAY_BAZA_SESSIJ || '').trim() || path.join(WORK_DIR, 'sessions.db');

log(`карта сессий: ${PUT_BAZY_SESSIJ} (${(process.env.GATEWAY_BAZA_SESSIJ || '').trim() ? 'НАСТРОЙКА' : 'умолчание модуля'})`);
let BAZA_SESSIJ;
try { BAZA_SESSIJ = new DatabaseSync(PUT_BAZY_SESSIJ); }
catch (e) { log(`🔴 база сессий НЕ ОТКРЫЛАСЬ: ${PUT_BAZY_SESSIJ} — ${String(e?.message ?? e).slice(0,100)} — СЛЕДСТВИЕ: продолжение бесед невозможно, каждый ход поедет ПОЛНЫМ транскриптом`); throw e; }

try { fs.chmodSync(PUT_BAZY_SESSIJ, 0o600); } catch (e) { log(`⚠️ права базы сессий не выставлены: ${String(e?.message ?? e).slice(0,80)}`); }
BAZA_SESSIJ.exec('CREATE TABLE IF NOT EXISTS sessions (kluch TEXT PRIMARY KEY, sessionId TEXT, otdano INTEGER, hashPref TEXT)');
installConversationSchema(BAZA_SESSIJ);
let CONTEXT_STATUS=null;
if(['openai','anthropic'].includes(String(process.env.GATEWAY_POSTAVSHIK??'').trim())){
  try{CONTEXT_STATUS=await createContextStatus(PUT_BAZY_SESSIJ,{provider:String(process.env.GATEWAY_POSTAVSHIK).trim()})}
  catch{log('context-status: поддержка НЕ поднялась; диагностика внутри хода недоступна')}
}

// RU: Поднять mapping из SQLite; запись routingVersion2 хранит полную conversation identity для независимых корней.
// EN: Restore mapping from SQLite; routingVersion2 rows retain full conversation identity for independent roots.
function chitatSessiiIzBazy() {
  try {

    // RU: В память — только последние SESSII_MAX строк (INSERT OR REPLACE двигает rowid: порядок rowid = свежесть); остальные читаются из базы при промахе (аудит №2).
    // EN: Only the latest SESSII_MAX rows go to memory (INSERT OR REPLACE moves rowid: rowid order = recency); the rest are read from the database on a miss (audit #2).
    const rows = BAZA_SESSIJ.prepare('SELECT kluch, sessionId, otdano, hashPref FROM sessions ORDER BY rowid DESC LIMIT ?').all(SESSII_MAX).reverse();
    for (const r of rows) SESSII.set(r.kluch, { sessionId: r.sessionId, otdano: r.otdano, hashPref: r.hashPref });
    if (rows.length) log(`сессий из базы восстановлено: ${rows.length}`);
  } catch (e) { log(`🔴 чтение базы сессий не удалось: ${String(e?.message ?? e).slice(0, 120)}`); }
}

// RU: Промах кэша — прочитать строку беседы из базы; кэш ограничен, база — нет (аудит №2).
// EN: Cache miss — read the conversation row from the database; the cache is bounded, the database is not (audit #2).
function sessiyaIzBazy(kluch) {
  try {
    const r = BAZA_SESSIJ.prepare('SELECT sessionId, otdano, hashPref FROM sessions WHERE kluch = ?').get(kluch);
    return r ? { sessionId: r.sessionId, otdano: r.otdano, hashPref: r.hashPref } : undefined;
  } catch (e) { log(`🔴 чтение сессии из базы не удалось: ${String(e?.message ?? e).slice(0, 120)} — иду полной историей`); return undefined; }
}

// RU: Сохранить SDK session, число переданных сообщений и prefix hash вместе с identity.
// EN: Persist SDK session, transferred-message count and prefix hash together with identity.
function zapisatSessiyuVBazu(kluch, sessiya) {
  try {
    writeConversation(BAZA_SESSIJ, kluch, sessiya);
  } catch (e) { log(`🔴 запись сессии в базу не удалась: ${String(e?.message ?? e).slice(0, 120)} — СЛЕДСТВИЕ: карта не наполнится, продолжение беседы отвалится, следующий ход поедет ПОЛНЫМ транскриптом. База: ${PUT_BAZY_SESSIJ}`); }
}

// RU: Удалить mapping после подтверждённого отказа resume; это не удаление SDK rollout или platform session.
// EN: Remove mapping after a confirmed resume failure; this does not delete SDK rollout or platform session.
function udalitSessiyu(kluch) {
  SESSII.delete(kluch);
  try { BAZA_SESSIJ.prepare('DELETE FROM sessions WHERE kluch = ?').run(kluch); }
  catch (e) { log(`🔴 удаление сессии из базы не удалось: ${String(e?.message ?? e).slice(0, 120)}`); }
}

const POSTAVSHCHIK_ANTHROPIC = {
  imya: "anthropic",

  opoznatOtkaz(err) {
    const s = String(err?.message ?? err ?? "").toLowerCase();
    if (s.includes("no conversation found with session id") || s.includes("session not found")) return "sessiya-mertva";
    if (s.includes("too long") || (s.includes("token") && s.includes("limit"))) return "perepolnenie";
    return "inoe";
  },

  perepolnenieVPotoke(text) { return /^Prompt is too long\b/i.test(String(text ?? "")); },
};

const POSTAVSHCHIK_OPENAI = {
  imya: "openai",

  predelVhodaZn: 1_048_576,

  opoznatOtkaz(err) {
    const s = String(err?.message ?? err ?? "").toLowerCase();
    if (s.includes("-32600") || s.includes("no rollout found for thread")) return "sessiya-mertva";

    if (s.includes("input_too_large") || s.includes("input exceeds the maximum length")) return "perepolnenie";

    return "ne-opoznano";
  },
  perepolnenieVPotoke(_text) {

    return false;
  },

  async *progon({ zapros, sessiya, cwd, model, registerTaskControl, pressure, spoolAddress, pressureCounter=pressureCounterFor(spoolAddress), contextObserver }) {

    const { Codex } = await zagruzitSdk('@openai/codex-sdk');

    const mcpNastrojka = MOST_CODEX?.ok && tekushchijMost
      ? { config: { mcp_servers: { dsh: {
            url: MOST_CODEX.url,
            bearer_token_env_var: 'DSH_MOST_PROPUSK',
            startup_timeout_sec: 20,

            default_tools_approval_mode: 'approve',
          } } },
          env: { ...process.env, DSH_MOST_PROPUSK: tekushchijMost.ticket } }
      : {};

    log(mcpNastrojka.config
      ? `мост ОБЪЯВЛЕН Codex: ${MOST_CODEX.url}, инструментов ${tekushchijMost.tools.length}`
      : `🔴 мост НЕ ОБЪЯВЛЕН Codex: сервер ${MOST_CODEX?.ok ? 'поднят' : 'НЕ ПОДНЯТ'}, состав хода ${tekushchijMost ? 'есть' : 'НЕТ'} — инструментов у модели не будет`);
    const codex = new Codex(mcpNastrojka);
    const nastrojki = { skipGitRepoCheck: true, ...(cwd ? { workingDirectory: cwd } : {}), ...(model ? { model } : {}),
      ...(PESOCHNICA ? { sandboxMode: PESOCHNICA } : {}),
      ...(EFFORT ? { modelReasoningEffort: EFFORT } : {}) };

    log(`⚠️ effort: ветка openai · запрошен ${EFFORT ?? 'НЕ ЗАДАН (умолчание Codex)'} · применённый НЕ НАБЛЮДАЕМ (Codex-SDK его не сообщает)`);
    log(`песочница Codex: ${PESOCHNICA ? PESOCHNICA + ' (настройка)' : 'НЕ ЗАДАНА — умолчание SDK (read-only)'}`);
    if (CODEX_PUT === 'app-server') {

      const p = pressure;
      const davlenieA = davlenieCodex({ porog: p, log });
      let itogA = null, nitA = sessiya;
      const compactWatchA = watchCodexCompactions({ resolveFile: () => (nitA ? putSessii(nitA, cwd || WORK_DIR) : null), log,
        onTokenCount: event=>{davlenieA.accept(event);contextObserver?.token(event)},
        onCompacted:event=>contextObserver?.compacted(event),onBlind:()=>contextObserver?.blind() });
      const envA = { ...(mcpNastrojka.env ?? process.env) };
      if (!envA.CODEX_INTERNAL_ORIGINATOR_OVERRIDE) envA.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = 'codex_sdk_ts';
      envA.PATH = [path.join(CODEX_VENDOR, 'codex-path'), ...String(envA.PATH ?? '').split(':').filter(Boolean)].join(':');
      try {
        for await (const e of progonAppServer({ bin: CODEX_BIN, env: envA, log, zapros, sessiya, cwd: cwd || undefined, model: model || undefined,
          sandbox: PESOCHNICA || undefined, effort: EFFORT || undefined, config: mcpNastrojka.config, porog: p,
          tekstSignala: (z) => tekstSignala(z, p), clientVersion: VERSIYA,
          registerTaskControl, onPressureAccepted:()=>pressureCounter.accepted(),onThread:id=>{nitA=id} })) {
          if (e.type === 'itog-app-server') { itogA = e; continue; }
          if (e.type === 'usage' && e.sessiya) nitA = e.sessiya;
          yield e;
        }
      } finally {
        try { compactWatchA.close(); } catch { try { log('[codex-compaction] observer_close_failed'); } catch {} }
        try { davlenieA.close(); } catch {}
      }
      if (!itogA?.ostanovlenShlyuzom) pressureCounter.reset();
      else if (codexMarkerEnabled(process.env.KOMPAKT_AGENT)) {
        log('продолжение Codex: письмо выключено; выбран единый marker платформы');
        pressureCounter.reset();
      } else if (!pressureCounter.snapshot().allowed) {
        log(`продолжение не положено: стоп #${pressureCounter.snapshot().stops}; писем ${pressureCounter.snapshot().letters}/${PREDEL_PRODOLZHENIJ}`);
      } else pressureCounter.placed(polozhitProdolzhenie(tekstProdolzheniya({ zanyato: itogA.zanyato, porog: itogA.porog }), 'продолжение', spoolAddress));
      return;
    }
    const thread = sessiya ? codex.resumeThread(sessiya, nastrojki) : codex.startThread(nastrojki);

    const davlenie = davlenieCodex({ porog: pressure, log });
    const compactWatch = watchCodexCompactions({
      resolveFile: () => { const id = thread.id ?? sessiya; return id ? putSessii(id, cwd || WORK_DIR) : null; },
      log,onTokenCount:event=>{davlenie.accept(event);contextObserver?.token(event)},
      onCompacted:event=>contextObserver?.compacted(event),onBlind:()=>contextObserver?.blind(),
    });
    const turnUsageWatch = watchTurnUsage(() => { const id = thread.id ?? sessiya; return id ? putSessii(id, cwd || WORK_DIR) : null; }, log);
    try {
    const potok = await thread.runStreamed(zapros);
    for await (const ev of potok.events) {
      if (ev.type === "item.completed") {
        const it = ev.item ?? {};
        if (it.type === "agent_message")      yield { type: "text", text: it.text ?? "" };
        else if (it.type === "reasoning")     yield { type: "thinking", text: it.text ?? it.summary ?? "" };
        else if (it.type === "command_execution") yield { type: "tool", name: "shell", brief: String(it.command ?? "").slice(0, 120) };
        else if (it.type === "mcp_tool_call") yield { type: "tool", name: it.tool ?? it.server ?? "mcp", brief: "" };
      } else if (ev.type === "turn.completed") {

        yield { type: "usage", syroj: ev.usage ?? {}, sessiya: thread.id ?? null };
      } else if (ev.type === "turn.failed" || ev.type === "thread.error") {
        throw new Error(String(ev.error?.message ?? ev.message ?? "отказ Codex без текста"));
      }
    }
    } finally {
      try { turnUsageWatch.close(); } catch {                                        }
      try { compactWatch.close(); }
      catch {

        try { log('[codex-compaction] observer_close_failed'); } catch {}
      }
      try { davlenie.close(); } catch {                                                                  }
    }
  },
  gotovKVyzovu: true,
};

POSTAVSHCHIK_ANTHROPIC.trebuetNashToken = true;
POSTAVSHCHIK_ANTHROPIC.chemAvtorizuetsya = 'подписочный токен из GATEWAY_TOKEN_FILE';
POSTAVSHCHIK_OPENAI.trebuetNashToken = false;
POSTAVSHCHIK_OPENAI.chemAvtorizuetsya = 'своя учётная запись Codex (CODEX_HOME/auth.json), наш токен не нужен';

POSTAVSHCHIK_ANTHROPIC.gotov = () => Boolean(readToken())
  ? { ok: true }
  : { ok: false, chego: `нет подписочного токена (файл ${TOKEN_FILE})` };
POSTAVSHCHIK_OPENAI.gotov = () => {
  const dom = (process.env.CODEX_HOME || '').trim();
  if (!dom) return { ok: false, chego: 'не задан CODEX_HOME — дом Codex неизвестен, вход не найти' };
  try { fs.accessSync(`${dom}/auth.json`, fs.constants.R_OK); }
  catch { return { ok: false, chego: `${dom}/auth.json не читается — Codex не авторизован либо нет прав (группа claudeoauth)` }; }
  return { ok: true };
};

// RU: Provider выбирается явно; неизвестное/отсутствующее значение нельзя подменять anthropic.
// EN: Provider selection is explicit; missing/unknown values must not silently become anthropic.
const POSTAVSHCHIKI = { anthropic: POSTAVSHCHIK_ANTHROPIC, openai: POSTAVSHCHIK_OPENAI };

const IMYA_POSTAVSHCHIKA = String(process.env.GATEWAY_POSTAVSHIK ?? '').trim();

const PESOCHNICA = String(process.env.GATEWAY_PESOCHNICA ?? '').trim();

const CODEX_PUT = String(process.env.GATEWAY_CODEX_PUT ?? '').trim() || 'exec';
if (!['exec', 'app-server'].includes(CODEX_PUT)) throw new Error(`GATEWAY_CODEX_PUT «${CODEX_PUT}» неизвестен — знаю exec | app-server`);
const CODEX_VENDOR = fileURLToPath(new URL('./sdk-runtime/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/', import.meta.url));
const CODEX_BIN = String(process.env.GATEWAY_CODEX_BIN ?? '').trim() || path.join(CODEX_VENDOR, 'bin', 'codex');

const YASHCHIK = String(process.env.GATEWAY_YASHCHIK ?? '').trim()
  || (String(process.env.KOMPAKT_AGENT ?? '').trim() ? `/var/spool/a2a/${String(process.env.KOMPAKT_AGENT).trim()}` : '');
if (IMYA_POSTAVSHCHIKA === 'openai') log(`путь Codex: ${CODEX_PUT}` + (CODEX_PUT === 'app-server'
  ? ` · бинарь ${CODEX_BIN}${fs.existsSync(CODEX_BIN) ? '' : ' — 🔴 НЕТ ФАЙЛА'} · ящик продолжения ${YASHCHIK || '🔴 НЕ ЗАДАН (нет KOMPAKT_AGENT/GATEWAY_YASHCHIK)'}`
  : ' (SDK; стоп модели на пороге НЕ исполняется)'));

const PREDEL_PRODOLZHENIJ = 2;
const pressureCounters = new ContinuationCounters(PREDEL_PRODOLZHENIJ);
function pressureCounterFor(spoolAddress,conversationKey) {
  if(conversationKey)return pressureCounters.for(conversationKey); // validated v2 identity is stable across header capability/rollback
  let key='legacy';
  try {
    const b=JSON.parse(Buffer.from(spoolAddress,'base64url').toString('utf8'));
    if(typeof b?.key==='string'&&b.key&&typeof b.session_id==='string'&&b.session_id
      &&Number.isSafeInteger(b.session_created)&&b.session_created>=0)
      key='spool:'+JSON.stringify([b.key,b.session_id,b.session_created]);
  }catch {}
  return pressureCounters.for(key);
}

// RU: Сформировать instruction продолжения после pressure stop, не объявлять работу завершённой.
// EN: Build continuation instructions after a pressure stop without claiming task completion.
function tekstProdolzheniyaClaude({ zanyato, porog }) {
  return `[шлюз Claude · продолжение после стопа] Прошлый ход закрыт тобой по сигналу шлюза на пороге сжатия платформы `
    + `(занято ${zanyato ?? '?'} ≥ ${porog ?? '?'}); сжатие этим письмом не подтверждено. ПРОДОЛЖАЙ прерванную задачу с того места, где остановился, `
    + `— сперва перечитай файл состояния с диска, путь к нему указан в промежуточном ответе прошлого хода. `
    + `Если до стопа работали помощники (подагенты) — подними их заново по файлу состояния и продолжи их незаконченные задачи. `
    + `Стоп по давлению — не конец задачи. Не начинай заново и не переспрашивай. `
    + `Если задача прошлого хода уже доведена до конца — ответь одной строкой «задача закончена» и новых дел не начинай.`;
}
// RU: Положить локальное письмо через временный файл и rename. Положено не означает принято моделью; нужный mailbox задаёт оператор.
// EN: Place a local message through a temporary file and rename. Placement does not prove model consumption; operators configure the mailbox.
function polozhitProdolzhenie(tekst, chto = 'продолжение', spoolAddress) {
  if (!YASHCHIK) { log(`🔴 ${chto} НЕ положено: ящик не задан — работа сама не продолжится`); return false; }
  try {
    const telo = `[delivery-v1 id=${nodeCrypto.createHash('sha256').update(`${path.basename(YASHCHIK)}\n${spoolAddress?spoolAddress+'\n':''}${tekst}`).digest('hex')} reply=no]\n${spoolAddress?'[spool-conversation-v1 '+spoolAddress+']\n':''}${tekst}\n`;
    const metka = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const imya = `${metka}-${os.userInfo().username}-${nodeCrypto.randomBytes(4).toString('hex')}.txt`;
    const vrem = path.join(YASHCHIK, '.' + imya);
    fs.writeFileSync(vrem, telo, { mode: 0o600, flag: 'wx' });
    fs.renameSync(vrem, path.join(YASHCHIK, imya));
    log(`${chto} ПОЛОЖЕНО в ящик ${YASHCHIK}/${imya} (${tekst.length} зн.) — в очередь, без приоритета; начало хода не подтверждено`);
    return true;
  } catch (e) { log(`🔴 ${chto} НЕ положено в ${YASHCHIK}: ${e.code ?? ''} ${e.message} — работа сама не продолжится`); return false; }
}
const POSTAVSHCHIK = POSTAVSHCHIKI[IMYA_POSTAVSHCHIKA];
if (!POSTAVSHCHIK) {
  const est = Object.keys(POSTAVSHCHIKI).join(' | ');

  const syroe = process.env.GATEWAY_POSTAVSHIK;

  const prichina = syroe === undefined ? 'переменная GATEWAY_POSTAVSHIK НЕ ЗАДАНА'
    : String(syroe) === '' ? 'GATEWAY_POSTAVSHIK задана ПУСТОЙ (строка есть, значения нет)'
    : String(syroe).trim() === ''
      ? `GATEWAY_POSTAVSHIK задана ПРОБЕЛАМИ (${JSON.stringify(syroe)}) — это не пустота, а невидимое значение`
      : Object.keys(POSTAVSHCHIKI).some(k => k.toLowerCase() === IMYA_POSTAVSHCHIKA.toLowerCase())

      ? `GATEWAY_POSTAVSHIK="${IMYA_POSTAVSHCHIKA}" отличается только РЕГИСТРОМ от известного «${Object.keys(POSTAVSHCHIKI).find(k => k.toLowerCase() === IMYA_POSTAVSHCHIKA.toLowerCase())}». Сравнение регистрозависимо: пишите строчными`
      : `GATEWAY_POSTAVSHIK="${IMYA_POSTAVSHCHIKA}" неизвестна`;
  console.error(vychistit(`[shlyuz] 🔴 ОТКАЗ: ${prichina}. Есть: ${est}. Задайте параметры выбранной подписки в конфигурации экземпляра шлюза`));
  process.exit(3);
}

// RU: Срок хранения карты сессий (находка Вениамина к аудиту №2): на старте удаляются строки, не обновлявшиеся дольше
//   GATEWAY_SESSII_SROK_DNEJ суток (умолчание 30). Неверное значение — тревога и НИЧЕГО не удаляется: удаление необратимо.
//   Удалённая строка — не потеря беседы: её следующий ход поедет полной историей. Чистка только на старте.
// EN: Session-map retention: on startup delete rows not updated for GATEWAY_SESSII_SROK_DNEJ days (default 30). An invalid
//   value alerts and deletes nothing. A deleted row is not a lost conversation: its next turn sends full history. Startup only.
function chistitSessiiPoSroku() {
  const syroe = String(process.env.GATEWAY_SESSII_SROK_DNEJ ?? '').trim();
  const dnej = syroe ? Number(syroe) : 30;
  if (!Number.isInteger(dnej) || dnej < 1) { log(`🔴 GATEWAY_SESSII_SROK_DNEJ «${syroe}» не целое ≥ 1 — карту сессий НЕ чищу`); return; }
  try {
    const r = BAZA_SESSIJ.prepare('DELETE FROM sessions WHERE obnovleno < ?').run(Date.now() - dnej * 86400000);
    log(`срок хранения карты сессий ${dnej} сут.: удалено строк ${r.changes}`);
  } catch (e) { log(`🔴 чистка карты сессий по сроку не удалась: ${String(e?.message ?? e).slice(0, 120)}`); }
}

chistitSessiiPoSroku();
chitatSessiiIzBazy();

// RU: Хешировать строки для проверки префикса истории, не использовать content hash как v2 conversation identity.
// EN: Hash strings for history-prefix verification, not as v2 conversation identity.
function hashText(s) {
  return nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 32);
}

// RU: Извлечь textual content для planning; вложения имеют отдельный протокол.
// EN: Extract textual content for planning; attachments follow a separate protocol.
function tekstSoobshcheniya(m) {
  const c = m?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
  return '';
}

// RU: Legacy v1 key выводится из сообщений и имеет слабее изоляцию; v2 должен прислать envelope.
// EN: The legacy v1 key is derived from messages and provides weaker isolation; v2 must supply an envelope.
function kluchBesedy(messages) {
  const first = (messages ?? [])[0];
  if (!first) return null;
  return hashText((first.role ?? '') + '\u0000' + tekstSoobshcheniya(first));
}

// RU: Проверить переданный SDK префикс перед отправкой только новых сообщений.
// EN: Verify the SDK-transferred prefix before sending only new messages.
function hashPrefiksa(messages, n) {
  const parts = [];
  for (let i = 0; i < n && i < messages.length; i++) {
    parts.push((messages[i].role ?? '') + '\u0000' + tekstSoobshcheniya(messages[i]));
  }
  return hashText(parts.join('\u0001'));
}

// RU: Нормализовать роли и tool-result DSH0.2 до планирования ключа/хвоста; original request identity не извлекается из текстовой роли.
// EN: Normalize DSH0.2 roles and tool-results before key/tail planning; request identity is not inferred from a text role.
function rolyDsh02VFormu011(body) {
  const msgs = body?.messages;
  if (!Array.isArray(msgs) || !msgs.some((m) => m?.role === 'system' || m?.role === 'developer' || m?.role === 'tool')) return body;
  let podskazka = '';
  const messages = [];
  const schet = { system: 0, developer: 0, tool: 0 };
  for (const m of msgs) {
    if (m?.role === 'system') {
      schet.system++;
      const t = tekstSoobshcheniya(m);
      if (t) podskazka = t;
      continue;
    }
    if (m?.role === 'developer') {
      schet.developer++;
      const chuzhie = (Array.isArray(m.content) ? m.content : [])
        .filter((b) => b?.type !== 'tool-addition' && b?.type !== 'tool-removal').map((b) => b?.type);
      if (chuzhie.length) log(`🔴 роль developer: блоки ${chuzhie.join(', ')} НЕ перенесены в запрос — шлюз их не знает`);
      continue;
    }
    if (m?.role === 'tool') {
      schet.tool++;
      messages.push({ role: 'user', content: [{ type: 'tool-result', toolCallId: m.toolCallId, content: m.content, isError: m.isError }] });
      continue;
    }
    messages.push(m);
  }
  const system = [body.system, podskazka].filter(Boolean).join('\n\n');
  log(`роли DSH 0.2.0 приведены к 0.1.1: system ${schet.system} (подсказка ${podskazka.length} зн.), developer ${schet.developer}, tool ${schet.tool}`);
  return { ...body, messages, ...(system ? { system } : {}) };
}

// RU: Выбрать full history или resume+suffix по conversation key и hash префикса. Переключение порядка/истории вызывает новую session, а не подмешивание чужой.
// EN: Choose full history or resume+suffix using conversation key and prefix hash. Reordered/changed history starts a fresh session instead of mixing another conversation.
function planZaprosa(messages, sessionKey) {
  const msgs = messages ?? [];
  const kluch = sessionKey === undefined ? kluchBesedy(msgs) : sessionKey;
  const polnyj = { kluch, resume: null, prompt: buildPrompt(msgs), otdano: msgs.length, pochemu: 'полная история' };
  if (!RESUME_ON || !kluch) return polnyj;
  const st = SESSII.get(kluch) ?? sessiyaIzBazy(kluch);
  if (!st) return polnyj;
  if (msgs.length <= st.otdano) return polnyj;
  if (hashPrefiksa(msgs, st.otdano) !== st.hashPref) {

    log('история изменена платформой — продолжение сессии отменено, иду полной историей');
    SESSII.delete(kluch);
    return polnyj;
  }

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

const PREDEL_HVOSTA_ZN = POSTAVSHCHIK.predelVhodaZn ? Math.floor(POSTAVSHCHIK.predelVhodaZn * 0.9) : 1_200_000;

// RU: Отобрать целые последние сообщения bounded history tail; системные сообщения вне хвоста не сохраняются. Число символов не равно vendor token usage.
// EN: Select complete recent messages as a bounded history tail; system messages outside the tail are not retained. Character count is not vendor token usage.
function planHvosta(messages, predelZn, originalPlan) {
  const msgs = messages ?? [];
  let total = 0, start = msgs.length;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const len = tekstSoobshcheniya(msgs[i]).length;
    if (total + len > predelZn) break;
    total += len;
    start = i;
  }
  if (start >= msgs.length) return null;
  const hvost = msgs.slice(start);
  const metka = `Пользователь: [контекст обрезан до последних ${hvost.length} сообщений — полная история в журнале сессии]\n\n`;
  return {
    kluch: originalPlan ? originalPlan.kluch : kluchBesedy(msgs),
    identity: originalPlan?.identity,
    resume: null,
    prompt: metka + buildPrompt(hvost),
    otdano: msgs.length,
    pochemu: `хвост истории: ${hvost.length} сообщений из ${msgs.length}`,
    hovostZnakov: total,
  };
}

// RU: Применить предельную длину входа до SDK; этот аварийный хвост не означает durable compaction платформы.
// EN: Apply input-length bounds before SDK execution; this emergency tail is not durable platform compaction.
function sHvostomEsliNado(plan, messages) {
  if (plan.resume || plan.prompt.length <= PREDEL_HVOSTA_ZN) return plan;
  const hvost = planHvosta(messages, PREDEL_HVOSTA_ZN, plan);
  if (!hvost) return plan;
  log(`🔴 полная история НЕ ВЛЕЗЛА (${plan.prompt.length} зн., порог ${PREDEL_HVOSTA_ZN}) — отдан хвост: ${hvost.hovostZnakov} зн. (${hvost.pochemu})`);
  return hvost;
}

const OTKAZY_PODRYAD = new Map();
const POROG_TREVOGI_OTKAZOV = 3;
// RU: B-N-1620 (слово владельца 05.10 10:55 МСК): отказ ПО СОДЕРЖАНИЮ (фильтр безопасности поставщика) — отдельный вид,
//   не лимит и не 401. Признак «беседа помечена»: 2 отказа одного flag-вида подряд в беседе или 1 «this session».
//   Тогда — сигнал «нужен /new <агент>» владельцу (agent-alert) и координатору письмом (tell-komu из щели своего агента),
//   ОДИН на беседу до удачного хода. Шлюз сам ничего не сбрасывает и сессию не меняет.
// RU: ГРАНИЦЫ: счёт в памяти процесса — перезапуск шлюза его стирает (помеченная беседа после перезапуска даст сигнал заново);
//   OTKAZY_PODRYAD/FLAG_PODRYAD чистятся только удачным ходом — беседа, не дошедшая до удачи, остаётся в Map до перезапуска;
//   одиночный «this message» не сигналит (следующий ход обычно проходит); flag-тексты, не дошедшие до шлюза как ошибка вызова,
//   не видны; другие машины (aclaude) и Петрович — вне области (их шлюзов этот код не ведёт). Адресат письма — константа развёртки.
// EN: B-N-1620: content-filter refusals are a separate kind; a flagged conversation triggers one "/new needed" signal per conversation.
const FLAG_PODRYAD = new Map();   // kluch → { vid, n, signal }
const ADRESAT_NUZHEN_NEW = 'zabavy';   // tell-komu: имя файла dlya-<кому>-… (развёртка sadik)
function vidOtkaza(message) {
  const s = String(message ?? '');
  if (/safeguards flagged this session/i.test(s)) return 'flag-session';
  if (/safeguards flagged this message/i.test(s)) return 'flag-message';
  if (/flagged for possible cybersecurity risk/i.test(s)) return 'flag-codex';
  return null;
}
// RU: Подсчитать последовательные ошибки mapping и уведомить оператора после3. Внешняя команда уведомления жёстко привязана к deployment, не является частью npm.
// EN: Count consecutive mapping failures and alert the operator after3. The external alert command is deployment-specific and not part of npm.
function otmetitOtkaz(kluch, message) {
  if (!kluch) return;
  const vid = vidOtkaza(message);
  const n = (OTKAZY_PODRYAD.get(kluch) ?? 0) + 1;
  OTKAZY_PODRYAD.set(kluch, n);
  log(`отказов подряд в беседе ${kluch.slice(0, 8)}: ${n}${vid ? ` (вид ${vid})` : ''}${n === POROG_TREVOGI_OTKAZOV ? ' — ПОРОГ, шлю тревогу' : ''}`);
  if (vid) otmetitFlag(kluch, vid);
  else if (FLAG_PODRYAD.has(kluch)) FLAG_PODRYAD.set(kluch, { vid: null, n: 0, signal: FLAG_PODRYAD.get(kluch).signal });   // иной отказ рвёт серию, сигнал не повторяет
  if (n !== POROG_TREVOGI_OTKAZOV) return;
  if (FLAG_PODRYAD.get(kluch)?.signal) { log(`беседа ${kluch.slice(0, 8)}: порог ${n}, но «нужен /new» уже ушёл — общую тревогу не дублирую`); return; }
  const tekst = `Шлюз ${PORT} (${PUT_BAZY_SESSIJ}): ${n} отказа подряд в беседе ${kluch.slice(0, 8)}${vid ? ` (вид ${vid})` : ''}. Последний: ${String(message).slice(0, 400)}`;
  // RU: argv виден всем учёткам (/proc/*/cmdline) — текст отказа поставщика вычищается, как журнал и NDJSON (аудит №16).
  // EN: argv is visible to all accounts (/proc/*/cmdline) — the provider failure text is redacted like the journal and NDJSON (audit #16).
  execFile('/usr/local/bin/agent-alert', [vychistit(tekst)], { timeout: 30000 }, (err, stdout) => {
    log(err ? `🔴 тревога об отказах НЕ ушла: ${String(err.message ?? err).slice(0, 120)} ${String(stdout ?? '').slice(0, 120)}`
            : `тревога об отказах отправлена (беседа ${kluch.slice(0, 8)})`);
  });
}
// RU: B-N-1620: серия отказов одного flag-вида; на признаке «беседа помечена» — один сигнал «нужен /new».
function otmetitFlag(kluch, vid) {
  const bylo = FLAG_PODRYAD.get(kluch);
  const z = { vid, n: bylo?.vid === vid ? bylo.n + 1 : 1, signal: bylo?.signal ?? false };
  FLAG_PODRYAD.set(kluch, z);
  const k8 = kluch.slice(0, 8);
  if (!(vid === 'flag-session' || z.n >= 2)) { log(`беседа ${k8}: отказ фильтра поставщика (${vid}), ${z.n}-й подряд — ещё не помечена (нужно 2 подряд одного вида или «this session»)`); return; }
  if (z.signal) { log(`беседа ${k8}: помечена (${vid}, ${z.n} подряд) — «нужен /new» уже ушёл, повтор только после удачного хода`); return; }
  z.signal = true;
  signalNuzhenNew(kluch, vid, z.n);
}
// RU: B-N-1620: сигнал «нужен /new» — владельцу через agent-alert и координатору письмом через tell-komu (щель своего агента по HOME/DSH_HOME).
function signalNuzhenNew(kluch, vid, n) {
  const k8 = kluch.slice(0, 8);
  const agent = PAMYAT_AGENT || '<агент>';
  const sut = `нужен /new ${agent} (беседа ${k8}, причина flagged ${vid}, отказов подряд ${n})`;
  log(`🔴 беседа ${k8} ПОМЕЧЕНА фильтром поставщика — ${sut}; шлю владельцу и координатору`);
  execFile('/usr/local/bin/agent-alert', [`Шлюз ${PORT} (${agent}): беседа помечена фильтром поставщика — ${sut}. Шлюз сам ничего не сбрасывает: пока беседа та же, ходы будут отбиваться.`],
    { timeout: 30000 }, (err, stdout) => {
      log(err ? `🔴 сигнал «нужен /new» владельцу НЕ ушёл: ${String(err.message ?? err).slice(0, 120)} ${String(stdout ?? '').slice(0, 120)}`
              : `сигнал «нужен /new» владельцу отправлен (беседа ${k8})`);
    });
  let f;
  try {
    // RU: Свой каталог mkdtemp и запись wx: чужой файл или ссылка под предсказуемым именем в общей /tmp не перезаписывается (аудит №17).
    // EN: Own mkdtemp directory and wx write: a foreign file or link under a predictable name in shared /tmp is never overwritten (audit #17).
    f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nuzhen-new-')), `dlya-${ADRESAT_NUZHEN_NEW}-nuzhen-new-${String(PAMYAT_AGENT || PORT).replace(/[^a-z0-9]/gi, '')}-${k8.replace(/[^a-z0-9]/gi, '')}.txt`);
    fs.writeFileSync(f, `Шлюз ${agent} → координатору · [сигнал flagged v1] ${sut}\nТекст отказа поставщика не прикладываю — только вид. Шлюз сам ничего не сбрасывает; сигнал один на беседу до удачного хода.\n`, { mode: 0o600, flag: 'wx' });
  } catch (e) {
    log(`🔴 письмо «нужен /new» координатору НЕ собрано: ${String(e?.message ?? e).slice(0, 120)}`);
    return;
  }
  execFile('/usr/local/bin/tell-komu', [f], { timeout: 30000 }, (err, stdout, stderr) => {
    try { fs.unlinkSync(f); fs.rmdirSync(path.dirname(f)); } catch {}
    log(err ? `🔴 письмо «нужен /new» координатору НЕ положено: ${String(stderr || err.message || err).slice(0, 160)}`
            : `письмо «нужен /new» координатору положено (tell-komu, беседа ${k8})`);
  });
}
// RU: Снять consecutive failure streak после успешного хода, не стирая реальную history.
// EN: Reset consecutive-failure streak after a successful turn without deleting real history.
function sbrositOtkazy(kluch) {
  if (!kluch) return;
  const f = FLAG_PODRYAD.get(kluch);
  if (f) { FLAG_PODRYAD.delete(kluch); if (f.signal) log(`беседа ${kluch.slice(0, 8)}: удачный ход после сигнала «нужен /new» — пометка снята`); }
  if (!OTKAZY_PODRYAD.has(kluch)) return;
  log(`беседа ${kluch.slice(0, 8)}: удачный ход после ${OTKAZY_PODRYAD.get(kluch)} отказов подряд — счёт обнулён`);
  OTKAZY_PODRYAD.delete(kluch);
}

// RU: Обновить cache/SQLite SDK mapping после результата; cache ограничен8беседами, SQLite не имеет такого eviction.
// EN: Update cache/SQLite SDK mapping after a result; cache is bounded to8conversations, SQLite is not evicted by that bound.
function zapomnit(plan, sessionId, messages) {
  if (!plan.kluch) return;

  if (SESSII.size >= SESSII_MAX && !SESSII.has(plan.kluch)) {
    const [kStaryj, sStaraya] = SESSII.entries().next().value;
    log(`вытесняю из карты сессий давно не использованную беседу ${kStaryj.slice(0, 8)} (сессия ${sStaraya.sessionId}, otdano ${sStaraya.otdano}): карта полна, ${SESSII_MAX} — только из памяти, строка в базе остаётся`);
    SESSII.delete(kStaryj);
  }
  SESSII.delete(plan.kluch);
  const sessiya = {
    sessionId,
    otdano: plan.otdano,
    hashPref: hashPrefiksa(messages, plan.otdano),
    identity: plan.identity ?? null,
  };
  SESSII.set(plan.kluch, sessiya);
  zapisatSessiyuVBazu(plan.kluch, sessiya);
}

// RU: Собрать legacy SDK MCP server из присланных схем. Unsupported JSON Schema может исключить инструмент; новые HTTP схемы не проходят конвертер.
// EN: Build a legacy SDK MCP server from supplied schemas. Unsupported JSON Schema can omit a tool; modern HTTP schemas bypass conversion.
// Observed Claude engine 0.3.289 rule only: reject present non-object/type != object.
// Object schemas with top-level combinators pass (real omega_store); other engine/API rules are outside this check.
// Reader: gateway journal, including the per-turn collection report; alert consumer is a proposal.
function mcpSchemaRefusal(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return 'схема не объект'
  if (schema.type !== 'object') return 'верхний type должен быть object'
}

function filterBridgeSchemas(tools) {
  const accepted = [], rejected = []
  for (const [index, tool] of tools.entries()) {
    const schema = tool?.inputSchema ?? { type: 'object', properties: {} }
    const reason = mcpSchemaRefusal(schema)
    if (!reason) { accepted.push(tool.inputSchema === schema ? tool : { ...tool, inputSchema: schema }); continue }
    const name = String(tool?.name ?? '<без имени>')
    rejected.push({ name, reason, index })
    log(`🔴 схема инструмента ${JSON.stringify(name)} отброшена шлюзом: ${reason}`)
  }
  return { tools: accepted, rejected }
}

async function buildBridgeServer(bridge, schemaState) {

  const { createSdkMcpServer, tool } = await zagruzitSdk('@anthropic-ai/claude-agent-sdk');
  if (!bridge?.url || !bridge?.ticket || !Array.isArray(bridge.tools) || !bridge.tools.length) return null;

  const callBridge = async (toolName, args) => {
    const r = await fetch(bridge.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bridge-ticket': bridge.ticket },
      body: JSON.stringify({ tool: toolName, args, ...(IMYA_POSTAVSHCHIKA === 'anthropic' && toolName === 'read_image' ? {imageProtocol: 1} : {}) }),
    });
    if (!r.ok) throw new Error(`мост ответил ${r.status}`);
    const out = await readBridgeReply(r, IMYA_POSTAVSHCHIKA === 'anthropic' && toolName === 'read_image');
    if (out?.ok !== true) throw new Error(String(out?.error ?? 'мост отказал без причины'));
    return mcpImageResponse(out, toolName, IMYA_POSTAVSHCHIKA);
  };

  const tools = [];
  // B-N-1698 этап 2: фильтр — только ветка anthropic; openai идёт прежним путём (shape() и поштучный пропуск).
  const checked = IMYA_POSTAVSHCHIKA === 'anthropic' ? filterBridgeSchemas(bridge.tools) : { tools: bridge.tools, rejected: [] };
  if (schemaState) schemaState.rejected = checked.rejected;
  for (const t of checked.tools) {
    let inputShape;
    try {
      inputShape = shape(t.inputSchema ?? { type: 'object', properties: {} });
    } catch (e) {

      checked.rejected.push({name:String(t.name),reason:'преобразование схемы: '+e?.message,index:bridge.tools.indexOf(t)});
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
            return await callBridge(t.name, args ?? {});
          } catch (e) {

            return { content: [{ type: 'text', text: `ОТКАЗ: ${e?.message ?? e}` }], isError: true };
          }
        },
      ),
    );
  }
  if (!tools.length) return null;

  return createSdkMcpServer({ name: bridge.name || 'dsh', version: '0.1.0', tools, alwaysLoad: true });
}

// RU: Не перезаписывать уже занятое MCP имя. Коллизия сохраняет внешний сервер, но мост не подключается и журнал сообщает отказ.
// EN: Do not overwrite an occupied MCP name. A collision preserves the external server but leaves the bridge unmounted and logs the refusal.
function mergeMcpServers(base, bridgeName, bridgeServer) {
  const servers = { ...(base ?? {}) };
  if (!bridgeServer) return { servers, mounted: false, conflict: null };
  if (Object.prototype.hasOwnProperty.call(servers, bridgeName)) {
    return { servers, mounted: false, conflict: bridgeName };
  }
  servers[bridgeName] = bridgeServer;
  return { servers, mounted: true, conflict: null };
}

let tekushchijMost = null;
let tekushchijMostProshlyj = null;

let MOST_CODEX = null;

const ZHIVYE_PROPUSKI = new Map();
const IMYA_MOSTA = IMYA_POSTAVSHCHIKA === 'anthropic' ? 'мост Claude' : 'мост Codex';

const MCP_PORT = Number(process.env.GATEWAY_MCP_PORT || (PORT + 100));
const MCP_PORT_IST = process.env.GATEWAY_MCP_PORT ? 'НАСТРОЙКА' : 'умолчание (порт шлюза + 100)';

// RU: Поднять localhost StreamableHTTP listener обоим providers. Claude использует per-live-turn таблицу, Codex — текущий descriptor; tokens отдельны от ingress и не задают личность.
// EN: Start a localhost StreamableHTTP listener for both providers. Claude uses a live-turn table, Codex the current descriptor; tickets are separate from ingress and do not set identity.
async function podnyatMostCodex() {

  try {

    let Server, StreamableHTTPServerTransport, ListToolsRequestSchema, CallToolRequestSchema;
    try {
      ({ Server } = await import('@modelcontextprotocol/sdk/server/index.js'));
      ({ StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js'));
      ({ ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js'));
    } catch (e) {
      throw new Error(
        `ТРАНСПОРТ MCP «@modelcontextprotocol/sdk» НЕ УСТАНОВЛЕН в составе пакета ` +
        `(${e?.code ?? e?.message}). Это НЕ слой среды и НЕ провайдерский SDK: ` +
        `он объявлен в dependencies и ставится обычным npm install в каталоге пакета. ` +
        `СЛЕДСТВИЕ: мост инструментов не поднимется — шлюз будет жив, инструментов не будет. ` +
        `ЛЕЧЕНИЕ: npm install --prefix ${new URL('./', import.meta.url).pathname}`,
      );
    }

    // B-N-1698 этап 2: фильтр схем — только ветка anthropic (правило движка Claude); ветка openai (Codex, стоп владельца 29.09)
    //   получает список побайтно как в 1.4.44.
    const obrabotchikSpiska = (most) => IMYA_POSTAVSHCHIKA !== 'anthropic'
      ? async () => (log(`${IMYA_MOSTA}: спросили список — отдаю ${(most()?.tools ?? []).length}`), {
      tools: (most()?.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
      })),
    })
      : async () => {
      const record = most();
      const checked = filterBridgeSchemas(record?.tools ?? []);
      if (record?.schemaState) record.schemaState.rejected = checked.rejected;
      log(`${IMYA_MOSTA}: спросили список — отдаю ${checked.tools.length} из ${(record?.tools ?? []).length}; отброшено шлюзом ${checked.rejected.length}`);
      return { tools: checked.tools.map(t => ({name:t.name, description:t.description ?? '', inputSchema:t.inputSchema})) };
    };

    const obrabotchikVyzova = (most) => async (req) => {
      log(`${IMYA_MOSTA}: вызов инструмента ${req.params.name}`);
      if (!most()) throw new Error('мост не подключён: хода нет');
      const r = await fetch(most().url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bridge-ticket': most().ticket },
        body: JSON.stringify({ tool: req.params.name, args: req.params.arguments ?? {}, ...(IMYA_POSTAVSHCHIKA === 'anthropic' && req.params.name === 'read_image' ? {imageProtocol: 1} : {}) }),
      });
      if (!r.ok) throw new Error(`мост ответил ${r.status}`);
      const out = await readBridgeReply(r, IMYA_POSTAVSHCHIKA === 'anthropic' && req.params.name === 'read_image');
      if (out?.ok !== true) throw new Error(String(out?.error ?? 'мост отказал без причины'));
      return mcpImageResponse(out, req.params.name, IMYA_POSTAVSHCHIKA);
    };

    const sobratServer = (most) => {
      const mcp = new Server({ name: 'dsh-most', version: '0.1.0' }, { capabilities: { tools: {} } });
      mcp.setRequestHandler(ListToolsRequestSchema, obrabotchikSpiska(most));
      mcp.setRequestHandler(CallToolRequestSchema, obrabotchikVyzova(most));
      return mcp;
    };

    const mcpServer = http.createServer(async (req, res) => {

      const dano = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

      if (IMYA_POSTAVSHCHIKA === 'anthropic') {
        const zapis = dano ? ZHIVYE_PROPUSKI.get(dano) : undefined;
        if (!zapis) {
          const prichina = !dano ? 'пропуск НЕ ПЕРЕДАН: нет заголовка Authorization: Bearer'
            : `пропуск не числится среди живых ходов (живых ${ZHIVYE_PROPUSKI.size}): ход окончен либо пропуск чужой`;
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: `пропуск не принят: ${prichina}` }));
          return;
        }
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        const mcp = sobratServer(() => zapis);
        await mcp.connect(transport);
        res.on('close', () => { transport.close?.(); mcp.close?.(); });
        await transport.handleRequest(req, res);
        return;
      }
      if (!tekushchijMost || !dano || dano !== tekushchijMost.ticket) {

        const prichina = !tekushchijMost ? 'хода нет: мост ещё не получил состав от платформы'
          : !dano ? 'пропуск НЕ ПЕРЕДАН: нет заголовка Authorization: Bearer'
          : dano === tekushchijMostProshlyj ? 'пропуск от ПРОШЛОГО хода — устарел при переподъёме'
          : 'пропуск ЧУЖОЙ: не совпадает с выданным на этот ход';
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: `пропуск не принят: ${prichina}` }));
        return;
      }
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const mcp = sobratServer(() => tekushchijMost);
      await mcp.connect(transport);
      res.on('close', () => { transport.close?.(); mcp.close?.(); });
      await transport.handleRequest(req, res);
    });
    await new Promise((ok, no) => { mcpServer.once('error', no); mcpServer.listen(MCP_PORT, HOST, ok); });
    log(`${IMYA_MOSTA} поднят: ${HOST}:${MCP_PORT} (${MCP_PORT_IST}); инструменты отдаются по составу хода`);
    return { url: `http://${HOST}:${MCP_PORT}/`, ok: true };
  } catch (e) {
    log(`🔴 ${IMYA_MOSTA} НЕ ПОДНЯТ: ${e?.message}`);
    log(IMYA_POSTAVSHCHIKA === 'anthropic'
      ? '🔴 у поставщика anthropic мост пойдёт ПРЕЖНИМ путём (zod, buildBridgeServer) — словари калечатся, часть схем выпадет'
      : '🔴 инструментов у поставщика openai будет 0 — агент сможет только разговаривать');
    return { url: null, ok: false };
  }
}

// RU: Health, agent-stream и task-control имеют разные bearer-контракты. Streaming status200 не равен успеху, error может прийти NDJSON-событием.
// EN: Health, agent-stream and task-control have distinct bearer contracts. Streaming status200 is not success; failure can arrive as an NDJSON event.
// RU: Посредник маски ПДн поднимается до приёма ходов; путь Codex маской не покрыт — отказ при старте.
// EN: The PII mask intermediary starts before turns are accepted; the Codex path is not covered by the mask — refused at startup.
if (MASKA_PDN && IMYA_POSTAVSHCHIKA !== 'anthropic') { console.error(vychistit('[subscription-gateway] 🔴 ОТКАЗ: маска ПДн покрывает только поставщика anthropic')); process.exit(2); }
// RU: Шлюзовой компакт шлёт стенограмму своему поставщику мимо посредника маски — с маской допустим только выключенный (false); «не объявлен» тоже отказ.
// EN: Gateway compaction sends the transcript to its own provider, bypassing the mask intermediary — with the mask only an explicitly disabled one (false) is allowed; «undeclared» is refused too.
if (MASKA_PDN && COMPACTION.available && KOMPAKT_SHLYUZOVOJ !== false) { console.error(vychistit(`[subscription-gateway] 🔴 ОТКАЗ: маска ПДн требует выключенного шлюзового компакта (сейчас: ${KOMPAKT_SHLYUZOVOJ === undefined ? 'не объявлен' : 'вкл'}) — модуль сжатия шлёт стенограмму мимо посредника`)); process.exit(2); }
const POSREDNIK = MASKA_PDN ? await podnyatPosrednika({ vverh: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com', reestr: MASKA_PDN.reestr, log }) : null;

// RU: Исключение внутри обработчика не роняет процесс: ловится здесь, клиенту — 500 или error-событие, ход других бесед живёт (аудит №1).
// EN: An exception inside the handler does not kill the process: caught here, the client gets 500 or an error event, other conversations keep running (audit #1).
const server = http.createServer((req, res) => { obrabotatZapros(req, res).catch((e) => {
  log(`🔴 сбой обработчика запроса: ${String(e?.message ?? e).slice(0, 200)}`);
  try { if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { type: 'internal', message: 'сбой обработчика' } })); }
        else if (!res.writableEnded) { res.write(vychistit(JSON.stringify({ type: 'error', message: 'сбой обработчика: ' + String(e?.message ?? e).slice(0, 300) })) + '\n'); res.end(); } } catch {}
}); });
async function obrabotatZapros(req, res) {
  if (req.url === '/v1/task-control') { await TASK_CONTROLS.handle(req, res); return; }
  if (req.url === '/health') {

    const g = POSTAVSHCHIK.gotov();
    let ingressError=null;try{readIngressKey(process.env.GATEWAY_INGRESS_KEY_FILE)}catch(error){ingressError=error.message}
    res.writeHead(g.ok && !ingressError ? 200 : 503, { 'content-type': 'application/json' });
    // RU: Путь к файлу токена и причина отказа ingress-файла — только с ingress-пропуском; без него — флаги, без конфигурации (аудит №18).
    // EN: Token file path and ingress-file refusal reason only with the ingress bearer; without it — flags, no configuration (audit #18).
    const podrobno = ingressBearerVeren(req, process.env.GATEWAY_INGRESS_KEY_FILE);
    res.end(JSON.stringify({ ok: g.ok && !ingressError, ingress: ingressError ? 'unavailable' : 'ready', ...(ingressError && podrobno ? {ingressError} : {}), conversationIdentity: CONVERSATION_IDENTITY_VERSION, spoolConversation:1, contextStatus:CONTEXT_STATUS?1:0, mailStopTerminal:(IMYA_POSTAVSHCHIKA==='anthropic'||(IMYA_POSTAVSHCHIKA==='openai'&&CODEX_PUT==='app-server'))?1:0, inputDelivery:(IMYA_POSTAVSHCHIKA==='anthropic'||(IMYA_POSTAVSHCHIKA==='openai'&&CODEX_PUT==='app-server'))?1:0, compaction: {available:COMPACTION.available,reason:COMPACTION.reason}, postavshchik: IMYA_POSTAVSHCHIKA, pdnMaska: Boolean(POSREDNIK),
      avtorizaciya: POSTAVSHCHIK.chemAvtorizuetsya,
      ...(g.ok || !podrobno ? {} : { chego_ne_hvataet: g.chego }), sdk: true }));
    return;
  }

  if(req.method==='POST'&&req.url==='/context-status'){
    if(!admitIngress(req,res,process.env.GATEWAY_INGRESS_KEY_FILE,log))return;
    if(!CONTEXT_STATUS){res.writeHead(404);res.end();return}
    await CONTEXT_STATUS.http(req,res);return;
  }
  if (req.method !== 'POST' || !['/v1/agent-stream','/v2/agent-stream'].includes(req.url)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'неизвестный путь; есть /v1/agent-stream и /health' }));
    return;
  }

// RU: Admission до чтения подписочного токена, JSON и запуска SDK. Здоровый localhost сам по себе не является разрешением хода.
// EN: Admission precedes subscription-token reading, JSON and SDK execution. Reachable localhost alone grants no turn authority.
  if (!admitIngress(req,res,process.env.GATEWAY_INGRESS_KEY_FILE,log)) return;

  const token = readToken();
  if (POSTAVSHCHIK.trebuetNashToken && !token) {
    res.writeHead(503, { 'content-type': 'application/json' });

    const m = `нет подписочного токена: поставщик «${IMYA_POSTAVSHCHIKA}» авторизуется через ${POSTAVSHCHIK.chemAvtorizuetsya}; файл ${TOKEN_FILE}`;
    res.end(JSON.stringify({ error: { type: 'no_credential', message: m } }));
    log(`🔴 запрос отклонён: ${m}`);
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
  // RU: Форма тела до любого обращения к полям: объект, messages (если есть) — массив объектов. Иначе 400; прежде null/[null]/5 роняли процесс TypeError вне try (аудит №1).
  // EN: Body shape before any field access: an object, messages (if present) an array of objects. Otherwise 400; previously null/[null]/5 crashed the process with a TypeError outside try (audit #1).
  const obekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const plohoeTelo = !obekt(body) ? 'тело не объект' : (body.messages !== undefined && (!Array.isArray(body.messages) || !body.messages.every(obekt))) ? 'messages не массив объектов' : null;
  if (plohoeTelo) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'bad_request', message: plohoeTelo } }));
    log(`запрос отклонён (400): ${plohoeTelo}`);
    return;
  }

  body = rolyDsh02VFormu011(body);
  if (MASKA_PDN) {
    if (body.model !== undefined && !MASKA_PDN.modeli.includes(body.model)) log(`маска ПДн: модель из тела не из разрешённого набора — взята ${MASKA_PDN.modeli[0]}; значение тела в журнал не пишу`);
    if (!MASKA_PDN.modeli.includes(body.model)) body.model = MASKA_PDN.modeli[0];
    if (body.cwd !== undefined) log('маска ПДн: рабочий каталог из тела отброшен — взят GATEWAY_WORK_DIR');
    delete body.cwd;
    // RU: Подменять cwd только в конверте, который его несёт: stateless-конверт cwd не имеет, лишний ключ шлюз отвергает (400).
    // EN: Replace cwd only in an envelope that carries it: a stateless envelope has none, and an extra key is rejected (400).
    if (body.conversation && typeof body.conversation === 'object' && body.conversation.cwd !== undefined) body.conversation = { ...body.conversation, cwd: WORK_DIR };
  }
  // B-N-2009: per-request snapshot, never a process-global route.
  const addressHeader=req.headers?.['x-dsh-spool-conversation'];
  const spoolAddress=typeof addressHeader==='string'&&/^[A-Za-z0-9_-]{1,2048}$/.test(addressHeader)?addressHeader:undefined;
  const cwd = body.cwd || WORK_DIR;
  let conversation;
  try {
    if (req.url === '/v2/agent-stream' && body.conversation === undefined) throw Error('v2 requires conversation identity');
    conversation = resolveConversation(body.conversation, IMYA_POSTAVSHCHIKA, cwd);
  }
  catch (error) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'bad_conversation', message: error.message } }));
    return;
  }
  let explicitMailStop=false;
  const baseTaskControl = body.taskControl ? TASK_CONTROLS.forResponse(body.taskControl, res, (binding,codex,request_id) => {
    if(body.taskControl.terminal===1)send({type:'task-status',state:'ready',binding,codex:{...codex,generation:TASK_CONTROLS.generation},request_id});
    if(body.taskControl.operations?.includes('message'))send({type:'input-status',state:'ready',binding,codex,request_id});
  },(binding,codex,request_id)=>send({type:'task-status',state:'terminal',binding,codex,request_id}),{deferTerminal:true}) : undefined;
  // RU: Флаг явного стопа — только по принятому stop-exact: отвергнутый (ход кончился, маршрут закрыт) не отменяет дослать B, компакт и письмо продолжения (аудит №14). На время самого стопа приём держит prervanPoStop.
  // EN: The explicit-stop flag follows an accepted stop-exact only: a refused one (turn over, route closed) does not cancel B delivery, compaction and the continuation letter (audit #14). During the stop itself prervanPoStop holds intake.
  const registerTaskControl=baseTaskControl?Object.assign((dispatch,engine)=>baseTaskControl(async packet=>{
    const otvet=await dispatch(packet);
    if(packet.op==='stop-exact'&&otvet?.accepted===true)explicitMailStop=true;
    return otvet;
  },engine),{closed:baseTaskControl.closed,terminal:baseTaskControl.terminal}):undefined;

  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache',
  });
  // RU: Карта заглушек этого хода: SDK ходит к посреднику своим адресом, ответ раскрывает только её; закрывается вместе с ответом.
  // EN: This turn's placeholder map: the SDK uses its own intermediary address, the reply reveals only this map; it closes with the response.
  const kartaHoda = MASKA_PDN ? POSREDNIK.otkrytKartu() : null;
  if (kartaHoda) res.once('close', kartaHoda.zakryt);
  const send = (o) => {if(res.destroyed||res.writableEnded)return false;if(kartaHoda)o=raskrytZnachenie(o,kartaHoda.karta);return res.write(vychistit(JSON.stringify(o)) + '\n');};

  const started = Date.now();
  const pressureHoda=pressureForRequest(body);

  log(`рабочий каталог: ${cwd} (${body.cwd ? 'ИЗ ТЕЛА ЗАПРОСА, настройка GATEWAY_WORK_DIR=' + WORK_DIR + ' НЕ ПРИМЕНЕНА' : 'из настройки GATEWAY_WORK_DIR'})`);
  let plan = planZaprosa(body.messages, conversation.key);
  plan.identity = conversation.identity;
  const pressureCounter=pressureCounterFor(spoolAddress,conversation.key);

  plan = sHvostomEsliNado(plan, body.messages);

  let sessionId = plan.resume || crypto.randomUUID();

  let bridgeServer = null;
  const gatewaySchemaState = { rejected: [] };

  const httpMost = IMYA_POSTAVSHCHIKA === 'anthropic' && MOST_CODEX?.ok === true;
  let propuskHoda = null;
  try {
    bridgeServer = httpMost ? null : await buildBridgeServer(body.bridge, gatewaySchemaState);

    tekushchijMostProshlyj = tekushchijMost?.ticket ?? null;

    if (!body.bridge?.url || !body.bridge?.ticket || !Array.isArray(body.bridge?.tools)) {
      tekushchijMost = null;
      log(`🔴 мост НЕ ПОДКЛЮЧЁН: платформа не прислала состав (url ${body.bridge?.url ? 'есть' : 'НЕТ'}, пропуск ${body.bridge?.ticket ? 'есть' : 'НЕТ'}, инструментов ${Array.isArray(body.bridge?.tools) ? body.bridge.tools.length : 'НЕТ ПОЛЯ'}) — у модели инструментов не будет`);
    } else {
      tekushchijMost = { url: body.bridge.url, ticket: body.bridge.ticket, tools: body.bridge.tools, schemaState: gatewaySchemaState };
    }
  } catch (e) {

    log(`🔴 мост не собран: ${e?.message}`);
  }
  const bridgeName = body.bridge?.name || 'dsh';

  if (httpMost && body.bridge?.url && body.bridge?.ticket && Array.isArray(body.bridge?.tools)) {
    propuskHoda = body.bridge.ticket;
    ZHIVYE_PROPUSKI.set(propuskHoda, { url: body.bridge.url, ticket: propuskHoda, tools: body.bridge.tools, schemaState: gatewaySchemaState });
    res.on('close', () => ZHIVYE_PROPUSKI.delete(propuskHoda));
    bridgeServer = { type: 'http', url: MOST_CODEX.url, headers: { Authorization: 'Bearer ${GATEWAY_MOST_PROPUSK}' }, alwaysLoad: true };
  }
  const merged = mergeMcpServers(MCP_SERVERS, bridgeName, bridgeServer);
  const mcpAll = merged.servers;

  if (merged.mounted && propuskHoda) log(`мост подключён по HTTP: прислано ${body.bridge.tools.length}, сервер "${bridgeName}" — схемы как есть, без zod; сколько у модели — строкой «мост у модели» на system/init`);
  else if (merged.mounted) log(`мост подключён: инструментов ${body.bridge.tools.length}, сервер "${bridgeName}" (личность несёт пропуск, шлюз её не знает)`);
  else if (merged.conflict) log(`🔴 мост НЕ подключён: имя сервера "${merged.conflict}" уже занято другим сервером инструментов`);
  try {
    let model = null;
    let otdanoSobytij = 0;

    const otdat = (o) => { otdanoSobytij++; send(o); };

    // RU: Учёт живого входа обновляет тот же DSH-prefix, который проверит следующий resume.
    // EN: Live input accounting updates the DSH prefix checked by the next resume.
    const accountedInputs = new Set();
    const accountInput = packet => {
      const payload = parseInboxPayload(packet), message = payload.message;
      if (accountedInputs.has(message.id)) return;
      accountedInputs.add(message.id);
      body.messages.push(message); plan.otdano = body.messages.length;
    };
    let zanjatoPoslednee = 0;

    let stopPoDavleniyu = null;
    const progon = async (tekushchij) => {
    let contextObserver=null;
    try{contextObserver=CONTEXT_STATUS?.begin(spoolAddress,{native:conversation.identity,model:body.model||DEFAULT_MODEL,
      threshold:pressureHoda.porog,compact:pressureHoda.compact})}catch{log('context-status: текущий запрос НЕ опубликован')}
    try{

      if (POSTAVSHCHIK.imya !== 'anthropic' && !POSTAVSHCHIK.gotovKVyzovu) {
        throw new Error(`поставщик "${POSTAVSHCHIK.imya}" объявлен, но НЕ ГОТОВ К ВЫЗОВУ (gotovKVyzovu) — отказываю, а не подменяю его anthropic`);
      }
      if (POSTAVSHCHIK.imya !== 'anthropic' && POSTAVSHCHIK.gotovKVyzovu) {
        let bylUsage = false;
        for await (const e of POSTAVSHCHIK.progon({
          zapros: tekushchij.prompt,
          sessiya: tekushchij.resume || null,
          cwd: body.cwd || WORK_DIR,
          model: body.model || undefined,
          registerTaskControl, pressure:pressureHoda, spoolAddress, pressureCounter, contextObserver,
        })) {
          if (e.type === 'input-status' && e.state === 'offered') accountInput(e.packet);
          if (e.type === 'usage') {
            bylUsage = true;

            const vedra = vedraPoImeni(e.syroj, IMYA_POSTAVSHCHIKA);
            zanjatoPoslednee = polnayaZanyatost(e.syroj, IMYA_POSTAVSHCHIKA);

            {
              const izZh = zanyatostIzZhurnala(putSessii(e.sessiya ?? tekushchij.resume ?? '', body.cwd || WORK_DIR));
              if (izZh && izZh.zanyato > 0 && Number.isSafeInteger(izZh.vyhod) && izZh.vyhod >= 0) {
                log(`[shlyuz ${POSTAVSHCHIK.imya}] занятость ИЗ ЖУРНАЛА: ${izZh.zanyato} из ${izZh.okno ?? '?'} ` +
                    `(из кэша ${izZh.izKesha}); накопленное за сессию ${izZh.nakoplennoe ?? '?'} — НЕ занятость, в решение НЕ идёт`);
                zanjatoPoslednee = izZh.zanyato;

                Object.assign(vedra, vedraPoImeni({
                  input_tokens: izZh.zanyato,
                  cached_input_tokens: izZh.izKesha,
                  output_tokens: izZh.vyhod,
                }, IMYA_POSTAVSHCHIKA));
              } else {
                log(`[shlyuz ${POSTAVSHCHIK.imya}] ⚠️ занятость из журнала НЕ ПРОЧЛАСЬ — решаю по числу из потока ` +
                    `(${zanjatoPoslednee}); для Codex это НАКОПЛЕНИЕ за сессию и оно ЗАВЫШЕНО`);
              }
            }
            if (e.sessiya) zapomnit(tekushchij, e.sessiya, body.messages);
            otdat({ type: 'usage', inputTokens: vedra.inputTokens, outputTokens: vedra.outputTokens,
                    cacheReadTokens: vedra.cacheReadTokens, cacheWriteTokens: vedra.cacheWriteTokens });
          } else { if(e.type==='input-status'){const {packet,...status}=e;otdat(status)}else otdat(e); }
        }

        if (!bylUsage) {
          zanjatoPoslednee = null;
          log(`[shlyuz ${POSTAVSHCHIK.imya}] расход НЕ СООБЩЁН поставщиком — занятость НЕИЗВЕСТНА (это не ноль)`);
        }
        return;
      }

    let stopPrishyol = false, effortIzHuka = null;
    let signalDan = false;
    stopPoDavleniyu = null;

    const hodId = crypto.randomUUID();
    let ocheredB = [], bZakryt = false, rezultatPrishyol = false, rezultatVid = null, prervanPoStop = false, interruptPrinyat = false, stopObeshchanie = null, unregisterTaskControl = null;
    const inputStatus = (packet,state,reason) => {if(res.destroyed||res.writableEnded)return;send({type:'input-status',state,binding:packet.binding,method:'claude-hook',reason,
      codex:{thread_id:tekushchij.resume||sessionId,turn_id:hodId}});};
    const inputQueue = new TurnInboxQueue({offered:packet=>{accountInput(packet);inputStatus(packet,'offered')},
      notOffered:(packet,reason)=>inputStatus(packet,'not-offered',reason)});
    const closeInputs=()=>inputQueue.close('http-closed');res.once('close',closeInputs);
    const tekstB = (packet) => `[task-control/1 cancel · ${packet.binding.control_id} · target ${packet.binding.target_receipt}]\n${packet.body}\n`
      + 'Ответь по этому ID: принято / поздно, уже сделано / частично; назови остаток. Квитанция транспорта не означает исполнения.';
    const vzyatB = (limit=ocheredB.length) => {
      if (!ocheredB.length || prervanPoStop || explicitMailStop) return null;
      const t = ocheredB.slice(0,limit).join('\n\n');
      log(`task-control: B показан модели в ходе ${hodId} (${limit} шт.)`);
      ocheredB.splice(0,limit);
      return t;
    };

    const signalDavleniya = async () => {
            try {
              if (signalDan) return {};
              const p = pressureHoda;
              if (p.porog === undefined || typeof zanjatoPoslednee !== 'number' || !(zanjatoPoslednee >= p.porog)) return {};

              const vyhod = { hookSpecificOutput: { hookEventName: 'PostToolBatch', additionalContext: tekstSignala(zanjatoPoslednee, p) } };
              log(`давление: СИГНАЛ модели «доведи шаг и закончи ход» — занято ${zanjatoPoslednee} ≥ порога платформы ${p.porog}`);
              return vyhod;
            } catch (e) { log(`🔴 давление: хук PostToolBatch бросил (${String(e?.message ?? e).slice(0, 120)}) — сигнал не дан, ход идёт`); return {}; }
    };
    const composeInputHook = async hook => {
      if(hook==='Stop')stopPrishyol=true;
      if(prervanPoStop||explicitMailStop)return {};
      const bCount=ocheredB.length;const pendingB = ocheredB.slice(0,bCount).join('\n\n');
      const signal = hook==='PostToolBatch'&&DAVLENIE.has('signal') ? await signalDavleniya() : {};
      const mandatory = [pendingB,signal?.hookSpecificOutput?.additionalContext].filter(Boolean);
      let planInput;
      try { planInput=inputQueue.take(hook,mandatory); }
      catch { inputQueue.rejectPending('hook-budget');log('inbox: shared hook budget refused; no ordinary input offered');if(hook==='Stop')bZakryt=true;return {}; }
      if(!planInput){if(hook==='Stop')bZakryt=true;return signal;}
      const output={hookSpecificOutput:{hookEventName:hook,additionalContext:planInput.text}};
      if(!planInput.commit())return {};
      if(signal?.hookSpecificOutput?.additionalContext) {signalDan=true;log('давление: сигнал доставлен в PostToolBatch');}
      if(pendingB)vzyatB(bCount);
      return output;
    };
    const { query } = await zagruzitSdk('@anthropic-ai/claude-agent-sdk');
    const iter = query({
      prompt: tekushchij.prompt,
      options: {
        model: body.model || DEFAULT_MODEL,

        maxTurns: Number(body.maxTurns) > 0 ? Number(body.maxTurns) : DEFAULT_MAX_TURNS,
// RU: SDK approvals отключены; права tools зависят от Unix UID и выбранного sandbox, а не platform unit.
// EN: SDK approval prompts are bypassed; tool rights depend on Unix UID and selected sandbox, not the platform unit.
        permissionMode: 'bypassPermissions',

        ...(process.env.GATEWAY_INSTRUMENTY_DVIZHKA === 'net' ? { tools: [] } : {}),
        ...(EFFORT ? { effort: EFFORT } : {}),

        hooks: { Stop: [{ hooks: [async (vhod) => {effortIzHuka=vhod?.effort?.level??null;return composeInputHook('Stop')}] }],
          ...(DAVLENIE.has('signal') || registerTaskControl ? { PostToolBatch: [{ hooks: [async () => composeInputHook('PostToolBatch')] }] } : {}) },

        ...(tekushchij.resume ? { resume: tekushchij.resume } : { sessionId }),

        ...(Object.keys(mcpAll).length ? { mcpServers: mcpAll } : {}),
        ...(body.cwd ? { cwd: body.cwd } : { cwd: WORK_DIR }),

        ...(body.system ? { systemPrompt: { type: 'preset', preset: 'claude_code', append: body.system, snapshot: false } } : {}),

        // B-N-1899: гигиена, не защита — служебные GATEWAY_* движку не отдаём, токен — дескриптором 3 (envDvizhka, spawnDvizhkaSTokenom).
        env: envDvizhka({ CLAUDE_CODE_NO_MODEL_FALLBACK: '1',
          ...(kartaHoda ? { ANTHROPIC_BASE_URL: kartaHoda.url } : {}),
          ...(propuskHoda ? { GATEWAY_MOST_PROPUSK: propuskHoda } : {}) }),
        spawnClaudeCodeProcess: (o) => spawnDvizhkaSTokenom(o, token),
      },
    });

    if (registerTaskControl) {
      try {
        unregisterTaskControl = registerTaskControl(async (packet) => {

          const ack = { accepted: true, codex: { thread_id: tekushchij.resume || sessionId, turn_id: hodId }, model_response: 'unknown' };
          if (['stop','stop-exact'].includes(packet.op)) {
            if (rezultatPrishyol) return { accepted: false };

            if (!stopObeshchanie) stopObeshchanie = (async () => {
              prervanPoStop = true;
              try {
                const otvet = await iter.interrupt();
                interruptPrinyat = true;
                log(`task-control: /stop — interrupt принят SDK (${JSON.stringify(otvet ?? null).slice(0, 80)}): control ${packet.binding.control_id}, ход ${hodId}`
                  + `${ocheredB.length ? `, непоказанных B ${ocheredB.length} — дошлю письмом` : ''}; окончание исполнения не утверждается`);
                return true;
              } catch (e) {
                prervanPoStop = false; stopObeshchanie = null;
                log(`🔴 task-control: /stop — interrupt ОТКАЗАЛ (${String(e?.message ?? e).slice(0, 120)}): control ${packet.binding.control_id}, ход ${hodId} идёт дальше; ответ accepted:false`);
                return false;
              }
            })();
            return (await stopObeshchanie) ? { ...ack, operation: packet.op } : { accepted: false };
          }
          if(packet.op==='message'){
            let provenance;
            try { provenance=parseInboxPayload(packet).provenance; }
            catch { inputStatus(packet,'not-offered','invalid-user-input');return {accepted:false,input_state:'not-offered'}; }
            if(provenance.verified!==true){inputStatus(packet,'not-offered','signature-unverified');return {accepted:false,input_state:'not-offered'};}
            if(bZakryt||signalDan||prervanPoStop||explicitMailStop||rezultatPrishyol||!inputQueue.enqueue(packet)){
              inputStatus(packet,'not-offered','not-accepting');return {accepted:false,input_state:'not-offered'};
            }
            return {...ack,input_state:'pending'};
          }
          if (packet.op !== 'cancel' || bZakryt || signalDan || prervanPoStop || explicitMailStop || rezultatPrishyol) return { accepted: false };
          if(Buffer.byteLength([ocheredB.join('\n\n'),tekstB(packet)].filter(Boolean).join('\n\n'))>HOOK_BYTES-8192)return {accepted:false};
          ocheredB.push(tekstB(packet));
          log(`task-control: B принят в ход ${hodId}: control ${packet.binding.control_id} — модели на ближайшей пачке инструментов или на Stop`);
          return ack;
        },{thread_id:tekushchij.resume||sessionId,turn_id:hodId});
      } catch (e) { log(`🔴 task-control: управление ходом НЕ подключено (${String(e?.message ?? e).slice(0, 120)}) — /stop и B до этого хода не дойдут, ход идёт`); }
    }

    let pervyjText = null;
    const granicySdk = [];
    let oknoSdkObeshchanie = null;
    try {
    for await (const m of iter) {
      if (m.type === 'result') { rezultatPrishyol = true; rezultatVid = m.subtype ?? null; }
      if (m.type === 'rate_limit_event') zapisatLimit(m.rate_limit_info);
      if (m.type === 'system' && m.subtype === 'compact_boundary') {
        // SDK session bounds the source of this event, never the public diagnostic address.
        if(m.session_id===(tekushchij.resume||sessionId))contextObserver?.compacted({time:new Date().toISOString()});
        else if(typeof m.session_id!=='string'||!m.session_id)contextObserver?.blind();
        const meta = m.compact_metadata;
        const chislo = (n) => Number.isSafeInteger(n) && n >= 0 ? n : 'не сообщено SDK';
        const nizhe = DAVLENIE.has('storozh') ? pressureHoda : null;
        log(`сжатие SDK: было ${chislo(meta?.pre_tokens)} → стало ${chislo(meta?.post_tokens)} токенов`
          + (!nizhe ? '' : nizhe.porog === undefined ? ` · 🔴 ДАВЛЕНИЕ: порог платформы НЕ ПРОЧИТАН (${nizhe.prichina})`
            : Number.isSafeInteger(meta?.pre_tokens) && meta.pre_tokens < nizhe.porog
              ? ` · 🔴 ДАВЛЕНИЕ: SDK сжал НИЖЕ порога платформы ${nizhe.porog}` : ` · порог платформы ${nizhe.porog}`));
        granicySdk.push({ uuid: m.uuid, sessiya: m.session_id, meta });
      }

      if (m.type === 'system' && m.subtype === 'init') {
        if (!Array.isArray(m.tools)) log('движок: состав инструментов не сообщён SDK');
        else {
          const builtin = m.tools.filter(name => !String(name).startsWith('mcp__'));
          log(`движок: встроенных инструментов ${builtin.length} [${builtin.join(', ')}]; mcp ${m.tools.length - builtin.length}`);
        }
      }
      if (m.type === 'system' && m.subtype === 'init' && merged.mounted && Array.isArray(body.bridge?.tools)) {
        const norm = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');
        const pref = `mcp__${norm(bridgeName)}__`;
        const u = new Set((Array.isArray(m.tools) ? m.tools : []).filter((t) => String(t).startsWith(pref)).map((t) => String(t).slice(pref.length)));
        const poslano = body.bridge.tools.map((t) => norm(t.name));
        const dropped = gatewaySchemaState.rejected;
        const droppedIndices = new Set(dropped.map(t => t.index));
        const eligible = poslano.filter((_, i) => !droppedIndices.has(i));
        const net = eligible.filter((n) => !u.has(n));
        const st = (Array.isArray(m.mcp_servers) ? m.mcp_servers : []).find((s) => s?.name === bridgeName)?.status ?? 'не назван движком';
        log(`${net.length || dropped.length ? '🔴 ' : ''}мост у модели: прислано ${poslano.length} · собрано ${eligible.length - net.length} · отброшено шлюзом ${dropped.length}${dropped.length ? ' (' + dropped.map(t => JSON.stringify(t.name)).join(', ') + ')' : ''} · пропущено движком ${net.length}`
          + (net.length ? ` (${net.join(', ')})` : '') + ` · сервер "${bridgeName}" ${st} · путь ${propuskHoda ? 'HTTP' : 'zod'}`);
      }

      if (m.type === 'result' && m.subtype === 'success' && signalDan && !prervanPoStop) {
        const p = pressureHoda;
        stopPoDavleniyu = { zanyato: zanjatoPoslednee, porog: p.porog };
      }
      if (m.type === 'result') {

        const primenyon = !stopPrishyol ? '⚠️ ХУК Stop НЕ ПРИШЁЛ (применён ли — НЕ ЗНАЕМ)'
          : (effortIzHuka ?? '⚠️ Stop пришёл БЕЗ effort (модель без поддержки уровня?)');
        log(`модель ${model ?? '?'} · effort: ветка anthropic · запрошен ${EFFORT ?? 'НЕ ЗАДАН (умолчание SDK)'} · применён ${primenyon}` +
          (EFFORT && effortIzHuka && effortIzHuka !== EFFORT ? ' · 🔴 РАСХОЖДЕНИЕ' : '') +
          ` · модель запрошена ${body.model || DEFAULT_MODEL}`);
      }

      if (DAVLENIE.has('storozh') && oknoSdkObeshchanie === null
          && ((m.type === 'system' && m.subtype === 'init') || m.type === 'assistant')) {
        const tochka = m.type === 'assistant' ? 'assistant' : 'init', zaprosMs = Date.now() - started;
        oknoSdkObeshchanie = iter.getContextUsage({ detail: 'summary' })
          .then((cu) => ({ cu, tochka }), (e) => ({ oshibka: String(e?.message ?? e).slice(0, 160), tochka, zaprosMs }));
      }
      if (m.type === 'assistant') {
        model = m.message?.model ?? model;
        // RU: Удержанный первый текст (распознавание «Prompt is too long» по usage) выпускается перед любым следующим блоком — порядок text → tool/thinking сохраняется (аудит №12). Переполнение — одинокий текст с нулевым usage, ему это не мешает.
        // EN: The held first text (overflow detection by usage) is released before any following block — text → tool/thinking order is kept (audit #12). Overflow is a lone text with zero usage, unaffected.
        const vypustitPervyj = () => { if (pervyjText !== null) { otdat({ type: 'text', text: pervyjText }); pervyjText = null; } };
        for (const b of m.message?.content ?? []) {
          if (b.type === 'text') {

            if (pervyjText === null && otdanoSobytij === 0) pervyjText = b.text;
            else { vypustitPervyj(); otdat({ type: 'text', text: b.text }); }
          }
          else if (b.type === 'thinking') { vypustitPervyj(); otdat({ type: 'thinking', text: b.thinking }); }

          else if (b.type === 'tool_use') { vypustitPervyj(); otdat({ type: 'tool', name: b.name, brief: briefOf(b.input) }); }
        }
        const u = m.message?.usage;
        if(m.parent_tool_use_id===null){
          const input=[u?.input_tokens,u?.cache_read_input_tokens,u?.cache_creation_input_tokens];
          if(m.error===undefined&&u&&input.every(n=>Number.isSafeInteger(n)&&n>=0))
            contextObserver?.token({time:new Date().toISOString(),last:{input_tokens:input.reduce((n,x)=>n+x,0)},window:pressureHoda.okno??null});
          else contextObserver?.blind();
        }else if(typeof m.parent_tool_use_id!=='string'||!m.parent_tool_use_id)contextObserver?.blind();
        if (u) {

          const vseNuli = ((u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)) === 0;
          if (pervyjText !== null && vseNuli && POSTAVSHCHIK.perepolnenieVPotoke(pervyjText)) {
            throw new Error(pervyjText);
          }
          if (pervyjText !== null) {
            otdat({ type: 'text', text: pervyjText });
            pervyjText = null;
          }
          zanjatoPoslednee = polnayaZanyatost(u, IMYA_POSTAVSHCHIKA);
          const vedra = vedraPoImeni(u, IMYA_POSTAVSHCHIKA);

          otdat({
            type: 'usage',
            inputTokens: vedra.inputTokens,
            outputTokens: vedra.outputTokens,
            cacheReadTokens: vedra.cacheReadTokens,
            cacheWriteTokens: vedra.cacheWriteTokens,
          });
        }
      }
    }
    } catch (e) {

      if (!interruptPrinyat || rezultatVid !== 'error_during_execution') throw e;
      log(`task-control: ход ${hodId} прерван по /stop — закрываю штатно (SDK: ${String(e?.message ?? e).slice(0, 120)})`);
    } finally {
      res.removeListener('close',closeInputs);inputQueue.close(); bZakryt = true;
      if(rezultatPrishyol)registerTaskControl?.terminal?.({thread_id:tekushchij.resume||sessionId,turn_id:hodId,status:interruptPrinyat?'interrupted':rezultatVid==='success'?'completed':'failed',proof:'claude-sdk-result'});
      unregisterTaskControl?.(); unregisterTaskControl = null;
      if (ocheredB.length && !explicitMailStop) {
        log(`🔴 task-control: B принят, но модели НЕ показан — ход ${hodId} кончился раньше (${ocheredB.length} шт.); досылаю письмом в ящик`);
        polozhitProdolzhenie(`[шлюз Claude · досылка сообщения] Это сообщение пришло во время прошлого хода, но показать его модели шлюз не успел — `
          + `ход кончился раньше. Прочти его сейчас.\n${ocheredB.join('\n\n')}`, 'досылка B', spoolAddress);
        ocheredB = [];
      }

      if (granicySdk.length) {
        await svodkiSdkVPamyat(granicySdk, body.cwd || WORK_DIR);
        let sdkClosed = false;
        try { await iter.close(); sdkClosed = true; }
        catch (e) { log(`🔴 read_image: SDK compact состоялся; закрытие SDK не удалось, очистку не запускаю: ${e?.message ?? e}`); }
        if (sdkClosed && COMPACTION.available) for (const g of granicySdk) {
          try {
            const file = putSessii(g.sessiya, body.cwd || WORK_DIR);
            const toolName = `mcp__${bridgeName.replace(/[^A-Za-z0-9_-]/g, '_')}__read_image`;
            if (!hasMcpImageCalls(file, toolName)) continue;
            const removed = stripMcpImages(file, {toolName, beforeUuid: g.uuid});
            log(`read_image: после SDK compact удалено ${removed} image-блоков из активного JSONL (архивы не затронуты)`);
          } catch (e) { log(`🔴 read_image: SDK compact состоялся; проверка/очистка изображений не удалась: ${e?.message ?? e}`); }
        }
      }
    }
    if (pervyjText !== null) { otdat({ type: 'text', text: pervyjText }); pervyjText = null; }
    if (oknoSdkObeshchanie) {
      const r = await oknoSdkObeshchanie;
      if (r.cu) { slepyhPodryad = 0; log(strokaOknaSdk(r.cu, pressureHoda) + ` · снимок на ${r.tochka}`); }
      else {
        slepyhPodryad += 1;
        log(`давление: окно SDK НЕ СНЯТО (${r.oshibka}; запрос на ${r.tochka} через ${r.zaprosMs} мс от начала хода)`
          + ` · слепота сторожа: ${slepyhPodryad} подряд, тревога с ${DAVLENIE_SLEPOTA}`
          + (slepyhPodryad >= DAVLENIE_SLEPOTA ? ` · 🔴 ДАВЛЕНИЕ: сторож слеп ${slepyhPodryad} ходов подряд` : ''));
      }
    }
    }finally{contextObserver?.end()}
    };

    log(`подсказка: ${plan.pochemu}`);
    try {
      await progon(plan);
    } catch (e) {

      if (plan.pochemu?.startsWith('хвост') && otdanoSobytij === 0 && POSTAVSHCHIK.opoznatOtkaz(e) === 'perepolnenie') {

        const hvost2 = planHvosta(body.messages, Math.floor(plan.hovostZnakov / 2), plan);
        if (hvost2 && hvost2.hovostZnakov < plan.hovostZnakov) {
          log(`🔴 хвост ${plan.hovostZnakov} зн. тоже не влез — уменьшаю до ${hvost2.hovostZnakov} зн.`);
          plan = hvost2;
          sessionId = crypto.randomUUID();
          await progon(plan);
        } else {
          throw e;
        }
      } else {

      if (!plan.resume || otdanoSobytij > 0) throw e;
      const soobshchenie = String(e?.message ?? e);

      const vidOtkaza = POSTAVSHCHIK.opoznatOtkaz(soobshchenie);

      if (vidOtkaza !== 'sessiya-mertva') {
        log(`🔴 продолжение сессии ${plan.resume} не удалось (${vidOtkaza}: ${soobshchenie.slice(0, 200)}) — запись сессии СОХРАНЕНА, полной историей НЕ повторяю`);
        throw e;
      }
      log(`🔴 мёртвая сессия ${plan.resume} — сбрасываю id из памяти и базы (${soobshchenie.slice(0, 120)})`);
      udalitSessiyu(plan.kluch);
      plan = sHvostomEsliNado({ ...planZaprosa(body.messages, conversation.key), identity: conversation.identity }, body.messages);

      sessionId = crypto.randomUUID();
      await progon(plan);
      }
    }

    {
      const sidSt = plan.resume || sessionId;
      const bylo = STUPEN_SESSII.get(sidSt) ?? -1;

      const stalo = (zanjatoPoslednee === null || zanjatoPoslednee === undefined || Number.isNaN(zanjatoPoslednee))
        ? bylo : stupenZanjatosti(zanjatoPoslednee);
      if (stalo > bylo) {
        STUPEN_SESSII.set(sidSt, stalo);
        log(`занято ${zanjatoPoslednee} из ${KOMPAKT_POROG} (${Math.round(zanjatoPoslednee / KOMPAKT_POROG * 100)}% порога компакта, ступень ${stalo + 1} из ${KOMPAKT_STUPENI.length})${KOMPAKT_SHLYUZOVOJ === false ? ' — шлюзовой компакт ВЫКЛЮЧЕН, этот порог НЕ действует; действующий — платформенный, в пресете агента' : ''}`);
      }
    }
    const reshenie = reshitKompakt(zanjatoPoslednee, KOMPAKT_POROG, KOMPAKT_SHLYUZOVOJ);

    if (reshenie === 'nedostupen') {
      log(`🔴 компакт НЕДОСТУПЕН: ${COMPACTION.reason}; сессия не тронута`);
    } else if (reshenie === 'neizvestno') {
      log(`🔴 компакт НЕ РЕШЁН: занятость окна НЕИЗВЕСТНА (поставщик ${POSTAVSHCHIK.imya} о расходе не сообщил). Это НЕ «окно пустое» и НЕ «пора сжимать» — мерить нечем. Сжатия не делаю, такт пропускаю.`);
    } else if (reshenie === 'vyklyuchen') {
      log(`компакт: шлюзовой механизм ВЫКЛЮЧЕН настройкой (занято ${zanjatoPoslednee} из ${KOMPAKT_POROG} — сжатия не будет, платформенный: ${KOMPAKT_PLATFORMENNYJ ? 'вкл' : 'выкл'})`);
    } else if (reshenie === 'zhat' && !explicitMailStop) {
      if (KOMPAKT_SHLYUZOVOJ === undefined) log(`компакт: шлюзовой механизм НЕ ОБЪЯВЛЕН — сжимаю по безопасному умолчанию (занято ${zanjatoPoslednee} из ${KOMPAKT_POROG})`);
      const sid = plan.resume || sessionId;
      try {
        const it = POSTAVSHCHIK.imya === 'anthropic'
          ? await compactMcpHistory(fizicheskiyKompakt, putSessii(sid, body.cwd || WORK_DIR), sid, zanjatoPoslednee, `mcp__${bridgeName.replace(/[^A-Za-z0-9_-]/g, '_')}__read_image`)
          : await fizicheskiyKompakt(putSessii(sid, body.cwd || WORK_DIR), sid, zanjatoPoslednee);
        if (it.sdelano && POSTAVSHCHIK.imya === 'anthropic') {
          if (it.mcpImageCleanupError) log(`🔴 read_image: компакт СОСТОЯЛСЯ, очистка изображений НЕ СОСТОЯЛАСЬ: ${it.mcpImageCleanupError}`);
          else log(`read_image: после физического компакта удалено ${it.mcpImageBlocksRemoved} image-блоков из активного JSONL (страховка сохранена)`);
        }

        if (it.sdelano) STUPEN_SESSII.delete(sid);
        if (it.sdelano) log(`компакт: занято ${zanjatoPoslednee} -> сводка ${it.svodkaZnakov} зн. (вход ${it.vhodZnakov} из ${it.vsegoZnakov} зн. прозы, ${it.vhodHodov} ходов, отброшено ${it.otbrosheno} зн.${it.obrezano ? ', начало хода обрезано' : ''}); строк ${it.bylo} -> ${it.stalo}; запас ${it.zapas}`);
        else log(`компакт не делался: ${it.pochemu}`);
      } catch (e) {

        log(`🔴 компакт НЕ СОСТОЯЛСЯ (сессия не тронута): ${String(e?.message ?? e).slice(0, 200)}`);
      }
    }
    // Anthropic принимает RU: Граница фрагмента physical compaction для существующего теста. EN: Physical-compaction extraction boundary for the existing test.
    if (POSTAVSHCHIK.imya === 'anthropic') {
      zapomnit(plan, plan.resume || sessionId, body.messages);
    }

    if (POSTAVSHCHIK.imya === 'anthropic' && !explicitMailStop) {
      if (!stopPoDavleniyu) pressureCounter.reset();
      else {
        const state=pressureCounter.accepted();
        log(`давление: сигнал #${state.stops}; ход завершён`);
        if(!state.allowed)log(`продолжение не положено: сигнал #${state.stops}; писем ${state.letters}/${PREDEL_PRODOLZHENIJ}`);
        else pressureCounter.placed(polozhitProdolzhenie(tekstProdolzheniyaClaude(stopPoDavleniyu), 'продолжение', spoolAddress));
      }
    }
    sbrositOtkazy(plan?.kluch);
    baseTaskControl?.publishTerminal?.();
    send({ type: 'done', model, tookMs: Date.now() - started });
  } catch (e) {

    const message = explainExit(e, sessionId, cwd);
    log(`🔴 сбой вызова: ${message}`);
    otmetitOtkaz(plan?.kluch, message);
    send({ type: 'error', message: message.slice(0, 500) });
  } finally {
    res.end();
  }
}

server.listen(PORT, HOST, async () => {

  log(`поставщик: ${IMYA_POSTAVSHCHIKA} (источник: GATEWAY_POSTAVSHIK, умолчания нет — без него отказ при старте)`);
  log(`слушаю ${HOST}:${PORT}; токен из ${TOKEN_FILE}; движок — официальный SDK; компакт: ${COMPACTION.available ? `шлюзовой ${KOMPAKT_SHLYUZOVOJ === undefined ? 'не объявлен' : KOMPAKT_SHLYUZOVOJ ? 'вкл' : 'выкл'}, платформенный ${KOMPAKT_PLATFORMENNYJ === undefined ? 'не объявлен' : KOMPAKT_PLATFORMENNYJ ? 'вкл' : 'выкл'}` : 'НЕДОСТУПЕН: ' + COMPACTION.reason + '; настройки не измерены'}`);
  log(`авторизация поставщика: ${POSTAVSHCHIK.chemAvtorizuetsya}`);
  if (POSREDNIK) log(`маска ПДн: ВКЛ; посредник ${POSREDNIK.url}; модели ${MASKA_PDN.modeli.join(',')}; гостевых значений в реестре ${MASKA_PDN.reestr().gostej}`);

  if (IMYA_POSTAVSHCHIKA === 'openai' || IMYA_POSTAVSHCHIKA === 'anthropic') MOST_CODEX = await podnyatMostCodex();
  else log(`мост не поднимается: поставщик «${IMYA_POSTAVSHCHIKA}» инструментов не носит`);
  const g0 = POSTAVSHCHIK.gotov();
  if (!g0.ok) log(`🔴 предупреждение: поставщик «${IMYA_POSTAVSHCHIKA}» НЕ ГОТОВ — ${g0.chego}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log(`получен ${sig}, закрываюсь`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
