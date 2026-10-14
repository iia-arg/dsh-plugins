// Actual /v1/task-control, production Codex generator and JSON-RPC child; provider and keys are fixtures.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import http from 'node:http';import {EventEmitter} from 'node:events';import {spawn} from 'node:child_process';
import {progonAppServer,sozdatKlienta} from '../codex-app-server.mjs';import {TaskControlRouter} from '../task-control.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-input-verified-'));
const stub=path.join(root,'rpc.mjs');
fs.writeFileSync(stub,`import fs from 'node:fs';import readline from 'node:readline';
const emit=x=>console.log(JSON.stringify(x));const poll=setInterval(()=>{if(fs.existsSync(process.env.FIXTURE_FINISH)){clearInterval(poll);emit({method:'turn/completed',params:{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'completed'}}});}},5);
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);fs.appendFileSync(process.env.FIXTURE_TRACE,JSON.stringify(m)+'\\n');if(m.id===undefined)return;
if(m.method==='initialize')emit({id:m.id,result:{}});else if(m.method==='thread/start')emit({id:m.id,result:{thread:{id:'fixture-thread'}}});
else if(m.method==='turn/start')emit({id:m.id,result:{turn:{id:'fixture-turn'}}});else if(m.method==='turn/steer')emit({id:m.id,result:{turnId:'fixture-turn'}});else throw Error('unexpected RPC');
}).on('close',()=>{clearInterval(poll);});
`);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{const end=Date.now()+1500;while(!fn()){if(Date.now()>end)throw Error('fixture timeout');await sleep(5);}};
function post(port,ticket,packet){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/v1/task-control',method:'POST',headers:{authorization:'Bearer '+ticket,'content-type':'application/json'}},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>{try{resolve({status:res.statusCode,reply:JSON.parse(body)})}catch(e){reject(e)}})});req.on('error',reject);req.setTimeout(2500,()=>req.destroy(Error('fixture HTTP timeout')));req.end(JSON.stringify(packet));});}
async function probe(name,verified,allowed,reason){
 const trace=path.join(root,name+'-trace'),finish=path.join(root,name+'-finish'),logs=[],events=[];let child,engine;
 const binding={generation:'fixture-generation',recipient:'fixture-agent',ledger_uuid:'fixture-ledger',session_id:'fixture-session',session_created:1,turn:1};
 const descriptor={binding,ticket:'b'.repeat(64),operations:['message'],request_id:'fixture-request'};
 const router=new TaskControlRouter(),response=new EventEmitter();
 const register=router.forResponse(descriptor,response,(_binding,id)=>{engine=id});
 const server=http.createServer((req,res)=>router.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const run=(async()=>{for await(const e of progonAppServer({bin:process.execPath,klientImpl:o=>sozdatKlienta({...o,args:[stub],spawnImpl:(...args)=>{child=spawn(...args);return child}}),
  env:{PATH:process.env.PATH,FIXTURE_TRACE:trace,FIXTURE_FINISH:finish,GATEWAY_TOKEN_FILE:path.join(root,'absent-token'),CODEX_HOME:path.join(root,'absent-auth')},
  log:s=>logs.push(s),zapros:'initial fixture request',porog:{},registerTaskControl:register}))events.push(e);})();run.catch(()=>{});
 try{
  await until(()=>engine);const id='mail-'+name;
  const payload={receipt_id:id,message:{id:'msg-'+name,role:'user',source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:fixture'},content:[{type:'text',text:'PRIVATE_FIXTURE_BODY_MUST_NOT_APPEAR_IN_LOG'}]},provenance:{sender:'fixture'}};
  if(name!=='missing')payload.provenance.verified=verified;
  const packet={binding:{...binding,control_id:id,target_receipt:id,request_id:descriptor.request_id,sdk_thread_id:engine.thread_id,sdk_turn_id:engine.turn_id},op:'message',body:JSON.stringify(payload)};
  const answer=await post(server.address().port,descriptor.ticket,packet);assert.equal(answer.status,200);assert.equal(answer.reply.accepted,allowed);
  await until(()=>events.some(x=>x.type==='input-status'));
  const rpc=fs.readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.method==='turn/steer');
  assert.equal(rpc.length,allowed?1:0,'actual RPC admission differs');
  const state=events.find(x=>x.type==='input-status');assert.equal(state.state,allowed?'offered':'not-offered');
  if(allowed){assert.equal(answer.reply.input_state,'offered');assert.equal(rpc[0].params.expectedTurnId,'fixture-turn');assert(rpc[0].params.input[0].text.includes('"verified":true'));assert.equal(answer.reply.model_response,'unknown');}
  else{assert.equal(answer.reply.input_state,'not-offered');assert.equal(state.reason,reason);assert(!Object.hasOwn(state,'packet'));assert(logs.some(x=>x.includes('inbox:')&&x.includes(reason)),'refusal must be logged');}
  assert(!logs.some(x=>x.includes('PRIVATE_FIXTURE_BODY')),'message must not be reflected into diagnostic log');
  console.log('PASS '+name+' accepted='+allowed+' actual-steer='+rpc.length+(reason?' reason='+reason:''));
 }finally{
  fs.writeFileSync(finish,'complete');await run;response.emit('close');server.closeAllConnections();await new Promise(r=>server.close(r));
  assert(child?.exitCode!==null,'RPC fixture child must be closed');
 }
}
let passed=0,failed=0;
try{
 for(const [name,value,allowed,reason] of [['verified',true,true,null],['unverified',false,false,'signature-unverified'],['missing',undefined,false,'invalid-user-input'],['string','true',false,'invalid-user-input'],['numeric',1,false,'invalid-user-input'],['null',null,false,'invalid-user-input'],['restored',true,true,null]]){
  try{await probe(name,value,allowed,reason);passed++;}catch(e){failed++;console.log('FAIL '+name+': '+e.message);}
 }
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('RESULT '+passed+'/'+(passed+failed));process.exitCode=failed?1:0;
