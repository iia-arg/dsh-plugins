/**
 * Шов дистилляции: от события компакции к записанным знаниям.
 *
 * 🔴 НЕ ЗАДЕРЖИВАЕТ КОМПАКТ. Обработчик события возвращается сразу, работа идёт
 * следом. Один заход — это вызов выбора тем плюс по вызову на тему; замер на живом
 * диапазоне 03.09.2026: ступень 1 — 72 с при 57 631 токене входа, каждая статья — 18 с.
 * Ждать этого внутри обработчика значило бы держать чужой поток событий минутами.
 *
 * 🔴 ПРЕДЕЛЫ ОБЪЯВЛЕНЫ ЧИСЛАМИ, а не «сколько получится»: механизм ходит к платному
 * API, и неограниченный расход — это не свойство, а недосмотр. Превышение НЕ молчит:
 * говорит, сколько было и сколько взяли.
 */
import { zapisi_po_seq, sobrat_transkript } from './chtenie-zhurnala.js';
import { vzyat_klyuch, sprosit, razobrat_massiv } from './distillyaciya.js';
import { VYBOR_TEM, STATYA, NET_RELEVANTNOGO, KLASSY } from './promty.js';

/**
 * Достать список затенённых seq из данных события.
 * Платформа отдаёт его сама (`shadowedSeqs`) — вычислять по времени не надо:
 * вычисленная граница расходится с настоящей молча.
 */
export function zatenennye(dannye) {
  const s = Array.isArray(dannye?.shadowedSeqs) ? dannye.shadowedSeqs.filter(Number.isInteger) : [];
  return { seqs: s, tokenov: dannye?.shadowedTokenCount ?? null };
}

