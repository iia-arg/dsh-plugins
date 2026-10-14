// RU: dsh-pamyat-kompakt — механизм компакта (сжатия контекста) агента, вынесенный из шлюза подписки в
//     отдельный модуль памяти.
//     Зачем отдельно: промт сводки, правила сводки, обрезка журнала сессии и возврат сводки в контекст — это
//     работа с ПАМЯТЬЮ агента, а не забота шлюза. Шлюз считает токены и знает МОМЕНТ; что делать в этот момент
//     — знает этот модуль. В шлюзе остаются только импорт и вызовы.
//     Граница: модуль НЕ решает, когда компакт нужен — это решает зовущий по своему счётчику. Молчание модуля
//     значит «не звали», а не «компакт не понадобился».
//     Самопроверка: KOMPAKT_SAMOPROVERKA=1 node index.mjs (нужны ключ модели сводки и файл D, иначе часть проб
//     слепа).
// EN: dsh-pamyat-kompakt — the agent's compaction (context compression) mechanism, moved out of the
//     subscription gateway into a separate memory module.
//     Why separate: the summary prompt, summary rules, session-log trimming and putting the summary back into
//     context are work on the agent's MEMORY, not the gateway's concern. The gateway counts tokens and knows
//     the MOMENT; this module knows what to do at that moment. Only the import and the calls stay in the
//     gateway.
//     Boundary: the module does NOT decide WHEN compaction is needed — the caller decides by its own counter.
//     Silence from the module means "not called", not "compaction was not needed".
//     Self-check: KOMPAKT_SAMOPROVERKA=1 node index.mjs (needs the summary-model key and a D file; otherwise
//     part of the probes are blind).
import { chitatPorogD } from "./porogi.mjs";
import { KATALOG_D_PO_UMOLCHANIYU, chitatRazmeschenie, podstavitTeksty } from "./tekstovye-nastrojki.mjs";
import { randomUUID } from "node:crypto";
import * as fsK from "node:fs";
import * as pathK from "node:path";
import { createRequire as createRequireK } from "node:module";

// RU: ── Модуль называет свою версию в каждой строке журнала ──
//     Зачем: предмет, не называющий версию, невидим приборам — его молчание неотличимо от отсутствия. Без этого
//     вопрос «какой код держит процесс» приходилось решать косвенно, сравнивая время файла на диске со временем
//     старта службы.
//     Почему версия читается ОДИН раз, при загрузке: нужна версия кода, который в памяти, а не того, что сейчас
//     на диске. Ленивое чтение после обновления пакета заставило бы старый процесс называть НОВЫЙ номер —
//     соврать ровно в том случае, ради которого строка заведена.
//     Не прочиталось — печатаем «версия неизвестна» и не подставляем последнюю известную: подставленный номер
//     утверждал бы то, чему код может не соответствовать.
// EN: ── The module names its version in every log line ──
//     Why: a component that does not name its version is invisible to instruments — its silence is
//     indistinguishable from absence. Without it, "which code does this process hold" had to be answered
//     indirectly, by comparing the file time on disk with the service start time.
//     Why the version is read ONCE, at load time: we need the version of the code in memory, not of the file
//     currently on disk. Lazy reading after a package update would make an old process report the NEW number —
//     lying in exactly the case the line exists for.
//     If it cannot be read we print "версия неизвестна" (version unknown) and never substitute the last known
//     one: a substituted number would claim something the code may not match.
const VERSIYA = (() => {
  try { return createRequireK(import.meta.url)("./package.json").version ?? "версия неизвестна" }
  catch { return "версия неизвестна" }
})();

// RU: ── Физический компакт своей моделью ──
//     Почему не встроенная компакция платформы: там сводка и урезание истории неделимы, вход сводки ничем не
//     ограничен, а промт требует полной структуры без предела длины. С «думающей» моделью рассуждение съедает
//     потолок вывода, сводка обрывается на полуслове, урезания не происходит, и контекст растёт без конца
//     (наблюдалось: 6 обрывов подряд, каскад сжатий).
//     Почему не хуком: у PreCompact-хука Claude Agent SDK нет выходного поля для сводки — подставить свою он не
//     может. Поэтому SDK сам не компактит: сводку делает наша модель, а файл сессии ПЕРЕПИСЫВАЕТСЯ физически;
//     SDK читает уже переписанный.
//     Две границы, обе наши: вход — стенограмма не длиннее KOMPAKT_VHOD знаков (0 = без предела); выход — объём
//     просится словами в промте, а не обрезается кодом; потолок токенов считается от остатка окна. Поэтому
//     обрыв на полуслове по построению невозможен. (Переменная KOMPAKT_VYHOD объявлена, но кодом не
//     используется.)
// EN: ── Physical compaction with our own model ──
//     Why not the platform's built-in compaction: there, summarising and trimming the history are one
//     indivisible step, the summary input is unbounded, and the prompt demands a full structure with no length
//     limit. With a "thinking" model the reasoning eats the output ceiling, the summary is cut mid-word, no
//     trimming happens and the context grows forever (observed: 6 truncations in a row, a cascade of
//     compactions).
//     Why not a hook: the Claude Agent SDK PreCompact hook has no output field for a summary — it cannot
//     substitute ours. So the SDK is never allowed to compact by itself: our model writes the summary and the
//     session file is PHYSICALLY rewritten; the SDK reads the rewritten file.
//     Two limits, both ours: input — the transcript is at most KOMPAKT_VHOD characters (0 = unlimited); output
//     — the size is requested in words inside the prompt, not cut by code; the token ceiling is derived from
//     the remaining window. A cut mid-word is therefore impossible by construction. (The KOMPAKT_VYHOD variable
//     is declared but not used by the code.)

// RU: ── Настройка на агента ──
//     Порог задаётся ДОЛЕЙ окна, а не числом токенов: сменится модель — порог переедет сам; число токенов при
//     смене модели молча становится неверным и выглядит прежним.
//     Старшинство источников: окружение > файл агента (D) > умолчание модуля. Окружение старше, чтобы перебить
//     значение на один прогон, не правя файл.
//     Для названного агента (KOMPAKT_AGENT задан) файл D обязателен: нет или не читается — отказ импорта.
//     Импорт без KOMPAKT_AGENT (диагностика общих функций) работает на умолчаниях.
// EN: ── Per-agent settings ──
//     The threshold is a SHARE of the window, not a token count: change the model and the threshold moves with
//     it; a token count silently becomes wrong after a model change while looking unchanged.
//     Source precedence: environment > agent file (D) > module default. The environment wins so a value can be
//     overridden for one run without editing the file.
//     For a named agent (KOMPAKT_AGENT set) the D file is mandatory: missing or unreadable means the import
//     fails. Import without KOMPAKT_AGENT (diagnostics of shared functions) runs on defaults.
const KOMPAKT_AGENT = process.env.KOMPAKT_AGENT ?? "";
function chitatNastrojku(imya) {
  const bazovaya = { model: "deepseek-flash", hvostStrok: 30, razmyshleniya: false,
    adres: "https://api.deepseek.com/v1/chat/completions",
    imenaKlyucha: ["KOMPAKT_API_KEY", "DEEPSEEK_API_KEY", "GATEWAY_API_KEY"] };
// RU: В настройке хранятся адрес и ИМЕНА переменных окружения с ключом — никогда сами значения ключей.
//     Переключатели компакта в базовую настройку НЕ кладём: агент без шлюза не должен получить ложное «шлюзовой
//     компакт включён». Нет ни в файле, ни в окружении — значение НЕ ОБЪЯВЛЕНО.
// EN: The settings hold the endpoint and the NAMES of environment variables carrying the key — never key
//     values.
//     Compaction switches are NOT put into the base settings: an agent without a gateway must not get a false
//     "gateway compaction enabled". Absent from both file and environment means the value is NOT DECLARED.
  if (!imya) { console.error(`[kompakt ${VERSIYA}] имя агента НЕ ЗАДАНО (KOMPAKT_AGENT) — умолчания модуля`); return bazovaya; }
  // RU: Граница имени агента, вписанная в код. Имя идёт в ПУТЬ, а каталог настроек общий для всех агентов узла.
  //     Без проверки KOMPAKT_AGENT=../../../etc/passwd увёл бы чтение из каталога (path.join даёт
  //     «/etc/passwd.json» вне каталога). Читается только файл своего имени: латинские буквы, цифры, дефис,
  //     подчёркивание — и ничего больше.
  // EN: The agent-name boundary is written into the code. The name goes into a PATH, and the settings directory
  //     is shared by all agents on the host. Without this check KOMPAKT_AGENT=../../../etc/passwd would lead
  //     the read out of the directory (path.join yields "/etc/passwd.json" outside it). Only the agent's own
  //     file is read: Latin letters, digits, hyphen, underscore — nothing else.
  if (!/^[A-Za-z0-9_-]+$/.test(imya)) {
    console.error(`[kompakt ${VERSIYA}] 🔴 имя агента НЕГОДНО (${imya}) — допустимы A-Z a-z 0-9 _ - ; умолчания модуля`);
    return bazovaya;
  }
  // RU: Единственный источник настройки — внешний файл D <каталог>/<агент>.json; копия настройки внутри пакета
  //     больше не читается.
  // EN: The only settings source is the external D file <dir>/<agent>.json; a settings copy inside the package
  //     is no longer read.
  const KATALOG_VNESHNIJ = process.env.KOMPAKT_NASTROJKI_KATALOG || KATALOG_D_PO_UMOLCHANIYU;
  const put = pathK.join(KATALOG_VNESHNIJ, imya + ".json");
  let tekst;
  try {
    tekst = fsK.readFileSync(put, "utf-8");
  } catch (e) {
    const vid = e?.code === "ENOENT" ? "НЕ НАЙДЕНА" : "НЕ ПРОЧИТАНА";
    throw new Error(`[kompakt ${VERSIYA}] настройка агента ${imya} ${vid} (${put}): ${e?.code ?? e?.message} — отказ; восстановите внешний D`);
  }
  try {
    const f = JSON.parse(tekst);
    // RU: Печатается ИСТОЧНИК, а не только значение. Значения из файла и умолчания могут совпадать — тогда
    //     проба по значению зелена при обоих исходах и не проверяет ничего. Различитель живёт в ФОРМАТЕ строки:
    //     слово «ВНЕШНЯЯ» и путь.
    // EN: The SOURCE is printed, not only the value. File and default values may coincide — then a value-based
    //     probe is green in both outcomes and checks nothing. The distinguisher lives in the line FORMAT: the
    //     word "ВНЕШНЯЯ" (external) and the path.
    console.error(`[kompakt ${VERSIYA}] настройка агента ${imya}: ВНЕШНЯЯ (${put})`);
    // RU: Доля и окно ПОРОГА в этом файле больше не живут (их хозяин — пресет агента платформы). Найдены старые
    //     поля — печатается «устарело» и они игнорируются.
    // EN: The THRESHOLD share and window no longer live in this file (their owner is the agent's platform
    //     preset). If old fields are found, "устарело" (obsolete) is printed and they are ignored.
    for (const [pole, chto] of [["dolyaPoroga", "доля порога берётся из ПРЕСЕТА агента"], ["kompaktPlatformennyj", "рубильник платформенного — compaction-basic в ПРЕСЕТЕ"], ["dolyaPorogaPlatformy", "ручная копия доли пресета — не нужна"]])
      if (Object.hasOwn(f, pole)) console.error(`[kompakt ${VERSIYA}] настройка агента ${imya}: поле ${pole} УСТАРЕЛО и игнорируется — ${chto}`);
    // RU: _izFajla — перечень ключей, ПРИШЕДШИХ ИЗ ФАЙЛА. Без него «значение из файла» и «значение по
    //     умолчанию» неразличимы, когда они равны.
    // EN: _izFajla lists the keys that CAME FROM THE FILE. Without it "value from the file" and "default value"
    //     are indistinguishable when they are equal.
    return { ...bazovaya, ...f, _izFajla: Object.keys(f) };
  } catch (e) {
    throw new Error(`[kompakt ${VERSIYA}] ВНЕШНЯЯ настройка ${imya} НЕ РАЗОБРАНА (${put}): ${e?.message} — отказ`);
  }
}
const NASTROJKA = chitatNastrojku(KOMPAKT_AGENT);
// RU: От чьего лица пишется сводка — из настройки агента (поле imya), а не зашитое в код имя. Раньше общий
//     промт называл одним именем всех агентов, и после компакта агент читал о себе под чужим именем.
//     Имя берётся из внешнего файла D. Поля нет или оно негодно (одно слово с заглавной буквы, до 31 буквы) —
//     пишем нейтрально «от лица агента»: нейтральное лучше чужого. Выводить имя из латинского KOMPAKT_AGENT не
//     будем.
// EN: Whose voice the summary is written in comes from the agent settings (field imya), not from a name
//     hard-coded in the code. Previously the shared prompt gave all agents one name, and after compaction an
//     agent read about itself under someone else's name.
//     The name is taken from the external D file. If the field is missing or invalid (one capitalised word, up
//     to 31 letters) we write neutrally "on behalf of the agent": neutral is better than wrong. We do not
//     derive a name from the Latin KOMPAKT_AGENT.
const IMYA_AGENTA = (typeof NASTROJKA.imya === "string" && /^[А-ЯЁA-Z][а-яёa-z]{1,30}$/u.test(NASTROJKA.imya.trim()))
  ? NASTROJKA.imya.trim() : null;
const OT_LICA = IMYA_AGENTA ? `от лица персонального AI-ассистента по имени ${IMYA_AGENTA}` : "от лица агента";
console.error(`[kompakt ${VERSIYA}] имя для сводки: ${OT_LICA}` + (IMYA_AGENTA ? "" : NASTROJKA.imya === undefined
  ? " (поля imya в настройке агента нет)" : ` (имя в настройке НЕГОДНО: ${String(NASTROJKA.imya).slice(0, 40)})`));

