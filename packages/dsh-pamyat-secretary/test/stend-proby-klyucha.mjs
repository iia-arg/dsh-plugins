// RU: Проверяем настоящие apply и proverit_klyuch при подъёме. Дом, хранилище и gpg временные; pass первым в PATH и команда тревоги подставные, оставляют след вызова. Исправное: взведена с получением ключа пробой, без тревоги и раскрытия значения. Порчи: НЕ взведена с причиной, одна тревога на процесс. Без хранилища, записи или gpg pass не вызывается и каталог gpg не создаётся. Коды: 0 — успех, 1 — расхождение, 2 — модуль не загрузился.
// EN: Test real apply and proverit_klyuch at startup. Home, store, and gpg are temporary; pass first in PATH and the alert command are fake and leave call traces. Healthy: armed after fetching the key through a probe, without an alert or value disclosure. Mutations: not armed with a cause, one alert per process. Without store, entry, or gpg, do not invoke pass or create the gpg directory. Codes: 0 success, 1 mismatch, 2 module failed to load.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временное дочернего процесса убирает сам процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process cleans its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

const SRC = process.argv[2] || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
const KORENX = vremennyj(join(tmpdir(), 'stend-klyucha-'))
const SEKRET = 'SEKRET-ZNACHENIE-NE-PECHATAT-7f3a'
const BIN = join(KORENX, 'bin'); mkdirSync(BIN)
const METKA_PASS = join(KORENX, 'pass-zvan')
const TREVOGI = join(KORENX, 'trevogi')
writeFileSync(join(BIN, 'pass'), `#!/bin/sh\necho zvan >> ${METKA_PASS}\n[ -n "$PASS_OTKAZ" ] && { echo "Error: $2 is not in the password store." >&2; exit 1; }\necho ${SEKRET}\n`)
chmodSync(join(BIN, 'pass'), 0o755)
writeFileSync(join(BIN, 'trevoga'), `#!/bin/sh\nprintf '%s\\n@@KONEC@@\\n' "$1" >> ${TREVOGI}\n`)
chmodSync(join(BIN, 'trevoga'), 0o755)
process.env.PATH = BIN + ':' + process.env.PATH

let ok = 0, bed = 0, n = 0
const proba = (imya, beda) => { if (beda) { bed++; console.log('  ❌ ' + imya + ' — ' + beda) } else { ok++; console.log('  ✅ ' + imya) } }
const zhdat = (ms) => new Promise((r) => setTimeout(r, ms))
const prochest = (p) => existsSync(p) ? readFileSync(p, 'utf8') : ''

// RU: Для каждого подъёма импортируем свежий модуль, вызываем apply и собираем krik: состояние пробы хранится на модуль.
// EN: Import a fresh module for each startup, call apply, and collect krik; probe state belongs to the module.
async function podyom({ hranilishche = true, zapis = true, gnupg = true, otkaz = false,
                        komandaTrevogi = join(BIN, 'trevoga'), raz = 1 } = {}) {
  const dom = join(KORENX, 'dom' + (++n)); mkdirSync(dom)
  if (hranilishche) mkdirSync(join(dom, '.password-store', 'api'), { recursive: true })
  if (hranilishche && zapis) writeFileSync(join(dom, '.password-store', 'api', 'deepseek.gpg'), 'x')
  if (gnupg) mkdirSync(join(dom, '.gnupg'))
  process.env.HOME = dom; delete process.env.PASSWORD_STORE_DIR; delete process.env.GNUPGHOME
  if (otkaz) process.env.PASS_OTKAZ = '1'; else delete process.env.PASS_OTKAZ
  rmSync(METKA_PASS, { force: true }); rmSync(TREVOGI, { force: true })
  let m
  try { m = await import(SRC + '?n=' + n) } catch (e) { console.log('СЛЕПОТА: модуль не загрузился: ' + e.message); process.exit(2) }
  const stroki = []
  const bylo = console.error
  console.error = (...a) => stroki.push(a.join(' '))
  const ctx = { plugin: () => {}, on: () => {}, get: () => null }
  const config = { distillyaciya: true, putZhurnala: '/net/zhurnala', klyuchPass: 'api/deepseek', komandaTrevogi }
  try { for (let i = 0; i < raz; i++) m.apply(ctx, config) } catch (e) { stroki.push('APPLY БРОСИЛ: ' + e.message) }
  finally { console.error = bylo }
  // RU: Ждём исход асинхронной тревоги не более пяти секунд: отправлена или НЕ ДОШЛА.
  // EN: Wait at most five seconds for the asynchronous alert outcome: sent or НЕ ДОШЛА.
  for (let i = 0; i < 50 && komandaTrevogi && !stroki.some((s) => /тревога о ключе (отправлена|НЕ ДОШЛА)/.test(s)); i++) {
    console.error = (...a) => stroki.push(a.join(' ')); await zhdat(100); console.error = bylo
  }
  const vse = stroki.join('\n')
  return { vse, podyom: stroki.find((s) => s.includes('подъём: класс')) ?? '',
           passZvan: prochest(METKA_PASS).split('\n').filter(Boolean).length,
           trevogi: prochest(TREVOGI).split('\n@@KONEC@@\n').filter(Boolean),
           gnupgSozdan: !gnupg && existsSync(join(dom, '.gnupg')) }
}

