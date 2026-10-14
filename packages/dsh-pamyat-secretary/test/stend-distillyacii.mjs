// RU: Проверяем пять исходов вызова и толерантный разбор на подставном HTTP-сервере. Стенд проверяет поведение пакета на ответы; качество статьи и ответы живого провайдера не проверяются.
// EN: Test five call outcomes and tolerant parsing using a fake HTTP server. The suite tests package behavior for responses; article quality and live provider responses are outside coverage.
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
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Временное создаём в отдельном mkdtemp и убираем через exit-хук и SIGTERM/SIGINT; общий фиксированный путь может остаться чужим или пережить прогон. SIGKILL уборку не выполнит.
// EN: Create temporary files in a separate mkdtemp and clean them through the exit hook and SIGTERM/SIGINT; a shared fixed path may belong to another account or survive a run. SIGKILL cannot run cleanup.
const KAT = mkdtempSync(join(tmpdir(), '.proba-distillyacii-'));
process.on('exit', () => rmSync(KAT, { recursive: true, force: true }));
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));

console.log('стенд: ' + createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16));

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => {
  vsego++;
  try {
    const vernulos = await f();
    // RU: Асинхронная обёртка должна учитывать возврат тела: любое значение кроме undefined означает отказ, включая строку, false, 0, null и объект. Игнорирование возврата даёт ложный успех.
    // EN: The asynchronous wrapper must inspect the body’s return: any value except undefined fails, including a string, false, 0, null, and an object. Ignoring returns produces false success.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судила по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).slice(0, 200)); }
};

// RU: Подставной сервер отдаёт ответ, заданный сценарием.
// EN: The fake server returns the response selected by the scenario.
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

// RU: Сначала проверяем заведомо исправный ответ, затем порчи.
// EN: Test a known healthy response before mutations.
await proba('0. обычный ответ → ok, текст взят из блока type=text', async () => {
  otvechat = () => ({ code: 200, telo: { content: [{ type: 'thinking', thinking: 'ду́маю…' }, { type: 'text', text: 'СТАТЬЯ' }], stop_reason: 'end_turn', usage: { output_tokens: 3 } } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES });
  if (r.ishod !== 'ok') throw new Error('исход ' + r.ishod);
  if (r.tekst !== 'СТАТЬЯ') throw new Error('взят не тот блок: ' + JSON.stringify(r.tekst));
});

// RU: Рассуждение перед статьёй проверяет выбор текстового блока: content[0] может быть рассуждением, а не статьёй.
// EN: Reasoning before the article tests text-block selection: content[0] may contain reasoning rather than the article.
await proba('0б. первый блок — thinking: он НЕ должен попасть в результат', async () => {
  otvechat = () => ({ code: 200, telo: { content: [{ type: 'thinking', thinking: 'ЭТО НЕ СТАТЬЯ' }, { type: 'text', text: 'вот статья' }], stop_reason: 'end_turn' } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES });
  if (/НЕ СТАТЬЯ/.test(r.tekst)) throw new Error('в результат попало рассуждение');
});

// RU: Проверяем содержательно пустой ответ.
// EN: Test a substantively empty response.
await proba('A. модель ответила «НЕТ РЕЛЕВАНТНОГО» → ok, точная строка сохранена', async () => {
  otvechat = () => ({ code: 200, telo: { content: [{ type: 'text', text: 'НЕТ РЕЛЕВАНТНОГО' }], stop_reason: 'end_turn' } });
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: ADRES });
  if (r.ishod !== 'ok' || r.tekst !== 'НЕТ РЕЛЕВАНТНОГО') throw new Error(r.ishod + '/' + r.tekst);
});

// RU: Проверяем невозможность вызова провайдера.
// EN: Test inability to call the provider.
await proba('B. хост недоступен → ne-sprosili, и это НЕ «нечего извлекать»', async () => {
  const r = await sprosit({ klyuch: 'k', tekst: 'x', adres: 'http://127.0.0.1:1/v1/messages', tajmautMs: 3000 });
  if (r.ishod !== 'ne-sprosili') throw new Error('исход ' + r.ishod);
});

