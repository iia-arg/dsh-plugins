// RU: Проверяем zamaskirovatVhod и её выдачу службой памяти перед внешней моделью. Каждый структурный класс, включая bot<токен> Telegram, и объявленный секрет заменяются метками [СЕКРЕТ <класс>]; проза, хеши, UUID и время сохраняются. Синтетические строки склеены, чтобы целые ключи не лежали в файле. Проверяем прямой и обратный порядок: najti_sekret выбирает по порядку правил, а не по левой позиции. Не ловим неизвестные детектору формы: пароль в URL, короткое MYVAR=… и токен бота без AA.
// EN: Test zamaskirovatVhod and its memory-service exposure before an external model call. Each structural class, including Telegram bot<token>, and declared secrets become [СЕКРЕТ <class>] markers; prose, hashes, UUIDs, and times remain. Synthetic strings are assembled to avoid storing complete keys in the file. Test forward and reverse order: najti_sekret selects by rule order, not leftmost position. Shapes unknown to the detector remain outside coverage: URL passwords, short MYVAR=…, and bot tokens without AA.
import { zamaskirovatVhod, najti_sekret } from '../src/filtr-vhoda.js';
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, bed = 0;
const proba = async (imya, f) => {
  try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло значение — пробы говорят только исключением'); ok++; console.log('  ✅ ' + imya); }
  catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).slice(0, 300)); }
};

const TG = '1234567890:' + 'AAH' + 'x9Kq2Zm4Lp7Wn3Tb8Vc5Rd1Yf6Gh0Js';
export const OBRAZCY = {
  PEM: ['-----BEGIN OPENSSH ' + 'PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n-----END OPENSSH PRIVATE KEY-----', 'b3BlbnNzaC1rZXkt'],
  JWT: ['eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'dBjftJeZ4CVPmB92'],
  'sk-': ['sk-' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6', 'a1B2c3D4e5F6'],
  github: ['ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'A1b2C3d4E5f6G7'],
  aws: ['AKIA' + 'ABCDEFGHIJKLMNOP', 'ABCDEFGHIJKLMNOP'],
  slack: ['xoxb-' + '1234567890-abcdefghij', '1234567890-abc'],
  dsn: ['postgres://user:' + 's3cretPw@db.local/x', 's3cretPw'],
  telegram: [TG, 'x9Kq2Zm4Lp7Wn3'],
  'telegram в адресе': ['https://api.telegram.org/bot' + TG + '/getMe', 'x9Kq2Zm4Lp7Wn3'],
  'объявленный :': ['pwd: ' + 'Hunter22xy', 'Hunter22xy'],
  'объявленный =': ['api_key=' + 'abc123XY', 'abc123XY'],
  'объявленный через пробел': ['api_key = "' + 'v1.abc123XYz"', 'abc123XYz'],
  'uuid после слова': ['token: ' + '3f2504e0-4f89-11d3-9a0c-0305e82c3301', '3f2504e0-4f89'],
  энтропия: ['aB3xK9mQ2wZ7pL4v' + 'N8tR6yH1jF5sD0gW7cX2bV9nM4kP', 'aB3xK9mQ2wZ7'],
};
export const CHISTOE = ['путь /opt/<agent-home>/workspace/dorabotki/nashi-dorabotki.sh', 'sha256 3f2504e04f8911d39a0c0305e82c33013f2504e04f8911d39a0c0305e82c3301',
  'md5 d41d8cd98f00b204e9800998ecf8427e', 'голый uuid 3f2504e0-4f89-11d3-9a0c-0305e82c3301 в отчёте', 'сбор в 12:30 AA, окно 09:15',
  'имя dsh-pamyat-restore-0.1.0-alpha.14', 'коммит c54111d, метка dsh-pamyat-kompakt-v0.1.0-alpha.32', 'таймер с OnBootSec+OnUnitActiveSec уходит'];

for (const [imya, klyuchi] of [['прямой', Object.keys(OBRAZCY)], ['обратный', Object.keys(OBRAZCY).reverse()]]) {
  await proba(`M1 ${imya} порядок: каждый образец замаскирован, ядер образцов 0, метки есть, остатка по najti_sekret нет`, () => {
    const r = zamaskirovatVhod('Начало. ' + klyuchi.map((k) => OBRAZCY[k][0]).join(' | проза | ') + ' Конец.');
    const ut = klyuchi.filter((k) => r.tekst.includes(OBRAZCY[k][1]));
    if (ut.length) throw new Error('уцелели: ' + ut.join(', '));
    if (r.zameneno < klyuchi.length || !r.tekst.includes('[СЕКРЕТ strukturnyj:telegram]') || !r.tekst.includes('[СЕКРЕТ obyavlennyj]'))
      throw new Error(`замен ${r.zameneno} при ${klyuchi.length} образцах или меток нет`);
    const ost = najti_sekret(r.tekst.replace(/\[СЕКРЕТ [^\]]+\]/g, ''));
    if (ost) throw new Error('остаток: ' + ost.klass);
    if (!r.tekst.startsWith('Начало. ') || !r.tekst.endsWith(' Конец.') || (r.tekst.match(/\| проза \|/g) ?? []).length !== klyuchi.length - 1)
      throw new Error('маска съела прозу вокруг образцов');
  });
}
await proba('M2 проза, суммы, uuid, время, имена — не тронуты (0 замен, текст тот же)', () => {
  for (const s of CHISTOE) { const r = zamaskirovatVhod(s); if (r.zameneno || r.tekst !== s) throw new Error('тронуто: ' + s + ' → ' + r.tekst); }
});
await proba('M3 пустое и не-строка — без исключения, 0 замен', () => {
  for (const v of ['', null, undefined, 42]) { const r = zamaskirovatVhod(v); if (r.zameneno !== 0 || typeof r.tekst !== 'string') throw new Error('на ' + String(v)); }
});

// RU: Служба памяти должна отдавать метод, вызываемый секретарём. Нет платформы — слепота проверки.
// EN: The memory service must expose the method called by the secretary. A missing platform makes the test unobservable.
let Context, apply, name, Config;
try { ({ Context } = await import('@deepseek-ai/cordis')); ({ apply, name, Config } = await import('../src/index.js')); }
catch (e) { console.log('  ⚠️ M4 СЛЕПА: платформа (@deepseek-ai/cordis) не установлена'); console.log(`итог: ${ok} из ${ok + bed} (слепых 1)`); process.exit(bed ? 1 : 2); }
await proba('M4 служба памяти отдаёт zamaskirovatVhod — и маскирует ТЕМ ЖЕ правилом', async () => {
  const kat = vremennyj(join(tmpdir(), 'stend-maski-vhoda-'));
  const koren = new Context(); koren.provide('logger'); koren.logger = { error: () => {} };
  koren.plugin({ name, apply }, new Config({ putBazy: join(kat, 'p.db'), otvechayushchegoNet: true, agent: 'proba' }));
  await new Promise((r) => setTimeout(r, 60));
  if (typeof koren.pamyat?.zamaskirovatVhod !== 'function') throw new Error('метода у службы нет');
  const r = koren.pamyat.zamaskirovatVhod('ключ ' + OBRAZCY['sk-'][0] + ' и ' + OBRAZCY.telegram[0]);
  if (r.zameneno !== 2 || r.tekst.includes(OBRAZCY['sk-'][1])) throw new Error('служба маскирует не так: ' + JSON.stringify(r).slice(0, 160));
});
console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
