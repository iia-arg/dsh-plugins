/**
 * RU: Локальное хранилище сохраняет память между сессиями и компактами без внешних служб. node:sqlite исключает нативные зависимости, но требует Node >= 22 и остаётся экспериментальным. Здесь нет политики записи, дистилляции и сети. Отношения пишет ustanovitOtnoshenie, читают statusOtnosheniya/ktoOtmenil; пустое поле после рубежа не доказывает, что никто не отменял запись — отмену могли не отметить.
 * EN: Local storage preserves memory across sessions and compaction without external services. node:sqlite avoids native dependencies but requires Node >= 22 and remains experimental. This layer has no write policy, distillation, or networking. ustanovitOtnoshenie writes relationships; statusOtnosheniya/ktoOtmenil read them. An empty field after the boundary does not prove nobody cancelled a record; cancellation may have gone unrecorded.
 */
import { createRequire } from 'node:module';
import { openSync, closeSync } from 'node:fs';
import { sostoyanieDoveriya, SOSTOYANIYA } from './doverie.js';

const trebuj = createRequire(import.meta.url);

// RU: otmenyaet допустимо для действующих оснований, включая vyvod и urok; случившиеся fakt/nablyudenie/oshibka можно только уточнять. Отмена вывода должна отличаться от поправки к действующему выводу. Перечень знаний приходит от службы как klassyZnaniy, чтобы локальная копия не разошлась с настройкой.
// EN: otmenyaet is allowed for active premises, including vyvod and urok; completed fakt/nablyudenie/oshibka may only be refined. Cancelling a conclusion must differ from correcting an active one. The service supplies klassyZnaniy so a local knowledge-class copy cannot drift from configuration.
export const VIDY_OTNOSHENIYA = ['otmenyaet', 'utochnyaet'];
export const KLASSY_DEJSTVUYUSHCHIE = ['reshenie', 'poryadok', 'ogranichenie', 'vyvod', 'urok'];

/**
 * RU: Собрать короткую читаемую причину отказа, не сериализацию и не стек. Пустой message у AggregateError нельзя принимать как найденную причину через ??; используются вложенные причины. Функция местная, чтобы не вводить межпакетную зависимость ради форматирования.
 * EN: Build a short readable failure reason, not an error serialization or stack. An AggregateError with an empty message must not count as a found reason through ??; use nested causes. Keep the function local to avoid an inter-package dependency for formatting.
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
 * RU: Загрузить драйвер SQLite с явным кодом отказа: отсутствие модуля не должно выглядеть пустой памятью. Права на файл и целостность базы проверяются при открытии, не здесь.
 * EN: Load the SQLite driver with an explicit failure code: a missing module must not look like empty memory. File permissions and database integrity are checked when opening, not here.
 */
