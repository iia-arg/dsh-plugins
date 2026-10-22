import {installFixtureIngress} from './fixture-ingress.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import {test} from 'node:test';
import {apply} from '../src/index.js';

// The HTTP fixture replaces SDK execution only. Exercise the real adapter's abort,
// partial NDJSON buffering and iterator.return path, not a rewritten stream.
installFixtureIngress();
for(const mode of ['stream','return','late-ready','fast-terminal','eof-without-terminal','no-terminal'])test(`platform abort: ${mode}`,async()=>{
  const earlyReturn=mode==='return';
  const timeline=[],packets=[];let output,adapter,ready=false,terminalSeen=false;
  const actor={id:'child'},binding={generation:'fixture',recipient:'team',ledger_uuid:'ledger',session_id:'child',session_created:1,turn:1};
  const descriptor={binding,request_id:'request-child',ticket:'fixture-ticket',terminal:1,operations:['stop','stop-exact']};
  const sdk={generation:'sdk-fixture',thread_id:'sdk-child',turn_id:'sdk-turn'};
  let terminalResolve;const terminalPromise=new Promise(r=>{terminalResolve=r});
  const event=(state)=>({type:'task-status',state,binding,request_id:descriptor.request_id,codex:{...sdk,...(state==='terminal'?{status:'interrupted'}:{})}});
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/health'){res.end(JSON.stringify({ok:true,conversationIdentity:2,mailStopTerminal:1}));return;}
    let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);
    if(req.url==='/v1/task-control'){
      packets.push(body);assert.equal(body.binding.session_id,'child');assert.equal(body.op,'stop-exact');
      timeline.push('stop');res.end(JSON.stringify({state:'interrupting'}));
      // Terminal is deliberately delayed after ACK, and split across HTTP chunks.
      if(mode==='eof-without-terminal')setTimeout(()=>output.end(),30);
      else if(mode!=='no-terminal')setTimeout(()=>{if(output.destroyed)return;const line=JSON.stringify(event('terminal'))+'\n';output.write(line.slice(0,17));setTimeout(()=>{if(!output.destroyed)output.end(line.slice(17)+'{"type":"done"}\n');},30);},80);
      return;
    }
    output=res;
    if(mode==='fast-terminal'){res.write('{"type":"text","text":"waiting"}\n');setTimeout(()=>res.end(JSON.stringify(event('ready'))+'\n'+JSON.stringify(event('terminal'))+'\n{"type":"done"}\n'),50);}
    else if(mode==='late-ready'){res.write('{"type":"text","text":"waiting"}\n');setTimeout(()=>res.write(JSON.stringify(event('ready'))+'\n'),50);}
    else res.write(JSON.stringify(event('ready'))+'\n{"type":"text","text":"waiting"}\n');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  const service={telegramStopVersion:1,mailStopVersion:1,
    attach(agent){assert.equal(agent,actor);return {descriptor,async taskEvent(ev){
      assert.deepEqual(ev.binding,binding);assert.equal(ev.request_id,'request-child');
      if(ev.state==='ready')ready=true;else {terminalSeen=true;timeline.push('terminal');terminalResolve(true);}
    },close(){timeline.push('close');}};},
    capture(agent){assert.equal(agent,actor);return ready&&!terminalSeen?{...binding,request_id:'request-child',sdk_generation:sdk.generation,sdk_thread_id:sdk.thread_id,sdk_turn_id:sdk.turn_id}:null;},
    async stopExact(agent,id,exact){assert.equal(agent,actor);assert.equal(exact.request_id,'request-child');
      return fetch(url+'/v1/task-control',{method:'POST',body:JSON.stringify({op:'stop-exact',binding:{...exact,control_id:id}})}).then(r=>r.json());},
    waitTerminal(exact){assert.equal(exact.request_id,'request-child');return terminalPromise;},
  };
  const ctx={get:n=>n==='agents'?{currentInitiator:()=>actor}:n==='taskControlCodex'?service:undefined,
    llm:{registerAdapter(names,a){adapter=a;return()=>{};}},on(){},effect(){}};
  const abort=new AbortController();
  try{
    apply(ctx,{baseURL:url});const iterator=adapter.stream({messages:[],signal:abort.signal});
    await iterator.next();assert.equal(ready,!['late-ready','fast-terminal'].includes(mode));
    const began=performance.now();
    abort.abort(new DOMException('fixture platform interrupt','AbortError'));
    if(earlyReturn)await iterator.return();else {
      const consumed=(async()=>{try{for await(const part of iterator){};return null;}catch(e){return e;}})();
      let guard;const error=await Promise.race([consumed,new Promise(r=>{guard=setTimeout(()=>r(new Error('test deadline: reader hung')),9000);})]);clearTimeout(guard);
      assert.ok(error);
      if(mode==='no-terminal'||mode==='eof-without-terminal'){
        assert.equal(error.code,'REMOTE_STOP_UNCONFIRMED','missing terminal must fail bounded and explicitly');
        assert.ok(performance.now()-began<8800);
      }else assert.equal(error.code,'ABORTED','proved terminal must retain the original cancellation, not unknown');
    }
    if(mode==='fast-terminal')assert.deepEqual(timeline,['terminal','close']);
    else {
      assert.equal(packets.length,1,'platform abort must send exactly one scoped stop');
      assert.deepEqual(timeline,mode==='no-terminal'||mode==='eof-without-terminal'?['stop','close']:['stop','terminal','close'],'terminal proof or explicit unknown must precede release');
    }
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
