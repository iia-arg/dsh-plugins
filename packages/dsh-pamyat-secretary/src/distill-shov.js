/**
 * RU: Общее тело превращает срез событий в знания отдельной моделью. Событийный обработчик не ждёт длительный заход и не задерживает компакт. Явные пределы расхода применяются с объявлением охвата; 0 сохраняет отсутствие пользовательской обрезки.
 * EN: The shared body turns an event slice into knowledge through a separate model. The event handler does not wait for the long run or delay compaction. Explicit usage limits report coverage when applied; 0 preserves the absence of user-imposed truncation.
 */
import { zapisi_po_seq, sobrat_transkript } from './chtenie-zhurnala.js';
import { vzyat_klyuch, sprosit, sprositUporno, razobrat_massiv } from './distillyaciya.js';
import { vyborTem, KONEC_VYBORA, STATYA, KONEC_STATI, NET_RELEVANTNOGO, KLASSY, SUD_OTMENY, KONEC_SUDA , SUD_OTMENY_POVTOR, KONEC_SUDA_POVTOR} from './promty.js';
// RU: Предикат считает наличие [предположение], не правильность его применения. Длина измеряется отдельно; наличие метки не доказывает верную оценку знания.
// EN: The predicate detects [предположение], not whether it is used correctly. Measure length separately; a marker does not prove a correct knowledge assessment.
export const pomechenoPredpolozhenie = (telo) => typeof telo === 'string' && telo.includes('[предположение]');

/**
 * RU: Взять shadowedSeqs из события, не вычислять затенение по времени: временная граница могла бы разойтись с реальными событиями.
 * EN: Take shadowedSeqs from the event rather than infer shadowing from time; a time boundary could differ from the actual events.
 */
export function zatenennye(dannye) {
  const s = Array.isArray(dannye?.shadowedSeqs) ? dannye.shadowedSeqs.filter(Number.isInteger) : [];
  return { seqs: s, tokenov: dannye?.shadowedTokenCount ?? null };
}

// RU: Счёт заходов по срезу обнаруживает повторный вызов при нескольких apply в процессе, делая удвоение платного захода видимым. Он не доказывает причину доставки платформы и не обнаруживает дубли записей другим путём. Память процесса очищается перезапуском.
// EN: Counting runs per slice exposes repeated calls when apply runs several times in a process, making duplicated paid runs visible. It proves neither the platform delivery cause nor duplicate records created by another path. Restart clears this process memory.
const zahody_po_srezu = new Map();
const PAMYAT_SREZOV = 20;   // RU: Хранить только последние ключи, ограничивая рост счётчика в долгом процессе.
// EN: Retain only recent keys to bound counter growth in a long-running process.

/**
 * RU: Преобразовать потолок статьи: 0 возвращает undefined и включает единственный default maxTokens=393216 в sprosit. Функция вынесена для поведенческой пробы, без копии числа потолка.
 * EN: Resolve the article ceiling: 0 returns undefined and selects the sole maxTokens=393216 default in sprosit. Keep this as a function for behavior tests without copying the ceiling value.
 */
export function potolokStati(n) { return n > 0 ? n : undefined; }

// RU: Хвост — незатенённые события от первого shadowedSeq до compaction/start этого compactionId, исключая затенённое нынешним и прежними сжатиями. shadowedSeqs не обязан быть сплошным префиксом, поэтому граница после последнего потеряла бы оставшиеся сообщения. Поздние ходы не входят: обработка идёт асинхронно. Нет начала или годной границы — хвоста нет с названной причиной.
// EN: The continuation contains unshadowed events from the first shadowedSeq to compaction/start for this compactionId, excluding events shadowed by this and earlier compactions. shadowedSeqs need not be a contiguous prefix, so starting after its last entry would miss retained messages. Exclude later turns because processing is asynchronous. Missing start or invalid bounds means no continuation with a stated cause.
export function hvostSessii(sobytiya, seqs, dannye, opcii = {}) {
  if (!Array.isArray(sobytiya)) return { tekst: '', pochemu: 'история сессии события недоступна' };
  if (!seqs.length) return { tekst: '', pochemu: 'голова пуста' };
  const minSeq = Math.min(...seqs), maxSeq = Math.max(...seqs);
  const id = dannye?.compactionId;
  const start = id === undefined ? null : sobytiya.find((e) => e?.type === 'compaction/start' && e?.data?.compactionId === id);
  if (!start) return { tekst: '', pochemu: 'не найдено compaction/start этого сжатия' };
  if (!(start.seq > maxSeq)) return { tekst: '', pochemu: `начало сжатия seq ${start.seq} не после головы (последний ${maxSeq})` };
  const zatenyono = new Set(seqs);
  for (const e of sobytiya) {
    if (e?.type === 'compaction/summary' && e.seq < start.seq && Array.isArray(e.data?.shadowedSeqs)) e.data.shadowedSeqs.forEach((s) => zatenyono.add(s));
  }
  const zapisi = sobytiya.filter((e) => Number.isInteger(e?.seq) && e.seq > minSeq && e.seq < start.seq && !zatenyono.has(e.seq)).sort((x, y) => x.seq - y.seq);
  const rech = zapisi.filter((e) => sobrat_transkript([e], opcii));
  return { tekst: sobrat_transkript(zapisi, opcii), pochemu: null, ot: rech[0]?.seq, do: rech.at(-1)?.seq, soobshchenij: rech.length };
}

// RU: Вставленные сводки compact и dsh-pamyat-restore исключаются как пересказ уже разобранного исходника. Срез только из них пропускается без модели; смешанный разбирается без этих вставок. Смена source или имени плагина не распознаётся автоматически и может вернуть их в разбор.
// EN: Exclude compact and dsh-pamyat-restore summary inserts as retellings of sources already processed. Skip a slice containing only these inserts without a model call; process a mixed slice without them. A changed source shape or plugin name is not detected automatically and may reintroduce them.
const VSTAVKI_PAMYATI = new Set(['compact', 'dsh-pamyat-restore']);
// RU: История и признак сводки берутся службой ядра: DSH 0.1.7+/0.2.0 использует snapshotEvents(), compact-checkpoint и plugin:<name>. apply подключает помощник, без него сохраняется прежний путь 0.1.1. Импорт ядра по имени здесь не требуется.
// EN: Obtain history and summary detection from the core service: DSH 0.1.7+/0.2.0 uses snapshotEvents(), compact-checkpoint, and plugin:<name>. apply connects the helper; without it retain the earlier 0.1.1 path. No named core import is needed here.
let pomoshchnikYadra = null;
export function ustanovitPomoshchnikYadra(pm) {
  pomoshchnikYadra = typeof pm?.sobytiyaSessii === 'function' && typeof pm?.eSvodkaSzhatiya === 'function' ? pm : null;
  return pomoshchnikYadra !== null;
}
export const chitatSobytiya = (session) => (pomoshchnikYadra ? pomoshchnikYadra.sobytiyaSessii(session) : session?.events);
export const eSvodkaSzhatiya = (e) => (pomoshchnikYadra
  ? pomoshchnikYadra.eSvodkaSzhatiya(e, ['dsh-pamyat-restore'])
  : e?.type === 'user/message' && e?.data?.source?.kind === 'plugin' && VSTAVKI_PAMYATI.has(e.data.source.plugin));
export function srezTolkoIzSvodok(sobytiya, seqs) {
  if (!Array.isArray(sobytiya) || !seqs?.length) return false;
  const nuzhno = new Set(seqs);
  const rech = sobytiya.filter((e) => nuzhno.has(e?.seq) && (e.type === 'user/message' || e.type === 'assistant/message'));
  return rech.length > 0 && rech.every(eSvodkaSzhatiya);
}

