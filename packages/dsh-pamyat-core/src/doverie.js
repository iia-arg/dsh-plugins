/**
 * RU: Состояние доверия вычисляется из событий при каждой выдаче; оно не сохраняется в vera. Иначе новая
 *    отмена могла бы оставить в базе устаревшую оценку. Поле vera предназначено для отдельной оценки
 *    моделью.
 * EN: Trust state is derived from events at each retrieval; it is not stored in vera. Storing it would let a
 *    new revocation leave a stale assessment in the database. The vera field is reserved for a separate
 *    model assessment.
 *
 * RU: Порядок правил обязателен: побеждает первое совпадение. otmenena — другая запись отменяет эту;
 *    oprovergnuta — proverka.ishod равен utrachena; otmetka-negodna — событие не разбирается либо у
 *    подтверждения нет строкового kem; utochnena — другая запись уточняет эту; podtverzhdena — есть
 *    подтверждение с kem; bez-podtverzhdeniya — исходная запись принята без подтверждения; obychnaya —
 *    событий доверия нет.
 * EN: Rule order is part of the contract: the first match wins. otmenena means another record revokes this
 *    one; oprovergnuta means proverka.ishod is utrachena; otmetka-negodna means an event cannot be parsed or
 *    a confirmation has no string kem; utochnena means another record refines this one; podtverzhdena means
 *    a confirmation with kem exists; bez-podtverzhdeniya means the record was initially accepted without
 *    approval; obychnaya means there are no trust events.
 *
 * RU: Отмена имеет приоритет над уточнением и подтверждением; утрата опоры — над подтверждением. Отношения
 *    передаёт вызывающий, например через pamyat_otnoshenie; proverka ставится через otmetitProverku,
 *    подтверждение — человеком через podtverdit и src/podtverdit-znanie.mjs.
 * EN: Revocation takes precedence over refinement and confirmation; loss of supporting evidence takes
 *    precedence over confirmation. The caller supplies relations, for example through pamyat_otnoshenie;
 *    otmetitProverku records a verification event, and a human confirms a record through podtverdit and
 *    src/podtverdit-znanie.mjs.
 *
 * RU: Границы: oprovergnuta здесь означает утрату опоры, а не отрицательный вердикт модели. Возраст и число
 *    показов kasanij не меняют доверие: показ не является проверкой. Ошибочное знание без событий останется
 *    obychnaya. Время установки отношения не хранится; время отмены в строке — время создания отменяющей
 *    записи.
 * EN: Limits: oprovergnuta here means loss of supporting evidence, not a negative model verdict. Age and the
 *    kasanij retrieval count do not affect trust: showing a record is not verification. Incorrect knowledge
 *    with no recorded events remains obychnaya. Relation creation time is not stored; the revocation time
 *    shown is the creation time of the revoking record.
 */

export const SOSTOYANIYA = Object.freeze(['otmenena', 'oprovergnuta', 'otmetka-negodna', 'utochnena',
  'podtverzhdena', 'bez-podtverzhdeniya', 'obychnaya']);

const data = (ms) => (Number.isFinite(Number(ms)) ? new Date(Number(ms)).toISOString().slice(0, 16) + 'Z' : 'время неизвестно');

/**
 * RU: Разобрать поле события: null, undefined и пустая строка означают отсутствие события; объект или JSON,
 *    разбирающийся в объект, — наличие. Другие значения помечаются негодными. Структуру объекта проверяет
 *    вызывающая функция.
 * EN: Parse an event field: null, undefined and an empty string mean no event; an object or JSON that parses
 *    to an object means an event exists. Other values are marked invalid. The calling function checks the
 *    object structure.
 */
function razobrat(pole) {
  if (pole === null || pole === undefined || pole === '') return { est: false };
  if (typeof pole === 'object') return { est: true, z: pole };
  try { const z = JSON.parse(pole); return z && typeof z === 'object' ? { est: true, z } : { est: true, negodno: true }; }
  catch { return { est: true, negodno: true }; }
}

/**
 * RU: Вычислить состояние одной записи. zapis — строка таблицы zapisi с bez_podtverzhdeniya, podtverzhdenie
 *    и proverka; otmenyayushchie и utochnyayushchie — входящие отношения в форме [{ id, avtor, sozdano }].
 *    Вернуть { sostoyanie, stroka, ssylki }; stroka объясняет состояние, ssylki содержит идентификаторы
 *    связанных записей. Функция сама не читает базу.
 * EN: Compute the state of one record. zapis is a zapisi table row with bez_podtverzhdeniya, podtverzhdenie
 *    and proverka; otmenyayushchie and utochnyayushchie are incoming relations shaped as [{ id, avtor,
 *    sozdano }]. Return { sostoyanie, stroka, ssylki }; stroka explains the state, and ssylki contains
 *    related record IDs. This function does not read the database.
 */
