// B-N-2010: actual numeric producer/reader/formatter; temporary SQLite, no live keys or services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {copyGatewayFixture} from './cs-gateway-fixture.mjs';
import * as channel from '../src/compact-status.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-live-turn-'));
const header={id:'telegram-v2-11111111-1111-4111-8111-111111111111',createdAt:10,cwd:'/fixture'};
const session={id:header.id,header,snapshotEvents:()=>[]};
// Fixture protocol bytes; integration uses Alpha's actual forAgent service.
const address=(s=session)=>Buffer.from(JSON.stringify({key:s.routeKey??'a2a',session_id:s.header.id,session_created:s.header.createdAt})).toString('base64url');
const at=Date.parse('2026-10-11T23:32:56Z');
const measurement={totalTokens:611263,baseline:{kind:'usage',tokens:611000}};
const args={now:at,sessionId:header.id,model:{provider:'claude-oauth',model:'gpt-6-astra'},
  window:921818,measurement,freshness:{kind:'ustarela',kompakt:20},configs:[{auto:true,thresholdRatio:.65}]};
const numeric={supported:true,state:'measured',inputTokens:254099,window:921818,threshold:599181,
  timestamp:'2026-10-11T23:32:56.000Z',active:true,model:'gpt-6-astra'};
const compact=text=>text.replace(/[\s\u00a0\u202f]/g,'');
let passed=0,failed=0;
async function proba(name,body){try{await body();passed++;console.log('PASS '+name)}catch(e){failed++;console.log('FAIL '+name+': '+e.message)}}
let db,store,publisher,read;
try {
 const pkg=path.join(root,'gateway'),producerFile=path.join(pkg,'context-status.mjs');
 try{
  copyGatewayFixture(pkg);fs.accessSync(producerFile,fs.constants.R_OK);
 }catch(e){
  if(e.code!=='STEND_BLIND'&&!['ENOENT','EACCES','EPERM','ENOTDIR'].includes(e.code))throw e;
  console.error(e.code==='STEND_BLIND'?e.message:'СЛЕПОТА: STEND_GATEWAY_SOURCE не содержит читаемый context-status.mjs');
  fs.rmSync(root,{recursive:true,force:true});process.exit(2);
 }
 const producer=await import(pathToFileURL(producerFile).href);
 await proba('fresh in-turn input replaces stale DSH pressure',()=>{
  const text=channel.formatStatus({...args,contextStatus:numeric});
  assert(compact(text).includes('254099'));assert(text.includes('42.4%'));
  assert(text.includes('снято 02:32:56 МСК'));assert(text.split(' (снято внутри хода)').length===2);assert(text.split('\n')[0].endsWith(' (снято внутри хода)'));assert(!compact(text).includes('611263'));
 });
 await proba('legacy mapping failure is visible even when DSH estimate remains',()=>{const text=channel.formatStatus({...args,codexError:'однозначное соответствие сессий не найдено'});assert(text.includes('однозначное соответствие сессий не найдено'),text)});
 await proba('IPC unavailability after compaction explains the unknown measurement',()=>{const text=channel.formatStatus({...args,freshness:{kind:'ustarela',kompakt:1},contextStatus:{supported:false,reason:'gateway-status-unavailable'}});assert(text.includes('gateway-status-unavailable'),text);assert(!compact(text).includes('611263'))});
 await proba('measurement clock uses explicit Moscow time across midnight',()=>{for(const [timestamp,time] of [['2026-10-11T20:59:59.000Z','23:59:59'],['2026-10-11T21:00:00.000Z','00:00:00']]){const text=channel.formatStatus({...args,contextStatus:{...numeric,timestamp}});assert(text.includes('снято '+time+' МСК'),text);assert(text.split('\n')[0].endsWith(' (снято внутри хода)'))}});
 await proba('after compact no old estimate or percent is displayed',()=>{
  const text=channel.formatStatus({...args,contextStatus:{supported:true,state:'waiting',afterCompact:true}});
  assert(text.includes('после сжатия, замера ещё нет'));assert(!compact(text).includes('611263'));assert(!text.includes('102.0%'));
 });
 await proba('unsupported gateway preserves legacy estimate with stale label',()=>{
  const text=channel.formatStatus({...args,freshness:{kind:'svezhaya'},contextStatus:{supported:false,reason:'gateway-unsupported'}});
  assert(compact(text).includes('611263'));assert(text.includes('устарело'));assert(text.includes('шлюз без поддержки'));
 });
 await proba('Claude status retains existing behavior without Codex status argument',()=>{
  const text=channel.formatStatus({...args,model:{provider:'claude-oauth',model:'claude-opus-5'},freshness:{kind:'svezhaya'}});
  assert(compact(text).includes('611263'));assert(!text.includes('внутри хода'));
 });
 const reader=await import('../src/context-status.js');
 await proba('positive support producer and reader exist',()=>{
  assert.equal(typeof producer.createContextStatus,'function');assert.equal(typeof reader.readContextStatus,'function');
 });
 if(producer.createContextStatus&&reader.readContextStatus){
  const file=path.join(root,'sessions.db');db=new DatabaseSync(file);
  let clock=at-1000;store=await producer.createContextStatus(file,{now:()=>clock});
  const identity=address();
  publisher=store.begin(identity,{model:'gpt-6-astra',threshold:599181,compact:null});
  await proba('B-N-2009 opaque string is the only snapshot address',()=>assert(publisher,'producer rejects spoolConversation.forAgent address'));
  read=async(s=session)=>reader.readContextStatus(s,{dbPath:file,now:()=>clock,address:address(s)});
  await proba('current request without token_count is unknown, not zero',async()=>{
   const got=await read();assert.equal(got.supported,true);assert.equal(got.state,'waiting');assert.equal(got.inputTokens,undefined);
  });
  await proba('numeric observation is visible before request end',async()=>{
   publisher.token({time:'2026-10-11T23:32:56.000Z',last:{input_tokens:254099},window:921818});clock=at;
   const got=await read();assert.equal(got.inputTokens,254099);assert.equal(got.active,true);
   assert.equal(got.timestamp,'2026-10-11T23:32:56.000Z');
  });
  await proba('JSON field order and whitespace preserve the same public conversation measurement',async()=>{
   for(const json of [
    `{"session_created":10,"key":"a2a","session_id":"${header.id}"}`,
    `{"session_id":"${header.id}","session_created":10,"key":"a2a"}`,
    ` { "key": "a2a", "session_id": "${header.id}", "session_created": 10 } `]){
    const got=await reader.readContextStatus(session,{dbPath:file,now:()=>clock,address:Buffer.from(json).toString('base64url')});
    assert.equal(got.inputTokens,254099,'equivalent B-N-2009 tuple lost its measurement');
   }
  });
  await proba('reordered public address supersedes the old writer for that same generation',async()=>{
   const f=path.join(root,'order.db'),same=await producer.createContextStatus(f,{now:()=>clock});
   const reordered=Buffer.from(`{"session_created":10,"session_id":"${header.id}","key":"a2a"}`).toString('base64url');
   const readSame=addr=>reader.readContextStatus(session,{dbPath:f,now:()=>clock,address:addr});
   try{
    const old=same.begin(identity,{model:'gpt-6-astra'});old.token({time:new Date(clock).toISOString(),last:{input_tokens:100},window:921818});
    const next=same.begin(reordered,{model:'gpt-6-astra'});assert(next);
    assert.equal((await readSame(identity)).state,'waiting','old equivalent-address snapshot survived a new request');
    next.token({time:new Date(clock).toISOString(),last:{input_tokens:200},window:921818});
    old.token({time:new Date(clock).toISOString(),last:{input_tokens:900000},window:921818});old.end();
    for(const addr of [identity,reordered]){const got=await readSame(addr);assert.equal(got.inputTokens,200);assert.equal(got.active,true)}
   }finally{await same.close()}
  });
  await proba('another conversation with same first message cannot borrow count',async()=>{
   const other={...session,id:'telegram-v2-22222222-2222-4222-8222-222222222222',header:{...header,id:'telegram-v2-22222222-2222-4222-8222-222222222222'}};
   const got=await read(other);assert.notEqual(got.state,'measured');assert.equal(got.inputTokens,undefined);
  });
  await proba('another generation and route key cannot borrow count',async()=>{
   for(const s of [{...session,header:{...header,createdAt:11}},{...session,routeKey:'telegram--1004442041878'}]){
    const got=await read(s);assert.notEqual(got.state,'measured');assert.equal(got.inputTokens,undefined);
   }
  });
  await proba('two named conversations retain different simultaneous pressure',async()=>{
   const h={...header,id:'telegram-v2-22222222-2222-4222-8222-222222222222'};
   const s={...session,id:h.id,header:h,routeKey:'telegram--1004442041878'};
   const other=store.begin(address(s),{model:'gpt-6-astra',threshold:599181});assert(other,'B-N-2009 string address not supported');
   other.token({time:'2026-10-11T23:32:56Z',last:{input_tokens:123456},window:921818});
   assert.equal((await read()).inputTokens,254099);assert.equal((await read(s)).inputTokens,123456);other.end();
  });
  await proba('no spool address never infers a binding from native SDK identity',async()=>{
   const got=await reader.readContextStatus(session,{dbPath:file,now:()=>clock});assert.equal(got.state,'unbound');assert.equal(got.inputTokens,undefined);
   const text=channel.formatStatus({...args,contextStatus:got});assert(text.includes('замер беседы не установлен'));assert(!compact(text).includes('611263'));
  });
  await proba('addressless request invalidates prior snapshots and addressed request recovers',async()=>{
   assert.equal(store.begin(undefined,{model:'gpt-6-astra'}),null);assert.equal((await read()).state,'unbound');
   publisher=store.begin(identity,{model:'gpt-6-astra',threshold:599181});assert(publisher,'B-N-2009 address unavailable');
   publisher.token({time:'2026-10-11T23:32:56Z',last:{input_tokens:254099},window:921818});assert.equal((await read()).inputTokens,254099);
  });
  await proba('spool address mismatching existing native request cannot publish under a foreign key',async()=>{
   const foreignNative={dshId:'telegram-v2-33333333-3333-4333-8333-333333333333',dshCreated:10};
   const bad=store.begin(identity,{model:'gpt-6-astra',native:foreignNative});assert.equal(bad,null,'foreign native request can publish under this address');
   assert.equal((await read()).state,'unbound');publisher=store.begin(identity,{model:'gpt-6-astra',threshold:599181});
   publisher.token({time:'2026-10-11T23:32:56Z',last:{input_tokens:254099},window:921818});assert.equal((await read()).inputTokens,254099);
  });
  await proba('platform compact invalidates previous request before new token_count',async()=>{
   const events=[{type:'compaction/start',seq:30,time:at+1,data:{compactionId:'compact-fixture'}},
    {type:'compaction/end',seq:31,time:at+2,data:{compactionId:'compact-fixture'}}];
   const got=await read({...session,snapshotEvents:()=>events});assert.equal(got.state,'waiting');assert.equal(got.afterCompact,true);assert.equal(got.inputTokens,undefined);assert.equal(got.active,true,'compact invalidation must retain validated activity');const current=reader.currentContextStatus({...session,snapshotEvents:()=>events},{supported:true,state:'measured',active:true,startedAt:at});assert.equal(current.active,true,'post-await compaction recheck must retain validated activity');
  });
  await proba('failed platform compact does not invalidate numeric observation',async()=>{
   const events=[{type:'compaction/start',seq:30,time:at+1,data:{compactionId:'compact-fixture'}},
    {type:'compaction/end',seq:31,time:at+2,data:{compactionId:'compact-fixture',error:'fixture'}}];
   assert.equal((await read({...session,snapshotEvents:()=>events})).inputTokens,254099);
  });
  await proba('Codex compacted invalidates snapshot until fresh token_count',async()=>{
   publisher.compacted();const waiting=await read();assert.equal(waiting.state,'waiting');assert.equal(waiting.active,true,'IPC waiting must retain validated active flag');assert(channel.formatStatus({...args,contextStatus:waiting}).includes(' (снято внутри хода)'));
   publisher.token({time:'2026-10-11T23:32:57.000Z',last:{input_tokens:10000},window:921818});clock=at+1000;
   assert.equal((await read()).inputTokens,10000);
  });
  await proba('new request supersedes old writer and clears old number',async()=>{
   const previous=publisher;clock=at+2000;publisher=store.begin(identity,{model:'gpt-6-astra',threshold:599181,compact:null});
   previous.token({time:'2026-10-11T23:32:59.000Z',last:{input_tokens:900000},window:921818});
   assert.equal((await read()).state,'waiting');
   publisher.token({time:'2026-10-11T23:32:59.000Z',last:{input_tokens:200000},window:921818});clock=at+3000;
   assert.equal((await read()).inputTokens,200000);
  });
  await proba('old, malformed and impossible timestamp observations do not become fresh',async()=>{
   for(const event of [{time:'2026-10-11T22:00:00Z',last:{input_tokens:900000},window:921818},
    {time:'invalid',last:{input_tokens:900000},window:921818},
    {time:'2026-10-12T00:32:59Z',last:{input_tokens:900000},window:921818},
    {time:'2026-10-11T23:32:59Z',last:{input_tokens:-1},window:921818}]){
    publisher.token(event);assert.notEqual((await read()).state,'measured');
   }
   publisher.token({time:'2026-10-11T23:32:59.000Z',last:{input_tokens:200000},window:921818});
   assert.equal((await read()).inputTokens,200000);
  });
  await proba('end stops old callback writes but preserves latest measured timestamp',async()=>{
   const active=await read();assert.equal(active.active,true);
   publisher.end();publisher.token({time:'2026-10-11T23:33:00Z',last:{input_tokens:900000},window:921818});
   const got=await read();assert.equal(got.inputTokens,200000);assert.equal(got.active,false);
   const before=channel.formatStatus({...args,contextStatus:active}),after=channel.formatStatus({...args,contextStatus:got});
   assert(before.split('\n')[0].endsWith(' (снято внутри хода)'));
   assert.equal(before.replace(' (снято внутри хода)',''),after,'real IPC active/end snapshots must use one status template');
  });
  await proba('diagnostic SQLite write failure cannot preserve a pre-compact fresh number',async()=>{
   publisher=store.begin(identity,{model:'gpt-6-astra',threshold:599181,compact:{endSeq:10}});
   publisher.token({time:'2026-10-11T23:32:59.000Z',last:{input_tokens:200000},window:921818});
   db.exec('PRAGMA query_only=ON');
   try{publisher.compacted();assert.notEqual((await read()).state,'measured')}
   finally{db.exec('PRAGMA query_only=OFF')}
  });
  await proba('incomplete successful compact boundary and journal holes fail closed',async()=>{
   publisher=store.begin(identity,{model:'gpt-6-astra',threshold:599181,compact:{endSeq:10}});
   publisher.token({time:'2026-10-11T23:32:59.000Z',last:{input_tokens:200000},window:921818});
   for(const events of [[{type:'compaction/start',seq:30,time:at+3001,data:{compactionId:'fixture'}},
    {type:'compaction/end',time:at+3002,data:{compactionId:'fixture'}}],[undefined]])
    assert.notEqual((await read({...session,snapshotEvents:()=>events})).state,'measured');
  });
  await proba('orphan successful compact end fails closed and full journal restores known waiting',async()=>{
   publisher=store.begin(identity,{model:'gpt-6-astra'});publisher.token({time:new Date(clock).toISOString(),last:{input_tokens:200000},window:921818});
   const end={type:'compaction/end',seq:35,time:clock+1000,data:{compactionId:'orphan'}};
   assert.notEqual((await read({...session,snapshotEvents:()=>[end]})).state,'measured');
   const events=[{type:'compaction/start',seq:34,time:clock+500,data:{compactionId:'orphan'}},end];
   assert.equal((await read({...session,snapshotEvents:()=>events})).state,'waiting');
  });
  await proba('pre-compact timestamp cannot restore numeric status, new event recovers',async()=>{
   const previousTime=clock;clock+=1000;publisher.compacted({time:new Date(clock).toISOString()});
   publisher.token({time:new Date(previousTime).toISOString(),last:{input_tokens:900000},window:921818});assert.notEqual((await read()).state,'measured');
   publisher.token({time:new Date(clock).toISOString(),last:{input_tokens:10000},window:921818});assert.equal((await read()).inputTokens,10000);
  });
  await proba('impossible future compact timestamp allows normal recovery within same request',async()=>{
   publisher.compacted({time:'2099-01-01T00:00:00Z'});assert.notEqual((await read()).state,'measured');clock+=1000;
   publisher.token({time:new Date(clock).toISOString(),last:{input_tokens:3000},window:921818});assert.equal((await read()).inputTokens,3000);
  });
  await proba('backward compact boundary sequence cannot preserve old measured status',async()=>{
   publisher=store.begin(identity,{model:'gpt-6-astra',compact:{endSeq:10}});publisher.token({time:new Date(clock).toISOString(),last:{input_tokens:254099},window:921818});
   const start={type:'compaction/start',seq:30,time:clock+1000,data:{compactionId:'backward'}},end={type:'compaction/end',seq:5,time:clock+2000,data:{compactionId:'backward'}};
   assert.notEqual((await read({...session,snapshotEvents:()=>[start,end]})).state,'measured');
   assert.equal((await read({...session,snapshotEvents:()=>[start,{...end,seq:31}]})).state,'waiting');
  });
  await proba('backward appended pair cannot mask a preceding completed compact',async()=>{
   const events=[{type:'compaction/start',seq:30,time:clock+1000,data:{compactionId:'good'}},{type:'compaction/end',seq:31,time:clock+2000,data:{compactionId:'good'}},
    {type:'compaction/start',seq:4,time:clock+3000,data:{compactionId:'mask'}},{type:'compaction/end',seq:5,time:clock+4000,data:{compactionId:'mask'}}];
   assert.notEqual((await read({...session,snapshotEvents:()=>events})).state,'measured');
  });
  await proba('old gateway without IPC is positively unsupported',async()=>{
   const f=path.join(root,'old.db'),old=new DatabaseSync(f);old.exec('CREATE TABLE sessions(kluch TEXT,sessionId TEXT)');old.close();
   const got=await reader.readContextStatus(session,{dbPath:f,address:address()});assert.equal(got.supported,false);
  });
  await proba('closed gateway endpoint is not fresh',async()=>{
   await store.close();const got=await read();assert.equal(got.supported,false);assert.equal(got.inputTokens,undefined);
  });
  await proba('active private endpoint cannot be replaced by a second publisher',async()=>{
   const live=await producer.createContextStatus(path.join(root,'double.db'),{now:()=>clock});
   try{await assert.rejects(producer.createContextStatus(path.join(root,'double.db')),/already active/)}finally{await live.close()}
  });
  await proba('unknown regular and symlink endpoints are preserved and refused',async()=>{
   const f=path.join(root,'unknown.db'),socket=f+'.context-status.sock';fs.writeFileSync(socket,'preserve');
   await assert.rejects(producer.createContextStatus(f),/not our socket/);assert.equal(fs.readFileSync(socket,'utf8'),'preserve');
   assert.equal((await reader.readContextStatus(session,{dbPath:f,address:address()})).supported,false);fs.unlinkSync(socket);
   fs.symlinkSync(path.join(root,'old.db'),socket);assert.equal((await reader.readContextStatus(session,{dbPath:f,address:address()})).supported,false);fs.unlinkSync(socket);
  });
  await proba('long Unix socket path fails explicitly',async()=>{
   await assert.rejects(producer.createContextStatus(path.join(root,'x'.repeat(120))),/107bytes/);
  });
  await proba('128 active snapshots refuse a new diagnostic, closed slot can be reused',async()=>{
   const f=path.join(root,'capacity.db'),cap=await producer.createContextStatus(f,{now:()=>clock}),all=[];
   const make=i=>address({...session,routeKey:'route-'+i});
   try{
    for(let i=0;i<128;i++){const p=cap.begin(make(i),{model:'gpt-6-astra'});assert(p);all.push(p)}
    assert.equal(cap.begin(make(129),{model:'gpt-6-astra'}),null);all[0].end();
    const p=cap.begin(make(129),{model:'gpt-6-astra'});assert(p);
    p.token({time:new Date(clock).toISOString(),last:{input_tokens:1234},window:921818});
    const s={...session,routeKey:'route-129'};
    assert.equal((await reader.readContextStatus(s,{dbPath:f,now:()=>clock,address:address(s)})).inputTokens,1234);
   }finally{await cap.close()}
  });
  await proba('equivalent public address reuses its slot when all 128 conversations are active',async()=>{
   const f=path.join(root,'order-capacity.db'),cap=await producer.createContextStatus(f,{now:()=>clock});
   try{
    for(let i=0;i<128;i++)assert(cap.begin(address({...session,routeKey:'route-'+i}),{model:'gpt-6-astra'}));
    const reordered=Buffer.from(`{"session_created":10,"session_id":"${header.id}","key":"route-0"}`).toString('base64url');
    const p=cap.begin(reordered,{model:'gpt-6-astra'});assert(p,'same tuple consumed a second diagnostic slot');
    p.token({time:new Date(clock).toISOString(),last:{input_tokens:1234},window:921818});
    assert.equal((await reader.readContextStatus(session,{dbPath:f,now:()=>clock,address:address({...session,routeKey:'route-0'})})).inputTokens,1234);
    assert.equal(cap.begin(address({...session,routeKey:'route-128'}),{model:'gpt-6-astra'}),null);
   }finally{await cap.close()}
  });
  await proba('unresponsive private IPC read stops with unknown within bounded interval',async()=>{
   const f=path.join(root,'hung.db'),conns=new Set(),srv=net.createServer(c=>{conns.add(c);c.once('close',()=>conns.delete(c))});
   await new Promise(r=>srv.listen(f+'.context-status.sock',r));fs.chmodSync(f+'.context-status.sock',0o600);
   try{const started=Date.now();const got=await reader.readContextStatus(session,{dbPath:f,address:address()});assert.equal(got.supported,false);assert(Date.now()-started<2500)}
   finally{for(const c of conns)c.destroy();await new Promise(r=>srv.close(r))}
  });
  await proba('private peer with wrong process birth proof cannot provide a count',async()=>{
   const f=path.join(root,'bad-peer.db'),srv=net.createServer(c=>c.once('data',bytes=>{
    const q=JSON.parse(bytes);c.end(JSON.stringify({schema:1,provider:'openai',pid:process.pid,startTicks:'0',generation:'11111111-1111-4111-8111-111111111111',
     spoolConversation:1,address:q.address,snapshot:numeric})+'\n');
   }));await new Promise(r=>srv.listen(f+'.context-status.sock',r));fs.chmodSync(f+'.context-status.sock',0o600);
   try{const got=await reader.readContextStatus(session,{dbPath:f,address:address()});assert.equal(got.supported,false);assert.equal(got.inputTokens,undefined)}finally{await new Promise(r=>srv.close(r))}
  });
 }
} finally {await store?.close();db?.close();fs.rmSync(root,{recursive:true,force:true});}
console.log(`RESULT green=${passed} red=${failed} total=${passed+failed}`);process.exitCode=failed?1:0;