// RU: ── Откуда взято значение ──
//     Старшинство: окружение > файл агента > умолчание модуля. Источник возвращается ВМЕСТЕ со значением, и это
//     не украшение: поля model и hvostStrok в файле были равны умолчаниям кода, поэтому строка «модель …»
//     выходила одинаковой и когда настройка доехала, и когда файл не открылся вовсе. Признак, дающий одно
//     значение при обоих исходах, ничего не проверяет. Различитель — в формате печати, а не в данных: уборка
//     значений его не уносит.
// EN: ── Where a value came from ──
//     Precedence: environment > agent file > module default. The source is returned TOGETHER with the value,
//     and this is not decoration: the model and hvostStrok fields in the file equalled the code defaults, so
//     the "model …" line looked the same whether the settings arrived or the file never opened. A sign giving
//     one value in both outcomes checks nothing. The distinguisher lives in the print format, not in the data:
//     cleaning values up does not remove it.
function otkuda(imyaEnv, klyuch, umolchanie) {
  const izOkr = imyaEnv ? process.env[imyaEnv] : undefined;
  if (izOkr !== undefined && izOkr !== '') return { z: izOkr, ist: 'окружение ' + imyaEnv };
  const vzyatIzFajla = Array.isArray(NASTROJKA._izFajla) && NASTROJKA._izFajla.includes(klyuch);
  const v = NASTROJKA[klyuch];
  if (vzyatIzFajla && v !== undefined && v !== null) return { z: v, ist: 'настройка' };
  // RU: null в файле — осознанное «у меня этого нет», а не пропуск: берётся умолчание модуля, и источник
  //     говорит об этом прямо.
  // EN: null in the file is a deliberate "I do not have this", not an omission: the module default is used, and
  //     the source says so explicitly.
  if (vzyatIzFajla && v === null) return { z: umolchanie, ist: 'настройка сказала null — умолчание модуля' };
  return { z: umolchanie, ist: 'умолчание модуля' };
}
// RU: Совместимый с шлюзом API порога. Числа уже вычислены сборщиком настроек и лежат в D (porogi); здесь они
//     только читаются.
// EN: Gateway-compatible threshold API. The numbers are already computed by the settings builder and stored in
//     D (porogi); here they are only read.
export function porogIzPreseta(imya = KOMPAKT_AGENT, route = null) {
  const p = chitatPorogD(imya, route);
  if (p.prichina) return p;
  return { porog: p.nominalThreshold, dolya: p.ratio, okno: p.window,
    provider: p.provider, model: p.model, routeSource: p.routeSource, thresholdKind: "nominal",
    otkudaDolya: `${p.path} (${p.routeSource}, номинальный)`, otkudaOkno: `${p.path} (${p.provider}/${p.model})` };
}
// RU: Ручные перебивы порога окружением несовместимы с готовым D — их не принимаем молча, а отказываем.
// EN: Manual threshold overrides via environment are incompatible with a precomputed D — they are refused, not
//     silently accepted.
for (const key of ["KOMPAKT_DOLYA", "KOMPAKT_OKNO", "KOMPAKT_POROG"]) {
  if (process.env[key]) throw new Error(`${key}: порог задаётся сборкой porogi в D, перебив не поддерживается`);
}
const POROG_PRESETA = porogIzPreseta();
if (POROG_PRESETA.porog === undefined)
  console.error(`[kompakt ${VERSIYA}] 🔴 порог из пресета НЕ ПРОЧИТАН: ${POROG_PRESETA.prichina} — ступени и «занято из порога» не считаются (не умолчание)`);
else console.error(`[kompakt ${VERSIYA}] порог ${POROG_PRESETA.porog} = окно ${POROG_PRESETA.okno} (${POROG_PRESETA.otkudaOkno}) × доля ${POROG_PRESETA.dolya} (готовый D ${POROG_PRESETA.otkudaDolya}; номинальный, не effective)`);
// RU: Номинальные числа порога уже вычислены в D; окно модели сводки (сумматора) ниже — отдельный договор.
// EN: Nominal threshold numbers are already computed in D; the summariser model window below is a separate
//     contract.
const KOMPAKT_DOLYA = POROG_PRESETA.dolya;
// RU: Сверка двух порогов: шлюзового (dolyaPoroga) и платформенного (thresholdRatio пресета). Они жили в двух
//     файлах и свести их было нельзя — поэтому расхождение печаталось громко.
//     Граница, названная вслух: платформенный порог модулю НЕДОСТУПЕН. dolyaPorogaPlatformy — ручная копия
//     числа из пресета; согласие копии с копией — не согласие с предметом, поэтому слово «совпали» не
//     печатается ни при каком значении.
//     Печать безусловна: прежняя редакция при умолчаниях не печатала ничего, и сторож молчал при живом
//     расхождении. Живость механизма — часть сверки: при погашенном шлюзовом компакте его порог — мёртвое
//     число, и красная строка кричала бы каждый подъём; сторож, кричащий всегда, неотличим от сломанного. Такое
//     законное состояние печатается, но не красным.
// EN: Reconciliation of two thresholds: the gateway one (dolyaPoroga) and the platform one (preset
//     thresholdRatio). They lived in two files and could not be unified — so a mismatch was printed loudly.
//     Stated boundary: the platform threshold is NOT ACCESSIBLE to the module. dolyaPorogaPlatformy is a manual
//     copy of the preset number; a copy agreeing with a copy is not agreement with the subject, so the word
//     "matched" is never printed for any value.
//     Printing is unconditional: an earlier version printed nothing on defaults, and the guard was silent while
//     a real mismatch existed. Mechanism liveness is part of the check: with gateway compaction switched off
//     its threshold is a dead number, and a red line would shout at every start; a guard that always shouts is
//     indistinguishable from a broken one. That legitimate state is printed, but not in red.
export function svodkaPorogov(shlyuzovoj, platformennyj, shlyuzovojZhiv) {
  if (platformennyj === undefined) {
    return `[kompakt ${VERSIYA}] пороги: шлюзовой ${shlyuzovoj} · платформенный НЕ ОБЪЯВЛЕН (источник — пресет платформы, модулю недоступен)${shlyuzovojZhiv === false ? ' · шлюзовой НЕ ПРИМЕНЯЕТСЯ: шлюзовой компакт погашен' : ''}`;
  }
  if (shlyuzovojZhiv === false) {
    return `[kompakt ${VERSIYA}] пороги: платформенный ${platformennyj} (ручная копия, источник — пресет платформы, модулю недоступен) · шлюзовой ${shlyuzovoj} НЕ ПРИМЕНЯЕТСЯ: шлюзовой компакт погашен, сверять нечего`;
  }
  if (platformennyj !== shlyuzovoj) {
    return `[kompakt ${VERSIYA}] 🔴 РАСХОЖДЕНИЕ ПОРОГОВ: шлюзовой ${shlyuzovoj} · платформенный ${platformennyj} по РУЧНОЙ КОПИИ — сверь внешний D и вложенный пресет профиля`;
  }
  return `[kompakt ${VERSIYA}] пороги: шлюзовой ${shlyuzovoj} · платформенный ${platformennyj} НЕ ПРОВЕРЕН (ручная копия, источник — пресет платформы, модулю недоступен)`;
}
// RU: svodkaPorogov() больше не вызывается: доля теперь одна (из пресета), сверять две копии нечего. Функция и
//     её стенд stend-svodki-porogov оставлены до отдельного решения (убрать — одной правкой).
//     Константа OKNO_BAZOVOE — умолчание окна МОДЕЛИ СВОДКИ (сумматора), когда в настройке нет oknoSvodki. К
//     порогу компакта оно больше не относится (порог берётся из D).
//     Почему 1 000 000, а не 1 048 576: оба числа измерены — первое показывает счётчик платформы («занято N из
//     1000000»), второе назвала сама модель в отказе («maximum context length is 1048576»). Берём меньшее:
//     бюджет вызова сводки уменьшается, запас растёт, ошибка направлена в безопасную сторону. Одно поле — одно
//     умолчание: раньше два потребителя одного поля держали разные умолчания и при пустом значении молча
//     расходились.
//     Сменится модель сводки — переснять окно заново, а не наследовать число.
// EN: svodkaPorogov() is no longer called: there is now one share (from the preset), nothing to reconcile. The
//     function and its stand stend-svodki-porogov are kept until a separate decision (removal is a single
//     edit).
//     OKNO_BAZOVOE is the default window of the SUMMARY (summariser) model when the settings lack oknoSvodki.
//     It no longer relates to the compaction threshold (the threshold comes from D).
//     Why 1,000,000 rather than 1,048,576: both numbers were measured — the first is what the platform counter
//     shows ("used N of 1000000"), the second the model itself named in a refusal ("maximum context length is
//     1048576"). We take the smaller: the summary call budget shrinks, the margin grows, the error points to
//     the safe side. One field — one default: previously two consumers of one field kept different defaults and
//     silently diverged on an empty value.
//     If the summary model changes, re-measure the window; do not inherit the number.
const OKNO_BAZOVOE = 1_000_000;
// RU: Окно ПОРОГА — окно агента из пресета (через D). oknoModeli / oknoSvodki — окно модели сводки, сюда не
//     идут.
// EN: The THRESHOLD window is the agent window from the preset (via D). oknoModeli / oknoSvodki are the
//     summary-model window and do not go here.
const KOMPAKT_OKNO  = POROG_PRESETA.okno;
// RU: Размышления модели сводки по умолчанию ВЫКЛЮЧЕНЫ. Причина измерена: думающая модель тратила потолок
//     вывода на рассуждение, сводка обрывалась, урезание (неделимое со сводкой) не происходило, и следующий ход
//     снова упирался в порог. Подъём потолка 8192 → 32768 не помог — обрыв повторился на том же контексте;
//     лечит отключение размышлений.
//     Граница: это только про модель СВОДКИ. Модели самих агентов сюда не заходят — модуль ходит своим fetch к
//     API, мимо провайдеров платформы. Поле тела запроса thinking: { type: "disabled" } взято из родного
//     адаптера DeepSeek платформы, а не придумано.
// EN: Reasoning of the summary model is OFF by default. The reason was measured: a thinking model spent the
//     output ceiling on reasoning, the summary was cut off, trimming (indivisible from the summary) did not
//     happen, and the next turn hit the threshold again. Raising the ceiling 8192 → 32768 did not help — the
//     cut repeated on the same context; disabling reasoning fixes it.
//     Boundary: this is only about the SUMMARY model. The agents' own models never come here — the module calls
//     the API with its own fetch, bypassing platform providers. The request-body field thinking: { type:
//     "disabled" } is taken from the platform's native DeepSeek adapter, not invented.
const KOMPAKT_RAZMYSHLENIYA = (process.env.KOMPAKT_RAZMYSHLENIYA ?? String(NASTROJKA.razmyshleniya ?? false)) === 'true';
// RU: Два переключателя компакта: шлюзовой и платформенный. Они НЕЗАВИСИМЫ. Значение — строка 'true' или нет;
//     не задано нигде — undefined (не объявлено).
// EN: Two compaction switches: gateway and platform. They are INDEPENDENT. The value is the string 'true' or
//     not; set nowhere — undefined (not declared).
function chitatFlag(imyaEnv, znachenieFajla) {
  const syroe = process.env[imyaEnv] !== undefined ? process.env[imyaEnv]
    : znachenieFajla !== undefined ? String(znachenieFajla) : undefined;
  if (syroe === undefined) return undefined;
  return syroe === 'true';
}
const KOMPAKT_SHLYUZOVOJ = chitatFlag('KOMPAKT_SHLYUZOVOJ', NASTROJKA.kompaktShlyuzovoj);
// RU: Рубильник платформенного компакта — модуль compaction-basic в пресете агента; флаг из файла настройки не
//     читается (печатается «устарело»). Здесь «включён» = доля пресета прочитана из D; окружение — перебив, как
//     прежде.
// EN: The platform compaction switch is the compaction-basic module in the agent preset; the flag in the
//     settings file is not read ("устарело" is printed). Here "on" means the preset share was read from D; the
//     environment is an override as before.
const KOMPAKT_PLATFORMENNYJ = chitatFlag('KOMPAKT_PLATFORMENNYJ', POROG_PRESETA.porog !== undefined ? true : undefined);
if (KOMPAKT_SHLYUZOVOJ === undefined) console.error(`[kompakt ${VERSIYA}] шлюзовой компакт НЕ ОБЪЯВЛЕН (ни окружение, ни файл) — сжимаю по безопасному умолчанию (тихий паралич хуже лишнего сжатия)`);
// RU: Порог в токенах — производная величина: окно × доля, с округлением вниз (floor), как у платформы
//     (Math.floor(contextWindow × thresholdRatio)). Числа порога в штуках в файлах настроек нет намеренно.
// EN: The token threshold is a derived quantity: window × share, rounded down (floor), the same as the platform
//     (Math.floor(contextWindow × thresholdRatio)). There is deliberately no absolute token count in the
//     settings files.
const KOMPAKT_POROG  = POROG_PRESETA.porog;
// RU: ── Порог «нечего сжимать» ──
//     Что: если прозы меньше порога — модель НЕ зовём вовсе и отдаём прозу как есть.
//     Почему числом по корпусу: замер 54 сводок за сутки на рабочем журнале — порог 10000 отсекает 13 из 54
//     (теряем 29036 знаков сжатия, худшая потеря 4957), 12000 — 22 из 54 (51921, худшая 7100), 15000 — 27 из 54
//     (73324, худшая 7802).
//     По умолчанию ВЫКЛЮЧЕН (0), и это не забывчивость: отсечение экономит вызов, но теряет структуру — сводка
//     на малом входе не сжимает, а раскладывает. Обмен осознанный, цену назначает владелец числом.
//     Где не действует: предохранитель «не навреди» ниже работает ВСЕГДА, независимо от порога.
// EN: ── The "nothing to compress" threshold ──
//     What: if the prose is shorter than the threshold, the model is NOT called at all and the prose is
//     returned as is.
//     Why a number derived from a corpus: 54 summaries in a day measured on a production log — threshold 10000
//     cuts 13 of 54 (29036 characters of compression lost, worst single loss 4957), 12000 cuts 22 of 54 (51921,
//     worst 7100), 15000 cuts 27 of 54 (73324, worst 7802).
//     OFF by default (0), and not by oversight: the cut saves a call but loses structure — on small input a
//     summary does not compress, it lays things out. The trade-off is deliberate; the owner sets its price with
//     a number.
//     Where it does not apply: the "do no harm" fuse below works ALWAYS, regardless of this threshold.
const _MIN_PROZA = otkuda('KOMPAKT_MIN_PROZA', 'minProzaZnakov', 0);
const KOMPAKT_MIN_PROZA = Number(_MIN_PROZA.z) || 0;
console.error(`[kompakt ${VERSIYA}] порог «нечего сжимать»: ${KOMPAKT_MIN_PROZA === 0 ? 'ВЫКЛЮЧЕН (0)' : KOMPAKT_MIN_PROZA + ' зн.'} (${_MIN_PROZA.ist})`);
// RU: Решение «сжимать ли» вынесено функцией: шлюз и стенд гоняют один и тот же код.
//     Полная занятость входа — для ВНУТРЕННЕГО счёта шлюза; наружу шлюз отдаёт три поля отдельно.
//     Карта поставщиков: модуль компакта не принадлежит одному поставщику; все поставщики читают занятость
//     отсюда, сколько бы их ни было. Замер показал: формула занятости у обоих поставщиков одна — сумма трёх
//     вёдер (наборы 5000/900000/20000, 0/0/0, 7/0/0 дали одинаковые числа; подмена формулы краснеет).
//     Различаются не формулы, а ИМЕНА и СМЫСЛ чужих полей. Поэтому картой закрыта нормализация «чужие поля →
//     наши три ведра», а счёт остался один. Карта формул была бы ложью: она утверждала бы, что счёт разный.
//     Причина различия: anthropic — input_tokens НЕ включает кэш, вёдра лежат отдельными полями (по типам
//     Claude Agent SDK cache_* — number | null, поэтому ?? 0 стоит по контракту); openai — input_tokens
//     ВКЛЮЧАЕТ кэш, поэтому некэш получается вычитанием. Отрицательный некэш значит, что посылка перестала
//     держаться; гасить его молча нулём нельзя.
//     Контракт типов не принуждается во время работы, поэтому вёдра приводятся Number(...): сложение строк
//     склеивает («7» + 700 = 7700 вместо 707) и молча завышает занятость.
// EN: The "compress or not" decision is a function: the gateway and the stand run the same code.
//     Full input occupancy is for the gateway's INTERNAL count; externally the gateway reports three fields
//     separately.
//     Provider map: the compaction module does not belong to a single provider; every provider reads occupancy
//     from here, however many there are. A measurement showed the occupancy formula is the same for both
//     providers — the sum of three buckets (inputs 5000/900000/20000, 0/0/0, 7/0/0 gave equal numbers; a
//     substituted formula turns red). What differs is not the formula but the NAMES and MEANING of foreign
//     fields. So the map covers normalisation "foreign fields → our three buckets", and the count stays single.
//     A map of formulas would be a lie: it would claim the count differs.
//     Why they differ: anthropic — input_tokens does NOT include cache, buckets are separate fields (Claude
//     Agent SDK types declare cache_* as number | null, hence ?? 0 by contract); openai — input_tokens INCLUDES
//     cache, so non-cached input is obtained by subtraction. A negative non-cached value means the assumption
//     stopped holding; silently clamping it to zero is not allowed.
//     The type contract is not enforced at run time, so buckets are coerced with Number(...): adding strings
//     concatenates ("7" + 700 = 7700 instead of 707) and silently inflates occupancy.
const VEDRA_POSTAVSHCHIKA = {
  anthropic: (u) => ({
    inputTokens:      chislo(u?.input_tokens),
    cacheReadTokens:  chislo(u?.cache_read_input_tokens),
    cacheWriteTokens: chislo(u?.cache_creation_input_tokens),
    outputTokens:     chislo(u?.output_tokens),
  }),
  openai: (u) => {
    const kesh = chislo(u?.cached_input_tokens);
    const nekesh = chislo(u?.input_tokens) - kesh;
    if (nekesh < 0) console.error(`[kompakt ${VERSIYA}] 🔴 ПОСЫЛКА НЕ ДЕРЖИТСЯ: у openai input ${u?.input_tokens} < кэш ${kesh} — расход СОМНИТЕЛЕН, беру 0 за некэш`);
    return {
      inputTokens:      Math.max(0, nekesh),
      cacheReadTokens:  kesh,
      cacheWriteTokens: chislo(u?.cache_write_input_tokens),
      outputTokens:     chislo(u?.output_tokens),
    };
  },
};

