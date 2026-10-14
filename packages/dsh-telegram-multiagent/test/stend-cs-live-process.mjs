// B-N-2010: real gateway process + RPC boundary fixture + rollout watcher + actual /cs handler body.
// The SDK and compaction backend are external fixtures; no real model, keys or services are used.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {copyGatewayFixture} from './cs-gateway-fixture.mjs';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';
import {readContextStatus,currentContextStatus} from '../src/context-status.js';
import {readCodexStatus,formatStatus} from '../src/compact-status.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-live-process-'));
const channelRoot=process.env.STEND_CHANNEL_SOURCE||fileURLToPath(new URL('..',import.meta.url));
const selectedChannel=await import(pathToFileURL(path.join(channelRoot,'src/compact-status.js')).href);
let child,routeDb,requests=[];let passed=0,failed=0,output='';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,limit=6000){const end=Date.now()+limit;while(!await fn()){if(Date.now()>=end)throw Error('expected condition not observed in '+limit+'ms');await sleep(20)}}
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name)}catch(e){failed++;console.log('FAIL '+name+': '+e.message)}}
async function port(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
const legacyGroup=process.env.STEND_LEGACY_GROUP==='1';
const id=legacyGroup?'telegram--1004442041878':'telegram-v2-11111111-1111-4111-8111-111111111111';
const other='telegram-v2-22222222-2222-4222-8222-222222222222';
const session={id,header:{id,createdAt:10,cwd:root},events:[],requestHeader:()=>({config:{provider:'claude-oauth',model:'gpt-6-astra'}})};
let deriveCalls=0;
if(legacyGroup)session.deriveMessages=()=>{deriveCalls++;return [{role:'user',content:'identical first message'}]};
const dbfile=path.join(root,'sessions.db');
try{
 const pkg=path.join(root,'gateway');let fixture;
 try{fixture=copyGatewayFixture(pkg)}catch(e){if(e.code!=='STEND_BLIND')throw e;console.error(e.message);fs.rmSync(root,{recursive:true,force:true});process.exit(2)}
 const {deps}=fixture;
 const {extractFunction}=await import(pathToFileURL(path.join(pkg,'test/extract.mjs')).href);
 fs.symlinkSync(deps,path.join(pkg,'node_modules'),'dir');
 const sdk=path.join(pkg,'sdk-runtime/node_modules/@openai/codex-sdk');fs.mkdirSync(sdk,{recursive:true});
 fs.writeFileSync(path.join(sdk,'package.json'),JSON.stringify({name:'@openai/codex-sdk',version:'0.154.0',type:'module',main:'index.mjs'}));
 fs.writeFileSync(path.join(sdk,'index.mjs'),'export class Codex{}');
 const codeHome=path.join(root,'codex-fixture');fs.mkdirSync(codeHome);fs.writeFileSync(path.join(codeHome,'auth.json'),'{}');
 const keyFile=path.join(root,'synthetic-ingress');fs.writeFileSync(keyFile,'0'.repeat(64),{mode:0o600});
 const backend=path.join(root,'backend.mjs');
 fs.writeFileSync(backend,`import path from 'node:path';
 export const KOMPAKT_POROG=599181,KOMPAKT_STUPENI=[.6,.8,.95],STUPEN_SESSII=new Map(),KOMPAKT_SHLYUZOVOJ=false,KOMPAKT_PLATFORMENNYJ=true;
 export const porogIzPreseta=()=>({porog:599181,okno:921818,dolya:.65});
 export const putSessii=(sid,cwd)=>process.env.FIXTURE_ROLLOUT_DIR?path.join(process.env.FIXTURE_ROLLOUT_DIR,'rollout-'+sid+'.jsonl'):path.join(cwd,sid+'.jsonl');
 export const stupenZanjatosti=()=>-1,reshitKompakt=()=> 'vyklyuchen',polnayaZanyatost=()=>0,zanyatostIzZhurnala=()=>null;
 export const vedraPoImeni=()=>({inputTokens:1,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0});
 export const fizicheskiyKompakt=async()=>{throw Error('fixture forbids physical compaction')};`);
 // The RPC child returns the actual thread binding before completion, creates the real watched file and holds the turn.
 fs.writeFileSync(path.join(root,'app-server'),`const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
 const emit=x=>console.log(JSON.stringify(x));let id,turn,timer;const file=sid=>process.env.FIXTURE_ROLLOUT_DIR?path.join(process.env.FIXTURE_ROLLOUT_DIR,'rollout-'+sid+'.jsonl'):path.join(process.env.FIXTURE_ROOT,sid+'.jsonl');
 readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;
 if(m.method==='initialize')emit({id:m.id,result:{}});
 else if(m.method==='thread/start'||m.method==='thread/resume'){
 id=m.params.threadId||require('node:crypto').randomUUID();if(!fs.existsSync(file(id)))fs.writeFileSync(file(id),'');
 fs.appendFileSync(path.join(process.env.FIXTURE_ROOT,'threads'),id+'\\n');emit({id:m.id,result:{thread:{id}}});
 }else if(m.method==='turn/start'){
 turn='turn-'+id;emit({id:m.id,result:{turn:{id:turn}}});timer=setInterval(()=>{if(fs.existsSync(path.join(process.env.FIXTURE_ROOT,id+'.finish'))){clearInterval(timer);emit({method:'turn/completed',params:{threadId:id,turn:{id:turn,status:'completed'}}});}},20);
 }else if(m.method==='turn/steer')emit({id:m.id,result:{turnId:turn}});
 else throw Error('unexpected RPC '+m.method);
 }).on('close',()=>{clearInterval(timer)});`);
 const p=await port(),mcp=await port();
 const env={PATH:process.env.PATH,LANG:'C.UTF-8',GATEWAY_POSTAVSHIK:'openai',GATEWAY_PORT:String(p),GATEWAY_MCP_PORT:String(mcp),
  GATEWAY_WORK_DIR:root,GATEWAY_BAZA_SESSIJ:dbfile,CODEX_HOME:codeHome,GATEWAY_TOKEN_FILE:path.join(root,'absent-token'),
  GATEWAY_INGRESS_KEY_FILE:keyFile,GATEWAY_CODEX_PUT:'app-server',GATEWAY_CODEX_BIN:process.execPath,
  GATEWAY_COMPACTION_MODULE:backend,GATEWAY_DAVLENIE:'',GATEWAY_YASHCHIK:'',FIXTURE_ROOT:root,...(process.env.STEND_AFTER_COMPACT?{FIXTURE_ROLLOUT_DIR:path.join(codeHome,'sessions')}:{})};
 if(process.env.STEND_AFTER_COMPACT)fs.mkdirSync(env.FIXTURE_ROLLOUT_DIR);
 child=spawn(process.execPath,[path.join(pkg,'gateway.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 await until(async()=>{if(child.exitCode!==null)throw Error('gateway startup failed: '+output.slice(-1500));try{const r=await fetch('http://127.0.0.1:'+p+'/health');return r.status===200}catch{return false}});
 const settingsRoot=path.join(root,'settings');fs.mkdirSync(settingsRoot);
 fs.writeFileSync(path.join(settingsRoot,'fixture.json'),JSON.stringify({domZhurnalaSessij:codeHome,bazaSessij:dbfile}));
 const src=fs.readFileSync(path.join(channelRoot,'src/index.js'),'utf8');
 const marker=src.indexOf("name: 'compact-status'"),start=src.lastIndexOf('komandy.register({',marker),end=src.indexOf("log('[статус] команда /compact-status",marker);
 assert(start>=0&&end>start,'actual /cs registration block absent');let command;
 // Execute Alpha's real service producer against a real synthetic channel_sessions table.
 const addressSource=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 routeDb=new DatabaseSync(path.join(root,'channel.db'));
 routeDb.exec('CREATE TABLE channel_sessions(route_key TEXT,session_id TEXT,session_created INTEGER)');
 let insertRoute=routeDb.prepare('INSERT INTO channel_sessions VALUES(?,?,?)');
 insertRoute.run(legacyGroup?'-1004442041878':'a2a',id,10);insertRoute.run(legacyGroup?'a2a':process.env.STEND_AFTER_COMPACT?'-1004442041878':'telegram--1004442041878',other,10);
 const addressScope={Buffer,receipts:{db:routeDb},ctx:{provide:(name,service)=>{assert.equal(name,'spoolConversation');addressScope.service=service}}};
 vm.createContext(addressScope);vm.runInContext(extractFunction(addressSource,'spoolConversationFor'),addressScope);
 const serviceLine=addressSource.split('\n').find(line=>line.includes("ctx.provide('spoolConversation'"));assert(serviceLine,'Alpha positive capability provider missing');
 vm.runInContext(serviceLine,addressScope);const spool=addressScope.service;assert.equal(spool.version,1);
 const getAddress=s=>spool.forAgent({session:s});let serviceEnabled=true;
 let rotateDuringRead=false,lastCommandAgent,afterReadFault,afterLegacyFault;
 const adapter={baseURL:'http://127.0.0.1:'+p,ingressKeyFile:keyFile,spoolConversationFor:()=>getAddress(lastCommandAgent?.session??session)};
 const adapters=new Map([['claude-oauth',{adapter}]]);

 const context={komandy:{register:d=>{command=d}},schetchik:{measure:()=>({totalTokens:process.env.STEND_AFTER_COMPACT?202074:611263,baseline:{kind:'usage',tokens:process.env.STEND_AFTER_COMPACT?202074:611000}})},
  ctx:{get:n=>n==='spoolConversation'?(serviceEnabled?spool:undefined):n==='llm'?{adapters,resolveModelInfo:async()=>({context:{contextWindow:921818}})}:undefined,emit:(_target,_event,values)=>values.push({auto:true,thresholdRatio:.65})},
  platform:{scopeTarget:agent=>agent},deployment:{compactSettingsRoot:settingsRoot},process:{env:{KOMPAKT_AGENT:'fixture'}},
  fs,path,currentContextStatus,readContextStatus:async(s,opts)=>{const got=await readContextStatus(s,opts);if(rotateDuringRead){lastCommandAgent.session={...s,header:{...s.header,createdAt:s.header.createdAt+1}};rotateDuringRead=false}if(afterReadFault==='db'){routeDb.close();afterReadFault=null}else if(afterReadFault==='service'){serviceEnabled=false;afterReadFault=null}return got},readCodexStatus:async(s,opts)=>{const got=await selectedChannel.readCodexStatus(s,opts);if(afterLegacyFault==='service'){serviceEnabled=false;afterLegacyFault=null}else if(afterLegacyFault==='session'){lastCommandAgent.session={...s,id:other,header:{...s.header,id:other}};afterLegacyFault=null}return got},formatStatus:selectedChannel.formatStatus,prichina:e=>e.message,log:()=>{},Date};
 vm.runInNewContext(src.slice(start,end),context);
 const cs=(s=session)=>{lastCommandAgent={id:s.id,session:s,status:'running'};return command.handler({agent:lastCommandAgent,signal:new AbortController().signal})};
 const read=(s=session)=>readContextStatus(s,{dbPath:dbfile,address:getAddress(s)});
 function startRequest(s,{omitAddress=false,addressOverride,messages=[{role:'user',content:'identical first message'}]}={}){
  const task=(async()=>{const r=await fetch('http://127.0.0.1:'+p+(legacyGroup?'/v1/agent-stream':'/v2/agent-stream'),{method:'POST',headers:{authorization:'Bearer '+'0'.repeat(64),'content-type':'application/json',...(!omitAddress?{'x-dsh-spool-conversation':addressOverride??getAddress(s)}:{})},
    body:JSON.stringify({model:'gpt-6-astra',cwd:root,...(legacyGroup?{}:{conversation:{version:2,id:s.id,createdAt:s.header.createdAt,cwd:root}}),messages})});
    assert.equal(r.status,200);return r.text()})();task.catch(()=>{});requests.push(task);return task;
 }
 const threads=()=>fs.existsSync(path.join(root,'threads'))?fs.readFileSync(path.join(root,'threads'),'utf8').trim().split('\n'):[];
 const rollout=thread=>process.env.STEND_AFTER_COMPACT?path.join(codeHome,'sessions','rollout-'+thread+'.jsonl'):path.join(root,thread+'.jsonl');
 function token(thread,n){const time=new Date().toISOString();fs.appendFileSync(rollout(thread),JSON.stringify({type:'event_msg',timestamp:time,payload:{type:'token_count',info:{last_token_usage:{input_tokens:n,output_tokens:0,cached_input_tokens:0},model_context_window:921818}}})+'\n');return time}
 const normalize=s=>s.replace(/[\s\u00a0\u202f]/g,'');
 if(process.env.STEND_AFTER_COMPACT){
  const compact=s=>{const t=Date.now(),at=(s.events.at(-1)?.seq??0)+1;s.events.push(
    {type:'compaction/start',seq:at,time:t-2,data:{compactionId:'post-'+at}},
    {type:'compaction/summary',seq:at+1,time:t-1,data:{}},
    {type:'compaction/end',seq:at+2,time:t,data:{compactionId:'post-'+at}})};
  const mapping=thread=>{const db=new DatabaseSync(dbfile,{readOnly:true});try{return db.prepare('SELECT * FROM sessions WHERE sessionId=?').all(thread)}finally{db.close()}};
  const mappingTotal=()=>{const db=new DatabaseSync(dbfile,{readOnly:true});try{return db.prepare('SELECT count(*) AS n FROM sessions').get().n}finally{db.close()}};
  const prominent=(answer,n,time)=>{const flat=normalize(answer.text);
    assert(flat.includes('модель'+n+'·'),answer.text);
    assert(answer.text.includes('снято '+new Date(Date.parse(time)+10800000).toISOString().slice(11,19)+' МСК'),answer.text);assert(answer.text.split('\n')[0].endsWith(' (снято внутри хода)'),answer.text);
    assert(!answer.text.split('\n').find(line=>line.startsWith('модель ')).includes('устарел')&&!flat.includes('202074')&&!flat.includes('611263')&&!flat.includes('611000'),answer.text)};
  const sample=async(s,thread,n)=>{const time=token(thread,n);const h=await(await fetch('http://127.0.0.1:'+p+'/health')).json();
    if(h.contextStatus===1)await until(async()=>{const value=await read(s);return value.inputTokens===n&&value.timestamp===time},3000).catch(()=>{});
    else await sleep(1100);
    return {answer:await cs(s),time}};
  compact(session);await sleep(10);
  let finishedA=false;const first=startRequest(session);first.then(()=>finishedA=true,()=>finishedA=true);
  await until(()=>threads().length===1);const ta=threads()[0];
  await test(legacyGroup?'legacy group telegram--1004442041878 after compact: two fresh cs before completed with empty hash mapping':'new Codex thread after native compaction: two fresh cs before turn/completed with no mapping',async()=>{
    assert.equal(mapping(ta).length,0);
    if(legacyGroup){
      // The actual legacy reader must reach deriveMessages/hash lookup, not a no-first-message error.
      const count=deriveCalls;await assert.rejects(selectedChannel.readCodexStatus(session,{home:codeHome,dbPath:dbfile}),/однозначное соответствие сессий не найдено/);assert(deriveCalls>count);
    }
    const firstCount=legacyGroup?245954:246000;
    const emptyBefore=legacyGroup?mappingTotal():null;
    const x=await sample(session,ta,firstCount),emptyBetween=legacyGroup?mappingTotal():null;
    const y=await sample(session,ta,254099),emptyAfter=legacyGroup?mappingTotal():null;
    if(legacyGroup){assert.equal(emptyBefore,0);assert.equal(emptyBetween,0);assert.equal(emptyAfter,0);console.log('LEGACY EMPTY CHECKPOINTS before='+emptyBefore+' between='+emptyBetween+' after='+emptyAfter)}
    if(legacyGroup)console.log('LEGACY TWO CS first='+normalize(x.answer.text)+' second='+normalize(y.answer.text)+' deriveCalls='+deriveCalls+' mapping='+mapping(ta).length+' HTTPstillheld='+!finishedA);
    prominent(x.answer,firstCount,x.time);prominent(y.answer,254099,y.time);
    assert(!finishedA,'turn completed before the two cs');assert.equal(mapping(ta).length,0);
    console.log('STATUS new-after-compact first='+normalize(x.answer.text)+' second='+normalize(y.answer.text)+' mapping=0 HTTPstillheld=true');
    if(legacyGroup){
      assert.equal(session.id,'telegram--1004442041878');const tuple=JSON.parse(Buffer.from(getAddress(session),'base64url'));assert.equal(tuple.key,'-1004442041878');assert.equal(tuple.session_id,session.id);
      const db=new DatabaseSync(dbfile);assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
      const key=createHash('sha256').update('user'+'\0'+'identical first message').digest('hex').slice(0,32);
      // After both /cs calls, an independent positive oracle checks the actual hash branch.
      // The synthetic row is removed before finishing the still-held request.
      db.prepare('INSERT INTO sessions(kluch,sessionId) VALUES(?,?)').run(key,ta);
      try{const count=deriveCalls;const got=await selectedChannel.readCodexStatus(session,{home:codeHome,dbPath:dbfile});assert.equal(got.sessionId,ta);assert.equal(got.total,254099);assert(deriveCalls>count)}
      finally{db.prepare('DELETE FROM sessions WHERE kluch=?').run(key);assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);db.close()}
      console.log('LEGACY ORACLE id='+session.id+' route='+tuple.key+' endpoint=v1 deriveMessages/hashNegativeAndPositive=true mappingBeforeAndAfterBothCs=0 HTTPstillheld='+!finishedA);
    }
  });
  if(!legacyGroup){
  const group={...session,id:other,header:{...session.header,id:other},events:[]};compact(group);await sleep(10);
  let finishedB=false;const second=startRequest(group);second.then(()=>finishedB=true,()=>finishedB=true);
  await until(()=>threads().length===2);const tb=threads()[1];
  await test('two Codex conversations after compaction retain different pressure during parallel held turns',async()=>{
    const x=await sample(session,ta,254099),y=await sample(group,tb,123456);prominent(x.answer,254099,x.time);prominent(y.answer,123456,y.time);
    assert(!normalize(x.answer.text).includes('123456'));assert(!normalize(y.answer.text).includes('254099'));
    assert(!finishedA&&!finishedB);assert.equal(mapping(ta).length,0);assert.equal(mapping(tb).length,0);
    console.log('STATUS parallel-after-compact a2a='+normalize(x.answer.text)+' group='+normalize(y.answer.text));
  });
  fs.writeFileSync(path.join(root,ta+'.finish'),'done');await first;fs.unlinkSync(path.join(root,ta+'.finish'));
  const completed=mapping(ta);assert.equal(completed.length,1,'prior completed request must establish resume precondition');
  // Native /ccc does not need an SDK compact marker: retained rollout history must be seeded, not republished.
  compact(session);await sleep(10);
  let finishedResume=false;const resumed=startRequest(session,{messages:[{role:'user',content:'identical first message'},{role:'assistant',content:'prior response'},{role:'user',content:'after compaction held request'}]});
  resumed.then(()=>finishedResume=true,()=>finishedResume=true);await until(()=>threads().length===3);assert.equal(threads()[2],ta,'actual gateway must resume its mapped thread');
  await test('resumed Codex thread after compaction: two fresh cs before completion without advancing processed prompt',async()=>{
    const before=mapping(ta);assert.equal(before[0].otdano,completed[0].otdano);assert.equal(before[0].hashPref,completed[0].hashPref);
    await sleep(1100);const waiting=await cs(session);
    const x=await sample(session,ta,111111),y=await sample(session,ta,222222);
    prominent(x.answer,111111,x.time);prominent(y.answer,222222,y.time);
    assert(waiting.text.includes('после сжатия, замера ещё нет'),waiting.text);assert(!normalize(waiting.text).includes('254099')&&!normalize(waiting.text).includes('202074'),waiting.text);
    assert(!finishedResume);const during=mapping(ta);assert.equal(during[0].otdano,completed[0].otdano);assert.equal(during[0].hashPref,completed[0].hashPref);
    console.log('STATUS resumed-after-compact first='+normalize(x.answer.text)+' second='+normalize(y.answer.text)+' processedCursorUnchanged=true HTTPstillheld=true');
  });
  }
 }else if(process.env.STEND_VERSION_MATRIX){
  startRequest(session);await until(()=>threads().length===1);token(threads()[0],254099);
  if(process.env.STEND_VERSION_MATRIX==='old-channel')await until(async()=> (await read()).inputTokens===254099);
  else await sleep(1200);
  await test(process.env.STEND_VERSION_MATRIX+' retains legacy pressure without claiming an in-turn sample',async()=>{
   const answer=await cs();assert(normalize(answer.text).includes('611263'));assert(!answer.text.includes('снято'));assert(!normalize(answer.text).includes('254099'));
   if(process.env.STEND_VERSION_MATRIX==='old-gateway')assert(answer.text.includes('устарело'));
  });
  if(process.env.STEND_VERSION_MATRIX==='old-gateway')await test('old gateway after /ccc suppresses old estimate',async()=>{
   const s={...session,events:[{type:'compaction/summary',seq:20,time:Date.now(),data:{}}]};const answer=await cs(s);
   assert(answer.text.includes('после сжатия, замера ещё нет'));assert(!normalize(answer.text).includes('611263'));
  });
 }else{
 await test('Codex legacy adapter without spoolConversationFor preserves prior DSH estimate',async()=>{const send=adapter.spoolConversationFor;delete adapter.spoolConversationFor;try{const answer=await cs();assert(normalize(answer.text).includes('611263'),answer.text);assert(!answer.text.includes('замер беседы не установлен'));assert(!answer.text.includes('внутри хода'))}finally{adapter.spoolConversationFor=send}});
 await test('registered handler before first addressed request has no established measurement',async()=>{assert.equal((await cs()).kind,'success');assert((await cs()).text.includes('замер беседы не установлен'))});
 startRequest(session);await until(()=>threads().length===1);const thread=threads()[0];
 await test('first-ever app-server thread publishes while HTTP turn is held',async()=>{
  const time=token(thread,254099);await until(async()=> (await read()).inputTokens===254099);
  const answer=await cs();assert(normalize(answer.text).includes('254099'));assert(answer.text.includes('42.4%'));assert(answer.text.includes('снято '+new Date(Date.parse(time)+3*60*60*1000).toISOString().slice(11,19)+' МСК'));assert(answer.text.split('\n')[0].endsWith(' (снято внутри хода)'));
  assert(!normalize(answer.text.split('\n').find(line=>line.startsWith('модель '))).includes('611263'));assert(normalize(answer.text.split('\n').find(line=>line.startsWith('DSH'))).includes('611263'));assert.equal(requests.length,1);
 });
 await test('same agent second conversation cannot use first active count',async()=>{
  const s={...session,id:other,header:{...session.header,id:other}};const before=await cs(s);assert(!normalize(before.text).includes('254099'));
  startRequest(s);await until(()=>threads().length===2);token(threads()[1],123456);
  await until(async()=> (await read(s)).inputTokens===123456);
  const groupStatus=(await cs(s)).text,a2aStatus=(await cs()).text;
  console.log('STATUS synthetic group='+normalize(groupStatus)+'; a2a='+normalize(a2aStatus));
  assert(normalize(groupStatus).includes('123456'));assert(normalize(a2aStatus).includes('254099'));
  assert.equal((await read()).active,true);assert.equal((await read(s)).active,true);assert.equal(requests.length,2);
  assert.equal(JSON.parse(Buffer.from(getAddress(session),'base64url')).key,'a2a');
  assert.equal(JSON.parse(Buffer.from(getAddress(s),'base64url')).key,'telegram--1004442041878');
 });
 if(!process.env.STEND_BINDING_ONLY){
 await test('removing reader key refuses both conversation numbers and restoration recovers',async()=>{
  serviceEnabled=false;try{const answer=await cs();assert(answer.text.includes('замер беседы не установлен'));assert(!normalize(answer.text).includes('254099'));assert(!normalize(answer.text).includes('123456'));assert(!normalize(answer.text).includes('611263'))}
  finally{serviceEnabled=true}
  assert(normalize((await cs()).text).includes('254099'));
 });
 await test('native generation changed during IPC cannot borrow new conversation status',async()=>{
  rotateDuringRead=true;const answer=await cs();assert(answer.text.includes('замер беседы не установлен'));assert(!normalize(answer.text).includes('254099'));
  assert(normalize((await cs()).text).includes('254099'));
 });
 await test('post-IPC address database failure hides sampled number and recovery restores it',async()=>{
  afterReadFault='db';try{const answer=await cs();assert(answer.text.includes('замер беседы не установлен'));assert(!normalize(answer.text).includes('254099'))}
  finally{routeDb=new DatabaseSync(path.join(root,'channel.db'));addressScope.receipts.db=routeDb;insertRoute=routeDb.prepare('INSERT INTO channel_sessions VALUES(?,?,?)')}
  assert(normalize((await cs()).text).includes('254099'));
 });
 await test('removed live service after IPC hides sampled number and recovery restores it',async()=>{
  afterReadFault='service';try{const answer=await cs();assert(answer.text.includes('замер беседы не установлен'));assert(!normalize(answer.text).includes('254099'))}
  finally{serviceEnabled=true}
  assert(normalize((await cs()).text).includes('254099'));
 });
 await test('compact arriving during unavailable IPC never prints cached legacy pressure',async()=>{
  const fake=path.join(root,'hung.db'),connections=new Set();let queried=false;
  const server=net.createServer(c=>{connections.add(c);c.once('data',()=>queried=true);c.once('close',()=>connections.delete(c))});
  await new Promise(resolve=>server.listen(fake+'.context-status.sock',resolve));fs.chmodSync(fake+'.context-status.sock',0o600);
  const s={...session,events:[]},settingsFile=path.join(settingsRoot,'fixture.json'),saved=fs.readFileSync(settingsFile);
  fs.writeFileSync(settingsFile,JSON.stringify({domZhurnalaSessij:codeHome,bazaSessij:fake}));
  const timer=setTimeout(()=>{const t=Date.now();s.events.push({type:'compaction/start',seq:40,time:t,data:{compactionId:'latecompact'}},{type:'compaction/summary',seq:41,time:t,data:{}},{type:'compaction/end',seq:42,time:t+1,data:{compactionId:'latecompact'}})},25);
  try{const answer=await cs(s);assert(queried,'IPC timeout fault did not reach actual peer');assert(answer.text.includes('после сжатия, замера ещё нет'));assert(!normalize(answer.text).includes('611263'));assert(!normalize(answer.text).includes('611000'))}
  finally{clearTimeout(timer);fs.writeFileSync(settingsFile,saved);for(const c of connections)c.destroy();await new Promise(resolve=>server.close(resolve))}
 });
 for(const fault of ['service','session'])await test('late '+fault+' change after real legacy reader suppresses prior conversation numbers',async()=>{
  const legacyFile=path.join(root,'legacy-'+fault+'.db'),legacy=new DatabaseSync(legacyFile),sid=thread;
  legacy.exec('CREATE TABLE sessions(dshId TEXT,dshCreated INTEGER,dshCwd TEXT,provider TEXT,routingVersion INTEGER,sessionId TEXT)');
  legacy.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run(id,10,root,'openai',2,sid);legacy.close();
  const logDir=path.join(codeHome,'sessions');fs.mkdirSync(logDir,{recursive:true});
  fs.writeFileSync(path.join(logDir,'rollout-'+sid+'.jsonl'),JSON.stringify({type:'turn_context',payload:{model:'gpt-6-astra'}})+'\n'+JSON.stringify({type:'event_msg',timestamp:new Date().toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:254099,output_tokens:1,cached_input_tokens:0},model_context_window:921818}}})+'\n');
  const file=path.join(settingsRoot,'fixture.json'),saved=fs.readFileSync(file);fs.writeFileSync(file,JSON.stringify({domZhurnalaSessij:codeHome,bazaSessij:legacyFile}));afterLegacyFault=fault;
  try{const answer=await cs();assert.equal(afterLegacyFault,null,'fault did not reach actual legacy reader');assert(answer.text.includes('замер беседы не установлен'));assert(!normalize(answer.text).includes('611263'));assert(!normalize(answer.text).includes('254100'))}
  finally{serviceEnabled=true;afterLegacyFault=null;fs.writeFileSync(file,saved)}
  assert(normalize((await cs()).text).includes('254099'));
 });
 await test('real watcher compacted resets current handler until next count',async()=>{
  fs.appendFileSync(path.join(root,thread+'.jsonl'),JSON.stringify({type:'compacted',timestamp:new Date().toISOString(),payload:{}})+'\n');
  await until(async()=> (await read()).state==='waiting');
  const answer=await cs();assert(answer.text.includes('после сжатия, замера ещё нет'));assert(!normalize(answer.text).includes('254099'));
  token(thread,10000);await until(async()=> (await read()).inputTokens===10000);assert(normalize((await cs()).text).includes('10000'));
 });
 await test('platform /ccc end hides old request number before next request',async()=>{
  const t=Date.now()+1;const s={...session,events:[{type:'compaction/start',seq:30,time:t,data:{compactionId:'fixture'}},
    {type:'compaction/summary',seq:31,time:t,data:{}},{type:'compaction/end',seq:32,time:t+1,data:{compactionId:'fixture'}}]};
  const answer=await cs(s);assert(answer.text.includes('после сжатия, замера ещё нет'));assert(!normalize(answer.text).includes('10000'));assert(!normalize(answer.text).includes('611263'));
 });
 await test('closed or missing rollout invalidates measurement visibly',async()=>{
  fs.renameSync(path.join(root,thread+'.jsonl'),path.join(root,thread+'.away'));
  await until(async()=> (await read()).state==='blind');assert(!normalize((await cs()).text).includes('10000'));
  fs.renameSync(path.join(root,thread+'.away'),path.join(root,thread+'.jsonl'));
 });
 await test('observer recovers and a second fault is still visible',async()=>{
  token(thread,222222);await until(async()=> (await read()).inputTokens===222222);
  fs.renameSync(path.join(root,thread+'.jsonl'),path.join(root,thread+'.away'));
  await until(async()=> (await read()).state==='blind');
  fs.renameSync(path.join(root,thread+'.away'),path.join(root,thread+'.jsonl'));
  token(thread,333333);await until(async()=> (await read()).inputTokens===333333);
 });
 await test('address-capable Codex request missing its header cannot infer another conversation',async()=>{
  const thirdId='telegram-v2-33333333-3333-4333-8333-333333333333',s={...session,id:thirdId,header:{...session.header,id:thirdId}};
  insertRoute.run('telegram-old-adapter',thirdId,10);startRequest(s,{omitAddress:true});await until(()=>threads().length===3);token(threads()[2],555555);await sleep(1200);
  for(const native of [s,session]){const answer=await cs(native);assert(answer.text.includes('замер беседы не установлен'));assert(!normalize(answer.text).includes('555555'));assert(!normalize(answer.text).includes('333333'));assert(!normalize(answer.text).includes('611263'))}
 });
 await test('Codex old adapter after a headerless request preserves DSH instead of borrowing a snapshot',async()=>{const send=adapter.spoolConversationFor;delete adapter.spoolConversationFor;try{const answer=await cs();assert(normalize(answer.text).includes('611263'),answer.text);assert(!answer.text.includes('замер беседы не установлен'));assert(!answer.text.includes('внутри хода'))}finally{adapter.spoolConversationFor=send}});
 await test('foreign header cannot publish another native request under an existing conversation address',async()=>{
  const badId='telegram-v2-44444444-4444-4444-8444-444444444444',s={...session,id:badId,header:{...session.header,id:badId}};
  insertRoute.run('telegram-foreign-envelope',badId,10);startRequest(s,{addressOverride:getAddress(session)});await until(()=>threads().length===4);token(threads()[3],777777);await sleep(1200);
  const answer=await cs();assert(answer.text.includes('замер беседы не установлен'));assert(!normalize(answer.text).includes('777777'));
 });
 await test('unresolved Claude adapter route preserves legacy DSH without a diagnostic claim',async()=>{
  fs.writeFileSync(path.join(settingsRoot,'fixture.json'),JSON.stringify({domZhurnalaSessij:null,bazaSessij:null}));
  const previous=adapters.get('claude-oauth');adapters.delete('claude-oauth');
  try{const s={...session,requestHeader:()=>({config:{provider:'claude-oauth',model:'claude-opus-5-5'}})};
   const answer=await cs(s);assert(normalize(answer.text).includes('611263'));assert(!answer.text.includes('внутри хода'));assert(!answer.text.includes('замер беседы не установлен'));
  }finally{adapters.set('claude-oauth',previous)}
 });
 }
 }
}finally{
 const f=path.join(root,'threads');if(fs.existsSync(f))for(const t of fs.readFileSync(f,'utf8').trim().split('\n'))fs.writeFileSync(path.join(root,t+'.finish'),'done');
 if(child){await Promise.race([Promise.allSettled(requests),sleep(4000)]);child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(()=>child.kill('SIGKILL'),2000).unref()})}
 if(process.env.STEND_EVIDENCE_FILE)fs.writeFileSync(process.env.STEND_EVIDENCE_FILE,output);
 routeDb?.close();fs.rmSync(root,{recursive:true,force:true});
}
console.log(`RESULT green=${passed} red=${failed} total=${passed+failed}`);process.exitCode=failed?1:0;
