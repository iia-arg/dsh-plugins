/**
 * RU: A-N-1727 (Искра, 07.10.2026): выдача Б по всем корням.
 *     (1) предел растёт с числом корней — max(предел выдачи, 600 мс × N): служба OMEGA sadik отвечает по очереди, и запрос
 *         последнего корня ждёт все прежние. Подставная служба здесь отвечает строго по очереди, 300 мс на запрос: 11 корней —
 *         3,3 с, больше прежних 3000 мс. ⚠️ Это упрощение: настоящая служба делит время между запросами, все кончаются вместе,
 *         и при перегрузке обрываются почти все сразу (замер по копии 07.10: 4 поиска разом — 1 частичный из 11 корней и 3 отказа).
 *     (2) отказ части корней — частичная выдача с пометкой «НЕПОЛНО» и именами немых корней в строке журнала и в ответе модели;
 *         деградация любого корня и отказ всех корней — по-прежнему отказ всей выдачи.
 *     (3) одна константа предела: строка журнала называет то, что стоит на связи (свой корень — vydacha.tajmautMs или 3000).
 *     Коды: 0 — годно; 1 — расхождение; 2 — слепота. ЧЕГО НЕ ЛОВИТ: настоящую службу OMEGA, её холодный старт и чужие
 *     запросы в её очереди; верность самого числа 600 мс — это замер, а не проба.
 * EN: A-N-1727 stand: all-root retrieval — limit grows with root count, partial delivery on some failures, one limit constant.
 */
import http from 'node:http';
const PUT = process.env.STEND_OMEGA ?? '../src/index.js';
let mod;
try { mod = await import(PUT); } catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
let vsego = 0, proshlo = 0;
const proba = (imya, u, p) => { vsego++; if (u) { proshlo++; console.log('  ✅ ' + imya); } else console.log('  ❌ ' + imya + (p ? ' — ' + String(p).slice(0, 300) : '')); };

const KORNI = ['alfa', 'avrora', 'beta', 'gamma', 'iskra', 'marc', 'petrovich', 'sadik', 'spartak', 'zarya'];
const GOST = 'varvara';
const SLUZHBA_MS = 300;
let nemye = new Set(), degr = new Set();
const sse = (t) => 'event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: t }] } }) + '\n\n';
const nomer = (k) => String(KORNI.concat(GOST).indexOf(k) + 1).padStart(12, '0');   // RU: id OMEGA — только шестнадцатеричный · EN: hex-only id
const zapis = (k) => 'Results: 1 (confidence: medium)\n## 1. [lesson_learned] `mem-' + nomer(k) + '` (str: 0.70)\nзнание-' + k + ' ' + k + '-раз ' + k + '-два ' + k + '-три'   // RU: тексты разные по словам — иначе отбор схлопнет их как дубли · EN: distinct words, else dedup
  + '\n*' + new Date(Date.now() - 3600e3).toISOString().slice(0, 16) + '*\n\n';
