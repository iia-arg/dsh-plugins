// Breaks caught: missing Meta admission, volatile budget, skipped nested pages,
// one bad object blocking others, and edit-card suppression dropping model input.
import './approval-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Store} from '../src/store.mjs';import {loadConfig} from '../src/config.mjs';
const optional=async p=>import(p).catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e});
const receiver=await optional('../src/meta-receiver.mjs'),apiModule=await optional('../src/meta-api.mjs');
const targets={vk:'127999849',instagram:'17841453053403067',threads:'26794519373575025',telegram:'-1001925584120'};
const cfg={enabled:true,armed:true,apiVersion:'v22.0',token:{file:'/tmp/test-only-meta-token'},startAt:'2026-10-14T00:00:00Z'};
const tick=Date.parse('2026-10-14T02:00:00Z');
function setup(t,options={}){assert.equal(typeof receiver.MetaReader,'function','MetaReader admission is missing');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socseti-meta-'));let now=tick;const store=new Store(dir,targets,{profile:'anna',now:()=>now});t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true})});const reader=new receiver.MetaReader(store,'instagram',{...cfg,...options},{now:()=>now});return {store,reader,setNow:v=>{now=v},dir}}
const item=(id,text='one',extra={})=>({id,kind:'comment',conversation_id:'media:55',subject_id:'visitor:66',text,occurred_at:tick,...extra});
test('Anna Meta config is opt-in, bounded and cannot add writer',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-config-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'config.json');
 const config={profile:'anna',port:8899,stateDir:dir,keyFiles:{anna:'/tmp/a',monitor:'/tmp/m',channel:'/tmp/c'},targets,meta:{instagram:cfg}};
 const write=x=>fs.writeFileSync(file,JSON.stringify(x),{mode:0o600});write(config);const got=loadConfig(file);assert.equal(got.meta.instagram.dailyCallLimit,2000);
 for(const bad of [{dailyCallLimit:0},{maxRoots:100001},{editCards:'no'},{writer:{enabled:true}},{token:{passRef:'../bad'}}]){write({...config,meta:{instagram:{...cfg,...bad}}});assert.throws(()=>loadConfig(file))}
});
test('durable daily budget includes denied calls, restart, UTC rollover and clock regression',t=>{
 const {reader,store,setNow}=setup(t,{dailyCallLimit:2});reader.state.reserve();reader.state.reserve();assert.throws(()=>reader.state.reserve(),e=>e.reason==='daily_budget');
 const again=new receiver.MetaReader(store,'instagram',{...cfg,dailyCallLimit:2});assert.equal(again.status().calls_today,2);assert.throws(()=>again.state.reserve());
 setNow(tick+86400000);again.state.reserve();assert.equal(again.status().calls_today,1);setNow(tick);assert.throws(()=>again.state.reserve(),e=>e.reason==='clock_regression');
});
test('same object identity conflict quarantines only that object; restoration resumes without duplicate',t=>{
 const {reader,store}=setup(t);reader.accept([item('x')],'page1');reader.accept([item('x','one',{conversation_id:'media:999'}),item('y')],'page2');
 assert.equal(store.db.prepare('SELECT count(*) n FROM events').get().n,2);assert.equal(reader.status().held_objects[0].object_id,'x');assert.equal(reader.status().held_objects[0].reason,'identity_conflict:conversation_id');
 reader.accept([item('x'),item('y')],'page3');assert.equal(reader.status().held_objects.length,0);assert.equal(store.db.prepare('SELECT count(*) n FROM events').get().n,2);
});
test('Store event conflict is contained by savepoint and remaining page continues',t=>{
 const {reader,store}=setup(t);reader.accept([item('x')],'p1');store.db.prepare("UPDATE events SET kind='dm' WHERE platform='instagram'").run();reader.accept([item('x'),item('y')],'p2');
 assert.equal(store.db.prepare('SELECT count(*) n FROM events').get().n,2);assert.equal(reader.status().held_objects[0].reason,'event_conflict:kind');
 store.db.prepare("UPDATE events SET kind='comment' WHERE platform='instagram' AND conversation_id='media:55' AND kind='dm'").run();reader.accept([item('x'),item('y')],'p3');assert.equal(reader.status().held_objects.length,0);assert.equal(store.db.prepare('SELECT count(*) n FROM events').get().n,2);
});
test('A to B to A yields three versions; editCards false suppresses only edit notices',t=>{
 const {reader,store}=setup(t,{editCards:false});for(const [i,text] of ['A','B','A'].entries())reader.accept([item('x',text)],'p'+i);
 assert.equal(store.db.prepare('SELECT count(*) n FROM events').get().n,3);assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE kind='anna_event'").get().n,3);assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE kind='event_card_request' AND state!='tg_sent'").get().n,1);
});
test('default creates notice for each observed revision and replay creates none',t=>{
 const {reader,store}=setup(t);for(const [i,text] of ['A','B','A'].entries())reader.accept([item('x',text)],'p'+i);reader.accept([item('x','A')],'last');assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE kind='event_card_request'").get().n,3);
});
test('page storage error rolls back objects, both outboxes and checkpoint',t=>{
 const {reader,store}=setup(t);store.db.exec("CREATE TRIGGER fail_meta BEFORE INSERT ON outbox WHEN NEW.kind='anna_event' BEGIN SELECT RAISE(ABORT,'fault'); END");assert.throws(()=>reader.accept([item('x')],'p1'));
 assert.equal(store.db.prepare('SELECT count(*) n FROM events').get().n,0);assert.equal(store.cursor('instagram:'+targets.instagram),null);store.db.exec('DROP TRIGGER fail_meta');reader.accept([item('x')],'p1');assert.equal(store.pendingAnna().length,1);
});
test('Meta API rate limit is partial, permission denied is held, raw error never escapes',async t=>{
 const {reader,setNow}=setup(t);assert.equal(typeof apiModule.MetaApi,'function');let next=new Response(JSON.stringify({error:{code:4,message:'PRIVATE_TOKEN'}}),{status:400});
 const api=new apiModule.MetaApi({provider:'instagram',account:targets.instagram,version:'v22.0',token:'fixture-token',budget:reader.state,fetchImpl:async()=>next});
 await assert.rejects(api.call('roots'),e=>e.reason==='rate_limit'&&e.retryAt>tick&&!String(e).includes('PRIVATE_TOKEN'));
 setNow(tick+3600001);next=new Response(JSON.stringify({error:{code:200,message:'PRIVATE_TOKEN'}}),{status:403});await assert.rejects(api.call('roots'),e=>e.reason==='permissions'&&e.code===200);
});
test('usage header pauses next call after accepting current page; foreign next host never requested',async t=>{
 const {reader}=setup(t);assert.equal(typeof apiModule.MetaApi,'function');let count=0;
 const api=new apiModule.MetaApi({provider:'instagram',account:targets.instagram,version:'v22.0',token:'fixture-token',budget:reader.state,fetchImpl:async()=>{count++;return new Response('{"data":[]}',{headers:{'x-app-usage':'{"call_count":95,"total_time":1,"total_cputime":2}'}})}});
 await api.call('roots');await assert.rejects(api.call('roots'),e=>e.reason==='usage_limit');assert.equal(count,1);assert.throws(()=>api.nextCursor({next:'https://evil.invalid/?access_token=stolen'}),e=>e.reason==='page_origin');assert.equal(count,1);
});
const profile={user_id:targets.instagram,username:'ostrov_center'};
function scripted(reader,handler){
 const api=new apiModule.MetaApi({provider:reader.provider,account:reader.account,version:reader.config.apiVersion,token:'fixture-token',budget:reader.state,fetchImpl:async(url,options)=>new Response(JSON.stringify(await handler(new URL(url),options)),{headers:{'content-type':'application/json'}})});reader.api=api;return api;
}
test('Instagram old roots and separately paginated nested replies reach both outboxes',async t=>{
 const {reader,store}=setup(t,{messagesEnabled:false});assert.equal(typeof reader.tick,'function','poll caller is missing');
 scripted(reader,url=>{const p=url.pathname;if(p.endsWith('/me'))return profile;if(p.endsWith('/media'))return {data:[{id:'55',timestamp:'2025-01-01T00:00:00Z'}]};
 if(p.endsWith('/55/comments'))return {data:[{id:'77',text:'top',timestamp:'2026-10-14T01:00:00Z',from:{id:'66'}}]};
 if(p.endsWith('/77/replies'))return url.searchParams.has('after')?{data:[{id:'79',text:'nested2',timestamp:'2026-10-14T01:02:00Z',from:{id:'68'}}]}:{data:[{id:'78',text:'nested1',timestamp:'2026-10-14T01:01:00Z',from:{id:'67'}}],paging:{next:'https://graph.instagram.com/v22.0/77/replies?after=next',cursors:{after:'next'}}};
 if(p.endsWith('/78/replies')||p.endsWith('/79/replies'))return {data:[]};throw Error('unexpected route '+p)});
 await reader.tick();assert.equal(store.pendingAnna().length,3);assert.equal(reader.status().roots.posts,1);assert.equal(reader.status().pending_jobs,0);
 await reader.tick();assert.equal(store.pendingAnna().length,3);
});
test('series page cap keeps durable continuation across new reader',async t=>{
 const {reader,store}=setup(t,{messagesEnabled:false});assert.equal(typeof reader.tick,'function');const handler=url=>url.pathname.endsWith('/me')?profile:url.pathname.endsWith('/media')?{data:[{id:'55',timestamp:'2025-01-01T00:00:00Z'}]}:url.pathname.endsWith('/comments')?{data:[{id:'77',text:'top',timestamp:'2026-10-14T01:00:00Z',from:{id:'66'}}]}:{data:[]};
 scripted(reader,handler);await reader.tick({maxPages:1});assert.ok(reader.status().pending_jobs>0);const next=new receiver.MetaReader(store,'instagram',{...cfg,messagesEnabled:false});scripted(next,handler);await next.tick();assert.equal(store.pendingAnna().length,1);assert.equal(next.status().pending_jobs,0);
});
test('root cap holds the root page visibly and raising bound restores continuation',async t=>{
 const {reader,store}=setup(t,{maxRoots:1,messagesEnabled:false});assert.equal(typeof reader.tick,'function');const handler=url=>url.pathname.endsWith('/me')?profile:url.pathname.endsWith('/media')?{data:[{id:'55',timestamp:'2025-01-01T00:00:00Z'},{id:'56',timestamp:'2025-01-01T00:00:00Z'}]}:{data:[]};
 scripted(reader,handler);await reader.tick();assert.equal(reader.status().reason,'root_limit');assert.ok(reader.status().pending_jobs>0);assert.equal(store.cursor(reader.source),null);
 const next=new receiver.MetaReader(store,'instagram',{...cfg,maxRoots:2,messagesEnabled:false});scripted(next,handler);await next.tick();assert.equal(next.status().roots.posts,2);assert.equal(next.status().pending_jobs,0);
});
test('Threads full conversation includes nested visitors and excludes own replies',async t=>{
 const {store}=setup(t);const reader=new receiver.MetaReader(store,'threads',{...cfg,apiVersion:'v1.0'});assert.equal(typeof reader.tick,'function');
 scripted(reader,url=>{if(url.pathname.endsWith('/me'))return {id:targets.threads};if(url.pathname.endsWith('/threads'))return {data:[{id:'old',timestamp:'2025-01-01T00:00:00Z'}]};return {data:[{id:'a',text:'visitor',timestamp:'2026-10-14T01:00:00Z',username:'person',root_post:{id:'old'},replied_to:{id:'old'},is_reply_owned_by_me:false},{id:'b',text:'nested',timestamp:'2026-10-14T01:01:00Z',username:'person2',root_post:{id:'old'},replied_to:{id:'a'},is_reply_owned_by_me:false},{id:'self',text:'self',timestamp:'2026-10-14T01:02:00Z',username:'owner',root_post:{id:'old'},replied_to:{id:'old'},is_reply_owned_by_me:true}]}});await reader.tick();assert.equal(store.pendingAnna().length,2);
});
test('IG messages enumerate second page and materialize individual message IDs',async t=>{
 const {reader,store}=setup(t);assert.equal(typeof reader.tick,'function');
 scripted(reader,url=>{const p=url.pathname;if(p.endsWith('/me'))return profile;if(p.endsWith('/media'))return {data:[]};if(p.endsWith('/conversations'))return {data:[{id:'conv'}]};
 if(p.endsWith('/conv'))return {messages:{data:[{id:'m1'}],paging:{next:'https://graph.instagram.com/v22.0/conv/messages?after=n',cursors:{after:'n'}}}};
 if(p.endsWith('/conv/messages'))return {data:[{id:'m2'}]};if(p.endsWith('/m1')||p.endsWith('/m2'))return {id:p.split('/').at(-1),message:'hello',created_time:'2026-10-14T01:00:00Z',from:{id:'visitor'},to:{data:[{id:targets.instagram}]}};
 throw Error('unexpected')});await reader.tick();assert.equal(store.pendingAnna().length,2);assert.equal(reader.status().roots.conversations,1);
});
test('configured IG v25 preserves v25 requests through roots inbox and nested message pages',async t=>{
 const {reader,store}=setup(t,{apiVersion:'v25.0'});const requested=[];
 scripted(reader,url=>{requested.push(url);const p=url.pathname;if(p.endsWith('/me'))return profile;
  const paging=edge=>({next:'https://graph.instagram.com/v25.0/'+edge+'?after=next',cursors:{after:'next'}});
  if(p.endsWith('/media'))return url.searchParams.has('after')?{data:[]}:{data:[{id:'55',timestamp:'2025-01-01T00:00:00Z'}],paging:paging(targets.instagram+'/media')};
  if(p.endsWith('/conversations'))return url.searchParams.has('after')?{data:[]}:{data:[{id:'conv'}],paging:paging(targets.instagram+'/conversations')};
  if(p.endsWith('/55/comments'))return {data:[]};
  if(p.endsWith('/conv'))return {messages:{data:[{id:'m1'}],paging:paging('conv/messages')}};
  if(p.endsWith('/conv/messages'))return {data:[{id:'m2'}]};
  if(p.endsWith('/m1')||p.endsWith('/m2'))return {id:p.split('/').at(-1),message:'hello',created_time:'2026-10-14T01:00:00Z',from:{id:'visitor'},to:{data:[{id:targets.instagram}]}};
  throw Error('unexpected route')});
 await reader.tick();assert.equal(store.pendingAnna().length,2);assert.equal(reader.status().pending_jobs,0);
 assert.ok(requested.length>3);assert.ok(requested.every(u=>u.origin==='https://graph.instagram.com'&&u.pathname.startsWith('/v25.0/')));
 for(const edge of [targets.instagram+'/media',targets.instagram+'/conversations','conv/messages'])assert.ok(requested.some(u=>u.pathname==='/v25.0/'+edge&&u.searchParams.get('after')==='next'),edge);
});
test('permissions hold one road; separate road receives events, rate-limit remains partial',async t=>{
 const {reader,store}=setup(t);assert.equal(typeof reader.tick,'function');
 scripted(reader,url=>url.pathname.endsWith('/me')?profile:url.pathname.endsWith('/media')?{error:{code:200}}:url.pathname.endsWith('/conversations')?{data:[{id:'conv'}]}:url.pathname.endsWith('/conv')?{messages:{data:[{id:'m1'}]}}:{id:'m1',message:'hello',created_time:'2026-10-14T01:00:00Z',from:{id:'visitor'},to:{data:[{id:targets.instagram}]}});
 await reader.tick();assert.equal(store.pendingAnna().length,1);assert.equal(reader.status().held_jobs[0].reason,'permissions');assert.equal(reader.status().ready,false);
});
test('HTTP 429 and 403 without JSON still enforce distinct rate/permission policy',async t=>{
 const {reader,setNow}=setup(t);let response=new Response('upstream unavailable',{status:429,headers:{'retry-after':'3600'}});
 const api=new apiModule.MetaApi({provider:'instagram',account:targets.instagram,version:'v22.0',token:'fixture-token',budget:reader.state,fetchImpl:async()=>response});
 await assert.rejects(api.call('roots'),e=>e.reason==='rate_limit'&&e.retryAt===tick+3600000);setNow(tick+3600001);response=new Response('',{status:403});await assert.rejects(api.call('roots'),e=>e.reason==='permissions');
});
test('permission hold survives same-generation restart and changes only with explicit access epoch',async t=>{
 const {reader,store}=setup(t,{messagesEnabled:false});const handler=url=>url.pathname.endsWith('/me')?profile:{error:{code:200}};
 scripted(reader,handler);await reader.tick();const next=new receiver.MetaReader(store,'instagram',{...cfg,messagesEnabled:false});scripted(next,handler);await next.tick();assert.equal(next.status().calls_today,3);assert.equal(next.status().held_jobs[0].reason,'permissions');
 const restored=new receiver.MetaReader(store,'instagram',{...cfg,messagesEnabled:false,accessEpoch:1});scripted(restored,url=>url.pathname.endsWith('/me')?profile:{data:[]});await restored.tick();assert.equal(restored.status().held_jobs.length,0);
});
test('expired after is rewound once to safe beginning; real fields error remains held',async t=>{
 const {reader,store}=setup(t,{messagesEnabled:false});reader.beginCycle();const job=reader.jobs()[0];job.args.after='expired';reader.writeJob(job);
 scripted(reader,url=>url.pathname.endsWith('/me')?profile:url.searchParams.has('after')?{error:{code:100}}:url.pathname.endsWith('/media')?{data:[{id:'55',timestamp:'2025-01-01T00:00:00Z'}]}:url.pathname.endsWith('/comments')?{data:[{id:'77',text:'new',timestamp:'2026-10-14T01:00:00Z',from:{id:'66'}}]}:{data:[]});
 await reader.tick();assert.equal(store.pendingAnna().length,1);assert.equal(reader.status().pending_jobs,0);
});
test('completed baseline admits subsequently discovered old-timestamp object',async t=>{
 const {reader,store,setNow}=setup(t,{messagesEnabled:false});scripted(reader,url=>url.pathname.endsWith('/me')?profile:{data:[]});await reader.tick();setNow(tick+900000);
 scripted(reader,url=>url.pathname.endsWith('/media')?{data:[{id:'55',timestamp:'2025-01-01T00:00:00Z'}]}:url.pathname.endsWith('/comments')?{data:[{id:'77',text:'delayed',timestamp:'2025-01-01T00:00:00Z',from:{id:'66'}}]}:{data:[]});
 await reader.tick();assert.equal(store.pendingAnna().length,1);
});
test('real 30000 pending pauses page; freeing capacity resumes without operator restart',async t=>{
 const {reader,store,setNow}=setup(t,{messagesEnabled:false});
 store.tx(()=>{store.db.exec("WITH RECURSIVE x(n) AS(VALUES(1) UNION ALL SELECT n+1 FROM x WHERE n<30000) INSERT INTO events SELECT 'r'||n,'vk','r'||n,'anna','h'||n,'127999849','comment','c','s','fixture',1,9999999999999 FROM x; INSERT INTO outbox SELECT 'o'||id,'anna_event',id,1,'{}','held_no_private_route',1 FROM events");});
 scripted(reader,url=>url.pathname.endsWith('/me')?profile:url.pathname.endsWith('/media')?{data:[{id:'55',timestamp:'2025-01-01T00:00:00Z'}]}:url.pathname.endsWith('/comments')?{data:[{id:'77',text:'new',timestamp:'2026-10-14T01:00:00Z',from:{id:'66'}}]}:{data:[]});
 for(let i=0;i<3;i++){await reader.tick();setNow(tick+(i+1)*900000)}assert.equal(reader.status().reason,'backpressure');assert.equal(reader.status().held_jobs.length,0);store.db.exec("DELETE FROM outbox WHERE aggregate_id LIKE 'r%'");
 await reader.tick();assert.equal(store.pendingAnna().length,1);assert.equal(reader.status().pending_jobs,0);
});
test('profile permission refusal itself is durably held until access epoch changes',async t=>{
 const {reader,store}=setup(t,{messagesEnabled:false});let requests=0;
 scripted(reader,()=>{requests++;return {error:{code:200}}});await reader.tick();await reader.tick();assert.equal(requests,1);
 const again=new receiver.MetaReader(store,'instagram',{...cfg,messagesEnabled:false});scripted(again,()=>{requests++;return {error:{code:200}}});await again.tick();assert.equal(requests,1);
 const restored=new receiver.MetaReader(store,'instagram',{...cfg,messagesEnabled:false,accessEpoch:1});scripted(restored,url=>url.pathname.endsWith('/me')?profile:{data:[]});await restored.tick();assert.equal(restored.status().reason,null);
});
test('actual subsystem restart does not treat first RAM load as credential rotation',async t=>{
 const {store,dir}=setup(t);const token=path.join(dir,'token');fs.writeFileSync(token,'fixture-token\n',{mode:0o600});let denied=0;
 const config={instagram:{...cfg,messagesEnabled:false,token:{file:token}}};
 const fetchImpl=async url=>new Response(JSON.stringify(new URL(url).pathname.endsWith('/me')?profile:(denied++,{error:{code:200}})));
 for(let i=0;i<2;i++){const worker=receiver.startMetaSubsystem(store,config,{fetchImpl,log:()=>{}});for(let n=0;n<60&&store.metaStatus().instagram.reason!=='permissions';n++)await new Promise(r=>setTimeout(r,5));await new Promise(r=>setTimeout(r,30));await worker.stop()}
 assert.equal(denied,1);
});
test('completed root baseline continues admission while a different road is permission-held',async t=>{
 const {reader,store,setNow}=setup(t);let changed=false;
 scripted(reader,url=>url.pathname.endsWith('/me')?profile:url.pathname.endsWith('/media')?{data:[{id:'55',timestamp:'2025-01-01T00:00:00Z'}]}:url.pathname.endsWith('/conversations')?{error:{code:200}}:url.pathname.endsWith('/comments')?{data:changed?[{id:'77',text:'new observation',timestamp:'2025-01-01T00:00:00Z',from:{id:'66'}}]:[]}:{data:[]});
 await reader.tick();assert.equal(store.pendingAnna().length,0);changed=true;setNow(tick+900000);await reader.tick();assert.equal(store.pendingAnna().length,1);assert.equal(reader.status().held_jobs.length,1);
});
test('clock regression parks without exhausting retries; corrected clock resumes',async t=>{
 const {reader,store,setNow}=setup(t,{messagesEnabled:false});scripted(reader,url=>url.pathname.endsWith('/me')?profile:{data:[]});setNow(tick+86400000);await reader.tick({maxPages:1});
 for(let i=0;i<3;i++){setNow(tick+i*900000);await reader.tick()}assert.equal(reader.status().held_jobs.length,0);
 setNow(tick+86400000);await reader.tick();assert.equal(reader.status().pending_jobs,0);assert.equal(reader.status().ready,true);
});
test('unknown refresh metadata remains representable without disabling Meta intake config',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-unknown-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'config.json'),c={profile:'anna',port:8899,stateDir:dir,keyFiles:{anna:'/tmp/a',monitor:'/tmp/m',channel:'/tmp/c'},targets,meta:{instagram:{...cfg,refresh:{enabled:true}}}};
 fs.writeFileSync(file,JSON.stringify(c),{mode:0o600});assert.equal(loadConfig(file).meta.instagram.enabled,true);
});
test('stale epoch cannot update current worker heartbeat',async t=>{
 const {reader,store,setNow}=setup(t);new receiver.MetaReader(store,'instagram',cfg);const before=reader.state.get();setNow(tick+1000);await reader.tick();assert.deepEqual(reader.state.get(),before);
});
test('over-quota usage percentage is a rate backoff, not malformed-page hold',async t=>{
 const {reader}=setup(t);const api=new apiModule.MetaApi({provider:'instagram',account:targets.instagram,version:'v22.0',token:'fixture-token',budget:reader.state,fetchImpl:async()=>new Response('{"data":[]}',{headers:{'x-app-usage':'{"call_count":150,"total_time":100,"total_cputime":100}'}})});
 await api.call('roots');await assert.rejects(api.call('roots'),e=>e.reason==='usage_limit');
});
