// RU: Изолированный стенд stend-receipts.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipts.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts,mailEnvelope,receiptFacts} from '../src/message-receipts.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipts-'));let clock=100000;
const ledger=path.join(root,'ledger');let r=new MessageReceipts(ledger,{now:()=>clock});
const session={id:'test',header:{createdAt:42},events:[]};
const append=(type,data)=>session.events.push({seq:session.events.length,type,data});
const message={id:'dsh-1',role:'user',content:[{type:'text',text:'work'}]};
try{
 const src=path.join(root,'letter.txt');fs.writeFileSync(src,'work');
 const a=r.receive('source:a','work',{sourcePath:src,logicalKey:'mail:a'});
 assert.equal(r.receive('source:a','work').id,a.id);
 assert.equal(r.receive('source:alias','work',{logicalKey:'mail:a'}).id,a.id);
 assert.throws(()=>r.receive('source:a','changed'),/identity/);
 r.prepare(a.id,message,session,'a2a');let sends=0;
 const contains=id=>session.events.some(e=>e.type==='agent/inbox/spliced'&&e.data.inserted.some(m=>m.id===id));
 const send=async m=>{sends++;append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:0,inserted:[m]});};
 await assert.rejects(r.queue(a.id,{contains,send,flush:async()=>false}),/persistence/);
 assert.throws(()=>r.release(a.id,'source:a'),/not flushed/);assert(fs.existsSync(src));
 await r.queue(a.id,{contains,send,flush:async()=>true});r.release(a.id,'source:a');assert(!fs.existsSync(src));
 assert.equal(sends,1);assert.equal(fs.readFileSync(r.source('source:a').archive_path,'utf8'),'work');
 append('turn/start',{turn:1});append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:1,inserted:[]});
 r.reconcile(session,1);assert.equal(r.get(a.id).claimed_turn,1);
 r.close();r=new MessageReceipts(ledger,{now:()=>clock,owner:'restarted-process'});
 assert.throws(()=>r.reconcile(session,1),/Повторное исполнение/,'claim from dead owner must not execute again');
 console.log('PASS receipt/flush/source release; durable ID; restart refuses uncertain claim');
 append('assistant/message',{turn:1,message:{content:[{type:'text',text:'done'}]}});append('turn/end',{turn:1,reason:{kind:'completed'}});
 r.reconcile(session);assert.equal(r.get(a.id).outcome,'turn_completed');r.reconcile(session);
 assert.equal(r.db.prepare('SELECT count(*) n FROM outbox').get().n,1);
 const b=r.receive('legacy:first','legacy');const c=r.receive('legacy:second','legacy');assert.equal(c.blocked,'legacy_ambiguous');
 assert.throws(()=>r.prepare(c.id,message,session,'a2a'),/не готов/);
 r.holdTick();clock+=3600000;r.holdTick();clock+=86400000;r.holdTick();
 assert.equal(r.get(c.id).hold_notices,3);
 assert(r.db.prepare("SELECT body FROM outbox WHERE id=?").get(c.id+':held:2').body.includes('СРОК РАЗБОРА'));
 r.resolve(c.id,'approve-new','координатор','decision-20260918');assert.equal(r.get(c.id).blocked,null);
 const d=r.receive('legacy:third','legacy');r.resolve(d.id,'discard','координатор','decision-2');assert.equal(r.get(d.id).outcome,'operator_discarded');
 console.log('PASS legacy hold visible; 1h/24h deadline; explicit approve/discard');
 assert.equal(mailEnvelope('[delivery-v1 id=abc reply=no]\nbody').expectsReply,false);
 assert.equal(mailEnvelope('body').logicalKey,null);
 assert.throws(()=>mailEnvelope(Buffer.from([255])),/UTF-8/);
 let attempts=0;for(let i=0;i<8;i++){clock+=700000;await r.deliverResults(async()=>{attempts++;throw Error('offline');});}
 {const _r=r.db.prepare('SELECT attempts FROM outbox').all();assert(_r.length>0 && _r.every(x=>x.attempts===5));}
 console.log('PASS result retries stop at five; envelope validation');
 const seed={id:'seed',header:{seedLength:2},events:[{type:'agent/inbox/spliced',data:{target:'next-turn',start:0,inserted:[message]}},{type:'turn/start',data:{turn:0}}]};
 assert.equal(receiptFacts(seed,[message.id]).get(message.id).claims.length,0);
 console.log('PASS seed history is not current inbox');
}finally{r.close();fs.rmSync(root,{recursive:true,force:true});}
