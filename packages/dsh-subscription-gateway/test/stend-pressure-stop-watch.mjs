// Real gateway generator with an isolated RPC peer; no provider, service or real alerts.
import assert from 'node:assert/strict';
import {progonAppServer} from '../codex-app-server.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{const end=Date.now()+500;while(!fn()){if(Date.now()>end)throw Error('fixture condition timeout');await sleep(5);}};
function fixture({ack='bound',holdClose=false,closeError=false,earlyCompletion=false}={}){
  const calls=[],logs=[],events=[];let listener,releaseClose,resolveAck,resolveExit;
  const closed=new Promise(r=>resolveExit=r),closeGate=new Promise(r=>releaseClose=r);
  let full=false,started=false;
  const client={
    zapros(method,params){calls.push({method,params});
      if(method==='initialize')return Promise.resolve({});
      if(method==='thread/start')return Promise.resolve({thread:{id:'fixture-thread'}});
      if(method==='turn/start'){started=true;if(earlyCompletion)listener('turn/completed',{turn:{id:'fixture-turn',status:'completed'}});return Promise.resolve({turn:{id:'fixture-turn'}});}
      if(method==='turn/steer'){
        if(ack==='reject')return Promise.reject(Error('fixture RPC refused'));
        if(ack==='deferred')return new Promise(r=>resolveAck=r);
        return Promise.resolve({turnId:ack==='unbound'?'other-turn':'fixture-turn'});
      }
      throw Error('unexpected RPC '+method);
    },
    uvedomit(){},slushat(fn){listener=fn;},umer:closed,
    async zakryt(){if(holdClose)await closeGate;if(closeError)throw Error('fixture close refused');full=true;resolveExit({code:0});},
  };
  const emit=(m,p)=>Promise.resolve(listener(m,p));
  const run=(async()=>{for await(const e of progonAppServer({
    bin:'fixture',env:{GATEWAY_TOKEN_FILE:'/nonexistent-fixture-secret'},log:s=>logs.push(s),
    zapros:'fixture',porog:{porog:10},tekstSignala:'save state and finish',
    klientImpl:()=>client,predelGranicyMs:3000,predelZaversheniyaMs:3000,predelTrevogiMs:30,
  }))events.push(e);})();
  run.catch(()=>{});
  const ready=()=>until(()=>started&&logs.some(x=>x.includes('ход начат')));
  const pressure=async()=>{await emit('thread/tokenUsage/updated',{threadId:'fixture-thread',tokenUsage:{last:{inputTokens:11}}});return emit('item/completed',{threadId:'fixture-thread',item:{type:'commandExecution',command:'true'}});};
  const complete=()=>emit('turn/completed',{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'completed'}});
  return {calls,logs,events,run,ready,pressure,complete,emit,release:releaseClose,ack:()=>resolveAck?.({turnId:'fixture-turn'}),full:()=>full};
}
let pass=0,fail=0;
async function test(name,fn){try{await fn();pass++;console.log('PASS '+name);}catch(e){fail++;console.log('FAIL '+name+': '+e.message);}}
const alarms=f=>f.logs.filter(x=>x.includes('STOP_WAIT_TIMEOUT'));
await test('bound-ACK-no-completion-warns-once-without-interrupt',async()=>{
  const f=fixture();try{await f.ready();await f.pressure();await sleep(85);
    assert.equal(alarms(f).length,1);assert(alarms(f)[0].includes('phase=waiting-turn'));
    assert(!f.calls.some(x=>x.method==='turn/interrupt'));assert(!f.full());
    await sleep(45);assert.equal(alarms(f).length,1);
  }finally{await f.complete();await f.run;}
});
await test('completed-but-close-held-still-warns',async()=>{
  const f=fixture({holdClose:true});try{await f.ready();await f.pressure();await f.complete();await sleep(85);
    assert.equal(alarms(f).length,1);assert(alarms(f)[0].includes('phase=closing-app-server'));assert(!f.full());
  }finally{f.release();await f.complete();await f.run;}
});
await test('normal-completion-disarms-before-deadline',async()=>{
  const f=fixture();await f.ready();await f.pressure();await f.complete();await f.run;await sleep(70);
  assert.equal(alarms(f).length,0);assert(f.full());
});
await test('late-ACK-after-full-close-does-not-rearm',async()=>{
  const f=fixture({ack:'deferred'});await f.ready();const waiting=f.pressure();await until(()=>f.calls.some(x=>x.method==='turn/steer'));
  await f.complete();await f.run;f.ack();await waiting;await sleep(70);
  assert.equal(alarms(f).length,0);assert(f.logs.some(x=>x.includes('late-after-close')));
});
await test('unbound-transport-result-is-not-labelled-bound',async()=>{
  const f=fixture({ack:'unbound'});try{await f.ready();await f.pressure();await sleep(85);
    assert.equal(alarms(f).length,1);assert(alarms(f)[0].includes('ack_bound=false'));
  }finally{await f.complete();await f.run;}
});
await test('RPC-refusal-does-not-arm-ACK-watch',async()=>{
  const f=fixture({ack:'reject'});await f.ready();await f.pressure();await sleep(70);await f.complete();await f.run;
  assert.equal(alarms(f).length,0);assert(f.logs.some(x=>x.includes('turn/steer ОТКАЗАН')));
});
await test('other-turn-completion-keeps-legacy-outcome-and-logs-unbound',async()=>{
  const f=fixture();await f.ready();await f.pressure();
  await f.emit('turn/completed',{threadId:'fixture-thread',turn:{id:'other-turn',status:'completed'}});
  await f.run;await sleep(70);assert(f.full());assert.equal(alarms(f).length,0);
  assert(f.logs.some(x=>x.includes('turn/completed observed: bound=false')));
});
await test('close-refusal-does-not-claim-child-closed',async()=>{
  const f=fixture({closeError:true});await f.ready();await f.pressure();await sleep(85);
  await f.complete();await assert.rejects(f.run,/fixture close refused/);
  assert(!f.full());assert(!f.logs.some(x=>x.includes('STOP_WAIT_CLOSED')));
  assert(f.logs.some(x=>x.includes('STOP_WAIT_ABORTED')));
});
await test('completion-before-start-binding-is-unknown',async()=>{
  const f=fixture({earlyCompletion:true});await f.run;
  assert(f.logs.some(x=>x.includes('turn/completed observed: bound=null')));
});
console.log('RESULT '+pass+'/'+(pass+fail));process.exitCode=fail?1:0;