function chislo(z) { const n = Number(z); return Number.isFinite(n) ? n : 0; }

// RU: Имя поставщика обязательно, умолчания нет. Молча подставить anthropic — значит считать чужой
//     нормализацией и не узнать об этом (так однажды неверное имя переменной окружения тихо подняло шлюз Codex
//     как anthropic). Отказ громкий и по построению: неизвестное имя не бывает «почти верным». Новый поставщик
//     заводится здесь, в VEDRA_POSTAVSHCHIKA.
// EN: The provider name is mandatory; there is no default. Silently substituting anthropic would mean counting
//     with someone else's normalisation and never knowing (once a wrong environment variable name quietly
//     brought a Codex gateway up as anthropic). The refusal is loud by construction: an unknown name is never
//     "almost right". A new provider is added here, in VEDRA_POSTAVSHCHIKA.
function vedraPoImeni(u, imyaPostavshchika) {
  const imya = String(imyaPostavshchika ?? '').trim();
  if (!imya) {
    // RU: «Не задано» и «задано пробелами» — разные беды, и чинят их по-разному. Отказ с ложным объяснением
    //     хуже отказа без объяснения: чинить пойдут по нему. Пробелы проходят проверку на пустоту и становятся
    //     пустотой после обрезки — снаружи это неотличимо от «строки нет», а на деле строка есть и в ней
    //     невидимый знак.
    // EN: "Not set" and "set to whitespace" are different faults and are fixed differently. A refusal with a
    //     false explanation is worse than one without: people will fix what it says. Whitespace passes the
    //     emptiness check and becomes empty after trimming — from outside it looks like "no string", while
    //     there is a string with an invisible character.
    const probely = imyaPostavshchika !== undefined && imyaPostavshchika !== null
                 && String(imyaPostavshchika) !== '' && String(imyaPostavshchika).trim() === '';
    const prichina = probely
      ? `ИМЯ ПОСТАВЩИКА ЗАДАНО ПРОБЕЛАМИ (${JSON.stringify(String(imyaPostavshchika))}) — это не пустота, а невидимое значение`
      : 'ИМЯ ПОСТАВЩИКА НЕ ЗАДАНО';
    throw new Error(`[kompakt] занятость: ${prichina}. Зовите polnayaZanyatost(usage, '<имя>'); известны: ${Object.keys(VEDRA_POSTAVSHCHIKA).join(', ')}`);
  }
  const vedra = VEDRA_POSTAVSHCHIKA[imya];
  if (!vedra) throw new Error(`[kompakt] занятость: ПОСТАВЩИК «${imya}» НЕИЗВЕСТЕН модулю. Известны: ${Object.keys(VEDRA_POSTAVSHCHIKA).join(', ')}. Новый поставщик заводится ЗДЕСЬ, в VEDRA_POSTAVSHCHIKA, и правки шлюза не требует.`);
  return vedra(u);
}

// RU: Занятость окна — только ВХОДНЫЕ вёдра. outputTokens в карте есть (он нужен для отдачи наружу), но в сумму
//     не входит: выход этого хода попадёт в окно лишь следующим ходом, уже как вход. Отсюда общее свойство:
//     занятость видна с запаздыванием на ход.
//     Занятость из журнала сессии — для поставщиков, отдающих НАКОПИТЕЛЬНЫЙ usage. Codex в событии
//     turn.completed отдаёт расход за всю сессию: шлюз печатал «занято 17608987 из 945000 (1863%)», хотя в окне
//     лежало 235548 из 258400 (91%) — числа отличались в 75 раз, и по завышенному шли решения о сжатии.
//     Codex пишет в записи token_count.info три уровня: total_token_usage — за сессию; turn_token_usage — за
//     ход; usage / last_token_usage — за один вызов, это и есть занятость окна. Плюс model_context_window —
//     настоящее окно модели, которое может отличаться от документации в разы: верить надо рантайму.
//     Где не применяется: журнала нет или в нём нет token_count — возвращаем null, и зовущий обязан различить
//     «неизвестно» и «ноль» (см. reshitKompakt).
// EN: Window occupancy counts INPUT buckets only. outputTokens is in the map (it is needed for external
//     reporting) but is not summed: this turn's output enters the window only next turn, as input. Hence a
//     general property: occupancy is visible with a one-turn lag.
//     Occupancy from the session log is for providers that report CUMULATIVE usage. Codex reports whole-session
//     usage in turn.completed: the gateway printed "used 17608987 of 945000 (1863%)" while the window held
//     235548 of 258400 (91%) — the numbers differed 75-fold, and compaction decisions were made on the inflated
//     one.
//     Codex writes three levels in the token_count.info record: total_token_usage — per session;
//     turn_token_usage — per turn; usage / last_token_usage — per single call, which is the window occupancy.
//     Plus model_context_window — the real model window, which may differ from the documentation several-fold:
//     trust the runtime.
//     Where it does not apply: no log or no token_count in it — we return null, and the caller must distinguish
//     "unknown" from "zero" (see reshitKompakt).
function zanyatostIzZhurnala(putFajla) {
  let stroki;
  try { stroki = fsK.readFileSync(putFajla, 'utf8').split('\n'); } catch { return null; }
  for (let i = stroki.length - 1; i >= 0; i--) {
    const s = stroki[i]; if (!s) continue;
    let z; try { z = JSON.parse(s); } catch { continue; }
    const p = z?.payload ?? z;
    if ((p?.type ?? z?.type) !== 'token_count') continue;
    const info = p?.info; if (!info) continue;
    const posl = info.last_token_usage ?? info.usage;
    if (!posl) continue;
    return {
      zanyato: chislo(posl.input_tokens),
      vyhod: Number.isSafeInteger(posl.output_tokens) && posl.output_tokens >= 0 ? posl.output_tokens : null,
      okno: chislo(info.model_context_window) || null,
      izKesha: chislo(posl.cached_input_tokens),
      nakoplennoe: chislo((info.total_token_usage ?? {}).input_tokens) || null,
    };
  }
  return null;
}

// RU: Занятость по самому свежему журналу в каталоге — для зовущих, которые НЕ знают идентификатора сессии
//     поставщика. Например, команда статуса компакта живёт в платформе и знает свой sessionId, а Codex пишет
//     файлы по своему UUID — связать их из команды нечем.
//     Граница, которую обязан знать зовущий: берётся ПОСЛЕДНИЙ по времени журнал в дереве. Это верно, пока у
//     агента одна активная сессия поставщика; при нескольких параллельных число будет от той, что писалась
//     последней. Поэтому функция возвращает ИМЯ ФАЙЛА вместе с числом: зовущий обязан показать источник.
// EN: Occupancy from the most recent log in the directory — for callers that do NOT know the provider session
//     id. For example, the compaction status command lives in the platform and knows its own sessionId, while
//     Codex names files by its own UUID — the command has no way to link them.
//     Boundary the caller must know: the most recently written log in the tree is used. That is correct while
//     the agent has one active provider session; with several in parallel the number comes from the one written
//     last. So the function returns the FILE NAME together with the number: the caller must show the source.
function zanyatostPoSvezhemuZhurnalu(domZhurnalov) {
  if (!domZhurnalov) return null;
  const koren = pathK.join(domZhurnalov, 'sessions');
  let luchshij = null;
  const obojti = (dir, glubina) => {
    if (glubina > 4) return;
    let spisok;
    try { spisok = fsK.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of spisok) {
      const pe = pathK.join(dir, e.name);
      if (e.isDirectory()) { obojti(pe, glubina + 1); continue; }
      if (!e.name.endsWith('.jsonl')) continue;
      let st; try { st = fsK.statSync(pe); } catch { continue; }
      if (!luchshij || st.mtimeMs > luchshij.vremya) luchshij = { put: pe, vremya: st.mtimeMs };
    }
  };
  obojti(koren, 0);
  if (!luchshij) return null;
  const z = zanyatostIzZhurnala(luchshij.put);
  return z ? { ...z, fajl: pathK.basename(luchshij.put) } : null;
}

function polnayaZanyatost(u, imyaPostavshchika) {
  const v = vedraPoImeni(u, imyaPostavshchika);
  return v.inputTokens + v.cacheReadTokens + v.cacheWriteTokens;
}

