import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {GatewayUsage} from '../usage-producer.mjs';import {progonAppServer} from '../codex-app-server.mjs';import vm from 'node:vm';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'g-auth-triplet-'));let count=0,sequence=0;
const descriptor={request_id:'fixture-request',binding:{generation:'fixture-generation',session_id:'fixture-session',session_created:42,turn:7,recipient:'master'}};
const target=n=>'/etc/claude-oauth/codex-podpiska-'+n+'/auth.json';
function fixture(){
 const dir=path.join(root,'case-'+sequence++);fs.mkdirSync(dir,{mode:0o700});const link=path.join(dir,'auth.json'),file=path.join(dir,'raw.jsonl');
 const set=n=>{const temp=link+'.new';fs.symlinkSync(target(n),temp);fs.renameSync(temp,link)};set(3);
 const g=new GatewayUsage({file,engine:'codex',descriptor,heartbeatMs:0});
 return {g,dir,link,file,set,rows:()=>fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse):[]};
}
const ready=g=>g.ready({thread_id:'fixture-thread',turn_id:'fixture-turn'});
const terminal=g=>g.terminal({thread_id:'fixture-thread',turn_id:'fixture-turn',status:'completed'});
async function finish(f){f.g.codexFinished();await f.g.close();return f.rows().filter(r=>r.kind==='auth').at(-1)}
async function test(name,fn){await fn();console.log('PASS',name);count++}
try{
 await test('stable slot3 route survives close without claiming effective auth',async()=>{
  const f=fixture();f.g.codexSpawn({CODEX_HOME:f.dir});ready(f.g);await f.g.flush();
  assert.ok(!f.rows().some(r=>r.kind==='auth'&&r.subscription),'auth published before third snapshot');
  terminal(f.g);const auth=await finish(f);assert.equal(auth.subscription,null);assert.equal(auth.authEpoch,null);assert.equal(f.rows().find(r=>r.kind==='engine_process_start').authLinkTargetAtStart,target(3));
 });
 await test('switch spawn->ready is sticky unbound',async()=>{const f=fixture();f.g.codexSpawn({CODEX_HOME:f.dir});f.set(4);ready(f.g);terminal(f.g);const a=await finish(f);assert.equal(a.subscription,null);assert.equal(a.reason,'AUTH_SOURCE_UNPROVEN:LINK_UNSTABLE_OR_UNAVAILABLE')});
 await test('switch ready->terminal is unbound',async()=>{const f=fixture();f.g.codexSpawn({CODEX_HOME:f.dir});ready(f.g);f.set(4);terminal(f.g);assert.equal((await finish(f)).subscription,null)});
 await test('terminal non-symlink is unbound without reading its contents',async()=>{const f=fixture();f.g.codexSpawn({CODEX_HOME:f.dir});ready(f.g);fs.unlinkSync(f.link);fs.writeFileSync(f.link,'fixture-not-a-credential');terminal(f.g);assert.equal((await finish(f)).subscription,null)});
 await test('return on new process restores slot3 route but cannot prove auth',async()=>{const f=fixture();f.g.codexSpawn({CODEX_HOME:f.dir});ready(f.g);f.set(4);terminal(f.g);assert.equal((await finish(f)).subscription,null);f.set(3);f.g=new GatewayUsage({file:f.file,engine:'codex',descriptor,heartbeatMs:0});f.g.codexSpawn({CODEX_HOME:f.dir});ready(f.g);terminal(f.g);assert.equal((await finish(f)).subscription,null);assert.equal(f.rows().filter(r=>r.kind==='engine_process_start').at(-1).authLinkTargetAtStart,target(3))});
 await test('slot4 stable route is retained without slot3 or slot4 attribution',async()=>{const f=fixture();f.set(4);f.g.codexSpawn({CODEX_HOME:f.dir});ready(f.g);terminal(f.g);assert.equal((await finish(f)).subscription,null);assert.equal(f.rows()[0].authLinkTargetAtStart,target(4))});
 await test('ABA same target with replaced link inode/ctime is unbound',async()=>{const f=fixture();f.g.codexSpawn({CODEX_HOME:f.dir});f.set(4);f.set(3);ready(f.g);terminal(f.g);assert.equal((await finish(f)).subscription,null)});
 await test('absent first symlink cannot recover last-known slot',async()=>{const f=fixture();fs.unlinkSync(f.link);f.g.codexSpawn({CODEX_HOME:f.dir});f.set(3);ready(f.g);terminal(f.g);assert.equal((await finish(f)).subscription,null)});
 await test('absent ready or terminal never becomes positive on process close',async()=>{
  for(const part of ['ready','terminal']){const f=fixture();f.g.codexSpawn({CODEX_HOME:f.dir});if(part!=='ready')ready(f.g);if(part!=='terminal')terminal(f.g);assert.equal((await finish(f)).subscription,null)}
 });
 await test('switch after terminal does not overwrite recorded start route',async()=>{const f=fixture();f.g.codexSpawn({CODEX_HOME:f.dir});ready(f.g);terminal(f.g);f.set(4);assert.equal((await finish(f)).subscription,null);assert.equal(f.rows().filter(r=>r.kind==='engine_process_start').at(-1).authLinkTargetAtStart,target(3))});
 await test('known credential override markers including empty stay unbound, no credential values retained',async()=>{
  for(const key of ['CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_API_KEY','OPENAI_FEDERATION_RULE_ID','OPENAI_IDENTITY_TOKEN_FILE']){const f=fixture();f.g.codexSpawn({CODEX_HOME:f.dir,[key]:''});ready(f.g);terminal(f.g);const a=await finish(f);assert.equal(a.subscription,null,key);assert.ok(!JSON.stringify(f.rows()).includes(key))}
 });
 await test('one ready-point readlink error cannot recover at terminal',async()=>{
  const f=fixture();f.g.codexSpawn({CODEX_HOME:f.dir});const readlink=fs.readlinkSync;let faults=0;
  fs.readlinkSync=function(p,...args){if(String(p)===f.link){faults++;throw Object.assign(Error('fixture readlink IO failure'),{code:'EACCES'})}return readlink.call(this,p,...args)};
  try{ready(f.g)}finally{fs.readlinkSync=readlink}
  terminal(f.g);assert.equal((await finish(f)).subscription,null);assert.equal(faults,1);
 });
 await test('unknown target is unbound',async()=>{const f=fixture();f.set(5);f.g.codexSpawn({CODEX_HOME:f.dir});ready(f.g);terminal(f.g);assert.equal((await finish(f)).subscription,null)});
 await test('no credential open/read with bounded account RPC',async()=>{
  const f=fixture(),read=fs.readFileSync,open=fs.openSync;let calls=0,reads=0;
  fs.readFileSync=function(p,...args){if(String(p).endsWith('/auth.json')){reads++;throw Error('credential contents forbidden')}return read.call(this,p,...args)};
  fs.openSync=function(p,...args){if(String(p).endsWith('/auth.json')){reads++;throw Error('credential open forbidden')}return open.call(this,p,...args)};
  try{f.g.codexSpawn({CODEX_HOME:f.dir});await f.g.codexInitialized({zapros(){calls++;throw Error('offline account RPC')}});ready(f.g);await f.g.codexBeforeTerminal();terminal(f.g);assert.equal((await finish(f)).accountRef,null);assert.equal(f.rows().filter(r=>r.kind==='engine_process_start').at(-1).authLinkTargetAtStart,target(3));assert.equal(calls,2);assert.equal(reads,0)}finally{fs.readFileSync=read;fs.openSync=open}
 });
 const appHome=fixture();
 for(const mode of ['stable','before-ready','before-terminal','return']){
  await test('actual app-server caller '+mode,async()=>{
   const f=appHome;if(mode!=='stable'){if(mode==='return')assert.equal(fs.readlinkSync(f.link),target(4));f.set(3);f.g=new GatewayUsage({file:f.file,engine:'codex',descriptor,heartbeatMs:0})}let notify,exit;const calls=[];
   const client={slushat:fn=>notify=fn,uvedomit(){},umer:new Promise(r=>exit=r),async zakryt(){exit({code:0})},async zapros(method){
    calls.push(method);if(method==='initialize'){if(mode==='before-ready')f.set(4);return{}}
    if(method==='thread/start')return{thread:{id:'parent'}};
    if(method==='turn/start'){setImmediate(()=>{if(mode==='before-terminal')f.set(4);notify('turn/completed',{threadId:'parent',turn:{id:'turn',status:'completed'}})});return{turn:{id:'turn'}}}
    throw Error('unexpected RPC '+method);
   }};
   for await(const e of progonAppServer({bin:'fixture',env:{CODEX_HOME:f.dir},log(){},zapros:'fixture',klientImpl:()=>client,usageObserver:f.g})){}
   await f.g.close();const auth=f.rows().filter(r=>r.kind==='auth').at(-1);assert.equal(auth?.accountRef,null);assert.equal(auth.detail,'ACCOUNT_READ_ERROR');assert.equal(f.rows().filter(r=>r.kind==='engine_process_start').at(-1).authLinkTargetAtStart,target(3));assert.deepEqual(calls,['initialize','account/read','thread/start','turn/start','account/read']);
  });
 }
 const execHome=fixture();
 for(const mode of ['stable','before-ready','before-terminal','return']){
  await test('actual exec provider caller '+mode,async()=>{
   const f=execHome;if(mode!=='stable'){if(mode==='return')assert.equal(fs.readlinkSync(f.link),target(4));f.set(3);f.g=new GatewayUsage({file:f.file,engine:'codex',descriptor,heartbeatMs:0})}const thread={id:'fixture-thread',async runStreamed(){
    if(mode==='before-ready')f.set(4);
    return{events:(async function*(){yield{type:'thread.started',thread_id:'fixture-thread'};if(mode==='before-terminal')f.set(4);yield{type:'turn.completed',usage:{input_tokens:0,output_tokens:0}}})()};
   }};
   const source=fs.readFileSync(new URL('../gateway.mjs',import.meta.url),'utf8'),start=source.indexOf('const POSTAVSHCHIK_OPENAI = {'),end=source.indexOf('POSTAVSHCHIK_ANTHROPIC.trebuetNashToken',start);assert(start>=0&&end>start);
   const scope={process:{env:{CODEX_HOME:f.dir}},zagruzitSdk:async()=>({Codex:class{startThread(){return thread}resumeThread(){return thread}}}),MOST_CODEX:null,tekushchijMost:null,PESOCHNICA:null,EFFORT:null,CODEX_PUT:'exec',WORK_DIR:f.dir,log(){},davlenieCodex:()=>({close(){}}),watchCodexCompactions:()=>({close(){}}),watchTurnUsage:()=>({close(){}}),putSessii:()=>null};
   const provider=vm.runInNewContext(source.slice(start,end)+'\nPOSTAVSHCHIK_OPENAI;',scope);
   for await(const e of provider.progon({zapros:'fixture',cwd:f.dir,usageObserver:f.g,pressureCounter:{}})){}
   await f.g.close();const auth=f.rows().filter(r=>r.kind==='auth').at(-1);assert.equal(auth?.subscription,null);assert.equal(f.rows().filter(r=>r.kind==='engine_process_start').at(-1).authLinkTargetAtStart,target(3));
  });
 }
 console.log('TOTAL',count,'PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
