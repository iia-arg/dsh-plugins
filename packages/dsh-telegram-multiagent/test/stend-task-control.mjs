import {ordinaryMailControl} from './ordinary-mail-control-fixture.mjs';
// RU: Изолированный стенд stend-task-control.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-task-control.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts,mailEnvelope} from '../src/message-receipts.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {coordinatorFixture} from './coordinator-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'task-control-'));
const {sozdatAgenta}=await podnyatPlatformu02({root:path.join(dir,'platform')});
let n=0;const passed=[];
async function fx(mode='running') {
 const l=new MessageReceipts(path.join(dir,'l'+(++n)));const native=await sozdatAgenta('control-'+n);
 const agent={session:native.session,inbox:native.inbox,status:mode,send(){throw Error('CONTROL MUST NOT SEND ORDINARY TEXT')},wakeDriver(){}};
 const rt=new ReceiptRuntime(l,{flush:async()=>true},()=>{});const uuid=l.protocolIdentity();
 const raw=Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({kind:'decision',delivery_id:'A',decision_id:'A',recipient:{id:'workertwo',ledger_uuid:uuid}})+'\nA');
 const a=l.receive('A',raw);l.db.prepare('INSERT INTO decision_index VALUES(?,?,?)').run('workertwo','A',a.id);
 l.prepare(a.id,()=>({id:'msg-A-'+n,role:'user',content:[{type:'text',text:'A'}]}),agent.session,'a2a');
 await l.queue(a.id,{contains:id=>rt.contains(agent.session,id),send:m=>agent.inbox.append('next-turn',m),flush:async()=>true});
 if(mode!=='pending'){agent.session.append('turn/start',{turn:1});agent.inbox.claim('next-turn',1);await rt.observe(agent.session);}
 if(mode==='finished'){agent.session.append('turn/end',{turn:1,reason:{kind:'completed'}});await rt.observe(agent.session);}
 const metadata={kind:'task-control/1',op:'cancel',delivery_id:'B',recipient:{id:'workertwo',ledger_uuid:uuid},target:{decision_id:'A',recipient:'workertwo',ledger_uuid:uuid}};
 function receive(m=metadata,body='STOP A',key='B') {const raw=Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify(m)+'\n'+body);const e=mailEnvelope(raw);const r=l.receive(key,raw,{logicalKey:e.logicalKey});return {r,e,raw};}
 const call=(b,opts={authorized:true})=>rt.acceptTaskControl(b.r.id,b.e.protocol,'workertwo',agent,opts);
 const row=id=>l.db.prepare('SELECT * FROM task_controls WHERE receipt_id=?').get(id);
 return {l,rt,agent,a,metadata,receive,call,row};
}
async function test(name,fn){await fn();passed.push(name);console.log('PASS',name);}
try {
 await test('running: persisted and explicit no_adapter; no ordinary dispatch',async()=>{
  const f=await fx();const b=f.receive();assert.equal(typeof f.rt.acceptTaskControl,'function','typed task-control receiver missing');
  const aBefore=f.l.get(f.a.id);const out=await f.call(b);assert.equal(out.state,'no_adapter');assert.equal(f.row(b.r.id).state,'no_adapter');assert.deepEqual(f.l.get(f.a.id),aBefore);
  assert.equal(f.l.get(b.r.id).dispatch_started,0);assert.equal(f.l.get(b.r.id).message_json,null);
  const messages=f.l.db.prepare('SELECT body FROM outbox WHERE receipt_id=? ORDER BY id').all(b.r.id).map(x=>JSON.parse(x.body));
  assert.deepEqual(messages.map(x=>x.stage).sort(),['no_adapter','persisted']);assert.equal(messages.some(x=>x.stage==='model_ack'),false);
  const count=messages.length;await f.call(b);assert.equal(f.l.db.prepare('SELECT count(*) n FROM outbox WHERE receipt_id=?').get(b.r.id).n,count);
  f.l.close();
 });
 await test('adapter ACK is bound to the precise control and running turn',async()=>{
  const f=await fx();const b=f.receive();let sent;
  f.rt.taskControlAdapter=async packet=>{sent=packet;assert.equal(f.row(b.r.id).state,'dispatching');return {accepted:true,binding:packet.binding};};
  const out=await f.call(b);assert.equal(out.state,'adapter_accepted');assert.equal(sent.binding.target_receipt,f.a.id);assert.equal(sent.binding.turn,1);assert.equal(sent.binding.control_id,'B');
  assert.equal(f.row(b.r.id).accepted_at!==null,true);assert.equal(f.l.get(b.r.id).dispatch_started,0);f.l.close();
 });
 for(const [name,reply] of [['mismatched ACK',p=>({accepted:true,binding:{...p.binding,turn:2}})],['missing ACK',()=>({})],['exception',()=>{throw Error('do not print error payload')}],['explicit refusal',()=>({accepted:false})]]) await test(name,async()=>{
  const f=await fx();const b=f.receive();f.rt.taskControlAdapter=reply;const out=await f.call(b);assert.notEqual(out.state,'adapter_accepted');assert.equal(f.row(b.r.id).accepted_at,null);f.l.close();
 });
 for(const mode of ['pending','finished']) await test(mode+' is not silently executed or called done',async()=>{const f=await fx(mode);const b=f.receive();assert.equal((await f.call(b)).state,'rejected');assert.equal(f.row(b.r.id).reason,'target_not_running');assert.equal(f.l.get(b.r.id).dispatch_started,0);f.l.close();});
 for(const [name,edit,want] of [['amend',m=>{m.op='amend'},'unsupported_operation'],['version',m=>{m.kind='task-control/2'},'unsupported_control_version'],['recipient',m=>{m.recipient.id='workerthree'},'target_scope_mismatch'],['ledger',m=>{m.target.ledger_uuid='other'},'target_scope_mismatch'],['unknown field',m=>{m.expected_revision=2},'invalid_control'],['missing A',m=>{m.target.decision_id='missing'},'target_not_found']]) await test(name,async()=>{const f=await fx();const m=structuredClone(f.metadata);edit(m);const b=f.receive(m);const out=await f.call(b);assert.equal(out.state,'rejected');assert.equal(out.reason,want);f.l.close();});
 await test('untrusted caller cannot claim authority in the body',async()=>{const f=await fx();const b=f.receive();assert.equal((await f.call(b,{authorized:false})).reason,'unauthorized');f.l.close();});
 await test('wrong session never observes or acts on another session',async()=>{const f=await fx();const b=f.receive();f.agent.session=(await sozdatAgenta('other-'+n)).session;assert.equal((await f.call(b)).reason,'target_session_mismatch');f.l.close();});
 await test('post-await session change cannot claim acceptance',async()=>{const f=await fx();const b=f.receive();f.rt.taskControlAdapter=async p=>{f.agent.session=(await sozdatAgenta('replaced-'+n)).session;return {accepted:true,binding:p.binding}};assert.equal((await f.call(b)).state,'adapter_unknown');f.l.close();});
 await test('persisted dispatch intent prevents retry after lost result/reopen',async()=>{
  const f=await fx();const b=f.receive();await f.call(b);f.l.db.prepare("UPDATE task_controls SET state='dispatching' WHERE receipt_id=?").run(b.r.id);const root=f.l.root;f.l.close();
  const l=new MessageReceipts(root);const rt=new ReceiptRuntime(l,{flush:async()=>true},()=>{});rt.taskControlAdapter=()=>{throw Error('MUST NOT RETRY')};
  assert.equal((await rt.acceptTaskControl(b.r.id,b.e.protocol,'workertwo',f.agent,{authorized:true})).state,'adapter_unknown');assert.equal(l.db.prepare('select accepted_at from task_controls where receipt_id=?').get(b.r.id).accepted_at,null);assert.equal(l.db.prepare('select body from outbox where receipt_id=?').all(b.r.id).some(x=>JSON.parse(x.body).stage==='adapter_unknown'),true,'lost dispatch must have visible unknown receipt');l.close();
 });
 await test('same control ID, changed bytes rejected by real ledger',async()=>{const f=await fx();const b=f.receive();await f.call(b);assert.throws(()=>f.receive(f.metadata,'OTHER','other-source'),/identity conflict/);f.l.close();});
 await test('actual poll routes control without altering A or enqueuing B',async()=>{
  const f=await fx();const b=f.receive();const input=path.join(dir,'input');fs.mkdirSync(input);
  const sign=coordinatorFixture(f.l,'workertwo');fs.writeFileSync(path.join(input,'coordinator-123.txt'),sign(b.raw,'B','cancel'));
  const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');const start=source.indexOf('  async function pollReceiptDirectory('),end=source.indexOf('  async function pollSpool()',start);const code=source.slice(start,source.lastIndexOf('\n  }',end)+5).trim();
  const context={mailStops:ordinaryMailControl,fs,path,receipts:f.l,mailEnvelope,A2A_EXT:['.txt'],a2aReported:new Set(),who:'бета',who_:'бета',log:()=>{},splitSender:t=>({text:t}),agentFor:async()=>({handle:{agent:f.agent},sessionId:'s'}),A2A_CHAT:'a2a',SPOOL_IN:'/var/spool/example-bus/workertwo',spoolAgeHours:()=>0,SPOOL_STALE_HOURS:12,stripMark:s=>s,lastOrigin:new Map(),copyAsk:()=>{},receiptRuntime:()=>f.rt,platform:{createUserMessage:x=>({id:'B-poll',...x})}};
  const poll=new Function(...Object.keys(context),'return ('+code+')')(...Object.values(context));poll.koordinator=new Set(['coordinator']);await poll(input,'a2a');
  assert.equal(f.l.db.prepare("SELECT name FROM sqlite_master WHERE name='task_controls'").get()?.name,'task_controls','poll failed to persist typed control');
  const rid=f.l.db.prepare('SELECT receipt_id FROM sources WHERE path=?').get(path.join(input,'coordinator-123.txt')).receipt_id;
  assert.equal(f.row(rid).state,'no_adapter');assert.equal(f.l.get(rid).dispatch_started,0);assert.equal(f.agent.inbox.hasPending,false);assert.equal(fs.existsSync(path.join(input,'coordinator-123.txt')),false);f.l.close();
 });
 await test('generation is part of the adapter acknowledgement',async()=>{const f=await fx();const b=f.receive();f.rt.taskControlAdapter=async p=>{assert.equal(p.binding.generation,f.l.owner);return {accepted:true,binding:p.binding};};assert.equal((await f.call(b)).state,'adapter_accepted');f.l.close();});
 await test('duplicate during a dispatch cannot start a second attempt',async()=>{
  const f=await fx();const b=f.receive();let entered,finish,calls=0;const entry=new Promise(r=>entered=r);
  f.rt.taskControlAdapter=p=>{calls++;entered();return new Promise(r=>finish=()=>r({accepted:true,binding:p.binding}));};
  const first=f.call(b);await entry;assert.equal((await f.call(b)).state,'adapter_unknown');assert.equal(calls,1);finish();assert.equal((await first).state,'adapter_accepted');
  assert.equal((await f.call(b)).state,'adapter_accepted');assert.equal(calls,1);f.l.close();
 });
 await test('timeout is unknown, late ACK cannot change it, no automatic retry',async()=>{
  const f=await fx();const b=f.receive();let finish,calls=0;
  f.rt.taskControlAdapter=p=>{calls++;return new Promise(r=>finish=()=>r({accepted:true,binding:p.binding}));};
  const result=await f.call(b);assert.equal(result.reason,'adapter_timeout');assert.equal(result.state,'adapter_unknown');finish();await new Promise(r=>setImmediate(r));
  assert.equal(f.row(b.r.id).accepted_at,null);await f.call(b);assert.equal(calls,1);f.l.close();
 });
 await test('UTF8 byte limit cannot be bypassed with emoji',async()=>{const f=await fx();const b=f.receive(f.metadata,'🙂'.repeat(17000));assert.equal((await f.call(b)).reason,'invalid_control');assert.equal(f.l.get(b.r.id).dispatch_started,0);f.l.close();});
 await test('stale claim from an unfinished older turn is not current running A',async()=>{const f=await fx();const b=f.receive();f.agent.session.append('turn/start',{turn:2});assert.equal((await f.call(b)).reason,'target_not_running');f.l.close();});
 await test('previously dispatched B is not rewritten as a fresh control',async()=>{
  const f=await fx();const b=f.receive();f.l.prepare(b.r.id,()=>({id:'old-B-'+n,role:'user',content:[{type:'text',text:'old B'}]}),f.agent.session,'a2a');
  await f.l.queue(b.r.id,{contains:id=>f.rt.contains(f.agent.session,id),send:m=>f.agent.inbox.append('next-turn',m),flush:async()=>true});const before=f.l.get(b.r.id);
  assert.equal((await f.call(b)).reason,'control_already_dispatched');assert.deepEqual(f.l.get(b.r.id),before);f.l.close();
 });
 await test('turn finished while awaiting ACK stays unknown',async()=>{const f=await fx();const b=f.receive();f.rt.taskControlAdapter=async p=>{f.agent.session.append('turn/end',{turn:1,reason:{kind:'completed'}});await f.rt.observe(f.agent.session);return {accepted:true,binding:p.binding};};assert.equal((await f.call(b)).state,'adapter_unknown');assert.equal(f.row(b.r.id).accepted_at,null);f.l.close();});
 console.log('TOTAL',passed.length,'PASS',JSON.stringify(passed));
} finally {fs.rmSync(dir,{recursive:true,force:true});}
