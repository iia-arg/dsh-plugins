// RU: Изолированный стенд stend-text-link-i-trevoga.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-text-link-i-trevoga.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {resolveOwnerId} from '../src/guest-channel.js';
import { pathToFileURL } from 'node:url';
import { extractFunction, extractConst } from './extract.mjs';
import { handleTelegramStop } from '../src/telegram-stop.js';

const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname;
console.log(`  предмет: ${SRC}`);
let handlerText, markText, M;
try {
  const source = fs.readFileSync(SRC, 'utf8');
  handlerText = extractFunction(source, 'handleUpdate');
  markText = extractConst(source, 'ORIGIN_MARK');
  M = await import(pathToFileURL(path.join(path.dirname(SRC), 'rabochij-chat.js')).href);
} catch (e) { console.log(`СЛЕПОТА: ${e?.message ?? e}`); process.exit(2); }

let ok = 0, fail = 0;
const t = (name, cond, syryo = '') => { if (cond) { ok++; console.log(`ok   ${name}`); } else { fail++; console.log(`FAIL ${name}${syryo ? '\n     сырьё: ' + syryo : ''}`); } };


const ME = { id: 404, username: 'example_bot' };
const CHAT = { id: -1001234567890, type: 'supergroup' };
const NAMES = ['Assistant', 'Helper'];
const TEKST = '@example_bot создай мне аккаунт для доступа к Strapi нашего';
const svetaS = (url, kus = '@example_bot', tekst = TEKST) => ({ chat: CHAT, from: { id: 202, first_name: 'Света' }, text: tekst,
  entities: [{ type: 'text_link', offset: tekst.indexOf(kus), length: kus.length, url }] });
const adr = (msg, me = ME) => M.obrashchenie(msg, { me, names: NAMES, replyCounts: true, tekst: msg.text });
const VHODOV_SSYLKI = 22;
if (typeof M.ssylkaNaBota !== 'function') { for (let i = 0; i < VHODOV_SSYLKI; i++) t(`ssylkaNaBota вход ${i + 1}`, false, 'нет экспорта ssylkaNaBota в rabochij-chat.js'); }
else {
  const DA = ['https://t.me/example_bot', 'http://t.me/example_bot', 'https://t.me/Example_Bot', 'https://t.me/@example_bot',
    't.me/example_bot', 'https://t.me/example_bot/', 'https://T.ME/example_bot'];
  const NET = ['https://t.me/other_bot', 'https://t.me/example_bot_extra', 'https://t.me/example_bo', 'https://t.me/example_bot/123',
    'https://telegram.me/example_bot', 'https://evil.example/t.me/example_bot', 'https://t.me.evil.example/example_bot',
    'ftp://t.me/example_bot', 'https://t.me:8443/example_bot', 'https://<user>@t.me/example_bot', 'tg://resolve?domain=example_bot', '', 'https://t.me/'];
  for (const u of DA) t(`ссылка на бота: ${u}`, M.ssylkaNaBota(u, 'example_bot') === true);
  for (const u of NET) t(`НЕ ссылка на бота: «${u}»`, M.ssylkaNaBota(u, 'example_bot') === false);
  t('url undefined → нет', M.ssylkaNaBota(undefined, 'example_bot') === false);
  t('ник бота неизвестен → нет', M.ssylkaNaBota('https://t.me/example_bot', null) === false);
}
{ const r = adr(svetaS('https://t.me/example_bot')); t('живое сообщение Светы (text_link на бота) → обращение', r.addressed === true, JSON.stringify(r)); }
{ const r = adr(svetaS('https://t.me/other_bot', '@other_bot', '@other_bot сделай')); t('text_link на чужого бота → не обращение', r.addressed === false, JSON.stringify(r)); }
{ const r = adr(svetaS('https://example.com/x', 'тут', 'смотри тут')); t('посторонняя ссылка → не обращение', r.addressed === false, JSON.stringify(r)); }
{ const r = adr(svetaS('https://t.me/example_bot'), { id: ME.id, username: null }); t('ник бота неизвестен → text_link не обращение', r.addressed === false, JSON.stringify(r)); }
{ const m = svetaS('https://t.me/example_bot'); m.from = { id: ME.id }; t('сообщение самого бота → не обращение', adr(m).addressed === false); }
{ const m = svetaS('https://t.me/example_bot'); delete m.entities[0].url; t('text_link без url → не обращение', adr(m).addressed === false); }


