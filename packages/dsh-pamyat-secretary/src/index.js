/**
 * RU: dsh-pamyat-secretary сохраняет штатную сводку оперативно и отдельно извлекает знания из затенённого источника, с точной ссылкой на события. Это две работы, не подмена сводки дистилляцией. Подписка идёт на session/event с отбором compaction/start|summary|end; собственной компакции здесь нет. Служба pamyat объявлена в inject: runtime Context иначе запрещает ctx.<service>, хотя голый тестовый Context мог бы молча вернуть пустоту.
 * EN: dsh-pamyat-secretary saves the standard summary in working memory and separately extracts knowledge from its shadowed source with an exact event reference. These are two tasks, not replacing summaries with distillation. Subscribe through session/event and select compaction/start|summary|end; this module performs no compaction itself. Declare pamyat in inject: a runtime Context otherwise forbids ctx.<service>, although a bare test Context might silently return nothing.
 */
import { createRequire } from 'node:module';
import z from '@deepseek-ai/schemastery';
import { razobratSvodku } from './razbor-sobytiya.js';
import { distillirovat, zatenennye, srezTolkoIzSvodok, zabytZahodPoSrezu, kluchSreza, ustanovitPomoshchnikYadra, chitatSobytiya } from './distill-shov.js';
import { sozdatHodovojZov, uspeh as uspehZahoda, zhivayaMetka } from './hodovoj-zov.js';
import { sozdatDistillSrez, chitatZhurnalSessii, zakrytZadaniya } from './distill-srez.js';
import { zaplanirovatAvtopovtor } from './avtopovtor.js';
import { KLASSY } from './promty.js';
import { proverit_klyuch } from './distillyaciya.js';
import { execFile } from 'node:child_process';
import { userInfo } from 'node:os';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, chmodSync, statSync, readFileSync, readdirSync, renameSync, unlinkSync, realpathSync } from 'node:fs'
import { isAbsolute as putAbsolyutnyj, join as putSklejka, sep as RAZDELITEL } from 'node:path'
// RU: Правила ядра не копируются. Общий путь спасения обслуживает отклонённую сводку и статью, чтобы один вид не терялся. mkdir(mode) не сужает существующий каталог: применить chmod и перечитать права; шире 0700 — отказ без записи потенциального секрета.
// EN: Do not copy core rules. One recovery path handles rejected summaries and articles so neither kind is lost. mkdir(mode) does not restrict an existing directory: apply chmod and reread permissions; anything broader than 0700 fails without writing a possible secret.
/**
 * RU: Общая шапка сохраняет класс, владельца, источник и время вместе с текстом. Неизвестное явно помечается НЕ НАЗВАНО, чтобы восстановление не выдумывало принадлежность из имени файла.
 * EN: The shared header saves class, owner, source, and time with the text. Mark unknown fields explicitly as НЕ НАЗВАНО so recovery does not invent ownership from the filename.
 */
function shapkaSvedenij(svedeniya) {
  if (!svedeniya) return '';
  const p = (imya, znach) => `# ${imya}: ${znach ?? 'НЕ НАЗВАНО'}\n`;
  return '# ── СПАСЁННЫЙ ТЕКСТ, СВЕДЕНИЯ ДЛЯ ВОЗВРАТА В ПАМЯТЬ ──\n'
    + p('класс', svedeniya.klass)
    + '# агент: в записи НЕ ХРАНИТСЯ — его подставляет ядро из своей настройки (config.agent).\n'
    + '#        Ищите там, а не здесь: строка «НЕ НАЗВАНО» тут была бы мёртвой всегда.\n'
    + p('источник', svedeniya.istochnik)
    + p('создано (мс)', svedeniya.sozdano)
    + p('причина отказа', svedeniya.prichina)
    + '# ⚠️ Возврат в память НЕ автоматический: класс и источник здесь — то, чем текст БЫЛ,\n'
    + '#    а не то, чем он станет. Возвращает рука, и она отвечает за решение.\n'
    + '# ── конец сведений, ниже исходный текст ──\n\n';
}

// RU: Пропущенный повтор сохраняется для ручного возврата. povtoryaet-* старше 30 суток удаляется при следующем пропуске; при 500 файлах пропуск запрещён и статья пишется как уточнение. Текст повторяет живую k, поэтому срок файла не удаляет единственный экземпляр знания.
// EN: Save a skipped repetition for manual recovery. Remove povtoryaet-* older than 30 days at the next skip; at 500 files, prohibit skipping and write the article as a refinement. The text repeats live k, so file expiry does not delete the sole knowledge copy.
export const SROK_POVTORA_DNEJ = 30;
export const PREDEL_POVTORA = 500;
export function sohranitPovtor(kat, { tekst, klass, tema, k, istochnik }, { baza = (process.env.HOME || '/nonexistent') + '/pamyat/pamyat.db', seichas = Date.now() } = {}) {
  if (!kat) throw new Error('путь не задан: задайте ключ putOtklonennyh');
  let est = 0;
  try {
    for (const f of readdirSync(kat)) {
      if (!/^povtoryaet-.*\.txt$/.test(f)) continue;
      const put = kat + '/' + f;
      if (seichas - statSync(put).mtimeMs > SROK_POVTORA_DNEJ * 86400e3) { try { unlinkSync(put); } catch { est++; } } else est++;
    }
  } catch (e) { if (e?.code !== 'ENOENT') throw e; }
  if (est >= PREDEL_POVTORA) throw new Error('файлов пропущенных повторов уже ' + est + ' (предел ' + PREDEL_POVTORA + ') — пропуск НЕ делается, статья пишется');
  const shapka = ['# статья, признанная ПОВТОРОМ судом модели (integration-note (а1), два мнения, двойник в OMEGA виден): в память НЕ записана',
    '# повторяет действующую запись: ' + k, '# тема: ' + tema, '# класс: ' + klass, '# источник: ' + istochnik, '# когда: ' + new Date(seichas).toISOString(),
    '# ВОЗВРАТ, если пропуск ошибочен: sudo -u <агент> /usr/local/bin/pamyat-vernut-povtor <этот файл> ' + baza,
    '# хранится ' + SROK_POVTORA_DNEJ + ' сут., предел ' + PREDEL_POVTORA + ' файлов; старше — удаляются при следующем пропуске (текст остаётся в записи ' + k + ')', '', ''].join('\n');
  return sohranitOtklonennoe(kat, 'povtoryaet', shapka + String(tekst ?? ''));
}
// RU: При ПОВТОРЯЕТ видимость k и касание запрашиваются у ядра в момент вызова, не при загрузке.
// EN: For ПОВТОРЯЕТ, query k visibility and touch support from the core at call time, not load time.
export function sozdatPovtor(pamyat, config) {
  return {
    vidna: (k) => (typeof pamyat()?.vidnaVOmega === 'function' ? pamyat().vidnaVOmega(k) : null),
    kasanie: (k) => pamyat().otmetitKasanie({ ids: [k], povod: 'povtor-sudom' }),
    sohranit: (q) => sohranitPovtor(config.putOtklonennyh, q),
  };
}

function sohranitOtklonennoe(kat, prefiks, tekst, svedeniya = null) {
  if (!kat) {
    throw new Error('путь не задан: задайте ключ putOtklonennyh — '
      + 'умолчания нет намеренно, чтобы не писать в чужой каталог молча');
  }
  mkdirSync(kat, { recursive: true, mode: 0o700 });
  try { chmodSync(kat, 0o700); } catch { /**
   * RU: Отказ чтения назовёт проверка ниже, не считать его отсутствием записи.
   * EN: The check below reports the read failure; do not treat it as an absent record.
   */ }
  const prava = statSync(kat).mode & 0o777;
  if (prava & 0o077) {
    throw new Error('каталог ' + kat + ' открыт шире владельца (права '
      + prava.toString(8) + '): текст НЕ записан. Сузьте права — сюда попадает то, '
      + 'что фильтр счёл секретом');
  }
  // RU: wx не перезаписывает прежний файл. Совпадение миллисекунды возможно при соседних отказах, поэтому имя пробуется до 20 раз; исчерпание бросает явную ошибку с предметом и числом. Бесконечный поиск имени не допускается.
  // EN: wx does not overwrite an existing file. Adjacent failures can share a millisecond, so try names up to 20 times; exhaustion throws an explicit error with the subject and count. Never search for a name indefinitely.
  const osnova = `${kat}/${prefiks}-${Date.now()}-${process.pid}`;
  for (let i = 0; i < 20; i++) {
    const imya = i === 0 ? `${osnova}.txt` : `${osnova}-${i + 1}.txt`;
    try {
      writeFileSync(imya, shapkaSvedenij(svedeniya) + String(tekst ?? ''), { mode: 0o600, flag: 'wx' });
      return imya;
    } catch (e) {
      if (e?.code !== 'EEXIST') throw e;
    }
  }
  throw new Error('не удалось подобрать свободное имя за 20 попыток (основа ' + osnova
    + '): текст НЕ записан, и это сказано, а не проглочено');
}

// RU: Писатель статьи вынесен для проверки именно передаваемой в дистилляцию функции. Отказ спасает текст и пробрасывается, чтобы файл не считался вставкой. При отсутствии текста сохраняется задание с темой, срезом и причиной; само задание не запускает повтор. Онлайн-файл выключения проверяется на каждом входе: distillyaciya=false всегда сильнее; файл может выключить true, но не включить false. PAMYAT_DISTILLYACIYA_VYKL подменяет путь, без повторного разбора платформенного слияния настроек.
// EN: Expose the article writer so tests inspect the exact function passed to distillation. Failure saves text and propagates so a recovery file cannot count as an insertion. With no text, save a task containing topic, slice, and cause; the task itself starts no retry. Check the online disable file on every entry: distillyaciya=false always takes precedence; the file may disable true but cannot enable false. PAMYAT_DISTILLYACIYA_VYKL overrides the path without reparsing the settings merged by the platform.
export function prichinaVyklyucheniya(config, put = process.env.PAMYAT_DISTILLYACIYA_VYKL
    ?? ((process.env.HOME || '/nonexistent') + '/pamyat/distillyaciya-vyklyuchena')) {
  if (!config?.distillyaciya) return 'выключена настройкой distillyaciya (действует по подъёму службы)';
  try { statSync(put); return `выключена файлом ${put} (действует сразу, без подъёма)`; } catch { return null; }
}

