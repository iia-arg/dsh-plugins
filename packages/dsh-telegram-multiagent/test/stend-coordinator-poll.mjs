import {ordinaryMailControl} from './ordinary-mail-control-fixture.mjs';
// RU: Изолированный стенд stend-coordinator-poll.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-coordinator-poll.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import crypto,{generateKeyPairSync} from 'node:crypto';
import {MessageReceipts,mailEnvelope} from '../src/message-receipts.js';
import {signCoordinator,verifyCoordinator} from '../src/coordinator-signature.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coordinator-poll-'));
const keys=generateKeyPairSync('ed25519'),now=1000000;
const trust={version:1,status:'approved',maxLifetimeMs:240000,clockSkewMs:30000,keys:{coordinator:keys.publicKey.export({type:'spki',format:'pem'})}};
const codeSource=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const start=codeSource.indexOf('  async function pollReceiptDirectory('),end=codeSource.indexOf('  async function pollSpool()',start);
const code=codeSource.slice(start,codeSource.lastIndexOf('\n  }',end)+5).trim();
let seq=0;const passed=[],failed=[];
// A-N-1948 №2: сценарии независимы — FAIL одного не прячет остальные; итог и код выхода — по всем.
async function scenario(name,fn){if(process.env.COORDINATOR_ONLY_CASE&&process.env.COORDINATOR_ONLY_CASE!==name)return;try{await fn();passed.push(name);console.log('PASS',name);}catch(e){failed.push(name);console.log('FAIL',name,'—',String(e?.message??e).split('\n')[0]);}}
function fixture(){
 const input=path.join(dir,'in-'+(++seq));fs.mkdirSync(input);
 let receipts=new MessageReceipts(path.join(dir,'ledger-'+seq),{now:()=>now});
 let controls=0,cancels=0,goals=0,failAgent=false;const messages=[],logs=[];
 const runtime={async acceptTaskControl(_id,_e,_r,_a,opts){assert.equal(opts.authorized,true);controls++;},async cancelPending(){cancels++;return {action:'text',text:'after cancel'};},async enqueue(r,_a,make){messages.push(make().content[0].text);receipts.completeLocal(r.id,'probe-delivered','ok');receipts.release(r.id,'file:'+r.sourcePath);}};
 function build(){
  receipts.coordinator=(raw,receiver)=>verifyCoordinator(raw,{db:receipts.db,trust,recipient:receiver,ledger:receipts.protocolIdentity(),now});
  const context={mailStops:ordinaryMailControl,crypto,fs,path,receipts,mailEnvelope,A2A_EXT:['.txt'],a2aReported:new Set(),who:'probe',who_:'probe',log:x=>logs.push(x),
   splitSender:t=>({text:t}),spoolSender:()=> 'unknown',agentFor:async()=>{if(failAgent)throw Error('fixture unavailable');return {handle:{agent:{}},sessionId:'s'};},A2A_CHAT:'a2a',SPOOL_IN:'/var/spool/example-bus/workerthree',
   spoolAgeHours:()=>0,SPOOL_STALE_HOURS:12,stripMark:s=>s,lastOrigin:new Map(),copyAsk:()=>{},receiptRuntime:()=>runtime,
   goalA2ASenders:new Set(),goalCommand:async()=>{goals++;return 'ok';},platform:{createUserMessage:x=>x}};

  const enqueue=runtime.enqueue;
  runtime.enqueue=async(r,...args)=>{r.sourcePath=receipts.db.prepare('SELECT path FROM sources WHERE receipt_id=? ORDER BY rowid DESC LIMIT 1').get(r.id).path;return enqueue(r,...args);};
  return new Function(...Object.keys(context),'return ('+code+')')(...Object.values(context));
 }
 let poll=build();
 const wrap=(payload,id,extra={})=>signCoordinator(Buffer.from(payload),{key_id:'coordinator',recipient:'workerthree',ledger_uuid:receipts.protocolIdentity(),delivery_id:id,action:'message',issued_at:now,expires_at:now+240000,...extra},keys.privateKey);
 async function deliver(raw,name='coordinator-123.txt'){fs.writeFileSync(path.join(input,name),raw);await poll(input,'a2a');}
 return {get receipts(){return receipts;},input,messages,logs,wrap,deliver,get controls(){return controls;},get cancels(){return cancels;},get goals(){return goals;},
  fail(){failAgent=true;}, recover(){failAgent=false;},
  restart(){const root=receipts.root;receipts.close();receipts=new MessageReceipts(root,{now:()=>now});poll=build();},close(){receipts.close();}};
}
try{
 await scenario('genuine message label and restart replay',async()=>{const f=fixture();try{const raw=f.wrap('hello','one');await f.deliver(raw);assert.equal(f.messages.length,1);assert.match(f.messages[0],/от координатора/);f.restart();await f.deliver(raw,'coordinator-124.txt');assert.equal(f.messages.length,1);assert.ok(f.logs.some(x=>x.includes('replay')));}finally{f.close();}});
 await scenario('forged filename is delivered without coordinator role',async()=>{const f=fixture();try{await f.deliver('hello');assert.equal(f.messages.length,1);assert.match(f.messages[0],/источник не удостоверен/);assert.doesNotMatch(f.messages[0],/от координатора/);}finally{f.close();}});
 await scenario('unsigned typed cancel is ordinary and never calls control',async()=>{const f=fixture();try{await f.deliver('[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-control/1',op:'cancel',delivery_id:'fake'})+'\nSTOP');assert.equal(f.controls,0);assert.equal(f.messages.length,1);assert.match(f.messages[0],/автоматическое управление не выполнено/);}finally{f.close();}});
 await scenario('signature checked before typed cancel',async()=>{const f=fixture();try{const raw='[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-control/1',op:'cancel',delivery_id:'cancel'})+'\nSTOP';await f.deliver(f.wrap(raw,'cancel',{action:'cancel'}));assert.equal(f.controls,1);assert.equal(f.messages.length,0);}finally{f.close();}});
 await scenario('signed message cannot carry cancel action',async()=>{const f=fixture();try{const raw='[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-control/1',op:'cancel',delivery_id:'confused'})+'\nSTOP';await f.deliver(f.wrap(raw,'confused'));assert.equal(f.controls,0);assert.equal(f.messages.length,0);assert.ok(f.logs.some(x=>x.includes('action_or_id_mismatch')));}finally{f.close();}});
 await scenario('unsigned legacy supersedes cannot cancel',async()=>{const f=fixture();try{await f.deliver('[a2a-envelope version=2]\n'+JSON.stringify({kind:'decision',delivery_id:'fake',supersedes:{decision_id:'A'}})+'\nreplacement');assert.equal(f.cancels,0);assert.equal(f.messages.length,1);}finally{f.close();}});
 await scenario('unsigned goal never changes goal',async()=>{const f=fixture();try{await f.deliver('/goal forged');assert.equal(f.goals,0);assert.equal(f.messages.length,1);}finally{f.close();}});
 await scenario('unsigned empty cancel preserves the entire request',async()=>{const f=fixture();try{const raw='[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-control/1',op:'cancel',delivery_id:'empty'});await f.deliver(raw);assert.equal(f.controls,0);assert.equal(f.messages.length,1);assert.ok(f.messages[0].includes(raw));}finally{f.close();}});
 await scenario('accepted signature then failed receiver continues the same admission',async()=>{const f=fixture();try{const raw=f.wrap('recover me','failed');f.fail();await f.deliver(raw);assert.equal(f.messages.length,0);f.recover();f.restart();await f.deliver(raw);assert.equal(f.messages.length,1);assert.match(f.messages[0],/от координатора/);const row=f.receipts.db.prepare("SELECT * FROM receipts WHERE logical_key='signed:failed'").get();assert.equal(row.blocked,null);assert.notEqual(row.finished_at,null);assert.ok(!f.logs.some(x=>x.includes('подпись ОТКАЗ')));assert.equal(f.receipts.db.prepare('SELECT COUNT(*) n FROM receipts').get().n,1);}finally{f.close();}});
 await scenario('continuation refuses changed bytes',async()=>{const f=fixture();try{const raw=f.wrap('recover me','tampered');f.fail();await f.deliver(raw);const orig=Buffer.from(raw),b64=x=>Buffer.from(x).toString('base64'),changed=Buffer.from(orig.toString('utf8').replace(b64('recover me'),b64('recover mE')));assert.equal(changed.length,orig.length);assert.equal(changed.compare(orig)!==0,true,'порча не внесена: payload не найден');console.log('  подмена: байт тела изменён, длина',orig.length,'отличий',[...orig].filter((x,i)=>x!==changed[i]).length);f.recover();f.restart();await f.deliver(changed);assert.equal(f.messages.length,0);assert.ok(f.logs.some(x=>x.includes('source changed: continuation refused')));assert.equal(f.receipts.db.prepare("SELECT * FROM receipts WHERE logical_key='signed:tampered'").get().dispatch_started,0);}finally{f.close();}});
 for(const [stage,sql] of [['dispatch','dispatch_started=1'],['message','message_json=\'{}\'']]) await scenario('replay after handoff stays held: '+stage,async()=>{const f=fixture();try{const raw=f.wrap('handed off','handoff-'+stage);f.fail();await f.deliver(raw);const row=f.receipts.db.prepare("SELECT * FROM receipts WHERE logical_key=?").get('signed:handoff-'+stage);f.receipts.db.prepare('UPDATE receipts SET '+sql+' WHERE id=?').run(row.id);f.recover();f.restart();await f.deliver(raw);assert.equal(f.messages.length,0);assert.equal(f.receipts.get(row.id).blocked,'signature_reauthorization_required');assert.ok(f.receipts.db.prepare('SELECT body FROM outbox WHERE receipt_id=?').all(row.id).some(x=>x.body.includes('Автоповтора нет')));assert.ok(fs.existsSync(path.join(f.input,'coordinator-123.txt')));}finally{f.close();}});
 await scenario('replay never overwrites cancel_pending',async()=>{const f=fixture();try{const raw=f.wrap('recover me','cancel-lock');f.fail();await f.deliver(raw);const row=f.receipts.db.prepare("SELECT * FROM receipts WHERE logical_key='signed:cancel-lock'").get();f.receipts.db.prepare("UPDATE receipts SET blocked='cancel_pending' WHERE id=?").run(row.id);f.recover();await f.deliver(raw);assert.equal(f.receipts.get(row.id).blocked,'cancel_pending');assert.equal(f.messages.length,0);}finally{f.close();}});
 for(const [name,extra] of [['expired',{expires_at:now}],['wrong recipient',{recipient:'workerone'}]])await scenario(name,async()=>{const f=fixture();try{await f.deliver(f.wrap('test',name.replace(' ','-'),extra));assert.equal(f.messages.length,0);assert.equal(f.controls,0);}finally{f.close();}});
 console.log('TOTAL',passed.length+'/'+(passed.length+failed.length),JSON.stringify(passed));
 if(failed.length){console.log('FAILED',JSON.stringify(failed));process.exitCode=1;}
}finally{fs.rmSync(dir,{recursive:true,force:true});}
