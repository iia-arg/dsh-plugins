// RU: Проверка stend-live-tools: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-live-tools verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
const app=process.env.DSH_TEST_APP
const limitsAgent=process.env.BRIDGE_TEST_LIMITS_AGENT
if(!app){console.error('СЛЕПОТА: DSH_TEST_APP не задан');process.exit(2)}
const req=createRequire(resolve(app,'package.json'))
const {Context}=await import(req.resolve('@deepseek-ai/cordis'))
const {ToolRuntime,defineTool}=await import(req.resolve('@deepseek-ai/dsh-tools'))
const present=await import(req.resolve('@deepseek-ai/dsh-tool-present'))
const manager=await import(req.resolve('@deepseek-ai/dsh-plugin-manager/tools'))
const {apply}=await import(pathToFileURL(resolve(process.env.MOST_ROOT||new URL('..',import.meta.url).pathname,'src/index.js')))
const ctx=new Context(),events=[],calls=[]
ctx.provide('systemPrompt',{tools(){},section(){}})
const registry=new ToolRuntime(ctx)
const agent={id:'fixture-root',session:{header:{cwd:'/fixture'},append:(...a)=>events.push(a)}}
ctx.provide('sessionProjections',{stateOf:()=>({openTurnStartSeq:1,lastTurn:3})})
ctx.provide('fs',{lstat:async()=>({type:'file'}),resolve:async p=>p,stat:async()=>({type:'file'})})
let mode='danger-full-access'
ctx.provide('sandboxPolicy',{resolve:()=>({mode})})
ctx.provide('pluginManager',{listPlugins:async()=>{calls.push('list');return [{id:'fixture-plugin'}]}})
if(process.env.OMIT_TOOL !== 'present') present.apply(ctx,{maxFiles:8})
if(process.env.OMIT_TOOL !== 'plugin_manager') manager.apply(ctx)
console.log('registration input',process.env.OMIT_TOOL||'complete',registry.wireSchemas(agent).schemas.map(t=>t.name))
registry.register(defineTool({name:'pamyat_po_smyslu',description:'Fixture memory service',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=> 'unused'}))
let base
const future=defineTool({name:'future_tool',description:'Future fixture',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=> 'future-ok'})
const handlers=[],services={tools:registry,agents:{get:id=>id===agent.id?agent:undefined,roots:()=>[agent],currentInitiator:()=>agent},goals:{},jobs:{},typertGateway:{}}
const bridgeCtx={get:n=>services[n],on:(ev,fn)=>{handlers.push([ev,fn]);return()=>{}},provide:(n,s)=>{services[n]=s},logger:{warn(){},info(){},error(){}}}
apply(bridgeCtx,{...(limitsAgent?{limitsAgent}:{}),port:0})
async function descriptor(){for(let i=0;i<50;i++){const d=services.mcpBridge?.descriptor(agent.id);if(d)return d;await new Promise(r=>setTimeout(r,20))}throw Error('bridge not listening')}
async function invoke(tool,args={}){const d=await descriptor();const r=await fetch(d.url,{method:'POST',headers:{'Content-Type':'application/json','x-bridge-ticket':d.ticket},body:JSON.stringify({tool,args})});return r.json()}
let failures=0,total=0
async function check(name,fn){total++;try{await fn();console.log('OK',name)}catch(e){failures++;console.error('FAIL',name,e.message)}}
try{
 await check('live schemas include present and plugin_manager (14 + 2)',async()=>{const d=await descriptor();for(const name of ['present','plugin_manager']){const t=d.tools.find(t=>t.name===name);assert.ok(t,name);assert.deepEqual(t.inputSchema,registry.get(name,agent).parameters)}assert.equal(d.tools.length,16);console.log('tools',d.tools.length)})
 await check('present reaches actual plugin and durable presented event',async()=>{const r=await invoke('present',{files:[{path:'report.md'}]});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(events.filter(e=>e[0]==='deliverables/presented').length,1);assert.equal(events[0][1].files[0].path,'report.md')})
 await check('plugin manager list runs actual plugin',async()=>{const r=await invoke('plugin_manager',{action:'list_plugins'});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(calls.length,1);assert.match(JSON.stringify(r),/fixture-plugin/)})
 await check('plugin manager keeps native denial',async()=>{mode='workspace-write';const r=await invoke('plugin_manager',{action:'list_plugins'});assert.equal(r.ok,false,JSON.stringify(r));assert.equal(calls.length,1);mode='danger-full-access'})
 await check('future registered tool works without bridge edit',async()=>{base=registry.register(future);assert.equal((await descriptor()).tools.length,17);const r=await invoke('future_tool');assert.equal(r.ok,true,JSON.stringify(r));assert.match(JSON.stringify(r),/future-ok/)})
 await check('removed registration absent and cannot execute',async()=>{base();assert.ok(!(await descriptor()).tools.some(t=>t.name==='future_tool'));assert.equal((await invoke('future_tool')).ok,false)})
}finally{for(const [ev,fn] of handlers)if(ev==='dispose')fn()}
console.log(`RESULT ${total-failures}/${total}`);process.exit(failures?1:0)
