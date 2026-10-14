/**
 * RU: dsh-pamyat-core предоставляет службу pamyat: локальное хранилище SQLite, журнал решений, политику записи и инструменты отношений и оценки. Остальные пакеты добавляют дистилляцию, выдачу в контекст, поиск и уход. Ядро не выполняет дистилляцию и инъекцию в контекст; долговременный провайдер необязателен. Требуется Node >= 22 с экспериментальным node:sqlite; при недоступном хранилище обращения явно отказывают.
 * EN: dsh-pamyat-core provides the pamyat service: local SQLite storage, a decision journal, write policy, and relationship and rating tools. Other packages add distillation, context delivery, search, and maintenance. The core does not perform distillation or context injection; a long-term provider is optional. Node >= 22 with experimental node:sqlite is required; unavailable storage makes calls fail explicitly.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { otkrytHranilishche } from './hranilishche.js';
import { zavestiZhurnal } from './zhurnal.js';
import { reshitPoKlassu, istolkovatPodtverzhdenie } from './politika.js';
import { filtr_ispraven, najti_sekret, ochistit, trevozhno, proverit_sluzhebnoe, normalizovat, zapiraet, zamaskirovat, zamaskirovatVhod } from './filtr-vhoda.js';
import { postavitPrivratnika, itogPrivratnika } from './privratnik.js';
import z from '@deepseek-ai/schemastery';
import { sobytiyaSessii, nasledovano, eSvodkaSzhatiya } from './sobytiya-sessii.js'; // RU: Чтение журнала сессии поддерживает форматы DSH 0.1.1 и 0.2.0.
// EN: Session journal reading supports the DSH 0.1.1 and 0.2.0 formats.

export const name = 'dsh-pamyat-core';

/**
 * RU: Настройки пакета. Путь к базе задаёт установщик: модуль не предполагает устройство каталогов узла.
 * EN: Package settings. The installer supplies the database path; the module makes no assumptions about host directories.
 */
/**
 * RU: Умолчание klassyZnaniy вычисляется в коде, чтобы отсутствие настройки осталось отличимо от явно заданного перечня. Подстановка схемой до apply скрыла бы источник значений в строке загрузки.
 * EN: The code resolves the klassyZnaniy default so a missing setting remains distinguishable from an explicit list. Schema substitution before apply would hide the source of the values in the load message.
 */
export const KLASSY_ZNANIY_UMOLCHANIE = Object.freeze([
  'reshenie', 'urok', 'vyvod', 'ogranichenie', 'oshibka', 'poryadok', 'nablyudenie', 'fakt',
]);

export const Config = z.object({
  /**
   * RU: Путь к базе намеренно без умолчания: отсутствие ключа должно оставаться видимым, а не выбирать чужой каталог.
   * EN: The database path deliberately has no default: a missing key must stay visible rather than select an assumed directory.
   */
  putBazy: z.string(),
  /**
   * RU: Имя агента разделяет память нескольких агентов на одном узле.
   * EN: The agent name separates memory for agents sharing a host.
   */
  agent: z.string(),
  /**
   * RU: Классы с подтверждением: пустой или отсутствующий список включает умолчание политики; пустой список не отключает спрос (politika.js).
   * EN: Classes requiring approval: an empty or absent list selects the policy default; an empty list does not disable approval (politika.js).
   */
  sprashivat: z.array(z.string()).default([]),
  // RU: В долговременный слой идут восемь классов знаний, включая ogranichenie, oshibka и poryadok. svodka-kompakcii хранится только оперативно: сводка содержит временные и опровергнутые мысли, которые поиск не должен выдавать как знание. Перечень согласован с производителем через стенд KLASSY ⊆ klassyZnaniy без зависимости ради константы. В используемой схеме z.array(z.string()) без умолчания даёт []; .default(null) сохраняет undefined для отсутствующего ключа и проверку типов, различая отсутствие и явно пустой перечень.
  // EN: The long-term layer receives eight knowledge classes, including ogranichenie, oshibka, and poryadok. svodka-kompakcii stays in working storage: summaries contain temporary and disproved ideas that search must not present as knowledge. A test checks the producer contract KLASSY ⊆ klassyZnaniy without adding a dependency for a constant. In this schema, z.array(z.string()) without a default yields []; .default(null) preserves undefined for a missing key and type checks, distinguishing absence from an explicitly empty list.
  klassyZnaniy: z.array(z.string()).default(null),
  /**
   * RU: Предел числа записей в одном чтении памяти.
   * EN: Maximum records returned by one memory read.
   */
  chtenieSkolko: z.number().default(20),
  /**
   * RU: Путь к журналу обёртки нужен только свидетелю загрузки. .default(null) означает «не проверено», если след не настроен: отсутствие обёртки на другом узле само по себе не доказывает обход.
   * EN: The wrapper journal path serves only the load witness. .default(null) means “unchecked” when no trace is configured: a host without a wrapper does not by itself prove a bypass.
   */
  sledPodyomov: z.string().default(null),
  // RU: Устаревшие настройки длины принимаются ради совместимости профилей и только диагностируются хранилищем; ограничения длины и их умолчания не действуют.
  // EN: Legacy length settings remain for profile compatibility and storage diagnostics only; length restrictions and their defaults no longer apply.
  predelZnakov: z.any(),
  predelyZnakovPoKlassam: z.any(),
  // RU: zhurnalSkolko снят из Config (A-N-1870): не читался ни в одной редакции — журнал берёт skolko = 20 сам (zhurnal.js). Ключ в профиле игнорируется.
  // EN: zhurnalSkolko removed from Config (A-N-1870): no revision ever read it — the journal uses its own skolko = 20 (zhurnal.js). A profile key is ignored.
  /**
   * RU: Маска образцов секретов на пути записи (решение координатора 05.09, развилка 4а). false выключает маску: запись с образцом секрета тогда отвергает фильтр, а не сохраняет её открытой.
   * EN: Secret-sample masking on the write path. false disables the mask: the filter then refuses a record containing a secret sample instead of storing it in the clear.
   */
  maskirovatObrazcy: z.boolean().default(true),
  /**
   * RU: Флаг описывает узел без службы подтверждения. Политика остаётся: запись, для которой спрос невозможен, получает собственную отметку вместо видимости подтверждения.
   * EN: This flag describes a host with no approval service. The policy remains in force: a record that cannot be approved receives its own annotation rather than appearing approved.
   */
  otvechayushchegoNet: z.boolean().default(false),
  /**
   * RU: Привратник включается явно: разрешать вместо человека вправе только настроивший такой режим. Он снимает отказ «нет отвечающего», но не вводит ветку запрета и не меняет политику сессии. При never платформа возвращает rejected до водопада; привратник не вызывается, поэтому его счётчик пуст.
   * EN: The gatekeeper requires explicit opt-in: only the installer may choose approval without a person. It removes the “no responder” failure but adds no rejection branch and does not override session policy. With never, the platform returns rejected before the waterfall; the gatekeeper is not called, so its counter stays empty.
   */
  otvechatNaSprosRazresheniya: z.boolean().default(false),
  /**
   * RU: Префиксы id исключают сессии из чтения и записи памяти: нет restore/omega, сводки, дистилляции, pamyat_ocenit и pamyat_otnoshenie. Пустой список ничего не исключает. Единственный список здесь; потребители вызывают pamyat.sessiyaIsklyuchena.
   * EN: Session id prefixes exclude sessions from memory reads and writes: restore/omega, summaries, distillation, pamyat_ocenit, and pamyat_otnoshenie are disabled. An empty list excludes nothing. This is the sole list; consumers call pamyat.sessiyaIsklyuchena.
   */
  isklyuchitSessii: z.array(z.string()).default([]),
  // RU: Настройки долговременного провайдера принадлежат исполняющему их пакету. Объявлять их здесь означало бы принимать ключи, которые ядро не применяет.
  // EN: Long-term provider settings belong to the package that implements them. Declaring them here would accept keys the core never applies.
});

/**
 * RU: Схема и имена таблиц, исходы протокола подтверждения rejected/cancelled/unavailable и пред-исходы, а также отказ при отсутствии источника не настраиваются. Изменяемые имена могли бы скрыть старую базу; изменяемые литералы протокола разошлись бы с платформой; отключаемый fail-closed допускал бы тихую потерю.
 * EN: Table names and schema, approval protocol outcomes rejected/cancelled/unavailable and pre-outcomes, and refusal without a source are not configurable. Mutable names could hide an existing database; mutable protocol literals could drift from the platform; optional fail-closed behavior could allow silent loss.
 */

/**
 * RU: Служба объявляется даже при отказе открытия базы, чтобы ошибка памяти не останавливала платформу. Причина печатается один раз; каждый вызов недоступного хранилища явно отказывает вместо тихой работы без записи.
 * EN: The service is registered even when opening the database fails, so a memory failure does not stop the platform. The cause is printed once; every call to unavailable storage fails explicitly rather than silently running without writes.
 */
/**
 * RU: Отказы выводятся через console.error. Наличие ctx.logger недостаточно: в cordis 4.0.1 экспортёр буферизует до 1000 сообщений, а без экспортёра DSH они не доходят до потока. stderr даёт выход за пределы этого буфера; доставку в журнал проверяет установка службы.
 * EN: Failures use console.error. The presence of ctx.logger is insufficient: the cordis 4.0.1 exporter buffers up to 1000 messages, and without a DSH exporter they never reach a stream. stderr bypasses that buffer; the service installation must verify delivery to its journal.
 */
// RU: Версия читается из собственного манифеста, чтобы строка загрузки называла установленную редакцию. Ошибка чтения означает «версия неизвестна», без устаревшей константы.
// EN: Read the version from this package manifest so the load message identifies the installed revision. A read error means “unknown version,” with no stale fallback constant.
const versiya = (() => {
  try { return createRequire(import.meta.url)('../package.json').version ?? 'версия неизвестна'; }
  catch { return 'версия неизвестна'; }
})();

/**
 * RU: Свидетель делает видимым объявление загрузки, но не запрещает её: сообщение появляется после загрузки. Возраст процесса отделяет старт службы от горячей перезагрузки, для которой след обёртки неприменим. Порог 30 с печатается в результате; горячая правка в первые 30 с будет классифицирована как старт службы.
 * EN: The witness makes a declared load visible but cannot block it: the message appears after loading. Process age separates service startup from a hot reload, where a wrapper trace does not apply. The 30 s threshold is printed in the result; a hot change within the first 30 s is classified as service startup.
 */
