/**
 * RU: stend-svodki-po-taktu — печатается ли сводка сторожа БЕЗ единого сжатия.
 *     Зачем. pechatSvodki звалась только из разбора событий сжатия. При нуле сжатий сводка не печаталась
 *     НИКОГДА: «за час 11 ходов · 0 сжатий · 0 строк» читалось как «всё тихо», а означало «сторож молчал».
 *     Молчание неотличимо от исправности — ровно в том случае, ради которого сторож заведён.
 *     Что проверяет: правило такта ходов, а не время. Первая сводка — на первом turn/end после подъёма; дальше
 *     каждый N-й (N = 10). Порча «снять вызов» обязана дать ТИШИНУ.
 *     Граница: стенд проверяет КОПИЮ правила (функция takt ниже), а не код src/index.js — правка такта в модуле
 *     этот стенд не покраснит. Подключённость правила к событию turn/end в модуле проверяет
 *     stend-primenimosti-prune.mjs (сводка после одного turn/end).
 *     Запуск: node test/stend-svodki-po-taktu.mjs; код 0 — всё зелёное, 1 — красные, 2 — канарейка.
 * EN: stend-svodki-po-taktu — is the guard summary printed WITHOUT a single compaction.
 *     Why. pechatSvodki was called only from compaction event handling. With zero compactions the summary was
 *     NEVER printed: "11 turns in an hour · 0 compactions · 0 lines" read as "all quiet" but meant "the guard
 *     was silent". Silence is indistinguishable from health — exactly the case the guard exists for.
 *     What it checks: the turn-cadence rule, not time. The first summary on the first turn/end after start-up;
 *     then every N-th (N = 10). Breaking it by "removing the call" must give SILENCE.
 *     Boundary: the stand checks a COPY of the rule (function takt below), not the code in src/index.js — a
 *     change of the cadence in the module will not turn this stand red. That the rule is wired to the turn/end
 *     event in the module is checked by stend-primenimosti-prune.mjs (a summary after one turn/end).
 *     Run: node test/stend-svodki-po-taktu.mjs; exit 0 — all green, 1 — red, 2 — canary.
 */
let vsego = 0, bed = 0
const proba = (imya, telo) => {
  vsego += 1
  const r = telo()
  if (r === true) console.log(`✅ ${imya}`)
  else { bed += 1; console.log(`❌ ${imya}: ${r}`) }
}

// RU: Копия логики такта из src/index.js: проверяем ПРАВИЛО, а не подключение плагина — поднимать cordis в
//     стенде значило бы мерить платформу, а не свою ветку. Цена названа в шапке: копия может разойтись с
//     модулем молча.
// EN: A copy of the cadence logic from src/index.js: we check the RULE, not plugin wiring — bringing up cordis
//     in the stand would measure the platform, not our branch. The price is named in the header: the copy may
//     silently diverge from the module.
function takt({ hodov, porcha_snyat_vyzov = false, N = 10 }) {
  const schet = {}
  const napechatano = []
  const pechat = () => { if (!porcha_snyat_vyzov) napechatano.push('сводка') }
  for (let i = 0; i < hodov; i++) {
    schet.hodovPosleSvodki = (schet.hodovPosleSvodki ?? 0) + 1
    const pervaya = !schet.svodkaBylaPoslePodyoma
    if (pervaya || schet.hodovPosleSvodki >= N) {
      schet.hodovPosleSvodki = 0
      schet.svodkaBylaPoslePodyoma = true
      pechat()
    }
  }
  return napechatano.length
}

proba('первый ход после подъёма даёт сводку', () =>
  takt({ hodov: 1 }) === 1 || `ждали 1, вышло ${takt({ hodov: 1 })}`)

// RU: Ожидание исправлено ПОСЛЕ прогона: сводки приходятся на ходы 1, 11, 21 — счётчик обнуляется первой
//     сводкой, и десятый ход даёт лишь 9 накопленных. Стенд поймал не код, а ожидание автора; это законный
//     исход пробы, и он ценнее зелёного с самого начала.
// EN: The expectation was corrected AFTER the run: summaries fall on turns 1, 11, 21 — the counter is reset by
//     the first summary, and the tenth turn gives only 9 accumulated. The stand caught not the code but the
//     author's expectation; that is a legitimate probe outcome, and it is worth more than green from the start.
proba('десять ходов без сжатий: сводка ОДНА (на первом ходе; следующая на 11-м)', () =>
  takt({ hodov: 10 }) === 1 || `ждали 1, вышло ${takt({ hodov: 10 })}`)

proba('одиннадцать ходов: сводок 2 (ходы 1 и 11)', () =>
  takt({ hodov: 11 }) === 2 || `ждали 2, вышло ${takt({ hodov: 11 })}`)

proba('двадцать один ход: сводок 3', () =>
  takt({ hodov: 21 }) === 3 || `ждали 3, вышло ${takt({ hodov: 21 })}`)

proba('🔴 ПОРЧА «снять вызов» → ТИШИНА (иначе стенд ничего не проверяет)', () =>
  takt({ hodov: 25, porcha_snyat_vyzov: true }) === 0
    || `порча не сработала: вышло ${takt({ hodov: 25, porcha_snyat_vyzov: true })}`)

proba('ноль ходов — ноль сводок (не «молчит по ошибке»)', () =>
  takt({ hodov: 0 }) === 0 || `ждали 0, вышло ${takt({ hodov: 0 })}`)

// RU: КАНАРЕЙКА СВОЕГО ЧИСЛА. Число ZHDYOM описывает СВОЙ предмет — сколько проб в этом файле, — и потому не
//     устаревает молча: добавил пробу и не поднял ZHDYOM — канарейка кричит немедленно (код 2). Вшитое число
//     вредно, когда описывает ЧУЖОЙ предмет; здесь оно описывает свой.
// EN: A CANARY FOR ITS OWN NUMBER. ZHDYOM describes ITS OWN subject — how many probes are in this file — and so
//     does not go stale silently: add a probe without raising ZHDYOM and the canary shouts at once (exit 2). A
//     hard-coded number is harmful when it describes SOMEONE ELSE's subject; here it describes its own.
const ZHDYOM = 6
if (vsego !== ZHDYOM) {
  console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, а ЖДЁМ ${ZHDYOM} — стенд правили, число не подняли.`)
  console.log('   Это не «пробы упали»: это «список проб разошёлся с объявленным».')
  process.exit(2)
}
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
