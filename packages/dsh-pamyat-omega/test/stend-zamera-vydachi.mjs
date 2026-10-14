/**
 * RU: A-N-1709 (Искра, 07.10.2026): у каждой выдачи Б строка исхода несёт время и охват — «… · N мс, свой корень|все корни,
 *     предел M мс», и у «подано», и у «пусто», и у отказа по пределу. Без этого отказ «TimeoutError» (Заря 07.10 01:28Z,
 *     Аврора 05.10 05:22Z) не с чем сравнить: успешные строки есть, но времени в них нет.
 *     Подставная OMEGA — HTTP на 127.0.0.1 с задержкой ответа; предел выдачи в стенде 300 мс.
 *     Коды: 0 — годно; 1 — расхождение; 2 — слепота. ЧЕГО НЕ ЛОВИТ: настоящую OMEGA и её очередь запросов.
 * EN: A-N-1709 stand: every B outcome line carries duration and scope.
 */
import http from 'node:http';
const PUT = process.env.STEND_OMEGA ?? '../src/index.js';
let mod;
try { mod = await import(PUT); } catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
let vsego = 0, proshlo = 0;
const proba = (imya, u, p) => { vsego++; if (u) { proshlo++; console.log('  ✅ ' + imya); } else console.log('  ❌ ' + imya + (p ? ' — ' + p : '')); };

let zaderzhka = 0, otvet = '';
const sse = (t) => 'event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: t }] } }) + '\n\n';
const server = http.createServer((req, res) => { req.on('data', () => {}); req.on('end', () => setTimeout(() => {
  if (res.destroyed) return; res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(sse(otvet)); }, zaderzhka)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const adres = `http://127.0.0.1:${server.address().port}/`;
const ODNA = 'Results: 1 (confidence: medium)\n## 1. [lesson_learned] `mem-aaaa00000001` (str: 0.70)\nзнание про предел выдачи по смыслу\n*'
  + new Date(Date.now() - 3600e3).toISOString().slice(0, 16) + '*\n\n';

const zhurnal = []; const errOrig = console.error; console.error = (...a) => zhurnal.push(a.join(' '));
const yadro = { sessiyaIsklyuchena: () => false, doverieDlyaMem: (ids) => Object.fromEntries(ids.map((i) => [i, { itog: { sostoyanie: 'obychnaya', stroka: '' }, zapisi: [] }])) };
const s = { uslugi: {} };
mod.apply({ provide: (i, o) => { s.uslugi[i] = o; }, on: () => {}, get: (i) => (i === 'pamyat' ? yadro : i === 'tools' ? undefined : s.uslugi[i]) },
  { adres, tajmautMs: 3000, vydacha: { vkl: true, koren: 'proba', tajmautMs: 300, sistemnyeKorni: ['proba', 'drugoj'] } });
const najti = s.uslugi.pamyatPoSmyslu?.najti;
if (!najti) { console.error = errOrig; console.log('СЛЕПОТА: служба pamyatPoSmyslu не поднялась'); server.close(); process.exit(2); }
const stroka = () => zhurnal.filter((l) => /выдача Б/.test(l)).at(-1) ?? '';
// RU: A-N-1727: у поиска по всем корням свой предел — max(300, 600 × 2 корня) = 1200 мс; у своего корня — vydacha.tajmautMs 300.
// EN: A-N-1727: all-root search has its own limit — max(300, 600 × 2 roots) = 1200 ms.
const ZAMER = /· \d+ мс, (свой корень, предел 300|все корни, предел 1200) мс/;

otvet = ODNA; zaderzhka = 50; await najti('знание про предел', { rezhim: 'po-zaprosu' });
proba('подано, свой корень: «· N мс, свой корень, предел 300 мс»', /подано 1/.test(stroka()) && ZAMER.test(stroka()) && stroka().includes('свой корень'), stroka());
otvet = 'Results: 0\n'; zaderzhka = 20; await najti('пусто', { rezhim: 'po-zaprosu', vseKorni: true });
proba('пусто, все корни: «подано 0 … · N мс, все корни»', /подано 0/.test(stroka()) && ZAMER.test(stroka()) && stroka().includes('все корни'), stroka());
const ms = Number((stroka().match(/· (\d+) мс/) || [])[1]);
proba('время — замер, а не константа: «пусто» с задержкой 20 мс показывает ≥ 20 и < 300', ms >= 20 && ms < 300, String(ms));
otvet = ODNA; zaderzhka = 1500; await najti('долго', { rezhim: 'po-zaprosu', vseKorni: true });
proba('отказ по пределу: «🔴 выдача Б не подана · N мс, все корни, предел 1200 мс: …»', stroka().startsWith('[') && stroka().includes('🔴 выдача Б не подана') && ZAMER.test(stroka()), stroka());

console.error = errOrig; server.close();
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
