// RU: Проверка stend-scoped-sessions: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-scoped-sessions verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.

import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const root=resolve(process.env.MOST_ROOT||new URL('..',import.meta.url).pathname)
const app=process.env.DSH_TEST_APP
if(!app){console.error('СЛЕПОТА: DSH_TEST_APP not set');process.exit(2)}
// Аудит №3 (1.3.44): неверный DSH_TEST_APP — СЛЕПОТА 2 с причиной, а не необработанный throw кодом 1.
let Context,ToolRuntime,defineTool,registerScheduleTools,req
try{req=createRequire(resolve(app,'package.json'))
 ;({Context}=await import(req.resolve('@deepseek-ai/cordis')))
 ;({ToolRuntime,defineTool}=await import(req.resolve('@deepseek-ai/dsh-tools')))
 ;({registerScheduleTools}=await import(req.resolve('@deepseek-ai/dsh-schedule')))}
catch(e){console.error('СЛЕПОТА: платформа в DSH_TEST_APP не читается ('+app+'): '+String(e?.message??e).slice(0,160));process.exit(2)}
const {createScope}=await import(req.resolve('@deepseek-ai/dsh-scope'))
const {apply,naborDlyaAgenta}=await import(pathToFileURL(resolve(root,'src/index.js')))
console.log('SUBJECT',root,'SHA256',createHash('sha256').update(readFileSync(resolve(root,'src/index.js'))).digest('hex'))
const ctx=new Context(),calls=[],scopes=[],hooks=[],effects=[]
ctx.provide('systemPrompt',{tools(){},section(){}})
const registry=new ToolRuntime(ctx)
ctx.provide('sessionProjections',{stateOf:()=>({openTurnStartSeq:1,lastTurn:1})})
const agent=(id,sid)=>{const a={id,status:'running',session:{id:sid,header:{cwd:'/fixture'},events:[{type:'turn/start',data:{turn:1}}],append(){}}};const s=createScope(ctx,a);a.ctx=s.ctx;scopes.push(s);return a}
const site=agent('host-root','telegram-site-1'),rotated=agent('host-rotated','telegram-site-2-v2-fixture')
const tg=agent('telegram-site-agent-id-only','telegram-123'),other=agent('other-root','chat-2'),near=agent('near-root','xtelegram-site-1')
const gost=agent('gost-root','telegram-gost-123'),gostGr=agent('gost-group','telegram-gost--1001234'),gostRot=agent('gost-rot','telegram-gost-123-v2-fixture'),gostNear=agent('gost-near','telegram-gostx-1')
const gostMem=agent('gost-mem','telegram-gost-555')  // B-N-1644: гость с чтением памяти
const agents=[site,rotated,tg,other,near,gost,gostGr,gostRot,gostNear,gostMem]
let initiator=site
const def=name=>defineTool({name,description:'isolated '+name,parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>{calls.push(name);return 'fixture-'+name}})
registry.register({...def('schedule_create'),parameters:{type:'object',properties:{cron:{type:'string'}}}});
registry.register(def('pismo_rukovoditelyu'));registry.register(def('job_list'));registry.register(def('pamyat_po_smyslu'));registry.register(def('fixture_other'));registry.register(def('pamyat_dlya_gostej'))
let siteRestriction=site.ctx.get('tools').restrict({allow:['pismo_rukovoditelyu']})
rotated.ctx.get('tools').restrict({allow:['pismo_rukovoditelyu']})
for(const a of [gost,gostGr,gostRot])a.ctx.get('tools').restrict({allow:['pismo_rukovoditelyu']})
gostMem.ctx.get('tools').restrict({allow:['pismo_rukovoditelyu','pamyat_dlya_gostej']})
const services={tools:registry,agents:{get:id=>agents.find(a=>a.id===id),roots:()=>agents,currentInitiator:()=>initiator},
 goals:{get:()=>{calls.push('get_goal');return null}},jobs:{list:()=>{calls.push('job_list');return []},read:()=>{calls.push('job_output');return {}},kill:()=>{calls.push('job_kill');return {}}},typertGateway:{}}
