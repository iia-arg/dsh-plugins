#!/usr/bin/env node
// @root: lifecycle history is judged only by the root watcher; all commands below are fixture stubs.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (process.getuid?.() !== 0) {
  console.log('СЛЕПОТА: stend-preset-lifecycle требует root (@root), живые службы/журналы/канал не вызывает');
  process.exit(2);
}
const test = fileURLToPath(new URL('./test_preset_lifecycle.py', import.meta.url));
const result = spawnSync('/usr/bin/python3', ['-I', '-B', test], { encoding: 'utf8', timeout: 60000 });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error || result.signal || result.status === null) process.exit(2);
process.exit(result.status === 0 ? 0 : 1);
