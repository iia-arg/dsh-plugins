// Distinguish cancellation before dispatch from cancellation after a request began.
// Only the adapter's dispatcher warmup gets an abort microtask; real POSTs hit real local HTTP.
import http from 'node:http';
import assert from 'node:assert/strict';
import {installFixtureIngress} from './fixture-ingress.mjs';
const results=[];
for(const [name,relative] of [['candidate','../src/index.js']]){
 const {apply}=await import(relative);
 const controller=new AbortController();const events=[];let posts=0,adapter,ready=false,terminal=false,resolveTerminal;const term=new Promise(r=>resolveTerminal=r),disposers=[];
 const actor={id:'copy-before-post'},binding={generation:'fixture-generation',recipient:'copy',ledger_uuid:'fixture-ledger',session_id:actor.id,session_created:1,turn:1};
 const descriptor={binding,request_id:'fixture-request',ticket:'fixture-only',terminal:1,operations:['stop','stop-exact']};
 const sdk={generation:'fixture-sdk',thread_id:'fixture-child',turn_id:'fixture-turn'};
 const event=state=>({type:'task-status',state,binding,request_id:descriptor.request_id,codex:{...sdk,...(state==='terminal'?{status:'interrupted'}:{})}});
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/health'){res.end(JSON.stringify({ok:true,conversationIdentity:2,mailStopTerminal:1,postavshchik:'anthropic'}));return;}
  let raw='';for await(const b of req)raw+=b;assert.equal(req.method,'POST');assert.equal(req.url,'/v1/agent-stream');const body=JSON.parse(raw);assert.equal(body.model,'fixture');assert.equal(body.taskControl.binding.session_id,actor.id);posts++;events.push({kind:'post_received',method:req.method,path:req.url,session_id:body.taskControl.binding.session_id,original_signal_aborted:controller.signal.aborted});
  res.end(JSON.stringify(event('ready'))+'\n'+JSON.stringify(event('terminal'))+'\n{"type":"done"}\n');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(input,options)=>{
  const target=String(input);
  if(target==='http://127.0.0.1:1/')queueMicrotask(()=>{events.push({kind:'abort_in_warmup'});controller.abort(new DOMException('copy cancel before POST','AbortError'));});
  if(target===url+'/v1/agent-stream')events.push({kind:'post_attempt',original_signal_aborted:controller.signal.aborted,transport_signal_aborted:options.signal.aborted});
  return originalFetch(input,options);
 };
 const service={telegramStopVersion:1,mailStopVersion:1,
  attach(){return {descriptor,async taskEvent(x){if(x.state==='ready')ready=true;if(x.state==='terminal'){terminal=true;resolveTerminal(true);}},close(){events.push({kind:'lease_closed'});}};},
  capture(){return ready&&!terminal?{...binding,request_id:descriptor.request_id,sdk_generation:sdk.generation,sdk_thread_id:sdk.thread_id,sdk_turn_id:sdk.turn_id}:null;},
  async stopExact(){events.push({kind:'remote_stop_attempt'});return {state:'idle'};},waitTerminal(){return term;}};
 const cleanupIngress=installFixtureIngress();
 try{
  apply({get:k=>k==='agents'?{currentInitiator:()=>actor}:k==='taskControlCodex'?service:undefined,llm:{registerAdapter(_n,a){adapter=a;return ()=>{};}},on(){},effect(fn){const d=fn();if(typeof d==='function')disposers.push(d);}}, {baseURL:url});
  let error=null;try{for await(const x of adapter.stream({model:'fixture',messages:[],signal:controller.signal})){};}catch(e){error={code:e.code,message:e.message};}
  assert.ok(events.some(e=>e.kind==='abort_in_warmup'));assert.ok(error);
  const row={name,posts_after_cancel_before_send:posts,error,events};results.push(row);console.log(JSON.stringify(row));
 }finally{globalThis.fetch=originalFetch;disposers.forEach(d=>d());cleanupIngress();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
assert.equal(results[0].error.code,'ABORTED');
assert.equal(results[0].posts_after_cancel_before_send,0,'cancel during warmup must not reach the real POST receiver');
assert.equal(results[0].events.filter(x=>x.kind==='post_attempt').length,0,'original signal must be checked before invoking POST');
console.log('PASS cancel between entry and POST: zero API requests');