// RU: Суд после статьи получает действующих кандидатов ядра. ОТМЕНЯЕТ разрешён только для предложенного id старше источника; УСТАРЕЛА — при более новом кандидате, статья не пишется; УТОЧНЯЕТ — предложенный id, включая пониженную отмену обрезанного кандидата. НЕТ/неразобранный ответ не ставят отношение. Снятие отношения требует ручного отката. Не ловит перефраз вне кандидатов и устойчивую ошибку модели при годных id/времени.
// EN: After the article, judgment receives active core candidates. ОТМЕНЯЕТ requires a supplied id older than the source; УСТАРЕЛА requires a newer candidate and prevents writing the article; УТОЧНЯЕТ requires a supplied id, including a downgraded cancellation of a truncated candidate. НЕТ/unparsed replies set no relationship. Removing a relationship requires manual rollback. This misses paraphrases outside the candidates and persistent model errors with valid ids/times.
export const KLASSY_OTMENY = ['reshenie', 'poryadok', 'ogranichenie', 'vyvod', 'urok'];   // RU: Отменяемые классы зеркалят KLASSY_DEJSTVUYUSHCHIE ядра; суд видит 5 кандидатов, чтобы не ограничиваться первыми тремя по словесной близости.
// EN: Cancellable classes mirror the core KLASSY_DEJSTVUYUSHCHIE; judgment sees 5 candidates rather than only the first three by word similarity.
export const KANDIDATOV_SUDA = 5;
// RU: Потолок суда 32768 сохраняет бюджет рассуждения вместе с коротким ответом: 64 и 8192 могли исчерпаться до текста. Оплачивается фактический выход, не сам потолок; рассуждение остаётся включённым.
// EN: The judgment ceiling of 32768 leaves room for reasoning alongside a short answer: 64 and 8192 could run out before text. Billing follows actual output, not the ceiling itself; reasoning remains enabled.
export const BYUDZHET_SUDA = 32768;
// RU: Новизна времени сравнивается по концам источников одной сессии, иначе по времени записи. Более поздний отрезок считается новее только при более поздней записи: повторное имя сессии могло обнулить seq. Более ранний отрезок не новее при любом времени вставки. Знание, ошибочно взятое из хвоста, может выглядеть старше по источнику; УСТАРЕЛА тогда понижается до уточнения, не скрывает старшую запись.
// EN: Compare source endpoints within one session, otherwise insertion times. A later interval counts as newer only with a later insertion: reusing a session name could reset seq. An earlier interval is not newer regardless of insertion time. Knowledge wrongly taken from the continuation may appear older by source; downgrade УСТАРЕЛА to refinement then, retaining the older record.
const OTREZOK = /^(.+)#(\d+)-(\d+)(?:#okno\d+)?$/;
export function noveeIstochnika(c, vremyaIstochnika, istochnikStati) {
  const a = OTREZOK.exec(String(c?.istochnik ?? '')), b = OTREZOK.exec(String(istochnikStati ?? ''));
  if (a && b && a[1] === b[1]) return Number(a[3]) > Number(b[3]) && Number.isFinite(vremyaIstochnika) && c?.sozdano > vremyaIstochnika;
  return Number.isFinite(vremyaIstochnika) && c?.sozdano > vremyaIstochnika;
}
// RU: Кандидат ограничен PREDEL_KANDIDATA с пометкой [показано N из M]. ОТМЕНЯЕТ обрезанного понижается до УТОЧНЯЕТ: отмена требует полного кандидата. Полностью видимую частичную поправку модель всё ещё может неверно отменить. Одно поле отношения не позволяет одной статьёй уточнить A и отменить B.
// EN: Bound a candidate by PREDEL_KANDIDATA and mark [shown N of M]. Downgrade ОТМЕНЯЕТ on a truncated candidate to УТОЧНЯЕТ: cancellation requires a complete candidate. A fully visible partial correction can still be wrongly cancelled by the model. One relationship field cannot refine A and cancel B with one article.
export const PREDEL_KANDIDATA = 8000;
const obrezan = (c) => String(c?.soderzhim ?? '').length > PREDEL_KANDIDATA;
export function razobratSud(tekst, spisok, vremyaIstochnika, istochnikStati, { povtor = false } = {}) {
  const stroka = String(tekst ?? '').trim().split('\n').at(-1)?.trim().replace(/^[«"'\s]+|[»"'.\s]+$/g, '') ?? '';
  // RU: ПОВТОРЯЕТ допустим только при sudPovtor; выключенный режим не принимает этот формат ответа.
  // EN: ПОВТОРЯЕТ is valid only with sudPovtor; the disabled mode does not accept this answer format.
  const m = (povtor ? /^(ОТМЕНЯЕТ|УСТАРЕЛА|УТОЧНЯЕТ|ПОВТОРЯЕТ)\s*:\s*(\d+)$|^(НЕТ)$/i : /^(ОТМЕНЯЕТ|УСТАРЕЛА|УТОЧНЯЕТ)\s*:\s*(\d+)$|^(НЕТ)$/i).exec(stroka);
  if (!m) return { vid: 'nerazobrano', pochemu: 'ответ суда не по форме: «' + stroka.slice(0, 80) + '»' };
  if (m[3]) return { vid: 'net' };
  const k = Number(m[2]);
  const c = (spisok ?? []).find((x) => x.id === k);
  if (!c) return { vid: 'nerazobrano', pochemu: `id ${k} не из предложенных (${(spisok ?? []).map((x) => x.id).join(', ')})` };
  const novee = noveeIstochnika(c, vremyaIstochnika, istochnikStati);
  // RU: УТОЧНЯЕТ не ограничено временем, поскольку не скрывает запись; направление новая→старая по id проверяет ядро.
  // EN: УТОЧНЯЕТ has no time restriction because it does not hide records; the core checks the new→old id direction.
  if (m[1].toUpperCase() === 'УТОЧНЯЕТ') return { vid: 'utochnyaet', k };
  if (m[1].toUpperCase() === 'ПОВТОРЯЕТ') return { vid: 'povtoryaet', k };
  if (m[1].toUpperCase() === 'ОТМЕНЯЕТ') {
    if (novee) return { vid: 'nerazobrano', pochemu: `запись ${k} новее источника статьи — статья из более старого отрезка её не отменяет` };
    return obrezan(c) ? { vid: 'utochnyaet', k, ponizheno: true } : { vid: 'otmenyaet', k };
  }
  // RU: УСТАРЕЛА относительно не более новой k понижается до УТОЧНЯЕТ с отметкой в kto/журнале, без второго мнения. Границы: связь может быть ложной по предмету; при настоящем противоречии старшая запись останется видимой, хотя требовалась отмена.
  // EN: Downgrade УСТАРЕЛА against a k that is not newer to УТОЧНЯЕТ, annotating kto/the journal without a second opinion. Limits: the relationship may be topically wrong; with a real contradiction, the older record remains visible although cancellation was needed.
  return novee ? { vid: 'ustarela', k } : { vid: 'utochnyaet', k, ponizhenoOhranoj: true };
}
const vremyaIso = (t) => (Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16) + 'Z' : 'неизвестно');
export function tekstSuda(telo, klass, vremyaIstochnika, spisok, istochnikStati) {
  return `НОВАЯ СТАТЬЯ (класс ${klass}; её источник — разговор до ${vremyaIso(vremyaIstochnika)}):\n${telo}\n\nДЕЙСТВУЮЩИЕ ЗАПИСИ:\n`
    + spisok.map((x) => `[id ${x.id}] класс ${x.klass}, записана ${vremyaIso(x.sozdano)}`
      + (noveeIstochnika(x, vremyaIstochnika, istochnikStati) ? ' — НОВЕЕ источника статьи' : '')
      + `\n${String(x.soderzhim ?? '').slice(0, PREDEL_KANDIDATA)}`
      + (obrezan(x) ? `\n[показано ${PREDEL_KANDIDATA} из ${String(x.soderzhim).length} знаков — запись ОБРЕЗАНА, целиком ты её не видишь]` : '')).join('\n\n');
}

// RU: После неуспеха вызывающий забывает ключ среза для повтора, после успеха сохраняет. Каждая тема получает ровно один исход; сумма равна числу тем. Бюджетный обрыв текста и [предположение] — дополнительные отметки, не вторые исходы. Расхождение охвата объявляется как ошибка учёта.
// EN: After failure, the caller forgets the slice key to permit retry; retain it after success. Each topic receives exactly one outcome, whose sum must equal topic count. Text truncation and [предположение] are extra annotations, not second outcomes. Report coverage mismatch as an accounting error.
export const ISHODY_TEMY = ['zapisano', 'ustarelo', 'povtorovSuda', 'pusto', 'otkazov', 'chuzhoiKlass', 'ostalosOperativnom', 'neOtpravleno', 'drugoiIshod'];
export function stroka_razneseno(itog) {
  const r = ISHODY_TEMY.reduce((a, k) => a + (Number(itog?.[k]) || 0), 0);
  itog.razneseno = r;
  return r === itog.tem ? `разнесено ${r} из ${itog.tem} тем — сходится`
    : `🔴 разнесено ${r} из ${itog.tem} тем — НЕ СХОДИТСЯ (${r > itog.tem ? 'тема посчитана дважды' : 'тема без исхода'}: ${ISHODY_TEMY.map((k) => k + ' ' + (Number(itog?.[k]) || 0)).join(', ')})`;
}

export function zabytZahodPoSrezu(kluch) { if (kluch) zahody_po_srezu.delete(kluch); }

// RU: Ключ среза использует min/max seq, не порядок массива. Один алгоритм нужен заходу, метке и забыванию ключа, иначе неудачный срез мог бы навсегда остаться заблокированным.
// EN: Build the slice key from min/max seq, not array order. Runs, markers, and key removal need the same algorithm, or a failed slice could remain blocked permanently.
export function kluchSreza(seansId, seqs) { return seqs.length ? `${seansId}#${Math.min(...seqs)}-${Math.max(...seqs)}` : null; }

export async function distillirovat({ putZhurnala, sobytiyaSessii, dannye, seansId, nastrojka, krik, zapisat, zadanie, otbroshennoe, sohranitProzu, blizhajshaya, dejstvuyushchie, otnoshenie, ustarevshee, maska, povtor = null, temyOkna }) {
  const { seqs, tokenov } = zatenennye(dannye);
  const kluch_sreza = kluchSreza(seansId, seqs);
  if (kluch_sreza) {
    const bylo = zahody_po_srezu.get(kluch_sreza) ?? 0;
    zahody_po_srezu.set(kluch_sreza, bylo + 1);
    if (zahody_po_srezu.size > PAMYAT_SREZOV) {
      zahody_po_srezu.delete(zahody_po_srezu.keys().next().value);
    }
    if (bylo > 0) {
      krik(`🔴 заход по срезу ${kluch_sreza} УЖЕ БЫЛ (это ${bylo + 1}-й): пакет смонтирован ` +
           'несколько раз в одном процессе, и событие дошло до нескольких экземпляров. ' +
           'Заход НЕ повторяю — он платный. Лечится стражем одиночного монтажа либо ' +
           'выяснением, почему платформа доставляет событие всем экземплярам');
      return { ishod: 'zahod-uzhe-byl', zahodov: bylo + 1, srez: kluch_sreza };
    }
  }
  if (seqs.length === 0) {
    krik('дистилляция пропущена: в событии нет shadowedSeqs — затенённый диапазон неизвестен. ' +
         'Это НЕ «нечего извлекать»: мы не знаем, что затенено');
    return { ishod: 'net-diapazona' };
  }
  if (tokenov !== null && tokenov < nastrojka.minTokenov) {
    krik(`дистилляция пропущена: затенено ${tokenov} токенов при пороге ${nastrojka.minTokenov} — ` +
         'срез мал, знания в нём маловероятны, а вызов платный. Порог настраивается ключом minTokenov');
    return { ishod: 'srez-mal', tokenov };
  }

  const v = zapisi_po_seq(putZhurnala, seqs, sobytiyaSessii);
  if (v.pochemu) { krik('дистилляция не начата: ' + v.pochemu); return { ishod: 'net-zhurnala' }; }
  if (v.najdeno < v.prosili) {
    // RU: Неполный срез объявляется числом пропусков; это не тихая полнота и не обязательно отказ всего захода.
    // EN: Report an incomplete slice through missing counts; it is neither silent completeness nor necessarily failure of the whole run.
    krik(`⚠️ в журнале найдено ${v.najdeno} записей из ${v.prosili} затенённых, не-JSON строк ${v.neJSON ?? 0} — ` +
         'дистилляция пойдёт по НЕПОЛНОМУ срезу, а результат будет выглядеть полным');
  }
  const RASSUZHDENIYA = { rassuzhdeniya: nastrojka.rassuzhdeniya !== false };   // RU: Режим включения рассуждений определяется в index.js при каждом входе, не фиксируется навсегда при загрузке.
  // EN: Resolve reasoning inclusion in index.js on each entry rather than freezing it at load time.
  const vremena = v.zapisi.map((e) => Number(e?.time)).filter(Number.isFinite);
  const vremyaIstochnika = vremena.length ? Math.max(...vremena) : NaN;   // RU: Определить конец отрезка-источника для проверки возраста кандидатов.
  // EN: Determine the source interval end for candidate-age checks.
  const sudVozmozhen = typeof dejstvuyushchie === 'function' && typeof otnoshenie === 'function';
  const svodokVSreze = v.zapisi.filter(eSvodkaSzhatiya).length;
  if (svodokVSreze) krik(`из среза исключено сводок прошлых сжатий: ${svodokVSreze} — знанием их не берём (вынуто из оригинала)`);
  let transkript = sobrat_transkript(v.zapisi.filter((e) => !eSvodkaSzhatiya(e)), RASSUZHDENIYA);
  // RU: Маска внешнего входа стоит в общем теле до окон и вызовов, поэтому охватывает сжатие и ходовой вход. Использует только ctx.pamyat.zamaskirovatVhod. Нет метода или достигнут предел — fail-closed без внешнего вызова. Граница детектора остаётся: произвольный URL-пароль, короткий MYVAR и токен без AA могут пройти.
  // EN: Run the external-input mask in the shared body before windows and calls, covering compaction and turn-based entry. Use only ctx.pamyat.zamaskirovatVhod. Missing method or exhausted limit means fail-closed with no external call. Detector limits remain: arbitrary URL passwords, short MYVAR values, and tokens without AA may pass.
  if (typeof maska !== 'function') {
    krik('дистилляция НЕ начата: маски входа нет — ядро без zamaskirovatVhod; текст внешней модели без маски не уходит');
    return { ishod: 'net-maski' };
  }
  const zamaskirovatVhodIliOtkaz = (tekst, chto) => {
    let m;
    try { m = maska(tekst); } catch (e) { krik('внешний запрос НЕ отправлен: маска входа (' + chto + ') отказала [' + (e?.code ?? e?.name ?? 'ошибка') + ']; текст модели не уходит'); return null; }
    if (!m || typeof m.tekst !== 'string' || m.predelDostignut || (m.zameneno && !Array.isArray(m.klassy))) {
      krik(`внешний запрос НЕ отправлен: маска входа (${chto}) не справилась${m?.predelDostignut ? ' — упёрлась в предел' : ''}; текст модели не уходит`);
      return null;
    }
    if (m.zameneno) krik(`вход модели замаскирован (${chto}): замен ${m.zameneno}, классы ${m.klassy.join(', ')}`);
    return m.tekst;
  };
  {
    const t = zamaskirovatVhodIliOtkaz(transkript, 'голова');
    if (t === null) return { ishod: 'net-maski' };
    transkript = t;
  }
  if (!transkript.trim()) {
    krik(`дистилляция пропущена: в ${v.najdeno} затенённых записях нет речи (только служебные события)`);
    return { ishod: 'net-rechi' };
  }
  // RU: Размер окна пустой/0 даёт один полный транскрипт; положительное число дробит на окна заданного размера. Это настройка глубины: дробление даёт более мелкие темы, а не обязательная обрезка входа.
  // EN: An absent/0 window size uses one complete transcript; a positive value splits it into windows of that size. This controls depth: splitting creates finer topics rather than mandatory input truncation.
  const RAZMER_OKNA = Number(nastrojka.razmerOkna) > 0 ? Number(nastrojka.razmerOkna) : Infinity;
  // RU: Явный predelOkon ограничивает окна для стендов и дорогих разборов; default 0 ничего не отбрасывает.
  // EN: Explicit predelOkon bounds windows for tests and costly runs; default 0 discards nothing.
  // ⚠️ ГДЕ ОСТАЁТСЯ ВОЗМОЖНОСТЬ ОГРАНИЧИТЬ: ключ predelOkon читается и работает, если задан
  // ЯВНО, — он нужен стендам и разбору дорогих случаев. Умолчание 0 = «не ограничивать»:
  // механизм, режущий по умолчанию, однажды отрежет молча.
  // EN: Explicit predelOkon remains available for tests and costly analyses. Default 0 means no limit:
  // a mechanism that truncates by default will eventually discard content silently.
  const PREDEL_OKON = Number(nastrojka.predelOkon) > 0 ? Number(nastrojka.predelOkon) : 0;
  const VSEGO_ZNAKOV = transkript.length;
  let OKNA = [];
  if (RAZMER_OKNA === Infinity) OKNA = [transkript];
  else for (let i = 0; i < VSEGO_ZNAKOV; i += RAZMER_OKNA) OKNA.push(transkript.slice(i, i + RAZMER_OKNA));
  if (OKNA.length === 0) OKNA = [transkript];
  let obrezan = 0;
  // RU: При превышении предела оставить последние окна и объявить охват числами.
  // EN: When the limit is exceeded, retain the latest windows and report coverage counts.
  if (PREDEL_OKON > 0 && OKNA.length > PREDEL_OKON) {
    obrezan = transkript.length;
    const lishnih = OKNA.length - PREDEL_OKON;
    // RU: Оставить хвост как более свежую часть и объявить размер обрезки.
    // EN: Retain the continuation as the more recent part and report the truncation size.
    const nachalo = OKNA.slice(0, lishnih).join('');
    OKNA = OKNA.slice(-PREDEL_OKON);
    transkript = OKNA.join('');
    const dolya = Math.round((nachalo.length / obrezan) * 100);
    krik(`ОХВАТ НЕ ПОЛНЫЙ: окон было ${OKNA.length + lishnih}, предел ${PREDEL_OKON}, обрезано ${lishnih}. ` +
         `Знаков было ${obrezan}, взято ${transkript.length}, ` +
         `отброшено с НАЧАЛА ${nachalo.length} (${dolya}%). ` +
         'Предел настраивается ключом predelOkon; молча обрезать нельзя — знания из начала не попадут');
    // RU: Отброшенное начало сохраняется отдельно, поскольку одноразовое событие и ротация журнала не гарантируют повторное извлечение. Это не доказывает преимущество хвоста перед началом, а предотвращает тихую потерю независимо от этого выбора. Каталог автоматически не чистится.
    // EN: Save the discarded beginning separately because a one-time event and journal rotation do not guarantee later recovery. This does not prove the continuation is preferable to the beginning; it prevents silent loss regardless of that choice. The directory is not cleaned automatically.
    if (typeof otbroshennoe === 'function') {
      try { otbroshennoe({ tekst: nachalo, kluchSreza: kluch_sreza, vsego: obrezan, vzyato: transkript.length }); }
      catch (e) { krik('🔴 отброшенное начало НЕ сохранено (' + (e?.message ?? e) + '): ' + nachalo.length + ' знаков потеряны насовсем.'); }
    } else {
      krik('⚠️ отброшенное начало НЕ сохранено: обработчик не передан (старый монтаж). ' +
           'Это не «нечего было сохранять» — текст есть, и он потерян.');
    }
  }

  const k = vzyat_klyuch(nastrojka.klyuch);
  if (!k.klyuch) { krik('дистилляция не начата: ' + k.pochemu); return { ishod: 'net-klyucha' }; }

  // RU: Адрес берётся из настройки только при наличии; единственное умолчание живёт в distillyaciya.js. Подмена позволяет проверять расход без платного провайдера.
  // EN: Use the configured address only when supplied; the sole default lives in distillyaciya.js. Replacement allows usage checks without a paid provider.
  const adres = nastrojka.adres || undefined;

  // RU: Расход собирается из usage, включая вызовы с отказом или stop_reason=max_tokens, не оценивается длиной текста. Накопитель объявлен до первого вызова: ранняя ветка отказа тоже обязана вернуть расход без ReferenceError.
  // EN: Collect usage, including failed calls and stop_reason=max_tokens, rather than estimate it from text length. Declare the accumulator before the first call: early failure paths must also return usage without ReferenceError.
  const rashod = { vyzovov: 0, vhod: 0, vyhod: 0, keshChtenie: 0, keshZapis: 0 };
  const uchest = (u) => {
    rashod.vyzovov++;
    if (!u) return;
    rashod.vhod += Number(u.input_tokens ?? 0);
    rashod.vyhod += Number(u.output_tokens ?? 0);
    rashod.keshChtenie += Number(u.cache_read_input_tokens ?? 0);
    rashod.keshZapis += Number(u.cache_creation_input_tokens ?? 0);
  };

  // RU: Допустимые классы спрашиваются у ядра при заходе. Если нужного метода нет, используется весь список с объявленной границей, без молчаливого сужения.
  // EN: Ask the core for eligible classes at run time. If the required method is absent, use the full list with an explicit caveat rather than silently narrow it.
  const godnye = (typeof nastrojka.godnyeKlassy === 'function')
    ? nastrojka.godnyeKlassy() : KLASSY;
  if (godnye.length !== KLASSY.length) {
    krik(`классы для модели сужены по решению ЯДРА: предлагаем ${godnye.length} из ${KLASSY.length}`
       + `, исключены ${KLASSY.filter((k2) => !godnye.includes(k2)).join(', ')} `
       + '— их ядро без подтверждения человека не запишет, знание ушло бы файлом');
  }
  // RU: Накопители вне цикла окон сохраняют суммы всего захода, не только последнего окна.
  // EN: Accumulators outside the window loop retain totals for the run, not only the last window.
  const itog = { ishod: 'ok', tem: 0, zapisano: 0, pusto: 0, otkazov: 0, chuzhoiKlass: 0,
    ostalosOperativnom: 0, neOtpravleno: 0, drugoiIshod: 0, sudov: 0, otmen: 0, utochnenij: 0, ponizheno: 0, ustarelo: 0, ponizhenoOhranoj: 0, sudNerazobran: 0, vtoryhMnenij: 0, mneniyaRazoshlis: 0, povtorovSuda: 0, povtorPonizheno: 0 };
  let dlinnyh = 0, maxDlina = 0;
  let povtorov = 0, povtorov_udalos = 0, spasenoPovtorom = 0;
  const MNOZHITEL_BYUDZHETA = 2;   // RU: Один повтор недочитанного ответа удваивает бюджет; правило общее для статьи и выбора тем.
  // EN: One retry of a truncated answer doubles the budget; share the rule between articles and topic selection.
  let prozoy = 0;
  let okonOk = 0; const okonPlohih = [];
  // RU: Источник называет окно и доступен также итоговому отчёту вне цикла.
  // EN: The source names the window and remains available to the summary outside the loop.
  const istochnik_okna = (oi) => `${seansId}#${Math.min(...seqs)}-${Math.max(...seqs)}#okno${oi+1}`;
  // RU: Общие итоги и novizna объявлены вне цикла, чтобы не обнулиться окном и быть доступными после него. Ориентир извлекается из промпта, без второй константы; ошибка извлечения означает слепоту, не выдуманное умолчание.
  // EN: Declare shared totals and novizna outside the loop so windows do not reset them and the summary can access them. Extract the guideline from the prompt without a second constant; extraction failure means an unavailable measurement, not an invented default.
  const m_orientir = /Размер статьи — не более (\d+) знаков/.exec(STATYA);   // RU: Извлечение ориентира согласовано с последней инструкцией KONEC_STATI.
  // EN: Guideline extraction agrees with the final KONEC_STATI instruction.
  const ORIENTIR_STATI = m_orientir ? Number(m_orientir[1]) : null;
  if (!ORIENTIR_STATI) krik('⚠️ ориентир длины статьи НЕ ВЫНУТ из промпта: длину мерить не с чем. Это про прибор, не про статьи.');

  // RU: Сверка — вторичный учёт и не отменяет добытое знание. Её отказ считается отдельно: отсутствие результата не означает отсутствие близких записей.
  // EN: Similarity checking is secondary accounting and does not cancel extracted knowledge. Count its failures separately: no result does not mean no similar records.
  const novizna = { sravneno: 0, neSChem: 0, nechem: 0, sorvalos: 0, max: null, maxId: null, maxKlass: null, ne05: 0, ne07: 0, ne09: 0 };
  let novizna_nedostupna = typeof blizhajshaya !== 'function';


  // RU: vse подаёт продолжение в выбор тем и каждую статью; temy — только в выбор тем. Продолжение служит контекстом, не источником знания.
  // EN: vse supplies continuation to topic selection and every article; temy supplies it only to topic selection. Continuation is context, not a knowledge source.
  const REZHIM_HVOSTA = ['vse', 'temy', 'net'].includes(nastrojka.hvost) ? nastrojka.hvost : 'vse';   // RU: Умолчание оставляет продолжение в обоих видах вызова.
  // EN: The default retains continuation in both call types.
  let HVOST = '';
  if (REZHIM_HVOSTA !== 'net') {
    const h = hvostSessii(sobytiyaSessii, seqs, dannye, RASSUZHDENIYA);
    if (h.pochemu) krik(`хвост дистиллятору НЕ подан (${h.pochemu}) — разбор по одной голове`);
    else if (h.tekst.trim()) {
      const hv = zamaskirovatVhodIliOtkaz(h.tekst, 'хвост');   // RU: Продолжение уходит внешней модели и требует той же маски, что основной блок.
      // EN: Continuation goes to the external model and requires the same mask as the main block.
      if (hv === null) return { ishod: 'net-maski' };
      HVOST = hv; krik(`хвост дистиллятору: seq ${h.ot}–${h.do}, ${HVOST.length} знаков (${h.soobshchenij} сообщ., рассуждения ${RASSUZHDENIYA.rassuzhdeniya ? 'черновиком' : 'нет'}), режим «${REZHIM_HVOSTA}» — только контекст, знания из головы`); }
  }
  const sBlokami = (okno) => HVOST
    ? `=== РАЗГОВОР (темы и знания — только отсюда) ===\n${okno}\n\n=== ПРОДОЛЖЕНИЕ (для понимания разговора целиком; темы и знания отсюда НЕ выносить) ===\n${HVOST}\n=== КОНЕЦ ПРОДОЛЖЕНИЯ ===`
    : okno;

  for (let oi = 0; oi < OKNA.length; oi++) {
  const OKNO = OKNA[oi];
  let s1 = await sprositUporno({ klyuch: k.klyuch, model: nastrojka.model, system: vyborTem(godnye),
                             tekst: sBlokami(OKNO) + '\n\n' + KONEC_VYBORA, maxTokens: nastrojka.maxTokenovTem > 0 ? nastrojka.maxTokenovTem : undefined, ...(adres ? { adres } : {}) });
  // RU: Выбор тем делит max_tokens между рассуждением и текстом. ne-dochitala допускает один повтор с удвоенным бюджетом, pusto — с тем же; окончательный или сетевой отказ этого повтора не получает. После неуспеха всё окно сохраняется заданием, не считается пустым.
  // EN: Topic selection shares max_tokens between reasoning and text. ne-dochitala permits one retry with double budget, pusto with the same budget; permanent or network failures get no such retry. After failure, retain the entire window as a task rather than counting it empty.
  if (s1.ishod === 'ne-dochitala' || s1.ishod === 'pusto') {
    uchest(s1.usage);   // RU: Usage первого вызова учитывается сразу; повтор будет учтён отдельно.
    // EN: Account for the first call usage immediately; account for a retry separately.
    const bolshe = s1.ishod === 'ne-dochitala';
    // RU: В первом вызове и повторе maxTokenovTem<=0 выбирает undefined и потолок sprosit вместо нулевого бюджета. Обрыв ответа этим условием не исключается.
    // EN: For the first call and retry, maxTokenovTem<=0 selects undefined and the sprosit ceiling instead of a zero budget. This condition does not rule out truncation.
    const budget = nastrojka.maxTokenovTem > 0
      ? (bolshe ? nastrojka.maxTokenovTem * MNOZHITEL_BYUDZHETA : nastrojka.maxTokenovTem)
      : undefined;
    krik(`выбор тем окна ${oi + 1}/${OKNA.length} [${s1.ishod}]: ${s1.pochemu}. ПОВТОРЯЮ один раз`
       + (bolshe ? `, бюджет ${nastrojka.maxTokenovTem} → ${budget} (причину назвала модель)` : ' тем же запросом'));
    povtorov++;
    const s1b = await sprositUporno({ klyuch: k.klyuch, model: nastrojka.model, system: vyborTem(godnye),
                               tekst: sBlokami(OKNO) + '\n\n' + KONEC_VYBORA, maxTokens: budget, ...(adres ? { adres } : {}) });
    if (s1b.ishod === 'ok') {
      povtorov_udalos++; if (bolshe) spasenoPovtorom++;
      krik(`повтор выбора тем окна ${oi + 1}/${OKNA.length} УДАЛСЯ: окно не потеряно`);
    } else {
      krik(`🔴 повтор выбора тем окна ${oi + 1}/${OKNA.length} не помог [${s1b.ishod}]`);
    }
    s1 = s1b;
  }
  // RU: После первого вызова любой ранний результат несёт расход: отказ не должен объявлять оплаченный заход бесплатным.
  // EN: After the first call, every early result carries usage: failure must not make a billed run appear free.
  if (s1.ishod !== 'ok') {
    uchest(s1.usage);
    krik('выбор тем не состоялся [' + s1.ishod + ']: ' + s1.pochemu);
    okonPlohih.push(`${oi + 1}/${OKNA.length}: ${s1.ishod}`);
    // RU: Окно без выбранных тем сохраняется заданием со всеми seq среза: неудачный выбор потерял бы всё окно, не одну статью.
    // EN: Retain a window with failed topic selection as a task with every slice seq: failed selection risks the whole window, not one article.
    if (typeof zadanie === 'function') {
      try { zadanie({ tema: `(выбор тем окна ${oi + 1}/${OKNA.length} — знания окна не разобраны)`, kluchSreza: kluch_sreza, seqs, tokenov, prichina: s1.pochemu, ishod: 'vybor-tem-' + s1.ishod }); }
      catch (e) { krik(`задание на повтор окна не положено: ${e?.message ?? e}`); }
      itog.zadanij = (itog.zadanij ?? 0) + 1;
    } else {
      krik('🔴 задание на повтор окна НЕ положено: записыватель заданий не передан — знания окна останутся только в журнале');
    }
    if (s1.okonchatelno) { itog.ishod = s1.ishod; itog.okonchatelno = true; krik(`окно ${oi + 1}/${OKNA.length}: отказ ОКОНЧАТЕЛЬНЫЙ — остальные окна не пробуем`); break; }
    continue;
  }
  uchest(s1.usage);
  const m = razobrat_massiv(s1.tekst);
  if (!m.godno) {
    krik('[proza] темы не разобраны — ответ модели НЕ JSON-массив: ' + m.pochemu);
    if (typeof sohranitProzu === 'function') {
      try { sohranitProzu({ tekst: s1.tekst, pochemu: m.pochemu }); }
      catch (e) { krik('🔴 сырой ответ [proza] НЕ сохранён: ' + (e?.message ?? e)); }
    }
    okonPlohih.push(`${oi + 1}/${OKNA.length}: proza`);
    prozoy++;
    continue;
  }

  const vsegoTem = m.spisok.length;
  if (vsegoTem === 0) { krik(`окно ${oi + 1}/${OKNA.length}: тем не выбрано`); okonOk++; continue; }
  // RU: 0 берёт все темы; срез применяется только при явном положительном пределе.
  // EN: 0 takes every topic; selection truncation applies only to an explicit positive limit.
  const PT = Number(nastrojka.predelTem) > 0 ? Number(nastrojka.predelTem) : 0;
  const temy = PT > 0 ? m.spisok.slice(0, PT) : m.spisok;
  if (vsegoTem > temy.length) {
    krik(`тем выбрано ${vsegoTem}, берём ${temy.length} (предел predelTem ${PT || 'снят'}) — ` +
         'остальные НЕ записаны, и это не «их не было»');
  }

  // RU: Собирать только источники, реально переданные zapisat: вызывающий проверит записи памяти по ним, не по нашему счётчику.
  // EN: Collect only sources actually passed to zapisat: the caller checks memory records by them, not by our counter.
  { const io = istochnik_okna(oi); if (!(itog.istochniki ??= []).includes(io)) itog.istochniki.push(io); }
  itog.temNajdeno = (itog.temNajdeno ?? 0) + vsegoTem;   // RU: Число тем — отдельный знаменатель охвата. temy_po_oknam дописывается в метку до статей, чтобы прерванное задание сохраняло план разбора.
  // EN: Topic count is a separate coverage denominator. Append temy_po_oknam to the marker before articles so an interrupted task retains the processing plan.
  if (typeof temyOkna === 'function') { try { temyOkna({ okno: oi + 1, tem: temy.length }); } catch (e) { krik(`число тем окна ${oi + 1} в метку НЕ записано: ${e?.message ?? e}`); } }
  itog.tem += temy.length;
  // RU: dlinnyh/maxDlina измеряют превышение инструкции без обрезки, переспроса или изменения промпта. novizna собирает словесную близость, не решение merged/blocked. Неокончательные отказы считаются подряд; три подряд прерывают заход, тогда как один сбой посреди успехов не является достаточным признаком отказа провайдера.
  // EN: dlinnyh/maxDlina measure guideline overruns without truncation, reasking, or prompt changes. novizna collects word similarity, not a merged/blocked decision. Count nonfinal failures consecutively; three end the run, while one failure amid successes is insufficient evidence of provider failure.
  const PREDEL_PODRYAD = 3;
  let podryad = 0;
  // RU: На тему допускается ровно один дополнительный вызов для ne-dochitala с удвоенным бюджетом или pusto с прежним. Он не применяется к окончательному отказу или сетевому сбою. Если не помог, сохранить задание; общий множитель и счётчик расположены вне окон.
  // EN: Allow exactly one extra call per topic for ne-dochitala with double budget or pusto with the original budget. Do not apply it to permanent or network failures. If it fails, save a task; keep the shared multiplier and counter outside the windows.
  for (const t of temy) {
    const klass = godnye.includes(t?.kind) ? t.kind : null;
    if (!klass) { itog.chuzhoiKlass++; krik(`тема «${t?.theme}» пропущена: класс «${t?.kind}» вне объявленного списка`); continue; }
    // RU: let позволяет заменить результат исходного вызова ответом единственного повтора.
    // EN: let allows the sole retry response to replace the original call result.
    let s2 = await sprositUporno({ klyuch: k.klyuch, model: nastrojka.model, system: STATYA,
                               // RU: Транскрипт ставится первым, тема последней: одинаковый длинный префикс позволяет кэш провайдера между статьями. Разная тема в начале разрушила бы общий префикс.
                               // EN: Place the transcript first and the topic last: the shared long prefix enables provider caching between articles. A different topic at the beginning would destroy the shared prefix.
                               tekst: `${REZHIM_HVOSTA === 'vse' ? sBlokami(OKNO) : OKNO}\n\nТЕМА: ${t.theme}\n\n${KONEC_STATI}`, maxTokens: potolokStati(nastrojka.maxTokenovStati),
                               ...(adres ? { adres } : {}) });
    uchest(s2.usage);   // RU: Usage считается до разбора исхода, включая отказ. Единственный повтор относится только к двум исходам без текста.
    // EN: Account for usage before interpreting the outcome, including failures. The sole retry applies only to the two no-text outcomes.
    if (s2.ishod === 'pusto' || s2.ishod === 'ne-dochitala') {
      const bolshe = s2.ishod === 'ne-dochitala';
      // RU: При снятом пользовательском потолке остаётся потолок провайдера; эта ветка не удваивает неустановленный бюджет.
      // EN: With no user ceiling, the provider ceiling remains; this branch does not double an unset budget.
      const budget = nastrojka.maxTokenovStati > 0
        ? (bolshe ? nastrojka.maxTokenovStati * MNOZHITEL_BYUDZHETA : nastrojka.maxTokenovStati)
        : undefined;
      krik(`статья «${t.theme}» [${s2.ishod}]: ${s2.pochemu}. ПОВТОРЯЮ один раз`
         + (bolshe ? `, бюджет ${nastrojka.maxTokenovStati} → ${budget} (причину назвала модель)` : ' тем же запросом'));
      povtorov++;
      const s3 = await sprositUporno({ klyuch: k.klyuch, model: nastrojka.model, system: STATYA,
                                 tekst: `${REZHIM_HVOSTA === 'vse' ? sBlokami(OKNO) : OKNO}\n\nТЕМА: ${t.theme}\n\n${KONEC_STATI}`, maxTokens: budget,
                                 ...(adres ? { adres } : {}) });
      uchest(s3.usage);   // RU: Usage повтора также учитывается до разбора его результата.
      // EN: Account for retry usage before interpreting its result too.
      if (s3.ishod === 'ok') {
        povtorov_udalos++;
        if (bolshe) spasenoPovtorom++;
        krik(`повтор по теме «${t.theme}» УДАЛСЯ: знание не потеряно`);
        s2 = s3;
      } else {
        krik(`повтор по теме «${t.theme}» не помог [${s3.ishod}]: ${s3.pochemu}. Тема уходит заданием`);
        s2 = s3;
      }
    }
    if (s2.ishod !== 'ok') {
      itog.otkazov++;
      krik(`статья «${t.theme}» не написана [${s2.ishod}]: ${s2.pochemu}`);
      // RU: Задание без текста сохраняется сразу: одноразовый вызов иначе оставил бы только ротируемую строку отказа. Нет записывателя заданий — заход не падает, но явно объявляет, что задание не сохранено.
      // EN: Save a no-text task immediately: a one-time call would otherwise leave only a rotating failure log. With no task writer, the run does not crash but explicitly reports the task was not saved.
      if (typeof zadanie === 'function') {
        // RU: Задание содержит полный список seq, не только края: неупорядоченный массив не восстанавливается из первого/последнего, а повтор должен получить тот же срез.
        // EN: A task contains the complete seq list, not only endpoints: an unordered array cannot be reconstructed from first/last entries, and a retry must receive the same slice.
        try { zadanie({ tema: t.theme, kluchSreza: kluch_sreza, seqs, tokenov, prichina: s2.pochemu, ishod: s2.ishod }); }
        catch (e) { krik(`задание на повтор не положено: ${e?.message ?? e}`); }
        itog.zadanij = (itog.zadanij ?? 0) + 1;
      } else {
        krik('задание на повтор НЕ положено: записыватель заданий не передан '
           + '(секретарь старше alpha.19). Тема останется только в журнале.');
      }
      // RU: okonchatelno провайдера завершает весь заход: одинаковый отказ денег/ключа не надо повторять по оставшимся темам. Текст причины не заменяет этот признак.
      // EN: The provider okonchatelno flag ends the entire run: do not repeat the same balance/key failure for remaining topics. Cause text is not a substitute for this signal.
      if (s2.okonchatelno) {
        itog.ishod = s2.ishod;
        itog.oborvano = temy.length - temy.indexOf(t) - 1;
        krik(`заход ОБОРВАН: ${s2.ishod} — повтор не поможет. Не обработано тем: ${itog.oborvano}`);
        break;
      }
      podryad += 1;
      if (podryad >= PREDEL_PODRYAD) {
        itog.ishod = 'podryad-otkazov';
        itog.oborvano = temy.length - temy.indexOf(t) - 1;
        krik(`заход ОБОРВАН: ${podryad} неокончательных отказа подряд (предел ${PREDEL_PODRYAD}). ` +
             `Дело не в теме — сторона провайдера или сеть. Не обработано тем: ${itog.oborvano}. ` +
             `Последняя причина: ${s2.pochemu}`);
        break;
      }
      continue;
    }
    podryad = 0;   // RU: Бюджетный обрыв непустого текста — отказ этой темы до суда и записи, а не завершённая статья. Счёт обрывов и отказов сохраняется в итогах.
    // EN: Nonempty budget truncation refuses this topic before judgment and storage; it is not a completed article. Retain truncation and refusal counts in the summary.
    if (s2.stop_reason === 'max_tokens') {
      itog.oborvannyh = (itog.oborvannyh ?? 0) + 1;
      itog.otkazov++;
      itog.ishod = 'statya-oborvana';
      krik(`⚠️ статья «${t.theme}» ОБОРВАНА бюджетом (stop_reason=max_tokens, текст есть, `
         + `${s2.tekst.trim().length} знаков): в память НЕ записана — незавершённая статья.`);
      continue;
    }
    // RU: Снять хвостовую пунктуацию для точной строки НЕТ РЕЛЕВАНТНОГО. Кавычки и иной регистр не распознаются, а продолжение после этих слов считается знанием.
    // EN: Strip trailing punctuation for the exact НЕТ РЕЛЕВАНТНОГО marker. Quotes and different case are not recognized, while content following those words counts as knowledge.
    if (s2.tekst.trim().replace(/[.!…]+$/, '').trim() === NET_RELEVANTNOGO) { itog.pusto++; continue; }
    try {
      const telo = s2.tekst.trim();
      // RU: Сверять до вставки, иначе запись нашла бы в памяти саму себя.
      // EN: Compare before insertion, or the record would find itself in memory.
      if (!novizna_nedostupna) {
        try {
          const r = blizhajshaya({ klass, soderzhim: telo });
          if (r?.ishod === 'sravneno') {
            novizna.sravneno++;
            // RU: Измерять близость к прежним знаниям, не фильтровать по ней: проверяется результат просьбы брать знания только из основного разговора.
            // EN: Measure similarity to existing knowledge without filtering by it: observe the result of asking for knowledge only from the main conversation.
            if (r.blizost >= 0.5) novizna.ne05++; if (r.blizost >= 0.7) novizna.ne07++; if (r.blizost >= 0.9) novizna.ne09++;
            if (novizna.max === null || r.blizost > novizna.max) {
              novizna.max = r.blizost; novizna.maxId = r.id; novizna.maxKlass = klass;
            }
          } else if (r?.ishod === 'ne-s-chem') novizna.neSChem++;
          else if (r?.ishod === 'sravnit-nechem') novizna.nechem++;
          else novizna.sorvalos++;   // RU: Неизвестный исход сверки считается отказом измерения, не новым знанием.
          // EN: An unknown comparison outcome counts as measurement failure, not new knowledge.
        } catch (e) {
          novizna.sorvalos++;
          krik('сверка новизны сорвалась на теме «' + t.theme + '»: ' + (e?.message ?? e)
             + '. Знание записывается — сверка вторична.');
        }
      }
      // RU: Суд идёт до вставки, чтобы устаревшее не записать; отношение — после вставки, когда известен новый id.
      // EN: Judge before insertion to avoid writing stale knowledge; set the relationship after insertion when the new id is known.
      let sud = null;
      if (sudVozmozhen && KLASSY_OTMENY.includes(klass)) {
        try {
          const kand = dejstvuyushchie({ soderzhim: telo, skolko: KANDIDATOV_SUDA + 20 });
          // RU: Кандидаты собственного среза исключаются: поздняя вставка статьи не делает её знание новее соседа из того же источника. Запас +20 компенсирует места, занятые своим срезом, до отбора 5 кандидатов.
          // EN: Exclude candidates from this slice: a later article insertion does not make its knowledge newer than another record from the same source. Fetch 20 extra candidates to compensate for slots occupied by this slice before selecting 5.
          if (kand?.spisok) kand.spisok = kand.spisok.filter((x) => x.istochnik !== istochnik_okna(oi)).slice(0, KANDIDATOV_SUDA);
          if (kand?.ishod === 'sravneno' && kand.spisok?.length) {
            // RU: Маскируем полный запрос суда, включая кандидатов и статью; обе попытки используют эту строку. Отказ не превращается в обычную запись через catch суда.
            // EN: Mask the entire judgment request, including candidates and the article; both attempts use this string. Refusal must not become an ordinary write through the judgment catch.
            const tekstDlyaSuda = zamaskirovatVhodIliOtkaz(tekstSuda(telo, klass, vremyaIstochnika, kand.spisok, istochnik_okna(oi)) + '\n\n' + (povtor ? KONEC_SUDA_POVTOR : KONEC_SUDA), 'суд');
            if (tekstDlyaSuda === null) return { ...itog, ishod: 'net-maski' };
            itog.sudov++;
            const s4 = await sprositUporno({ klyuch: k.klyuch, model: nastrojka.model, system: povtor ? SUD_OTMENY_POVTOR : SUD_OTMENY,
                                             tekst: tekstDlyaSuda,
                                             maxTokens: BYUDZHET_SUDA, ...(adres ? { adres } : {}) });
            uchest(s4.usage);
            sud = s4.ishod === 'ok' ? razobratSud(s4.tekst, kand.spisok, vremyaIstochnika, istochnik_okna(oi), { povtor: !!povtor })
                                    : { vid: 'nerazobrano', pochemu: 'суд не состоялся [' + s4.ishod + '], выход ' + (s4.usage?.output_tokens ?? '?') + ' ток. при бюджете ' + BYUDZHET_SUDA };
            // RU: Принятые ОТМЕНЯЕТ/УСТАРЕЛА проверяются вторым одинаковым вызовом и требуют совпадения вида/id. НЕТ и уже отвергнутый ответ не повторяются. Устойчивая ложная отмена может совпасть в обоих ответах; второе мнение её не гарантирует обнаружить.
            // EN: Check accepted ОТМЕНЯЕТ/УСТАРЕЛА with a second identical call and require matching kind/id. Do not repeat НЕТ or already rejected answers. A persistent false cancellation may match in both responses; a second opinion cannot guarantee detecting it.
            if (sud.vid === 'otmenyaet' || sud.vid === 'ustarela' || sud.vid === 'povtoryaet') {
              itog.vtoryhMnenij++;
              const s5 = await sprositUporno({ klyuch: k.klyuch, model: nastrojka.model, system: povtor ? SUD_OTMENY_POVTOR : SUD_OTMENY,
                                               tekst: tekstDlyaSuda,
                                               maxTokens: BYUDZHET_SUDA, ...(adres ? { adres } : {}) });
              uchest(s5.usage);
              const sud2 = s5.ishod === 'ok' ? razobratSud(s5.tekst, kand.spisok, vremyaIstochnika, istochnik_okna(oi), { povtor: !!povtor })
                                             : { vid: 'nerazobrano', pochemu: 'суд не состоялся [' + s5.ishod + '], выход ' + (s5.usage?.output_tokens ?? '?') + ' ток. при бюджете ' + BYUDZHET_SUDA };
              if (sud.vid === 'povtoryaet' && sud2.vid === 'utochnyaet' && sud2.k === sud.k) {
                // RU: ПОВТОРЯЕТ и УТОЧНЯЕТ одной k выбирают запись как уточнение: новая информация могла быть, поэтому это безопасная сторона.
                // EN: ПОВТОРЯЕТ and УТОЧНЯЕТ for the same k choose a refinement write: new information may exist, making this the conservative choice.
                itog.mneniyaRazoshlis++;
                sud = { vid: 'utochnyaet', k: sud.k, ponizhenoPovtor: 'мнения разошлись: «ПОВТОРЯЕТ» и «УТОЧНЯЕТ»' };
              } else if (sud2.vid !== sud.vid || sud2.k !== sud.k) {
                // RU: Каждый известный вердикт печатается своим именем; незнакомый — собственным видом, не undefined вместо причины.
                // EN: Print each known verdict by name; print an actual kind of an unknown verdict rather than undefined instead of a cause.
                const opis = (x) => x.vid === 'otmenyaet' ? 'ОТМЕНЯЕТ: ' + x.k : x.vid === 'ustarela' ? 'УСТАРЕЛА: ' + x.k : x.vid === 'povtoryaet' ? 'ПОВТОРЯЕТ: ' + x.k
                  : x.vid === 'utochnyaet' ? 'УТОЧНЯЕТ: ' + x.k + (x.ponizheno ? ' (понижено из «ОТМЕНЯЕТ»: запись обрезана)' : '')
                  : x.vid === 'net' ? 'НЕТ' : 'не разобрано (' + (x.pochemu ?? 'вид «' + x.vid + '», причина не передана') + ')';
                itog.mneniyaRazoshlis++;
                sud = { vid: 'nerazobrano', pochemu: `мнения разошлись: первое «${opis(sud)}», второе «${opis(sud2)}»` };
              }
            }
          }
        } catch (e) { sud = { vid: 'nerazobrano', pochemu: 'суд сорвался: ' + (e?.message ?? e) }; }
        if (sud?.vid === 'nerazobrano') { itog.sudNerazobran++; krik(`суд отмены по теме «${t.theme}»: ${sud.pochemu} — пишу как обычно, отношения нет`); }
      }
      if (sud?.vid === 'ustarela') {
        itog.ustarelo++;
        let kuda = 'файл не сохранён: ustarevshee не подан';
        try { if (typeof ustarevshee === 'function') kuda = ustarevshee({ tekst: telo, klass, tema: t.theme, k: sud.k, istochnik: istochnik_okna(oi) }); }
        catch (e) { kuda = 'файл НЕ сохранён: ' + (e?.message ?? e); }
        krik(`статья «${t.theme}» УСТАРЕЛА (модель): действующая запись ${sud.k} новее источника — в память НЕ пишу; текст: ${kuda}`);
        continue;
      }
      // RU: Пропустить ПОВТОРЯЕТ можно только при двух совпавших мнениях и vidnaVOmega(k)===true. false/null, отмена или неактивный двойник сохраняют статью как уточнение. При пропуске текст идёт в файл с возвратом, k получает povtor-sudom. Устойчиво ложный повтор с видимой k может пройти оба мнения.
      // EN: Skip ПОВТОРЯЕТ only with two matching opinions and vidnaVOmega(k)===true. false/null, cancellation, or an inactive counterpart retain the article as refinement. On skipping, save text to a recovery file and touch k with povtor-sudom. A persistently false repetition with visible k may pass both opinions.
      if (sud?.vid === 'povtoryaet') {
        let vidna = null;
        try { vidna = await povtor.vidna(sud.k); } catch { vidna = null; }
        let pochemu = vidna === false ? 'двойник k в OMEGA не виден (отменён / не active / не найден)' : 'видимость двойника k не проверена';
        if (vidna === true) {
          let kuda = null;
          try { kuda = povtor.sohranit({ tekst: telo, klass, tema: t.theme, k: sud.k, istochnik: istochnik_okna(oi) }); }
          catch (e) { pochemu = 'файл пропущенных не записан: ' + (e?.message ?? e); }
          if (kuda) {
            itog.povtorovSuda++;
            let kas;
            try { const r = povtor.kasanie(sud.k); kas = 'касание k отмечено' + (r?.otmecheno !== undefined ? ' (' + r.otmecheno + ')' : ''); }
            catch (e) { kas = 'касание k НЕ отмечено: ' + (e?.code ?? '') + ' ' + (e?.message ?? e); }
            krik(`статья «${t.theme}» ПОВТОРЯЕТ запись ${sud.k} (два мнения, двойник в OMEGA виден) — в память НЕ пишу; ${kas}; текст: ${kuda}`);
            continue;
          }
        }
        sud = { vid: 'utochnyaet', k: sud.k, ponizhenoPovtor: pochemu };
      }
      const rezultat = zapisat({ klass, soderzhim: telo, istochnik: istochnik_okna(oi) });
      // RU: Ярлык темы связывается с телом в журнале, поскольку сам ярлык не хранится в записи.
      // EN: Link the topic label to its body in the journal because the record does not store the label itself.
      krik(`записано id ${Number(rezultat && typeof rezultat === 'object' ? rezultat.id : rezultat)} (${klass}) по теме «${t.theme}»`);
      if (sud?.vid === 'otmenyaet') {
        const novyj = Number(rezultat && typeof rezultat === 'object' ? rezultat.id : rezultat);
        try {
          const o = otnoshenie({ id: novyj, vid: 'otmenyaet', k: sud.k, kto: 'секретарь: суд модели' });
          itog.otmen++;
          krik(`отменяет id ${sud.k} (модель): запись ${novyj} — ${o?.ishod ?? '?'}; откат рукой: UPDATE zapisi SET otnoshenie=NULL, otnositsya_k=NULL WHERE id=${novyj}`);
        } catch (e) { itog.sudNerazobran++; krik(`отношение ${novyj} otmenyaet ${sud.k} НЕ записано: ${e?.code ?? ''} ${e?.message ?? e}`); }
      }
      if (sud?.vid === 'utochnyaet') {
        const novyj = Number(rezultat && typeof rezultat === 'object' ? rezultat.id : rezultat);
        try {
          const o = otnoshenie({ id: novyj, vid: 'utochnyaet', k: sud.k, kto: 'секретарь: суд модели' + (sud.ponizhenoPovtor ? ', понижено из «ПОВТОРЯЕТ»: ' + sud.ponizhenoPovtor : '') + (sud.ponizhenoOhranoj ? ', понижено из «УСТАРЕЛА» охраной по времени' : '') + (sud.ponizheno ? ', понижено с «отменяет»: запись обрезана' : '') });
          itog.utochnenij++; if (sud.ponizheno) itog.ponizheno++; if (sud.ponizhenoPovtor) itog.povtorPonizheno++; if (sud.ponizhenoOhranoj) itog.ponizhenoOhranoj++;
          krik(`уточняет id ${sud.k} (модель${sud.ponizhenoPovtor ? '; «ПОВТОРЯЕТ» понижено: ' + sud.ponizhenoPovtor : ''}${sud.ponizheno ? '; «ОТМЕНЯЕТ» понижено — запись ' + sud.k + ' длиннее ' + PREDEL_KANDIDATA + ' зн., суд видел её не целиком' : ''}${sud.ponizhenoOhranoj ? '; понижено из «УСТАРЕЛА: ' + sud.k + '» охраной по времени: запись ' + sud.k + ' не новее источника — пишу «уточняет»' : ''}): запись ${novyj} — ${o?.ishod ?? '?'}`);
        } catch (e) { itog.sudNerazobran++; krik(`отношение ${novyj} utochnyaet ${sud.k} НЕ записано: ${e?.code ?? ''} ${e?.message ?? e}`); }
      }
      // RU: Запись считается по возвращённому исходу ядра, не отсутствию исключения. Текущий числовой id подтверждает только вставку оперативно, не доставку в другие слои; их исход остаётся в журнале ядра. Объектная ветка допускает отдельный контракт, но не приписывает его числовому ответу.
      // EN: Count writes by the core return value, not absence of exceptions. The current numeric id confirms only a working-storage insertion, not delivery to other layers; those outcomes remain in the core journal. The object branch permits a separate contract without attributing it to numeric results.
      if (rezultat && typeof rezultat === 'object' && rezultat.ishod !== undefined) {
        if (rezultat.ishod === 'zapisano') itog.zapisano++;
        else if (rezultat.ishod === 'ostalos-v-operativnom') itog.ostalosOperativnom++;
        else if (rezultat.ishod === 'ne-otpravleno') itog.neOtpravleno++;
        else itog.drugoiIshod++;
      } else {
        itog.zapisano++;
        itog.ishodNeViden = true;
      }
      if (pomechenoPredpolozhenie(telo)) itog.predpolozhenij = (itog.predpolozhenij ?? 0) + 1;
      if (ORIENTIR_STATI && telo.length > ORIENTIR_STATI) {
        dlinnyh++;
        if (telo.length > maxDlina) maxDlina = telo.length;
      }
    } catch (e) { itog.otkazov++; krik(`статья «${t.theme}» НЕ записана: ${e?.message ?? e}`); }
  }
  okonOk++;
  }
  const ohvat = OKNA.length ? Math.round((okonOk / OKNA.length) * 100) : 0;
  itog.okon = OKNA.length; itog.okonOk = okonOk; itog.ohvat = ohvat;
  krik(`ОКНА: прогнано ${okonOk} из ${OKNA.length} окон = ${ohvat}% · знаков ${transkript.length} из ${VSEGO_ZNAKOV} · размер окна ${RAZMER_OKNA === Infinity ? 'не задан (одно окно)' : RAZMER_OKNA}`
     + (okonPlohih.length ? ` · НЕ обработаны: ${okonPlohih.join(', ')}` : ''));
  itog.povtorov = povtorov;
  itog.povtorov_udalos = povtorov_udalos;
  if (povtorov) {
    krik(`повторов при пустом ответе: ${povtorov}, из них удались ${povtorov_udalos}`
       + `. Повтор ровно один на тему; при «не дочитала» бюджет удваивается`);
  }
  // RU: Охват тем печатается всегда отдельно от окон/знаков: полный транскрипт не означает запись всех названных тем. temNajdeno — темы модели, не истинное число тем в тексте; эта граница знаменателя остаётся явной.
  // EN: Always report topic coverage separately from windows/characters: a complete transcript does not mean every named topic was saved. temNajdeno counts model-named topics, not the true number in the text; keep that denominator limit explicit.
  {
    const najdeno = itog.temNajdeno ?? 0;
    const ohvatTem = najdeno ? Math.round((itog.tem / najdeno) * 100) : 0;
    itog.ohvatTem = ohvatTem;
    if (najdeno === 0 && okonPlohih.length) {
      // RU: Неудачный выбор тем не даёт нулевой знаменатель как доказательство отсутствия знаний; это отдельная потеря окна.
      // EN: Failed topic selection does not make a zero denominator evidence of no knowledge; it is a distinct window failure.
      krik(`🔴 ОХВАТ ПО ТЕМАМ: выбор тем НЕ состоялся (${okonPlohih.join(', ')}) — темы не названы, знания НЕ разобраны; `
         + `это не «нечего брать» (заданий на повтор ${itog.zadanij ?? 0})`);
    } else if (najdeno === 0) {
      krik('ОХВАТ ПО ТЕМАМ: модель не назвала ни одной темы — это «нечего брать», а не «взято всё»');
    } else if (itog.tem < najdeno) {
      krik(`🔴 ОХВАТ ПО ТЕМАМ НЕ ПОЛНЫЙ: взято ${itog.tem} из ${najdeno} = ${ohvatTem}%. `
         + `Не записано ${najdeno - itog.tem} знаний — они НАЙДЕНЫ и отброшены пределом, `
         + 'это не «их не было». Предел снимается ключом predelTem=0');
    } else {
      krik(`ОХВАТ ПО ТЕМАМ: взято ${itog.tem} из ${najdeno} = 100% (предел не резал)`);
    }
  }
  krik(`дистилляция: знаний записано ${itog.zapisano} из ${itog.tem} тем = ${itog.tem ? Math.round(itog.zapisano / itog.tem * 100) : 0}% · ` +
       `устарело ${itog.ustarelo ?? 0} (действующая запись новее — в память не пишется), ` +
       `пусто по теме ${itog.pusto}, отказов ${itog.otkazov}, заданий на повтор ${itog.zadanij ?? 0}, ` +
       `чужой класс ${itog.chuzhoiKlass}, ОБОРВАНО бюджетом ${itog.oborvannyh ?? 0}, спасено повтором ${spasenoPovtorom}, ` +
       `осталось в оперативном ${itog.ostalosOperativnom}, не отправлено ${itog.neOtpravleno}, другой исход ${itog.drugoiIshod}, ` +
       `помечено [предположение] ${itog.predpolozhenij ?? 0}, повторяет (не записано) ${itog.povtorovSuda ?? 0}; ` +
       `${stroka_razneseno(itog)}; источник ${istochnik_okna(0)} … ${istochnik_okna(OKNA.length-1)}`);
  // RU: Итог объясняет, что числовое «записано» считает вставки, а исход доставки надо читать в журнале ядра.
  // EN: The summary explains that numeric “written” counts insertions; read delivery outcomes in the core journal.
  if (sudVozmozhen) krik(`отмены (суд модели): судов ${itog.sudov}, отмен ${itog.otmen}, уточнений ${itog.utochnenij} (из них понижено с «отменяет» ${itog.ponizheno}), устаревших не записано ${itog.ustarelo}, «устарела» понижено до уточняет ${itog.ponizhenoOhranoj}, не разобрано ${itog.sudNerazobran}, вторых мнений ${itog.vtoryhMnenij}, из них разошлись ${itog.mneniyaRazoshlis}` + (povtor ? `; повторяет ${itog.povtorovSuda} из ${itog.sudov} судимых (не записано; «ПОВТОРЯЕТ» понижено до уточняет ${itog.povtorPonizheno})` : ''));
  else krik('отмены: суд НЕ звался — ядро не подало blizhajshieDejstvuyushchie/ustanovitOtnoshenie (ядро старше a84?)');
  if (itog.ishodNeViden) {
    krik(`⚠️ «записано ${itog.zapisano}» — это число вставок в память: ядро отдаёт только id, а дошло ли знание `
       + `до долговременного слоя (dostavleno / ostalos-v-operativnom / ne-udalos-proverit), пишет в свой журнал — там и смотреть.`);
  }
  // RU: Бюджетные обрывы печатаются в итоге, включая ноль. Сверка различает сравнение, отказ и отсутствие прибора: молчание не означает «всё новое».
  // EN: Print budget truncations in the summary, including zero. Comparison distinguishes a result, failure, and missing instrumentation: silence does not mean “all new.”
  if (novizna_nedostupna) {
    krik('новизна знаний НЕ СВЕРЯЛАСЬ: ядро не отдаёт поиск ближайшей записи '
       + '(ядро старше alpha.58). Это «не смотрели», а не «дублей нет».');
  } else if (itog.zapisano === 0) {
    krik('новизна знаний: записанных статей нет — сравнивать нечего');
  } else {
    krik('новизна знаний: сравнено ' + novizna.sravneno + ' из ' + itog.zapisano
       + (novizna.max === null ? ', ближайших не нашлось'
          : ', наибольшая близость ' + novizna.max.toFixed(2) + ' (класс ' + novizna.maxKlass + ', запись ' + novizna.maxId + ')')
       + ' · близость к уже записанному ≥0.5 у ' + novizna.ne05 + ', ≥0.7 у ' + novizna.ne07 + ', ≥0.9 у ' + novizna.ne09 + ' знаний (замер, не фильтр)'
       + ' · класс пуст ' + novizna.neSChem + ' · сравнить нечем ' + novizna.nechem
       + ' · сверка сорвалась ' + novizna.sorvalos
       + '. Порогов merged/blocked НЕТ намеренно: на живой базе дублей ноль, порог без ряда был бы выдуман. '
       + 'Мера считает ОБЩИЕ СЛОВА, не смысл: перефразированный дубль она не поймает.');
  }
  itog.novizna = novizna;
  itog.dlinnyh = dlinnyh;
  itog.orientirStati = ORIENTIR_STATI;
  if (ORIENTIR_STATI) {
    krik(itog.zapisano === 0
      ? `ориентир статьи ${ORIENTIR_STATI} знаков: записанных статей нет — мерить нечего`
      : `ориентир статьи ${ORIENTIR_STATI} знаков: длиннее ориентира ${dlinnyh} из ${itog.zapisano}`
        + (dlinnyh ? `, наибольшая ${maxDlina}` : '')
        + '. Статьи ЗАПИСАНЫ как есть: ориентир не ограничивает запись; большая длина допустима, это наблюдение.');
  }
  // RU: Проза вместо JSON-массива — ошибка формы ответа, не «тем не было» и не успех 0 из 0.
  // EN: Prose instead of a JSON array is a response-format failure, not “no topics” or successful 0 of 0.
  if (itog.ishod === 'ok' && itog.tem === 0 && prozoy > 0) itog.ishod = 'proza';
  itog.rashod = rashod;
  // RU: Расход печатается токенами: цена требует текущего тарифа провайдера, зашитая ставка не является замером.
  // EN: Report usage in tokens: cost requires the current provider tariff; a hardcoded rate is not a measurement.
  krik(`расход захода: вызовов ${rashod.vyzovov}, вход ${rashod.vhod}, выход ${rashod.vyhod}, ` +
       `кеш чтение ${rashod.keshChtenie}, кеш запись ${rashod.keshZapis} — токенами, ` +
       'цену считать по прайсу провайдера на день расчёта (отказы сюда ВХОДЯТ: они оплачены)');
  return itog;
}
