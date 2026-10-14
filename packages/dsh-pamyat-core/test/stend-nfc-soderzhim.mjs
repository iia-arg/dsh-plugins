// RU: Проверяем NFC для soderzhim до маски, фильтра и чистки в index.js, а также в hranilishche.zapisat для прямых писателей. NFD может скрыть склонённое объявление: «ключей: hunter2xyz» ловится как slabyj:sklonenie только в NFC. Предмет — настоящая служба через Context на временной базе и прямое хранилище. Коды: 0 — успех, 1 — расхождение, 2 — предмет недоступен или исправная запись не прошла.
// EN: Test NFC normalization of soderzhim before masking, filtering, and cleaning in index.js, and in hranilishche.zapisat for direct writers. NFD can hide an inflected declaration: “ключей: hunter2xyz” matches slabyj:sklonenie only in NFC. Test the real service through Context on a temporary database and direct storage. Codes: 0 success, 1 mismatch, 2 subject unavailable or healthy write failed.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
let Context, apply, name, Config, otkrytHranilishche, najti_sekret;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import('../src/index.js'));
  ;({ otkrytHranilishche } = await import('../src/hranilishche.js'));
  ;({ najti_sekret } = await import('../src/filtr-vhoda.js'));
} catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.code ?? '') + ' ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
const kat = mkdtempSync(join(tmpdir(), 'stend-nfc-'));
process.on('exit', () => rmSync(kat, { recursive: true, force: true }));
let ok = 0, bed = 0;
const proba = (imya, uslovie, podrobno = '') => { uslovie ? ok++ : bed++; console.log(`  ${uslovie ? 'ok  ' : 'FAIL'} ${imya}${uslovie ? '' : ' — ' + podrobno}`); };
const NFD = (s) => s.normalize('NFD'), NFC = (s) => s.normalize('NFC');
const ZNANIE = 'Ёжик и йод: разложенные буквы из модели обязаны лечь составными';
const SEKRET = 'в отчёте было ключей: hunter2xyz и дальше';

// RU: Контроль зрячести: фильтр ловит фразу в NFC и не ловит в NFD; другое поведение меняет предмет пробы.
// EN: Visibility control: the filter detects the phrase in NFC and misses it in NFD; different behavior changes the probe’s subject.
const fNFC = najti_sekret(NFC(SEKRET)), fNFD = najti_sekret(NFD(SEKRET));
if (!fNFC || fNFD) { console.log(`СЛЕПОТА: фильтр не различает формы (NFC ${JSON.stringify(fNFC)}, NFD ${JSON.stringify(fNFD)}) — проба 3 ничего бы не доказала`); process.exit(2); }
if (NFD(ZNANIE) === ZNANIE || NFD(SEKRET) === SEKRET) { console.log('СЛЕПОТА: подставной текст не раскладывается — NFD = NFC'); process.exit(2); }

const errOrig = console.error; console.error = () => {};
const putBazy = join(kat, 'p.db');
const koren = new Context();
koren.provide('logger'); koren.logger = { error: () => {} };
koren.plugin({ name, apply }, new Config({ putBazy, otvechayushchegoNet: true, agent: 'proba-nfc' }));
await new Promise((r) => setTimeout(r, 60));
console.error = errOrig;
const pm = koren.pamyat;
if (typeof pm?.zapisat !== 'function') { console.log('СЛЕПОТА: служба ядра не поднялась'); process.exit(2); }
const h = otkrytHranilishche(putBazy);
const prochest = (id) => h.baza.prepare('SELECT soderzhim FROM zapisi WHERE id=?').get(id)?.soderzhim;

console.log('— 1. через службу (путь index.js)');
let id1 = null; try { id1 = pm.zapisat({ klass: 'urok', soderzhim: NFD(ZNANIE), istochnik: 'stend#1-2' }); } catch (e) { console.log('СЛЕПОТА: исправная запись отвергнута — ' + e.message); process.exit(2); }
proba('служба: NFD на входе → в базе NFC', prochest(id1) === NFC(ZNANIE), JSON.stringify(prochest(id1)));

console.log('— 2. хранилище напрямую (писатель мимо index.js)');
const id2 = h.zapisat({ agent: 'proba-nfc', klass: 'fakt', soderzhim: NFD(ZNANIE) });
proba('zapisat: NFD на входе → в базе NFC', prochest(id2) === NFC(ZNANIE), JSON.stringify(prochest(id2)));

console.log('— 3. фильтр входа видит NFC (нормализация ДО фильтра)');
// RU: slabyj:sklonenie пропускает запись с podozrenie. Эта пометка доказывает NFC до фильтра; без нормализации она отсутствует.
// EN: slabyj:sklonenie allows the write with podozrenie. That mark demonstrates NFC before filtering; it is absent without normalization.
let idS = null; try { idS = pm.zapisat({ klass: 'urok', soderzhim: NFD(SEKRET), istochnik: 'stend#3-4' }); } catch (e) { console.log('СЛЕПОТА: запись с подозрением отвергнута — ' + e.code); process.exit(2); }
const pod = h.baza.prepare('SELECT podozrenie FROM zapisi WHERE id=?').get(idS)?.podozrenie;
proba('служба: «ключей: …» в NFD — пометка podozrenie slabyj:sklonenie', /slabyj:sklonenie/.test(String(pod)), `podozrenie ${JSON.stringify(pod)}`);

h.baza.close();
console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed ? 1 : 0);
