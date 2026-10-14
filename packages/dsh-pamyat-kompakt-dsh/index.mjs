// RU: dsh-pamyat-kompakt-dsh — наша сводка ВНУТРИ родного механизма сжатия платформы DSH.
//     Почему наследование, а не свой компакт. Платформа сама объявила эту точку расширения, дословно в своём
//     коде: «Override this sole hook for a template or remote summarizer». Значит момент сжатия, затенение
//     узлов, границы, запись в журнал сессии и возврат сводки в контекст остаются РОДНЫМИ и переживают
//     обновление платформы. Наше здесь одно: ЧЕМ и ПО КАКОМУ ПРОМТУ написана сводка (это делает соседний пакет
//     dsh-pamyat-kompakt).
//     Граница отказа: если наша модель не ответила, мы НЕ роняем сжатие и НЕ молчим — пишем строку в журнал и
//     отдаём работу родной сводке платформы. Не сжать вовсе хуже, чем сжать чужим промтом: агент упрётся в
//     предел окна.
//     Класс движка платформы берём у ЗОВУЩЕГО, а не по прибитому пути. Прибитый путь к одной установке
//     платформы однажды работал у одного агента и сломал подъём другого: установок платформы на машине может
//     быть несколько, у каждого агента своя. Отказ тогда был громкий и мгновенный («preset failed to mount») —
//     и это лучший исход: тихо мы унаследовали бы ЧУЖОЙ движок.
//     Разрешение имени идёт от исполняемого файла платформы (process.argv[1] = …/dsh/lib/bin.js), то есть от
//     той установки, которая нас загружает. Путь не угадываем — спрашиваем.
// EN: dsh-pamyat-kompakt-dsh — our summary INSIDE the native compaction mechanism of the DSH platform.
//     Why inheritance and not our own compactor. The platform itself declares this extension point, literally
//     in its code: "Override this sole hook for a template or remote summarizer". So the compaction moment,
//     node shadowing, boundaries, the session journal record and returning the summary into the context all
//     stay NATIVE and survive platform upgrades. Only one thing is ours: WITH WHAT and BY WHICH PROMPT the
//     summary is written (that is done by the sibling package dsh-pamyat-kompakt).
//     Failure boundary: if our model does not answer, we do NOT drop the compaction and do NOT stay silent — we
//     write a log line and hand the work to the platform's native summary. Not compacting at all is worse than
//     compacting with a foreign prompt: the agent would hit the window limit.
//     The platform engine class is taken from the CALLER, not from a hard-coded path. A hard-coded path to one
//     platform installation once worked for one agent and broke another agent's start-up: a machine may have
//     several platform installations, one per agent. The failure was loud and immediate ("preset failed to
//     mount") — the best outcome: silently we would have inherited SOMEONE ELSE's engine.
//     Resolution starts from the platform executable (process.argv[1] = …/dsh/lib/bin.js), i.e. from the very
//     installation that loads us. We do not guess the path — we ask.
import { createRequire } from "node:module";
import { installMarker } from "./marker-step.mjs";
import { AGENT_ALERT } from "./continuation-mode.mjs";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
// RU: Резолвер ОТ ЗОВУЩЕГО: process.argv[1] — исполняемый файл платформы, которая нас загрузила (запасной путь
//     — сам модуль).
// EN: Resolver FROM THE CALLER: process.argv[1] is the executable of the platform that loaded us (fallback —
//     this module itself).
// RU: Резолв пакета платформы в два шага: от зовущего (process.argv[1] — исполняемый файл платформы), при ЛЮБОЙ
//     ошибке — от этого модуля (import.meta.url); не вышло ни так, ни так — громкий отказ с обеими причинами.
//     Прежде запасной путь брался только при ПУСТОМ argv[1]: argv[1], который не путь или не платформа (другая
//     форма запуска), ронял загрузку плагина у всех агентов, хотя пакет разрешался от модуля.
// EN: Two-step resolution of a platform package: from the caller (process.argv[1] is the platform executable), on
//     ANY error — from this module (import.meta.url); neither works — a loud refusal naming both causes.
//     Previously the fallback was used only with an EMPTY argv[1]: an argv[1] that is not a path or not the
//     platform (another launch form) broke plugin loading for every agent, although the package resolved from
//     the module.
const razreshitPlatformy = (imya) => {
  let otZovushchego;
  try { return createRequire(process.argv[1]).resolve(imya); } catch (e) { otZovushchego = String(e?.message ?? e).split("\n")[0]; }
  try { return createRequire(import.meta.url).resolve(imya); }
  catch (e) {
    throw new Error("dsh-pamyat-kompakt-dsh: " + imya + " не разрешается ни от зовущего (" + (process.argv[1] || "argv[1] пуст") +
                    ": " + otZovushchego + "), ни от модуля (" + import.meta.url + ": " + String(e?.message ?? e).split("\n")[0] + ")");
  }
};

