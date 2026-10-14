// RU: Изолированный стенд stend-new-freeze.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-new-freeze.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts,ustanovitIstochnikPomoshchnika} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'new-freeze-'));const l=new MessageReceipts(root);ustanovitIstochnikPomoshchnika(()=>({sobytiyaSessii:s=>s.events}));
try{for(const op of ['pre-step','wake']){
 let held=false,release,started,nextCalls=0,wakes=0,hook;const entered=new Promise(r=>started=r);
 const rt=new ReceiptRuntime(l,{flush:()=>{started();return new Promise(r=>release=()=>r(true))}},()=>{});rt.conversationSessions={holdsSession:()=>held};rt.wakeGate={request:()=>{wakes++;return true}};
 const agent={session:{id:'s',header:{createdAt:1},events:[]}};
 rt.install({on:(name,fn)=>{hook=fn;return()=>{}}});
 const run=op==='pre-step'?hook({agent,turn:1},()=>{nextCalls++;return {kind:'enter'}}):rt.wake(agent,'none');
 const rejected=assert.rejects(run,/удержана/);await entered;held=true;release();await rejected;assert.equal(nextCalls,0);assert.equal(wakes,0);
}console.log('PASS freeze installed during flush prevents model path and wake');}finally{l.close();fs.rmSync(root,{recursive:true,force:true})}