// RU: Очередь: следующий запрос начинает обслуживаться, когда кончился прежний — как одна служба OMEGA. · EN: one-at-a-time service.
let svobodnaS = 0;
const server = http.createServer((req, res) => {
  let telo = ''; req.on('data', (c) => { telo += c; });
  req.on('end', () => {
    let k = '?'; try { k = JSON.parse(telo).params.arguments.args.entity_id; } catch {}
    if (nemye.has(k)) { res.destroy(); return; }
    const nachalo = Math.max(Date.now(), svobodnaS); svobodnaS = nachalo + SLUZHBA_MS;
    setTimeout(() => {
      if (res.destroyed) return;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(sse(degr.has(k) ? 'keyword-only mode\n' + zapis(k) : zapis(k)));
    }, svobodnaS - Date.now());
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const adres = `http://127.0.0.1:${server.address().port}/`;

const zhurnal = []; const errOrig = console.error; console.error = (...a) => zhurnal.push(a.join(' '));
const yadro = { sessiyaIsklyuchena: () => false, doverieDlyaMem: (ids) => Object.fromEntries(ids.map((i) => [i, { itog: { sostoyanie: 'obychnaya', stroka: '' }, zapisi: [] }])) };
function podnyat(vydacha) {
  const s = { uslugi: {} };
  mod.apply({ provide: (i, o) => { s.uslugi[i] = o; }, on: () => {}, get: (i) => (i === 'pamyat' ? yadro : i === 'tools' ? undefined : s.uslugi[i]) },
    { adres, tajmautMs: 10000, vydacha: { vkl: true, koren: 'iskra', avto: false, sistemnyeKorni: KORNI, gostevyeKorni: [GOST], gosti: 'obertka', ...vydacha } });
  return s.uslugi.pamyatPoSmyslu?.najti;
}
const najti = podnyat({});
if (!najti || typeof mod.opisanieInstrumentaVydachi !== 'function') { console.error = errOrig; console.log('СЛЕПОТА: служба pamyatPoSmyslu или инструмент Б не поднялись'); server.close(); process.exit(2); }
const instrument = mod.opisanieInstrumentaVydachi(najti);
const stroka = () => zhurnal.filter((l) => /выдача Б/.test(l)).at(-1) ?? '';
const vyzov = async (args) => { try { return { tekst: (await instrument.execute(args, { agent: { id: 'a2a-proba' } })).tekst }; } catch (e) { return { oshibka: String(e?.message ?? e) }; } };
const sbros = () => { nemye = new Set(); degr = new Set(); svobodnaS = 0; };

console.log('── (1) очередь службы: 11 корней × 300 мс = 3,3 с ──');
sbros(); let t0 = Date.now(); let o = await vyzov({ zadacha: 'предел', vse_korni: true }); const ms1 = Date.now() - t0;
proba('все 11 корней ответили, хотя очередь дольше 3000 мс (≈3,3 с)', !o.oshibka && (o.tekst.match(/знание-/g) || []).length === 11 && ms1 >= 3000, o.oshibka ?? ms1 + ' мс');
proba('строка журнала: «все корни, предел 6600 мс» (= max(3000, 600 × 11))', /все корни, предел 6600 мс/.test(stroka()), stroka());
proba('полная выдача без пометки «НЕПОЛНО»', !/НЕПОЛНО/.test(stroka()) && !/НЕПОЛНО/.test(o.tekst ?? ''), stroka());

console.log('── (2) немой корень gamma ──');
sbros(); nemye.add('gamma'); o = await vyzov({ zadacha: 'предел', vse_korni: true });
proba('выдача подана частично: 10 записей, записи gamma нет', !o.oshibka && (o.tekst.match(/знание-/g) || []).length === 10 && !/знание-gamma/.test(o.tekst), o.oshibka ?? o.tekst);
proba('ответ модели первой строкой: «⚠️ НЕПОЛНО: поиск не состоялся по корням gamma (из 11)»', /^⚠️ НЕПОЛНО: поиск не состоялся по корням gamma \(из 11\)/.test(o.tekst ?? ''), (o.tekst ?? o.oshibka).split('\n')[0]);
proba('строка журнала: «⚠️ НЕПОЛНО: ответили 10 из 11 корней, нет: gamma (первый отказ: … корень gamma …)»', /⚠️ НЕПОЛНО: ответили 10 из 11 корней, нет: gamma \(первый отказ: поиск не состоялся \(корень gamma\)/.test(stroka()), stroka());

console.log('── (3) деградация одного корня и отказ всех ──');
sbros(); degr.add('beta'); o = await vyzov({ zadacha: 'предел', vse_korni: true });
proba('деградация корня beta — отказ ВСЕЙ выдачи', !!o.oshibka && /деградировал/.test(o.oshibka) && /🔴 выдача Б не подана/.test(stroka()), o.oshibka ?? o.tekst);
sbros(); KORNI.concat(GOST).forEach((k) => nemye.add(k)); o = await vyzov({ zadacha: 'предел', vse_korni: true });
proba('все 11 немы — отказ «не ответил ни один из 11 корней»', !!o.oshibka && /не ответил ни один из 11 корней/.test(o.oshibka), o.oshibka ?? o.tekst);

console.log('── (4) свой корень: предел — одна константа ──');
sbros(); o = await vyzov({ zadacha: 'предел' });
proba('свой корень без vydacha.tajmautMs: «свой корень, предел 3000 мс»', !o.oshibka && /свой корень, предел 3000 мс/.test(stroka()), stroka());
const najti2 = podnyat({ tajmautMs: 200 });
sbros(); await najti2('предел', { rezhim: 'po-zaprosu' });
proba('vydacha.tajmautMs 200 и служба 300 мс: отказ по пределу, строка называет «предел 200 мс» — тот, что стоит на связи', /🔴 выдача Б не подана · \d+ мс, свой корень, предел 200 мс/.test(stroka()), stroka());

console.error = errOrig; server.close();
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