export function zagruzitDrajver(imyaModulya = 'node:sqlite') {
  try {
    // RU: Имя модуля передаётся параметром, чтобы отказ загрузки можно было воспроизвести порчей.
    // EN: Pass the module name as a parameter so a load failure can be reproduced by mutation.
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
 * RU: Схема развивается добавлением, сохраняя старые данные. klass задаёт класс для политики; soderzhim — текст; istochnik — точная ссылка session#seq для сверки; sozdano — UTC в миллисекундах; agent — владелец памяти.
 * EN: Extend the schema additively to retain existing data. klass is the policy class; soderzhim is the text; istochnik is an exact session#seq reference for verification; sozdano is UTC milliseconds; agent owns the memory.
 */
const SHEMA = `
CREATE TABLE IF NOT EXISTS zapisi (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent      TEXT NOT NULL,
  klass      TEXT NOT NULL,
  soderzhim  TEXT NOT NULL,
  istochnik  TEXT,
  sozdano    INTEGER NOT NULL,
  bez_podtverzhdeniya INTEGER NOT NULL DEFAULT 0,
  vera REAL DEFAULT NULL,
  ocenki TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_zapisi_agent_klass ON zapisi(agent, klass);
CREATE INDEX IF NOT EXISTS idx_zapisi_sozdano ON zapisi(sozdano);

CREATE TABLE IF NOT EXISTS ochered_dolgovremennogo (
  zapis_id   INTEGER PRIMARY KEY,
  agent      TEXT NOT NULL,
  klass      TEXT NOT NULL,
  priroda    TEXT NOT NULL,
  mem_id     TEXT,
  postavleno INTEGER NOT NULL,
  popytok    INTEGER NOT NULL DEFAULT 0,
  poslednyaya_prichina TEXT,
  kogda_poslednyaya    INTEGER,
  ischerpano INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ochered_agent ON ochered_dolgovremennogo(agent);

CREATE TABLE IF NOT EXISTS nastrojki (
  kluch      TEXT PRIMARY KEY,
  znachenie  TEXT NOT NULL,
  postavleno INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS svyaz_omega (
  zapis_id INTEGER PRIMARY KEY,
  mem_id   TEXT NOT NULL,
  kak      TEXT NOT NULL CHECK (kak IN ('dostavka', 'vosstanovleno-tekstom')),
  kogda    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_svyaz_omega_mem ON svyaz_omega(mem_id);
`;

/**
 * RU: Открыть базу по пути вызывающего без предположений о каталогах узла. Недоступный каталог, неверные права или повреждённая база дают отказ с кодом, отличимый от открытой пустой базы.
 * EN: Open the database at the caller path without assumptions about host directories. An unavailable directory, invalid permissions, or a damaged database yields a coded failure distinct from an open empty database.
 */
/**
 * RU: Один экземпляр OMEGA может иметь N связей ядра; неизвестно, какая дала его текст. Все N мёртвые дают худшее состояние и запрет выдачи; 0 < k < N мёртвых дают mnogosvyaz для проверки; иначе берётся худшее по SOSTOYANIYA с перечнем записей. При N=1 итог равен единственной записи.
 * EN: One OMEGA instance may have N core links; the core cannot tell which supplied its text. If all N are dead, use the worst state and block delivery; 0 < k < N dead records yield mnogosvyaz for verification; otherwise use the worst SOSTOYANIYA state with the record list. For N=1, the result equals that record.
 */
const MYORTVYE = ['otmenena', 'oprovergnuta', 'otmetka-negodna'];
export function itogMnogosvyazi(memId, zapisi) {
  const hudshee = (spisok) => spisok.reduce((a, b) =>
    (SOSTOYANIYA.indexOf(b.doverie.sostoyanie) < SOSTOYANIYA.indexOf(a.doverie.sostoyanie) ? b : a));
  const myortvye = zapisi.filter((z) => MYORTVYE.includes(z.doverie.sostoyanie));
  if (zapisi.length > 1 && myortvye.length && myortvye.length < zapisi.length) {
    return { sostoyanie: 'mnogosvyaz', n: zapisi.length, k: myortvye.length,
      stroka: 'verify: у ' + memId + ' ' + zapisi.length + ' записей ядра, из них ' + myortvye.length + ' ' +
        myortvye.map((z) => '#' + z.zapis_id + ' ' + z.doverie.sostoyanie).join(', ') };
  }
  const h = hudshee(zapisi);
  return { sostoyanie: h.doverie.sostoyanie, n: zapisi.length, k: myortvye.length,
    stroka: (zapisi.length > 1 ? 'у ' + memId + ' ' + zapisi.length + ' записей ядра (#' +
      zapisi.map((z) => z.zapis_id).join(', #') + '); худшее — #' + h.zapis_id + ': ' : '') + h.doverie.stroka };
}

/**
 * RU: Разобрать составные поля в новом объекте, не меняя исходный.
 * EN: Parse structured fields into a new object without changing the original.
 */
function razobrat_polya (z) {
  const razobrat = (v) => {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  };
  return { ...z, ochistka: razobrat(z.ochistka), podozrenie: razobrat(z.podozrenie) };
}

/**
 * RU: Веса оценок экспортируются как один источник для слоя выдачи и его порогов. База 80 позволяет первому harmful снять применение без удаления знания; база 100 оставила бы его выше порога. Вера — счёт наблюдений в 0..1, не вероятность: её нельзя усреднять по корпусу или сравнивать между агентами. Без оценок число не назначается.
 * EN: Export rating weights as the single source for the delivery layer and its thresholds. A baseline of 80 lets the first harmful rating stop use without deleting knowledge; 100 would leave it above the threshold. Trust is an observation score in 0..1, not a probability: do not average it across a corpus or compare agents. Assign no number without ratings.
 */
export const OCENKI_DOPUSTIMYE = ['helped', 'harmful', 'stale'];

/**
 * RU: Считать сотые целыми и делить один раз в конце, чтобы двоичная дробь не оставляла хвост в журнале.
 * EN: Compute integer hundredths and divide once at the end to avoid binary-fraction artifacts in the journal.
 */
export const VES_OCENKI = Object.freeze({ baza: 80, helped: 20, harmful: -35, stale: -15 });

/**
 * RU: Чистый расчёт веры по событиям. Пустой или негодный вход возвращает null («не измеряли»), не ноль.
 * EN: Pure trust calculation from events. Empty or invalid input returns null (“unmeasured”), not zero.
 */
export function veraPoOcenkam(sobytiya) {
  if (!Array.isArray(sobytiya) || sobytiya.length === 0) return null;
  let sotye = VES_OCENKI.baza;
  for (const s of sobytiya) {
    const ves = VES_OCENKI[s?.ishod];
    // RU: Неизвестный исход делает список непригодным для расчёта, а не получает нулевой вес: испорченная отметка должна отличаться от отсутствующего события.
    // EN: An unknown outcome makes the list invalid for calculation rather than receiving zero weight: a corrupt annotation must differ from an absent event.
    if (typeof ves !== 'number') return null;
    sotye += ves;
  }
  if (sotye < 0) sotye = 0;
  if (sotye > 100) sotye = 100;
  return sotye / 100;
}

/**
 * RU: Чистая близость слов по Жаккару собирает величину, не решение new/merged/blocked. Перефраз с другими словами не ловится; слова короче четырёх букв отбрасываются, отбор класса делает вызывающий. Пустое множество хотя бы с одной стороны даёт null («сравнить нечем»), а ноль означает измеренное отсутствие общих слов.
 * EN: Pure Jaccard word similarity provides a score, not a new/merged/blocked decision. Paraphrases using different words are missed; words shorter than four letters are discarded, and callers select the class. An empty word set on either side yields null (“nothing to compare”), while zero means a measured absence of shared words.
 */
export function blizost(a, b) {
  const slova = (s) => new Set(
    String(s ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(' ')
      .filter((w) => w.length > 3)
  );
  const A = slova(a);
  const B = slova(b);
  if (A.size === 0 || B.size === 0) return null;
  let obshchih = 0;
  for (const w of A) if (B.has(w)) obshchih++;
  const vseh = A.size + B.size - obshchih;
  return vseh === 0 ? null : obshchih / vseh;
}

export function otkrytHranilishche(putK, { drajver, predelZnakov, predelyZnakovPoKlassam } = {}) {
  // RU: Ограничений длины нет ни для одного класса. Legacy-ключи только диагностируются и не включают фильтр.
  // EN: No class has a length restriction. Legacy keys are diagnostic only and do not enable a filter.
  if (predelZnakov !== undefined || predelyZnakovPoKlassam !== undefined) {
    console.error('[dsh-pamyat] настройки predelZnakov/predelyZnakovPoKlassam переданы, но больше не применяются; длина записи не ограничивается');
  }
  if (!putK || typeof putK !== 'string') {
    const e = new Error('dsh-pamyat: не задан путь к базе памяти (ожидалась строка)');
    e.code = 'PAMYAT_NET_PUTI';
    throw e;
  }
  const { DatabaseSync } = drajver ?? zagruzitDrajver();
  // RU: A-N-1948 №3 (№23): новую базу создаём сами с 0660 — прочим учёткам ни чтения, ни записи. 0600 не берём: в каталоге памяти
  //     ACL по умолчанию даёт доступ учётке omega, а режим 0600 обнулил бы маску ACL. С ACL по умолчанию umask не действует;
  //     без него — 0660 & ~umask. Существующую базу не трогаем; любой отказ создания решает сам DatabaseSync (поведение прежнее).
  // EN: A-N-1948 №3 (№23): create a new database ourselves with 0660 (no access for others); 0600 would zero the ACL mask that grants
  //     the omega account access. An existing database is left as is; any creation failure is left to DatabaseSync.
  if (putK !== ':memory:' && !putK.startsWith('file:')) {
    try { closeSync(openSync(putK, 'wx', 0o660)); } catch { /* RU: файл есть или каталога нет. EN: exists or no directory. */ }
  }
  let baza;
  try {
    baza = new DatabaseSync(putK);
    baza.exec(SHEMA);
    // RU: Старые базы дополняются недостающими колонками без переноса данных. Повторная миграция не меняет существующую схему и значения.
    // EN: Add missing columns to old databases without moving data. Repeated migration preserves the existing schema and values.
    const stolbcy = baza.prepare('PRAGMA table_info(zapisi)').all().map((r) => r.name);
    if (!stolbcy.includes('bez_podtverzhdeniya')) {
      baza.exec('ALTER TABLE zapisi ADD COLUMN bez_podtverzhdeniya INTEGER NOT NULL DEFAULT 0');
    }
    if (!stolbcy.includes('ochistka')) {
      // RU: ochistka хранится с записью, чтобы сверка изменённого текста с источником знала о чистке. NULL означает отсутствие изменений; пустой объект не подменяет отсутствие отметки.
      // EN: Keep ochistka with the record so source comparison can account for cleaned text. NULL means no edits; an empty object must not stand in for no annotation.
      baza.exec('ALTER TABLE zapisi ADD COLUMN ochistka TEXT DEFAULT NULL');
    }
    if (!stolbcy.includes('podozrenie')) {
      // RU: podozrenie отдельно от ochistka: подозрение не равно изменению. Неоднозначные признаки только помечают, сохраняя текст; NULL означает, что правило не срабатывало.
      // EN: Keep podozrenie separate from ochistka: suspicion is not an edit. Ambiguous signals annotate without changing the text; NULL means the rule did not match.
      baza.exec('ALTER TABLE zapisi ADD COLUMN podozrenie TEXT DEFAULT NULL');
    }
    if (!stolbcy.includes('vera')) {
      // RU: Старым записям не приписывается вера: отсутствие прежнего измерения нельзя заменить выдуманным числом.
      // EN: Assign no trust score to old records: a missing historical measurement cannot be replaced with an invented number.
      baza.exec('ALTER TABLE zapisi ADD COLUMN vera REAL DEFAULT NULL');
    }
    if (!stolbcy.includes('ocenki')) {
      // RU: Старые записи не получают даже пустой список оценок: пустой список и отсутствие оценки имеют разные значения.
      // EN: Do not assign even an empty rating list to old records: an empty list and no assessment mean different things.
      baza.exec('ALTER TABLE zapisi ADD COLUMN ocenki TEXT DEFAULT NULL');
    }
    if (!stolbcy.includes('podtverzhdenie')) {
      // RU: Позднее подтверждение хранится отдельно от bez_podtverzhdeniya: флаг фиксирует отсутствие спроса в момент записи и остаётся истинным после одобрения. NULL означает отсутствие позднего подтверждения; старым строкам не назначается пустая отметка.
      // EN: Store later approval separately from bez_podtverzhdeniya: the flag records that approval was unavailable at write time and stays true after approval. NULL means no later approval; old rows receive no empty annotation.
      baza.exec('ALTER TABLE zapisi ADD COLUMN podtverzhdenie TEXT DEFAULT NULL');
    }

    // RU: Рубеж происхождения и поля proishozhdenie/proverka вводятся одной BEGIN IMMEDIATE: новая запись не должна попасть ниже снятого max(id) между шагами. id ≤ рубежа означает «до протокола»; id > рубежа с NULL — «не установлено». Рубеж создаётся только один раз, иначе повтор расширил бы привилегию старой памяти. Он действителен только для собственных id: импорт обязан назначать новые локальные id, не наследуя статус чужого номера. Рубеж описывает существование механизма, а не правдивость текста.
    // EN: Create the provenance boundary and proishozhdenie/proverka fields in one BEGIN IMMEDIATE: a new record must not slip below the captured max(id) between steps. id ≤ boundary means “before protocol”; id > boundary with NULL means “undetermined.” Create the boundary only once, or reruns would expand the old-memory privilege. It is valid only for local ids: imports must receive new local ids rather than inherit status from foreign numbers. The boundary describes the existence of the mechanism, not text accuracy.
    // RU: KOD-якорь: ЗАПРЕЩЁН ВВОЗ С СОХРАНЕНИЕМ ЧУЖИХ id — это отмывание доверия; ввозимые записи получают НАШИ id.
    // EN: Source-text anchor: preserving foreign ids on import is prohibited because it launders trust; imported records receive local ids.
    const nuzhno_proishozhdenie = !stolbcy.includes('proishozhdenie');
    const nuzhno_proverka = !stolbcy.includes('proverka');
    // RU: Поля отношения отличают ссылку на запись от утверждения «отменяет» или «уточняет», которые нельзя надёжно вывести из текста.
    // EN: Relationship fields distinguish a record reference from an explicit “cancels” or “refines” claim, which cannot be reliably inferred from text.
    const nuzhno_otnoshenie = !stolbcy.includes('otnoshenie');
    const nuzhno_otnositsya_k = !stolbcy.includes('otnositsya_k');
    const rubezh_otn_est = baza.prepare("SELECT znachenie FROM nastrojki WHERE kluch = 'rubezh_otnosheniya'").get();
    const rubezh_est = baza.prepare("SELECT znachenie FROM nastrojki WHERE kluch = 'rubezh_proishozhdeniya'").get();
    if (nuzhno_proishozhdenie || nuzhno_proverka || !rubezh_est
        || nuzhno_otnoshenie || nuzhno_otnositsya_k || !rubezh_otn_est) {
      baza.exec('BEGIN IMMEDIATE');
      try {
        if (!baza.prepare("SELECT znachenie FROM nastrojki WHERE kluch = 'rubezh_proishozhdeniya'").get()) {
          const max = Number(baza.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM zapisi').get().m);
          baza.prepare('INSERT INTO nastrojki (kluch, znachenie, postavleno) VALUES (?, ?, ?)')
            .run('rubezh_proishozhdeniya', String(max), Date.now());
        }
        if (nuzhno_proishozhdenie) {
          // RU: NULL происхождения означает «до протокола» ниже рубежа и «не установлено» выше.
          // EN: NULL provenance means “before protocol” below the boundary and “undetermined” above it.
          baza.exec('ALTER TABLE zapisi ADD COLUMN proishozhdenie INTEGER DEFAULT NULL');
        }
        // RU: Отдельный рубеж отношений различает отсутствие старого механизма и отсутствие записанного отношения. Создаётся один раз; повтор не пересчитывает max(id).
        // EN: A separate relationship boundary distinguishes a missing historical mechanism from no recorded relationship. Create it once; reruns do not recalculate max(id).
        if (!baza.prepare("SELECT znachenie FROM nastrojki WHERE kluch = 'rubezh_otnosheniya'").get()) {
          const maxo = Number(baza.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM zapisi').get().m);
          baza.prepare('INSERT INTO nastrojki (kluch, znachenie, postavleno) VALUES (?, ?, ?)')
            .run('rubezh_otnosheniya', String(maxo), Date.now());
        }
        if (nuzhno_otnoshenie) {
          // RU: otnoshenie: otmenyaet/utochnyaet/NULL. При id ≤ рубежа NULL означает «до протокола отношений», выше — «отношения нет».
          // EN: otnoshenie: otmenyaet/utochnyaet/NULL. For id ≤ boundary, NULL means “before relationship protocol”; above it, “no relationship.”
          baza.exec("ALTER TABLE zapisi ADD COLUMN otnoshenie TEXT DEFAULT NULL");
        }
        if (nuzhno_otnositsya_k) {
          // RU: otnositsya_k — id цели, пригодный для подсчёта ссылок без разбора текста.
          // EN: otnositsya_k is the target id, allowing reference counts without parsing text.
          baza.exec('ALTER TABLE zapisi ADD COLUMN otnositsya_k INTEGER DEFAULT NULL');
        }
        if (nuzhno_proverka) {
          // RU: proverka: est/utrachena/NULL. NULL означает «не проверяли», а не потерю опоры в журнале.
          // EN: proverka: est/utrachena/NULL. NULL means “unchecked,” not a missing journal reference.
          baza.exec("ALTER TABLE zapisi ADD COLUMN proverka TEXT DEFAULT NULL");
        }
        baza.exec('COMMIT');
      } catch (prichina) {
        try { baza.exec('ROLLBACK'); } catch { /**
         * RU: Повторный ROLLBACK может отказать, если откат уже выполнен.
         * EN: A repeated ROLLBACK may fail if rollback already completed.
         */ }
        throw prichina;
      }
    }

    // RU: Счётчик касаний вводится отдельной транзакцией и дополняет возраст записи сведением об обращении. Ноль старой строки означает «нет касаний с появления счётчика», не «никогда не обращались»; poslednee_kasanie IS NULL означает, что счётчик ещё не применялся. При весе 0 это не отнимает доверия. Поля добавляются только при отсутствии и не обнуляются повтором миграции.
    // EN: Add touch counters in a separate transaction to supplement record age with access history. Zero on an old row means “no touches since the counter was introduced,” not “never accessed”; poslednee_kasanie IS NULL means the counter has not been applied. With weight 0 this reduces no trust. Add fields only when absent and never reset them on migration reruns.
    const nuzhno_kasanij = !stolbcy.includes('kasanij');
    const nuzhno_posl_kasanie = !stolbcy.includes('poslednee_kasanie');
    if (nuzhno_kasanij || nuzhno_posl_kasanie) {
      baza.exec('BEGIN IMMEDIATE');
      try {
        if (nuzhno_kasanij) baza.exec('ALTER TABLE zapisi ADD COLUMN kasanij INTEGER NOT NULL DEFAULT 0');
        if (nuzhno_posl_kasanie) baza.exec('ALTER TABLE zapisi ADD COLUMN poslednee_kasanie INTEGER DEFAULT NULL');
        baza.exec('COMMIT');
      } catch (prichina) {
        try { baza.exec('ROLLBACK'); } catch { /**
         * RU: Повторный ROLLBACK может отказать после уже выполненного отката.
         * EN: A repeated ROLLBACK may fail after rollback has already completed.
         */ }
        throw prichina;
      }
    }
    // RU: Время стирания текста помечает заглушку; id, класс, оценки, отношения и svyaz_omega сохраняются. NULL означает запись с текстом. prochitat и кандидаты близости скрывают заглушку, poId/poIstochniku сохраняют её для отношений и учёта источника. poslednyaya_vydacha меняет только vydacha-agentu, не povtor-sudom: номер в kem позволяет одну оценку за выдачу и use после двух разных выдач. NULL означает отсутствие выдачи с появления поля, включая старые выдачи; до следующей оценка отказывает. Повтор миграции значения не меняет.
    // EN: The text-erasure timestamp marks a stub; id, class, ratings, relationships, and svyaz_omega remain. NULL denotes a record with text. prochitat and similarity candidates hide stubs; poId/poIstochniku retain them for relationships and source tracking. Only vydacha-agentu changes poslednyaya_vydacha, not povtor-sudom: its number in kem permits one rating per delivery and use after two distinct deliveries. NULL means no delivery since the field was introduced, including earlier deliveries; rating fails until the next one. Migration reruns preserve values.
    if (!stolbcy.includes('poslednyaya_vydacha')) {
      baza.exec('BEGIN IMMEDIATE');
      try {
        baza.exec('ALTER TABLE zapisi ADD COLUMN poslednyaya_vydacha INTEGER DEFAULT NULL');
        baza.exec('COMMIT');
      } catch (prichina) {
        try { baza.exec('ROLLBACK'); } catch { /**
         * RU: Повторный ROLLBACK может отказать после уже выполненного отката.
         * EN: A repeated ROLLBACK may fail after rollback has already completed.
         */ }
        throw prichina;
      }
    }
    if (!stolbcy.includes('vychishcheno')) {
      baza.exec('BEGIN IMMEDIATE');
      try {
        baza.exec('ALTER TABLE zapisi ADD COLUMN vychishcheno INTEGER DEFAULT NULL');
        baza.exec('COMMIT');
      } catch (prichina) {
        try { baza.exec('ROLLBACK'); } catch { /**
         * RU: Повторный ROLLBACK может отказать после уже выполненного отката.
         * EN: A repeated ROLLBACK may fail after rollback has already completed.
         */ }
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
     * RU: Соединение открыто наружу для журнала в той же базе: перенос памяти должен сохранять знания вместе с причинами решений.
     * EN: Expose the connection for a journal in the same database: moving memory must retain knowledge together with decision reasons.
     */
    baza,
    /**
     * RU: Вставить знание и вернуть id вставленной записи.
     * EN: Insert knowledge and return the inserted record id.
     */
    zapisat({ agent, klass, soderzhim, istochnik = null, sozdano = Date.now(), bezPodtverzhdeniya = false, vera = null, ochistka = null, podozrenie = null }) {
      // RU: A-N-1948 №3 (№2): содержимое из одних пробелов — пустое: omega сверила бы его с любой записью. EN: whitespace-only content is empty.
      if (!agent || !klass || !soderzhim || (typeof soderzhim === 'string' && !soderzhim.trim())) {
        const e = new Error('dsh-pamyat: запись без обязательных полей (agent, klass, soderzhim)');
        e.code = 'PAMYAT_NEPOLNAYA_ZAPIS';
        throw e;
      }
      // RU: Вера допускает число 0..1 или отсутствие. Неверное значение отвергается, не заменяется нулём: отсутствие измерения не равно измеренному нулю.
      // EN: Trust accepts a number in 0..1 or absence. Reject invalid values rather than replacing them with zero: no measurement differs from a measured zero.
      let veraZnach = null;
      if (vera !== null && vera !== undefined) {
        if (typeof vera !== 'number' || Number.isNaN(vera) || vera < 0 || vera > 1) {
          const e = new Error('dsh-pamyat: вера должна быть числом 0..1 либо не задана вовсе; получено ' + JSON.stringify(vera));
          e.code = 'PAMYAT_VERA_NEGODNA';
          throw e;
        }
        veraZnach = vera;
      }
      // RU: NULL ochistka означает неизменённый текст; пустой объект не хранится как отметка.
      // EN: NULL ochistka means unchanged text; do not store an empty object as an annotation.
      const ochistkaZnach = ochistka ? JSON.stringify(ochistka) : null;
      const podozrenieZnach = podozrenie ? JSON.stringify(podozrenie) : null;
      // RU: Вставка нормализует только строковый soderzhim к NFC, чтобы сравнение хешей и поиск совпадали с долговременным слоем. Неверный тип не преобразуется через String(). Служба также нормализует текст до фильтра; эта точка сохраняет правило для прямого вызова хранилища.
      // EN: Insertion normalizes only string soderzhim to NFC so hash comparison and search agree with the long-term layer. Do not coerce invalid types through String(). The service also normalizes before filtering; this point preserves the rule for direct storage calls.
      const r = baza.prepare(
        'INSERT INTO zapisi (agent, klass, soderzhim, istochnik, sozdano, bez_podtverzhdeniya, vera, ochistka, podozrenie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(agent, klass, typeof soderzhim === 'string' ? soderzhim.normalize('NFC') : soderzhim, istochnik, sozdano, bezPodtverzhdeniya ? 1 : 0, veraZnach, ochistkaZnach, podozrenieZnach);
      return Number(r.lastInsertRowid);
    },
    /**
     * RU: Читать последние записи агента. Пустой массив при живой базе означает отсутствие выбранных записей.
     * EN: Read the latest agent records. An empty array from a live database means no selected records.
     */
    // RU: Составные JSON-поля разбираются при чтении; негодный JSON остаётся как есть, чтобы порча отличалась от отсутствия. tolkoKlassy действует только без явного klass: служба подаёт перечень знаний, исключая служебные снимки из общей выдачи. Явный класс и tolkoKlassy=null сохраняют чтение без этого отбора. Прямой SQL обходит ограничение; оно охватывает только этот API.
    // EN: Parse structured JSON fields on read; retain invalid JSON as-is so corruption differs from absence. tolkoKlassy applies only without an explicit klass: the service supplies knowledge classes to exclude service snapshots from general delivery. An explicit class and tolkoKlassy=null preserve reads without this selection. Direct SQL bypasses the restriction; it covers only this API.
    prochitat({ agent, klass = null, skolko = 20, tolkoKlassy = null }) {
      const otbor = !klass && Array.isArray(tolkoKlassy) && tolkoKlassy.length ? tolkoKlassy : null;
      const sql = klass
        ? 'SELECT * FROM zapisi WHERE agent = ? AND klass = ? AND vychishcheno IS NULL ORDER BY sozdano DESC LIMIT ?'
        : otbor
          ? 'SELECT * FROM zapisi WHERE agent = ? AND klass IN (' + otbor.map(() => '?').join(', ')
            + ') AND vychishcheno IS NULL ORDER BY sozdano DESC LIMIT ?'
          : 'SELECT * FROM zapisi WHERE agent = ? AND vychishcheno IS NULL ORDER BY sozdano DESC LIMIT ?';
      const args = klass ? [agent, klass, skolko]
        : otbor ? [agent, ...otbor, skolko]
        : [agent, skolko];
      return this.prilozhitOtnosheniya(baza.prepare(sql).all(...args).map(razobrat_polya));
    },
    /**
     * RU: Отношения добавляются одним запросом на всю выдачу и помечают, не скрывают отменённую запись. Пустые списки ниже рубежа означают «до протокола»; вызывающий читает rubezh рядом.
     * EN: Attach relationships in one query for the entire result; annotate cancelled records rather than hiding them. Empty lists below the boundary mean “before protocol”; callers read the adjacent rubezh field.
     */
    prilozhitOtnosheniya(ryady) {
      const ids = ryady.map((r) => Number(r.id)).filter(Number.isSafeInteger);
      const kNim = ids.length
        ? baza.prepare('SELECT id, agent, istochnik, sozdano, otnoshenie, otnositsya_k FROM zapisi WHERE otnositsya_k IN ('
            + ids.map(() => '?').join(', ') + ') AND otnoshenie IS NOT NULL ORDER BY id').all(...ids)
        : [];
      for (const r of ryady) {
        const iz = kNim.filter((x) => Number(x.otnositsya_k) === Number(r.id));
        r.otnosheniya = {
          sama: r.otnoshenie ? { vid: String(r.otnoshenie), k: r.otnositsya_k === null ? null : Number(r.otnositsya_k) } : null,
          otmenena: iz.filter((x) => x.otnoshenie === 'otmenyaet').map((x) => Number(x.id)),
          utochnena: iz.filter((x) => x.otnoshenie === 'utochnyaet').map((x) => Number(x.id)),
        };
        // RU: Состояние доверия вычисляется из событий при выдаче, не записывается в vera. Решение подавать запись остаётся читателю restore.
        // EN: Compute trust state from events on delivery without writing it to vera. The restore reader still decides whether to deliver the record.
        const kto = (x) => ({ id: Number(x.id), avtor: x.istochnik ?? x.agent, sozdano: x.sozdano });
        r.doverie = sostoyanieDoveriya(r, {
          otmenyayushchie: iz.filter((x) => x.otnoshenie === 'otmenyaet').map(kto),
          utochnyayushchie: iz.filter((x) => x.otnoshenie === 'utochnyaet').map(kto),
        });
      }
      return ryady;
    },
    /**
     * RU: Точный поиск по источнику не имеет горизонта последних N (у prochitat умолчание 20), иначе старый источник можно было бы обработать повторно. Возвращается список: из одного источника бывает несколько знаний. Пусто — источник не разбирался; непусто — вот сохранённые знания. Размер списка не доказывает полноту разбора.
     * EN: Exact source lookup has no latest-N horizon (prochitat defaults to 20), otherwise an old source could be processed twice. Return a list because one source can yield several knowledge records. Empty means unprocessed; nonempty shows the saved knowledge. List length does not prove processing completeness.
     */
    poIstochniku({ agent, istochnik }) {
      // RU: WHERE agent = ? обязателен, чтобы чужая обработка источника не считалась своей. Проверка изоляции требует временной базы с двумя агентами; база с одним владельцем этой ошибки не обнаружит.
      // EN: WHERE agent = ? is mandatory so another agent processing the source does not count as our own. Isolation tests require a temporary database with two agents; a single-owner database cannot expose this bug.
      if (typeof agent !== 'string' || agent.trim() === '') {
        const e = new Error('dsh-pamyat: спрос по источнику без агента. Без отбора по агенту '
          + 'срез соседа сошёл бы за свой');
        e.code = 'PAMYAT_ISTOCHNIK_BEZ_AGENTA';
        throw e;
      }
      // RU: Отсутствующий источник даёт отказ, не пустой список: istochnik = NULL в SQL никогда не истинно. Метод ищет заданную ссылку; записи без источника требуют отдельного IS NULL.
      // EN: A missing source yields failure, not an empty list: istochnik = NULL is never true in SQL. This method searches a supplied reference; sourceless records require a separate IS NULL query.
      if (typeof istochnik !== 'string' || istochnik.trim() === '') {
        const e = new Error('dsh-pamyat: спрос по источнику без источника. Пустая ссылка нашла бы '
          + 'записи с пустым полем и выдала бы их за совпадение, а незаданная — молчала бы «нет»');
        e.code = 'PAMYAT_ISTOCHNIK_PUST';
        throw e;
      }
      return baza.prepare('SELECT * FROM zapisi WHERE agent = ? AND istochnik = ? ORDER BY sozdano ASC')
        .all(agent, istochnik).map(razobrat_polya);
    },

    /**
     * RU: Читать запись по id для образца при проверке повторной доставки. undefined означает отсутствие записи, не отказ чтения.
     * EN: Read a record by id to supply a sample when checking repeated delivery. undefined means the record is absent, not a read failure.
     */
    poId(id) {
      const z = baza.prepare('SELECT * FROM zapisi WHERE id = ?').get(id);
      return z ? razobrat_polya(z) : z;
    },

    /**
     * RU: Поставить в очередь доставки; повтор обновляет существующую строку.
     * EN: Queue delivery; a repeated call updates the existing row.
     */
    vOchered({ zapis_id, agent, klass, priroda, mem_id = null, prichina = null }) {
      baza.prepare(
        'INSERT INTO ochered_dolgovremennogo ' +
        '(zapis_id, agent, klass, priroda, mem_id, postavleno, popytok, poslednyaya_prichina, kogda_poslednyaya) ' +
        'VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?) ' +
        'ON CONFLICT(zapis_id) DO UPDATE SET priroda = excluded.priroda, mem_id = excluded.mem_id, ' +
        'poslednyaya_prichina = excluded.poslednyaya_prichina, kogda_poslednyaya = excluded.kogda_poslednyaya'
      ).run(zapis_id, agent, klass, priroda, mem_id, Date.now(), prichina, Date.now());
    },

    /**
     * RU: Связать запись с mem_id. Та же пара возвращает uzhe; иной mem_id не перезаписывается и даёт konflikt с byla. Несколько записей могут вести в один экземпляр. Ответ: {ishod: svyazano|uzhe|konflikt, byla?}.
     * EN: Link a record to mem_id. The same pair returns uzhe; a different mem_id is not overwritten and yields konflikt with byla. Multiple records may link to one instance. Return {ishod: svyazano|uzhe|konflikt, byla?}.
     */
    svyazat({ zapis_id, mem_id, kak, kogda = Date.now() }) {
      if (!Number.isSafeInteger(Number(zapis_id)) || typeof mem_id !== 'string' || !mem_id.trim()) {
        const e = new Error('dsh-pamyat: связь с OMEGA без номера записи или без mem_id');
        e.code = 'PAMYAT_SVYAZ_NEPOLNA';
        throw e;
      }
      const byla = baza.prepare('SELECT zapis_id, mem_id, kak FROM svyaz_omega WHERE zapis_id = ?').get(Number(zapis_id));
      if (byla) return byla.mem_id === mem_id ? { ishod: 'uzhe' } : { ishod: 'konflikt', byla };
      baza.prepare('INSERT INTO svyaz_omega (zapis_id, mem_id, kak, kogda) VALUES (?, ?, ?, ?)')
        .run(Number(zapis_id), mem_id, kak, kogda);
      return { ishod: 'svyazano' };
    },

    /**
     * RU: Доверие к mem_id вычисляется тем же prilozhitOtnosheniya/sostoyanieDoveriya, что и prochitat, с обязательным отбором агента. Для каждого mem_id возвращается {itog, zapisi:[{zapis_id, klass, doverie, otnosheniya}]} либо null — связи нет, доверие не разрешено. Итог определяет единый itogMnogosvyazi.
     * EN: Compute trust for mem_id with the same prilozhitOtnosheniya/sostoyanieDoveriya used by prochitat, with mandatory agent selection. Each mem_id yields {itog, zapisi:[{zapis_id, klass, doverie, otnosheniya}]} or null — no link, no permission to trust. The single itogMnogosvyazi rule determines the result.
     */
    doverieDlyaMem({ agent, memIds }) {
      const spisok = [...new Set((Array.isArray(memIds) ? memIds : []).filter((m) => typeof m === 'string' && m))];
      const otvet = Object.fromEntries(spisok.map((m) => [m, null]));
      if (!spisok.length) return otvet;
      const ryady = baza.prepare('SELECT z.*, s.mem_id AS svyaz_mem_id FROM svyaz_omega s JOIN zapisi z ON z.id = s.zapis_id '
        + 'WHERE z.agent = ? AND s.mem_id IN (' + spisok.map(() => '?').join(', ') + ')').all(agent, ...spisok)
        .map(razobrat_polya);
      for (const r of this.prilozhitOtnosheniya(ryady)) {
        (otvet[r.svyaz_mem_id] ??= { itog: null, zapisi: [] }).zapisi
          .push({ zapis_id: Number(r.id), klass: r.klass, doverie: r.doverie, otnosheniya: r.otnosheniya });
      }
      for (const [m, v] of Object.entries(otvet)) if (v) v.itog = itogMnogosvyazi(m, v.zapisi);
      return otvet;
    },

    /**
     * RU: Вернуть очередь доставки; пустой массив при живой базе означает отсутствие ожиданий.
     * EN: Return the delivery queue; an empty array from a live database means nothing is pending.
     */
    ochered({ agent = null, vklyuchayaIscherpannye = true } = {}) {
      const usloviya = [];
      const args = [];
      if (agent) { usloviya.push('agent = ?'); args.push(agent); }
      if (!vklyuchayaIscherpannye) usloviya.push('ischerpano = 0');
      const gde = usloviya.length ? ' WHERE ' + usloviya.join(' AND ') : '';
      return baza.prepare('SELECT * FROM ochered_dolgovremennogo' + gde + ' ORDER BY postavleno').all(...args);
    },

    /**
     * RU: Снять ожидание после подтверждения доставки.
     * EN: Remove the pending item after delivery is confirmed.
     */
    snyatSOcheredi(zapis_id) {
      baza.prepare('DELETE FROM ochered_dolgovremennogo WHERE zapis_id = ?').run(zapis_id);
    },

    /**
     * RU: Засчитать попытку и вернуть переход к исчерпанию именно сейчас, а не состояние. Так тревога звучит один раз; состояние остаётся в очереди.
     * EN: Count an attempt and return whether exhaustion began now, not the current state. This emits the alarm once; the queue retains the state.
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
     * RU: Рубеж происхождения читается из базы при каждом вызове: перенос или восстановление базы не должны оставлять устаревший номер в процессе.
     * EN: Read the provenance boundary from the database on every call: moving or restoring the database must not leave a stale number in the process.
     */
    /**
     * RU: Отсутствующий рубеж отношений даёт отказ, не ноль: ноль ложно объявил бы всю память созданной после протокола.
     * EN: A missing relationship boundary yields failure, not zero: zero would falsely classify all memory as created after the protocol.
     */
    /**
     * RU: Оговорка о пустом поле выводится из текущих данных, не из даты. Она сама перестаёт действовать после появления записи отношения; не доказывает, кто пишет и правильно ли.
     * EN: Derive the empty-field caveat from current data, not a date. It stops applying once a relationship is recorded; it proves neither who writes nor whether writes are correct.
     */
    ogovorkaPustogoPolya() {
      const r = baza.prepare('SELECT COUNT(*) AS n FROM zapisi WHERE otnoshenie IS NOT NULL').get();
      return Number(r?.n ?? 0) === 0 ? ' (в поле отношения пока нет ни одной отметки — это про ПОЛЕ, не про мир)' : '';
    },

    rubezhOtnosheniya() {
      const r = baza.prepare("SELECT znachenie FROM nastrojki WHERE kluch = 'rubezh_otnosheniya'").get();
      if (!r) {
        const e = new Error('dsh-pamyat: рубеж отношений не найден в настройках базы');
        e.code = 'PAMYAT_NET_RUBEZHA_OTN';
        throw e;
      }
      return Number(r.znachenie);
    },

    /**
     * RU: Статус отношения различает NULL до рубежа и NULL после него: механизма не было либо отношение не отмечено. Это ответ о поле, не о смысле записи и не о доступности цели.
     * EN: Relationship status distinguishes NULL before and after the boundary: the mechanism did not exist, or no relationship is recorded. It describes the field, not record meaning or target availability.
     */
    statusOtnosheniya(zapis, rubezh = null) {
      const granica = rubezh === null ? this.rubezhOtnosheniya() : Number(rubezh);
      const id = Number(zapis?.id);
      if (!Number.isFinite(id)) {
        const e = new Error('dsh-pamyat: статус отношения спрошен у записи без id');
        e.code = 'PAMYAT_ZAPIS_BEZ_ID';
        throw e;
      }
      const vid = zapis.otnoshenie;
      const cel = zapis.otnositsya_k;
      if (vid !== null && vid !== undefined) {
        return { status: 'est', vid: String(vid), k: cel === null || cel === undefined ? null : Number(cel),
          stroka: String(vid) + (cel === null || cel === undefined ? '' : ' запись ' + Number(cel)) };
      }
      if (id <= granica) {
        return { status: 'do-protokola', vid: null, k: null, stroka: 'до протокола отношений (механизма ещё не было)' };
      }
      // RU: Оговорка включается в ответ там, где потребитель читает поле.
      // EN: Include the caveat in the response where consumers read the field.
      return { status: 'net', vid: null, k: null,
        stroka: 'отношения нет' + this.ogovorkaPustogoPolya() };
    },

    /**
     * RU: Обратный поиск отменяющих возвращает массив, не первую запись. Пусто означает «не отменена» только выше рубежа; ниже отсутствие отменяющих ничего не доказывает, что названо в stroka.
     * EN: Reverse lookup of cancelling records returns an array, not the first match. Empty means “not cancelled” only above the boundary; below it, no cancellers proves nothing, as stroka states.
     */
    ktoOtmenil(id, rubezh = null) {
      const granica = rubezh === null ? this.rubezhOtnosheniya() : Number(rubezh);
      const n = Number(id);
      if (!Number.isFinite(n)) {
        const e = new Error('dsh-pamyat: отменяющие спрошены у записи без id');
        e.code = 'PAMYAT_ZAPIS_BEZ_ID';
        throw e;
      }
      // RU: Отсутствующая запись даёт отказ, чтобы её отсутствие не слилось с измеренным отсутствием отмены.
      // EN: A missing record yields failure so absence cannot be mistaken for a measured absence of cancellation.
      if (!baza.prepare('SELECT 1 FROM zapisi WHERE id = ?').get(n)) {
        const e = new Error('dsh-pamyat: отменяющие спрошены у записи, которой нет в базе: ' + n);
        e.code = 'PAMYAT_ZAPIS_NE_NAJDENA';
        throw e;
      }
      const ryad = baza.prepare("SELECT id FROM zapisi WHERE otnositsya_k = ? AND otnoshenie = 'otmenyaet' ORDER BY id").all(n);
      const kem = ryad.map((r) => Number(r.id));
      if (kem.length > 0) return { status: 'otmenena', kem, stroka: 'отменена записями: ' + kem.join(', ') };
      if (n <= granica) return { status: 'do-protokola', kem: [], stroka: 'до протокола отношений: отменяющие не отмечались' };
      return { status: 'ne-otmenena', kem: [],
        stroka: 'не отменена' + this.ogovorkaPustogoPolya() };
    },

    /**
     * RU: Единственный писатель otnoshenie/otnositsya_k связывает новую запись id со старой k. Возвращает ustanovleno/uzhe-bylo; нарушение договора явно отказывает с кодом. Не снимает и не переписывает отношение, не судит текст и не пишет журнал — журнал ведёт служба. Изменение утверждения требует новой записи.
     * EN: The sole otnoshenie/otnositsya_k writer relates new record id to old record k. Return ustanovleno/uzhe-bylo; contract violations fail explicitly with a code. It does not remove or overwrite relationships, judge text, or write the journal — the service journals them. Changing a claim requires a new record.
     */
    ustanovitOtnoshenie({ agent, id, vid, k, klassyZnaniy }) {
      const otkazOtn = (code, msg) => { const e = new Error('dsh-pamyat: ' + msg); e.code = code; throw e; };
      if (!Array.isArray(klassyZnaniy) || klassyZnaniy.length === 0) {
        otkazOtn('PAMYAT_OTNOSHENIE_NET_KLASSOV', 'писателю отношения не подан перечень классов знания — сверять не с чем');
      }
      if (!VIDY_OTNOSHENIYA.includes(vid)) {
        otkazOtn('PAMYAT_OTNOSHENIE_VID', 'вид отношения «' + vid + '» неизвестен; допустимы: ' + VIDY_OTNOSHENIYA.join(', '));
      }
      const nId = Number(id), nK = Number(k);
      if (!Number.isSafeInteger(nId) || !Number.isSafeInteger(nK)) {
        otkazOtn('PAMYAT_ZAPIS_BEZ_ID', 'отношение подано без целых id: ' + id + ' → ' + k);
      }
      if (nId <= nK) {
        otkazOtn('PAMYAT_OTNOSHENIE_PORYADOK', 'относится только новая запись к старой: ' + nId + ' → ' + nK +
          (nId === nK ? ' (это одна запись)' : ' (новая старше цели)'));
      }
      const sel = baza.prepare('SELECT id, agent, klass, otnoshenie, otnositsya_k FROM zapisi WHERE id = ?');
      const b = sel.get(nId), a = sel.get(nK);
      if (!b || !a) otkazOtn('PAMYAT_ZAPIS_NE_NAJDENA', 'отношение между записями, одной из которых нет в базе: ' +
        (!b ? nId : '') + (!b && !a ? ', ' : '') + (!a ? nK : ''));
      if (b.agent !== agent || a.agent !== agent) {
        otkazOtn('PAMYAT_OTNOSHENIE_CHUZHOJ', 'отношение возможно только между записями агента ' + agent);
      }
      for (const z of [b, a]) {
        if (!klassyZnaniy.includes(z.klass)) {
          otkazOtn('PAMYAT_OTNOSHENIE_KLASS', 'запись ' + z.id + ' класса «' + z.klass + '» — не знание, отношений не несёт');
        }
      }
      if (vid === 'otmenyaet' && !KLASSY_DEJSTVUYUSHCHIE.includes(a.klass)) {
        otkazOtn('PAMYAT_OTMENA_ZAVERSHENNOGO', 'отменить завершённое нельзя: запись ' + nK + ' класса «' + a.klass +
          '» описывает случившееся — допустимо только utochnyaet');
      }
      if (b.otnoshenie !== null && b.otnoshenie !== undefined) {
        if (b.otnoshenie === vid && Number(b.otnositsya_k) === nK) return { ishod: 'uzhe-bylo', id: nId, vid, k: nK, klass: b.klass };
        otkazOtn('PAMYAT_OTNOSHENIE_KONFLIKT', 'у записи ' + nId + ' уже стоит отношение ' + b.otnoshenie + ' ' +
          b.otnositsya_k + '; переписать нельзя — передумали, пусть новая запись относится к этой');
      }
      // RU: Условие пустого поля находится в UPDATE, защищая от взаимной перезаписи одновременных вызовов.
      // EN: Keep the empty-field condition inside UPDATE to prevent concurrent calls from overwriting each other.
      const r = baza.prepare('UPDATE zapisi SET otnoshenie = ?, otnositsya_k = ? WHERE id = ? AND otnoshenie IS NULL').run(vid, nK, nId);
      if (Number(r.changes) !== 1) {
        otkazOtn('PAMYAT_OTNOSHENIE_KONFLIKT', 'отношение записи ' + nId + ' поставили в тот же миг другой рукой');
      }
      return { ishod: 'ustanovleno', id: nId, vid, k: nK, klass: b.klass };
    },

    rubezhProishozhdeniya() {
      const r = baza.prepare("SELECT znachenie FROM nastrojki WHERE kluch = 'rubezh_proishozhdeniya'").get();
      if (!r) {
        // RU: Отсутствующий рубеж означает непройденную миграцию и отказ. Ноль ошибочно приписал бы всей памяти статус после протокола.
        // EN: A missing boundary means migration has not run and causes failure. Zero would incorrectly assign post-protocol status to all memory.
        const e = new Error('dsh-pamyat: рубеж происхождения не найден в настройках базы — миграция не проходила');
        e.code = 'PAMYAT_NET_RUBEZHA';
        throw e;
      }
      return Number(r.znachenie);
    },

    /**
     * RU: Происхождение возвращается статусом: do-protokola при id ≤ рубежа; ne-ustanovleno выше с пустым полем; uroven при наличии уровня. Слова не дают сравнить отсутствие с числом через null/undefined и получить случайное доверие. Статус не проверяет содержание; старые записи сортируются нейтрально, сохраняя ORDER BY sozdano.
     * EN: Return provenance as a status: do-protokola for id ≤ boundary; ne-ustanovleno above it with an empty field; uroven when a level exists. Named statuses prevent numeric null/undefined comparisons from granting accidental trust. The status does not verify content; old records sort neutrally, preserving ORDER BY sozdano.
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
     * RU: Ниже рубежа уровень происхождения не назначается: старую запись нельзя «отмыть» повторной отметкой. Выше рубежа уровень допускает запись и обновление, поскольку механизм уже существовал.
     * EN: Do not assign a provenance level below the boundary: a new annotation must not launder an old record. Above the boundary, the level may be written and updated because the mechanism already existed.
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
      // RU: Проверить число изменённых строк: успешный UPDATE без совпавшего id ещё не доказывает запись отметки.
      // EN: Check changed-row count: a successful UPDATE with no matching id does not prove the annotation was saved.
      return Number(r.changes) === 1;
    },

    /**
     * RU: Сверка различает est (опора найдена), utrachena (искали, не нашли) и ne-proveryalos (не смотрели). Проверяется наличие границ seq в журнале, не совпадение текста и не истинность знания.
     * EN: Verification distinguishes est (reference found), utrachena (searched but missing), and ne-proveryalos (unchecked). It checks for seq boundaries in the journal, not text equality or knowledge accuracy.
     */
    statusProverki(zapis) {
      const syroe = zapis?.proverka;
      if (syroe === null || syroe === undefined || syroe === '') {
        return { status: 'ne-proveryalos', kogda: null, stroka: 'сверка с опорой не проводилась' };
      }
      let r;
      try { r = typeof syroe === 'string' ? JSON.parse(syroe) : syroe; } catch { r = null; }
      if (!r || typeof r !== 'object' || !r.ishod) {
        // RU: Негодная отметка означает испорченную проверку, не отсутствие проверки.
        // EN: An invalid annotation means a corrupted check, not an absent check.
        return { status: 'otmetka-negodna', kogda: null, stroka: 'отметка сверки не разбирается — писавший ошибся' };
      }
      const podpis = r.ishod === 'est' ? 'опора найдена' : (r.ishod === 'utrachena' ? 'опора УТРАЧЕНА' : String(r.ishod));
      return { status: r.ishod, kogda: r.kogda ?? null, chem: r.chem ?? null, stroka: podpis };
    },

    /**
     * RU: Имя прибора chem обязательно для повторной проверки вывода об опоре. Отказ чтения журнала иначе мог бы выглядеть потерей опоры у всех записей. Рубеж происхождения к сверке наличия журнала не применяется.
     * EN: The instrument name chem is required to reproduce the reference check. Otherwise a journal read failure could look like missing references for every record. The provenance boundary does not apply to journal-presence checks.
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
     * RU: «Не оценивали», «оценили» и «отметка негодна» различаются: негодный список не подменяется чистой историей без оценок.
     * EN: Distinguish “unrated,” “rated,” and “invalid annotation”: an invalid list must not be replaced with a clean unrated history.
     */
    statusVery(zapis) {
      const syroe = zapis?.ocenki;
      if (syroe === null || syroe === undefined || syroe === '') {
        return { status: 'ne-ocenivalos', ocenok: 0, schet: {}, vera: null, stroka: 'веру не измеряли' };
      }
      let spisok;
      try { spisok = typeof syroe === 'string' ? JSON.parse(syroe) : syroe; } catch { spisok = null; }
      if (!Array.isArray(spisok)) {
        return { status: 'otmetka-negodna', ocenok: null, schet: {}, vera: null,
          stroka: 'список оценок не разбирается — писавший ошибся' };
      }
      const schet = {};
      for (const s of spisok) schet[s?.ishod] = (schet[s?.ishod] ?? 0) + 1;
      const vera = veraPoOcenkam(spisok);
      if (vera === null) {
        return { status: 'otmetka-negodna', ocenok: spisok.length, schet, vera: null,
          stroka: 'среди оценок есть исход, которого протокол не знает — вера не считается' };
      }
      const chasti = OCENKI_DOPUSTIMYE.filter((i) => schet[i]).map((i) => i + ' ' + schet[i]);
      return { status: 'ocenivalos', ocenok: spisok.length, schet, vera,
        stroka: 'вера ' + vera + ' по ' + spisok.length + ' оценкам (' + chasti.join(', ') + ')' };
    },

    /**
     * RU: Оценка сохраняет событие с обязательным kem и пересчитывает веру: наблюдения можно предъявить и пересчитать другой формулой. Негодный прежний список не затирается, а вызывает отказ. harmful не удаляет запись; решения use/verify/ignore принадлежат слою выдачи с его порогами.
     * EN: A rating saves an event with required kem and recomputes trust: observations can be inspected and recalculated with another formula. An invalid existing list causes refusal rather than being overwritten. harmful does not delete the record; use/verify/ignore decisions belong to the delivery layer and its thresholds.
     */
    otsenit({ id, ishod, kem, pochemu = null, kogda = Date.now() }) {
      if (!OCENKI_DOPUSTIMYE.includes(ishod)) {
        const e = new Error('dsh-pamyat: исход оценки должен быть одним из ' + OCENKI_DOPUSTIMYE.join(' | ')
          + '; получено ' + JSON.stringify(ishod));
        e.code = 'PAMYAT_OCENKA_NE_TOT_ISHOD';
        throw e;
      }
      if (typeof kem !== 'string' || kem.trim() === '') {
        const e = new Error('dsh-pamyat: не назван оценивающий (kem). Оценка без имени не даёт '
          + 'отличить суждение человека от суждения механизма');
        e.code = 'PAMYAT_OCENKA_BEZ_OCENIVAYUSHCHEGO';
        throw e;
      }
      const nomer = Number(id);
      if (!Number.isInteger(nomer) || nomer <= 0) {
        const e = new Error('dsh-pamyat: опознаватель записи должен быть целым положительным; получено '
          + JSON.stringify(id));
        e.code = 'PAMYAT_OCENKA_NEGODEN_ID';
        throw e;
      }
      baza.exec('BEGIN IMMEDIATE');
      try {
        const stroka = baza.prepare('SELECT id, ocenki FROM zapisi WHERE id = ?').get(nomer);
        if (!stroka) {
          const e = new Error('dsh-pamyat: записи ' + nomer + ' нет — оценивать нечего');
          e.code = 'PAMYAT_OCENKA_ZAPIS_NE_NAJDENA';
          throw e;
        }
        let spisok;
        if (stroka.ocenki === null || stroka.ocenki === undefined || stroka.ocenki === '') {
          spisok = [];
        } else {
          try { spisok = JSON.parse(stroka.ocenki); } catch { spisok = null; }
          if (!Array.isArray(spisok)) {
            const e = new Error('dsh-pamyat: у записи ' + nomer + ' список оценок не разбирается. '
              + 'Он НЕ переписывается: негодную отметку снимают отдельным действием, чтобы след ошибки не пропал');
            e.code = 'PAMYAT_OCENKA_SPISOK_NEGODEN';
            throw e;
          }
        }
        spisok.push({ ishod, kem, kogda, ...(pochemu === null ? {} : { pochemu }) });
        const vera = veraPoOcenkam(spisok);
        baza.prepare('UPDATE zapisi SET ocenki = ?, vera = ? WHERE id = ?')
          .run(JSON.stringify(spisok), vera, nomer);
        baza.exec('COMMIT');
        return { id: nomer, ishod, ocenok: spisok.length, vera };
      } catch (e) {
        try { baza.exec('ROLLBACK'); } catch { /**
         * RU: Повторный ROLLBACK после закрытой транзакции не меняет исход отказа.
         * EN: A repeated ROLLBACK after a closed transaction does not change the failure outcome.
         */ }
        throw e;
      }
    },

    /**
     * RU: Статус подтверждения читает пару полей и различает auto, запись без спроса, позднее одобрение и негодную отметку. Позднее одобрение не снимает факт прежней неподтверждённой записи: bez_podtverzhdeniya остаётся единицей.
     * EN: Approval status reads both fields and distinguishes auto, writing without approval, later approval, and an invalid annotation. Later approval does not erase the historical unapproved write: bez_podtverzhdeniya stays one.
     */
    statusPodtverzhdeniya(zapis) {
      const flag = Number(zapis?.bez_podtverzhdeniya ?? zapis?.bezPodtverzhdeniya ?? 0) === 1;
      const syroe = zapis?.podtverzhdenie;
      const est = !(syroe === null || syroe === undefined || syroe === '');
      if (!flag && !est) {
        return { status: 'ne-trebovalos', kem: null, kogda: null,
          stroka: 'подтверждения не требовалось (класс шёл как auto либо человек был спрошен при записи)' };
      }
      if (!flag && est) {
        // RU: Подпись при отсутствии требуемого спроса — отдельный негодный исход, а не подтверждение проверки, которой не было.
        // EN: A signature on a record requiring no approval is a distinct invalid outcome, not proof of a check that never happened.
        return { status: 'otmetka-lishnyaya', kem: null, kogda: null,
          stroka: 'у записи есть отметка подтверждения, хотя подтверждения не требовалось — отметку поставили не по протоколу' };
      }
      if (!est) {
        return { status: 'bez-podtverzhdeniya', kem: null, kogda: null,
          stroka: 'записано без подтверждения человеком — отвечающего на узле не было' };
      }
      let otmetka;
      try { otmetka = typeof syroe === 'string' ? JSON.parse(syroe) : syroe; } catch { otmetka = null; }
      if (!otmetka || typeof otmetka !== 'object' || typeof otmetka.kem !== 'string' || otmetka.kem.trim() === '') {
        return { status: 'otmetka-negodna', kem: null, kogda: null,
          stroka: 'отметка подтверждения не разбирается либо не называет подтвердившего — писавший ошибся' };
      }
      return { status: 'podtverzhdeno-pozzhe', kem: otmetka.kem, kogda: otmetka.kogda ?? null,
        stroka: 'записано без подтверждения, подтверждено позже: ' + otmetka.kem
          + (typeof otmetka.kogda === 'number' ? ' (' + new Date(otmetka.kogda).toISOString().slice(0, 10) + ')' : '') };
    },

    /**
     * RU: Позднее подтверждение сохраняет id, оценки и касания. kem обязателен; подтвердить можно только запись с флагом ожидания, без прежней или негодной отметки. Метод не снимает bez_podtverzhdeniya, не меняет веру и не проверяет, человек ли kem. Сам не вызывается: ручной src/podtverdit-znanie.mjs, без инструмента модели.
     * EN: Later approval preserves id, ratings, and touches. kem is required; only a record flagged as awaiting approval, with no previous or invalid annotation, is eligible. The method retains bez_podtverzhdeniya, leaves trust unchanged, and cannot verify that kem is human. It does not run automatically: use the manual src/podtverdit-znanie.mjs, with no model tool.
     */
    podtverdit({ id, kem, pochemu = null, kogda = Date.now() }) {
      if (typeof kem !== 'string' || kem.trim() === '') {
        const e = new Error('dsh-pamyat: не назван подтвердивший (kem). Подпись без имени не даёт '
          + 'отличить одобрение человека от отметки механизма');
        e.code = 'PAMYAT_PODTVERZHDENIE_BEZ_IMENI';
        throw e;
      }
      const nomer = Number(id);
      if (!Number.isInteger(nomer) || nomer <= 0) {
        const e = new Error('dsh-pamyat: опознаватель записи должен быть целым положительным; получено '
          + JSON.stringify(id));
        e.code = 'PAMYAT_PODTVERZHDENIE_NEGODEN_ID';
        throw e;
      }
      baza.exec('BEGIN IMMEDIATE');
      try {
        const stroka = baza.prepare('SELECT id, bez_podtverzhdeniya, podtverzhdenie FROM zapisi WHERE id = ?').get(nomer);
        if (!stroka) {
          const e = new Error('dsh-pamyat: записи ' + nomer + ' нет — подтверждать нечего');
          e.code = 'PAMYAT_PODTVERZHDENIE_ZAPIS_NE_NAJDENA';
          throw e;
        }
        if (Number(stroka.bez_podtverzhdeniya) !== 1) {
          const e = new Error('dsh-pamyat: запись ' + nomer + ' подтверждения НЕ ждала (флаг 0). '
            + 'Отметка не ставится: подпись там, где не спрашивали, читается как проверка, которой не было');
          e.code = 'PAMYAT_PODTVERZHDENIE_NE_TREBOVALOS';
          throw e;
        }
        const syroe = stroka.podtverzhdenie;
        if (!(syroe === null || syroe === undefined || syroe === '')) {
          let prezhnyaya;
          try { prezhnyaya = JSON.parse(syroe); } catch { prezhnyaya = null; }
          if (prezhnyaya && typeof prezhnyaya.kem === 'string') {
            const e = new Error('dsh-pamyat: запись ' + nomer + ' уже подтверждена (' + prezhnyaya.kem
              + '). Второй подтвердивший НЕ затирает первого');
            e.code = 'PAMYAT_PODTVERZHDENIE_UZHE_EST';
            throw e;
          }
          const e = new Error('dsh-pamyat: у записи ' + nomer + ' отметка подтверждения не разбирается. '
            + 'Она НЕ переписывается: негодную отметку снимают отдельным действием, чтобы след ошибки не пропал');
          e.code = 'PAMYAT_PODTVERZHDENIE_OTMETKA_NEGODNA';
          throw e;
        }
        const otmetka = { kem, kogda, ...(pochemu === null ? {} : { pochemu }) };
        baza.prepare('UPDATE zapisi SET podtverzhdenie = ? WHERE id = ?')
          .run(JSON.stringify(otmetka), nomer);
        baza.exec('COMMIT');
        return { id: nomer, kem, kogda };
      } catch (e) {
        try { baza.exec('ROLLBACK'); } catch { /**
         * RU: Повторный ROLLBACK после закрытой транзакции не меняет исход отказа.
         * EN: A repeated ROLLBACK after a closed transaction does not change the failure outcome.
         */ }
        throw e;
      }
    },

    /**
     * RU: Касание учитывает выдачу агенту или повтор знания по суду; поиск, приборы, экспорт, дистилляция и стенды не считаются. Обязательный повод проверяет один словарь. Отказ UPDATE возвращает {otmecheno, otkaz} и объявляется, не ломая уже состоявшуюся выдачу. Меняются kasanij/poslednee_kasanie и только при выдаче poslednyaya_vydacha, не proishozhdenie/proverka. Счётчик смешивает оба повода; повтор различим по журналу производителя. При весе 0 порядок не меняется; включение веса требует отдельного решения о повторах.
     * EN: Touches count agent delivery or knowledge repeated by judgment; search, inspection tools, export, distillation, and tests do not count. One dictionary validates the required reason. UPDATE failure returns {otmecheno, otkaz} and is reported without breaking an already completed delivery. Change kasanij/poslednee_kasanie and, only for delivery, poslednyaya_vydacha; leave proishozhdenie/proverka intact. The counter combines both reasons; producer logs distinguish repetition. With weight 0, order stays unchanged; enabling weight requires a separate decision about repetitions.
     */
    otmetitKasanie({ ids, povod, kogda = Date.now() }) {
      const POVOD_VYDACHA = 'vydacha-agentu';
      // RU: povtor-sudom — второй допустимый повод: знание снова пришло, а не было прочитано прибором.
      // EN: povtor-sudom is the second allowed reason: knowledge arrived again rather than being read by an inspection tool.
      const POVODY = [POVOD_VYDACHA, 'povtor-sudom'];
      if (!POVODY.includes(povod)) {
        const e = new Error('dsh-pamyat: касание отмечается только с поводом ' + POVODY.map((x) => '«' + x + '»').join(' или ')
          + '; получено ' + JSON.stringify(povod) + '. Чтение прибором, вывоз и стенды касанием НЕ являются');
        e.code = 'PAMYAT_KASANIE_NE_TOT_POVOD';
        throw e;
      }
      // RU: Один id учитывается один раз в переданном списке, даже если встретился в выдаче несколько раз. Дедупликация внутри хранилища не зависит от того, как вызывающий собрал список.
      // EN: Count each id once in the supplied list, even if it appeared several times in delivery. Storage deduplication does not depend on how callers assembled the list.
      const spisok = [...new Set((Array.isArray(ids) ? ids : [ids])
        .map(Number).filter((n) => Number.isInteger(n) && n > 0))];
      // RU: Пустой список — штатный пустой отбор, не отказ.
      // EN: An empty list is a valid empty selection, not a failure.
      if (spisok.length === 0) return { otmecheno: 0, otkaz: null };
      try {
        // RU: Только vydacha-agentu меняет poslednyaya_vydacha; povtor-sudom не создаёт новую выдачу для оценки.
        // EN: Only vydacha-agentu changes poslednyaya_vydacha; povtor-sudom does not create a new rateable delivery.
        const st = povod === POVOD_VYDACHA
          ? baza.prepare('UPDATE zapisi SET kasanij = kasanij + 1, poslednee_kasanie = ?, poslednyaya_vydacha = ? WHERE id = ?')
          : baza.prepare('UPDATE zapisi SET kasanij = kasanij + 1, poslednee_kasanie = ? WHERE id = ?');
        let n = 0;
        for (const id of spisok) n += Number((povod === POVOD_VYDACHA ? st.run(kogda, kogda, id) : st.run(kogda, id)).changes);
        return { otmecheno: n, otkaz: null };
      } catch (prichina) {
        const otkaz = {
          code: 'PAMYAT_KASANIE_NE_ZAPISANO',
          pochemu: prichina_stroka(prichina),
          zaprosheno: spisok.length,
        };
        // RU: Отказ объявляется журналом и stderr: журнал в той же базе может быть недоступен по причине самого отказа UPDATE.
        // EN: Report failure through the journal and stderr: a journal in the same database may be unavailable for the same reason UPDATE failed.
        try {
          baza.prepare('INSERT INTO zhurnal (kogda, agent, klass, ishod, priroda, pochemu, istochnik)'
            + ' VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(kogda, 'pamyat', 'kasanie', 'otkloneno', otkaz.code, otkaz.pochemu, null);
        } catch { /**
         * RU: Запись журнала может отказать вместе с записью касания в той же базе.
         * EN: The journal write may fail together with the touch write in the same database.
         */ }
        try {
          console.error('[dsh-pamyat] касание НЕ записано (' + otkaz.code + '): ' + otkaz.pochemu
            + '. Выдача агенту состоялась и не отменяется; счёт касаний за этот отбор потерян.');
        } catch { /**
         * RU: Ошибка печати отказа не должна ломать выдачу.
         * EN: A failure-output error must not break delivery.
         */ }
        return { otmecheno: 0, otkaz };
      }
    },

    /**
     * RU: Ближайшая запись того же агента и класса возвращается как sravneno с числом и sravneno_s; пустой класс — ne-s-chem; отсутствие слов длиннее трёх — sravnit-nechem. Метод не выбирает merged/blocked и не отвергает. Окно последних skolko ограничивает стоимость и объявляется в ответе; отсутствие близкого внутри окна не означает отсутствие во всей памяти.
     * EN: Return the nearest record of the same agent and class as sravneno with a score and sravneno_s; an empty class yields ne-s-chem; no words longer than three letters yields sravnit-nechem. The method chooses no merged/blocked outcome and rejects nothing. The latest-skolko window bounds cost and is reported; no close match within it does not mean none exists in all memory.
     */
    blizhajshaya({ agent, klass, soderzhim, skolko = 200 }) {
      if (!agent || !klass) {
        const e = new Error('dsh-pamyat: поиск ближайшей записи без обязательных полей (agent, klass)');
        e.code = 'PAMYAT_NEPOLNYJ_ZAPROS';
        throw e;
      }
      const svoi = blizost(soderzhim, soderzhim);
      if (svoi === null) return { ishod: 'sravnit-nechem', sravneno_s: 0 };
      const rows = baza.prepare(
        'SELECT id, soderzhim, sozdano FROM zapisi WHERE agent = ? AND klass = ? AND vychishcheno IS NULL ORDER BY sozdano DESC LIMIT ?'
      ).all(agent, klass, skolko);
      if (rows.length === 0) return { ishod: 'ne-s-chem', sravneno_s: 0 };
      let luchshaya = null;
      for (const r of rows) {
        const b = blizost(soderzhim, r.soderzhim);
        if (b === null) continue;
        if (luchshaya === null || b > luchshaya.blizost) luchshaya = { id: Number(r.id), blizost: b, sozdano: Number(r.sozdano) };
      }
      // RU: Если у всех соседей нет сравнимых слов, назвать размер окна: это не пустой класс.
      // EN: If every neighbor lacks comparable words, report the window size: the class is not empty.
      if (luchshaya === null) return { ishod: 'sravnit-nechem', sravneno_s: rows.length };
      return { ishod: 'sravneno', id: luchshaya.id, blizost: luchshaya.blizost, sravneno_s: rows.length };
    },

    /**
     * RU: Кандидаты отмены — до skolko действующих записей отменяемых классов, пересечённых с переданными. Уже отменённые исключены; сортировка по убыванию близости с классом, временем, источником и текстом. Метод не пишет и не судит: решение принимает модель, отношение ставит ustanovitOtnoshenie. Мера считает слова, не смысл; перефраз может не попасть в окно последних okno.
     * EN: Cancellation candidates are up to skolko active records in cancellable classes intersected with the supplied classes. Exclude records already cancelled; sort by descending similarity with class, time, source, and text. This method neither writes nor judges: the model decides, and ustanovitOtnoshenie sets the relationship. The measure counts words, not meaning; a paraphrase may be missed in the latest-okno window.
     */
    blizhajshieDejstvuyushchie({ agent, klassy, soderzhim, skolko = 3, okno = 200 }) {
      if (!agent) {
        const e = new Error('dsh-pamyat: поиск действующих записей без агента');
        e.code = 'PAMYAT_NEPOLNYJ_ZAPROS';
        throw e;
      }
      const kl = (Array.isArray(klassy) ? klassy : KLASSY_DEJSTVUYUSHCHIE).filter((k) => KLASSY_DEJSTVUYUSHCHIE.includes(k));
      if (kl.length === 0) return { ishod: 'ne-s-chem', spisok: [], sravneno_s: 0 };
      if (blizost(soderzhim, soderzhim) === null) return { ishod: 'sravnit-nechem', spisok: [], sravneno_s: 0 };
      const rows = baza.prepare(
        'SELECT z.id, z.klass, z.soderzhim, z.sozdano, z.istochnik FROM zapisi z WHERE z.agent = ? AND z.klass IN ('
        + kl.map(() => '?').join(', ') + ") AND z.vychishcheno IS NULL AND NOT EXISTS (SELECT 1 FROM zapisi o WHERE o.otnositsya_k = z.id AND o.otnoshenie = 'otmenyaet')"
        + ' ORDER BY z.sozdano DESC LIMIT ?'
      ).all(agent, ...kl, okno);
      if (rows.length === 0) return { ishod: 'ne-s-chem', spisok: [], sravneno_s: 0 };
      const spisok = rows
        .map((r) => ({ id: Number(r.id), klass: r.klass, blizost: blizost(soderzhim, r.soderzhim), sozdano: Number(r.sozdano),
                       istochnik: r.istochnik ?? null, soderzhim: r.soderzhim }))
        .filter((x) => x.blizost !== null && x.blizost > 0)
        .sort((a, b) => b.blizost - a.blizost)
        .slice(0, skolko);
      return { ishod: 'sravneno', spisok, sravneno_s: rows.length };
    },

    /**
     * RU: Счёт записей агента для наблюдаемости и стендов.
     * EN: Count agent records for observability and tests.
     */
    skolkoZapisej(agent) {
      return Number(baza.prepare('SELECT count(*) AS n FROM zapisi WHERE agent = ?').get(agent).n);
    },
    zakryt() { baza.close(); },
  };
}
