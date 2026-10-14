// Actual JSON-RPC subprocess and module-owned alert variable; no real SDK or channel.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {progonAppServer,sozdatKlienta} from '../codex-app-server.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pressure-stop-process-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async (fn,limit=1500)=>{const end=Date.now()+limit;while(!fn()){if(Date.now()>end)throw Error('fixture timeout');await sleep(5);}};
const app=path.join(tmp,'app.mjs');
fs.writeFileSync(app,`import fs from 'node:fs';import readline from 'node:readline';
let ended=false;
const send=x=>console.log(JSON.stringify(x));
const finish=()=>{if(!ended){ended=true;send({method:'turn/completed',params:{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'completed'}}});}};
const poll=setInterval(()=>{if(fs.existsSync(process.env.PROBE_RELEASE))finish();},5);
const input=readline.createInterface({input:process.stdin});
input.on('line',line=>{const x=JSON.parse(line);fs.appendFileSync(process.env.PROBE_RPC_TRACE,x.method+'\\n');
if(x.id===undefined)return;
if(x.method==='initialize')send({id:x.id,result:{}});
else if(x.method==='thread/start')send({id:x.id,result:{thread:{id:'fixture-thread'}}});
else if(x.method==='turn/start'){send({id:x.id,result:{turn:{id:'fixture-turn'}}});setTimeout(()=>{send({method:'thread/tokenUsage/updated',params:{threadId:'fixture-thread',tokenUsage:{last:{inputTokens:11}}}});send({method:'item/completed',params:{threadId:'fixture-thread',item:{type:'commandExecution',command:'true'}}});},10);}
else if(x.method==='turn/steer'){send({id:x.id,result:{turnId:'fixture-turn'}});if(process.env.PROBE_HOLD_CLOSE==='1')setTimeout(finish,5);}
else throw Error('unexpected RPC '+x.method);
});
input.on('close',()=>{if(process.env.PROBE_HOLD_CLOSE!=='1'){clearInterval(poll);process.exit(0);}});
`);
try{
 for(const [name,hold,error] of [['waiting',false,0],['closing',true,7],['overflow',false,'exec-failed'],['timeout',false,'exec-failed']]){
  const release=path.join(tmp,name+'-release'),trace=path.join(tmp,name+'-rpc'),receipt=path.join(tmp,name+'-receipt');
  const alert=path.join(tmp,name+'-alert');
  fs.writeFileSync(alert,`#!${process.execPath}
const fs=require('node:fs');let text='';process.stdin.on('data',b=>text+=b);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({argc:process.argv.slice(2).length,text,pid:process.pid,env:process.env}));process.stderr.write('fixture channel payload MUST NOT BE LOGGED');if(${JSON.stringify(name)}==='overflow'){process.stdout.write('x'.repeat(16384));setInterval(()=>{},1000);}else if(${JSON.stringify(name)}==='timeout'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);}else process.exit(${JSON.stringify(error)});});
`,{mode:0o755});
  const logs=[],events=[];let child;const spawn=(await import('node:child_process')).spawn;
  const run=(async()=>{for await(const event of progonAppServer({
    bin:process.execPath,klientImpl:o=>sozdatKlienta({...o,args:[app],spawnImpl:(...a)=>{child=spawn(...a);return child;}}),
    env:{PATH:process.env.PATH,PROBE_RELEASE:release,PROBE_RPC_TRACE:trace,PROBE_HOLD_CLOSE:hold?'1':'0',
      LANG:'C',GATEWAY_STOP_WATCH_ALERT:alert,GATEWAY_TOKEN_FILE:path.join(tmp,'no-secret')},
    log:s=>logs.push(s),zapros:'fixture',porog:{porog:10},tekstSignala:'save fixture and finish',
    predelGranicyMs:3000,predelZaversheniyaMs:3000,predelTrevogiMs:50,
  }))events.push(event);})();
  try{
    await until(()=>fs.existsSync(receipt));
    assert.equal(logs.filter(x=>x.includes('STOP_WAIT_TIMEOUT')).length,1);
    assert(logs.some(x=>x.includes('phase='+(hold?'closing-app-server':'waiting-turn'))));
    const observed=JSON.parse(fs.readFileSync(receipt));assert.equal(observed.argc,0);assert(observed.text.includes('STOP_WAIT_TIMEOUT'));assert.deepEqual(Object.keys(observed.env).sort(),['LANG','PATH']);
    assert(!fs.readFileSync(trace,'utf8').includes('turn/interrupt'));
    const begun=Date.now();await until(()=>logs.some(x=>x.includes('STOP_WAIT_ALERT: код '+error)),name==='timeout'?33000:1500);
    if(name==='timeout')assert(Date.now()-begun>=29000,'channel timeout fired early');
    assert.throws(()=>process.kill(observed.pid,0),{code:'ESRCH'},'direct alert process must have exited');
    assert(!logs.some(x=>x.includes('MUST NOT BE LOGGED')));assert.equal(logs.filter(x=>x.includes('STOP_WAIT_TIMEOUT')).length,1);
    console.log('PASS actual RPC + stdin alert '+name);
  }finally{
    if(hold)child?.kill('SIGKILL');else fs.writeFileSync(release,'finish');
    await run;
  }
  assert(events.some(x=>x.type==='itog-app-server'));
 }
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
