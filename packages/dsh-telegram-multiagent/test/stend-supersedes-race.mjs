import {ordinaryMailControl} from './ordinary-mail-control-fixture.mjs';
// RU: Изолированный стенд stend-supersedes-race.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-supersedes-race.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts,mailEnvelope,sobytiyaSessii} from '../src/message-receipts.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {coordinatorFixture} from './coordinator-fixture.mjs';


import {podnyatPlatformu02} from './platforma-02.mjs';
assert.equal(typeof ReceiptRuntime.prototype.cancelPending,'function','K2 missing');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'k2-race-'));let count=0;
const {sozdatAgenta,llm}=await podnyatPlatformu02({root:path.join(tmp,'platforma')});

const otvet=t=>llm.createAssistantMessage({content:[{type:'text',text:t}],source:{provider:'test',model:'test'}});
function sPodmenoj(nastoyashchaya,podmena){return new Proxy(nastoyashchaya,{get(t,k){if(Object.hasOwn(podmena,k))return podmena[k];const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;},set(t,k,v){podmena[k]=v;return true;}});}
async function fixture(name){
 const root=path.join(tmp,name);const ledger=new MessageReceipts(root,{owner:'fixture'});const zhivoj=await sozdatAgenta('fx-'+name);const podmena={};const session=sPodmenoj(zhivoj.session,podmena);
 const inbox=zhivoj.inbox;let flushOK=true;let saved=[];
 const sessions={async flush(s){if(!flushOK)return false;saved=structuredClone(sobytiyaSessii(s));return true;}};
 const agent={session,inbox,status:'idle',send:async(m)=>inbox.append('next-turn',m),wakeDriver(){}};
 const runtime=new ReceiptRuntime(ledger,sessions,()=>{});const uuid=ledger.protocolIdentity();
 function decision(id,target){const raw=Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({kind:'decision',delivery_id:id,decision_id:id,recipient:{id:'workertwo',ledger_uuid:uuid},supersedes:{recipient:'workertwo',ledger_uuid:uuid,decision_id:target}})+'\nfixture '+id);const e=mailEnvelope(raw),r=ledger.receive(id,raw,{logicalKey:e.logicalKey});ledger.acceptEnvelope(r.id,e.protocol,'workertwo');return r.id;}
 const A=decision('A','seed');ledger.resolve(A,'release-text','op','fixture seed');await runtime.enqueue(ledger.get(A),agent,()=>({id:'msg-A',role:'user',content:[{type:'text',text:'A'}]}),'a2a');
 const B=decision('B','A');return {ledger,session,inbox,runtime,agent,A,B,decision,setFlush:x=>{flushOK=x},saved:()=>saved,podmenit:(k,v)=>{podmena[k]=v}};
}
try{
 for(const name of ['remove_first','observe_during_flush','claim_first','finished','wrong_session','wrong_id','race_claim','race_finished','remove_false','flush_failure','crash_recovery']){
  const f=await fixture(name);let removals=0;const remove=f.inbox.remove.bind(f.inbox);f.inbox.remove=id=>{removals++;return remove(id)};
  if(name==='claim_first'||name==='finished'){f.session.append('turn/start',{turn:1});f.inbox.claim('next-turn',1);}
  if(name==='finished'){f.session.append('assistant/message',{turn:1,message:otvet('done')},{surfaceOp:'append'});f.session.append('turn/end',{turn:1,reason:{kind:'completed'}});}
  if(name==='wrong_session')f.podmenit('header',{...f.session.header,createdAt:f.session.header.createdAt+1});
  if(name==='observe_during_flush')f.runtime.sessions.flush=async s=>{f.ledger.reconcile(s);if(f.ledger.get(f.A).blocked==='cancel_pending')assert.equal(f.ledger.get(f.A).finished_at,null);return true;};
  if(name==='wrong_id')f.session.id='other-session';
  if(name==='race_claim'){f.inbox.remove=id=>{removals++;f.session.append('turn/start',{turn:1});f.inbox.claim('next-turn',1);return remove(id);};}
  if(name==='race_finished'){f.inbox.remove=id=>{removals++;f.session.append('turn/start',{turn:1});f.inbox.claim('next-turn',1);f.session.append('assistant/message',{turn:1,message:otvet('done')},{surfaceOp:'append'});f.session.append('turn/end',{turn:1,reason:{kind:'completed'}});return remove(id);};}
  if(name==='remove_false')f.inbox.remove=()=>{removals++;return false;};
  if(name==='flush_failure'||name==='crash_recovery'){const fn=f.inbox.remove;f.inbox.remove=id=>{const result=fn(id);f.setFlush(false);return result;};}
  const result=await f.runtime.cancelPending(f.B,f.agent);
  console.log('RESULT',name,result, f.ledger.db.prepare('SELECT reason,cancel_phase FROM protocol_envelopes WHERE receipt_id=?').get(f.B));
  if(name==='remove_first'||name==='observe_during_flush'){
   assert.equal(result.action,'text');assert.equal(f.ledger.get(f.A).outcome,'canceled_before_run');assert.equal(f.inbox.hasPending,false);
   await f.runtime.enqueue(f.ledger.get(f.B),f.agent,()=>({id:'msg-B',role:'user',content:[{type:'text',text:result.text}]}),'a2a');
   f.session.append('turn/start',{turn:2});assert.equal(f.inbox.claim('next-turn',2)[0].id,'msg-B');f.session.append('assistant/message',{turn:2,message:otvet('B done')},{surfaceOp:'append'});f.session.append('turn/end',{turn:2,reason:{kind:'completed'}});await f.runtime.observe(f.session);assert.equal(f.ledger.get(f.B).outcome,'turn_completed');
  }else if(name==='finished'||name==='race_finished'){assert.equal(result.action,'terminal');assert.equal(f.ledger.get(f.A).outcome,'turn_completed');assert.match(f.ledger.get(f.B).result_json,/поздно/i);}
  else {assert.equal(result.action,'held');assert.equal(f.ledger.get(f.B).dispatch_started,0);}
  if(name==='wrong_session'||name==='wrong_id'){assert.equal(removals,0);assert.equal(f.inbox.hasPending,true);}
  if(name==='claim_first')assert.equal(removals,0);
  if(name==='flush_failure'||name==='crash_recovery')assert.equal(f.ledger.get(f.A).finished_at,null);
  if(name==='flush_failure')assert.throws(()=>f.ledger.resolve(f.B,'release-text','op','fixture'),/Исход отмены неизвестен/);
  if(name==='crash_recovery'){
   const root=f.ledger.root;const a=f.A,b=f.B;const events=f.saved();f.ledger.close();


   const recovered=new MessageReceipts(root,{owner:'restarted'});const zh2=await sozdatAgenta('restored-'+name);
   for(const e of events)if(['agent/inbox/spliced','turn/start','turn/end','assistant/message'].includes(e.type))zh2.session.append(e.type,e.data,e.type==='assistant/message'?{surfaceOp:'append'}:undefined);
   const restored=sPodmenoj(zh2.session,{id:f.session.id,header:f.session.header});
   const rr=new ReceiptRuntime(recovered,{flush:async()=>true},()=>{});await rr.observe(restored,null,true);
   assert.equal(recovered.get(a).finished_at,null);assert.equal(recovered.get(a).blocked,'cancel_pending');assert.equal(recovered.get(b).dispatch_started,0);
   assert.equal(recovered.db.prepare('select reason from protocol_envelopes where receipt_id=?').get(b).reason,'cancellation_unknown');
   let nextCalled=false;const handlers={};rr.install({on(k,fn){handlers[k]=fn;}});
   const inbox=zh2.inbox;restored.append('turn/start',{turn:9});inbox.claim('next-turn',9);
   await assert.rejects(()=>handlers['agent/pre-step']({agent:{session:restored},turn:9},async()=>{nextCalled=true;return{kind:'enter'};}),/Отмена не подтверждена/);
   assert.equal(nextCalled,false);recovered.close();console.log(name,'PASS recovery gate');count++;continue;
  }
  console.log(name,'PASS',result.action);count++;f.ledger.close();
 }
 const f=await fixture('poll-integration');
 const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');const a=source.indexOf('  async function pollReceiptDirectory(');const end=source.indexOf('  async function pollSpool()',a);const code=source.slice(a,source.lastIndexOf('\n  }',end)+5).trim();
 const input=path.join(tmp,'poll-input');fs.mkdirSync(input);
 const parsed=mailEnvelope(f.ledger.get(f.B).raw).protocol;parsed.metadata.delivery_id='signed-C';parsed.metadata.decision_id='signed-C';
 const sign=coordinatorFixture(f.ledger,'workertwo');
 fs.writeFileSync(path.join(input,'B.txt'),sign('[a2a-envelope version=2]\n'+JSON.stringify(parsed.metadata)+'\n'+parsed.body,'signed-C','supersede'));
 const context={mailStops:ordinaryMailControl,fs,path,receipts:f.ledger,mailEnvelope,A2A_EXT:['.txt'],a2aReported:new Set(),who:'бета',who_:'бета',log:()=>{},splitSender:t=>({text:t}),agentFor:async()=>({handle:{agent:f.agent},sessionId:'s'}),A2A_CHAT:'a2a',SPOOL_IN:'/var/spool/example-bus/workertwo',spoolAgeHours:()=>0,SPOOL_STALE_HOURS:12,stripMark:s=>s,lastOrigin:new Map(),copyAsk:()=>{},receiptRuntime:()=>f.runtime,platform:{createUserMessage:x=>({id:'msg-B-poll',...x})}};
 const poll=new Function(...Object.keys(context),'return ('+code+')')(...Object.values(context));await poll(input,'a2a');
 const rid=f.ledger.db.prepare('SELECT receipt_id FROM sources WHERE path=?').get(path.join(input,'B.txt')).receipt_id;
 assert.equal(f.ledger.get(f.A).outcome,'canceled_before_run');assert.equal(f.ledger.get(rid).dispatch_started,1);assert.equal(f.inbox.nextTurn.length,1);assert.equal(f.inbox.nextTurn[0].id,'msg-B-poll');assert.equal(fs.existsSync(path.join(input,'B.txt')),false);f.ledger.close();count++;console.log('actual signed index poll -> cancel -> enqueue PASS');
 console.log('cases',count,'PASS');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
