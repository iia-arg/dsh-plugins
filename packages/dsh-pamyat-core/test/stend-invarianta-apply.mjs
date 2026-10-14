#!/usr/bin/env node
// RU: Проверяем три вызова apply() на подставном ctx без накопления процессных ресурсов: сравниваем типы process.getActiveResourcesInfo(), число слушателей exit/beforeExit/SIGTERM/SIGINT/uncaughtException/unhandledRejection и живые ресурсы async_hooks, созданные внутри окна. Последний срез видит unref-таймеры, которые первый не видит. Не проверяем поздние ресурсы вне окна, синхронные ресурсы вроде DatabaseSync и слушателей других событий.
// EN: Call apply() three times on a fake ctx and check for accumulated process resources: compare process.getActiveResourcesInfo() types, listener counts for exit/beforeExit/SIGTERM/SIGINT/uncaughtException/unhandledRejection, and surviving async_hooks resources created within the call window. The last view detects unref timers that the first misses. Later resources outside the window, synchronous resources such as DatabaseSync, and other event listeners are not covered.
import { createHook } from 'node:async_hooks';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Временные файлы убираем на всех перехватываемых путях выхода; SIGKILL выполнить уборку не позволяет.
// EN: Clean temporary files on every interceptable exit path; SIGKILL cannot run cleanup.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs';
const VREMENNYE = [];
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k; };
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }); });
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));

let apply, Config;
try { ({ apply, Config } = await import('../src/index.js')); }
catch (e) { console.log('СЛЕПОТА: ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением');
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 200)); }
};

const SOBYTIYA = ['exit', 'beforeExit', 'SIGTERM', 'SIGINT', 'uncaughtException', 'unhandledRejection'];
const slushateli = () => Object.fromEntries(SOBYTIYA.map((s) => [s, process.listenerCount(s)]));
const resursy = () => [...process.getActiveResourcesInfo()].sort();
const MIMO = new Set(['PROMISE', 'TickObject', 'Microtask']);
let okno = false; const zavedeno = new Map();
const hook = createHook({
  init(id, type) { if (okno && !MIMO.has(type)) zavedeno.set(id, type); },
  destroy(id) { zavedeno.delete(id); },
});

const katalog = vremennyj(join(tmpdir(), 'invariant-apply-'));
// RU: Служба tools присутствует как у платформы; иначе apply опрашивает её до 30 секунд unref-таймерами, и проба примет ограниченное ожидание за утечку.
// EN: Provide tools as the platform does; otherwise apply polls for up to 30 seconds with unref timers, and the probe mistakes bounded waiting for a leak.
const TOOLS = { register() {} };
const ctx = () => ({ logger: null, provide() {}, get(imya) { return imya === 'tools' ? TOOLS : undefined; }, on() {} });
const RAZ = 3;
const bylo = console.error; const stroki = [];
const doR = resursy(), doS = slushateli();
hook.enable();
console.error = (...a) => stroki.push(a.join(' '));
let otkaz = null;
okno = true;
try { for (let i = 1; i <= RAZ; i++) apply(ctx(), new Config({ putBazy: join(katalog, 'p' + i + '.db'), agent: 'proba' })); }
catch (e) { otkaz = e; }
okno = false;
await new Promise((g) => setTimeout(g, 300));   /* RU: Ждём завершения асинхронного хвоста apply, включая регистрацию инструмента.
 * EN: Wait for apply’s asynchronous tail, including tool registration.
 */
console.error = bylo;
const posleR = resursy(), posleS = slushateli(); const zhivye = [...zavedeno.values()];
hook.disable();

proba(`0 apply ×${RAZ} на подставном ctx отработал без исключения (строк подъёма: ${stroki.filter((s) => s.includes('подъём')).length})`, () => {
  if (otkaz) throw new Error('apply бросил: ' + String(otkaz?.message ?? otkaz).slice(0, 120));
  if (!stroki.some((s) => s.includes('подъём'))) throw new Error('строки подъёма нет — apply не дошёл до предмета, судить не о чем');
});
proba('1 process.getActiveResourcesInfo() до и после равны', () => {
  if (JSON.stringify(doR) !== JSON.stringify(posleR)) throw new Error('было ' + JSON.stringify(doR) + ', стало ' + JSON.stringify(posleR));
});
proba('2 listenerCount (exit/beforeExit/SIGTERM/SIGINT/uncaughtException/unhandledRejection) до и после равны', () => {
  const raz = SOBYTIYA.filter((s) => doS[s] !== posleS[s]).map((s) => `${s} ${doS[s]}→${posleS[s]}`);
  if (raz.length) throw new Error(raz.join(', '));
});
proba('3 ресурсов, заведённых в окне apply и живых после осадки, — 0 (ловит и unref)', () => {
  if (zhivye.length) throw new Error('живы: ' + JSON.stringify(zhivye));
});
console.log(`  итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
