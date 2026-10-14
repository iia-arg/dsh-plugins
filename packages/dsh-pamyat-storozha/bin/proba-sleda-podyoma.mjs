/**
 * Проба СЛЕДА ПОДЪЁМА: каждый пакет памяти, поднявшись НОРМАЛЬНО, обязан сказать
 * об этом одной строкой со своим именем.
 *
 * 🔴 ЗАЧЕМ. На 03.09.2026 пятеро из шести при исправном подъёме МОЛЧАЛИ: печать у них
 * стояла только в ветках отказа и особых настроек. На 06.09.2026 подают след ШЕСТЕРО из
 * шести — число здесь есть след истории, а не состояние; состояние снимает сам прогон. Молчание смонтированного пакета
 * неотличимо от «пакет не смонтирован» — а это ровно тот класс, на котором мы
 * весь день ловим друг друга. У restore след есть («подъём: restore=… welcome=…»),
 * и именно он позволил сегодня отличить «секретарь молчит» от «хук мёртв».
 *
 * 🔴 ЧТО ЭТО НЕ ПРОВЕРЯЕТ: работает ли пакет. След — не признак исправности, а
 * признак присутствия. Пакет может подать след и не делать ничего полезного.
 * ГДЕ НЕ ПРИМЕНЯЕТСЯ: проба судит только о подъёме при ГОДНОЙ настройке; ветки
 * отказа проверяются стендами самих пакетов, здесь они не трогаются.
 *
 * Предмет задаётся ключом: путь к каталогу с пакетами (умолчание — годный ящик).
 * Коды: 0 все подали след | 1 кто-то молчит | 2 проверять нечем.
 * EN: STARTUP-TRACE PROBE: every memory package, having started NORMALLY, must say so in one line with its
 *     name.
 *     🔴 WHY. As of 03.09.2026 five of six were SILENT on a healthy startup: their printing stood only in
 *     refusal branches and special settings. As of 06.09.2026 SIX of six leave a trace — the number here is a
 *     trace of history, not the state; the run itself takes the state. A mounted package's silence is
 *     indistinguishable from "the package is not mounted" — and that is exactly the class on which we keep
 *     catching each other all day. restore has a trace ("подъём: restore=… welcome=…"), and it was what allowed
 *     telling "the secretary is silent" from "the hook is dead" today.
 *     🔴 WHAT THIS DOES NOT CHECK: whether the package works. A trace is not a sign of health but a sign of
 *     presence. A package may leave a trace and do nothing useful.
 *     WHERE IT DOES NOT APPLY: the probe judges only startup with VALID settings; refusal branches are checked
 *     by the packages' own stands and are not touched here.
 *     The subject is set by a key: the path to the directory with packages (default — the valid box).
 *     Codes: 0 all left a trace | 1 someone is silent | 2 nothing to check with.
 */
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
// Файл настройки пакета dsh-pamyat-storozha: строки «КЛЮЧ=значение», «#» — комментарий; берётся последнее вхождение ключа.
// Путь меняет переменная DSH_PAMYAT_STOROZHA_CONF. Порядок: довод/переменная → файл → нейтральное умолчание; нет ничего — СЛЕПОТА, код 2.
// EN: Settings file of the dsh-pamyat-storozha package: "KEY=value" lines, a line starting with "#" is a
//     comment; the last occurrence of a key wins.
//     The DSH_PAMYAT_STOROZHA_CONF variable changes the path. Order: argument/variable → file → neutral
//     default; nothing at all — BLINDNESS, code 2.
const KONF = process.env.DSH_PAMYAT_STOROZHA_CONF || '/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf';
// « #» в значении — громкий отказ (код 2), а не склеивание пояснения со значением: комментарий только с начала строки.
// EN: " #" in a value is a loud refusal (code 2), not gluing the note into the value: a comment only from the line start.
const konf = (k) => { let z = ''; try { for (const s of readFileSync(KONF, 'utf8').split('\n')) { const t = s.trim(), i = t.indexOf('='); if (t && !t.startsWith('#') && i > 0 && t.slice(0, i).trim() === k) z = t.slice(i + 1); } } catch {} if (/\s#/.test(z)) { console.log('ОТКАЗ: значение ключа ' + k + ' в ' + KONF + ' содержит « #» — комментарий допускается только с начала строки'); process.exit(2); } return z.trim(); };

// 🔴 ПРЕДМЕТ — УСТАНОВЛЕННЫЕ пакеты, не ящик поставки. В ящике у пакетов нет
// node_modules, и импорт падает на @deepseek-ai/schemastery (долг 59: вне дерева
// платформы пакет требует СВОЕЙ schemastery). Проба про подъём, а не про сборку,
// поэтому смотрит туда, где пакет реально живёт.
// EN: 🔴 THE SUBJECT IS THE INSTALLED packages, not the delivery box. In the box the packages have no
//     node_modules, and the import fails on @deepseek-ai/schemastery (debt 59: outside the platform tree a
//     package requires ITS OWN schemastery). The probe is about startup, not about building, so it looks where
//     the package actually lives.
// Корень плагинов и cordis выводятся из ключа PAMYAT_CORE — того же, что у proverka-opory и соседних модулей:
// пакеты лежат рядом с ядром, cordis — тот, который разрешает само ядро. Прежние ключи SLED_KOREN и SLED_CORDIS
// остались указывать на снятый каталог плагинов, и проба слепла, пока ядро жило на новом месте.
// Довод командной строки по-прежнему заменяет корень плагинов.
// EN: The plugins root and cordis are derived from the PAMYAT_CORE key — the same one proverka-opory and sibling
//     modules use: the packages lie next to the core, cordis is the one the core itself resolves. The former keys
//     SLED_KOREN and SLED_CORDIS kept pointing at a removed plugins directory, and the probe went blind while the
//     core lived in its new place. A command-line argument still replaces the plugins root.
const CORE = konf('PAMYAT_CORE').replace(/\/$/, '')
if (!CORE) { console.log('СЛЕПОТА: ядро памяти не задано — ключ PAMYAT_CORE в ' + KONF); process.exit(2) }
const KOREN = process.argv[2] ?? dirname(CORE)
let CORDIS
try { CORDIS = createRequire(join(CORE, 'package.json')).resolve('@deepseek-ai/cordis') }
catch (e) { console.log('СЛЕПОТА: cordis не разрешается от ядра ' + CORE + ' (ключ PAMYAT_CORE в ' + KONF + '): ' + String(e.message).split('\n')[0]); process.exit(2) }
const KAT = mkdtempSync(join(tmpdir(), 'proba-sleda-'))
process.on('exit', () => { try { rmSync(KAT, { recursive: true, force: true }) } catch {} })

// 🔴 НАСТРОЙКИ БЕРУТСЯ ИЗ ПРЕДМЕТА, А НЕ ИЗ МОЕЙ ПАМЯТИ О НЁМ. Первая редакция
// несла их литералами, списанными глазами с боевого профиля (adres, predel, klass).
// Литерал устареет молча при первой же правке профиля, и проба начнёт спрашивать
// про исправный подъём НЕ ТОЙ настройки: пакет закричит из ветки отказа, а строка
// с его именем всё равно найдётся — то есть ложное зелёное.
// Класс назван координатором 03.09.2026: приведение чужой строки к своему обыкновению
// (или к своей копии) — это уже другой метод, и оно не ощущается правкой.
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: путь базы и имя агента берутся СВОИ, во временный каталог —
// проба не вправе писать в боевую базу и подписываться боевым агентом.
// EN: 🔴 SETTINGS ARE TAKEN FROM THE SUBJECT, NOT FROM MY MEMORY OF IT. The first edition carried them as
//     literals, copied by eye from the production profile (adres, predel, klass). A literal goes stale silently
//     at the first profile edit, and the probe starts asking about a healthy startup with THE WRONG settings:
//     the package shouts from the refusal branch, and the line with its name is found anyway — i.e. a false
//     green.
//     The class was named by the coordinator on 03.09.2026: bringing someone else's line to one's own habit (or
//     to one's own copy) is already a different method, and it does not feel like an edit.
//     WHERE IT DOES NOT APPLY: the base path and the agent name are OUR OWN, in a temporary directory — the
//     probe has no right to write into the production base or to sign as the production agent.
const PROFIL = process.env.PROBA_PROFIL
  ?? konf('SLED_PROFIL')
if (!PROFIL) { console.log('СЛЕПОТА: профиль агента не задан — PROBA_PROFIL или ключ SLED_PROFIL в ' + KONF); process.exit(2) }
const nastrojkiIzProfilya = () => {
  if (!existsSync(PROFIL)) return null
  // 🔴 РАЗБИРАЕМ YAML НАСТОЯЩИМ РАЗБОРОМ, А НЕ РЕГУЛЯРКАМИ. Первая попытка тянула
  // ключи шаблоном — и молча выдала omega пустую настройку: пакет закричал «не задан
  // адрес», а признак засчитал этот крик за след подъёма. Ложное зелёное родилось
  // ровно там, где я чинила ложное зелёное. Приблизительный разбор структуры — это
  // и есть «приведение чужой формы к своему обыкновению».
  // EN: 🔴 WE PARSE YAML WITH A REAL PARSER, NOT WITH REGEXES. The first attempt pulled keys by pattern — and
  //     silently gave omega empty settings: the package shouted "address not set", and the sign counted that
  //     shout as a startup trace. A false green was born exactly where I was fixing a false green. An
  //     approximate parse of structure is exactly "bringing someone else's form to one's own habit".
  // Профиль платформы несёт теги `!!js <выражение>` (вычисляемые поля чужих плагинов). safe_load их не знает
  // и падал трассировкой: Node выходил кодом 1 — тем же, что «кто-то молчит», то есть ложной тревогой о пакетах.
  // Тег читается строкой «!!js <выражение>» (не вычисляется); любой иной сбой разбора — названная СЛЕПОТА, код 2.
  // EN: The platform profile carries `!!js <expression>` tags (computed fields of other plugins). safe_load did not
  //     know them and died with a stack trace: Node exited with code 1 — the same as "someone is silent", i.e. a
  //     false alarm about the packages. The tag is read as the string "!!js <expression>" (not evaluated); any other
  //     parse failure is a named BLINDNESS, code 2.
  let out
  try { out = execFileSync('python3', ['-c', `
import yaml, json, sys
yaml.SafeLoader.add_multi_constructor('tag:yaml.org,2002:js', lambda l, suf, n: '!!js' + suf + ' ' + str(n.value))
d = yaml.safe_load(open(sys.argv[1]))
res = {}
for blok in (d if isinstance(d, list) else [d]):
    for zapis in (blok.get('insert') or []) if isinstance(blok, dict) else []:
        if isinstance(zapis, dict) and str(zapis.get('name', '')).startswith('dsh-pamyat-'):
            res[zapis['name']] = zapis.get('config') or {}
print(json.dumps(res, ensure_ascii=False))
`, PROFIL], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) { console.log('СЛЕПОТА: профиль ' + PROFIL + ' не разобран: ' + (String(e.stderr || e.message).split('\n').filter((x) => /Error/.test(x)).pop() || String(e.message)).trim()); process.exit(2) }
  return JSON.parse(out)
}
const izProfilya = nastrojkiIzProfilya()
if (!izProfilya) { console.log('СЛЕПОТА: не найден профиль ' + PROFIL); process.exit(2) }

const PAKETY = [
  ['dsh-pamyat-core',      { ...izProfilya['dsh-pamyat-core'], putBazy: join(KAT, 'p.db'), agent: 'proba' }],
  ['dsh-pamyat-omega',     { ...izProfilya['dsh-pamyat-omega'] }],
  ['dsh-pamyat-secretary', { ...izProfilya['dsh-pamyat-secretary'] }],
  ['dsh-pamyat-byudzhet',  { ...izProfilya['dsh-pamyat-byudzhet'] }],
  ['dsh-pamyat-nudzh',     { ...izProfilya['dsh-pamyat-nudzh'] }],
  ['dsh-pamyat-restore',   { ...izProfilya['dsh-pamyat-restore'], restoreEnabled: true, welcomeEnabled: false }],
]
// 🔴 Настройка, не доехавшая из профиля, — это СЛЕПОТА, а не «подъём с умолчаниями».
// Пустой config неотличим снаружи от «в профиле пакета нет».
// EN: 🔴 Settings that did not arrive from the profile are BLINDNESS, not "startup with defaults". An empty
//     config is indistinguishable from outside from "the package is not in the profile".
for (const [imya] of PAKETY) {
  if (!izProfilya[imya]) { console.log(`  СЛЕП ${imya} — в профиле нет его настроек`); }
}

let ok = 0, bad = 0, slep = 0
// 🔴 ПОСТОЯННО КРАСНЫЙ МЕХАНИЗМ ОПАСНЕЕ ЗЕЛЁНОГО: зелёное хоть иногда
// перепроверяют, а отказ с объяснением не перепроверяет НИКТО — он становится
// частью обстановки. Восемнадцать часов сторож копии показывал на невосстановимые
// данные, и «причина известна» означало «никто не смотрел с тех пор, как её назвали».
// Правило фермы 03.09.2026: у постоянно красного записывать дату, с которой он
// красен, и что в нём проверяли последний раз. Записываем НЕ В ДОЛГ, а сюда —
// долг не печатается при прогоне, а эта строка печатается.
// EN: 🔴 A PERMANENTLY RED MECHANISM IS MORE DANGEROUS THAN A GREEN ONE: green is at least sometimes re-checked,
//     but a refusal with an explanation is re-checked by NOBODY — it becomes part of the scenery. For eighteen
//     hours the copy watcher pointed at unrecoverable data, and "the cause is known" meant "nobody has looked
//     since it was named". Farm rule of 03.09.2026: for a permanently red one, record the date since which it
//     is red and what was last checked in it. We record it NOT IN THE DEBT but here — the debt is not printed
//     on a run, this line is.
const KRASNA_S = null   // 🔴 СНЯТО 06.09.2026: долг 66 закрыт замером «подали след 6, молчат 0». · EN: 🔴 REMOVED 06.09.2026: debt 66 closed by the measurement "left a trace 6, silent 0".
// Пятеро вылечены правками пакетов, шестой (omega) был вылечен раньше, а красным его держал
// ПРИЗНАК ЭТОЙ ПРОБЫ: маска слов принимала «адрес НЕ ЗАДАН» внутри безусловной строки подъёма
// за крик из ветки отказа. Предмет вылечен, прибор был слеп к лечению — см. правку признака ниже.
// EN: Five were cured by package edits, the sixth (omega) had been cured earlier, but it was kept red by THIS
//     PROBE'S SIGN: the word mask took "address NOT SET" inside the unconditional startup line for a shout from
//     the refusal branch. The subject was cured, the tool was blind to the cure — see the sign edit below.
const ZRYACHEST_PROVERENA = '2026-09-06' // порчи на КОПИИ каталога: след убран -> «не сказал НИЧЕГО»; след
// только при ключе без умолчания -> «только при своей настройке»; слово «подъём» заменено, остался
// один крик отказа -> «не сказал НИЧЕГО» (старый дефект «крик зачтён следом» не вернулся);
// нет каталога -> слепота. Зрячесть прогнана ДО порч: на неиспорченной копии omega даёт ok.
// EN: corruptions on a COPY of the directory: trace removed -> "said NOTHING"; trace only with a key without a
//     default -> "only with its own settings"; the word "подъём" replaced, one refusal shout left -> "said
//     NOTHING" (the old defect "shout counted as trace" did not return); no directory -> blindness. Blindness
//     was checked BEFORE the corruptions: on an uncorrupted copy omega gives ok.
const sutok = (s) => Math.floor((Date.now() - Date.parse(s + 'T00:00:00Z')) / 86400000)

const itog = () => {
  console.log(`\nИТОГ: подали след ${ok}, молчат ${bad}, проверить нечем ${slep}`)
  if (bad) {
    console.log('Молчащий пакет неотличим от несмонтированного — это и есть дефект.')
    const d = sutok(KRASNA_S)
    // 🔴 «ЗРЯЧЕСТЬ ПРОВЕРЯЛАСЬ» — ЭТО ЗАПИСЬ РУКОЙ, А НЕ ПРОВЕРКА СЕЙЧАС (06.09.2026).
    // Прежняя строка печатала дату и читалась как «прибор зряч». На деле она значит только
    // «кто-то однажды прогнал порчи и вписал число». Урок того же дня: контроль
    // зрячести обязан искать ПРЕДМЕТ, а не быть словом о нём. Здесь порчи в момент вызова
    // не гоняются намеренно (они правят боевые файлы), поэтому лечение — не молчать о
    // природе строки и назвать ЦЕНУ: возраст записи. Названная беда без цены читается как
    // учтённая.
    // EN: 🔴 "BLINDNESS WAS CHECKED" IS A HAND-MADE NOTE, NOT A CHECK NOW (06.09.2026). The previous line
    //     printed a date and read as "the tool is sighted". In fact it only means "someone once ran the
    //     corruptions and wrote down a number". The lesson of the same day: a blindness control must look for
    //     the SUBJECT, not be a word about it. Here the corruptions are deliberately not run at call time (they
    //     edit production files), so the cure is not to keep silent about the line's nature and to name the
    //     PRICE: the note's age. A named trouble without a price reads as accounted for.
    const vz = sutok(ZRYACHEST_PROVERENA)
    const hvost = vz >= 7
      ? `🔴 ЗАПИСЬ О ЗРЯЧЕСТИ УСТАРЕЛА: ${ZRYACHEST_PROVERENA} (${vz} сут.) — порчи с тех пор НЕ гонялись, молчанию прибора верить нельзя`
      : `зрячесть: ЗАПИСЬ рукой от ${ZRYACHEST_PROVERENA} (${vz} сут.), а не проверка сейчас`
    if (KRASNA_S) console.log(`КРАСНА С ${KRASNA_S} (${d} сут.) · ${hvost}`)
    else console.log(hvost)
    // Порог не «когда надоест», а названный: через неделю причина красноты успевает
    // устареть молча, и перепроверять надо САМ ПРИБОР, а не только предмет.
    // EN: The threshold is not "when it gets tiresome" but named: within a week the cause of the redness has
    //     time to go stale silently, and it is THE TOOL ITSELF that must be re-checked, not just the subject.
    if (d >= 7) {
      console.log('🔴 КРАСНА НЕДЕЛЮ И ДОЛЬШЕ. Перепроверь САМУ ПРОБУ порчей, прежде чем')
      console.log('   верить её отказу: за неделю причина могла отпасть, а строка остаться.')
    }
    process.exit(1)
  }
  if (slep) process.exit(2)
  // 🔴 ЗЕЛЁНОЕ ТОЖЕ ТРЕБУЕТ ДЕЙСТВИЯ: метка о красноте, пережившая её причину,
  // врёт в другую сторону — сообщает о беде, которой уже нет.
  // Строка нужна ровно тогда, когда метка ещё стоит: при снятой она сама стала бы
  // ложной подписью («стояло null»), то есть тем же классом с другого конца.
  // EN: 🔴 GREEN ALSO REQUIRES ACTION: a redness mark that outlived its cause lies the other way — it reports a
  //     trouble that is gone.
  //     The line is needed exactly while the mark still stands: once removed, the line itself would become a
  //     false caption ("it was null"), i.e. the same class from the other end.
  if (KRASNA_S) console.log(`Краснота снята — убери из файла KRASNA_S (стояло ${KRASNA_S}).`)
  process.exit(0)
}

if (!existsSync(CORDIS)) { console.log('СЛЕПОТА: нет cordis по пути ' + CORDIS); process.exit(2) }
const { Context } = await import(CORDIS)
console.log('предмет: ' + KOREN)

for (const [imya, nastrojka] of PAKETY) {
  let put = join(KOREN, imya, 'src/index.js')
  if (!existsSync(put)) put = join(KOREN, imya, 'package/src/index.js')
  if (!existsSync(put)) {
    // Шестой член лежит тарболом — каталога у него нет, и это не молчание.
    // EN: The sixth member lies as a tarball — it has no directory, and this is not silence.
    slep++; console.log(`  СЛЕП ${imya} — каталога нет под ${KOREN} (тарбол не распаковывается пробой)`)
    continue
  }
  let mod
  try {
    mod = await import(put)
  } catch (e) {
    // Отказ словами: молчаливое падение импорта неотличимо от молчания пакета.
    // EN: Refusal in words: a silent import failure is indistinguishable from the package's silence.
    slep++
    console.log(`  СЛЕП ${imya} — не импортируется: ${String(e.message).slice(0, 110)}`)
    continue
  }
  const koren = new Context()
  for (const s of ['agents', 'logger', 'pamyat']) {
    if (s === 'pamyat' && imya === 'dsh-pamyat-core') continue
    koren.provide(s)
  }
  koren.agents = {}
  koren.logger = new Proxy(() => {}, { get: () => () => {} })
  if (imya !== 'dsh-pamyat-core') koren.pamyat = { zapisat: () => 1, prochitat: () => [] }

  // 🔴 ПЕРЕХВАТЫВАЕМ ПОТОК, А НЕ console. Пакеты пишут по-разному: restore —
  // `process.stderr.write` напрямую, остальные — через console.error. Перехват
  // одного только console пропускал restore и объявлял молчащими ВСЕХ ШЕСТЕРЫХ,
  // включая тот пакет, чей след в этот же миг шёл в терминал у меня на глазах.
  // Ловим обе трубы у самого выхода: ниже console уже нечему разойтись.
  // 🔴 СЛЕД ОБЯЗАН БЫТЬ БЕЗУСЛОВНЫМ. Пакет поднимают дважды: с настройкой из
  // профиля и с ПУСТОЙ. Строка, которая есть только при одной из них, описывает
  // настройку, а не факт подъёма, — и на роль «пакет здесь» не годится.
  // Поймано на ядре: оно печатало «на этом узле спрашивать некого» и выглядело
  // подавшим след, хотя строка целиком зависит от ключа otvechayushchegoNet.
  // ГДЕ НЕ ПРИМЕНЯЕТСЯ: пустая настройка — не проверка работоспособности. Пакет
  // вправе при ней отказать; нас интересует ровно одно — сказал ли он, что поднялся.
  // 🔴 ГРАНИЦА ПРИЗНАКА, ВЫЯСНЕННАЯ ПОРЧЕЙ: ключи, у которых в Config есть умолчание,
  // при пустой настройке подставляются сами. Зависимость следа от ТАКОГО ключа проба
  // не увидит — порча «печатать только при restoreEnabled» прошла зелёной, потому что
  // умолчание у него `true`. Ловится только зависимость от ключей БЕЗ умолчания
  // (проверено порчей на putBazy: дала «сказал ТОЛЬКО при своей настройке»).
  // То есть признак сильнее «есть строка», но слабее «строка безусловна».
  // 🔴 КАЖДЫЙ ПОДЪЁМ — В ЧИСТОМ ПРОЦЕССЕ. Два монтажа в одном процессе не работают:
  // restore держит `globalThis.__pamyatRestore` и при повторном вызове выходит молча,
  // отчего выглядел «сказавшим только при своей настройке». Защита пакета верная —
  // негодной была проба, ставившая два опыта в одну посуду.
  // EN: 🔴 WE INTERCEPT THE STREAM, NOT console. Packages write differently: restore uses `process.stderr.write`
  //     directly, the others go through console.error. Intercepting console alone missed restore and declared
  //     ALL SIX silent, including the package whose trace was going to the terminal before my eyes at that very
  //     moment. We catch both pipes at the very exit: below console there is nothing left to diverge.
  //     🔴 THE TRACE MUST BE UNCONDITIONAL. The package is started twice: with settings from the profile and
  //     with EMPTY ones. A line that appears with only one of them describes the settings, not the fact of
  //     startup — and is no good as "the package is here". Caught on the core: it printed "nobody to ask on
  //     this node" and looked as if it had left a trace, although the line depends entirely on the
  //     otvechayushchegoNet key.
  //     WHERE IT DOES NOT APPLY: empty settings are not a working-order check. The package may refuse with
  //     them; we are interested in exactly one thing — whether it said it started.
  //     🔴 THE SIGN'S LIMIT, FOUND BY CORRUPTION: keys that have a default in Config are filled in by themselves
  //     with empty settings. The probe will not see the trace's dependence on SUCH a key — the corruption
  //     "print only with restoreEnabled" passed green because its default is `true`. Only dependence on keys
  //     WITHOUT a default is caught (verified by corruption on putBazy: it gave "said ONLY with its own
  //     settings"). So the sign is stronger than "there is a line" but weaker than "the line is unconditional".
  //     🔴 EACH STARTUP IN A CLEAN PROCESS. Two mounts in one process do not work: restore holds
  //     `globalThis.__pamyatRestore` and exits silently on a repeat call, which made it look "said only with
  //     its own settings". The package's protection is correct — the probe was faulty, putting two experiments
  //     into one vessel.
  const podnyat = (nastrojka) => {
    const kod = `
const { Context } = await import(${JSON.stringify(CORDIS)})
const mod = await import(${JSON.stringify(put)})
const k = new Context()
for (const sl of ['agents','logger','pamyat']) {
  if (sl === 'pamyat' && ${JSON.stringify(imya)} === 'dsh-pamyat-core') continue
  k.provide(sl)
}
k.agents = {}
k.logger = new Proxy(() => {}, { get: () => () => {} })
if (${JSON.stringify(imya)} !== 'dsh-pamyat-core') k.pamyat = { zapisat: () => 1, prochitat: () => [] }
try {
  const f = k.plugin(mod, ${JSON.stringify(nastrojka)})
  const t = Date.now()
  while (f && f.state !== 2 && Date.now() - t < 2000) await new Promise(r => setTimeout(r, 5))
} catch (e) { process.stderr.write('ОТКАЗ МОНТАЖА: ' + e.message + '\\n') }
`
    // 🔴 ЧИТАЕМ ОБЕ ТРУБЫ. execFileSync при УСПЕХЕ отдаёт только stdout, а пакеты
    // пишут в stderr — двенадцать подъёмов прошли за полсекунды и «все молчали».
    // Быстрый зелёный там, где ждёшь работы, — тот же сигнал, что и пустой ответ.
    // EN: 🔴 WE READ BOTH PIPES. On SUCCESS execFileSync returns only stdout, while packages write to stderr —
    //     twelve startups went by in half a second and "all were silent". A fast green where you expect work is
    //     the same signal as an empty answer.
    // 🔴 МЕТКА ПРОБЫ ДЕТЯМ (04.10.2026): пакеты поднимаются с БОЕВОЙ настройкой из профиля, и секретарь при подъёме
    // зовёт канал тревог (komandaTrevogi, умолчание agent-alert) — живые прогоны пробы слали владельцу ЛОЖНЫЕ тревоги
    // (6 за 04.10). DSH_PROBA=1 — метка dsh-trevogi: agent-alert отвечает «проба, не отправлено», токен не читает,
    // в журнале «исход=проба». ЧЕГО НЕ ЛОВИТ: канал, который зовут не через agent-alert и без этой метки.
    // EN: 🔴 PROBE MARK FOR CHILDREN: packages start with PRODUCTION settings from the profile, and the secretary calls the
    //     alert channel at startup (komandaTrevogi, default agent-alert) — live probe runs sent FALSE alerts to the owner
    //     (6 on 04.10). DSH_PROBA=1 is the dsh-trevogi mark: agent-alert answers "probe, not sent", does not read the
    //     token, logs "исход=проба". DOES NOT CATCH: a channel called not via agent-alert and ignoring this mark.
    const r = spawnSync('node', ['--input-type=module', '-e', kod],
      { encoding: 'utf8', timeout: 15000, env: { ...process.env, DSH_PROBA: '1' } })
    if (r.error) return ['ОТКАЗ ЗАПУСКА: ' + r.error.message]
    return String((r.stdout ?? '') + (r.stderr ?? '')).split('\n')
  }

  // 🔴 СЛЕД УЗНАЁТСЯ ПО ФОРМЕ, А НЕ ПО ОТСУТСТВИЮ СЛОВ-КРИКОВ (правка 06.09.2026).
  // Прежде годной считалась всякая строка с именем пакета, не подпадающая под маску
  // КРИК (`не задан|недоступн|ОТКАЗ|…`). Маска была костылём против «крик из ветки
  // отказа зачтён следом» — и она же дала ЛОЖНО-КРАСНОЕ на вылеченном пакете:
  // omega печатает БЕЗУСЛОВНУЮ строку «подъём: адрес НЕ ЗАДАН, предел ожидания 10000 мс»,
  // где «НЕ ЗАДАН» — ЗНАЧЕНИЕ ПОЛЯ, а не крик. Маска ловила слово и не различала роли:
  // пакет подал след при обеих настройках, а проба три дня звала его молчащим.
  // Замер 06.09.2026: все шесть пакетов печатают строку вида `[имя версия] подъём: …`,
  // то есть соглашение о форме уже соблюдено предметом, а не назначено мной.
  // ⚠️ ЦЕНА ФОРМЫ, НАЗЫВАЮ СРАЗУ: пакет, говорящий о подъёме ДРУГИМИ словами, проба
  // не увидит и объявит молчащим. Это ложно-красное, а не пропуск: оно видно и
  // обратимо, тогда как маска слов давала обе ошибки разом и обе тихо.
  // Требование «строка есть при ОБЕИХ настройках» остаётся и стоит ниже: оно ловит
  // зависимость следа от ключа без умолчания. Форма отвечает «это про подъём»,
  // двойной прогон — «это безусловно»; порознь ни одного из них не хватает.
  // EN: 🔴 THE TRACE IS RECOGNISED BY FORM, NOT BY THE ABSENCE OF SHOUT WORDS (edit of 06.09.2026).
  //     Previously any line with the package name that did not fall under the SHOUT mask (`не
  //     задан|недоступн|ОТКАЗ|…`) counted as valid. The mask was a crutch against "a shout from the refusal
  //     branch counted as a trace" — and it gave a FALSE RED on a cured package: omega prints the UNCONDITIONAL
  //     line "подъём: адрес НЕ ЗАДАН, предел ожидания 10000 мс", where "НЕ ЗАДАН" is a FIELD VALUE, not a
  //     shout. The mask caught the word and did not tell roles apart: the package left a trace with both
  //     settings, yet the probe called it silent for three days.
  //     Measured 06.09.2026: all six packages print a line of the form `[name version] подъём: …`, i.e. the
  //     form convention is already followed by the subject, not assigned by me.
  //     ⚠️ THE PRICE OF FORM, NAMED AT ONCE: a package that speaks about startup in OTHER words will not be
  //     seen by the probe and will be declared silent. This is a false red, not a miss: it is visible and
  //     reversible, whereas the word mask made both errors at once and both quietly.
  //     The requirement "the line is present with BOTH settings" remains and stands below: it catches the
  //     trace's dependence on a key without a default. Form answers "this is about startup", the double run —
  //     "this is unconditional"; separately neither is enough.
  const SLED = /\]\s*подъём:/
  const godnye = (sled) => sled.filter((t) => t.includes(imya) && SLED.test(t))
  const sProfilem = godnye(podnyat(nastrojka))
  const sPustoj = godnye(podnyat({}))

  if (sProfilem.length && sPustoj.length) {
    ok++
    console.log(`  ok   ${imya} — ${sProfilem[0].trim().slice(0, 96)}`)
  } else if (sProfilem.length) {
    bad++
    console.log(`  FAIL ${imya} — сказал ТОЛЬКО при своей настройке; строка описывает настройку, не подъём`)
  } else {
    bad++
    console.log(`  FAIL ${imya} — при исправном подъёме не сказал НИЧЕГО`)
  }
}
itog()
