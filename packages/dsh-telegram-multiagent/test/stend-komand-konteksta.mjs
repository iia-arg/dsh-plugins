// RU: Изолированный стенд stend-komand-konteksta.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-komand-konteksta.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readFileSync } from 'node:fs'


const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}


const blok = text.match(/const stroka = text\s*((?:\s*\.replace\([^\n]+\n)+)/)
if (!blok) { console.log('СЛЕПОТА: в предмете не найден разворот алиасов — вырезать нечего'); process.exit(2) }
const zameny = [...blok[1].matchAll(/\.replace\((\/.+?\/[a-z]*),\s*'([^']*)'\)/g)]
if (zameny.length === 0) { console.log('СЛЕПОТА: замены не разобрались'); process.exit(2) }

const razvernut = (t) => {
  let s = t
  for (const [, re, na] of zameny) {
    const m = re.match(/^\/(.*)\/([a-z]*)$/)
    s = s.replace(new RegExp(m[1], m[2]), na)
  }
  return s
}

let ok = 0, bad = 0
const t = (n, c, s) => { if (c) { ok++; console.log(`  ok   ${n}`) } else { bad++; console.log(`  FAIL ${n}\n       ${s ?? ''}`) } }

console.log(`=== 0. Разворот вырезан из предмета: замен ${zameny.length} ===`)
t('замен ровно две (ccc и cs)', zameny.length === 2, `нашлось ${zameny.length}`)

console.log('\n=== 1. Алиасы разворачиваются в ИМЯ ШТАТНОЙ команды ===')
t('/ccc -> /compact', razvernut('/ccc') === '/compact', razvernut('/ccc'))
t('/cs -> /compact-status', razvernut('/cs') === '/compact-status', razvernut('/cs'))
t('/ccc с доводом сохраняет пробел', razvernut('/ccc сейчас') === '/compact сейчас', razvernut('/ccc сейчас'))
t('/compact не трогается', razvernut('/compact') === '/compact', razvernut('/compact'))

console.log('\n=== 2. Концевой якорь: опечатка НЕ превращается в команду ===')
t('/cccc не разворачивается', razvernut('/cccc') === '/cccc', razvernut('/cccc'))
t('/csv не разворачивается', razvernut('/csv') === '/csv', razvernut('/csv'))
t('/cstatus не разворачивается', razvernut('/cstatus') === '/cstatus', razvernut('/cstatus'))

console.log('\n=== 3. Только начало строки ===')
t('«скажи /ccc потом» не трогается', razvernut('скажи /ccc потом') === 'скажи /ccc потом', razvernut('скажи /ccc потом'))

console.log('\n=== 4. Устройство: штатный путь, а не своя реализация ===')
t('строка отдаётся в ctx.commands.execute', /commands\.execute\(/.test(text) || /reestrKomand\.execute\(/.test(text), 'нет вызова execute')
t('compactNow сам НЕ зовётся (иначе command/run останется 0)', !/compaction\.compactNow\(/.test(text), 'найден прямой вызов движка')
t('неизвестная команда проверяется до execute и не уходит в модель', /if \(!reestrKomand\.find\(ch\.agent, commandName\)\)/.test(text) && text.includes('Команда больше не доступна: не передана модели.'), 'нет отказа unknown/race')
t('ответ в чат на ОБЕИХ ветках result', /r\?\.text \|\|/.test(text), 'нет дословной подачи result.text')
t('commands НЕ в inject (иначе pending и связь не поднимется)', /export const inject = \['agents'\];/.test(text), 'commands объявлен в inject')
t('громкий отказ при недоступном реестре', /реестр команд недоступен/.test(text), 'нет громкого отказа')
t('/compact-status регистрируется в реестре', /name: 'compact-status'/.test(text), 'команда не регистрируется')

console.log('\n=== 4б. Ответ называет ПРЕДМЕТ своего действия ===')


t('в ответ команды приписан id сессии', text.includes('${otvet}\\n\\n(сессия ${sid})'),
  'ответ на УСПЕШНОЙ ветке не называет сессию (вхождение в catch не в счёт)')
t('id берётся из agentFor, а не собирается заново', /const \{ handle: ch, sessionId \} = await agentFor\(key\)/.test(text),
  'sessionId не взят из agentFor')
t('на ветке отказа хвост только при известной сессии', /sid \? ` \(сессия \$\{sid\}\)`/.test(text),
  'в catch id подставляется безусловно — соврёт, если agentFor бросил')

console.log('\n=== 4в. Окно контекста берётся у платформы, а не выдумывается ===')
t('окно спрашивается у службы llm', /resolveModelInfo\(cel\.provider, cel\.model/.test(text), 'нет вызова resolveModelInfo')
t('цель модели — из заголовка запроса, как у платформы', /sess\.requestHeader\?\.\(\)\?\.config/.test(text),
  'цель не берётся из requestHeader')
t('есть запасной путь через agent.options', /invocation\.agent\?\.options/.test(text), 'нет запасного пути')
{


  const blokOkna = text.match(/let okno;[\s\S]*?const configs = \[\]/)
  if (!blokOkna) { console.log('  СЛЕПОТА: блок окна не вырезался'); process.exit(2) }
  const chisla = [...blokOkna[0].matchAll(/\b\d[\d_]{3,}\b/g)].map((m) => m[0])
  t('умолчание окна НЕ подставляется', chisla.length === 0,
    `в блоке окна найдены числовые литералы: ${chisla.join(', ')}`)
}
const report = readFileSync(new URL('../src/compact-status.js', import.meta.url), 'utf8')


{
  const { formatStatus } = await import(new URL('../src/compact-status.js', import.meta.url))
  const bezOkna = formatStatus({ model: { provider: 'p', model: 'm' }, window: undefined, windowError: 'ПРИЧИНА-ПРОБЫ',
    measurement: { totalTokens: 100000, baseline: { kind: 'usage', tokens: 100000 } }, configs: [{ auto: true, thresholdRatio: 0.95 }] })
  t('при недоступном окне остаётся честное НЕ МОГУ', bezOkna.includes('ПРИЧИНА-ПРОБЫ') && !/\d+(\.\d+)?%/.test(bezOkna) && !/осталось/.test(bezOkna),
    'честный отказ потерян: ' + bezOkna.replace(/\n/g, ' | '))
}
t('отказ называет ПРИЧИНУ', /windowError:pochemuNet/.test(text) && /windowError \?\?/.test(report),
  'в строке отказа нет причины — «не могу» неотличимо от «не пробовала»')

console.log('\n=== 5. Доступ к службам ТОЛЬКО законным путём ===')


{
  const kod = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  const pryamye = [...kod.matchAll(/ctx\.(commands|compaction|tokenMeter|llm)\b/g)].map((m) => m[1])
  t('в КОДЕ нет прямого ctx.<служба> (только ctx.get)', pryamye.length === 0,
    `найдено: ${pryamye.join(', ') || '—'}`)
  t('реестр команд берётся через ctx.get', /ctx\.get\('commands'\)/.test(kod), 'нет ctx.get(\'commands\')')
  t('служба для регистрации берётся ожиданием', /waitService\('commands'/.test(kod), 'нет waitService для регистрации')
  t('служба llm берётся через ctx.get', /ctx\.get\('llm'\)/.test(kod), 'нет ctx.get(\'llm\')')
}

console.log(`\nИТОГО: сошлось ${ok}, расхождений ${bad}`)

const ZHDYOM = 29
if (ok + bad !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + bad}, а стенд состоит из ${ZHDYOM} — часть не состоялась.`)
  process.exit(2)
}
process.exit(bad ? 1 : 0)
