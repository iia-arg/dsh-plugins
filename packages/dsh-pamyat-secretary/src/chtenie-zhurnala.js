/**
 * RU: Чтение событий по seq распаковывает многокадровый zstd по кадрам. Поддерживаемый zstdDecompressSync на целом файле мог вернуть только первый кадр без ошибки, превращая отказ в правдоподобный короткий журнал. Внешняя утилита не требуется; счёт кадров и отказов позволяет назвать неполное чтение.
 * EN: Reading events by seq decompresses multi-frame zstd frame by frame. The supported zstdDecompressSync could return only the first frame of a whole file without error, turning failure into a plausible short journal. No external utility is required; frame and failure counts expose incomplete reading.
 */
import { zstdDecompressSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

/**
 * RU: Магическое число кадра zstd по RFC 8878 §4.1.
 * EN: The zstd frame magic number from RFC 8878 §4.1.
 */
const MAGIYA = Buffer.from([0x28, 0xB5, 0x2F, 0xFD]);

/**
 * RU: Распаковать кадры в {tekst,kadrov,ne_raspakovalos}. Ошибка кадра учитывается числом, чтобы пропуск не выглядел полным коротким журналом.
 * EN: Decompress frames into {tekst,kadrov,ne_raspakovalos}. Count frame errors so omitted data cannot appear to be a complete short journal.
 */
export function raspakovat(put) {
  // RU: Отсутствующий файл получает названный отказ с предметом, не сырой ENOENT без пути и контекста чтения.
  // EN: Return an explicit missing-file failure identifying the subject, not a raw ENOENT without the path and reading context.
  if (!put) return { tekst: '', kadrov: 0, ne_raspakovalos: 0, pochemu: 'путь к журналу сессии не задан (ключ putZhurnala пуст)' };
  let b;
  try { b = readFileSync(put); }
  catch (e) {
    return { tekst: '', kadrov: 0, ne_raspakovalos: 0,
             pochemu: 'журнал сессии не прочитан (' + (e?.code ?? e?.message) + '): ' + put };
  }
  const poz = [];
  let i = 0;
  while ((i = b.indexOf(MAGIYA, i)) !== -1) {
    // RU: После магии проверить Frame_Header_Descriptor: Reserved/Unused биты 3 и 4 должны быть 0. Иначе совпадение может быть внутри payload, не началом кадра.
    // EN: Check Frame_Header_Descriptor after magic: Reserved/Unused bits 3 and 4 must be 0. Otherwise the match may be inside the payload rather than a frame start.
    const fhd = b[i + 4];
    if (fhd !== undefined && (fhd & 0b00011000) !== 0) { i += 4; continue; }
    poz.push(i); i += 4;
  }
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
 * RU: Получить заданные seq и число ненайденных. Неполный срез должен отличаться от полного, поскольку меняет вход дистилляции.
 * EN: Fetch the requested seq values and report the missing count. An incomplete slice must differ from a complete one because it changes distillation input.
 */
export function zapisi_po_seq(put, seqs, sobytiyaSessii = undefined) {
  const nuzhno = new Set(seqs);
  // RU: Явная история принадлежит событию той же сессии. Негодная переданная история не разрешает fallback на посторонний файл.
  // EN: An explicit history belongs to the same session as the event. Invalid supplied history does not allow fallback to an unrelated file.
  if (sobytiyaSessii !== undefined) {
    const empty = { zapisi: [], najdeno: 0, prosili: nuzhno.size, kadrov: 0, ne_raspakovalos: 0, neJSON: 0 };
    if (!Array.isArray(sobytiyaSessii)) return { ...empty, pochemu: 'история сессии события недоступна' };
    const zapisi = sobytiyaSessii.filter(e => nuzhno.has(e?.seq)).sort((a,b) => a.seq-b.seq);
    if (zapisi.length !== nuzhno.size || new Set(zapisi.map(e => e.seq)).size !== nuzhno.size) {
      return { ...empty, pochemu: `срез сессии неполон или неоднозначен: найдено ${zapisi.length} из ${nuzhno.size}` };
    }
    return { ...empty, zapisi, najdeno: zapisi.length };
  }
  const raspakovka = raspakovat(put);
  if (raspakovka.pochemu) return { zapisi: [], najdeno: 0, prosili: nuzhno.size, ...raspakovka };
  const zapisi = [];
  let neJSON = 0;   // RU: Посчитать строки не-JSON: их тихий пропуск скрывал бы неполноту журнала.
  // EN: Count non-JSON lines: silently skipping them would hide an incomplete journal.
  for (const stroka of raspakovka.tekst.split('\n')) {
    if (!stroka) continue;
    let d;
    try { d = JSON.parse(stroka); } catch { neJSON++; continue; }
    if (nuzhno.has(d?.seq)) zapisi.push(d);
  }
  zapisi.sort((a, b2) => (a.seq ?? 0) - (b2.seq ?? 0));
  return {
    zapisi,
    najdeno: zapisi.length,
    prosili: nuzhno.size,
    kadrov: raspakovka.kadrov,
    ne_raspakovalos: raspakovka.ne_raspakovalos,
    neJSON,
  };
}

/**
 * RU: Транскрипт берёт user/message и assistant/message, исключая чанки и служебные метки. thinking/reasoning остаётся на месте как черновик между CHERNOVIK_NACHALO/KONEC; rassuzhdeniya=false убирает его, включая ответ только из черновика. Промпт использует черновик для причин, а знания — только подтверждённые. Другие сборщики могут брать только text, поэтому сравнимы сообщения, не обязательно число знаков.
 * EN: The transcript takes user/message and assistant/message, excluding chunks and service markers. thinking/reasoning stays in position as a draft between CHERNOVIK_NACHALO/KONEC; rassuzhdeniya=false removes it, including draft-only answers. Prompts use drafts for reasoning and confirmed material for knowledge. Other builders may take only text, so message counts are comparable, but character counts need not be.
 */
export const CHERNOVIK_NACHALO = '[ЧЕРНОВИК РАССУЖДЕНИЙ АГЕНТА — не знание]';
export const CHERNOVIK_KONEC = '[КОНЕЦ ЧЕРНОВИКА]';
export function sobrat_transkript(zapisi, { rassuzhdeniya = true } = {}) {
  const kuski = [];
  for (const z of zapisi) {
    const t = z?.type;
    if (t !== 'user/message' && t !== 'assistant/message') continue;
    const d = z.data ?? {};
    const soderzh = d.content ?? d.message?.content ?? d.text ?? '';
    const tekst = Array.isArray(soderzh)
      ? soderzh.map((b) => {
          // RU: Поддерживаются thinking старых адаптеров и reasoning новых, включая перепакованную историю DSH 0.2; оба должны маркироваться черновиком.
          // EN: Support thinking from older adapters and reasoning from newer ones, including repacked DSH 0.2 history; both must be marked as drafts.
          if (b?.type !== 'thinking' && b?.type !== 'reasoning') return b?.text ?? '';
          return rassuzhdeniya && b.text?.trim() ? `${CHERNOVIK_NACHALO}\n${b.text}\n${CHERNOVIK_KONEC}` : '';
        }).filter(Boolean).join('\n')
      : String(soderzh ?? '');
    if (!tekst.trim()) continue;
    kuski.push((t === 'user/message' ? 'ЧЕЛОВЕК: ' : 'АГЕНТ: ') + tekst);
  }
  return kuski.join('\n\n');
}
