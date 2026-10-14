/**
 * RU: Стенд различает регистрацию Б и набор инструментов, видимый модели. Проверяет dostupnostB при наличии/отсутствии моста и заголовка, сбое моста, затем apply: строки загрузки, однократный окончательный след и повтор неокончательной проверки по шагам. DSH_TEST_APP выбирает установку для dsh-tools. Коды: 0 — совпало, 1 — расхождение, 2 — предмет не загрузился или инструмент не зарегистрировался.
 * EN: This test distinguishes B registration from the tool set visible to the model. Check dostupnostB with/without a bridge and header and with bridge failure, then apply: load messages, a single final trace, and repeated inconclusive checks on later steps. DSH_TEST_APP selects the installation supplying dsh-tools. Exit codes: 0 matches, 1 mismatch, 2 the subject failed to load or the tool was not registered.
 */
// RU: Путь SDK сообщает запускающий, отсутствие пути — слепота.
// EN: The runner supplies the SDK path; an absent path means unavailable evidence.
const app = process.env.DSH_TEST_APP ?? process.env.STEND_APP;
if (!app) { console.log('СЛЕПОТА: DSH_TEST_APP или STEND_APP не задан — SDK-путь неизвестен'); process.exit(2); }
process.argv[1] = app + '/node_modules/@deepseek-ai/dsh/lib/bin.js';
let mod;
try { mod = await import('../src/index.js'); } catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
if (typeof mod.dostupnostB !== 'function') { console.log('СЛЕПОТА: в предмете нет dostupnostB'); process.exit(2); }
let vsego = 0, proshlo = 0;
const proba = (imya, u, p) => { vsego++; if (u) { proshlo++; console.log('  ✅ ' + imya); } else console.log('  ❌ ' + imya + (p ? ' — ' + p : '')); };
const NABOR11 = ['send_message', 'list_agents', 'interrupt_agent', 'schedule_create', 'schedule_list', 'schedule_delete', 'schedule_update', 'pamyat_otnoshenie', 'job_list', 'get_goal', 'update_goal'];
const most = (imena) => ({ toolNames: () => imena, modelToolName: (b) => 'mcp__proba__' + b });
const D = mod.dostupnostB;
console.log('— чистая функция');
let r = D(most(NABOR11), undefined);
proba('мост без pamyat_po_smyslu → окончательно «🔴 НЕ доходит», 11 инструментов', r.okonchatelno && r.stroka.startsWith('🔴 Б НЕ доходит') && r.stroka.includes('выставляет 11'), r.stroka);
r = D(most([...NABOR11, 'pamyat_po_smyslu']), { tools: [] });
proba('мост с ним → «ДОХОДИТ» с именем, как его видит модель; заголовок при мосте не решает', r.okonchatelno && r.stroka.includes('ДОХОДИТ') && r.stroka.includes('mcp__proba__pamyat_po_smyslu'), r.stroka);
r = D(undefined, { tools: [{ name: 'bash' }, { name: 'pamyat_po_smyslu' }] });
proba('моста нет, в заголовке есть → «в заголовке запроса», родной путь', r.okonchatelno && r.stroka.startsWith('Б в заголовке') && !r.stroka.includes('🔴'), r.stroka);
r = D(undefined, { tools: [{ name: 'bash' }] });
proba('моста нет, в заголовке нет → окончательно «🔴 НЕ в заголовке»', r.okonchatelno && r.stroka.startsWith('🔴 Б НЕ в заголовке'), r.stroka);
r = D(undefined, undefined);
proba('моста и заголовка нет → НЕокончательно, граница «из модуля не видно»', !r.okonchatelno && r.stroka.includes('из модуля не видно') && !r.stroka.includes('ДОХОДИТ'), r.stroka);
r = D({ toolNames: () => { throw new Error('сбой'); } }, { tools: [{ name: 'pamyat_po_smyslu' }] });
proba('сбой моста → НЕокончательно и 🔴, не подменяется заголовком', !r.okonchatelno && r.stroka.startsWith('🔴 Б: мост есть'), r.stroka);

