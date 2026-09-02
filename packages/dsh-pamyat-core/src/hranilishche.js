/**
 * Хранилище памяти агента — оперативный слой на встроенном SQLite.
 *
 * ЗАЧЕМ. Плагину нужна память, переживающая сессию и компакт, и доступная БЕЗ
 * внешних служб: у части установок нет ни OMEGA, ни другого долговременного
 * хранилища. Этот слой всегда локальный и всегда обязательный; долговременный
 * провайдер подключается сверху и может отсутствовать.
 *
 * ПОЧЕМУ ВСТРОЕННЫЙ `node:sqlite`, А НЕ БИБЛИОТЕКА. Пакет публикуется; любая
 * нативная зависимость требует сборки на машине установщика. Встроенный модуль
 * даёт ноль зависимостей.
 * 🔴 ГРАНИЦА: модуль помечен экспериментальным и требует Node >= 22. На более
 * старом узле пакет работать НЕ БУДЕТ — и обязан сказать это словами.
 *
 * ЧЕГО ЭТОТ СЛОЙ НЕ ДЕЛАЕТ. Не решает, что записывать (это политика записи),
 * не дистиллирует (это секретарь), не ходит в сеть. Только хранит и отдаёт.
 */
import { createRequire } from 'node:module';

const trebuj = createRequire(import.meta.url);

/**
 * Загрузить драйвер SQLite.
 *
 * 🔴 ОТСУТСТВИЕ МОДУЛЯ — ОТКАЗ, А НЕ ТИХАЯ ДЕГРАДАЦИЯ. Класс ошибки, ради
 * которого это написано: «нет хранилища» внешне неотличимо от «нечего
 * записывать» — оба дают ноль записей. Поэтому провал загрузки превращается в
 * внятное сообщение с кодом, а не в пустой результат.
 *
 * ГДЕ НЕ ПРИМЕНЯЕТСЯ: это проверка НАЛИЧИЯ модуля, а не прав на файл базы и не
 * целостности базы — их проверяет otkrytHranilishche ниже.
 */
export function zagruzitDrajver(imyaModulya = 'node:sqlite') {
  try {
    // Имя модуля — параметр НАМЕРЕННО: иначе ветку отказа нельзя проверить
    // порчей, а непроверяемая ветка отказа и есть тихая деградация.
    return trebuj(imyaModulya);
  } catch (prichina) {
    const versiya = globalThis.process?.version ?? 'неизвестно';
    const e = new Error(
      'dsh-pamyat: хранилище недоступно — встроенный модуль node:sqlite не загрузился. ' +
      'Нужен Node >= 22, сейчас ' + versiya + '. ' +
      'Память НЕ РАБОТАЕТ: записи не сохраняются и не читаются. ' +
      'Это отказ, а не пустая память. Причина: ' + (prichina?.message ?? String(prichina))
    );
    e.code = 'PAMYAT_NET_HRANILISHCHA';
    throw e;
  }
}

/**
 * Схема хранилища. Меняется только добавлением: старые базы должны читаться
 * новым кодом без миграции, иначе обновление плагина потеряет память агента.
 *
 * Поля записи:
 *   klass      — класс знания; на нём стоит политика записи (ask/auto)
 *   soderzhim  — сам текст
 *   istochnik  — verbatim-ссылка вида `session#seq`, чтобы знание можно было
 *                проверить в журнале, а не верить ему на слово
 *   sozdano    — время в миллисекундах UTC
 *   agent      — чьё знание; на одной машине несколько агентов
 */
const SHEMA = `
CREATE TABLE IF NOT EXISTS zapisi (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent      TEXT NOT NULL,
  klass      TEXT NOT NULL,
  soderzhim  TEXT NOT NULL,
  istochnik  TEXT,
  sozdano    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_zapisi_agent_klass ON zapisi(agent, klass);
CREATE INDEX IF NOT EXISTS idx_zapisi_sozdano ON zapisi(sozdano);
`;

/**
 * Открыть хранилище по пути.
 *
 * 🔴 ПУТЬ ЗАДАЁТ ВЫЗЫВАЮЩИЙ. Внутри пакета нет ни одного абсолютного пути к
 * чьим-либо каталогам: публикуемый код не должен знать про наши машины.
 *
 * 🔴 ОТКАЗ ГРОМКИЙ. Нечитаемый каталог, битая база, нет прав — всё это ОТКАЗ с
 * кодом, а не «пустая память». Отличать «не смог открыть» от «открыл, там
 * пусто» обязан вызывающий, поэтому мы не возвращаем в обоих случаях ноль.
 */
export function otkrytHranilishche(putK, { drajver } = {}) {
  if (!putK || typeof putK !== 'string') {
    const e = new Error('dsh-pamyat: не задан путь к базе памяти (ожидалась строка)');
    e.code = 'PAMYAT_NET_PUTI';
    throw e;
  }
  const { DatabaseSync } = drajver ?? zagruzitDrajver();
  let baza;
  try {
    baza = new DatabaseSync(putK);
    baza.exec(SHEMA);
  } catch (prichina) {
    const e = new Error(
      'dsh-pamyat: база памяти не открылась по пути ' + putK + '. ' +
      'Память НЕ РАБОТАЕТ — это отказ, а не пустая память. Причина: ' +
      (prichina?.message ?? String(prichina))
    );
    e.code = 'PAMYAT_BAZA_NE_OTKRYLAS';
    throw e;
  }
  return {
    /**
     * Открытая база — намеренно наружу: журнал живёт в ТОМ ЖЕ файле, что и
     * знания. Иначе при переносе памяти на другую машину уедет половина:
     * знания без объяснений, почему остального нет.
     */
    baza,
    /** Записать знание. Возвращает id — доказательство записи, а не «успех». */
    zapisat({ agent, klass, soderzhim, istochnik = null, sozdano = Date.now() }) {
      if (!agent || !klass || !soderzhim) {
        const e = new Error('dsh-pamyat: запись без обязательных полей (agent, klass, soderzhim)');
        e.code = 'PAMYAT_NEPOLNAYA_ZAPIS';
        throw e;
      }
      const r = baza.prepare(
        'INSERT INTO zapisi (agent, klass, soderzhim, istochnik, sozdano) VALUES (?, ?, ?, ?, ?)'
      ).run(agent, klass, soderzhim, istochnik, sozdano);
      return Number(r.lastInsertRowid);
    },
    /** Прочитать последние записи агента. Пустой массив = записей нет (база жива). */
    prochitat({ agent, klass = null, skolko = 20 }) {
      const sql = klass
        ? 'SELECT * FROM zapisi WHERE agent = ? AND klass = ? ORDER BY sozdano DESC LIMIT ?'
        : 'SELECT * FROM zapisi WHERE agent = ? ORDER BY sozdano DESC LIMIT ?';
      const args = klass ? [agent, klass, skolko] : [agent, skolko];
      return baza.prepare(sql).all(...args);
    },
    /** Сколько записей у агента — для наблюдаемости и стендов. */
    skolkoZapisej(agent) {
      return Number(baza.prepare('SELECT count(*) AS n FROM zapisi WHERE agent = ?').get(agent).n);
    },
    zakryt() { baza.close(); },
  };
}