// RU: ── Кто это напечатал ──
//     Каждая журнальная строка пакета несёт имя и ВЕРСИЮ. Без версии строки шли как [dsh-pamyat-kompakt-dsh] и
//     [kompakt-nash]; вторая приставка совпадала с приставкой соседнего пакета dsh-pamyat-kompakt, и всякий
//     счёт «строк kompakt в окне» молча считал два прибора как один. Пока предмет не называет версию, «какой
//     код в памяти процесса» доказывается лишь косвенно — временем файла против времени старта.
//     Версия читается ОДИН раз при загрузке, а не при каждой печати: ленивое чтение заставило бы процесс со
//     СТАРЫМ кодом называть НОВЫЙ номер после установки — то есть соврать ровно там, ради чего строка
//     заводится.
//     Не прочиталась — пишем «версия неизвестна», а НЕ подставляем последнюю известную.
// EN: ── Who printed this ──
//     Every log line of the package carries its name and VERSION. Without the version lines read
//     [dsh-pamyat-kompakt-dsh] and [kompakt-nash]; the second prefix coincided with the prefix of the sibling
//     package dsh-pamyat-kompakt, so any count of "kompakt lines in a window" silently counted two instruments
//     as one. While the subject does not name its version, "which code is in process memory" can be proven only
//     indirectly — file time versus start time.
//     The version is read ONCE at load time, not at every print: lazy reading would make a process running OLD
//     code report the NEW number after an installation — lying exactly where the line exists to tell the truth.
//     If it cannot be read we print "версия неизвестна" (version unknown) and do NOT substitute the last known
//     one.
// RU: Свой резолвер — от файла этого модуля: им читаем свой package.json и ищем соседний пакет по имени.
// EN: Own resolver — from this module's file: used to read our package.json and to find the sibling package by
//     name.
const trebovatSvoj = createRequire(import.meta.url);
const VERSIYA = (() => {
  try { return trebovatSvoj("./package.json").version ?? "версия неизвестна" }
  catch { return "версия неизвестна" }
})();
/** Приставка журнальной строки «[имя версия]». Одна на весь модуль: литералов приставок в коде быть не должно (стережёт stend-pristavki). · Log line prefix "[name version]". One per module: no prefix literals in code (guarded by stend-pristavki). */
export const pristavka = (imya) => `[${imya} ${VERSIYA}]`;
// RU: Пакет сжатия платформы ищем в ТОЙ ЖЕ установке, что и агент. Нет его — отказ импорта с названной
//     причиной: молча работать без движка нельзя.
// EN: The platform compaction package is looked up in the SAME installation as the agent. Missing — import
//     fails with a named reason: silently running without the engine is not allowed.
let putBazovogo;
try {
  putBazovogo = razreshitPlatformy("@deepseek-ai/dsh-compaction-basic");
} catch (e) {
  throw new Error(pristavka("dsh-pamyat-kompakt-dsh") + " " + String(e?.message ?? e) +
                  ". Пакет компакции платформы обязан быть установлен в ТОЙ ЖЕ установке, что и агент");
}
// RU: Родной движок сжатия платформы — базовый класс для NashaSvodka.
// EN: The platform's native compaction engine — the base class of NashaSvodka.
const { BasicCompactionEngine } = await import(pathToFileURL(putBazovogo).href);
// RU: Соседний пакет — по ИМЕНИ пакета, а не по абсолютному пути. Прежде импорт шёл по абсолютному пути к
//     каталогу dsh-pamyat-kompakt в общем каталоге пакетов: переустановка или переезд соседа ломали бы этот
//     пакет в месте, которое ничей учёт не называет зависимостью.
//     Теперь тем же приёмом, что движок платформы выше: спрашиваем резолвер ОТ СЕБЯ и при отказе громко
//     называем, что не так. Имя обязано разрешаться из node_modules, где стоит этот пакет: при установке там
//     ставится ссылка dsh-pamyat-kompakt → ../dsh-pamyat-kompakt.
// EN: The sibling package is resolved by package NAME, not by an absolute path. Previously the import used an
//     absolute path to the dsh-pamyat-kompakt directory in the shared package directory: reinstalling or moving
//     the sibling would break this package in a place no inventory names as a dependency.
//     Now with the same technique as the platform engine above: we ask the resolver FROM OURSELVES and on
//     failure say loudly what is wrong. The name must resolve from the node_modules where this package lives:
//     installation creates the link dsh-pamyat-kompakt → ../dsh-pamyat-kompakt.
let putKompakta;
try {
  putKompakta = trebovatSvoj.resolve("dsh-pamyat-kompakt");
} catch (e) {
  throw new Error(pristavka("dsh-pamyat-kompakt-dsh") + " не нашёл пакет dsh-pamyat-kompakt по имени от " +
                  import.meta.url + ": " + String(e?.message ?? e) +
                  ". Он обязан разрешаться из того же node_modules (ссылка node_modules/dsh-pamyat-kompakt → ../dsh-pamyat-kompakt)")
}
// RU: Функция сводки соседнего пакета: промт, рамки, модель-сумматор, барьеры и след отказов живут там.
// EN: Summary function of the sibling package: the prompt, frames, summarizer model, barriers and refusal trace
//     live there.
const { svodkaNashejModelyu, KOMPAKT_MODEL: MODEL_SOSEDA } = await import(pathToFileURL(putKompakta).href);

/** Собрать прозу из того, что платформа даёт на вход сводке: только текстовые блоки, роль — «Пользователь» или «Я». · Build prose from the platform's summary input: text blocks only, role "Пользователь" (user) or "Я" (me). */
function prozaIzVhoda(input) {
  const kuski = [];
  const soobshcheniya = Array.isArray(input) ? input : (input?.messages ?? []);
  for (const s of soobshcheniya) {
    const rol = s?.role ?? s?.message?.role;
    const soderzhimoe = s?.content ?? s?.message?.content;
    const tekst = typeof soderzhimoe === "string" ? soderzhimoe
      : Array.isArray(soderzhimoe)
        ? soderzhimoe.filter((b) => b?.type === "text").map((b) => b.text).join("\n")
        : "";
    // RU: Каждое сообщение — заголовок роли и текст; пустые сообщения пропускаются.
    // EN: Each message is a role header plus text; empty messages are skipped.
    if (tekst) kuski.push(`### ${rol === "user" ? "Пользователь" : "Я"}\n${tekst}`);
  }
  return kuski.join("\n\n");
}

