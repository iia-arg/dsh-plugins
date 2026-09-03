// dsh-pamyat-restore — восстановление после компакта (слой B) и welcome-брифинг (слой C).
// Шов: agent/pre-step (образец dsh-time-context:363). План dsh-pamyat v2, разрез v1 (02.09.2026).
//
// 🔴 ГРАНИЦА (обязательна, правило 8): инъекция идёт ТОЛЬКО в agent/pre-step и только
// durable-сообщением с source.kind=plugin. Никаких решений по ходу — restore не привратник,
// он добавляет контекст и уходит. Что из него берёт модель — её дело.
//
// 🔴 ГРАНИЦА чтения: контракт (фиксирован координатором 02.09.2026, правило 9 разреза):
//   poslednie({agent, skolko}) -> массив записей, свежие первыми
//   prochitat(id)               -> одна запись
// Запись обязана нести минимум: soderzhim, vid, kogda, vera, avtor.
// Пока здесь ЗАГЛУШКА с правдоподобными записями (разные kogda/vera — иначе канарейка
// проверит только ветку «данных нет»). Сменится на вызов core, сигнатура не меняется.

import z from '@deepseek-ai/schemastery'
// 🔴 ФАБРИКА СООБЩЕНИЙ — ШТАТНАЯ, А НЕ СВОЯ. Куплено обрывом журнала 03.09.2026.
// Мы собирали сообщение объектным литералом {role, content, source} — без поля id.
// Платформа считает user/message БЕЗ id устаревшей записью и при загрузке требует для
// неё сохранённый префикс. Проверить условие:
//   grep -n 'case "user/message": return' <платформа>/@deepseek-ai/dsh-session-persistence/lib/index.js
//   -> !Object.hasOwn(data,"id") && Object.hasOwn(data,"content")
// Префикса нет — сессия не грузится, и узнаётся это НЕ при записи, а при подъёме.
//
// Дописать id руками было бы вторым описанием чужого контракта: сегодня не хватило id,
// завтра появится ещё поле, и мы снова узнаем об этом обрывом. Форму сообщения задаёт
// платформа — пусть она её и собирает. Фабрика заодно замораживает объект.
//
// ГРАНИЦА ЗАВИСИМОСТИ: берём подэкспорт /message, а не корень пакета. Ему нужны только
// два внутренних файла. Проверить:
//   grep -E '^import' <платформа>/@deepseek-ai/dsh-llm/lib/types/message.js
//   -> ровно две строки: ./brand.js и ./call-config.js
// Корень пакета потянул бы второй экземпляр cordis рядом с платформенным.
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-pamyat-restore'
export const inject = ['agents']

export const Config = z.object({
  restoreEnabled: z.boolean().default(true),
  welcomeEnabled: z.boolean().default(true),
  welcomeBudget: z.number().default(800),
  // Предел частоты брифинга: не чаще раза в столько миллисекунд на сессию. Заведён
  // вместе с потребителем (см. слой C), умолчание — сутки.
  welcomeInterval: z.number().default(86400000),
  // Где помнить, когда брифинг давался. На диске, а не в памяти процесса: перезапуск
  // и есть тот случай, ради которого отметка нужна.
  // 🔴 Умолчание НЕЙТРАЛЬНОЕ: путь строится от дома того, кто запустил, а не зашит
  // именем агента. Первая редакция несла жёсткий путь с именем агента — проба частных имён
  // ответила «ПУБЛИКОВАТЬ НЕЛЬЗЯ», и правильно: у получателя нашего пути нет, а жёсткий
  // путь в публикуемом предмете — это наше частное имя, уехавшее наружу.
  welcomeOtmetki: z.string().default(join(homedir(), '.dsh-pamyat-welcome-otmetki.json')),
  ignoreAfterMs: z.number().default(7 * 24 * 3600 * 1000),
  useVeraThreshold: z.number().default(0.7),
  // 🔴 КЛАСС СВОДКИ — НАСТРОЙКОЙ, А НЕ КОНСТАНТОЙ. Ту же строку пишет секретарь
  // (его ключ klass, умолчание такое же). Две стороны обязаны ссылаться на одно
  // значение, а не хранить по копии: копия расходится молча, и снаружи это
  // выглядит как «компакт был, а сводки нет». Умолчания совпадают намеренно —
  // разойдутся, если кто-то поменяет одну сторону, и тогда виден будет отказ,
  // а не тишина.
  klassSvodki: z.string().default('svodka-kompakcii'),
})
// 🔴 НЕТ ключа «интервал обновления брифинга» — намеренно: ключ живёт в той версии,
// которая его ИСПОЛНЯЕТ. Ключ, принимаемый схемой и ничего не делающий, снаружи
// неотличим от готовой возможности (пользователь ставит значение — получает тишину).
// Заведём ключ вместе с настоящим механизмом обновления, а не раньше.

