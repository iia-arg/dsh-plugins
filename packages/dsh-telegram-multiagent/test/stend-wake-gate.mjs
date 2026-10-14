// RU: Изолированный стенд stend-wake-gate.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-wake-gate.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';

const {WakeGate}=await import('../src/wake-gate.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'wake-gate-'));let ledger=new MessageReceipts(root);let wakes=0;
const session={id:'s',header:{createdAt:1},events:[]};const agent={session,inbox:{hasPending:true},status:'idle',wakeDriver(){wakes++;}};
function fresh(key){const r=ledger.receive(key,key,{logicalKey:key});ledger.prepare(r.id,{id:key,content:[]},session,'a2a');session.events.push({type:'agent/inbox/spliced',data:{target:'next-turn',start:999,removedCount:0,inserted:[{id:key}]}});ledger.db.prepare('UPDATE receipts SET dispatch_started=1,flushed_at=1 WHERE id=?').run(r.id);return r;}
session.events.push({type:'turn/end',data:{reason:{kind:'error',error:{message:'quota'}}}});const make=()=>new WakeGate(ledger);
try {
 const r=fresh('one');let gate=make();
 for(let i=0;i<10;i++)gate.request(agent,r.id);
 assert.equal(wakes,3);assert.equal(ledger.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE 'wake-stop:%'").get().n,1);
 ledger.close();ledger=new MessageReceipts(root);gate=make();gate.request(agent,r.id);assert.equal(wakes,3,'restart keeps limit');
 session.events.push({type:'turn/end',data:{reason:{kind:'error',error:{message:'different refusal'}}}});gate.request(agent,r.id);assert.equal(wakes,4,'different failure resets');
 for(let i=0;i<10;i++)gate.request(agent,r.id);assert.equal(wakes,6);
 session.events.push({type:'turn/end',data:{reason:{kind:'error',error:{message:'quota'}}}});
 for(let i=0;i<10;i++)gate.request(agent,r.id);assert.equal(wakes,9);
 assert.equal(ledger.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE 'wake-stop:%'").get().n,3,'A/B/A needs one alert per episode');
 const other=fresh('two');gate.request(agent,other.id);assert.equal(wakes,10,'new letter resets');
 ledger.completeLocal(other.id,'turn_completed','done');gate.request(agent,other.id);assert.equal(wakes,10);
 const unknown=fresh('unknown');ledger.completeLocal(unknown.id,'interrupted_unknown','unknown');gate.request(agent,unknown.id);assert.equal(wakes,10);
 const claimed=fresh('claimed');ledger.db.prepare('UPDATE receipts SET claimed_turn=7 WHERE id=?').run(claimed.id);gate.request(agent,claimed.id);assert.equal(wakes,10);
 const clean=fresh('clean');gate.request(agent,clean.id);assert.equal(wakes,11);
 console.log('PASS K=3/one alert/restart/change/new receipt; completed=0 unknown=0 claimed=0 fresh=1');
} finally {ledger.close();fs.rmSync(root,{recursive:true,force:true});}
