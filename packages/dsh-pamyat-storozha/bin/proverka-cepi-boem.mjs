#!/usr/bin/env node
// Проверка цепи памяти ПО БОЮ: совпадает ли ВСТАВЛЕННОЕ в сессию с тем, что лежит в базе.
//
// Зачем отдельный прибор. Условие закрытия долга 65 требовало «запись в базе есть» и
// «след restore есть». 03.09.2026 оба признака сошлись, а в контекст ушла ЗАГЛУШКА на
// 120 знаков вместо сводки на 16900: проверка согласованности не отличает годное от
// негодного, она отличает сходящееся от расходящегося. Здесь признак другой —
// СОВПАДАЕТ ЛИ ТЕКСТ: id и длина из следа против id и длины в базе.
//
// Коды: 0 — сошлось · 1 — расхождение · 2 — проверить нечем (слепота).
// Границы: смотрит ПОСЛЕДНЮЮ вставку в окне журнала; о более ранних не говорит ничего.
// Длина сравнивается, а не текст: платформа сам текст в журнал не пишет, и не должна.
// Контроль зрячести встроен ключом --kontrol.
// ГРАНИЦА КОНТРОЛЯ: подставная база создаётся ЭТИМ ЖЕ файлом, схемой zapisi(id,klass,
// soderzhim) — то есть контроль проверяет прибор против МОЕГО представления о схеме.
// Сменит ядро имена полей — контроль останется зелёным. Спасает то, что sqlite падает
// громко («no such column»), проверено 03.09.2026; тихого нуля здесь не будет.
// EN: Checking the memory chain IN PRODUCTION: does what was INSERTED into the session match what lies in the
//     base.
//     Why a separate tool. The closure condition of debt 65 required "the record is in the base" and "the
//     restore trace exists". On 03.09.2026 both signs agreed, yet a 120-character STUB went into the context
//     instead of a 16,900-character summary: a consistency check does not tell good from bad, it tells agreeing
//     from disagreeing. The sign here is different — DOES THE TEXT MATCH: id and length from the trace against
//     id and length in the base.
//     Codes: 0 — matches · 1 — divergence · 2 — nothing to check with (blindness).
//     Limits: it looks at the LAST insertion in the log window; it says nothing about earlier ones. Length is
//     compared, not text: the platform does not write the text itself into the log, and should not.
//     The blindness control is built in as the --kontrol flag.
//     CONTROL LIMIT: the stand-in base is created by THIS same file, with the schema zapisi(id,klass,soderzhim)
//     — so the control checks the tool against MY idea of the schema. If the core renames fields, the control
//     stays green. What saves us is that sqlite fails loudly ("no such column"), verified 03.09.2026; there
//     will be no silent zero here.

import { DatabaseSync } from 'node:sqlite'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

const BAZA = process.env.CEP_BAZA ?? konf('PAMYAT_BAZA')
const OKNO = process.env.CEP_OKNO ?? '-7 days'
const ZHURNAL_FAJL = process.env.CEP_ZHURNAL ?? null   // для контроля: журнал из файла · EN: for the control: the log from a file
const UNIT = konf('CEP_UNIT')   // юнит службы агента, чей журнал читаем · EN: the unit of the agent service whose log we read

let ok = 0, ploho = 0, slepo = 0
const dobro = (s) => { ok++; console.log('  ok   ' + s) }
const hudo  = (s) => { ploho++; console.log('  FAIL ' + s) }
const slep  = (s) => { slepo++; console.log('  СЛЕПОТА ' + s) }

