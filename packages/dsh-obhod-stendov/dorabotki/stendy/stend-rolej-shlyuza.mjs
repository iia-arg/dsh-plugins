// БОЕВОЙ стенд ролей DSH 0.2.0 в шлюзе подписки (B-N-1204, 30.09.2026, Аврора; из стенда перехода B-N-738 stend-rolej-0.2.0).
// ЗАЧЕМ. Платформа 0.2 шлёт подсказку ролью system, результаты инструментов ролью tool, реестр инструментов ролью developer;
// шлюз (rolyDsh02VFormu011) приводит их к форме 0.1.1, которую понимает SDK. Сломай приведение — и подсказка поедет речью
// пользователя, результаты инструментов — в prompt, ключ беседы и отпечаток resume разойдутся (кэш-промах на каждом ходе).
// Ответы при этом останутся похожими — снаружи не видно. Шлюз правят часто (0.4.13 → 0.4.17 за двое суток).
// ИНВАРИАНТ (без основы): беседа в форме 0.2.0 даёт В ТОМ ЖЕ предмете то же тело к SDK, что та же беседа в форме 0.1.1.
// Стенд перехода сравнивал с основой 0.4.13 — после перехода основы нет, сравнение внутри предмета.
// Запуск: node stend-rolej-shlyuza.mjs [gateway.mjs] (умолчание /opt/claude-oauth/gateway.mjs; каталог закрыт iskra — строка «@root»).
// gateway.mjs НЕ импортируется (импорт поднимает сервер): функции и строка развилки вырезаются из текста и исполняются
// с подставными log/POSTAVSHCHIK — проверяется код предмета.
// Коды: 0 все зелёные · 1 есть красные · 2 слепота (функции/развилка не вырезаны — стенд не годен).
// ЧЕГО НЕ ЛОВИТ: что SDK делает с телом дальше; ветку «полная история/хвост» planZaprosa при переполнении; поля запроса,
// кроме prompt/append/ключа/отпечатка; путь openai app-server (его вход — тот же prompt, он сверяется П6).
import fs from 'node:fs';
import nodeCrypto from 'node:crypto';

const put = process.argv[2] || '/opt/claude-oauth/gateway.mjs';
const IMENA = ['hashText', 'tekstSoobshcheniya', 'kluchBesedy', 'hashPrefiksa', 'buildPrompt', 'planZaprosa', 'rolyDsh02VFormu011'];
const vyrezat = (src, imya) => { const m = src.match(new RegExp(`^function ${imya}\\([\\s\\S]*?^}`, 'm')); return m ? m[0] : null; };
let src;
try { src = fs.readFileSync(put, 'utf8'); } catch (e) { console.log(`СЛЕПОТА: предмет не прочитан (${put}): ${e.code ?? e.message}`); process.exit(2); }
const summa = nodeCrypto.createHash('sha256').update(src).digest('hex').slice(0, 16);
const net = IMENA.filter((i) => !vyrezat(src, i));
const razvilka = src.split('\n').map((s) => s.trim()).find((s) => s.includes('= rolyDsh02VFormu011(body)')) ?? null;
console.log(`предмет ${put} · sha256 ${summa} · функций ${IMENA.length - net.length}/${IMENA.length} · развилка ${razvilka ? 'есть' : 'НЕТ'}`);
if (net.length || !razvilka) { console.log(`СЛЕПОТА: не вырезаны ${[...net, ...(razvilka ? [] : ['строка развилки'])].join(', ')} — стенд не годен`); process.exit(2); }
const zhurnal = [];
// sessiyaIzBazy — заглушка «в базе нет» (шлюз 3.1.1: промах кэша planZaprosa читает базу; как в стендах шлюза 1.4.57).
// Предмет стенда — приведение ролей, не база: без заглушки ReferenceError (обход 10.10 04:22Z), на шлюзе до 3.1.1 не используется.
const sobrat = (imyaPost) => new Function('nodeCrypto', 'log', 'RESUME_ON', 'SESSII', 'POSTAVSHCHIK', 'sessiyaIzBazy',
  `${IMENA.map((i) => vyrezat(src, i)).join('\n')}
   function prigotovit(body) { ${razvilka} return body; }
   return { prigotovit, planZaprosa, hashPrefiksa };`)(nodeCrypto, (s) => zhurnal.push(s), true, new Map(), { imya: imyaPost }, () => undefined);
const A = sobrat('anthropic'), O = sobrat('openai');

