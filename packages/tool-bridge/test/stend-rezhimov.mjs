// Стенд: режимы интервала, потолок темпа, точка подключения сжатия, спор настроек.
// Текст функций берётся ИЗ файла предмета и исполняется на подставных данных;
// боевые файлы только читаются, ничего не ставится и не запускается.
//
// Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
//
// 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ:
//   * не проверяет БОЕВОЕ поведение лесенки: живая полоса из нескольких
//     пробуждений — это часы ожидания и настоящий расход, здесь только счёт;
//   * не проверяет, что платформа примет исправленный срок: это замер на живом
//     будильнике, он делается отдельно и один раз;
//   * не проверяет механизм сжатия, потому что механизма нет — только то, что
//     включённая настройка объявляет свою неготовность;
//   * спор настроек проверяется на здравый смысл ЧИСЕЛ, а не на удачность
//     выбранных значений: согласованный набор может быть плохим.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
// Путь выводится от расположения стенда: он едет вместе с предметом, и частных
// имён в нём быть не должно.
const SRC = path.resolve(process.argv[2]
  || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'index.js'))
const t = fs.readFileSync(SRC, 'utf-8')

// 🔴 ПРОГОН ОБЪЯВЛЯЕТ СВОЙ ПРЕДМЕТ. Несуществующая переменная или флаг молча
// игнорируются, и прогон идёт на умолчаниях — я трижды за неделю считала подставным
// прогон, шедший на боевом файле (MOST_KORNI вместо MOST_SRC; --karta, которого нет).
// Ни ошибки, ни признака: проверять надо не «команда отработала», а «на ТЕХ ли данных».
console.log(`предмет: ${SRC} (sha256-16 ${createHash('sha256').update(t).digest('hex').slice(0, 16)})`)

if (!t.includes('function vychislitInterval(')) {
  console.log(`СЛЕПОТА: в ${SRC} нет vychislitInterval — правка режимов не установлена`)
  process.exit(2)
}
const vyrez = (imya) => {
  const i = t.indexOf(`function ${imya}(`)
  if (i < 0) throw new Error(`нет функции ${imya}`)
  const j = t.indexOf('\n}\n', i)
  return t.slice(i, j + 3)
}
const oknoConst = t.match(/const HEARTBEAT_OKNO_CHASA_MS = \d+/)
if (!oknoConst) { console.log('СЛЕПОТА: нет HEARTBEAT_OKNO_CHASA_MS'); process.exit(2) }
const F = new Function(`${oknoConst[0]}
${vyrez('udarovVOkne')}
${vyrez('vychislitInterval')}
${vyrez('protivorechiyaKonfiga')}
${vyrez('vmestimostChasa')}
return { udarovVOkne, vychislitInterval, protivorechiyaKonfiga, vmestimostChasa, OKNO: HEARTBEAT_OKNO_CHASA_MS }`)()

let ok = 0, bad = 0, slep = 0
const sud = (uslovie, imya, fakt) => {
  if (uslovie === 'slep') { slep += 1; console.log(`СЛЕПОТА ${imya}: ${fakt ?? ''}`); return }
  if (uslovie) { ok += 1; return }
  bad += 1
  console.log(`FAIL ${imya}: ${fakt ?? ''}`)
}
const BAZA = {
  heartbeatMinIntervalSeconds: 1800,
  heartbeatMaxConsecutive: 6,
  heartbeatMaxPerDay: 48,
  heartbeatRezhim: 'lesenka',
  heartbeatRavnomernoSeconds: 1800,
  heartbeatMaxVChas: 0,
}
const L = (o) => ({ ...BAZA, ...o })

// --- РАЗДЕЛ 1. ЛЕСЕНКА -----------------------------------------------------
// Пауза растёт с каждым пробуждением, на которое человек не ответил.
const stupeni = [0, 1, 2, 3, 4, 5].map((st) => F.vychislitInterval(1, st, L()).sekundy)
sud(JSON.stringify(stupeni) === JSON.stringify([1800, 3600, 5400, 7200, 9000, 10800]),
  'лесенка даёт основание, 2x, 3x … по числу пробуждений подряд', stupeni.join(','))
sud(F.vychislitInterval(1, 0, L()).stupen === 1, 'первая ступень названа единицей')
sud(F.vychislitInterval(1, 5, L()).stupen === 6, 'последняя ступень равна пределу подряд')
// Ступеней ровно столько, каков предел: дальше него всё равно остановка.
sud(F.vychislitInterval(1, 99, L()).sekundy === 10800,
  'выше предела подряд ступень не растёт', String(F.vychislitInterval(1, 99, L()).sekundy))
