// Actual generator; synthetic RPC, alert and credentials. No production service or auth files.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const source=process.env.WATCH_REVIEW_SOURCE||fileURLToPath(new URL('../codex-app-server.mjs',import.meta.url));
const M=await import(pathToFileURL(source));
const {sekretyProcessa}=await import(new URL('./secret-redact.mjs',pathToFileURL(source)));
const scope=process.env.WATCH_REVIEW_CASE||'all';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{const end=Date.now()+1500;while(!fn()){if(Date.now()>end)throw Error('fixture timeout');await sleep(5);}};
function fixture(env={}){
 const logs=[],calls=[],events=[];let listener,ready=false,done=false;
 const client={slushat:f=>listener=f,uvedomit(){},umer:new Promise(()=>{}),zakryt:async()=>{},
  zapros:async method=>{calls.push(method);if(method==='initialize')return{};
   if(method==='thread/start')return{thread:{id:'fixture-thread'}};
   if(method==='turn/start'){ready=true;return{turn:{id:'fixture-original'}};}
   if(method==='turn/steer')return{turnId:'fixture-original'};throw Error('unexpected RPC');}};
 const run=(async()=>{for await(const e of M.progonAppServer({bin:'fixture',klientImpl:()=>client,env,
   log:s=>logs.push(s),zapros:'fixture',porog:{porog:10},tekstSignala:'finish fixture',
   predelTrevogiMs:30,predelGranicyMs:3000,predelZaversheniyaMs:3000}))events.push(e);})().finally(()=>done=true);
 const emit=(m,p)=>Promise.resolve(listener(m,{threadId:'fixture-thread',...p}));
 return {logs,calls,events,run,done:()=>done,ready:()=>until(()=>ready&&logs.some(x=>x.includes('ход начат'))),emit,
  pressure:async()=>{await emit('thread/tokenUsage/updated',{tokenUsage:{last:{inputTokens:11}}});await emit('item/completed',{item:{type:'commandExecution'}});},
  complete:id=>emit('turn/completed',{turn:{id,status:'completed'}})};
}
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch{failed++;console.log('FAIL '+name);}}
if(scope==='turn'||scope==='all')for(const started of [true,false])await test(started?'steer-new-start-new-completion-finishes':'other-id-completion-keeps-legacy-outcome',async()=>{
 const f=fixture({GATEWAY_TOKEN_FILE:'/nonexistent-fixture-secret'});
 try{
  await f.ready();await f.pressure();if(started)await f.emit('turn/started',{turn:{id:'fixture-next'}});
  await f.complete('fixture-next');await sleep(80);console.log('TURN_PROBE new-start='+started+' generator-finished='+f.done());assert(f.done(),'new completion must finish local generator');
  assert(f.events.some(x=>x.type==='itog-app-server'));
  if(M.PREDEL_TREVOGI_STOPA_MS)assert(f.logs.some(x=>x.includes('turn/completed observed: bound=false')));
  assert(!f.calls.includes('turn/interrupt'));
 }finally{if(!f.done())await f.complete('fixture-original');await f.run;}
});
if(scope==='alert'||scope==='all')await test('alert-dumps-minimal-env-without-process-secrets',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pressure-stop-env-'));
 const markers=Array.from({length:5},(_,i)=>'SYNTHETIC_WATCH_PRIVATE_'+i+'_abcdefghijklmnop');
 const token=path.join(tmp,'token'),ingress=path.join(tmp,'ingress'),codex=path.join(tmp,'codex');fs.mkdirSync(codex);
 fs.writeFileSync(token,markers[0],{mode:0o600});fs.writeFileSync(ingress,markers[1],{mode:0o600});
 fs.writeFileSync(path.join(codex,'auth.json'),JSON.stringify({tokens:{access_token:markers[2],refresh_token:markers[3],id_token:markers[4]}}),{mode:0o600});
 const receipt=path.join(tmp,'receipt'),alert=path.join(tmp,'alert');
 fs.writeFileSync(alert,`#!${process.execPath}\nconst fs=require('node:fs');let text='';process.stdin.on('data',b=>text+=b);process.stdin.on('end',()=>{const env=JSON.stringify(process.env);process.stdout.write(env);fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({env:process.env,text,argc:process.argv.slice(2).length}));});\n`,{mode:0o755});
 const env={PATH:process.env.PATH,LANG:'C',HOME:tmp,GATEWAY_STOP_WATCH_ALERT:alert,GATEWAY_TOKEN_FILE:token,GATEWAY_INGRESS_KEY_FILE:ingress,CODEX_HOME:codex,
  ANTHROPIC_API_KEY:markers[0],OPENAI_API_KEY:markers[1],PRIVATE_REFRESH_TOKEN:markers[3],PRIVATE_ACCESS_TOKEN:markers[2],PRIVATE_ID_TOKEN:markers[4],NODE_OPTIONS:'--no-warnings'};
 const expected=sekretyProcessa(env);assert.equal(expected.length,5);for(const value of markers)assert(expected.includes(value));
 const f=fixture(env);
 try{
  await f.ready();await f.pressure();await until(()=>fs.existsSync(receipt));await until(()=>f.logs.some(x=>x.includes('STOP_WAIT_ALERT')));
  const data=JSON.parse(fs.readFileSync(receipt));const dump=JSON.stringify(data.env);
  console.log('ENV_PROBE synthetic-secret-values-in-child='+expected.filter(value=>dump.includes(value)).length+'/'+expected.length);
  for(const value of expected)assert(!dump.includes(value),'secret reached alert environment');
  assert.deepEqual(Object.keys(data.env).sort(),['LANG','PATH']);assert.equal(data.env.PATH,env.PATH);assert.equal(data.env.LANG,'C');
  assert.equal(data.argc,0);assert(data.text.includes('STOP_WAIT_TIMEOUT'));for(const value of markers)assert(!JSON.stringify(f.logs).includes(value));
  assert(!f.logs.some(x=>x.includes('NODE_OPTIONS')),'child environment dump reflected into log');
  console.log('ENV_PROBE synthetic-secret-values=5/5 absent; allowed-keys=LANG,PATH; argv=0');
 }finally{await f.complete('fixture-original');await f.run;fs.rmSync(tmp,{recursive:true,force:true});}
});
console.log('RESULT '+passed+'/'+(passed+failed));process.exitCode=failed?1:0;
