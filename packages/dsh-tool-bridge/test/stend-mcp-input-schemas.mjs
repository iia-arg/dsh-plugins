// Collected fixture schemas must survive the gateway MCP SDK; real full-set engine probe is separate.
// No model/API/file upload is called. Exit 2 names missing test prerequisites.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const app=process.env.DSH_TEST_APP,gateway=process.env.GATEWAY_CANDIDATE,channel=process.env.TELEGRAM_TEST_PLUGIN_ROOT
for(const [name,value] of Object.entries({DSH_TEST_APP:app,GATEWAY_CANDIDATE:gateway,TELEGRAM_TEST_PLUGIN_ROOT:channel})){
  if(!value){console.error('СЛЕПОТА: '+name+' не задан');process.exit(2)}
}
const root=resolve(process.env.MOST_ROOT||new URL('..',import.meta.url).pathname)
let sdk,Context,ToolRuntime,defineTool,createScope,apply,fileTool,pdfTool
try{
 const req=createRequire(resolve(app,'package.json')),sdkReq=createRequire(resolve(gateway,'package.json'))
 const sdkPath=sdkReq.resolve('@modelcontextprotocol/sdk/types.js')
 sdk=await import(pathToFileURL(sdkPath))
 const info=JSON.parse(readFileSync(resolve(dirname(sdkPath),'../../package.json')))
 console.log('MCP_SDK',info.version,sdkPath,'SHA256',createHash('sha256').update(readFileSync(sdkPath)).digest('hex'))
 ;({Context}=await import(req.resolve('@deepseek-ai/cordis')))
 ;({ToolRuntime,defineTool}=await import(req.resolve('@deepseek-ai/dsh-tools')))
 ;({createScope}=await import(req.resolve('@deepseek-ai/dsh-scope')))
 ;({fileTool}=await import(pathToFileURL(resolve(channel,'src/outgoing-files.js'))))
 ;({pdfTool}=await import(pathToFileURL(resolve(channel,'src/pdf-tool.js'))))
}catch(e){console.error('СЛЕПОТА: окружение/импорт: '+e.message);process.exit(2)}
try{({apply}=await import(pathToFileURL(resolve(root,'src/index.js'))))}
catch(e){console.error('FAIL мост/ostrov_api: импорт проверяемого кода: '+e.message);process.exit(1)}
const deadline=setTimeout(()=>{console.error('СЛЕПОТА: срок стенда 20 с исчерпан');process.exit(2)},20000);deadline.unref()
let passed=0,failed=0
function check(name,fn){try{fn();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
async function collect(enabled){
 const ctx=new Context(),scopes=[],hooks=[],effects=[],agents=[]
 ctx.provide('systemPrompt',{tools(){},section(){}})
 const registry=new ToolRuntime(ctx)
 ctx.provide('sessionProjections',{stateOf:()=>({openTurnStartSeq:1,lastTurn:1})})
 for(const [id,sid] of [['work','telegram-123'],['guest','telegram-gost-456'],['site','telegram-site-7']]){
  const a={id,status:'running',session:{id:sid,header:{id:sid,cwd:'/fixture',createdAt:1},events:[{type:'turn/start',data:{turn:1}}]},append(){}}
  const scope=createScope(ctx,a);a.ctx=scope.ctx;scopes.push(scope);agents.push(a)
 }
 const def=name=>defineTool({name,description:'Schema fixture '+name,parameters:{},output:{schema:{type:'string'},render:()=>[]},execute:async()=>{throw Error('Schema test must not execute tools')}})
 for(const name of ['pismo_rukovoditelyu','pamyat_dlya_gostej','pamyat_po_smyslu'])registry.register(def(name))
 for(const a of agents.filter(a=>a.id!=='site')){
  const options={ctx:a.ctx,workspace:'/fixture',config:{openBot:true},receipts:{},conversations:{},telegram:{}}
  for(const tool of [fileTool(options),pdfTool(options)])a.ctx.get('tools').register(defineTool(tool))
 }
 agents[2].ctx.get('tools').restrict({allow:['pismo_rukovoditelyu']})
 const services={tools:registry,agents:{get:id=>agents.find(a=>a.id===id),roots:()=>agents,currentInitiator:()=>agents[0]},goals:{},jobs:{},typertGateway:{}}
 const bridgeCtx={get:n=>services[n],provide:(n,s)=>{services[n]=s},on:(e,f)=>{hooks.push([e,f]);return()=>{}},effect:f=>effects.push(f()),logger:{warn(){},info(){},error(){}}}
 try{
  apply(bridgeCtx,{port:0,ostrovApi:enabled?{enabled,baseUrl:'http://127.0.0.1:9',keyFile:'/nonexistent/stend-ostrov.key',botId:'8868419301'}:{enabled}})/* аудит №9/№10 (3.1.1): без полей ostrov_api не ставится */
  agents[1].ctx.get('tools').restrict({allow:['pismo_rukovoditelyu','pamyat_dlya_gostej',...(enabled?['ostrov_api']:[])]})
  const result={}
  for(const a of agents){
   let d
   for(let n=0;n<100;n++){d=services.mcpBridge?.descriptor(a.id);if(d)break;await new Promise(r=>setTimeout(r,10))}
   assert(d,'bridge descriptor not ready: '+a.id)
   result[a.id]=JSON.parse(JSON.stringify({tools:d.tools}))
  }
  return result
 }finally{
  for(const [e,f] of hooks)if(e==='dispose')f()
  for(const f of effects.reverse())if(typeof f==='function')f()
  for(const s of scopes)await s.ctx.fiber.dispose()
  await ctx.fiber.dispose()
 }
}
function sdkValid(list){
 const result=sdk.ListToolsResultSchema.safeParse(list)
 if(!result.success)throw Error(result.error.issues.map(e=>`${list.tools[e.path[1]]?.name||'?'}: ${e.path.join('.')} ${e.message}`).join('; '))
}
function modelValid(list){
 for(const t of list.tools){
  assert.equal(t.inputSchema.type,'object',t.name+': inputSchema.type must be object')
  if(t.name==='ostrov_api')for(const key of ['oneOf','anyOf','allOf'])assert(!Object.hasOwn(t.inputSchema,key),t.name+': owned API schema stays flat')
 }
}
try{
 for(const enabled of [false,true]){
  const lists=await collect(enabled)
  for(const [scope,list] of Object.entries(lists)){
   const label=(enabled?'enabled':'disabled')+' '+scope
   console.log('LIST',label,list.tools.length,list.tools.map(t=>t.name).join(','))
   check(label+' complete ListToolsResultSchema',()=>sdkValid(list))
   check(label+' all inputSchema object; owned ostrov_api flat',()=>modelValid(list))
  }
  if(enabled)for(const scope of ['work','guest'])check(scope+' single missing type rejects ENTIRE list; restore full list',()=>{
   const original=lists[scope],before=sdk.ListToolsResultSchema.safeParse(original)
   assert(before.success);const count=original.tools.length
   const damaged=JSON.parse(JSON.stringify(original)),index=damaged.tools.findIndex(t=>t.name==='ostrov_api')
   assert(index>=0);const saved=JSON.stringify(damaged.tools[index].inputSchema)
   assert.equal(damaged.tools[index].inputSchema.type,'object');delete damaged.tools[index].inputSchema.type
   const changed=damaged.tools.map((t,i)=>JSON.stringify(t.inputSchema)!==JSON.stringify(original.tools[i].inputSchema)?i:-1).filter(i=>i>=0)
   assert.deepEqual(changed,[index],'fault must change exactly ONE schema')
   const beforeSha=createHash('sha256').update(saved).digest('hex'),afterSha=createHash('sha256').update(JSON.stringify(damaged.tools[index].inputSchema)).digest('hex')
   assert.notEqual(beforeSha,afterSha)
   console.log('SINGLE_SCHEMA_FAULT',scope,'ostrov_api replacements=1 type-count:1->0 SHA256',beforeSha,'->',afterSha)
   const failed=sdk.ListToolsResultSchema.safeParse(damaged)
   assert.equal(failed.success,false,'SDK must reject the WHOLE list, not skip one tool')
   assert(!Object.hasOwn(failed,'data'),'SDK must not expose a partial accepted list')
   assert(failed.error.issues.every(issue=>issue.path[0]==='tools'&&issue.path[1]===index),'only ostrov_api must cause the list rejection')
   const rest=sdk.ListToolsResultSchema.safeParse({tools:damaged.tools.filter((_,i)=>i!==index)})
   assert(rest.success);assert.equal(rest.data.tools.length,count-1)
   damaged.tools[index].inputSchema=JSON.parse(saved);assert.equal(JSON.stringify(damaged),JSON.stringify(original))
   const restored=sdk.ListToolsResultSchema.safeParse(damaged);assert(restored.success);assert.equal(restored.data.tools.length,count)
   console.log('WHOLE_LIST_REJECTED',scope,`healthy=${before.data.tools.length}/${count} fault=${failed.data?.tools.length??0}/${count} other_schemas=${rest.data.tools.length}/${count-1} restored=${restored.data.tools.length}/${count}`)
  })
  check((enabled?'enabled':'disabled')+' catalog covers fixed/live API/file/PDF and site restriction',()=>{
   const names=scope=>lists[scope].tools.map(t=>t.name)
   assert.equal(lists.work.tools.length,enabled?19:18)
   assert.deepEqual(names('guest').sort(),['pamyat_dlya_gostej','pismo_rukovoditelyu','telegram_make_pdf','telegram_send_file',...(enabled?['ostrov_api']:[])].sort())
   assert.deepEqual(names('site'),['pismo_rukovoditelyu'])
   for(const n of ['get_goal','create_goal','update_goal','job_output','job_list','job_kill','schedule_create','schedule_list','schedule_delete','schedule_update','pamyat_otnoshenie','pamyat_ocenit','pamyat_po_smyslu','heartbeat_close'])assert(names('work').includes(n),n)
  })
 }
}catch(e){console.error('FAIL collection',e.message);failed++}finally{clearTimeout(deadline)}
console.log(`RESULT ${passed}/${passed+failed}`);process.exitCode=failed?1:0
