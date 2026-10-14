#!/usr/bin/env node
/**
 * П2 — ПРИБОР ПЕРЕД ПОДЪЁМОМ И ПОСЛЕ НЕГО. ОН ТОЛЬКО ГОВОРИТ.
 *
 * 🔴 НЕ ПОДНИМАЕТ И НЕ ОСТАНАВЛИВАЕТ (условие приёмки В6). Слив прибора с рукой лишает
 * второго мнения ровно там, где оно нужно: кто и меряет, и действует, при своей же ошибке
 * молчит дважды. Здесь только чтение и печать; `systemctl` зовётся ИСКЛЮЧИТЕЛЬНО как
 * `show` — за временем старта, и ни одного restart/stop/start в файле нет.
 *
 * 🔴 «ОЖИДАЕТСЯ» — ПРЕДСКАЗАНИЕ, «В БОЮ» — ФАКТ, И ЭТО РАЗНЫЕ СЛОВА (В2).
 * Смешение уже стоило разбирательства: 04.09.2026 на дисках лежали alpha.9 и alpha.12,
 * а в бою был alpha.11, и ни один каталог этого не показывал.
 *
 * 🔴 ПРАВИЛО РАЗРЕШЕНИЯ — ПЛАТФОРМЕННОЕ, НО ФУНКЦИИ-ПЕРЕЧНЯ У ПЛАТФОРМЫ НЕТ (замер В3).
 * Загрузчик платформы зовёт ВНУТРЕННИЙ ESM-загрузчик Node (`internal/modules/esm/loader`)
 * с базовым адресом профиля, то есть обычное разрешение Node. `createRequire(корень).resolve`
 * использует ровно его — своей копии правила здесь нет. Но вызываемого «дай список
 * каталогов, которые будут загружены» платформа не отдаёт: её `Loader.import(имя)`
 * ИМПОРТИРУЕТ модуль, то есть исполняет его код, — для прибора «перед подъёмом» это
 * недопустимо. Поэтому имена берутся ИЗ КОНФИГА ПРОФИЛЯ (что объявлено к загрузке), а
 * разрешаются механизмом Node.
 * ⚠️ И расхождение двух множеств — объявленного в конфиге и лежащего в node_modules —
 * печатается отдельной строкой: сегодня они совпадают (11 и 11), но это раскладка, а не
 * устройство, и разойтись им ничто не мешает.
 *
 * КОДЫ. 0 можно · 1 НЕЛЬЗЯ · 2 СЛЕПОТА. Слепота ведёт себя как «нельзя» (В1): не смог
 * проверить — не поднимаем, иначе первый же сбой прибора становится разрешением.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve as putR } from 'node:path';

// 🔴 B-N-810 (24.09.2026, Аврора; находка Зари 21:58): НЕПЕРЕХВАЧЕННЫЙ ОТКАЗ — СЛЕПОТА (2), А НЕ «НЕЛЬЗЯ» (1).
// Node завершает процесс кодом 1 на любом необработанном исключении, а у прибора 1 = «НЕЛЬЗЯ»: EACCES на
// чужом профиле (cordis.patch.yml есть — existsSync «да», — а readFileSync отказывает) читался как вердикт
// о составе. «НЕЛЬЗЯ» ставит только povysit(1) по содержательному расхождению; всё, что прибор не довёл
// до вердикта, — слепота с причиной (errno, вызов, путь). Стоит первым оператором: ловит и то, что ниже.
// ⚠️ ГДЕ НЕ ПРИМЕНЯЕТСЯ: исключение, пойманное внутри прибора своим catch, сюда не доходит — там причину
// называет сама ветка. Отказ, превращённый в «нет» без исключения, этим не ловится.
const neperekhvacheno = (e) => {
  const gde = [e?.code, e?.syscall, e?.path].filter(Boolean).join(' ');
  console.log(`\n🔴 СЛЕПОТА: прибор не довёл сверку до вердикта — ${gde ? gde + ': ' : ''}${String(e?.message ?? e).split('\n')[0].slice(0, 200)}`);
  console.log('   Это отказ прибора (права, чтение, сбой), а НЕ расхождение состава: о предмете не сказано ничего.');
  console.log('исход: 2 (0 можно · 1 НЕЛЬЗЯ · 2 слепота — ведёт себя как «нельзя»)');
  process.exit(2);
};
process.on('uncaughtException', neperekhvacheno);
process.on('unhandledRejection', neperekhvacheno);

const dovody = process.argv.slice(2);
const znach = (k, u) => { const i = dovody.indexOf(k); return i >= 0 && dovody[i + 1] ? dovody[i + 1] : u; };
const SLUZHBA = znach('--sluzhba', 'iskra.service');

// 🔴 ПОЗИЦИОННЫЙ ДОВОД — ОТКАЗ, А НЕ МОЛЧАНИЕ (найдено приёмкой 06.09.2026).
// Её первый прогон был `pered-podyomom.mjs dsh.service` без ключа: имя проглотилось молча,
// прибор взял умолчание iskra.service и выдал вердикт о МОЁМ узле — а она читала его как
// вердикт о соседе. Умолчание, принимающее что угодно, превращает опечатку в ответ о
// предмете; у нас это уже было с ключом --okno у прибора подъёмов.
for (const d of dovody) {
  if (!d.startsWith('--') && !dovody.includes('--' + d) && dovody[dovody.indexOf(d) - 1]?.startsWith('--') !== true) {
    console.log(`🔴 ОТКАЗ: «${d}» — позиционный довод. У прибора только ключи: --sluzhba, --profil,`);
    console.log('   --konfig, --reestr-plaginov, --kanon, --cel, --cel-s-diska, --posle, --strogo, --reestr.');
    console.log('   Имя службы задаётся ТОЛЬКО через --sluzhba, иначе прибор ответит про чужой узел.');
    process.exit(2);
  }
}

// 🔴 ПРОФИЛЬ ВЫВОДИТСЯ ИЗ СЛУЖБЫ, А НЕ БЕРЁТСЯ УМОЛЧАНИЕМ (дыра П3, приёмка 06.09.2026).
// Было: `--sluzhba dsh.service` печатал «служба: dsh.service · профиль: …/iskra/…» — то есть
// прибор выносил вердикт о МОЁМ узле ПОД ИМЕНЕМ СОСЕДА. Оба значения стояли рядом и были
// правдивы порознь; негодной была связь между ними — наш класс «данные собраны и не
// участвуют в решении», только здесь они участвуют в РАЗНЫХ решениях.
// Профиль выводится из владельца службы (systemctl show -p User) — это устройство, а не
// догадка: у каждого агента свой пользователь и свой домашний каталог.
// ⚠️ ГДЕ НЕ ПРИМЕНЯЕТСЯ: профиль соседа мне не читается (права 750 на его дом) — тогда
// СЛЕПОТА с причиной, а НЕ подстановка своего. «Не смог посмотреть» и «посмотрел у себя» —
// разные ответы, и второй хуже, потому что выглядит ответом.
const profil_po_sluzhbe = (sluzhba) => {
  try {
    const u = execFileSync('systemctl', ['show', sluzhba, '-p', 'User', '--value'],
                           { encoding: 'utf8' }).trim();
    if (!u) return null;
    const dom = execFileSync('getent', ['passwd', u], { encoding: 'utf8' }).split(':')[5];
    return dom ? putR(dom, '.dsh/profiles/web') : null;
  } catch { return null; }
};
const KOREN_YAVNO = znach('--profil', null);
const KOREN_IZ_SLUZHBY = KOREN_YAVNO ? null : profil_po_sluzhbe(SLUZHBA);
const KOREN   = KOREN_YAVNO ?? KOREN_IZ_SLUZHBY ?? '/opt/iskra/.dsh/profiles/web';
if (!KOREN_YAVNO && KOREN_IZ_SLUZHBY && !existsSync(KOREN_IZ_SLUZHBY)) {
  console.log(`машина: ${execFileSync('hostname', { encoding: 'utf8' }).trim()}   снято: ${new Date().toISOString()}`);
  console.log(`🔴 СЛЕПОТА: профиль службы ${SLUZHBA} — ${KOREN_IZ_SLUZHBY} — мне не читается.`);
  console.log('   Это про ПРАВА, а не про предмет: у каждого агента свой пользователь и свой дом.');
  console.log('   Вердикт о ЧУЖОМ узле снять нечем; подставлять свой профиль под чужим именем');
  console.log('   прибор НЕ будет — это дало бы ответ про мой узел под именем соседа.');
  console.log('   Если профиль всё же доступен, назовите его явно: --profil <путь>');
  console.log('исход: 2 (0 можно · 1 НЕЛЬЗЯ · 2 слепота — ведёт себя как «нельзя»)');
  process.exit(2);
}
const KONFIG  = znach('--konfig', putR(KOREN, 'cordis.patch.yml'));
// 🔴 A-N-755 (24.09.2026, решение координатора, вариант «б» Вениамина): принятое берётся из
// РЕЕСТРА ПЛАГИНОВ, а не из файла сумм приёмщика. Запись реестра = то, что прошло ворота и
// смонтировано. Файл /home/claude/ot-veniamina/prinyatye-summy-sadik-iskra.txt не обновлялся
// с 14.09, и прибор на нём отказывал ЛЮБОЙ службе — сторож, покрасневший навсегда.
// Прежний ключ --summy ОТКАЗЫВАЕТ, а не молча игнорируется: рука, набравшая его, ждёт сверки с файлом.
if (dovody.includes('--summy')) {
  console.log('🔴 ОТКАЗ: ключ --summy снят (A-N-755). Источник принятого — реестр плагинов,');
  console.log('   иной реестр задаётся ключом --reestr-plaginov <путь>.');
  process.exit(2);
}
const REESTR_PLAGINOV = znach('--reestr-plaginov', '/etc/agent-registry/plugins.yaml');
// Боевые имена мерки сумм (A-N-676, шаг 3): root-файлы в /usr/local/bin, а не рабочие копии.
// -kanon — канон поставки 03.09 (без флага считает по публикации); -rezhim — редакция с режимами.
const KANON   = znach('--kanon', '/usr/local/bin/summa-predmeta-2');
// A-N-755: второй прибор свёртки (--kanon-vtoroj) снят — он различал способы свёртки СТРОК ФАЙЛА
// СУММ; у реестра способ задан в самой записи (fingerprint_check), различать нечего.
const POSLE   = dovody.includes('--posle');
// A-N-755: ключ --strogo принимается, но ничего не меняет — «вне области приёмки» больше нет,
// строже нынешнего правила («имя без записи реестра — красное») режима не бывает.
/**
 * ЦЕЛЬ ПОДЪЁМА — «пакет=версия», через запятую, либо файлом (--cel-fajl).
 *
 * 🔴 ЗАЧЕМ ОНА ОБЯЗАТЕЛЬНА (уточнение предмета, служебный канал 05.09.2026).
 * Без цели прибор отвечает на вопрос «лежит ли на пути ЧТО-ТО ПРИНЯТОЕ», а спрашивают его
 * о другом — «лежит ли ТО, ЧТО МЫ РЕШИЛИ ПОДНЯТЬ». Разница не тонкая: у соседа в бою была
 * принятая редакция, а решено поднимать другую — прибор без цели сказал бы «можно», подъём
 * оказался бы бессмысленным, и никто не был бы предупреждён.
 * Поэтому отсутствие цели — СЛЕПОТА, а не «сверю с любой принятой»: прибор без цели не
 * мягче, он ПРО ДРУГОЕ, и обязан говорить это прямо.
 */
