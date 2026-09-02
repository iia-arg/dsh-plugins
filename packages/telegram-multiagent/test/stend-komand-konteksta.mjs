// Стенд доставки команд платформы из телеграма: /compact, /ccc, /compact-status, /cs.
//
// Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
//
// 🔴 ВСЁ ПРОВЕРЯЕМОЕ ВЫРЕЗАЕТСЯ ИЗ ПРЕДМЕТА, а не переписано здесь. Копия стареет
// МОЛЧА: перепишут предмет — стенд продолжит проверять прежнее и останется зелёным.
// Проверено на себе 02.09: при переводе с прямого вызова движка на реестр команд
// этот стенд ЧЕСТНО ОСЛЕП («вырезать нечего»), а копия сказала бы «сошлось».
//
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: не проверяет ни сам реестр команд, ни сжатие, ни измеритель —
// только НАШУ часть: разворот алиасов, якоря и то, что обычный текст не съеден.
// Остальное — на живом, порчами.

import { readFileSync } from 'node:fs'

const SRC = process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}

// Вырезаем ЦЕПОЧКУ разворота алиасов ровно так, как она стоит в предмете.
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
t('undefined НЕ глотается: текст идёт в модель', /vypolneno !== undefined/.test(text), 'нет проверки на undefined')
t('ответ в чат на ОБЕИХ ветках result', /r\?\.text \|\|/.test(text), 'нет дословной подачи result.text')
t('commands НЕ в inject (иначе pending и связь не поднимется)', /export const inject = \['agents'\];/.test(text), 'commands объявлен в inject')
t('громкий отказ при недоступном реестре', /реестр команд недоступен/.test(text), 'нет громкого отказа')
t('/compact-status регистрируется в реестре', /name: 'compact-status'/.test(text), 'команда не регистрируется')

console.log('\n=== 4б. Ответ называет ПРЕДМЕТ своего действия ===')
// 🔴 03.09.2026: команда подана из личного чата, сжалась сессия a2a — и это
// была наша же настройка mergeChatIntoA2A, а выглядело как дефект. Полчаса
// расследования стоила ОДНА ненаписанная строчка.
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
  // Блок вырезается из предмета: искать по всему файлу нельзя — там есть и slice(0, 120),
  // и законные числа. Порча `okno = okno ?? 1000000` прошла мимо прежнего шаблона.
  const blokOkna = text.match(/let okno;[\s\S]*?Окно контекста недоступно/)
  if (!blokOkna) { console.log('  СЛЕПОТА: блок окна не вырезался'); process.exit(2) }
  const chisla = [...blokOkna[0].matchAll(/\b\d[\d_]{3,}\b/g)].map((m) => m[0])
  t('умолчание окна НЕ подставляется', chisla.length === 0,
    `в блоке окна найдены числовые литералы: ${chisla.join(', ')}`)
}
t('при недоступном окне остаётся честное НЕ МОГУ', /расстояние до порога сказать НЕ МОГУ/.test(text),
  'честный отказ потерян')
t('отказ называет ПРИЧИНУ', /\$\{pochemuNet\}[^\n]*НЕ МОГУ/.test(text),
  'в строке отказа нет причины — «не могу» неотличимо от «не пробовала»')

console.log('\n=== 5. Доступ к службам ТОЛЬКО законным путём ===')
// 🔴 Куплено боем 02.09.2026: обе команды владельца упали с
// «cannot get property "commands" without inject». Платформа запрещает ЧИТАТЬ
// ctx.<служба> без inject — проверка идёт в момент обращения, а не только при
// монтаже. Все 16 прежних проверок были зелёными на коде, который падал на
// первой же команде: они проверяли РАЗБОР, а не ДОСТУП.
// Строки-комментарии не в счёт: имя службы в пояснении никого не ломает.
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
// 🔴 Канарейка точного числа: вырезанный раздел иначе проходит кодом 0.
const ZHDYOM = 29
if (ok + bad !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + bad}, а стенд состоит из ${ZHDYOM} — часть не состоялась.`)
  process.exit(2)
}
process.exit(bad ? 1 : 0)