// RU: Рассуждения включаются rassuzhdeniya=true и выключаются false либо онлайн-файлом, путь которого задаёт PAMYAT_RASSUZHDENIYA_VYKL. Файл не включает то, что выключила настройка. Это вход дистилляции, не правило рассуждений сводки kompakt.
// EN: Enable reasoning with rassuzhdeniya=true; disable it with false or the online file whose path PAMYAT_RASSUZHDENIYA_VYKL overrides. The file cannot enable what configuration disabled. This controls distillation input, not reasoning in kompakt summaries.
export function prichinaBezRassuzhdenij(config, put = process.env.PAMYAT_RASSUZHDENIYA_VYKL
    ?? ((process.env.HOME || '/nonexistent') + '/pamyat/rassuzhdeniya-vyklyucheny')) {
  if (config?.rassuzhdeniya === false) return 'выключены настройкой rassuzhdeniya (действует по подъёму службы)';
  try { statSync(put); return `выключены файлом ${put} (действует сразу, без подъёма)`; } catch { return null; }
}

// RU: Срез только из прежних сводок пропускается до метки и модели, но печатает обе строки ПОЗВАНА/ЗАКОНЧЕНА, сохраняя наблюдаемую пару.
// EN: Skip slices containing only earlier summaries before marking or calling the model, but print both ПОЗВАНА/ЗАКОНЧЕНА messages to preserve the observable pair.
export function propustitSrezSvodki(session, dannye, krik) {
  if (!srezTolkoIzSvodok(chitatSobytiya(session), zatenennye(dannye).seqs)) return false;
  krik('срез — сводка прошлого сжатия, знаний нет');
  krik('дистилляция: ЗАКОНЧЕНА — пропуск, причина: срез состоит только из сводок прошлых сжатий');
  return true;
}

export function sozdatZadanie(config, krik) {
  return ({ tema, kluchSreza: kluch, seqs, tokenov, prichina, ishod }) => {   // RU: kluch не затеняет функцию kluchSreza. Полный seqs не усекается: задание обязано сохранять вход для повторной обработки.
  // EN: kluch does not shadow the kluchSreza function. Do not truncate seqs: the task must retain its input for reprocessing.
    const spisok = Array.isArray(seqs) ? seqs : null;
    const telo = JSON.stringify({
      chto: 'povtorit-distillyaciyu-po-teme',
      tema: tema ?? null,
      srez: kluch ?? null,
      ishod: ishod ?? null,
      prichina: String(prichina ?? '').slice(0, 500),
      kogda: new Date().toISOString(),
      seqs: spisok,
      seqs_shtuk: spisok ? spisok.length : null,
      zatenenno_tokenov: typeof tokenov === 'number' ? tokenov : null,
      kak: spisok
        ? 'повтор: собрать транскрипт по ЭТИМ seqs (chtenie-zhurnala.zapisi_po_seq) и прогнать дистилляцию по нему'
        // RU: Старое задание без списка seq не объявляется невосстановимым: крайние номера могут позволить ручное извлечение диапазона. Это не гарантирует восстановление точного затенённого множества.
        // EN: Do not declare an old task without a seq list unrecoverable: endpoints may permit manual interval extraction. This does not guarantee recovering the exact shadowed set.
        : 'seqs НЕ ПОЛОЖЕНЫ (монтаж старше alpha.36). Повтор ВОЗМОЖЕН, но даёт НАДМНОЖЕСТВО: края НЕ упорядочены — взять min..max из «сеанс#первый-последний» и собрать по диапазону через chtenie-zhurnala.zapisi_po_seq. Знание выйдет ШИРЕ исходного среза — пометить это при записи. Проверено 07.09.2026 на двух заданиях: записи диапазонов нашлись целиком.',
    }, null, 1);
    try {
      const imya = sohranitOtklonennoe(config.putOtklonennyh, 'zadanie', telo);
      krik('задание на повтор сохранено: ' + imya + ' — тема «' + (tema ?? '?') + '» не потеряна из виду.');
      return imya;
    } catch (e) {
      krik('🔴 задание на повтор НЕ сохранено (' + (e?.message ?? e)
         + '): тема «' + (tema ?? '?') + '» останется только в журнале, а он ротируется.');
      return null;
    }
  };
}

// RU: Отброшенное начало сохраняется тем же защищённым каталогом: отказ окна — иной вид потери, чем фильтр. Это не решает, лучше ли брать начало или хвост. Текст может содержать секреты, поэтому права 0700 проверяются фактом; автоматической чистки нет.
// EN: Save the discarded beginning in the same protected directory: a window limit causes a different loss from filtering. This does not decide whether the beginning or continuation is preferable. Text may contain secrets, so verify actual 0700 permissions; there is no automatic cleanup.
export function sozdatOtbroshennoe(config, krik) {
  return ({ tekst, kluchSreza: kluch, vsego, vzyato }) => {   // RU: Имя kluch сохраняет доступ к функции kluchSreza в этой области.
  // EN: The name kluch preserves access to kluchSreza in this scope.
    const shapka = [
      '# отброшенное НАЧАЛО транскрипта (обрезка по predelOkon)',
      '# срез: ' + (kluch ?? '?'),
      '# было знаков: ' + (vsego ?? '?') + ', взято хвостом: ' + (vzyato ?? '?'),
      '# когда: ' + new Date().toISOString(),
      '# знание отсюда в память НЕ попало: модель этот кусок не видела',
      '', '',
    ].join('\n');
    const imya = sohranitOtklonennoe(config.putOtklonennyh, 'nachalo-sreza', shapka + String(tekst ?? ''));
    krik('отброшенное начало сохранено: ' + imya + ' — ' + String(tekst ?? '').length
       + ' знаков не потеряны, но и в память НЕ попали: разобрать рукой.');
    return imya;
  };
}

export function sozdatSohranenieProzy(config, krik) {
  return ({ tekst, pochemu }) => {
    const shapka = [
      '# сырой ответ модели при ВЫБОРЕ ТЕМ: не JSON-массив (proza)',
      '# причина: ' + (pochemu ?? '?'),
      '# когда: ' + new Date().toISOString(),
      '# темы отсюда НЕ разобраны: разобрать рукой или повторить выбор',
      '', '',
    ].join('\n');
    const imya = sohranitOtklonennoe(config.putOtklonennyh, 'proza', shapka + String(tekst ?? ''));
    krik('[proza] сырой ответ сохранён: ' + imya);
    return imya;
  };
}

export function sozdatZapisatel(pamyat, config, krik) {
  return (zn) => {
    try {
      // RU: Автоматический писатель всегда задаёт otvechayushchegoNetVVyzove: у этого пути нет человека независимо от узлового флага. Это разрешает помеченную, не подтверждённую запись. Возврат ядра передаётся без изменений: текущий числовой id означает вставку, исход доставки остаётся в журнале ядра.
      // EN: The automated writer always sets otvechayushchegoNetVVyzove: this path has no person regardless of the host flag. This allows an annotated record, never an approved one. Pass the core return value unchanged: the current numeric id means insertion, while delivery outcome stays in the core journal.
      return pamyat.zapisat({ ...zn, otvechayushchegoNetVVyzove: true });
    } catch (e) {
      try {
        const imya = sohranitOtklonennoe(config.putOtklonennyh, 'znanie', zn?.soderzhim, {
          klass: zn?.klass, agent: zn?.agent, istochnik: zn?.istochnik,
          sozdano: zn?.sozdano ?? Date.now(), prichina: String(e?.message ?? e).slice(0, 200),
        });
        krik('знание дистилляции ОТКЛОНЕНО фильтром (' + (e?.message ?? e)
           + '). Текст сохранён вне памяти: ' + imya + ' — знание не потеряно.');
      } catch (e2) {
        krik('🔴 знание дистилляции отклонено (' + (e?.message ?? e)
           + ') И НЕ СОХРАНЕНО (' + (e2?.message ?? e2) + ') — текст ПОТЕРЯН.');
      }
      throw e;
    }
  };
}

/**
 * RU: Сверка новизны возвращает функцию или значимый null: шов сообщает НЕ СВЕРЯЛАСЬ, не «дублей нет». Проверяется наличие метода, не версия манифеста. Агент определяется ядром, не вторым представлением владельца в секретаре.
 * EN: Novelty checking returns a function or meaningful null: the hook reports НЕ СВЕРЯЛАСЬ, not “no duplicates.” Check method availability rather than manifest version. The core determines the agent, avoiding a second ownership definition in the secretary.
 */
export function sozdatSverkuNovizny(pamyat) {
  if (typeof pamyat?.blizhajshaya !== 'function') return null;
  return ({ klass, soderzhim }) => pamyat.blizhajshaya({ klass, soderzhim });
}

// RU: Дисковая метка ставится при позыве и снимается при любом завершении: исходе, отказе захода или сборки. Пережившая процесс метка сохраняет ключ и все seq для задания прерванного разбора. Она сама не повторяет работу; автоповтор — отдельный модуль. Нет putOtklonennyh — метки нет с явным сообщением. Ошибка снятия может дать ложный прерванный заход на следующем старте и объявляется сразу.
// EN: Create a disk marker when invoking and remove it on every completion: outcome, run refusal, or setup failure. A marker surviving the process retains its key and all seq values for an interrupted-run task. It starts no retry itself; automatic retry is a separate module. Without putOtklonennyh no marker is created, with an explicit message. Removal failure may falsely report interruption at the next startup and is reported immediately.
const PREFIKS_METKI = 'razbor-idet';

