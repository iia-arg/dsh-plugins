import Schema from '@deepseek-ai/schemastery'
import { execFileSync } from 'node:child_process'
import { vidKonca, rashod, dlitelnost } from './vidy-szhatiya.js'

export const name = 'dsh-pamyat-storozha'
export const inject = []

export const Config = Schema.object({
  /** Куда, кроме журнала, отдавать оповещение. Пусто — только журнал. */
  komandaStoka: Schema.string().default(''),
  /** Ступени тревоги по заполнению. Нудж держит свою (0.8) отдельно и независимо. */
  stupeni: Schema.array(Schema.number()).default([0.85, 0.9]),
  /** Предел контекста в токенах. 0 — доля не считается, и это ГОВОРИТСЯ. */
  predel: Schema.number().default(0),
})

export function apply(ctx, config) {
  const krik = (s) => ctx.logger?.info?.(`[${name}] ${s}`) ?? console.log(`[${name}] ${s}`)

  krik(`подъём: ступени ${JSON.stringify(config.stupeni)} · предел ${config.predel} ток.`
     + ` · сток ${config.komandaStoka ? 'задан' : 'НЕ задан (только журнал)'}`)

  // 🔴 ОДНО ОПОВЕЩЕНИЕ ПОВЕРХ, А НЕ ПО СЛУШАТЕЛЮ НА СОБЫТИЕ. Замер до кода: событий
  // сжатия на этом узле слушают уже ЧЕТЫРЕ пакета (бюджет, нудж, восстановление,
  // секретарь). Пятый слушатель, кричащий своё, дал бы на одно сжатие пять сообщений —
  // и первый же шумный день научит их не читать.
  const nachala = new Map()   // compactionId → { ms, seq }
  const svodki = new Map()    // compactionId → data события summary

  ctx.on('session/event', (session, event) => {
    const t = event?.type
    if (t !== 'compaction/start' && t !== 'compaction/summary'
        && t !== 'compaction/end' && t !== 'compaction/prune') return

    const id = event?.data?.compactionId ?? null
    const ms = typeof event?.timestamp === 'number' ? event.timestamp
             : (Date.parse(event?.timestamp ?? '') || null)

    if (t === 'compaction/start') { if (id) nachala.set(id, { ms }); return }
    if (t === 'compaction/summary') { if (id) svodki.set(id, event.data); return }

    // 🔴 ОБРЕЗКА — ОТДЕЛЬНЫЙ ВИД, А НЕ «СЖАТИЕ ПОДЕШЕВЛЕ». У неё нет ни модели, ни
    // расхода: замена идёт без вызова. Складывать её со сводочными в одно число
    // «сжатий было N» значит сложить несравнимое.
    if (t === 'compaction/prune') {
      otdat(krik, config, `ОБРЕЗКА без модели: вытеснено ${event.data?.shadowedTokenCount ?? '?'} ток.`
        + ` · узлов ${event.data?.shadowedSeqs?.length ?? '?'} · расхода нет ПО ПРИРОДЕ (модель не звалась)`)
      return
    }

    // compaction/end
    const vid = vidKonca(event.data)
    if (vid === 'proval') {
      otdat(krik, config, `🔴 ПОПЫТКА СЖАТИЯ ПРОВАЛИЛАСЬ: ${event.data?.error}`
        + ` · история НЕ урезана, сводки нет · id ${id ?? '?'}`)
      nachala.delete(id); svodki.delete(id)
      return
    }

    const svodka = svodki.get(id)
    const r = rashod(svodka?.usage)
    const d = dlitelnost(nachala.get(id)?.ms, ms)

    otdat(krik, config,
      `сжатие ${vid === 'prinuditelnoe' ? 'ПРИНУДИТЕЛЬНОЕ (команда человека)' : 'естественное'}`
      + ` · вытеснено ${svodka?.shadowedTokenCount ?? 'неизвестно'} ток.`
      + ` · расход ${r.est ? r.vsego + ' ток.' : 'НЕ СООБЩЁН (это не ноль)'}`
      + ` · модель ${svodka?.model ?? 'не названа'}`
      + ` · длительность ${d === null ? 'не измерима (нет метки начала)' : (d / 1000).toFixed(1) + ' с'
          + ' — между ЗАПИСЯМИ В ЖУРНАЛ, не работа модели'}`)

    nachala.delete(id); svodki.delete(id)
  })

  // ── ВТОРАЯ СТУПЕНЬ ЗАПОЛНЕНИЯ ──────────────────────────────────────────────
  // 🔴 ПОЧЕМУ НЕ ЕДИНЫЙ СЧЁТЧИК С НУДЖЕМ. Нудж считает расход своей рукой и держит
  // свою долю (0.8). Второй счётчик неизбежно разойдётся с первым, и разойдётся
  // МОЛЧА. Поэтому здесь не «правильное число», а ВТОРАЯ ПАРА ГЛАЗ: своё число, своё
  // имя в строке, и прямо сказано, что оно независимо и может не совпасть.
  let vzyato = 0
  const otdannye = new Set()
  const uchest = (usage) => {
    const r = rashod(usage)
    if (!r.est) return
    vzyato = r.vsego
    if (!config.predel) return
    const dolya = vzyato / config.predel
    for (const st of config.stupeni) {
      if (dolya >= st && !otdannye.has(st)) {
        otdannye.add(st)
        otdat(krik, config, `🔴 ЗАПОЛНЕНИЕ ${(dolya * 100).toFixed(0)}% — ступень ${st * 100}%`
          + ` (${vzyato} из ${config.predel} ток.) · счёт СВОЙ, с нуджем не сверяется`)
      }
    }
  }
  ctx.on('session/event', (_s, event) => {
    if (event?.type === 'compaction/summary') { otdannye.clear(); vzyato = 0; return }
    uchest(event?.data?.usage)
  })

  return { uchest, sostoyanie: () => ({ vzyato, stupeniOtdany: [...otdannye] }) }
}

/**
 * Отдать сообщение: всегда в журнал, дополнительно — во внешний сток.
 * 🔴 СТОК НЕОБЯЗАТЕЛЕН И ВЫКЛЮЧЕН ПО УМОЛЧАНИЮ. Адресат оповещения в задании не
 * назван, а угадывать его — значит зашить в пакет чужую раскладку. Пока команда не
 * задана, сторож пишет в журнал и ГОВОРИТ об этом при подъёме, а не молчит.
 */
function otdat(krik, config, tekst) {
  krik(tekst)
  if (!config.komandaStoka) return
  try {
    execFileSync('/bin/sh', ['-c', config.komandaStoka], { input: tekst, timeout: 5000 })
  } catch (e) {
    // 🔴 ОТКАЗ СТОКА НЕ ГЛУШИТ ОПОВЕЩЕНИЕ: в журнал оно уже ушло выше. Кричим о самом
    // отказе — молчаливо потерянный сток неотличим от «тревог не было».
    krik(`🔴 сток не сработал (${e?.message ?? e}) — сообщение осталось только в журнале`)
  }
}