await proba('B2. ключ НЕ попадает в текст отказа', async () => {
  const r = await sprosit({ klyuch: 'sk-ochen-sekretnyj-klyuch', tekst: 'x', adres: 'http://127.0.0.1:1/v1/messages', tajmautMs: 3000 }); // RU: Синтетический образец · EN: Synthetic sample; vorota-ob:dopusk=TOKEN
  if (/sk-ochen/.test(JSON.stringify(r))) throw new Error('ключ в ответе механизма');
});

// RU: Исчерпание бюджета должно отличаться от пустого ответа и объяснять, почему текст не дочитан.
// EN: Budget exhaustion must differ from an empty response and explain why reading did not finish.
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

// RU: 401, 402 и сетевой отказ имеют разные причины: сменить ключ, пополнить баланс или разбирать сеть. Общий ne-sprosili скрывает лечение.
// EN: 401, 402, and network failures have distinct causes: replace the key, replenish balance, or investigate networking. A shared ne-sprosili hides the remedy.
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

// RU: Проверяем толерантный разбор.
// EN: Test tolerant parsing.
await proba('C. JSON в code-fence с пояснениями вокруг → разобран', async () => {
  const r = razobrat_massiv('Вот темы:\n```json\n[{"theme":"a","kind":"urok"}]\n```\nГотово.');
  if (!r.godno || r.spisok.length !== 1) throw new Error(JSON.stringify(r));
});

await proba('C2. не массив вовсе → отказ С ПРИЧИНОЙ, а не пустой список', async () => {
  const r = razobrat_massiv('я не смогла');
  if (r.godno) throw new Error('разобрано то, чего нет');
  if (!r.pochemu) throw new Error('причина не названа');
});

// RU: Проверяем источники ключа.
// EN: Test key sources.
await proba('E. файла ключа нет → отказ ДО вызова, с путём в причине', async () => {
  const r = vzyat_klyuch({ fajlKlyucha: '/net/takogo/fajla' });
  if (r.klyuch) throw new Error('ключ взялся ниоткуда');
  if (!/net\/takogo/.test(r.pochemu)) throw new Error('путь не назван: ' + r.pochemu);
});

await proba('E2. файл ключа ПУСТ → отказ, и это не «ключ есть»', async () => {
  const f = join(KAT, 'proba-klyucha');
  writeFileSync(f, '   \n');
  try {
    const r = vzyat_klyuch({ fajlKlyucha: f });
    if (r.klyuch) throw new Error('пустой файл дал ключ');
  } finally { try { unlinkSync(f); } catch { /* RU: Проверяем следующую форму ошибки чтения ключа.
 * EN: Test the next key-read error shape.
 */ } }
});

// RU: Причина должна содержать код и текст ошибки. Выбор через ?? теряет сообщение при заданном коде и не заменяет пустую строку.
// EN: The cause must include both error code and message. Selecting with ?? loses the message when a code exists and does not replace an empty string.
await proba('E-причина. чтение ключа несёт И код, И текст (не одно из двух)', async () => {
  const r = vzyat_klyuch({ fajlKlyucha: tmpdir() });   /* RU: Каталог вместо файла даёт EISDIR.
 * EN: A directory in place of a file produces EISDIR.
 */
  if (r.klyuch) throw new Error('каталог отдал ключ');
  if (!/EISDIR/.test(r.pochemu)) throw new Error('код отказа потерян: ' + r.pochemu);
  if (!/illegal operation|directory|каталог/i.test(r.pochemu))
    throw new Error('текст отказа потерян, остался только код: ' + r.pochemu);
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

// RU: Нечитаемый явно заданный файл ключа не подменяется окружением: иначе отказ источника скрывается.
// EN: An explicitly configured unreadable key file must not fall back to the environment; that would hide the source failure.
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
