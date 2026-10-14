import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
const app=process.env.DSH_TEST_APP;if(!app){console.log('СЛЕПОТА: нужен DSH_TEST_APP для native Cordis/ToolRuntime');process.exit(2)}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'schedule-native-'));process.env.DSH_HOME=temp;process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));const req=createRequire(path.join(app,'package.json'));let Context,createScope,scopeTarget,ToolRuntime,defineTool,guard;
try{({Context}=await import(pathToFileURL(req.resolve('@deepseek-ai/cordis'))));({createScope,scopeTarget}=await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-scope'))));({ToolRuntime,defineTool}=await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-tools'))));fs.copyFileSync(fileURLToPath(new URL('../src/index.js',import.meta.url)),path.join(temp,'index.js'));fs.copyFileSync(fileURLToPath(new URL('../package.json',import.meta.url)),path.join(temp,'package.json'));fs.symlinkSync(path.join(app,'node_modules'),path.join(temp,'node_modules'));guard=await import(pathToFileURL(path.join(temp,'index.js')))}catch(e){console.log('СЛЕПОТА: native зависимости/предмет недоступны: '+(e.code||e.message));process.exit(2)}

const tick=async()=>{for(let i=0;i<12;i++) await new Promise(r=>setImmediate(r))};
const wakes=n=>Array.from({length:n},()=>({type:'user/message',time:Date.now(),data:{source:{kind:'schedule'}}}));
function setup(events=[],config={}) {
 const ctx=new Context();
 ctx.reflect.provide('systemPrompt',{tools(){return ()=>{}},section(){return ()=>{}}});
 const runtime=new ToolRuntime(ctx,{mode:'native'});let bodyCalls=0;
 for(const name of ['schedule_create','schedule_update']) runtime.register(defineTool({name,description:'review fake schedule IO',parameters:{id:{type:'string'},prompt:{type:'string'},every_seconds:{type:'number'},after_seconds:{type:'number'}},output:{schema:{type:'object',additionalProperties:false,properties:{ok:{type:'boolean',required:true}}},render:()=>[{type:'text',text:'fixture accepted'}]},async execute(){bodyCalls++;return{ok:true}}}));
 const agent={id:'review-root',session:{id:'review-root',snapshotEvents:()=>events},ctx:null};
 const scope=createScope(ctx,agent);agent.ctx=scope.ctx;
 const rows=[{id:'review-repeat',kind:'every',title:'private fixture',prompt:'private 🌟',everySeconds:600,scheduledAt:new Date(Date.now()+600000).toISOString()}]; const deleted=[];
 ctx.reflect.provide('agents',{roots:()=>[agent],withoutInitiator:fn=>fn()});
 ctx.reflect.provide('sessions',{flush:async()=>{}});
 ctx.reflect.provide('schedule',{async list(){return rows.filter(r=>!deleted.includes(r.id))},async delete({id}){deleted.push(id);return{deleted:true}}});
 const fiber=ctx.plugin(guard,{maxPerHour:0,...config});
 const execute=(name,args)=>runtime.execute({name,arguments:args,agent,callId:'review-call',signal:new AbortController().signal});
 const idle=()=>ctx.emit(scopeTarget(agent,agent),'agent/status',{agent,status:'idle'});
 return{ctx,scope,agent,rows,deleted,fiber,runtime,execute,idle,calls:()=>bodyCalls};
}
const first=setup();await tick();
const good=await first.execute('schedule_create',{every_seconds:3600});assert.equal(good.isError,false);assert.equal(first.calls(),1);
const bad=await first.execute('schedule_create',{every_seconds:600});assert.equal(bad.error?.info?.code,'SCHEDULE_TOO_FREQUENT');assert.equal(first.calls(),1);
const goodAgain=await first.execute('schedule_create',{every_seconds:3600});assert.equal(goodAgain.isError,false);assert.equal(first.calls(),2);
console.log('PASS real Context + native ToolRuntime: green->rejected fast repeat->green, error code and body bypass confirmed');
assert(first.runtime.get('heartbeat_close',first.agent));
const hb=await first.execute('heartbeat_close',{summary:'review fixture'});assert(!hb.isError,JSON.stringify(hb));assert(hb.content[0].text.includes('подряд 0'));console.log('PASS heartbeat_close registered + executed in actual scoped ToolRuntime');
first.idle();await tick();assert.deepEqual(first.deleted,['review-repeat']);console.log('PASS scoped agent/status reaches actual agent.ctx sweep');
await first.fiber.dispose();await tick();
first.deleted.length=0;
const off=first.ctx.plugin(guard,{enabled:false,maxPerHour:0});await tick();
const offCreate=await first.execute('schedule_create',{every_seconds:60});assert(!offCreate.isError);first.idle();await tick();
console.log('OBSERVATION reload true->false: native create error='+Boolean(offCreate.isError)+' deleted='+JSON.stringify(first.deleted)+' heartbeat_present='+Boolean(first.runtime.get('heartbeat_close',first.agent)));
console.log('EXPECTED disabled guard has no removals and no heartbeat registration on same living root');
assert.deepEqual(first.deleted,[]);assert(!first.runtime.get('heartbeat_close',first.agent),'disposed heartbeat must be unregistered');
await off.dispose();await tick();
const reenabled=first.ctx.plugin(guard,{maxPerHour:0});await tick();
const reenabledFast=await first.execute('schedule_create',{every_seconds:600});
assert.equal(reenabledFast.error?.info?.code,'SCHEDULE_TOO_FREQUENT');
first.idle();await tick();
console.log('OBSERVATION reenabled same root: native fast refusal='+reenabledFast.error?.info?.code+' sweep_deleted='+JSON.stringify(first.deleted));
const brokenReenable=first.deleted.length===0;
await reenabled.dispose();await first.scope.dispose();
const second=setup(wakes(7),{maxConsecutiveWakeups:6});await tick();await second.fiber.dispose();await tick();
const raised=second.ctx.plugin(guard,{maxPerHour:0,maxConsecutiveWakeups:100,minRepeatingIntervalSeconds:60});await tick();second.idle();await tick();
console.log('OBSERVATION reload limits 6->100 / interval 1800->60 on same living root: deleted='+JSON.stringify(second.deleted));
assert.deepEqual(second.deleted,[],'raised limits must apply to the same living root');await raised.dispose();await second.scope.dispose();
assert.equal(brokenReenable,false,'REENABLE REGRESSION: fast repeat still present, old agent.ctx handler uses inactive plugin ctx and WeakSet prevented new handler');

const pending=setup(wakes(7));await tick();let release;const gate=new Promise(r=>release=r);const originalList=pending.ctx.schedule.list.bind(pending.ctx.schedule);pending.ctx.schedule.list=async()=>{await gate;return originalList()};
const archive=path.join(temp,'schedule-guard-snyatye.jsonl');const before=fs.existsSync(archive)?fs.readFileSync(archive,'utf8'):'';pending.idle();await tick();await pending.fiber.dispose();release();await tick();assert.deepEqual(pending.deleted,[]);assert.equal(fs.existsSync(archive)?fs.readFileSync(archive,'utf8'):'',before,'disposed pending sweep must not append an archive');await pending.scope.dispose();console.log('PASS pending list after teardown starts neither archive nor delete');
console.log('RESULT native lifecycle passed: admission, heartbeat, fresh idle, off, reenable, changed limits, pending teardown');
