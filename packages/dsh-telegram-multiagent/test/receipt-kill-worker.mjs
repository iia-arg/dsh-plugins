// RU: Изолированный стенд receipt-kill-worker.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness receipt-kill-worker.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import fs from 'node:fs';import path from 'node:path';
import {MessageReceipts,sobytiyaSessii} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';
const [root,mode,stage]=process.argv.slice(2);
if(!root?.includes('/receipt-kill-')||!['write','read'].includes(mode)||!['received','queued','claim-flushed','claimed','finished'].includes(stage))throw Error('Refuse non-test input');


import {podnyatPlatformu02} from './platforma-02.mjs';
const {sessions,agents,sozdatAgenta,llm}=await podnyatPlatformu02({root:path.join(root,'sessions')});
const {createUserMessage,createAssistantMessage}=llm;
const l=new MessageReceipts(path.join(root,'ledger')),rt=new ReceiptRuntime(l,sessions,(message)=>console.error(message));
const zhivoj=mode==='read'?(await agents.resume({resumeSessionId:'probe'})).agent:await sozdatAgenta('probe');
const session=zhivoj.session,inbox=zhivoj.inbox;
if(mode==='read') {
 await rt.observe(session);
 const r=l.db.prepare('SELECT * FROM receipts').get();
 const out={id:r.id,dsh:r.dsh_id,blocked:r.blocked,outcome:r.outcome,pending:[...inbox.nextTurn,...inbox.nextStep].filter(m=>m.id===r.dsh_id).length,raw:Buffer.from(r.raw).toString(),source:fs.existsSync(path.join(root,'source.txt')),events:sobytiyaSessii(session).filter(e=>e.type==='agent/inbox/spliced').map(e=>e.data)};
 fs.writeSync(1,JSON.stringify(out)+'\n');l.close();process.exit(0);
}
session.append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:0,inserted:[]});await sessions.flush(session);fs.writeFileSync(path.join(root,'source.txt'),'kill-test');
const r=l.receive('source','kill-test',{sourcePath:path.join(root,'source.txt'),logicalKey:'test-stable'});
if(stage!=='received')await rt.enqueue(r,{session,send:(m,t)=>inbox.append(t,m),wakeDriver(){}},()=>createUserMessage({content:[{type:'text',text:'test-only'}],source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:test'}}),'a2a','source');
if(['claim-flushed','claimed','finished'].includes(stage)) {session.append('turn/start',{turn:1});inbox.claim('next-turn',1);if(stage==='claim-flushed')await sessions.flush(session);else await rt.observe(session,1);}
if(stage==='finished') {session.append('step/start',{turn:1,step:1});session.append('assistant/message',{turn:1,step:1,stream:[],message:createAssistantMessage({content:[{type:'text',text:'done'}],source:{provider:'test',model:'test'}})},{surfaceOp:'append'});session.append('step/end',{turn:1,step:1});session.append('turn/end',{turn:1,reason:{kind:'completed'}});await rt.observe(session);}
fs.writeSync(1,JSON.stringify({ready:true,pid:process.pid,stage,id:r.id})+'\n');setInterval(()=>{},1000);