// RU: ХВОСТ — то, что остаётся у агента дословно после сжатия. Платформа (dsh-compaction-basic) отдаёт в
//     summarize только ГОЛОВУ: buildSummarizationInput строит input.messages из shadowedSeqs — префикса
//     session.surface.nodes — через session.deriveEventMessage и отбрасывает пустые. Хвост = остаток surface
//     после головы.
//     Выводим хвост ТЕМ ЖЕ вызовом: идём по surface с начала и считаем непустые сообщения, пока их не станет
//     input.messages.length. Стык проверяем СОДЕРЖИМЫМ: первое и N-е выведенные обязаны совпасть с первым и
//     последним сообщением головы. Не сошлось — хвост НЕ подаём («отказ в закрытую»): сводка как прежде,
//     причина — строкой журнала.
//     compactRegion не трогаем: это вне объявленного крючка summarize, и при смене платформы такая правка
//     сломалась бы молча.
//     Чего не ловит: голову, начатую НЕ с surface.nodes[0] (у естественного сжатия она всегда с нулевого).
//     Ручной и восстановительный пути (удержание 0) дают пустой хвост — там ничего не меняется.
//     Журнал сессии читается через службу ядра памяти (pm, получаемый вызывающим через
//     pomoshchnikYadra(this.ctx)). Индексы snapshotEvents() в DSH 0.2 равны seq (seq = длина журнала,
//     snapshotEvents() — весь журнал), поэтому sobytiya[uzly[i]] работает как прежде.
// EN: The TAIL is what stays verbatim with the agent after compaction. The platform (dsh-compaction-basic)
//     passes only the HEAD to summarize: buildSummarizationInput builds input.messages from shadowedSeqs — a
//     prefix of session.surface.nodes — via session.deriveEventMessage and drops empty ones. Tail = the rest of
//     the surface after the head.
//     We derive the tail with the SAME call: walk the surface from the start counting non-empty messages until
//     there are input.messages.length of them. The joint is checked by CONTENT: the first and the N-th derived
//     messages must equal the first and the last message of the head. If it does not match, the tail is NOT
//     supplied ("fail closed"): the summary is as before, the reason goes to a log line.
//     compactRegion is not touched: it is outside the declared summarize hook and such a change would break
//     silently on a platform upgrade.
//     Not caught: a head that does NOT start at surface.nodes[0] (natural compaction always starts at zero).
//     Manual and recovery paths (retain 0) give an empty tail — nothing changes there.
//     The session journal is read through the memory core service (pm, obtained by the caller via
//     pomoshchnikYadra(this.ctx)). In DSH 0.2 the indices of snapshotEvents() equal seq (seq = journal length,
//     snapshotEvents() — the whole journal), so sobytiya[uzly[i]] works as before.
export function vhodSHvostom(input, agent, pm = null) {
  // RU: Голова — то, что платформа уже передала в summarize (массив или { messages }).
  // EN: Head — what the platform has already passed to summarize (an array or { messages }).
  const golova = Array.isArray(input) ? input : (input?.messages ?? []);
  const s = agent?.session, uzly = s?.surface?.nodes;
  if (!Array.isArray(uzly) || typeof s?.deriveEventMessage !== "function") return { hvost: null, pochemu: "сессия агента недоступна" };
  const sobytiya = sobytiyaDlyaUsage(s, pm, () => {});
  if (sobytiya === null) return { hvost: null, pochemu: "журнал сессии не читается (ни events, ни snapshotEvents)" };
  if (golova.length === 0) return { hvost: null, pochemu: "голова пуста" };
  // RU: Идём по узлам поверхности и считаем непустые сообщения, пока их не станет столько же, сколько в голове;
  //     запоминаем первое и последнее для сверки стыка.
  // EN: Walk the surface nodes counting non-empty messages until there are as many as in the head; remember the
  //     first and the last for the joint check.
  let n = 0, i = 0, pervoe, poslednee;
  for (; i < uzly.length && n < golova.length; i++) {
    const m = s.deriveEventMessage(sobytiya[uzly[i]]);
    if (m === null) continue;
    n++; if (n === 1) pervoe = m; poslednee = m;
  }
  if (n !== golova.length) return { hvost: null, pochemu: `на surface непустых ${n}, в голове ${golova.length}` };
  if (!isDeepStrictEqual(pervoe, golova[0]) || !isDeepStrictEqual(poslednee, golova[golova.length - 1]))
    return { hvost: null, pochemu: "стык не сошёлся: сообщения surface ≠ сообщениям головы" };
  // RU: Всё, что после головы, — хвост (пустые события отброшены).
  // EN: Everything after the head is the tail (empty events dropped).
  const hvost = uzly.slice(i).map((seq) => s.deriveEventMessage(sobytiya[seq])).filter((m) => m !== null);
  return { hvost, pochemu: null };
}

// RU: Сводка читается агентом ОДИН раз — здесь, в поверхности платформы (прежде она дублировалась ещё и во
//     вставке пакета восстановления). В КОНЦЕ сводки — строка о том, что дальше идёт дословный хвост. Только
//     если хвост есть (vhodSHvostom дал ≥ 1 сообщение); нет хвоста или стык не сошёлся — строки нет: неправду о
//     хвосте не пишем.
//     Начало строки — МАРКЕР: по нему пакет восстановления (dsh-pamyat-restore) выбирает текст побуждения и
//     вырезает эту строку из сводки в приветствии (там хвоста следом нет). Тот же литерал обязан стоять в
//     dsh-pamyat-restore. Совпадение двух литералов сверяет stend-literala-hvosta.mjs.
// EN: The agent reads the summary ONCE — here, in the platform surface (it used to be duplicated in the restore
//     package's insertion too). At the END of the summary there is a line saying that the verbatim tail
//     follows. Only if a tail exists (vhodSHvostom returned ≥ 1 message); no tail or a mismatched joint — no
//     line: we do not write untruths about the tail.
//     The start of the line is a MARKER: the restore package (dsh-pamyat-restore) uses it to choose the wake-up
//     text and to cut this line out of the summary in the welcome message (no tail follows there). The same
//     literal must be present in dsh-pamyat-restore. stend-literala-hvosta.mjs checks that the two literals
//     match.
export const STROKA_HVOSTA = "Дальше — дословный хвост журнала до сжатия";

