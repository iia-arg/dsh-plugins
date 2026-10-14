import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {apply} from '../src/index.js';import {otkrytHranilishche} from '../src/hranilishche.js';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
// RU: A-N-1948 №3 (№8): код 2 дочернего стенда — его СЛЕПОТА (нет предмета или условий), а не расхождение: собственные пробы идут дальше,
//     итог — код 2 с перечнем слепых. Код 1 ребёнка — по-прежнему красное.
// EN: A-N-1948 №3 (№8): a child exit 2 is its blindness, not a mismatch: own probes continue, the result is exit 2; a child exit 1 stays red.
const slepye=[];
for(const name of ['stend-otnoshenij.mjs','stend-instrumenta-otnoshenij.mjs']){
 const r=spawnSync(process.execPath,[new URL(name,import.meta.url).pathname],{encoding:'utf8',env:process.env});
 if(r.status===2){slepye.push(name+': '+(((r.stdout+r.stderr).split('\n').find(l=>l.includes('СЛЕПОТА'))??'код 2').trim().slice(0,160)));continue}
 assert.equal(r.status,0,r.stdout+r.stderr);assert.ok(!(r.stdout+r.stderr).includes('РАСХОЖДЕНИЕ счёта памяти'),name+' создаёт ложный шум');console.log('PASS quiet',name);
}
const root=vremennyj(path.join(tmpdir(),'real-agent-count-'));let h;const original=console.error;const lines=[];
try{
 console.error=(...x)=>lines.push(x.join(' '));let service;const db=path.join(root,'probe.db');apply({provide:(n,s)=>{if(n==='pamyat')service=s},on(){}},{putBazy:db,agent:'gamma'});h=otkrytHranilishche(db);
 service.zapisat({klass:'fakt',soderzhim:'обычная проба',podtverzhdenie:'allowed-once'});lines.length=0;assert.equal(service.svodka().novayaRaznica,0);assert(!lines.some(x=>x.includes('РАСХОЖДЕНИЕ')));
 const bad=h.zapisat({agent:'gamma',klass:'fakt',soderzhim:'намеренная запись мимо журнала'});service.svodka();assert(lines.some(x=>x.includes('РАСХОЖДЕНИЕ счёта памяти агента gamma')));
 h.baza.prepare('DELETE FROM zapisi WHERE id=?').run(bad);lines.length=0;assert.equal(service.svodka().novayaRaznica,0);assert(!lines.some(x=>x.includes('РАСХОЖДЕНИЕ')));
}finally{console.error=original;h?.baza.close();rmSync(root,{recursive:true,force:true})}
console.log('PASS gamma isolated: consistent → real mismatch still named → restored');
if(slepye.length){console.log('СЛЕПОТА: дочерних стендов '+slepye.length+' — '+slepye.join(' · '));process.exit(2)}