function zhurnal () {
  if (ZHURNAL_FAJL) return execFileSync('cat', [ZHURNAL_FAJL], { encoding: 'utf8' })
  return execFileSync('journalctl', ['-u', UNIT, '--since', OKNO, '--no-pager',
    '-o', 'short-iso'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function proverit () {
  console.log(`область: журнал ${ZHURNAL_FAJL ?? UNIT + ', окно ' + OKNO}` +
              ` · база ${BAZA} · рука ${process.env.USER ?? '?'}`)
  if (!ZHURNAL_FAJL && !UNIT) { slep('юнит службы агента не задан — ключ CEP_UNIT в ' + KONF); return }
  if (!BAZA) { slep('база памяти не задана — CEP_BAZA или ключ PAMYAT_BAZA в ' + KONF); return }

  let tekst
  try { tekst = zhurnal() } catch (e) {
    slep('журнал не прочитан: ' + e.message + ' — это про доступ, а не про цепь'); return
  }

  // след вставки: «... вставлено в сессию <sid>: запись <id>, <N> знаков»
  // EN: insertion trace: "... вставлено в сессию <sid>: запись <id>, <N> знаков"
  const sled = [...tekst.matchAll(
    /^(\S+)?[^\n]*вставлено в сессию (\S+): запись (\S+?), (\d+) знаков/gm)].pop()
  if (!sled) {
    slep('следа вставки в окне нет — компакта не было либо журнал не хранит так далеко')
    return
  }
  const [, vremya, sid, idSled, dlinaSled] = sled

  // 🔴 КРАСНОТА, ПЕРЕЖИВШАЯ ПРИЧИНУ. Прибор берёт ПОСЛЕДНЮЮ вставку в окне журнала. После
  // перезапуска платформы последняя вставка ещё принадлежит ПРЕЖНЕЙ редакции — и прибор
  // будет краснеть за уже вылеченный дефект, пока не случится новый компакт. Через сутки
  // такую красноту объяснят «известной причиной» и перестанут читать: ровно тот класс,
  // от которого мы лечились. Поэтому сравниваем время следа со временем старта службы.
  // ГДЕ НЕ ПРИМЕНЯЕТСЯ: при подменённом журнале (контроль) время берётся из CEP_START.
  // EN: 🔴 REDNESS THAT OUTLIVED ITS CAUSE. The tool takes the LAST insertion in the log window. After a
  //     platform restart the last insertion still belongs to the PREVIOUS edition — and the tool would stay red
  //     for an already cured defect until a new compaction happens. A day later such redness is explained by a
  //     "known cause" and no longer read: exactly the class we were curing. So we compare the trace time with
  //     the service start time.
  //     WHERE IT DOES NOT APPLY: with a substituted log (control) the time is taken from CEP_START.
  const startSyroj = process.env.CEP_START ??
    (() => { try { return execFileSync('systemctl',
        ['show', UNIT, '-p', 'ActiveEnterTimestamp', '--value'],
        { encoding: 'utf8' }).trim() } catch { return '' } })()
  const start = startSyroj ? new Date(startSyroj.replace(/^\w{3} /, '')) : null
  const tSled = vremya ? new Date(vremya) : null
  if (start && !isNaN(start) && tSled && !isNaN(tSled) && tSled < start) {
    console.log(`след от ${tSled.toISOString()} СТАРШЕ старта службы ${start.toISOString()}`)
    slep('вставка относится к ПРЕЖНЕЙ редакции (была до перезапуска) — ' +
         'о нынешней сказать нечего, ждём первого компакта после подъёма')
    return
  }
  console.log(`след: сессия ${sid}, запись ${idSled}, ${dlinaSled} знаков`)

  let d
  try { d = new DatabaseSync(BAZA, { readOnly: true }) } catch (e) {
    slep('база не открылась: ' + e.message); return
  }

  const chislo = /^\d+$/.test(idSled)
  if (!chislo) {
    hudo(`вставлена запись «${idSled}» — это не id из базы: вставлено НЕ ИЗ ПАМЯТИ ` +
         '(заглушка или посторонний источник)')
    return
  }

  // 🔴 ЕДИНИЦА СЧЁТА. restore печатает String(...).length — единицы UTF-16, где символ вне
  // BMP (🔴 и прочие эмодзи) считается ЗА ДВА. sqlite length() считает code points, то есть
  // за один. Сравнение РАЗНЫХ единиц даёт ложное расхождение ровно на число таких символов:
  // 03.09.2026 это дало «в журнале 16720, в базе 16712» на ИСПРАВНОЙ цепи, и красное
  // прочлось бы как подмена текста. Обе длины берём В ОДНОЙ единице — той, которой считает
  // измеряемый, — и единицу НАЗЫВАЕМ вслух: число без единицы непроверяемо.
  // EN: 🔴 UNIT OF COUNT. restore prints String(...).length — UTF-16 units, where a character outside the BMP (🔴
  //     and other emoji) counts AS TWO. sqlite length() counts code points, i.e. as one. Comparing DIFFERENT
  //     units gives a false divergence of exactly the number of such characters: on 03.09.2026 this gave "16720
  //     in the log, 16712 in the base" on a HEALTHY chain, and the red would have been read as text
  //     substitution. We take both lengths IN ONE unit — the one the measured side counts in — and NAME the
  //     unit aloud: a number without a unit cannot be checked.
  const z = d.prepare('select id, klass, soderzhim from zapisi where id = ?')
             .get(Number(idSled))
  if (!z) { hudo(`записи id=${idSled} в базе нет — вставлено не из этой памяти`); return }
  dobro(`запись id=${z.id} в базе есть, класс ${z.klass}`)

  const tekstZ = String(z.soderzhim)
  const edUTF16 = tekstZ.length
  const simvolov = [...tekstZ].length
  if (String(edUTF16) === dlinaSled)
    dobro(`длина совпала: ${edUTF16} единиц UTF-16 (символов ${simvolov}) — вставлено ИМЕННО ТО`)
  else
    hudo(`длина разошлась: в журнале ${dlinaSled}, в базе ${edUTF16} единиц UTF-16 ` +
         `(символов ${simvolov}) — вставлено не то`)

  const svezh = d.prepare(
    "select id, soderzhim from zapisi where klass='svodka-kompakcii' order by id desc limit 1").get()
  if (!svezh) slep('в базе нет ни одной сводки компакции — сравнивать не с чем')
  else if (svezh.id === z.id) dobro('вставлена САМАЯ СВЕЖАЯ сводка компакции')
  else hudo(`вставлена id=${z.id}, а свежайшая сводка id=${svezh.id} ` +
            `(${String(svezh.soderzhim).length} единиц UTF-16)`)
}

// контроль зрячести — тремя подставными случаями
// EN: blindness control — by three stand-in cases
if (process.argv.includes('--kontrol')) {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const kat = mkdtempSync(join(tmpdir(), 'cep.'))
  const bazaP = join(kat, 'proba.db')
  const db = new DatabaseSync(bazaP)
  db.exec('create table zapisi (id integer primary key, klass text, soderzhim text)')
  // 🔴 Подставная запись ОБЯЗАНА содержать символ вне BMP: на чистом ASCII обе единицы
  // счёта совпадают, и контроль зелен при негодном приборе. Ровно так он и пропустил
  // дефект единиц 03.09.2026 — гонял 'x'.repeat(500). 498 букв + 🔴 = 499 символов,
  // 500 единиц UTF-16; след ниже называет 500, то есть единицу измеряемого.
  // EN: 🔴 The stand-in record MUST contain a character outside the BMP: on pure ASCII both units of count
  //     coincide, and the control is green with a broken tool. That is exactly how it missed the units defect
  //     on 03.09.2026 — it ran 'x'.repeat(500). 498 letters + 🔴 = 499 characters, 500 UTF-16 units; the trace
  //     below says 500, i.e. the unit of the measured side.
  db.prepare('insert into zapisi (id,klass,soderzhim) values (?,?,?)')
    .run(7, 'svodka-kompakcii', 'x'.repeat(498) + '\u{1F534}')
  db.close()
  const sluchai = [
    ['вставлено то же', 'вставлено в сессию s: запись 7, 500 знаков', 0],
    ['вставлена заглушка', 'вставлено в сессию s: запись z4, 120 знаков', 1],
    ['длина разошлась', 'вставлено в сессию s: запись 7, 120 знаков', 1],
    ['следа нет вовсе', 'ничего похожего', 2],
    // ветка «краснота, пережившая причину»: след СТАРШЕ старта службы
    // EN: branch "redness that outlived its cause": the trace is OLDER than the service start
    ['след старше старта — прежняя редакция',
     '2026-09-03T06:01:40+00:00 host node[1]: вставлено в сессию s: запись z4, 120 знаков', 2],
    // и обратное: след МОЛОЖЕ старта — судим как обычно, ветка не должна глушить
    // EN: and the reverse: the trace is YOUNGER than the start — judge as usual, the branch must not mute it
    ['след моложе старта — судим как обычно',
     '2026-09-03T07:00:00+00:00 host node[1]: вставлено в сессию s: запись z4, 120 знаков', 1],
  ]
  let bed = 0
  for (const [imya, stroka, zhdyom] of sluchai) {
    const zh = join(kat, 'zh.txt'); writeFileSync(zh, stroka + '\n')
    const child = spawnSync(process.execPath, [process.argv[1]], {
      env: { ...process.env, CEP_BAZA: bazaP, CEP_ZHURNAL: zh, CEP_START: 'Thu 2026-09-03 06:15:57 UTC' },
      stdio: 'ignore', timeout: 30000,
    })
    const bylo = child.status ?? 2
    if (bylo === zhdyom) console.log(`  ok   ${imya}: код ${bylo}`)
    else { console.log(`  FAIL ${imya}: ждали ${zhdyom}, получили ${bylo}`); bed++ }
  }
  rmSync(kat, { recursive: true, force: true })
  // число случаев берётся из САМОГО перечня: зашитое число — перечень из одного элемента,
  // он расходится с предметом при первом же добавлении, и расходится молча.
  // EN: the number of cases is taken from the list ITSELF: a hard-coded number is a list of one element, it
  //     diverges from the subject at the first addition, and diverges silently.
  console.log(bed ? `КОНТРОЛЬ НЕ ПРОЙДЕН: ${bed} из ${sluchai.length}`
                  : `контроль зрячести: ПРОЙДЕН (${sluchai.length} случаев)`)
  process.exit(bed ? 1 : 0)
}

proverit()
console.log('ИТОГ (сравниваю СЛЕД ВСТАВКИ из журнала с ЗАПИСЬЮ в базе; с прошлым прогоном не сравниваю):')
console.log(`  сошлось ${ok}, расхождений ${ploho}, слепота ${slepo}`)
process.exit(ploho ? 1 : (slepo ? 2 : 0))
