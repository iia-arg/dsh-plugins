/**
 * dsh-pamyat-core — оперативная память агента: хранилище, журнал, политика записи.
 *
 * ЗАЧЕМ. В ядре платформы памяти нет вовсе: есть журнал сессии и компакция, но
 * ни хранения знаний, ни их выдачи в начале сессии. Этот пакет даёт основу, на
 * которую становятся остальные пакеты семейства (секретарь, восстановление,
 * гигиена, бюджет, ночной проход, поиск). Своих швов ядра он не занимает —
 * только предоставляет сервис `pamyat` остальным.
 *
 * ЧТО ЗДЕСЬ ЕСТЬ:
 *   хранилище  — локальный SQLite, ноль внешних зависимостей (node:sqlite)
 *   журнал     — каждое РЕШЕНИЕ о записи, включая отказы и их природу
 *   политика   — какие классы пишутся сами, какие требуют подтверждения
 *
 * ЧЕГО ЗДЕСЬ НЕТ: дистилляции, инъекции в контекст, инструментов модели, сети.
 * Долговременный провайдер (OMEGA и прочие) подключается отдельно и МОЖЕТ
 * ОТСУТСТВОВАТЬ — оперативный слой обязан работать без него.
 *
 * 🔴 ГРАНИЦА, ОБЩАЯ ДЛЯ ПАКЕТА. Требуется Node >= 22: хранилище стоит на
 * встроенном модуле node:sqlite, помеченном экспериментальным. На старом узле
 * пакет НЕ РАБОТАЕТ и говорит об этом словами при каждом обращении — молчаливой
 * работы «без записи» здесь нет по построению.
 */
import { createRequire } from 'node:module';
import { otkrytHranilishche } from './hranilishche.js';
import { zavestiZhurnal } from './zhurnal.js';
import { reshitPoKlassu, istolkovatPodtverzhdenie } from './politika.js';
import { filtr_ispraven, najti_sekret, ochistit, trevozhno, proverit_sluzhebnoe, normalizovat } from './filtr-vhoda.js';
import z from '@deepseek-ai/schemastery';

export const name = 'dsh-pamyat-core';

/**
 * Настройка пакета.
 *
 * 🔴 НИ ОДНОГО АБСОЛЮТНОГО ПУТИ К ЧУЖИМ КАТАЛОГАМ. Путь к базе задаёт тот, кто
 * ставит пакет; умолчания с чьим-либо каталогом здесь быть не может —
 * публикуемый код не знает про машины, на которых его запустят.
 */
export const Config = z.object({
  /**
   * Путь к файлу базы. БЕЗ умолчания намеренно: публикуемый код не знает про
   * машины, на которых его запустят, и не вправе угадывать за установщика.
   * Отсутствие ключа отличает «настройка не доехала» от «выбран другой путь».
   */
  putBazy: z.string(),
  /** Имя агента: на машине их несколько, память у каждого своя. */
  agent: z.string(),
  /**
   * Классы, требующие подтверждения. Пусто или не задано — берётся умолчание
   * политики; отключить спрашивание пустым списком нельзя (см. politika.js).
   */
  sprashivat: z.array(z.string()).default([]),
  // 🔴 КЛАССЫ, ИДУЩИЕ В ДОЛГОВРЕМЕННУЮ ПАМЯТЬ. Решение владельца 03.09.2026: туда идут
  // ЗНАНИЯ — решения, уроки, выводы, наблюдения, факты.
  //
  // 🔴 `svodka-kompakcii` СЮДА НЕ ВХОДИТ, И ЭТО НЕ УПУЩЕНИЕ. Сводка — сжатый снимок хода
  // беседы: в ней есть неточности, отменённые замыслы и опровергнутые мысли. Попав в общий
  // поиск, они выпадали бы как знание, не будучи им, и притягивали бы запросы всеми своими
  // темами разом. Не добавляйте её «для полноты»: оперативный слой её и так хранит.
  //
  // 🔴 ПЕРЕЧЕНЬ СВЕДЁН 04.09.2026 ПО РЕШЕНИЮ ВЛАДЕЛЬЦА: восемь классов — объединение пяти
  // названных им и трёх, которые секретарь производит с Э4 (ogranichenie, oshibka, poryadok).
  // До сведения три из восьми уходили только в оперативный слой, и МОЛЧА: каждый пакет был
  // прав по своему списку, а дыра жила между ними и была невидима обоим.
  //
  // 🔴 ЕДИНОГО ИСТОЧНИКА ЗДЕСЬ НЕТ НАМЕРЕННО, И ВОТ ПОЧЕМУ. Сделать один перечень на два
  // пакета можно лишь связав их зависимостью: секретарю пришлось бы импортировать ядро,
  // которое он сейчас знает только как СЛУЖБУ через inject. Зависимость ради константы —
  // дороже беды. Вместо неё стоит проверяемое согласование: стенд ядра требует
  // KLASSY секретаря ⊆ klassyZnaniy и краснеет при расхождении.
  // Это наш приём: непроверяемое намерение («не забудь свести списки») заменено
  // проверяемым следом («списки сверены пробой»).
  klassyZnaniy: z.array(z.string()).default([
    'reshenie', 'urok', 'vyvod', 'ogranichenie', 'oshibka', 'poryadok', 'nablyudenie', 'fakt',
  ]),
  /** Сколько записей отдавать за раз при чтении памяти. */
  chtenieSkolko: z.number().default(20),
  /** Сколько строк журнала отдавать за раз. */
  zhurnalSkolko: z.number().default(20),
  /**
   * 🔴 СОСТОЯНИЕ УЗЛА, А НЕ ВЫКЛЮЧАТЕЛЬ ЗАЩИТЫ. Ключ объявляет факт: на этом
   * узле спрашивать НЕКОГО — службы подтверждения нет и не будет.
   * Почему не «podtverzhdenie: otklyucheno», как предлагалось: такой ключ
   * отключает несущую идею пакета, и включит его каждый, кому лень заводить
   * отвечающего. Продукт выродится в «пиши всё подряд», сохранив название, и
   * выродится ЗАКОННО — по документированной настройке.
   * Здесь правило не отключается: оно остаётся, а его невыполнимость
   * становится частью ДАННЫХ — каждая такая запись несёт отметку о себе.
   */
  otvechayushchegoNet: z.boolean().default(false),
  // 🔴 НАСТРОЕК ДОЛГОВРЕМЕННОГО СЛОЯ ЗДЕСЬ НЕТ НАМЕРЕННО (правка 02.09).
  // Они были — и это была ошибка принадлежности: ядро их описывало, но не
  // исполняло, потому что провайдер вынесен в отдельный пакет. Включённый
  // ключ проходил молча, память объявляла себя доступной, криков ноль.
  // Конфиг, объявленный раньше кода, — тихий ноль: «настройка не доехала»
  // становится неотличима от «выключено».
  // Правило: ключ живёт в том пакете, который его ИСПОЛНЯЕТ.
});

