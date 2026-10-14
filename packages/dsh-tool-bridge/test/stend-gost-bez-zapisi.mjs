// RU: B-N-1669 (граница Вениамина 15:38Z): гостевые беседы (telegram-site-*, telegram-gost-*) — без инструментов записи и bash.
//     Часть A — статическая: src/scoped-sessions.json (MOST_ROOT — порча) — оба гостевых префикса есть; allowedToolNames — ЗАКРЫТЫЙ
//     перечень ODOBRENO (каждое имя — поимённое решение; zapomnit_dannye_gostya — Бета, мост 1.3.31); ни одно имя не попадает в
//     запретный класс ZAPRET (bash/оболочка, файлы, задачи, расписание, цели, публикации, OMEGA и pamyat_* кроме pamyat_dlya_gostej).
//     Часть B — живая: настоящий мост на платформе DSH_TEST_APP; ограничение канала у гостя ОШИБОЧНО разрешает всё (bash, write, omega_store…)
//     — мост обязан выдать только allowedToolNames, вызов bash — отказ без исполнения. Не проверяет: сам канал (site-policy) и шлюз.
// EN: B-N-1669 harness: guest sessions get no write/bash tools — closed approved list in scoped-sessions.json, enforced by the bridge.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const root=resolve(process.env.MOST_ROOT||new URL('..',import.meta.url).pathname)
const TG_DOP=new Set(['telegram_send_file','telegram_make_pdf','ostrov_api'])
const ODOBRENO=new Set(['pismo_rukovoditelyu','pamyat_dlya_gostej','zapomnit_dannye_gostya',...TG_DOP])
const ZAPRET=/(^|_)(bash|shell|sh|exec|command|terminal|write|edit|patch|apply|delete|remove|rm|mv|move|file|fs|job|schedule|goal|plugin|subagent|present|publish|send_file|omega|store)(_|$)|^pamyat_(?!dlya_gostej$)/
const GOST=['telegram-site-','telegram-gost-']
const json=JSON.parse(readFileSync(resolve(root,'src/scoped-sessions.json'),'utf8'))
const guestAllowed=[...json.allowedToolNames,...(json.telegramGuestToolNames??[])]
let passed=0,failed=0
async function check(name,fn){try{await fn();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
console.log('SUBJECT',resolve(root,'src/scoped-sessions.json'),'allowed',JSON.stringify(json.allowedToolNames))
await check('A1 гостевые префиксы на месте',()=>{for(const p of GOST)assert(json.sessionIdPrefixes.includes(p),'нет префикса '+p)})
await check('A2 оба гостевых перечня — только поимённо одобренные',()=>{const lishnie=guestAllowed.filter(n=>!ODOBRENO.has(n));assert.deepEqual(lishnie,[],'не одобрено: '+lishnie.join(','))})
await check('A3 нет произвольной записи/bash; только поимённые TG file/PDF исключения',()=>{const plohie=guestAllowed.filter(n=>ZAPRET.test(n)&&!TG_DOP.has(n));assert.deepEqual(plohie,[],'запретный класс: '+plohie.join(','))})
await check('A4 Site API разрешён; PDF/send только Telegram-гостю',()=>{assert(json.allowedToolNames.includes('ostrov_api'));for(const n of ['telegram_make_pdf','telegram_send_file'])assert(!json.allowedToolNames.includes(n));assert.deepEqual(json.telegramGuestToolNames,[...TG_DOP])})
await check('A0 прибор зрячий: запретный класс ловит bash/write_file/omega_store/pamyat_ocenit и пропускает одобренные',()=>{
  for(const n of ['bash','write_file','edit','apply_patch','omega_store','pamyat_ocenit','job_list','schedule_create','telegram_send_file','create_goal'])assert(ZAPRET.test(n),n)
  for(const n of ODOBRENO)if(!TG_DOP.has(n))assert(!ZAPRET.test(n),n)})
const app=process.env.DSH_TEST_APP
if(!app){console.error('СЛЕПОТА: DSH_TEST_APP не задан — часть B не измерена');console.log(`RESULT ${passed}/${passed+failed} (B не измерена)`);process.exit(failed?1:2)}
const req=createRequire(resolve(app,'package.json'))
const {Context}=await import(req.resolve('@deepseek-ai/cordis'))
const {ToolRuntime,defineTool}=await import(req.resolve('@deepseek-ai/dsh-tools'))
const {createScope}=await import(req.resolve('@deepseek-ai/dsh-scope'))
const {apply}=await import(pathToFileURL(resolve(root,'src/index.js')))
const ctx=new Context(),calls=[],scopes=[],hooks=[],effects=[]
ctx.provide('systemPrompt',{tools(){},section(){}})
const registry=new ToolRuntime(ctx)
ctx.provide('sessionProjections',{stateOf:()=>({openTurnStartSeq:1,lastTurn:1})})
const agent=(id,sid)=>{const a={id,status:'running',session:{id:sid,header:{cwd:'/fixture'},events:[{type:'turn/start',data:{turn:1}}],append(){}}};const s=createScope(ctx,a);a.ctx=s.ctx;scopes.push(s);return a}
const def=name=>defineTool({name,description:'isolated '+name,parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>{calls.push(name);return 'fixture-'+name}})
const VSE=['bash','write_file','edit','omega_store','pamyat_ocenit','job_list','telegram_send_file','telegram_make_pdf','pismo_rukovoditelyu','pamyat_dlya_gostej','zapomnit_dannye_gostya','ostrov_api']
for(const n of VSE)registry.register(def(n))
const site=agent('site-root','telegram-site-7'),gost=agent('gost-root','telegram-gost-77')
for(const a of [site,gost])a.ctx.get('tools').restrict({allow:VSE})   // ошибка канала: разрешено всё
let initiator=site
const services={tools:registry,agents:{get:id=>[site,gost].find(a=>a.id===id),roots:()=>[site,gost],currentInitiator:()=>initiator},goals:{get:()=>null},jobs:{list:()=>[],read:()=>({}),kill:()=>({})},typertGateway:{}}
const bridgeCtx={get:n=>services[n],provide:(n,s)=>{services[n]=s},on:(ev,fn)=>{hooks.push([ev,fn]);return()=>{}},effect:fn=>{effects.push(fn())},logger:{warn(){},info(){},error(){}}}
apply(bridgeCtx,{port:0})
async function descriptor(a){initiator=a;for(let i=0;i<50;i++){const d=services.mcpBridge?.descriptor(a.id);if(d)return d;await new Promise(r=>setTimeout(r,20))}throw Error('мост не слушает')}
async function invoke(d,tool){const r=await fetch(d.url,{method:'POST',headers:{'content-type':'application/json','x-bridge-ticket':d.ticket},body:JSON.stringify({tool,args:{}}),signal:AbortSignal.timeout(3000)});return {status:r.status,...await r.json().catch(()=>({}))}}
try{
  for(const a of [site,gost]){
    await check('B1 '+a.session.id+': выдано только из своего перечня, нет записи/bash',async()=>{const t=(await descriptor(a)).tools.map(x=>x.name),allowed=a===gost?guestAllowed:json.allowedToolNames;
      assert.deepEqual(t.filter(n=>!allowed.includes(n)),[],'выдано сверх списка');const forbidden=t.filter(n=>ZAPRET.test(n)&&!(a===gost&&TG_DOP.has(n)));assert.deepEqual(forbidden,[],'выдан запретный класс: '+forbidden.join(','));for(const n of TG_DOP)assert.equal(t.includes(n),n==='ostrov_api'||a===gost)})
    await check('B2 '+a.session.id+': вызов bash — отказ без исполнения',async()=>{const n=calls.length;const r=await invoke(await descriptor(a),'bash');assert.equal(r.ok===true,false,JSON.stringify(r));assert.deepEqual(calls.slice(n),[])})
  }
}finally{for(const dispose of effects)dispose?.();for(const [ev,fn] of hooks)if(ev==='dispose')fn();for(const s of scopes)await s.dispose();await ctx.fiber.dispose()}
console.log(`RESULT ${passed}/${passed+failed}`);process.exitCode=failed?1:0
