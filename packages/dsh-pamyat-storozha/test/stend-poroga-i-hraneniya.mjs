/**
 * RU: Стенд ступеней от порога сжатия и хранения отданных ступеней на диске: ступени считаются от готового
 *     порога из файла порогов агента (D), текст — в единицах владельца, отданные ступени переживают перезапуск
 *     и сбрасываются рубежом сжатия.
 *     Каждый сценарий — ОТДЕЛЬНЫЙ процесс (режим «rabochij» этого же файла): пакет монтируется один раз на
 *     процесс, второй apply в том же процессе молча пропускается — прогон в одном процессе ослеп бы после
 *     первого сценария.
 *     Предмет: ../src/index.js или путь из STEND_SRC (для порчи); сумма предмета печатается в начале прогона,
 *     чтобы было видно, что порча внесена.
 *     Запуск: node test/stend-poroga-i-hraneniya.mjs; код 0 — всё зелёное, 1 — красные.
 * EN: Stand for stages measured from the compaction threshold and for storing reported stages on disk: stages
 *     are computed from the ready threshold in the agent's threshold file (D), the text is in the owner's
 *     units, reported stages survive a restart and are reset by a compaction boundary.
 *     Each scenario is a SEPARATE process (the "rabochij" mode of this same file): the package mounts once per
 *     process, a second apply in the same process is silently skipped — a run in one process would go blind
 *     after the first scenario.
 *     Subject: ../src/index.js or the path from STEND_SRC (for deliberate breakage); the subject's checksum is
 *     printed at the start so it is visible that the breakage was applied.
 *     Run: node test/stend-poroga-i-hraneniya.mjs; exit 0 — all green, 1 — red.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
// RU: Временные каталоги стенда убираются на ЛЮБОМ выходе — обычном, падении пробы, process.exit,
//     SIGTERM/SIGINT (обходчик гоняет стенды под timeout). Каждый mkdtemp стенда — через vremennyj().
//     От SIGKILL не спасает ничто; временное, созданное дочерним процессом, — забота того процесса.
// EN: The stand's temporary directories are removed on ANY exit — normal, probe failure, process.exit,
//     SIGTERM/SIGINT (the runner drives stands under timeout). Every mkdtemp of the stand goes through
//     vremennyj().
//     Nothing protects against SIGKILL; temporary files created by a child process are that process's
//     responsibility.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

const SEBYA = fileURLToPath(import.meta.url)
// RU: Раскладка профиля как у DSH 0.2: пресет вложен в профиль (блок «- id: preset-proba»), отдельного каталога
//     пресетов нет. null — строки доли нет вовсе. Сам предмет профиль НЕ читает — доля берётся только из
//     готового файла порогов D (gotovyD); профиль нужен, чтобы показать, что он на исход не влияет.
// EN: Profile layout as in DSH 0.2: the preset is nested in the profile (a "- id: preset-proba" block), there
//     is no separate preset directory. null — no ratio line at all. The subject does NOT read the profile — the
//     ratio comes only from the ready threshold file D (gotovyD); the profile is there to show it has no effect
//     on the outcome.
const profilA = (dolyaProfilya, dolyaPreseta) => (dolyaProfilya === null ? `x:\n  drugoe: 1\n` : `x:\n  thresholdRatio: ${dolyaProfilya}\n`)
  + `- insert:\n    - id: preset-proba\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n`
  + (dolyaPreseta === null ? `        drugoe: 1\n` : `        thresholdRatio: ${dolyaPreseta}\n`)
const gotovyD = ratio => JSON.stringify({porogi: ratio === null ? null : {schema:1, defaultRoute:{provider:'p',model:'m'}, routes:[{provider:'p',model:'m',window:1000000,ratio,nominalThreshold:({'0.89':890000,'0.95':950000})[ratio]}]}})
if (process.argv[2] === 'rabochij') {
  const [, , , src, shagiJson] = process.argv
  const { apply, Config } = await import(src)
  const stroki = [], sl = []
  const ctx = { logger: { info: (s) => stroki.push(s) }, on: (n, f) => { if (n === 'session/event') sl.push(f); return () => {} } }
  apply(ctx, new Config({ stupeni: [0.85, 0.9], agent: 'proba', komandaStoka: `cat >> ${process.env.STOK}; echo >> ${process.env.STOK}` }))
  const ses = (id) => ({ id, requestContext: () => ({ provider: 'p', model: 'm', contextWindow: 1000000 }) })
  let t = 0
  for (const sh of JSON.parse(shagiJson)) {
    if (sh.dolya) writeFileSync(join(process.env.KOMPAKT_NASTROJKI_KATALOG, "proba.json"), gotovyD(sh.dolya))
    else if (sh.szhatie) sl.forEach((f) => f(ses(sh.s ?? 's1'), { type: 'compaction/summary', seq: ++t, time: t, data: {} }))
    else sl.forEach((f) => f(ses(sh.s ?? 's1'), { type: 'assistant/message', seq: ++t, time: t, data: { usage: { inputTokens: sh.v } } }))
  }
  // 08.10.2026: подробная строка ступени — в ЖУРНАЛЕ (владельцу в сток уходит короткая); пробы ниже читают журнал.
  appendFileSync(process.env.ZHURNAL, stroki.filter((x) => x.includes('ЗАПОЛНЕНИЕ')).map((x) => x + '\n').join(''))
  console.log(JSON.stringify({ podyom: stroki.find((x) => x.includes('подъём: ступени')) ?? '' }))
  process.exitCode = 0
}

else {

const SRC = process.env.STEND_SRC || join(dirname(SEBYA), '..', 'src', 'index.js')
console.log('предмет:', SRC, createHash('sha256').update(readFileSync(SRC)).digest('hex').slice(0, 8))
let vsego = 0, bed = 0
const proba = (imya, ok, pochemu) => { vsego++; if (ok) console.log(`✅ ${imya}`); else { bed++; console.log(`❌ ${imya}: ${pochemu}`) } }

function stend(dolyaProfilya, dolyaPreseta) {
  const d = vremennyj(join(tmpdir(), 'stend-poroga-'))
  mkdirSync(join(d, 'profiles', 'web'), { recursive: true }); mkdirSync(join(d, 'storages'))
  const PROFIL = join(d, 'profiles', 'web', 'cordis.patch.yml')
  writeFileSync(PROFIL, profilA(dolyaProfilya, dolyaPreseta))
  writeFileSync(join(d, "proba.json"), gotovyD(dolyaPreseta))
  const STOK = join(d, 'stok.log'), ZHURNAL = join(d, 'zhurnal.log')
  const zapusk = (shagi) => {
    const r = spawnSync(process.execPath, [SEBYA, 'rabochij', SRC, JSON.stringify(shagi)],
      { env: { ...process.env, DSH_HOME: d, KOMPAKT_AGENT: 'proba', KOMPAKT_NASTROJKI_KATALOG: d, STOROZHA_STUPENI_FAJL: '', PROFIL, STOK, ZHURNAL }, encoding: 'utf8' })
    if (r.status !== 0) throw new Error('рабочий упал: ' + r.stderr)
    return JSON.parse(r.stdout.trim().split('\n').pop())
  }
  const stok = () => existsSync(ZHURNAL) ? readFileSync(ZHURNAL, 'utf8').split('\n').filter((l) => l.includes('ЗАПОЛНЕНИЕ')) : []
  const vladelcu = () => existsSync(STOK) ? readFileSync(STOK, 'utf8').split('\n').filter((l) => l.includes('контекст')) : []
  return { d, zapusk, stok, vladelcu, ubrat: () => rmSync(d, { recursive: true, force: true }) }
}

{ const s = stend(0.89, 0.89)
  const p = s.zapusk([{ v: 800000 }])
  let k = s.stok()
  proba('подъём называет порог и хранение', /ОТ ПОРОГА СЖАТИЯ .*сейчас 0\.89\).*storozha-stupeni\.json/.test(p.podyom), p.podyom)
  proba('800 000 при пороге 890 000 ⇒ 🟡 «89,9% номинального порога 890 000 (request) (80,0% окна; по ответу модели)», не 🟠',
    k.length === 1 && k[0].includes('🟡 ЗАПОЛНЕНИЕ 89,9% номинального порога 890 000 (request) (80,0% окна; по ответу модели) — перешагнул 85% (756 500)'), k.join(' ¦ '))
  s.zapusk([{ v: 802000 }]); k = s.stok()
  proba('802 000 (новый процесс, то же хранилище) ⇒ 🟠 90% (801 000), 🟡 не повторён',
    k.length === 2 && k[1].includes('🟠 ЗАПОЛНЕНИЕ 90,1% номинального порога 890 000') && k[1].includes('перешагнул 90% (801 000)'), k.join(' ¦ '))
  s.zapusk([{ v: 810000 }]); k = s.stok()
  proba('подъём (третий процесс) на 810 000 НЕ кричит повторно', k.length === 2, k.join(' ¦ '))
  const v = s.vladelcu()
  proba('владельцу — короткие строки: «🟡 proba: контекст 89% порога (800 тыс. из 890 тыс.)», «🟠 proba: контекст 90% порога (802 тыс. из 890 тыс.)»',
    v.length === 2 && v[0] === '🟡 proba: контекст 89% порога (800 тыс. из 890 тыс.)' && v[1] === '🟠 proba: контекст 90% порога (802 тыс. из 890 тыс.)', v.join(' ¦ '))
  s.zapusk([{ szhatie: true }, { v: 800000 }]); k = s.stok()
  proba('после compaction/summary сессии — 🟡 снова (рубеж сжатия)', k.length === 3 && k[2].includes('агент proba · 🟡')   /* журнал несёт метку «[пакет версия]» */, k.join(' ¦ '))
  const h = JSON.parse(readFileSync(join(s.d, 'storages', 'storozha-stupeni.json'), 'utf8'))
  proba('хранилище: v=1, у s1 отдано [0.85], рубеж записан', h.v === 1 && JSON.stringify(h.sessii.s1.otdany) === '[0.85]' && h.sessii.s1.rubezh != null, JSON.stringify(h))
  s.ubrat() }