/**
 * 🔴 ЧТО СЮДА НАМЕРЕННО НЕ ВЫНЕСЕНО И ПОЧЕМУ (граница к указанию «всё в конфиг»,
 * 02.09). Настраивается то, что пользователь мог бы захотеть иначе; то, что
 * защищает его от тихой поломки, настройкой быть не должно.
 *
 * 1. ИМЕНА ТАБЛИЦ И СХЕМА БАЗЫ. Пользовательского случая нет: никто не хочет
 *    другого имени таблицы, зато настраиваемое имя даёт способ развести схему
 *    и данные молча — старая база просто перестанет находиться, и это будет
 *    выглядеть как пустая память. Ровно тот исход, против которого пакет.
 * 2. БУКВАЛЬНЫЕ ИСХОДЫ ПОДТВЕРЖДЕНИЯ ЯДРА (rejected/cancelled/unavailable и
 *    два пред-исхода). Это чужой протокол, а не наше решение: их можно только
 *    прочитать в исходнике платформы. Настраиваемый литерал протокола — способ
 *    разойтись с платформой, ничего не заметив.
 * 3. ПОВЕДЕНИЕ ПРИ ОТКАЗЕ («нет источника → не пишем и кричим»). Настраиваемый
 *    fail-closed означает, что защиту можно выключить настройкой. Однажды
 *    кто-нибудь выключит — и получит ровно ту тихую потерю, от которой она.
 */

/**
 * Точка входа плагина.
 *
 * 🔴 ПОЧЕМУ ПРИ ОТКАЗЕ ХРАНИЛИЩА МЫ НЕ РОНЯЕМ ПЛАТФОРМУ, НО И НЕ МОЛЧИМ.
 * Брошенная отсюда ошибка способна остановить загрузку всего узла — цена выше
 * пользы. Тихо работать «без записи» тоже нельзя: это ровно тот класс, ради
 * которого пакет и писался («нет хранилища» неотличимо от «нечего писать»).
 * Поэтому сервис объявляется ВСЕГДА, но при неудачном открытии каждый его
 * вызов отказывает с внятным текстом, а причина один раз пишется в вывод.
 */
/**
 * Сказать громко. ОДИН путь вывода — `console.error`, без развилки.
 *
 * 🔴 ЗНАЕМОЕ (исправлено 03.09, прежняя редакция ВРАЛА). Здесь стояло
 * «платформа НЕ даёт плагину ctx.logger» — НЕВЕРНО. cordis 4.0.1 создаёт
 * `ctx.logger = new LoggerService(ctx)` каждому Context, то есть логгер ЕСТЬ
 * и вызов проходит без ошибки. Но встроенный экспортер только КЛАДЁТ
 * сообщение в буфер на 1000 штук, а DSH своего экспортера не ставит — в поток
 * не уходит НИЧЕГО. «Доложил» и «услышали» расходятся молча.
 *
 * Поэтому развилка `если logger есть → в него` выбирала ветку ВСЕГДА, и все
 * громкие отказы пакета (потерянная запись, отказ политики, миграция) были
 * в бою НЕМЫМИ. Проверять наличие функции недостаточно: функция есть, звука нет.
 *
 * ⚠️ Правило, ради которого это описано подробно: НАЛИЧИЕ канала вывода не
 * означает, что вывод КУДА-ТО ПОПАДЁТ. Годен только тот путь, по которому
 * строка проверена до КОНЦА — до места, где её прочтёт человек. У службы
 * stderr идёт в системный журнал, и это проверено пробой, а не предположением.
 */
