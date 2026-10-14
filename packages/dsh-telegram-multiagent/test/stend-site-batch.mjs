// RU: Изолированный стенд stend-site-batch.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-site-batch.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';import {ConversationSessions} from '../src/conversation-sessions.js';import {GuestCopies} from '../src/guest-channel.js';import {SiteChannel} from '../src/site-channel.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-batch-'));const l=new MessageReceipts(path.join(root,'ledger')),c=new ConversationSessions(l);const sent=[];try{
 for(const dir of ['vhod','kopii','vyhod','state'])fs.mkdirSync(path.join(root,dir));
 const copies=new GuestCopies(l,{owner:()=>158901453,targets:()=>[{kind:'telegram',id:158901453}],sendTelegram:async(_,text)=>sent.push(text)});
 const site=new SiteChannel({owner:()=>158901453,ledger:l,conversations:c,copies,spool:root,state:path.join(root,'state/zakryto'),stop:async()=>{},dispatch:async r=>{const header={id:'telegram-site-1',createdAt:1};c.pin('site-1',header);l.prepare(r.id,{id:r.id},{id:header.id,header},'site-1');l.db.prepare('UPDATE receipts SET claimed_turn=1 WHERE id=?').run(r.id);}});
 for(const id of ['a','b'])fs.writeFileSync(path.join(root,'vhod',id+'.json'),JSON.stringify({v:1,id,conversation_id:1,message_id:id==='a'?1:2,text:'hello '+id,received_at:Date.now()/1000}));
 await site.poll();for(const r of l.db.prepare("SELECT * FROM receipts WHERE route='site'").all())l.completeLocal(r.id,'turn_completed','one answer');copies.prepare();await l.deliverResults(r=>site.deliver(r));await l.deliverResults(r=>copies.deliver(r),{copyOnly:true});
 assert.equal(sent.filter(s=>s.includes('sender.type=visitor')).length,2);assert.equal(sent.filter(s=>s.includes('sender.type=assistant')).length,1);assert.equal(fs.readdirSync(path.join(root,'vyhod')).length,1);console.log('PASS two questions in one model turn: two input copies, one answer copy, one output envelope');
}finally{l.close();fs.rmSync(root,{recursive:true,force:true});}
