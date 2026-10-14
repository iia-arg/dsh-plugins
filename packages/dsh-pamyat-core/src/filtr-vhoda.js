/**
 * RU: Фильтр входа очищает перечисленные невидимые/управляющие символы и распознаёт известные формы секретов. Он не защищает от смыслового отравления: добросовестный пересказ чужой инструкции моделью неотличим по форме от статьи об инструкции. Отметка происхождения сама не является решением о доверии. Границы: омоглифы обходят слова-объявления, NFC разные буквы не исправляет; base64 может быть вложением; короткие и неизвестные формы не покрыты. Структурные правила и энтропия дополняют друг друга, поскольку покрывают разные ключи. Необъявленный hex-ключ длиной 32/40/64 неотличим от md5/sha1/sha256 и проходит исключение для хешей.
 * EN: The input filter removes listed invisible/control characters and recognizes known secret shapes. It does not prevent semantic poisoning: a model faithfully retelling an external instruction is structurally indistinguishable from an article about that instruction. A provenance annotation is not itself a trust decision. Limits: homoglyphs bypass declaration words, and NFC does not fix different letters; base64 may be an attachment; short and unknown forms are not covered. Structural rules and entropy complement each other because they cover different keys. An undeclared hex key of length 32/40/64 is indistinguishable from md5/sha1/sha256 and passes the hash exclusion.
 */

