/**
 * Стенд дистилляции: пять исходов вызова и толерантный разбор.
 *
 * 🔴 ПОДСТАВНОЙ СЕРВЕР, А НЕ ЖИВОЙ API. Стенд, зависящий от сети и чужой ставки,
 * краснеет от чужих причин и потому перестаёт читаться. Здесь проверяется НАШЕ
 * поведение на каждый вид ответа; что живой DeepSeek такие ответы даёт — отдельный
 * замер, он сделан вручную 03.09.2026 и записан в README.
 *
 * ГДЕ НЕ ПРИМЕНЯЕТСЯ: стенд не проверяет качество статьи и не ходит в сеть.
 */
let vzyat_klyuch, sprosit, razobrat_massiv;
try {
  ({ vzyat_klyuch, sprosit, razobrat_massiv } = await import('../src/distillyaciya.js'));
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND';
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`);
  process.exit(2);
}
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

console.log('стенд: ' + createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16));

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => {
  vsego++;
  try { await f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).slice(0, 200)); }
};

/** Подставной сервер: отвечает тем, что ему велели. */
let otvechat = () => ({ code: 200, telo: {} });
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const o = otvechat(JSON.parse(body || '{}'), req.headers);
    res.writeHead(o.code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(o.telo));
  });
});
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const ADRES = `http://127.0.0.1:${server.address().port}/v1/messages`;

// ── 0. КОНТРОЛЬ НА ИСПРАВНОМ, ДО ПОРЧ ──────────────────────────────────────────
await proba('0. обычный ответ → ok, текст взят из блока type=text', async () => {
  otvechat = () => ({ code: 200, telo: { content: [{ type: 'thinking', thinking: 'ду́маю…' }, { type: 'text', text: 'СТАТЬЯ' }], stop_reason: 'end_turn', usage: { output_tokens: 3 } } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES });
  if (r.ishod !== 'ok') throw new Error('исход ' + r.ishod);
  if (r.tekst !== 'СТАТЬЯ') throw new Error('взят не тот блок: ' + JSON.stringify(r.tekst));
});

// 🔴 Именно тут ловится грабля «взяли первый блок»: если бы брали content[0],
// сюда пришло бы рассуждение вместо статьи, и стенд был бы зелёным.
await proba('0б. первый блок — thinking: он НЕ должен попасть в результат', async () => {
  otvechat = () => ({ code: 200, telo: { content: [{ type: 'thinking', thinking: 'ЭТО НЕ СТАТЬЯ' }, { type: 'text', text: 'вот статья' }], stop_reason: 'end_turn' } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES });
  if (/НЕ СТАТЬЯ/.test(r.tekst)) throw new Error('в результат попало рассуждение');
});

// ── A. пусто по существу ───────────────────────────────────────────────────────
await proba('A. модель ответила «НЕТ РЕЛЕВАНТНОГО» → ok, точная строка сохранена', async () => {
  otvechat = () => ({ code: 200, telo: { content: [{ type: 'text', text: 'НЕТ РЕЛЕВАНТНОГО' }], stop_reason: 'end_turn' } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES });
  if (r.ishod !== 'ok' || r.tekst !== 'НЕТ РЕЛЕВАНТНОГО') throw new Error(r.ishod + '/' + r.tekst);
});

// ── B. не смогли спросить ──────────────────────────────────────────────────────
await proba('B. хост недоступен → ne-sprosili, и это НЕ «нечего извлекать»', async () => {
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: 'http://127.0.0.1:1/v1/messages', tajmautMs: 3000 });
  if (r.ishod !== 'ne-sprosili') throw new Error('исход ' + r.ishod);
});

await proba('B2. ключ НЕ попадает в текст отказа', async () => {
  const r = await sprosit({ klyuch: 'sk-ochen-sekretnyj-klyuch', tekst: 'x', adres: 'http://127.0.0.1:1/v1/messages', tajmautMs: 3000 });
  if (/sk-ochen/.test(JSON.stringify(r))) throw new Error('ключ в ответе механизма');
});

// ── D. бюджет кончился — обязан сказать ПОЧЕМУ ─────────────────────────────────
// 🔴 A и D обязаны РАЗЛИЧАТЬСЯ: «нечего извлекать» и «не смогла дочитать» —
// разные новости, подавать одинаково нельзя.
await proba('D. stop_reason=max_tokens без блока text → ne-dochitala, причина названа', async () => {
  otvechat = () => ({ code: 200, telo: { content: [{ type: 'thinking', thinking: 'долго думаю' }], stop_reason: 'max_tokens', usage: { output_tokens: 100 } } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES, maxTokens: 100 });
  if (r.ishod !== 'ne-dochitala') throw new Error('исход ' + r.ishod);
  if (!/max_tokens=100/.test(r.pochemu)) throw new Error('в причине нет числа бюджета');
});

await proba('D2. пусто с ИНЫМ stop_reason → pusto, причина не выдумана', async () => {
  otvechat = () => ({ code: 200, telo: { content: [], stop_reason: 'stop_sequence' } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES });
  if (r.ishod !== 'pusto') throw new Error('исход ' + r.ishod);
  if (!/stop_sequence/.test(r.pochemu)) throw new Error('stop_reason не назван дословно');
});

// 🔴 ТРИ ОТКАЗА — ТРИ ПРИРОДЫ. Прежде 401, 402 и сетевой сбой возвращались одним
// «ne-sprosili»: разбирающий видел «не смогла спросить» и не знал, ждать ли, менять ключ
// или пополнять счёт. Проба ждала старую форму и честно покраснела на разведении — она
// стерегла верное требование («код назван, а не «нечего извлекать»») в устаревшем виде.
await proba('HTTP 401 → своя природа klyuch-ne-prinyat, повтор не поможет', async () => {
  otvechat = () => ({ code: 401, telo: { error: 'bad key' } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES });
  if (r.ishod !== 'klyuch-ne-prinyat' || !/401/.test(r.pochemu)) throw new Error(r.ishod + '/' + r.pochemu);
  if (r.okonchatelno !== true) throw new Error('отказ не помечен окончательным — шов будет перебирать темы');
});