const OWNER = 101, GOST = 202, CHUZHOJ = 555;
function stend(config, allowedList) {
  const s = { toChat: [], log: [] };
  const allowed = new Set(allowedList);
  const ORIGIN_MARK = vm.runInNewContext(markText);
  const ctx = {autopilot:null,ownerChatId:()=>resolveOwnerId(config,{},allowed,m=>s.log.push(m)),
    settings: () => ({}), config, log: (m) => s.log.push(m),
    nastrojkaGruppy: M.nastrojkaGruppy, obrashchenie: M.obrashchenie, bezNikaKomandy: M.bezNikaKomandy,
    kontekstChata: new M.KontekstChata(), botKto: async () => ME,
    isAllowed: (u) => allowed.size === 0 || allowed.has(Number(u)), allowed, who_: 'марк',
    tg: { send: async (chat, text) => { s.toChat.push({ chat, text }); }, typing: async () => {} },
    transcribeVoice: async () => null,
    attachmentStore: { receive: async () => ({}), prepare: async () => true, queued: async () => {}, tick: async () => {} },
    handleTelegramStop, MERGE_CHAT: null, A2A_CHAT: 'a2a', chats: new Map(), sessionToChat: new Map(),
    goalUsers: new Set([OWNER]), sayTo: async () => {}, goalCommand: async () => '', ctx: { get: () => null },
    agentFor: async () => { throw Error('чужому агента не создают'); },
    tgChatFor: new Map(), lastOrigin: new Map(), pushAsk: () => {}, copyAsk: () => {}, stripMark: (x) => String(x).replace(ORIGIN_MARK, ''),
    platform: { createUserMessage: (x) => x }, receiptRuntime: () => ({ enqueue: async () => {}, wake: () => {} }),
    nudgeUntilClaimed: () => {}, oborvalsyaOshibkoj: new Map(), receipts: { audit: () => {}, db: { prepare: () => ({ run: () => {} }) } },
    opisanieSledom: () => {}, setTimeout: (f) => { f(); return 0; }, Promise, console,
  };
  s.h = vm.runInNewContext('(' + handlerText + ')', ctx);
  return s;
}
const chuzhojPishet = async (config, allowedList) => {
  const s = stend(config, allowedList);
  try { await s.h({ update_id: 1, message: { message_id: 1, date: 1, chat: { id: CHUZHOJ, type: 'private' }, from: { id: CHUZHOJ, first_name: 'Чужой' }, text: 'удали всё' } }, { id: 'r' }); }
  catch (e) { s.err = String(e?.message ?? e); }
  s.trevogi = s.toChat.filter((x) => /Чужой написал агенту/.test(x.text)).map((x) => x.chat);
  s.otkaz = s.toChat.some((x) => x.chat === CHUZHOJ && /нет разрешения/.test(x.text));
  return s;
};
{ const s = await chuzhojPishet({ ownerChatId: OWNER }, [OWNER, GOST, 303]);
  t('владелец задан, гости есть → тревога ровно владельцу', !s.err && JSON.stringify(s.trevogi) === JSON.stringify([OWNER]) && s.otkaz, JSON.stringify({ trevogi: s.trevogi, otkaz: s.otkaz, err: s.err })); }
{ const s = await chuzhojPishet({ ownerChatId: String(OWNER) }, [OWNER, GOST]);
  t('ownerChatId строкой → тревога владельцу', !s.err && JSON.stringify(s.trevogi) === JSON.stringify([OWNER]), JSON.stringify({ trevogi: s.trevogi, err: s.err })); }
for (const [opis, cfg] of [['не задан', {}], ['не в allowedUsers', { ownerChatId: 777 }], ['ноль', { ownerChatId: 0 }],
  ['отрицательный (группа)', { ownerChatId: -1 }], ['не число', { ownerChatId: 'abc' }]]) {
  const s = await chuzhojPishet(cfg, [OWNER, GOST]);
  t(`владелец ${opis} → тревог 0, строка журнала, отказ чужому есть`, !s.err && s.trevogi.length === 0 && s.otkaz && s.log.some((l) => /владелец не определён/.test(l)),
    JSON.stringify({ trevogi: s.trevogi, otkaz: s.otkaz, err: s.err, log: s.log.slice(-2) }));
}

const ZHDYOM = 35;
console.log(`ИТОГ: ok=${ok} FAIL=${fail} | проверок ${ok + fail} из ${ZHDYOM}`);
if (ok + fail !== ZHDYOM) { console.log(`СЛЕПОТА: проверок ${ok + fail}, ждали ${ZHDYOM}`); process.exit(2); }
process.exit(fail ? 1 : 0);