const bridgeCtx={get:n=>services[n],provide:(n,s)=>{services[n]=s},on:(ev,fn)=>{hooks.push([ev,fn]);return()=>{}},effect:fn=>{effects.push(fn())},logger:{warn(){},info(){},error(){}}}
apply(bridgeCtx,{port:0})
async function descriptor(a){initiator=a;for(let i=0;i<50;i++){const d=services.mcpBridge?.descriptor(a.id);if(d)return d;await new Promise(r=>setTimeout(r,20))}throw Error('bridge did not listen')}
async function invoke(d,tool,extra={}){const r=await fetch(d.url,{method:'POST',headers:{'content-type':'application/json','x-bridge-ticket':d.ticket},body:JSON.stringify({tool,args:{},...extra}),signal:AbortSignal.timeout(3000)});return {status:r.status,...await r.json()}}
const fixed=['get_goal','create_goal','update_goal','job_output','job_list','job_kill','schedule_create','schedule_list','schedule_delete','schedule_update','pamyat_otnoshenie','pamyat_ocenit','pamyat_po_smyslu','heartbeat_close']
const expectedLegacy=[...fixed,'pismo_rukovoditelyu','fixture_other','pamyat_dlya_gostej'].sort()
let passed=0,failed=0
async function check(name,fn){if(process.env.PROBE_ONLY&&!process.env.PROBE_ONLY.split(',').includes(name))return;try{await fn();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
try{
 await check('invalid-schema-hidden-and-direct-call-refused-restore',async()=>{
  const baseline=(await descriptor(tg)).tools.map(t=>t.name).sort()
  const bad={...def('ostrov_api'),parameters:{oneOf:[{type:'object',properties:{}}]}}
  const undo=registry.register(bad)
  try{const d=await descriptor(tg);assert.deepEqual(d.tools.map(t=>t.name).sort(),baseline);const n=calls.length;const r=await invoke(d,'ostrov_api');assert.equal(r.ok,false);assert.match(r.error,/не выдан/);assert.equal(calls.length,n)}finally{undo()}
  const good=registry.register(def('ostrov_api'))
  try{const d=await descriptor(tg);assert(d.tools.some(t=>t.name==='ostrov_api'));assert.equal((await invoke(d,'ostrov_api')).ok,true)}finally{good()}
  assert.deepEqual((await descriptor(tg)).tools.map(t=>t.name).sort(),baseline)
 })
 await check('site-list-exact',async()=>{assert.deepEqual(registry.wireSchemas(site).schemas.map(x=>x.name),['pismo_rukovoditelyu']);const d=await descriptor(site);assert.deepEqual(d.tools.map(t=>t.name),['pismo_rukovoditelyu']);assert.deepEqual(d.tools[0].inputSchema,registry.wireSchemas(site).schemas[0].parameters)})
 await check('site-direct-job-refused',async()=>{const n=calls.length;const r=await invoke(await descriptor(site),'job_list');assert.equal(r.ok,false,JSON.stringify(r));assert.match(r.error,/не выдан/);assert.equal(calls.length,n)})
 await check('site-all-fixed-refused',async()=>{const d=await descriptor(site);const n=calls.length;for(const name of fixed){const r=await invoke(d,name);assert.equal(r.ok,false,name);assert.match(r.error,/не выдан/,name)}assert.equal(calls.length,n)})
 await check('site-allowed-executes-native',async()=>{const n=calls.length;const r=await invoke(await descriptor(site),'pismo_rukovoditelyu');assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(calls.slice(n),['pismo_rukovoditelyu'])})
 await check('rotated-site-still-scoped',async()=>assert.deepEqual((await descriptor(rotated)).tools.map(t=>t.name),['pismo_rukovoditelyu']))
 await check('B-N-1642-tg-gost-scoped',async()=>{for(const a of [gost,gostGr,gostRot]){assert.deepEqual((await descriptor(a)).tools.map(t=>t.name),['pismo_rukovoditelyu'],a.session.id);const n=calls.length;const r=await invoke(await descriptor(a),'job_list');assert.equal(r.ok,false,a.session.id);assert.equal(calls.length,n)}})
 await check('B-N-1644-gost-pamyat-dlya-gostej',async()=>{assert.deepEqual((await descriptor(gostMem)).tools.map(t=>t.name).sort(),['pamyat_dlya_gostej','pismo_rukovoditelyu']);let n=calls.length;assert.equal((await invoke(await descriptor(gostMem),'pamyat_dlya_gostej')).ok,true);assert.deepEqual(calls.slice(n),['pamyat_dlya_gostej']);n=calls.length;for(const x of ['pamyat_po_smyslu','job_list','fixture_other'])assert.equal((await invoke(await descriptor(gostMem),x)).ok,false,x);assert.equal(calls.length,n)})
 await check('B-N-1642-gost-missing-wire-view-empty',()=>{assert.deepEqual(naborDlyaAgenta({get:()=>undefined},gost),[])})
 await check('B-N-1642-near-gost-prefix-unchanged',async()=>assert.deepEqual((await descriptor(gostNear)).tools.map(t=>t.name).sort(),expectedLegacy))
 await check('telegram-guest-unchanged',async()=>{assert.deepEqual((await descriptor(tg)).tools.map(t=>t.name).sort(),expectedLegacy);const n=calls.length;assert.equal((await invoke(await descriptor(tg),'job_list')).ok,true);assert.deepEqual(calls.slice(n),['job_list'])})
 await check('other-agent-and-near-prefix-unchanged',async()=>{for(const a of [other,near])assert.deepEqual((await descriptor(a)).tools.map(t=>t.name).sort(),expectedLegacy)})
 await check('toolNames-uses-same-scope',async()=>{initiator=site;assert.deepEqual(services.mcpBridge.toolNames(),['pismo_rukovoditelyu']);initiator=tg;assert.deepEqual(services.mcpBridge.toolNames().sort(),expectedLegacy)})
 await check('payload-cannot-change-ticket-owner',async()=>{const n=calls.length;const r=await invoke(await descriptor(site),'job_list',{agentId:tg.id,session:{id:tg.session.id}});assert.equal(r.ok,false);assert.match(r.error,/не выдан/);assert.equal(calls.length,n)})
 await check('existing-ticket-rechecks-restriction',async()=>{const d=await descriptor(site);assert.equal((await invoke(d,'pismo_rukovoditelyu')).ok,true);siteRestriction();siteRestriction=site.ctx.get('tools').restrict({allow:[]});const n=calls.length;assert.equal((await invoke(d,'pismo_rukovoditelyu')).ok,false);assert.equal(calls.length,n);siteRestriction();siteRestriction=site.ctx.get('tools').restrict({allow:['pismo_rukovoditelyu']});assert.equal((await invoke(d,'pismo_rukovoditelyu')).ok,true);assert.equal(calls.length,n+1)})
 await check('empty-scope-refuses-all',async()=>{siteRestriction();siteRestriction=site.ctx.get('tools').restrict({allow:[]});const d=await descriptor(site);assert.deepEqual(d.tools,[]);assert.equal((await invoke(d,'pismo_rukovoditelyu')).ok,false);siteRestriction();siteRestriction=site.ctx.get('tools').restrict({allow:['pismo_rukovoditelyu']})})
 await check('missing-wire-view-is-empty-for-site',()=>{assert.deepEqual(naborDlyaAgenta({get:()=>undefined},site),[]);assert(naborDlyaAgenta({get:()=>undefined},tg).some(t=>t.name==='job_list'))})
 await check('scope-cannot-grant-unapproved-tool',async()=>{siteRestriction();siteRestriction=site.ctx.get('tools').restrict({allow:['schedule_create']});const d=await descriptor(site);assert.deepEqual(d.tools,[]);assert.equal((await invoke(d,'schedule_create')).ok,false);siteRestriction();siteRestriction=site.ctx.get('tools').restrict({allow:['pismo_rukovoditelyu']})})
 await check('site-N-late-native-schedule-not-issued',async()=>{const detach=registerScheduleTools(ctx,site.ctx,site);try{const raw=registry.wireSchemas(site).schemas.map(t=>t.name);for(const name of ['schedule_create','schedule_delete','schedule_list','schedule_update'])assert(raw.includes(name),name+' must really be scoped');const d=await descriptor(site);assert.deepEqual(d.tools.map(t=>t.name),['pismo_rukovoditelyu']);for(const tool of raw.filter(n=>n.startsWith('schedule_'))){const r=await invoke(d,tool);assert.equal(r.ok,false);assert.match(r.error,/не выдан/,tool)}}finally{detach()}})
 await check('site-late-custom-and-file-not-issued',async()=>{const undo=['telegram_send_file','fixture_late'].map(name=>site.ctx.get('tools').register(def(name)));try{assert(registry.wireSchemas(site).schemas.some(t=>t.name==='telegram_send_file'));const d=await descriptor(site);assert.deepEqual(d.tools.map(t=>t.name),['pismo_rukovoditelyu']);const n=calls.length;for(const tool of ['telegram_send_file','fixture_late'])assert.equal((await invoke(d,tool)).ok,false);assert.equal(calls.length,n)}finally{undo.forEach(f=>f())}})
 await check('site-turn-end-skips-heartbeat-but-revokes-ticket',async()=>{
  const a=agent('telegram-site-11','telegram-site-11');agents.push(a);let reads=0;Object.defineProperty(a.session,'events',{get(){reads++;return []}})
  a.ctx.get('tools').restrict({allow:['pismo_rukovoditelyu']});const event=hooks.find(([name])=>name==='session/event')[1]
  event(a.session,{type:'turn/start',data:{turn:51}});const d=await descriptor(a);event(a.session,{type:'turn/end',data:{turn:51}})
  await new Promise(r=>setTimeout(r,30));assert.equal(reads,0,'site heartbeat must not read event history');assert.equal((await invoke(d,'pismo_rukovoditelyu')).status,403)
 })
 await check('rotated-site-turn-end-skips-heartbeat',async()=>{
  const a=agent('telegram-site-12-v2-fixture','telegram-site-12-v2-fixture');agents.push(a);let reads=0;Object.defineProperty(a.session,'events',{get(){reads++;return []}})
  hooks.find(([name])=>name==='session/event')[1](a.session,{type:'turn/end',data:{turn:1}});await new Promise(r=>setTimeout(r,30));assert.equal(reads,0)
 })
 await check('ordinary-turn-end-still-checks-heartbeat',async()=>{
  const a=agent('telegram-ordinary-fixture','telegram-ordinary-fixture');agents.push(a);let reads=0;Object.defineProperty(a.session,'events',{get(){reads++;return []}})
  hooks.find(([name])=>name==='session/event')[1](a.session,{type:'turn/end',data:{turn:1}});for(let i=0;i<50&&!reads;i++)await new Promise(r=>setTimeout(r,5));assert(reads>0,'ordinary heartbeat must still read events')
 })
 await check('unknown-ticket-refused',async()=>{const d=await descriptor(site);const n=calls.length;assert.equal((await invoke({...d,ticket:'invalid-fixture'},'pismo_rukovoditelyu')).status,403);assert.equal(calls.length,n)})
}finally{for(const dispose of effects)dispose();for(const [ev,fn] of hooks)if(ev==='dispose')fn();for(const s of scopes)await s.dispose();await ctx.fiber.dispose()}
console.log(`RESULT ${passed}/${passed+failed}`);process.exitCode=failed?1:0
