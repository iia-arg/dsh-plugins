// RU: Проверка stend-pressure-text: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-pressure-text verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import vm from 'node:vm'
const root=resolve(process.argv[2]||new URL('..',import.meta.url).pathname)
const g=readFileSync(join(root,'gateway.mjs'),'utf8')
const textBlock=g.slice(g.indexOf('const tekstSignala ='),g.indexOf('// 🔴 pressure-source-boundary',g.indexOf('const tekstSignala =')))
const tekstSignala=vm.runInNewContext(textBlock+'; tekstSignala')
const M=await import(pathToFileURL(join(root,'codex-app-server.mjs')))
const expected='⏸ стоп по давлению шлюза — это НЕ конец задачи; после сжатия продолжу с <точки>'
function signal(t){assert.ok(t.includes(expected),'mandatory first answer line absent');assert.match(t,/файл состояния/);assert.match(t,/помощник|подагент/);assert.match(t,/заново/);assert.match(t,/645272/)}
const temp=mkdtempSync(join(tmpdir(),'B1354-'));let total=0,ok=0
async function check(n,f){total++;try{await f();ok++;console.log('OK',n)}catch(e){console.log('FAIL',n,e.message)}}
try{
 await check('signal content',()=>signal(tekstSignala(650000,{porog:645272})))
 await check('Codex steer actual subprocess receives signal',async()=>{
  const trace=join(temp,'trace');const stub=join(root,'test/zaglushka-app-server.mjs')
  const events=[]
  for await(const e of M.progonAppServer({bin:'/nonexistent',klientImpl:o=>M.sozdatKlienta({...o,bin:process.execPath,args:[stub]}),env:{...process.env,STUB_SCENARIJ:'rastet',STUB_ZHURNAL:trace,STUB_ZANYATO:'640000,650000,660000',STUB_SHAG_MS:'30'},log:()=>{},zapros:'fixture',cwd:temp,porog:{porog:645272},tekstSignala:z=>tekstSignala(z,{porog:645272})}))events.push(e)
  const lines=readFileSync(trace,'utf8').split('\n').filter(x=>x.startsWith('<- turn/steer '));assert.equal(lines.length,1);signal(JSON.parse(lines[0].slice('<- turn/steer '.length)).input[0].text)
  assert.ok(events.some(x=>x.type==='itog-app-server'&&x.ostanovlenShlyuzom))
 })
 await check('Claude actual PostToolBatch closure below/above/one-shot',async()=>{
  const cut=(nach,kon)=>{const a=g.indexOf(nach);assert.ok(a>=0,'нет в gateway.mjs: '+nach);const b=g.indexOf(kon,a);assert.ok(b>a,'нет конца: '+nach);return g.slice(a,b+kon.length)}
  const r2=g.includes('const signalDavleniya = async () => {')
  const c={pressureHoda:{porog:645272},tekstSignala,signalDan:false,p:{porog:645272},zanjatoPoslednee:1,log:()=>{},
    explicitMailStop:false,prervanPoStop:false,ocheredB:[],hodId:'hod-proba',DAVLENIE:new Set(['signal']),stopPrishyol:false,bZakryt:false,inputQueue:new (await import(pathToFileURL(join(root,'inbox-input.mjs')))).TurnInboxQueue()}
  vm.createContext(c)
  if(r2){vm.runInContext(cut('const signalDavleniya = async () => {','\n    };').replace('const signalDavleniya','globalThis.signalDavleniya'),c)
    vm.runInContext(cut('const vzyatB = (limit=ocheredB.length) => {','\n    };').replace('const vzyatB','globalThis.vzyatB'),c)}
  vm.runInContext(cut('const composeInputHook = async hook => {','\n    };').replace('const composeInputHook','globalThis.composeInputHook'),c)
  const hook=()=>c.composeInputHook('PostToolBatch')
  assert.equal(Object.keys(await hook()).length,0);c.zanjatoPoslednee=650000
  const r=await hook();assert.equal(r.hookSpecificOutput.hookEventName,'PostToolBatch');signal(r.hookSpecificOutput.additionalContext);assert.equal(Object.keys(await hook()).length,0)
  if(r2){

   c.signalDan=false;c.prervanPoStop=true;c.ocheredB=['[task-control/1 cancel · B]'];assert.equal(Object.keys(await hook()).length,0);assert.equal(c.signalDan,false,'сигнал потрачен после /stop')

   c.prervanPoStop=false;const r2b=(await hook()).hookSpecificOutput?.additionalContext??'';const iB=r2b.indexOf('[task-control/1 cancel'),iS=r2b.indexOf('[сигнал шлюза]')
   assert.ok(iB>=0&&iS>iB,'B и сигнал не одной добавкой или B не первым');signal(r2b);assert.equal(c.ocheredB.length,0)
  }
 })
 await check('continuation disk first and helpers restart',()=>{const t=M.tekstProdolzheniya({zanyato:650000,porog:645272});assert.match(t,/сперва перечитай файл состояния с диска/i);assert.match(t,/помощники/);assert.match(t,/подними их заново/);assert.match(t,/Не начинай заново/);assert.match(t,/650000/)})
}finally{rmSync(temp,{recursive:true,force:true})}
console.log(`RESULT ${ok}/${total}`);process.exit(ok===total?0:1)
