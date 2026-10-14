// RU: Проверка stend-ostrov-bez-polya (находка Авроры к №6 A-N-1948): ostrovApi.enabled без baseUrl/keyFile/botId не роняет мост —
// RU: ostrov_api не ставится, в журнале «[dsh-tool-bridge] ostrovApi НЕ установлен: <поле> обязателен», прочие инструменты живут;
// RU: исправный конфиг — ostrov_api есть. Каждый сценарий — отдельный процесс (свой мост). Код 2 — нет DSH_TEST_APP, не успех.
// EN: stend-ostrov-bez-polya: a missing ostrovApi field skips only the ostrov tool with a loud log line; a valid config installs it.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
const app=process.env.DSH_TEST_APP
if(!app){console.error('СЛЕПОТА: DSH_TEST_APP не задан');process.exit(2)}
const POLNYJ={enabled:true,baseUrl:'http://127.0.0.1:9',keyFile:'/nonexistent/ostrov-key',botId:'bot-fixture'}
const SCEN={'pusto-baseUrl':{...POLNYJ,baseUrl:''},'pusto-keyFile':{...POLNYJ,keyFile:''},'pusto-botId':{...POLNYJ,botId:''},ispravnyj:POLNYJ,vyklyuchen:{...POLNYJ,enabled:false}}
if(process.env.OSTROV_SCEN){
  const lines=[];const err=console.error;console.error=(...a)=>{lines.push(a.join(' '));err(...a)}
  const req=createRequire(resolve(app,'package.json'))
  const {Context}=await import(req.resolve('@deepseek-ai/cordis'))
  const {ToolRuntime}=await import(req.resolve('@deepseek-ai/dsh-tools'))
  const {apply}=await import(pathToFileURL(resolve(process.env.MOST_ROOT||new URL('..',import.meta.url).pathname,'src/index.js')))
  const ctx=new Context();ctx.provide('systemPrompt',{tools(){},section(){}})
  const registry=new ToolRuntime(ctx)
  const agent={id:'fixture-root',session:{header:{cwd:'/fixture'},append(){}}}
  const handlers=[],services={tools:registry,agents:{get:id=>id===agent.id?agent:undefined,roots:()=>[agent],currentInitiator:()=>agent},goals:{},jobs:{},typertGateway:{}}
  const bridgeCtx={get:n=>services[n],on:(ev,fn)=>{handlers.push([ev,fn]);return()=>{}},provide:(n,s)=>{services[n]=s},effect:()=>{},logger:{warn(){},info(){},error(){}}}
  let threw=null
  try{apply(bridgeCtx,{port:0,ostrovApi:SCEN[process.env.OSTROV_SCEN]})}catch(e){threw=String(e?.message??e)}
  let d=null;for(let i=0;i<50&&!threw;i++){d=services.mcpBridge?.descriptor(agent.id);if(d)break;await new Promise(r=>setTimeout(r,20))}
  const imena=registry.wireSchemas(agent).schemas.map(t=>t.name)
  for(const [ev,fn] of handlers)if(ev==='dispose')try{fn()}catch{}
  process.stdout.write('ISHOD '+JSON.stringify({threw,most:!!d,instr:d?.tools?.length??0,ostrov:imena.includes('ostrov_api'),stroka:lines.find(l=>l.startsWith('[dsh-tool-bridge] ostrovApi НЕ установлен:'))||null})+'\n')
  process.exit(0)
}
let failures=0,total=0
const ishod=s=>{const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,OSTROV_SCEN:s},encoding:'utf8',timeout:60000})
  const m=/^ISHOD (.+)$/m.exec(r.stdout||'');return m?JSON.parse(m[1]):{threw:'процесс сценария упал: код '+r.status+' '+(r.stderr||'').slice(-200)}}
function check(name,fn){total++;try{fn();console.log('OK',name)}catch(e){failures++;console.error('FAIL',name,e.message)}}
for(const pole of ['baseUrl','keyFile','botId'])check(`${pole} пустым: мост жив, прочие инструменты есть, ostrov_api нет, строка в журнале`,()=>{const r=ishod('pusto-'+pole)
  assert.equal(r.threw,null,'apply бросил: '+r.threw);assert.ok(r.most&&r.instr>0,'мост не поднялся');assert.equal(r.ostrov,false,'ostrov_api поставлен')
  assert.ok(r.stroka&&r.stroka.includes(`${pole} обязателен`),'нет строки «ostrovApi НЕ установлен: '+pole+' обязателен»: '+r.stroka)})
check('исправный конфиг: ostrov_api есть, строки нет',()=>{const r=ishod('ispravnyj');assert.equal(r.threw,null,'apply бросил: '+r.threw);assert.ok(r.most,'мост не поднялся');assert.equal(r.ostrov,true,'ostrov_api не поставлен');assert.equal(r.stroka,null,'лишняя строка: '+r.stroka)})
check('enabled=false: ostrov_api нет, строки нет',()=>{const r=ishod('vyklyuchen');assert.equal(r.threw,null);assert.ok(r.most);assert.equal(r.ostrov,false);assert.equal(r.stroka,null)})
console.log(`RESULT ${total-failures}/${total}`);process.exit(failures?1:0)