function reshitKompakt(zanjato, porog, shlyuzovoj) {
  // RU: «Неизвестно» — это не ноль. Было: null < porog → true (JS приводит null к нулю) → 'zdyot', «окно
  //     пустое, ждём». То есть при молчании поставщика о расходе сжатие не наступило бы НИКОГДА: тихий паралич,
  //     контекст растёт без предела. undefined и NaN давали 'zhat' — другую тихую беду, сжатие на пустом месте.
  //     Поэтому различаем до сравнения, отдельной веткой.
  // EN: "Unknown" is not zero. Before: null < porog → true (JS coerces null to zero) → 'zdyot', "window empty,
  //     waiting". So when a provider stayed silent about usage, compaction would NEVER happen: a silent
  //     paralysis, the context grows without limit. undefined and NaN gave 'zhat' — another silent fault,
  //     compaction out of nothing. Hence the separate branch before the comparison.
  if (zanjato === null || zanjato === undefined || Number.isNaN(zanjato)) return 'neizvestno';
  if (zanjato < porog) return 'zdyot';
  // RU: Не объявлено = СЖИМАТЬ (безопасное умолчание). Цена ошибки несимметрична: ложное «не сжимать» — тихий
  //     паралич, ложное «сжимать» — лишь лишнее, дорогое и заметное сжатие. Выключает только ЯВНОЕ false.
  // EN: Not declared = COMPRESS (the safe default). The cost of error is asymmetric: a false "don't compress"
  //     is a silent paralysis, a false "compress" is just an extra, costly and visible compaction. Only an
  //     EXPLICIT false switches it off.
  if (shlyuzovoj === false) return 'vyklyuchen';
  return 'zhat';
}
// RU: Ступени занятости. Ниже порога компакт молчит полностью, и три разных исхода дают один признак — тишину:
//     «ждёт порога», «ветка мертва», «usage не приходит вовсе». Второго механизма сжатия нет, значит молчащий
//     компакт обнаружился бы отказом по контексту, а не тревогой. Ступень печатается один раз при пересечении
//     вверх и сбрасывается компактом — тогда молчание значит «ещё не дошло», а не «неизвестно». Устройство
//     взято у ступеней тревоги сторожа памяти.
// EN: Occupancy steps. Below the threshold compaction is completely silent, and three different outcomes give
//     one sign — silence: "waiting for the threshold", "branch is dead", "usage never arrives". There is no
//     second compaction mechanism, so a silent compaction would surface as a context-length refusal, not as an
//     alert. A step is printed once when crossed upward and reset by compaction — then silence means "not
//     reached yet", not "unknown". The design is borrowed from the memory guard's alert steps.
const KOMPAKT_STUPENI  = [0.60, 0.80, 0.95];   // RU: доли порога · EN: shares of the threshold
const STUPEN_SESSII    = new Map();            // RU: sid → индекс наибольшей пройденной ступени · EN: sid → index of the highest step passed
// RU: Решение «что отдать» вынесено функцией chtoOtdat — по образцу reshitKompakt. Зачем: проба должна гонять
//     тот же код, что и рабочий путь, и делать это без ключа и без сети. Раньше решение жило внутри
//     fizicheskiyKompakt, который зовёт модель, и проверялось только вместе с живым вызовом.
//     Вход — длины, а не тексты: сравнение идёт только по длинам.
//     (stupenZanjatosti ниже возвращает индекс наибольшей пройденной ступени, -1 если ни одной; тоже вынесена
//     функцией, чтобы стенд гонял тот же код.)
// EN: The "what to return" decision is the function chtoOtdat — modelled on reshitKompakt. Why: a probe must
//     run the same code as the production path, without a key and without network. Previously the decision
//     lived inside fizicheskiyKompakt, which calls the model, and could only be checked together with a live
//     call.
//     Input is lengths, not texts: the comparison uses lengths only.
//     (stupenZanjatosti below returns the index of the highest step passed, -1 if none; it is a function for
//     the same reason — the stand runs the same code.)
export function chtoOtdat(svodkaZn, prozaZn, porog) {
  if (porog > 0 && prozaZn < porog)
    return { otdano: 'proza-porog',
             pochemu: `прозы ${prozaZn} зн. < порога ${porog} — модель НЕ ЗВАЛА, отдаю прозу` };
  if (svodkaZn < prozaZn)
    return { otdano: 'svodka',
             pochemu: `сводка ${svodkaZn} зн. из ${prozaZn} зн. прозы (сжатие ${Math.round((1 - svodkaZn / prozaZn) * 100)}%)` };
  return { otdano: 'proza-predohranitel',
           pochemu: `ПРЕДОХРАНИТЕЛЬ: сводка ${svodkaZn} зн. НЕ КОРОЧЕ прозы ${prozaZn} зн. — отдаю ПРОЗУ, сводку отбрасываю` };
}

function stupenZanjatosti(zanjato) {
  const policy = porogIzPreseta();
  if (policy.prichina) { console.error(`[kompakt ${VERSIYA}] ступени не измерены: ${policy.prichina}`); return -1; }
  const aktualnyjPorog = policy.porog;
  let st = -1;
  for (let i = 0; i < KOMPAKT_STUPENI.length; i++) {
    if (zanjato >= aktualnyjPorog * KOMPAKT_STUPENI[i]) st = i;
  }
  return st;
}

const KOMPAKT_VHOD   = Number(process.env.KOMPAKT_VHOD   ?? 0);       // RU: знаков на вход; 0 = не ограничивать (полный контекст в модель) · EN: input characters; 0 = unlimited (full context to the model)
const KOMPAKT_VYHOD  = Number(process.env.KOMPAKT_VYHOD  ?? 100000);  // RU: объявлено, но не используется кодом · EN: declared but not used by the code
// RU: Модель, хвост и адрес раньше шли мимо настройки: стояло «окружение ?? зашитая константа», и поля model /
//     hvostStrok в файле агента были мертвы — их меняли, а работа не менялась. Адреса в настройке не было
//     вовсе. Теперь все три берутся через otkuda() с источником.
// EN: Model, tail and endpoint used to bypass the settings: the code read "environment ?? hard-coded constant",
//     and the model / hvostStrok fields in the agent file were dead — edited without any effect. The endpoint
//     was not in the settings at all. Now all three go through otkuda() with a source.
const IST_HVOST = otkuda('KOMPAKT_HVOST', 'hvostStrok', 30);
const IST_MODEL = otkuda('KOMPAKT_MODEL', 'model', 'deepseek-flash');
const IST_ADRES = otkuda('KOMPAKT_ADRES', 'adres', 'https://api.deepseek.com/v1/chat/completions');
const KOMPAKT_HVOST  = Number(IST_HVOST.z);   // RU: строк хвоста дословно · EN: tail lines kept verbatim
// RU: Хвост — целое ≥ 1. 0 и отрицательное дают slice(-0) = весь журнал (сессия не сжимается, а растёт), нечисло — NaN и
//     ложную причину отказа. Негодное значение называется при подъёме, а физическое сжатие отказывает, не трогая сессию.
// EN: The tail is an integer ≥ 1. 0 or negative gives slice(-0) = the whole log (the session grows instead of shrinking),
//     a non-number gives NaN and a false refusal reason. A bad value is named at start-up; physical compaction refuses
//     without touching the session.
const HVOST_GODEN = Number.isSafeInteger(KOMPAKT_HVOST) && KOMPAKT_HVOST >= 1;
const HVOST_NEGODEN = `негодный хвост «${IST_HVOST.z}» (${IST_HVOST.ist}): нужно целое ≥ 1`;
const KOMPAKT_MODEL  = String(IST_MODEL.z);
const KOMPAKT_ADRES  = String(IST_ADRES.z);
// RU: Предел ожидания ответа модели сводки, мс. Постоянный: срок для живого поставщика с запасом на большой вход.
// EN: Summary model response limit, ms. Fixed: a live provider's time with headroom for a large input.
const PREDEL_SVODKI_MS = 600000;

