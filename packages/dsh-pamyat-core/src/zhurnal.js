/**
 * RU: Журнал решений памяти различает «не предлагали записать» и «предложение отклонено». Одна строка хранит
 *    время, agent, klass, ishod, priroda, pochemu и istochnik. Отдельное поле priroda позволяет считать
 *    человеческий отказ и отсутствующий канал раздельно.
 * EN: The memory decision journal distinguishes “no write was proposed” from “a proposal was rejected”. Each
 *    row stores time, agent, klass, ishod, priroda, pochemu and istochnik. A separate priroda field allows
 *    human rejection and a missing channel to be counted separately.
 *
 * RU: Границы: журнал хранит решения, а не содержимое знаний и не доказательство доставки в долговременный
 *    слой. Строка с ishod=zapisano сама по себе не доказывает, что запись существует сейчас. Для этого
 *    сводка отдельно считает текущие строки zapisi и исторические отметки zhurnal.
 * EN: Limits: the journal stores decisions, not knowledge content or proof of delivery to long-term storage.
 *    A row with ishod=zapisano alone does not prove a record currently exists. The summary therefore counts
 *    current zapisi rows and historical zhurnal marks separately.
 */

const SHEMA = `
CREATE TABLE IF NOT EXISTS zhurnal (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  kogda     INTEGER NOT NULL,
  agent     TEXT NOT NULL,
  klass     TEXT NOT NULL,
  ishod     TEXT NOT NULL,
  priroda   TEXT,
  pochemu   TEXT NOT NULL,
  istochnik TEXT
);
CREATE INDEX IF NOT EXISTS idx_zhurnal_kogda ON zhurnal(kogda);
CREATE INDEX IF NOT EXISTS idx_zhurnal_ishod ON zhurnal(agent, ishod);
`;

/**
 * RU: Создать интерфейс журнала поверх уже открытой базы; знания и решения остаются в одном файле и
 *    переносятся вместе. По умолчанию создаётся схема; tolkoChtenie=true пропускает её создание, но не
 *    запрещает вызывающему пользоваться пишущими методами. Реальный отказ записи обеспечивается режимом
 *    открытия SQLite.
 * EN: Create the journal interface over an already open database; knowledge and decisions remain in one file
 *    and move together. The schema is created by default; tolkoChtenie=true skips schema creation but does
 *    not prevent the caller from invoking write methods. The SQLite open mode enforces actual write refusal.
 */
