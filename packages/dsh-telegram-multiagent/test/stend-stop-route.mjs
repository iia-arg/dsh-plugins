// RU: Изолированный стенд stend-stop-route.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-stop-route.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {pathToFileURL} from 'node:url';
import {CodexTaskControl} from '../src/codex-task-control.js';import {MessageReceipts,ustanovitIstochnikPomoshchnika} from '../src/message-receipts.js';
assert.equal(typeof CodexTaskControl.prototype.stop,'function','need a bound current-turn stop route');
const gateway=process.env.GATEWAY_CANDIDATE;
if(!gateway){console.error('СЛЕПОТА: задайте GATEWAY_CANDIDATE для реального исходника шлюза');process.exit(2);}
const controlFile=path.join(gateway,'task-control.mjs');
try { fs.accessSync(controlFile,fs.constants.R_OK); }
catch (error) {
 if (error.code==='ENOENT') {
  console.error(`КРАСНЫЙ: шлюз ${controlFile}: нет обязательного файла (ENOENT)`);
  process.exit(1);
 }
 if (!['EACCES','EPERM'].includes(error.code)) throw error;
 console.error(`СЛЕПОТА: шлюз ${controlFile}: нет доступа под ${os.userInfo().username} (uid ${process.geteuid()}) (${error.code})`);
 process.exit(2);
}
const {TaskControlRouter}=await import(pathToFileURL(controlFile));const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stop-route-'));const l=new MessageReceipts(dir);ustanovitIstochnikPomoshchnika(()=>({sobytiyaSessii:s=>s.events}));
const router=new TaskControlRouter();const server=http.createServer((q,s)=>router.handle(q,s));await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const session={id:'s',header:{createdAt:1},events:[{type:'turn/start',data:{turn:1}}]};const agent={session,status:'running'};const svc=new CodexTaskControl(l,'workertwo');const lease=svc.attach(agent,url,{allowCancel:false});let calls=0,finish;let mode='ok';let close=router.register(lease.descriptor,async p=>{calls++;assert.equal(p.op,'stop');if(mode==='wait')await new Promise(r=>finish=r);return {accepted:true,operation:'stop',codex:{thread_id:'t',turn_id:'u'}};});
try{
 assert.equal(svc.adapter(),undefined,'legacy A2A stays off');assert.deepEqual(lease.descriptor.operations,['stop']);assert.equal((await svc.stop(agent,'T1')).state,'interrupting');assert.equal(calls,1);assert.equal((await svc.stop(agent,'T1')).state,'interrupting');assert.equal(calls,1);const view={session:{...session},status:'running'};assert.equal((await svc.stop(view,'alias')).state,'interrupting','same session viewed from another Cordis scope');assert.equal(calls,2);console.log('PASS bound stop; duplicate; legacy off; alternate view');
 const extra=svc.attach(agent,url,{allowCancel:false});assert.notEqual((await svc.stop(agent,'T2')).state,'interrupting');assert.equal(calls,2);extra.close();console.log('PASS ambiguous requests refuse');
 mode='wait';const pending=svc.stop(agent,'T3');while(!finish)await new Promise(r=>setImmediate(r));session.events.push({type:'turn/end',data:{turn:1}},{type:'turn/start',data:{turn:2}});finish();assert.notEqual((await pending).state,'interrupting');console.log('PASS next turn not claimed by old ACK');
 session.events.push({type:'turn/end',data:{turn:2}});agent.status='idle';assert.equal((await svc.stop(agent,'T4')).state,'idle');console.log('PASS idle no request');
}finally{close();lease.close();server.closeAllConnections();await new Promise(r=>server.close(r));l.close();fs.rmSync(dir,{recursive:true,force:true});}
