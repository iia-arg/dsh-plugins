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
  sozdano    INTEGER NOT NULL,
  -- 🔴 Отметка «принято БЕЗ подтверждения» живёт в САМОЙ записи, а не в журнале
  -- решений (правка 02.09). Довод: журнал отвечает на вопрос «что происходило»,
  -- а знание живёт дольше журнала и уезжает в другие слои отдельно от него.
  -- Через месяц без отметки записи неразличимы: какие подтверждены человеком,
  -- какие прошли на узле, где спрашивать было некого. Появится отвечающий —
  -- старые записи честно скажут, что подтверждены не были.
  bez_podtverzhdeniya INTEGER NOT NULL DEFAULT 0,
  -- 🔴 Вера в знание — для гейтинга при выдаче (use / verify / ignore).
  -- ДОПУСКАЕТ ПУСТОТУ НАМЕРЕННО: NULL значит «веру не измеряли», и это НЕ то же
  -- самое, что «вера ноль». Ноль — измеренное недоверие, пустота — отсутствие
  -- измерения. Схлопнешь их в 0 — и знание, которое никто не оценивал, станет
  -- неотличимо от знания, признанного негодным; ветка verify потеряет смысл.
  -- Значение: 0..1. Заведено 03.09 по заявке слоя приветствия.
  vera REAL DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_zapisi_agent_klass ON zapisi(agent, klass);
CREATE INDEX IF NOT EXISTS idx_zapisi_sozdano ON zapisi(sozdano);

