// RU: A-N-1870 (Аврора, 08.10.2026): ключи настройки ядра против кода. (1) maskirovatObrazcy объявлен в Config, умолчание true;
//     (2) zhurnalSkolko снят из Config (не читался никогда); (3) config.koren не читается: знание уходит в корень agent,
//     даже если в настройке задан другой koren (прежде запись шла в koren, а проверка видимости — в agent).
//     Коды: 0 — годно; 1 — расхождение; 2 — слепота (предмет не загрузился, служба не поднялась, записи не дошли до подставы).
//     ЧЕГО НЕ ЛОВИТ: настоящую OMEGA; что профили агентов уже очищены от снятых ключей — это перечень монтажа, не стенд.
// EN: A-N-1870: core settings versus code — maskirovatObrazcy is declared (default true), zhurnalSkolko is removed,
//     and config.koren is ignored: knowledge goes to the agent root even when another koren is configured.
let Context, apply, name, Config;
const YADRO = process.env.STEND_YADRO ?? new URL('../src/index.js', import.meta.url).pathname;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import(YADRO));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160));
  process.exit(2);
}
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const kat = mkdtempSync(join(tmpdir(), 'stend-klyuchej-'));
process.on('exit', () => rmSync(kat, { recursive: true, force: true }));
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));
const zhdat = (ms) => new Promise((r) => setTimeout(r, ms));
console.log('предмет: ' + YADRO);

let ok = 0, bed = 0;
// RU: A-N-1870 r2 (находка ворот vypusk-tegom 08.10, Искра): ВОЗВРАТ ТЕЛА — ТОЖЕ ИСХОД. Прежде обёртка судила только по исключению
//     и выбрасывала возврат — тело, сказавшее «нет» строкой или false, зеленело (obyortka-krasneet: ГЛУХОЙ). Как у соседних стендов:
//     любой возврат, кроме undefined и true, — красное с текстом возврата.
// EN: A-N-1870 r2: a body's return value is an outcome too; any return other than undefined/true is red, as in sibling stands.
const proba = (imya, f) => {
  try {
    const v = f();
    if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + e.message); }
};

const pusto = new Config({ agent: 'a' });
proba('maskirovatObrazcy объявлен: умолчание true', () => {
  if (pusto.maskirovatObrazcy !== true) throw new Error('Config({}).maskirovatObrazcy = ' + pusto.maskirovatObrazcy);
});
proba('zhurnalSkolko снят: схема его не подставляет', () => {
  if ('zhurnalSkolko' in pusto) throw new Error('Config({}).zhurnalSkolko = ' + pusto.zhurnalSkolko);
});

// RU: Подставной долговременный слой: только запоминает корень (kto) каждой записи.
const korni = [];
const dolgo = {
  dostupna: () => true, pochemuNedostupna: () => null,
  async sohranit({ kto }) { korni.push(kto); return { sostoyanie: 'dostavleno', id: 'mem-' + String(korni.length).padStart(12, '0'), sozdana: true }; },
  async proverit() { return { sostoyanie: 'est', pochemu: 'подстава' }; },
};
const AGENT = 'proba-uzel';
const koren = new Context();
koren.provide('logger'); koren.logger = { error: () => {} };
koren.provide('pamyatDolgovremennaya'); koren.pamyatDolgovremennaya = dolgo;
koren.plugin({ name, apply }, new Config({ putBazy: join(kat, 'k.db'), otvechayushchegoNet: true, agent: AGENT, koren: 'chuzhoj-koren' }));
await zhdat(60);
const pam = koren.pamyat;
if (!pam?.zapisat) { console.log('СЛЕПОТА: служба pamyat не поднялась'); process.exit(2); }
pam.zapisat({ klass: 'urok', soderzhim: 'Урок стенда A-N-1870: корень записи берётся из agent, а не из koren', istochnik: 'stend#a1870' });
for (let i = 0; i < 40 && korni.length === 0; i++) await zhdat(25);
if (korni.length === 0) { console.log('СЛЕПОТА: запись не дошла до подставного долговременного слоя'); process.exit(2); }
proba('koren в настройке не читается: корень записи = agent', () => {
  if (korni[0] !== AGENT) throw new Error('запись ушла в корень «' + korni[0] + '», ждали «' + AGENT + '»');
});

console.log(`ИТОГ: годно ${ok}, расхождений ${bed}`);
process.exit(bed ? 1 : 0);
