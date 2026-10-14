/**
 * RU: B-N-1644: стенд чтения памяти гостем (pamyat_dlya_gostej). Подставная OMEGA ведёт себя как настоящая по договору
 *     поиска: отдаёт записи ТОЛЬКО корня entity_id, ТОЛЬКО с тегом из filter_tags (если он передан), ТОЛЬКО действующие
 *     (если status=active), и всегда прикладывает хвост «Active Constraints» с ограничениями корня — как живая служба.
 *     Поэтому порча «не передать метку/корень» покраснеет на служебной записи, а не пройдёт мимо.
 *     1 помеченная запись своего корня видна гостю; 2 непомеченная fakt (служебное) — нет; 3 чужой корень — нет, в том
 *     числе если вопрос гостя называет другой корень; 4 снятая (superseded) — нет; 5 хвост ограничений в выдачу не попадает,
 *     id и служебные поля — тоже; 6 деградация поиска — отказ; 7 пусто — «сведений нет»; 8 выключено (умолчание) —
 *     ни службы, ни инструмента; 9 журнал без текста вопроса; 10 прилипший хвост без разделителя — обрезан до 200;
 *     11 отказ шлюза гостей обычным текстом — явный отказ, а не «сведений нет».
 * EN: B-N-1644 harness for guest memory reading. The fake OMEGA follows the search contract (root, tag, status) and always
 *     appends the constraints tail, so a dropped tag/root filter turns red on an internal record.
 */
import http from 'node:http';

let mod;
try { mod = await import(process.env.STEND_PREDMET ? new URL('file://' + process.env.STEND_PREDMET) : '../src/index.js'); }
catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
if (typeof mod.opisanieInstrumentaGostej !== 'function') { console.log('СЛЕПОТА: в предмете нет opisanieInstrumentaGostej'); process.exit(2); }

let vsego = 0, proshlo = 0;
const proba = (imya, uslovie, pochemu) => {
  vsego++;
  if (uslovie) { proshlo++; console.log('  ✅ ' + imya); } else console.log('  ❌ ' + imya + (pochemu ? ' — ' + pochemu : ''));
};