{ const s = stend(0.89, 0.89)
  s.zapusk([{ v: 800000 }, { v: 300000 }, { v: 800000 }]); const k = s.stok()
  proba('запасной сброс: доля упала ниже ступени на 0,10 (сжатие мимо модуля) ⇒ 🟡 снова', k.length === 2 && k.every((x) => x.includes('🟡')), k.join(' ¦ '))
  s.ubrat() }

{ const s = stend(0.89, 0.89)
  s.zapusk([{ v: 780000 }, { dolya: 0.95 }, { v: 820000, s: 's2' }]); const k = s.stok()
  proba('порог сдвинут настройкой между замерами ⇒ следующий замер от НОВОГО (номинального порога 950 000)',
    k.length === 2 && k[0].includes('номинального порога 890 000') && k[1].includes('86,3% номинального порога 950 000') && k[1].includes('(807 500)'), k.join(' ¦ '))
  s.ubrat() }

// RU: Доля — только из готового файла порогов D; строка доли в профиле не читается вовсе.
// EN: The ratio comes only from the ready threshold file D; the ratio line in the profile is not read at all.
{ const s = stend(null, 0.89)
  s.zapusk([{ v: 780000 }]); const k = s.stok()
  proba('профиль БЕЗ строки доли ⇒ готовый порог D (890 000)', k.length === 1 && k[0].includes('87,6% номинального порога 890 000')
    && !k[0].includes('НЕ ПРОЧИТАН'), k.join(' ¦ '))
  s.ubrat() }

