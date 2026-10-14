// Стенд п.373(а): служебные снимки не выпадают агенту как знание при спросе БЕЗ класса.
// 🔴 Всё на ВРЕМЕННОЙ базе: боевая /opt/iskra/pamyat/pamyat.db не открывается вовсе.
import { otkrytHranilishche } from '/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-core/src/hranilishche.js';
import fs from 'fs'; import os from 'os'; import path from 'path';

const KLASSY_ZNANIJ = ['reshenie','urok','vyvod','ogranichenie','oshibka','poryadok','nablyudenie','fakt'];
const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'stend373-'));
const h = otkrytHranilishche(path.join(kat, 'proba.db'));
let bed = 0, vsego = 0;
const sudit = (imya, uslovie, chem) => { vsego++; if (uslovie) console.log(`  ✅ ${imya}${chem ? ' — ' + chem : ''}`); else { bed++; console.log(`  🔴 ${imya}${chem ? ' — ' + chem : ''}`); } };

for (const [klass, tekst] of [['urok','урок про маски'],['fakt','факт о базе'],
  ['svodka-kompakcii','снимок хода беседы: отменённые замыслы и опровергнутые мысли'],
  ['reshenie','решение владельца'],['svodka-kompakcii','второй снимок']]) {
  h.zapisat({ agent: 'iskra', klass, soderzhim: tekst, istochnik: 'stend-373' });
}
const est = (spisok, k) => spisok.filter((z) => z.klass === k).length;

console.log('── признак 1: спрос БЕЗ класса ──');
const bez = h.prochitat({ agent: 'iskra', skolko: 50, tolkoKlassy: KLASSY_ZNANIJ });
sudit('сводок в выдаче нет', est(bez, 'svodka-kompakcii') === 0, `сводок ${est(bez, 'svodka-kompakcii')}, всего выдано ${bez.length}`);
sudit('знания при этом на месте', est(bez, 'urok') === 1 && est(bez, 'fakt') === 1 && est(bez, 'reshenie') === 1,
  `urok ${est(bez,'urok')}, fakt ${est(bez,'fakt')}, reshenie ${est(bez,'reshenie')} из 3`);

console.log('── признак 2: спрос С классом (без него правка негодна) ──');
const s = h.prochitat({ agent: 'iskra', klass: 'svodka-kompakcii', skolko: 50, tolkoKlassy: KLASSY_ZNANIJ });
sudit('сводка отдаётся как отдавалась', s.length === 2, `отдано ${s.length} из 2 записанных`);

console.log('── граница: перечень не задан → ведём себя как прежде ──');
const staroe = h.prochitat({ agent: 'iskra', skolko: 50 });
sudit('без перечня выдача полная', est(staroe, 'svodka-kompakcii') === 2, `сводок ${est(staroe,'svodka-kompakcii')} из 2`);

console.log('── признак 3: путь restore (читает сводку ИМЕННО по классу) ──');
const kakRestore = h.prochitat({ agent: 'iskra', klass: 'svodka-kompakcii', skolko: 1, tolkoKlassy: KLASSY_ZNANIJ });
sudit('restore находит сводку и ей есть что вставить', kakRestore.length === 1 && kakRestore[0].soderzhim.length > 0,
  `найдено ${kakRestore.length}, длина ${kakRestore[0]?.soderzhim?.length ?? 0}`);

console.log('── чужой агент не задет ──');
h.zapisat({ agent: 'petrovich', klass: 'svodka-kompakcii', soderzhim: 'чужая сводка', istochnik: 'stend-373' });
const chuzhoj = h.prochitat({ agent: 'petrovich', klass: 'svodka-kompakcii', skolko: 50, tolkoKlassy: KLASSY_ZNANIJ });
sudit('по классу чужая сводка отдаётся', chuzhoj.length === 1, `отдано ${chuzhoj.length} из 1`);

const ZHDYOM = 6;
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2); }
console.log(`\nитог: ${vsego - bed} из ${vsego}`);
fs.rmSync(kat, { recursive: true, force: true });
process.exit(bed ? 1 : 0);