export const POROG_SVEZHESTI_SEK = 30;
/**
 * RU: Окно свежести связывает след обёртки с текущим стартом процесса.
 * EN: The freshness window associates the wrapper trace with the current process start.
 */
export const OKNO_OBYAVLENIYA_SEK = 120;

/**
 * RU: Чистая функция определяет род загрузки и её объявленность. Возраст поступает аргументом для стенда; apply передаёт process.uptime().
 * EN: A pure function classifies load type and declaration status. Age is an argument for tests; apply supplies process.uptime().
 */
export function svidetelZagruzki({ vozrastSek, sled, sluzhba, chitat }) {
  const v = Math.round(Number(vozrastSek));
  if (!Number.isFinite(v)) {
    return 'загрузка: РОД НЕ УСТАНОВЛЕН — возраст процесса не измерен (это слепота, а не горячая)';
  }
  if (v > POROG_SVEZHESTI_SEK) {
    return 'загрузка: ГОРЯЧАЯ — перечитана настройка, процесс тот же (возраст ' + v +
      ' с при пороге свежести ' + POROG_SVEZHESTI_SEK + ' с). Старта службы не было, ' +
      'код модулей заново НЕ читается, вопрос об объявлении не ставится';
  }
  const shapka = 'подъём СЛУЖБЫ (возраст процесса ' + v + ' с при пороге ' +
    POROG_SVEZHESTI_SEK + ' с)';
  if (!sled) {
    return shapka + '; объявление НЕ ПРОВЕРЕНО: путь следа подъёмов не задан (sledPodyomov) ' +
      '— это слепота с причиной, а не обход';
  }
  if (!sluzhba) {
    // RU: Без имени службы сопоставление невозможно: пустая подстрока совпала бы с любой строкой и дала ложное объявление.
    // EN: Matching is impossible without a service name: an empty substring would match any row and falsely report a declaration.
    return shapka + '; объявление НЕ ПРОВЕРЕНО: имя службы не задано (agent) — слепота с причиной, а не обход';
  }
  let tekst;
  try { tekst = chitat(sled); }
  catch (e) {
    return shapka + '; объявление НЕ ПРОВЕРЕНО: след ' + sled + ' не читается (' +
      String(e?.message ?? e).slice(0, 60) + ') — слепота с причиной, а не обход';
  }
  const teper = Date.now();
  const nachalo = teper - v * 1000;
  let objavlen = false;
  for (const stroka of String(tekst).split('\n')) {
    // RU: Сравниваются поля: только ДО/ПОСЛЕ во втором поле и точное имя службы в третьем. ОТКАЗ и похожие имена не доказывают объявление. Границы: новый формат с теми же полями не распознаётся отдельно; ДО без ПОСЛЕ всё ещё считается объявлением начала.
    // EN: Compare fields: only ДО/ПОСЛЕ in the second field and an exact service name in the third qualify. ОТКАЗ and similar names do not prove a declaration. Limits: a new format reusing these fields is not distinguished; ДО without ПОСЛЕ still declares an attempted start.
    const polya = stroka.split('|').map((x) => x.trim());
    if (polya.length < 3 || (polya[1] !== 'ДО' && polya[1] !== 'ПОСЛЕ') || polya[2] !== sluzhba) continue;
    const m = stroka.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC/);
    if (!m) continue;
    const t = Date.parse(m[1] + 'T' + m[2] + 'Z');
    if (!Number.isFinite(t)) continue;
    if (Math.abs(t - nachalo) <= OKNO_OBYAVLENIYA_SEK * 1000) { objavlen = true; break; }
  }
  return objavlen
    ? shapka + '; подъём ОБЪЯВЛЕН — обёртка оставила след в пределах ' +
      OKNO_OBYAVLENIYA_SEK + ' с от старта'
    : shapka + '; ⚠️ МИМО ВОРОТ — обёртка следа не оставила (окно ' + OKNO_OBYAVLENIYA_SEK +
      ' с от старта). Это разрешено словом владельца 13.09 и потому не отказ, а ГРОМКОСТЬ';
}

/**
 * RU: Описание pamyat_otnoshenie вынесено из apply для проверки того же инструмента. kto строится из config.agent и exec.agent.id (SessionId); у runtime Agent нет поля name, а модельный kto игнорируется. Вызов без exec.agent получает PAMYAT_OTNOSHENIE_BEZ_KTO.
 * EN: The pamyat_otnoshenie definition is outside apply so tests inspect the same tool. kto combines config.agent and exec.agent.id (SessionId); the runtime Agent has no name field, and model-supplied kto is ignored. Calls without exec.agent fail with PAMYAT_OTNOSHENIE_BEZ_KTO.
 */
export function opisanieInstrumentaOtnosheniya(sluzhba, agent) {
  return {
    name: 'pamyat_otnoshenie',
    description: 'Отметить в памяти, что НОВАЯ запись id ОТМЕНЯЕТ (otmenyaet) или УТОЧНЯЕТ (utochnyaet) '
      + 'СТАРУЮ запись k. Номера записей — #N в приветствии памяти. otmenyaet допустим к решениям, '
      + 'порядкам, ограничениям, выводам, урокам; к фактам, наблюдениям, ошибкам — только utochnyaet. '
      + 'Отказ приходит текстом с кодом PAMYAT_*.',
    parameters: {
      id: { type: 'number', required: true, description: 'id НОВОЙ записи (той, что отменяет или уточняет)' },
      vid: { type: 'string', required: true, description: 'otmenyaet | utochnyaet' },
      k: { type: 'number', required: true, description: 'id СТАРОЙ записи (к которой относится)' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        ishod: { type: 'string', required: true }, id: { type: 'number', required: true },
        vid: { type: 'string', required: true }, k: { type: 'number', required: true },
        klass: { type: 'string', required: true } } },
      render: (_args, v) => [{ type: 'text', text: (v.ishod === 'uzhe-bylo' ? 'уже было: ' : 'записано: ')
        + 'запись #' + v.id + ' ' + v.vid + ' запись #' + v.k }],
    },
    execute(args, exec) {
      const sessiya = exec?.agent?.id;
      if (!exec?.agent || sessiya === undefined || sessiya === null || String(sessiya).trim() === ''
        || typeof agent !== 'string' || !agent.trim()) {
        return Promise.reject(new Error('ОТКАЗ PAMYAT_OTNOSHENIE_BEZ_KTO: инструмент позван вне агента (нет exec.agent или имени агента ядра) — некому утверждать отношение'));
      }
      const kto = agent.trim() + ' (сессия ' + String(sessiya) + ')';
      const isk = sluzhba.sessiyaIsklyuchena?.(String(sessiya));   // RU: Исключённая сессия не может ставить отношения записей.
      // EN: An excluded session cannot set record relationships.
      if (isk) return Promise.reject(new Error('ОТКАЗ PAMYAT_SESSIYA_ISKLYUCHENA: сессия вне памяти (префикс «' + isk + '», настройка isklyuchitSessii)'));
      try {
        const r = sluzhba.ustanovitOtnoshenie({ id: args.id, vid: args.vid, k: args.k, kto: String(kto) });
        return Promise.resolve({ ishod: r.ishod, id: r.id, vid: r.vid, k: r.k, klass: r.klass });
      } catch (e) {
        return Promise.reject(new Error('ОТКАЗ ' + (e?.code ?? 'БЕЗ_КОДА') + ': ' + String(e?.message ?? e)));
      }
    },
  };
}

/**
 * RU: pamyat_ocenit оценивает применение записи: pomoglo/podvelo/ustarelo идут в существующий otsenit как helped/harmful/stale. Код задаёт kem = model:<agent>/<session>#v<выдача>, поэтому модель не выдаёт себя за человека. Отказы бросают ошибку с PAMYAT_*. Слой restore считает use по двум pomoglo от разных выдач: сессия и сутки не доказывают независимое повторное применение.
 * EN: pamyat_ocenit rates a record used in practice: pomoglo/podvelo/ustarelo map to helped/harmful/stale in the existing otsenit method. Code sets kem = model:<agent>/<session>#v<delivery>, so the model cannot pose as a person. Failures throw an error containing PAMYAT_*. restore derives use from two pomoglo ratings on different deliveries: session ids and calendar dates do not prove independent reuse.
 */
export const OCENKA_MODELI_ISHOD = Object.freeze({ pomoglo: 'helped', podvelo: 'harmful', ustarelo: 'stale' });
export function opisanieInstrumentaOcenki(sluzhba, agent) {
  return {
    name: 'pamyat_ocenit',
    description: 'Оценить запись памяти, которую ты ПРИМЕНИЛ в работе: pomoglo (сработало), podvelo (ошибочно/вредно), '
      + 'ustarelo (было верно, теперь нет). Оценивать можно только запись #N из ПРИВЕТСТВИЯ памяти, выданного тебе в этом '
      + 'процессе (после подъёма или сжатия); записи выдачи по смыслу (mem-…) этим инструментом не оцениваются. Одна оценка '
      + 'на одну выдачу записи; следующая — после того, как запись выдадут заново. pochemu — чем именно (20–400 знаков). '
      + 'Отказ приходит текстом с кодом PAMYAT_*.',
    parameters: {
      id: { type: 'number', required: true, description: 'номер записи (#N)' },
      ishod: { type: 'string', required: true, description: 'pomoglo | podvelo | ustarelo' },
      pochemu: { type: 'string', required: true, description: 'чем применение подтвердило или опровергло запись (20–400 знаков)' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'number', required: true }, ishod: { type: 'string', required: true },
        veraDo: { type: 'number' }, vera: { type: 'number', required: true }, ocenok: { type: 'number', required: true } } },
      render: (_args, v) => [{ type: 'text', text: 'оценка легла: #' + v.id + ' ' + v.ishod + ' — вера '
        + (v.veraDo === null || v.veraDo === undefined ? 'не измерялась' : v.veraDo) + ' → ' + v.vera + ' (оценок ' + v.ocenok + ')' }],
    },
    execute(args, exec) {
      const sessiya = exec?.agent?.id;
      if (!exec?.agent || sessiya === undefined || sessiya === null || String(sessiya).trim() === ''
        || typeof agent !== 'string' || !agent.trim()) {
        return Promise.reject(new Error('ОТКАЗ PAMYAT_OCENKA_BEZ_KTO: инструмент позван вне агента (нет exec.agent или имени агента ядра) — некому оценивать'));
      }
      const isk = sluzhba.sessiyaIsklyuchena?.(String(sessiya));   // RU: Исключённая сессия не может оценивать записи.
      // EN: An excluded session cannot rate records.
      if (isk) return Promise.reject(new Error('ОТКАЗ PAMYAT_SESSIYA_ISKLYUCHENA: сессия вне памяти (префикс «' + isk + '», настройка isklyuchitSessii)'));
      try {
        const r = sluzhba.ocenitVydannoe({ id: args.id, ishod: args.ishod, pochemu: args.pochemu, sessiya: String(sessiya) });
        return Promise.resolve({ id: r.id, ishod: args.ishod, veraDo: r.veraDo, vera: r.vera, ocenok: r.ocenok });
      } catch (e) {
        return Promise.reject(new Error('ОТКАЗ ' + (e?.code ?? 'БЕЗ_КОДА') + ': ' + String(e?.message ?? e)));
      }
    },
  };
}

