// RU: Проверяем vidnaVOmega(k) → true | false | null через настоящее ядро с Context и временной базой, настоящий apply dsh-pamyat-omega и транспорт к подставной MCP-точке с форматом bridge.py. Коды: 0 — успех, 1 — расхождение, 2 — предмет не загрузился, метод отсутствует или исправный контроль не виден.
// EN: Test vidnaVOmega(k) → true | false | null through the real core with Context and a temporary database, real dsh-pamyat-omega apply, and transport to a fake MCP endpoint using bridge.py format. Codes: 0 success, 1 mismatch, 2 subject failed to load, method missing, or healthy control invisible.
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
let Context, apply, name, Config, otkrytHranilishche, sloj;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import('../src/index.js'));
  ;({ otkrytHranilishche } = await import('../src/hranilishche.js'));
  sloj = await import('dsh-pamyat-omega');
} catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.code ?? '') + ' ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
const kat = mkdtempSync(join(tmpdir(), 'stend-vidnosti-'));
process.on('exit', () => rmSync(kat, { recursive: true, force: true }));
let ok = 0, bed = 0;
const proba = (imya, pol, zh) => { const r = JSON.stringify(pol) === JSON.stringify(zh); r ? ok++ : bed++;
  console.log(`  ${r ? 'ok  ' : 'FAIL'} ${imya}: получили ${JSON.stringify(pol)}, ждали ${JSON.stringify(zh)}`); };
