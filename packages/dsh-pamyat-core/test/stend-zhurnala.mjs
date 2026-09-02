/**
 * Стенд журнала. Доказывает, что журнал отвечает на вопрос «почему память
 * пуста» — то есть отличает «не предлагали» от «предлагали и отказали»,
 * и внутри отказов отличает решение человека от поломки установки.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zagruzitDrajver } from '../src/hranilishche.js';
import { zavestiZhurnal } from '../src/zhurnal.js';

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 130)); }
};

const katalog = mkdtempSync(join(tmpdir(), 'pamyat-zh-'));
const { DatabaseSync } = zagruzitDrajver();
const baza = new DatabaseSync(join(katalog, 'zh.db'));

proba('стенд годен: отметка пишется и читается', () => {
  const zh = zavestiZhurnal(baza);
  const id = zh.otmetit({ agent: 'stend', klass: 'zametka', ishod: 'zapisano', pochemu: 'класс автоматический', istochnik: 'session#7' });
  if (!(id > 0)) throw new Error('нет id');
  const p = zh.poslednie({ agent: 'stend' });
  if (p.length !== 1 || p[0].istochnik !== 'session#7') throw new Error('прочиталось не то');
});

proba('ПОРЧА: журнал без базы → отказ', () => {
  try { zavestiZhurnal(null); throw new Error('не упало'); }
  catch (e) { if (e.code !== 'PAMYAT_ZHURNAL_BEZ_BAZY') throw new Error('не тот код: ' + e.code); }
});

proba('ПОРЧА: неполная отметка отвергается', () => {
  const zh = zavestiZhurnal(baza);
  try { zh.otmetit({ agent: 'stend', klass: 'x', ishod: 'zapisano' }); throw new Error('не упало'); }
  catch (e) { if (e.code !== 'PAMYAT_NEPOLNAYA_OTMETKA') throw new Error('не тот код: ' + e.code); }
});

proba('ГЛАВНОЕ: сводка считает природы отказа РАЗДЕЛЬНО', () => {
  const zh = zavestiZhurnal(baza);
  zh.otmetit({ agent: 'a2', klass: 'navyk', ishod: 'otkloneno', priroda: 'otkazano', pochemu: 'человек не разрешил' });
  zh.otmetit({ agent: 'a2', klass: 'navyk', ishod: 'otkloneno', priroda: 'net-kanala', pochemu: 'канал отсутствует' });
  zh.otmetit({ agent: 'a2', klass: 'navyk', ishod: 'otkloneno', priroda: 'net-kanala', pochemu: 'канал отсутствует' });
  const s = zh.svodka('a2');
  if (s.otkloneno !== 3) throw new Error('отклонено ' + s.otkloneno);
  if (s.poPrirode['net-kanala'] !== 2) throw new Error('поломок ' + s.poPrirode['net-kanala']);
  if (s.poPrirode['otkazano'] !== 1) throw new Error('решений человека ' + s.poPrirode['otkazano']);
});

proba('РАЗЛИЧЕНИЕ: пустой журнал агента ≠ отказ, но и не «всё записано»', () => {
  const zh = zavestiZhurnal(baza);
  const s = zh.svodka('nikogo');
  if (s.zapisano !== 0 || s.otkloneno !== 0) throw new Error('ожидались нули');
  if (Object.keys(s.poPrirode).length !== 0) throw new Error('лишние природы');
});

baza.close();
rmSync(katalog, { recursive: true, force: true });
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
