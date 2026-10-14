// Actual offline npm install/import: a successful installation must not hide a missing mandatory sibling.
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const pkg = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const temp = mkdtempSync(join(tmpdir(), 'storozha-install-audit-'))
let failures = 0
try {
  function directory(name) {
    let d = dirname(require.resolve(name))
    while (!existsSync(join(d, 'package.json'))) {
      const parent = dirname(d); if (parent === d) throw Error('missing package '+name); d = parent
    }
    return d
  }
  const deps = ['@deepseek-ai/cordis', '@deepseek-ai/schemastery', '@deepseek-ai/cosmokit', '@standard-schema/spec']
  const sources = deps.map(directory)
  sources.push(directory('dsh-pamyat-kompakt'))
  const archives = []
  for (const source of [...sources, pkg]) {
    const q = spawnSync('npm', ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', temp], { cwd: source, encoding: 'utf8', timeout: 30000 })
    if (q.status !== 0) throw Error('cannot pack '+source+': '+q.stderr)
    archives.push(join(temp, JSON.parse(q.stdout)[0].filename))
  }
  for (const withSibling of [false, true]) {
    const project = join(temp, withSibling ? 'complete' : 'without-sibling'); mkdirSync(project)
    writeFileSync(join(project, 'package.json'), '{"private":true}')
    const files = [...archives.slice(0, 4), ...(withSibling ? [archives[4]] : []), archives[5]]
    const q = spawnSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...files], { cwd: project, encoding: 'utf8', timeout: 30000 })
    const loaded = q.status === 0 ? spawnSync(process.execPath, ['--input-type=module', '-e', "await import('dsh-pamyat-storozha')"], { cwd: project, encoding: 'utf8', timeout: 10000 }) : null
    const good = withSibling ? q.status === 0 && loaded.status === 0
      : q.status === 0 ? loaded.status === 0 : /dsh-pamyat-kompakt/.test(q.stderr)
    console.log(`${good ? '✅' : '❌'} 01 ${withSibling ? 'explicit local sibling installs and imports' : 'missing sibling cannot produce a successful broken installation'}: install=${q.status}, import=${loaded?.status ?? 'not run'}`)
    if (!good) { failures++; console.log((loaded?.stderr ?? q.stderr).slice(0, 1200)) }
  }
} catch (e) {
  console.log('СЛЕПОТА: local npm/package copies unavailable: '+e.message); process.exitCode = 2
} finally { rmSync(temp, { recursive: true, force: true }) }
if (process.exitCode !== 2) process.exitCode = failures ? 1 : 0