// RU: Подставная точка MCP.
// EN: Fake MCP endpoint.
const zap = (n, id, tekst, status = '') => `## ${n}. [lesson_learned] \`${id}\` (str: 0.70)${status ? ' [' + status + ']' : ''}\n${tekst}\n*2026-09-29T12:00*\n\n`;
let otvet = '', rezhim = 'ok', zaprosov = 0, args = null;
const sse = (t) => 'event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: t }] } }) + '\n\n';
const server = http.createServer((req, res) => { let telo = ''; req.on('data', (d) => telo += d); req.on('end', () => {
  zaprosov++; try { args = JSON.parse(telo)?.params?.arguments ?? null; } catch { args = null; }
  if (rezhim === 'oshibka') { res.writeHead(500); res.end('boom'); return; }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(sse(rezhim === 'degr' ? 'keyword-only mode: результаты без смысла' : otvet)); }); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const adres = `http://127.0.0.1:${server.address().port}/`;
const errOrig = console.error; console.error = () => {};
// RU: Настоящий apply слоя с минимальным ctx.
// EN: Real layer apply with a minimal ctx.
const uslugi = {};
// RU: Слой (с 1.1.32) берёт политику ядра через ctx.get('pamyat') при каждом вызове: отдаём ему службу ядра pm (объявлена ниже,
//     читается в момент вызова). Без неё слой закрывается PAMYAT_POLITIKA_NEDOSTUPNA, и исправный случай даёт null (B-N-1588).
// EN: The layer (since 1.1.32) reads core policy via ctx.get('pamyat') on every call: give it the core service pm (declared below,
//     read at call time). Without it the layer closes with PAMYAT_POLITIKA_NEDOSTUPNA and the healthy case yields null (B-N-1588).
sloj.apply({ provide: (i, o) => { uslugi[i] = o; }, on: () => {}, get: (n) => (n === 'pamyat' ? pm : undefined) }, { adres, tajmautMs: 3000 });
const dolgoNast = uslugi.pamyatDolgovremennaya;
// RU: Настоящее ядро.
// EN: Real core.
const putBazy = join(kat, 'p.db');
async function podnyat(dolgo) {
  const koren = new Context();
  koren.provide('logger'); koren.logger = { error: () => {} };
  koren.provide('pamyatDolgovremennaya'); koren.pamyatDolgovremennaya = dolgo;
  koren.plugin({ name, apply }, new Config({ putBazy, otvechayushchegoNet: true, agent: 'proba-uzel' }));
  await new Promise((r) => setTimeout(r, 60));
  return koren.pamyat;
}
const pm = await podnyat(dolgoNast);
if (typeof pm?.vidnaVOmega !== 'function') { console.error = errOrig; console.log('СЛЕПОТА: у службы ядра нет vidnaVOmega (так в бою до правки)'); server.close(); process.exit(2); }
const h = otkrytHranilishche(putBazy);
const T = (x) => `Урок ${x}: метки выпуска ставят после монтажа, ворота выпуска проверяют сумму по составу, код ноль ${x} подробности ниже.`;
const zid = (klass, x, agent = 'proba-uzel') => { const r = h.zapisat({ agent, klass, soderzhim: T(x) }); return Number(typeof r === 'object' ? r.id : r); };
const DL = (x) => (T(x) + ' ').repeat(4) + 'конец ' + x;   /* RU: k длиннее 200 символов: превью обрезается.
 * EN: k exceeds 200 characters: the preview is truncated.
 */
const kL = h.zapisat({ agent: 'proba-uzel', klass: 'urok', soderzhim: DL('L') }); const kLid = Number(typeof kL === 'object' ? kL.id : kL);
const k1 = zid('urok', 'A'), k2 = zid('urok', 'B'), k3 = zid('urok', 'C'), k4 = zid('reshenie', 'D'), k5 = zid('urok', 'E'), k8 = zid('urok', 'H', 'chuzhoj');
h.svyazat({ zapis_id: k1, mem_id: 'mem-aaaa00000001', kak: 'dostavka' });
const otm = zid('reshenie', 'D2'); h.ustanovitOtnoshenie({ agent: 'proba-uzel', id: otm, vid: 'otmenyaet', k: k4, klassyZnaniy: ['reshenie', 'urok'] });
// RU: Исправный контроль должен вернуть true.
// EN: The healthy control must return true.
otvet = 'Results: 2\n' + zap(1, 'mem-aaaa00000001', 'другой текст вовсе') + zap(2, 'mem-bbbb00000002', 'ещё');
// RU: Свидетель (A-N-1623): у исправного случая, давшего не true, две причины — (1) стенд/слой: политика ядра не дошла
//     до слоя omega, слой отказал (B-N-1588, так было на 1.1.103); (2) ядро: сломана ветка связи vidnaVOmega. Различитель —
//     прямой вызов слоя aktivnye тем же текстом и тем же подставным ответом ДО vidnaVOmega: слой отдал mem-aaaa00000001 ⇒
//     политика дошла, стенд зрячий, и не-true — дефект ядра (код 1); иначе — слепота стенда/слоя (код 2). Обе причины и
//     значение свидетеля печатаются в обоих исходах. Не ловит: поломку, при которой слой отдаёт запись ядру иначе, чем
//     прямому вызову (свидетель зовёт тот же метод с тем же текстом, но не изнутри ядра).
// EN: Witness (A-N-1623): a healthy case that is not true has two causes — (1) harness/layer: core policy did not reach the
//     omega layer (B-N-1588); (2) core: the vidnaVOmega link branch is broken. The discriminator is a direct layer aktivnye call
//     with the same text and fake answer BEFORE vidnaVOmega: layer returned mem-aaaa00000001 => harness sighted, non-true is a
//     core defect (code 1); otherwise harness/layer blindness (code 2). Both causes and the witness value are printed.
const svid = await dolgoNast.aktivnye({ tekst: T('A'), koren: 'proba-uzel' });
const politikaDoshla = !svid?.otkaz && Array.isArray(svid?.zapisi) && svid.zapisi.some((x) => x.id === 'mem-aaaa00000001');
const zrya = await pm.vidnaVOmega(k1);
if (zrya !== true) {
  console.error = errOrig;
  const dve = 'причины две: (1) стенд/слой — политика ядра не дошла до слоя omega; (2) ядро — ветка связи vidnaVOmega';
  const svidetel = 'свидетель «слой omega отдал mem-aaaa00000001»: ' + (politikaDoshla ? 'да' : 'нет — ' + String(svid?.otkaz ?? 'записи нет в выдаче').slice(0, 120));
  console.log((politikaDoshla ? 'РАСХОЖДЕНИЕ (ЯДРО)' : 'СЛЕПОТА (СТЕНД/СЛОЙ)') + ': исправный случай (связь среди активных) дал ' + zrya + ' · ' + dve + ' · ' + svidetel);
  server.close(); process.exit(politikaDoshla ? 1 : 2);
}
console.error = errOrig;
console.log('  свидетель «слой omega отдал mem-aaaa00000001»: да (политика ядра дошла до слоя)');
proba('В1 связь svyaz_omega → mem среди активных → true', zrya, true);
otvet = 'Results: 2\n' + zap(1, 'mem-cccc00000003', T('B')) + zap(2, 'mem-dddd00000004', 'постороннее');
proba('В2 связи нет, короткая k целиком в НЕобрезанном превью → true', await pm.vidnaVOmega(k2), true);
proba('В3 связи нет, начала среди активных нет → false', await pm.vidnaVOmega(k3), false);
const doV4 = zaprosov; const v4 = await pm.vidnaVOmega(k4);
proba('В4 k отменён (otmenyaet) → false БЕЗ похода в OMEGA', [v4, zaprosov - doV4], [false, 0]);
otvet = 'Results: 1\n' + zap(1, 'mem-eeee00000005', T('E').slice(0, 200) + '...', 'superseded');
proba('В5 двойник только superseded → false (запись будет написана)', await pm.vidnaVOmega(k5), false);
rezhim = 'degr'; proba('В6 деградация поиска → null (не «не видна»)', await pm.vidnaVOmega(k2), null);
rezhim = 'oshibka'; proba('В7 сервер отказал → null', await pm.vidnaVOmega(k2), null); rezhim = 'ok';
proba('В8 запись чужого агента → false', await pm.vidnaVOmega(k8), false);
const pmStaryj = await (async () => { const uslugiA20 = { ...dolgoNast }; delete uslugiA20.aktivnye; return podnyat(uslugiA20); })();
proba('В9 у слоя нет aktivnye (слой старше a21) → null', await pmStaryj.vidnaVOmega(k2), null);
otvet = 'Results: 0\n'; await pm.vidnaVOmega(k3);
proba('В10 запрос в OMEGA: status=active, entity_id=свой корень', [args?.args?.status, args?.args?.entity_id], ['active', 'proba-uzel']);
// RU: Почти-дубль с общим началом и другим концом не должен делать k видимой.
// EN: A near-duplicate with the same prefix but a different ending must not make k visible.
otvet = 'Results: 1\n' + zap(1, 'mem-ffff00000011', (T('L') + ' ').repeat(2).slice(0, 200) + '...');
proba('В11 длинная k, среди активных только почти-дубль с тем же началом (превью обрезано) → null («не знаю»), НЕ true', await pm.vidnaVOmega(kLid), null);
otvet = 'Results: 1\n' + zap(1, 'mem-ffff00000012', DL('L').slice(0, 200) + '...');
proba('В12 длинная k без связи, превью самой k обрезано → null (граница: отличить от почти-дубля нечем)', await pm.vidnaVOmega(kLid), null);
otvet = 'Results: 1\n' + zap(1, 'mem-ffff00000013', T('C') + ' и ещё хвост другого предмета');
proba('В13 короткая k, превью другой записи начинается как k, но длиннее (не обрезано) → false', await pm.vidnaVOmega(k3), false);
server.close();
console.log(`\nstend-vidnosti-omega: ok=${ok} FAIL=${bed}`);
process.exit(bed ? 1 : 0);
