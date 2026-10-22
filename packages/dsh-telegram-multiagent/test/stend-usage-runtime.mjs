import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';
import {CodexTaskControl} from '../src/codex-task-control.js';
import {policyFixture} from './usage-runtime-policy-fixture.mjs';
const policy=policyFixture();
const mod=await import('../src/usage-runtime.js').catch(()=>({}));
assert.equal(typeof mod.UsageRuntime,'function','R usage observer missing');
const {UsageRuntime}=mod;const root=fs.mkdtempSync(path.join(os.tmpdir(),'usage-r-'));const opened=[];let count=0;
async function test(name,fn){await fn();count++;console.log('PASS',name)}
function fixture(name){
 const ledger=new MessageReceipts(path.join(root,name),{owner:'runtime-generation',now:()=>9000});opened.push(ledger);
 const session={id:'actual-session',header:{createdAt:42},events:[]};
 const add=(type,data,time)=>session.events.push({type,data,time,seq:session.events.length});
 const mail='a'.repeat(64);const r=ledger.receive('fixture','DO NOT LOG PROMPT',{logicalKey:'ap-notice:'+mail,route:'ap-notice'});
 ledger.prepare(r.id,()=>({id:'real-message',role:'user',content:[{type:'text',text:'model says fake job'}]}),session,'autopilot-team');
 add('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:0,inserted:[{id:'real-message',role:'user',content:[{type:'text',text:'PRIVATE BODY'}]}]},1000);
 add('turn/start',{turn:7},1200);add('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:1,inserted:[]},1250);
 return {ledger,session,add,mail,agent:{session,status:'running'}};
}
const rows=dir=>fs.readFileSync(path.join(dir,'usage-runtime-v1.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
try{
 await test('actual native claim/time, descriptor and no model job metadata',async()=>{
  const f=fixture('actual');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});const c=new CodexTaskControl(f.ledger,'sova');c.usage=j;
  const lease=c.attach(f.agent,'http://127.0.0.1:7891',{terminal:false});assert.equal(typeof lease.descriptor.request_id,'string');assert.equal(lease.descriptor.terminal,undefined);assert.deepEqual(lease.descriptor.operations,['cancel','stop']);
  lease.close();await j.flush();const text=fs.readFileSync(j.file,'utf8');const rs=rows(f.ledger.root);const req=rs.find(x=>x.kind==='runtime_request');assert.equal(req.requestId,lease.descriptor.request_id);assert.equal(req.sessionId,'actual-session');assert.equal(req.sessionCreated,42);assert.equal(req.turn,7);assert.equal(req.turnStartedAt,1200);assert.equal(req.claimedAt,1250);assert.deepEqual(req.deliveryIds,[f.mail]);assert.equal(req.uid,process.getuid());assert.equal(req.recipient,'sova');assert.equal(req.finishedAt,null);
  assert.ok(!text.includes('PRIVATE BODY')&&!text.includes('fake job')&&!text.includes(lease.descriptor.ticket));assert.equal('jobId'in req,false);assert.equal(rs.every((x,i)=>x.seq===i+1),true);assert.equal(fs.statSync(j.file).mode&0o777,0o600);await j.close();
 });
 await test('two actual SDK requests in one DSH turn have separate immutable IDs',async()=>{
  const f=fixture('multi');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});const c=new CodexTaskControl(f.ledger,'sova');c.usage=j;
  const a=c.attach(f.agent,'http://127.0.0.1:7891'),b=c.attach(f.agent,'http://127.0.0.1:7891');a.close();b.close();await j.flush();const rs=rows(f.ledger.root).filter(x=>x.kind==='runtime_request');assert.equal(rs.length,2);assert.notEqual(rs[0].requestId,rs[1].requestId);assert.equal(rs[0].turn,rs[1].turn);await j.close();
 });
 await test('turn end comes from native event, transport close is not terminal',async()=>{
  const f=fixture('end');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});const c=new CodexTaskControl(f.ledger,'sova');c.usage=j;
  const lease=c.attach(f.agent,'http://127.0.0.1:7891');lease.close();f.add('turn/end',{turn:7,reason:{kind:'completed'}},8000);j.observe(f.session);j.watermark(8500);await j.flush();const rs=rows(f.ledger.root);const end=rs.find(x=>x.kind==='runtime_turn'&&x.finishedAt!==null);assert.equal(end.finishedAt,8000);assert.equal(end.turnStartedAt,1200);assert.equal(rs.at(-1).kind,'watermark');assert.equal(rs.at(-1).at,8500);assert.ok(rs.find(x=>x.kind==='runtime_request').finishedAt===null);await j.close();
 });
 await test('missing native time never gets observer wallclock',async()=>{
  const f=fixture('missing-time');f.session.events[1].time=undefined;const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});const c=new CodexTaskControl(f.ledger,'sova');c.usage=j;const lease=c.attach(f.agent,'http://127.0.0.1:7891');assert.ok(lease);lease.close();await j.flush();assert.equal(j.failure,'R_NATIVE_BOUNDARY_UNPROVEN');assert.ok(!fs.existsSync(j.file)||!rows(f.ledger.root).some(x=>x.kind==='runtime_request'));await j.close();
 });
 await test('same-turn deliveries are ALL retained for independent mixed-job refusal',async()=>{
  const f=fixture('mixed');const mail='b'.repeat(64);const r=f.ledger.receive('second','body',{logicalKey:'ap-notice:'+mail,route:'ap-notice'});f.ledger.prepare(r.id,()=>({id:'second',role:'user',content:[]}),f.session,'autopilot-team');f.add('agent/inbox/spliced',{target:'next-step',start:0,removedCount:0,inserted:[{id:'second'}]},1300);f.add('agent/inbox/spliced',{target:'next-step',start:0,removedCount:1,inserted:[]},1350);
  const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});const c=new CodexTaskControl(f.ledger,'sova');c.usage=j;const lease=c.attach(f.agent,'http://127.0.0.1:7891');lease.close();await j.flush();assert.deepEqual(rows(f.ledger.root).find(x=>x.kind==='runtime_request').deliveryIds,[f.mail,mail]);await j.close();
 });
 await test('ordinary unconfigured control does not invoke usage callback at all',async()=>{
  const f=fixture('ordinary');const c=new CodexTaskControl(f.ledger,'sova');const lease=c.attach(f.agent,'http://127.0.0.1:7891');assert.equal(lease.descriptor.request_id,undefined);lease.close();assert.equal(fs.existsSync(path.join(f.ledger.root,'usage-runtime-v1.jsonl')),false);
 });
 await test('meter fault cannot abort attach or change stop rights',async()=>{
  const f=fixture('fault');const c=new CodexTaskControl(f.ledger,'sova');let gap;c.usage={request(){throw Error('disk broken')},fail(reason){gap=reason}};const lease=c.attach(f.agent,'http://127.0.0.1:7891');assert.ok(lease);assert.equal(gap,'SOURCE_GAP');assert.deepEqual(lease.descriptor.operations,['cancel','stop']);lease.close();
 });
 await test('file symlink fails named, no write through link, request still runs',async()=>{
  const f=fixture('symlink');const target=path.join(root,'untouched');fs.writeFileSync(target,'original');fs.symlinkSync(target,path.join(f.ledger.root,'usage-runtime-v1.jsonl'));const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});const c=new CodexTaskControl(f.ledger,'sova');c.usage=j;const lease=c.attach(f.agent,'http://127.0.0.1:7891');lease.close();await j.flush();assert.equal(j.failure,'R_SOURCE_UNSAFE');assert.equal(fs.readFileSync(target,'utf8'),'original');await j.close();
 });
 await test('bounded 1024 pending records, no silent watermark after source gap',async()=>{
  const f=fixture('overflow');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});for(let i=0;i<1100;i++)j.watermark(9000+i);await j.flush();assert.equal(j.failure,'SOURCE_GAP');const rs=rows(f.ledger.root);assert.ok(rs.length<=1024);assert.ok(rs.some(x=>x.kind==='source_gap'));assert.ok(!rs.some(x=>x.kind==='watermark'));const n=rs.length;j.watermark(20000);await j.flush();assert.equal(rows(f.ledger.root).length,n);await j.close();
 });
 await test('flush wait cannot substitute next turn for exact ended turn',async()=>{
  const f=fixture('race');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});let finish;const pending=new Promise(r=>finish=r);f.add('turn/end',{turn:7,reason:{kind:'completed'}},8000);assert.equal(typeof j.afterFlush,'function','durable exact-turn observer missing');const observed=j.afterFlush(f.session,7,pending);j.watermark(8500);f.add('turn/start',{turn:8},9000);finish(true);await observed;j.watermark(9500);await j.flush();const rs=rows(f.ledger.root);assert.ok(rs.some(x=>x.kind==='runtime_turn'&&x.turn===7&&x.finishedAt===8000));assert.ok(!rs.some(x=>x.kind==='watermark'&&x.at===8500));assert.equal(rs.at(-1).at,9500);await j.close();
 });
 await test('failed native durability freezes watermark and persists reason',async()=>{
  const f=fixture('failed-flush');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});assert.equal(typeof j.afterFlush,'function','durable observer missing');await j.afterFlush(f.session,7,Promise.reject(Error('flush refused')));j.watermark(9500);await j.flush();const rs=rows(f.ledger.root);assert.equal(j.failure,'R_DURABILITY_UNPROVEN');assert.ok(rs.some(x=>x.kind==='source_gap'&&x.reason==='R_DURABILITY_UNPROVEN'));assert.ok(!rs.some(x=>x.kind==='watermark'));await j.close();
 });
 await test('broken source epoch reason survives restart and cannot be a healthy watermark',async()=>{
  const f=fixture('gap-restart');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});j.watermark(10000);await j.flush();j.fail('SOURCE_GAP');j.watermark(11000);await j.close();const k=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});k.watermark(12000);await k.close();const rs=rows(f.ledger.root);assert.ok(rs.some(x=>x.kind==='source_gap'&&x.reason==='SOURCE_GAP'));assert.ok(!rs.some(x=>x.kind==='watermark'&&x.at===11000));assert.notEqual(rs[0].generation,rs.at(-1).generation);
 });
 await test('malformed end seq is unknown, not completed',async()=>{
  const f=fixture('bad-end-seq');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});f.add('turn/end',{turn:7,reason:{kind:'completed'}},8000);delete f.session.events.at(-1).seq;j.observe(f.session,7);await j.close();assert.equal(j.failure,'R_NATIVE_BOUNDARY_UNPROVEN');assert.ok(!rows(f.ledger.root).some(x=>x.kind==='runtime_turn'));
 });
 await test('lost explicit native boundary cannot become watermark-only success',async()=>{
  const f=fixture('lost-events');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});f.session.events=[];await j.afterFlush(f.session,7,Promise.resolve());j.watermark(9500);await j.close();assert.equal(j.failure,'R_NATIVE_BOUNDARY_UNPROVEN');assert.ok(rows(f.ledger.root).some(x=>x.kind==='source_gap'));assert.ok(!rows(f.ledger.root).some(x=>x.kind==='watermark'));
 });
 await test('end without exact turn is gap rather than fallback',async()=>{
  const f=fixture('lost-turn');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});await j.afterFlush(f.session,undefined,Promise.resolve());j.watermark(9500);await j.close();assert.equal(j.failure,'R_NATIVE_BOUNDARY_UNPROVEN');assert.ok(!rows(f.ledger.root).some(x=>x.kind==='watermark'));
 });
 await test('only end lost behind flush is gap, never a reopened healthy turn',async()=>{
  const f=fixture('lost-only-end');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});await j.afterFlush(f.session,7,Promise.resolve());j.watermark(9500);await j.close();assert.equal(j.failure,'R_NATIVE_BOUNDARY_UNPROVEN');assert.ok(rows(f.ledger.root).some(x=>x.kind==='source_gap'));assert.ok(!rows(f.ledger.root).some(x=>x.kind==='watermark'));
 });
 await test('no actual inbox claim stays null beside real turnStartedAt',async()=>{
  const f=fixture('no-claim');f.session.events=f.session.events.filter(e=>e.type!=='agent/inbox/spliced');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});const c=new CodexTaskControl(f.ledger,'sova');c.usage=j;const lease=c.attach(f.agent,'http://127.0.0.1:7891');lease.close();await j.close();const req=rows(f.ledger.root).find(x=>x.kind==='runtime_request');assert.equal(req.claimedAt,null);assert.equal(req.turnStartedAt,1200);assert.deepEqual(req.claims,[]);
 });
 await test('re-observed R facts use stable SDK and native-turn identities, not seq',async()=>{
  const f=fixture('duplicates');const j=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});const c=new CodexTaskControl(f.ledger,'sova');c.usage=j;
  const lease=c.attach(f.agent,'http://127.0.0.1:7891');j.request(f.agent,lease.descriptor);lease.close();f.add('turn/end',{turn:7,reason:{kind:'completed'}},8000);j.observe(f.session,7);j.observe(f.session,7);await j.close();
  const k=new UsageRuntime(f.ledger,'sova',{heartbeatMs:0,policyPath:policy.file});k.observe(f.session,7);await k.close();const rs=rows(f.ledger.root),requests=rs.filter(r=>r.kind==='runtime_request'),turns=rs.filter(r=>r.kind==='runtime_turn');
  assert.equal(requests.length,2);assert.equal(new Set(requests.map(r=>JSON.stringify([r.uid,r.recipient,r.requestGeneration,r.requestId]))).size,1);assert.notEqual(requests[0].seq,requests[1].seq);
  assert.equal(turns.length,3);assert.equal(new Set(turns.map(r=>JSON.stringify([r.uid,r.recipient,r.sessionId,r.sessionCreated,r.turn]))).size,1);assert.notEqual(turns[0].generation,turns.at(-1).generation);
 });
 console.log('TOTAL',count,'PASS');
}finally{policy.close();for(const l of opened)try{l.close()}catch{}fs.rmSync(root,{recursive:true,force:true})}
