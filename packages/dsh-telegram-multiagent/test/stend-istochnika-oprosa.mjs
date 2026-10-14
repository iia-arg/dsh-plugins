// RU: Изолированный стенд stend-istochnika-oprosa.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-istochnika-oprosa.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readFileSync } from 'node:fs'


const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет не читается: ${e?.message ?? e}`); process.exit(2)
}

const mShag = text.match(/const shagOprosa = async \(imya, delo\) => \{[\s\S]*?\n    \};/)
const mIst  = text.match(/const istochnik = \([\s\S]*?;\n/)
if (!mShag || !mIst) {
  console.log(`СЛЕПОТА: в предмете не найдены shagOprosa=${!!mShag} / выражение источника=${!!mIst}.`)
  console.log('  Это НЕ «разведения нет»: форма могла измениться. Проверить руками.')
  process.exit(2)
}
const shagOprosa = new Function(`${mShag[0]}\nreturn shagOprosa;`)()

const imyaIz = new Function('e', `${mIst[0]}\nreturn istochnik;`)

const ok = (t) => console.log('  ok   ' + t)
let bed = 0
const net = (t) => { console.log('  НЕ ТО: ' + t); bed++ }

async function upal(imya, chto) {
  try { await shagOprosa(imya, () => { throw chto }); return null }
  catch (e) { return imyaIz(e) }
}


for (const imya of ['a2a', 'ящик', 'telegram']) {
  const r = await upal(imya, new Error('сеть моргнула'))
  if (r === imya) ok(`отказ шага «${imya}» назван своим именем`)
  else net(`отказ шага «${imya}» назвался как «${r}»`)
}


{
  const r = await upal('a2a', 'строка вместо ошибки')
  if (typeof r === 'string' && /НЕ УСТАНОВЛЕН/.test(r)) ok('брошен не объект — источник «НЕ УСТАНОВЛЕН», без догадки')
  else net(`брошен не объект, а источник назван «${r}» — это догадка, а не замер`)
}


{
  let r = null
  try {
    await shagOprosa('внешний', async () => {
      await shagOprosa('внутренний', () => { throw new Error('глубоко') })
    })
  } catch (e) { r = imyaIz(e) }
  if (r === 'внутренний') ok('имя ставит ПЕРВЫЙ поймавший — вложенный шаг не перетёрт внешним')
  else net(`имя источника перетёрто: получили «${r}» вместо «внутренний»`)
}


{
  const v = await shagOprosa('a2a', () => 'значение')
  if (v === 'значение') ok('контроль зрячести: успешный шаг отдаёт результат, обёртка не мешает')
  else net(`контроль зрячести НЕ пройден: успешный шаг вернул «${v}»`)
}

console.log(`  итог: ${7 - bed} из 7`)
process.exit(bed ? 1 : 0)
