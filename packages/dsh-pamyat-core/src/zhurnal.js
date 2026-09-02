/**
 * Журнал памяти: что записано, что отклонено и ПОЧЕМУ.
 *
 * ЗАЧЕМ. Без журнала «память ничего не записала» неотличимо от «памяти не
 * предлагали записать». Это тот же класс, что и всюду в этом пакете: пустой
 * результат сам по себе не отвечает на вопрос, был ли вопрос задан.
 * Журнал отвечает: в нём видно каждое РЕШЕНИЕ, включая отказы.
 *
 * ЧТО В НЁМ ЛЕЖИТ. По одной строке на решение: время, агент, класс, исход
 * (записано / отклонено), природа отказа, объяснение словами, ссылка на
 * источник. Природа отказа хранится отдельным полем, чтобы «человек не
 * разрешил» и «канала подтверждения нет» можно было СОСЧИТАТЬ раздельно, а не
 * только прочитать глазами.
 *
 * ГДЕ НЕ ПРИМЕНЯЕТСЯ. Журнал не хранит сами знания (их хранит хранилище) и не
 * является доказательством того, что знание доехало до долговременного слоя:
 * он фиксирует решение, а не доставку.
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
 * Завести журнал поверх уже открытой базы.
 * База передаётся снаружи намеренно: журнал и знания живут в одном файле,
 * иначе при переносе памяти на другую машину половина уедет, а половина нет.
 */
export function zavestiZhurnal(baza) {
  if (!baza || typeof baza.exec !== 'function') {
    const e = new Error('dsh-pamyat: журналу не передана открытая база');
    e.code = 'PAMYAT_ZHURNAL_BEZ_BAZY';
    throw e;
  }
  baza.exec(SHEMA);
  return {
    /** Записать решение. Возвращает id строки — доказательство, а не «ок». */
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
    /** Последние решения — для команды состояния и для разбора. */
    poslednie({ agent, skolko = 20 }) {
      return baza.prepare(
        'SELECT * FROM zhurnal WHERE agent = ? ORDER BY kogda DESC LIMIT ?'
      ).all(agent, skolko);
    },
    /**
     * Сводка по природам отказа. Именно она отвечает на вопрос «почему память
     * пуста»: ноль отметок вообще и десяток отказов «нет канала» — это разные
     * беды, и лечатся они по-разному.
     */
    svodka(agent) {
      const stroki = baza.prepare(
        'SELECT ishod, priroda, count(*) AS n FROM zhurnal WHERE agent = ? GROUP BY ishod, priroda'
      ).all(agent);
      const itog = { zapisano: 0, otkloneno: 0, poPrirode: {} };
      for (const s of stroki) {
        if (s.ishod === 'zapisano') itog.zapisano += Number(s.n);
        else {
          itog.otkloneno += Number(s.n);
          itog.poPrirode[s.priroda ?? 'bez-prirody'] = Number(s.n);
        }
      }
      return itog;
    },
  };
}
