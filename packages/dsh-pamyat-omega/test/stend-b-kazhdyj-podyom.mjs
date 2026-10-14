/**
 * RU: A-N-1708 (Искра, 07.10.2026): вердикт о Б — на КАЖДОМ подъёме один из исходов: «ДОХОДИТ» / «НЕ доходит» / «НЕ ИЗМЕРЕНО»
 *     с причиной; гостевая (исключённая ядром) сессия — «Б в гостевом наборе не положена», без 🔴 и без захвата вердикта.
 *     Замер 48 ч до 07.10: молчали 31 процесс — все без шагов хода; у Варвары 05.10 11:46Z первый шаг пришёлся на сессию сайта
 *     (узкий набор, 2 инструмента) — ложное «🔴 НЕ доходит», и вердикт своих сессий в том процессе так и не прозвучал.
 *     Коды: 0 — годно; 1 — расхождение; 2 — слепота. Срок «НЕ ИЗМЕРЕНО» в стенде — PAMYAT_B_NE_IZMERENO_MS=300.
 *     ЧЕГО НЕ ЛОВИТ: живой мост и платформу (мост и сессии подставные), выбор срока 10 мин в бою.
 * EN: A-N-1708 stand: a B verdict on every start (reaches / does not / not measured); guest sessions get «not applicable».
 */
const app = process.env.DSH_TEST_APP ?? process.env.STEND_APP;
if (!app) { console.log('СЛЕПОТА: DSH_TEST_APP или STEND_APP не задан — SDK-путь неизвестен'); process.exit(2); }
process.argv[1] = app + '/node_modules/@deepseek-ai/dsh/lib/bin.js';
process.env.PAMYAT_B_NE_IZMERENO_MS = '300';
let mod;
const PUT = process.env.STEND_OMEGA ?? '../src/index.js';
try { mod = await import(PUT); } catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
let vsego = 0, proshlo = 0;
const proba = (imya, u, p) => { vsego++; if (u) { proshlo++; console.log('  ✅ ' + imya); } else console.log('  ❌ ' + imya + (p ? ' — ' + p : '')); };
const zhurnal = []; const errOrig = console.error; console.error = (...a) => zhurnal.push(a.join(' '));
const ZHDAT = (ms) => new Promise((q) => setTimeout(q, ms));
const NABOR = (s) => s ? ['send_message', 'pamyat_po_smyslu'] : ['send_message', 'list_agents'];
async function podnyat(most) {
  const s = { uslugi: {}, shov: null, reg: [] };
  const politika = { sessiyaIsklyuchena: (sid) => String(sid).startsWith('telegram-site-') };
  const ctx = { provide: (i, o) => { s.uslugi[i] = o; }, on: (sob, fn) => { if (sob === 'agent/pre-step') s.shov = fn; },
    get: (i) => (i === 'tools' ? { register: (t) => s.reg.push(t) } : i === 'mcpBridge' ? most : i === 'pamyat' ? politika : s.uslugi[i]) };
  zhurnal.length = 0;
  mod.apply(ctx, { adres: 'http://127.0.0.1:9/', tajmautMs: 100, vydacha: { vkl: true, koren: 'proba' } });
  for (let i = 0; i < 50 && !s.reg.length && !zhurnal.some((l) => l.includes('НЕ зарегистрирован')); i++) await ZHDAT(100);
  return s;
}
const shag = (s, sid) => s.shov({ agent: { session: { id: sid, requestHeader: () => undefined } }, signal: { aborted: false } }, async () => ({ kind: 'enter', messages: [] }));
const B = (l) => /\] (🔴 )?Б( |:)/.test(l) && !l.includes('скажу на первом шаге хода') || l.includes('Б в гостевом наборе');

// 1. Первый шаг — гостевая сессия сайта (узкий набор без Б), затем своя сессия (набор с Б).
let svoj = false;
const most = { toolNames: () => NABOR(svoj), modelToolName: (b) => 'mcp__proba__' + b };
let s = await podnyat(most);
if (!s.reg.length) { console.error = errOrig; console.log('СЛЕПОТА: инструмент не зарегистрировался — ' + zhurnal.slice(-2).join(' | ')); process.exit(2); }
await shag(s, 'telegram-site-990001');
proba('гостевая сессия: «Б в гостевом наборе не положена», без 🔴', zhurnal.some((l) => l.includes('Б в гостевом наборе не положена')) && !zhurnal.some((l) => l.includes('🔴 Б')), zhurnal.filter(B).join(' | '));
svoj = true; await shag(s, 'telegram-a2a');
proba('своя сессия после гостевой: вердикт «ДОХОДИТ» прозвучал', zhurnal.some((l) => l.includes('Б ДОХОДИТ до модели')), zhurnal.filter(B).join(' | '));
await ZHDAT(500);
proba('вердикт был — «НЕ ИЗМЕРЕНО» не печатается', !zhurnal.some((l) => l.includes('НЕ ИЗМЕРЕНО')), zhurnal.filter(B).join(' | '));

// 2. Подъём без единого шага: явное «НЕ ИЗМЕРЕНО» с причиной вместо молчания.
s = await podnyat({ toolNames: () => NABOR(true), modelToolName: (b) => b });
await ZHDAT(600);
proba('подъём без шагов: «Б: НЕ ИЗМЕРЕНО» с причиной (шага хода не было)', zhurnal.some((l) => l.includes('Б: НЕ ИЗМЕРЕНО') && l.includes('не было шага хода')), zhurnal.filter(B).join(' | ') || 'молчание');

// 3. Только гостевые шаги: «НЕ ИЗМЕРЕНО … (были только гостевые)».
s = await podnyat({ toolNames: () => NABOR(false), modelToolName: (b) => b });
await shag(s, 'telegram-site-5');
await ZHDAT(600);
proba('только гостевые шаги: «НЕ ИЗМЕРЕНО (были только гостевые)», без 🔴', zhurnal.some((l) => l.includes('НЕ ИЗМЕРЕНО') && l.includes('были только гостевые')) && !zhurnal.some((l) => l.includes('🔴 Б')), zhurnal.filter(B).join(' | ') || 'молчание');

console.error = errOrig;
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