export function sostoyanieDoveriya(zapis, { otmenyayushchie = [], utochnyayushchie = [] } = {}) {
  if (otmenyayushchie.length) {
    return { sostoyanie: 'otmenena', ssylki: otmenyayushchie.map((x) => Number(x.id)),
      stroka: otmenyayushchie.map((x) => `отменена #${x.id} (кем: ${x.avtor ?? 'не названо'}, когда: ${data(x.sozdano)})`).join('; ') };
  }
  const pr = razobrat(zapis?.proverka);
  const pd = razobrat(zapis?.podtverzhdenie);
  if (pr.est && !pr.negodno && pr.z.ishod === 'utrachena') {
    return { sostoyanie: 'oprovergnuta', ssylki: [],
      stroka: `опровергнута: опора утрачена (сверка «${pr.z.chem ?? 'прибор не назван'}», ${data(pr.z.kogda)})` };
  }
  if ((pr.est && pr.negodno) || (pd.est && (pd.negodno || typeof pd.z.kem !== 'string'))) {
    return { sostoyanie: 'otmetka-negodna', ssylki: [],
      stroka: 'отметка события не разбирается (' + [pr.negodno && 'сверка', (pd.negodno || (pd.est && typeof pd.z?.kem !== 'string')) && 'подтверждение'].filter(Boolean).join(', ') + ') — применять с проверкой' };
  }
  if (utochnyayushchie.length) {
    return { sostoyanie: 'utochnena', ssylki: utochnyayushchie.map((x) => Number(x.id)),
      stroka: 'уточнена ' + utochnyayushchie.map((x) => '#' + x.id).join(', ') + ' — читать вместе' };
  }
  if (pd.est) {
    return { sostoyanie: 'podtverzhdena', ssylki: [], stroka: `подтверждена: ${pd.z.kem}, ${data(pd.z.kogda)}` };
  }
  if (Number(zapis?.bez_podtverzhdeniya) === 1) {
    return { sostoyanie: 'bez-podtverzhdeniya', ssylki: [], stroka: 'без подтверждения' };
  }
  return { sostoyanie: 'obychnaya', ssylki: [], stroka: 'событий доверия нет' };
}

/**
 * RU: Сосчитать состояния записей выбранных klassy, используя ту же sostoyanieDoveriya, что и выдача. baza —
 *    открытый node:sqlite DatabaseSync; читатель должен открыть его readOnly. Результат: { vsego, schet: {
 *    состояние: число }, otmenena: [id…] }. Знания ограничиваются заданными классами; отношения читаются из
 *    всей таблицы, чтобы не потерять отмену или уточнение из другого класса.
 * EN: Count record states for the selected klassy using the same sostoyanieDoveriya function as retrieval.
 *    baza is an open node:sqlite DatabaseSync; the reader must open it with readOnly. Return { vsego, schet:
 *    { state: count }, otmenena: [id…] }. Knowledge records are restricted to the requested classes;
 *    relations are read from the entire table so that a revocation or refinement from another class is
 *    retained.
 */
export function schetDoveriya(baza, klassy) {
  const zap = baza.prepare('SELECT id, klass, bez_podtverzhdeniya, podtverzhdenie, proverka FROM zapisi WHERE klass IN ('
    + klassy.map(() => '?').join(', ') + ')').all(...klassy);
  const otn = baza.prepare('SELECT id, agent, istochnik, sozdano, otnoshenie, otnositsya_k FROM zapisi WHERE otnoshenie IS NOT NULL').all();
  const k = new Map();
  for (const o of otn) {
    const n = Number(o.otnositsya_k); if (!k.has(n)) k.set(n, { otm: [], uto: [] });
    const x = { id: Number(o.id), avtor: o.istochnik ?? o.agent, sozdano: o.sozdano };
    if (o.otnoshenie === 'otmenyaet') k.get(n).otm.push(x); else if (o.otnoshenie === 'utochnyaet') k.get(n).uto.push(x);
  }
  const schet = Object.fromEntries(SOSTOYANIYA.map((s) => [s, 0]));
  const otmenena = [];
  for (const z of zap) {
    const o = k.get(Number(z.id)) ?? { otm: [], uto: [] };
    const s = sostoyanieDoveriya(z, { otmenyayushchie: o.otm, utochnyayushchie: o.uto }).sostoyanie;
    schet[s] += 1;
    if (s === 'otmenena') otmenena.push(Number(z.id));
  }
  return { vsego: zap.length, schet, otmenena };
}