const bezSekreta = (r) => (r.vse + r.trevogi.join('\n')).includes(SEKRET) ? 'ЗНАЧЕНИЕ КЛЮЧА НАПЕЧАТАНО' : ''

let r = await podyom()
proba('К1 исправное: ключ получен → «взведена … получен пробой», тревоги нет, значение не напечатано',
  !/взведена: .*получен пробой при подъёме/.test(r.podyom) ? 'строка подъёма: ' + r.podyom.slice(-160)
  : r.trevogi.length ? 'тревог ' + r.trevogi.length : r.passZvan !== 1 ? 'pass зван ' + r.passZvan + ' раз' : bezSekreta(r))

r = await podyom({ hranilishche: false, gnupg: false })
proba('К2 нет хранилища → «НЕ взведена … хранилища pass нет», pass не зван, ~/.gnupg не создан, тревога 1',
  !/НЕ взведена: ключ pass api\/deepseek не получен — хранилища pass нет/.test(r.podyom) ? 'строка подъёма: ' + r.podyom.slice(-160)
  : r.passZvan ? 'pass зван ' + r.passZvan : r.gnupgSozdan ? '~/.gnupg создан' : r.trevogi.length !== 1 ? 'тревог ' + r.trevogi.length
  : !/НЕ взведена: ключ pass api\/deepseek не получен — хранилища pass нет/.test(r.trevogi[0]) ? 'тревога: ' + r.trevogi[0] : bezSekreta(r))

r = await podyom({ zapis: false })
proba('К3 хранилище есть, записи нет → «записи нет в хранилище», pass не зван',
  !/не получен — записи нет в хранилище: .*api\/deepseek\.gpg/.test(r.podyom) ? 'строка подъёма: ' + r.podyom.slice(-160)
  : r.passZvan ? 'pass зван ' + r.passZvan : r.trevogi.length !== 1 ? 'тревог ' + r.trevogi.length : '')

r = await podyom({ gnupg: false })
proba('К4 запись есть, каталога gpg нет → pass не зван, каталог не создан',
  !/нет каталога ключей gpg: .*\.gnupg \(pass не зову/.test(r.podyom) ? 'строка подъёма: ' + r.podyom.slice(-160)
  : r.passZvan ? 'pass зван ' + r.passZvan : r.gnupgSozdan ? '~/.gnupg создан' : '')

r = await podyom({ otkaz: true })
proba('К5 pass отказал → «НЕ взведена … pass не отдал ключ», тревога 1',
  !/НЕ взведена: .*pass не отдал ключ/.test(r.podyom) ? 'строка подъёма: ' + r.podyom.slice(-160)
  : r.trevogi.length !== 1 ? 'тревог ' + r.trevogi.length
  : /\n/.test(r.trevogi[0].trimEnd()) || /\n/.test(r.podyom) ? 'причина pass рвёт строку на части' : bezSekreta(r))

r = await podyom({ hranilishche: false, raz: 3 })
proba('К6 три подъёма в одном процессе → тревога ОДНА, строк «НЕ взведена» три',
  r.trevogi.length !== 1 ? 'тревог ' + r.trevogi.length
  : (r.vse.match(/подъём: класс.*НЕ взведена/g) ?? []).length !== 3 ? 'строк НЕ взведена: ' + (r.vse.match(/подъём: класс.*НЕ взведена/g) ?? []).length : '')

r = await podyom({ hranilishche: false, komandaTrevogi: '' })
proba('К7 команда тревоги пуста → «тревога … НЕ ОТПРАВЛЕНА» вслух',
  !/тревога о ключе НЕ ОТПРАВЛЕНА: komandaTrevogi пуст/.test(r.vse) ? 'нет строки о невыключенной тревоге' : '')

r = await podyom()
proba('К8 снова исправное → «взведена», тревоги нет', !/взведена: .*получен пробой/.test(r.podyom) || r.trevogi.length ? 'строка: ' + r.podyom.slice(-120) + ' тревог ' + r.trevogi.length : '')

rmSync(KORENX, { recursive: true, force: true })
console.log(`  итог: ${ok} из ${ok + bed}`)
process.exit(bed ? 1 : 0)