// RU: Невидимые и управляющие символы перечислены по классам, чтобы область чистки была проверяема.
// EN: List invisible and control characters by class so the cleanup scope can be verified.
const NEVIDIMYE = [
  { imya: 'nevidimye', re: /[­᠎​‌‍⁠-⁤﻿￹-￻]/gu },
  { imya: 'bidi',      re: /[‎‏‪-‮⁦-⁩]/gu },
  // RU: TAG U+E0000…U+E007F может нести текст, невидимый человеку, но доступный модели; визуальная проверка его не обнаружит.
  // EN: TAG U+E0000…U+E007F may carry text invisible to a person but readable by a model; visual inspection cannot detect it.
  { imya: 'tag',       re: /[\u{E0000}-\u{E007F}]/gu },
];
const PORog_TREVOGI_ZNAKOV = 20;    // RU: Тревога по числу начинается с 20 удалённых единиц; одиночный BOM считается обычным мусором копирования.
// EN: Count-based alarm starts at 20 removed units; a lone BOM is treated as ordinary copying debris.
const PORog_TREVOGI_DOLYA  = 0.02;  // RU: Тревога по доле начинается с 2% при достаточной длине. Структурные признаки ниже используют собственную форму и пороги, без общего порога энтропии.
// EN: Fraction-based alarm starts at 2% on sufficiently long text. Structural signals below use their own shapes and thresholds, without the common entropy threshold.
const STRUKTURNYE = [
  { imya: 'PEM',    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { imya: 'JWT',    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { imya: 'sk-',    re: /\bsk-[A-Za-z0-9]{20,}/ },
  { imya: 'github', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { imya: 'aws',    re: /\bAKIA[0-9A-Z]{16}\b/ },
  { imya: 'slack',  re: /\bxox[baprs]-[0-9A-Za-z-]{10,}/ },
  { imya: 'dsn',    re: /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s:@/]+:[^\s@/]+@/ },
  // RU: Токен Telegram узнаётся как 6–12 цифр, двоеточие, AA и не менее 30 знаков [A-Za-z0-9_-]. Энтропия не гарантирует находку, поскольку двоеточие разделяет части. AA отделяет форму от времени и числовых пар. Просмотр назад допускает префикс bot для адресов Bot API. Токены без AA, разорванные или закодированные этим правилом не покрыты.
  // EN: Recognize a Telegram token as 6–12 digits, a colon, AA, and at least 30 [A-Za-z0-9_-] characters. Entropy does not guarantee detection because the colon splits the parts. AA separates this shape from times and numeric pairs. Lookbehind permits the bot prefix used in Bot API URLs. Tokens without AA, split tokens, and encoded tokens are not covered by this rule.
  { imya: 'telegram', re: /(?:(?<=bot)|(?<![A-Za-z0-9_]))\d{6,12}:AA[A-Za-z0-9_-]{30,}/ },
];
// RU: Объявленный алфавитный кандидат начинается с 6 знаков, в отличие от энтропийного порога 20. Единый высокий порог терял бы короткие пароли; прямой проход по целому значению ниже имеет отдельный порог 8.
// EN: A declared alphabetic candidate starts at 6 characters, unlike the entropy threshold of 20. One high threshold would miss short passwords; the full-value pass below has a separate threshold of 8.
const DLINA_OBYAVLENNOGO = 6;
// RU: Для объявленного значения достаточно 2 классов алфавита: разделители могут разбить его на куски короче 6, поэтому отдельный проход судит целое значение. Значение одного класса здесь проходит как неоднозначное обычное слово; другие правила могут его найти.
// EN: A declared value needs only 2 alphabet classes: separators can split it into pieces shorter than 6, so a separate pass judges the complete value. A single-class value passes this check as an ambiguous ordinary word; other rules may detect it.
const PORog_KLASSOV_OBYAVLENNOGO = 2;
const OKNO_OBYAVLENIYA   = 40;   // RU: Окно объявления — 40 знаков до кандидата. Слова имеют один источник для алфавитного и UUID-проходов; требуются : или =, допускается закрывающая кавычка JSON. key включён вместе с помечающим режимом энтропии, чтобы key=<значение> оставалось запирающим. Граница Unicode перед key-семейством, pin/psk и русскими словами исключает омонимы monkey/отключ/spin; подчёркивание считается разделителем. Перед token/secret/password и родственными формами границы нет, чтобы ловить cftoken/dbpassword. ASCII \b не годится для кириллицы, поэтому используются свойства Unicode. Границы метода: слитные AWSKey/MyKey проходят; строгий режим может считать прозу key=abcdef объявлением. Унификация этих групп изменила бы покрытие.
// EN: The declaration window is 40 characters before the candidate. One word source serves alphabetic and UUID passes; : or = is required, with an optional closing JSON quote. key is included together with entropy annotation mode so key=<value> remains blocking. A Unicode boundary before the key family, pin/psk, and Russian words excludes homonyms such as monkey/отключ/spin; underscore is a separator. token/secret/password and related forms have no boundary so cftoken/dbpassword are detected. ASCII \b does not work for Cyrillic, so use Unicode properties. Limits: concatenated AWSKey/MyKey pass; strict mode may treat prose key=abcdef as a declaration. Making these groups uniform would alter coverage.
const SLOVA_S_GRANICEJ = 'api[-_ ]?key|apikey|key|privkey|private[-_ ]?key|preshared[-_ ]?key|psk|pin|пароль|ключ|токен|секрет';
const SLOVA_BEZ_GRANICY = 'password|passwd|pwd|token|secret|llat|credential';
// RU: Слабые признаки склонения («ключа:», «паролем:») и заголовка Authorization/Bearer только помечают, поскольку похожие формы встречаются в знаниях без секрета. Запирающий режим требует отдельного замера ложных срабатываний, а не общего ужесточения.
// EN: Weak inflection signals (“ключа:”, “паролем:”) and Authorization/Bearer headers annotate only because similar forms occur in knowledge without a secret. Blocking requires a separate false-positive measurement, not blanket tightening.
const SLOVA_SKLONENIE = 'ключ[аеиуом]|ключом|ключей|парол[яеию]|паролем|токен[аеиу]|токеном|секрет[аеиу]|секретом';
const ZAGOLOVOK_AVTORIZACII = 'authorization|bearer';
const SKLONENIE_RE = new RegExp('(?<![\\p{L}\\p{N}])(?:' + SLOVA_SKLONENIE + ')["\']?\\s*[:=]\\s*["\']?$', 'iu');
const ZAGOLOVOK_RE  = new RegExp('(?<![\\p{L}\\p{N}])(?:' + ZAGOLOVOK_AVTORIZACII + ')\\b[^\\p{L}\\p{N}]*$', 'iu');
// RU: Тире как разделитель не распознаётся: «ключ - значение» принято как проза, а не присваивание. Добавление такого правила потребовало бы пересмотра этого договора и стенда.
// EN: A dash separator is not recognized: “ключ - значение” is treated as prose rather than assignment. Adding this rule would require revisiting that contract and its test.

const SLOVA_OBYAVLENIYA = new RegExp(
  '(?:(?<![\\p{L}\\p{N}])(?:' + SLOVA_S_GRANICEJ + ')|(?:' + SLOVA_BEZ_GRANICY + '))'
  + '["\']?\\s*[:=]\\s*["\']?$', 'iu');
const DLINA_ENTROPIJNOJ  = 20;   // RU: Энтропийный порог длины — 20: 12 ловит короткие идентификаторы, а повышение выше 20 пропустило бы известные ключи ровно на границе.
// EN: The entropy length threshold is 20: 12 detects short identifiers, while raising it above 20 would miss known keys exactly at the boundary.
const ENTROPIYA_PORog    = 3.5;  // RU: Энтропия измеряется в битах на знак.
// EN: Entropy is measured in bits per character.

function entropiya(s) {
  const schet = new Map();
  for (const z of s) schet.set(z, (schet.get(z) ?? 0) + 1);
  let e = 0;
  for (const n of schet.values()) { const p = n / s.length; e -= p * Math.log2(p); }
  return e;
}
// RU: Классы определяются свойством Unicode: строчная, заглавная/титульная, буква без регистра, цифра, прочее. Перечни письменностей смешивали чужие буквы со знаками и занижали число классов, пропуская пароль. Это покрывает алфавит значения, но не новые слова-объявления: армянское, греческое и другие неизвестные названия секрета сами по себе не распознаются.
// EN: Classify by Unicode property: lowercase, uppercase/titlecase, uncased letter, digit, and other. Script lists grouped unfamiliar letters with symbols and undercounted classes, missing passwords. This covers the value alphabet but not new declaration words: Armenian, Greek, and other unknown words for a secret are not recognized on their own.
function klassovAlfavita(s) {
  return (/\p{Ll}/u.test(s) ? 1 : 0) + (/[\p{Lu}\p{Lt}]/u.test(s) ? 1 : 0)
       + (/[\p{Lo}\p{Lm}]/u.test(s) ? 1 : 0)
       + (/\p{N}/u.test(s) ? 1 : 0) + (/[^\p{L}\p{N}]/u.test(s) ? 1 : 0);
}

/**
 * RU: Найти секрет и вернуть {klass, pozicia} либо null. Значение и исходный фрагмент не возвращаются: защита не должна публиковать находку.
 * EN: Find a secret and return {klass, pozicia} or null. Return neither the value nor the original fragment: protection must not publish its finding.
 */
// RU: Экспорт режима сохраняет единственный договор для ядра, экспорта и других потребителей. Копии списка могли бы забыть UUID или принять strukturnyj за точное имя вместо префикса. zapiraet отвечает только о запрете класса; обращение с пометкой выбирает потребитель.
// EN: Exporting the mode preserves one contract for the core, export, and other consumers. Copied lists could omit UUID or treat strukturnyj as an exact name rather than a prefix. zapiraet answers only whether the class blocks; consumers decide how to handle annotations.
export function zapiraet(klass) {
  // RU: zapiraet спрашивает rezhim, не дублирует перечень классов.
  // EN: zapiraet queries rezhim rather than duplicating the class list.
  return rezhim(klass) === 'zapiraet';
}

// RU: Режим имеет три состояния: запирает, помечает, неизвестен. Простое false от zapiraet не отличает неизвестный класс; для внешнего экспорта это могло бы разрешить утечку. rezhim отдаёт границу знания, а потребитель выбирает отказ или пометку по своему договору.
// EN: Mode has three states: blocking, annotating, and unknown. A plain false from zapiraet does not distinguish an unknown class; an external exporter could permit leakage. rezhim exposes the knowledge boundary, and consumers choose refusal or annotation under their own contract.
export function rezhim(klass) {
  if (typeof klass !== 'string' || klass === '') return 'neizvesten';
  if (klass === 'obyavlennyj' || klass === 'uuid-obyavlennyj'
      || klass.startsWith('strukturnyj:')) return 'zapiraet';
  if (klass === 'entropiya' || klass === 'hex-bez-obyavleniya'
      || klass.startsWith('slabyj:')) return 'pomechaet';
  return 'neizvesten';
}

/**
 * RU: Единый предикат обращения к полю исключает ссылки вроде process.env.MY_TOKEN, не произвольные значения с точкой. Цифры в именах намеренно запрещены: иначе объявленный пароль Secret.Pass1 мог бы пройти как код. cfg.key2.value поэтому считается секретом — видимый отказ вместо тихого пропуска.
 * EN: One field-access predicate excludes references such as process.env.MY_TOKEN, not arbitrary dotted values. Digits in names are deliberately forbidden: otherwise the declared password Secret.Pass1 could pass as code. cfg.key2.value therefore counts as a secret, favoring visible refusal over a silent miss.
 */
// RU: Обращение должно начинаться с известного корня KORNI_DOSTUPA, иначе abc.def.ghi мог бы пройти как код. Незнакомый корень после объявления считается секретом; перечень корней меняется явно.
// EN: Field access must start with a known KORNI_DOSTUPA root, or abc.def.ghi could pass as code. An unknown root after a declaration counts as a secret; change the root list explicitly.
const KORNI_DOSTUPA = new Set([
  'process', 'config', 'cfg', 'this', 'ctx', 'opts', 'options', 'env',
  'settings', 'argv', 'params', 'self', 'globalThis', 'window', 'obj',
]);

function obrashchenie_k_polyu(znachenie) {
  if (/[0-9]/.test(znachenie)) return false;
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(znachenie)) return false;
  return KORNI_DOSTUPA.has(znachenie.split('.')[0]);
}

// RU: Крайние Markdown-знаки ` и * снимаются для исключений обращения к полю и слов синтаксиса: обрамление не должно ломать распознавание кода. Классы алфавита считают исходное значение, чтобы однородный пароль в кавычках не перестал обнаруживаться; проверка длины метки отдельно снимает обрамление.
// EN: Strip edge Markdown ` and * for field-access and syntax-word exceptions: wrapping must not break code recognition. Alphabet classes use the original value so a uniform password in backticks remains detectable; the marker-length check strips wrapping separately.
function bez_obramleniya(znachenie) {
  return znachenie.replace(/^[`*]+|[`*]+$/g, '');
}

// RU: lambda, lambda: и undefined исключаются как слова синтаксиса, а function проверяется отдельно. Рассматриваются слова от порога объявления 6. Произвольные вызовы и имена key=sortkeyfn/key=itemgetter(1)/password=getpass() остаются неоднозначными и могут маскироваться как слабые секреты.
// EN: Exclude lambda, lambda:, and undefined as syntax words, and check function separately. Consider words starting at the declaration threshold of 6. Arbitrary calls and names such as key=sortkeyfn/key=itemgetter(1)/password=getpass() remain ambiguous and may be masked as weak secrets.
const SLOVA_SINTAKSISA = /^(?:lambda:?|undefined)$/;
// RU: function исключается только с допустимым списком параметров, чей объединённый алфавит ниже PORog_KLASSOV_OBYAVLENNOGO. Любой хвост после function( открыл бы обход для секретов и тела функции. function(arg1)/function(my_cb) остаются маскируемыми из-за двух классов — намеренно в строгую сторону.
// EN: Exclude function only with an allowed parameter list whose combined alphabet stays below PORog_KLASSOV_OBYAVLENNOGO. Accepting any suffix after function( would allow secrets and function bodies to bypass the check. function(arg1)/function(my_cb) remain maskable because they have two classes, intentionally favoring strictness.
const FUNCTION_SPISOK = /^function\((?:\)|[A-Za-z_$][\w$]*(?:,[A-Za-z_$][\w$]*)*[,)]?)?$/;
function slovo_sintaksisa(znachenie) {
  if (SLOVA_SINTAKSISA.test(znachenie)) return true;
  if (!FUNCTION_SPISOK.test(znachenie)) return false;
  return klassovAlfavita(znachenie.slice('function('.length).replace(/[,)]/g, '')) < PORog_KLASSOV_OBYAVLENNOGO;
}

