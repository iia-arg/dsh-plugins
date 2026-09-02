/**
 * Стенд хранилища. Проверяет ФУНКЦИЮ, а не загрузку пакета.
 *
 * Каждая проба названа тем, что она доказывает. Порядок намеренный: первой идёт
 * проба на ЗАВЕДОМО ИСПРАВНОМ предмете — если она красная, стенд негоден и
 * остальные пробы ничего не значат.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { otkrytHranilishche, zagruzitDrajver } from '../src/hranilishche.js';

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 120)); }
};
const dolzhnoUpast = (kod, f) => {
  try { f(); } catch (e) {
    if (e.code === kod) return e;
    throw new Error('ожидался код ' + kod + ', получен ' + e.code);
  }
  throw new Error('не упало, а должно было (' + kod + ')');
};

const katalog = mkdtempSync(join(tmpdir(), 'pamyat-stend-'));
const put = join(katalog, 'pamyat.db');

proba('стенд годен: на исправном предмете хранилище открывается и пишет', () => {
  const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'проба пера', istochnik: 'session#1' });
  if (!(id > 0)) throw new Error('запись не вернула id');
  const zapisi = h.prochitat({ agent: 'stend' });
  if (zapisi.length !== 1) throw new Error('прочитано ' + zapisi.length + ' вместо 1');
  if (zapisi[0].soderzhim !== 'проба пера') throw new Error('содержимое не то');
  if (zapisi[0].istochnik !== 'session#1') throw new Error('ссылка на источник потеряна');
  h.zakryt();
});

proba('ПОРЧА: нет модуля хранилища → отказ с внятным текстом, а не пустая память', () => {
  const e = dolzhnoUpast('PAMYAT_NET_HRANILISHCHA', () => zagruzitDrajver('node:sqlite-takogo-net'));
  for (const slovo of ['НЕ РАБОТАЕТ', 'отказ', 'Node']) {
    if (!e.message.includes(slovo)) throw new Error('в сообщении нет слова «' + slovo + '»');
  }
});

proba('ПОРЧА: база не открывается → отказ, а не тишина', () => {
  dolzhnoUpast('PAMYAT_BAZA_NE_OTKRYLAS', () => otkrytHranilishche('/proc/net/dev/pamyat.db'));
});

proba('ПОРЧА: путь не задан → отказ', () => {
  dolzhnoUpast('PAMYAT_NET_PUTI', () => otkrytHranilishche(undefined));
});

proba('ПОРЧА: неполная запись отвергается', () => {
  const h = otkrytHranilishche(join(katalog, 'p2.db'));
  dolzhnoUpast('PAMYAT_NEPOLNAYA_ZAPIS', () => h.zapisat({ agent: 'stend', klass: 'x' }));
  h.zakryt();
});

proba('РАЗЛИЧЕНИЕ: пустая база отдаёт пустой список и НЕ считается отказом', () => {
  const h = otkrytHranilishche(join(katalog, 'p3.db'));
  const zapisi = h.prochitat({ agent: 'nikogo-net' });
  if (!Array.isArray(zapisi) || zapisi.length !== 0) throw new Error('ожидался пустой список');
  if (h.skolkoZapisej('nikogo-net') !== 0) throw new Error('счёт не ноль');
  h.zakryt();
});

rmSync(katalog, { recursive: true, force: true });
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