// 🔴 ЦЕЛЬ, СНЯТАЯ С ДИСКА В МОМЕНТ ДЕЙСТВИЯ (--cel-s-diska), 05.09.2026.
// ЗАЧЕМ. Цель, названная НОМЕРОМ в письме, устаревает быстрее, чем письмо доходит: за сутки
// подъём трижды останавливался на числе, верном в час отправки и неверном в час чтения.
// Этот режим не спрашивает «то ли число», он спрашивает ДРУГОЕ: «всё ли, что лежит на диске
// и поедет, ЗНАЧИТСЯ ПРИНЯТЫМ». Версии берутся с диска в момент вызова, сверка — с файлом
// принятых сумм. Гонка писем исчезает: обе стороны сверки снимаются здесь и сейчас.
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: режим НЕ проверяет, что на диске лежит ИМЕННО ТА редакция, которую
// решили поднять. Нужно определённое число — называйте цель явно, --cel. Он отвечает на
// вопрос «поедет ли принятое», а не «поедет ли задуманное»; это разные вопросы, и подменять
// второй первым нельзя — именно на этой подмене и держалась прежняя беда.
function razobrat_cel() {
  const fajl = znach('--cel-fajl', '');
  let syroe = znach('--cel', '');
  if (process.argv.includes('--cel-s-diska')) {
    if (fajl || syroe) return { beda: '--cel-s-diska не совмещается с --cel/--cel-fajl: две цели сразу — это две разные проверки' };
    return { s_diska: true };
  }
  if (fajl) {
    if (!existsSync(fajl)) return { beda: `файл цели ${fajl} не читается` };
    syroe = readFileSync(fajl, 'utf8').split('\n')
      .map((x) => x.trim()).filter((x) => x && !x.startsWith('#')).join(',');
  }
  if (!syroe) return { net: true };
  const cel = new Map();
  for (const kusok of syroe.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = kusok.match(/^([A-Za-z0-9@/._-]+)\s*[=\s]\s*(\S+)$/);
    if (!m) return { beda: `кусок цели «${kusok}» не разбирается (ожидалось «пакет=версия»)` };
    cel.set(m[1], m[2]);
  }
  return { cel };
}
const CEL = razobrat_cel();

let ishod = 0;
const povysit = (k) => { if (k === 1) ishod = 1; else if (k === 2 && ishod !== 1) ishod = 2; };
const slepota = (chto, kak) => { console.log(`СЛЕПОТА: ${chto}`); if (kak) console.log(`  ${kak}`); povysit(2); };

console.log(`машина: ${execFileSync('hostname').toString().trim()}   время: ${new Date().toISOString()}`);
console.log(`служба: ${SLUZHBA}   профиль: ${KOREN}\n`);

/**
 * Реестр плагинов (A-N-755): карта «каталог на диске → запись». Возвращает { po_puti } либо { beda }.
 * Разбор YAML — python3 + yaml, как у agent-plugins (своего YAML у Node нет), и те же ДВА раздела:
 * plugins И services. 🔴 Первый прогон читал один plugins и назвал «записи нет» у dsh-schedule-guard,
 * чья запись лежит в services, — ложное красное на исправном, поймано пробой на dsh.service.
 * 🔴 КЛЮЧ СВЕРКИ — ПУТЬ, А НЕ ИМЯ: у копий моста одно имя пакета и разные дома, а запись
 * реестра отвечает за МЕСТО. Путь записи и путь пакета сводятся realpath с обеих сторон.
 * ⚠️ Запись, чей path не разрешается (прозой, двумя путями через запятую), в карту не входит —
 * такой пакет получит «нет записи в реестре», то есть красное, а не молчание.
 * ⚠️ Два разных id на одном месте — отказ разбора (СЛЕПОТА): какая из записей «принята», решать не мне.
 */
