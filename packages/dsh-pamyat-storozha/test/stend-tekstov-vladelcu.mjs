/**
 * RU: Стенд строк ВЛАДЕЛЬЦУ (сток): заполнение и сжатие одной короткой строкой, имя по-человечески, «до → после» у сжатия,
 *     настройка trevogaSzhatiya; полная строка остаётся в журнале (08.10.2026, Аврора; слово владельца 23:34/23:51/00:08 МСК).
 *     Каждый сценарий — отдельный процесс (пакет монтируется раз на процесс). Предмет: ../src/index.js или STEND_SRC (порча);
 *     сумма предмета печатается. Код 0 — всё зелёное, 1 — красные.
 * EN: Stand for the OWNER lines (sink): fill and compaction as one short line, a human name, "before → after" for a compaction,
 *     the trevogaSzhatiya setting; the full line stays in the log. Each scenario is a separate process. Subject: ../src/index.js
 *     or STEND_SRC (breakage); the subject checksum is printed. Exit 0 — all green, 1 — red.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const VREMENNYE = []
process.on('exit', () => { for (const k of VREMENNYE) rmSync(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
const SEBYA = fileURLToPath(import.meta.url)

if (process.argv[2] === 'rabochij') {
  const [, , , src, nastrojkaJson, shagiJson] = process.argv
  const { apply, Config } = await import(src)
  const stroki = [], sl = []
  const ctx = { logger: { info: (s) => stroki.push(s) }, on: (n, f) => { if (n === 'session/event') sl.push(f); return () => {} } }
  apply(ctx, new Config({ stupeni: [0.85, 0.9], komandaStoka: `cat >> ${process.env.STOK}; echo >> ${process.env.STOK}`, ...JSON.parse(nastrojkaJson) }))
  const ses = { id: 's1', requestContext: () => ({ provider: 'p', model: 'm', contextWindow: 1000000 }) }
  const t0 = Date.now(); let seq = 0
  const dat = (type, data, sdvig = 0) => sl.forEach((f) => f(ses, { type, seq: ++seq, time: t0 + sdvig, data }))
  for (const sh of JSON.parse(shagiJson)) {
    if (sh.v) dat('assistant/message', { usage: { inputTokens: sh.v } })
    else if (sh.start) dat('compaction/start', { compactionId: 'c1' }, 0)
    else if (sh.svodka) dat('compaction/summary', { compactionId: 'c1', summary: [{ text: 'x'.repeat(sh.svodka) }], model: 'deepseek-flash', provider: 'p', shadowedTokenCount: 24853 }, 1000)
    else if (sh.end) dat('compaction/end', { compactionId: 'c1', ...(sh.ruka ? { sourceCommandId: 'cmd-1' } : {}), ...(sh.oshibka ? { error: sh.oshibka } : {}) }, 20000)
    else if (sh.zhdat) await new Promise((r) => setTimeout(r, sh.zhdat))
  }
  appendFileSync(process.env.ZHURNAL, stroki.map((x) => x + '\n').join(''))
  process.exitCode = 0
}

else {

const SRC = process.env.STEND_SRC || join(dirname(SEBYA), '..', 'src', 'index.js')
console.log('предмет:', SRC, createHash('sha256').update(readFileSync(SRC)).digest('hex').slice(0, 8))
let vsego = 0, bed = 0
const proba = (imya, ok, pochemu) => { vsego++; if (ok) console.log(`✅ ${imya}`); else { bed++; console.log(`❌ ${imya}: ${pochemu}`) } }
const vse = []
function zapusk(nastrojka, shagi) {
  const d = mkdtempSync(join(tmpdir(), 'stend-tekstov-')); VREMENNYE.push(d)
  const STOK = join(d, 'stok.log'), ZHURNAL = join(d, 'zhurnal.log')
  const r = spawnSync(process.execPath, [SEBYA, 'rabochij', SRC, JSON.stringify(nastrojka), JSON.stringify(shagi)],
    { env: { ...process.env, DSH_HOME: d, KOMPAKT_AGENT: 'proba', KOMPAKT_NASTROJKI_KATALOG: d, STOROZHA_STUPENI_FAJL: '',
             STOROZHA_ZHDAT_POSLE_MS: '300', STOK, ZHURNAL }, encoding: 'utf8' })
  if (r.status !== 0) throw new Error('рабочий упал: ' + r.stderr)
  const stok = existsSync(STOK) ? readFileSync(STOK, 'utf8').split('\n').filter(Boolean) : []
  vse.push(...stok)
  return { stok, zhurnal: existsSync(ZHURNAL) ? readFileSync(ZHURNAL, 'utf8') : '' }
}
const SZHATIE = [{ v: 742000 }, { start: 1 }, { svodka: 9024 }, { end: 1 }]

let r = zapusk({ agent: 'zarya' }, [...SZHATIE, { v: 27000 }])
proba('Т1 сжатие → одна строка «🗜 Заря: сжатие 742 → 27 тыс. · сводка 9 тыс. зн. · 20 с · deepseek-flash»',
  r.stok.length === 1 && r.stok[0] === '🗜 Заря: сжатие 742 → 27 тыс. · сводка 9 тыс. зн. · 20 с · deepseek-flash', r.stok.join(' ¦ '))
proba('Т1 журнал — полная строка, как прежде (вытеснено, id, маршрут)', /агент zarya · сжатие естественное · вытеснено 24853 ток\..*· id c1 · маршрут сейчас/.test(r.zhurnal), r.zhurnal.slice(0, 300))
r = zapusk({ agent: 'zarya' }, [...SZHATIE, { zhdat: 700 }])
proba('Т2 замера «после» нет за срок → «🗜 Заря: сжатие с 742 тыс. · сводка 9 тыс. зн. · 20 с · deepseek-flash»',
  r.stok.length === 1 && r.stok[0] === '🗜 Заря: сжатие с 742 тыс. · сводка 9 тыс. зн. · 20 с · deepseek-flash', r.stok.join(' ¦ '))
r = zapusk({ agent: 'zarya' }, [{ v: 742000 }, { start: 1 }, { svodka: 9024 }, { end: 1, ruka: 1 }, { v: 27000 }])
proba('Т3 по команде → «🗜 Заря: сжатие по команде 742 → 27 тыс. · …»', r.stok.length === 1 && r.stok[0].startsWith('🗜 Заря: сжатие по команде 742 → 27 тыс. · '), r.stok.join(' ¦ '))
r = zapusk({ agent: 'zarya', trevogaSzhatiya: false }, [...SZHATIE, { v: 27000 }])
proba('Т4 trevogaSzhatiya=false → владельцу ничего, журнал как прежде', r.stok.length === 0 && r.zhurnal.includes('сжатие естественное'), r.stok.join(' ¦ '))
r = zapusk({ agent: 'zarya', trevogaSzhatiya: false }, [{ v: 742000 }, { start: 1 }, { end: 1, oshibka: 'summary is not smaller' }])
proba('Т5 провал сжатия говорится ВСЕГДА (и при trevogaSzhatiya=false)', r.stok.length === 1 && r.stok[0].includes('ПОПЫТКА СЖАТИЯ ПРОВАЛИЛАСЬ: summary is not smaller'), r.stok.join(' ¦ '))
r = zapusk({ agent: 'zarya' }, [{ v: 950000 }])
proba('Т6 85 и 90 одним скачком → одна строка старшей ступени «🟠 Заря: контекст 95% окна (порог сжатия не прочитан) (950 тыс. из 1 млн)»',
  r.stok.length === 1 && r.stok[0] === '🟠 Заря: контекст 95% окна (порог сжатия не прочитан) (950 тыс. из 1 млн)', r.stok.join(' ¦ '))
proba('Т6 журнал — подробная строка «ЗАПОЛНЕНИЕ … перешагнуты 85% … и 90% … ОДНИМ скачком»', /ЗАПОЛНЕНИЕ 95,0% ОКНА.*перешагнуты 85%.*и 90%.*ОДНИМ скачком/.test(r.zhurnal), r.zhurnal.slice(0, 300))
r = zapusk({ agent: 'novyj-agent' }, [{ v: 870000 }])
proba('Т7 имени нет в таблице → ключ агента «🟡 novyj-agent: контекст 87% …»', r.stok.length === 1 && r.stok[0].startsWith('🟡 novyj-agent: контекст 87% '), r.stok.join(' ¦ '))
proba('Т8 каждая строка владельцу — одна строка, не длиннее 100 знаков, без «агент …», id и служебных оговорок',
  vse.length >= 6 && vse.every((x) => [...x].length <= 100 && !/агент |id c1|маршрут|не обязательно|это не ноль|НЕ наблюдает/.test(x) || x.includes('ПОПЫТКА СЖАТИЯ')),
  vse.map((x) => `${[...x].length}: ${x}`).join(' ¦ '))
console.log('строки владельцу (до/после — в П7):'); for (const x of vse) console.log('   ' + x)
console.log(`итог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)

}
