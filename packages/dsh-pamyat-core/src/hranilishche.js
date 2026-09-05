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
 * Собрать ЧИТАЕМУЮ причину отказа из объекта ошибки.
 *
 * 🔴 ЗАЧЕМ, А НЕ `e?.message ?? String(e)`. Оператор `??` реагирует только на null и
 * undefined; пустая строка для него — найденное значение. У `AggregateError`, которую
 * кладёт fetch, перебрав адреса, собственный `message` как раз ПУСТОЙ — и строка
 * «Причина: » печаталась с пустотой. Замер 04.09.2026 в соседнем пакете: 125 таких строк
 * в живом журнале за три часа.
 * Пустое поле ХУЖЕ отсутствующего: «причина: » читается как «причину узнали, она пустая»
 * и гасит вопрос, тогда как отсутствие поля заставило бы спросить, чем узнавать.
 *
 * ГДЕ НЕ ПРИМЕНЯЕТСЯ: это не сериализация ошибки и не замена стека — только одна строка
 * для человека, читающего отказ. Длина обрезана: причина едет в текст исключения, а его
 * читают глазами.
 * ⚠️ Функция НАМЕРЕННО местная, а не общая на пакеты (долг 100): межпакетная зависимость
 * ради десяти строк дороже дублирования. Расхождение ловит проба в стенде, не памятка.
 */
function prichina_stroka(e) {
  const tekst = String(e?.message ?? '').trim();
  const kod   = e?.code ? String(e.code) : '';
  const imya  = e?.name ?? e?.constructor?.name ?? typeof e;
  const hvost = [tekst, kod && '[' + kod + ']'].filter(Boolean).join(' ');
  const vnutri = Array.isArray(e?.errors) && e.errors.length
    ? ' ← ' + e.errors.slice(0, 3).map((v) => String(v?.message ?? v).trim()).filter(Boolean).join('; ')
    : '';
  return (imya + ': ' + (hvost || '(без пояснения)') + vnutri).slice(0, 200);
}

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
      'Это отказ, а не пустая память. Причина: ' + prichina_stroka(prichina)
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