console.log('— сквозь apply');
const zhurnal = []; const errOrig = console.error; console.error = (...a) => zhurnal.push(a.join(' '));
async function podnyat(mostUsluga) {
  const s = { uslugi: {}, shov: null, reg: [] };
  const ctx = { provide: (i, o) => { s.uslugi[i] = o; }, on: (sob, fn) => { if (sob === 'agent/pre-step') s.shov = fn; },
    get: (i) => (i === 'tools' ? { register: (t) => s.reg.push(t) } : i === 'mcpBridge' ? mostUsluga : s.uslugi[i]) };
  zhurnal.length = 0;
  mod.apply(ctx, { adres: 'http://127.0.0.1:9/', tajmautMs: 100, vydacha: { vkl: true, koren: 'proba' } });
  for (let i = 0; i < 50 && !s.reg.length && !zhurnal.some((l) => l.includes('НЕ зарегистрирован')); i++) await new Promise((q) => setTimeout(q, 100));
  return s;
}
const shag = (s, zag) => s.shov({ agent: { session: { id: 's1', requestHeader: () => zag } }, signal: { aborted: false } }, async () => ({ kind: 'enter', messages: [] }));
const B = (l) => l.includes('Б') && /доходит|ДОХОДИТ|заголов|не видно|мост есть/.test(l) && !l.includes('скажу на первом шаге');
let s = await podnyat(most(NABOR11));
if (!s.reg.length) { console.error = errOrig; console.log('СЛЕПОТА: инструмент не зарегистрировался — ' + zhurnal.slice(-2).join(' | ')); process.exit(2); }
proba('подъём: строка выдачи не утверждает доставку («скажу на первом шаге хода»)', zhurnal.some((l) => l.includes('Б — инструмент pamyat_po_smyslu (доходит ли до модели — скажу на первом шаге хода)')), zhurnal.find((l) => l.includes('Б — инструмент')));
proba('регистрация названа регистрацией, не доставкой', zhurnal.some((l) => l.includes('зарегистрирован в платформе — это ещё не доставка модели')), zhurnal.find((l) => l.includes('зарегистрирован')));
proba('до первого шага строки о доставке нет', !zhurnal.some(B), zhurnal.filter(B).join(' | '));
await shag(s, undefined); await shag(s, undefined);
proba('первый шаг, мост без инструмента → одна строка «🔴 Б НЕ доходит», на втором шаге не повторяется', zhurnal.filter(B).length === 1 && zhurnal.filter(B)[0].includes('🔴 Б НЕ доходит'), zhurnal.filter(B).join(' | '));
s = await podnyat(most([...NABOR11, 'pamyat_po_smyslu'])); await shag(s, undefined);
proba('мост с инструментом → «Б ДОХОДИТ до модели … mcp__proba__pamyat_po_smyslu»', zhurnal.filter(B).length === 1 && zhurnal.filter(B)[0].includes('ДОХОДИТ') && zhurnal.filter(B)[0].includes('mcp__proba__pamyat_po_smyslu'), zhurnal.filter(B).join(' | '));
s = await podnyat(undefined); await shag(s, undefined); await shag(s, undefined);
proba('моста нет, заголовка нет → граница один раз, «ДОХОДИТ» не сказано', zhurnal.filter(B).length === 1 && zhurnal.filter(B)[0].includes('из модуля не видно'), zhurnal.filter(B).join(' | '));
await shag(s, { tools: [{ name: 'pamyat_po_smyslu' }] });
proba('следующий шаг с заголовком → окончательная строка «в заголовке запроса»', zhurnal.filter(B).length === 2 && zhurnal.filter(B)[1].startsWith('[') && zhurnal.filter(B)[1].includes('Б в заголовке запроса'), zhurnal.filter(B).join(' | '));
console.error = errOrig;
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