// RU: УДЕРЖАНИЕ НЕ БОЛЬШЕ ПОЛОВИНЫ ПОВЕРХНОСТИ. Платформа (dsh-compaction-basic) сравнивает порог с ДАВЛЕНИЕМ
//     (usage, весь контекст), удержание считает от ОКНА (окно × retainRatio), а хвост набирает из узлов
//     ПОВЕРХНОСТИ. Если вся поверхность меньше удержания, selectCompactableRange молча отдаёт null — и сжатия
//     нет.
//     У агентов за шлюзом подписки в поверхности только сообщения (инструменты крутит SDK): на пороге
//     поверхность 52–75 тыс. токенов при давлении 890 тыс.; при удержании 6% окна (60 тыс.) сжатие не шло бы
//     вовсе.
//     Почему ½, а не «от давления»: хвост всегда меньше поверхности ⇒ ловушки нет по построению; где
//     поверхность ≥ 2 удержаний (агенты с большой поверхностью), выбор побайтно прежний. «От давления» (R ×
//     S/P) у шлюзовых агентов оставило бы 3–5 тыс. токенов (пару писем) и сдвинуло всех.
//     Постоянная, а не настройка: это граница устройства, а не вкус агента (решение координатора).
// EN: RETAINED TAIL IS AT MOST HALF OF THE SURFACE. The platform (dsh-compaction-basic) compares the threshold
//     with PRESSURE (usage, the whole context), computes retention from the WINDOW (window × retainRatio), but
//     collects the tail from SURFACE nodes. If the whole surface is smaller than the retention,
//     selectCompactableRange silently returns null — and there is no compaction.
//     For agents behind the subscription gateway the surface contains only messages (tools are run by the SDK):
//     at the threshold the surface is 52–75 k tokens at a pressure of 890 k; with retention of 6% of the window
//     (60 k) compaction would never happen.
//     Why ½ and not "from pressure": the tail is always smaller than the surface ⇒ no trap by construction;
//     where the surface is ≥ 2 retentions (agents with a large surface) the choice is byte-for-byte unchanged.
//     "From pressure" (R × S/P) would leave gateway agents 3–5 k tokens (a couple of letters) and shift
//     everyone.
//     A constant, not a setting: this is a boundary of the design, not an agent's taste (coordinator's
//     decision).
export const DOLYA_POVERHNOSTI = 0.5;
/** Действующее удержание: не больше доли поверхности. · Effective retention: no more than the surface share. */
export const uderzhanieOtPoverhnosti = (retainTokens, surfaceTokens) =>
  Math.min(retainTokens, Math.floor(surfaceTokens * DOLYA_POVERHNOSTI));
const zhurnal = (m) => console.error(`${pristavka("kompakt-dsh")} ${m}`);   // RU: строки ctx.logger.info платформы до журнала службы НЕ доходят — пишем в stderr. EN: platform ctx.logger.info lines do NOT reach the service journal — we write to stderr.

// RU: Только нынешний объявленный маршрут Codex (provider claude-oauth, модель gpt-*); Claude и прямые API
//     сохраняют прежнюю политику.
// EN: Only the presently declared Codex route (provider claude-oauth, model gpt-*); Claude and direct APIs keep
//     their previous policy.
export const marshrutCodex = (target) => target?.provider === "claude-oauth"
  && typeof target.model === "string" && target.model.startsWith("gpt-");

// RU: Читаем ДОЛГОВЕЧНЫЕ события журнала, а не равенство чисел usage: новый ответ может сообщить тот же самый
//     usage. Успешный end сам по себе — ещё не сводка; сводка сама по себе — ещё не успешная фиксация.
//     Журнал сессии — через службу ядра памяти ctx.pamyat (DSH 0.1.1 — поле events; 0.1.7+/0.2.0 —
//     snapshotEvents()), БЕЗ inject: этот пакет не ждёт ядра. Нет службы/помощника — прежнее чтение
//     session.events. Журнал не читается вовсе — «не жду» (null: сжатие идёт родным путём и НЕ блокируется) и
//     строка вслух один раз на сессию, а не TypeError.
// EN: We read DURABLE journal events, not equality of usage numbers: a NEW response may report identical usage.
//     A successful end alone is not a summary; a summary alone is not a successful commit.
//     The session journal comes through the memory core service ctx.pamyat (DSH 0.1.1 — field events;
//     0.1.7+/0.2.0 — snapshotEvents()), WITHOUT inject: this package does not wait for the core. No
//     service/helper — the old session.events read. The journal cannot be read at all — "not waiting" (null:
//     compaction goes the native way and is NOT blocked) and one spoken line per session, not a TypeError.
// RU: Помощник ядра памяти: служба 'pamyat' с функцией sobytiyaSessii, иначе null.
// EN: Memory core helper: the 'pamyat' service with sobytiyaSessii, otherwise null.
export function pomoshchnikYadra(ctx) {
  let pm;
  try { pm = ctx?.get?.('pamyat'); } catch { pm = undefined; }
  return typeof pm?.sobytiyaSessii === 'function' ? pm : null;
}
// RU: Сессии, о которых уже сказано «журнал недоступен», — чтобы строка не повторялась на каждом ходе.
// EN: Sessions already reported as "journal unavailable" — so the line is not repeated every turn.
const zhurnalNeChitaetsya = new Set();
export function sobytiyaDlyaUsage(session, pm = null, skazat = zhurnal) {
  const events = pm ? pm.sobytiyaSessii(session) : session?.events;
  if (Array.isArray(events)) return events;
  const sid = String(session?.id ?? '?');
  if (!zhurnalNeChitaetsya.has(sid)) {
    zhurnalNeChitaetsya.add(sid);
    skazat(`🔴 журнал сессии недоступен (ни events, ни snapshotEvents) — ожидание свежего usage после сжатия НЕ проверяется; session=${sid}`);
  }
  return null;
}
// RU: Ждём ли свежего usage: идём по журналу с конца. Встретился ответ модели с usage раньше, чем успешный
//     эпизод сжатия, — уже не ждём (null). Встретилась пара compaction/summary + успешный compaction/end того
//     же compactionId — ждём, возвращаем их seq.
// EN: Are we waiting for fresh usage: walk the journal from the end. A model response with usage met before a
//     successful compaction episode — no longer waiting (null). A pair compaction/summary + successful
//     compaction/end with the same compactionId — waiting; return their seq.
export function zhdyomUsage(session, pm = null, skazat = zhurnal) {
  const ends = new Map();
  const events = sobytiyaDlyaUsage(session, pm, skazat);
  if (events === null) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "assistant/message" && e.data?.usage !== undefined) return null;
    if (e.type === "compaction/end" && e.data?.error === undefined && e.data?.compactionId)
      ends.set(e.data.compactionId, e.seq);
    if (e.type === "compaction/summary" && ends.has(e.data?.compactionId))
      return { summarySeq: e.seq, endSeq: ends.get(e.data.compactionId) };
  }
  return null;
}
// RU: Отбой: последний УСПЕШНО закрытый эпизод сжатия — независимо от того, пришёл ли после него usage. Журнал
//     — через службу ядра, как в zhdyomUsage; не читается — null (отбоя нет).
// EN: All-clear: the last SUCCESSFULLY closed compaction episode — regardless of whether usage came after it.
//     The journal is read through the core service, as in zhdyomUsage; unreadable — null (no all-clear).
export function poslednijEpizod(session, pm = null, skazat = zhurnal) {
  const ends = new Map();
  const events = sobytiyaDlyaUsage(session, pm, skazat);
  if (events === null) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "compaction/end" && e.data?.error === undefined && e.data?.compactionId)
      ends.set(e.data.compactionId, e.seq);
    if (e.type === "compaction/summary" && ends.has(e.data?.compactionId))
      return { summarySeq: e.seq, endSeq: ends.get(e.data.compactionId) };
  }
  return null;
}
// RU: Строка журнала: давление после сжатия неизвестно до свежего usage; повтор сжатия по давлению не разрешён.
// EN: Log line: pressure after compaction is unknown until fresh usage; a repeated pressure compaction is not
//     allowed.
function pechatOzhidaniya(agent, meter, state) {
  const m = meter.measure(agent.session);
  zhurnal(`давление после сжатия НЕИЗВЕСТНО до свежего usage: session=${agent.session.id} summarySeq=${state.summarySeq} endSeq=${state.endSeq}; старая оценка=${m.totalTokens}, основа=${m.baseline.tokens}; повтор pressure не разрешён`);
}