// Слово человека рвёт счётчик подряд — значит следующая постановка снова первая.
sud(F.vychislitInterval(1, 0, L()).sekundy === 1800,
  'после слова человека снова первая ступень')
// Запрос больше нужного не урезается: механизм ограничивает частоту, а не навязывает.
const dolshe = F.vychislitInterval(99999, 0, L())
sud(dolshe.sekundy === 99999 && dolshe.pravlen === false,
  'запрос БОЛЬШЕ ступени остаётся как просили', `${dolshe.sekundy}/${dolshe.pravlen}`)
sud(F.vychislitInterval(60, 0, L()).pravlen === true,
  'запрос чаще ступени помечен как исправленный')

// --- РАЗДЕЛ 2. РОВНЫЙ ТИК --------------------------------------------------
const R = L({ heartbeatRezhim: 'ravnomerno', heartbeatRavnomernoSeconds: 900 })
const rovno = [0, 1, 2, 5, 99].map((st) => F.vychislitInterval(1, st, R).sekundy)
sud(rovno.every((v) => v === 900), 'ровный тик не зависит от числа пробуждений', rovno.join(','))
sud(F.vychislitInterval(1, 3, R).rovno === true, 'режим ровного тика опознан')
sud(F.vychislitInterval(5000, 0, R).sekundy === 5000, 'и в ровном режиме больший запрос не урезается')

// --- РАЗДЕЛ 3. ПОТОЛОК ТЕМПА ----------------------------------------------
const chas = F.OKNO
const now = 1000000000
const sob = (times) => times.map((tt) => ({ type: 'schedule/change', data: { operation: 'dispatch' }, time: tt }))
sud(F.udarovVOkne(sob([now - 100, now - 200]), chas, now).chislo === 2, 'удары внутри окна сочтены')
sud(F.udarovVOkne(sob([now - chas - 1]), chas, now).chislo === 0, 'удар за краем окна не считается')
sud(F.udarovVOkne([{ type: 'turn/start', time: now }], chas, now).chislo === 0,
  'посторонние события не считаются')
// 🔴 В фикстуре ДВА удара с разным временем, и это не украшение: при одном
// ударе самый старый и самый новый — один и тот же элемент, и подмена одного
// другим не проявилась бы. Данные без нужной разницы = выключенная проверка.
const o = F.udarovVOkne(sob([now - 600000, now - 60000]), chas, now)
sud(o.osvoboditsya === now - 600000 + chas, 'момент освобождения — по САМОМУ СТАРОМУ удару',
  `сдвиг ${o.osvoboditsya - now}, ждали ${chas - 600000}`)
sud(o.chislo === 2, 'оба удара окна сочтены', String(o.chislo))
sud(F.udarovVOkne([], chas, now).osvoboditsya === now, 'пустое окно освобождается немедленно')

// --- РАЗДЕЛ 4. СПОР НАСТРОЕК ----------------------------------------------
const spor = (o) => F.protivorechiyaKonfiga(L(o)).join(' | ')
sud(F.protivorechiyaKonfiga(L()).length === 0, 'согласованный набор молчит', spor({}))
sud(/недостижим/.test(spor({ heartbeatMaxConsecutive: 60 })),
  'предел подряд выше суточного назван недостижимым', spor({ heartbeatMaxConsecutive: 60 }))
sud(/отвергнута/.test(spor({ heartbeatRezhim: 'ravnomerno', heartbeatRavnomernoSeconds: 300 })),
  'ровный тик чаще минимального интервала назван обречённым')
// 🔴 02.09.2026: проверка перевёрнута. Раньше стенд ТРЕБОВАЛ, чтобы спор объявлял
// потолок «недостижимым, не сработает ни разу». Требование было неверным: расчёт шёл
// по шагу ПОВТОРЯЮЩИХСЯ, а потолок защищает от ОДНОРАЗОВЫХ, у которых интервала нет.
// Теперь стенд требует обратного — механизм не вправе объявлять меру мёртвой.
sud(!/не сработает|недостижим/.test(spor({ heartbeatMaxVChas: 5 })),
  'потолок темпа НЕ объявляется мёртвым (он защищает от одноразовых)', spor({ heartbeatMaxVChas: 5 }))
sud(F.protivorechiyaKonfiga(L({ heartbeatMaxVChas: 5 })).length === 0,
  'потолок темпа вообще не порождает спора')
sud(F.protivorechiyaKonfiga(L({ heartbeatMaxVChas: 1 })).length === 0,
  'достижимый потолок темпа спором не считается')