const say = (s) => process.stderr.write(`[${name}] ${s}\n`)

// ── ПЕРЕХОДНИК К ЯДРУ ПАМЯТИ ─────────────────────────────────────────────────
// 🔴 ЗАГЛУШКА УБРАНА ЦЕЛИКОМ (03.09.2026), а не оставлена «на случай». Она год
// не мешала на стенде и один вечер кормила живой контекст выдумкой: слой честно
// вставлял в сессию правдоподобную запись z4, журнал печатал «восстановление
// вставлено», и отличить это от работы можно было только сверив текст с
// исходником. Запасной путь к тем же данным — это второй источник правды,
// который однажды победит молча.
//
// Формы у ядра и у нас разные, и переход между ними — единственное место, где
// они соприкасаются. Ядро отдаёт строку своей таблицы; сюда она приходит уже
// в наших именах.
export function perevesti(zapis) {
  if (!zapis || typeof zapis !== 'object') return null
  return {
    id: zapis.id,
    soderzhim: zapis.soderzhim,
    vid: zapis.klass,
    kogda: zapis.sozdano,
    // 🔴 ВЕРА ПЕРЕДАЁТСЯ КАК ЕСТЬ, включая null. Подставить сюда 0 или порог
    // значило бы уничтожить различение «не измеряли» и «измерили низко» ровно
    // на переходе — то самое, что ядро развело при записи, а мы чинили при
    // чтении часом раньше.
    vera: zapis.vera,
    // Автор: чем запись подписана. istochnik — что её породило; если пусто,
    // остаётся владелец знания. Ни то ни другое не выдумывается.
    avtor: zapis.istochnik ?? zapis.agent ?? null,
    // Отметка ядра о записи без подтверждения едет с записью: она про доверие,
    // и молча терять её на переходе нельзя.
    bezPodtverzhdeniya: zapis.bez_podtverzhdeniya === 1,
  }
}

/** Отбор записей под входящий бюджет — если пакет бюджета смонтирован.
 *
 *  Возвращает список записей: отобранный, если служба есть, и исходный, если её
 *  нет. Своего отбора здесь НЕТ намеренно: второй способ решать, что поднять,
 *  разошёлся бы с первым молча — та же болезнь, что две реализации суммы.
 *  Служба сама кричит, когда отбрасывает, и называет причины; наше дело —
 *  сказать, звали её или нет. */
function otobratPodPredel(ctx, zapisi) {
  const b = ctx?.get?.('byudzhetPamyati')
  if (!b || typeof b.otobrat !== 'function') {
    say(`бюджет не смонтирован — брифинг строится БЕЗ предела, записей ${zapisi.length}`)
    return zapisi
  }
  try {
    const itog = b.otobrat({ zapisi })
    const p = Array.isArray(itog?.podnyato) ? itog.podnyato : null
    if (!p) {
      say('🔴 бюджет вернул не список — брифинг строится БЕЗ предела')
      return zapisi
    }
    say(`бюджет применён: поднято ${p.length} из ${zapisi.length}`)
    return p
  } catch (e) {
    // Отказ бюджета не должен отменять брифинг: он про ЦЕНУ, а не про право.
    say(`🔴 бюджет отказал (${String(e?.message ?? e).slice(0, 120)}) — брифинг строится БЕЗ предела`)
    return zapisi
  }
}