export function sozdatMetkiRazbora(config, krik) {
  return {
    postavit(seansId, dannye) {
     // RU: Ошибка учёта метки не бросает и не меняет исход самого разбора.
     // EN: Marker-accounting errors do not throw or change the processing outcome.
     try {
      const { seqs, tokenov } = zatenennye(dannye);
      const srez = kluchSreza(seansId, seqs);   // RU: Метка использует тот же ключ среза, что заход.
      // EN: The marker uses the same slice key as the run.
      const telo = JSON.stringify({
        chto: 'povtorit-distillyaciyu-po-srezu',
        esli: 'файл с именем razbor-idet-* — разбор ИДЁТ; zadanie-prervan-* — ПРЕРВАН прошлым процессом, знания среза не записаны',
        srez, seansId: seansId ?? null, pozvana: new Date().toISOString(), pid: process.pid,
        seqs, seqs_shtuk: seqs.length, zatenenno_tokenov: typeof tokenov === 'number' ? tokenov : null,
        kak: 'повтор РУКОЙ: собрать транскрипт по ЭТИМ seqs (chtenie-zhurnala.zapisi_po_seq) и прогнать дистилляцию по нему',
      }, null, 1);
      try {
        const imya = sohranitOtklonennoe(config.putOtklonennyh, PREFIKS_METKI, telo);
        krik('метка разбора поставлена: ' + imya + ' (срез ' + (srez ?? 'не установлен') + ')');
        return imya;
      } catch (e) {
        krik('⚠️ метка разбора НЕ поставлена (' + (e?.message ?? e) + '): обрыв ЭТОГО разбора подъёмом не оставит следа');
        return null;
      }
     } catch (e) {
      krik('⚠️ метка разбора НЕ поставлена: данные события не разобраны (' + (e?.message ?? e) + '); разбор идёт без метки');
      return null;
     }
    },
    // RU: temy_po_oknam дописывается через временный JSON и rename. Нет метки — нечего менять; ошибка не меняет исход разбора.
    // EN: Append temy_po_oknam through temporary JSON and rename. Without a marker there is nothing to update; failure does not change processing outcome.
    dopisatTemy(imya, okno, tem) {
      if (!imya) return;
      try {
        const m = JSON.parse(readFileSync(imya, 'utf8'));
        m.temy_po_oknam = { ...(m.temy_po_oknam ?? {}), [String(okno)]: tem };
        writeFileSync(imya + '.novyj', JSON.stringify(m, null, 1), { mode: 0o600 });
        renameSync(imya + '.novyj', imya);
      } catch (e) { krik('⚠️ число тем окна ' + okno + ' в метку НЕ дописано (' + (e?.message ?? e) + ') — при обрыве /distill-srez не отличит частичный разбор'); }
    },
    snyat(imya) {
      if (!imya) return;
      try { unlinkSync(imya); } catch (e) {
        if (e?.code === 'ENOENT') return;   // RU: Повторное завершение могло уже снять метку; её отсутствие не новая ошибка.
        // EN: A repeated completion may already have removed the marker; its absence is not a new error.
        krik('⚠️ метка разбора НЕ снята (' + imya + ': ' + (e?.message ?? e) + ') — следующий старт назовёт разбор ПРЕРВАННЫМ ложно');
      }
    },
  };
}

// RU: Метки прежних процессов превращаются в zadanie-prervan-* с отдельной строкой. Своя метка требует совпавший pid и время после старта, чтобы переиспользование pid не скрывало обрыв. Число уже вставленных статей берётся по источникам окон 1–64; без ядра или при отказе оно неизвестно, не равно нулю.
// EN: Convert markers from previous processes to zadanie-prervan-* with individual messages. A current marker requires both matching pid and a timestamp after startup so pid reuse cannot hide interruption. Read already inserted article counts from window sources 1–64; without the core or after failure the count is unknown, not zero.
export const PREDEL_OKON_SCHETA = 64;
export function zapisanoPoSrezu(poIstochniku, srez) {
  if (typeof poIstochniku !== 'function' || !srez) return null;
  try {
    let n = 0;
    for (let i = 1; i <= PREDEL_OKON_SCHETA; i++) n += (poIstochniku(`${srez}#okno${i}`) || []).length;
    return n;
  } catch { return null; }
}
export function tekstZapisannogo(n) {
  if (n === null || n === undefined) return 'записано ли что-то — НЕ ИЗВЕСТНО (ядро не спрошено)';
  if (n === 0) return 'знания среза НЕ записаны (записей источника 0)';
  return `записано статей ${n} (окна 1–${PREDEL_OKON_SCHETA}), остаток тем НЕ записан — сколько их, неизвестно; `
    + '/distill-srez этот срез не доберёт (сочтёт разобранным)';
}
export function najtiPrervannye(config, krik, { pid = process.pid, nachaloProcessa = Date.now() - process.uptime() * 1000, poIstochniku = null } = {}) {
  const kat = config.putOtklonennyh;
  if (!kat) return [];
  let imena;
  try { imena = readdirSync(kat); } catch (e) {
    if (e?.code === 'ENOENT') return [];
    krik('⚠️ метки разбора НЕ проверены: ' + kat + ' не читается (' + (e?.message ?? e) + ') — обрыв прошлым процессом останется невидим');
    return [];
  }
  const itog = [];
  for (const f of imena.filter((x) => x.startsWith(PREFIKS_METKI + '-') && x.endsWith('.txt')).sort()) {
    const put = kat + '/' + f;
    let m = null;
    try { m = JSON.parse(readFileSync(put, 'utf8')); } catch { /**
     * RU: Неразобранная старая метка всё равно объявляется прерванной с неизвестными деталями.
     * EN: An unparsed old marker is still reported as interrupted with unknown details.
     */ }
    if (m && m.pid === pid && Date.parse(m.pozvana) >= nachaloProcessa) continue;
    const zadanie = kat + '/' + f.replace(PREFIKS_METKI, 'zadanie-prervan');
    try { renameSync(put, zadanie); } catch (e) {
      if (e?.code === 'ENOENT') continue;   // RU: Другой apply того же процесса мог уже обработать эту метку.
      // EN: Another apply in the same process may already have handled this marker.
      krik('⚠️ висящая метка ' + put + ' не переименована (' + (e?.message ?? e) + ') — назову её ещё раз при следующем старте');
    }
    const zapisano = zapisanoPoSrezu(poIstochniku, m?.srez);
    krik(`дистилляция ПРЕРВАНА: срез ${m?.srez ?? '?'}, позвана ${m?.pozvana ?? '?'} процессом ${m?.pid ?? '?'} — `
       + `${tekstZapisannogo(zapisano)}; задание на повтор рукой: ${zadanie}`);
    itog.push({ srez: m?.srez ?? null, pozvana: m?.pozvana ?? null, pid: m?.pid ?? null, zadanie, zapisano });
  }
  return itog;
}

// RU: Тревога отсутствующей маски ограничена одной на процесс модульной защёлкой, независимо от числа apply.
// EN: A module-level latch limits the missing-mask alert to one per process regardless of apply count.
const TREVOGA_NET_MASKI = { ushla: false };

export const name = 'dsh-pamyat-secretary';

/**
 * RU: Объявить потребление pamyat, чтобы runtime Context разрешал доступ к службе.
 * EN: Declare pamyat consumption so the runtime Context permits service access.
 */
export const inject = ['pamyat'];