export async function distillirovat({ putZhurnala, dannye, seansId, nastrojka, krik, zapisat }) {
  const { seqs, tokenov } = zatenennye(dannye);
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

  const v = zapisi_po_seq(putZhurnala, seqs);
  if (v.pochemu) { krik('дистилляция не начата: ' + v.pochemu); return { ishod: 'net-zhurnala' }; }
  if (v.najdeno < v.prosili) {
    // Не отказ, но и не молчание: срез неполон, и это должно быть видно в числах.
    krik(`⚠️ в журнале найдено ${v.najdeno} записей из ${v.prosili} затенённых — ` +
         'дистилляция пойдёт по НЕПОЛНОМУ срезу, а результат будет выглядеть полным');
  }
  let transkript = sobrat_transkript(v.zapisi);
  if (!transkript.trim()) {
    krik(`дистилляция пропущена: в ${v.najdeno} затенённых записях нет речи (только служебные события)`);
    return { ishod: 'net-rechi' };
  }
  let obrezan = 0;
  if (transkript.length > nastrojka.predelZnakov) {
    obrezan = transkript.length;
    // Берём ХВОСТ: свежее ближе к решению. И говорим об обрезке числом.
    transkript = transkript.slice(-nastrojka.predelZnakov);
    krik(`транскрипт обрезан: было ${obrezan} знаков, взято ${nastrojka.predelZnakov} (хвост). ` +
         'Предел настраивается ключом predelZnakov; молча обрезать нельзя — знания из начала не попадут');
  }

  const k = vzyat_klyuch(nastrojka.klyuch);
  if (!k.klyuch) { krik('дистилляция не начата: ' + k.pochemu); return { ishod: 'net-klyucha' }; }

  // adres берётся из настройки только если задан; умолчание живёт в distillyaciya.js —
  // двух умолчаний быть не должно, иначе они разойдутся молча. Потребитель настройки —
  // стенд шва: без неё проверить учёт расхода можно лишь платным вызовом к провайдеру.
  const adres = nastrojka.adres || undefined;

  // 🔴 РАСХОД СЧИТАЕТСЯ, А НЕ ОЦЕНИВАЕТСЯ. Заход ходит к платному чужому API, и до
  // 03.09.2026 механизм тратил деньги, НЕ считая их: цену приходилось прикидывать по
  // знакам транскрипта, а прикидка расходится с настоящим счётом молча.
  // 🔴 ОТКАЗЫ ВХОДЯТ В РАСХОД. Вызов, кончившийся на stop_reason=max_tokens, статьи не
  // дал, но оплачен полностью. Считать только удавшиеся значит занижать цену ровно на
  // ту часть, которая и есть беда.
  //
  // 🔴 ОБЪЯВЛЕНО ДО ПЕРВОГО ВЫЗОВА, И ЭТО ПРАВКА ПО БОЕВОМУ ЗАМЕРУ 04.09.2026.
  // Прежде блок стоял НИЖЕ, а ветка отказа первой ступени уже возвращала `rashod` —
  // то есть при любом отказе провайдера шов падал с ReferenceError вместо того, чтобы
  // назвать причину. Ветка отказа была написана верно и НЕ ИСПОЛНЯЛАСЬ ни разу:
  // проверить её было нечем, пока у провайдера были деньги. Нашлось только тогда,
  // когда баланс ушёл в минус и появился настоящий 402.
  const rashod = { vyzovov: 0, vhod: 0, vyhod: 0, keshChtenie: 0, keshZapis: 0 };
  const uchest = (u) => {
    rashod.vyzovov++;
    if (!u) return;
    rashod.vhod += Number(u.input_tokens ?? 0);
    rashod.vyhod += Number(u.output_tokens ?? 0);
    rashod.keshChtenie += Number(u.cache_read_input_tokens ?? 0);
    rashod.keshZapis += Number(u.cache_creation_input_tokens ?? 0);
  };

  const s1 = await sprosit({ klyuch: k.klyuch, model: nastrojka.model, system: VYBOR_TEM,
                             tekst: transkript, maxTokens: nastrojka.maxTokenovTem, ...(adres ? { adres } : {}) });
  // 🔴 ПОСЛЕ ПЕРВОГО ВЫЗОВА ЛЮБОЙ РАННИЙ ВОЗВРАТ НЕСЁТ РАСХОД. Вызов состоялся и
  // оплачен, чем бы он ни кончился; вернуть исход без расхода значит показать заход
  // бесплатным ровно там, где деньги потрачены впустую.
  if (s1.ishod !== 'ok') {
    uchest(s1.usage);
    krik('выбор тем не состоялся [' + s1.ishod + ']: ' + s1.pochemu);
    return { ishod: s1.ishod, okonchatelno: Boolean(s1.okonchatelno), rashod };
  }
  uchest(s1.usage);
  const m = razobrat_massiv(s1.tekst);
  if (!m.godno) { krik('темы не разобраны: ' + m.pochemu); return { ishod: 'temy-ne-razobrany', rashod }; }

  const vsegoTem = m.spisok.length;
  if (vsegoTem === 0) { krik('дистилляция: тем не выбрано — по этому срезу знаний нет'); return { ishod: 'temy-pusty', tem: 0, rashod }; }
  const temy = m.spisok.slice(0, nastrojka.predelTem);
  if (vsegoTem > temy.length) {
    krik(`тем выбрано ${vsegoTem}, берём ${temy.length} (предел predelTem) — ` +
         'остальные НЕ записаны, и это не «их не было»');
  }

  const istochnik = `${seansId}#${Math.min(...seqs)}-${Math.max(...seqs)}`;
  const itog = { ishod: 'ok', tem: temy.length, zapisano: 0, pusto: 0, otkazov: 0, chuzhoiKlass: 0 };
  for (const t of temy) {
    const klass = KLASSY.includes(t?.kind) ? t.kind : null;
    if (!klass) { itog.chuzhoiKlass++; krik(`тема «${t?.theme}» пропущена: класс «${t?.kind}» вне объявленного списка`); continue; }
    const s2 = await sprosit({ klyuch: k.klyuch, model: nastrojka.model, system: STATYA,
                               // 🔴 ТЕМА В КОНЦЕ, А НЕ В НАЧАЛЕ — РАДИ КЭША ПРОВАЙДЕРА.
                               // Замер 03.09.2026: при теме впереди префикс у всех двенадцати
                               // вызовов разный с первого знака, кэш не срабатывает вовсе —
                               // 3072 попадания на 824 033 токена входа (0,37%). Транскрипт
                               // один и тот же; поставив его ПЕРВЫМ, делаем префикс общим.
                               // Ставка кэш-попадания у deepseek-v4-flash в 31 раз ниже
                               // ставки свежего входа, и вся вторая ступень идёт по ней.
                               tekst: `${transkript}\n\nТЕМА: ${t.theme}`, maxTokens: nastrojka.maxTokenovStati,
                               ...(adres ? { adres } : {}) });
    uchest(s2.usage);   // до разбора исхода: оплачен и отказ
    if (s2.ishod !== 'ok') {
      itog.otkazov++;
      krik(`статья «${t.theme}» не написана [${s2.ishod}]: ${s2.pochemu}`);
      // 🔴 ОКОНЧАТЕЛЬНЫЙ ОТКАЗ ОБРЫВАЕТ ЗАХОД. Нет денег или не принят ключ — повторится на
      // каждой из оставшихся тем: двенадцать одинаковых отказов вместо одного внятного.
      // Признак ставит провайдер, а не мы: гадать по тексту причины — значит разойтись с ним
      // при первой же смене формулировки.
      if (s2.okonchatelno) {
        itog.ishod = s2.ishod;
        itog.oborvano = temy.length - temy.indexOf(t) - 1;
        krik(`заход ОБОРВАН: ${s2.ishod} — повтор не поможет. Не обработано тем: ${itog.oborvano}`);
        break;
      }
      continue;
    }
    if (s2.tekst.trim() === NET_RELEVANTNOGO) { itog.pusto++; continue; }
    try {
      zapisat({ klass, soderzhim: s2.tekst.trim(), istochnik });
      itog.zapisano++;
    } catch (e) { itog.otkazov++; krik(`статья «${t.theme}» НЕ записана: ${e?.message ?? e}`); }
  }
  krik(`дистилляция: тем ${itog.tem}, записано знаний ${itog.zapisano}, ` +
       `пусто по теме ${itog.pusto}, отказов ${itog.otkazov}, чужой класс ${itog.chuzhoiKlass}; источник ${istochnik}`);
  itog.rashod = rashod;
  // Печатаем ТОКЕНАМИ, а не деньгами: ставка живёт у провайдера и меняется без нас,
  // а зашитая цена устареет молча и будет выглядеть замером. Деньги считает тот, кто
  // возьмёт ставку с прайса в день расчёта.
  krik(`расход захода: вызовов ${rashod.vyzovov}, вход ${rashod.vhod}, выход ${rashod.vyhod}, ` +
       `кеш чтение ${rashod.keshChtenie}, кеш запись ${rashod.keshZapis} — токенами, ` +
       'цену считать по прайсу провайдера на день расчёта (отказы сюда ВХОДЯТ: они оплачены)');
  return itog;
}
