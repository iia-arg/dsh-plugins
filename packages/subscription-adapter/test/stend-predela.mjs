/**
 * Приёмка предела молчания потока. Текст функции берётся ИЗ ФАЙЛА адаптера,
 * а не пишется заново: иначе стенд проверял бы свою копию, а не предмет.
 */
import fs from 'node:fs';
import http from 'node:http';
const SRC = process.env.ADAPTER_SRC || '/opt/iskra/plugins/claude-oauth/src/index.js';
let ok = 0, fail = 0, slep = 0;
const OK = (m) => { ok++; console.log('  ok    ' + m); };
const FAIL = (m) => { fail++; console.log('  FAIL  ' + m); };
const SLEP = (m) => { slep++; console.log('  СЛЕПОТА ' + m); };

const tekst = fs.readFileSync(SRC, 'utf8');

// --- 1. предмет содержит предел и оба поля
const mChislo = tekst.match(/const PREDEL_MOLCHANIYA_MS = ([\d_]+);/);
if (!mChislo) {
  // Два прочтения, и по одному файлу их не различить: либо правка ещё не
  // установлена, либо стенду подан не тот файл. Диагноза здесь поставить
  // нельзя — поэтому слепота, а не отказ.
  SLEP(`в ${SRC} нет const PREDEL_MOLCHANIYA_MS: либо правка не установлена, либо файл не тот`);
  process.exit(2);
}
const CHISLO = Number(mChislo[1].replace(/_/g, ''));
CHISLO === 1_800_000 ? OK(`предел ${CHISLO} мс`) : FAIL(`предел ${CHISLO}, ждали 1800000`);
/bodyTimeout: PREDEL_MOLCHANIYA_MS/.test(tekst) ? OK('bodyTimeout задан') : FAIL('bodyTimeout НЕ задан');
/headersTimeout: PREDEL_MOLCHANIYA_MS/.test(tekst) ? OK('headersTimeout задан') : FAIL('headersTimeout НЕ задан — половина класса открыта');
CHISLO > 0 ? OK('предел конечный, не ноль') : FAIL('ноль = защита без границы');
/\.\.\.\(dispatcher \? \{ dispatcher \} : \{\}\)/.test(tekst) ? OK('dispatcher передаётся в fetch') : FAIL('dispatcher в fetch НЕ передаётся — правка холостая');