// 🔴 ВЕРСИЯ ИЗ СВОЕГО МАНИФЕСТА, НЕ КОНСТАНТОЙ. Правило фермы 03.09.2026: по журналу должно
// быть видно не только КТО сказал, но и КАКАЯ редакция. Константа при следующем выпуске
// утверждала бы номер, которому предмет уже не соответствует. Не прочиталось — говорим
// «версия неизвестна», а не подставляем последнюю известную.
const versiya = (() => {
  try { return createRequire(import.meta.url)('../package.json').version ?? 'версия неизвестна'; }
  catch { return 'версия неизвестна'; }
})();

function krik(soobshchenie) {
  console.error('[dsh-pamyat-core ' + versiya + '] ' + soobshchenie);
}

export function apply(ctx, config = {}) {
  const agent = config.agent;
  const put = config.putBazy;
  let hranilishche = null;
  let zhurnal = null;
  let prichinaOtkaza = null;

  try {
    hranilishche = otkrytHranilishche(put);
    zhurnal = zavestiZhurnal(hranilishche.baza ?? null);
  } catch (e) {
    prichinaOtkaza = e;
  }

  const otkaz = () => {
    const e = new Error(
      'dsh-pamyat: память недоступна, работа с ней невозможна. ' +
      (prichinaOtkaza?.message ?? 'причина не установлена')
    );
    e.code = prichinaOtkaza?.code ?? 'PAMYAT_NEDOSTUPNA';
    throw e;
  };

  // 🔴 БЕЗУСЛОВНЫЙ СЛЕД ПОДЪЁМА. Прежде ядро говорило только при беде и при настройке
  // otvechayushchegoNet — то есть при исправной работе было неотличимо от несмонтированного,
  // а исполняемую редакцию приходилось угадывать. Механизм, чьё единственное свидетельство
  // существования — жалоба, подтверждается тем хуже, чем лучше он настроен.
  //
  // Строка называет и долговременный слой: без неё «знания не уходят в OMEGA» и «класс не в
  // перечне» неразличимы снаружи до первой записи.
  krik('подъём: база ' + (config.putBazy ?? '—') +
       ', классы знаний в долговременную память: ' +
       (config.klassyZnaniy?.length ? config.klassyZnaniy.join(', ') : 'ни одного') +
       (prichinaOtkaza ? ' — НО ХРАНИЛИЩЕ НЕ ОТКРЫТО, см. строку ниже' : ''));

  if (prichinaOtkaza) {
    // Один громкий выкрик при старте: молчащая память выглядит как пустая.
    krik(prichinaOtkaza.message);
  }

  // 🔴 ГРОМКАЯ СТРОКА ПРИ ПОДЪЁМЕ. Узел без отвечающего — законное состояние,
  // но молчаливым оно быть не должно: иначе через месяц никто не вспомнит,
  // почему знания записаны без подтверждения.
  if (config.otvechayushchegoNet) {
    krik('на этом узле спрашивать некого: классы, требующие подтверждения (' +
      (config.sprashivat?.length ? config.sprashivat.join(', ') : 'по умолчанию ogranichenie, navyk') +
      '), будут записываться БЕЗ подтверждения и помечаться в самой записи');
  }

  ctx.provide('pamyat', {
    /** Жива ли память. Потребитель обязан уметь спросить, а не догадываться. */
    dostupna() { return prichinaOtkaza === null; },
    /** Почему недоступна — словами. null, если всё в порядке. */
    pochemuNedostupna() { return prichinaOtkaza ? prichinaOtkaza.message : null; },
    /** Решение по классу — без побочных действий. */
    reshit(klass) { return reshitPoKlassu(klass, { sprashivat: config.sprashivat }); },
    /** Истолковать исход подтверждения, сохранив различение отказа и поломки. */
    istolkovat(ishod, kanalEst) { return istolkovatPodtverzhdenie(ishod, kanalEst); },
    /**
     * Записать знание.
     *
     * 🔴 ВОРОТА ВНУТРИ СЕРВИСА, А НЕ В ПРАВИЛЕ ДЛЯ ВЫЗЫВАЮЩЕГО (правка после
     * ворот аудита 02.09). Раньше политика была отдельной справкой: вызывающий
     * МОГ спросить `reshit()`, а мог и не спросить — и тогда класс, требующий
     * подтверждения, писался в обход. Защита, которую можно не позвать, не
     * защита: она держится на дисциплине звонящего, а не на устройстве.
     * Теперь `zapisat` сам применяет политику и отказывает, если подтверждения
     * не предъявлено. Отказ идёт в журнал с природой — «не записали» всегда
     * имеет причину.
     *
     * Подтверждение передаётся полем `podtverzhdenie` — буквальным исходом
     * ядра ('allowed-once' и прочие из lib/index.js:3303-3350).
     */
    zapisat(zapis) {
      if (!hranilishche) otkaz();

      // ═══ ФИЛЬТР ВХОДА (Э5.2). ВРЕЗКА ЗДЕСЬ НАМЕРЕННО — ДО ВСЯКОЙ РАЗВИЛКИ ═══
      // 🔴 У этой функции СЕМЬ точек выхода и ДВЕ ветки, ведущие к настоящей записи
      // (класс с подтверждением на узле без отвечающего — и обычный путь). Поставь
      // фильтр «перед записью» — вторая ветка пройдёт мимо, и дыра будет выглядеть
      // закрытой.
      //
      // 🔴 ЧЕМ ЭТО ДОКАЗЫВАЕТСЯ, А ЧЕМ НЕТ (поправка автора замысла, 04.09.2026).
      // ДОКАЗАТЕЛЬСТВО ОДНО И ОНО ПОВЕДЕНЧЕСКОЕ: проба П7 в стенде фильтра — врезка
      // переносится в одну ветку, и секрет РЕАЛЬНО проходит через вторую. Красное там
      // означает дыру, а не смену раскладки.
      // СЧЁТ ТОЧЕК ВЫХОДА — не признак приёмки, а ГРУБЫЙ СТОРОЖ: он ловит появление
      // восьмой ветки и больше ничего. Считать по КОДУ, отбросив комментарии, — иначе
      // признак считает сам себя: 04.09.2026 он так и соврал, восьмым возвратом оказалось
      // слово из счётной маски, написанное в пояснении рядом.
      //     grep -vE '^\s*(//|\*|/\*)' <тело> | grep -c '\bre'\'turn\b'
      // Стало больше семи — не «дыра», а «перечитать»: могла появиться ветка мимо фильтра.
      //
      // 🔴 ЧЕГО ФИЛЬТР НЕ ЗАКРЫВАЕТ — см. шапку filtr-vhoda.js. Коротко: отравление
      // приходит добросовестным ПЕРЕСКАЗОМ чужого письма чужой моделью, и текстовым
      // фильтром этот путь не закрывается вовсе. Здесь чистятся невидимые символы и
      // отвергаются секреты — две вещи, измеримые числом. Не читать это как «вход
      // проверен».
      const kanarejka = filtr_ispraven();
      if (!kanarejka.ispraven) {
        // Несимметрия намеренная: по Unicode фильтр fail-open, но СЛОМАННЫЙ фильтр —
        // fail-closed. Иначе поломка молча открывает ворота.
        zhurnal?.otmetit({
          agent, klass: zapis.klass, ishod: 'otkloneno', priroda: 'filtr-vhoda-neispraven',
          pochemu: 'фильтр входа неисправен, запись остановлена: ' + kanarejka.pochemu,
          istochnik: zapis.istochnik ?? null,
        });
        const e = new Error('dsh-pamyat: фильтр входа неисправен (' + kanarejka.pochemu +
                            '), запись НЕ произведена');
        e.code = 'PAMYAT_FILTR_NEISPRAVEN';
        throw e;
      }
      // Служебные поля: НОРМАЛИЗАЦИЯ и ОТКАЗ, а не чистка. Невидимый знак в `klass`
      // не совпал бы с перечнем классов — запись ушла бы «вне перечня», громко и
      // законно, а знание в долговременную память не поехало бы: тихая потеря под
      // видом штатного отказа.
      for (const pole of ['klass', 'istochnik']) {
        const beda = proverit_sluzhebnoe(pole, zapis[pole]);
        if (beda) {
          zhurnal?.otmetit({
            agent, klass: 'sluzhebnoe-pole', ishod: 'otkloneno', priroda: 'nevidimoe-v-sluzhebnom',
            pochemu: 'в служебном поле «' + beda.pole + '» невидимые знаки класса «' +
                     beda.klass + '»: чистить нельзя, такое поле не совпадёт с перечнем ' +
                     'и даст тихую потерю под видом штатного отказа',
            istochnik: null,
          });
          const e = new Error('dsh-pamyat: невидимые знаки в служебном поле «' + beda.pole + '»');
          e.code = 'PAMYAT_NEVIDIMOE_V_SLUZHEBNOM';
          throw e;
        }
      }
      zapis = { ...zapis, klass: normalizovat(zapis.klass), istochnik: normalizovat(zapis.istochnik) };
      const sekret = najti_sekret(String(zapis.soderzhim ?? ''));
      if (sekret) {
        // 🔴 РЕЖИМ ОТКАЗА НАЗНАЧАЕТСЯ КАЖДОМУ ПРАВИЛУ ОТДЕЛЬНО, ПО ЕГО ДОЛЕ ЛОЖНЫХ
        // НА ЖИВОМ КОРПУСЕ (решение автора замысла 04.09.2026, правка его же исходного
        // «fail-closed на все секреты»).
        //
        //   (а) ОБЪЯВЛЕННЫЙ и СТРУКТУРНЫЕ  → fail-CLOSED, запись отвергается.
        //       Ложных почти нет по построению: форма сама себя называет, а объявление
        //       требует разделителя вплотную.
        //   (б) ЭНТРОПИЯ                    → ПОМЕТКА, запись ПРОХОДИТ.
        //       Правило судит по виду строки, а не по её роли, и на больших корпусах
        //       знаний режет настоящие записи: замер соседней машины по 3560 записям —
        //       2–16% при любом алфавите. Запирать такое значит завести системную течь
        //       памяти под видом защиты: цена дешева для ОДНОЙ записи и не дешева
        //       для каждой сороковой.
        //
        // ⚠️ РАСХОЖДЕНИЕ КОРПУСОВ НАЗЫВАЮ, А НЕ СГЛАЖИВАЮ: на моём корпусе (510 записей
        // знаний OMEGA этого узла) исправленный алфавит даёт 0 ложных, а не 2–16%.
        // Кто из нас прав — решается прогоном ЕЁ корпуса МОИМ алфавитом, и до этого
        // прогона разница остаётся неразобранной. Пометка безопасна в обоих исходах:
        // при 0% она ничего не стоит, при 16% — спасает знания. Потому и выбрана.
        const strogo = sekret.klass === 'obyavlennyj' ||
                       sekret.klass === 'uuid-obyavlennyj' ||
                       sekret.klass === 'hex-bez-obyavleniya' ||
                       String(sekret.klass).startsWith('strukturnyj:');
        // В журнал идут КЛАСС и ПОЗИЦИЯ, никогда значение и никогда фрагмент: фильтр
        // секретов, печатающий найденное, становится их публикатором.
        if (strogo) {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'otkloneno', priroda: 'sekret-na-vhode',
            pochemu: 'в тексте найден секрет класса «' + sekret.klass + '» на позиции ' +
                     sekret.pozicia + '; значение не печатается. Знание восстановимо по ' +
                     'источнику: срез журнала append-only',
            istochnik: zapis.istochnik ?? null,
          });
          const e = new Error('dsh-pamyat: в тексте найден секрет (' + sekret.klass +
                              '), запись отклонена');
          e.code = 'PAMYAT_SEKRET_NA_VHODE';
          throw e;
        }
        // Пометка едет В САМОЙ ЗАПИСИ, а не только в журнале: журнал живёт короче знания,
        // и через месяц «почему это помечено» ответить будет нечем. Поле отдельное от
        // `ochistka`: там что ИЗМЕНИЛИ, здесь в чём ПОДОЗРЕНИЕ — разные вопросы.
        zapis = { ...zapis, podozrenie: { klass: sekret.klass, pozicia: sekret.pozicia } };
        zhurnal?.otmetit({
          agent, klass: zapis.klass, ishod: 'zapisano', priroda: 'podozrenie-na-sekret',
          pochemu: 'правило «' + sekret.klass + '» сработало на позиции ' + sekret.pozicia +
                   '; запись ПРОПУЩЕНА с пометкой, потому что это правило судит по виду ' +
                   'строки и на больших корпусах даёт ложные. Значение не печатается',
          istochnik: zapis.istochnik ?? null,
        });
      }
      const chistka = ochistit(String(zapis.soderzhim ?? ''));
      if (chistka.ochistka) {
        zapis = { ...zapis, soderzhim: chistka.tekst, ochistka: chistka.ochistka };
        if (trevozhno(chistka.ochistka)) {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'zapisano', priroda: 'ochistka-trevozhnaya',
            pochemu: 'вычищено ' + chistka.ochistka.bylo_udaleno + ' невидимых знаков из ' +
                     chistka.ochistka.dlina_do + ' (классы: ' + chistka.ochistka.klassy.join(', ') +
                     ') — это конструкция, а не мусор копипасты',
            istochnik: zapis.istochnik ?? null,
          });
        }
      }
      // 🔴 ДОЛГОВРЕМЕННЫЙ СЛОЙ — «ВЫСТРЕЛИЛ И ЗАБЫЛ», НО НЕ МОЛЧА.
      //
      // Развилка (разбор Э3, 03.09.2026): `zapisat` синхронный, `sohranit` асинхронный. Выбран
      // первый выход — не ждать доставки. Довод: долговременный слой ОБЪЯВЛЕН необязательным,
      // память обязана работать без него, и его исход не должен задерживать ответ ядра.
      //
      // 🔴 ГРАНИЦА, БЕЗ КОТОРОЙ ЭТОТ ВЫБОР ЛОЖЬ: возвращённый id означает ТОЛЬКО оперативный
      // слой. Вызывающий по ответу НЕ узнает, ушло ли знание в долговременную память — это
      // знает журнал, и только он. Поэтому исход доставки пишется туда ВСЕГДА, включая отказ:
      // «выстрелил и забыл» без записи исхода превращается в «не знаем, дошло ли».
      //
      // Зовётся из ОБЕИХ веток записи. Первая редакция правки стояла только в обычной, а
      // запись класса, требующего подтверждения, на узле без отвечающего идёт другой веткой —
      // и знание уехало бы в оперативный слой, не уехав в долговременный. Лечить класс, а не
      // место: две ветки возврата — два места одной болезни.
      const vDolgovremennuyu = (id, zapisSoderzhim, bezPodtverzhdeniya) => {
        // 🔴 «ВНЕ ПЕРЕЧНЯ» ТОЖЕ ОТМЕЧАЕТСЯ. Прежде эта ветка молчала — и «класс не из
        // перечня знаний» было НЕОТЛИЧИМО от «долговременный слой не позвали»: в обоих
        // случаях в журнале не появлялось ничего. Разбирающий, почему знания нет в общей
        // памяти, не мог узнать, решение это или сбой.
        //
        // Исход отдельный (`ostalos-v-operativnom`), а не `zapisano`: запись состоялась,
        // но НЕ везде, и это состояние своё, а не оттенок успеха.
        if (!config.klassyZnaniy?.includes(zapis.klass)) {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'ostalos-v-operativnom',
            priroda: 'klass-vne-klassyZnaniy',
            pochemu: 'класс «' + zapis.klass + '» не входит в klassyZnaniy (' +
                     (config.klassyZnaniy?.join(', ') || 'перечень пуст') +
                     ') — в долговременную память не идёт по решению, а не по сбою',
            istochnik: zapis.istochnik ?? null,
          });
          return id;
        }
        const dolgo = ctx.get?.('pamyatDolgovremennaya');
        if (!dolgo) {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'ne-udalos-proverit',
            priroda: 'dolgovremennyj-sloj-ne-smontirovan',
            pochemu: 'служба pamyatDolgovremennaya не предоставлена — знание осталось только в оперативном слое',
            istochnik: zapis.istochnik ?? null,
          });
          // 🔴 В ОЧЕРЕДЬ ЗДЕСЬ НЕ СТАВИМ, И ЭТО РЕШЕНИЕ, А НЕ ПРОПУСК.
          // Долговременный слой объявлен НЕОБЯЗАТЕЛЬНЫМ: у части установок его нет
          // вовсе. Ставь мы в очередь и там, она росла бы вечно и без потребителя —
          // механизм, который не может опустеть, перестают читать, и он скрывает
          // настоящие задержки. Отличие от ветки ниже: там слой смонтирован и
          // временно недоступен, здесь его нет по устройству узла.
          return id;
        }
        if (!dolgo.dostupna()) {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'ne-otpravleno',
            priroda: 'dolgovremennyj-sloj-nedostupen', pochemu: dolgo.pochemuNedostupna(),
            istochnik: zapis.istochnik ?? null,
          });
          // Слой смонтирован, но связи нет — беда временная, знание ждёт в очереди.
          // Повтор здесь БЕЗОПАСЕН записью: вызова не было вовсе.
          try {
            hranilishche.vOchered({
              zapis_id: id, agent, klass: zapis.klass,
              priroda: 'ne-otpravleno', prichina: dolgo.pochemuNedostupna(),
            });
          } catch (e) {
            zhurnal?.otmetit({
              agent, klass: zapis.klass, ishod: 'ne-udalos-proverit', priroda: 'ochered-ne-prinyala',
              pochemu: 'знание не удалось поставить в очередь доставки: ' + (e?.message ?? String(e)) +
                       '. Оно осталось в оперативном слое и БЕЗ ПОВТОРА.',
              istochnik: zapis.istochnik ?? null,
            });
          }
          return id;
        }
        void dolgo.sohranit({
          soderzhim: zapisSoderzhim,
          tip: zapis.klass,
          // Корень агента. Под-корни по категориям — отдельная работа: граф сущностей на
          // узле пуст, их придётся ЗАВОДИТЬ, а не использовать. Слово владельца на этот
          // случай прямое: не определил категорию — клади в сам корень агента.
          kto: config.koren ?? agent,
          metadannye: {
            source_uri: zapis.istochnik ?? null,
            klass: zapis.klass,
            // Пометка едет вместе со знанием: в долговременной памяти оно переживёт журнал,
            // и «принято без подтверждения» должно читаться там же, где само знание.
            bezPodtverzhdeniya: Boolean(bezPodtverzhdeniya),
          },
        }).then((r) => {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: r.sostoyanie, priroda: 'dolgovremennyj-sloj',
            pochemu: r.pochemu ?? ('id ' + r.id), istochnik: zapis.istochnik ?? null,
          });
          if (r.sostoyanie === 'dostavleno') return;
          // 🔴 ПРИРОДА ЕДЕТ В ОЧЕРЕДЬ КАК ЕСТЬ — она и решает, что делать ночью:
          // повторять записью, спрашивать чтением или ждать руки. Схлопни её тут
          // в «не доставлено» — и ночной проход снова начнёт гадать.
          try {
            hranilishche.vOchered({
              zapis_id: id, agent, klass: zapis.klass,
              priroda: r.sostoyanie, mem_id: r.id ?? null, prichina: r.pochemu ?? null,
            });
          } catch (e) {
            zhurnal?.otmetit({
              agent, klass: zapis.klass, ishod: 'ne-udalos-proverit', priroda: 'ochered-ne-prinyala',
              pochemu: 'знание не удалось поставить в очередь доставки: ' + (e?.message ?? String(e)),
              istochnik: zapis.istochnik ?? null,
            });
          }
        }).catch((e) => {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'moglo-dojti-bez-id', priroda: 'dolgovremennyj-sloj',
            pochemu: 'шов доставки бросил исключение: ' + (e?.message ?? String(e)) +
                     '. Дошло знание или нет — неизвестно, опознавателя нет.',
            istochnik: zapis.istochnik ?? null,
          });
          // 🔴 Самое осторожное из возможных: исключение НЕ доказывает, что вызова
          // не было. Ставим как «могло дойти без опознавателя» — то есть под разбор
          // рукой, а не под автоповтор. Дубль знания хуже видимой очереди: очередь
          // мы считаем, а дубль растворяется в поиске и выглядит знанием.
          try {
            hranilishche.vOchered({
              zapis_id: id, agent, klass: zapis.klass,
              priroda: 'moglo-dojti-bez-id', prichina: e?.message ?? String(e),
            });
          } catch (e2) {
            zhurnal?.otmetit({
              agent, klass: zapis.klass, ishod: 'ne-udalos-proverit', priroda: 'ochered-ne-prinyala',
              pochemu: 'знание не удалось поставить в очередь доставки: ' + (e2?.message ?? String(e2)),
              istochnik: zapis.istochnik ?? null,
            });
          }
        });
        return id;
      };

      const reshenie = reshitPoKlassu(zapis.klass, { sprashivat: config.sprashivat });
      // На узле без отвечающего класс, требующий подтверждения, всё равно
      // записывается — но НЕ молча: отметка идёт в саму запись, а не в журнал
      // решений. Журнал отвечает «что происходило», знание живёт дольше журнала
      // и уезжает в другие слои отдельно от него. Появится отвечающий — старые
      // записи честно скажут, что подтверждены не были.
      if (reshenie.reshenie === 'ask' && config.otvechayushchegoNet) {
        const id = hranilishche.zapisat({ agent, ...zapis, bezPodtverzhdeniya: true });
        zhurnal?.otmetit({
          agent, klass: zapis.klass, ishod: 'zapisano', priroda: 'bez-podtverzhdeniya',
          pochemu: 'на узле нет отвечающего; запись помечена как принятая без подтверждения',
          istochnik: zapis.istochnik ?? null,
        });
        return vDolgovremennuyu(id, zapis.soderzhim, true);
      }
      if (reshenie.reshenie === 'ask') {
        // 🔴 Отсутствие подтверждения — СВОЯ природа, а не 'unavailable'.
        // «Вызывающий не спросил» и «канала нет» — разные беды: первая лечится
        // правкой вызывающего, вторая установкой службы. Схлопывать нельзя.
        const itog = istolkovatPodtverzhdenie(zapis.podtverzhdenie ?? 'ne-predyavleno', true);
        if (!itog.zapisyvat) {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'otkloneno',
            priroda: itog.priroda, pochemu: itog.pochemu,
            istochnik: zapis.istochnik ?? null,
          });
          const e = new Error(
            'dsh-pamyat: запись класса «' + zapis.klass + '» не выполнена. ' + itog.pochemu
          );
          // Код различает «не спросили» и «спросили, но не разрешили»: по коду
          // вызывающий понимает, чинить ему свой вызов или установку.
          e.code = itog.priroda === 'ne-predyavleno'
            ? 'PAMYAT_TREBUET_PODTVERZHDENIYA'
            : 'PAMYAT_ZAPIS_NE_RAZRESHENA';
          e.priroda = itog.priroda;
          throw e;
        }
      }
      const id = hranilishche.zapisat({ agent, ...zapis });
      zhurnal?.otmetit({
        agent, klass: zapis.klass, ishod: 'zapisano',
        pochemu: 'записано в оперативный слой', istochnik: zapis.istochnik ?? null,
      });
      return vDolgovremennuyu(id, zapis.soderzhim, false);
    },
    /** Отметить отказ в журнале — чтобы «не записали» имело причину. */
    otmetitOtkaz({ klass, priroda, pochemu, istochnik = null }) {
      if (!zhurnal) otkaz();
      return zhurnal.otmetit({ agent, klass, ishod: 'otkloneno', priroda, pochemu, istochnik });
    },
    /** Прочитать записи. */
    prochitat(vopros = {}) {
      if (!hranilishche) otkaz();
      return hranilishche.prochitat({ agent, skolko: config.chtenieSkolko ?? 20, ...vopros });
    },
    /** Сводка журнала: отвечает на вопрос «почему память пуста». */
    svodka() {
      if (!zhurnal) otkaz();
      return zhurnal.svodka(agent);
    },

    /** Что ждёт доставки в долговременный слой. Пустой массив — очередь пуста. */
    ocheredDostavki(vopros = {}) {
      if (!hranilishche) otkaz();
      return hranilishche.ochered({ agent, ...vopros });
    },

    /**
     * Повторить доставку отложенного. Зовётся ночным проходом либо рукой.
     * Возвращает отчёт числами; НИЧЕГО не печатает сам — печать за вызывающим.
     *
     * 🔴 ТРИ ВЕТКИ, ПО ОДНОЙ НА ПРИРОДУ, И ОНИ НЕ ВЗАИМОЗАМЕНИМЫ:
     *   ne-otpravleno / ne-najdeno  повтор ЗАПИСЬЮ: дубля не будет, это проверено
     *   moglo-dojti-id-est          сперва ПРОВЕРКА чтением по опознавателю
     *   moglo-dojti-bez-id          НЕ ТРОГАЕМ вовсе — см. ниже
     *
     * 🔴 ПОЧЕМУ `moglo-dojti-bez-id` НЕ БЕРЁТСЯ АВТОМАТОМ (это не недоделка).
     * Отправка была, опознавателя нет, поиска по источнику у хранилища нет —
     * значит вопрос «легло ли» машинно НЕРАЗРЕШИМ. Любой автоповтор здесь либо
     * теряет знание, либо заводит второй экземпляр. Дубль хуже: недоставку видно
     * по очереди и по числу в отчёте, а дубль растворяется в поиске и выглядит
     * знанием. Поэтому такие записи ждут человека и СЧИТАЮТСЯ ОТДЕЛЬНО.
     *
     * 🔴 ПОПЫТКИ НЕ ТРАТИМ, ЕСЛИ НЕ СПРАШИВАЛИ. Недоступность слоя и неудача
     * чтения не увеличивают счётчик: иначе предел выгорел бы за одну ночь чужого
     * простоя и живое знание было бы объявлено исчерпанным.
     */
    async dostavitOtlozhennoe({ predelPopytok = 5 } = {}) {
      if (!hranilishche) otkaz();
      const otchet = {
        vsego: 0, dostavleno: 0, podtverzhdeno: 0, ostalos: 0,
        zhdutRuki: 0, ischerpannyh: 0, novyhIscherpanij: 0,
        sloyDostupen: false, pochemuNet: null,
      };
      const ochered = hranilishche.ochered({ agent });
      otchet.vsego = ochered.length;
      otchet.zhdutRuki = ochered.filter((z) => z.priroda === 'moglo-dojti-bez-id').length;
      otchet.ischerpannyh = ochered.filter((z) => Number(z.ischerpano) === 1).length;

      const dolgo = ctx.get?.('pamyatDolgovremennaya');
      if (!dolgo || !dolgo.dostupna()) {
        otchet.pochemuNet = dolgo ? dolgo.pochemuNedostupna() : 'служба pamyatDolgovremennaya не смонтирована';
        otchet.ostalos = otchet.vsego;
        return otchet;
      }
      otchet.sloyDostupen = true;

      for (const stroka of ochered) {
        if (stroka.priroda === 'moglo-dojti-bez-id') continue;
        if (Number(stroka.ischerpano) === 1) continue;
        const zapis = hranilishche.poId(stroka.zapis_id);
        if (!zapis) {
          // Запись исчезла из оперативного слоя — повторять нечего и незачем.
          hranilishche.snyatSOcheredi(stroka.zapis_id);
          zhurnal?.otmetit({
            agent, klass: stroka.klass, ishod: 'snyato-s-ocheredi', priroda: 'zapisi-net-v-operativnom',
            pochemu: 'запись ' + stroka.zapis_id + ' исчезла из оперативного слоя — доставлять нечего',
          });
          continue;
        }

        if (stroka.priroda === 'moglo-dojti-id-est') {
          // 🔴 СОСЕД МОЖЕТ БЫТЬ СТАРШЕ НАС. `proverit` появился в долговременном слое
          // одновременно с этой очередью, но версии пакетов независимы: на узле легко
          // окажется ядро новое, а слой прежний. Без этой ветки вызов бросил бы
          // TypeError — то есть механизм, заведённый против тихой потери знания, сам
          // упал бы вместо того, чтобы назвать причину. Ровно тот класс, что стоил нам
          // сегодня ветки отказа по деньгам: путь отказа непроверен, пока условия нет.
          if (typeof dolgo.proverit !== 'function') {
            otchet.ostalos += 1;
            zhurnal?.otmetit({
              agent, klass: stroka.klass, ishod: 'ne-udalos-proverit',
              priroda: 'sloj-ne-umeet-proveryat',
              pochemu: 'долговременный слой старше ядра: в нём нет метода proverit. ' +
                       'Повторять записью нельзя — создали бы второй экземпляр знания. ' +
                       'Лечится обновлением пакета dsh-pamyat-omega.',
              istochnik: zapis.istochnik ?? null,
            });
            continue;
          }
          const p = await dolgo.proverit({ id: stroka.mem_id, obrazec: zapis.soderzhim });
          if (p.sostoyanie === 'est') {
            hranilishche.snyatSOcheredi(stroka.zapis_id);
            otchet.podtverzhdeno += 1;
            zhurnal?.otmetit({
              agent, klass: stroka.klass, ishod: 'dostavleno', priroda: 'podtverzhdeno-chteniem',
              pochemu: 'запись ' + stroka.mem_id + ' нашлась при повторном чтении: ' + p.pochemu,
              istochnik: zapis.istochnik ?? null,
            });
            continue;
          }
          if (p.sostoyanie === 'ne-proveryali') {
            // 🔴 Попытку НЕ засчитываем: мы не получили отказ, мы не смогли спросить.
            otchet.ostalos += 1;
            continue;
          }
          // p.sostoyanie === 'net' — чтение подтвердило отсутствие, писать безопасно.
        }

        const r = await dolgo.sohranit({
          soderzhim: zapis.soderzhim,
          tip: stroka.klass,
          kto: config.koren ?? agent,
          metadannye: {
            source_uri: zapis.istochnik ?? null,
            klass: stroka.klass,
            bezPodtverzhdeniya: Boolean(zapis.bez_podtverzhdeniya),
            povtorDostavki: true,
          },
        });
        zhurnal?.otmetit({
          agent, klass: stroka.klass, ishod: r.sostoyanie, priroda: 'povtor-dostavki',
          pochemu: r.pochemu ?? ('id ' + r.id), istochnik: zapis.istochnik ?? null,
        });
        if (r.sostoyanie === 'dostavleno') {
          hranilishche.snyatSOcheredi(stroka.zapis_id);
          otchet.dostavleno += 1;
          continue;
        }
        const itog = hranilishche.otmetitPopytku({
          zapis_id: stroka.zapis_id, prichina: r.pochemu ?? null, predel: predelPopytok,
        });
        hranilishche.vOchered({
          zapis_id: stroka.zapis_id, agent, klass: stroka.klass,
          priroda: r.sostoyanie, mem_id: r.id ?? stroka.mem_id ?? null, prichina: r.pochemu ?? null,
        });
        otchet.ostalos += 1;
        if (itog.ischerpalos) {
          otchet.novyhIscherpanij += 1;
          otchet.ischerpannyh += 1;
          // 🔴 Крик ОДИН раз — при переходе флага, а не на каждом проходе. Запись
          // при этом НЕ удаляется: молча потерять знание хуже, чем держать в очереди.
          krik('доставка знания исчерпала попытки (' + predelPopytok + '): запись ' +
               stroka.zapis_id + ', класс «' + stroka.klass + '». Она ОСТАЁТСЯ в очереди, ' +
               'но повторяться больше не будет. Причина последней попытки: ' + (r.pochemu ?? '—'));
        }
      }
      return otchet;
    },
  });

  ctx.on?.('dispose', () => { try { hranilishche?.zakryt(); } catch { /* закрытие не должно ронять выгрузку */ } });
}
