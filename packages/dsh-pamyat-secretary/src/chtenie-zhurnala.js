/**
 * Чтение журнала сессии: достать записи по списку seq.
 *
 * 🔴 ЖУРНАЛ МНОГОКАДРОВЫЙ, И NODE МОЛЧА ЧИТАЕТ ТОЛЬКО ПЕРВЫЙ КАДР.
 * Замер 03.09.2026 на живом журнале (5,2 МБ, 5852 кадра):
 *     zstdDecompressSync(весь файл)  ->    126 байт, БЕЗ ОШИБКИ
 *     createZstdDecompress (поток)   ->    126 байт + отказ «Unknown frame descriptor»
 *     разбор по кадрам вручную       -> 27 922 455 байт, 56 802 строки
 *     zstd -dc --long=27             -> 27 922 455 байт, 56 802 строки  (сошлось байт в байт)
 *
 * То есть штатная распаковка отдаёт огрызок и НЕ СООБЩАЕТ об этом: 126 байт вместо
 * 27 мегабайт выглядят как маленький журнал, а не как отказ. Поток хотя бы кричит.
 * Поэтому читаем сами: делим файл по магическому числу кадра и распаковываем каждый.
 * Внешней утилиты не зовём — она есть не у всякого получателя, а урок остаётся с нами.
 */
import { zstdDecompressSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

/** Магическое число кадра zstd (RFC 8878, 4.1). */
const MAGIYA = Buffer.from([0x28, 0xB5, 0x2F, 0xFD]);

/**
 * Распаковать многокадровый zstd целиком.
 * Возвращает { tekst, kadrov, ne_raspakovalos } — последнее числом, а не молчанием:
 * битый кадр посреди файла не должен превращаться в «журнал короче, чем есть».
 */
export function raspakovat(put) {
  // 🔴 ОТСУТСТВИЕ ФАЙЛА — ПРИЧИНА, А НЕ ИСКЛЮЧЕНИЕ. Прежде readFileSync бросал
  // наружу голый ENOENT, и вызывающий шов сообщал «дистилляция оборвалась: ENOENT»
  // — верно и бесполезно: не сказано, ЧТО не найдено и что с этим делать. Поймано
  // пробой стенда шва, которая ждала названного отказа, а получила сырую ошибку.
  if (!put) return { tekst: '', kadrov: 0, ne_raspakovalos: 0, pochemu: 'путь к журналу сессии не задан (ключ putZhurnala пуст)' };
  let b;
  try { b = readFileSync(put); }
  catch (e) {
    return { tekst: '', kadrov: 0, ne_raspakovalos: 0,
             pochemu: 'журнал сессии не прочитан (' + (e?.code ?? e?.message) + '): ' + put };
  }
  const poz = [];
  let i = 0;
  while ((i = b.indexOf(MAGIYA, i)) !== -1) { poz.push(i); i += 4; }
  if (poz.length === 0) {
    return { tekst: '', kadrov: 0, ne_raspakovalos: 0, pochemu: 'кадров zstd в файле нет — это не журнал сессии' };
  }
  const chasti = [];
  let ploho = 0;
  for (let k = 0; k < poz.length; k++) {
    const konec = k + 1 < poz.length ? poz[k + 1] : b.length;
    try { chasti.push(zstdDecompressSync(b.subarray(poz[k], konec))); } catch { ploho++; }
  }
  return {
    tekst: Buffer.concat(chasti).toString('utf-8'),
    kadrov: poz.length,
    ne_raspakovalos: ploho,
  };
}

/**
 * Достать записи журнала по списку seq.
 *
 * ⚠️ ВОЗВРАЩАЕТ И ЧИСЛО НЕНАЙДЕННЫХ. «Нашли 60 из 67» и «нашли 67» — разные
 * состояния, и второе нельзя выдавать за первое: недостающие записи означают, что
 * дистилляция пойдёт по неполному срезу, а результат будет выглядеть полным.
 */
export function zapisi_po_seq(put, seqs) {
  const nuzhno = new Set(seqs);
  const raspakovka = raspakovat(put);
  if (raspakovka.pochemu) return { zapisi: [], najdeno: 0, prosili: nuzhno.size, ...raspakovka };
  const zapisi = [];
  for (const stroka of raspakovka.tekst.split('\n')) {
    if (!stroka) continue;
    let d;
    try { d = JSON.parse(stroka); } catch { continue; }
    if (nuzhno.has(d?.seq)) zapisi.push(d);
  }
  zapisi.sort((a, b2) => (a.seq ?? 0) - (b2.seq ?? 0));
  return {
    zapisi,
    najdeno: zapisi.length,
    prosili: nuzhno.size,
    kadrov: raspakovka.kadrov,
    ne_raspakovalos: raspakovka.ne_raspakovalos,
  };
}

/**
 * Собрать транскрипт для модели: только речь, без служебного шума.
 *
 * ГДЕ НЕ ПРИМЕНЯЕТСЯ: берём user/message и assistant/message. Всё остальное
 * (чанки потока, служебные метки) в транскрипт не идёт — их в затенённом диапазоне
 * большинство по числу, но не по смыслу.
 */
export function sobrat_transkript(zapisi) {
  const kuski = [];
  for (const z of zapisi) {
    const t = z?.type;
    if (t !== 'user/message' && t !== 'assistant/message') continue;
    const d = z.data ?? {};
    const soderzh = d.content ?? d.message?.content ?? d.text ?? '';
    const tekst = Array.isArray(soderzh)
      ? soderzh.map((b) => b?.text ?? '').filter(Boolean).join('\n')
      : String(soderzh ?? '');
    if (!tekst.trim()) continue;
    kuski.push((t === 'user/message' ? 'ЧЕЛОВЕК: ' : 'АГЕНТ: ') + tekst);
  }
  return kuski.join('\n\n');
}