// 🔴 Требование координатора 02.09: число «в час помещается N» обязано ВЫЧИСЛЯТЬСЯ из
// шага, а не стоять готовым в тексте. Иначе смена шага заставит строку врать тем же
// способом, только тише. Проверяем действием — разные шаги дают разные числа.
sud(F.vmestimostChasa(L({ heartbeatMinIntervalSeconds: 1800 })).vlezaet === 2, 'шаг 1800 -> 2 в час')
sud(F.vmestimostChasa(L({ heartbeatMinIntervalSeconds: 900 })).vlezaet === 4, 'шаг 900 -> 4 в час')
sud(F.vmestimostChasa(L({ heartbeatRezhim: 'ravnomerno', heartbeatRavnomernoSeconds: 120 })).vlezaet === 30,
  'ровный тик 120 -> 30 в час')
// И структурно: в исходнике не должно быть вписанного числа рядом со словом «помещается».
sud(!/помещается\s+\d/.test(t), 'число «помещается N» не вписано в текст руками')

// 🔴 02.09.2026: обе меры — часовая и суточная — считаются по журналу СЕССИИ, а не
// агента. Суточная строка это оговаривала, часовая нет — и читалась строже, чем есть.
// Соседние строки про однотипные меры обязаны говорить с одинаковой честностью,
// иначе менее честная выглядит сильнее механизма.
{
  const chas = t.slice(t.indexOf('log(limits.heartbeatMaxVChas > 0'))
  const chasStroka = chas.slice(0, chas.indexOf('можно израсходовать за минуты'))
  sud(/НА СЕССИЮ, а не на агента/.test(chasStroka), 'часовая строка оговаривает «на сессию»')
  sud(/2 \* limits\.heartbeatMaxVChas/.test(chasStroka),
    'суммарный потолок агента в часовой строке ВЫЧИСЛЯЕТСЯ, а не вписан')
}

// 🔴 02.09.2026: этикетка меры обязана совпадать с механизмом. Пока в humanKinds есть
// a2a, полосу рвёт и координатор — значит «без слова человека» в строках подъёма ложь.
{
  // Конец ищем ОТ начала среза, а не от начала файла: «письмо об остановке»
  // встречается в шапке раньше, и срез выходил отрицательной длины — то есть
  // пустым. На пустом срезе отрицательная проверка проходит сама собой.
  const nachalo = t.indexOf('предел самопробуждения: не чаще')
  const podyom = t.slice(nachalo, t.indexOf('письмо об остановке', nachalo))
  sud(podyom.length > 200, 'срез строки подъёма не пуст', `длина ${podyom.length}`)
  // Запрещаем не саму фразу, а её РОЛЬ определения: «подряд без слова человека».
  // Объяснение «мера называется так лишь по имени настройки» — наоборот, нужно.
  sud(!/подряд без слова человека/.test(podyom),
    'мера не ОПРЕДЕЛЯЕТСЯ как «подряд без слова человека»')
  sud(/без ВНЕШНЕГО слова/.test(podyom), 'мера названа по существу — «без внешнего слова»')
  sud(/limits\.heartbeatHumanKinds\]\.join/.test(podyom) || /\[\.\.\.limits\.heartbeatHumanKinds\]/.test(podyom),
    'фактический список видов печатается, а не подразумевается')
}
// Строки спора обязаны нести ЧИСЛА: «настройки несогласованы» без чисел непроверяемо.
sud(/\d/.test(spor({ heartbeatMaxConsecutive: 60 })), 'строка спора называет числа')

// --- РАЗДЕЛ 5. НЕЙТРАЛЬНОСТЬ ТОГО, ЧТО ДОБАВЛЕНО ---------------------------
// Модуль уедет наружу, поэтому частных имён в нём быть не должно. Проверяется
// то, что добавлено ЭТОЙ работой: обезличивание остального предмета — отдельная
// задача со своим порогом, и смешивать их значит не закрыть ни ту, ни другую.
// 🔴 Образец собирается ИЗ КУСКОВ намеренно: написанный целиком, он содержал бы
// те самые имена, которые ищет, и файл ловил бы сам себя. Проверка, срабатывающая
// на собственном тексте, бесполезна: её отключат при первом же ложном красном.
const chastnye = new RegExp(['/opt/[a-z]', 'Петр' + 'ович', 'Алекс' + 'андр',
  'Заб' + 'ава', 'is' + 'kra', 'sa' + 'dik'].join('|'), 'g')