export const Config = z.object({
  /**
   * RU: Класс записи штатной сводки компакции.
   * EN: The class used to store the standard compaction summary.
   */
  klass: z.string().default('svodka-kompakcii'),
  /**
   * RU: Выключение записи сводок допустимо, но объявляется: иначе настройка выглядела бы сломанным секретарём.
   * EN: Disabling summary writes is allowed but reported; otherwise configuration would look like a broken secretary.
   */
  vklyuchen: z.boolean().default(true),

  /**
   * RU: Каталог отклонённых текстов без умолчания: пустое значение не сохраняет текст и объявляется. Потенциальный секрет не должен уходить в предполагаемый каталог. Каталог создаётся/проверяется как 0700, файлы — 0600.
   * EN: The rejected-text directory has no default: an empty setting saves no text and is reported. A possible secret must not go to an assumed directory. Create/check the directory as 0700 and files as 0600.
   */
  putOtklonennyh: z.string().default(''),

  // RU: Платная дистилляция по умолчанию выключена. Включение требует явной настройки и доступного источника ключа, иначе даёт названный отказ.
  // EN: Paid distillation is disabled by default. Enabling requires explicit configuration and an available key source, otherwise it reports a refusal.
  distillyaciya: z.boolean().default(false),
  /**
   * RU: thinking/reasoning агента передаётся только как черновик; онлайн-файл может убрать его до следующего вызова.
   * EN: Pass agent thinking/reasoning only as a draft; the online file may remove it before the next call.
   */
  rassuzhdeniya: z.boolean().default(true),
  // RU: putZhurnala снят из Config (A-N-1870): с A-P-056 (23.09) дистилляция читает события той же сессии и файл не берёт; ключ в профиле игнорируется.
  // EN: putZhurnala removed from Config (A-N-1870): since A-P-056 distillation reads events of the same session and never the file; a profile key is ignored.
  /**
   * RU: Источник ключа — файл либо имя pass-записи, без значения в аргументах команды.
   * EN: The key source is a file or pass entry name, with no key value in command arguments.
   */
  klyuchFajl: z.string().default(''),
  klyuchPass: z.string().default(''),
  /**
   * RU: Имя переменной с ключом следует apiKeyEnv платформы, без копирования самого значения в настройки.
   * EN: The key variable name follows the platform apiKeyEnv convention without copying its value into settings.
   */
  klyuchOkruzhenie: z.string().default(''),
  /**
   * RU: Команда тревоги при недоступном ключе; пусто выключает тревогу с объявлением.
   * EN: Alert command for an unavailable key; an empty setting disables alerts with a message.
   */
  komandaTrevogi: z.string().default('/usr/local/bin/agent-alert'),
  model: z.string().default('deepseek-flash'),
  // RU: Выбор тем получает умолчание 32000 токенов: рассуждение и текст делят бюджет, слишком низкий предел может не оставить text.
  // EN: Topic selection defaults to 32000 tokens: reasoning and text share the budget, and too low a ceiling may leave no text.
  maxTokenovTem: z.number().default(32000),
  // RU: maxTokenovStati=0 снимает пользовательскую обрезку и включает единственный потолок 393216 из sprosit. Явное положительное значение действует для стендов/ограниченного разбора. Бюджетный обрыв объявляется в итоге; высокий потолок не равен фактическому расходу.
  // EN: maxTokenovStati=0 removes user-imposed truncation and selects the sole 393216 ceiling from sprosit. Explicit positive values remain effective for tests/bounded runs. Report budget truncation in the summary; a high ceiling is not actual usage.
  maxTokenovStati: z.number().default(0),
  /**
   * RU: Явные числовые пределы позволяют ограничить расход платного захода.
   * EN: Explicit numeric limits allow bounding a usage in a paid run.
   */
  // RU: predelTem=0 берёт все выбранные темы; положительный предел действует только при явной настройке. Это отдельная ось от окон и знаков: обрезка тем теряет разные знания, не части одной статьи.
  // EN: predelTem=0 takes every selected topic; a positive limit applies only when explicitly configured. This is independent of windows and characters: truncating topics loses distinct knowledge, not portions of one article.
  predelTem: z.number().default(0),
  minTokenov: z.number().default(2000),
  // RU: Размер окна пустой/0 сохраняет цельный транскрипт; число дробит его на окна заданной длины. Это настройка глубины, не обязательное ограничение входа.
  // EN: An absent/0 window size preserves the entire transcript; a number splits it into windows of that length. This controls depth rather than imposing a mandatory input limit.
  razmerOkna: z.number().default(0),
  // RU: predelOkon ограничивает число окон; 0 не ограничивает.
  // EN: predelOkon bounds the window count; 0 imposes no limit.
  predelOkon: z.number().default(0),
  // RU: Хвост после головы служит только контекстом, источником остаётся голова. vse добавляет его к выбору тем и каждой статье (1+число тем вызовов); temy — только выбору, net — нигде. Умолчание vse допускает цену повторного контекста, но не просит извлекать из него новые знания.
  // EN: The continuation after the main block is context only; the main block remains the source. vse adds it to topic selection and every article (1+topic-count calls); temy only to selection, net nowhere. Default vse accepts repeated-context cost without asking for new knowledge from it.
  hvost: z.union(['vse', 'temy', 'net']).default('vse'),
  // RU: Подменяемый адрес провайдера нужен стендам; пустой выбирает единственное умолчание distillyaciya.js.
  // EN: Tests may override the provider address; an empty value selects the sole distillyaciya.js default.
  adres: z.string().default(""),
  // RU: Ходовой вход по умолчанию выключен и заменяет событийную дистилляцию там, где нет сжатия платформы: один автоматический вызывающий на агента. sudPovtor отдельно включает ПОВТОРЯЕТ с сохранением текста и касанием k, также по умолчанию выключен.
  // EN: Turn-based entry is disabled by default and replaces event-driven distillation where the platform does not compact: one automatic caller per agent. sudPovtor separately enables ПОВТОРЯЕТ with text recovery and touching k; it is also disabled by default.
  sudPovtor: z.object({
    vkl: z.boolean().default(false),
  }).default({}),
  hodovojZov: z.object({
    vkl: z.boolean().default(false),
    porogZnakov: z.number().default(160000),
    neudachPodryad: z.number().default(3),
    pauzaMinut: z.number().default(360),
  }).default({}),
});

/**
 * RU: Все сообщения идут через console.error: ctx.logger есть, но его буфер без экспортёра не гарантирует выход. Доставку stderr в журнал обеспечивает установка службы, не сам факт вызова logger.
 * EN: Send every message through console.error: ctx.logger exists, but its buffer without an exporter cannot guarantee output. Service installation delivers stderr to its journal; calling logger alone does not.
 */
// RU: Читать версию из собственного package.json; ошибка даёт «версия неизвестна», не прежнее число.
// EN: Read the version from this package.json; failure yields “unknown version,” not a previous value.
const versiya = (() => {
  try { return createRequire(import.meta.url)('../package.json').version ?? 'версия неизвестна'; }
  catch { return 'версия неизвестна'; }
})();

// RU: Имя и версия сопровождают сообщения для определения редакции процесса. Ключ проверяется один раз на процесс, чтобы повторный apply не вызывал лишнее расшифрование и тревоги.
// EN: Include name and version in messages to identify the process revision. Check the key once per process so repeated apply does not cause extra decryption and alerts.
let probaKlyucha = null;
// RU: Обработка старых меток тоже ограничена одним проходом на процесс.
// EN: Handling old markers is also limited to one pass per process.
let metkiProvereny = false;

function krik(soobshchenie) {
  console.error('[dsh-pamyat-secretary ' + versiya + ' ' + new Date().toISOString() + '] ' + soobshchenie);
}

// RU: Маска образцов выполняется ядром на прямом пути записи, без импорта его файлов секретарём. Она охватывает знания и сводки; класс вне области не получает маску и может отказать по образцу. razvestiFazy раздельно проверяет приём сводки и синхронную сборку дистилляции, чтобы разные сбои не назывались одной судьбой сводки.
// EN: The core masks samples on the direct write path without the secretary importing its files. It covers knowledge and summaries; an out-of-scope class gets no mask and may fail on an example. razvestiFazy separately handles summary reception and synchronous distillation setup so distinct failures are not reported as one summary outcome.
export function razvestiFazy(session, event, { config, krik, prinyatSvodku, zapustitDistillyaciyu }) {
  if (!event || event.type !== 'compaction/summary') return 'ne-nashe';
  try {
    prinyatSvodku(event.data, session?.id ?? 'session', 'событие compaction/summary');
  } catch (e) {
    // RU: Здесь только неожиданный сбой приёма: prinyatSvodku сам обрабатывает отказ вставки. Судьба сводки при неожиданном сбое ещё не установлена.
    // EN: This catches only unexpected reception failure: prinyatSvodku handles insertion refusals itself. An unexpected failure leaves the summary outcome undetermined.
    krik('приём сводки оборвался: ' + (e?.message ?? e) + '. Сводка НЕ записана.');
    return 'priyom-oborvalsya';
  }
  const prichinaVykl = prichinaVyklyucheniya(config);
  if (prichinaVykl) {
    krik('дистилляция: ПРОПУЩЕНА, ' + prichinaVykl + ' — сводка записана, знаний НЕ будет');
    return 'svodka-tolko';
  }
  try {
    zapustitDistillyaciyu();
  } catch (e) {
    // RU: Сводка уже получила свой исход. Этот catch относится к синхронной сборке захода, не его асинхронному выполнению.
    // EN: The summary already has its own outcome. This catch concerns synchronous run setup, not asynchronous execution.
    krik('дистилляция НЕ СОБРАЛАСЬ: ' + (e?.message ?? e) + '. Судьба сводки решена строкой выше.');
    return 'distillyaciya-ne-sobralas';
  }
  return 'ok';
}