function krik(soobshchenie) {
  console.error('[dsh-pamyat-core ' + versiya + '] ' + soobshchenie);
}

/**
 * RU: Возвращает sid → совпавший префикс или null. При непустом списке решение для каждой сессии печатается один раз, включая несовпадение, чтобы смена формата id была видна. Пустой префикс отбрасывается с сообщением: он исключил бы все сессии.
 * EN: Return sid → matching prefix or null. With a nonempty list, print each session decision once, including no match, so changes to the id format stay visible. Reject an empty prefix with a message because it would exclude every session.
 */
export function sozdatIsklyuchenieSessij(prefiksy, skazat = krik) {
  const godnye = [];
  for (const p of Array.isArray(prefiksy) ? prefiksy : []) {
    if (typeof p === 'string' && p.trim()) godnye.push(p);
    else skazat('🔴 isklyuchitSessii: пустой префикс отброшен — он исключил бы ВСЕ сессии');
  }
  const uvideno = new Map();
  return (sid) => {
    if (!godnye.length) return null;
    const s = typeof sid === 'string' ? sid : String(sid ?? '');
    if (uvideno.has(s)) return uvideno.get(s);
    const p = godnye.find((x) => s.startsWith(x)) ?? null;
    uvideno.set(s, p);
    skazat(p ? 'сессия ' + s + ': исключена из памяти (префикс «' + p + '») — без подачи и записи'
      : 'сессия ' + s + ': исключение НЕ применено (префиксы: ' + godnye.join(', ') + ')');
    return p;
  };
}