-- 🔴 ОЧЕРЕДЬ НЕДОСТАВЛЕННОГО — ОТДЕЛЬНАЯ ТАБЛИЦА, А НЕ ПОЛЕ В ЖУРНАЛЕ.
-- Довод: журнал отвечает на вопрос «что происходило», очередь — «что осталось
-- сделать». Записи журнала неизменяемы (событие случилось), записи очереди
-- меняются (попытка, успех, снятие). Смешаешь — получишь таблицу, которая разом
-- история и состояние, и через месяц никто не скажет, что в ней правда.
-- И вторая причина, замеренная: в журнале НЕТ опознавателя записи знания, то
-- есть по нему нельзя узнать, ЧТО повторять. Восстанавливать по (agent, klass,
-- время) значило бы угадывать.
CREATE TABLE IF NOT EXISTS ochered_dolgovremennogo (
  -- Один экземпляр на запись: повторная постановка обновляет, а не множит.
  zapis_id   INTEGER PRIMARY KEY,
  agent      TEXT NOT NULL,
  klass      TEXT NOT NULL,
  -- 🔴 ПРИРОДА РЕШАЕТ, ЧТО ДЕЛАТЬ, и потому хранится, а не выводится:
  --   ne-otpravleno      связи не было до вызова     -> повтор ЗАПИСЬЮ безопасен
  --   ne-najdeno         спросили, записи нет        -> повтор ЗАПИСЬЮ безопасен
  --   moglo-dojti-id-est опознаватель есть           -> сперва ПРОВЕРКА чтением
  --   moglo-dojti-bez-id отправка была, id нет       -> разбор РУКОЙ
  priroda    TEXT NOT NULL,
  -- Только для moglo-dojti-id-est: по нему и спрашиваем, легло ли.
  mem_id     TEXT,
  postavleno INTEGER NOT NULL,
  popytok    INTEGER NOT NULL DEFAULT 0,
  poslednyaya_prichina TEXT,
  kogda_poslednyaya    INTEGER,
  -- 🔴 Исчерпание НЕ удаляет запись. Удалить молча значит потерять знание и не
  -- узнать об этом — худший исход из возможных. Флаг гасит только повторный крик.
  ischerpano INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ochered_agent ON ochered_dolgovremennogo(agent);
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
/** Разобрать составные поля записи. Возвращает НОВЫЙ объект, исходный не трогает. */
function razobrat_polya (z) {
  const razobrat = (v) => {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  };
  return { ...z, ochistka: razobrat(z.ochistka), podozrenie: razobrat(z.podozrenie) };
}

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
    // Схема растёт только добавлением: база, созданная прежней версией, обязана
    // читаться новой без переноса данных — иначе обновление плагина потеряет
    // память агента. Отсутствие колонки в старой базе — норма, а не отказ.
    const stolbcy = baza.prepare('PRAGMA table_info(zapisi)').all().map((r) => r.name);
    if (!stolbcy.includes('bez_podtverzhdeniya')) {
      baza.exec('ALTER TABLE zapisi ADD COLUMN bez_podtverzhdeniya INTEGER NOT NULL DEFAULT 0');
    }
    if (!stolbcy.includes('ochistka')) {
      // Отметка о чистке — В САМОЙ ЗАПИСИ, а не в журнале: журнал живёт короче знания,
      // а сверка с источником (Э8.1) сравнит изменённый текст с исходным и покраснеет
      // без причины, если не знает, что фильтр входа что-то вычистил.
      // NULL значит «текст не менялся». Пустой объект НЕ пишется: «нет отметки» и
      // «отметка пустая» обязаны различаться.
      baza.exec('ALTER TABLE zapisi ADD COLUMN ochistka TEXT DEFAULT NULL');
    }
    if (!stolbcy.includes('podozrenie')) {
      // Подозрение на секрет — В САМОЙ ЗАПИСИ, отдельным полем от `ochistka`:
      // там что ИЗМЕНИЛИ, здесь в чём ПОДОЗРЕНИЕ. Разные вопросы — разные поля.
      // Ставится правилом энтропии, которое судит по ВИДУ строки и потому не запирает
      // запись: на больших корпусах знаний оно даёт ложные (замер соседнего узла —
      // 2–16% из 3560 записей). NULL значит «правило не срабатывало».
      baza.exec('ALTER TABLE zapisi ADD COLUMN podozrenie TEXT DEFAULT NULL');
    }
    if (!stolbcy.includes('vera')) {
      // Старым строкам вера НЕ проставляется: они её не имели, и приписывать им
      // задним числом любое число значило бы выдумать измерение.
      baza.exec('ALTER TABLE zapisi ADD COLUMN vera REAL DEFAULT NULL');
    }
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
    zapisat({ agent, klass, soderzhim, istochnik = null, sozdano = Date.now(), bezPodtverzhdeniya = false, vera = null, ochistka = null, podozrenie = null }) {
      if (!agent || !klass || !soderzhim) {
        const e = new Error('dsh-pamyat: запись без обязательных полей (agent, klass, soderzhim)');
        e.code = 'PAMYAT_NEPOLNAYA_ZAPIS';
        throw e;
      }
      // Вера: число 0..1 либо пустота. Мусор не пишем и не подменяем нулём —
      // отвергаем, потому что «неизмеренное» и «измеренное как ноль» разные.
      let veraZnach = null;
      if (vera !== null && vera !== undefined) {
        if (typeof vera !== 'number' || Number.isNaN(vera) || vera < 0 || vera > 1) {
          const e = new Error('dsh-pamyat: вера должна быть числом 0..1 либо не задана вовсе; получено ' + JSON.stringify(vera));
          e.code = 'PAMYAT_VERA_NEGODNA';
          throw e;
        }
        veraZnach = vera;
      }
      // Отметка о чистке: NULL значит «текст не менялся». Пустой объект не пишем —
      // «нет отметки» и «отметка пустая» обязаны различаться.
      const ochistkaZnach = ochistka ? JSON.stringify(ochistka) : null;
      const podozrenieZnach = podozrenie ? JSON.stringify(podozrenie) : null;
      const r = baza.prepare(
        'INSERT INTO zapisi (agent, klass, soderzhim, istochnik, sozdano, bez_podtverzhdeniya, vera, ochistka, podozrenie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(agent, klass, soderzhim, istochnik, sozdano, bezPodtverzhdeniya ? 1 : 0, veraZnach, ochistkaZnach, podozrenieZnach);
      return Number(r.lastInsertRowid);
    },
    /** Прочитать последние записи агента. Пустой массив = записей нет (база жива). */
    // 🔴 РАЗБОР СОСТАВНЫХ ПОЛЕЙ ПРИ ЧТЕНИИ. `ochistka` и `podozrenie` лежат в базе
    // строкой JSON. Без разбора потребитель получает СТРОКУ, у которой `.klassy` и
    // `.klass` — undefined: чтение «получилось», а поле молча пустое. Замер 04.09.2026:
    // проба на пометку упала именно так, и по виду это был дефект записи, а не чтения.
    // Негодный JSON НЕ роняет чтение и НЕ подменяется пустотой: возвращается как есть,
    // чтобы «поле испорчено» отличалось от «поля не было».
    prochitat({ agent, klass = null, skolko = 20 }) {
      const sql = klass
        ? 'SELECT * FROM zapisi WHERE agent = ? AND klass = ? ORDER BY sozdano DESC LIMIT ?'
        : 'SELECT * FROM zapisi WHERE agent = ? ORDER BY sozdano DESC LIMIT ?';
      const args = klass ? [agent, klass, skolko] : [agent, skolko];
      return baza.prepare(sql).all(...args).map(razobrat_polya);
    },
    /**
     * Прочитать одну запись по опознавателю. Нужна для повтора доставки: чтобы
     * спросить хранилище «легло ли», нужен ОБРАЗЕЦ содержимого, а он живёт здесь.
     * Возвращает undefined, если записи нет, — это не отказ, а ответ.
     */
    poId(id) {
      const z = baza.prepare('SELECT * FROM zapisi WHERE id = ?').get(id);
      return z ? razobrat_polya(z) : z;
    },

    /** Поставить запись в очередь доставки. Повторная постановка ОБНОВЛЯЕТ строку. */
    vOchered({ zapis_id, agent, klass, priroda, mem_id = null, prichina = null }) {
      baza.prepare(
        'INSERT INTO ochered_dolgovremennogo ' +
        '(zapis_id, agent, klass, priroda, mem_id, postavleno, popytok, poslednyaya_prichina, kogda_poslednyaya) ' +
        'VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?) ' +
        'ON CONFLICT(zapis_id) DO UPDATE SET priroda = excluded.priroda, mem_id = excluded.mem_id, ' +
        'poslednyaya_prichina = excluded.poslednyaya_prichina, kogda_poslednyaya = excluded.kogda_poslednyaya'
      ).run(zapis_id, agent, klass, priroda, mem_id, Date.now(), prichina, Date.now());
    },

    /** Что ждёт доставки. Пустой массив = очередь пуста (база жива). */
    ochered({ agent = null, vklyuchayaIscherpannye = true } = {}) {
      const usloviya = [];
      const args = [];
      if (agent) { usloviya.push('agent = ?'); args.push(agent); }
      if (!vklyuchayaIscherpannye) usloviya.push('ischerpano = 0');
      const gde = usloviya.length ? ' WHERE ' + usloviya.join(' AND ') : '';
      return baza.prepare('SELECT * FROM ochered_dolgovremennogo' + gde + ' ORDER BY postavleno').all(...args);
    },

    /** Снять с очереди — доставка подтверждена. */
    snyatSOcheredi(zapis_id) {
      baza.prepare('DELETE FROM ochered_dolgovremennogo WHERE zapis_id = ?').run(zapis_id);
    },

    /**
     * Засчитать ПОПЫТКУ и вернуть, случилось ли исчерпание ИМЕННО СЕЙЧАС.
     * 🔴 Возвращает переход, а не состояние: крик об исчерпании должен звучать
     * ОДИН раз, а не на каждом ночном проходе. Состояние читается из очереди.
     */
    otmetitPopytku({ zapis_id, prichina = null, predel = 5 }) {
      const bylo = baza.prepare('SELECT popytok, ischerpano FROM ochered_dolgovremennogo WHERE zapis_id = ?').get(zapis_id);
      if (!bylo) return { est: false, ischerpalos: false, popytok: 0 };
      const stalo = Number(bylo.popytok) + 1;
      const ischerpalos = Number(bylo.ischerpano) === 0 && stalo >= predel;
      baza.prepare(
        'UPDATE ochered_dolgovremennogo SET popytok = ?, poslednyaya_prichina = ?, kogda_poslednyaya = ?, ischerpano = ? WHERE zapis_id = ?'
      ).run(stalo, prichina, Date.now(), (Number(bylo.ischerpano) === 1 || ischerpalos) ? 1 : 0, zapis_id);
      return { est: true, ischerpalos, popytok: stalo };
    },

    /** Сколько записей у агента — для наблюдаемости и стендов. */
    skolkoZapisej(agent) {
      return Number(baza.prepare('SELECT count(*) AS n FROM zapisi WHERE agent = ?').get(agent).n);
    },
    zakryt() { baza.close(); },
  };
}