await proba('HTTP 402 → net-deneg, и это НЕ то же, что не принят ключ', async () => {
  otvechat = () => ({ code: 402, telo: { error: 'Insufficient Balance' } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES });
  if (r.ishod !== 'net-deneg') throw new Error('исход ' + r.ishod);
  if (r.okonchatelno !== true) throw new Error('отказ по деньгам не окончателен — заход переберёт все темы');
  if (!/пополните/.test(r.pochemu)) throw new Error('причина не называет лечение: ' + r.pochemu);
});

await proba('HTTP 500 → ne-sprosili, НЕ окончательный: сеть чинится сама', async () => {
  otvechat = () => ({ code: 500, telo: { error: 'oops' } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES });
  if (r.ishod !== 'ne-sprosili') throw new Error('исход ' + r.ishod);
  if (r.okonchatelno) throw new Error('временный сбой помечен окончательным — заход оборвётся зря');
});

// ── C. толерантный разбор ──────────────────────────────────────────────────────
await proba('C. JSON в code-fence с пояснениями вокруг → разобран', async () => {
  const r = razobrat_massiv('Вот темы:\n```json\n[{"theme":"a","kind":"urok"}]\n```\nГотово.');
  if (!r.godno || r.spisok.length !== 1) throw new Error(JSON.stringify(r));
});

await proba('C2. не массив вовсе → отказ С ПРИЧИНОЙ, а не пустой список', async () => {
  const r = razobrat_massiv('я не смогла');
  if (r.godno) throw new Error('разобрано то, чего нет');
  if (!r.pochemu) throw new Error('причина не названа');
});

// ── E. ключ ────────────────────────────────────────────────────────────────────
await proba('E. файла ключа нет → отказ ДО вызова, с путём в причине', async () => {
  const r = vzyat_klyuch({ fajlKlyucha: '/net/takogo/fajla' });
  if (r.klyuch) throw new Error('ключ взялся ниоткуда');
  if (!/net\/takogo/.test(r.pochemu)) throw new Error('путь не назван: ' + r.pochemu);
});

await proba('E2. файл ключа ПУСТ → отказ, и это не «ключ есть»', async () => {
  const f = join(tmpdir(), `proba-klyucha-${process.pid}`);
  writeFileSync(f, '   \n');
  try {
    const r = vzyat_klyuch({ fajlKlyucha: f });
    if (r.klyuch) throw new Error('пустой файл дал ключ');
  } finally { try { unlinkSync(f); } catch { /* */ } }
});

await proba('E3. источник ключа не задан вовсе → отказ, а не молчание', async () => {
  const r = vzyat_klyuch({});
  if (r.klyuch || !r.pochemu) throw new Error('молчаливый исход');
});

await proba('E4. ключ из ОКРУЖЕНИЯ: взят, и источник назван', async () => {
  process.env.PROBA_KLYUCHA_E4 = 'sk-podstavnoj-e4';
  try {
    const r = vzyat_klyuch({ peremennayaOkruzheniya: 'PROBA_KLYUCHA_E4' });
    if (!r.klyuch) throw new Error('не взялся: ' + r.pochemu);
    if (!/окружение PROBA_KLYUCHA_E4/.test(r.otkuda || '')) throw new Error('источник не назван: ' + r.otkuda);
  } finally { delete process.env.PROBA_KLYUCHA_E4; }
});

await proba('E5. переменная не задана → отказ с ИМЕНЕМ переменной, а не молчание', async () => {
  const r = vzyat_klyuch({ peremennayaOkruzheniya: 'NET_TAKOJ_PEREMENNOJ_E5' });
  if (r.klyuch) throw new Error('ключ взялся из пустоты');
  if (!/NET_TAKOJ_PEREMENNOJ_E5/.test(r.pochemu)) throw new Error('имя не названо: ' + r.pochemu);
});

// 🔴 ПОРЯДОК ИСТОЧНИКОВ ПРОВЕРЯЕТСЯ ДЕЙСТВИЕМ, а не чтением: заданный файл, который не
// читается, НЕ должен молча подменяться окружением — иначе пропажа файла маскируется
// и выглядит исправной работой.
await proba('E6. заданный файл не читается → отказ, окружение его НЕ подменяет', async () => {
  process.env.PROBA_KLYUCHA_E6 = 'sk-podstavnoj-e6';
  try {
    const r = vzyat_klyuch({ fajlKlyucha: '/net/takogo/fajla', peremennayaOkruzheniya: 'PROBA_KLYUCHA_E6' });
    if (r.klyuch) throw new Error('окружение подменило заданный файл: ' + r.otkuda);
    if (!/net\/takogo/.test(r.pochemu)) throw new Error('причина не про файл: ' + r.pochemu);
  } finally { delete process.env.PROBA_KLYUCHA_E6; }
});

await proba('E7. значение ключа НЕ попадает в текст об источнике', async () => {
  process.env.PROBA_KLYUCHA_E7 = 'sk-sekret-ne-pokazyvat';
  try {
    const r = vzyat_klyuch({ peremennayaOkruzheniya: 'PROBA_KLYUCHA_E7' });
    if ((r.otkuda || '').includes('sk-sekret')) throw new Error('значение утекло в otkuda');
  } finally { delete process.env.PROBA_KLYUCHA_E7; }
});

server.close();
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
