// RU: Классификация durable replace-backlog и единственный возврат отправителю; только частные БД/курьеры.
// EN: Durable replace-backlog classification and one sender return; private databases/couriers only.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {generateKeyPairSync,randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {MessageReceipts,mashinnoePismo,ustanovitIstochnikPomoshchnika} from '../src/message-receipts.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {ConversationPause} from '../src/conversation-pause.js';
import {MailStopReceiver} from '../src/mail-stop-receiver.js';
import {SdkInbox} from '../src/sdk-inbox.js';
import {signCoordinator} from '../src/coordinator-signature.js';
import {cancellationReturn,deliverCancellationReturn} from '../src/cancellation-return.js';
const results=[];
const proof=process.env.BETA_RCPT_PROOF_DIR;
if(proof)fs.mkdirSync(proof,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
async function fixture(name,run){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'beta-held-'));let l,sdk;
 try{
  let now=1000000;l=new MessageReceipts(path.join(dir,'ledger'),{now:()=>now,owner:'fixture-generation'});
  const pause=new ConversationPause(l,dir,()=>{}),listeners=[];
  const session={id:'held-session',header:{id:'held-session',createdAt:10,cwd:dir},events:[],
   requestHeader:()=>({config:{provider:'native',model:'fixture'}}),
   append(type,data){const e={seq:this.events.length+1,type,data,time:now};this.events.push(e);for(const fn of [...listeners])fn(this,e);return e;}};
  const inbox={nextTurn:[],nextStep:[],dispatch:{emit:(type,data)=>session.append(type,data)},
   mutate(target,index,removed,inserted){const list=target==='next-turn'?this.nextTurn:this.nextStep;const result=list.splice(index,removed,...inserted);session.append('agent/inbox/spliced',{target,start:index,removedCount:removed,inserted});return result;},
   claim(target,turn){const all=[...this.mutate('next-step',0,this.nextStep.length,[])];if(target==='next-turn'&&this.nextTurn.length)all.push(...this.mutate('next-turn',0,1,[]));return all;}};
  let wakes=0;const agent={session,inbox,status:'idle',ctx:{on(event,fn){listeners.push(fn);return()=>{};}},wakeDriver(){wakes++;},turn(){},runMaintenance(){},send(m,target){inbox.mutate(target,(target==='next-turn'?inbox.nextTurn:inbox.nextStep).length,0,[m]);},cancel(){agent.status='idle';session.append('turn/end',{turn:3});},whenIdle:async()=>{}};
  const sessions={flush:async()=>true};const runtime=new ReceiptRuntime(l,sessions,()=>{});
  runtime.returnPaths={spoolDir:path.join(dir,'spool'),a2aDir:path.join(dir,'a2a'),coordinatorReturnRecipient:'zabavy'};
  const coord=generateKeyPairSync('ed25519');
  const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{coord:coord.publicKey.export({type:'spki',format:'pem'})},controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['pause','replace']}},returnRoutes:{coord:{recipient:'coord-return',ledger_uuid:'reply-ledger',directory:'/fixture/return'}}};
  const message=text=>({id:randomUUID(),content:[{type:'text',text}],source:{kind:'agent-message',form:'relay'}});
  const receiver=new MailStopReceiver({ledger:l,pause,recipient:'fixture-agent',getTrust:()=>trust,getArrival:()=>({delivered_at:now,event_id:'fixture-delivery'}),resolveTarget:()=>agent,signStatus:s=>Buffer.from(JSON.stringify(s)),publishStatus:()=>{},makeMessage:message,sessions});pause.attach(agent);
  async function input(text){const r=l.receive(randomUUID(),Buffer.from(text),{sender:'workerthree',sourcePath:path.join(dir,'spool',randomUUID()+'.txt'),expectsReply:false});l.prepare(r.id,()=>message(text),session,'a2a');await l.queue(r.id,{contains:id=>inbox.nextTurn.some(m=>m.id===id),send:m=>agent.send(m,'next-turn'),flush:async()=>true});return l.get(r.id);}
  const h=await input('H: удержанный ввод 😀');const control='replace-control';
  const wire=signCoordinator(Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-stop/1',delivery_id:control,recipient:'fixture-agent',ledger_uuid:l.protocolIdentity(),mode:'replace',selector:{kind:'primary-a2a'}})+'\nNEW TASK'),{action:'stop',delivery_id:control,key_id:'coord',recipient:'fixture-agent',ledger_uuid:l.protocolIdentity(),issued_at:now,expires_at:1120000},coord.privateKey);
  assert.equal((await receiver.handle(wire,{sourceKey:control})).state,'replacement_queued');
  session.append('turn/start',{turn:4});const replacement=inbox.claim('next-turn',4);assert.equal(replacement.length,1);assert.notEqual(replacement[0].id,h.dsh_id);
  const ev=session.append('user/message',replacement[0]);await receiver.observe(session,ev);session.append('turn/end',{turn:4,reason:{kind:'completed'}});
  assert.equal(receiver.store.row(control).state,'complete');
  assert(receiver.store.backlogIds(session.header).has(h.dsh_id));
  sdk=new SdkInbox(l,sessions,{}); // Real schema and SDK eligibility reader, no lease/network.
  const notices=()=>l.db.prepare("SELECT * FROM outbox WHERE receipt_id=? AND route='new-return'").all(h.id);
  const audits=()=>l.db.prepare("SELECT * FROM audit WHERE receipt_id=? AND kind='held_by_replace'").all(h.id);
  await run({dir,l,session,inbox,agent,runtime,receiver,h,control,input,notices,audits,sdk,wakes:()=>wakes,setNow:x=>{now=x;}});
  results.push({name,passed:true});
 }finally{sdk?.dispose();l?.close();fs.rmSync(dir,{recursive:true,force:true});}
}
await fixture('healthy-repeat-neighbor-sender',async f=>{
 await f.runtime.observe(f.session);
 assert.equal(f.l.get(f.h.id).blocked,'held_by_replace');
 assert.equal(f.l.get(f.h.id).finished_at,null);assert.equal(f.l.get(f.h.id).outcome,null);
 assert.equal(f.notices().length,1);assert.equal(f.audits().length,1);
 const data=JSON.parse(f.notices()[0].body);
 assert.deepEqual(data.destination,{kind:'local',recipient:'workerthree'});
 assert(data.text.includes(f.h.dsh_id));assert(data.text.includes(f.control));assert.match(data.text,/НЕ исполнено.*удержано replace-STOP.*1970-01-01T00:16:40.000Z.*решение — за вами/);
 const status=f.l.status().find(r=>r.id===f.h.id);
 assert.equal(status.replace_hold.control_id,f.control);assert.equal(status.replace_hold.held_since,1000000);
 const cli=spawnSync(process.execPath,[new URL('../src/receipt-admin.mjs',import.meta.url).pathname,'status',f.l.root],{encoding:'utf8'});
 assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).records.find(r=>r.id===f.h.id).replace_hold.control_id,f.control);
 const beforeWakes=f.wakes();
 const budget=f.l.db.prepare("SELECT * FROM meta WHERE key LIKE 'wake:%'").all();
 assert.equal(await f.runtime.wake(f.agent,f.h.id),false);assert.equal(f.wakes(),beforeWakes);
 assert.deepEqual(f.l.db.prepare("SELECT * FROM meta WHERE key LIKE 'wake:%'").all(),budget);
 assert.equal(f.l.db.prepare('SELECT count(*) AS n FROM receipts WHERE id=? AND claimed_turn IS NULL AND blocked IS NULL AND finished_at IS NULL').get(f.h.id).n,0);
 const neighbor=await f.input('NEIGHBOR');assert.equal(await f.runtime.wake(f.agent,neighbor.id),true);assert.equal(f.wakes(),beforeWakes+1);
 f.session.append('turn/start',{turn:5});const claimed=f.inbox.claim('next-turn',5);
 assert.deepEqual(claimed.map(m=>m.id),[neighbor.dsh_id]);assert(f.inbox.nextTurn.some(m=>m.id===f.h.dsh_id));
 await f.runtime.observe(f.session);assert.equal(f.l.get(neighbor.id).claimed_turn,5);
 await f.runtime.observe(f.session);assert.equal(f.notices().length,1);assert.equal(f.audits().length,1);
 // Actual outbox -> existing return dispatcher -> private executable; no real agent receives a probe.
 const receipt=path.join(f.dir,'courier.json'),courier=path.join(f.dir,'courier');
 fs.writeFileSync(courier,'#!'+process.execPath+'\nimport fs from "node:fs";fs.writeFileSync('+JSON.stringify(receipt)+',JSON.stringify({args:process.argv.slice(2),text:fs.readFileSync(0,"utf8")}));\n',{mode:0o700});
 await f.l.deliverResults(async row=>{if(row.id===f.notices()[0].id)await deliverCancellationReturn(row,f.l.root,{localCourier:courier});});
 const delivered=JSON.parse(fs.readFileSync(receipt,'utf8'));assert.deepEqual(delivered.args,['--bez-kopii','workerthree']);assert.equal(delivered.text,data.text);
 assert(f.notices()[0].sent_at!==null);fs.unlinkSync(receipt);
 await f.runtime.observe(f.session);await f.l.deliverResults(async()=>{throw Error('unexpected second output')});assert(!fs.existsSync(receipt));assert.equal(f.notices().length,1);
 // Reopen the same durable ledger in a separate Node process, without resetting any receipt.
 const savedSession=path.join(f.dir,'saved-session.json');fs.writeFileSync(savedSession,JSON.stringify(f.session));
 const worker=`import fs from 'node:fs';import {MessageReceipts} from ${JSON.stringify(new URL('../src/message-receipts.js',import.meta.url).href)};import {ReceiptRuntime} from ${JSON.stringify(new URL('../src/receipt-runtime.js',import.meta.url).href)};const l=new MessageReceipts(process.argv[1]);try{const r=new ReceiptRuntime(l,{flush:async()=>true},()=>{});await r.observe(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify({row:l.get(process.argv[3]),audit:l.db.prepare("SELECT count(*) AS n FROM audit WHERE receipt_id=? AND kind='held_by_replace'").get(process.argv[3]).n,outbox:l.db.prepare("SELECT count(*) AS n FROM outbox WHERE receipt_id=? AND route='new-return'").get(process.argv[3]).n}));}finally{l.close();}`;
 const reopened=spawnSync(process.execPath,['--input-type=module','-e',worker,f.l.root,savedSession,f.h.id],{encoding:'utf8',timeout:10000});
 assert.equal(reopened.status,0,reopened.stderr);const persisted=JSON.parse(reopened.stdout.trim().split('\n').at(-1));assert.equal(persisted.row.blocked,'held_by_replace');assert.equal(persisted.audit,1);assert.equal(persisted.outbox,1);
 // The saved audit survives restart/reclassification even if the outbox row is removed externally.
 f.l.db.prepare('DELETE FROM outbox WHERE id=?').run(f.notices()[0].id);
 f.l.db.prepare('UPDATE receipts SET blocked=NULL WHERE id=?').run(f.h.id);
 await f.runtime.observe(f.session);assert.equal(f.notices().length,0);assert.equal(f.audits().length,1);assert.equal(f.l.get(f.h.id).blocked,'held_by_replace');
 f.setNow(1000000+3*86400000);f.l.holdTick();
 assert.equal(f.l.db.prepare("SELECT count(*) AS n FROM outbox WHERE id LIKE ? OR (id LIKE 'held-summary:%' AND body LIKE ?)").get(f.h.id+':held:%','%'+f.h.id+'%').n,0);
 const ack=f.l.receive('held-status',Buffer.from('[delivery-v1 id=held-status reply=no]\n'+data.text),{sender:'workerthree'});
 assert.equal(cancellationReturn(ack,f.l,f.runtime.returnPaths).kind,'none');assert(mashinnoePismo(ack));
});
await fixture('backlog-corruption-and-return',async f=>{
 const dump=()=>JSON.stringify(f.l.db.prepare('SELECT * FROM mail_stop_backlog ORDER BY session_id,session_created,message_id').all());
 const before=dump(),row=f.l.db.prepare('SELECT * FROM mail_stop_backlog WHERE message_id=?').get(f.h.dsh_id);
 const changes=f.l.db.prepare('DELETE FROM mail_stop_backlog WHERE session_id=? AND session_created=? AND message_id=?').run(row.session_id,row.session_created,row.message_id).changes;
 const after=dump();assert.equal(changes,1);assert.notEqual(sha(before),sha(after));
 // Different slice: exact ID in a canonical dump, fixed string grep, not the classifier join.
 const count=text=>{const r=spawnSync('grep',['-cF',f.h.dsh_id],{input:text,encoding:'utf8'});assert([0,1].includes(r.status));return Number(r.stdout.trim());};
 assert.equal(count(before),1);assert.equal(count(after),0);
 console.log(JSON.stringify({mutation:'remove exact backlog row',changes,before_sha256:sha(before),after_sha256:sha(after),fixed_counts:[1,0]}));
 await f.runtime.observe(f.session);assert.equal(f.l.get(f.h.id).dispatch_started,1);assert.equal(f.l.get(f.h.id).blocked,null);assert.equal(f.notices().length,0);assert.equal(f.audits().length,0);
 assert.equal(f.l.db.prepare('SELECT count(*) AS n FROM receipts WHERE id=? AND claimed_turn IS NULL AND blocked IS NULL AND finished_at IS NULL').get(f.h.id).n,1);
 if(proof){const dir=path.join(proof,'PROFILE-corrupt','.message-receipts');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(path.join(f.l.root,'receipts.sqlite'),path.join(dir,'receipts.sqlite'));}
 f.l.db.prepare('INSERT INTO mail_stop_backlog VALUES(?,?,?,?)').run(row.session_id,row.session_created,row.message_id,row.control_id);
 assert.equal(dump(),before);assert.equal(count(dump()),1);
 await f.runtime.observe(f.session);assert.equal(f.l.get(f.h.id).blocked,'held_by_replace');assert.equal(f.notices().length,1);assert.equal(f.audits().length,1);
 if(proof){const dir=path.join(proof,'PROFILE-restored','.message-receipts');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(path.join(f.l.root,'receipts.sqlite'),path.join(dir,'receipts.sqlite'));}
 if(proof)fs.writeFileSync(path.join(proof,'BACKLOG-MUTATION.json'),JSON.stringify({changes,row,before_sha256:sha(before),corrupt_sha256:sha(after),return_sha256:sha(dump()),fixed_counts:[1,0,1]},null,2)+'\n');
});
const guards=[
 ['unfinished-control',f=>f.l.db.prepare("UPDATE mail_stop_controls SET state='waiting' WHERE control_id=?").run(f.control)],
 ['wrong-mode',f=>f.l.db.prepare("UPDATE mail_stop_controls SET mode='pause' WHERE control_id=?").run(f.control)],
 ['native-not-terminal',f=>f.l.db.prepare('UPDATE mail_stop_controls SET native_terminal=0 WHERE control_id=?').run(f.control)],
 ['sdk-not-terminal',f=>f.l.db.prepare('UPDATE mail_stop_controls SET sdk_terminal=0 WHERE control_id=?').run(f.control)],
 ['resume-not-proven',f=>f.l.db.prepare('UPDATE mail_stop_controls SET resume_proven=0 WHERE control_id=?').run(f.control)],
 ['wrong-generation',f=>f.l.db.prepare('UPDATE mail_stop_backlog SET session_created=11 WHERE message_id=?').run(f.h.dsh_id)],
 ['control-generation-mismatch',f=>f.l.db.prepare('UPDATE mail_stop_controls SET session_created=11 WHERE control_id=?').run(f.control)],
 ['different-block',f=>f.l.db.prepare("UPDATE receipts SET blocked='dispatch_unknown' WHERE id=?").run(f.h.id)],
 ['already-finished',f=>f.l.completeLocal(f.h.id,'operator_discarded','excluded finished row')],
 ['claimed-ledger',f=>f.l.db.prepare('UPDATE receipts SET claimed_turn=3 WHERE id=?').run(f.h.id)],
 ['native-user-message',f=>f.session.append('user/message',JSON.parse(f.h.message_json))],
 ['native-claimed',f=>{f.session.append('turn/start',{turn:6});f.inbox.mutate('next-turn',0,1,[]);}],
 ['sdk-unknown',f=>f.l.db.prepare("INSERT INTO sdk_inputs(receipt_id,message_id,session_id,session_created,turn,generation,body_sha,binding_json,state,started_at) VALUES(?,?,?,?,6,'fixture-generation','sha','{}','unknown',1000000)").run(f.h.id,f.h.dsh_id,f.session.id,10)],
];
for(const [name,mutate]of guards)await fixture(name,async f=>{mutate(f);await f.runtime.observe(f.session);assert.notEqual(f.l.get(f.h.id).blocked,'held_by_replace');assert.equal(f.notices().length,0);assert.equal(f.audits().length,0);});
await fixture('row-changed-before-transaction',async f=>{
 const tx=f.l.tx.bind(f.l);let inject=true;
 f.l.tx=fn=>tx(()=>{if(inject){inject=false;f.l.db.prepare("UPDATE receipts SET blocked='dispatch_unknown' WHERE id=?").run(f.h.id);}return fn();});
 await f.runtime.observe(f.session);assert.equal(f.l.get(f.h.id).blocked,'dispatch_unknown');assert.equal(f.notices().length,0);assert.equal(f.audits().length,0);
});
await fixture('remote-signed-sender',async f=>{
 f.l.db.prepare('UPDATE sources SET path=? WHERE receipt_id=?').run(path.join(f.dir,'a2a','in','from-coordinator.txt'),f.h.id);
 f.l.audit(f.h.id,'coordinator_signature_verified','fixture signed receipt');
 await f.runtime.observe(f.session);assert.equal(f.notices().length,1);
 const row=f.notices()[0],data=JSON.parse(row.body);assert.deepEqual(data.destination,{kind:'remote',recipient:'zabavy'});
 const courier=path.join(f.dir,'remote-courier.mjs'),capture=path.join(f.dir,'remote-captured.txt');
 fs.writeFileSync(courier,'#!'+process.execPath+'\nimport fs from "node:fs";fs.copyFileSync(process.argv[2],'+JSON.stringify(capture)+');\n',{mode:0o700});
 await f.l.deliverResults(async out=>{if(out.id===row.id)await deliverCancellationReturn(out,f.l.root,{...f.runtime.returnPaths,remoteCourier:courier,beforeRemoteDispatch:()=>f.l.db.prepare("UPDATE outbox SET error='HOLD: remote intent' WHERE id=?").run(row.id)});});
 const text=fs.readFileSync(capture,'utf8');assert(text.includes('reply=no'));assert(text.includes(data.text));assert(f.notices()[0].sent_at!==null);
 await f.runtime.observe(f.session);assert.equal(f.notices().length,1);assert.equal(f.audits().length,1);
});
await fixture('outbox-failure-rolls-back-classification',async f=>{
 f.l.db.exec("CREATE TRIGGER fail_return BEFORE INSERT ON outbox WHEN NEW.route='new-return' BEGIN SELECT RAISE(ABORT,'fixture outbox unavailable'); END");
 await assert.rejects(f.runtime.observe(f.session),/fixture outbox unavailable/);
 assert.equal(f.l.get(f.h.id).blocked,null);assert.equal(f.audits().length,0);assert.equal(f.notices().length,0);
 f.l.db.exec('DROP TRIGGER fail_return');await f.runtime.observe(f.session);
 assert.equal(f.l.get(f.h.id).blocked,'held_by_replace');assert.equal(f.notices().length,1);assert.equal(f.audits().length,1);
});
await fixture('unknown-return-in-daily-summary',async f=>{
 f.l.db.prepare("UPDATE receipts SET sender='coders' WHERE id=?").run(f.h.id);
 f.runtime.returnPaths.sharedSenderName='coders';
 await f.runtime.observe(f.session);assert.equal(f.l.get(f.h.id).blocked,'held_by_replace');assert.equal(f.notices().length,1);assert.match(f.notices()[0].error,/^HOLD:/);assert.equal(f.audits().length,1);
 assert.equal(JSON.parse(f.notices()[0].body).destination.kind,'unknown');
 const before=f.notices().length;f.l.holdTick();
 const summaries=()=>f.l.db.prepare("SELECT * FROM outbox WHERE id LIKE 'held-summary:%'").all();
 assert.equal(summaries().length,1,'unknown return must reach the reviewer daily summary');assert(summaries()[0].body.includes(f.h.id));assert(summaries()[0].body.includes(f.l.reviewer));
 f.l.holdTick();assert.equal(summaries().length,1);assert.equal(f.notices().length,before);
 f.setNow(1000000+86400000);f.l.holdTick();assert.equal(summaries().length,2);assert(summaries()[1].body.includes(f.h.id));assert.equal(f.notices().length,before);
});
await fixture('events-read-lazily-and-once-per-reconcile',async f=>{
 let reads=0;ustanovitIstochnikPomoshchnika(()=>({sobytiyaSessii:s=>{reads++;return s.events;},nasledovano:()=>0}));
 try{
  f.l.db.prepare("UPDATE receipts SET blocked='dispatch_unknown' WHERE id=?").run(f.h.id);
  await f.runtime.observe(f.session);assert.equal(reads,1,'only receiptFacts reads events without a classification candidate');
  f.l.db.prepare("UPDATE receipts SET blocked=NULL WHERE id=?").run(f.h.id);
  const row=f.l.db.prepare('SELECT * FROM mail_stop_backlog WHERE message_id=?').get(f.h.dsh_id);
  f.l.db.prepare('DELETE FROM mail_stop_backlog WHERE message_id=?').run(f.h.dsh_id);
  reads=0;await f.runtime.observe(f.session);assert.equal(reads,1,'no completed backlog match needs no classification event read');
  f.l.db.prepare('INSERT INTO mail_stop_backlog VALUES(?,?,?,?)').run(row.session_id,row.session_created,row.message_id,row.control_id);
  const neighbor=await f.input('SECOND_HELD');f.receiver.store.holdBacklog(f.control,[JSON.parse(neighbor.message_json)]);
  reads=0;await f.runtime.observe(f.session);assert.equal(reads,2,'one facts read plus one lazy cached classification read for two candidates');
  assert.equal(f.l.get(f.h.id).blocked,'held_by_replace');assert.equal(f.l.get(neighbor.id).blocked,'held_by_replace');
 }finally{ustanovitIstochnikPomoshchnika(()=>null);}
});
// Native DSH inbox/claim and real hooks; model transport is a deterministic local generator.
{
 const {podnyatPlatformu02}=await import('./platforma-02.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'beta-held-native-'));let p,l,agent;
 try{
  p=await podnyatPlatformu02({root:path.join(dir,'sessions')});l=new MessageReceipts(path.join(dir,'ledger'));
  const pause=new ConversationPause(l,dir,()=>{}),runtime=new ReceiptRuntime(l,p.sessions,()=>{}),requests=[];
  runtime.returnPaths={spoolDir:path.join(dir,'spool')};runtime.conversationPause=pause;runtime.install(p.ctx);
  p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));
  p.ctx.get('llm').stream=async function*(request){requests.push(JSON.stringify(request.messages));yield{type:'text-delta',index:0,text:'fixture result'};yield{type:'finish',reason:{kind:'stop'}}};
  const coord=generateKeyPairSync('ed25519'),now=Date.now(),control='native-replace';
  const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{coord:coord.publicKey.export({type:'spki',format:'pem'})},controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['pause','replace']}},returnRoutes:{coord:{recipient:'coord-return',ledger_uuid:'reply-ledger',directory:path.join(dir,'return')}}};
  const message=text=>p.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'agent-message',form:'relay'}});
  const receiver=new MailStopReceiver({ledger:l,pause,recipient:'fixture-agent',getTrust:()=>trust,getArrival:()=>({delivered_at:now,event_id:'native-arrival'}),resolveTarget:()=>agent,signStatus:s=>Buffer.from(JSON.stringify(s)),publishStatus:()=>{},makeMessage:message,sessions:p.sessions});
  const observations=[];p.ctx.on('session/event',(session,event)=>{const job=receiver.observe(session,event);observations.push(job);job.catch(()=>{});});pause.mount(p.ctx);
  agent=(await p.agents.create({sessionId:'native-held',agentOptions:{provider:'fixture',model:'fixture'},meta:{cwd:dir}})).agent;
  const h=l.receive('native-old',Buffer.from('NATIVE_OLD_HELD'),{sender:'workerthree',sourcePath:path.join(dir,'spool','old.txt'),expectsReply:false});
  l.prepare(h.id,()=>message('NATIVE_OLD_HELD'),agent.session,'a2a');await l.queue(h.id,{contains:id=>agent.inbox.nextTurn.some(m=>m.id===id),send:m=>agent.send(m,'next-turn',false),flush:()=>p.sessions.flush(agent.session)});
  const wire=signCoordinator(Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-stop/1',delivery_id:control,recipient:'fixture-agent',ledger_uuid:l.protocolIdentity(),mode:'replace',selector:{kind:'primary-a2a'}})+'\nNATIVE_REPLACEMENT'),{action:'stop',delivery_id:control,key_id:'coord',recipient:'fixture-agent',ledger_uuid:l.protocolIdentity(),issued_at:now,expires_at:now+120000},coord.privateKey);
  await receiver.handle(wire,{sourceKey:control});await agent.whenIdle();await Promise.all(observations);
  assert.equal(receiver.store.row(control).state,'complete');await runtime.observe(agent.session);
  assert.equal(l.get(h.id).blocked,'held_by_replace');assert.equal(l.get(h.id).claimed_turn,null);
  const neighbor=l.receive('native-neighbor',Buffer.from('NATIVE_NEIGHBOR'),{sender:'workerthree',sourcePath:path.join(dir,'spool','neighbor.txt'),expectsReply:false});
  await runtime.enqueue(neighbor,agent,()=>message('NATIVE_NEIGHBOR'),'a2a');await agent.whenIdle();await runtime.observe(agent.session);
  assert.equal(l.get(neighbor.id).outcome,'turn_completed');assert.equal(l.get(h.id).claimed_turn,null);assert.equal(l.get(h.id).finished_at,null);
  assert.equal(requests.length,2);assert(requests.some(r=>r.includes('NATIVE_NEIGHBOR')));assert(requests.every(r=>!r.includes('NATIVE_OLD_HELD')));
  assert(agent.inbox.nextTurn.some(m=>m.id===l.get(h.id).dsh_id));
  assert.equal(l.db.prepare("SELECT count(*) AS n FROM outbox WHERE receipt_id=? AND route='new-return'").get(h.id).n,1);
  results.push({name:'native-inbox-model-neighbor',passed:true});
 }finally{agent?.cancel({kind:'disposed'},{keepInbox:true});await p?.ctx.fiber.dispose();l?.close();fs.rmSync(dir,{recursive:true,force:true});}
}
console.log(JSON.stringify({at:new Date().toISOString(),results},null,2));
if(proof)fs.writeFileSync(path.join(proof,'RESULTS.json'),JSON.stringify({at:new Date().toISOString(),results},null,2)+'\n');