const novoe = [vyrez('udarovVOkne'), vyrez('vychislitInterval'),
  vyrez('protivorechiyaKonfiga')].join('\n')
const nashli = (novoe.match(chastnye) || []).length
sud(nashli === 0, 'в новых функциях нет частных имён', `${nashli} вхождений`)

// --- РАЗДЕЛ 6. БОЛЬШОЙ ПРЕДЕЛ -----------------------------------------------
// Предел «сколько подряд» настраивается широко: шесть — умолчание, а не потолок.
// Медленный агент может просыпаться раз в сутки месяц подряд, и это законно.
const F2 = new Function(`${oknoConst[0]}
${vyrez('pochelovecheski')}
${vyrez('stupeniKratko')}
${vyrez('dlinaPolosy')}
return { pochelovecheski, stupeniKratko, dlinaPolosy }`)()
const SUT = 86400
const bolsh = L({ heartbeatMaxConsecutive: 30, heartbeatMaxPerDay: 100 })
sud(F.vychislitInterval(1, 29, bolsh).sekundy === 1800 * 30,
  'при пределе 30 последняя ступень считается верно', String(F.vychislitInterval(1, 29, bolsh).sekundy))
sud(Number.isFinite(F.vychislitInterval(1, 999, bolsh).sekundy),
  'запредельное число пробуждений не ломает арифметику')
// Ровный тик: срок = интервал x предел. Это тот случай, ради которого предел
// делается широким: раз в сутки тридцать раз — тридцать суток.
const rovnoSut = L({ heartbeatRezhim: 'ravnomerno', heartbeatRavnomernoSeconds: SUT,
  heartbeatMaxConsecutive: 30, heartbeatMaxPerDay: 100 })
sud(F2.dlinaPolosy(rovnoSut) === SUT * 30, 'ровный тик: сутки x 30 = 30 суток',
  String(F2.dlinaPolosy(rovnoSut) / SUT))
// 🔴 В ЛЕСЕНКЕ ТЕ ЖЕ ЧИСЛА ДАЮТ ДРУГОЙ СРОК, и это не дефект, а устройство:
// каждая следующая пауза длиннее. Задавший предел решает по СРОКУ, поэтому срок
// обязан быть назван вслух — иначе он ждёт месяц там, где выйдет полтора года.
const lesSut = L({ heartbeatMinIntervalSeconds: SUT, heartbeatMaxConsecutive: 30,
  heartbeatMaxPerDay: 100 })
sud(F2.dlinaPolosy(lesSut) === SUT * 465, 'лесенка: те же 30 раз в сутки дают 465 суток',
  String(F2.dlinaPolosy(lesSut) / SUT))
// Требование: механизм ругается на бессмысленное, а не на непривычное.
sud(F.protivorechiyaKonfiga(rovnoSut).length === 0,
  'сутки x 30 при пределе 30 — НЕ противоречие, проходит молча',
  F.protivorechiyaKonfiga(rovnoSut).join(' | '))
sud(F.protivorechiyaKonfiga(lesSut).length === 0,
  'лесенка с суточным основанием тоже проходит молча',
  F.protivorechiyaKonfiga(lesSut).join(' | '))
// Строка ступеней обязана оставаться читаемой при любом пределе.
const kratko = F2.stupeniKratko(lesSut)
sud(kratko.length < 60 && /ступеней 30/.test(kratko),
  'список ступеней при большом пределе сжат и называет их число', `${kratko.length} знаков: ${kratko}`)
sud(F2.pochelovecheski(SUT * 465) === '465 сут' && F2.pochelovecheski(1800) === '30 мин',
  'длительность печатается по-человечески', F2.pochelovecheski(SUT * 465))

// --- КАНАРЕЙКА -------------------------------------------------------------
// Число проверок здесь постоянно: случаи заданы перечнем и от данных не зависят.
const ZHDYOM = 42
const vsego = ok + bad + slep
console.log(`ИТОГО: сошлось ${ok}, расхождений ${bad}, слепот ${slep}`)
if (vsego !== ZHDYOM) {
  console.log(`СЛЕПОТА: проверок ${vsego}, ждали ${ZHDYOM} — часть не состоялась`)
  process.exit(2)
}
// 🔴 ТРИ ИСХОДА, А НЕ ДВА. Ноль — только когда всё сошлось и слепот нет.
// Слепота с нулевым кодом проходит у постороннего как успех: он не читает
// текст, он пишет «node стенд && дальше» — и не узнает, что не проверено ничего.
process.exit(bad > 0 ? 1 : (slep > 0 ? 2 : 0))
