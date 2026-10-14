// RU: Изолированный стенд stend-receipt-sigkill.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipt-sigkill.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import {testPlatform} from './test-platform.mjs';

await testPlatform();
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const worker=new URL('./receipt-kill-worker.mjs',import.meta.url).pathname;
for(const stage of ['received','queued','claim-flushed','claimed','finished']) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-kill-'));
 const child=spawn(process.execPath,[worker,root,'write',stage],{stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d);let timer;
 try {
 const ready=await new Promise((resolve,reject)=>{let out='';timer=setTimeout(()=>reject(Error('timeout '+stderr)),10000);child.stdout.on('data',d=>{out+=d;if(out.includes('\n'))resolve(JSON.parse(out.split('\n')[0]));});child.on('exit',code=>reject(Error('early exit '+code+' '+stderr)));});
 clearTimeout(timer);assert.equal(ready.pid,child.pid);const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.kill('SIGKILL');assert.equal((await exited).signal,'SIGKILL');
 const read=spawnSync(process.execPath,[worker,root,'read',stage],{encoding:'utf8',timeout:10000});assert.equal(read.status,0,read.stderr);const result=JSON.parse(read.stdout);
 assert.equal(result.id,ready.id);assert.equal(result.raw,'kill-test');assert.equal(result.pending,stage==='queued'?1:0);assert.equal(result.source,stage==='received');
 if(['claimed','claim-flushed'].includes(stage))assert(result.blocked==='interrupted_unknown'||result.outcome==='interrupted_unknown',JSON.stringify(result));if(stage==='finished')assert.equal(result.outcome,'turn_completed');
 console.log('PASS SIGKILL '+stage+' '+JSON.stringify({pid:ready.pid,...result}));
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');fs.rmSync(root,{recursive:true,force:true});}
}