// RU: Предел считает ЗАВЕРШЁННЫЕ ходы, а не вызовы перед шагом (pre-step).
// EN: The limit counts COMPLETED turns, never pre-step invocations.
export const PREDEL_USAGE_HODOV = 3;
// RU: Тревога владельцу — внешней командой agent-alert (путь задан в коде). Канал: 3 попытки по 20 с, паузы 5 и
//     15 с; весь процесс ограничен 100 с, что покрывает бюджет канала 80 с (проверяет stend-predela-usage).
// EN: Alert to the owner — via the external command agent-alert (path set in code). Channel: 3 attempts of 20
//     s, pauses of 5 and 15 s; the whole process is limited to 100 s, covering the 80-second channel budget
//     (checked by stend-predela-usage).
const poslatTrevoguUsage = (text) => new Promise((resolve, reject) => {
  execFile(AGENT_ALERT, [text], { timeout: 100000, env: { ...process.env, AGENT_ALERT_POPYTOK: '3', AGENT_ALERT_TAJMAUT: '20', AGENT_ALERT_PAUZY: '5 15' } }, (error) => error ? reject(error) : resolve());
});
// RU: Сторож свежего usage (только маршрут Codex). После успешного сжатия шлюз Codex не сразу присылает новый
//     usage; пока его нет, давление неизвестно и повторное сжатие DSH заблокировано. Если прошло
//     PREDEL_USAGE_HODOV завершённых ходов без свежего usage — ОДНА тревога владельцу; когда usage пришёл —
//     ОДИН отбой. Метки — файлы JSON в <DSH_HOME или ~/.dsh>/kompakt-dsh/usage-alerts (0700/0600), ключ —
//     sha256(сессия, createdAt, summarySeq, endSeq); метка занимается ДО отправки, поэтому перезапуск не
//     дублирует тревогу.
// EN: Fresh-usage watchdog (Codex route only). After a successful compaction the Codex gateway does not send
//     new usage at once; until it does, pressure is unknown and repeated DSH compaction is blocked. If
//     PREDEL_USAGE_HODOV completed turns pass without fresh usage — ONE alert to the owner; when usage arrives
//     — ONE all-clear. Marks are JSON files in <DSH_HOME or ~/.dsh>/kompakt-dsh/usage-alerts (0700/0600), key —
//     sha256(session, createdAt, summarySeq, endSeq); the mark is reserved BEFORE sending, so a restart does
//     not duplicate the alert.
export function storozhUsage(ctx, { directory, send = poslatTrevoguUsage, log = zhurnal } = {}) {
  const seen = new Set(), seenOtboj = new Set();
  const katalog = () => { const home = process.env.DSH_HOME || (process.env.HOME && path.join(process.env.HOME, '.dsh'));
    return directory || (home && path.join(home, 'kompakt-dsh', 'usage-alerts')); };
  const kluch = (session, ep) => createHash('sha256').update(JSON.stringify([session.id, session.header.createdAt, ep.summarySeq, ep.endSeq])).digest('hex');
  // RU: Отбой: тревога ожидания ДОСТАВЛЕНА, а usage затем пришёл — ОДИН отбой. Отметка отбоя ставится в ту же
  //     метку ДО отправки (перезапуск не повторит). Тревога не дошла (command_failed) — отбоя нет: закрывать
  //     нечего. Отказ канала на отбое назван и записан, не повторяется (та же политика, что у самой тревоги).
  // EN: All-clear: the waiting alert was DELIVERED and usage came afterwards — exactly ONE all-clear. The
  //     all-clear mark is written into the same mark file BEFORE sending (a restart will not repeat it). The
  //     alert was not delivered (command_failed) — no all-clear: nothing to close. A channel failure on the
  //     all-clear is named and recorded, never retried (same policy as the alert itself).
  async function otboj(session, pm = null) {
    const ep = poslednijEpizod(session, pm, log); const dir = ep && katalog();
    if (!dir) return;
    const key = kluch(session, ep), file = path.join(dir, key + '.json');
    if (seenOtboj.has(key)) return;
    let state;
    try { state = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return; seenOtboj.add(key);
      log(`🔴 отбой ожидания usage: метка не читается (${error.code || error.name}); session=${session.id}`); return; }
    seenOtboj.add(key);
    if (state.otboj || state.status !== 'command_ok') return;
    state.otboj = 'reserved';
    try { writeFileSync(file, JSON.stringify(state) + '\n', { mode: 0o600 }); }
    catch (error) { log(`🔴 отбой ожидания usage НЕ отправлен: метка не записана (${error.code || error.name}); session=${session.id}`); return; }
    const text = `✅ отбой: свежий usage пришёл, ожидание снято; session=${session.id}, summarySeq=${ep.summarySeq}`;
    log(text);
    try { await send(text); state.otboj = 'command_ok'; }
    catch (error) { state.otboj = 'command_failed'; log(`🔴 agent-alert отказал для отбоя usage: ${error.killed ? 'timeout' : (error.code || error.name)}; session=${session.id}`); }
    try { writeFileSync(file, JSON.stringify(state) + '\n', { mode: 0o600 }); }
    catch (error) { log(`🔴 исход отбоя НЕ сохранён (${error.code || error.name}); session=${session.id}`); }
  }
  // RU: Слушатель событий сессии: реагирует только на turn/end маршрута Codex с основой давления usage.
  // EN: Session event listener: reacts only to turn/end on the Codex route with a usage-based pressure
  //     baseline.
  return ctx.on('session/event', async (session, event) => {
    if (event.type !== 'turn/end' || !marshrutCodex(session.requestHeader()?.config)) return;
    const pm = pomoshchnikYadra(ctx);
    const waiting = zhdyomUsage(session, pm, log);
    if (!waiting) return otboj(session, pm);
    if (ctx.tokenMeter.measure(session).baseline?.kind !== 'usage') return;
    // RU: Считаем РАЗНЫЕ номера завершённых ходов после эпизода сжатия (повторный turn/end того же хода не
    //     считается).
    // EN: Count DISTINCT completed turn numbers after the compaction episode (a repeated turn/end of the same
    //     turn does not count).
    const turns = new Set(sobytiyaDlyaUsage(session, pm, log).slice(waiting.endSeq + 1)
      .filter(e => e.type === 'turn/end' && Number.isSafeInteger(e.data?.turn) && e.data.turn >= 0).map(e => e.data.turn));
    if (turns.size < PREDEL_USAGE_HODOV) return;
    const key = kluch(session, waiting);
    if (seen.has(key)) return;
    seen.add(key);
    // RU: Метка занимается до отправки (открытие с флагом wx): если файл уже есть — тревога уже была, молчим.
    // EN: The mark is reserved before sending (open with the wx flag): if the file already exists the alert was
    //     already sent — stay silent.
    const state = { session: session.id, createdAt: session.header.createdAt, ...waiting, turns: turns.size,
      attemptedAt: new Date().toISOString(), status: 'reserved' };
    let file;
    try {
      const dir = katalog();
      if (!dir) throw new Error('agent home absent');
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      file = path.join(dir, key + '.json');
      const fd = openSync(file, 'wx', 0o600); // RU: метка занимается ДО отправки: перезапуск не пошлёт повторно вслепую. EN: reserve before delivery: restart never blindly resends.
      try { writeFileSync(fd, JSON.stringify(state) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    } catch (error) {
      if (error.code !== 'EEXIST') log(`🔴 тревога ожидания usage НЕ отправлена: метка недоступна (${error.code || error.name}); session=${session.id}`);
      return;
    }
    const text = `ожидание usage затянулось: сжатие DSH заблокировано, страхует только Codex; session=${session.id}, summarySeq=${waiting.summarySeq}, завершённых ходов без usage=${turns.size}, предел=${PREDEL_USAGE_HODOV}`;
    log('🔴 ' + text);
    try { await send(text); state.status = 'command_ok'; }
    catch (error) { state.status = 'command_failed'; state.error = error.killed ? 'timeout' : (error.code || error.name);
      log(`🔴 agent-alert отказал для ожидания usage: ${state.error}; session=${session.id}`); }
    try { writeFileSync(file, JSON.stringify(state) + '\n', { mode: 0o600 }); }
    catch (error) { log(`🔴 исход agent-alert НЕ сохранён (${error.code || error.name}); session=${session.id}`); }
  });
}

// RU: Наш движок сжатия: наследник родного BasicCompactionEngine. Переопределены три метода: compactIfNeeded
//     (ожидание свежего usage на маршруте Codex), compactSUderzhaniem (удержание ≤ ½ поверхности) и summarize
//     (наша сводка с хвостом). Остальное — родное.
// EN: Our compaction engine: a subclass of the native BasicCompactionEngine. Three methods are overridden:
//     compactIfNeeded (waiting for fresh usage on the Codex route), compactSUderzhaniem (retention ≤ ½ of the
//     surface) and summarize (our summary with the tail). Everything else is native.
export class NashaSvodka extends BasicCompactionEngine {
  // RU: След при создании. Без него работающий движок неотличим от неподключённого: строка сводки печатается
  //     только при сжатии, а оно бывает раз в сутки.
  // EN: A trace at creation. Without it a working engine is indistinguishable from an unconnected one: the
  //     summary line is printed only at compaction, which may happen once a day.
  constructor(...a) {
    super(...a);
    // RU: Подключаем сторож свежего usage и отметку продолжения (marker-step.mjs) — оба живут, пока жив движок.
    // EN: Attach the fresh-usage watchdog and the continuation marker (marker-step.mjs) — both live as long as
    //     the engine.
    storozhUsage(this.ctx);
    installMarker(this.ctx, { log: zhurnal });
    // RU: Настройку отдаёт сам работающий движок в пределах своего агента, даже из isolate (событие
    //     our/compaction-status; его рассылает канальный плагин, чтобы показать действующие пороги сжатия).
    // EN: The running engine itself reports its configuration within its agent's scope, even from an isolate
    //     (event our/compaction-status; it is emitted by the channel plugin to show the active compaction
    //     thresholds).
    this.ctx.on('our/compaction-status', (replies) => { replies.push(this.config); });
    const s = `${pristavka("dsh-pamyat-kompakt-dsh")} движок создан платформой: наша сводка ПОДКЛЮЧЕНА, при отказе модели отдаём родной`;
    (this.ctx?.logger?.info?.(s)) ?? console.error(s);
  }

  // RU: Платформа зовёт compactIfNeeded динамически («subclass overrides are honored»). Выбор хвоста у неё
  //     закрыт, поэтому удержание подаётся ей ПОДСТАНОВКОЙ this.config на время синхронной части вызова:
  //     политику она читает второй строкой, до первого await.
  //     ⚠️ Вставит платформа await раньше — подстановка молча отвалится; поэтому retainTokens подставы — ГЕТТЕР
  //     с отметкой прочтения, и непрочтённая подстава кричит в журнал. Восстановление (удержание 0) и конфиг с
  //     modelPolicies для маршрута — прежним путём.
  //     Маршрут Codex: давление ждёт свежего usage после успешного сжатия.
  // EN: The platform calls compactIfNeeded dynamically ("subclass overrides are honored"). Its tail selection
  //     is closed, so the retention is supplied by SUBSTITUTING this.config for the synchronous part of the
  //     call: the platform reads the policy on its second line, before the first await.
  //     ⚠️ If the platform inserts an await earlier, the substitution silently stops working; therefore
  //     retainTokens of the substitute is a GETTER that records the read, and an unread substitute shouts into
  //     the log. Recovery (retain 0) and a config with modelPolicies for the route go the old way.
  //     Codex route: pressure waits for fresh usage after a successful compaction.
  async compactIfNeeded(agent, trigger, signal) {
    const session = agent.session;
    const target = session.requestHeader()?.config;
    if (trigger !== "pressure" || !marshrutCodex(target)
        || this.ctx.tokenMeter.measure(session).baseline?.kind !== "usage")
      return this.compactSUderzhaniem(agent, trigger, signal);
    const waiting = zhdyomUsage(session, pomoshchnikYadra(this.ctx));
    if (waiting) { pechatOzhidaniya(agent, this.ctx.tokenMeter, waiting); return null; }

    // RU: Родные выбор, сводка и фиксация не трогаются. Останавливаем ИХ цикл повторов только после того, как
    //     compactRegion вернул успех и compaction/end лёг в долговечную историю. Область — на один вызов:
    //     методы и конфиг общей службы и счётчика не подменяем.
    // EN: Native selection, summarization and commit stay untouched. We stop THEIR retry loop only after
    //     compactRegion returns success and compaction/end is in the durable history. The scope is per call:
    //     methods/config of the shared service or meter are never replaced.
    const scope = Object.create(this);
    const finished = Symbol("successful compaction awaits fresh usage");
    let result;
    scope.compactRegion = async (...args) => {
      const committed = await this.compactRegion(...args);
      if (zhdyomUsage(session, pomoshchnikYadra(this.ctx)) && this.ctx.tokenMeter.measure(session).baseline?.kind === "usage") {
        result = committed;
        throw finished;
      }
      return committed;
    };
    try { return await this.compactSUderzhaniem.call(scope, agent, trigger, signal); }
    catch (error) {
      if (error !== finished) throw error; // RU: отказы сводки/фиксации сохраняют прежнее поведение. EN: summary/commit failures keep their original behavior.
      pechatOzhidaniya(agent, this.ctx.tokenMeter, zhdyomUsage(session, pomoshchnikYadra(this.ctx)));
      return result;
    }
  }

  // RU: Сжатие с удержанием не больше ½ поверхности. Цель берётся так же, как у платформы (только при
  //     давлении); есть явная политика модели — родной путь без изменений. Окно модели узнаём у платформы; не
  //     узнали — пусть платформа сама назовёт отказ.
  // EN: Compaction with retention of at most ½ of the surface. The target is taken the same way the platform
  //     does (only under pressure); an explicit model policy exists — the native path unchanged. The model
  //     window is asked from the platform; unknown — let the platform name the failure itself.
  async compactSUderzhaniem(agent, trigger, signal) {
    const konfig = this.config;
    const cel = trigger === "pressure" ? agent.session.requestHeader()?.config : undefined;   // RU: как routedTarget платформы. EN: same as the platform's routedTarget.
    if (!cel?.provider || !cel?.model || konfig.modelPolicies.some((p) => p.provider === cel.provider && p.model === cel.model)) {
      return super.compactIfNeeded(agent, trigger, signal);
    }
    const okno = (await this.ctx.llm.resolveModelInfo(cel.provider, cel.model, signal))?.context?.contextWindow;
    if (!Number.isInteger(okno) || okno <= 0) return super.compactIfNeeded(agent, trigger, signal);   // RU: пусть платформа назовёт отказ сама. EN: let the platform name the failure itself.
    // RU: R — удержание платформы (retainTokens или окно × retainRatio); M — наше, не больше половины
    //     поверхности.
    // EN: R — the platform's retention (retainTokens or window × retainRatio); M — ours, no more than half the
    //     surface.
    const R = konfig.retainTokens ?? Math.floor(okno * konfig.retainRatio);
    const M = uderzhanieOtPoverhnosti(R, this.ctx.tokenMeter.measure(agent.session).surfaceTokens);
    let prochitano = false;
    let rezultat;
    // RU: M < R: подаём платформе замороженную копию конфига с геттером retainTokens = M и возвращаем прежний
    //     конфиг сразу после синхронной части вызова.
    // EN: M < R: give the platform a frozen config copy with a getter retainTokens = M and restore the original
    //     config right after the synchronous part of the call.
    if (M < R) {
      const podstava = Object.freeze(Object.defineProperty({ ...konfig }, "retainTokens",
        { enumerable: true, get: () => { prochitano = true; return M; } }));
      this.config = podstava;
      try { rezultat = super.compactIfNeeded(agent, trigger, signal); } finally { this.config = konfig; }
      if (!prochitano) zhurnal(`🔴 платформа НЕ прочла подстановку удержания ${M} (вместо ${R}) в синхронной части compactIfNeeded — ловушка удержания вернулась; сверь dsh-compaction-basic`);
    } else {
      rezultat = super.compactIfNeeded(agent, trigger, signal);
    }
    const itog = await rezultat;
    // RU: Платформа ничего не выбрала при давлении выше порога — называем причину строкой журнала: поверхность
    //     пуста, поверхность меньше удержания или баланс пар инструментов.
    // EN: The platform selected nothing while pressure is above the threshold — name the reason in a log line:
    //     empty surface, surface below retention, or tool-call pair balance.
    if (itog === null) {
      const m = this.ctx.tokenMeter.measure(agent.session);
      const T = Math.floor(okno * konfig.thresholdRatio);
      const U = M < R && !prochitano ? R : M;   // RU: удержание, с которым платформа РЕАЛЬНО выбирала. EN: the retention the platform ACTUALLY selected with.
      if (m.totalTokens >= T) {
        zhurnal(m.nodes.length === 0 ? `выбрать нечего: давление ${m.totalTokens} ≥ порога ${T}, поверхность пуста — сжатия нет`
          : m.surfaceTokens < U
            ? `выбрать нечего: давление ${m.totalTokens} ≥ порога ${T}, поверхность ${m.surfaceTokens} < удержания ${U} — сжатия нет`
            : `выбрать нечего по балансу пар инструментов: давление ${m.totalTokens} ≥ порога ${T}, поверхность ${m.surfaceTokens}, удержание ${U} — сжатия нет`);
      }
    }
    return itog;
  }

  // RU: Сводка: проза головы → наша модель (через dsh-pamyat-kompakt), хвост подаётся вторым блоком и не
  //     пересказывается. Любая ошибка — строка журнала и родная сводка платформы.
  // EN: Summary: head prose → our model (via dsh-pamyat-kompakt); the tail is supplied as a second block and is
  //     not retold. Any error — a log line and the platform's native summary.
  async summarize(input, agent, signal) {
    const log = (m) => this.ctx?.logger?.info?.(`${pristavka("kompakt-dsh")} ${m}`) ?? console.error(`${pristavka("kompakt-dsh")} ${m}`);
    let proza = "";
    try {
      proza = prozaIzVhoda(input);
      // RU: Пустая проза — не наш случай: пусть родная сводка решает, что делать.
      // EN: Empty prose is not our case: let the native summary decide what to do.
      if (!proza.trim()) { log("прозы во входе нет — отдаю родной сводке"); return super.summarize(input, agent, signal); }
      const { hvost, pochemu } = vhodSHvostom(input, agent, pomoshchnikYadra(this.ctx));
      if (pochemu) log(`хвост НЕ подан (${pochemu}) — сводка по одной голове`);
      const prozaHvosta = hvost ? prozaIzVhoda(hvost) : "";
      // RU: Сигнал отмены платформы передаётся соседу: отмена шага прерывает вызов модели сразу (у соседа ещё и свой срок).
      // EN: The platform cancellation signal goes to the sibling: a cancelled step aborts the model call at once (the sibling also has its own deadline).
      const tekst = await svodkaNashejModelyu(proza, prozaHvosta || null, signal);
      log(`наша сводка: ${tekst.length} зн. из ${proza.length} зн. прозы` + (prozaHvosta ? ` · хвост ${prozaHvosta.length} зн. (${hvost.length} сообщ.) — подан, не пересказывается` : ""));
      const sHvostom = Array.isArray(hvost) && hvost.length > 0;
      const dlyaPlatformy = sHvostom ? `${tekst}\n\n${STROKA_HVOSTA} (${hvost.length} сообщ.): он не пересказан и идёт как был.` : tekst;
      log(sHvostom ? `в конец сводки добавлена строка о хвосте (${hvost.length} сообщ.)` : "строки о хвосте нет: хвост не подан");
      // RU: Ответ платформе: summary — сводка со строкой о хвосте (её видит агент), rawOutput — сводка без неё.
      //     provider/model — для журнала платформы: model — та, что выбрал dsh-pamyat-kompakt по своей настройке
      //     (его экспорт KOMPAKT_MODEL). Прежде бралась из окружения или умолчания и могла с ней расходиться;
      //     сосед без этого экспорта — «неизвестна», а не выдуманное имя.
      // EN: Answer to the platform: summary — the summary with the tail line (what the agent sees), rawOutput —
      //     without it. provider/model are for the platform's journal: model is the one dsh-pamyat-kompakt chose
      //     from its own settings (its KOMPAKT_MODEL export). Previously it came from the environment or the
      //     default and could diverge from it; a sibling without that export — "неизвестна" (unknown), not an
      //     invented name.
      return {
        summary: [{ type: "text", text: dlyaPlatformy }],
        rawOutput: [{ type: "text", text: tekst }],
        llmStreamCall: false,
        provider: "dsh-pamyat-kompakt",
        model: typeof MODEL_SOSEDA === "string" && MODEL_SOSEDA ? MODEL_SOSEDA : "неизвестна (сосед не отдаёт KOMPAKT_MODEL)",
        maxTokens: 0,
      };
    } catch (e) {
      log(`🔴 наша сводка НЕ СОСТОЯЛАСЬ (${String(e?.message ?? e).slice(0, 200)}) — отдаю родной`);
      return super.summarize(input, agent, signal);
    }
  }
}
export default NashaSvodka;
