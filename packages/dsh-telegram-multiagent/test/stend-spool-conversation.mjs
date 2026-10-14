// B-N-2009: actual poll + ledger/runtime + native inbox. No model or Telegram network.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';import {borrowLiveSession} from '../src/live-session.js';import {installSitePolicy} from '../src/site-policy.js';import {sGostem} from './gost-kontekst.mjs';import {spawnSync} from 'node:child_process';
import {TelegramClient} from '../src/client.js';import {MessageReceipts,mailEnvelope,sobytiyaSessii} from '../src/message-receipts.js';import {ConversationSessions} from '../src/conversation-sessions.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';import {extractFunction} from './extract.mjs';import {podnyatPlatformu02} from './platforma-02.mjs';
const source=fs.readFileSync(process.env.STEND_CHANNEL_SOURCE||new URL('../src/index.js',import.meta.url),'utf8');
const parser=process.env.STEND_MAIL_PARSER?(await import(process.env.STEND_MAIL_PARSER)).mailEnvelope:mailEnvelope;
const restartStage=process.env.STEND_RESTART_STAGE,restartRoot=process.env.STEND_RESTART_ROOT;
assert(restartStage===undefined||['admit','finish','replay'].includes(restartStage),'unknown restart worker stage');
assert(restartRoot===undefined||restartStage!==undefined,'restart root requires an explicit worker stage');
if(restartStage){
 assert(typeof restartRoot==='string'&&path.dirname(path.resolve(restartRoot))===path.resolve(os.tmpdir())&&path.basename(restartRoot).startsWith('spool-restart-'),'worker root must be its generated /tmp fixture');
 const st=fs.lstatSync(restartRoot);assert(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid(),'worker root must be an owned ordinary directory');
}
const root=restartStage?restartRoot:fs.mkdtempSync(path.join(os.tmpdir(),'spool-conversation-'));let n=0,bad=0;
const rows=[];
async function probe(name,key,want,{foreign=false,missing=false,unknown=false,stale=false,legacy=false,gatewayScenario=null,rotateAfterResolve=false,missingGuest=false,retryBeforePrepare=false}={}){
 const dir=path.join(root,'f'+(++n));fs.mkdirSync(dir,{mode:0o777,recursive:true});fs.chmodSync(dir,0o777);const spool=path.join(dir,'spool');fs.mkdirSync(spool,{mode:0o777,recursive:true});fs.chmodSync(spool,0o777);
 const p=await podnyatPlatformu02({root:path.join(dir,'sessions')});const receipts=new MessageReceipts(path.join(dir,'ledger'));const conversations=new ConversationSessions(receipts);const agents=new Map();const logs=[];
 try{
  const tools=p.ctx.get('tools');for(const name of ['pismo_rukovoditelyu','bash'])tools.register({name,description:name,parameters:{},output:{schema:{type:'object',properties:{}},render:()=>[]},execute:async()=>({})});
  for(const k of ['a2a-2','-1004442041878','100']){
   const handle=restartStage&&restartStage!=='admit'?await p.agents.resume({resumeSessionId:'telegram-'+k,setup:(_ctx,a)=>{a.wakeDriver=()=>{};}}):await p.agents.create({sessionId:'telegram-'+k,meta:{cwd:dir}}); // separate fixture persistence needed: unique id below
   const agent=handle.agent;agent.wakeDriver=()=>{};
   agents.set(k,{handle:{agent},sessionId:agent.session.id});conversations.pin(k,agent.session.header);
  }
  const runtime=new ReceiptRuntime(receipts,p.sessions,x=>logs.push(x));runtime.conversationSessions=conversations;
  const resolved=[],mounted=[];const presets={resolve:async id=>{resolved.push(id);return{id};},mount:async(ctx,id)=>{mounted.push(id);}};
  const scope=vm.createContext(sGostem({ctx:{agents:p.agents,get:name=>name==='sessionPersistence'?p.backend:name==='sessions'?p.sessions:undefined},config:{workspace:dir,openBot:true,preset:'full-fixture',guestPreset:'guest-fixture',provider:'unused',model:'unused'},waitService:async name=>name==='agentPresets'?presets:name==='sessionPersistence'?p.backend:null,withFactoryRetry:async(_,fn)=>fn(),resumeCwdAlerts:new Set(),chats:new Map(),sessionToChat:new Map(),borrowLiveSession,siteProtected:new WeakSet(),installSitePolicy,fs,os,path,process,Buffer,crypto,receipts,conversations,log:x=>logs.push(x),mailEnvelope:parser,mailStops:{ingest:()=>false},A2A_EXT:['.txt','.md'],a2aReported:new Set(),A2A_TREVOG_PREDEL:5,trevogOtkaza:0,SPOOL_IN:spool,A2A_CHAT:'a2a-2',SPOOL_STALE_HOURS:12,who_:'fixture',ownerChatId:()=>100,allowed:new Set([100]),tg:{send:async()=>{}},spoolSender:()=> 'coders',spoolAgeHours:()=>0,spoolPokazanPochtalonom:()=>false,splitSender:text=>({text}),stripMark:x=>x,lastOrigin:new Map(),copyAsk(){},receiptRuntime:()=>runtime,platform:{createUserMessage:p.llm.createUserMessage,installModelSelection(){}},}));
  for(const fn of ['protectSite','agentFor'])scope[fn]=vm.runInContext('('+extractFunction(source,fn)+')',scope);
  for(const fn of ['spoolConversationFor','spoolConversationRoute'])if(source.includes('function '+fn+'('))scope[fn]=vm.runInContext('('+extractFunction(source,fn)+')',scope);
  const guest=await scope.agentFor('gost-123');guest.handle.agent.wakeDriver=()=>{};agents.set('gost-123',guest);
  assert.deepEqual(resolved,['guest-fixture'],'actual agentFor must choose the guest preset during creation');assert.deepEqual(mounted,['guest-fixture']);assert.equal(guest.handle.agent.session.header.agentPreset,'guest-fixture');
  const bind=conversations.current(key);const address=Buffer.from(JSON.stringify({key:unknown?'foreign-route':key,session_id:bind.session_id,session_created:bind.session_created+(stale?1:0)})).toString('base64url');
  let body='PROBE '+name+' 🙂';let raw='[delivery-v1 id=probe-'+n+' reply=no]\n'+(missing?'':'[spool-conversation-v1 '+address+']\n')+body;
  if(gatewayScenario) {
    const gateway=process.env.STEND_GATEWAY_PACKAGE||new URL('../../dsh-subscription-gateway/',import.meta.url).pathname;
    const r=spawnSync(process.execPath,gatewayScenario==='codex'?[path.join(gateway,'test/stend-codex-spool-conversation.mjs')]:[path.join(gateway,'test/stend-claude-mail-http.mjs'),gateway,'--sc',gatewayScenario],{env:{...process.env,STEND_SPOOL_ADDRESS:address},encoding:'utf8',timeout:90000});
    assert.equal(r.status,0,r.stderr||r.stdout);const result=JSON.parse(r.stdout.trim().split('\n').pop());assert.equal(result.pisem,1,'actual HTTP gateway must publish one letter');
    if(gatewayScenario==='codex')assert.equal(result.provider,'openai');
    else if(gatewayScenario==='b-dosylka'){assert(result.upravlenie.some(x=>x.accepted===true),'B must have been accepted');assert(!result.zaprosy.some(x=>x.b>=0&&x.otkaz!==400),'B must not have reached a successful SDK API call');}
    else {assert(result.hody[1]&&!result.hody[1].oshibka,'pressure continuation must follow completed second turn');}
    raw=result.pisma[0];assert(raw.includes('[spool-conversation-v1 '+address+']'));body=mailEnvelope(Buffer.from(raw)).text.trim();
    if(process.env.REVIEW_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.REVIEW_EVIDENCE_DIR,'http-native-'+n+'.json'),JSON.stringify(result,null,2));
  }
  const file=path.join(spool,'20261011T231200Z-coders-'+n+(restartStage?'-'+restartStage:'')+'.txt');fs.writeFileSync(file,raw,{mode:0o600});
  if(foreign){fs.chmodSync(file,0o644);const r=spawnSync('sudo',['chown','marc',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.notEqual(fs.lstatSync(file).uid,fs.lstatSync(spool).uid);console.log('INSERTED foreign-owner',fs.lstatSync(file).uid,'mailbox',fs.lstatSync(spool).uid);}
  if(missingGuest){
    const dbFile=path.join(receipts.root,'receipts.sqlite');const before=crypto.createHash('sha256').update(fs.readFileSync(dbFile)).digest('hex');
    const removed=receipts.db.prepare('DELETE FROM channel_sessions WHERE route_key=?').run('gost-123').changes;assert.equal(removed,1);assert.equal(p.agents.get(guest.sessionId),guest.handle.agent,'native guest still exists; only durable binding is absent');
    const after=crypto.createHash('sha256').update(fs.readFileSync(dbFile)).digest('hex');assert.notEqual(before,after);console.log('INSERTED missing guest binding',removed,before+' -> '+after);
  }
  if(scope.spoolConversationFor&&!unknown&&!stale&&!missingGuest){assert.equal(scope.spoolConversationFor(agents.get(key).handle.agent),address);assert.equal(scope.spoolConversationFor({session:{id:'telegram-foreign',header:{createdAt:123}}}),undefined);}
  if(rotateAfterResolve){const original=scope.agentFor;scope.agentFor=async k=>{const result=await original(k);if(k===key){const changed=receipts.db.prepare('UPDATE channel_sessions SET session_id=?,revision=revision+1 WHERE route_key=?').run('telegram-v2-11111111-1111-4111-8111-111111111111',key).changes;assert.equal(changed,1);console.log('INSERTED generation-after-resolution',changed,conversations.current(key).session_id);}return result;};}
  for(const [route,entry] of agents)scope.lastOrigin.set(entry.sessionId,route==='a2a-2'?'a2a':'tg');
  const poll=vm.runInContext('('+extractFunction(source,'pollReceiptDirectory')+')',scope);
  if(retryBeforePrepare){
    const enqueue=runtime.enqueue.bind(runtime);runtime.enqueue=async()=>{throw Error('fixture gap before prepare');};await poll(spool,'spool');runtime.enqueue=enqueue;
    const accepted=receipts.db.prepare('SELECT * FROM receipts').get();assert.equal(accepted.message_json,null);assert.equal(accepted.session_id,null);assert.equal(receipts.spoolTelegramReply(accepted.id),'-1004442041878');assert(fs.existsSync(file));
    const changed=receipts.db.prepare('UPDATE channel_sessions SET session_id=?,revision=revision+1 WHERE route_key=?').run('telegram-v2-22222222-2222-4222-8222-222222222222',key).changes;assert.equal(changed,1);console.log('INSERTED generation after reply admission before prepare',changed);
  }
  if(restartStage==='admit'){
    const flush=p.sessions.flush.bind(p.sessions);p.sessions.flush=async session=>{
      const committed=await flush(session);assert.equal(committed,true);
      const r=receipts.db.prepare('SELECT * FROM receipts').get();if(!r?.dispatch_started)return committed;
      assert.equal(r.finished_at,null);assert.equal(r.flushed_at,null);assert.notEqual(r.message_json,null);assert.equal(r.claimed_turn,null);assert(fs.existsSync(file));
      for(const entry of agents.values())await flush(entry.handle.agent.session);
      fs.writeFileSync(path.join(root,'admission.json'),JSON.stringify({pid:process.pid,receipt:r.id,message:r.dsh_id,session:r.session_id,created:r.session_created,wire:raw,flushed_at:r.flushed_at,dispatch_started:r.dispatch_started,source_exists:fs.existsSync(file)}));
      console.log('CHECKPOINT native flush committed BEFORE ledger flush/release; no reply',JSON.stringify({pid:process.pid,receipt:r.id,message:r.dsh_id}));
      process.exit(0); // Stop this test channel process inside queue.flush, before returning to the durable ledger.
    };
  }
  await poll(spool,'spool');
  if(restartStage){
    const r=receipts.db.prepare('SELECT * FROM receipts').get();assert.equal(receipts.db.prepare('SELECT count(*) n FROM receipts').get().n,1,'restart replay must retain one receipt');
    const savedFile=path.join(root,'admission.json');
    const saved=JSON.parse(fs.readFileSync(savedFile));assert.notEqual(process.pid,saved.pid);assert.equal(raw,saved.wire,'repeat must be the exact accepted wire');assert.equal(r.id,saved.receipt);assert.equal(r.dsh_id,saved.message);assert.equal(r.session_id,saved.session);assert.equal(r.session_created,saved.created);
    console.log('REOPEN same receipt/native message',JSON.stringify({pid:process.pid,receipt:r.id,message:r.dsh_id,stage:restartStage}));
  }
  const texts=k=>sobytiyaSessii(agents.get(k).handle.agent.session).filter(e=>e.type==='agent/inbox/spliced').flatMap(e=>e.data.inserted??[]).map(m=>m.content[0].text).filter(t=>t.includes(body));
  const actual=[...agents.keys()].filter(k=>texts(k).length);assert.deepEqual(actual,[want],logs.join('\n'));
  assert.equal(scope.lastOrigin.get(agents.get(want).sessionId),want==='a2a-2'?'a2a':'tg','addressed Telegram must retain its origin marker');
  assert(!fs.existsSync(file),'receipt source must release after flush');assert.equal(receipts.db.prepare('SELECT route FROM receipts').get().route,'a2a','spool source classification must remain mail for cancellation, preview and copies');const wantsReply=['-1004442041878','gost-123','100'].includes(want);assert.equal(receipts.db.prepare('SELECT expects_reply FROM receipts').get().expects_reply,wantsReply?1:0,'reply policy of addressed Telegram versus service/fallback');
  if(want==='a2a-2'&&key!=='a2a-2'&&!legacy)assert(logs.some(x=>x.includes(foreign?'адрес беседы от чужой учётки отброшен':'письмо ящика без адреса беседы')),logs.join('\n'));
  if(!process.env.STEND_OLD_CHANNEL)assert(!texts(want)[0].includes('[spool-conversation-v1'),'routing metadata leaked into model text');
  if(want==='gost-123'){assert.equal(agents.get(want).handle.agent.session.header.agentPreset,'guest-fixture');assert.deepEqual(tools.wireSchemas(agents.get(want).handle.agent).schemas.map(x=>x.name),['pismo_rukovoditelyu'],'guest restrictions must apply through actual agentFor');}
  if(want==='100')assert(tools.wireSchemas(agents.get(want).handle.agent).schemas.some(x=>x.name==='bash'),'private retains full tools');
  if(!process.env.STEND_OLD_CHANNEL){
    const readerStart=source.indexOf('        const pendingUpdates=receipts.db.prepare(');const readerEnd=source.indexOf(';',readerStart)+1;assert(readerStart>0&&readerEnd>readerStart);const pendingTelegram=vm.runInContext(source.slice(readerStart,readerEnd)+'pendingUpdates;',scope);assert.equal(pendingTelegram.length,0,'file receipt must not enter the raw Telegram-update reader while the model is still pending');
    const recipient=agents.get(want).handle.agent,answer='ОТВЕТ '+name+' 🙂',sentFile=path.join(root,'telegram-sends.json'),sent=restartStage&&fs.existsSync(sentFile)?JSON.parse(fs.readFileSync(sentFile)):[];
    const realTelegram=new TelegramClient('fixture-'+n,x=>logs.push(x));const originalFetch=globalThis.fetch;
    globalThis.fetch=async(url,options)=>{assert(String(url).startsWith('https://api.telegram.org/botfixture-'));assert(String(url).endsWith('/sendMessage'));const payload=JSON.parse(options.body);sent.push(payload);if(restartStage)fs.writeFileSync(sentFile,JSON.stringify(sent));return{json:async()=>({ok:true,result:{message_id:sent.length}})};};
    try{
      Object.assign(scope,{attachmentStore:{confirm:async()=>[]},stripGoalMarker:x=>x,stripFileAck:x=>x,oborvalsyaOshibkoj:new Map(),tg:realTelegram,tgChatFor:new Map(),turnAsk:new Map(),pendingAsk:new Map(),goalOrigin:new Map(),deliveryMode:()=> 'personal',copyTo:()=>null,sendCopy(){},copySkipped(){},replyHeader:()=>'',A2A_OUT:path.join(dir,'out'),outMs:()=>Date.now()});
      if(restartStage!=='replay'){
      recipient.session.append('turn/start',{turn:1});recipient.inbox.claim('next-turn',1);await runtime.observe(recipient.session,1);
      const start=source.indexOf("  ctx.on('session/event', (session, event) => {");const end=source.indexOf('\n  });',start)+7;assert(start>0&&end>start);let eventHandler;
      scope.ctx.on=(name,handler)=>{assert.equal(name,'session/event');eventHandler=handler;};
      vm.runInContext(source.slice(start,end),scope);assert.equal(typeof eventHandler,'function');
      const message=p.llm.createAssistantMessage({content:[{type:'text',text:answer}],source:{provider:'test',model:'test'}});
      recipient.session.append('step/start',{turn:1,step:1});recipient.session.append('assistant/message',{turn:1,step:1,stream:[],message},{surfaceOp:'append'});eventHandler(recipient.session,{type:'assistant/message',data:{turn:1,message}});await Promise.resolve();assert.equal(sent.length,0,'managedTurn must suppress the legacy sender; the result goes through the durable outbox');
      recipient.session.append('step/end',{turn:1,step:1});recipient.session.append('turn/end',{turn:1,reason:{kind:'completed'}});await runtime.observe(recipient.session);assert.equal(receipts.db.prepare('SELECT outcome FROM receipts').get().outcome,'turn_completed');await p.sessions.flush(recipient.session);
      }
      const deliver=vm.runInContext('('+extractFunction(source,'deliverReceiptOutbox')+')',scope);await receipts.deliverResults(deliver);await receipts.deliverResults(deliver);await runtime.observe(recipient.session);await receipts.deliverResults(deliver);
      assert.equal(sent.length,wantsReply?1:0,'exactly one successful reply / no reply for a2a or fallback');
      if(wantsReply){const chat=want==='gost-123'?'123':want;assert.equal(String(sent[0].chat_id),chat);if(want==='gost-123')assert.notEqual(String(sent[0].chat_id),'100','guest primary response must not go to owner');assert.equal(sent[0].text,answer,'ordinary agent text, no internal receipt heading');assert.equal(receipts.db.prepare("SELECT count(*) n FROM outbox WHERE route='spool-tg' AND sent_at IS NOT NULL").get().n,1);}
      assert(!logs.some(x=>x.includes('ошибка обработки события')),logs.join('\n'));
    }finally{globalThis.fetch=originalFetch;}
  }
  if(restartStage)fs.writeFileSync(path.join(root,restartStage+'.json'),JSON.stringify({pid:process.pid,receipts:receipts.db.prepare('SELECT count(*) n FROM receipts').get().n,sends:JSON.parse(fs.readFileSync(path.join(root,'telegram-sends.json'))).map(x=>({chat_id:String(x.chat_id),text:x.text})),result:receipts.db.prepare("SELECT count(*) n FROM outbox WHERE route='spool-tg' AND sent_at IS NOT NULL").get().n}));
  console.log('PASS',name,actual,'guestPreset='+guest.handle.agent.session.header.agentPreset);rows.push({name,code:0});
 }catch(e){bad++;console.log('FAIL',name,e.message);rows.push({name,code:1,error:e.message});}finally{receipts.close();await p.ctx.fiber.dispose();}
}
async function restartProbe(name,key){
 n++;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spool-restart-'));const stages=[];
 try{
  for(const stage of ['admit','finish','replay']){
   const r=spawnSync(process.execPath,[new URL(import.meta.url).pathname],{env:{...process.env,STEND_RESTART_ROOT:dir,STEND_RESTART_STAGE:stage,STEND_RESTART_KEY:key,STEND_HTTP:'0'},encoding:'utf8',timeout:90000});
   assert.equal(r.status,0,stage+' '+r.stdout+r.stderr);console.log('CHILD',stage,r.stdout.trim());
   stages.push(JSON.parse(fs.readFileSync(path.join(dir,stage==='admit'?'admission.json':stage+'.json'))));
  }
  assert.equal(stages[0].flushed_at,null);assert.equal(stages[0].dispatch_started,1);assert.equal(stages[0].source_exists,true);
  assert.equal(new Set(stages.map(s=>s.pid)).size,3,'actual restart requires three distinct OS processes');
  assert.equal(stages[1].receipts,1);assert.equal(stages[2].receipts,1);assert.equal(stages[1].result,1);assert.equal(stages[2].result,1);
  assert.deepEqual(stages[1].sends,stages[2].sends,'restarted replay must not send a second Telegram message');assert.equal(stages[2].sends.length,1);assert.equal(stages[2].sends[0].chat_id,key==='gost-123'?'123':'-1004442041878');
  if(key==='gost-123')assert.notEqual(stages[2].sends[0].chat_id,'100');
  console.log('PASS',name,JSON.stringify({pids:stages.map(s=>s.pid),receipt:stages[0].receipt,sends:stages[2].sends}));rows.push({name,code:0});
 }catch(e){bad++;console.log('FAIL',name,e.message);rows.push({name,code:1,error:e.message});}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
try{
 if(restartStage){const key=process.env.STEND_RESTART_KEY;assert(['-1004442041878','gost-123'].includes(key));await probe('restart '+key,key,key);}
 else if(process.env.STEND_OLD_CHANNEL){await probe('new gateway old channel preserves a2a receipt','-1004442041878','a2a-2',{legacy:true});}
 else {
 if(process.env.STEND_ONLY_RESTART!=='1'){
 await probe('healthy legacy service','a2a-2','a2a-2',{missing:true,legacy:true});
 await probe('group continuation','-1004442041878','-1004442041878');await probe('group B','-1004442041878','-1004442041878');await probe('guest B','gost-123','gost-123');await probe('private','100','100');await probe('service custom key','a2a-2','a2a-2');
 await probe('old gateway missing key','-1004442041878','a2a-2',{missing:true});await probe('foreign conversation','-1004442041878','a2a-2',{unknown:true});await probe('old generation','-1004442041878','a2a-2',{stale:true});await probe('foreign UID known group','-1004442041878','a2a-2',{foreign:true});
 await probe('missing durable guest binding -> a2a','gost-123','a2a-2',{missingGuest:true});
 await probe('retry before prepare, generation gone -> no public reply','-1004442041878','a2a-2',{retryBeforePrepare:true});
 await probe('generation changes after actual agentFor','-1004442041878','a2a-2',{rotateAfterResolve:true});
 }
 await restartProbe('channel process restart mid-admission -> one group answer','-1004442041878');
 await restartProbe('channel process restart -> guest answer to guest, not owner','gost-123');
 if(process.env.STEND_HTTP==='1'){
 await probe('HTTP pressure group -> native group','-1004442041878','-1004442041878',{gatewayScenario:'stop-instr'});
 await probe('HTTP B group -> native group','-1004442041878','-1004442041878',{gatewayScenario:'b-dosylka'});
 await probe('HTTP B guest -> limited native guest','gost-123','gost-123',{gatewayScenario:'b-dosylka'});
 await probe('HTTP Codex pressure -> native group','-1004442041878','-1004442041878',{gatewayScenario:'codex'});
 }
 }
 if(process.env.REVIEW_EVIDENCE_FILE)fs.writeFileSync(process.env.REVIEW_EVIDENCE_FILE,JSON.stringify(rows,null,2));console.log('RESULT',n-bad+'/'+n);process.exitCode=bad?1:0;
}finally{if(!restartStage)fs.rmSync(root,{recursive:true,force:true});}
