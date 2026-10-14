// One reader/npm entry for the actual Python CLI-fixture suite. No live data/services.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const r = spawnSync('python3', [fileURLToPath(new URL('./audit-bin.py', import.meta.url))], {
  env: process.env, stdio: 'inherit', timeout: 90000,
})
if (r.error || r.signal) console.error('СЛЕПОТА: audit-bin fixture runner did not complete')
process.exit(r.status ?? 2)