{ const s = stend(0.9, 0.89)
  s.zapusk([{ v: 780000 }]); const k = s.stok()
  proba('доля профиля ≠ D ⇒ профиль НЕ читается, готовый порог D (890 000)', k.length === 1 && k[0].includes('87,6% номинального порога 890 000')
    && !k[0].includes('НЕ ПРОЧИТАН'), k.join(' ¦ '))
  s.ubrat() }

{ const s = stend(0.89, null)
  const p = s.zapusk([{ v: 860000 }]); const k = s.stok()
  proba('D БЕЗ porogi ⇒ от ОКНА с пометкой и причиной', k.length === 1 && k[0].includes('🟡 ЗАПОЛНЕНИЕ 86,0% ОКНА 1 000 000')
    && k[0].includes('⚠️ порог сжатия НЕ ПРОЧИТАН (') && k[0].includes('неизвестная schema porogi') && k[0].includes('считаю от окна'), k.join(' ¦ '))
  proba('подъём называет непрочитанный порог', p.podyom.includes('НЕ ПРОЧИТАНА'), p.podyom)
  s.ubrat() }

// RU: Потребитель больше не разбирает ни профиль, ни старый пресет: получает только D.
// EN: The consumer no longer parses either the profile or the old preset: it receives only D.
{ const s = stend(0.89, 0.89)
  mkdirSync(join(s.d, '.agent-presets', 'proba'), { recursive: true }); writeFileSync(join(s.d, '.agent-presets', 'proba', 'agent.cordis.yml'), `thresholdRatio: 0.5\n`)
  s.zapusk([{ v: 860000 }]); const k = s.stok()
  proba('подложенный старый пресет НЕ влияет на готовый D', k.length === 1 && k[0].includes('номинального порога 890 000') && !k[0].includes('НЕ ПРОЧИТАН'), k.join(' ¦ '))
  s.ubrat() }

console.log(`итог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)

}