function putSessii(sessionId, cwd) {
  // RU: Путь журнала по схеме Claude Agent SDK: $HOME/.claude/projects/<cwd с заменой не-букв на
  //     «-»>/<sessionId>.jsonl. Раньше это был единственный путь — и в этом был дефект: шлюз обслуживает двух
  //     поставщиков.
  // EN: Log path following the Claude Agent SDK scheme: $HOME/.claude/projects/<cwd with non-alphanumerics
  //     replaced by "-">/<sessionId>.jsonl. It used to be the only path — that was the defect: the gateway
  //     serves two providers.
  const putClaude = pathK.join(process.env.HOME || '/root', '.claude', 'projects',
    String(cwd).replace(/[^A-Za-z0-9]/g, '-'), `${sessionId}.jsonl`);
  if (fsK.existsSync(putClaude)) return putClaude;
  // RU: Codex. Шлюз доходил до сжатия и останавливался на «файла сессии нет: …/.claude/projects/…» — Codex SDK
  //     кладёт журнал иначе: $CODEX_HOME/sessions/ГГГГ/ММ/ДД/rollout-<метка времени>-<sessionId>.jsonl.
  //     sessionId в обоих путях один и тот же, метка времени неизвестна — поэтому ищем по хвосту имени, а не
  //     строим путь.
  //     Порядок важен: сначала Claude. У агента, чей журнал по схеме Claude на месте, поведение не меняется ни
  //     на байт — ветка Codex для него недостижима.
  //     Где не применяется: CODEX_HOME не задан или журнала нет ни по одной схеме — возвращаем путь Claude,
  //     чтобы сообщение об отказе осталось прежним и узнаваемым.
  // EN: Codex. The gateway reached compaction and stopped at "session file missing: …/.claude/projects/…" — the
  //     Codex SDK stores the log differently:
  //     $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<timestamp>-<sessionId>.jsonl. The sessionId is the same in
  //     both paths, the timestamp is unknown — so we search by the name suffix instead of building the path.
  //     Order matters: Claude first. For an agent whose Claude-scheme log exists, behaviour does not change by
  //     a single byte — the Codex branch is unreachable for it.
  //     Where it does not apply: CODEX_HOME unset or no log under either scheme — we return the Claude path so
  //     the refusal message stays the same and recognisable.
  const domCodex = process.env.CODEX_HOME;
  if (domCodex) {
    const hvost = `-${sessionId}.jsonl`;
    const obojti = (dir, glubina) => {
      if (glubina > 4) return null;   // RU: sessions/ГГГГ/ММ/ДД/файл — глубже смысла нет · EN: sessions/YYYY/MM/DD/file — no point going deeper
      let spisok;
      try { spisok = fsK.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
      for (const e of spisok) {
        const pe = pathK.join(dir, e.name);
        if (e.isDirectory()) { const naiden = obojti(pe, glubina + 1); if (naiden) return naiden; }
        else if (e.name.endsWith(hvost)) return pe;
      }
      return null;
    };
    const naiden = obojti(pathK.join(domCodex, 'sessions'), 0);
    if (naiden) return naiden;
  }
  return putClaude;
}

// RU: Стенограмма с хвоста: идём с конца и набираем до предела знаков. Именно предела ВХОДА у платформенной
//     компакции и нет — отсюда растущая сводка.
// EN: Transcript from the tail: walk from the end and collect up to the character limit. The platform
//     compaction lacks exactly this INPUT limit — hence an ever-growing summary.
function stenogrammaHvostom(stroki, predelZnakov) {
  // RU: Проза ходов в порядке файла — одним проходом, чтобы «отброшено» считалось точно, а не «не менее чем».
  //     Оба прохода одного замера идут по одному списку.
  // EN: Turn prose in file order — one pass, so that "dropped" is counted exactly rather than "at least". Both
  //     passes of one measurement use the same list.
  const vse = [];
  for (const s of stroki) {
    let z; try { z = JSON.parse(s); } catch { continue; }
    // RU: Две схемы записи, а не одна.
    //     Claude Agent SDK: {"message":{"role":..,"content":[{"type":"text","text":..}]}}
    //     Codex SDK rollout:
    //     {"payload":{"type":"message","role":..,"content":[{"type":"input_text","text":..}]}}
    //     Пока читалась только первая, журнал Codex открывался, но давал «в стенограмме нет текстовых ходов»:
    //     message.role там нет ни разу. Замер на трёх рабочих rollout: записей с message.role — 0; с
    //     payload.type=="message" — 17 (developer 9, user 6, assistant 2); блоков input_text 23, output_text 2,
    //     "text" — ни одного.
    //     Роль developer пропускаем намеренно: это системные инструкции, а не проза хода.
    // EN: Two record schemes, not one.
    //     Claude Agent SDK: {"message":{"role":..,"content":[{"type":"text","text":..}]}}
    //     Codex SDK rollout:
    //     {"payload":{"type":"message","role":..,"content":[{"type":"input_text","text":..}]}}
    //     While only the first was read, a Codex log opened but gave "no text turns in the transcript":
    //     message.role never occurs there. Measured on three production rollouts: records with message.role —
    //     0; with payload.type=="message" — 17 (developer 9, user 6, assistant 2); input_text blocks 23,
    //     output_text 2, "text" — none.
    //     The developer role is skipped on purpose: it is system instructions, not turn prose.
    const uzel = (z && typeof z.message === 'object' && z.message !== null) ? z.message
               : (z?.payload?.type === 'message' ? z.payload : null);
    const rol = uzel?.role; if (rol !== 'user' && rol !== 'assistant') continue;
    const soderzhimoe = uzel.content;
    const TEKSTOVYE = new Set(['text', 'input_text', 'output_text']);
    const tekst = typeof soderzhimoe === 'string' ? soderzhimoe
      : Array.isArray(soderzhimoe) ? soderzhimoe.filter(b => TEKSTOVYE.has(b?.type)).map(b => b.text).join('\n') : '';
    if (!tekst) continue;
    vse.push(`### ${rol === 'user' ? 'Пользователь' : 'Я'}\n${tekst}`);
  }
  const vsegoZnakov = vse.reduce((a, k) => a + k.length, 0);
  // RU: Предел 0 = НЕ ограничивать. Механическая обрезка входа теряла молча: замер — миллион знаков прозы, в
  //     сводку ушло 250000. Объём выхода просится словами в промте, а не режется ножницами в коде.
  // EN: Limit 0 = do NOT limit. Mechanical input trimming lost data silently: measured — a million characters
  //     of prose, 250,000 reached the summary. Output size is requested in words in the prompt, not cut with
  //     scissors in code.
  if (!(predelZnakov > 0)) {
    return { tekst: vse.join(String.fromCharCode(10,10)), hodov: vse.length, znakov: vsegoZnakov,
             otbrosheno: 0, obrezano: 0, vsegoZnakov };
  }
  // RU: Идём с конца: свежее важнее старого.
  // EN: Walk from the end: recent matters more than old.
  const kuski = []; let dlina = 0; let obrezano = 0;
  for (let i = vse.length - 1; i >= 0; i--) {
    const kusok = vse[i];
    if (dlina + kusok.length <= predelZnakov) { kuski.unshift(kusok); dlina += kusok.length; continue; }
    // RU: Кусок не влез целиком. Прежняя редакция делала здесь break — и отбрасывала почти всё: платформа
    //     подаёт вклеенную историю ОДНИМ сообщением. Замер на живой сессии: текстовых ходов 3, один из них на
    //     932443 знака; в сводку шло 3573 знака — 0,4% прозы, а компакт печатал «сделано». Тихая потеря: отчёт
    //     успешен, контекст исчез.
    //     Берём хвост куска в остаток предела и НАЗЫВАЕМ обрезку в самом тексте — иначе модель прочтёт огрызок
    //     как целое сообщение.
    // EN: The chunk did not fit whole. An earlier version did break here — and dropped almost everything: the
    //     platform passes the pasted history as ONE message. Measured on a live session: 3 text turns, one of
    //     them 932,443 characters; the summary got 3,573 characters — 0.4% of the prose, while compaction
    //     reported "done". A silent loss: the report succeeds, the context vanishes.
    //     We take the tail of the chunk into the remaining limit and NAME the cut inside the text — otherwise
    //     the model would read the stub as a whole message.
    const ostatok = predelZnakov - dlina;
    if (ostatok > 0) {
      const hvostKuska = kusok.slice(-ostatok);
      kuski.unshift(`### [НАЧАЛО ХОДА ОТРЕЗАНО: не вошло ${kusok.length - ostatok} знаков]\n${hvostKuska}`);
      dlina += hvostKuska.length; obrezano = 1;
    }
    break;   // RU: предел исчерпан; более раннее не идёт в сводку, это названо числом · EN: limit used up; earlier text is not summarised, and that is reported as a number
  }
  return { tekst: kuski.join('\n\n'), hodov: kuski.length, znakov: dlina,
           otbrosheno: vsegoZnakov - dlina, obrezano, vsegoZnakov };
}

// RU: Ключ берётся по СПИСКУ имён переменных окружения, а не по одному. На одном узле ключ жил под именем
//     GATEWAY_API_KEY (так его брал соседний модуль в том же процессе), а модуль спрашивал только
//     DEEPSEEK_API_KEY — и сводка не состоялась при живом ключе. Класс ошибки: предмет ищется по имени, которое
//     помнит спрашивающий, а не по тому, под которым он живёт.
//     Порядок: собственное имя модуля старше общих — им можно перебить на один прогон. Список экспортируется:
//     проба обязана подменять ВСЕ имена из него, иначе ослепнет, как только появится второе годное имя.
// EN: The key is looked up by a LIST of environment variable names, not by one. On one host the key lived under
//     GATEWAY_API_KEY (that is how a neighbouring module in the same process read it), while this module asked
//     only for DEEPSEEK_API_KEY — and the summary failed with a live key present. The error class: an item is
//     looked up by the name the asker remembers, not by the one it lives under.
//     Order: the module's own name beats the shared ones — it can override for one run. The list is exported: a
//     probe must override ALL names in it, otherwise it goes blind as soon as a second valid name appears.
const IST_IMENA = otkuda(null, 'imenaKlyucha', ['KOMPAKT_API_KEY', 'DEEPSEEK_API_KEY', 'GATEWAY_API_KEY']);
export const IMENA_KLYUCHA = Array.isArray(IST_IMENA.z) && IST_IMENA.z.length ? IST_IMENA.z
  : ['KOMPAKT_API_KEY', 'DEEPSEEK_API_KEY', 'GATEWAY_API_KEY'];

// RU: ── Бюджет одного вызова сводки ──
//     Окно модели сводки названо самой моделью в отказе («maximum context length is 1048576»), а не взято из
//     документации. Сменится модель — переснять живым отказом или счётчиком.
//     Окно питается из настройки: раньше поле окна из файла шло только в порог, а бюджет вызова считался от
//     зашитого 1 048 576. Близкие и разные числа маскировали расхождение.
//     Окно сумматора — поле oknoSvodki. Старое oknoModeli принимается как запасное с печатью «устарело»; для
//     ПОРОГА оно не берётся никогда (там окно агента, см. porogIzPreseta).
// EN: ── Budget of a single summary call ──
//     The summary model window was named by the model itself in a refusal ("maximum context length is
//     1048576"), not taken from documentation. If the model changes, re-measure with a live refusal or a
//     counter.
//     The window comes from the settings: previously the file's window field fed only the threshold, while the
//     call budget used a hard-coded 1,048,576. Close-but-different numbers masked the mismatch.
//     The summariser window is the oknoSvodki field. The old oknoModeli is accepted as a fallback with an
//     "устарело" (obsolete) notice; it is never used for the THRESHOLD (that uses the agent window, see
//     porogIzPreseta).
const IST_OKNO = (() => {
  const s = otkuda('KOMPAKT_OKNO_MODELI', 'oknoSvodki', OKNO_BAZOVOE);
  if (s.ist !== 'умолчание модуля') return s;
  const m = otkuda(null, 'oknoModeli', OKNO_BAZOVOE);
  if (m.ist === 'умолчание модуля') return s;
  console.error(`[kompakt ${VERSIYA}] oknoModeli УСТАРЕЛО — это окно СУММАТОРА, назови oknoSvodki (беру ${m.z} как окно сводки)`);
  return { z: m.z, ist: m.ist + ' — oknoModeli, устарело → oknoSvodki' };
})();
const OKNO_MODELI = Number(IST_OKNO.z) || OKNO_BAZOVOE;
// RU: Потолок ВЫВОДА — граница ПРОВАЙДЕРА, названная им самим, а не наше число. Снята живым отказом с точностью
//     до единицы: max_tokens 393216 — ответ есть, 393217 — отказ «Invalid max_tokens value, the valid range of
//     max_tokens is [1, 393216]».
//     Снять min() с этим числом нельзя: при малом входе остаток окна около 1 030 000, и запрос отвергался бы на
//     КАЖДОМ прогоне. Убирать надо пределы, выдуманные нами; этот выдуман не нами. Сменится провайдер или
//     модель — переснять тем же способом (два запроса, N и N+1).
// EN: The OUTPUT ceiling is the PROVIDER's limit, named by the provider itself, not our number. Measured by a
//     live refusal to the unit: max_tokens 393216 — answered, 393217 — refused with "Invalid max_tokens value,
//     the valid range of max_tokens is [1, 393216]".
//     The min() with this number cannot be removed: on small input the remaining window is about 1,030,000 and
//     the request would be refused on EVERY run. Remove limits we invented; this one is not ours. If the
//     provider or model changes, re-measure the same way (two requests, N and N+1).
const POTOLOK_MODELI = Number(process.env.KOMPAKT_POTOLOK) || 393_216;
// RU: Знаков на токен. Замер на кириллице: 2,44. Берём 2,0 НАМЕРЕННО — оценка входа выходит завышенной, места
//     под сводку отводится меньше; ошибка в безопасную сторону.
//     Граница перебива: увеличивать без нового замера нельзя. KOMPAKT_ZN_NA_TOK=4 занизит оценку входа вдвое,
//     место под сводку окажется завышенным — и вернётся отказ «maximum context length». Уменьшать безопасно
//     (запас растёт).
// EN: Characters per token. Measured on Cyrillic text: 2.44. We use 2.0 ON PURPOSE — the input estimate comes
//     out higher, less room is given to the summary; the error points to the safe side.
//     Override boundary: do not increase without a new measurement. KOMPAKT_ZN_NA_TOK=4 would halve the input
//     estimate, overstate the room for the summary — and the "maximum context length" refusal returns.
//     Decreasing is safe (the margin grows).
const ZNAKOV_NA_TOKEN = Number(process.env.KOMPAKT_ZN_NA_TOK) || 2.0;
// RU: Запас на служебное обрамление запроса, которое не считается (роли, разметка сообщений).
// EN: Margin for request framing that is not counted (roles, message markup).
const ZAPAS_OKNA = Number(process.env.KOMPAKT_ZAPAS) || 8192;
// RU: Ниже этого сводка выходит обрубком, а обрубок неотличим от готовой сводки — поэтому отказ.
// EN: Below this the summary would come out truncated, and a truncated summary is indistinguishable from a
//     finished one — hence a refusal.
const MINIMUM_VYHODA = Number(process.env.KOMPAKT_MIN_VYHOD) || 8192;

// RU: Источник каждого значения печатается при подъёме, всегда. Это и есть признак, что настройка доехала: он
//     различает исходы даже когда значения совпадают с умолчаниями.
// EN: The source of every value is printed at start-up, always. This is the sign that the settings arrived: it
//     distinguishes outcomes even when values equal the defaults.
console.error(`[kompakt ${VERSIYA}] источники значений: модель ${KOMPAKT_MODEL} (${IST_MODEL.ist})`
  + (HVOST_GODEN ? ` · хвост ${KOMPAKT_HVOST} строк (${IST_HVOST.ist})` : ` · 🔴 ${HVOST_NEGODEN} — физическое сжатие откажет`)
  + ` · окно сумматора ${OKNO_MODELI} (${IST_OKNO.ist})`
  + ` · адрес ${KOMPAKT_ADRES} (${IST_ADRES.ist})`
  + ` · имена ключа ${IMENA_KLYUCHA.join(', ')} (${IST_IMENA.ist}; значение ключа в настройке НЕ хранится)`);

export function vzyatKlyuchKompakta() {
  for (const imya of IMENA_KLYUCHA) {
    const v = process.env[imya];
    if (v && v.trim()) return { klyuch: v.trim(), otkuda: imya };
  }
  return { klyuch: null,
           otkuda: 'ключ для сводки не найден НИ ПОД ОДНИМ из имён: ' + IMENA_KLYUCHA.join(', ') +
                   ' — сводку делать нечем (перечислены все проверенные имена, а не одно)' };
}

// RU: ── Расход вызова: токены отдельно от денег ──
//     Раньше расход не сообщался вообще: за каждое сжатие платили и не знали суммы. Молчание здесь неотличимо
//     от нуля, а нулём оно не было ни разу.
//     Две строки, а не одна. Токены приходят от провайдера — это замер. Деньги — произведение токенов на
//     каталог цен, производная величина, верная ровно настолько, насколько верен каталог. Сложенные в одно
//     число, они дали бы «число без способа».
//     Отсутствие usage — отдельный исход, а не ноль: печать «вход 0 · выход 0» выдала бы незнание за замер.
//     Цены не выдумываются: нет поля ceny в настройке — деньги не печатаются, и причина называется. Появится
//     каталог с источником и датой — строка денег включится сама, без правки кода.
// EN: ── Call cost: tokens separate from money ──
//     Previously cost was not reported at all: every compaction was paid for with no idea of the amount.
//     Silence here is indistinguishable from zero, and it was never zero.
//     Two lines, not one. Tokens come from the provider — a measurement. Money is tokens times a price
//     catalogue — a derived value, exactly as correct as the catalogue. Summed into one number they would give
//     "a number without a method".
//     Missing usage is a separate outcome, not zero: printing "input 0 · output 0" would pass ignorance off as
//     a measurement.
//     Prices are never invented: without a ceny field in the settings money is not printed and the reason is
//     stated. Once a catalogue with source and date appears, the money line turns on by itself, without code
//     changes.
export function strokiRashoda(usage, ceny) {
  if (!usage || typeof usage !== 'object') {
    return [`[kompakt-nash ${VERSIYA}] 🔴 расход НЕ СООБЩЁН: в ответе провайдера нет поля usage. `
      + 'Это НЕ ноль — это отсутствие замера, и величина расхода остаётся неизвестной'];
  }
  const vhod  = usage.prompt_tokens;
  const vyhod = usage.completion_tokens;
  const vsego = usage.total_tokens;
  const est = (x) => (typeof x === 'number' && Number.isFinite(x));
  const pokaz = (x) => (est(x) ? String(x) : 'не сообщено');
  // RU: Кэш печатается только когда поля пришли: выдуманный ноль читался бы как «кэш ни разу не сработал» —
  //     утверждение о том, чего мы не измеряли.
  // EN: Cache is printed only when its fields arrived: an invented zero would read as "cache never hit" — a
  //     claim about something we did not measure.
  const kesh = (est(usage.prompt_cache_hit_tokens) || est(usage.prompt_cache_miss_tokens))
    ? ` · кэш входа: попаданий ${pokaz(usage.prompt_cache_hit_tokens)}, промахов ${pokaz(usage.prompt_cache_miss_tokens)}`
    : '';
  const stroki = [`[kompakt-nash ${VERSIYA}] расход, ТОКЕНЫ (замер, из ответа провайдера): `
    + `вход ${pokaz(vhod)} · выход ${pokaz(vyhod)} · всего ${pokaz(vsego)}${kesh}`];

  const cv = ceny?.vhod, cr = ceny?.vyhod;
  if (!est(cv) || !est(cr)) {
    stroki.push(`[kompakt-nash ${VERSIYA}] расход, ДЕНЬГИ: НЕ СЧИТАЮ — каталога цен нет `
      + '(настройка «ceny»: vhod и vyhod за миллион токенов + istochnik + data). '
      + 'Токены выше — замер; деньги были бы произведением на неназванный источник');
    return stroki;
  }
  if (!est(vhod) || !est(vyhod)) {
    stroki.push(`[kompakt-nash ${VERSIYA}] расход, ДЕНЬГИ: НЕ СЧИТАЮ — цены заданы, но провайдер не `
      + 'сообщил вход или выход в токенах. Множитель есть, множимого нет');
    return stroki;
  }
  const dengi = (vhod / 1e6) * cv + (vyhod / 1e6) * cr;
  const ist = ceny.istochnik ? String(ceny.istochnik) : 'ИСТОЧНИК НЕ НАЗВАН';
  const data = ceny.data ? String(ceny.data) : 'дата не названа';
  stroki.push(`[kompakt-nash ${VERSIYA}] расход, ДЕНЬГИ: ~$${dengi.toFixed(4)} `
    + `(вход ${vhod}×$${cv}/млн + выход ${vyhod}×$${cr}/млн). `
    + `ИСТОЧНИК ЦЕНЫ: ${ist}, ${data}. `
    + `Число ПРОИЗВОДНОЕ от каталога, а не замер: верно ровно настолько, насколько верен каталог`);
  return stroki;
}

async function svodkaNashejModelyu(stenogramma, hvost = null, signal = null) {
  const tekstovayaNastrojka=chitatRazmeschenie();
  // RU: Свежее чтение D перед вызовом — проверка годности: D заменяется атомарно, и при его порче модель не
  //     зовётся (зовущий dsh-pamyat-kompakt-dsh тогда отдаёт родную сводку платформы). Значения модели, адреса
  //     и хвоста при этом остаются те, что прочитаны при импорте.
  // EN: A fresh read of D before the call is a validity check: D is replaced atomically, and if it is broken
  //     the model is not called (the caller dsh-pamyat-kompakt-dsh then falls back to the platform's native
  //     summary). Model, endpoint and tail values stay those read at import time.
  if (KOMPAKT_AGENT) {
    chitatNastrojku(KOMPAKT_AGENT);
    const policy = porogIzPreseta();
    if (policy.prichina) throw new Error(policy.prichina);
  }
  const { klyuch, otkuda } = vzyatKlyuchKompakta();
  if (!klyuch) throw new Error(otkuda);
  // RU: Промт лежит файлом, а не в коде: разделы, запрет выдумывать имена и пути, требование называть числа
  //     точно. Объём просится словами внутри промта, механической обрезки нет. Файла нет — это ОТКАЗ, а не
  //     тихий откат к короткому промту: молчаливая подмена промта неотличима от исправной работы, а сводка
  //     выходит вдвое беднее.
  // EN: The prompt is a file, not code: sections, a ban on inventing names and paths, a demand to state numbers
  //     exactly. Size is requested in words inside the prompt; there is no mechanical trimming. A missing file
  //     is a REFUSAL, not a quiet fallback to a short prompt: a silent prompt swap is indistinguishable from
  //     correct work, while the summary comes out half as rich.
  const putPromta = process.env.KOMPAKT_PROMT
    ?? pathK.join(pathK.dirname(new URL(import.meta.url).pathname), "promt-svodki.txt");
  if (!fsK.existsSync(putPromta)) throw new Error(`промт сводки не найден: ${putPromta}`);
  const sistemnyjSyroj = podstavitTeksty(fsK.readFileSync(putPromta, "utf-8"),tekstovayaNastrojka);
  if (!sistemnyjSyroj.trim()) throw new Error(`промт сводки пуст: ${putPromta}`);
  // RU: Метка {{OT_LICA}} в промте: 0, 1 или больше. 0 — промт старого вида (код и промт могут обновляться в
  //     разное время): сводка делается по промту как есть, плюс строка журнала; отказ здесь сорвал бы сводки на
  //     время обновления. 1 — подстановка имени. 2 и больше — отказ, как у рамки.
  // EN: The {{OT_LICA}} marker in the prompt: 0, 1 or more. 0 — an old-style prompt (code and prompt may be
  //     updated at different times): the summary uses the prompt as is, plus a log line; refusing here would
  //     break summaries during an update. 1 — the name is substituted. 2 or more — refusal, same as for the
  //     frame.
  const chastiLica = sistemnyjSyroj.split("{{OT_LICA}}");
  if (chastiLica.length > 2) throw new Error(`промт сводки: {{OT_LICA}} больше одного (${chastiLica.length - 1}): ${putPromta}`);
  if (chastiLica.length === 1) console.error(`[kompakt ${VERSIYA}] промт старый, имя не подставлено (в промте нет {{OT_LICA}}): ${putPromta}`);
  const sistemnyj = chastiLica.length === 2 ? chastiLica[0] + OT_LICA + chastiLica[1] : sistemnyjSyroj;
  // RU: Рамка стенограммы — тоже файлом, по тому же правилу, что промт. Голая стенограмма, кончающаяся репликой
  //     агента посреди работы, однажды дала ОТВЕТ от лица агента вместо сводки. Промт при этом ссылается на
  //     маркер «↓↓↓ САМЫЕ ПОСЛЕДНИЕ ↓↓↓», который до рамки не ставил никто.
  //     Рамка: пометка «материал, а не обращение» до стенограммы, маркер и напоминание договора после;
  //     {{STENOGRAMMA}} — место вставки.
  //     Хвост (свежие ходы, остающиеся у агента дословно) — вторым блоком своей рамкой ramka-s-hvostom.txt:
  //     ровно одно {{STENOGRAMMA}} и одно {{HVOST}} после него. Рамка запрещает пересказ хвоста; маркер «САМЫЕ
  //     ПОСЛЕДНИЕ» — в конце хвоста. Хвост — часть входа, поэтому окно ниже считается уже с ним. Нет хвоста —
  //     обычная рамка.
  // EN: The transcript frame is also a file, by the same rule as the prompt. A bare transcript ending with an
  //     agent's remark mid-task once produced an ANSWER in the agent's voice instead of a summary. The prompt
  //     also refers to the marker "↓↓↓ САМЫЕ ПОСЛЕДНИЕ ↓↓↓" (the most recent), which nobody set before the
  //     frame existed.
  //     The frame: a "this is material, not a request" note before the transcript, the marker and a reminder of
  //     the contract after; {{STENOGRAMMA}} is the insertion point.
  //     The tail (recent turns the agent keeps verbatim) goes as a second block with its own frame
  //     ramka-s-hvostom.txt: exactly one {{STENOGRAMMA}} and one {{HVOST}} after it. The frame forbids
  //     retelling the tail; the "most recent" marker is at the end of the tail. The tail is part of the input,
  //     so the window below is computed with it. No tail — the ordinary frame.
  const estHvost = typeof hvost === "string" && hvost.trim() !== "";
  const katalogK = pathK.dirname(new URL(import.meta.url).pathname);
  const putRamki = estHvost ? (process.env.KOMPAKT_RAMKA_HVOST ?? pathK.join(katalogK, "ramka-s-hvostom.txt"))
    : (process.env.KOMPAKT_RAMKA ?? pathK.join(katalogK, "ramka-stenogrammy.txt"));
  if (!fsK.existsSync(putRamki)) throw new Error(`рамка стенограммы не найдена: ${putRamki}`);
  const tekstRamki = podstavitTeksty(fsK.readFileSync(putRamki, "utf-8"),tekstovayaNastrojka);
  const chastiRamki = tekstRamki.split("{{STENOGRAMMA}}");
  if (chastiRamki.length !== 2) throw new Error(`рамка стенограммы без ровно одного {{STENOGRAMMA}}: ${putRamki}`);
  let vhod = chastiRamki[0] + stenogramma + chastiRamki[1];
  if (estHvost) {
    if (tekstRamki.split("{{HVOST}}").length !== 2 || chastiRamki[0].includes("{{HVOST}}"))
      throw new Error(`рамка хвоста без ровно одного {{HVOST}} после {{STENOGRAMMA}}: ${putRamki}`);
    const [do_, posle] = chastiRamki[1].split("{{HVOST}}");
    vhod = chastiRamki[0] + stenogramma + do_ + hvost + posle;
  }
  // RU: max_tokens — НЕ «потолок, который не тратится»: он БРОНИРУЕТ место в окне контекста. Живой отказ:
  //     «maximum context length is 1048576, requested 1286323 (893107 in the messages, 393216 in the
  //     completion)» — вход и бронь складываются. Прежнее значение (потолок модели) съедало окно и роняло
  //     сводку на длинном входе, память не наполнялась.
  //     Различение, на котором вышла ошибка: в тарифе max_tokens — потолок, платится фактический выход; в окне
  //     он занят целиком. Одна величина, две роли.
  // EN: max_tokens is NOT "a ceiling that costs nothing": it RESERVES room in the context window. A live
  //     refusal: "maximum context length is 1048576, requested 1286323 (893107 in the messages, 393216 in the
  //     completion)" — input and reservation add up. The old value (the model ceiling) ate the window and
  //     dropped the summary on long input; memory did not fill.
  //     The distinction behind the mistake: for billing max_tokens is a ceiling and you pay the actual output;
  //     in the window it is occupied in full. One quantity, two roles.
  const vhodZnakov = sistemnyj.length + vhod.length;
  const vhodTokenov = Math.ceil(vhodZnakov / ZNAKOV_NA_TOKEN);
  const mesto = OKNO_MODELI - vhodTokenov - ZAPAS_OKNA;
  if (mesto < MINIMUM_VYHODA) {
    throw new Error(`место под сводку не осталось: окно ${OKNO_MODELI}, вход ~${vhodTokenov} ток. `
      + `(${vhodZnakov} зн. / ${ZNAKOV_NA_TOKEN}), запас ${ZAPAS_OKNA} — свободно ${mesto} < ${MINIMUM_VYHODA}. `
      + `Это ОТКАЗ, а не куцая сводка: обрубок приходит как готовая сводка и неотличим от неё`);
  }
  const predelVyhoda = Math.min(POTOLOK_MODELI, mesto);
  console.log(`[kompakt-nash ${VERSIYA}] бюджет вызова: окно ${OKNO_MODELI} · вход ~${vhodTokenov} ток. `
    + `(${vhodZnakov} зн.) · запас ${ZAPAS_OKNA} · под сводку ${predelVyhoda} ток. `
    + `(потолок модели ${POTOLOK_MODELI}). Объём сводки просится СЛОВАМИ в промте; это число — `
    + `не предел замысла, а остаток окна.`);
  // RU: Срок и отмена: вызов модели ограничен PREDEL_SVODKI_MS, а сигнал платформы (summarize(input, agent, signal))
  //     прерывает его сразу. Без них зависший поставщик держал сжатие и ход агента неограниченно. Отказ — исключение с
  //     причиной; зовущий (dsh-pamyat-kompakt-dsh) отдаёт тогда родную сводку платформы, сессия не тронута.
  // EN: Deadline and cancellation: the model call is bounded by PREDEL_SVODKI_MS, and the platform signal
  //     (summarize(input, agent, signal)) aborts it at once. Without them a hung provider held compaction and the
  //     agent turn indefinitely. A refusal is an exception with a reason; the caller then falls back to the native
  //     summary, the session is untouched.
  const upravlenie = new AbortController();
  const srok = setTimeout(() => upravlenie.abort(new Error(`сводка: нет ответа модели за ${PREDEL_SVODKI_MS} мс — сессию НЕ трогаю`)), PREDEL_SVODKI_MS);
  const otmena = () => upravlenie.abort(new Error(`сводка: отменена платформой (${String(signal?.reason?.message ?? signal?.reason ?? 'abort').slice(0, 120)}) — сессию НЕ трогаю`));
  if (signal?.aborted) otmena(); else signal?.addEventListener?.('abort', otmena, { once: true });
  let otvet, telo;
  try {
    otvet = await fetch(KOMPAKT_ADRES, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${klyuch}` },
      body: JSON.stringify({
        model: KOMPAKT_MODEL,
        messages: [{ role: 'system', content: sistemnyj }, { role: 'user', content: vhod }],
        max_tokens: predelVyhoda,   // RU: остаток окна, не потолок (см. выше) · EN: remaining window, not the ceiling (see above)
        ...(KOMPAKT_RAZMYSHLENIYA ? {} : { thinking: { type: 'disabled' } }),
        stream: false,
      }),
      signal: upravlenie.signal,
    });
    if (!otvet.ok) throw new Error(`сводка: HTTP ${otvet.status} ${(await otvet.text()).slice(0, 200)}`);
    telo = await otvet.json();
  } finally { clearTimeout(srok); signal?.removeEventListener?.('abort', otmena); }
  // RU: Расход печатается ДО проверки содержимого: за пустой ответ тоже платим, а печать после throw не
  //     состоялась бы ровно там, где цена уже уплачена.
  // EN: Cost is printed BEFORE the content check: an empty answer is paid for too, and printing after a throw
  //     would not happen exactly where the price was already paid.
  for (const stroka of strokiRashoda(telo?.usage, NASTROJKA.ceny)) console.log(stroka);
  const svodka = telo?.choices?.[0]?.message?.content ?? '';
  // RU: Пустая сводка и сбой сети неразличимы без отдельной проверки: молчание здесь привело бы к переписыванию
  //     сессии пустотой.
  // EN: An empty summary and a network failure are indistinguishable without a separate check: silence here
  //     would rewrite the session with nothing.
  if (!svodka.trim()) throw new Error('сводка пуста — сессию НЕ трогаю');
  // RU: Канонический промт требует метку [MODE=ACTIVE] или [MODE=DIALOG] в первой строке; ответ на задачу
  //     вместо сводки не принимаем.
  // EN: The canonical prompt requires the [MODE=ACTIVE] or [MODE=DIALOG] tag on the first line; an answer to
  //     the task instead of a summary is rejected.
  if (sistemnyj.includes('[MODE=ACTIVE]') && sistemnyj.includes('[MODE=DIALOG]')) {
    const { tekst, perenesena } = metkaVPervuyuStroku(svodka);
    if (!MODE_V_NACHALE.test(tekst)) {
      const pervaya = svodka.trimStart().split('\n')[0].slice(0, 90);
      sohranitOtkaz(vhod, svodka);
      throw new Error(`сводка нарушает договор промта: нет первой строки MODE и непустого тела; ответ не принят · первая строка: «${pervaya}»`);
    }
    if (perenesena) console.log(`[kompakt-nash ${VERSIYA}] метка режима перенесена в первую строку (стояла в строке ${perenesena})`);
    const provereno = proveritPuti(tekst, vhod);
    sohranitUdachu(vhod, provereno);
    return provereno;
  }
  const provereno = proveritPuti(svodka, vhod);
  sohranitUdachu(vhod, provereno);
  return provereno;
}

// RU: След отказа: отвергнутый ответ и вход, на котором он родился, кладутся в дом агента — иначе причину
//     живого отказа нечем разобрать (вход собирает платформа, и повтор его точно не восстанавливает). Каталог
//     700, файлы 600, храним последние OTKAZOV_HRANIT пар. Любая ошибка здесь — строка журнала, а не отказ
//     сводки.
//     Внутри — стенограмма беседы агента (тот же предмет, что его сессия), поэтому только его дом, никуда
//     наружу.
//     Удачные сводки тоже: последние UDACH_HRANIT пар «вход + сводка» в соседнем каталоге udachi-kompakta — без
//     входа разбор качества сводки возможен лишь, пока цела сессия.
// EN: Refusal trace: the rejected answer and the input that produced it are stored in the agent's home —
//     otherwise a live refusal cannot be analysed (the platform assembles the input, and a retry does not
//     reproduce it exactly). Directory 700, files 600, the last OTKAZOV_HRANIT pairs are kept. Any error here
//     is a log line, not a summary failure.
//     The content is the agent's conversation transcript (the same subject as its session), so it stays in its
//     home only, never outside.
//     Successful summaries too: the last UDACH_HRANIT "input + summary" pairs in the sibling directory
//     udachi-kompakta — without the input, summary quality can be analysed only while the session is intact.
const OTKAZOV_HRANIT = 20;
const UDACH_HRANIT = 5;
function sohranitOtkaz(vhod, otvet) {
  sohranitSled(process.env.KOMPAKT_OTKAZY ?? pathK.join(process.env.HOME || "/nonexistent", "pamyat", "otkazy-kompakta"),
    OTKAZOV_HRANIT, vhod, otvet, "отказ");
}
function sohranitUdachu(vhod, svodka) {
  sohranitSled(process.env.KOMPAKT_UDACHI ?? pathK.join(process.env.HOME || "/nonexistent", "pamyat", "udachi-kompakta"),
    UDACH_HRANIT, vhod, svodka, "удачная сводка");
}
function sohranitSled(kat, hranit, vhod, otvet, chto) {
  try {
    fsK.mkdirSync(kat, { recursive: true, mode: 0o700 });
    const shtamp = new Date().toISOString().replace(/[:.]/g, "-");
    for (const [imya, tekst] of [["vhod", vhod], ["otvet", otvet]]) {
      fsK.writeFileSync(pathK.join(kat, `${shtamp}-${imya}.txt`), tekst, { mode: 0o600, flag: "wx" });
    }
    const vse = fsK.readdirSync(kat).filter((f) => /-(vhod|otvet)\.txt$/.test(f)).sort();
    for (const f of vse.slice(0, Math.max(0, vse.length - 2 * hranit))) fsK.unlinkSync(pathK.join(kat, f));
    console.log(`[kompakt-nash ${VERSIYA}] след «${chto}» сохранён: ${kat}/${shtamp}-{vhod,otvet}.txt`);
  } catch (e) {
    console.log(`[kompakt-nash ${VERSIYA}] ⚠️ след «${chto}» НЕ сохранён: ${String(e?.message ?? e).slice(0, 160)}`);
  }
}

// RU: Перенос метки режима. Модель сводки (быстрая, без размышлений) примерно в трети ответов ставит перед
//     меткой заголовок: «# Сводка…\n\n[MODE=ACTIVE]», «# [MODE=ACTIVE] Сводка…», «**[MODE=ACTIVE]** — …». Замер
//     на повторе одного входа: 6 отказов из 16, в 5 из них метка в первых строках и сводка полноценная — барьер
//     отвергал хорошую сводку.
//     Метку, найденную в первых STROK_POISKA_METKI строках, переносим наверх. Метки там нет — ответ остаётся
//     отвергнутым: ответ на задачу вместо сводки метки не несёт. Чего не ловит: чужую метку, процитированную
//     моделью в первых строках ответа на задачу.
//     Пути ответа против входа. Однажды сводка назвала «незавершённую задачу» с каталогом, которого во входе не
//     было (вход сохранён целиком, совпадений 0) — модель выдумала, агент поверил. Путь в обратных кавычках
//     (есть «/»; без пробелов, стрелок, многоточий, «*», «<…>»; хвост «:N» / «:N–M» снимается) обязан
//     встречаться во ВХОДЕ последним куском. Нет — рядом ставится пометка POMETKA_NET_VO_VHODE и пишется строка
//     журнала с числом. Не удаляем: пометка оставляет решение читающему, удаление молча теряло бы честный путь
//     при ложном срабатывании.
//     Замер до работы (15 пар «вход/ответ» трёх агентов): путей 219, пометок 1 — ровно тот выдуманный.
//     Чего не ловит: выдуманные ИМЕНА и задачи без пути — их держит только правило промта, то есть слово
//     модели. Механически ловится ФОРМА пути, а не выдумка как класс. Путь, чей последний кусок случайно
//     встречается во входе в другом месте, пройдёт.
// EN: Mode tag relocation. The summary model (fast, no reasoning) puts a heading before the tag in about a
//     third of answers: "# Summary…\n\n[MODE=ACTIVE]", "# [MODE=ACTIVE] Summary…", "**[MODE=ACTIVE]** — …".
//     Measured on a repeat of one input: 6 refusals of 16, in 5 of them the tag is in the first lines and the
//     summary is complete — the barrier rejected a good summary.
//     A tag found within the first STROK_POISKA_METKI lines is moved to the top. No tag there — the answer
//     stays rejected: an answer to the task instead of a summary carries no tag. Not caught: a foreign tag
//     quoted by the model in the first lines of a task answer.
//     Answer paths versus input. Once a summary named an "unfinished task" with a directory absent from the
//     input (input saved whole, 0 matches) — the model invented it, the agent believed it. A path in backticks
//     (contains "/"; no spaces, arrows, ellipses, "*", "<…>"; a ":N" / ":N–M" suffix is stripped) must occur in
//     the INPUT by its last segment. If not, POMETKA_NET_VO_VHODE is placed next to it and a log line with the
//     count is written. It is not deleted: the mark leaves the decision to the reader; deletion would silently
//     lose an honest path on a false positive.
//     Measured before the work (15 input/answer pairs from three agents): 219 paths, 1 mark — exactly the
//     invented one.
//     Not caught: invented NAMES and tasks without a path — only the prompt rule (the model's word) holds them.
//     Mechanically the FORM of a path is caught, not invention as a class. A path whose last segment happens to
//     occur elsewhere in the input will pass.
export const POMETKA_NET_VO_VHODE = '⚠️ НЕТ ВО ВХОДЕ СЖАТИЯ';
export function putiVneVhoda(svodka, vhod) {
  const net = new Set(); let proveryeno = 0;
  for (const m of String(svodka).matchAll(/`([^`\n]{2,120})`/gu)) {
    const t = m[1];
    if (!t.includes('/') || /\s|→|↔|…|\.\.\.|\*|<[^>]*>/u.test(t)) continue;
    const kuski = t.replace(/:\d+(?:[–-]\d+)?$/u, '').split('/').filter(Boolean);
    if (!kuski.length) continue;
    proveryeno++;
    if (!String(vhod).includes(kuski[kuski.length - 1])) net.add(t);
  }
  return { net: [...net], proveryeno };
}
export function pometitPutiVneVhoda(svodka, vhod) {
  const { net, proveryeno } = putiVneVhoda(svodka, vhod);
  let tekst = svodka;
  for (const t of net) tekst = tekst.split('`' + t + '`').join('`' + t + '` (' + POMETKA_NET_VO_VHODE + ')');
  return { tekst, net, proveryeno };
}
// RU: Проверка путей — не ворота сводки. Упала — проходит ИСХОДНАЯ сводка и строка журнала о падении: сжатие не
//     должно рухнуть из-за прибора, который его только размечает. Третий параметр — подмена для стенда
//     (подставная ошибка); рабочий путь его не передаёт.
// EN: The path check is not a gate for the summary. If it fails, the ORIGINAL summary passes with a log line
//     about the failure: compaction must not collapse because of an instrument that only annotates it. The
//     third parameter is a stand override (an injected error); the production path does not pass it.
export function proveritPuti(svodka, vhod, pometit = pometitPutiVneVhoda) {
  let rez;
  try { rez = pometit(svodka, vhod); }
  catch (e) {
    console.log(`[kompakt-nash ${VERSIYA}] ⚠️ проверка путей упала: ${String(e?.message ?? e).slice(0, 160)} — сводка передана БЕЗ разметки`);
    return svodka;
  }
  const { tekst, net, proveryeno } = rez;
  console.log(`[kompakt-nash ${VERSIYA}] пути ответа против входа: проверено ${proveryeno}, НЕТ ВО ВХОДЕ ${net.length}`
    + (net.length ? ` — помечены в сводке: ${net.slice(0, 5).join(' · ')}${net.length > 5 ? ' …' : ''}` : ''));
  return tekst;
}

const MODE_V_NACHALE = /^\[MODE=(?:ACTIVE|DIALOG)\][ \t]*\r?\n\s*\S/u;
const STROK_POISKA_METKI = 5;
export function metkaVPervuyuStroku(svodka) {
  const tekst = svodka.trimStart();
  if (MODE_V_NACHALE.test(tekst)) return { tekst: svodka, perenesena: 0 };
  const stroki = tekst.split('\n');
  for (let i = 0; i < Math.min(stroki.length, STROK_POISKA_METKI); i++) {
    const m = stroki[i].match(/[*_`]*\[MODE=(ACTIVE|DIALOG)\][*_`]*/u);
    if (!m) continue;
    const ostatok = stroki[i].replace(m[0], ' ').replace(/[ \t]+/g, ' ').trim().replace(/^(#+ )?[—–:-]\s*/u, '$1');
    if (/^[#*\s]*$/u.test(ostatok)) stroki.splice(i, 1); else stroki[i] = ostatok;
    return { tekst: `[MODE=${m[1]}]\n\n` + stroki.join('\n').trim(), perenesena: i + 1 };
  }
  return { tekst: svodka, perenesena: 0 };
}

// RU: Переписывает файл сессии: [граница компакта] + [сводка сообщением] + [свежий хвост]. Хвост идёт ПОСЛЕ
//     границы — иначе SDK его не поднимет (проверено на практике).
// EN: Rewrites the session file: [compaction boundary] + [summary as a message] + [fresh tail]. The tail goes
//     AFTER the boundary — otherwise the SDK will not load it (learnt in practice).
async function fizicheskiyKompakt(put, sessionId, zanjato) {
  if (!HVOST_GODEN) return { sdelano: false, pochemu: `${HVOST_NEGODEN} — сессию НЕ трогаю` };
  if (!fsK.existsSync(put)) return { sdelano: false, pochemu: `файла сессии нет: ${put}` };
  const stroki = fsK.readFileSync(put, 'utf-8').split('\n').filter(Boolean);
  if (stroki.length <= KOMPAKT_HVOST + 2) return { sdelano: false, pochemu: `в сессии ${stroki.length} строк — резать нечего` };

  const dlyaSvodki = stroki.slice(0, Math.max(1, stroki.length - KOMPAKT_HVOST));
  const { tekst, hodov, znakov, otbrosheno, obrezano, vsegoZnakov } = stenogrammaHvostom(dlyaSvodki, KOMPAKT_VHOD);
  if (!tekst) return { sdelano: false, pochemu: 'в стенограмме нет текстовых ходов' };

  // RU: ── Предохранитель «не навреди» ──
  //     Беда измерена в работе: 9108 знаков сводки из 8833 знаков прозы — сжатие УВЕЛИЧИЛО объём. Один случай
  //     из 54 за сутки; снаружи неотличим от нормы — строка о готовой сводке одинакова при обоих исходах.
  //     Что делаем: берём меньшее — сводку, если она короче прозы, иначе прозу. Длины сравниваются напрямую
  //     (svodka.length против tekst.length), а не через znakov — та величина означает другое.
  //     Метка разная: положить прозу под словом «СВОДКА» — ложная подпись; и читающий, и модель приняли бы
  //     сырую переписку за сжатый пересказ.
  // EN: ── The "do no harm" fuse ──
  //     The fault was measured in production: a 9108-character summary of 8833 characters of prose — compaction
  //     INCREASED the size. One case in 54 per day; from outside it looks normal — the "summary ready" line is
  //     the same in both outcomes.
  //     What we do: take the smaller — the summary if shorter than the prose, otherwise the prose. Lengths are
  //     compared directly (svodka.length vs tekst.length), not via znakov — that quantity means something else.
  //     Different label: putting prose under the word "SUMMARY" would be a false caption; both the reader and
  //     the model would take the raw conversation for a compressed retelling.
  let svodka = '';
  let reshenie = chtoOtdat(Infinity, tekst.length, KOMPAKT_MIN_PROZA);
  if (reshenie.otdano !== 'proza-porog') {
    svodka = await svodkaNashejModelyu(tekst);
    reshenie = chtoOtdat(svodka.length, tekst.length, KOMPAKT_MIN_PROZA);
  }
  const { otdano, pochemu: pochemuOtdano } = reshenie;
  console.error(`[kompakt ${VERSIYA}] ${pochemuOtdano}`);
  const soderzhimoe = otdano === 'svodka' ? svodka : tekst;

  const zapas = `${put}.bak-pre-kompakt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fsK.copyFileSync(put, zapas);

  let cwdIz = process.cwd(), versiya, vetka;
  for (let i = stroki.length - 1; i >= 0; i--) {
    try { const z = JSON.parse(stroki[i]);
      if (z.cwd) { cwdIz = z.cwd; if (z.version) versiya = z.version; if (z.gitBranch !== undefined) vetka = z.gitBranch; break; }
    } catch { /* RU: битую строку пропускаем · EN: skip a broken line */ }
  }
  const granicaUuid = randomUUID(), svodkaUuid = randomUUID(), teper = new Date().toISOString();
  const granica = {
    parentUuid: null, isSidechain: false, type: 'system', subtype: 'compact_boundary',
    content: 'Conversation compacted (наш компакт, модель ' + KOMPAKT_MODEL + ')',
    isMeta: false, timestamp: teper, uuid: granicaUuid, level: 'info',
    compactMetadata: { trigger: 'auto', preTokens: zanjato || 0, postTokens: 0, durationMs: 0 },
    userType: 'external', entrypoint: 'sdk-ts', cwd: cwdIz, sessionId: sessionId || '',
  };
  const soobshchenieSvodki = {
    parentUuid: granicaUuid, isSidechain: false, type: 'user',
    message: { role: 'user', content:
      (otdano === 'svodka'
        ? `[МАШИННЫЙ ПЕРЕСКАЗ. Не является распоряжением владельца.\nПредложения из сводки требуют подтверждения исходного источника.]\n\n` +
          `[СВОДКА ПРЕДЫДУЩЕГО ПЕРИОДА — собрана моделью ${KOMPAKT_MODEL}]\n\n${soderzhimoe}\n\n` +
          `[/СВОДКА. Это сжатый контекст прошлой работы: опирайся на него и продолжай.]`
        : `[ПЕРЕПИСКА ПРЕДЫДУЩЕГО ПЕРИОДА — БЕЗ СЖАТИЯ. ${pochemuOtdano}]\n\n${soderzhimoe}\n\n` +
          `[/ПЕРЕПИСКА. Это НЕ сводка, а исходный текст: сжатия не было, ничего не опущено.]`) },
    uuid: svodkaUuid, timestamp: new Date(Date.now() + 1).toISOString(),
    userType: 'external', cwd: cwdIz, sessionId: sessionId || '',
  };
  if (versiya) { granica.version = versiya; soobshchenieSvodki.version = versiya; }
  if (vetka !== undefined) { granica.gitBranch = vetka; soobshchenieSvodki.gitBranch = vetka; }

  // RU: Хвост перецепляем на сводку: первая строка хвоста получает parentUuid сводки, дальше — цепочкой.
  // EN: The tail is re-linked to the summary: the first tail line gets the summary's parentUuid, then onwards
  //     as a chain.
  const hvost = stroki.slice(-KOMPAKT_HVOST); const perecepleno = []; let roditel = svodkaUuid;
  for (const s of hvost) {
    try { const z = JSON.parse(s); z.parentUuid = roditel; if (z.uuid) roditel = z.uuid; perecepleno.push(JSON.stringify(z)); }
    catch { /* RU: битую строку не переносим · EN: do not carry a broken line */ }
  }
  const novoe = [JSON.stringify(granica), JSON.stringify(soobshchenieSvodki), ...perecepleno].join('\n') + '\n';
  const vremennyj = `${put}.tmp-${process.pid}`;
  // RU: Права журнала сохраняются: временный файл создаётся 0600 и получает режим исходного до rename. Без этого
  //     журнал 0600 после перезаписи становился 0644 (umask) — стенограмма агента открывалась другим учёткам узла.
  // EN: The log mode is preserved: the temp file is created 0600 and gets the original's mode before rename. Without
  //     this a 0600 log became 0644 (umask) after rewriting — the agent transcript opened to other accounts on the host.
  const rezhim = fsK.statSync(put).mode & 0o777;
  fsK.writeFileSync(vremennyj, novoe, { mode: 0o600 }); fsK.chmodSync(vremennyj, rezhim); fsK.renameSync(vremennyj, put);   // RU: атомарно, без полуфайла · EN: atomic, no half-written file
  return { sdelano: true, bylo: stroki.length, stalo: perecepleno.length + 2,
           svodkaZnakov: soderzhimoe.length, otdano, pochemuOtdano, vhodZnakov: znakov, vhodHodov: hodov, zapas,
           otbrosheno, obrezano, vsegoZnakov };
}

// RU: ── Самопроверка компакта: KOMPAKT_SAMOPROVERKA=1 node index.mjs ──
//     Проверяет не «умеет ли сжимать», а границы: не тронуть сессию при отказе сводки, переписать ровно хвост +
//     2 строки, сохранить запасную копию, выдержать цепочку parentUuid. Знаменатель — из объявленного списка.
//     Коды: 0 чисто · 1 расхождение · 2 слепота.
//     Пять проб идут через живой вызов модели и без ключа слепы; пробы ступеней требуют прочитанного порога
//     (файл D).
// EN: ── Compaction self-check: KOMPAKT_SAMOPROVERKA=1 node index.mjs ──
//     It checks not "can it compress" but the boundaries: do not touch the session if the summary fails,
//     rewrite exactly tail + 2 lines, keep a backup copy, preserve the parentUuid chain. The denominator comes
//     from the declared list. Exit codes: 0 clean · 1 mismatch · 2 blind.
//     Five probes go through a live model call and are blind without a key; the step probes need a threshold
//     that was read (a D file).
if (process.env.KOMPAKT_SAMOPROVERKA) {
  const OBYAVLENO = ['malo-strok-ne-rezhem', 'svodka-poluchena', 'granica-pervoy-strokoy',
                     'cepochka-ne-rvyotsya', 'zapas-raven-originalu', 'otkaz-svodki-ne-trogaet-sessiyu',
                     'bolshoy-hod-berjotsya-hvostom', 'malyy-hod-ne-obrezaetsya',
                     'stupen-rastyot-s-zanjatostyu', 'stupen-nizhe-pervoy-doli-otsutstvuet'];
  const itogi = new Map();
  const ok = (imya, horosho, chto) => itogi.set(imya, [horosho, chto]);
  const bazaS = fsK.mkdtempSync('/tmp/kompakt-samoproverka-');
  const sdelatSessiyu = (strok) => {
    const put = pathK.join(bazaS, 'sessiya.jsonl'); const l = []; let rod = null;
    for (let i = 0; i < strok; i++) {
      const uuid = randomUUID();
      l.push(JSON.stringify({ parentUuid: rod, uuid, type: 'user', cwd: '/tmp/example-workspace', version: '1.0.0',
        message: { role: i % 2 ? 'assistant' : 'user', content: `МЕТКА-${i} ` + 'я'.repeat(400) } }));
      rod = uuid;
    }
    fsK.writeFileSync(put, l.join('\n') + '\n'); return put;
  };
  // RU: Пара проб про большой ход. Платформа подаёт вклеенную историю одним сообщением; прежняя редакция
  //     обрывала набор на нём и отдавала в сводку 0,4% прозы. Обе половины обязательны: без второй «обрезать
  //     всегда» тоже было бы зелёным.
  // EN: A pair of probes about a large turn. The platform passes the pasted history as one message; an earlier
  //     version stopped at it and gave 0.4% of the prose to the summary. Both halves are required: without the
  //     second, "always trim" would be green too.
  {
    const bolshoy = JSON.stringify({ message: { role: 'user', content: 'Б'.repeat(5000) } });
    const malyy   = JSON.stringify({ message: { role: 'assistant', content: 'М'.repeat(100) } });
    const r = stenogrammaHvostom([bolshoy, malyy], 1000);
    ok('bolshoy-hod-berjotsya-hvostom',
       r.znakov > 0 && /НАЧАЛО ХОДА ОТРЕЗАНО/.test(r.tekst) && r.otbrosheno > 0 && r.obrezano === 1,
       `знаков ${r.znakov}, отброшено ${r.otbrosheno}, обрезано ${r.obrezano}`);
    const r2 = stenogrammaHvostom([malyy], 1000);
    ok('malyy-hod-ne-obrezaetsya',
       r2.znakov > 0 && !/НАЧАЛО ХОДА ОТРЕЗАНО/.test(r2.tekst) && r2.otbrosheno === 0 && r2.obrezano === 0,
       `знаков ${r2.znakov}, отброшено ${r2.otbrosheno}`);
  }
  try {
    const malo = sdelatSessiyu(5);
    const r1 = await fizicheskiyKompakt(malo, 'proba', 100);
    ok('malo-strok-ne-rezhem', r1.sdelano === false && /резать нечего/.test(r1.pochemu || ''), r1.pochemu || 'порезал!');

    const put = sdelatSessiyu(120);
    const doTogo = fsK.readFileSync(put, 'utf-8');
    const r2 = await fizicheskiyKompakt(put, 'proba-2', 800000);
    ok('svodka-poluchena', r2.sdelano === true && r2.svodkaZnakov > 0, r2.sdelano ? `сводка ${r2.svodkaZnakov} зн.` : r2.pochemu);
    const posle = fsK.readFileSync(put, 'utf-8').split('\n').filter(Boolean).map(s => JSON.parse(s));
    ok('granica-pervoy-strokoy', posle[0]?.subtype === 'compact_boundary' && posle[1]?.type === 'user',
       `первая ${posle[0]?.subtype}, вторая ${posle[1]?.type}`);
    let cel = true, rod = posle[0]?.uuid;
    for (let i = 1; i < posle.length; i++) { if (posle[i].parentUuid !== rod) { cel = false; break; } rod = posle[i].uuid; }
    ok('cepochka-ne-rvyotsya', cel, cel ? `${posle.length} строк цепочкой` : 'цепочка рвётся');
    ok('zapas-raven-originalu', fsK.readFileSync(r2.zapas, 'utf-8') === doTogo, `запас ${r2.zapas}`);

    // RU: Порча: негодный ключ → сводки нет → сессия обязана остаться нетронутой.
    // EN: Corruption: an invalid key → no summary → the session must stay untouched.
    const put3 = sdelatSessiyu(120); const do3 = fsK.readFileSync(put3, 'utf-8');
    // RU: Подменяем ВСЕ имена из списка: годное имя, оставшееся в стороне, сделало бы пробу слепой.
    // EN: Override ALL names in the list: a valid name left aside would make the probe blind.
    const staryeKlyuchi = IMENA_KLYUCHA.map((i) => [i, process.env[i]]);
    for (const i of IMENA_KLYUCHA) process.env[i] = 'zavedomo-negodnyj-klyuch';
    let upalo = false;
    try { await fizicheskiyKompakt(put3, 'proba-3', 800000); } catch { upalo = true; }
    for (const [i, v] of staryeKlyuchi) { if (v === undefined) delete process.env[i]; else process.env[i] = v; }
    ok('otkaz-svodki-ne-trogaet-sessiyu', upalo && fsK.readFileSync(put3, 'utf-8') === do3,
       upalo ? 'отказ назван, файл цел' : 'отказа НЕ БЫЛО — проба слепа');
  } catch (e) {
    console.error(`[самопроверка] 🔴 СТЕНД ОБОРВАЛСЯ: ${e?.stack ?? e}`);
  } finally { try { fsK.rmSync(bazaS, { recursive: true, force: true }); } catch {} }
  let z = 0, k = 0, sl = 0;
  // RU: Ступени занятости: обе половины пары. Без второй «ступень есть всегда» тоже было бы зелёным.
  // EN: Occupancy steps: both halves of the pair. Without the second, "a step always exists" would be green
  //     too.
  try {
    const p = KOMPAKT_POROG;
    ok('stupen-rastyot-s-zanjatostyu',
       stupenZanjatosti(p * 0.61) === 0 && stupenZanjatosti(p * 0.81) === 1 &&
       stupenZanjatosti(p * 0.96) === 2 && stupenZanjatosti(p) === 2,
       `61%→${stupenZanjatosti(p * 0.61)} · 81%→${stupenZanjatosti(p * 0.81)} · 96%→${stupenZanjatosti(p * 0.96)}`);
    ok('stupen-nizhe-pervoy-doli-otsutstvuet',
       stupenZanjatosti(0) === -1 && stupenZanjatosti(p * 0.59) === -1,
       `0→${stupenZanjatosti(0)} · 59%→${stupenZanjatosti(p * 0.59)}`);
  } catch (e) { ok('stupen-rastyot-s-zanjatostyu', false, 'СЛЕПОТА: ' + e.message); }

  for (const imya of OBYAVLENO) {
    const r = itogi.get(imya);
    if (!r) { sl++; console.error(`  ⚪ СЛЕПОТА ${imya}`); continue; }
    if (r[0]) { z++; console.error(`  ✅ ${imya} — ${r[1]}`); } else { k++; console.error(`  🔴 ${imya} — ${r[1]}`); }
  }
  console.error(`[самопроверка компакта] объявлено: ${OBYAVLENO.length} · прогнано: ${z + k} · зелёных: ${z} · красных: ${k} · слепых: ${sl}`);
  process.exit(sl ? 2 : (k ? 1 : 0));
}

// RU: Источники экспортируются, а не только печатаются: проба обязана судить по объекту, выданному наружу, а не
//     по строке журнала — строку можно напечатать и не применить.
// EN: Sources are exported, not only printed: a probe must judge by the object handed out, not by a log line —
//     a line can be printed without being applied.
export const ISTOCHNIKI = Object.freeze({
  model: IST_MODEL.ist, hvost: IST_HVOST.ist, okno: IST_OKNO.ist,
  adres: IST_ADRES.ist, imena: IST_IMENA.ist,
});

export { POROG_PRESETA, stupenZanjatosti, putSessii, stenogrammaHvostom, svodkaNashejModelyu,
         fizicheskiyKompakt, KOMPAKT_POROG, KOMPAKT_OKNO, KOMPAKT_STUPENI, STUPEN_SESSII,
         KOMPAKT_VHOD, KOMPAKT_HVOST, KOMPAKT_MODEL, OKNO_MODELI, KOMPAKT_ADRES,
         KOMPAKT_SHLYUZOVOJ, KOMPAKT_PLATFORMENNYJ, reshitKompakt, polnayaZanyatost, vedraPoImeni, VEDRA_POSTAVSHCHIKA,
         zanyatostIzZhurnala, zanyatostPoSvezhemuZhurnalu };
