// RU: Только offline SDK fake; копии порчи удаляются finally. ENV REVIEW_EVIDENCE_FILE — необязательный путь JSON отчёта.
// EN: Offline SDK fake only; mutation copies are removed in finally. Optional REVIEW_EVIDENCE_FILE selects JSON evidence output.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import {EventEmitter} from 'node:events';import {spawnSync} from 'node:child_process';
import {TurnInboxQueue,HOOK_BYTES} from '../inbox-input.mjs';
import {TaskControlRouter} from '../task-control.mjs';
const gw=new URL('../',import.meta.url).pathname;
const sha=x=>createHash('sha256').update(x).digest('hex'),source=fs.readFileSync(path.join(gw,'gateway.mjs'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));const results=[];
const body=id=>JSON.stringify({receipt_id:id,message:{id:'native-'+id,role:'user',source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:fixture'},content:[{type:'text',text:'ordinary mail 🙂'}]},provenance:{sender:'fixture',verified:true}});
const bare=id=>({binding:{control_id:id,target_receipt:id},op:'message',body:body(id)});
function composeTest(src=source,{late=true,close=false,large=false}={}){
 const b=['B-FIRST'],events=[],response=new EventEmitter(),q=new TurnInboxQueue({offered:p=>events.push(['offered',p.binding.control_id]),notOffered:(p,r)=>events.push([r,p.binding.control_id])});q.enqueue(bare('mail'));
 const ctx={TurnInboxQueue,HOOK_BYTES,Buffer,res:response,hodId:'fixture-turn',ocheredB:b,inputQueue:q,DAVLENIE:new Set(['signal']),explicitMailStop:false,prervanPoStop:false,stopPrishyol:false,bZakryt:false,signalDan:false,log(){},
 signalDavleniya:async()=>{if(late)b.push('B-LATE');if(close)response.emit('close');return{hookSpecificOutput:{additionalContext:large?'P'.repeat(HOOK_BYTES):'PRESSURE'}}},
 vzyatB:(n=b.length)=>b.splice(0,n).join('\n\n')};vm.createContext(ctx);
 const start=src.indexOf('    const composeInputHook = async hook => {'),end=src.indexOf('    const { query }',start);assert(start>=0&&end>start);
 const listenerStart=src.indexOf('    const closeInputs='),listenerEnd=src.indexOf('\n',listenerStart),bStart=src.indexOf('    const vzyatB ='),bEnd=src.indexOf('    const signalDavleniya =',bStart);assert(listenerStart>=0&&bStart>=0&&bEnd>bStart);
 vm.runInContext(src.slice(listenerStart,listenerEnd)+'\n'+src.slice(bStart,bEnd)+'\n'+src.slice(start,end)+'globalThis.compose=composeInputHook;',ctx);
 return ctx.compose('PostToolBatch').then(out=>({out,b,events,q,ctx}));
}
async function lateB(src=source){const x=await composeTest(src);assert.deepEqual(x.b,['B-LATE']);assert(!x.out.hookSpecificOutput.additionalContext.includes('B-LATE'));assert(x.out.hookSpecificOutput.additionalContext.indexOf('B-FIRST')<x.out.hookSpecificOutput.additionalContext.indexOf('PRESSURE'));assert(x.out.hookSpecificOutput.additionalContext.indexOf('PRESSURE')<x.out.hookSpecificOutput.additionalContext.indexOf('[ordinary-inbox/1]'));assert(Buffer.byteLength(x.out.hookSpecificOutput.additionalContext)<=HOOK_BYTES);return{pendingB:x.b,events:x.events};}
const scope={generation:'generation-fixture',recipient:'beta-fixture',ledger_uuid:'ledger-fixture',session_id:'session-fixture',session_created:1,turn:1};
async function codexHarness(file,fn){const {progonAppServer}=await import(pathToFileURL(file)+'?r='+Math.random());const router=new TaskControlRouter(),response=new EventEmitter(),descriptor={binding:scope,ticket:'a'.repeat(64),operations:['message','cancel','stop'],request_id:'request-fixture'};
 let listener,engine,resolveReady;const ready=new Promise(r=>resolveReady=r),calls=[],events=[];let rpc=async()=>({turnId:'turn-original'});
 const fake={slushat:f=>listener=f,uvedomit(){},umer:new Promise(()=>{}),zakryt:async()=>{},zapros:async(method,p)=>{if(method==='initialize')return{};if(method==='thread/start')return{thread:{id:'thread-original'}};if(method==='turn/start')return{turn:{id:'turn-original'}};calls.push({method,p});return rpc(method,p)}};
 const register=router.forResponse(descriptor,response,(_b,e)=>{engine=e;resolveReady()});
 const output=(async()=>{for await(const e of progonAppServer({klientImpl:()=>fake,log(){},zapros:'fixture',porog:{porog:10},tekstSignala:'PRESSURE',registerTaskControl:register}))events.push(e)})();await ready;
 const packet=(id,op='message')=>({binding:{...scope,control_id:id,...(op==='stop'?{}:{target_receipt:id}),...(op==='message'?{request_id:descriptor.request_id,sdk_thread_id:engine.thread_id,sdk_turn_id:engine.turn_id}:{})},op,body:op==='message'?body(id):op==='stop'?'':'cancel original'});
 const f={calls,events,router,response,descriptor,packet,send:(id,op)=>router.dispatch(descriptor.ticket,packet(id,op)),emit:(m,p)=>listener(m,p),rpc:v=>rpc=v};
 try{return await fn(f)}finally{await listener('turn/completed',{threadId:'thread-original',turn:{id:'turn-original',status:'completed'}});await output;}
}
const codexFile=path.join(gw,'codex-app-server.mjs');
async function held(f){let release,enter;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);f.rpc(async()=>{enter();await gate;return{turnId:'turn-original'}});const cancel=f.send('cancel','cancel');await entered;return{cancel,release};}
async function cap(file=codexFile){return codexHarness(file,async f=>{const h=await held(f);const promises=Array.from({length:17},(_,i)=>f.send('m'+i));await tick();h.release();await h.cancel;const replies=await Promise.all(promises);assert.equal(replies.filter(x=>x.accepted).length,16);assert.equal(replies[16].input_state,'not-offered');assert.equal(f.calls.length,17);await tick();return{offered:replies.filter(x=>x.accepted).length,notOffered:replies.filter(x=>!x.accepted).length};});}
async function closed(file=codexFile){return codexHarness(file,async f=>{const h=await held(f);const mail=f.send('mail');const settled=Promise.allSettled([h.cancel,mail]);await tick();f.response.emit('close');h.release();const replies=await settled;assert.equal(f.calls.length,1,'closed HTTP lease must prevent mail RPC');await tick();assert(f.events.some(x=>x.state==='not-offered'));assert(!f.events.some(x=>x.state==='offered'));return{calls:f.calls.length,outcomes:replies.map(x=>x.status),events:f.events.filter(x=>x.type==='input-status').map(x=>x.state)};});}
async function check(name,fn){const facts=await fn();results.push({name,status:'pass',facts});console.log('PASS',name,JSON.stringify(facts));}
await check('late-B-snapshot-D3',lateB);
await check('Claude-close-stale-composition',async()=>{const x=await composeTest(source,{close:true});assert(!x.out.hookSpecificOutput?.additionalContext.includes('ordinary-inbox'));assert(!x.events.some(e=>e[0]==='offered'));return{events:x.events}});
await check('D3-overbudget-refusal',async()=>{const x=await composeTest(source,{large:true});assert.equal(Object.keys(x.out).length,0);assert.deepEqual(x.events,[['hook-budget','mail']]);assert(x.b.includes('B-FIRST'));return{events:x.events,bRetained:x.b}});
await check('Codex-cap16',cap);await check('Codex-HTTPclose',closed);
await check('Codex-cancel-changed-turn-exact-D4',()=>codexHarness(codexFile,async f=>{const h=await held(f);const mail=f.send('mail');await tick();await f.emit('turn/started',{threadId:'thread-original',turn:{id:'turn-new'}});h.release();await h.cancel;const r=await mail;assert.equal(r.input_state,'not-offered');assert.equal(f.calls.length,1);assert.equal(f.calls[0].p.expectedTurnId,'turn-original');return{reply:r,calls:f.calls.length};}));
await check('Codex-cancel-pressure-mail-lane',()=>codexHarness(codexFile,async f=>{const h=await held(f);await f.emit('thread/tokenUsage/updated',{threadId:'thread-original',tokenUsage:{last:{inputTokens:20}}});const pressure=f.emit('item/completed',{threadId:'thread-original',item:{type:'commandExecution',command:'fixture'}});const mail=f.send('mail');await tick();assert.equal(f.calls.length,1);h.release();await h.cancel;await pressure;assert.equal((await mail).input_state,'not-offered');assert.equal(f.calls.length,2);assert(f.calls.every(x=>x.p.expectedTurnId==='turn-original'));assert.equal(f.calls[1].p.input[0].text,'PRESSURE');return{order:['cancel','pressure','mail refused'],calls:f.calls.map(x=>({method:x.method,expectedTurnId:x.p.expectedTurnId}))};}));
await check('exact-request-SDK-tuple-rejection-and-recovery',()=>codexHarness(codexFile,async f=>{for(const [key,value] of [['request_id','request-other'],['sdk_thread_id','thread-other'],['sdk_turn_id','turn-other']]){const p=f.packet('bad-'+key);p.binding[key]=value;assert.equal((await f.router.dispatch(f.descriptor.ticket,p)).input_state,'not-offered')}assert.equal(f.calls.length,0);assert.equal((await f.send('good')).accepted,true);assert.equal(f.calls.length,1);return{rejected:['request_id','sdk_thread_id','sdk_turn_id'],healthyRPC:1};}));
await check('sent-RPC-nonexact-ACK-stays-unknown',()=>codexHarness(codexFile,async f=>{f.rpc(async()=>({turnId:'other'}));await assert.rejects(f.send('mail'));await tick();assert.equal(f.calls.length,1);assert(!f.events.some(x=>['offered','not-offered'].includes(x.state)));return{RPC:1,statusEvents:0}}));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'beta-gateway-review-r2-'));
try{
 for(const file of ['inbox-input.mjs','task-control.mjs','secret-redact.mjs'])fs.copyFileSync(path.join(gw,file),path.join(temp,file));
 const originals={gateway:source,codex:fs.readFileSync(codexFile,'utf8')};
 for(const [name,type,from,to,test] of [
 ['late-B','gateway','vzyatB(bCount)','vzyatB()',lateB],
 ['cap16','codex','if(messageCount>=MAX_PENDING_INPUTS)','if(messageCount>=17)',cap],
 ['HTTPclose','codex','registerTaskControl?.closed?.() || ','',closed]]){
  const original=originals[type];assert.equal(original.split(from).length-1,1);const bad=original.replace(from,to);assert.notEqual(sha(original),sha(bad));const fp=path.join(temp,type==='codex'?'codex-app-server.mjs':'gateway-fragment.mjs');
  const fixedCount=()=>{const r=spawnSync('grep',['-cF','--',from,fp],{encoding:'utf8'});assert([0,1].includes(r.status));return Number(r.stdout.trim())};fs.writeFileSync(fp,original);const beforeCount=fixedCount();fs.writeFileSync(fp,bad);const afterCount=fixedCount();assert.equal(beforeCount,1);assert.equal(afterCount,0);
  let rejected=false,error;try{await test(type==='gateway'?bad:fp)}catch(e){rejected=true;error=e.message}assert(rejected,'mutation must cross tested boundary');fs.writeFileSync(fp,original);assert.equal(sha(fs.readFileSync(fp)),sha(original));await test(type==='gateway'?original:fp);
  assert.equal(fixedCount(),1);const proof={name,replacements:1,fixedCountBefore:beforeCount,fixedCountAfter:afterCount,shaBefore:sha(original),shaAfter:sha(bad),corruptionDetected:rejected,error,restored:true};results.push({name:'mutation-'+name,status:'pass',facts:proof});console.log('MUTATION',JSON.stringify(proof));
 }
}finally{fs.rmSync(temp,{recursive:true,force:true})}
if(process.env.REVIEW_EVIDENCE_FILE)fs.writeFileSync(process.env.REVIEW_EVIDENCE_FILE,JSON.stringify({time:new Date().toISOString(),sourceHashes:Object.fromEntries(['inbox-input.mjs','task-control.mjs','gateway.mjs','codex-app-server.mjs'].map(f=>[f,sha(fs.readFileSync(path.join(gw,f)))])),results},null,2)+'\n');
