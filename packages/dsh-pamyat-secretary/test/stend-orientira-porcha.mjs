// RU: Проверяем тревогу ориентира на неизвестную фразу и восстановление после снятия порчи. При расхождении со старым деревом сверяй версии кода, не ослабляй ожидания стенда.
// EN: Test the guideline detector’s alert for an unknown phrase and recovery after removing the mutation. If it disagrees with an older tree, compare code versions rather than weaken test expectations.
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временное дочернего процесса убирает сам процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process cleans its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
const kat=vremennyj(join(tmpdir(),'orientir-porcha-'));
try {
 cpSync(new URL('../src',import.meta.url),join(kat,'src'),{recursive:true});
 writeFileSync(join(kat,'package.json'),'{"type":"module"}');
 const path=join(kat,'src/promty.js');const good=readFileSync(path,'utf8');
 const marker='Размер статьи — не более 3000 знаков';   /* RU: Проверяем обновлённую формулировку KONEC_STATI.
 * EN: Test the updated KONEC_STATI wording.
 */
 assert.equal(good.split(marker).length-1,1);
 const run=broken=>{
  const r=spawnSync(process.execPath,[new URL('./stend-predela-stati.mjs',import.meta.url).pathname],{env:{...process.env,SECRETARY_SOURCE:join(kat,'src'),BROKEN_PHRASE:broken?'1':'0'},encoding:'utf8',timeout:30000});
  process.stdout.write(r.stdout);assert.equal(r.status,0,r.stderr);
 };
 run(false);
 const bad=good.replace(marker,'Пиши содержательно, точность важнее длины');writeFileSync(path,bad);
 const hash=s=>createHash('sha256').update(s).digest('hex');
 console.log('ПОРЧА: замен фразы 1; SHA256',hash(good),'→',hash(readFileSync(path)));
 assert.notEqual(hash(good),hash(readFileSync(path)));assert.equal(readFileSync(path,'utf8').split(marker).length-1,0);
 run(true);
 writeFileSync(path,good);assert.equal(hash(readFileSync(path)),hash(good));run(false);
 console.log('PASS: годный прибор → крик слепоты → снова годный');
} finally {rmSync(kat,{recursive:true,force:true});}