/**
 * RU: Не покрыты произвольный пароль в URL схема://имя:значение@узел и неизвестное объявление MYVAR=abc123def456 длиной 15 до порога энтропии 20. Отдельное правило DSN выше покрывает только перечисленные схемы баз. PEM и длинный base64 могут распознаваться структурой и энтропией. Расширять URL-покрытие следует отдельным правилом с проверкой ложных, не снижением общих порогов.
 * EN: Not covered: arbitrary passwords in URLs scheme://user:value@host and an unknown declaration MYVAR=abc123def456 of length 15 below the entropy threshold of 20. The separate DSN rule above covers only listed database schemes. PEM and long base64 may be detected by structure and entropy. Extend URL coverage with a separate rule and false-positive tests, not lower shared thresholds.
 */
export function najti_sekret(tekst) {
  for (const { imya, re } of STRUKTURNYE) {
    const m = re.exec(tekst);
    if (m) return { klass: 'strukturnyj:' + imya, pozicia: m.index };
  }
  // RU: UUID после объявления получает собственное имя uuid-obyavlennyj. Это уточняет диагностику, не добавляет покрытие: первый кусок UUID длиной 8 уже превышает объявленный порог 6. Правило стоит до общего прохода, чтобы форма не потеряла своё имя.
  // EN: A UUID after a declaration receives the specific name uuid-obyavlennyj. This refines diagnostics without adding coverage: its first 8-character segment already exceeds the declaration threshold of 6. Keep this rule before the general pass so the shape retains its name.
  {
    const re_uuid = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
    for (const m of tekst.matchAll(re_uuid)) {
      const do_nego = tekst.slice(Math.max(0, m.index - OKNO_OBYAVLENIYA), m.index);
      if (SLOVA_OBYAVLENIYA.test(do_nego)) return { klass: 'uuid-obyavlennyj', pozicia: m.index };
    }
  }

  // RU: Алфавит кандидата [A-Za-z0-9_] не склеивает пути, составные имена и соседние слова через / : . - + =. Удаление = также отделяет слово-объявление от значения; base64-padding не требуется для оценки длинного тела. Граница: base64 с каждым куском между + короче 20 может пройти. Отдельный прямой проход читает объявленное значение со спецзнаками до пробела: иначе куски короче 6 не создали бы кандидата. Он пропускает / как путь, требует 2 класса и длину 8 после снятия обрамления. Порог 8 не даёт 7-знаковой метке [скрыто попасть под свой фильтр; объявленные значения длиной 6–7 со спецзнаками могут пройти. Порог нельзя снижать без согласования формы метки. Идентификаторы вроде key: lastTouchedAt всё ещё запираются по этому строгому правилу.
  // EN: The candidate alphabet [A-Za-z0-9_] does not join paths, compound names, or neighboring words through / : . - + =. Removing = also separates a declaration word from its value; base64 padding is not needed to assess a long body. Limit: base64 whose segments between + are all shorter than 20 may pass. A separate direct pass reads declared values with symbols up to whitespace; otherwise segments shorter than 6 would create no candidate. It skips / as a path and requires 2 classes and length 8 after removing wrapping. The threshold of 8 keeps the 7-character marker [скрыто from matching its own filter; declared values of length 6–7 with symbols may pass. Do not lower the threshold without coordinating marker shape. Identifiers such as key: lastTouchedAt still block under this strict rule.
  {
    const re = new RegExp('(?:(?<![\\p{L}\\p{N}])(?:' + SLOVA_S_GRANICEJ + ')|(?:'
      + SLOVA_BEZ_GRANICY + '))["\']?\\s*[:=]\\s*["\']?([^\\s"\']{8,})', 'iu');
    const m = re.exec(tekst);
    if (m) {
      const znachenie = m[1];
      const put = znachenie.includes('/');
      // RU: Исключение проверяет известное обращение к полю, например process.env.MY_TOKEN, а не любое похожее имя. Другие объявленные значения остаются для этого и следующего алфавитного прохода.
      // EN: The exception checks known field access such as process.env.MY_TOKEN, not every identifier-like value. Other declared values remain subject to this pass and the next alphabetic pass.
      const identifikator = obrashchenie_k_polyu(bez_obramleniya(znachenie));
      // RU: Длину 8 проверяем после снятия обрамления: `[скрыто имеет 8 знаков с обратной кавычкой, но сама метка — 7 и не должна маскироваться снова. Классы значения сохраняют обнаружение пароля в кавычках.
      // EN: Check length 8 after removing wrapping: `[скрыто has 8 characters with the backtick, but the marker itself has 7 and must not be masked again. Value classes still detect a password in backticks.
      if (!put && !identifikator && !slovo_sintaksisa(bez_obramleniya(znachenie))
          && bez_obramleniya(znachenie).length >= 8
          && klassovAlfavita(znachenie) >= PORog_KLASSOV_OBYAVLENNOGO) {
        return { klass: 'obyavlennyj', pozicia: m.index };
      }
    }
  }

  for (const m of tekst.matchAll(/[A-Za-z0-9_]{6,}/g)) {
    const kandidat = m[0];
    // RU: Соседние / или : отводят кандидат как часть пути/адреса; точки и дефисы разделяют составные имена.
    // EN: Adjacent / or : excludes the candidate as part of a path/address; dots and hyphens split compound names.
    const sosed_do = tekst[m.index - 1] ?? '';
    const sosed_posle = tekst[m.index + kandidat.length] ?? '';
    if (sosed_do === '/' || sosed_posle === '/' || sosed_do === ':' ) continue;
    // RU: Объявление требует прилегающего : или =, а не просто слова в окне 40 знаков: фраза о расположении ключа не является его значением.
    // EN: A declaration requires an adjacent : or =, not merely a word in the 40-character window: prose about where a key is stored is not its value.
    const do_nego = tekst.slice(Math.max(0, m.index - OKNO_OBYAVLENIYA), m.index);
    // RU: Между разделителем и кандидатом допускаются части одного значения через точки/дефисы, без пробелов: короткий префикс sk-/pk-/rk- иначе не дотянул бы до порога 6 и скрыл весь ключ. Пути/адреса по-прежнему отводит соседняя проверка.
    // EN: Allow segments of one value joined by dots/hyphens between the separator and candidate, with no spaces: a short sk-/pk-/rk- prefix would otherwise fall below 6 and hide the whole key. The adjacent check still excludes paths/addresses.
    const hvost = do_nego.match(/[A-Za-z0-9_.-]*$/)?.[0] ?? '';
    const do_hvosta = hvost ? do_nego.slice(0, -hvost.length) : do_nego;
    if ((SLOVA_OBYAVLENIYA.test(do_nego) || SLOVA_OBYAVLENIYA.test(do_hvosta))
        && kandidat.length >= DLINA_OBYAVLENNOGO) {
      // RU: Исключение обращения проверяет всё значение от разделителя, не последний алфавитный кусок: MY_TOKEN само не раскрывает process.env.MY_TOKEN. Только известный корень, точки без дефисов и цифр считаются обращением; настоящие ключи с дефисами не исключаются. razdelitel относится к окну do_nego, поэтому для среза всего tekst добавляется начало окна. Глубины 0/30/200/7000 проверяет stend-pozicii-okna.mjs.
      // EN: The field-access exception inspects the whole value from the separator, not its last alphabetic segment: MY_TOKEN alone does not reveal process.env.MY_TOKEN. Only a known root with dots and no hyphens or digits counts as access; real hyphenated keys are not exempted. razdelitel is relative to the do_nego window, so add the window start when slicing all of tekst. stend-pozicii-okna.mjs checks depths 0/30/200/7000.
      const razdelitel = Math.max(do_nego.lastIndexOf(':'), do_nego.lastIndexOf('='));
      const nachalo_okna = m.index - do_nego.length;
      const znach_do_probela = razdelitel >= 0
        ? bez_obramleniya(tekst.slice(nachalo_okna + razdelitel + 1).match(/^\s*["']?([^\s"']+)/)?.[1] ?? kandidat)
        : kandidat;
      if (!obrashchenie_k_polyu(znach_do_probela) && !slovo_sintaksisa(znach_do_probela)) {
        return { klass: 'obyavlennyj', pozicia: m.index };
      }
    }
    // RU: Слабые признаки ниже только помечают: slabyj: не входит в запирающие.
    // EN: Weak signals below annotate only: slabyj: is not blocking.
    if (kandidat.length >= DLINA_OBYAVLENNOGO) {
      if (SKLONENIE_RE.test(do_nego)) return { klass: 'slabyj:sklonenie', pozicia: m.index };
      if (ZAGOLOVOK_RE.test(do_nego)) return { klass: 'slabyj:zagolovok', pozicia: m.index };
    }
    // RU: Hex без объявления не входит в энтропийный алфавит классов. Длины 32/40/64 исключены как md5/sha1/sha256; другие длины 24–128 помечаются кандидатом. По виду хеш и ключ неразличимы: настоящий hex-ключ исключённой длины пройдёт без объявления.
    // EN: Undeclared hex does not satisfy the entropy alphabet-class check. Lengths 32/40/64 are excluded as md5/sha1/sha256; other lengths 24–128 are annotated as candidates. Hashes and keys are indistinguishable by shape: a real hex key of an excluded length passes without a declaration.
    if (/^[0-9a-f]+$/.test(kandidat)) {
      const dlina = kandidat.length;
      const pohozhe_na_hesh = dlina === 32 || dlina === 40 || dlina === 64;
      if (!pohozhe_na_hesh && dlina >= 24 && dlina <= 128) {
        return { klass: 'hex-bez-obyavleniya', pozicia: m.index };
      }
      continue;   // RU: Исключение известной длины хеша; оно не доказывает, что значение действительно хеш.
      // EN: Exclude known hash lengths; this does not prove the value is actually a hash.
    }
    if (kandidat.length >= DLINA_ENTROPIJNOJ
        && klassovAlfavita(kandidat) >= 3
        && entropiya(kandidat) >= ENTROPIYA_PORog) {
      return { klass: 'entropiya', pozicia: m.index };
    }
  }
  return null;
}

/**
 * RU: Очистить невидимые знаки и вернуть {tekst, ochistka|null}. Пустой объект не возвращается: отсутствие изменения отличается от пустой отметки.
 * EN: Remove invisible characters and return {tekst, ochistka|null}. Return no empty object: no edit differs from an empty annotation.
 */
export function ochistit(tekst) {
  const dlina_do = tekst.length;
  const klassy = [];
  let out = tekst;
  for (const { imya, re } of NEVIDIMYE) {
    const bylo = out;
    out = out.replace(re, '');
    if (out !== bylo) klassy.push(imya);
  }
  if (klassy.length === 0) return { tekst, ochistka: null };
  return {
    tekst: out,
    ochistka: { bylo_udaleno: dlina_do - out.length, klassy, dlina_do, dlina_posle: out.length },
  };
}

// RU: Доля 2% применяется только при длине >= 200; короткий текст оценивается числом удалений, иначе один BOM дал бы ложную тревогу.
// EN: Apply the 2% fraction only at length >= 200; assess short text by removal count, or one BOM could cause a false alarm.
const DLINA_DLYA_DOLI = 200;

/**
 * RU: klass/istochnik нормализует вызывающий и при невидимом знаке получает отказ, не тихую чистку: изменённый klass мог бы обойти перечень и оставить знание только оперативно. Возвращает null для годного поля или {pole, klass} для находки. NFC не исправляет омоглифы.
 * EN: The caller normalizes klass/istochnik and receives a refusal for an invisible character rather than silent cleanup: an altered klass could evade the list and leave knowledge only in working storage. Return null for a valid field or {pole, klass} for a finding. NFC does not fix homoglyphs.
 */
export function proverit_sluzhebnoe(imya, znachenie) {
  if (znachenie === null || znachenie === undefined) return null;
  const s = String(znachenie);
  for (const { imya: klass, re } of NEVIDIMYE) {
    re.lastIndex = 0;
    if (re.test(s)) return { pole: imya, klass };
  }
  return null;
}

/**
 * RU: Нормализовать форму служебного поля к NFC, не смысл. Эквивалентные формы Unicode должны совпадать при сравнении.
 * EN: Normalize a service field to NFC form, not meaning. Equivalent Unicode forms must match in comparisons.
 */
export function normalizovat(znachenie) {
  return znachenie === null || znachenie === undefined ? znachenie : String(znachenie).normalize('NFC');
}

export function trevozhno(ochistka) {
  if (!ochistka) return false;
  if (ochistka.bylo_udaleno >= PORog_TREVOGI_ZNAKOV) return true;
  return ochistka.dlina_do >= DLINA_DLYA_DOLI
      && ochistka.bylo_udaleno >= ochistka.dlina_do * PORog_TREVOGI_DOLYA;
}

// RU: Канарейка проверяется при каждом вызове записи, чтобы поздняя поломка фильтра не открыла вход. Исправный Unicode очищается (fail-open); сломанный фильтр запрещает запись (fail-closed). Образец длиной 34 единицы UTF-16 несёт три класса невидимого и заведомый секрет; он проверяет эти признаки, не всё множество секретов.
// EN: Run the canary on every write call so a later filter failure cannot open the input path. Valid Unicode cleanup is fail-open; a broken filter is fail-closed. The 34-UTF-16-unit sample contains three invisible-character classes and a known secret; it checks these signals, not every secret shape.
const KANAREJKA = 'a​b‮c\u{E0041}d password: Xy7Qm2Vt';

export function filtr_ispraven() {
  const { tekst, ochistka } = ochistit(KANAREJKA);
  if (!ochistka || ochistka.klassy.length !== 3) {
    return { ispraven: false, pochemu: 'канарейка: вычищено классов ' +
             (ochistka?.klassy.length ?? 0) + ' из 3' };
  }
  for (const { imya, re } of NEVIDIMYE) {
    re.lastIndex = 0;
    if (re.test(tekst)) return { ispraven: false, pochemu: 'канарейка: класс ' + imya + ' не вычищен' };
  }
  if (!najti_sekret(KANAREJKA)) {
    return { ispraven: false, pochemu: 'канарейка: заведомый секрет НЕ найден' };
  }
  return { ispraven: true };
}

// RU: Маска образцов находится вместе с фильтром, без внешнего импорта потребителем. Она сохраняет обучающие записи о защите, заменяя только значения obyavlennyj. strukturnyj:* и uuid-obyavlennyj не маскируются: форма сама является сильным признаком и запись должна пройти обычный отказ фильтра. Маска меняет образец, не решение проверки.
// EN: Keep the sample mask with the filter so consumers need no external import. It preserves lessons about protection by replacing only obyavlennyj values. strukturnyj:* and uuid-obyavlennyj are not masked: their shapes are strong signals and the record must face normal filter rejection. The mask changes the example, not the validation decision.
const KLASS_S_MASKOJ = 'obyavlennyj';

/**
 * RU: Предел — 200 проходов, чтобы повторное обнаружение собственной метки не создало бесконечный цикл.
 * EN: Limit masking to 200 passes so rediscovering its own marker cannot create an infinite loop.
 */
const PREDEL_MASKI = 200;

/**
 * RU: Метка хранит класс и позицию исходного текста. Пробел внутри обязателен: значение obyavlennyj обрывается на нём, иначе сама метка снова попадёт под правило до PREDEL_MASKI. Изменение формы требует пробы «метка не ловится фильтром».
 * EN: The marker stores the class and position in the original text. An internal space is required: obyavlennyj values end at it, or the marker itself would rematch until PREDEL_MASKI. Changing the marker shape requires a “marker is not detected” test.
 */
function metka(klass, poz) {
  return poz === null ? `[скрыто ${klass}]` : `[скрыто ${klass} @${poz}]`;
}

/**
 * RU: Заменить значения объявленных образцов метками, сохранив слова и форму. Возвращает {tekst, zameneno, klassy, upyorsya, ostalos, predelDostignut}. ostalos называет класс остановки, не обязательно запирающий; predelDostignut означает исчерпанный бюджет с обнаруженным остатком.
 * EN: Replace declared sample values with markers, retaining the words and syntax. Return {tekst, zameneno, klassy, upyorsya, ostalos, predelDostignut}. ostalos names the class that stopped the pass, not necessarily a blocking class; predelDostignut means an exhausted budget with a detected remainder.
 */
export function zamaskirovat(tekst) {
  if (typeof tekst !== 'string' || !tekst) {
    return { tekst, zameneno: 0, klassy: [], upyorsya: false, ostalos: null, predelDostignut: false };
  }
  let t = tekst, n = 0, upyorsya = false, ostalos = null;
  let predelDostignut = false;
  // RU: Позиция метки относится к исходному тексту: s - sdvig, где sdvig — накопленная разница длин. Формула требует замен слева направо. Нарушение монотонности гасит позиции всей записи, чтобы не выдавать неверные координаты как факт.
  // EN: Marker positions refer to the original text: s - sdvig, where sdvig is the accumulated length difference. This formula requires replacements from left to right. A monotonicity violation disables positions for the whole record rather than presenting wrong coordinates as facts.
  let sdvig = 0, poslednijKon = 0, poziciiNadezhny = true;
  const klassy = new Set();
  for (let i = 0; i < PREDEL_MASKI; i++) {
    const r = najti_sekret(t);
    if (!r) break;
    // RU: Необычный для маски класс, включая помечающий, сохраняется в ostalos: отсутствие дальнейших замен не должно выглядеть полным очищением. Сам режим класса не меняется, помечающий остаток не запирает запись.
    // EN: Store any class the mask cannot handle, including annotating classes, in ostalos: no further replacements must not appear to prove complete cleanup. The class mode stays unchanged; an annotating remainder does not block the record.
    if (!zapiraet(r.klass)) { ostalos = r.klass; break; }
    if (r.klass !== KLASS_S_MASKOJ) { ostalos = r.klass; break; }
    const p = r.pozicia;
    if (!Number.isInteger(p) || p < 0 || p >= t.length) { upyorsya = true; break; }
    // RU: Позиция может указывать на начало объявления, не значения. Найти : или = и маскировать после него, пропуская пробел между разделителем и значением, чтобы сохранить слово и объяснение.
    // EN: The position may point to the declaration start, not the value. Find : or = and mask after it, skipping the space between separator and value, to retain the word and explanation.
    const konSlova = (() => { let k = p; while (k < t.length && !/[\s"'`]/.test(t[k])) k++; return k; })();
    const razd = t.slice(p, konSlova).search(/[:=]/);
    // RU: Разделитель может стоять после пробела, как api_key = value. В этой форме позиция указывает на слово; замена до разделителя съела бы объявление и оставила секрет.
    // EN: The separator may follow whitespace, as in api_key = value. Here the position points to the word; replacing before the separator would erase the declaration and retain the secret.
    let posleSlova = konSlova;
    while (posleSlova < t.length && /[ \t]/.test(t[posleSlova])) posleSlova++;
    const razdelitelZaProbelom = razd === -1 && posleSlova < t.length && /[:=]/.test(t[posleSlova]);
    let s = razd !== -1 ? p + razd + 1
          : razdelitelZaProbelom ? posleSlova + 1
          : p;                                   // RU: Без найденного разделителя позиция уже относится к значению.
          // EN: Without a found separator, the position already refers to the value.
    while (s < t.length && /[ \t]/.test(t[s])) s++;      // RU: Пропустить пробелы между объявлением и значением.
    // EN: Skip whitespace between declaration and value.
    while (s < t.length && /["'`]/.test(t[s])) s++;      // RU: Кавычка относится к форме и остаётся за пределами заменяемого значения.
    // EN: A quote belongs to the syntax and stays outside the replaced value.
    let kon = s; while (kon < t.length && !/[\s"'`]/.test(t[kon])) kon++;
    // RU: Пустое значение после разделителя объявляется остановкой: ноль замен не должен выглядеть отсутствием образцов.
    // EN: Report an empty value after the separator as a stop: zero replacements must not look like no samples.
    if (kon <= s) { upyorsya = true; break; }
    if (s < poslednijKon) poziciiNadezhny = false;   // RU: Отметить совпадение левее предыдущей замены как нарушение монотонности.
    // EN: Mark a match left of the previous replacement as a monotonicity violation.
    const pozIshodnaya = poziciiNadezhny && s - sdvig >= 0 ? s - sdvig : null;
    const m = metka(r.klass, pozIshodnaya);
    t = t.slice(0, s) + m + t.slice(kon);
    sdvig += m.length - (kon - s);
    poslednijKon = s + m.length;
    n++; klassy.add(r.klass);
    if (i === PREDEL_MASKI - 1) {
      // RU: Ровно 200 замен без остатка не означает исчерпание. Последний поиск только проверяет остаток и не увеличивает бюджет.
      // EN: Exactly 200 replacements with no remainder does not mean exhaustion. The final search checks only for a remainder and does not extend the budget.
      predelDostignut = Boolean(najti_sekret(t));
      upyorsya = predelDostignut;
    }
  }
  return { tekst: t, zameneno: n, klassy: [...klassy].sort(), upyorsya, ostalos, poziciiNadezhny, predelDostignut };
}


// RU: Маска входа внешней модели заменяет каждую находку najti_sekret, включая запирающие и помечающие: остановка как у zamaskirovat оставила бы секреты для внешнего провайдера. Один бюджет — 1000 шагов на вызов. Метки [СЕКРЕТ <класс>] не сканируются снова. Не покрывает неизвестные детектору формы: произвольный пароль в URL, короткий MYVAR, токен без AA, разорванный или в base64. Исчерпание объявляется, решение об отправке принимает потребитель.
// EN: The external-model input mask replaces every najti_sekret finding, both blocking and annotating: stopping as zamaskirovat does would leave secrets for an external provider. One budget allows 1000 steps per call. [СЕКРЕТ <class>] markers are not scanned again. It misses shapes unknown to the detector: arbitrary URL passwords, short MYVAR values, tokens without AA, split tokens, and base64-encoded tokens. Exhaustion is reported; the consumer decides whether to send.
const PREDEL_MASKI_VHODA = 1000;
function granicyZnacheniya(t, p, klass) {
  if (klass.startsWith('strukturnyj:')) {
    const imya = klass.slice('strukturnyj:'.length);
    const pravilo = STRUKTURNYE.find((x) => x.imya === imya);
    if (pravilo) {
      if (imya === 'PEM') {   // RU: PEM маскируется до END при расстоянии меньше 20000; иначе только распознанный заголовок.
      // EN: Mask PEM through END when the distance is below 20000; otherwise mask only the recognized header.
        const konec = t.indexOf('PRIVATE KEY-----', t.indexOf('-----END', p));
        if (t.indexOf('-----END', p) >= 0 && konec >= 0 && konec - p < 20000) return [p, konec + 'PRIVATE KEY-----'.length];
      }
      const re = new RegExp(pravilo.re.source, pravilo.re.flags.replace('g', '') + 'y'); re.lastIndex = p;
      const m = re.exec(t); if (m) return [p, p + m[0].length];
    }
  }
  if (klass === 'uuid-obyavlennyj') return [p, Math.min(t.length, p + 36)];
  if (klass === 'entropiya' || klass === 'hex-bez-obyavleniya') {
    let k = p; while (k < t.length && /[A-Za-z0-9_]/.test(t[k])) k++; return [p, k];
  }
  // RU: У объявленных и слабых классов позиция может быть на слове либо значении; искать значение после : или =, как в zamaskirovat.
  // EN: For declared and weak classes, the position may be on the word or value; find the value after : or =, as in zamaskirovat.
  let konSlova = p; while (konSlova < t.length && !/[\s"'`]/.test(t[konSlova])) konSlova++;
  const razd = t.slice(p, konSlova).search(/[:=]/);
  let posleSlova = konSlova; while (posleSlova < t.length && /[ \t]/.test(t[posleSlova])) posleSlova++;
  const zaProbelom = razd === -1 && posleSlova < t.length && /[:=]/.test(t[posleSlova]);
  let s = razd !== -1 ? p + razd + 1 : zaProbelom ? posleSlova + 1 : p;
  while (s < t.length && /[ \t]/.test(t[s])) s++;
  while (s < t.length && /["'`]/.test(t[s])) s++;
  let kon = s; while (kon < t.length && !/[\s"'`]/.test(t[kon])) kon++;
  return kon > s ? [s, kon] : [p, konSlova];
}
/**
 * RU: Вернуть {tekst: string, zameneno: number, klassy: string[], predelDostignut: boolean}. Флаг сообщает остаток после исчерпания бюджета.
 * EN: Return {tekst: string, zameneno: number, klassy: string[], predelDostignut: boolean}. The flag reports a remainder after budget exhaustion.
 */
export function zamaskirovatVhod(tekst) {
  if (typeof tekst !== 'string' || !tekst) return { tekst: typeof tekst === 'string' ? tekst : '', zameneno: 0, klassy: [], predelDostignut: false };
  // RU: najti_sekret возвращает первое правило, не самое левое совпадение. Поэтому префикс перед найденным значением тоже маскируется рекурсивно; все ветви расходуют один общий бюджет.
  // EN: najti_sekret returns the first matching rule, not the leftmost match. Recursively mask the prefix before the found value as well; every branch spends the same shared budget.
  const byudzhet = { ostalos: PREDEL_MASKI_VHODA };
  const klassy = new Set();
  const shag = (tx) => {
    let gotovo = '', ost = tx, n = 0;
    while (ost && byudzhet.ostalos > 0) {
      const r = najti_sekret(ost);
      if (!r) break;
      byudzhet.ostalos--;
      const p = r.pozicia;
      if (!Number.isInteger(p) || p < 0 || p >= ost.length) break;
      let [s, kon] = granicyZnacheniya(ost, p, r.klass);
      if (kon <= s) { s = p; kon = p + 1; }   // RU: Если границы пусты, сдвинуться хотя бы на одну единицу, чтобы гарантировать продвижение.
      // EN: If the bounds are empty, advance at least one unit to guarantee progress.
      const levo = s > 0 ? shag(ost.slice(0, s)) : { tekst: '', n: 0 };
      gotovo += levo.tekst + `[СЕКРЕТ ${r.klass}]`;
      ost = ost.slice(kon); n += levo.n + 1; klassy.add(r.klass);
    }
    return { tekst: gotovo + ost, n };
  };
  const itog = shag(tekst);
  const predelDostignut = byudzhet.ostalos <= 0 && Boolean(najti_sekret(itog.tekst.replace(/\[СЕКРЕТ [^\]]+\]/g, '')));
  return { tekst: itog.tekst, zameneno: itog.n, klassy: [...klassy].sort(), predelDostignut };
}