-- 🔴 НАСТРОЙКИ СХЕМЫ — ДАННЫЕ В БАЗЕ, А НЕ КОНСТАНТЫ В ИСХОДНИКЕ (условие приёмки, В2).
-- Здесь живёт РУБЕЖ ПРОИСХОЖДЕНИЯ: номер записи, на котором механизм отметки происхождения
-- был заведён. Константа в коде разъехалась бы с базой при первом же восстановлении из копии:
-- база уехала бы с одним числом, код — с другим, и никто бы не заметил.
CREATE TABLE IF NOT EXISTS nastrojki (
  kluch      TEXT PRIMARY KEY,
  znachenie  TEXT NOT NULL,
  postavleno INTEGER NOT NULL
);
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

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔴 МИГРАЦИЯ «РУБЕЖ ПРОИСХОЖДЕНИЯ» (Э5.3) — ОДНОЙ ТРАНЗАКЦИЕЙ НА ДВА ПОЛЯ.
    //
    // ЗАЧЕМ РУБЕЖ. Поля `proishozhdenie` и `proverka` заводятся на базе, где уже лежит
    // накопленная память. Умолчание у нового поля обязано быть НЕЙТРАЛЬНЫМ: приписать
    // старым записям ноль значило бы объявить недоверенным всё, что мы помним, — и
    // сделать это молча, одним ALTER'ом. Ноль означает «механизм БЫЛ и не справился»,
    // а к старым записям механизм не применялся вовсе. Это разные вещи, и различает их
    // рубеж: записи с id ≤ рубежа — «до протокола», записи с id > рубежа и пустым полем —
    // «происхождение не установлено». Решение предмета получено служебным каналом 04–05.09.2026.
    //
    // ⚠️ ОГРАНИЧЕНИЕ, БЕЗ КОТОРОГО РУБЕЖ ВРЁТ: он действителен, ПОКА РЯД id НАШ СОБСТВЕННЫЙ.
    // ЗАПРЕЩЁН ВВОЗ С СОХРАНЕНИЕМ ЧУЖИХ id: чужая запись с малым номером легла бы ниже
    // рубежа и получила привилегию нашей старой памяти — отмывание доверия через ввоз.
    // Ввозимые записи получают НАШИ id и статус по номеру не наследуют. Тот, кто заведёт
    // ввоз (Э8.5), увидит это же требование ОТКАЗОМ в коде ввоза, а не только здесь:
    // предупреждение в соседнем файле упирающийся не прочтёт.
    //
    // 🔴 ПОЧЕМУ ОДНА ТРАНЗАКЦИЯ. Между снятием max(id) и добавлением столбца может лечь
    // новая запись. Без транзакции она получила бы номер ниже рубежа, то есть статус
    // «до протокола», хотя механизм к моменту её появления уже существовал. Окно узкое,
    // ошибка молчаливая. BEGIN IMMEDIATE берёт запись сразу, а не при первой записи.
    //
    // 🔴 ИДЕМПОТЕНТНОСТЬ. Рубеж снимается ТОЛЬКО если его ещё нет. Второй прогон миграции
    // с пересчётом max(id) тихо перевёл бы всю накопленную память в «после протокола» —
    // ровно та беда, от которой уходим, только с другого конца.
    //
    // ГДЕ ЭТО НЕ ПРИМЕНЯЕТСЯ: рубеж НЕ судит о содержании записи и не измеряет доверие.
    // Он отвечает на один вопрос — существовал ли механизм отметки, когда запись легла.
    const nuzhno_proishozhdenie = !stolbcy.includes('proishozhdenie');
    const nuzhno_proverka = !stolbcy.includes('proverka');
    const rubezh_est = baza.prepare("SELECT znachenie FROM nastrojki WHERE kluch = 'rubezh_proishozhdeniya'").get();
    if (nuzhno_proishozhdenie || nuzhno_proverka || !rubezh_est) {
      baza.exec('BEGIN IMMEDIATE');
      try {
        if (!baza.prepare("SELECT znachenie FROM nastrojki WHERE kluch = 'rubezh_proishozhdeniya'").get()) {
          const max = Number(baza.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM zapisi').get().m);
          baza.prepare('INSERT INTO nastrojki (kluch, znachenie, postavleno) VALUES (?, ?, ?)')
            .run('rubezh_proishozhdeniya', String(max), Date.now());
        }
        if (nuzhno_proishozhdenie) {
          // Уровень происхождения. NULL значит «не проставлено», и у записи ниже рубежа
          // это читается как «до протокола», а выше — как «не установлено».
          baza.exec('ALTER TABLE zapisi ADD COLUMN proishozhdenie INTEGER DEFAULT NULL');
        }
        if (nuzhno_proverka) {
          // Сверка записи с опорой в журнале (Э8.1): est / utrachena / NULL.
          // NULL — «ещё не проверяли», и это НИКОГДА не читается как «утрачена».
          baza.exec("ALTER TABLE zapisi ADD COLUMN proverka TEXT DEFAULT NULL");
        }
        baza.exec('COMMIT');
      } catch (prichina) {
        try { baza.exec('ROLLBACK'); } catch { /* откат уже случился сам */ }
        throw prichina;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔴 МИГРАЦИЯ «СЧЁТЧИК КАСАНИЙ» (Э8.3 П1, ворота В1 приёмки) — СВОЕЙ ТРАНЗАКЦИЕЙ.
    //
    // ЗАЧЕМ. Замысел предмета: две записи равной веры, одну трогали вчера, другую месяц
    // назад — свежая касанием должна стоять выше. Сегодня «тепло» считается ТОЛЬКО по
    // возрасту записи, то есть это свежесть под другим именем: запись, к которой
    // обращаются каждый день, стареет ровно так же, как забытая.
    //
    // ⚠️ ЧТО ЗНАЧИТ НОЛЬ У СТАРЫХ ЗАПИСЕЙ, И ЧЕГО ОН НЕ ЗНАЧИТ. Ноль здесь — «касаний НЕ
    // БЫЛО С ПОЯВЛЕНИЯ СЧЁТЧИКА», а не «к записи никогда не обращались»: до этой миграции
    // касания не считались вовсе. Различить «не касались» и «касались до счётчика»
    // ПО ЭТОМУ ПОЛЮ НЕЛЬЗЯ, и рубеж здесь не заводится намеренно — в отличие от
    // происхождения, ноль касаний ничего не отнимает у записи, пока вес прибавки равен
    // нулю (ворота В4). Единственный честный признак «счётчик к ней не применялся» —
    // poslednee_kasanie IS NULL, и он читается именно так, а не как «касались в нуле».
    //
    // 🔴 ИДЕМПОТЕНТНОСТЬ: поля добавляются только если их нет. Повторная миграция не
    // трогает числа — иначе второй прогон обнулил бы накопленные касания молча.
    const nuzhno_kasanij = !stolbcy.includes('kasanij');
    const nuzhno_posl_kasanie = !stolbcy.includes('poslednee_kasanie');
    if (nuzhno_kasanij || nuzhno_posl_kasanie) {
      baza.exec('BEGIN IMMEDIATE');
      try {
        if (nuzhno_kasanij) baza.exec('ALTER TABLE zapisi ADD COLUMN kasanij INTEGER NOT NULL DEFAULT 0');
        if (nuzhno_posl_kasanie) baza.exec('ALTER TABLE zapisi ADD COLUMN poslednee_kasanie INTEGER DEFAULT NULL');
        baza.exec('COMMIT');
      } catch (prichina) {
        try { baza.exec('ROLLBACK'); } catch { /* откат уже случился сам */ }
        throw prichina;
      }
    }
  } catch (prichina) {
    const e = new Error(
      'dsh-pamyat: база памяти не открылась по пути ' + putK + '. ' +
      'Память НЕ РАБОТАЕТ — это отказ, а не пустая память. Причина: ' +
      prichina_stroka(prichina)
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

    /**
     * Рубеж происхождения — номер записи, на котором механизм отметки был заведён.
     * Читается ИЗ БАЗЫ при каждом вызове, а не запоминается: база может уехать на другую
     * машину или откатиться из копии, и тогда число в памяти процесса разойдётся с данными.
     */
    rubezhProishozhdeniya() {
      const r = baza.prepare("SELECT znachenie FROM nastrojki WHERE kluch = 'rubezh_proishozhdeniya'").get();
      if (!r) {
        // Рубежа нет — значит миграция не проходила. Это ОТКАЗ, а не «рубеж ноль»:
        // ноль означал бы «все записи после протокола», то есть недоверие ко всей памяти.
        const e = new Error('dsh-pamyat: рубеж происхождения не найден в настройках базы — миграция не проходила');
        e.code = 'PAMYAT_NET_RUBEZHA';
        throw e;
      }
      return Number(r.znachenie);
    },

    /**
     * СТАТУС ПРОИСХОЖДЕНИЯ ЗАПИСИ — ТРИ РАЗНЫЕ СТРОКИ, А НЕ ТРИ ЧИСЛА.
     *
     * 🔴 Потребителю нельзя давать одно поле с тремя смыслами: он схлопнет их сравнением.
     * Так уже вышло с верой (restore/index.js): `null < 0.7` дало verify, `undefined < 0.7`
     * дало USE — два вида отсутствия привели к ПРОТИВОПОЛОЖНЫМ решениям, и одно из них
     * объявило неизмеренную запись достоверной. Поэтому здесь возвращается СТАТУС словом.
     *
     *   do-protokola     id ≤ рубежа: механизма не было, когда запись легла. Не упрёк записи.
     *   ne-ustanovleno   id > рубежа, поле пусто: механизм был, происхождение не проставлено.
     *   uroven           поле проставлено: число говорит само за себя.
     *
     * ⚠️ ГРАНИЦА: статус НЕ измеряет достоверность содержимого. Он отвечает на вопрос
     * «существовал ли протокол в момент записи», и ни на какой другой.
     * ⚠️ И сортировка: «до протокола» сортируется НЕЙТРАЛЬНО — то есть выдача не меняет
     * порядок из-за этого поля вовсе (ORDER BY sozdano как был). Иначе само введение поля
     * молча переставило бы всю накопленную память.
     */
    statusProishozhdeniya(zapis, rubezh = null) {
      const granica = rubezh === null ? this.rubezhProishozhdeniya() : Number(rubezh);
      const id = Number(zapis?.id);
      if (!Number.isFinite(id)) {
        const e = new Error('dsh-pamyat: статус происхождения спрошен у записи без id');
        e.code = 'PAMYAT_ZAPIS_BEZ_ID';
        throw e;
      }
      const znach = zapis.proishozhdenie;
      if (znach !== null && znach !== undefined) {
        return { status: 'uroven', uroven: Number(znach), stroka: 'происхождение: уровень ' + Number(znach) };
      }
      if (id <= granica) {
        return { status: 'do-protokola', uroven: null, stroka: 'до протокола (механизма отметки ещё не было)' };
      }
      return { status: 'ne-ustanovleno', uroven: null, stroka: 'происхождение не установлено' };
    },

    /**
     * Проставить происхождение записи.
     *
     * 🔴 ЗАПИСЯМ НИЖЕ РУБЕЖА ПРОИСХОЖДЕНИЕ НЕ ПРОСТАВЛЯЕТСЯ — ОТКАЗ, НЕ ТИХИЙ ПРОПУСК.
     * Довод (находка №1 по Э5.3 (служебный канал), «отмывание доверия»): если старая запись при
     * перезаписи получает уровень, любая запись отмывается до доверенной, не покидая
     * системы. «До протокола» — навсегда: рубеж по id неизменен, и это не строгость,
     * а единственное, что делает рубеж защитой, а не украшением.
     * ГДЕ НЕ ПРИМЕНЯЕТСЯ: записи ВЫШЕ рубежа проставляются свободно и переписываются тоже —
     * там механизм существовал, и уровень есть измерение, а не привилегия.
     */
    otmetitProishozhdenie({ id, uroven }) {
      const granica = this.rubezhProishozhdeniya();
      const nomer = Number(id);
      if (nomer <= granica) {
        const e = new Error(
          'dsh-pamyat: записи ' + nomer + ' происхождение не проставляется — она НИЖЕ рубежа ' +
          granica + ' («до протокола»). Иначе старая запись отмывается до доверенной перезаписью.'
        );
        e.code = 'PAMYAT_ZAPIS_DO_PROTOKOLA';
        throw e;
      }
      if (typeof uroven !== 'number' || Number.isNaN(uroven)) {
        const e = new Error('dsh-pamyat: уровень происхождения должен быть числом; получено ' + JSON.stringify(uroven));
        e.code = 'PAMYAT_UROVEN_NEGODEN';
        throw e;
      }
      const r = baza.prepare('UPDATE zapisi SET proishozhdenie = ? WHERE id = ?').run(uroven, nomer);
      // Число изменённых строк — доказательство, а не «успех вызова»: записи с таким
      // номером может не быть вовсе, и молчаливый ноль читался бы как проставлено.
      return Number(r.changes) === 1;
    },

    /**
     * СТАТУС СВЕРКИ ЗАПИСИ С ОПОРОЙ В ЖУРНАЛЕ (Э8.1) — ТРИ СОСТОЯНИЯ, ТРИ РАЗНЫЕ СТРОКИ.
     *
     * 🔴 ТОТ ЖЕ ПРИЁМ, ЧТО У ПРОИСХОЖДЕНИЯ, И ПО ТОЙ ЖЕ ПРИЧИНЕ. Отсутствие отметки
     * НИКОГДА не читается как «опора утрачена»: первое значит «мы не смотрели», второе —
     * «смотрели и не нашли». Слить их одним полем значит объявить утраченной всю память,
     * до которой не дошли руки, — и сделать это молча.
     *
     *   est            сверка была, опора найдена
     *   utrachena      сверка была, опоры в журнале НЕТ — это про предмет
     *   ne-proveryalos поля нет: до записи просто не дошли. Не упрёк и не тревога.
     *
     * ⚠️ ГРАНИЦА, КОТОРУЮ НЕЛЬЗЯ ЧИТАТЬ ШИРЕ НАПИСАННОГО: проверяется НАЛИЧИЕ опоры
     * (границы seq найдены в журнале), а НЕ совпадение текста записи с источником.
     * «Опора есть» отвечает на «свидетель жив», а не на «запись правдива».
     */
    statusProverki(zapis) {
      const syroe = zapis?.proverka;
      if (syroe === null || syroe === undefined || syroe === '') {
        return { status: 'ne-proveryalos', kogda: null, stroka: 'сверка с опорой не проводилась' };
      }
      let r;
      try { r = typeof syroe === 'string' ? JSON.parse(syroe) : syroe; } catch { r = null; }
      if (!r || typeof r !== 'object' || !r.ishod) {
        // Битая отметка — это НЕ «не проверялось»: кто-то писал и записал негодное.
        return { status: 'otmetka-negodna', kogda: null, stroka: 'отметка сверки не разбирается — писавший ошибся' };
      }
      const podpis = r.ishod === 'est' ? 'опора найдена' : (r.ishod === 'utrachena' ? 'опора УТРАЧЕНА' : String(r.ishod));
      return { status: r.ishod, kogda: r.kogda ?? null, chem: r.chem ?? null, stroka: podpis };
    },

    /**
     * Проставить отметку сверки.
     *
     * 🔴 ЧЕМ СВЕРЯЛИ — ЧАСТЬ ОТМЕТКИ, А НЕ ПОЯСНЕНИЕ. Отметка без имени прибора не даёт
     * перепроверить: через месяц «опора утрачена» может означать и настоящую пропажу,
     * и то, что прибор читал журнал негодным способом. Мы это уже видели: встроенный
     * разбор многокадрового журнала отдавал 126 байт из 32 миллионов БЕЗ ошибки и с кодом
     * ноль — механизм, ищущий потерю свидетеля, при собственном отказе СФАБРИКОВАЛ бы её
     * для всех записей разом. Поэтому `chem` обязателен.
     * ГДЕ НЕ ПРИМЕНЯЕТСЯ: рубеж происхождения сюда не касается. Сверка отвечает про
     * журнал сессии, а не про то, существовал ли протокол отметки.
     */
    otmetitProverku({ id, ishod, chem, kogda = Date.now() }) {
      const nomer = Number(id);
      const dopustimo = ['est', 'utrachena'];
      if (!dopustimo.includes(ishod)) {
        const e = new Error('dsh-pamyat: исход сверки должен быть одним из ' + dopustimo.join(' | ')
          + '; получено ' + JSON.stringify(ishod) + '. «Не проверялось» НЕ пишется — это отсутствие отметки');
        e.code = 'PAMYAT_ISHOD_SVERKI_NEGODEN';
        throw e;
      }
      if (typeof chem !== 'string' || chem.trim() === '') {
        const e = new Error('dsh-pamyat: не назван прибор сверки (chem). Отметка без имени прибора '
          + 'не даёт отличить пропажу опоры от негодного чтения журнала');
        e.code = 'PAMYAT_SVERKA_BEZ_PRIBORA';
        throw e;
      }
      const r = baza.prepare('UPDATE zapisi SET proverka = ? WHERE id = ?')
        .run(JSON.stringify({ ishod, chem, kogda }), nomer);
      return Number(r.changes) === 1;
    },

    /**
     * ОТМЕТИТЬ КАСАНИЕ — запись УШЛА В ВЫДАЧУ агенту (Э8.3 П1, ворота В2 приёмки).
     *
     * 🔴 ЧТО СЧИТАЕТСЯ КАСАНИЕМ — НАЗВАНО ЗДЕСЬ И ОДНО: запись попала в результат отбора,
     * который ушёл в ход агента. НЕ считается: чтение поиском, просмотр прибором, вывоз,
     * дистилляция, сторожа, стенды. Иначе приборы греют память сами, и «часто нужное»
     * становится «часто осматриваемое» — величина поменяет смысл, не поменяв имени.
     *
     * 🔴 ПОВОД ОБЯЗАТЕЛЕН И СВЕРЯЕТСЯ СО СЛОВАРЁМ. Запретить прибору позвать этот метод
     * нельзя, но можно сделать так, чтобы вызов «на всякий случай» ОТКАЗАЛ, а не оставил
     * тихую отметку. Это тот же приём, что имя прибора в отметке сверки: обязательное поле
     * превращает небрежность в отказ, который видно.
     *
     * 🔴 ОТКАЗ ЗАПИСИ НЕ ЛОМАЕТ ВЫДАЧУ (ворота В3). Касание — вторичный учёт: база занята
     * или открыта только на чтение — выдача агенту уже состоялась, и рушить её из-за
     * счётчика нельзя. Поэтому метод НЕ бросает при отказе UPDATE, а возвращает отказ и
     * говорит о нём вслух. Молчать тоже нельзя: тогда «касаний ноль» будет означать разом
     * и «не касались», и «не смогли записать».
     *
     * ⚠️ ГДЕ НЕ ПРИМЕНЯЕТСЯ: касание НЕ трогает proishozhdenie и proverka (ворота В9) —
     * это UPDATE ровно двух полей. И оно ничего не решает: пока вес прибавки равен нулю
     * (ворота В4), порядок выдачи от касаний не зависит вовсе.
     *
     * Возвращает { otmecheno, otkaz } — число изменённых строк, а не «успех».
     */
    otmetitKasanie({ ids, povod, kogda = Date.now() }) {
      const POVOD_VYDACHA = 'vydacha-agentu';
      if (povod !== POVOD_VYDACHA) {
        const e = new Error('dsh-pamyat: касание отмечается только с поводом «' + POVOD_VYDACHA
          + '»; получено ' + JSON.stringify(povod) + '. Чтение прибором, вывоз и стенды касанием НЕ являются');
        e.code = 'PAMYAT_KASANIE_NE_TOT_POVOD';
        throw e;
      }
      const spisok = (Array.isArray(ids) ? ids : [ids])
        .map(Number).filter((n) => Number.isInteger(n) && n > 0);
      // Пустой список — не отказ и не ошибка: отбор мог вернуть ноль записей.
      if (spisok.length === 0) return { otmecheno: 0, otkaz: null };
      try {
        const st = baza.prepare('UPDATE zapisi SET kasanij = kasanij + 1, poslednee_kasanie = ? WHERE id = ?');
        let n = 0;
        for (const id of spisok) n += Number(st.run(kogda, id).changes);
        return { otmecheno: n, otkaz: null };
      } catch (prichina) {
        const otkaz = {
          code: 'PAMYAT_KASANIE_NE_ZAPISANO',
          pochemu: prichina_stroka(prichina),
          zaprosheno: spisok.length,
        };
        // Сказать вслух ОБЯЗАТЕЛЬНО, и двумя путями: журнал в той же базе может быть
        // недоступен ровно по той же причине, по которой не прошёл UPDATE.
        try {
          baza.prepare('INSERT INTO zhurnal (kogda, agent, klass, ishod, priroda, pochemu, istochnik)'
            + ' VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(kogda, 'pamyat', 'kasanie', 'otkloneno', otkaz.code, otkaz.pochemu, null);
        } catch { /* журнал в той же базе — если она не пишется, сюда тоже не запишется */ }
        try {
          console.error('[dsh-pamyat] касание НЕ записано (' + otkaz.code + '): ' + otkaz.pochemu
            + '. Выдача агенту состоялась и не отменяется; счёт касаний за этот отбор потерян.');
        } catch { /* печать не должна рушить выдачу */ }
        return { otmecheno: 0, otkaz };
      }
    },

    /** Сколько записей у агента — для наблюдаемости и стендов. */
    skolkoZapisej(agent) {
      return Number(baza.prepare('SELECT count(*) AS n FROM zapisi WHERE agent = ?').get(agent).n);
    },
    zakryt() { baza.close(); },
  };
}