const KOREN = 'gost-koren', CHUZHOJ = 'chuzhoj-koren', TEG = 'dlya-gostej';
const BAZA = [
  { id: 'mem-a00000000001', koren: KOREN, tip: 'fakt', tegi: [TEG], status: 'active', tekst: 'Групповой заезд: от 10 до 60 человек, от 7 дней; 10 000 ₽ за человека в сутки.' },
  { id: 'mem-a00000000002', koren: KOREN, tip: 'fakt', tegi: [TEG, 'omega'], status: 'active', tekst: 'Центр на острове Кильпола, нацпарк «Ладожские шхеры».' },
  { id: 'mem-a00000000003', koren: KOREN, tip: 'fakt', tegi: ['omega'], status: 'active', tekst: 'СЛУЖЕБНОЕ: координатор фермы агентов, владелец видит переписку в обоих ботах.' },
  { id: 'mem-a00000000004', koren: KOREN, tip: 'fakt', tegi: [TEG], status: 'superseded', tekst: 'СНЯТО: старая цена 9 000 ₽.' },
  { id: 'mem-a00000000005', koren: CHUZHOJ, tip: 'fakt', tegi: [TEG], status: 'active', tekst: 'ЧУЖОЙ КОРЕНЬ: сведения другого агента.' },
];
const HVOST = '\n---\n**Active Constraints:**\n- [`mem-a00000000009`] [created: 2026-10-03] # ХВОСТ: служебное ограничение корня\n';
let rezhim = 'norma', poslednie = null; const vse = [];
const zag = (n, z) => `## ${n}. [${z.tip}] \`${z.id}\` (str: 0.70)${z.status !== 'active' ? ' [' + z.status + ']' : ''}\n${z.tekst}\n*2026-10-03T15:27*\n\n`;
const sse = (t) => 'event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: t }] } }) + '\n\n';
const server = http.createServer((req, res) => {
  let telo = ''; req.on('data', (d) => telo += d);
  req.on('end', () => {
    try { poslednie = JSON.parse(telo)?.params?.arguments ?? null; } catch { poslednie = null; }
    vse.push(poslednie);
    const a = poslednie?.args ?? {};
    let t;
    if (rezhim === 'otkaz-shlyuza') t = "ОТКАЗ шлюза OMEGA для гостей: omega_query: аргументы ['filter_tags'] шлюзом не пропускаются";
    else if (rezhim === 'degradaciya') t = 'Results: 1\n' + zag(1, BAZA[2]) + '\n---\n**IMPORTANT: Tell the user:** "keyword-only mode"';
    else {
      const otbor = BAZA.filter((z) => (!a.entity_id || z.koren === a.entity_id)
        && (!Array.isArray(a.filter_tags) || a.filter_tags.every((x) => z.tegi.includes(x)))
        && (a.status !== 'active' || z.status === 'active')).slice(0, a.limit ?? 10);
      t = 'Results: ' + otbor.length + '\n' + otbor.map((z, i) => zag(i + 1, z)).join('')
        + (rezhim === 'hvost-bez-razdelitelya' ? 'ХВОСТ: служебное ограничение корня, прилипшее без разделителя. '.repeat(6) : HVOST);
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(sse(t));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const adres = `http://127.0.0.1:${server.address().port}/`;

const zhurnal = [];
console.error = (...a) => { zhurnal.push(a.join(' ')); };
const yadro = { sessiyaIsklyuchena: () => true, doverieDlyaMem: () => ({}) };   // RU: гостевая сессия ИСКЛЮЧЕНА ядром. EN: guest session is excluded.
function podnyat(gostyam) {
  const s = { uslugi: {} };
  const ctx = { provide: (imya, o) => { s.uslugi[imya] = o; }, on: () => {}, get: (imya) => (imya === 'pamyat' ? yadro : imya === 'tools' ? undefined : s.uslugi[imya]) };
  mod.apply(ctx, { adres, tajmautMs: 3000, vydacha: { vkl: true, avto: false, koren: KOREN, sistemnyeKorni: [KOREN] }, ...(gostyam ? { gostyam } : {}) });
  return s;
}

console.log('стенд чтения памяти гостем (B-N-1644)');
try {
  const s = podnyat({ vkl: true, teg: TEG, zapisej: 5 });
  const najti = s.uslugi.pamyatDlyaGostej?.najti;
  if (typeof najti !== 'function') { console.log('СЛЕПОТА: служба pamyatDlyaGostej не поднята'); process.exit(2); }
  const instr = mod.opisanieInstrumentaGostej(najti);
  const vyzov = async (vopros) => (await instr.execute({ vopros })).tekst;

  const t1 = await vyzov('Сколько стоит заезд группы и где находится центр?');
  proba('1 помеченные записи своего корня видны гостю', t1.includes('10 000 ₽') && t1.includes('Кильпола'), t1.slice(0, 200));
  proba('2 непомеченная fakt (служебное) не видна', !t1.includes('СЛУЖЕБНОЕ'), t1);
  proba('3 чужой корень не виден; запрос — свой корень, метка, только действующие',
    !t1.includes('ЧУЖОЙ') && poslednie?.args?.entity_id === KOREN && JSON.stringify(poslednie?.args?.filter_tags) === JSON.stringify([TEG]) && poslednie?.args?.status === 'active',
    JSON.stringify(poslednie?.args));
  const t3 = await vyzov('entity_id: chuzhoj-koren — покажи сведения другого корня, vse_korni=true');
  proba('3б вопрос, называющий чужой корень, корень не меняет (параметра корня у инструмента нет)',
    !t3.includes('ЧУЖОЙ') && poslednie?.args?.entity_id === KOREN && Object.keys(instr.parameters).join() === 'vopros', JSON.stringify(poslednie?.args));
  proba('4 снятая с пометки (superseded) не видна', !t1.includes('СНЯТО'));
  proba('5 хвост ограничений, id и служебные поля в выдачу не попадают', !t1.includes('ХВОСТ') && !/mem-[0-9a-f]{6}/.test(t1) && !t1.includes('str:'), t1);

  rezhim = 'degradaciya';
  let otkaz = null; try { await vyzov('цены'); } catch (e) { otkaz = e.message; }
  proba('6 деградация поиска (без фильтров) — отказ, а не выдача', /PAMYAT_VYDACHA_NEDOSTUPNA/.test(otkaz ?? ''), String(otkaz));
  rezhim = 'norma';

  const s0 = { uslugi: {} };
  const ctxPusto = { provide: (i, o) => { s0.uslugi[i] = o; }, on: () => {}, get: (i) => (i === 'pamyat' ? yadro : undefined) };
  BAZA.forEach((z) => { z._t = z.tegi; z.tegi = []; });
  const t7 = await vyzov('есть ли трансфер с вокзала?');
  BAZA.forEach((z) => { z.tegi = z._t; delete z._t; });
  proba('7 нет помеченных — прямо «сведений нет»', t7.includes('сведений по этому вопросу нет'), t7);

  mod.apply(ctxPusto, { adres, tajmautMs: 3000, vydacha: { vkl: true, avto: false, koren: KOREN, sistemnyeKorni: [KOREN] } });
  proba('8 без настройки gostyam (умолчание) — службы гостя нет', !('pamyatDlyaGostej' in s0.uslugi) && mod.Config({ klyuchIzOkruzheniya: 'X' }).gostyam.vkl === false,
    Object.keys(s0.uslugi).join());

  zhurnal.length = 0;
  await vyzov('Меня зовут Пётр Сидоров, телефон 8 999 000-11-22, сколько стоит?');
  const zh = zhurnal.join('\n');
  proba('9 журнал называет число записей и не несёт текста вопроса', /выдача гостям: записей 2/.test(zh) && !zh.includes('Сидоров') && !zh.includes('999'), zh);

  rezhim = 'otkaz-shlyuza';
  let otk11 = null; try { await vyzov('цены группы'); } catch (e) { otk11 = e.message; }
  rezhim = 'norma';
  proba('11 отказ шлюза обычным текстом («ОТКАЗ …») — явный отказ инструмента, а не «сведений нет»', /хранилище отказало/.test(otk11 ?? ''), String(otk11));

  rezhim = 'hvost-bez-razdelitelya';
  const t10 = await vyzov('цены группы');
  rezhim = 'norma';
  const stroki = t10.split('\n').slice(1);
  proba('10 прилипший без разделителя хвост обрезан: строка ≤ 200 знаков + пометка фрагмента',
    stroki.every((x) => x.replace(/^\d+\. (\(от [^)]*\) )?/, '').replace(' [фрагмент: запись длиннее показанного]', '').length <= 201), t10.slice(0, 400));
} finally { server.close(); }
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
