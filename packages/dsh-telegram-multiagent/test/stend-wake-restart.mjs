// RU: Изолированный стенд stend-wake-restart.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-wake-restart.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'wake-restart-'));
let l=new MessageReceipts(root,{owner:'old-process'});let sent=0,wakes=0;
const s={id:'s',header:{createdAt:1},events:[]};
const agent={session:s,status:'idle',inbox:{hasPending:true},send(m,target){sent++;s.events.push({type:'agent/inbox/spliced',data:{target,start:999,removedCount:0,inserted:[m]}});},wakeDriver(){wakes++;}};
const sessions={flush:async()=>true};let rt=new ReceiptRuntime(l,sessions);
try {
 const r=l.receive('one','one',{logicalKey:'one'});await rt.enqueue(r,agent,()=>({id:'m1',content:[]}),'a2a');
 s.events.push({type:'turn/start',data:{turn:1}},{type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[]}});
 await rt.observe(s,1);const history=JSON.parse(JSON.stringify(s));l.close();l=new MessageReceipts(root,{owner:'new-process'});rt=new ReceiptRuntime(l,sessions);agent.session=history;
 await rt.observe(history,null,true);assert.equal(l.get(r.id).blocked,'interrupted_unknown');
 assert.equal(await rt.wake(agent,r.id),false);assert.equal(sent,1);assert.equal(wakes,1);
 const done=l.receive('done','done',{logicalKey:'done'});l.completeLocal(done.id,'turn_completed','done');assert.equal(await rt.wake(agent,done.id),false);
 console.log('PASS reopened SQLite with changed process owner: unknown held, completed no wake');
} finally {l.close();fs.rmSync(root,{recursive:true,force:true});}