const S = 'Тебя зовут Аврора. ЛИЧНОСТЬ-МЕТКА-7731.', REZ = 'РЕЗУЛЬТАТ-ИНСТРУМЕНТА-4410';
const txt = (t) => [{ type: 'text', text: t }];
const u = (t) => ({ id: 'u-' + t, role: 'user', source: { kind: 'user' }, content: txt(t) });
const a = (t, extra = []) => ({ id: 'a-' + t, role: 'assistant', source: { kind: 'model' }, content: [...txt(t), ...extra] });
const vyzov = { type: 'tool-call', id: 'c1', name: 'bash', input: {} };
const tool011 = { id: 't1', role: 'user', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', toolCallId: 'c1', content: txt(REZ), isError: false }] };
const tool020 = { id: 't1', role: 'tool', source: { kind: 'tool', callId: 'c1' }, toolCallId: 'c1', content: txt(REZ), isError: false };
const sys = (t) => ({ id: 's-' + t.length, role: 'system', source: { kind: 'system-prompt' }, content: t ? txt(t) : [] });
const dev = (blocks) => ({ id: 'd1', role: 'developer', source: { kind: 'tool-registry' }, content: blocks });
const body011 = () => ({ model: 'm', maxTokens: 8, system: S, messages: [u('привет'), a('зову', [vyzov]), tool011, a('готово'), u('ещё')] });
const body020 = () => ({ model: 'm', maxTokens: 8, messages: [sys(S), u('привет'), a('зову', [vyzov]), tool020, dev([{ type: 'tool-addition', toolName: 'x' }]), a('готово'), u('ещё')] });
const kSdk = (M, body) => { const b = M.prigotovit(body); const plan = M.planZaprosa(b.messages); return { prompt: plan.prompt, append: b.system ?? null, kluch: plan.kluch, b }; };
const ravno = (x, y) => JSON.stringify(x) === JSON.stringify(y);

const proby = [];
const proba = (imya, fn) => { let ok = false, p = ''; try { const r = fn(); ok = r === true; if (!ok) p = typeof r === 'string' ? r : 'ложно'; } catch (e) { p = 'исключение: ' + e.message; } proby.push({ imya, ok, p }); };
const e011 = kSdk(A, body011());
proba('Б1 форма 0.1.1 проходит насквозь: тот же объект', () => { const b = body011(); return A.prigotovit(b) === b || 'объект подменён'; });
proba('Б2 anthropic: 0.2.0 → prompt, append, ключ = 0.1.1 того же предмета', () => { const r = kSdk(A, body020()); return ravno([r.prompt, r.append, r.kluch], [e011.prompt, e011.append, e011.kluch]) || `prompt ${r.prompt === e011.prompt}, append ${r.append === e011.append}, ключ ${r.kluch === e011.kluch}`; });
proba('Б3 отпечаток префикса (resume) 0.2.0 = 0.1.1', () => { const b = A.prigotovit(body020()); const n = body011().messages.length; return (b.messages.length === n && A.hashPrefiksa(b.messages, n) === A.hashPrefiksa(body011().messages, n)) || `сообщений ${b.messages.length} из ${n}`; });
proba('Б4 подсказка НЕ речь пользователя', () => !kSdk(A, body020()).prompt.includes('ЛИЧНОСТЬ-МЕТКА-7731') || 'подсказка в prompt');
proba('Б5 результат инструмента не в prompt', () => !kSdk(A, body020()).prompt.includes(REZ) || 'результат в prompt');
const c011 = kSdk(O, body011());
proba('Б6 openai (Codex): 0.2.0 → prompt и ключ = 0.1.1 того же предмета', () => { const r = kSdk(O, body020()); return ravno([r.prompt, r.kluch], [c011.prompt, c011.kluch]) || `prompt ${r.prompt === c011.prompt}, ключ ${r.kluch === c011.kluch}`; });
proba('Б7 действует последняя непустая подсказка; опустошённая не гасит', () => { const r1 = kSdk(A, { messages: [sys('СТАРАЯ'), u('x'), sys('НОВАЯ')] }); const r2 = kSdk(A, { messages: [sys('ПЕРВАЯ'), u('x'), sys('')] }); return (r1.append === 'НОВАЯ' && r2.append === 'ПЕРВАЯ' && !r1.prompt.includes('СТАРАЯ') && !r1.prompt.includes('НОВАЯ')) || `r1 ${r1.append}, r2 ${r2.append}`; });
proba('Б8 разовый вызов: body.system впереди подсказки из сообщений', () => { const r = kSdk(A, { system: 'РАЗОВАЯ', messages: [sys(S), u('x')] }); return r.append === 'РАЗОВАЯ\n\n' + S || `append ${JSON.stringify(r.append)}`; });
proba('Б9 developer с незнакомым блоком — названо строкой журнала', () => { zhurnal.length = 0; kSdk(A, { messages: [sys(S), u('x'), dev([{ type: 'text', text: 'нечто' }])] }); return zhurnal.some((s) => s.includes('🔴 роль developer') && s.includes('text')) || `журнал: ${JSON.stringify(zhurnal)}`; });
let zel = 0;
for (const p of proby) { if (p.ok) zel++; console.log(`${p.ok ? 'ЗЕЛЁНОЕ' : 'КРАСНОЕ'}  ${p.imya}${p.ok ? '' : ' — ' + p.p}`); }
console.log(`ИТОГ: ${zel} из ${proby.length}`);
process.exit(zel === proby.length ? 0 : 1);