/** Служба памяти берётся ctx.get, а НЕ через inject.
 *
 *  🔴 ОБОСНОВАНИЕ ИСПРАВЛЕНО 03.09.2026 ПОСЛЕ ПРОГОНА. Раньше здесь стояло, что
 *  inject увёл бы модуль в pending и «отказ стал бы неотличим от — пакет не
 *  смонтирован». Это НЕВЕРНО, и проверено подъёмом копии платформы с профилем
 *  без ядра: платформа НЕ стартует вовсе и называет причину поимённо —
 *      dsh: 1 entry did not activate
 *      dsh-pamyat-secretary: pending (waiting for service: pamyat)
 *  То есть inject не тихий, он КАТАСТРОФИЧНЫЙ: диагностика отличная, цена —
 *  весь агент.
 *
 *  Настоящий довод за ctx.get другой и он про соразмерность: отсутствие
 *  брифинга не стоит остановки агента. Слой обязан сохранить голос, сказать,
 *  что памяти нет, и уйти — а не обрушить того, кому он лишь добавляет контекст.
 *  Сравните с секретарём: у него inject объявлен, и это верно — без памяти он
 *  бесполезен, писать ему некуда, и падение честнее пустой работы. */
function pamyatIz(ctx) {
  const p = ctx?.get?.('pamyat')
  return (p && typeof p.prochitat === 'function') ? p : null
}