// RU: apply может повторяться при старте. Процессные ресурсы требуют модульной защёлки и предусмотренной платформой уборки, не предположения об однократном вызове.
// EN: apply may repeat at startup. Process resources require a module latch and platform lifecycle cleanup rather than assuming one invocation.
export function apply(ctx, config = {}) {
  // RU: Префиксы исключений живут только в ядре sessiyaIsklyuchena. Нет метода — один раз объявить отсутствие защиты и сохранить прежнее поведение.
  // EN: Exclusion prefixes live only in the core sessiyaIsklyuchena method. If absent, report unavailable protection once and retain previous behavior.
  let bezIsklyucheniyaSkazano = false;
  const vneSessii = (session) => {
    const pm = ctx.pamyat;
    if (typeof pm?.sessiyaIsklyuchena !== 'function') {
      if (!bezIsklyucheniyaSkazano) { bezIsklyucheniyaSkazano = true; krik('⚠️ ядро без sessiyaIsklyuchena (старше integration-note) — исключение сессий НЕ действует'); }
      return false;
    }
    return !!pm.sessiyaIsklyuchena(String(session?.id ?? ''));
  };
  if (config.vklyuchen === false) {
    krik('секретарь ВЫКЛЮЧЕН настройкой: сводки компакции записываться не будут');
    return;
  }

  // RU: Историю и признак сводки даёт служба ядра для DSH 0.1.1 и 0.1.7+/0.2.0. Отсутствующий помощник явно называется.
  // EN: The core service supplies history and summary detection for DSH 0.1.1 and 0.1.7+/0.2.0. Explicitly report a missing helper.
  let estPomoshchnik = false;
  try { estPomoshchnik = ustanovitPomoshchnikYadra(ctx.pamyat); } catch { estPomoshchnik = false; }
  // RU: Положительный след загрузки позволяет воротам проверить прозвучавшую готовность, не считать отсутствие ошибки успехом.
  // EN: A positive load trace lets gates check reported readiness rather than count absence of errors as success.
  if (estPomoshchnik) krik('помощник событий ядра подключён (sobytiyaSessii)');
  else krik('помощник событий ядра не найден (ctx.pamyat без sobytiyaSessii: ядро старше integration-note) — журнал читаю как session.events, прежнее поведение');

  // RU: Загрузка всегда объявляет состояние условий готовности, не только флаг включения. Без источника ключа включённая дистилляция ещё не готова; источник истории назван строкой выше (помощник ядра или session.events), putZhurnala не участвует (A-N-1870).
  // EN: Loading always announces readiness conditions rather than just an enabled flag. Without a key source, enabled distillation is not ready; the history source is reported above (core helper or session.events), putZhurnala takes no part (A-N-1870).
  {
    const d = config.distillyaciya === true;
    // RU: Проверка читает те же плоские klyuchFajl/klyuchPass, что схема и потребитель. Вложенные несуществующие поля дали бы ложную неготовность и неверную подсказку настройки.
    // EN: The check reads the same flat klyuchFajl/klyuchPass fields as the schema and consumer. Nonexistent nested fields would create false unreadiness and invalid setup advice.
    const klyuchNazvan = Boolean(config.klyuchFajl || config.klyuchPass || config.klyuchOkruzhenie);
    const gotova = d && klyuchNazvan;
    // RU: Объявить имя выбранного источника, никогда значение ключа. Несколько заданных источников требуют сообщения о приоритете файл→pass→окружение, не молчаливого выбора.
    // EN: Report the selected source name, never the key value. Multiple configured sources require an explicit file→pass→environment priority message rather than silent selection.
    const zadano = [config.klyuchFajl && 'klyuchFajl', config.klyuchPass && 'klyuchPass',
                    config.klyuchOkruzhenie && 'klyuchOkruzhenie'].filter(Boolean);
    if (zadano.length > 1) {
      krik('источников ключа задано несколько (' + zadano.join(', ') +
           '); порядок файл → pass → окружение, будет взят ПЕРВЫЙ из заданных. ' +
           'Это не отказ, но лишний источник стоит убрать: он выглядит действующим');
    }
    const istochnikKlyucha = config.klyuchFajl ? 'файл ' + config.klyuchFajl
      : config.klyuchPass ? 'pass ' + config.klyuchPass
      : config.klyuchOkruzhenie ? 'окружение ' + config.klyuchOkruzhenie
      : null;
    // RU: Готовность требует получить ключ тем же proverit_klyuch/vzyat_klyuch, не только назвать источник. Неудача даёт причину и одну тревогу на процесс, без вывода значения.
    // EN: Readiness requires obtaining the key through the same proverit_klyuch/vzyat_klyuch path, not merely naming its source. Failure reports a cause and one alert per process without exposing the value.
    let proba = null;
    if (gotova) {
      const pervaya = probaKlyucha === null;
      if (pervaya) probaKlyucha = proverit_klyuch({ fajlKlyucha: config.klyuchFajl || null,
        zapisPass: config.klyuchPass || null, peremennayaOkruzheniya: config.klyuchOkruzhenie || null });
      // RU: Сплющить переносы причины pass в одну строку, чтобы stderr внутри ошибки не выглядел отдельным событием.
      // EN: Flatten line breaks in the pass cause so stderr inside an error cannot appear as a separate event.
      proba = { ...probaKlyucha, pochemu: String(probaKlyucha.pochemu ?? '').replace(/\s+/g, ' ') };
      if (!proba.gotov && pervaya) {
        const tekst = '🔴 ' + userInfo().username + ' · секретарь: дистилляция НЕ взведена: ключ '
          + istochnikKlyucha + ' не получен — ' + proba.pochemu;
        if (!config.komandaTrevogi) {
          krik('⚠️ тревога о ключе НЕ ОТПРАВЛЕНА: komandaTrevogi пуст (выключено настройкой)');
        } else {
          // RU: Команда тревоги запускается асинхронно с таймаутом 90000 мс, не задерживая загрузку.
          // EN: Start the alert command asynchronously with a 90000 ms timeout without delaying load.
          execFile(config.komandaTrevogi, [tekst], { timeout: 90000 }, (e, out) => {
            krik(e ? '🔴 тревога о ключе НЕ ДОШЛА (' + config.komandaTrevogi + ', код ' + (e.code ?? '?')
                     + '): ' + String(out || e.message || '').trim().split('\n')[0].slice(0, 120)
                   : 'тревога о ключе отправлена: ' + config.komandaTrevogi + ' код 0');
          });
        }
      }
    }
    krik('подъём: класс «' + (config.klass ?? 'svodka-kompakcii') + '», дистилляция ' +
         (!d ? 'ВЫКЛЮЧЕНА настройкой (сводки пишутся, знания не извлекаются)'
             : gotova && !proba.gotov ? 'НЕ взведена: ключ ' + istochnikKlyucha + ' не получен — '
                          + proba.pochemu + '. Сводки пишутся, знания НЕ извлекаются'
             : gotova ? 'взведена: модель ' + (config.model ?? '—') + ', ключ из '
                          + istochnikKlyucha + ' (получен пробой при подъёме)'
             : 'ВКЛЮЧЕНА, НО НЕ ГОТОВА — заход не начнётся: ' +
               (klyuchNazvan ? '' : 'не назван источник ключа (klyuchFajl, klyuchPass или klyuchOkruzhenie)')));
    // RU: Старые метки объявляются журналом и одной тревогой на старт с перечнем: сообщение должно иметь читателя, а не только существовать в журнале.
    // EN: Report old markers through the journal and one startup alert listing them: the message needs a reader, not merely a journal entry.
    if (!metkiProvereny) {
      metkiProvereny = true;
      const prervannye = najtiPrervannye(config, krik, { poIstochniku: (i) => ctx.pamyat?.poIstochniku?.(i) });
      if (prervannye.length) {
        const tekst = '🔴 ' + userInfo().username + ' · секретарь: дистилляция ПРЕРВАНА прошлым процессом — срезов '
          + prervannye.length + ': ' + prervannye.map((x) => (x.srez ?? '?') + ' — ' + tekstZapisannogo(x.zapisano)).join('; ')
          + '. Задания на повтор рукой в ' + config.putOtklonennyh;
        if (!config.komandaTrevogi) {
          krik('⚠️ тревога о прерванном разборе НЕ ОТПРАВЛЕНА: komandaTrevogi пуст (выключено настройкой)');
        } else {
          execFile(config.komandaTrevogi, [tekst], { timeout: 90000 }, (e, out) => {
            krik(e ? '🔴 тревога о прерванном разборе НЕ ДОШЛА (' + config.komandaTrevogi + ', код ' + (e.code ?? '?')
                     + '): ' + String(out || e.message || '').trim().split('\n')[0].slice(0, 120)
                   : 'тревога о прерванном разборе отправлена: ' + config.komandaTrevogi + ' код 0');
          });
        }
      }
      // RU: Автоповтор собственного каталога работает только при известном zapisano=0; условия остановки задаёт avtopovtor.js.
      // EN: Automatic retry in this directory requires known zapisano=0; avtopovtor.js defines its stopping conditions.
      if (config.distillyaciya === true) {
        const poIst = typeof ctx.pamyat?.poIstochniku === 'function' ? (i) => ctx.pamyat.poIstochniku(i) : null;
        zaplanirovatAvtopovtor({
          kat: config.putOtklonennyh, krik,
          zapisano: (srez) => zapisanoPoSrezu(poIst, srez),
          zapustit: (s, d) => zapustitZahod(s, d),
          chitat: (s) => chitatZhurnalSessii(process.env.DSH_HOME, s),
          zakryt: (srez, prichina) => zakrytZadaniya(config.putOtklonennyh, srez, prichina, krik),
          metkaZhiva: () => zhivayaMetka(config.putOtklonennyh),
          vyklyuchena: () => prichinaVyklyucheniya(config),
          trevoga: (tekst) => {
            if (!config.komandaTrevogi) { krik('⚠️ тревога автоповтора НЕ ОТПРАВЛЕНА: komandaTrevogi пуст'); return; }
            execFile(config.komandaTrevogi, ['🔴 ' + userInfo().username + ' · секретарь: ' + tekst], { timeout: 90000 },
              (e) => krik(e ? '🔴 тревога автоповтора НЕ ДОШЛА (код ' + (e.code ?? '?') + ')' : 'тревога автоповтора отправлена: код 0'));
          },
        });
      }
    }

    // RU: Перечень промпта сверяется с решением ядра, чтобы не предлагать моделью заведомо незаписываемый класс. Доступ к runtime-службе защищён try: диагностический отказ не должен уронить загрузку.
    // EN: Compare prompt classes with the core decision so the model is not offered classes known to be unwritable. Guard runtime-service access with try: a diagnostic failure must not break loading.
    try {
      const pm = ctx.pamyat;
      // RU: Проверка спрашивает zapishet с otvechayushchegoNetVVyzove=true, как рабочий путь. reshit отвечает о спросе политики, а не возможности помеченной записи; используется только как объявленный менее точный fallback старого ядра.
      // EN: Query zapishet with otvechayushchegoNetVVyzove=true, matching the write path. reshit answers about policy approval, not whether an annotated write is possible; use it only as an explicitly less precise fallback for older cores.
      const zapishet = typeof pm?.zapishet === 'function';
      if (zapishet || typeof pm?.reshit === 'function') {
        const otklonyat = zapishet ? KLASSY.filter((k) => !pm.zapishet(k, { otvechayushchegoNetVVyzove: true }))
                                   : KLASSY.filter((k) => pm.reshit(k)?.reshenie === 'ask');
        const vopros = zapishet ? ' [сверено по «запишет ли» — как при заходе дистилляции]'
                                : ' [⚠️ ядро без zapishet (старее a65): сверено по «спросит ли» — ШИРЕ нужного]';
        if (otklonyat.length) {
          krik('🔴 в ПОЛНОМ списке промпта есть классы, которые ядро заведомо ОТКЛОНИТ: '
             + otklonyat.join(', ') + '. Дистилляция подтверждение предъявить не может — '
             + 'знание ушло бы файлом, а в память не попало (долг 125, развилка не решена).'
             + ' ⚠️ ЭТО НЕ ЗНАЧИТ, ЧТО ОНИ БУДУТ ПРЕДЛОЖЕНЫ: при каждом заходе дистилляции'
             + ' список СУЖАЕТСЯ по решению ядра, и сужение печатается отдельной строкой'
             + ' («классы для модели сужены по решению ЯДРА»). Здесь названа развилка, а не'
             + ' дыра: без этой оговорки строка читается как «лечения нет».' + vopros);
        } else {
          krik('классы промпта сверены с ядром: заведомо отклоняемых нет (' + KLASSY.length + ' из ' + KLASSY.length + ')' + vopros);
        }
      } else {
        krik('⚠️ согласованность классов с ядром НЕ ПРОВЕРЕНА: у объекта памяти нет ни zapishet(), ни reshit(). '
           + 'Это про прибор, а не про предмет: расхождение может быть, и его не видно.');
      }
    } catch (e) {
      krik('⚠️ сверка классов с ядром НЕ УДАЛАСЬ (' + (e?.message ?? e) + ') — не проверена.');
    }
  }

  // RU: Один prinyatSvodku обслуживает compaction/summary и /svodka-prinyat. povod называет вход в журнале, чтобы ручная работа не выглядела действующим событием.
  // EN: One prinyatSvodku serves compaction/summary and /svodka-prinyat. povod names the entry in the journal so manual operation cannot appear to prove working events.
  let posledneeSobytie = null;   // RU: Date.now() последней сводки — отметка для счётчика отсутствия событий.
  // EN: The last summary Date.now() timestamp supports the missing-event counter.
  function prinyatSvodku(dannye, seansId, povod, istochnikYavno = null) {
    const razobrano = razobratSvodku(dannye, { seansId, istochnikYavno });
    if (!razobrano.godno) {
      // RU: Пропуск пришедшего события объявляется: событие было, но знание не сохранено.
      // EN: Report a skipped received event: an event occurred but knowledge was not saved.
      krik('сводка компакции НЕ записана: ' + razobrano.pochemu);
      return { ishod: 'negodna', pochemu: razobrano.pochemu };
    }

    const z = razobrano.znanie;
    const pamyat = ctx.pamyat;
    if (!pamyat) {
      krik('служба памяти недоступна — сводка компакции ПОТЕРЯНА. ' +
                'Знание было снято, но записать его некуда.');
      return { ishod: 'net-pamyati' };
    }
    // RU: Тот же источник не вставляет сводку повторно: команда использует файл+сумму текста, событие — срез сессии. Без источника сверка невозможна и запись продолжается. Одинаковый текст под другим источником этой защитой не ловится.
    // EN: The same source does not insert a summary twice: the command uses file+text hash, the event a session slice. Without a source, checking is impossible and writing continues. This guard misses identical text under a different source.
    if (z.istochnik && typeof pamyat.poIstochniku === 'function') {
      let uzhe = [];
      try { uzhe = pamyat.poIstochniku(z.istochnik) ?? []; }
      catch (e) { krik('сверка повтора сводки не состоялась (' + (e?.message ?? e) + ') — пишу как обычно'); }
      const svoi = uzhe.filter((r) => (r?.klass ?? '') === (config.klass ?? 'svodka-kompakcii'));
      if (svoi.length) {
        const ids = svoi.map((r) => r.id).join(', ');
        krik('сводка компакции УЖЕ ЗАПИСАНА (id ' + ids + ', источник ' + z.istochnik + ', вход: ' + povod + ') — второй раз не пишу');
        return { ishod: 'uzhe-zapisana', ids };
      }
    }
    // RU: Отказ записи сводки не отменяет последующую дистилляцию. Маска образцов остаётся в ядре, не второй копией здесь: сводка и знания имеют разные исходы.
    // EN: Summary write failure does not cancel subsequent distillation. Keep sample masking in the core rather than a second copy here: summary and knowledge have separate outcomes.
    const dlyaZapisi = z.soderzhim;
    try {
      const id = pamyat.zapisat({
        klass: config.klass ?? 'svodka-kompakcii',
        soderzhim: dlyaZapisi,
        istochnik: z.istochnik,
        // RU: Этот автоматический путь также объявляет отсутствие отвечающего в самом вызове.
        // EN: This automated path also declares the missing responder in the call itself.
        otvechayushchegoNetVVyzove: true,
      });
      // RU: Успешная вставка объявляется строкой: иначе отсутствие сообщения неотличимо от неподписанного или незагруженного секретаря.
      // EN: Announce successful insertion with a message: otherwise no output is indistinguishable from an unsubscribed or unloaded secretary.
      krik('сводка компакции ЗАПИСАНА в память: класс «' + (config.klass ?? 'svodka-kompakcii')
         + '», знаков ' + String(dlyaZapisi ?? '').length
         + ', источник ' + (z.istochnik ?? 'не назван')
         + ', вход: ' + povod
         + ', молчание до события: ' + (posledneeSobytie ? Math.round((Date.now() - posledneeSobytie) / 3600000) + ' ч' : 'первое с подъёма'));
      posledneeSobytie = Date.now();
      return { ishod: 'zapisana', id: typeof id === 'object' ? id?.id : id, znakov: String(dlyaZapisi ?? '').length };
    } catch (e) {
      // RU: Отклонённая сводка сохраняется файлом с узкими правами, не обходом фильтра в памяти. Потенциальный секрет не допускается с пометкой. Без настроенного каталога текст не сохраняется и причина объявляется. Здесь не меняется отвергнутый исходный текст.
      // EN: Save a rejected summary to a file with restricted permissions rather than bypassing the memory filter. A possible secret is not admitted merely with an annotation. Without a configured directory, no text is saved and the cause is reported. Do not change the rejected original text here.
      try {
        const imya = sohranitOtklonennoe(config.putOtklonennyh, 'svodka', z.soderzhim, {
          klass: config.klass ?? 'svodka-kompakcii', agent: z?.agent, istochnik: z?.istochnik,
          sozdano: z?.sozdano ?? Date.now(), prichina: String(e?.message ?? e).slice(0, 200),
        });
        krik('сводка ОТКЛОНЕНА фильтром (' + (e?.message ?? e) + '). '
           + 'Текст сохранён вне памяти: ' + imya + ' — знание не потеряно, '
           + 'память не запачкана. Дистилляция ПРОДОЛЖАЕТСЯ.');
        return { ishod: 'otklonena', pochemu: String(e?.message ?? e), imya };
      } catch (e2) {
        // RU: Объявить и отказ памяти, и отказ файлового спасения: двойная ошибка не должна выглядеть неизвестным успешным сохранением.
        // EN: Report both memory refusal and file-recovery failure: a double error must not resemble an unknown successful save.
        krik('🔴 сводка отклонена фильтром (' + (e?.message ?? e) + ') И НЕ СОХРАНЕНА ('
           + (e2?.message ?? e2) + ') — текст ПОТЕРЯН. Дистилляция продолжается.');
        return { ishod: 'poteryana', pochemu: String(e?.message ?? e) + '; ' + String(e2?.message ?? e2) };
      }
    }
  }

  // RU: /svodka-prinyat <path> даёт ручной вход, когда событие сводки не публикуется. Сам не обнаруживает сжатие: до вызова сводка не поступит. Не запускает дистилляцию, поскольку принимает готовый текст, не журнал затенённой сессии.
  // EN: /svodka-prinyat <path> provides manual entry when no summary event is published. It does not detect compaction itself: no summary arrives until called. It starts no distillation because it receives prepared text rather than a shadowed-session journal.
  ctx.plugin((ctx2) => {
    const komandy = ctx2.get?.('commands');
    if (!komandy?.register) {
      // RU: Нет реестра команд — регистрация не выполнена с явным сообщением, не тихий пропуск.
      // EN: With no command registry, explicitly report failed registration rather than silently skip it.
      krik('⚠️ служба commands недоступна — команда /svodka-prinyat НЕ ЗАРЕГИСТРИРОВАНА. '
         + 'Событийный вход не задет.');
      return;
    }
    komandy.register({
      name: 'svodka-prinyat',
      description: 'Принять сводку компакта из файла и записать её в память (второй вход)',
      handler: async (invocation) => {
        // RU: Аргументы команды берутся из rawInput контракта CommandInvocation, не несуществующих args/text. Каждый отказ также идёт в журнал с причиной, а не только в ответ канала.
        // EN: Read command arguments from the CommandInvocation rawInput contract, not nonexistent args/text. Journal every refusal with its cause rather than only replying through the channel.
        const otkaz = (text) => { krik('команда /svodka-prinyat: ОТКАЗ — ' + text); return { kind: 'error', text }; };
        // RU: Ручной вход обходит session/event, поэтому отдельно проверяет исключение сессии.
        // EN: Manual entry bypasses session/event, so it checks session exclusion separately.
        if (vneSessii(invocation?.agent?.session)) return otkaz('сессия вне памяти (integration-note) — сводка из неё не записывается.');
        const put = String(invocation?.rawInput ?? '').trim();
        if (!put) {
          return otkaz('Путь не задан: /svodka-prinyat <путь к файлу со сводкой>. '
            + 'Умолчания нет намеренно — подставленный молча путь прочитал бы не тот файл.');
        }
        // RU: Граница чтения (аудит A-N-1948 №6): команда читает только обычный файл внутри putOtklonennyh — туда секретарь
        //     сам кладёт отклонённые сводки, и оттуда человек возвращает их этой командой. Имя без пути ищется в том же
        //     каталоге; ссылки разворачиваются до сверки, поэтому ссылка изнутри наружу тоже отказ. Прежде путь шёл в
        //     readFileSync как есть: человек из канала мог положить в память любой файл, читаемый учёткой агента.
        // EN: Read boundary (audit A-N-1948 #6): the command reads only a regular file inside putOtklonennyh — the secretary
        //     itself stores rejected summaries there, and a human returns them with this command. A bare name is looked
        //     up in that directory; links are resolved before the check, so a link pointing outside is refused too.
        //     Previously the path went to readFileSync as is: a human in a channel could put any file readable by the
        //     agent account into memory.
        const kat = config.putOtklonennyh;
        if (!kat) return otkaz('каталог putOtklonennyh не задан — читать сводку неоткуда (команда читает только из него).');
        let kornevoj, nastoyashchij;
        try { kornevoj = realpathSync(kat); }
        catch (e) { return otkaz(`каталог putOtklonennyh ${kat} не открыт (${e?.code ?? e?.message ?? e}) — сводка НЕ принята.`); }
        try { nastoyashchij = realpathSync(putAbsolyutnyj(put) ? put : putSklejka(kornevoj, put)); }
        catch (e) { return otkaz(`Файл не прочитан (${e?.code ?? e?.message ?? e}) — сводка НЕ принята.`); }
        if (!nastoyashchij.startsWith(kornevoj + RAZDELITEL)) {
          return otkaz(`путь ${put} вне каталога ${kat} (после разворота ссылок: ${nastoyashchij}) — команда читает только файлы из putOtklonennyh, сводка НЕ принята.`);
        }
        let tekst;
        try {
          if (!statSync(nastoyashchij).isFile()) return otkaz(`${put} — не обычный файл, сводка НЕ принята.`);
          tekst = readFileSync(nastoyashchij, 'utf8');
        }
        catch (e) { return otkaz(`Файл не прочитан (${e?.message ?? e}) — сводка НЕ принята.`); }
        if (!tekst.trim()) {
          return otkaz('Файл пуст — принимать нечего. Это ответ про файл, а не про сжатие.');
        }
        const seansId = invocation?.agent?.session?.id ?? 'ruka';
        // RU: summary передаётся массивом текстовых блоков, как событие; строка не пройдёт текстовый разбор. Источник — проверяемый файл и сумма его текста, без выдуманных seq. Подпись называет user и commandId из договора, не отсутствующее имя отправителя; исправленный файл имеет новый источник.
        // EN: Pass summary as an array of text blocks, matching the event; a plain string fails text parsing. The source is the verifiable file and its text hash, with no invented seq values. Attribution uses user and commandId from the contract rather than an unavailable sender name; an edited file has a new source.
        const summa = createHash('sha256').update(tekst).digest('hex').slice(0, 16);
        const povod = `команда /svodka-prinyat от пользователя (платформа: source user; commandId ${invocation?.commandId ?? '?'}), файл ${put}`;
        const ish = prinyatSvodku({ summary: [{ type: 'text', text: tekst }] }, seansId, povod, `komanda:${put}#sha256:${summa}`);
        // RU: Команда возвращает только success/error. Успех означает «записана» либо «уже записана», не просто «подана»; неподдерживаемый kind=text мог бы показать отказ после успешной вставки.
        // EN: The command returns only success/error. Success means “written” or “already written,” not merely “submitted”; unsupported kind=text could show failure after a successful insertion.
        if (ish?.ishod === 'zapisana') return { kind: 'success', text: `Сводка записана в память (id ${ish.id ?? '?'}, знаков ${ish.znakov}) из ${put}.` };
        if (ish?.ishod === 'uzhe-zapisana') return { kind: 'success', text: `Эта сводка уже записана (id ${ish.ids}) — второй раз не пишу.` };
        if (ish?.ishod === 'otklonena') return { kind: 'error', text: `Сводка ОТКЛОНЕНА фильтром памяти (${ish.pochemu}). Текст сохранён вне памяти: ${ish.imya}.` };
        return otkaz(`Сводка НЕ записана: ${ish?.ishod ?? 'исход неизвестен'}${ish?.pochemu ? ' — ' + ish.pochemu : ''}.`);
      },
    });
    krik('второй вход заведён: команда /svodka-prinyat, зовущий — человек (Web или канал), платформа помечает source user');
  });

  // RU: /distill-srez доступен при включённой дистилляции. Без da показывает цену и не запускает разбор; подробный договор в distill-srez.js.
  // EN: /distill-srez requires enabled distillation. Without da it shows cost and starts no processing; distill-srez.js defines the detailed contract.
  if (config.distillyaciya) ctx.plugin((ctx3) => {
    const komandy = ctx3.get?.('commands');
    if (!komandy?.register) { krik('⚠️ служба commands недоступна — команда /distill-srez НЕ ЗАРЕГИСТРИРОВАНА'); return; }
    komandy.register({
      name: 'distill-srez',
      description: 'Разобрать заново ОДИН срез сжатия, чей разбор сорвался: без «da» — цена, с «da» — запуск',
      handler: sozdatDistillSrez({ config, krik, pm: () => ctx.pamyat, zapustit: (s, d) => zapustitZahod(s, d),
        zapisanoSreza: (srez) => zapisanoPoSrezu(typeof ctx.pamyat?.poIstochniku === 'function' ? (i) => ctx.pamyat.poIstochniku(i) : null, srez),
                                   vyklyuchena: () => prichinaVyklyucheniya(config) }),
    });
    krik('третий вход дистилляции заведён: команда /distill-srez, зовущий — человек; без «da» — только цена');
  });

  const metki = sozdatMetkiRazbora(config, krik);
  // RU: zapustitZahod — общее тело для событийного, ходового и повторных входов. dannye задаёт срез; ходовой срез уже доходит до текущего хода и отдельного хвоста не имеет. Итог возвращается вызывающему.
  // EN: zapustitZahod is shared by event, turn-based, and retry entries. dannye supplies the slice; a turn-based slice already reaches the current turn and has no separate continuation. Return the outcome to the caller.
  function zapustitZahod(session, dannye, { hvost = null, trevogaNetMaski = false } = {}) {
    // RU: Общая воронка запрещает обработку исключённой сессии для сжатия, автоповтора, ходового входа и /distill-srez.
    // EN: The shared funnel blocks excluded sessions for compaction, automatic retry, turn-based entry, and /distill-srez.
    if (vneSessii(session)) return Promise.resolve({ ishod: 'sessiya-vne-pamyati' });
          // RU: Считается фактический вход в общее тело, не намерение вызывающего callback.
          // EN: Count actual entry into the shared body, not the intention of the caller to invoke a callback.
          krik('дистилляция: ПОЗВАНА — разбор знаний по затенённому срезу начат, итог будет отдельной строкой');
          let metka;
          try {
          if (propustitSrezSvodki(session, dannye, krik)) return Promise.resolve({ ishod: 'propushchen-svodki' });   // RU: Проверка среза только из сводок выполняется до создания метки разбора.
          // EN: Check a summary-only slice before creating the processing marker.
          metka = metki.postavit(session?.id ?? 'session', dannye);
          const zabytSrez = () => { const sq = zatenennye(dannye).seqs; if (sq.length) zabytZahodPoSrezu(kluchSreza(session?.id ?? 'session', sq)); };
        // RU: Асинхронная дистилляция идёт после штатной сводки и не ожидается обработчиком: длительная работа не должна задержать поток событий и других подписчиков.
        // EN: Asynchronous distillation follows the standard summary without being awaited by the handler: long processing must not delay the event stream and other subscribers.
          krik(`источник дистилляции: события сессии ${session?.id ?? 'не установлена'}`);
          const bezRassuzhdenij = prichinaBezRassuzhdenij(config);
          krik('рассуждения агента дистиллятору: ' + (bezRassuzhdenij ? 'НЕ подаются — ' + bezRassuzhdenij
            : 'подаются черновиком (блок с пометкой; знанием — только подтверждённое)'));
          return distillirovat({
            sobytiyaSessii: chitatSobytiya(session) ?? null,
            dannye,
            seansId: session?.id ?? 'session',
            nastrojka: {
              model: config.model, maxTokenovTem: config.maxTokenovTem,
              maxTokenovStati: config.maxTokenovStati, predelTem: config.predelTem,
              minTokenov: config.minTokenov, razmerOkna: config.razmerOkna,
              predelOkon: config.predelOkon, adres: config.adres, hvost: hvost ?? config.hvost, rassuzhdeniya: !bezRassuzhdenij,
              klyuch: { fajlKlyucha: config.klyuchFajl || null, zapisPass: config.klyuchPass || null,
                        peremennayaOkruzheniya: config.klyuchOkruzhenie || null },
              // RU: Функция допустимых классов спрашивает ядро при заходе, не запоминает список при старте. Нет ответа — весь перечень с названной границей, без тихого сужения.
              // EN: The eligible-class function queries the core at run time rather than saving a startup list. No answer means the full list with an explicit caveat, never silent narrowing.
              godnyeKlassy: () => {
                try {
                  const pm = ctx.pamyat;
                  // RU: zapishet отвечает о записи без человека; reshit о спросе. Передать признак собственного вызова: даже узел с отвечающим не даёт человека этому автоматическому пути. Помеченная запись остаётся допустимой.
                  // EN: zapishet answers about writing without a person; reshit about approval requests. Pass the no-responder flag for this call: even a host with a responder supplies no person to this automated path. An annotated write remains eligible.
                  if (typeof pm?.zapishet === 'function') {
                    return KLASSY.filter((kl) => pm.zapishet(kl, { otvechayushchegoNetVVyzove: true }));
                  }
                  // RU: Старое ядро без zapishet объявляет менее точный fallback, который может излишне сузить классы.
                  // EN: An older core without zapishet reports its less precise fallback, which may narrow classes unnecessarily.
                  if (typeof pm?.reshit === 'function') {
                    krik('ядро не отвечает на «запишет ли» (старее a65) — сужаю по «спросит ли», ' +
                         'то есть ШИРЕ нужного: класс, который узел без отвечающего записал бы, будет исключён');
                    return KLASSY.filter((kl) => pm.reshit(kl)?.reshenie !== 'ask');
                  }
                  return KLASSY;
                } catch { return KLASSY; }
              },
            },
            krik,
            // RU: Доступ к службе идёт через ctx.pamyat в этой области: локальный pamyat приёма сводки здесь недоступен. Ошибка сборки не должна называться отказом уже записанной сводки.
            // EN: Access the service through ctx.pamyat in this scope: the summary-reception local pamyat is unavailable here. Setup failure must not be described as refusal of an already saved summary.
            zapisat: sozdatZapisatel(ctx.pamyat, config, krik),
            blizhajshaya: sozdatSverkuNovizny(ctx.pamyat),
            // RU: Кандидаты и писатель отношения берутся из ядра. Без методов суд не запускается и граница объявляется в итоге.
            // EN: Obtain candidates and the relationship writer from the core. Without those methods, run no judgment and report the limit in the summary.
            dejstvuyushchie: typeof ctx.pamyat?.blizhajshieDejstvuyushchie === 'function' ? (q) => ctx.pamyat.blizhajshieDejstvuyushchie(q) : null,
            otnoshenie: typeof ctx.pamyat?.ustanovitOtnoshenie === 'function' ? (q) => ctx.pamyat.ustanovitOtnoshenie(q) : null,
            ustarevshee: ({ tekst, klass, tema, k, istochnik }) => sohranitOtklonennoe(config.putOtklonennyh, 'ustarela',
              ['# статья, признанная УСТАРЕВШЕЙ судом модели (integration-note): в память НЕ записана', '# тема: ' + tema, '# класс: ' + klass,
               '# новее её действующая запись: ' + k, '# источник: ' + istochnik, '# когда: ' + new Date().toISOString(), '', ''].join('\n') + tekst),
            zadanie: sozdatZadanie(config, krik),
            otbroshennoe: sozdatOtbroshennoe(config, krik),
            sohranitProzu: sozdatSohranenieProzy(config, krik),
            // RU: Маска внешнего входа берётся службой ядра. Без метода вернуть null, чтобы общее тело отказало до передачи сырого текста.
            // EN: Get the external-input mask through the core service. With no method, return null so the shared body refuses before sending raw text.
            maska: typeof ctx.pamyat?.zamaskirovatVhod === 'function' ? (t) => ctx.pamyat.zamaskirovatVhod(t) : null,
            // RU: ПОВТОРЯЕТ включается только sudPovtor.vkl; иначе null сохраняет исходный промпт суда побайтно.
            // EN: Enable ПОВТОРЯЕТ only with sudPovtor.vkl; otherwise null preserves the original judgment prompt byte for byte.
            povtor: config.sudPovtor?.vkl === true ? sozdatPovtor(() => ctx.pamyat, config) : null,
            temyOkna: ({ okno, tem }) => metki.dopisatTemy(metka, okno, tem),   // RU: Передать записыватель числа тем в метку для проверки полноты прерванного захода.
            // EN: Pass the marker topic-count writer for checking interrupted-run completeness.
          }).then((itog) => {
            // RU: Асинхронное завершение закрывает пару ПОЗВАНА→ЗАКОНЧЕНА, чтобы состояние отличалось от ещё работающего или потерянного захода.
            // EN: Asynchronous completion closes the ПОЗВАНА→ЗАКОНЧЕНА pair so state differs from a still running or lost run.
            if (!uspehZahoda(itog) && itog?.ishod !== 'zahod-uzhe-byl') zabytSrez();   // RU: Неуспех забывает ключ для повтора. Отсутствие маски на событийном пути тревожит раз за процесс; ходовой вход использует собственную K-границу.
            // EN: Failure forgets the key to permit retry. Missing masking on the event path alerts once per process; turn-based entry uses its own K-boundary.
            if (itog?.ishod === 'net-maski' && trevogaNetMaski && !TREVOGA_NET_MASKI.ushla) {
              TREVOGA_NET_MASKI.ushla = true;
              const tekst = '🔴 ' + userInfo().username + ' · секретарь: дистилляция НЕ идёт — у ядра нет маски входа (zamaskirovatVhod, integration-note); выпустите ядро a91+';
              if (config.komandaTrevogi) execFile(config.komandaTrevogi, [tekst], { timeout: 90000 }, (e) => krik(e ? '🔴 тревога о маске НЕ ДОШЛА' : 'тревога о маске отправлена'));
              else krik('⚠️ тревога о маске НЕ ОТПРАВЛЕНА: komandaTrevogi пуст');
            }
            metki.snyat(metka);
            // RU: Сверить заявленные вставки с памятью по источникам этого среза, не по всей базе. poIstochniku даёт независимый след; старое ядро без метода объявляет отсутствие сверки, не равенство. Общий счёт включил бы прежние срезы и ложно краснел на исправном.
            // EN: Compare claimed insertions with memory for this slice sources, not the whole database. poIstochniku provides an independent trace; an older core without it reports no check, not equality. A global count would include earlier slices and falsely fail healthy runs.
            try {
              const pm = ctx.pamyat;
              const L = Number(itog?.zapisano ?? 0);
              if (typeof pm?.poIstochniku !== 'function') {
                krik(`В1 НЕ СВЕРЕНО: ядро без poIstochniku (старый монтаж). Дистилляция насчитала `
                   + `${L} знаний, подтвердить их наличие в памяти НЕЧЕМ — это не «сошлось»`);
              } else {
                const ist = itog?.istochniki ?? [];
                if (!ist.length) {
                  krik(`В1 НЕ СВЕРЕНО: дистилляция не назвала источников среза (записано ${L})`);
                } else {
                  let N = 0;
                  for (const i of ist) N += (pm.poIstochniku(i) || []).length;
                  if (N === L) krik(`В1: сошлось — дистилляция записала ${L}, память держит ${N} по ${ist.length} источникам среза`);
                  else krik(`🔴 В1 РАСХОЖДЕНИЕ: дистилляция записала ${L}, а память держит ${N} `
                          + `по ${ist.length} источникам среза. Разница ${Math.abs(L - N)}: `
                          + (N < L ? 'часть знаний НЕ ЛЕГЛА — отказ ядра или отклонение по классу'
                                   : 'в памяти БОЛЬШЕ — источник разбирался повторно'));
                }
              }
            } catch (e) { krik('В1 сверка сорвалась: ' + (e?.message ?? e) + ' — это не «сошлось»'); }
            krik(`дистилляция: ЗАКОНЧЕНА — исход ${itog?.ishod ?? '?'}, знаний ${itog?.zapisano ?? 0}`);
            return itog;
          }).catch((e) => { krik(`дистилляция: ЗАКОНЧЕНА — ОТКАЗ захода: ${e?.message ?? e}`); metki.snyat(metka); zabytSrez(); return { ishod: 'otkaz-zahoda', pochemu: String(e?.message ?? e) }; });
          } catch (e) {
            // RU: Синхронный отказ тоже закрывает единственную строку ПОЗВАНА.
            // EN: A synchronous failure also closes the sole ПОЗВАНА message.
            krik('дистилляция: ОТКАЗ сборки: ' + (e?.message ?? e));
            if (metka) metki.snyat(metka);
            throw e;
          }
  }

  const hodovoj = sozdatHodovojZov({
    nastrojka: config.hodovojZov ?? {}, dshHome: process.env.DSH_HOME || null, putOtklonennyh: config.putOtklonennyh,
    krik, zapustit: (session, dannye) => zapustitZahod(session, dannye, { hvost: 'net' }),
    vyklyuchena: () => prichinaVyklyucheniya(config),
    trevoga: (tekst) => {
      if (!config.komandaTrevogi) { krik('⚠️ тревога ходового зова НЕ ОТПРАВЛЕНА: komandaTrevogi пуст (выключено настройкой)'); return; }
      execFile(config.komandaTrevogi, [tekst], { timeout: 90000 }, (e) => krik(e
        ? '🔴 тревога ходового зова НЕ ДОШЛА (' + config.komandaTrevogi + ', код ' + (e.code ?? '?') + ')'
        : 'тревога ходового зова отправлена: ' + config.komandaTrevogi + ' код 0'));
    },
  });

  ctx.on('session/event', (session, event) => {
    // RU: Исключённая сессия не пишет сводку и не запускает событийную или ходовую дистилляцию; решение берётся у ядра.
    // EN: An excluded session writes no summary and starts neither event nor turn-based distillation; obtain the decision from the core.
    try { if (vneSessii(session)) return; } catch (e) { krik('проверка исключения сессии упала: ' + (e?.message ?? e)); return; }
    // RU: Весь обработчик, включая разбор и запись, защищён: своё исключение не должно обрывать других подписчиков. Здесь только подключение раздельных фаз через razvestiFazy.
    // EN: Protect the entire handler, including parsing and writing: our exception must not interrupt other subscribers. This only connects the separate phases through razvestiFazy.
    try {
      razvestiFazy(session, event, {
        config,
        krik,
        prinyatSvodku,
        zapustitDistillyaciyu: () => {
          // RU: При включённом ходовом входе событие не запускает дистилляцию: один автоматический вызывающий предотвращает двойные срезы.
          // EN: With turn-based entry enabled, the event starts no distillation: one automatic caller prevents duplicate slices.
          if (hodovoj.vkl) { krik('дистилляция по сжатию НЕ зовётся — у агента ходовой зов (integration-note); сводка записана выше'); return; }
          zapustitZahod(session, event.data, { trevogaNetMaski: true });
        },
      });
    } catch (e) {
      krik('обработчик события компакции упал: ' + (e?.message ?? e));
    }
    // RU: Отдельный защищённый блок ходового входа изолирует его отказ от событийного пути и чужих подписчиков.
    // EN: A separate protected turn-based block isolates its failure from the event path and other subscribers.
    try { hodovoj.naSobytie(session, event); } catch (e) { krik('ходовой зов упал: ' + (e?.message ?? e)); }
  });
}