export function zavestiZhurnal(baza, { tolkoChtenie = false } = {}) {
  if (!baza || typeof baza.exec !== 'function') {
    const e = new Error('dsh-pamyat: журналу не передана открытая база');
    e.code = 'PAMYAT_ZHURNAL_BEZ_BAZY';
    throw e;
  }
  /**
   * RU: Читатель с readOnly не должен запускать CREATE TABLE/INDEX и миграции. Этот флаг пропускает только
   *    SHEMA; остальные методы не становятся автоматически безопасными для чтения.
   * EN: A readOnly reader must not execute CREATE TABLE/INDEX or migrations. This flag skips SHEMA only; the
   *    remaining methods do not automatically become read-only operations.
   */
  if (!tolkoChtenie) baza.exec(SHEMA);
  return {
    /**
     * RU: При запуске сохранить для agent отсечку: число отметок zapisano минус число текущих zapisi. INSERT OR
     *    IGNORE сохраняет первое значение и время; повторное открытие не скрывает новое расхождение. Вызывать
     *    только на пишущей базе с существующей таблицей nastrojki.
     * EN: At startup, save the baseline for agent: the number of zapisano marks minus the number of current
     *    zapisi rows. INSERT OR IGNORE retains the first value and timestamp; reopening cannot hide a new
     *    discrepancy. Call only on a writable database with an existing nastrojki table.
     */
    ustanovitOtsechku(agent) {
      baza.prepare(
        "INSERT OR IGNORE INTO nastrojki(kluch, znachenie, postavleno) SELECT ?, CAST((SELECT count(*) FROM zhurnal WHERE agent=? AND ishod='zapisano') - (SELECT count(*) FROM zapisi WHERE agent=?) AS TEXT), ?"
      ).run('schet_zapisey:' + agent, agent, agent, Date.now());
    },
    /**
     * RU: Записать решение и вернуть числовой id вставленной строки. Нужны непустые agent, klass, ishod и
     *    pochemu; их отсутствие вызывает PAMYAT_NEPOLNAYA_OTMETKA. Здесь не проверяется словарь классов или
     *    исходов, и id не доказывает доставку знания в другой слой.
     * EN: Insert a decision and return the inserted row’s numeric id. Nonempty agent, klass, ishod and pochemu
     *    are required; missing values raise PAMYAT_NEPOLNAYA_OTMETKA. This method does not validate class or
     *    outcome vocabularies, and the id does not prove knowledge delivery to another layer.
     */
    otmetit({ agent, klass, ishod, priroda = null, pochemu, istochnik = null, kogda = Date.now() }) {
      if (!agent || !klass || !ishod || !pochemu) {
        const e = new Error('dsh-pamyat: в журнал подана неполная отметка (нужны agent, klass, ishod, pochemu)');
        e.code = 'PAMYAT_NEPOLNAYA_OTMETKA';
        throw e;
      }
      const r = baza.prepare(
        'INSERT INTO zhurnal (kogda, agent, klass, ishod, priroda, pochemu, istochnik) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(kogda, agent, klass, ishod, priroda, pochemu, istochnik);
      return Number(r.lastInsertRowid);
    },
    /**
     * RU: Вернуть последние решения указанного agent по убыванию kogda, с пределом skolko (умолчание 20). Это
     *    выборка для состояния и диагностики; одинаковые временные метки не имеют дополнительного порядка по id.
     * EN: Return the selected agent’s latest decisions ordered by descending kogda, limited by skolko (default
     *    20). This is a status and diagnostic query; equal timestamps have no additional ordering by id.
     */
    poslednie({ agent, skolko = 20 }) {
      return baza.prepare(
        'SELECT * FROM zhurnal WHERE agent = ? ORDER BY kogda DESC LIMIT ?'
      ).all(agent, skolko);
    },
    /**
     * RU: Сводка считает текущие записи, отметки успешной записи и отказы по ishod/priroda. zapisano и
     *    obrabotano исключаются из отказов. Отсутствие предложений и наличие отказов net-kanala требуют разных
     *    действий и должны оставаться различимыми.
     * EN: The summary counts current records, successful-write marks and refusals grouped by ishod/priroda.
     *    zapisano and obrabotano are excluded from refusal counts. No proposals and net-kanala refusals require
     *    different actions and must remain distinguishable.
     *
     * RU: raznicaZapisano = otmetokZapisano − zapisano; novayaRaznica = raznicaZapisano − istoricheskayaRaznica.
     *    Без сохранённой отсечки новое расхождение неизвестно, а не ноль. Нечисловая, небезопасная или
     *    отрицательно датированная отсечка вызывает ошибку и не заменяется автоматически.
     * EN: raznicaZapisano = otmetokZapisano − zapisano; novayaRaznica = raznicaZapisano − istoricheskayaRaznica.
     *    Without a saved baseline, the new discrepancy is unknown, not zero. A nonnumeric or unsafe baseline, or
     *    one with a negative timestamp, raises an error and is not reset automatically.
     *
     * RU: Границы: расхождение показывает разницу счётчиков, а не причину потери. Группы отказов считаются по
     *    паре ishod/priroda; poPrirode хранит один ключ на природу и СКЛАДЫВАЕТ группы одной природы из разных
     *    исходов (A-N-1948 №3, №25; до того поздняя группа заменяла раннюю).
     * EN: Limits: a discrepancy measures a counter difference, not the cause of a loss. Refusal groups are
     *    counted by the ishod/priroda pair; poPrirode stores one key per nature and SUMS groups of the same nature
     *    across outcomes (A-N-1948 №3, №25; previously the later group replaced the earlier one).
     */
    svodka(agent) {
      /**
       * RU: Снять обе величины одним SQL-запросом: текущие строки знаний и события журнала — разные единицы. Это
       *    согласованный замер счётчиков, а не проверка содержимого каждой записи.
       * EN: Read both quantities in one SQL query: current knowledge rows and journal events are different units.
       *    This is a consistent counter measurement, not a content check of every record.
       */
      const schet = baza.prepare(
        "SELECT count(*) AS zapisano, (SELECT count(*) FROM zhurnal WHERE agent = ? AND ishod = 'zapisano') AS otmetokZapisano FROM zapisi WHERE agent = ?"
      ).get(agent, agent);
      const stroki = baza.prepare(
        'SELECT ishod, priroda, count(*) AS n FROM zhurnal WHERE agent = ? GROUP BY ishod, priroda'
      ).all(agent);
      const zapisano = Number(schet.zapisano);
      const otmetokZapisano = Number(schet.otmetokZapisano);
      const raznicaZapisano = otmetokZapisano - zapisano;
      const otsechka = baza.prepare('SELECT znachenie, postavleno FROM nastrojki WHERE kluch=?')
        .get('schet_zapisey:' + agent);
      if (otsechka && (!/^-?\d+$/.test(otsechka.znachenie)
          || !Number.isSafeInteger(Number(otsechka.znachenie))
          || !Number.isSafeInteger(otsechka.postavleno) || otsechka.postavleno < 0)) {
        throw new Error('dsh-pamyat: негодная отсечка счёта записей; автоматически не переустанавливаю');
      }
      const istoricheskayaRaznica = otsechka ? Number(otsechka.znachenie) : null;
      const novayaRaznica = otsechka ? raznicaZapisano - istoricheskayaRaznica : null;
      const itog = { zapisano, otmetokZapisano, raznicaZapisano,
        istoricheskayaRaznica, novayaRaznica, otsechkaSchetMs: otsechka?.postavleno ?? null,
        zapisiSvodka: `записей ${zapisano} / отметок ${otmetokZapisano}; разница ${raznicaZapisano}; `
          + (otsechka ? `историческое ${istoricheskayaRaznica} (отсечка ${new Date(otsechka.postavleno).toISOString()}) · новое ${novayaRaznica}`
            : 'отсечка не установлена; новая разница неизвестна'),
        otkloneno: 0, poPrirode: {} };
      for (const s of stroki) {
        if (s.ishod !== 'zapisano' && s.ishod !== 'obrabotano') {
          itog.otkloneno += Number(s.n);
          const k = s.priroda ?? 'bez-prirody';
          itog.poPrirode[k] = (itog.poPrirode[k] ?? 0) + Number(s.n);
        }
      }
      return itog;
    },
  };
}
