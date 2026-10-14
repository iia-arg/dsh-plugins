// RU: Изолированный стенд stend-smysl-statusa.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-smysl-statusa.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { formatStatus } from '../src/compact-status.js'
const base = { model: { provider: 'p', model: 'm' }, window: 1000000,
  measurement: { totalTokens: 100000, baseline: { kind: 'usage', tokens: 100000 } } }
let poteryano = 0
const t = (imya, ok, pochemu) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${imya}`); if (!ok) { console.log(`     ${pochemu}`); poteryano++ } }
const vkl = formatStatus({ ...base, configs: [{ auto: true, thresholdRatio: 0.6 }] })
const vykl = formatStatus({ ...base, configs: [{ auto: false, thresholdRatio: 0.6 }] })
t('выключенный автокомпакт отличим от включённого', vkl !== vykl,
  'при auto:false печатается «осталось N до порога», как будто сжатие случится')
const nol = formatStatus({ ...base, configs: [] })
const dva = formatStatus({ ...base, configs: [{ thresholdRatio: 0.8 }, { thresholdRatio: 0.9 }] })
t('«движок не ответил» отличим от «ответили двое по-разному»', nol !== dva,
  'обе беды печатаются одной причиной: ' + dva.split('\n').pop())
const osh = formatStatus({ ...base, configs: [{ auto: true, thresholdRatio: 0.9 }], configError: 'ПРИЧИНА-ПРОБЫ' })
t('текст ошибки движка виден в ответе', osh.includes('ПРИЧИНА-ПРОБЫ'),
  'ошибка движка сведена к «движок не ответил», её текст пропал')
console.log(`ИТОГ: различений потеряно ${poteryano} из 3`)
process.exit(poteryano ? 1 : 0)
