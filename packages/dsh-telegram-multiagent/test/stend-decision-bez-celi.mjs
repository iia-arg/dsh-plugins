// RU: Изолированный стенд stend-decision-bez-celi.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-decision-bez-celi.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts,mailEnvelope} from '../src/message-receipts.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';

import {podnyatPlatformu02} from './platforma-02.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'b714-'));let ok=0,fail=0;
const {sozdatAgenta}=await podnyatPlatformu02({root:path.join(tmp,'platforma')});
async function fixture(name){
  const root=path.join(tmp,name);const ledger=new MessageReceipts(root,{owner:'fixture'});
  const zhivoj=await sozdatAgenta('fx-'+name);const session=zhivoj.session;const inbox=zhivoj.inbox;
  const agent={session,inbox,status:'idle',send:async(m)=>inbox.append('next-turn',m),wakeDriver(){}};
  const runtime=new ReceiptRuntime(ledger,{async flush(){return true;}},()=>{});const uuid=ledger.protocolIdentity();
  function send(id,meta){const raw=Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify(meta)+'\nтело '+id);
    const e=mailEnvelope(raw),r=ledger.receive(id,raw,{logicalKey:e.logicalKey});return {id:r.id,accept:ledger.acceptEnvelope(r.id,e.protocol,'workertwo')};}
  const decision=(id,target,extra={})=>send(id,{kind:'decision',delivery_id:id,decision_id:id,recipient:{id:'workertwo',ledger_uuid:uuid},
    ...(target===undefined?{}:{supersedes:{recipient:'workertwo',ledger_uuid:uuid,decision_id:target}}),...extra});
  const env=id=>ledger.db.prepare('SELECT state,reason FROM protocol_envelopes WHERE receipt_id=?').get(id);
  const indexed=id=>!!ledger.db.prepare('SELECT 1 FROM decision_index WHERE recipient=? AND decision_id=?').get('workertwo',id);
  const enqueue=async(id,text)=>runtime.enqueue(ledger.get(id),agent,()=>({id:'msg-'+id,role:'user',content:[{type:'text',text}]}),'a2a');
  return {ledger,session,inbox,runtime,agent,uuid,send,decision,env,indexed,enqueue};
}
async function proba(imya,f){try{const r=await f();if(r!==undefined)throw new Error('тело пробы вернуло значение ('+JSON.stringify(r)+') — проба обязана бросать, а не возвращать');ok++;console.log('  ✅ '+imya);}catch(e){fail++;console.log('  ❌ '+imya+' — '+String(e.message).slice(0,160));}}
try{
  await proba('1 цели нет → выпущено (target_absent_released), решение зарегистрировано',async()=>{
    const f=await fixture('c1');const A=f.decision('A','seed');assert.equal(A.accept.action,'held');
    const r=await f.runtime.cancelPending(A.id,f.agent);
    assert.equal(r.action,'text');assert.equal(f.env(A.id).state,'released_text');assert.equal(f.env(A.id).reason,'target_absent_released');
    assert.equal(f.ledger.get(A.id).dispatch_started,0);assert.equal(f.indexed('A'),true);f.ledger.close();});
  await proba('2 supersedes нет вовсе → выпущено (no_target_released), решение зарегистрировано',async()=>{
    const f=await fixture('c2');const A=f.decision('A',undefined);assert.equal(f.env(A.id).reason,'awaiting_cancellation');
    const r=await f.runtime.cancelPending(A.id,f.agent);
    assert.equal(r.action,'text');assert.equal(f.env(A.id).reason,'no_target_released');assert.equal(f.indexed('A'),true);f.ledger.close();});
  await proba('3 цепочка без ручного выпуска: A выпущено само, B снимает A до исполнения и выпускается',async()=>{
    const f=await fixture('c3');const A=f.decision('A','seed');const ra=await f.runtime.cancelPending(A.id,f.agent);assert.equal(ra.action,'text');
    await f.enqueue(A.id,ra.text);assert.equal(f.inbox.hasPending,true);
    const B=f.decision('B','A');const rb=await f.runtime.cancelPending(B.id,f.agent);
    assert.equal(rb.action,'text');assert.equal(f.ledger.get(A.id).outcome,'canceled_before_run');assert.equal(f.inbox.hasPending,false);
    assert.equal(f.env(B.id).reason,'target_canceled');f.ledger.close();});
  await proba('4 цель уже в ходе → B удержано target_running, не передано',async()=>{
    const f=await fixture('c4');const A=f.decision('A','seed');const ra=await f.runtime.cancelPending(A.id,f.agent);await f.enqueue(A.id,ra.text);
    f.session.append('turn/start',{turn:1});f.inbox.claim('next-turn',1);
    const B=f.decision('B','A');const rb=await f.runtime.cancelPending(B.id,f.agent);
    assert.equal(rb.action,'held');assert.equal(rb.reason,'target_running');assert.equal(f.ledger.get(B.id).dispatch_started,0);f.ledger.close();});
  await proba('5 неверный ledger_uuid → удержание recipient_or_decision_invalid, НЕ выпуск',async()=>{
    const f=await fixture('c5');const B=f.send('B',{kind:'decision',delivery_id:'B',decision_id:'B',recipient:{id:'workertwo',ledger_uuid:'00000000-0000-0000-0000-000000000000'},
      supersedes:{recipient:'workertwo',ledger_uuid:f.uuid,decision_id:'seed'}});
    assert.equal(B.accept.action,'held');assert.equal(f.env(B.id).reason,'recipient_or_decision_invalid');
    const r=await f.runtime.cancelPending(B.id,f.agent);assert.equal(r.action,'held');assert.equal(f.ledger.get(B.id).dispatch_started,0);
    assert.equal(f.indexed('B'),false);f.ledger.close();});
  await proba('6 supersedes есть, но id негодный → target_missing, как было',async()=>{
    const f=await fixture('c6');const B=f.decision('B','');assert.equal(B.accept.action,'held');assert.equal(f.env(B.id).reason,'target_missing');
    const r=await f.runtime.cancelPending(B.id,f.agent);assert.equal(r.action,'held');f.ledger.close();});
  await proba('7 B пришло РАНЬШЕ A → B выпущено, A удержано superseded_before_arrival и НЕ выпущено',async()=>{
    const f=await fixture('c7');const B=f.decision('B','A');const rb=await f.runtime.cancelPending(B.id,f.agent);
    assert.equal(rb.action,'text');assert.equal(f.env(B.id).reason,'target_absent_released');
    const A=f.decision('A','seed');assert.equal(A.accept.action,'held');assert.equal(f.env(A.id).reason,'superseded_before_arrival');
    const ra=await f.runtime.cancelPending(A.id,f.agent);assert.equal(ra.action,'held');assert.equal(f.ledger.get(A.id).dispatch_started,0);
    assert.equal(f.indexed('A'),false);
    assert.ok(f.ledger.db.prepare("select count(*) n from outbox where receipt_id=? and body like '%superseded_before_arrival%'").get(A.id).n>=1,'письма отправителю нет');
    f.ledger.close();});


  const bNegodnoePervym=(imya,fx,sendB,prichina)=>proba(imya,async()=>{
    const f=await fixture(fx);const B=sendB(f);assert.equal(f.env(B.id).reason,prichina);
    const A=f.decision('A','seed');assert.equal(f.env(A.id).reason,'awaiting_cancellation');
    const ra=await f.runtime.cancelPending(A.id,f.agent);assert.equal(ra.action,'text');assert.equal(f.indexed('A'),true);f.ledger.close();});
  await bNegodnoePervym('8 негодное B (чужой ledger получателя) раньше A → A выпущено','c8',f=>f.send('B',{kind:'decision',delivery_id:'B',decision_id:'B',
    recipient:{id:'workertwo',ledger_uuid:'00000000-0000-0000-0000-000000000000'},supersedes:{recipient:'workertwo',ledger_uuid:f.uuid,decision_id:'A'}}),'recipient_or_decision_invalid');
  await bNegodnoePervym('9 негодное B (чужой получатель) раньше A → A выпущено','c9',f=>f.send('B',{kind:'decision',delivery_id:'B',decision_id:'B',
    recipient:{id:'workerthree',ledger_uuid:f.uuid},supersedes:{recipient:'workertwo',ledger_uuid:f.uuid,decision_id:'A'}}),'recipient_mismatch');
  await bNegodnoePervym('10 B с занятым decision_id раньше A → A выпущено','c10',f=>{f.decision('B',undefined);
    return f.send('B2',{kind:'decision',delivery_id:'B2',decision_id:'B',recipient:{id:'workertwo',ledger_uuid:f.uuid},
      supersedes:{recipient:'workertwo',ledger_uuid:f.uuid,decision_id:'A'}});},'decision_identity_conflict');


  const pisemUderzhano=(f,id,like='')=>f.ledger.db.prepare("select count(*) n from outbox where receipt_id=? and body like ?").get(id,'УДЕРЖАНО%'+like+'%').n;
  await proba('11 цели нет → выпущено, писем «УДЕРЖАНО» отправителю 0',async()=>{
    const f=await fixture('c11');const A=f.decision('A','net-takogo');const r=await f.runtime.cancelPending(A.id,f.agent);
    assert.equal(r.action,'text');assert.equal(pisemUderzhano(f,A.id),0,'письмо удержания при выпуске');f.ledger.close();});
  await proba('12 supersedes нет → выпущено, писем «УДЕРЖАНО» 0',async()=>{
    const f=await fixture('c12');const A=f.decision('A',undefined);const r=await f.runtime.cancelPending(A.id,f.agent);
    assert.equal(r.action,'text');assert.equal(pisemUderzhano(f,A.id),0,'письмо удержания при выпуске');f.ledger.close();});
  await proba('13 цель в ходе → удержано, письмо «УДЕРЖАНО … target_running» есть',async()=>{
    const f=await fixture('c13');const A=f.decision('A','seed');const ra=await f.runtime.cancelPending(A.id,f.agent);await f.enqueue(A.id,ra.text);
    f.session.append('turn/start',{turn:1});f.inbox.claim('next-turn',1);
    const B=f.decision('B','A');const rb=await f.runtime.cancelPending(B.id,f.agent);assert.equal(rb.reason,'target_running');
    assert.ok(pisemUderzhano(f,B.id,'target_running')>=1,'письма удержания нет');f.ledger.close();});
  await proba('14 cancelPending не отработал → holdTick шлёт «УДЕРЖАНО … envelope_held» (не немо)',async()=>{
    const f=await fixture('c14');const A=f.decision('A','net-takogo');f.ledger.holdTick();
    assert.ok(pisemUderzhano(f,A.id,'envelope_held')>=1,'удержание немое');f.ledger.close();});
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log(`итог: ${ok} из ${ok+fail}`);process.exit(fail?1:0);