// 🔴 Отсутствие источника = ОТКАЗ, а не ноль (правило 3 разреза). Нет ответа/сломанный
// ответ — кричим и пропускаем инъекцию, а не тихо инжектируем пустоту.
async function readRecords(ctx, vopros = {}) {
  const pamyat = pamyatIz(ctx)
  if (!pamyat) {
    say('🔴 служба памяти недоступна (ядро не смонтировано или не поднялось) — инъекция пропущена')
    return null
  }
  if (typeof pamyat.dostupna === 'function' && !pamyat.dostupna()) {
    const pochemu = pamyat.pochemuNedostupna?.() ?? 'причина не названа'
    say(`🔴 память недоступна: ${String(pochemu).slice(0, 140)} — инъекция пропущена`)
    return null
  }
  try {
    const syrye = await pamyat.prochitat({ skolko: 10, ...vopros })
    if (!Array.isArray(syrye)) {
      say('🔴 источник памяти недоступен (prochitat вернул не массив) — инъекция пропущена')
      return null
    }
    return syrye.map(perevesti).filter(Boolean)
  } catch (e) {
    say(`🔴 источник памяти недоступен: ${String(e?.message ?? e).slice(0, 140)} — инъекция пропущена`)
    return null
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// Правило use/verify/ignore (детерминированное, печатает ОСНОВАНИЕ — без основания в
// выводе через месяц не отличим исправную работу от вырождения).
export function decide(record, config, now = Date.now()) {
  // 🔴 ВРЕМЯ — ТОЖЕ ИЗМЕРЕНИЕ, И ЕГО ОТСУТСТВИЕ ТОЖЕ ОТДЕЛЬНАЯ ВЕТКА
  // (03.09.2026, найдено сплошным обходом сравнений после разбора веры).
  // Без неё запись без времени уходила ДВУМЯ путями, и оба тихие:
  //   kogda = null      -> Date.now() - null = сегодня минус ноль -> «старше
  //                        20 тысяч суток» -> ignore, запись молча выброшена
  //   kogda = undefined -> NaN -> ни одно сравнение не истинно -> запись
  //                        проходит дальше как свежая
  // То есть одно и то же отсутствие давало противоположные исходы — ровно как
  // с верой часом раньше. Сравнивать можно только измеренное.
  if (typeof record.kogda !== 'number' || !Number.isFinite(record.kogda)) {
    return { decision: 'verify', reason: 'время записи неизвестно — применять с проверкой' }
  }
  const age = now - record.kogda
  if (age > config.ignoreAfterMs) {
    return { decision: 'ignore', reason: `старше ${Math.round(age / 86400000)} сут` }
  }
  // 🔴 «НЕ ИЗМЕРЯЛИ» — ОТДЕЛЬНАЯ ВЕТКА, ДО ВСЯКОГО СРАВНЕНИЯ. Куплено разбором
  // 03.09.2026. Сравнение здесь схлопывало обратно то, что ядро развело при
  // записи, и делало это ДВУМЯ разными способами сразу:
  //   null < 0.7      -> true   -> verify «вера null ниже порога» (число врёт)
  //   undefined < 0.7 -> false  -> USE «свежая, вера undefined»   (хуже: применит)
  // То есть два вида отсутствия давали ПРОТИВОПОЛОЖНЫЕ решения, и одно из них
  // объявляло неизмеренную запись достоверной. Сравнивать можно только то, что
  // измерено; всё прочее — своя ветка со своей причиной и БЕЗ числа в ней.
  // ГДЕ НЕ ПРИМЕНЯЕТСЯ: вера 0 — это ИЗМЕРЕННЫЙ ноль, а не отсутствие, и она
  // законно идёт в verify с числом.
  if (typeof record.vera !== 'number' || Number.isNaN(record.vera)) {
    return { decision: 'verify', reason: 'вера не измерялась — применять с проверкой' }
  }
  if (record.vera < config.useVeraThreshold) {
    return { decision: 'verify', reason: `вера ${record.vera} ниже порога ${config.useVeraThreshold}` }
  }
  return { decision: 'use', reason: `свежая, вера ${record.vera}` }
}

function renderWelcome(records, config) {
  let left = config.welcomeBudget
  const lines = []
  for (const r of records) {
    const d = decide(r, config)
    if (d.decision === 'ignore') continue
    const line = `[${d.decision}] (${r.vid} от ${r.avtor}) ${r.soderzhim} — ${d.reason}`
    if (line.length > left && lines.length > 0) break
    lines.push(line)
    left -= line.length
  }
  if (lines.length === 0) return null
  return `Память (welcome-брифинг, первые ${lines.length} записи по правилу use/verify/ignore):\n` + lines.map((l) => `- ${l}`).join('\n')
}

export function apply(ctx, config) {
  if (globalThis.__pamyatRestore) return
  globalThis.__pamyatRestore = true
  say(`подъём: restore=${config.restoreEnabled} welcome=${config.welcomeEnabled} бюджет=${config.welcomeBudget} ignoreAfterMs=${config.ignoreAfterMs} useVera=${config.useVeraThreshold}`)

  // 🔴 ПОДПИСКА НА session/event, А НЕ НА 'compaction/end'. Замер 02.09.2026:
  // хука с именем compaction/* в платформе НЕТ ВОВСЕ (шаблон 'compaction[^']*'( по
  // всем .d.ts дерева -> 0 при контроле зрячести: тем же шаблоном 'session/event'(
  // находится в dsh-session/lib/types/index.d.ts:66). compaction/end — это ТИП
  // СОБЫТИЯ ЖУРНАЛА СЕССИИ (SessionEventMap), и все потребители платформы читают
  // его так же: event.type === 'compaction/end' (dsh-compaction/invariant.js:60,101,
  // client-ui-trajectory:416). Подписка на несуществующий хук регистрируется молча
  // и не срабатывает никогда — снаружи неотличимо от «компакта не было».
  //
  // Живой payload снят с 8 событий моего журнала: { compactionId, turn }, поля error
  // ни у одного нет. Поле error объявлено в типе и означает НЕУДАВШИЙСЯ компакт —
  // тогда история не урезана и восстанавливать нечего, потому такие пропускаем.
  //
  // Флаг — ПО СЕССИИ, а не один на плагин: компакт в одной сессии не должен вызывать
  // вставку в другой. Ключ берётся из инварианта платформы. Проверить:
  //   grep -B 2 'readonly id: SessionId' <платформа>/@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts
  //   -> «The single identity shared with session»
  const pendingRestore = new Set()
  ctx.on('session/event', (session, event) => {
    if (event?.type !== 'compaction/end') return
    if (event.data?.error !== undefined) {
      say(`компакт ${event.data.compactionId ?? '?'} завершился ошибкой — восстанавливать нечего`)
      return
    }
    const sid = String(session?.id ?? '')
    if (!sid) { say('🔴 compaction/end без опознанной сессии — восстановление пропущено'); return }
    pendingRestore.add(sid)
    // 🔴 СЛЕД ПРИХОДА. Без него живая проба невозможна по построению: событие
    // придёт, вставка произойдёт, и доказать это будет нечем. Молчание механизма
    // неотличимо от его отсутствия — ровно то, из-за чего первая редакция пакета
    // подписывалась на несуществующий хук и никто бы этого не заметил.
    // Компакты редки (8 за трое суток на этой машине) — печать при каждом не шумит.
    say(`компакт ${event.data?.compactionId ?? '?'} завершён (ход ${event.data?.turn ?? 'null'}), `
      + `сессия ${sid}: восстановление взведено`)
  })

  ctx.on('agent/pre-step', async ({ agent, turn, step, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision

    const inject = (text) => ({
      kind: 'enter',
      messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
      })],
    })

    // B: восстановление после компакта
    const sid = String(agent?.session?.id ?? agent?.id ?? '')
    if (config.restoreEnabled && pendingRestore.has(sid)) {
      pendingRestore.delete(sid)
      // Сводку спрашиваем У ЯДРА ПО КЛАССУ, а не выбираем из общего списка:
      // список ограничен десятью свежими, и сводка старше десятой в него просто
      // не попала бы — «не нашли» стало бы зависеть от того, сколько записей
      // легло после компакта.
      const records = await readRecords(ctx, { klass: config.klassSvodki, skolko: 1 })
      if (!records) return decision
      const summary = records[0]
      if (summary) {
        say(`восстановление после компакта вставлено в сессию ${sid}: запись ${summary.id ?? '?'}, ${String(summary.soderzhim).length} знаков`)
        return inject(`Восстановление после компакта:\n${summary.soderzhim}`)
      }
      // 🔴 Событие было, а вставлять нечего. Ветка ТИХО проваливалась, и потраченное
      // взведение выглядело снаружи как «событие не приходило». Говорим вслух.
      // Класс называется в самой строке: если секретарь пишет другой, расхождение
      // видно сразу, а не через сверку двух настроек.
      say(`компакт был, но записи класса «${config.klassSvodki}» в памяти нет — вставлять нечего`)
    }

    // C: welcome на первом шаге ПОСЛЕ СТАРТА ПРОЦЕССА, а не на первом шаге сессии.
    //
    // 🔴 ПОЧЕМУ КРЮЧОК СМЕНИЛСЯ (03.09.2026). Было `turn === 1 && step === 1` — первый
    // шаг СЕССИИ. На живом узле сессия telegram-a2a переживает перезапуски и длится
    // сутками: её первый шаг случился ОДИН РАЗ в жизни, и за всё время брифинг не
    // сработал НИ РАЗУ (журнал: 0 строк «welcome-брифинг»). Код был верен, условие
    // недостижимо — механизм, который нельзя запустить, неотличим от несмонтированного.
    //
    // 🔴 И ВТОРАЯ ГРАНИЦА, БЕЗ КОТОРОЙ ЛЕЧЕНИЕ ХУЖЕ БОЛЕЗНИ: «первый шаг после старта»
    // сам по себе даёт брифинг на КАЖДЫЙ перезапуск. 03.09 их было три за шесть часов —
    // столько же брифингов подряд, и они превратились бы в шум ровно тем способом,
    // каким ежедневная тревога превращает сторожа в мебель. Поэтому рядом стоит предел
    // по времени: не чаще раза в `welcomeInterval` на сессию. Отметка живёт НА ДИСКЕ —
    // в памяти процесса её держать нельзя, перезапуск и есть тот случай, который она
    // должна пережить.
    if (config.welcomeEnabled && !welcomeDano.has(sid)) {
      welcomeDano.add(sid)
      const proshlo = Date.now() - welcomeKogdaBylo(config, sid)
      if (proshlo < config.welcomeInterval) {
        say(`welcome пропущен: прошлый брифинг был ${Math.round(proshlo / 3600000)} ч назад, ` +
            `предел ${Math.round(config.welcomeInterval / 3600000)} ч (сессия ${sid}). ` +
            'Это не отказ: брифинг раз в сутки, чтобы не стать шумом.')
        return decision
      }
      welcomeOtmetit(config, sid)
      const records = await readRecords(ctx)
      if (!records) return decision
      // 🔴 БЮДЖЕТ ЗОВЁТСЯ ЗДЕСЬ И НЕ ЗОВЁТСЯ В СЛОЕ B — это решение, а не пропуск.
      // В C записей много, и выбор «что поднять под предел» осмыслен. В B запись
      // ровно одна — сводка компакта, ради которой слой и существует; отбросить
      // её по бюджету значило бы отменить сам слой, а не сэкономить.
      //
      // Служба НЕОБЯЗАТЕЛЬНАЯ: без неё брифинг строится как раньше. Но отсутствие
      // НАЗЫВАЕТСЯ вслух — иначе «бюджет не применён» неотличимо от «применён и
      // ничего не отбросил», и через месяц никто не скажет, работает ли предел.
      // Крик здесь редкий по устройству: welcome бывает раз в сессию.
      const otobrannye = otobratPodPredel(ctx, records)
      const briefing = renderWelcome(otobrannye, config)
      if (briefing) {
        say(`welcome-брифинг вставлен: ${briefing.split('\n').length - 1} записей, ${briefing.length} знаков`)
        return inject(briefing)
      }
    }

    return decision
  }, { prepend: true })
}
  // Кому брифинг уже дан В ЭТОМ ПРОЦЕССЕ. Отдельно от дисковой отметки: диск помнит
  // «когда давали вообще», а это множество — «не давать дважды за один подъём».
  const welcomeDano = new Set()

  /** Когда брифинг давался этой сессии в прошлый раз. 0 — не давался никогда. */
  function welcomeKogdaBylo (cfg, sid) {
    try {
      const d = JSON.parse(readFileSync(cfg.welcomeOtmetki, 'utf-8'))
      const t = Number(d?.[sid])
      return Number.isFinite(t) ? t : 0
    } catch {
      // Файла нет или он нечитаем — это «не давался», а не беда: первый брифинг
      // после заведения механизма должен состояться, а не быть пропущен молча.
      return 0
    }
  }

  /** Отметить, что брифинг дан. Отказ записи НЕ отменяет брифинг, но НЕ молчит. */
  function welcomeOtmetit (cfg, sid) {
    let d = {}
    try { d = JSON.parse(readFileSync(cfg.welcomeOtmetki, 'utf-8')) } catch { d = {} }
    d[sid] = Date.now()
    try {
      mkdirSync(dirname(cfg.welcomeOtmetki), { recursive: true })
      writeFileSync(cfg.welcomeOtmetki, JSON.stringify(d, null, 2) + '\n')
    } catch (e) {
      say(`отметка о брифинге НЕ сохранена (${e?.message ?? e}) — следующий подъём ` +
          'даст брифинг снова, предел частоты в этот раз не сработает')
    }
  }

