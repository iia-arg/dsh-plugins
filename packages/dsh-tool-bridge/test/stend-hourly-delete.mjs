// RU: Реальный apply и HTTP-дверь; подставлены только тела внешнего расписателя. Проверяет часовой отказ для всех видов и повтор незавершённого удаления.
// EN: Real apply and HTTP entry; only external scheduler bodies are fixtures. Checks hourly refusal for every kind and retry of incomplete deletion.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync,chmodSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const root=resolve(process.env.MOST_ROOT||new URL('..',import.meta.url).pathname)
const app=process.env.DSH_TEST_APP
if(!app){console.error('SLIP: DSH_TEST_APP required');process.exit(2)}
const req=createRequire(resolve(app,'package.json'))
const {Context}=await import(req.resolve('@deepseek-ai/cordis'))
const {ToolRuntime,defineTool}=await import(req.resolve('@deepseek-ai/dsh-tools'))
const dir=mkdtempSync(resolve(tmpdir(),'bridge-hourly-'))
writeFileSync(resolve(dir,'fixture.yml'),'predely:\n  minIntervalSeconds: 1800\n  maxConsecutiveCount: 100\n  maxPerDayCount: 100\n  maxVChasCount: 2\n  dayZone: UTC\npolitiki:\n  rezyumirovatPolosu: false\n'.replace('maxVChasCount: 2',process.env.DISABLED_HOUR_ONLY?'maxVChasCount: 0':'maxVChasCount: 2'))
const decoy=resolve(dir,'decoy');mkdirSync(decoy)
writeFileSync(resolve(decoy,'fixture.yml'),'predely:\n  maxVChasCount: 0\n  maxConsecutiveCount: 100\n  maxPerDayCount: 100\n')
process.env.AGENT_LIMITS_DIR=process.env.CONFIG_PATH_ONLY?decoy:dir
const alert=resolve(dir,'alert-fixture'),alertReceipt=resolve(dir,'alert-receipt')
writeFileSync(alert,'#!'+process.execPath+'\n'+"require('node:fs').writeFileSync("+JSON.stringify(alertReceipt)+", 'receipt')\n");chmodSync(alert,0o700)
process.env.DSH_ALERT_CMD=resolve(dir,'no-alert')
const src=resolve(root,'src/index.js')
console.log('SUBJECT',src,'SHA256',createHash('sha256').update(readFileSync(src)).digest('hex'))
const {apply}=await import(pathToFileURL(src))
const ctx=new Context(),hooks=[],disposers=[],logs=[]
const original=console.error
console.error=(...a)=>{logs.push(a.join(' '));original(...a)}
ctx.provide('systemPrompt',{tools(){},section(){}})
ctx.provide('sessionProjections',{stateOf:()=>({openTurnStartSeq:1,lastTurn:1})})
const registry=new ToolRuntime(ctx)
const agent={id:'fixture-root',session:{id:'fixture-root',header:{cwd:dir},events:[],append(){}}}
let records=[],deleteMode='ok',deleteCalls=0
for(const name of ['schedule_create','schedule_update','schedule_list','schedule_delete']){
 registry.register(defineTool({name,description:'fixture scheduler',parameters:{id:{type:'string'},every_seconds:{type:'number'},after_seconds:{type:'number'},daily:{type:'object',additionalProperties:false,properties:{time:{type:'string',required:true},time_zone:{type:'string',required:true}}},weekly:{type:'object',additionalProperties:false,properties:{time:{type:'string',required:true},time_zone:{type:'string',required:true},weekdays:{type:'array',items:{type:'integer'},required:true}}}},output:{schema:{type:'object',additionalProperties:true},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},execute:async args=>{
  if(name==='schedule_list')return records.map(r=>({...r}))
  if(name==='schedule_delete'){
   deleteCalls++
   if(deleteMode==='false'||(deleteMode==='mixed'&&args.id==='retry'))return {deleted:false,code:'fixture-refusal'}
   if(deleteMode==='throw'&&args.id==='retry')throw Error('fixture-delete-error')
   const before=records.length;records=records.filter(r=>r.id!==args.id);return {deleted:records.length<before}
  }
  if(name==='schedule_create'){const r={id:'created-'+records.length,...args};records.push(r);return r}
  return {updated:true,...args}
 }}))
}
const services={tools:registry,agents:{get:id=>id===agent.id?agent:undefined,roots:()=>[agent],currentInitiator:()=>agent},goals:{},jobs:{},typertGateway:{}}
apply({get:n=>services[n],provide:(n,s)=>{services[n]=s},on:(ev,fn)=>{hooks.push([ev,fn])},effect:fn=>{disposers.push(fn())}}, {limitsAgent:'fixture',limitsDir:dir,alertCommand:alert,port:0,heartbeatNoticeDir:''})
const wait=async pred=>{for(let i=0;i<100;i++){if(pred())return;await new Promise(r=>setTimeout(r,5))}throw Error('timeout')}
async function invoke(tool,args){await wait(()=>services.mcpBridge?.descriptor(agent.id));const d=services.mcpBridge.descriptor(agent.id);const r=await fetch(d.url,{method:'POST',headers:{'content-type':'application/json','x-bridge-ticket':d.ticket},body:JSON.stringify({tool,args}),signal:AbortSignal.timeout(3000)});return r.json()}
function windowFull(){const now=Date.now();agent.session.events=[now-60000,now-30000].map(time=>({type:'schedule/change',data:{operation:'dispatch'},time}))}
function dayFull(){agent.session.events=Array.from({length:100},()=>({type:'schedule/change',data:{operation:'dispatch'},time:Date.now()}))}
async function endTurn(){const start=logs.length;hooks.find(([e])=>e==='session/event')[1](agent.session,{type:'turn/end',data:{turn:1}});await wait(()=>logs.slice(start).some(l=>l.includes('самопробуждение fixture-root:')));await new Promise(r=>setTimeout(r,20));return logs.slice(start).join('\n')}
let passed=0,failed=0
async function check(name,fn){if(process.env.PROBE_ONLY&&!name.includes(process.env.PROBE_ONLY))return;try{await fn();passed++;console.log('PASS',name)}catch(e){failed++;console.log('FAIL',name,e.message)}}
try{
 if(process.env.DISABLED_HOUR_ONLY) await check('hourly-disabled-recurring-allows',async()=>{if(!process.env.DISABLED_HOUR_ONLY)return;windowFull();records=[];for(const args of [{every_seconds:1800},{daily:{time:'12:00:00',time_zone:'UTC'}},{weekly:{time:'12:00:00',time_zone:'UTC',weekdays:[1]}}])assert.equal((await invoke('schedule_create',args)).ok,true);await endTurn();assert.equal(records.length,3)})
 for(const [kind,args] of [['every',{every_seconds:1800}],['daily',{daily:{time:'12:00:00',time_zone:'UTC'}}],['weekly',{weekly:{time:'12:00:00',time_zone:'UTC',weekdays:[1]}}]]){
  for(const operation of ['create','update'])await check('hourly-'+kind+'-'+operation,async()=>{windowFull();records=[];const r=await invoke('schedule_'+operation,operation==='update'?{id:'existing-fixture',...args}:args);assert.equal(r.ok,false,JSON.stringify(r));assert.match(r.error,/час/);assert.equal(records.length,0)})
 }
 await check('hourly-expired-window-allows-recurring',async()=>{agent.session.events=[{type:'schedule/change',data:{operation:'dispatch'},time:Date.now()-3600001}];for(const args of [{every_seconds:1800},{daily:{time:'12:00:00',time_zone:'UTC'}},{weekly:{time:'12:00:00',time_zone:'UTC',weekdays:[1]}}])assert.equal((await invoke('schedule_create',args)).ok,true);assert.equal(records.length,3)})
 await check('hourly-after-keeps-delay-policy',async()=>{windowFull();const r=await invoke('schedule_create',{after_seconds:1});assert.equal(r.ok,true);assert(r.value.after_seconds>=3500,JSON.stringify(r))})
 await check('hourly-end-removes-all-kinds',async()=>{windowFull();records=['every','daily','weekly','after'].map(kind=>({id:kind,kind}));deleteMode='ok';await endTurn();assert.equal(records.length,0)})
 await check('delete-false-is-retried',async()=>{agent.session.events=[];await endTurn();dayFull();records=[{id:'retry',kind:'daily'}];deleteMode='false';const text=await endTurn();assert.equal(records.length,1);assert.match(text,/снято напоминаний 0/);assert.match(text,/fixture-refusal/);deleteMode='ok';await endTurn();assert.equal(records.length,0,'false ACK must not latch the stop marker')})
 await check('delete-mixed-counts-only-removed',async()=>{agent.session.events=[];await endTurn();dayFull();records=[{id:'retry',kind:'weekly'},{id:'good',kind:'every'}];deleteMode='mixed';const text=await endTurn();assert.deepEqual(records.map(r=>r.id),['retry']);assert.match(text,/снято напоминаний 1/);deleteMode='ok';await endTurn();assert.equal(records.length,0)})
 await check('delete-error-does-not-skip-next-record',async()=>{agent.session.events=[];await endTurn();dayFull();records=[{id:'retry',kind:'weekly'},{id:'good',kind:'every'}];deleteMode='throw';await endTurn();assert.deepEqual(records.map(r=>r.id),['retry']);deleteMode='ok';await endTurn();assert.equal(records.length,0)})
 await check('hourly-missing-history-refuses-recurring',async()=>{agent.session.events=undefined;const before=records.length;for(const args of [{every_seconds:1800},{daily:{time:'12:00:00',time_zone:'UTC'}},{weekly:{time:'12:00:00',time_zone:'UTC',weekdays:[1]}}]){const r=await invoke('schedule_create',args);assert.equal(r.ok,false);assert.match(r.error,/журнал/)}assert.equal(records.length,before)})
 await check('config-alert-command-writes-receipt',async()=>{agent.session.events=undefined;const r=await invoke('schedule_create',{after_seconds:1});assert.equal(r.ok,true);/* аудит №7 (1.3.44): отправка тревоги асинхронная — квитанцию ждём до 5 с */for(const d=Date.now()+5000;!existsSync(alertReceipt)&&Date.now()<d;)await new Promise(q=>setTimeout(q,50));assert.equal(existsSync(alertReceipt),true,'configured alert command must execute');assert.equal(readFileSync(alertReceipt,'utf8'),'receipt')})
 await check('hourly-rearms-after-window-elapses',async()=>{agent.session.events=[];await endTurn();windowFull();records=[{id:'new',kind:'daily'}];await endTurn();assert.equal(records.length,0)})
}finally{console.error=original;for(const f of disposers)f();for(const [e,f] of hooks)if(e==='dispose')f();await ctx.fiber.dispose();rmSync(dir,{recursive:true,force:true})}
console.log(`RESULT ${passed}/${passed+failed}`);process.exitCode=failed?1:0