// --- 2. обе ветки отказа ГРОМКИЕ (молчаливой деградации быть не должно)
const telo = tekst.slice(tekst.indexOf('function poluchitDispetcher'), tekst.indexOf('class ClaudeOauthAdapter'));
// Считать вызовы log?.( по всему телу нельзя: туда попадёт и строка УСПЕХА,
// и число разойдётся с числом веток отказа. Проверяем каждую ветку отдельно:
// перед `return null` в пределах шести строк обязан стоять вызов log?.(.
// 🔴 Окно фиксированной длины НЕ ГОДИТСЯ: оно захватывает вызов ИЗ СОСЕДНЕЙ
// ветки, и молчаливый `catch { return null }` засчитывается громким по строке
// успеха, стоящей шестью строками выше. Поймано порчей 31.08.
// Годный признак: идти назад ДО ГРАНИЦЫ ветки — до другого return или до catch.
const stroki = telo.split('\n');
let vetok = 0, molchalivyh = 0;
stroki.forEach((str, i) => {
  if (!/return null/.test(str)) return;
  vetok++;
  const okno = [];
  for (let j = i - 1; j >= 0; j--) {
    if (/\breturn\b|\bcatch\s*\(/.test(stroki[j])) break;   // граница ветки
    okno.push(stroki[j]);
  }
  if (!/log\?\.\(/.test(okno.join('\n'))) molchalivyh++;
});
molchalivyh === 0
  ? OK(`веток отказа ${vetok}, все громкие`)
  : FAIL(`веток отказа ${vetok}, из них молчаливых ${molchalivyh}`);

// --- 2б. форма вызова: log — функция, методов у неё нет
const cherezMetody = (telo.match(/log\?\.(info|warn)\?\./g) || []).length;
cherezMetody === 0
  ? OK('log зовётся функцией, как в предмете')
  : FAIL(`log зовётся через методы (${cherezMetody} раз) — в бою это молчит: log это функция`);

// --- 3. ПОВЕДЕНИЕ: функция из файла создаёт диспетчер, и он держит молчание
const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/x-ndjson' });
  res.write('{"type":"start"}\n');           // заголовки есть, дальше тишина
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;

const kod = telo.replace(/^\s*function poluchitDispetcher/m, 'function poluchitDispetcher');
const sobrat = new Function('PREDEL_MOLCHANIYA_MS', `
  let dispetcherPredela = null, dispetcherProboval = false;
  ${kod}
  return poluchitDispetcher;
`);
const poluchit = sobrat(CHISLO);
const zapisi = [];
// 🔴 log в предмете — ФУНКЦИЯ (`const log = (m) => console.error(...)`, apply()),
// а не объект с методами. Прежняя фикстура была объектом, и стенд проверял МОЁ
// ПРЕДСТАВЛЕНИЕ о среде вместо самой среды: вызовы log?.info?.() молча
// пропускались в бою, а на стенде проходили. Фикстура обязана быть той же формы.
const log = (m) => zapisi.push(m);
await fetch(`http://127.0.0.1:1/`).catch(() => {});     // прогрев, как в предмете
const d = poluchit(log);
d ? OK('диспетчер создан функцией ИЗ ФАЙЛА') : FAIL('диспетчер не создан');
zapisi.some((m) => /предел молчания потока/.test(m))
  ? OK('успех объявлен в журнале') : FAIL('успех не объявлен — тихая настройка');

// --- 3б. ВЕТКА ОТКАЗА ПЕЧАТАЕТ НА НАСТОЯЩЕМ log. Проверяется подставным
// случаем: ломаем поиск символа диспетчера и ждём строку в журнале.
// 🔴 Без этой проверки стенд мерил бы только ПОВЕДЕНИЕ (обрыв/не обрыв) и не
// заметил бы, что свидетель нем — ровно так дефект 31.08 и доехал до боя.
{
  const zapisiOtkaza = [];
  const logOtkaza = (m) => zapisiOtkaza.push(m);
  const slomano = telo.replace(/\/undici\\.globalDispatcher\//, '/zavedomo-net-takogo/');
  const sobrat2 = new Function('PREDEL_MOLCHANIYA_MS', `
    let dispetcherPredela = null, dispetcherProboval = false;
    ${slomano}
    return poluchitDispetcher;
  `);
  const d2 = sobrat2(CHISLO)(logOtkaza);
  d2 === null ? OK('при сломанном поиске символа диспетчер не создаётся') : FAIL('диспетчер создан на сломанном поиске');
  zapisiOtkaza.some((m) => /предел молчания НЕ задан/.test(m))
    ? OK('ветка отказа ПЕЧАТАЕТ на настоящем log')
    : FAIL('ветка отказа НЕ печатает — свидетель нем, дефект 31.08 вернулся');
}

async function molchanie(metka, dispatcher, zhdat) {
  const t0 = Date.now();
  const rab = (async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/`, dispatcher ? { dispatcher } : {});
    const rd = r.body.getReader();
    while (true) { const { done } = await rd.read(); if (done) return 'ЗАКРЫТ'; }
  })().catch((e) => `ОБРЫВ ${e?.cause?.code ?? e.name}`);
  const st = new Promise((r) => setTimeout(() => r('НЕ ОБОРВАН'), zhdat));
  return [await Promise.race([rab, st]), Date.now() - t0];
}
const [i1] = await molchanie('предел', d, 8000);
i1 === 'НЕ ОБОРВАН' ? OK('с нашим пределом 8 с молчания НЕ рвут') : FAIL(`с нашим пределом оборвано: ${i1}`);

// контроль зрячести самой пробы: заведомо малый предел ОБЯЗАН оборвать
const kl = Object.getOwnPropertySymbols(globalThis).find((x) => /undici\.globalDispatcher/.test(x.toString()));
const Agent = Object.getPrototypeOf(globalThis[kl]).constructor;
const [i2] = await molchanie('контроль', new Agent({ bodyTimeout: 1500 }), 8000);
i2 === 'ОБРЫВ UND_ERR_BODY_TIMEOUT' ? OK('контроль: малый предел рвёт — проба зрячая') : FAIL(`контроль дал ${i2} — проба НЕ зрячая`);

srv.close();
const ZHDYOM = 13;
const vsego = ok + fail + slep;
console.log(`\nИТОГ: ok=${ok} fail=${fail} слепота=${slep} (всего ${vsego}, ждём ${ZHDYOM})`);
if (vsego !== ZHDYOM) { console.log('🔴 КАНАРЕЙКА: часть проверок не состоялась'); process.exit(2); }
process.exit(fail ? 1 : 0);
