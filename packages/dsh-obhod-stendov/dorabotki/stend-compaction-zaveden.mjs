// Стенд п.404: сжатие ЗАВЕДЕНО на подставном профиле, граница названа в самой правке.
// 🔴 Проба про предмет: читается тот файл профиля, который грузится, а не копия.
import { readFileSync } from 'node:fs'
import { load } from '/opt/iskra/app/node_modules/js-yaml/index.js'
const P = process.env.STEND_PROFIL || '/opt/iskra/.dsh/profiles/bridgeprobe/cordis.patch.yml'
const syroe = readFileSync(P, 'utf8')
let d
try { d = load(syroe) } catch (e) { console.log('🔴 СЛЕПОТА: YAML не разбирается — ' + e.message); process.exit(2) }
let bed = 0, vsego = 0
const proba = (imya, u, chto) => { vsego++
  if (u) console.log(`  ✅ ${imya} (${chto})`); else { bed++; console.log(`  🔴 ${imya} — было: ${chto}`) } }

const gruppa = (Array.isArray(d) ? d : []).find((x) => x && x.id === 'compaction')
proba('группа compaction есть', !!gruppa, gruppa ? 'найдена' : 'НЕТ')
const spisok = Array.isArray(gruppa?.config) ? gruppa.config : []
proba('🔴 config НЕ ПУСТ — иначе группа лишь ВЫГЛЯДИТ настроенной', spisok.length > 0, `записей ${spisok.length}`)
const basic = spisok.find((x) => String(x?.name || '').includes('compaction-basic'))
proba('плагин compaction-basic ОБЪЯВЛЕН, а не упомянут', !!basic, basic ? basic.name : 'НЕТ')
proba('порог задан ЯВНО, не оставлен умолчанию', typeof basic?.config?.thresholdRatio === 'number', String(basic?.config?.thresholdRatio))
proba('порог в разумных пределах (0 < r < 1)', basic?.config?.thresholdRatio > 0 && basic?.config?.thresholdRatio < 1, String(basic?.config?.thresholdRatio))
proba('maxTokens задан', Number.isInteger(basic?.config?.maxTokens), String(basic?.config?.maxTokens))

console.log('── границы названы в самой правке, а не в переписке ──')
proba('сказано, что предел работает ТОЛЬКО ДО стены', /СРАБАТЫВАЕТ ТОЛЬКО ДО СТЕНЫ/.test(syroe), 'сказано')
proba('названа внешняя рука для случая ПОСЛЕ стены', /systemd-таймер|до сборки промпта/.test(syroe), 'названа')
proba('сказано «не сломано, а НЕ ЗАВЕДЕНО»', /не сломано, а НЕ ЗАВЕДЕНО/.test(syroe), 'сказано')
proba('назван класс «группа без содержимого выглядит настроенной»', /ВЫГЛЯДИТ НАСТРОЕННОЙ/.test(syroe), 'назван')
proba('сказано, почему на подставном, а не в бою', /цена ошибки в боевом профиле/.test(syroe), 'сказано')

const ZHDYOM = 11
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
