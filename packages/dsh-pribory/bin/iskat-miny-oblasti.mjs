// Прибор против МОЕГО пятикратного класса: переменная объявлена в блоке, использована снаружи.
// node --check на это слеп — он отвечает «разберётся ли парсер», а не «выполнится ли».
// ОБЛАСТЬ, которой прибор НЕ владеет (называю, чтобы он не обещал больше, чем видит):
//   не понимает замыканий, function-scope у var, теневых объявлений в под-блоках
//   и обращений через строку/eval. Это грубый счёт скобок, а не разбор языка.
// EN: A tool against MY fivefold class: a variable declared in a block, used outside it.
//     node --check is blind to this — it answers "will the parser cope", not "will it run".
//     THE AREA the tool does NOT own (named so that it does not promise more than it sees): it does not
//     understand closures, function scope of var, shadowing declarations in sub-blocks, or access via a
//     string/eval. This is a crude bracket count, not a language parse.
import fs from 'fs'
const put = process.argv[2]
let stroki
try { if (!put) throw new Error('нужен путь к файлу'); stroki = fs.readFileSync(put, 'utf8').split('\n') }
catch (e) { console.error('СЛЕПОТА: ' + (put ?? '<не задан>') + ': ' + e.message); process.exit(2) }
let gl = 0
const obyavleny = []           // {imya, stroka, glubina} · EN: {imya, stroka, glubina}
const bezKomm = s => s.split('//')[0]
stroki.forEach((l, i) => {
  const n = i + 1, ll = bezKomm(l)
  const m = ll.match(/^\s*(?:let|const)\s+([A-Za-z_$][\w$]*)/)
  if (m) obyavleny.push({ imya: m[1], stroka: n, glubina: gl })
  gl += (ll.match(/\{/g) || []).length - (ll.match(/\}/g) || []).length
})
const miny = []
for (const o of obyavleny) {
  if (o.glubina <= 1) continue          // на верхнем уровне функции — видно всюду · EN: at the top level of a function — visible everywhere
  let g = 0
  stroki.forEach((l, i) => {
    const n = i + 1, ll = bezKomm(l)
    if (n > o.stroka && g < o.glubina &&
        new RegExp(`\\b${o.imya}\\b`).test(ll) && !/^\s*(let|const)\s/.test(ll)) {
      miny.push({ ...o, ispolzovana: n, glubinaTam: g })
    }
    g += (ll.match(/\{/g) || []).length - (ll.match(/\}/g) || []).length
  })
}
if (!miny.length) { console.log('мин не найдено'); process.exit(0) }
for (const m of miny) console.log(`🔴 ${m.imya}: объявлена ${m.stroka} (глубина ${m.glubina}), использована ${m.ispolzovana} (глубина ${m.glubinaTam})`)
process.exit(1)