// RU: Платформа может вызвать apply несколько раз за старт. Процессные ресурсы требуют модульной защёлки и уборки через ctx.effect; события dispose в cordis 4.0.1 нет.
// EN: The platform may call apply several times per startup. Process resources require a module-level latch and cleanup through ctx.effect; cordis 4.0.1 has no dispose event.
export function apply(ctx, config = {}) {
  const agent = config.agent;
  const put = config.putBazy;
  // RU: Перечень вычисляется один раз для всех потребителей пакета. Прямое чтение config.klassyZnaniy обошло бы умолчание и при undefined молча изменило отбор.
  // EN: Resolve the list once for all package consumers. Reading config.klassyZnaniy directly would bypass the default and silently alter selection when it is undefined.
  const klassyZnaniy = config.klassyZnaniy ?? KLASSY_ZNANIY_UMOLCHANIE;
  const klassyIstochnik = config.klassyZnaniy ? 'настройка' : 'умолчание модуля';
  const uchyotPrivratnika = postavitPrivratnika(ctx, config.otvechatNaSprosRazresheniya === true, krik);
  let hranilishche = null;
  let zhurnal = null;
  let prichinaOtkaza = null;

  // RU: ctx.effect регистрирует уборку в disposables волокна: dispose не существует, а возврат функции из apply платформа отбрасывает при вызове через new. Уборка ставится до открытия базы, чтобы последующее исключение не оставило соединение до GC. Замыкание читает текущее hranilishche и закрывает только то, что открылось.
  // EN: ctx.effect registers cleanup in the fiber disposables: dispose does not exist, and the platform discards a cleanup function returned from apply when calling it through new. Register cleanup before opening the database so later exceptions do not leave a connection until GC. The closure reads the current hranilishche and closes only what opened.
  try {
    ctx.effect?.(() => () => {
      // RU: Итог привратника печатается и при нуле: число спросов и причины отличают отсутствие спроса от отсутствия счётчика.
      // EN: Print the gatekeeper summary even at zero: request counts and reasons distinguish no requests from a missing counter.
      try { krik(itogPrivratnika(uchyotPrivratnika)); } catch { /**
       * RU: Ошибка печати итога не должна прерывать выгрузку.
       * EN: A summary output error must not interrupt unloading.
       */ }
      try { hranilishche?.zakryt(); } catch { /**
       * RU: Ошибка закрытия базы не должна прерывать выгрузку.
       * EN: A database close error must not interrupt unloading.
       */ }
    });
  } catch { /**
   * RU: Тестовый ctx может не иметь effect; в этом случае монтаж продолжается без этой уборки.
   * EN: A test ctx may lack effect; registration continues without this cleanup in that case.
   */ }

  try {
    hranilishche = otkrytHranilishche(put, {
      predelZnakov: config.predelZnakov,
      predelyZnakovPoKlassam: config.predelyZnakovPoKlassam,
    });
    zhurnal = zavestiZhurnal(hranilishche.baza ?? null);
    zhurnal.ustanovitOtsechku(agent);
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

  // RU: Строка загрузки печатается безусловно: исправный смонтированный модуль должен отличаться от отсутствующего. Она называет редакцию и долговременный слой до первой записи.
  // EN: Print the load message unconditionally: a healthy registered module must be distinguishable from an absent one. It identifies the revision and long-term layer before the first write.
  krik('подъём: база ' + (config.putBazy ?? '—') +
       ', классы знаний в долговременную память: ' +
       (klassyZnaniy.length ? klassyZnaniy.join(', ') : 'ни одного') +
       ' (' + klassyIstochnik + ')' +
       (prichinaOtkaza ? ' — НО ХРАНИЛИЩЕ НЕ ОТКРЫТО, см. строку ниже' : ''));

  // RU: Класс вне умолчаний объявляется при каждом apply, но не отвергается: настройка вправе расширять перечень. Сообщение делает опечатку видимой и не доказывает, что класс неверен.
  // EN: Report a class outside the defaults on every apply without rejecting it: configuration may extend the list. The message exposes possible typos but does not prove the class is invalid.
  for (const k of klassyZnaniy) {
    if (!KLASSY_ZNANIY_UMOLCHANIE.includes(k)) {
      krik('класс вне умолчаний: ' + k + ' (известные: ' + KLASSY_ZNANIY_UMOLCHANIE.join(', ') + ')');
    }
  }

  // RU: Непустой список исключений сессий объявляется при загрузке.
  // EN: Announce a nonempty session exclusion list at load time.
  const sessiyaIsklyuchena = sozdatIsklyuchenieSessij(config.isklyuchitSessii ?? [], krik);
  if ((config.isklyuchitSessii ?? []).length) {
    krik('сессии вне памяти (isklyuchitSessii): префиксы ' + config.isklyuchitSessii.map((p) => '«' + p + '»').join(', '));
  }

  // RU: Свидетель печатается всегда: отсутствие строки иначе выглядело бы как отсутствие механизма.
  // EN: Always print the witness result; otherwise a missing message would look like a missing mechanism.
  krik(svidetelZagruzki({
    vozrastSek: process.uptime(),
    sled: config.sledPodyomov ?? null,
    sluzhba: (config.agent ? config.agent + '.service' : ''),
    chitat: (p) => readFileSync(p, 'utf8'),
  }));

  if (prichinaOtkaza) {
    // RU: Ошибка открытия базы объявляется один раз при старте: недоступная память не должна выглядеть пустой.
    // EN: Report database open failure once at startup: unavailable memory must not appear empty.
    krik(prichinaOtkaza.message);
  }

  // RU: Режим узла без отвечающего объявляется при загрузке, чтобы причина записей без подтверждения оставалась видимой.
  // EN: Announce the no-responder mode at load time so the reason for unapproved records stays visible.
  if (config.otvechayushchegoNet) {
    krik('на этом узле спрашивать некого: классы, требующие подтверждения (' +
      (config.sprashivat?.length ? config.sprashivat.join(', ') : 'по умолчанию ogranichenie, navyk') +
      '), будут записываться БЕЗ подтверждения и помечаться в самой записи');
  }

  // RU: Связь с mem_id ставится только после подтверждённой доставки и ответа «создана». Deduped/Reconfirmed/Evolved означают существующую запись: она не получает доказательство нашего создания и корня. В omega-memory 1.5.19 склейка ищется в области project + entity_id. Отказ связи не отменяет доставку и записывается в журнал; без связи запись не идёт в автоматическую смысловую выдачу.
  // EN: Link mem_id only after confirmed delivery and a “created” result. Deduped/Reconfirmed/Evolved denote an existing record, which receives no proof of our creation or root ownership. omega-memory 1.5.19 deduplicates within project + entity_id. Link failure does not undo delivery and is journaled; an unlinked record is excluded from automatic semantic delivery.
  const svyazatSOmega = (zapis_id, otvet, klass, istochnik) => {
    if (!hranilishche) return;
    const mem_id = otvet?.id ?? null;
    let r;
    if (!mem_id) r = { priroda: 'svyaz-omega-ne-zapisana', pochemu: 'доставлено, но опознавателя mem-… в ответе нет' };
    else if (otvet.sozdana === false) {
      r = { priroda: 'svyaz-omega-skleena', ishodZhurnala: 'obrabotano', pochemu: 'хранилище склеило знание с существующей записью ' + mem_id + ' (Deduped/Reconfirmed/Evolved) — корень не проверен' };
    } else if (otvet.sozdana !== true) {
      r = { priroda: 'svyaz-omega-ne-dokazana', pochemu: 'создание записи ' + mem_id + ' не доказано ответом хранилища (' +
        (otvet.sozdana === null ? 'ответ незнакомого вида' : 'признака нет — перечитывание очереди или слой старше ядра') + ')' };
    } else {
      try { r = hranilishche.svyazat({ zapis_id, mem_id, kak: 'dostavka' }); }
      catch (e) { r = { ishod: 'oshibka', pochemu: e?.message ?? String(e) }; }
    }
    if (r.ishod === 'svyazano' || r.ishod === 'uzhe') return;
    zhurnal?.otmetit({
      // RU: Склейка — штатный ответ: obrabotano не считается отказом в сводке.
      // EN: Deduplication is an expected result: the summary does not count obrabotano as rejection.
      agent, klass, ishod: r.ishodZhurnala ?? 'ne-udalos-proverit', priroda: r.priroda ?? 'svyaz-omega-ne-zapisana',
      pochemu: 'связь записи ' + zapis_id + ' с OMEGA не записана: '
        + (r.pochemu ?? ('конфликт с уже записанной ' + JSON.stringify(r.byla))),
      istochnik: istochnik ?? null,
    });
  };

  // RU: Модель может оценивать только записи, выданные в этом процессе. Новая запись секретаря сама в этот набор не попадает. Перезапуск очищает набор: до следующей выдачи оценка явно отказывает.
  // EN: The model can rate only records delivered in this process. A newly distilled record does not enter this set by itself. Restart clears the set: ratings fail explicitly until another delivery.
  // RU: A-N-1718: зовущий отложенной доставки. До 1.1.106 dostavitOtlozhennoe не звал никто, и очередь sadik стояла с 09.09 (35 записей, попыток 0). Зовём после ПОДТВЕРЖДЁННОЙ доставки новой записи: она доказывает, что слой жив, и идёт в процессе самого агента с его базой и корнем. Не чаще раза в час на процесс, без наложения, без ожидания вызывающим; moglo-dojti-bez-id и исчерпанные проход не будят — им нужна рука.
  // EN: A-N-1718: the caller of deferred delivery. Before 1.1.106 nothing called dostavitOtlozhennoe, and the sadik queue stood since 09.09 (35 records, 0 attempts). Call it after a CONFIRMED delivery of a new record: that proves the layer is alive and runs in the agent's own process with its database and root. At most hourly per process, never overlapping, never awaited by the caller; moglo-dojti-bez-id and exhausted entries do not wake the pass — they need a human.
  const RAZBOR_OCHEREDI_MS = 3600000;
  const POROG_TELA_ZNAKOV = 80;   // RU: A-N-1718 r2: короче — сверка по телу не проводится · EN: shorter bodies are not body-searched
  let razborIdet = false, razborBylo = 0;
  const zvatRazborOcheredi = () => {
    if (razborIdet || Date.now() - razborBylo < RAZBOR_OCHEREDI_MS) return;
    razborBylo = Date.now();
    let est;
    // RU: A-N-1718 (а2): без id тоже будит проход, если слой умеет искать по телу; иначе такие записи проходу нечем разобрать.
    // EN: A-N-1718 (a2): id-less entries also wake the pass when the layer can search by body.
    const poTelu = typeof ctx.get?.('pamyatDolgovremennaya')?.poTelu === 'function';
    try { est = hranilishche.ochered({ agent, vklyuchayaIscherpannye: false }).some((z) => poTelu || z.priroda !== 'moglo-dojti-bez-id'); }
    catch (e) { krik('🔴 очередь доставки не прочитана перед повтором: ' + (e?.message ?? String(e))); return; }
    if (!est) return;
    razborIdet = true;
    sluzhbaPamyati.dostavitOtlozhennoe().then((o) => {
      krik('повтор доставки (A-N-1718): в очереди было ' + o.vsego + ' · доставлено ' + o.dostavleno +
        ' · подтверждено чтением ' + o.podtverzhdeno + ' · осталось к повтору ' + o.ostalos +
        ' · ждут руки (moglo-dojti-bez-id) ' + o.zhdutRuki + (o.dublej ? ' (из них дубль ' + o.dublej + ')' : '') +
        (o.korotkih ? ' (тело коротко для сверки по телу ' + o.korotkih + ')' : '') +
        (o.poTeluNeVyshlo ? ' · проверка по телу не состоялась ' + o.poTeluNeVyshlo : '') + ' · исчерпано ' + o.ischerpannyh +
        (o.sloyDostupen ? '' : ' — слой недоступен: ' + o.pochemuNet));
    }).catch((e) => {
      krik('🔴 повтор доставки упал: ' + (e?.message ?? String(e)) + ' — очередь не тронута сверх уже сделанного');
    }).finally(() => { razborIdet = false; });
  };

  const vydanoVProcesse = new Set();
  const sluzhbaPamyati = {
    /**
     * RU: Потребитель проверяет доступность службы явным запросом.
     * EN: Consumers explicitly query service availability.
     */
    dostupna() { return prichinaOtkaza === null; },
    /**
     * RU: Возвращает причину недоступности или null при исправном хранилище.
     * EN: Return the reason for unavailability, or null for healthy storage.
     */
    pochemuNedostupna() { return prichinaOtkaza ? prichinaOtkaza.message : null; },
    /**
     * RU: Возвращает префикс исключения сессии или null; база для этого не нужна.
     * EN: Return the session exclusion prefix or null; this does not require the database.
     */
    sessiyaIsklyuchena(sid) { return sessiyaIsklyuchena(sid); },
    /**
     * RU: Решение политики по классу не имеет побочных действий.
     * EN: The class policy decision has no side effects.
     */
    reshit(klass) { return reshitPoKlassu(klass, { sprashivat: config.sprashivat }); },

    /**
     * RU: reshit отвечает только о политике: ask остаётся ask даже на узле без отвечающего, где запись допустима с пометкой. Этот метод отвечает именно о записи без человека, чтобы производитель не скрывал допустимые классы. false не запрещает отдельный путь с podtverzhdenie: allowed-once.
     * EN: reshit answers only the policy question: ask remains ask even on a no-responder host where an annotated write is allowed. This method answers specifically whether writing without a person is possible, so producers do not hide eligible classes. false does not prohibit the separate path with podtverzhdenie: allowed-once.
     */
    zapishet(klass, { otvechayushchegoNetVVyzove = false } = {}) {
      const r = reshitPoKlassu(klass, { sprashivat: config.sprashivat });
      if (r?.reshenie !== 'ask') return true;
      return Boolean(config.otvechayushchegoNet) || Boolean(otvechayushchegoNetVVyzove);
    },
    /**
     * RU: Чистая маска входа внешней модели использует единственный najti_sekret и заменяет каждую находку на [СЕКРЕТ <класс>]. Ничего не записывает. Потребитель distill-shov обязан отказаться от внешнего вызова при отсутствии метода.
     * EN: The pure external-model input mask uses the single najti_sekret implementation and replaces each finding with [СЕКРЕТ <class>]. It writes nothing. The distill-shov consumer must refuse the external call if this method is unavailable.
     */
    zamaskirovatVhod(tekst) { return zamaskirovatVhod(tekst); },
    /**
     * RU: Интерпретация подтверждения различает запрет и неисправность канала.
     * EN: Approval interpretation distinguishes rejection from channel failure.
     */
    istolkovat(ishod, kanalEst) { return istolkovatPodtverzhdenie(ishod, kanalEst); },
    /**
     * RU: zapisat сам применяет политику: вызывающий не может обойти подтверждение, пропустив reshit. Поле podtverzhdenie содержит буквальный исход платформы, например allowed-once. Отказ и его природа попадают в журнал.
     * EN: zapisat enforces policy itself: callers cannot bypass approval by skipping reshit. podtverzhdenie contains a literal platform outcome such as allowed-once. Rejections and their nature are journaled.
     */
    zapisat(zapis) {
      if (!hranilishche || prichinaOtkaza) otkaz();
      // RU: Диагностика обработки сохраняется только вместе со вставленной записью: сама по себе она не доказывает вставку.
      // EN: Save processing diagnostics only with the inserted record: diagnostics alone do not prove insertion.
      const obrabotka = [];
      let prichinaPredelaMaski = '';
      const zapisatSOtmetkoy = (dannye, otmetka) => {
        // RU: SAVEPOINT связывает знание и журнал только при одном соединении с одной базой. Отдельная база журнала потребовала бы другого договора атомарности.
        // EN: SAVEPOINT makes knowledge and journal atomic only on one connection to one database. A separate journal database would require a different atomicity contract.
        const db = hranilishche.baza;
        db.exec('SAVEPOINT pamyat_zapisat');
        try {
          const id = hranilishche.zapisat(dannye);
          for (const sobytie of obrabotka) zhurnal.otmetit(sobytie);
          zhurnal.otmetit(otmetka);
          db.exec('RELEASE pamyat_zapisat');
          return id;
        } catch (e) {
          db.exec('ROLLBACK TO pamyat_zapisat; RELEASE pamyat_zapisat');
          throw e;
        }
      };

      // RU: Фильтр стоит до развилок, охватывая оба пути записи. Перенос в одну ветку проверяется порчей: секрет проходит через другую. Счёт семи выходов — лишь сигнал перечитать новые ветки, не доказательство защиты; комментарии в него не входят. Фильтр чистит невидимые символы и проверяет секреты, но не распознаёт смысловое отравление пересказом чужой модели.
      // EN: The filter runs before branching to cover both write paths. Moving it into one branch is tested by mutation: a secret passes through the other. Counting seven exits only signals a need to inspect new branches; it is not proof of protection and excludes comments. The filter removes invisible characters and checks secrets but cannot detect semantic poisoning retold by another model.
      const kanarejka = filtr_ispraven();
      if (!kanarejka.ispraven) {
        // RU: Unicode очищается с сохранением записи (fail-open), но неисправный фильтр запрещает запись (fail-closed), иначе поломка выглядела бы чистым входом.
        // EN: Unicode is cleaned while retaining the record (fail-open), but a broken filter forbids the write (fail-closed); otherwise failure would look like clean input.
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
      // RU: Служебные поля нормализуются и при невидимых знаках отвергаются, а не очищаются. Невидимый знак в klass меняет совпадение с перечнем и мог бы оставить знание только оперативно под видом штатного отбора.
      // EN: Normalize service fields and reject invisible characters instead of cleaning them. An invisible character in klass changes list matching and could leave knowledge only in working storage while appearing to be normal selection.
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
      // RU: soderzhim приводится к NFC до маски, фильтра и чистки: NFD мог бы скрыть склонённое слово от правила. Здесь не используется normalizovat, поскольку её String() превратила бы неверный тип в допустимый текст.
      // EN: Normalize soderzhim to NFC before masking, filtering, and cleaning: NFD could hide an inflected word from a rule. Do not use normalizovat here because its String() would turn an invalid type into text.
      zapis = { ...zapis, klass: normalizovat(zapis.klass), istochnik: normalizovat(zapis.istochnik),
                soderzhim: typeof zapis.soderzhim === 'string' ? zapis.soderzhim.normalize('NFC') : zapis.soderzhim };
      // RU: Маска образцов работает на прямом пути записи знаний и классов с префиксом svodka: иначе урок с примером секрета отвергался бы своей защитой. Прочие классы не изменяются и при секрете по-прежнему отказывают. Метка и число замен объявляют изменение текста; маска не заменяет последующий фильтр.
      // EN: The sample mask runs on the direct write path for knowledge and classes prefixed with svodka; otherwise a lesson containing a secret example would be rejected by its own protection. Other classes stay unchanged and still fail on secrets. A marker and replacement count expose the text change; masking does not replace the subsequent filter.
      const podMaskoj = klassyZnaniy.includes(zapis.klass)
                        || String(zapis.klass ?? '').startsWith('svodka');
      if (podMaskoj && config.maskirovatObrazcy !== false) {
        const m = zamaskirovat(String(zapis.soderzhim ?? ''));
        if (m.predelDostignut) {
          prichinaPredelaMaski = `; достигнут предел маски: ${m.zameneno} замен, после него остался фрагмент, распознаваемый фильтром`;
        }
        if (m.zameneno > 0) {
          // RU: След маски хранится в ochistka.maska; чистка невидимых знаков дополняет тот же объект. В отметке только число замен и классы, без значений; позиция остаётся в метке текста.
          // EN: Store the mask trace in ochistka.maska; invisible-character cleanup extends the same object. The annotation contains only counts and classes, never values; positions remain in text markers.
          zapis = { ...zapis, soderzhim: m.tekst,
                    ochistka: { maska: { zameneno: m.zameneno, klassy: m.klassy, upyorsya: m.upyorsya } } };
          obrabotka.push({
            agent, klass: zapis.klass, ishod: 'obrabotano', priroda: 'maska-obrazcov',
            // RU: Журнал получает место первой метки из уже правленого текста, чтобы объяснить замену без раскрытия исходного значения. Исходный фрагмент здесь публиковал бы секрет.
            // EN: Journal the location of the first marker from the already edited text to explain the replacement without exposing the original value. Logging the original fragment would publish the secret.
            pochemu: 'замаскировано значений: ' + m.zameneno + ' (классы: ' +
                     m.klassy.join(', ') + '). Слово-объявление и форма сохранены, заменено ' +
                     'ТОЛЬКО значение. Текст записи ОТЛИЧАЕТСЯ от того, что подали на вход' +
                     (m.upyorsya ? '. 🔴 МАСКА УПЁРЛАСЬ В ПРЕДЕЛ: замаскировано не всё' : '') +
                     (() => {
                       const i = m.tekst.indexOf('[скрыто ');
                       if (i < 0) return '';
                       const ot = Math.max(0, i - 40);
                       return '. Место (правленый текст, значения в нём УЖЕ НЕТ): …' +
                              m.tekst.slice(ot, ot + 120).replace(/\s+/g, ' ') + '…';
                     })(),
            istochnik: zapis.istochnik ?? null,
          });
        }
        if (m.ostalos) {
          // RU: Маска не трогает класс, распознанный по собственной форме. Его отказ фильтром объявляется отдельно, чтобы ограничение маски не выглядело её поломкой.
          // EN: The mask leaves classes recognized by their own shape untouched. Report their filter rejection separately so a mask limitation does not look like mask failure.
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'otkloneno', priroda: 'maska-ne-primenima',
            pochemu: 'класс «' + m.ostalos + '» распознан по СОБСТВЕННОЙ форме значения, ' +
                     'а не по слову рядом: маскировать его значило бы завести тихую дыру. ' +
                     'Запись будет отклонена фильтром — это верно, а не сбой маски',
            istochnik: zapis.istochnik ?? null,
          });
        }
      }
      const sekret = najti_sekret(String(zapis.soderzhim ?? ''));
      if (sekret) {
        // RU: Режим каждого правила задаёт фильтр, единственным списком. Однозначные объявленные и структурные признаки отвергают запись; неоднозначные энтропия и hex без объявления только помечают, чтобы не терять знания с похожими строками. Ноль срабатываний корпуса не доказывает однозначность признака и не оправдывает смену режима.
        // EN: The filter defines each rule mode in one list. Unambiguous declared and structural signals reject records; ambiguous entropy and undeclared hex only annotate them to preserve knowledge containing similar strings. Zero corpus matches do not prove a signal unambiguous or justify changing its mode.
        const strogo = zapiraet(sekret.klass);
        // RU: Журнал получает только класс и позицию: значение или исходный фрагмент сделали бы защиту публикатором секретов.
        // EN: Journal only the class and position: a value or original fragment would turn protection into a secret publisher.
        if (strogo) {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'otkloneno', priroda: 'sekret-na-vhode',
            // RU: Ссылка на источник использует номера событий seq, а не байты файла. Позиция фильтра относится к тексту записи; эти разные единицы нужно называть, чтобы обещание восстановимости не читалось как файловое смещение.
            // EN: The source reference uses event sequence numbers seq, not file bytes. The filter position refers to record text; name these different units so recoverability is not mistaken for a file offset.
            pochemu: 'в тексте найден секрет класса «' + sekret.klass + '» на позиции ' +
                     sekret.pozicia + ' (позиция — в ЗНАКАХ текста записи, не в файле); ' +
                     'значение не печатается. Знание восстановимо: источник ниже — ' +
                     'НОМЕРА СОБЫТИЙ (seq) в session.jsonl.zstd каталога этой сессии, ' +
                     'не байты и не строки. Распаковать целиком и отобрать по полю seq' + prichinaPredelaMaski,
            istochnik: zapis.istochnik ?? null,
          });
          const e = new Error('dsh-pamyat: в тексте найден секрет (' + sekret.klass +
                              '), запись отклонена');
          e.code = 'PAMYAT_SEKRET_NA_VHODE';
          throw e;
        }
        // RU: Подозрение хранится в самой записи и переживает журнал. Поле отдельно от ochistka: подозрение и внесённое изменение — разные сведения.
        // EN: Store suspicion in the record itself so it outlives the journal. Keep it separate from ochistka: suspicion and an actual edit convey different facts.
        zapis = { ...zapis, podozrenie: { klass: sekret.klass, pozicia: sekret.pozicia } };
        obrabotka.push({
          agent, klass: zapis.klass, ishod: 'obrabotano', priroda: 'podozrenie-na-sekret',
          pochemu: 'правило «' + sekret.klass + '» сработало на позиции ' + sekret.pozicia +
                   '; запись ПРОПУЩЕНА с пометкой, потому что это правило судит по виду ' +
                   'строки и на больших корпусах даёт ложные. Значение не печатается',
          istochnik: zapis.istochnik ?? null,
        });
      }
      const chistka = ochistit(String(zapis.soderzhim ?? ''));
      if (chistka.ochistka) {
        zapis = { ...zapis, soderzhim: chistka.tekst, ochistka: { ...zapis.ochistka, ...chistka.ochistka } };
        if (trevozhno(chistka.ochistka)) {
          obrabotka.push({
            agent, klass: zapis.klass, ishod: 'obrabotano', priroda: 'ochistka-trevozhnaya',
            pochemu: 'вычищено ' + chistka.ochistka.bylo_udaleno + ' невидимых знаков из ' +
                     chistka.ochistka.dlina_do + ' (классы: ' + chistka.ochistka.klassy.join(', ') +
                     ') — это конструкция, а не мусор копипасты',
            istochnik: zapis.istochnik ?? null,
          });
        }
      }
      // RU: Синхронный zapisat не ждёт асинхронный необязательный sohranit. Возвращённый id доказывает только оперативную вставку; исход доставки всегда пишет журнал. Доставка вызывается из обоих путей записи, включая путь без отвечающего.
      // EN: Synchronous zapisat does not wait for optional asynchronous sohranit. The returned id proves only insertion in working storage; the journal always records delivery outcome. Both write paths invoke delivery, including the no-responder path.
      const vDolgovremennuyu = (id, zapisSoderzhim, bezPodtverzhdeniya) => {
        // RU: Класс вне перечня остаётся оперативно с отдельным исходом ostalos-v-operativnom: вызывающий должен отличать штатный отбор от доставки во все слои.
        // EN: A class outside the list stays in working storage with the distinct ostalos-v-operativnom outcome: callers must distinguish intentional selection from delivery to every layer.
        if (!klassyZnaniy.includes(zapis.klass)) {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'ostalos-v-operativnom',
            priroda: 'klass-vne-klassyZnaniy',
            pochemu: 'класс «' + zapis.klass + '» не входит в klassyZnaniy (' +
                     (klassyZnaniy.join(', ') || 'перечень пуст') +
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
          // RU: Отсутствующий необязательный слой не создаёт очередь: без потребителя она никогда не опустела бы. Это отличается от установленного, но временно недоступного слоя ниже.
          // EN: An absent optional layer creates no queue: without a consumer it could never drain. This differs from the installed but temporarily unavailable layer below.
          return id;
        }
        if (!dolgo.dostupna()) {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: 'ne-otpravleno',
            priroda: 'dolgovremennyj-sloj-nedostupen', pochemu: dolgo.pochemuNedostupna(),
            istochnik: zapis.istochnik ?? null,
          });
          // RU: Установленный слой без связи создаёт очередь. Повтор записью безопасен: исходного вызова ещё не было.
          // EN: An installed layer without connectivity queues the record. Retrying the write is safe because no original call occurred.
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
          // RU: Неопределённая категория не создаёт подкорни: знание идёт в корень агента.
          // EN: An undetermined category creates no subroots: knowledge goes to the agent root.
          kto: agent,   // A-N-1870: config.koren снят — проверка видимости (aktivnye) всегда смотрела в корень agent
          metadannye: {
            source_uri: zapis.istochnik ?? null,
            klass: zapis.klass,
            // RU: Пометка отсутствия подтверждения доставляется с самим знанием и переживает журнал решений.
            // EN: Deliver the missing-approval annotation with the knowledge itself so it outlives the decision journal.
            bezPodtverzhdeniya: Boolean(bezPodtverzhdeniya),
          },
        }).then((r) => {
          zhurnal?.otmetit({
            agent, klass: zapis.klass, ishod: r.sostoyanie, priroda: 'dolgovremennyj-sloj',
            pochemu: r.pochemu ?? ('id ' + r.id), istochnik: zapis.istochnik ?? null,
          });
          if (r.sostoyanie === 'dostavleno') { svyazatSOmega(id, r, zapis.klass, zapis.istochnik); zvatRazborOcheredi(); return; }
          // RU: Природа доставки сохраняется в очереди без обобщения: она определяет повтор записью, проверку чтением или ручной разбор.
          // EN: Keep the delivery nature unchanged in the queue: it determines a write retry, a read check, or manual review.
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
          // RU: Исключение не доказывает отсутствие отправки. Исход «могло дойти без id» требует ручного разбора, а не автоповтора, который мог бы создать скрытый дубль.
          // EN: An exception does not prove the send never happened. “May have arrived without an id” requires manual review, not an automatic retry that could create a hidden duplicate.
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
      // RU: Класс с обязательным спросом может записываться без отвечающего только с отметкой в самой записи. otvechayushchegoNet описывает узел; otvechayushchegoNetVVyzove описывает отдельный автоматический вызов, где человека нет по устройству пути. Второй флаг ослабляет только этот вызов в сторону помеченной, а не подтверждённой записи.
      // EN: A class requiring approval may be written without a responder only with an annotation in the record. otvechayushchegoNet describes the host; otvechayushchegoNetVVyzove describes one automated call whose path has no person. The latter relaxes only that call toward an annotated write, never an approved write.
      const bezOtvechayushchego = Boolean(config.otvechayushchegoNet) || Boolean(zapis.otvechayushchegoNetVVyzove);
      if (reshenie.reshenie === 'ask' && bezOtvechayushchego) {
        const id = zapisatSOtmetkoy({ agent, ...zapis, bezPodtverzhdeniya: true }, {
          agent, klass: zapis.klass, ishod: 'zapisano', priroda: 'bez-podtverzhdeniya',
          pochemu: (config.otvechayushchegoNet
            ? 'на узле нет отвечающего'
            : 'вызывающий объявил, что у ЭТОГО вызова отвечающего нет')
            + '; запись помечена как принятая без подтверждения',
          istochnik: zapis.istochnik ?? null,
        });
        return vDolgovremennuyu(id, zapis.soderzhim, true);
      }
      if (reshenie.reshenie === 'ask') {
        // RU: «Не спросили» имеет отдельную природу: ошибку вызывающего нельзя смешивать с unavailable, отсутствием канала.
        // EN: “Never asked” has a distinct nature: a caller error must not be conflated with unavailable, a missing channel.
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
          // RU: Код отказа различает отсутствие спроса и неразрешённый спрос: исправлять нужно разные стороны договора.
          // EN: The rejection code distinguishes a missing request from a request not approved: different sides of the contract need repair.
          e.code = itog.priroda === 'ne-predyavleno'
            ? 'PAMYAT_TREBUET_PODTVERZHDENIYA'
            : 'PAMYAT_ZAPIS_NE_RAZRESHENA';
          e.priroda = itog.priroda;
          throw e;
        }
      }
      const id = zapisatSOtmetkoy({ agent, ...zapis }, {
        agent, klass: zapis.klass, ishod: 'zapisano',
        pochemu: 'записано в оперативный слой', istochnik: zapis.istochnik ?? null,
      });
      return vDolgovremennuyu(id, zapis.soderzhim, false);
    },
    /**
     * RU: Отказ записывается в журнал вместе с причиной.
     * EN: Journal a refusal together with its cause.
     */
    otmetitOtkaz({ klass, priroda, pochemu, istochnik = null }) {
      if (!zhurnal) otkaz();
      return zhurnal.otmetit({ agent, klass, ishod: 'otkloneno', priroda, pochemu, istochnik });
    },
    /**
     * RU: Прочитать записи памяти.
     * EN: Read memory records.
     */
    prochitat(vopros = {}) {
      if (!hranilishche) otkaz();
      // RU: Умолчание tolkoKlassy задаёт служба, которая знает klassyZnaniy. Оно стоит до ...vopros: вызывающий вправе переопределить отбор, как и skolko.
      // EN: The service supplies the tolkoKlassy default because it knows klassyZnaniy. It precedes ...vopros so callers may override selection, just as they may override skolko.
      return hranilishche.prochitat({
        agent, skolko: config.chtenieSkolko ?? 20, tolkoKlassy: klassyZnaniy, ...vopros,
      });
    },
    /**
     * RU: Получить все записи с этой ссылкой на источник: пусто означает, что источник не разбирался. Горизонта выборки нет намеренно; prochitat с последними N не отвечает на этот вопрос.
     * EN: Return all records with this source reference: an empty result means the source has not been processed. There is deliberately no selection horizon; prochitat with its latest N cannot answer this question.
     */
    poIstochniku(istochnik) {
      if (!hranilishche) otkaz();
      // RU: Имя агента берётся из настройки ядра, а не из внешнего вопроса.
      // EN: Take the agent name from core configuration, not from the external query.
      return hranilishche.poIstochniku({ agent, istochnik });
    },
    /**
     * RU: Запись id отменяет или уточняет запись k. Хранилище проверяет договор и возвращает коды отказа; kto обязателен для следа. Агент и классы берутся из настройки ядра. Поле и журнал сохраняются одной точкой; ishod=obrabotano, priroda=otnoshenie не считаются отказом в сводке.
     * EN: Record id cancels or refines record k. Storage validates the contract and returns failure codes; kto is required for attribution. Agent and classes come from core configuration. Save the field and journal at one savepoint; ishod=obrabotano, priroda=otnoshenie is not counted as rejection in the summary.
     */
    ustanovitOtnoshenie({ id, vid, k, kto } = {}) {
      if (!hranilishche || !zhurnal || prichinaOtkaza) otkaz();
      if (typeof kto !== 'string' || !kto.trim()) {
        const e = new Error('dsh-pamyat: отношение подано без kto — не названо, кто его утверждает');
        e.code = 'PAMYAT_OTNOSHENIE_BEZ_KTO';
        throw e;
      }
      const db = hranilishche.baza;
      db.exec('SAVEPOINT pamyat_otnoshenie');
      try {
        const r = hranilishche.ustanovitOtnoshenie({ agent, id, vid, k, klassyZnaniy });
        if (r.ishod === 'ustanovleno') {
          zhurnal.otmetit({ agent, klass: r.klass, ishod: 'obrabotano', priroda: 'otnoshenie',
            pochemu: kto.trim() + ': запись ' + r.id + ' ' + r.vid + ' запись ' + r.k });
        }
        db.exec('RELEASE pamyat_otnoshenie');
        return r;
      } catch (e) {
        db.exec('ROLLBACK TO pamyat_otnoshenie; RELEASE pamyat_otnoshenie');
        throw e;
      }
    },
    /**
     * RU: Касание означает выдачу записей агенту. Повод проверяет единственный словарь хранилища. Возвращается {otmecheno, otkaz}; отказ записи касания не отменяет состоявшуюся выдачу.
     * EN: A touch represents delivery of records to the agent. The single storage dictionary validates its reason. Return {otmecheno, otkaz}; failing to save a touch does not undo the delivery.
     */
    otmetitKasanie(vopros = {}) {
      if (!hranilishche) otkaz();
      const itog = hranilishche.otmetitKasanie(vopros);
      // RU: Запись считается выданной даже при отказе сохранения касания: модель уже её видела.
      // EN: Consider the record delivered even if saving its touch failed: the model already saw it.
      if (vopros?.povod === 'vydacha-agentu' && Array.isArray(vopros.ids)) {
        for (const x of vopros.ids) { const n = Number(x); if (Number.isInteger(n) && n > 0) vydanoVProcesse.add(n); }
      }
      return itog;
    },
    /**
     * RU: Оценка модели проверяется до события: запись выдавалась в этом процессе, не вычищена и ещё не оценена за эту выдачу; pochemu — 20–400 знаков. kem = model:<agent>/<session>#v<poslednyaya_vydacha>. Номер выдачи хранит база и меняет только vydacha-agentu. NULL после миграции или отказа касания запрещает оценку до новой выдачи.
     * EN: Validate model ratings before saving an event: the record was delivered in this process, is not erased, and has no rating for this delivery; pochemu is 20–400 characters. kem = model:<agent>/<session>#v<poslednyaya_vydacha>. The database stores the delivery number, changed only by vydacha-agentu. NULL after migration or a failed touch blocks rating until a new delivery.
     */
    ocenitVydannoe({ id, ishod, pochemu, sessiya } = {}) {
      if (!hranilishche) otkaz();
      const oshibka = (code, tekst) => { const e = new Error('dsh-pamyat: ' + tekst); e.code = code; return e; };
      const nomer = Number(id);
      if (!Number.isInteger(nomer) || nomer <= 0) throw oshibka('PAMYAT_OCENKA_NEGODEN_ID', 'номер записи должен быть целым положительным; получено ' + JSON.stringify(id));
      const vnutr = OCENKA_MODELI_ISHOD[ishod];
      if (!vnutr) throw oshibka('PAMYAT_OCENKA_NE_TOT_ISHOD', 'исход — pomoglo | podvelo | ustarelo; получено ' + JSON.stringify(ishod));
      const p = typeof pochemu === 'string' ? pochemu.trim() : '';
      if (p.length < 20 || p.length > 400) throw oshibka('PAMYAT_OCENKA_POCHEMU', 'pochemu обязателен, 20–400 знаков (сейчас ' + p.length + '): чем применение подтвердило или опровергло запись');
      if (typeof sessiya !== 'string' || !sessiya.trim()) throw oshibka('PAMYAT_OCENKA_BEZ_KTO', 'не названа сессия — некому оценивать');
      if (!vydanoVProcesse.has(nomer)) throw oshibka('PAMYAT_OCENKA_NE_VYDAVALOS', '#' + nomer + ' вам в этом процессе не выдавалось — оценивать нечего (оценивается только применённое из выдачи)');
      const zapis = hranilishche.poId(nomer);
      if (!zapis) throw oshibka('PAMYAT_OCENKA_ZAPIS_NE_NAJDENA', 'записи ' + nomer + ' нет');
      if (zapis.agent !== agent) throw oshibka('PAMYAT_OCENKA_CHUZHAYA', '#' + nomer + ' — запись другого агента');
      if (zapis.vychishcheno !== null && zapis.vychishcheno !== undefined) throw oshibka('PAMYAT_OCENKA_VYCHISHCHENO', '#' + nomer + ' вычищена — оценивать нечего');
      const vydacha = zapis.poslednyaya_vydacha;
      if (!Number.isInteger(vydacha) || vydacha <= 0) throw oshibka('PAMYAT_OCENKA_VYDACHA_NE_ZAPISANA', '#' + nomer + ' выдана, но момент выдачи в базе не записан (выдача до миграции alpha.99 или касание не легло) — оценка возможна после следующей выдачи');
      const kem = 'model:' + agent + '/' + sessiya.trim() + '#v' + vydacha;
      const status = hranilishche.statusVery(zapis);
      let spisok = [];
      try { spisok = zapis.ocenki ? JSON.parse(zapis.ocenki) : []; } catch { spisok = null; }
      // RU: Одна оценка на выдачу, независимо от сессии: иначе ветвь или подагент дали бы ложный повторный use. Сверка идёт по хвосту #v<выдача> среди оценок модели этого агента.
      // EN: Allow one rating per delivery regardless of session; otherwise a branch or subagent could produce false repeated use. Match the #v<delivery> suffix among this agent model ratings.
      const hvost = '#v' + vydacha, svoi = 'model:' + agent + '/';
      if (Array.isArray(spisok) && spisok.some((s) => typeof s?.kem === 'string' && s.kem.startsWith(svoi) && s.kem.endsWith(hvost))) throw oshibka('PAMYAT_OCENKA_UZHE_PO_VYDACHE', '#' + nomer + ' уже оценена по этой выдаче — одна оценка на выдачу; следующая после новой выдачи записи');
      const r = hranilishche.otsenit({ id: nomer, ishod: vnutr, kem, pochemu: p });
      return { id: r.id, ocenok: r.ocenok, vera: r.vera, veraDo: status.vera };
    },
    /**
     * RU: Близость нового знания сравнивается только с памятью настроенного агента, чтобы производитель не дублировал определение владельца. Метод описывает исход и ничего не отклоняет.
     * EN: Compare new knowledge only with the configured agent memory so the producer does not duplicate ownership logic. The method describes its result and rejects nothing.
     */
    blizhajshaya(vopros = {}) {
      if (!hranilishche) otkaz();
      return hranilishche.blizhajshaya({ agent, ...vopros });
    },
    /**
     * RU: До трёх действующих записей отменяемых классов для проверки отмены нового знания. Агент ставится последним из настройки ядра и не переопределяется вопросом.
     * EN: Return up to three active records of cancellable classes for checking whether new knowledge cancels one. Set the configured agent last so the query cannot override it.
     */
    blizhajshieDejstvuyushchie(vopros = {}) {
      if (!hranilishche) otkaz();
      return hranilishche.blizhajshieDejstvuyushchie({ ...vopros, agent });
    },
    /**
     * RU: Доверие к mem_id учитывает все связанные записи ядра. null означает отсутствие связи, а не разрешение доверять. Ответ {itog, zapisi} применяет правило itogMnogosvyazi хранилища для склеенных записей.
     * EN: Trust for mem_id includes all linked core records. null means no link, not permission to trust. The {itog, zapisi} result applies the storage itogMnogosvyazi rule to merged records.
     */
    doverieDlyaMem(memIds = []) {
      if (!hranilishche) otkaz();
      return hranilishche.doverieDlyaMem({ agent, memIds });
    },
    /**
     * RU: Сводка решений объясняет, почему память пуста.
     * EN: The decision summary explains why memory is empty.
     */
    svodka() {
      if (!zhurnal || prichinaOtkaza) otkaz();
      const itog = zhurnal.svodka(agent);
      if (itog.novayaRaznica === null) krik(`СЛЕПОТА счёта памяти агента ${agent}: ${itog.zapisiSvodka}`);
      else if (itog.novayaRaznica !== 0) krik(`РАСХОЖДЕНИЕ счёта памяти агента ${agent}: ${itog.zapisiSvodka}`);
      return itog;
    },

    /**
     * RU: Вернуть ожидающие доставки записи; пустой массив означает пустую очередь.
     * EN: Return records awaiting delivery; an empty array means the queue is empty.
     */
    ocheredDostavki(vopros = {}) {
      if (!hranilishche) otkaz();
      return hranilishche.ochered({ agent, ...vopros });
    },

    /**
     * RU: Повтор доставки вызывается ночным проходом или вручную; метод возвращает числа, печатает вызывающий. ne-otpravleno/ne-najdeno повторяются записью; moglo-dojti-id-est сначала проверяется чтением; moglo-dojti-bez-id ждёт ручного разбора, поскольку без id или поиска по источнику нельзя исключить дубль. Недоступность слоя и неудача проверки чтением не расходуют попытки записи.
     * EN: A nightly pass or manual call retries delivery; this method returns counts and leaves output to the caller. Retry ne-otpravleno/ne-najdeno by writing; check moglo-dojti-id-est by reading first; leave moglo-dojti-bez-id for manual review because no id or source lookup can rule out a duplicate. Layer unavailability and failed read checks do not consume write attempts.
     */
    async dostavitOtlozhennoe({ predelPopytok = 5 } = {}) {
      if (!hranilishche) otkaz();
      const otchet = {
        vsego: 0, dostavleno: 0, podtverzhdeno: 0, ostalos: 0,
        zhdutRuki: 0, ischerpannyh: 0, novyhIscherpanij: 0, dublej: 0, poTeluNeVyshlo: 0, korotkih: 0,
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
        if (Number(stroka.ischerpano) === 1) continue;
        const zapis = hranilishche.poId(stroka.zapis_id);
        if (!zapis) {
          // RU: Удалённую оперативную запись повторять нечем; убрать её ожидание доставки.
          // EN: There is nothing to resend for a deleted working record; remove its pending delivery.
          hranilishche.snyatSOcheredi(stroka.zapis_id);
          zhurnal?.otmetit({
            agent, klass: stroka.klass, ishod: 'snyato-s-ocheredi', priroda: 'zapisi-net-v-operativnom',
            pochemu: 'запись ' + stroka.zapis_id + ' исчезла из оперативного слоя — доставлять нечего',
          });
          continue;
        }

        if (stroka.priroda === 'moglo-dojti-bez-id') {
          // RU: A-N-1718 (а2): без id повтор записью небезопасен, но тело можно найти. Ровно одна запись корня, содержащая тело
          //     целиком, — доставка доказана: снять как подтверждённое. Ноль — ждёт руки, сам не повторять (могла лечь с иным
          //     телом). Больше одной — ждёт руки с причиной «дубль». Слой без poTelu или неудачный поиск очередь не трогают.
          // EN: A-N-1718 (a2): exactly one root record containing the whole body proves delivery; zero or more than one wait for a human.
          if (typeof dolgo.poTelu !== 'function') continue;
          // RU: Условие Вениамина (r2): короткое тело может целиком входить в ЧУЖУЮ запись корня — ложное «1» сняло бы
          //     недошедшее знание и связало его с чужим id. Короче порога poTelu не зовётся; запись ждёт руки.
          // EN: Veniamin's condition (r2): a short body may be contained in another root record; below the threshold, skip body search.
          if (Array.from(String(zapis.soderzhim ?? '').trim()).length < POROG_TELA_ZNAKOV) { otchet.korotkih += 1; continue; }
          // RU: A-N-1948 №3 (№1): исключение поиска — то же, что неудачный поиск: очередь не трогаем, проход продолжаем.
          // EN: A-N-1948 №3 (№1): a search exception equals a failed search: keep the queue, continue the pass.
          const p = await Promise.resolve().then(() => dolgo.poTelu({ tekst: zapis.soderzhim, koren: agent })).catch(() => null);
          if (!Array.isArray(p?.ids)) { otchet.poTeluNeVyshlo += 1; continue; }
          if (p.ids.length === 1) {
            hranilishche.snyatSOcheredi(stroka.zapis_id);
            svyazatSOmega(stroka.zapis_id, { id: p.ids[0] }, stroka.klass, zapis.istochnik);
            otchet.podtverzhdeno += 1; otchet.zhdutRuki -= 1;
            zhurnal?.otmetit({
              agent, klass: stroka.klass, ishod: 'dostavleno', priroda: 'podtverzhdeno-po-telu',
              pochemu: 'тело целиком найдено в корне ровно в одной записи ' + p.ids[0], istochnik: zapis.istochnik ?? null,
            });
          } else if (p.ids.length > 1) {
            otchet.dublej += 1;
            zhurnal?.otmetit({
              agent, klass: stroka.klass, ishod: 'moglo-dojti-bez-id', priroda: 'dubl',
              pochemu: 'тело найдено в ' + p.ids.length + ' записях корня (' + p.ids.join(', ') + ') — снимать нельзя, ждёт руки',
              istochnik: zapis.istochnik ?? null,
            });
          }
          continue;
        }

        // RU: A-N-1718: ne-najdeno с опознавателем тоже сперва проверяется чтением. Замер 07.10: все 25 таких записей очереди sadik лежали в OMEGA байт в байт, 23 — под тем же id (ложное «не найдено» прежней сверки Source); повтор записью без чтения бил бы в уже дошедшее.
        // EN: A-N-1718: ne-najdeno with an id is also read-checked first. Measured 07.10: all 25 such queued records on sadik were byte-identical in OMEGA, 23 under the same id (a false miss by the former Source check); a blind write retry would hit delivered knowledge.
        const sperva = stroka.priroda === 'moglo-dojti-id-est'
          || (stroka.priroda === 'ne-najdeno' && stroka.mem_id && typeof dolgo.proverit === 'function');
        if (sperva) {
          // RU: Версии слоёв независимы: старый провайдер может не иметь proverit. Вместо TypeError оставить очередь с названной причиной.
          // EN: Layer versions are independent: an older provider may lack proverit. Keep the queue with an explicit cause instead of throwing TypeError.
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
          // RU: A-N-1948 №3 (№1): исключение проверки чтением — записи не было: как ne-proveryali, с отметкой журнала; проход продолжаем.
          // EN: A-N-1948 №3 (№1): a read-check exception means no write happened: treat as ne-proveryali, journal it, continue.
          const p = await Promise.resolve().then(() => dolgo.proverit({ id: stroka.mem_id, obrazec: zapis.soderzhim })).catch((e) => {
            zhurnal?.otmetit({
              agent, klass: stroka.klass, ishod: 'ne-udalos-proverit', priroda: 'povtor-dostavki',
              pochemu: 'проверка чтением бросила исключение: ' + (e?.message ?? String(e)), istochnik: zapis.istochnik ?? null,
            });
            return { sostoyanie: 'ne-proveryali' };
          });
          if (p.sostoyanie === 'est') {
            hranilishche.snyatSOcheredi(stroka.zapis_id);
            // RU: Проверка доставки не содержит исходного ответа «создана», поэтому связь не ставится; результат остаётся в журнале.
            // EN: A delivery check lacks the original “created” response, so no link is written; the result stays in the journal.
            svyazatSOmega(stroka.zapis_id, { id: stroka.mem_id }, stroka.klass, zapis.istochnik);
            otchet.podtverzhdeno += 1;
            zhurnal?.otmetit({
              agent, klass: stroka.klass, ishod: 'dostavleno', priroda: 'podtverzhdeno-chteniem',
              pochemu: 'запись ' + stroka.mem_id + ' нашлась при повторном чтении: ' + p.pochemu,
              istochnik: zapis.istochnik ?? null,
            });
            continue;
          }
          if (p.sostoyanie === 'ne-proveryali') {
            // RU: Неудача проверки не расходует попытку: запись ещё не повторялась.
            // EN: A failed check does not consume an attempt: the write has not been retried.
            otchet.ostalos += 1;
            continue;
          }
          // RU: sostoyanie=net подтверждает отсутствие записи чтением: повтор записью безопасен.
          // EN: sostoyanie=net confirms absence by reading: retrying the write is safe.
        }

        let r;
        try {
          r = await dolgo.sohranit({
            soderzhim: zapis.soderzhim,
            tip: stroka.klass,
            kto: agent,   // A-N-1870: config.koren снят — проверка видимости (aktivnye) всегда смотрела в корень agent
            metadannye: {
              source_uri: zapis.istochnik ?? null,
              klass: stroka.klass,
              bezPodtverzhdeniya: Boolean(zapis.bez_podtverzhdeniya),
              povtorDostavki: true,
            },
          });
        } catch (e) {
          // RU: A-N-1948 №3 (№1): как на первичном пути — исключение не доказывает, что запись не дошла. Строка → moglo-dojti-bez-id
          //     (ждёт руки, автоповтора нет — он дал бы дубль), остальные строки прохода обрабатываются.
          // EN: A-N-1948 №3 (№1): as on the primary path — an exception does not prove the write failed; queue as moglo-dojti-bez-id.
          zhurnal?.otmetit({
            agent, klass: stroka.klass, ishod: 'moglo-dojti-bez-id', priroda: 'povtor-dostavki',
            pochemu: 'шов доставки бросил исключение при повторе: ' + (e?.message ?? String(e)) +
                     '. Дошло знание или нет — неизвестно, опознавателя нет.',
            istochnik: zapis.istochnik ?? null,
          });
          hranilishche.vOchered({
            zapis_id: stroka.zapis_id, agent, klass: stroka.klass,
            priroda: 'moglo-dojti-bez-id', prichina: e?.message ?? String(e),
          });
          otchet.ostalos += 1; otchet.zhdutRuki += 1;
          continue;
        }
        zhurnal?.otmetit({
          agent, klass: stroka.klass, ishod: r.sostoyanie, priroda: 'povtor-dostavki',
          pochemu: r.pochemu ?? ('id ' + r.id), istochnik: zapis.istochnik ?? null,
        });
        if (r.sostoyanie === 'dostavleno') {
          hranilishche.snyatSOcheredi(stroka.zapis_id);
          svyazatSOmega(stroka.zapis_id, r, stroka.klass, zapis.istochnik);
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
          // RU: Исчерпание попыток объявляется один раз при смене флага. Запись остаётся в очереди, чтобы предел не стал тихой потерей.
          // EN: Announce exhausted attempts once when the flag changes. Retain the queued record so the limit does not become silent loss.
          krik('доставка знания исчерпала попытки (' + predelPopytok + '): запись ' +
               stroka.zapis_id + ', класс «' + stroka.klass + '». Она ОСТАЁТСЯ в очереди, ' +
               'но повторяться больше не будет. Причина последней попытки: ' + (r.pochemu ?? '—'));
        }
      }
      return otchet;
    },

    /**
     * RU: Читатели отношений ограничены текущим агентом. Чужая или отсутствующая запись даёт PAMYAT_ZAPIS_NE_NAJDENA, а не пустое отношение.
     * EN: Relationship readers are limited to the current agent. A missing or foreign record yields PAMYAT_ZAPIS_NE_NAJDENA, not an empty relationship.
     */
    statusOtnosheniya(id) {
      if (!hranilishche || prichinaOtkaza) otkaz();
      const z = hranilishche.baza.prepare('SELECT * FROM zapisi WHERE id = ? AND agent = ?').get(Number(id), agent);
      if (!z) { const e = new Error('dsh-pamyat: статус отношения спрошен у записи, которой у агента ' + agent + ' нет: ' + id); e.code = 'PAMYAT_ZAPIS_NE_NAJDENA'; throw e; }
      return hranilishche.statusOtnosheniya(z);
    },
    ktoOtmenil(id) {
      if (!hranilishche || prichinaOtkaza) otkaz();
      if (!hranilishche.baza.prepare('SELECT 1 FROM zapisi WHERE id = ? AND agent = ?').get(Number(id), agent)) {
        const e = new Error('dsh-pamyat: отменяющие спрошены у записи, которой у агента ' + agent + ' нет: ' + id); e.code = 'PAMYAT_ZAPIS_NE_NAJDENA'; throw e;
      }
      return hranilishche.ktoOtmenil(Number(id));
    },
    // RU: Чистые функции чтения журнала сессии для производителей и restore поддерживают DSH 0.1.1 и 0.1.7+/0.2.0; от базы и состояния ядра не зависят (sobytiya-sessii.js).
    // EN: Pure session-journal readers for producers and restore support DSH 0.1.1 and 0.1.7+/0.2.0; they do not depend on the database or core state (sobytiya-sessii.js).
    sobytiyaSessii,
    nasledovano,
    eSvodkaSzhatiya,
    /**
     * RU: Видимость действующего двойника в OMEGA строго true/false/null. false: запись чужая, отсутствует или мертва по доверию; либо среди активных двойника нет. true: совпал связанный mem_id своего корня или полное необрезанное превью после нормализации пробелов. null: слой/aktivnye недоступен, поиск отказал/деградировал, исключение либо совпало только обрезанное начало; вызывающий обязан писать. Слой берётся через ctx.get при вызове. Границы: склеенная запись без связи и двойник вне 20 ближайших дают false, выбирая безопасную повторную запись.
     * EN: Visibility of an active OMEGA counterpart is strictly true/false/null. false: the record is foreign, absent, or dead by trust; or no active counterpart is found. true: a linked mem_id in this root matches, or a complete untruncated preview matches after whitespace normalization. null: the layer/aktivnye is unavailable, search fails/degrades, an exception occurs, or only a truncated prefix matches; the caller must write. Resolve the layer via ctx.get at call time. Limits: a merged record without a link or a counterpart outside the nearest 20 yields false, favoring a safe additional write.
     */
    async vidnaVOmega(zapisId) {
      if (!hranilishche || prichinaOtkaza) otkaz();
      const z = hranilishche.poId(Number(zapisId));
      if (!z || z.agent !== agent) return false;
      // RU: У заглушки нет текста для поиска двойника: результат «не знаю», а не «не видна».
      // EN: A stub has no text to search for a counterpart: return “unknown,” not “invisible.”
      if (z.vychishcheno != null) return null;
      const [s] = hranilishche.prilozhitOtnosheniya([z]);
      if (['otmenena', 'oprovergnuta', 'otmetka-negodna'].includes(s?.doverie?.sostoyanie)) return false;
      const dolgo = ctx.get?.('pamyatDolgovremennaya');
      if (typeof dolgo?.aktivnye !== 'function') return null;
      let r;
      try { r = await dolgo.aktivnye({ tekst: String(z.soderzhim ?? ''), koren: agent }); } catch { return null; }
      if (!r || r.otkaz || !Array.isArray(r.zapisi)) return null;
      const mem = hranilishche.baza.prepare('SELECT mem_id FROM svyaz_omega WHERE zapis_id = ?').get(Number(zapisId))?.mem_id;
      if (mem && r.zapisi.some((x) => x.id === mem)) return true;
      const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
      const vsya = norm(z.soderzhim);
      if (!vsya) return false;
      const prevyu = r.zapisi.map((x) => norm(x.prevyu));
      if (prevyu.some((p) => !p.endsWith('...') && p === vsya)) return true;              // RU: Полное превью подтверждает видимость всей записи.
      // EN: A complete preview proves visibility of the whole record.
      if (prevyu.some((p) => p.endsWith('...') && vsya.startsWith(p.slice(0, -3).trimEnd().slice(0, 120)))) return null;   // RU: Совпало начало, но обрезанное превью не доказывает совпадение конца.
      // EN: The prefix matches, but a truncated preview cannot prove the ending matches.
      return false;
    },
  };
  ctx.provide('pamyat', sluzhbaPamyati);

  // RU: pamyat_otnoshenie позволяет агенту явно поставить отношение через службу-писателя ядра. tools ожидается без inject, чтобы его отсутствие не задержало всё ядро. defineTool берётся из установки процесса (process.argv[1]); kto состоит из config.agent и exec.agent.id. Отказ договора бросает код в тексте ошибки для модели. Инструмент сам не выдаёт записи; их id приходят через restore.
  // EN: pamyat_otnoshenie lets the agent explicitly set a relationship through the core writer service. Wait for tools without inject so its absence does not delay the entire core. Resolve defineTool from the process installation (process.argv[1]); kto combines config.agent and exec.agent.id. Contract rejection throws an error containing the code for the model. The tool does not deliver records itself; restore supplies their ids.
  void (async () => {
    let tools;
    for (let i = 0; i < 30 && !(tools = ctx.get?.('tools'))?.register; i++) {
      // RU: unref не даёт ожиданию tools удерживать процесс: разовый запуск без этой службы иначе ждал бы 30 с и выдавал ложную тревогу.
      // EN: unref prevents waiting for tools from keeping the process alive: a one-off run without this service would otherwise wait 30 s and emit a false alarm.
      await new Promise((r) => { const t = setTimeout(r, 1000); t.unref?.(); });
    }
    if (!tools?.register) {
      krik('🔴 инструмент pamyat_otnoshenie НЕ зарегистрирован: служба tools не появилась за 30 с — агент не сможет ставить отношения');
      return;
    }
    let defineTool;
    try {
      ;({ defineTool } = await import(pathToFileURL(
        createRequire(process.argv[1] || import.meta.url).resolve('@deepseek-ai/dsh-tools')).href));
    } catch (e) {
      krik('🔴 инструмент pamyat_otnoshenie НЕ зарегистрирован: @deepseek-ai/dsh-tools не разрешился от '
        + (process.argv[1] || import.meta.url) + ' — ' + String(e?.message ?? e).slice(0, 120));
      return;
    }
    tools.register(defineTool(opisanieInstrumentaOtnosheniya(sluzhbaPamyati, agent)));
    krik('инструмент pamyat_otnoshenie зарегистрирован');
    tools.register(defineTool(opisanieInstrumentaOcenki(sluzhbaPamyati, agent)));
    krik('инструмент pamyat_ocenit зарегистрирован (оценка модели: только выданное приветствием в этом процессе, раз на выдачу; kem кодом с номером выдачи)');
  })();
}
