/**
 * RU: Стенд решений по состояниям доверия: отмена показывает строку ⛔ с id/автором/временем, без содержимого и касания; снятая отмена возвращает verify; старое ядро сохраняет прежний путь. Сквозная проба читает настоящее ядро на временной базе через prochitat→perevesti→podatWelcome.
 * EN: Test decisions for trust states: cancellation shows an ⛔ line with id/author/time, without content or touch; removed cancellation returns verify; an older core retains the earlier path. An integration test reads a real core on a temporary database through prochitat→perevesti→podatWelcome.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: vremennyj регистрирует уборку при штатном выходе и SIGTERM/SIGINT, включая отказ пробы. SIGKILL и временные файлы дочернего процесса этим не покрыты.
// EN: vremennyj registers cleanup on normal exit and SIGTERM/SIGINT, including failed tests. This does not cover SIGKILL or temporary files owned by child processes.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let restore, core;
try {
  restore = await import('../src/index.js');
  core = await import('../../dsh-pamyat-core/src/hranilishche.js');
} catch (e) { console.log('СЛЕПОТА: предмет не загрузился (restore или соседний dsh-pamyat-core) — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v && typeof v.then === 'function') throw new Error('тело ОЖИДАЮЩЕЕ — прогонщик синхронный');
    if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ');
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const CFG = { ignoreAfterMs: 7 * 86400000, useVeraThreshold: 0.7, ignoreVeraThreshold: 0.3, welcomeBudget: 4000 };
const sejchas = Date.now();
const rec = (id, doverie, extra = {}) => ({ id, vid: 'reshenie', avtor: 'stend', kogda: sejchas - 3600000, vera: null,
  soderzhim: 'СОДЕРЖИМОЕ-' + id, bezPodtverzhdeniya: false, podtverzhdenie: null, otnosheniya: null, doverie, ...extra });
const dv = (sostoyanie, stroka) => ({ sostoyanie, stroka, ssylki: [] });
const ozhid = (r, decision, kusok) => {
  const d = restore.decide(r, CFG, sejchas);
  if (d.decision !== decision) throw new Error('ждали ' + decision + ', получили ' + d.decision + ' (' + d.reason + ')');
  if (kusok && !d.reason.includes(kusok)) throw new Error('в причине нет «' + kusok + '»: ' + d.reason);
};

proba('ОТМЕНЕНА → ignore', () => ozhid(rec(1, dv('otmenena', 'отменена #9 (кем: x, когда: t)')), 'ignore', 'отменена #9'));
proba('ОПРОВЕРГНУТА → verify «опровергнута»', () => ozhid(rec(2, dv('oprovergnuta', 'опровергнута: опора утрачена')), 'verify', 'опровергнута'));
proba('ОТМЕТКА НЕГОДНА → verify', () => ozhid(rec(3, dv('otmetka-negodna', 'отметка события не разбирается')), 'verify', 'не разбирается'));
proba('УТОЧНЕНА → verify с #уточняющей', () => ozhid(rec(4, dv('utochnena', 'уточнена #8 — читать вместе')), 'verify', '#8'));
proba('ПОДТВЕРЖДЕНА → use', () => ozhid(rec(5, dv('podtverzhdena', 'подтверждена: chelovek:x')), 'use', 'подтверждена'));
proba('БЕЗ ПОДТВЕРЖДЕНИЯ → прежняя ветка веры (verify «вера не измерялась»)', () => ozhid(rec(6, dv('bez-podtverzhdeniya', 'без подтверждения')), 'verify', 'вера не измерялась'));
proba('ОБЫЧНАЯ → прежняя ветка веры', () => ozhid(rec(7, dv('obychnaya', 'событий доверия нет')), 'verify', 'вера не измерялась'));
proba('старое ядро (doverie null) → как было', () => ozhid(rec(8, null), 'verify', 'вера не измерялась'));
proba('возраст первым: отменённая старше срока — ignore по возрасту, без строки', () => {
  const d = restore.decide(rec(10, dv('otmenena', 'отменена #9'), { kogda: sejchas - 9 * 86400000 }), CFG, sejchas);
  if (d.decision !== 'ignore' || d.vidimo || !/старше/.test(d.reason)) throw new Error(JSON.stringify(d));
});

// RU: Настоящая временная база ядра проходит через prochitat, переходник и формирование брифинга.
// EN: A real temporary core database passes through prochitat, the adapter, and briefing construction.
const put = join(vremennyj(join(tmpdir(), 'doverie-vydachi-')), 'p.db');
const h = core.otkrytHranilishche(put);
const KL = ['reshenie', 'urok', 'vyvod', 'ogranichenie', 'oshibka', 'poryadok', 'nablyudenie', 'fakt'];
const a = h.zapisat({ agent: 'stend', klass: 'reshenie', soderzhim: 'ОТМЕНЯЕМОЕ-СОДЕРЖИМОЕ' });
const b = h.zapisat({ agent: 'stend', klass: 'reshenie', soderzhim: 'отменяет прежнее', istochnik: 'stend-sud' });
h.ustanovitOtnoshenie({ agent: 'stend', id: b, vid: 'otmenyaet', k: a, klassyZnaniy: KL });
const brifing = () => restore.podatWelcome(h.prochitat({ agent: 'stend', skolko: 20 }).map(restore.perevesti), CFG);

proba('СКВОЗНАЯ: отменённая видна строкой «⛔ #a … отменена #b (кем, когда)», содержимое НЕ подано, в podany её нет', () => {
  const { tekst, podany } = brifing();
  const stroka = (tekst ?? '').split('\n').find((l) => l.includes('⛔ #' + a));
  if (!stroka) throw new Error('строки об отмене нет: ' + tekst);
  if (!stroka.includes('отменена #' + b) || !stroka.includes('кем: stend-sud') || !stroka.includes('когда: ')) throw new Error('строка неполна: ' + stroka);
  if (tekst.includes('ОТМЕНЯЕМОЕ-СОДЕРЖИМОЕ')) throw new Error('содержимое отменённой подано');
  if (podany.some((r) => Number(r.id) === a)) throw new Error('отменённая в podany — получит касание');
});
proba('СКВОЗНАЯ: отмена снята → снова verify, содержимое подано', () => {
  h.baza.prepare('UPDATE zapisi SET otnoshenie = NULL, otnositsya_k = NULL WHERE id = ?').run(b);
  const { tekst, podany } = brifing();
  if (!tekst.includes('ОТМЕНЯЕМОЕ-СОДЕРЖИМОЕ') || !podany.some((r) => Number(r.id) === a)) throw new Error('не подано: ' + tekst);
  if (tekst.includes('⛔ #' + a)) throw new Error('строка отмены осталась');
});
h.zakryt?.();
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