function prochest_reestr(put) {
  let spisok;
  try {
    const json = execFileSync('python3', ['-c',
      'import sys,json,yaml;d=yaml.safe_load(open(sys.argv[1],encoding="utf-8")) or {};print(json.dumps((d.get("plugins") or [])+(d.get("services") or [])))', put],
      // 07.10 (Искра; находка Забавы 17:43Z на varvara.service): без maxBuffer Node берёт 1 МиБ, а JSON обоих разделов реестра
      // вырос до 1 108 726 байт (записи derevo) — «spawnSync python3 ENOBUFS», ворота слепли. 64 МиБ — как у чтения журнала ниже.
      { encoding: 'utf8', timeout: 30000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    spisok = JSON.parse(json);
  } catch (e) {
    return { beda: `реестр ${put} не прочитан: ${String(e?.stderr || e?.message || e).trim().split('\n').pop().slice(0, 160)}` };
  }
  if (!Array.isArray(spisok) || !spisok.length) return { beda: `в реестре ${put} нет записей (разделы plugins и services пусты)` };
  const po_puti = new Map();
  for (const z of spisok) {
    if (!z || typeof z.path !== 'string') continue;
    let rp; try { rp = realpathSync(z.path.trim()); } catch { continue; }
    const byla = po_puti.get(rp);
    if (byla && byla.id !== z.id) return { beda: `${rp}: две записи реестра на одном месте — ${byla.id} и ${z.id}` };
    po_puti.set(rp, z);
  }
  return { po_puti, vsego: spisok.length };
}

/**
 * Отпечаток по ЕГО ЖЕ команде из записи (fingerprint_check) — так же, как `agent-plugins verify`:
 * bash -c, код 0 ⇒ последняя строка вывода. У записей разные способы счёта (npm pack, src/*.js,
 * одиночный файл), и канон summa-predmeta совпадает не со всеми: свой способ здесь дал бы
 * ложную «подмену» на исправном пакете.
 * ⚠️ ЦЕНА: команда из реестра исполняется рукой прибора (в podyom-uzla — root). Это та же
 * граница доверия, что у agent-plugins verify, а не новая: кто пишет реестр (группа
 * agent-registry, файл 664), тот задаёт и команды, исполняемые здесь.
 */
function otpechatok(komanda) {
  try {
    const v = execFileSync('bash', ['-c', komanda], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const posl = v ? v.split('\n').pop().trim() : '';
    return posl ? { znach: posl } : { beda: 'команда отработала и не назвала значения' };
  } catch (e) {
    return { beda: `команда отпечатка отказала (${e?.code ?? e?.status ?? 'причина не названа'})` };
  }
}

/** Имена, ОБЪЯВЛЕННЫЕ к загрузке в конфиге профиля. */
function imena_iz_konfiga(put) {
  const t = readFileSync(put, 'utf8');
  const naydeno = new Set();
  for (const m of t.matchAll(/^\s*-?\s*name:\s*([A-Za-z0-9@/._-]+)\s*$/gm)) naydeno.add(m[1]);
  return naydeno;
}

// 🔴 ОБЛАСТЬ ОПРЕДЕЛЯЕТСЯ ТЕМ, ЧТО ИСПОЛНЯЕТСЯ, А НЕ ТЕМ, ЧТО ОБЪЯВЛЕНО
// (решение координатора 14.09.2026; способ мой, и он выбран ПОСЛЕ замера трёх негодных).
// Повод: dsh-pamyat-kompakt делает всю работу компакта, но не объявлен НИГДЕ — ни в конфиге
// профиля, ни в манифесте /opt/agent-plugins/package.json, ни в пресете агента (там он есть
// только в КОММЕНТАРИИ, то есть речь о предмете, а не объявление). Подключён он строкой
//   import { svodkaNashejModelyu } from "/opt/agent-plugins/dsh-pamyat-kompakt/index.mjs"
// из входного файла dsh-pamyat-kompakt-dsh. Одиннадцать ворот 13–14.09 судили предмет,
// которого не было в области вовсе: прибор не говорил о нём ни «принят», ни «не принят».
//
// ⚠️ ПОЧЕМУ НЕ ТРИ НАПРАШИВАВШИХСЯ СПОСОБА — замерено ДО работы, каждый отвергнут фактом:
//   1) дочитать остальные источники ОБЪЯВЛЕНИЯ (манифест профиля + пресет): объединение даёт
//      12 имён и покрывает 10 лежащих из 11 — kompakt не покрыт, он не объявлен нигде;
//   2) «что лежит на пути разрешения» (node_modules профиля): там 11 симлинков, kompakt
//      среди них НЕТ — по имени он не разрешается вовсе (MODULE_NOT_FOUND);
//   3) «что лежит в /opt/agent-plugins»: kompakt поймает, но область подключения шире одного
//      каталога — абсолютный путь ведёт куда угодно.
// ⇒ Годен только след САМОГО ПОДКЛЮЧЕНИЯ: кто кого реально импортирует.
//
// ⚠️ ГРАНИЦА, НАЗВАННАЯ ЗАРАНЕЕ И НЕПРЕОДОЛИМАЯ СТАТИЧЕСКИ: видны только ЛИТЕРАЛЬНЫЕ пути.
// В том же файле рядом живёт createRequire(...).resolve('@deepseek-ai/dsh-compaction-basic')
// с последующим import() по ВЫЧИСЛЕННОМУ пути — такого не увидит никакой разбор текста.
// Сегодня то подключение ведёт к пакету ПЛАТФОРМЫ, вне нашей приёмки; появись вычисляемый
// путь к нашему пакету — он пройдёт молча, и прибор обязан сказать это вслух, а не молчать.
// ⚠️ И вторая граница: читается ВХОДНОЙ файл пакета. Подключение из соседнего файла не видно.
function prjamye_podklyucheniya(imena, trebuem) {
  const najdeno = new Map();   // имя пакета → его входной файл (абсолютный)
  const otkuda  = new Map();   // имя пакета → «кто ссылается:строка»
  for (const imya of imena) {
    let vhod; try { vhod = trebuem.resolve(imya); } catch { continue; }
    let stroki; try { stroki = readFileSync(vhod, 'utf8').split('\n'); } catch { continue; }
    for (let i = 0; i < stroki.length; i++) {
      for (const m of stroki[i].matchAll(/from\s+["'](\/[^"']+)["']/g)) {
        const put = m[1];
        if (!existsSync(put)) continue;
        let kat = dirname(put);
        while (kat !== '/' && !existsSync(putR(kat, 'package.json'))) kat = dirname(kat);
        if (!existsSync(putR(kat, 'package.json'))) continue;
        let chuzhoe;
        try { chuzhoe = JSON.parse(readFileSync(putR(kat, 'package.json'), 'utf8')).name; } catch { continue; }
        if (!chuzhoe || imena.has(chuzhoe) || najdeno.has(chuzhoe)) continue;
        najdeno.set(chuzhoe, put);
        otkuda.set(chuzhoe, imya + ':' + (i + 1));
      }
    }
  }
  return { najdeno, otkuda };
}

const ozhidaemye = new Set();
// Карта «имя пакета → его каталог на пути процесса»: заполняется при обходе и нужна
// разряду «предмет против номера», который идёт ПОСЛЕ обхода.
const katalogiPaketov = new Map();
// Версии, снятые С ДИСКА при --cel-s-diska: нужны разряду «В БОЮ», который идёт ПОСЛЕ обхода.
const cel_s_diska = new Map();
// Карта «имя пакета → его записи в файле сумм»: нужна разряду меток, который идёт ПОСЛЕ.
let prinyatoeGlobalno = null;

// 🔴 ЦЕЛЬ НАЗЫВАЕТСЯ ПЕРВЫМ ДЕЛОМ — ЛИБО СЛЕПОТА. Прибор без цели отвечает на ДРУГОЙ
// вопрос («лежит ли принятое») и обязан сказать это вслух, а не выдать мягкое «можно».
if (CEL.beda || (CEL.net && !CEL.s_diska)) {
  if (CEL.beda) slepota(`цель подъёма не разобрана: ${CEL.beda}`, 'Сверять «то ли лежит» не с чем.');
  else slepota('цель подъёма НЕ НАЗВАНА (--cel «пакет=версия,…» либо --cel-fajl).',
    'Без неё прибор проверяет лишь «лежит ли что-то ПРИНЯТОЕ», а спрашивают о том, лежит ли ТО, '
    + 'ЧТО РЕШЕНО ПОДНЯТЬ. Это разные вопросы: на пути может лежать старая, но законно принятая '
    + 'редакция — и подъём окажется бессмысленным при зелёном приборе.');
  // 🔴 ДАЛЬШЕ НЕ ИДЁМ ВОВСЕ. Прогнать остальные проверки без цели значило бы напечатать
  // ответ на другой вопрос рядом со словом СЛЕПОТА — и читатель взял бы то, что понятнее.
  console.log('\nисход: 2 (0 можно · 1 НЕЛЬЗЯ · 2 слепота — ведёт себя как «нельзя»)');
  console.log('прибор только говорит: он не поднимает и не останавливает.');
  process.exit(2);
}

// ═══ ОЖИДАЕТСЯ ═══
if (!existsSync(KOREN))       slepota(`корень профиля ${KOREN} не читается.`, 'Путь процесса не определён — это НЕ «в порядке».');
else if (!existsSync(KONFIG)) slepota(`конфиг профиля ${KONFIG} не читается.`, 'Что объявлено к загрузке — неизвестно.');
else if (!existsSync(KANON))  slepota(`канон суммы предмета недоступен (${KANON}).`, 'Сверять нечем.');
else {
  const reestr = prochest_reestr(REESTR_PLAGINOV);
  if (reestr.beda) slepota(reestr.beda, 'Реестр не читается — сверять принятое не с чем. Это НЕ «нечего проверять».');
  else {
    const objavleno = imena_iz_konfiga(KONFIG);
    const modules = putR(KOREN, 'node_modules');
    const lezhit = existsSync(modules)
      ? new Set(readdirSync(modules).filter((i) => !i.startsWith('.') && !i.startsWith('@')))
      : new Set();
    if (!objavleno.size) slepota(`в конфиге ${KONFIG} не найдено ни одного имени плагина.`, 'Проверять нечего — это не «чисто».');
    else {
      const trebuem = createRequire(putR(KOREN) + '/');
      // Область = объявленное ПЛЮС то, что объявленные реально подключают прямым путём.
      // 🔴 ОБХОД ИДЁТ ПО ОБЪЯВЛЕННЫМ **И ЛЕЖАЩИМ**, и это не перестраховка: дыра двухслойная.
      // Ссылающийся пакет dsh-pamyat-kompakt-dsh САМ не объявлен в конфиге профиля (он живёт
      // в манифесте профиля и в пресете). Обходи мы только объявленных — до него бы не дошли,
      // и прямое подключение осталось бы невидимым. Проверено: с одними объявленными
      // область не менялась вовсе (объявлено 11, слепота по kompakt на месте).
      const prjam = prjamye_podklyucheniya(new Set([...objavleno, ...lezhit]), trebuem);
      for (const n of prjam.najdeno.keys()) objavleno.add(n);
      let svereno = 0, prinyato_n = 0;
      // 🔴 A-N-755: разряды по РЕЕСТРУ. Красное (1) называет предмет и запись:
      //   net_v_reestre — на месте пакета нет записи реестра: не проходило ворот либо не внесено;
      //   podmena       — запись есть, отпечаток на месте ДРУГОЙ: правили после монтажа либо записали не то;
      //   ne_ta_versiya — отпечаток совпал, а версия в записи другая: запись правлена наполовину.
      // Слепота (2): ne_sverit — отпечаток сверить нечем (в записи нет его или команды, либо команда отказала).
      const net_v_reestre = [], podmena = [], ne_ta_versiya = [], ne_sverit = [], ne_razreshilis = [], ne_cel = [], net_paketa = [];
      const korni = new Map();
      let po_celi = 0;
      for (const imya of [...objavleno].sort()) {
        ozhidaemye.add(imya);
        let vhod;
        // 🔴 ДВЕ ПРИЧИНЫ «НЕ РАЗРЕШИЛОСЬ» — РАЗНЫЕ НОВОСТИ, РАЗНЫЕ КОДЫ (ворота В10, 05.09.2026).
        // Пакета нет на месте (MODULE_NOT_FOUND) — это факт О ПРЕДМЕТЕ: поднимать НЕЛЬЗЯ (1).
        // Разрешение сорвалось по другой причине (права, битая ссылка) — это отказ ИНСТРУМЕНТА,
        // то есть слепота (2). Слить их в один код значило бы называть чужую беду своей.
        try { vhod = prjam.najdeno.get(imya) ?? trebuem.resolve(imya); }
        catch (e) {
          // 🔴 КОД ОШИБКИ ЗДЕСЬ НЕ РАЗЛИЧАЕТ ДВЕ БЕДЫ — проверено порчей 05.09.2026:
          // каталог с chmod 000 даёт РОВНО ТОТ ЖЕ MODULE_NOT_FOUND, что и отсутствие пакета.
          // Различить можно только вторым вопросом: ЛЕЖИТ ли каталог с таким именем.
          // lstat родителя прав на сам каталог не требует, потому ответ честен и в этом случае.
          let lezhit_no_ne_chitaetsya = false;
          try { lezhit_no_ne_chitaetsya = existsSync(putR(KOREN, 'node_modules', imya)); } catch { /* и это ответ */ }
          if (e && e.code === 'MODULE_NOT_FOUND' && !lezhit_no_ne_chitaetsya) net_paketa.push(imya);
          else ne_razreshilis.push(`${imya} (${lezhit_no_ne_chitaetsya ? 'каталог ЛЕЖИТ, но не читается' : (e && e.code) || 'причина не названа'})`);
          continue;
        }
        let kat = dirname(vhod);
        while (kat !== '/' && !existsSync(putR(kat, 'package.json'))) kat = dirname(kat);
        if (!existsSync(putR(kat, 'package.json'))) { net_v_reestre.push(`${imya} (манифест не найден)`); continue; }
        korni.set(dirname(kat), (korni.get(dirname(kat)) || 0) + 1);
        katalogiPaketov.set(imya, kat);
        let versiya_puti = null;
        try { versiya_puti = JSON.parse(readFileSync(putR(kat, 'package.json'), 'utf8')).version ?? null; } catch { /* видно ниже: версия null ≠ записи */ }
        // Цель с диска НЕ ЗАВИСИТ от приёмки: это «что лежит», а не «что принято» (находка 06.09) —
        // разряд «В БОЮ» обязан знать её и у пакета, который реестр не подтвердил.
        if (CEL.s_diska && versiya_puti) cel_s_diska.set(imya, versiya_puti);
        let kat_r = kat; try { kat_r = realpathSync(kat); } catch { /* не разрешился — ищем как есть */ }
        const zapis = reestr.po_puti.get(kat_r);
        if (!zapis) { net_v_reestre.push(`${imya}: на месте ${kat} записи в реестре НЕТ`); continue; }
        if (!zapis.fingerprint || !zapis.fingerprint_check) {
          ne_sverit.push(`${imya} [${zapis.id}]: в записи нет ${zapis.fingerprint ? 'fingerprint_check' : 'fingerprint'} — сверять содержимое не с чем`);
          continue;
        }
        const ot = otpechatok(zapis.fingerprint_check);
        if (ot.beda) { ne_sverit.push(`${imya} [${zapis.id}]: ${ot.beda}`); continue; }
        svereno++;
        if (ot.znach !== String(zapis.fingerprint)) {
          podmena.push(`${imya} [${zapis.id}] ${kat}: в реестре ${zapis.fingerprint}, на месте ${ot.znach}`);
          continue;
        }
        if (String(zapis.version) !== String(versiya_puti)) {
          ne_ta_versiya.push(`${imya} [${zapis.id}]: отпечаток совпал, а версия в реестре ${zapis.version}, на месте ${versiya_puti}`);
          continue;
        }
        const podhodit = [{ versiya: String(zapis.version) }];
        // 🔴 ПРИНЯТО — ЕЩЁ НЕ ЗНАЧИТ «ТО, ЧТО РЕШИЛИ ПОДНЯТЬ». Если цель названа, сверяем
        // с НЕЙ: на пути может лежать старая, но законно принятая редакция, и без этой
        // проверки прибор зеленел бы на бессмысленном подъёме.
        let nuzhna = CEL.cel?.get(imya);
        if (CEL.s_diska) {
          try { nuzhna = JSON.parse(readFileSync(putR(kat, 'package.json'), 'utf8')).version; }
          catch { nuzhna = undefined; }
          // 🔴 ЗАПОМИНАЕМ, ЧТО ВЗЯЛИ С ДИСКА (находка приёмки Н2, 06.09.2026).
          // Разряд «В БОЮ» ниже сверялся ТОЛЬКО с явной целью (CEL.cel). При цели с диска
          // эта карта пуста — и «в бою» проверялось лишь «назвался ли пакет», а не «та ли
          // версия». То есть после подъёма, не взявшего новое, прибор молчал бы — ровно там,
          // где он и нужен: приёмка «ПОСЛЕ» опирается на этот разряд.
          if (nuzhna) cel_s_diska.set(imya, nuzhna);
        }
        if (nuzhna && !podhodit.some((z) => z.versiya === nuzhna)) {
          ne_cel.push(`${imya}: на пути ${podhodit.map((z) => z.versiya).join('/')} (принята), а ЦЕЛЬ ${nuzhna}`);
          continue;
        }
        prinyato_n++;
        if (nuzhna) po_celi++;
      }
      console.log('ОЖИДАЕТСЯ (что процесс БУДЕТ читать: имена из конфига профиля, разрешение — механизмом Node):');
      console.log(`  объявлено ${objavleno.size} · сверено ${svereno} · принято ${prinyato_n}`
        + ` · нет записи в реестре ${net_v_reestre.length} · 🔴 ПОДМЕНА (отпечаток ≠ записи) ${podmena.length}`
        + ` · версия ≠ записи ${ne_ta_versiya.length} · ⚠️ сверить нечем ${ne_sverit.length}`
        + ` · не совпало с целью ${ne_cel.length} · нет на месте ${net_paketa.length}`
        + ` · разрешение сорвалось ${ne_razreshilis.length}`);
      // A-N-755: области «вне приёмки» больше нет — у каждого имени на пути ОБЯЗАНА быть запись
      // реестра. Строка печатается, чтобы смена правила не была молчаливой; --strogo ничего не меняет.
      console.log(`  источник принятого: реестр ${REESTR_PLAGINOV} (записей ${reestr.vsego}, с разрешимым путём ${reestr.po_puti.size})`
        + ' · «вне области приёмки» нет: имя без записи — красное');
      if (CEL.cel) console.log(`  цель подъёма: ${[...CEL.cel].map(([k, v]) => k + '=' + v).join(', ')} · совпало с целью ${po_celi}`);
      // 🔴 ЧИСЛО СНЯТЫХ ЦЕЛЕЙ ПЕЧАТАЕТСЯ ОТДЕЛЬНО ОТ ЧИСЛА СОВПАВШИХ. Это единственная
      // видимая снаружи опора для проверки, что цель снимается со ВСЕХ объявленных имён,
      // а не только с принятых: разряд «В БОЮ» читает журнал живой службы и пробой не
      // накрывается. Расхождение «снято N, объявлено M» само себя называет.
      if (CEL.s_diska) console.log(`  целей снято с диска: ${cel_s_diska.size} из ${objavleno.size} объявленных`
        + (cel_s_diska.size < objavleno.size ? ' 🔴 у остальных цель НЕ снята — разряд «В БОЮ» по ним слеп' : ''));
      if (CEL.s_diska) console.log(`  цель подъёма: СНЯТА С ДИСКА в ${new Date().toISOString()} · совпало с целью ${po_celi}`
        + ' — вопрос «поедет ли ПРИНЯТОЕ», а не «поедет ли задуманное»');
      for (const s of ne_cel)          { console.log(`  🔴 НЕ ЦЕЛЬ: ${s}`); povysit(1); }
      for (const s of podmena)         { console.log(`  🔴 ПОДМЕНА ПРЕДМЕТА: ${s}`); povysit(1); }
      for (const s of ne_ta_versiya)   { console.log(`  🔴 ВЕРСИЯ ≠ ЗАПИСИ: ${s}`); povysit(1); }
      for (const s of net_v_reestre)   { console.log(`  🔴 НЕТ ЗАПИСИ В РЕЕСТРЕ: ${s}`); povysit(1); }
      for (const s of ne_sverit)       { console.log(`  ⚠️  СЛЕПОТА (сверить нечем): ${s}`); povysit(2); }
      for (const s of net_paketa)      { console.log(`  🔴 объявлен, но НЕ НАЙДЕН ни по одному пути: ${s}`); povysit(1); }
      for (const s of ne_razreshilis)  { console.log(`  ⚠️  СЛЕПОТА: разрешение сорвалось не из-за отсутствия пакета: ${s}`); povysit(2); }
      // 🔴 «ОБЪЯВЛЕНО БЕЗ КАТАЛОГА» УБРАНО КАК ЛОЖНАЯ ТРЕВОГА (долг 123, закрыт 06.09.2026).
      // Признак строился обходом ОДНОГО каталога — <корень>/node_modules, — и потому объявлял
      // пропавшим всякий пакет, лежащий в корне напрямую. Замер в раскладке соседа: прибор
      // печатал «объявлено без каталога dsh-telegram-multiagent», а его же рукой пакет
      // разрешался в /opt/agent-plugins/dsh-telegram-multiagent — каталог был на месте.
      // В корне лежали ТРИ каталога пакетов, обход насчитал один.
      // ⚠️ И два разряда одного прибора говорили об одном предмете РАЗНОЕ: «разрешение
      // сорвалось 0» было верно, а эта строка — нет. Верен тот, что спрашивает механизмом
      // Node, а не обходом каталогов: он ищет так же, как ищет платформа.
      // Отдельной строки «объявлено без каталога» больше нет — этот случай уже печатается
      // выше как «объявлен, но НЕ НАЙДЕН ни по одному пути» (net_paketa), и печатать его
      // дважды разными словами значило бы дать двум разрядам спорить друг с другом.
      // 🔴 B-N-904 (25.09.2026, Михалыч; вердикт Вениамина по B-N-900): ПРЕСЕТ АГЕНТА — законный способ
      // подключения (<дом>/.dsh/.agent-presets/<агент>/agent.cordis.yml), который этот разряд не читал.
      // Прецедент: боевой dsh-pamyat-kompakt-dsh (пресет petrovich :177, у Искры так же) печатался «лишним».
      // Теперь имена из пресетов вычитаются из «лишних» и называются ОТДЕЛЬНОЙ строкой с файлом-источником.
      // Нечитаемый пресет — СЛЕПОТА вслух, и его пакеты ОСТАЮТСЯ в «лишних» (ошибка в безопасную сторону).
      // ⚠️ ГРАНИЦА ПРЕЖНЯЯ: package.json профиля (второй законный способ) по-прежнему не читается.
      const PRESETY = putR(KOREN, '..', '..', '.agent-presets');
      const iz_preseta = new Map(); const presety_slepye = [];
      let agenty = [];
      try { agenty = existsSync(PRESETY) ? readdirSync(PRESETY) : []; } catch { presety_slepye.push(PRESETY); }
      for (const ag of agenty) {
        const f = putR(PRESETY, ag, 'agent.cordis.yml');
        if (!existsSync(f)) continue;
        try { for (const i of imena_iz_konfiga(f)) if (!iz_preseta.has(i)) iz_preseta.set(i, f); }
        catch { presety_slepye.push(f); }
      }
      const po_presetu = [...lezhit].filter((i) => !objavleno.has(i) && iz_preseta.has(i));
      if (po_presetu.length) console.log(`  В КАТАЛОГЕ, ОБЪЯВЛЕН ПРЕСЕТОМ АГЕНТА (не лишний): ${po_presetu.map((i) => `${i} ← ${iz_preseta.get(i)}`).join(', ')}`);
      if (presety_slepye.length) console.log(`  ⚠️ СЛЕПОТА ПРЕСЕТА: не читается ${presety_slepye.join(', ')} — объявленное в нём остаётся среди «лишних» ниже`);
      const lishnie = [...lezhit].filter((i) => !objavleno.has(i) && !iz_preseta.has(i));
      if (lishnie.length) {
        // 🔴 ФОРМУЛИРОВКА ИСПРАВЛЕНА 10.09.2026 (нашла Забава, текст Вениамина).
        // Было: «ЛЕЖИТ БЕЗ ОБЪЯВЛЕНИЯ» — утверждение про ОБЪЯВЛЕНИЕ, которого этот
        // разряд НЕ ВИДИТ: он знает только имена из КОНФИГА профиля. А подключать пакет
        // можно ЕЩЁ ДВУМЯ законными способами — package.json профиля и пресет агента.
        // ПРЕЦЕДЕНТ: dsh-pamyat-kompakt-dsh печатался здесь как «лишний» — а он БОЕВОЙ
        // и пишет СВОДКУ КОМПАКТА. Строка чуть не стоила нам сноса боевого механизма.
        console.log(`  ⚠️ В КАТАЛОГЕ, НО НЕ В КОНФИГЕ ПРОФИЛЯ (в ${putR(KOREN, 'node_modules')}): ${lishnie.join(', ')}`);
        console.log('     ⚠️ ЭТО НЕ ЗНАЧИТ «мусор». Ворота про такой пакет не говорят НИЧЕГО:'
          + ' ни «принят», ни «не принят». Он может быть и мусором, и БОЕВЫМ механизмом,'
          + ' подключённым через package.json профиля ЛИБО через пресет'
          + ' (.agent-presets/<агент>/agent.cordis.yml). Проверь ОБА, прежде чем счесть мусором.');
        console.log('     ⚠️ ГРАНИЦА: обход смотрит ТОЛЬКО этот каталог. Пакеты, лежащие в других'
          + ' корнях, сюда не попадают, и пустая строка НЕ значит «лишних на машине нет».');
      }
      // 🔴 КОРНИ ХРАНЕНИЯ — ВЫЧИСЛЯЮТСЯ, А НЕ ПЕРЕЧИСЛЯЮТСЯ (замер 05.09.2026 по замечанию
      // о том, что путь доставки не один). Объявление в конфиге всегда ПО ИМЕНИ, а куда имя
      // ведёт — решает ссылка в node_modules профиля, и её ставят рукой. Значит число корней
      // не закреплено нигде и меняется БЕЗ СЛЕДА в конфиге. Держать их списком в приборе
      // нельзя: появится четвёртый — список промолчит. Печатаем то, что получилось.
      // ЧИТАЮЩЕМУ: сверь это число со своим знанием устройства; оно не проверяется ничем.
      console.log(`  корней хранения: ${korni.size} — `
        + [...korni].sort().map(([k, v]) => `${k} (${v})`).join(' · '));
      console.log('  область: то, что ОБЪЯВЛЕНО В КОНФИГЕ, а не всё установленное на машине.');
      // 🔴 ЦЕЛЬ, НЕ СОПОСТАВЛЕННАЯ НИ С ОДНИМ ОБЪЯВЛЕННЫМ ИМЕНЕМ, — СЛЕПОТА, А НЕ НОЛЬ.
      // Найдено 05.09.2026 собственной проверкой прибора: цель «core=…» (короткое имя вместо
      // dsh-pamyat-core) давала «совпало с целью 0» и НИ ОДНОЙ строки тревоги. Опечатка в
      // имени цели или цель про ЧУЖОЙ узел выглядели бы точно так же, как честная сверка.
      if (CEL.cel) {
        const chuzhie = [...CEL.cel.keys()].filter((i) => !objavleno.has(i));
        if (chuzhie.length) {
          console.log(`  🔴 СЛЕПОТА: цель названа для имён, которых на этом узле НЕТ среди объявленных: ${chuzhie.join(', ')}`);
          console.log('     Это не «нельзя» и не «можно»: проверить такую цель нечем. Опечатка в имени');
          console.log('     либо цель про другой узел. Полные имена — как в конфиге профиля.');
          // 🔴 ПОДСКАЗКА, А НЕ ПОДСТАНОВКА. 06.09.2026 приёмка позвала `--cel core=…` и прочла
          // строку «совпало с целью 0» ОТДЕЛЬНО от блока слепоты — решила, что прибор молчит.
          // Он не молчал; не хватало ПРИМЕРА полного имени рядом с отказом. Отсылка «смотри
          // конфиг» заставляет читающего идти в другое место, а он в этот миг занят подъёмом.
          // Подставлять молча НЕЛЬЗЯ: «dsh-pamyat-core» и «dsh-tool-bridge» на короткое имя
          // угадываются по-разному, и уверенный ответ про НЕ ТОТ пакет хуже отказа.
          for (const ch of chuzhie) {
            const pohozhie = [...objavleno].filter((i) => i.includes(ch));
            if (pohozhie.length === 1) {
              console.log(`     похоже, имелось в виду: ${pohozhie[0]}=<версия> (подсказка, не подстановка)`);
            } else if (pohozhie.length > 1) {
              console.log(`     «${ch}» входит в несколько объявленных имён: ${pohozhie.join(', ')} — назовите полностью`);
            }
          }
          povysit(2);
        }
      }
    }
  }
}

// ═══ В БОЮ ═══
if (POSLE) {
  console.log('');
  let start = '';
  try { start = execFileSync('systemctl', ['show', SLUZHBA, '-p', 'ActiveEnterTimestamp', '--value'], { encoding: 'utf8' }).trim(); } catch { start = ''; }
  // 🔴 ОКНО — С МОМЕНТА СТАРТА СЛУЖБЫ, А НЕ С ЗАГРУЗКИ МАШИНЫ. Первая редакция брала
  // всю загрузку системы и напечатала 27 строк: службу перезапускали много раз, и в списке
  // оказались давно снятые версии. «Загрузка машины» и «запуск службы» — разные окна,
  // и смешение выдаёт ИСТОРИЮ за СОСТОЯНИЕ.
  let stroki = null;
  if (!start) slepota(`время старта службы ${SLUZHBA} не снялось.`, 'Окно журнала неизвестно; вся загрузка машины дала бы историю вместо состояния.');
  else { try { stroki = execFileSync('sudo', ['-n', 'journalctl', '-u', SLUZHBA, '--since', start, '--no-pager'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch { stroki = null; } }
  if (start && !stroki) slepota(`журнал службы ${SLUZHBA} не читается.`, 'Что в бою — сказать нечем.');
  else if (stroki) {
    const nazvalis = new Map();
    // 🔴 B-N-751 (24.09.2026, Михалыч): после версии допускается ХВОСТ до «]». Было — «]» сразу после версии,
    // и пакеты, печатающие себя как «[dsh-pamyat-secretary 0.1.0-alpha.65 2026-…Z]» или
    // «[dsh-telegram-multiagent 1.5.38 · область 69]», числились «не печатает версию (долг 108)» —
    // исход прибора был 2 при ЛЮБОМ подъёме, квитанция не выставлялась никогда, sadik-watch тревожил вечно.
    for (const m of stroki.matchAll(/\[([a-z][a-z0-9-]+) (\d[0-9a-z.-]*)(?:\s[^\]]*)?\]/g)) nazvalis.set(m[1], m[2]);
    console.log(`В БОЮ (что процесс НАПЕЧАТАЛ О СЕБЕ с момента старта ${start}):`);
    // 🔴 УСЛОВИЕ В4: НЕ ПЕЧАТАЮЩИЕ ВЕРСИЮ НАЗЫВАЮТСЯ ПОИМЁННО, А НЕ ПРОПУСКАЮТСЯ.
    // Пакет, молчащий о себе, для этой проверки НЕВИДИМ — и «сверено 5» без указания,
    // что шестой не сверяем вовсе, читалось бы как «проверено всё».
    const ne_sveryaem = [...ozhidaemye].filter((i) => !nazvalis.has(i)).sort();
    // 🔴 ЦЕЛЬ ПОДЪЁМА — КАНОН ДИСКА В МОМЕНТ ПОДЪЁМА, А НЕ ДИСК СЕЙЧАС (Б14, вторая половина).
    // ЗАЧЕМ. Разряд ниже спрашивает «то ли в бою, что решили поднять». Пока цель бралась с
    // ТЕКУЩЕГО диска, у выпускающего агента вопрос был непроходим ПО ПОСТРОЕНИЮ: смонтировал
    // новую версию — и цель стала новее боя, разряд покраснел, квитанция про ТОТ подъём не
    // выставилась НИКОГДА. Отказ при этом законный по букве и бессмысленный по существу:
    // бой обязан держать редакцию, прочитанную при старте, а не догонять диск.
    // Снимок канонов пишет podyom-uzla сразу после состоявшегося подъёма — он и есть цель.
    //
    // 🔴 СНИМОК ПРИНИМАЕТСЯ ТОЛЬКО СВОЙ. Сверяется ActiveEnter снимка с ActiveEnter службы:
    // снимок от ПРОШЛОГО подъёма описывает другой бой, и молча взять его — значит проверить
    // не тот предмет. Чужой снимок НЕ используется и НЕ замалчивается.
    //
    // ⚠️ ГДЕ НЕ ПРИМЕНЯЕТСЯ И ЧЕМ КОНЧАЕТСЯ: нет снимка, он не разбирается, недописан или про
    // другой подъём — цель остаётся с ТЕКУЩЕГО диска, то есть прежнее поведение, и это
    // ПЕЧАТАЕТСЯ строкой. Отката к снимку «по умолчанию» нет: молчаливая замена источника
    // цели и есть то, из-за чего разряд однажды покраснел без причины.
    let cel_iz_snimka = null;
    if (CEL.s_diska) {
      const snf = process.env.SNIMOK_KANONOV
        || `/var/log/podyom-uzla/snimok-kanonov-${SLUZHBA.replace(/\.service$/, '')}.txt`;   // A-N-1726: снимок переехал из procedury в каталог следа (root)
      const sek = (x) => { const t = Date.parse(String(x).replace(/^[A-Za-z]{3} /, '')); return Number.isFinite(t) ? Math.floor(t / 1000) : null; };
      if (!existsSync(snf)) {
        console.log(`  ⚠️ СНИМКА КАНОНОВ НЕТ (${snf}) — цель взята с ТЕКУЩЕГО диска.`);
        console.log('     Значит выпуск после подъёма может законно покрасить этот разряд.');
      } else {
        let t = null; try { t = readFileSync(snf, 'utf8'); } catch { t = null; }
        const vhod = t && t.match(/ActiveEnter:\s*([^\n·]+?)\s*·/);
        if (!t || !/^ЗАВЕРШЁН$/m.test(t)) {
          console.log(`  ⚠️ СНИМОК КАНОНОВ НЕ ЦЕЛЫЙ (${snf}): нет строки ЗАВЕРШЁН — недописан или оборван.`);
          console.log('     Не использую: половина снимка описывает половину боя. Цель — с текущего диска.');
        } else if (!vhod || sek(vhod[1]) === null || sek(start) === null || sek(vhod[1]) !== sek(start)) {
          console.log(`  ⚠️ СНИМОК ПРО ДРУГОЙ ПОДЪЁМ: в снимке ActiveEnter «${vhod ? vhod[1].trim() : 'не разобран'}», у службы «${start}».`);
          console.log('     Не использую: чужой снимок описывает другой бой. Цель — с текущего диска.');
        } else {
          cel_iz_snimka = new Map();
          for (const m of t.matchAll(/^([A-Za-z0-9@/._-]+)\s+(\S+)\s+([0-9a-f]{16})\s+\S+$/gm)) cel_iz_snimka.set(m[1], m[2]);
          if (!cel_iz_snimka.size) {
            cel_iz_snimka = null;
            console.log(`  ⚠️ СНИМОК ЦЕЛ, НО ПУСТ (${snf}): ни одной строки пакета. Цель — с текущего диска.`);
          } else {
            console.log(`  цель разряда — КАНОН ДИСКА ПРИ ПОДЪЁМЕ: снимок ${snf}, пакетов ${cel_iz_snimka.size}`);
          }
        }
      }
    }

    // 🔴 «В БОЮ» СВЕРЯЕТСЯ С ТОЙ ЖЕ ЦЕЛЬЮ, что и «ожидается». Иначе подъём на старую, но
    // принятую редакцию прошёл бы ОБЕ проверки зелёным.
    const ne_ta = [];
    for (const [imya, v] of [...nazvalis].sort()) {
      // Цель берётся из явной карты ЛИБО из снятой с диска — иначе режим --cel-s-diska
      // оставляет этот разряд слепым (Н2 приёмки).
      const nuzhna = CEL.cel?.get(imya) ?? cel_iz_snimka?.get(imya) ?? cel_s_diska.get(imya);
      const znak = nuzhna ? (v === nuzhna ? ' ✅ цель' : ` 🔴 ЦЕЛЬ ${nuzhna}`) : '';
      if (nuzhna && v !== nuzhna) ne_ta.push(`${imya}: в бою ${v}, цель ${nuzhna}`);
      console.log(`  [${imya} ${v}]${znak}`);
    }
    for (const s of ne_ta) povysit(1);
    for (const i of ne_sveryaem) console.log(`  ⚠️ НЕ СВЕРЯЕМ: ${i} — не печатает версию при подъёме (долг 108)`);
    // B-N-751: числитель — ОЖИДАЕМЫЕ, назвавшие себя. Было nazvalis.size: туда входят и пакеты не из конфига
    // (kompakt и др.), и «11 из 11» прятало 2 не сверенных из ожидаемых.
    console.log(`  в бою сверено ${ozhidaemye.size ? [...ozhidaemye].filter((i) => nazvalis.has(i)).length : nazvalis.size} из ${ozhidaemye.size || nazvalis.size} ожидаемых`
      + `, не сверяемых ${ne_sveryaem.length}`);
    if (!nazvalis.size) slepota('ни один пакет не назвал себя в журнале этого запуска.', 'Сверять с ожидаемым нечего.');
    else if (ne_sveryaem.length) povysit(2);
  }

  // ── (б) БОЙ = ДИСК СЕЙЧАС? — ПО УСТРОЙСТВУ, НЕ ПО ГОЛОСУ (Б14) ──
  // 🔴 ЗАЧЕМ ОТДЕЛЬНЫМ ВОПРОСОМ. Прежде режим «после» сверял бой с ТЕКУЩИМ диском и у
  // выпускающего агента был непроходим ПО ПОСТРОЕНИЮ: диск уходит вперёд боя через минуты,
  // квитанция не выставилась бы никогда, а тревога «подъём не подтверждён» стала бы фоном.
  // Класс: ворота, непроходимые никогда, обходят не глядя. Поэтому вопросов ДВА:
  //   (а) поднятое принято и полно?  → квитанция, тревога гаснет ЗДЕСЬ
  //   (б) бой = диск сейчас?         → СТРОКА СОСТОЯНИЯ, не отказ и не тревога
  //
  // 🔴 ПОЧЕМУ ctime, А НЕ mtime: mtime подделывается сохранением времени при подмене
  // (cp -a, cp -p, git archive | tar -x переносят время источника — файл, положенный
  // сегодня, покажет прошлую неделю). ctime ставит ЯДРО при любой замене или переносе, и
  // обычными средствами его не обойти. ПРОВЕРЕНО ЗАМЕРОМ 09.09.2026, не рассуждением:
  //   файл с mtime 01.08 → mv в той же ФС → mtime 01.08 ПРЕЖНИЙ, ctime СЕГОДНЯШНИЙ
  //   тот же файл       → cp -p         → mtime 01.08 ПРЕЖНИЙ, ctime СЕГОДНЯШНИЙ
  // Это важно отдельно для mv: атомарная подмена монтажом делается именно им, и если бы mv
  // сохранял ctime, признак пропускал бы ровно тот случай, ради которого заведён.
  //
  // ⚠️ ГРАНИЦА, И ОНА НАМЕРЕННАЯ: «ctime < ActiveEnter» доказывает, что файл был таким ДО
  // подъёма. При ЛЕНИВОЙ загрузке модуля файл, заменённый после подъёма, даст «диск
  // впереди» — прибор ошибётся В БЕЗОПАСНУЮ СТОРОНУ. Это запас, а не дефект.
  const t_start = start ? Date.parse(start.replace(/^[A-Za-z]{3} /, '')) : NaN;
  console.log('');
  if (!Number.isFinite(t_start)) {
    console.log(`  ⚠️ ДИСК = БОЙ? не решено: время старта «${start || 'пусто'}» не разобрано`);
  } else {
    const vperedi = [];
    let sverennyh = 0, ne_chitalis = 0;
    for (const [imya, kat] of katalogiPaketov) {
      let pozzhe = false, fajlov = 0;
      try {
        for (const rel of readdirSync(kat, { recursive: true })) {
          const p = `${kat}/${rel}`;
          let st; try { st = statSync(p); } catch { continue; }
          if (!st.isFile()) continue;
          fajlov++;
          if (st.ctimeMs > t_start) { pozzhe = true; break; }
        }
      } catch { ne_chitalis++; continue; }
      if (!fajlov) { ne_chitalis++; continue; }
      sverennyh++;
      if (pozzhe) vperedi.push(imya);
    }
    if (vperedi.length) {
      console.log(`  ДИСК ВПЕРЕДИ БОЯ: ${vperedi.length} из ${sverennyh} пакетов правлены ПОСЛЕ подъёма`);
      console.log(`     ${vperedi.sort().join(', ')}`);
      console.log('     Это СОСТОЯНИЕ, а не отказ: бой держит редакцию, прочитанную при старте.');
    } else {
      console.log(`  ДИСК = БОЙ: все ${sverennyh} сверенных пакетов не менялись с подъёма`);
    }
    if (ne_chitalis) console.log(`  ⚠️ не прочитано каталогов: ${ne_chitalis} — на исход НЕ влияет, но это слепота`);
  }
}

// ═══ РАЗРЯД «ПРЕДМЕТ ПРОТИВ НОМЕРА» (ключ --reestr, 05.09.2026) ═════════════
// 🔴 ЗАЧЕМ. Сегодня на диске лежало 22 файла с одной суммой, а в реестре под ТЕМ ЖЕ
// номером — 20 с другой: правка легла, номер не подняли. В бой поехала бы редакция,
// которой в реестре нет, журнал печатал бы прежний номер, и ВСЕ наши проверки сказали
// бы «сходится» — они сверяют ВЕРСИЮ, а разошёлся ПРЕДМЕТ.
// Формулировка приёмки: сторож обязан кричать ДО подъёма, а не приёмка после.
//
// ⚠️ ПО УМОЛЧАНИЮ ВЫКЛЮЧЕН, И ЭТО НЕ ОСТОРОЖНОСТЬ. Разряд ходит в СЕТЬ за тарболом
// каждого пакета: без ключа прибор остаётся быстрым и работает без сети, а строка ниже
// говорит, что разряд НЕ проверялся — молчание не должно читаться как «сошлось».
// 🔴 «РАЗРЯД ШЁЛ» И «РАЗРЯД ЧТО-ТО ПРОВЕРИЛ» — РАЗНЫЕ ВЕЩИ (замер 14.09.2026).
// Прогон с --reestr давал «проверено разрядов 3 из 5» ПРИ НУЛЕ СВЕРОК: все двенадцать
// предметов невыпущены, значит сверять не с чем по построению. Счёт числил разряд
// пройденным по факту поданного КЛЮЧА, а не по факту работы — и это то же «число без
// способа», только про покрытие. Ниже счёт берётся из настоящих сверок.
let REESTR_SVERIL = null; // null — ключ не подан; число — сколько предметов реально сверено
// ═══ РАЗРЯД «ПРЕДМЕТ ПРОТИВ НОМЕРА» — ВЫКЛЮЧЕН, НЕ УДАЛЁН (14.09.2026) ═══════════════
// 🔴 ОТМЕНЕНО РАСПОРЯЖЕНИЕМ ВЛАДЕЛЬЦА (слово Александра 06.09 14:21, дословно):
//   «отмена всех публикаций, ОТМЕНА ПРОВЕРКИ ВЕРСИЙ ОПУБЛИКОВАННОГО, отмена поиска
//    в опубликованном каких-то глюков».
// ПРИЧИНА: разряд тянет тарбол ИЗ РЕЕСТРА npm (`npm pack <имя>@<версия> --prefer-online`,
//   строка ниже в сохранённом теле) и сверяет с ним сумму диска. Это и есть проверка
//   версий опубликованного, слово в слово. Предмета больше нет — проверять нечего.
// 🔴 ГРАНИЦА, КОТОРАЯ ЗДЕСЬ СТОЯЛА, БЫЛА ЛОЖНОЙ И ЕЁ ПРИШЛОСЬ СНЯТЬ: соседний комментарий
//   утверждал, что этот разряд «сверяет сумму диска ЛОКАЛЬНО (канон summa-predmeta) и в сеть
//   не ходит». Локален только ПРИБОР СВЁРТКИ; предмет сравнения берётся по сети. Замер 14.09:
//   `npm pack … --prefer-online` — обращение наружу. Комментарий защищал разряд, подлежащий
//   выключению, и потому был опаснее голого умолчания: он выглядел проверенной границей.
// ПОЧЕМУ ВЫКЛЮЧЕН, А НЕ ВЫРЕЗАН — тот же довод владельца: удалённое через месяц неотличимо
//   от «такой проверки никогда не было». Выключенное несёт свою историю.
console.log('\nПРЕДМЕТ ПРОТИВ НОМЕРА: РАЗРЯД ВЫКЛЮЧЕН — отменено распоряжением владельца 06.09'
  + ' (публикация наружу запрещена; сверять диск с реестром npm больше не с чем).'
  + '\n  Это НЕ «проверено и чисто» и НЕ поломка: разряд не исполнялся вовсе.');
if (false) {   // ← тело разряда сохранено ЦЕЛИКОМ и не исполняется
  const kanon = '/usr/local/bin/summa-predmeta-2';
  console.log('\nПРЕДМЕТ ПРОТИВ НОМЕРА (сумма диска против тарбола ТОЙ ЖЕ версии из реестра):');
  if (!existsSync(kanon)) {
    slepota('канона суммы нет: ' + kanon, 'Сверять содержимое нечем.');
  } else {
    let soshlos = 0, razoshlos = 0, netVReestre = 0;
    for (const [imya, kat] of [...katalogiPaketov].sort()) {
      let v;
      try { v = JSON.parse(readFileSync(putR(kat, 'package.json'), 'utf8')).version; } catch { v = null; }
      if (!v) { console.log(`  ⚠️ ${imya} — версия из манифеста не прочиталась`); netVReestre++; continue; }
      let sd = null;
      try { sd = execFileSync(kanon, [kat]).toString().trim().split(/\s+/)[1]; } catch { sd = null; }
      if (!sd) { console.log(`  ⚠️ ${imya} ${v} — сумма диска не снялась`); netVReestre++; continue; }
      const vrem = execFileSync('mktemp', ['-d']).toString().trim();
      let sr = null;
      try {
        execFileSync('npm', ['pack', `${imya}@${v}`, '--prefer-online'], { cwd: vrem, stdio: 'ignore', timeout: 90000 });
        const tgz = readdirSync(vrem).find((f) => f.endsWith('.tgz'));
        execFileSync('tar', ['xzf', tgz], { cwd: vrem });
        sr = execFileSync(kanon, [putR(vrem, 'package')]).toString().trim().split(/\s+/)[1];
      } catch { sr = null; }
      try { execFileSync('rm', ['-rf', vrem]); } catch { /* и это ответ */ }
      if (!sr) { console.log(`  ⚠️ ${imya} ${v} — в реестре этой версии нет либо сеть молчит (для невыпущенной это НОРМА)`); netVReestre++; continue; }
      if (sd === sr) { console.log(`  ✅ ${imya} ${v} — предмет тот же (${sd})`); soshlos++; }
      else { console.log(`  🔴 ${imya} ${v} — ПРЕДМЕТ РАЗОШЁЛСЯ ПРИ ОДНОМ НОМЕРЕ: диск ${sd}, реестр ${sr}`); razoshlos++; povysit(1); }
    }
    console.log(`  сверено ${soshlos} · РАЗОШЛОСЬ ${razoshlos} · нет в реестре ${netVReestre}`);
    REESTR_SVERIL = soshlos + razoshlos;
    console.log('  ⚠️ «нет в реестре» — не беда: так выглядит всякая невыпущенная версия.');
  }

  // ═══ РАЗРЯД «МЕТКА ПРОТИВ ВЕРДИКТА» — ВЫКЛЮЧЕН, НЕ УДАЛЁН ══════════════════════
  // 🔴 ОТМЕНЕНО РАСПОРЯЖЕНИЕМ ВЛАДЕЛЬЦА (слово Александра, передано 09.09.2026):
  //   «выключай, не удаляй а именно выключай».
  // ПРИЧИНА: публикация наружу запрещена, а разряд сверял НАШ репозиторий с реестром
  //   npm (curl registry.npmjs.org, поиск по мейнтейнеру) — работа вокруг опубликованного.
  //   Предмета больше нет, значит и проверять нечего.
  // 🔴 ПОЧЕМУ ВЫКЛЮЧЕН, А НЕ ВЫРЕЗАН — довод владельца его же словами: удалённый разряд
  //   через месяц неотличим от «такой проверки у нас никогда не было». Выключенный несёт
  //   СВОЮ ИСТОРИЮ: вернётся предмет — вернётся и проверка, изобретать заново не придётся.
  // ⚠️ ГРАНИЦА ВЫКЛЮЧЕНИЯ: молчит ТОЛЬКО этот разряд. Соседний «предмет-против-номера»
  //   на том же ключе --reestr работает как работал — он сверяет сумму диска с тарболом
  //   ЛОКАЛЬНО (канон summa-predmeta) и в сеть не ходит. Выключить оба по имени ключа
  //   значило бы убить проверку, к распоряжению отношения не имеющую.
  console.log('\nМЕТКА ПРОТИВ ВЕРДИКТА: РАЗРЯД ВЫКЛЮЧЕН — отменено распоряжением владельца'
    + ' (публикация наружу запрещена; сверять репозиторий с реестром npm больше не с чем).'
    + '\n  Это НЕ «проверено и чисто» и НЕ поломка: разряд не исполнялся вовсе.');
  if (false) {   // ← тело разряда сохранено ЦЕЛИКОМ и не исполняется
    // ═══ РАЗРЯД «МЕТКА ПРОТИВ ВЕРДИКТА» (06.09.2026) ══════════════════════════════
    // 🔴 ЗАЧЕМ. Сутки все трое проверяли метки признаком «latest ≠ neprinyato» — сравнением
    // меток МЕЖДУ СОБОЙ. У вывоза они были разными, признак давал зелёное, а указывали обе
    // НАОБОРОТ: latest на версии с вердиктом отказа, neprinyato на условно принятой. То есть
    // посторонний по имени пакета получал отвергнутое, и это не заметил никто.
    // Годный признак сверяет КАЖДУЮ метку с файлом сумм: latest обязан стоять на принятой,
    // neprinyato — на непринятой. Метки друг о друге не говорят ничего.
    //
    // 🔴 И ВТОРАЯ ПРИЧИНА ЗАВЕСТИ ЭТО ПРИБОРОМ, А НЕ РУКОЙ. Ручной замер того же вопроса
    // соврал сегодня трижды у трёх разных рук: у приёмки (список собран по НАЛИЧИЮ метки),
    // у соседа (верный критерий приложен к ЧУЖОМУ перечню — лишнее нашлось, недостающее
    // нет) и у меня (сборка на оболочке: `cut` при отсутствии разделителя печатает строку
    // целиком, и «метки нет» превращалось в «метка = latest», девять ложных тревог разом).
    // Область здесь берётся не из перечня, а из КОНФИГА ПРОФИЛЯ — то же, что у разряда выше.
    // ⚠️ ЧЕМ ЭТОТ РАЗРЯД ПРОВЕРЕН, И ЧЕГО У НЕГО НЕТ. Пробы в стенде НЕТ намеренно: разряд
    // ходит в сеть, а стенд, ходящий в сеть, отвечает про сегодняшний реестр, а не про
    // прибор. Проверен тремя порчами рукой 06.09: latest на непринятой → красное с именем
    // и исход 1; neprinyato на принятой → то же; различение «нет в реестре / нет метки»
    // снято → числа переезжают в другой столбец. Порчи вносились подменой ОТВЕТА реестра
    // на копии прибора, боевой реестр не трогался.
    console.log('\nМЕТКА ПРОТИВ ВЕРДИКТА (каждая метка против файла сумм, НЕ метки друг с другом):');
    if (!prinyatoeGlobalno) {
      slepota('файл принятых сумм не разобран — сверять метку не с чем.',
              'Это «не смотрели», а не «метки верны».');
    } else {
      let vernyh = 0, lzhivyh = 0, bezMetki = 0, nespros = 0, netPaketa = 0, vneObl = 0;
      const prinyataLi = (imya, versiya) =>
        (prinyatoeGlobalno.get(imya) || []).some((z) => z.rod === 'prinyato' && z.versiya === versiya);
      const znaemLi = (imya) => prinyatoeGlobalno.has(imya);
  
      // 🔴 ОБЛАСТЬ — ДВА ИСТОЧНИКА, А НЕ ОДИН (06.09.2026, находка Михалыча).
      // Вчера я вписала сюда границу «полной области „все наши имена" не существует нигде,
      // кроме конфигов». Она была ЛОЖНОЙ — и это опаснее ошибки в числе: число сверяют, а
      // границу принимают на слово и больше не трогают. Реестр не умеет искать ПО МЕТКЕ, но
      // умеет искать ПО МЕЙНТЕЙНЕРУ, и вся наша область берётся одним запросом.
      // Из невозможности ОДНОГО пути не следует невозможность задачи — тот же шаг, на котором
      // Михалыч поймал себя днём с восстановимостью знания по ссылке.
      //
      // ⚠️ ПОЧЕМУ ВСЁ-ТАКИ ОБА ИСТОЧНИКА. Конфиг знает СМОНТИРОВАННОЕ, включая то, что мы
      // намеренно не публикуем; реестр знает ОПУБЛИКОВАННОЕ под нашей учётной записью,
      // включая то, чего на этой машине нет вовсе. Ни один не покрывает другой.
      // ⚠️ ЧЕГО НЕ ЗНАЕТ И ОБЪЕДИНЕНИЕ — ДВА СЛУЧАЯ, оба названы в выводе:
      //   пакет под ДРУГОЙ учётной записью, не смонтированный здесь;
      //   пакет, ПОМЕЧЕННЫЙ УСТАРЕВШИМ — поиск по мейнтейнеру его не отдаёт.
      // 🔴 Второе я ИЗМЕРИЛА 05.09.2026 (так из поиска пропали два пробных пакета, и перечень
      // выглядел полным, не содержа искомого) и записала в память — а сегодня, вставляя этот
      // разряд, границу не применила: и я, и Михалыч объявили область по мейнтейнеру полной.
      // Память не срабатывает сама: к ней идут, когда думают о предмете правила, то есть не
      // тогда, когда правило нужно. Потому граница стоит ЗДЕСЬ, а не только там.
      const izKonfiga = new Set([...katalogiPaketov].map(([i]) => i));
      let izReestra = new Set(); let poiskOk = false;
      try {
        const syro = execFileSync('curl', ['-sS', '--max-time', '25',
          'https://registry.npmjs.org/-/v1/search?text=maintainer%3Aiia-arg&size=250']).toString();
        const d = JSON.parse(syro);
        for (const o of (d.objects || [])) if (o?.package?.name) izReestra.add(o.package.name);
        poiskOk = izReestra.size > 0;
      } catch { poiskOk = false; }
      if (!poiskOk) {
        console.log('  ⚠️ поиск по мейнтейнеру не удался — область СУЖЕНА до имён из конфига.');
        console.log('     Это «часть области», а не «вся»: пакет, которого нет на этой машине, не проверен.');
      }
      const oblast = [...new Set([...izKonfiga, ...izReestra])].sort();
      console.log(`  область: ${oblast.length} имён = конфиг профиля (${izKonfiga.size})`
        + ` ∪ реестр по мейнтейнеру iia-arg (${poiskOk ? izReestra.size : 'не спросился'})`);
      for (const imya of oblast) {
        let metki = null;
        try {
          const syro = execFileSync('curl', ['-sS', '--max-time', '20',
            `https://registry.npmjs.org/${imya}`]).toString();
          const telo = JSON.parse(syro);
          metki = telo.error ? { __net_paketa: telo.error } : (telo['dist-tags'] || {});
        } catch { metki = null; }
        // 🔴 СПРАШИВАЕМ РЕЕСТР ПРЯМО, А НЕ КЛИЕНТОМ: `npm view` кэширует и за сутки соврал
        // дважды — оба раза оптимистично, показав состояние ДО нашей же правки.
        if (!metki) { console.log(`  ⚠️ ${imya} — реестр не ответил: это слепота, не «меток нет»`); nespros++; continue; }
        // 🔴 ТРИ РАЗНЫЕ НОВОСТИ, А НЕ ОДНА (поймано порчей в собственной правке, 06.09).
        // Первая редакция печатала «метки latest нет вовсе» и для пакета, которого В РЕЕСТРЕ
        // НЕТ ВООБЩЕ: на неизвестное имя реестр отвечает 200 с телом {"error":"Not found"},
        // JSON разбирается, dist-tags просто отсутствует. Три случая с разной ценой:
        //   пакета нет в реестре — НОРМА для того, что мы намеренно не публикуем;
        //   пакет есть, метки latest нет — странность, смотреть;
        //   реестр не ответил — слепота про нас.
        if (metki.__net_paketa) { console.log(`  · ${imya} — в реестре НЕТ ВОВСЕ (для непубликуемого это норма, не беда)`); netPaketa++; continue; }
        const L = metki.latest, N = metki.neprinyato;
        if (L === undefined) { console.log(`  ⚠️ ${imya} — пакет в реестре ЕСТЬ, а метки latest нет: смотреть`); bezMetki++; continue; }
        // 🔴 ИМЕНИ НЕТ В ФАЙЛЕ СУММ ВОВСЕ — ЭТО «ВНЕ ОБЛАСТИ ПРИЁМКИ», А НЕ «МЕТКА ЛЖЁТ».
        // Иначе расширение области дало бы красное на каждом пакете, который приёмка не
        // смотрит и не собиралась: «не приняли» и «метка указывает на отвергнутое» — разные
        // новости с разной ценой, и вторая требует действия, а первая только называния.
        if (!znaemLi(imya)) {
          console.log(`  · ${imya} — latest ${L}: приёмка этот пакет НЕ СМОТРИТ (в файле сумм имени нет)`);
          vneObl++; continue;
        }
        const lOk = prinyataLi(imya, L);
        const nOk = N === undefined ? null : !prinyataLi(imya, N);
        if (lOk && nOk !== false) {
          console.log(`  ✅ ${imya} — latest ${L} принята` + (N === undefined ? ' · neprinyato нет' : ` · neprinyato ${N} не принята`));
          vernyh++;
        } else {
          if (!lOk) { console.log(`  🔴 ${imya} — latest ${L} НЕ ПРИНЯТА: посторонний получает то, чего приёмка не принимала`); lzhivyh++; povysit(1); }
          if (nOk === false) { console.log(`  🔴 ${imya} — neprinyato ${N} ПРИНЯТА: реестр говорит два слова об одном предмете`); lzhivyh++; povysit(1); }
        }
      }
      console.log(`  верных ${vernyh} · ЛЖИВЫХ ${lzhivyh} · вне области приёмки ${vneObl}`
        + ` · нет в реестре ${netPaketa} · есть, но без latest ${bezMetki} · реестр не ответил ${nespros}`);
      console.log('  ⚠️ ГРАНИЦА: область = конфиг профиля ∪ реестр по мейнтейнеру. Не виден ничем:');
      console.log('     · пакет под ЧУЖОЙ учётной записью, не смонтированный здесь;');
      console.log('     · пакет, ПОМЕЧЕННЫЙ УСТАРЕВШИМ (deprecated): поиск по мейнтейнеру его');
      console.log('       НЕ ОТДАЁТ — замер 05.09.2026, тогда так пропали два пробных пакета,');
      console.log('       и перечень выглядел полным, не содержа искомого.');
      console.log('     Первое лечится вторым источником, второе не лечится ничем: спрашивать');
      console.log('     надо ИМЯ, а имя устаревшего пакета взять неоткуда, кроме памяти.');
    }
  }

}

// 🔴 ОГОВОРКА СТОИТ СНАРУЖИ БЛОКА --reestr, ИНАЧЕ ОНА НЕДОСТИЖИМА.
// Поймано прогоном 09.09.2026: моя обёртка выключенного разряда затянула её внутрь,
// и прибор перестал говорить «не проверялось» тому, кто ключа не дал. Молчание тогда
// читалось как «сошлось» — ровно то, против чего эта оговорка и написана.
if (!process.argv.includes('--reestr')) {
  console.log('\nПРЕДМЕТ ПРОТИВ НОМЕРА: НЕ ПРОВЕРЯЛСЯ (нужен ключ --reestr).');
  console.log('  Это значит «не смотрели», а не «сошлось».');
  console.log('  МЕТКА ПРОТИВ ВЕРДИКТА выключена распоряжением владельца — не «не проверена».');
}

// ═══ РАЗРЯД «ФАЙЛ СУММ ПРОТИВ ДЕРЕВА ВЕРДИКТОВ» (05.09.2026) ═══════════════════
//
// 🔴 ЗАЧЕМ. Уточнение координатора: состояние должна снимать САМА команда действия, иначе
// между снимком и делом выходит новый вердикт — и «последняя принятая» уже другая. Её
// правило лечило устаревшее ЧИСЛО в решении и не лечило устаревший СНИМОК у исполнителя.
// Здесь та же болезнь этажом ниже: прибор сверяется с ФАЙЛОМ принятых сумм, а вердикты
// приёмка кладёт КОММИТАМИ в дерево. Файл отстаёт — и прибор говорит «среди принятых нет»
// про версию, которая принята. Это худший вид ошибки: отказ на исправном.
//
// ⚠️ ДЕРЕВО НЕ ЗАМЕНЯЕТ ФАЙЛ, А НАЗЫВАЕТ ЕГО ОТСТАВАНИЕ. Файл несёт СУММЫ (что именно
// принято), дерево — ФАКТ вердикта (что версия принята). Подменить одно другим значило бы
// потерять сверку содержимого, ради которой файл и заведён.
// 🔴 ИСТОЧНИК ВЕРДИКТОВ СМЕНЁН НА ЛОКАЛЬНУЮ ВЕТКУ (06.09.2026). Прежде читалось
// `origin/master`, и основание было верным: приборы читают сервер, значит вердикт,
// лежащий только на диске, для механизма НЕ СУЩЕСТВУЕТ. Это спасло нас 05.09, когда
// вердикт был закоммичен и не отправлен.
// ⚠️ ОСНОВАНИЕ СМЕНИЛОСЬ ВМЕСТЕ С ПОРЯДКОМ. Владелец 05.09 22:45 прекратил публикации
// целиком, координатор 06.09 уточнила: вердикты кладутся коммитом ЛОКАЛЬНО, push в
// публичный репозиторий не делается до release candidate. Значит origin ЗАМОРОЖЕН, и
// прибор, читающий его, не увидит НИ ОДНОГО нового вердикта — все версии будут числиться
// непринятыми навсегда, а это отказ на исправном.
// Замер на момент правки: локальных коммитов, не ушедших в origin, — 25.
// ⚠️ ЧЕМ ПЛАТИМ: прежняя защита от «закоммитил и не отправил» исчезает — теперь вердикт,
// лежащий у меня, для меня же и существует. Это осознанная цена запрета публикаций, а не
// упущение; вернётся push — вернётся и прежний источник.
// Отставание origin печатается ЧИСЛОМ, чтобы смена источника не была молчаливой.
// 🔴 A-N-755 (24.09.2026): РАЗРЯД ВЫКЛЮЧЕН, НЕ УДАЛЁН. Его предмет — отставание ФАЙЛА сумм от дерева
// вердиктов, а файл больше не источник принятого (он в архиве). Вернётся файл — вернётся и разряд.
// ⚠️ ЧЕГО ТЕПЕРЬ НЕ ВИДНО: сверки «реестр против дерева вердиктов» нет — запись реестра считается
// принятой по факту монтажа через ворота, а не по коммиту-вердикту.
console.log('\nФАЙЛ СУММ ПРОТИВ ДЕРЕВА ВЕРДИКТОВ: РАЗРЯД ВЫКЛЮЧЕН — A-N-755, источник принятого — реестр плагинов,'
  + '\n  файл сумм в архиве. Это НЕ «проверено и чисто»: разряд не исполнялся.');
if (false) try {
  const { execFileSync: exec2raw } = await import('node:child_process');
  const KLON = '/opt/iskra/workspace/dsh-plugins';
  // 🔴 GIT ОТКАЗЫВАЕТ ЧУЖОЙ РУКЕ, И РАЗРЯД СЛЕПНЕТ ИМЕННО У ТОГО, КОМУ ПРЕДНАЗНАЧЕН.
  // Замер 07.09.2026 рукой claude: `git log` падает с «detected dubious ownership»,
  // разряд честно печатает СЛЕПОТУ — и подъём упирается в неё. Дважды подряд координатор
  // обошла ворота именно из-за этого, оба раза законно и оба раза правильно по существу;
  // правота обхода и есть его опасность — она учит, что ворота лишние.
  // ЛЕЧЕНИЕ: владелец каталога снимается ЗАМЕРОМ (statSync().uid), и если он не наш —
  // к вызову добавляется РАЗОВЫЙ `-c safe.directory=<путь>`. Ничего постоянного не
  // меняется: ни конфиг репозитория, ни глобальный конфиг руки.
  // ⚠️ ГРАНИЦА, названа здесь, а не в шапке: флаг применяется ТОЛЬКО к чтению (log/show/
  // rev-list). Защита git от чужого владельца существует против исполнения чужих хуков
  // при ЗАПИСИ; чтение хуков не запускает. Понадобится запись — этот путь не годится.
  // 🔴 ПЕРЕХВАТ НЕ ВОЗВРАЩАЕТ «СВОЙ» ПРИ ОТКАЗЕ ЗАМЕРА. Первая редакция делала именно так —
  // и проглотила ReferenceError (statSync не был импортирован), выдав ложное «репозиторий мой».
  // Флаг не добавлялся, слепота оставалась, а причина молчала. Безопасное умолчание в
  // перехвате скрывает поломку тем вернее, чем правдоподобнее выглядит.
  let svoj = null;
  try { svoj = statSync(KLON).uid === process.getuid(); }
  catch (e) { console.log(`  ⚠️ владельца репозитория снять не удалось (${String(e?.message ?? e).slice(0, 80)}) — считаю руку ЧУЖОЙ, это fail-closed`); svoj = false; }
  const exec2 = (cmd, args, opts) =>
    exec2raw(cmd, svoj ? args : ['-c', `safe.directory=${KLON}`, ...args], opts);
  if (!svoj) console.log(`  ⚠️ репозиторий вердиктов принадлежит другому пользователю — читаю с разовым safe.directory (только чтение, ничего не меняю)`);
  let tekst = '';
  let otstavanie = null;
  try {
    otstavanie = Number(exec2('git', ['-C', KLON, 'rev-list', '--count', 'origin/master..HEAD'],
                              { encoding: 'utf8' }).trim());
  } catch { /* origin может быть недоступен — скажем ниже */ }
  for (const f of ['docs/MEMORY-AND-A2A.ru.md', 'docs/MEMORY-AND-A2A.md']) {
    try { tekst += exec2('git', ['-C', KLON, 'show', `HEAD:${f}`], { encoding: 'utf8' }); } catch { /* вторая половина ответит */ }
  }
  tekst += exec2('git', ['-C', KLON, 'log', 'HEAD', '--format=%s', '-200'], { encoding: 'utf8' });
  if (!/принят|accepted/i.test(tekst)) throw new Error('в прочитанном нет ни одного слова о приёмке');
  // 🔴 ОБЛАСТЬ ИМЁН СНИМАЕТСЯ С ФАЙЛА СУММ, А НЕ ВПИСАНА СПИСКОМ (правка 06.09.2026).
  // Прежде здесь стоял перечень из семи имён, и в нём НЕ БЫЛО storozha: пакет выпускался,
  // принимался и вносился в файл сумм, а этот разряд про него молчал — то есть при
  // отставании файла по нему читающий получил бы «среди принятых нет» БЕЗ объяснения
  // причины. Вреда не случилось (файл догонял), но молчание было заряжено.
  // Теперь имена берутся из самого файла принятых сумм: появится новый пакет семейства —
  // он попадёт в область сам. И число имён ПЕЧАТАЕТСЯ: молчаливая область неотличима от
  // пустой (наш класс «перечень по имени отвечает про имя»).
  const summyRano = existsSync(SUMMY) ? readFileSync(SUMMY, 'utf8') : '';
  const imenaOblasti = [...new Set([...summyRano.matchAll(/^dsh-pamyat-([a-z]+)\s/gm)].map((m) => m[1]))];
  if (imenaOblasti.length === 0) imenaOblasti.push('core', 'secretary', 'restore');
  const obrazecImyon = new RegExp(
    '\\b(' + imenaOblasti.join('|') + ')\\s+(?:alpha\\.|a)(\\d+)\\b', 'g');
  const poslednie = new Map();
  for (const stroka of tekst.split('\n')) {
    if (!/принят|accepted/i.test(stroka)) continue;
    if (/НЕ ПРИНЯТ|not accepted|rejected/i.test(stroka)) continue;
    for (const [, ch, n] of stroka.matchAll(obrazecImyon)) {
      const v = Number(n);
      if (!poslednie.has(ch) || poslednie.get(ch) < v) poslednie.set(ch, v);
    }
  }
  const summy = existsSync(SUMMY) ? readFileSync(SUMMY, 'utf8') : '';
  const otstali = [];
  for (const [ch, v] of poslednie) {
    if (!new RegExp(`dsh-pamyat-${ch}\\s+0\\.1\\.0-alpha\\.${v}\\b`).test(summy)) otstali.push(`${ch} a${v}`);
  }
  console.log('\nФАЙЛ СУММ ПРОТИВ ДЕРЕВА ВЕРДИКТОВ:');
  console.log('  источник вердиктов: ЛОКАЛЬНАЯ ветка (HEAD), не origin — публикации прекращены'
    + (otstavanie === null ? '; насколько origin отстал — СПРОСИТЬ НЕ УДАЛОСЬ (это про запрос, не про дерево)'
       : otstavanie === 0 ? '; origin в этот миг совпадает с локальным'
       : `; origin отстал на ${otstavanie} коммитов ПО ПОСЛЕДНЕМУ ИЗВЕСТНОМУ его состоянию`
         + ' (в сеть не ходим — публикаций нет; число про наш снимок origin, не про сервер)'));
  if (otstali.length) {
    console.log(`  🔴 в дереве принято, а в файле сумм НЕТ: ${otstali.join(' · ')}`);
    console.log('     Прибор сверяется с ФАЙЛОМ — значит про эти версии он скажет «среди принятых');
    console.log('     нет», хотя вердикт есть. Это отказ на ИСПРАВНОМ, и лечится он не здесь:');
    console.log('     строки в файл кладёт приёмка.');
  } else {
    console.log('  файл сумм догоняет дерево: версий, принятых и не внесённых, нет');
  }
  {
    console.log(`  область имён снята С ФАЙЛА СУММ: ${imenaOblasti.length} — ${imenaOblasti.join(' · ')}`);
    console.log('     (имя, которого здесь нет, этим разрядом НЕ проверяется вовсе)');
    // 🔴 ВТОРОЕ НАПРАВЛЕНИЕ СВЕРКИ (правка 06.09.2026). Первый проход отвечает на вопрос
    // «всё ли принятое в дереве внесено в файл» и СЛЕП к обратному: строка в файле есть,
    // а коммита-вердикта в дереве нет. Тогда прибор пропустит версию как принятую, а на
    // каком основании она принята — через месяц не установить: файл несёт сумму, дерево
    // несёт разбор. Не блокируем: подъёму это не мешает, файл сумм — законный источник
    // для ворот. Но молчать нельзя, иначе «принято» станет словом без предмета.
    const vDereve = new Map();
    for (const stroka of tekst.split('\n')) {
      if (!/принят|accepted/i.test(stroka)) continue;
      if (/НЕ ПРИНЯТ|not accepted|rejected/i.test(stroka)) continue;
      for (const [, ch, nn] of stroka.matchAll(obrazecImyon)) {
        const v = Number(nn);
        if (!vDereve.has(ch) || vDereve.get(ch) < v) vDereve.set(ch, v);
      }
    }
    const bezRazbora = [];
    for (const im of imenaOblasti) {
      const vFajle = [...summy.matchAll(new RegExp(`dsh-pamyat-${im}\\s+0\\.1\\.0-alpha\\.(\\d+)\\b`, 'g'))]
        .map((m) => Number(m[1]));
      if (!vFajle.length) continue;
      const maxFajl = Math.max(...vFajle);
      const maxDerevo = vDereve.has(im) ? vDereve.get(im) : null;
      if (maxDerevo === null) bezRazbora.push(`${im} a${maxFajl} (вердиктов в дереве НЕТ ВОВСЕ)`);
      else if (maxFajl > maxDerevo) bezRazbora.push(`${im} a${maxFajl} (в дереве разбор до a${maxDerevo})`);
    }
    if (bezRazbora.length) {
      console.log(`  ⚠️ принято ПО ФАЙЛУ, но разбора в дереве нет: ${bezRazbora.join(' · ')}`);
      console.log('     На исход НЕ влияет: ворота читают файл, и это законно. Но основание');
      console.log('     приёмки живёт только в файле — через месяц «почему принято» не восстановить.');
    } else {
      console.log('  у каждой принятой версии есть разбор в дереве');
    }
  }
} catch (e) {
  console.log('\nФАЙЛ СУММ ПРОТИВ ДЕРЕВА ВЕРДИКТОВ: СЛЕПОТА — ' + (e?.message ?? e));
  // 🔴 СЛЕПОТА, НАЗЫВАЮЩАЯ ТОЛЬКО «git упал», СТОИЛА ДВУХ ОБХОДОВ ВОРОТ (07.09.2026).
  // Под именем «git не читает чужой рукой» жили ДВЕ болезни: dubious ownership (лечится
  // разовым safe.directory) и Permission denied на объект (лечится правами каталога).
  // Мы обе — я и координатор — считали известной первую, потому что видели её своими
  // глазами; вторая пряталась в ОБРЕЗАННОМ хвосте сообщения. Замер: из 259 каталогов
  // .git/objects три имели 700 вместо 755, и внутрь было не войти.
  // Здесь слепота превращается в ДИАГНОЗ: признак снимается сразу, при самом отказе.
  try {
    const { readdirSync: rd, statSync: st2 } = await import('node:fs');
    const kat = `${'/opt/iskra/workspace/dsh-plugins'}/.git/objects`;
    const uzkie = rd(kat, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^[0-9a-f]{2}$/.test(d.name))
      .filter((d) => !(st2(`${kat}/${d.name}`).mode & 0o001))
      .map((d) => d.name);
    if (uzkie.length) {
      console.log(`  🔴 ПРИЧИНА НАЗВАНА: ${uzkie.length} каталог(ов) .git/objects без права входа для остальных`);
      console.log(`     поимённо: ${uzkie.join(' ')} — чужая рука не откроет объекты внутри`);
      console.log(`     лечится: chmod 755 на них (у остальных каталогов ровно эти права)`);
    } else {
      // ⚠️ ДОКАЗАННОСТЬ ЭТОЙ ВЕТКИ: НЕ ПРОВЕРЕНА (07.09.2026). Ветку «узких каталогов нет,
      // а git всё равно упал» воспроизвести не удалось: пробовала порчей прав на .git/HEAD
      // и прогоном третьей рукой (dsh) — git в обоих случаях отработал, отказа не вышло.
      // Значит это ПРЕДУСМОТРИТЕЛЬНОСТЬ, а не проверенный путь, и так и помечено здесь,
      // чтобы следующий не прочёл её как испытанную. Ветка выше (узкие каталоги есть)
      // проверена порчей: chmod 700 → печатает причину и имя каталога.
      console.log('  ⚠️ узких каталогов .git/objects НЕТ — причина отказа ДРУГАЯ, ищите в тексте выше');
      console.log('     (эта ветка НЕ проверена прогоном: воспроизвести отказ git при целых правах не удалось)');
    }
  } catch (e2) {
    console.log(`  ⚠️ признак прав снять не удалось (${String(e2?.message ?? e2).slice(0, 70)}) — про причину не говорю ничего`);
  }
  console.log('  Это НЕ «файл догоняет дерево»: значит дерево вердиктов отсюда не читается.');
}

// 🔴 ПОКРЫТИЕ СТОИТ ТАМ ЖЕ, ГДЕ ВЕРДИКТ (предложение координатора 06.09.2026, беру).
// Оговорка «оба разряда НЕ ПРОВЕРЯЛИСЬ» печаталась выше и была верной — но крупное
// «исход: 0» читается первым и при беглом чтении закрывает её собой. «Можно» здесь
// значит «из ПРОВЕРЕННОГО ничто не мешает», а не «всё проверено», и это должно стоять
// в одной строке с числом, а не абзацем выше.
const RAZRYADY = [
  { imya: 'состав-и-приёмка', shyol: true },
  { imya: 'в-бою',            shyol: POSLE },
  { imya: 'файл-сумм-против-дерева', shyol: false, otmenen: 'A-N-755: источник принятого — реестр, файл сумм в архиве' },
  // 🔴 Ключ подан, а сверено НОЛЬ — разряд не пройден, а неисполним здесь: сверять
  // не с чем, пока предметы не выпущены. Называем причиной, а не числим проверенным.
  { imya: 'предмет-против-номера',
    shyol: false,
    // Выключен распоряжением владельца 06.09 вместе с «метка-против-вердикта»: оба сверяли
    // ОПУБЛИКОВАННОЕ. Прежнее условие (по числу сверок) оставлено ниже мёртвым — оно про
    // работавший разряд и вернётся вместе с ним.
    otmenen: 'отменено распоряжением владельца 06.09: проверка версий опубликованного',
    shyolPrezhde: REESTR_SVERIL !== null && REESTR_SVERIL > 0 },
  { imya: 'метка-против-вердикта',   shyol: false, otmenen: 'отменено распоряжением владельца' },
];
const proverено = RAZRYADY.filter((r) => r.shyol);
// 🔴 ОТМЕНЁННОЕ НАЗЫВАЕТСЯ ПРИЧИНОЙ, А НЕ ЧИСЛИТСЯ «ВНЕ ПРОВЕРКИ»: иначе отменённое
// смешается с непройденным, и через месяц не отличить «отменили» от «не дошли руки».
const otmenennye = RAZRYADY.filter((r) => r.otmenen);
const vne = RAZRYADY.filter((r) => !r.shyol && !r.otmenen).map((r) => r.imya);
console.log(`\nисход: ${ishod} (0 можно · 1 НЕЛЬЗЯ · 2 слепота — ведёт себя как «нельзя»)`
  // 🔴 ЗНАМЕНАТЕЛЬ — ПО ЖИВЫМ РАЗРЯДАМ. Считай по всем пяти — покрытие навечно «2 из 5»,
  // и это читается как недоработка, хотя два разряда СНЯТЫ РЕШЕНИЕМ, а не сломаны.
  // Вечно-красное перестают читать; выключенные названы отдельной строкой ниже.
  + ` — проверено разрядов ${proverено.length} из ${RAZRYADY.length - otmenennye.length} живых`
  + (vne.length ? `; ВНЕ ПРОВЕРКИ: ${vne.join(', ')}` : '')
  + (otmenennye.length ? `; ВЫКЛЮЧЕНО: ${otmenennye.map((r) => r.imya + ' (' + r.otmenen + ')').join(', ')}` : ''));
console.log('прибор только говорит: он не поднимает и не останавливает.');
process.exit(ishod);
