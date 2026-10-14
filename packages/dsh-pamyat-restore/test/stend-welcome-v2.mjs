// RU: A-N-1719 (Искра, 07.10.2026) + B-N-1762 (Аврора, 07.10.2026; условие Вениамина): welcome для сессий telegram-v2-* (/new).
//     Настоящий apply, временный файл отметок. v2 получает брифинг ЗНАНИЙ без старой сводки компакта. Предел 24 ч — НА СЕССИЮ:
//     каждый /new (новый ID telegram-v2-<uuid> строит только переход /new) — с брифингом, и второй за сутки тоже, в том же
//     процессе и после подъёма; перезапуск ТОЙ ЖЕ сессии в пределах 24 ч — без брифинга; её отметка старше 24 ч — снова с ним.
//     Коды: 0 — годно; 1 — расхождение; 2 — слепота. Путь предмета — STEND_RESTORE (умолчание ../src/index.js).
//     ЧЕГО НЕ ЛОВИТ: живую платформу и порядок шагов (здесь pre-step зовётся рукой), что новую v2-сессию строит только /new
//     (это свойство канала dsh-telegram-multiagent), предел у не-v2 (его держит stend-restore), состав знаний по бюджету.
// EN: A-N-1719 + B-N-1762 stand: welcome for telegram-v2-* (/new) sessions — knowledge only; the 24 h limit is per session.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PUT = process.env.STEND_RESTORE ?? new URL('../src/index.js', import.meta.url).pathname;
try { await import(PUT); } catch (e) { console.log('СЛЕПОТА: restore не загрузился — ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }
const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'welcome-v2-'));
process.on('exit', () => fs.rmSync(kat, { recursive: true, force: true }));
const otmetki = path.join(kat, 'welcome-otmetki.json');
let nomer = 0, ok = 0, bed = 0;
const proba = (imya, uslovie, podrobno) => { if (uslovie) { ok++; console.log('  ✅ ' + imya); } else { bed++; console.log('  ❌ ' + imya + ' — ' + podrobno); } };

// RU: Один «процесс» = свежий импорт модуля и свой apply; файл отметок общий, как у агента на диске.
async function process_() {
  delete globalThis.__pamyatRestore;
  const { apply, Config } = await import(PUT + '?p=' + nomer++);
  const handlers = {};
  const ctx = { on: (n, f) => { handlers[n] = f; return () => {}; }, get: (n) => n === 'pamyat' ? { sessiyaIsklyuchena: () => false,
    prochitat: async (q) => q.klass === 'svodka-kompakcii'
      ? [{ id: 1, klass: 'svodka-kompakcii', soderzhim: 'STARAYA_SVODKA', sozdano: Date.now() }]
      : [{ id: 1, klass: 'svodka-kompakcii', soderzhim: 'STARAYA_SVODKA', sozdano: Date.now() },
         { id: 2, klass: 'urok', soderzhim: 'ZNANIE_DLYA_V2', sozdano: Date.now() }] } : undefined };
  apply(ctx, Config({ welcomeEnabled: true, welcomeOtmetki: otmetki }));
  return async (sid) => {
    const session = { id: sid, events: [] };
    const r = await handlers['agent/pre-step']({ agent: { id: sid, session }, turn: 1, step: 1, signal: new AbortController().signal },
      async () => ({ kind: 'enter', messages: [] }));
    const t = JSON.stringify(r);
    return { znanie: t.includes('ZNANIE_DLYA_V2'), svodka: t.includes('STARAYA_SVODKA') };
  };
}
const v2 = (n) => 'telegram-v2-00000000-0000-4000-8000-00000000000' + n;

const hod1 = await process_();
const a = await hod1(v2(1));
proba('/new №1 после подъёма: брифинг знаний есть', a.znanie, 'брифинга нет — v2 по-прежнему исключён');
proba('/new: старой сводки компакта в брифинге нет', !a.svodka, 'старая сводка ввезена в /new');
const b = await hod1(v2(2));
proba('/new №2 в том же процессе (новое поколение): брифинг есть', b.znanie, 'второй /new за сутки без знаний — предел на агента');
const hod2 = await process_();
const c = await hod2(v2(3));
proba('/new №3 после нового подъёма в пределах 24 ч: брифинг есть', c.znanie, 'подъём + предел агента глушат новый /new');
const c1 = await hod2(v2(1));
proba('перезапуск ТОЙ ЖЕ сессии (/new №1) в пределах 24 ч: брифинга нет', !c1.znanie, 'перезапуск той же сессии дал второй брифинг за сутки');
const c2 = await hod2(v2(3));
proba('та же сессия, следующий шаг в том же процессе: брифинга нет', !c2.znanie, 'повтор в одном процессе');
let d = {}; try { d = JSON.parse(fs.readFileSync(otmetki, 'utf8')); } catch { d = { [v2(1)]: 0 }; }
d[v2(1)] = Date.now() - 25 * 3600000;
fs.writeFileSync(otmetki, JSON.stringify(d));
const hod3 = await process_();
const e = await hod3(v2(1));
proba('та же сессия, её прошлый брифинг 25 ч назад: брифинг снова есть, без сводки', e.znanie && !e.svodka, JSON.stringify(e));
const f = await hod3(v2(2));
proba('другая сессия с брифингом < 24 ч в том же подъёме: брифинга нет (предел её сессии)', !f.znanie, 'отметка сессии v2(2) не учтена');
console.log(`итог: ${ok} из ${ok + bed}` + (bed ? ' — РАСХОЖДЕНИЕ' : ''));
process.exit(bed ? 1 : 0);
