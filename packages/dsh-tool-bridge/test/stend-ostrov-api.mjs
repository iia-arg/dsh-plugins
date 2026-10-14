import {initializeRequestState} from '../src/ostrov-request-state.mjs'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtempSync,rmSync,existsSync,writeFileSync,renameSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createInterface} from 'node:readline'
import {pathToFileURL} from 'node:url'
const root=resolve(process.env.MOST_ROOT||new URL('..',import.meta.url).pathname)
const app=process.env.DSH_TEST_APP
if(!app){console.error('СЛЕПОТА: DSH_TEST_APP не задан');process.exit(2)}
const req=createRequire(join(app,'package.json'))
const {Context}=await import(req.resolve('@deepseek-ai/cordis'))
const {ToolRuntime}=await import(req.resolve('@deepseek-ai/dsh-tools'))
const {createScope}=await import(req.resolve('@deepseek-ai/dsh-scope'))
const channelRoot=process.env.TELEGRAM_TEST_PLUGIN_ROOT?resolve(process.env.TELEGRAM_TEST_PLUGIN_ROOT)+'/src/':'/opt/agent-plugins/dsh-telegram-multiagent/src/'
const {MessageReceipts}=await import(channelRoot+'message-receipts.js')
const {ConversationSessions}=await import(channelRoot+'conversation-sessions.js')
const {CodexTaskControl}=await import(channelRoot+'codex-task-control.js')
const {installSitePolicy}=await import(process.env.SITE_POLICY_PATH?pathToFileURL(resolve(process.env.SITE_POLICY_PATH)):channelRoot+'site-policy.js')
// Нет копии API Марка — честная слепота, как в stend-saved-plans (находка Искры 07.10): иначе api-fixture падает
// «No module named 'server'», и стенд выходит кодом 13 (неразрешённое ожидание), что обходчик читает как неожиданное.
const markApp=resolve(process.env.MARK_TEST_APP||resolve(root,'../source/app'))
if(!existsSync(join(markApp,'server.py'))){console.error(`СЛЕПОТА: MARK_TEST_APP не указывает копию API Марка с server.py (${markApp})`);process.exit(2)}
const {sverkaKopii}=await import(pathToFileURL(join(root,'test/ostrov-api-kopiya.mjs')))
await sverkaKopii(markApp)
const backend=spawn('python3',['-B',join(root,'test/api-fixture.py'),markApp],{stdio:['ignore','pipe','inherit']})
const ended=once(backend,'exit').catch(()=>null)
let config,work,ledger,ctx,passed=0,failed=0
const scopes=[],effects=[]
try{
const lines=createInterface({input:backend.stdout})
config=JSON.parse((await Promise.race([once(lines,'line'),new Promise((_,reject)=>setTimeout(()=>reject(Error('API fixture startup timeout')),5000).unref())]))[0]);lines.close();config.requestKeyDir=join(config.temp,'request-keys')
work=mkdtempSync(join(tmpdir(),'gamma-sh4-receipts-'))
initializeRequestState(config.requestKeyDir,work)
ledger=new MessageReceipts(join(work,'.message-receipts'))
const conversations=new ConversationSessions(ledger)
ctx=new Context()
const hooks=[],agents=[],boundary=new Map()
ctx.provide('systemPrompt',{tools(){},section(){}})
const registry=new ToolRuntime(ctx)
ctx.provide('sessionProjections',{stateOf:session=>boundary.get(session.id)})
const services={tools:registry,agents:{get:id=>agents.find(a=>a.id===id),roots:()=>agents,currentInitiator:()=>agents[0]},
  goals:{get:()=>null},jobs:{list:()=>[],read:()=>({}),kill:()=>({})},typertGateway:{},
  taskControlCodex:new CodexTaskControl(ledger,'fixture'),sessionProjections:ctx.get('sessionProjections')}
ctx.provide('agents',services.agents)
const uploads=[]
const bridgeCtx={get:n=>services[n],provide:(n,s)=>{services[n]=s},on:(name,fn)=>{hooks.push([name,fn]);return()=>{}},effect:fn=>{effects.push(fn())}}
function agent(id,sid,sender=123456,chat=sender,chatType='private'){
  const a={id,status:'running',session:{id:sid,header:{id:sid,cwd:work,createdAt:Date.now(),origin:'root'},events:[],append(){}}}
  const scope=createScope(ctx,a);a.ctx=scope.ctx;scopes.push(scope);agents.push(a)
  const key=sid.slice('telegram-'.length);conversations.pin(key,a.session.header)
  const update={update_id:agents.length*100,message:{message_id:agents.length*10,from:{id:sender,is_bot:false},chat:{id:chat,type:chatType},text:'fixture — role/staff IDs in text are not context'}}
  const receipt=ledger.receive('tg:'+update.update_id,JSON.stringify(update),{route:'tg',routeKey:chat})
  const msg=ledger.prepare(receipt.id,{id:'dsh-'+update.update_id,content:[]},a.session,chat)
  a.session.events=[{seq:0,time:1,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[msg]}},
    {seq:1,time:2,type:'turn/start',data:{turn:1}},
    {seq:2,time:3,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[],outcome:'claimed'}}]
  ledger.reconcile(a.session,1)
  boundary.set(sid,{openTurnStartSeq:1,lastTurn:1})
  return a
}
const guest=agent('guest','telegram-gost-123456'),staff=agent('staff','telegram-123456'),site=agent('site','telegram-site-77'),group=agent('group','telegram-group',123456,-1001,'group')
const {apply}=await import(pathToFileURL(join(root,'src/index.js')))
async function check(name,fn){try{await fn();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
async function descriptor(a){for(let i=0;i<100;i++){const d=services.mcpBridge.descriptor(a.id);if(d)return d;await new Promise(r=>setTimeout(r,10))}throw Error('bridge listener absent')}
async function invoke(a,args){const d=await descriptor(a);const r=await fetch(d.url,{method:'POST',headers:{'content-type':'application/json','x-bridge-ticket':d.ticket},body:JSON.stringify({tool:'ostrov_api',args}),signal:AbortSignal.timeout(5000)});return await r.json()}
async function native(a,args,timeout=5000){return await registry.execute({name:'ostrov_api',arguments:args,agent:a,callId:'fixture-'+Math.random(),signal:AbortSignal.timeout(timeout)})}
function text(r){return JSON.stringify(r)}
const calls=async()=> (await(await fetch(config.baseUrl+'/fixture/calls')).json()).calls
  apply(bridgeCtx,{port:0,ostrovApi:{enabled:true,...config,botId:'8868419301'}})
  if(process.env.TELEGRAM_TEST_PLUGIN_ROOT){
    const {installFileTools}=await import(channelRoot+'outgoing-files.js')
    installFileTools(ctx,{workspace:work,receipts:ledger,conversations,config:{openBot:true,allowedUsers:[123456],pdfTemplatesDir:join(channelRoot,'../test/fixtures/letterheads')},appDir:app,
      telegram:{async sendFile(chat,file){uploads.push({chat,file});return{message_id:71}}}})
  }
  await check('registration: descriptor guest/work/site and native include API',async()=>{
    for(const a of [guest,staff,site])assert((await descriptor(a)).tools.some(t=>t.name==='ostrov_api'))
    assert(registry.wireSchemas(guest).schemas.some(t=>t.name==='ostrov_api'))
    assert(registry.wireSchemas(site).schemas.some(t=>t.name==='ostrov_api'))
  })
  await check('model schema: CRM operations, operation/params, no model route or transport IDs',async()=>{
    const s=(await descriptor(guest)).tools.find(t=>t.name==='ostrov_api').inputSchema
    assert.equal(s.type,'object')
    for(const key of ['oneOf','anyOf','allOf'])assert(!Object.hasOwn(s,key),key)
    assert.deepEqual(s.properties.operation.enum.slice().sort(),['catalog','client.assign','client.create','client.list','client.read','client.save','identity','objects','plan.connections','plan.create','plan.edit','plan.link','plan.list','plan.read','quote','staff.list','staff.read'])
    assert.deepEqual(Object.keys(s.properties).sort(),['operation','params']);assert.deepEqual(s.required,['operation']);assert.equal(s.additionalProperties,false)
  })
  for(const operation of ['identity','catalog','objects'])await check('HTTP guest read '+operation,async()=>{
    const r=await invoke(guest,{operation,params:{}});assert.equal(r.ok,true,text(r));assert(!text(r.value).includes('isError":true'))
    if(operation==='identity')assert(text(r.value).includes('guest'))
  })
  await check('HTTP guest quote resident with Unicode',async()=>{
    const r=await invoke(guest,{operation:'quote',params:{kind:'resident',plan:{name:'Гость 😀',arrival:'2027-06-01',departure:'2027-06-03',adults:2,children:[],housing:[{resource:'resident',occupancy:2}],bathVisits:0}}})
    assert.equal(r.ok,true,text(r));assert(text(r.value).includes('total'))
  })
  await check('HTTP guest quote group and biggroup',async()=>{
    const plans={group:{policyVersion:3,week:'2027-05-01',adults:8,teens:0,extraTeam:0,group:8,foodDays:7,organizer:'Тест',title:'Малая группа',housing:[{resource:'dome-house',occupancy:2,quantity:5}],activities:[]},
      biggroup:{policyVersion:3,week:'2027-05-01',adults:50,teens:0,extraTeam:0,organizer:'Тест',title:'Большая группа'}}
    for(const [kind,plan] of Object.entries(plans)){const r=await invoke(guest,{operation:'quote',params:{kind,plan}});assert.equal(r.ok,true,text(r));assert(text(r.value).includes('total'))}
  })
  await check('native guest and work routes from current receipt',async()=>{
    const g=await native(guest,{operation:'identity',params:{}}),s=await native(staff,{operation:'identity',params:{}})
    assert(!g.isError,text(g));assert(!s.isError,text(s));assert(text(g).includes('guest'));assert(text(s).includes('leader'))
    const all=await calls();assert(all.some(x=>!Object.hasOwn(x,'context')))
    assert(all.some(x=>x.context?.route==='staff-private'&&x.context.senderId==='123456'))
    assert(all.some(x=>!Object.hasOwn(x,'context')),'guest public request should omit context');for(const x of all.filter(x=>x.context&&!x.operation.startsWith('plan.'))){assert.equal(x.context.botId,'8868419301');assert.equal(x.context.chatId,'123456');assert.equal(x.context.updateId,'200');assert.equal(x.context.messageId,'20')}
  })
  await check('native/MCP saved plans: create/read/edit/replay and D.quote/url',async()=>{
    const catalog=await native(guest,{operation:'catalog'});assert(!catalog.isError,text(catalog))
    const version=catalog.value.result.version
    const input={operation:'plan.create',params:{kind:'resident',catalogVersion:version,plan:{name:'Родной расчёт',arrival:'2027-06-01',departure:'2027-06-03',adults:2,children:[],housing:[{resource:'resident',occupancy:2}],bathVisits:0}}}
    const first=await native(guest,input);assert(!first.isError,text(first));const d=first.value.result
    assert(d.url&&d.quote&&d.id&&d.documentVersion)
    const again=await invoke(guest,input);assert.equal(again.ok,true,text(again));assert.equal(again.value.value.result.id,d.id)
    const read=await invoke(guest,{operation:'plan.read',params:{kind:d.kind,id:d.id}});assert.deepEqual(read.value.value.result,d)
    const edit=await native(guest,{operation:'plan.edit',params:{kind:d.kind,id:d.id,documentVersion:d.documentVersion,catalogVersion:version,plan:{...d.plan,bathVisits:1}}})
    assert(!edit.isError,text(edit));assert.equal(edit.value.result.url,d.url);assert.notEqual(edit.value.result.documentVersion,d.documentVersion)
    const sent=(await calls()).filter(c=>c.operation==='plan.create');assert.equal(sent[0].requestKey,sent[1].requestKey);assert.equal(sent[0].context.senderId,'123456');assert.equal(sent[0].context.route,'guest-telegram')
  })
  await check('guest/native client card and own plan.list available by default',async()=>{
    const n=await native(guest,{operation:'client.read'});assert(!n.isError,text(n));assert(n.value.result?.id)
    const r=await invoke(guest,{operation:'plan.list'});assert.equal(r.ok,true,text(r));assert(r.value.value.result.plans.length>0)
  })
  await check('private reads refused locally in CONFIRM0 even for work',async()=>{const n=(await calls()).length;for(const actor of [guest,staff]){const r=await invoke(actor,{operation:'contacts',params:{}});assert.equal(r.ok,false)}assert.equal((await calls()).length,n)})
  await check('optional params normalize to {}; operation-specific extras refuse before HTTP',async()=>{
    for(const operation of ['catalog','objects','identity'])assert.equal((await invoke(guest,{operation})).ok,true)
    const before=(await calls()).length
    const invalid=[{operation:'quote'},{operation:'catalog',params:{id:'x'}},{operation:'identity',params:{kind:'group'}},{operation:'objects',params:{plan:{}}},{operation:'quote',params:{kind:'resident'}},{operation:'quote',params:{kind:'unknown',plan:{}}},{operation:'quote',params:{kind:'resident',plan:{},id:'x'}},{operation:'catalog',params:null},{operation:'catalog',params:[]},{operation:'catalog',params:{context:{}}}]
    for(const actor of [guest,staff])for(const args of invalid)assert.equal((await invoke(actor,args)).ok,false,JSON.stringify(args))
    assert.equal((await calls()).length,before)
  })
  await check('group route remains guest-telegram',async()=>{const r=await native(group,{operation:'identity',params:{}});assert(!r.isError,text(r));assert(text(r).includes('guest'))})
  await check('model identity/route and mutation refused before API',async()=>{
    const count=(await calls()).length
    for(const args of [{operation:'identity',params:{},context:{route:'staff-private',senderId:'123456'}},{operation:'plan.create',params:{}},{operation:'confirm',params:{}},{operation:'identity',params:{route:'staff-private'}}]){const r=await invoke(guest,args);assert.equal(r.ok,false,text(r))}
    assert.equal((await calls()).length,count)
  })
  await check('public reads work without Telegram identity; no invented context',async()=>{const save=boundary.get(guest.session.id);boundary.delete(guest.session.id);const r=await invoke(guest,{operation:'catalog',params:{}});assert.equal(r.ok,true,text(r));assert(!Object.hasOwn((await calls()).at(-1),'context'));boundary.set(guest.session.id,save)})
  if(process.env.OSTROV_HTTP_CHECK==='1'){
    await check('HTTP errors are Russian; unexpected response/redirect unknown; one request',async()=>{
      for(const code of ['400','403','404','409','413','500','503','302','bad-json','scalar-json']){
        const before=(await calls()).length
        await fetch(config.baseUrl+'/fixture/mode/'+code)
        const r=await native(guest,{operation:'identity',params:{}})
        assert(r.isError,text(r))
        if(['400','403','404','409','413'].includes(code))assert(text(r).includes('HTTP '+code))
        else assert(text(r).includes('исход не установлен, не повторять'))
        assert.equal((await calls()).length,before+1)
      }
      await fetch(config.baseUrl+'/fixture/mode/invalid-role')
      const invalidRole=await native(staff,{operation:'identity',params:{}})
      assert(invalidRole.isError&&text(invalidRole).includes('исход не установлен, не повторять'))
    })
    await check('canonical HTTP timeout 10s; unknown; one request; restore',async()=>{
      const before=(await calls()).length
      await fetch(config.baseUrl+'/fixture/mode/stall')
      const start=performance.now(),r=await native(guest,{operation:'identity',params:{}},20000),elapsed=performance.now()-start
      console.log('HTTP_TIMEOUT_MEASURED_MS',Math.round(elapsed),'EXPECTED_RANGE',9000,14000)
      assert(r.isError,text(r));assert(text(r).includes('исход не установлен, не повторять'))
      assert(elapsed>=9000&&elapsed<14000);assert.equal((await calls()).length,before+1)
      assert(!(await native(guest,{operation:'identity',params:{}})).isError)
    })
    await check('outer child deadline 15s covers work identity plus call; restore',async()=>{
      const count=(await calls()).length
      await fetch(config.baseUrl+'/fixture/mode/slow-two')
      const start=performance.now(),r=await native(staff,{operation:'catalog',params:{}},20000),elapsed=performance.now()-start
      console.log('OUTER_TIMEOUT_MEASURED_MS',Math.round(elapsed),'EXPECTED_RANGE',14000,19000)
      assert(r.isError&&text(r).includes('исход не установлен, не повторять'));assert(elapsed>=14000&&elapsed<19000)
      assert.equal((await calls()).length,count+2)
      assert(!(await native(staff,{operation:'catalog',params:{}})).isError)
    })
  }
  // Политика владельца 06.10 22:33 (B-N-1700): гость Telegram видит ostrov_api (карточки и расчёты), роль guest без пробы staff-private;
  // client.* — только с настоящим приватным update; B-N-1825 сайту доступны catalog/objects/quote. Снимок «гостю скрыт» (до решения владельца) снят.
  await check('channel-policy (owner 06.10 22:33): guest sees ostrov_api as role guest without staff-private probe; client.* only with a real private update; site has public catalog/objects/quote',async()=>{
    registry.register({name:'pismo_rukovoditelyu',description:'fixture',parameters:{type:'object',properties:{}},output:{schema:{},render:()=>[]},execute:async()=>({})})
    installSitePolicy(guest.ctx,guest,{closed:()=>false})
    assert(registry.wireSchemas(guest).schemas.some(t=>t.name==='ostrov_api'),'гостю ostrov_api не виден')
    assert(registry.get('ostrov_api',guest),'гостю ostrov_api не выдан')
    const n0=(await calls()).length
    for(const operation of ['identity','catalog','objects']){
      const r=await invoke(guest,{operation,params:{}});assert.equal(r.ok,true,text(r))
      const n=await native(guest,{operation,params:{}});assert(!n.isError,text(n))
    }
    const quote={operation:'quote',params:{kind:'resident',plan:{name:'Гость 😀',arrival:'2027-06-01',departure:'2027-06-03',adults:2,children:[],housing:[{resource:'resident',occupancy:2}],bathVisits:0}}}
    assert.equal((await invoke(guest,quote)).ok,true)
    assert(!(await native(guest,quote)).isError)
    const card=await invoke(guest,{operation:'client.read',params:{}});assert.equal(card.ok,true,text(card))
    assert.equal(card.value?.value?.role,'guest','роль гостя не guest: '+text(card))
    const sent=(await calls()).slice(n0)
    assert(!sent.some(c=>c?.context?.route==='staff-private'),'гостю послана проба staff-private')
    assert(sent.some(c=>c.operation==='client.read'&&c.context?.chatType==='private'&&c.context?.senderId==='123456'),'client.read гостя ушёл без приватного контекста')
    const n1=(await calls()).length,g=await invoke(group,{operation:'client.read',params:{}})
    assert.equal(g.ok,false,'client.read без приватного update принят: '+text(g));assert.match(text(g),/приватн/)
    assert.equal((await calls()).length,n1,'client.read без приватного update ушёл в API')
    installSitePolicy(site.ctx,site,{closed:()=>false})
    assert.deepEqual((await descriptor(site)).tools.map(t=>t.name).sort(),['ostrov_api','pismo_rukovoditelyu'])
    assert.deepEqual(registry.wireSchemas(site).schemas.map(t=>t.name).sort(),['ostrov_api','pismo_rukovoditelyu'])
    for(const args of [{operation:'catalog'},{operation:'objects'},quote]){
      const n=await native(site,args);assert(!n.isError,text(n));assert.equal(n.value.role,'guest')
      const m=await invoke(site,args);assert.equal(m.ok,true,text(m));assert.equal(m.value.value.role,'guest')
    }
    const count=(await calls()).length
    assert((await native(site,{operation:'identity'})).isError)
    assert.equal((await calls()).length,count,'Site identity reached HTTP')
    const wanted=process.env.TELEGRAM_TEST_PLUGIN_ROOT?['ostrov_api','pismo_rukovoditelyu','telegram_make_pdf','telegram_send_file']:['ostrov_api','pismo_rukovoditelyu']
    assert.deepEqual((await descriptor(guest)).tools.map(t=>t.name).sort(),wanted.sort())
    assert.deepEqual(registry.wireSchemas(guest).schemas.map(t=>t.name).sort(),wanted.sort())
  })
  if(process.env.TELEGRAM_TEST_PLUGIN_ROOT)await check('Beta registration + API quote -> PDF -> upload: three kinds, native and MCP',async()=>{
    const plans={group:{policyVersion:3,week:'2027-05-01',adults:8,teens:0,extraTeam:0,group:8,foodDays:7,organizer:'Тест',title:'Малая группа',housing:[{resource:'dome-house',occupancy:2,quantity:5}],activities:[]},
      biggroup:{policyVersion:3,week:'2027-05-01',adults:50,teens:0,extraTeam:0,organizer:'Тест',title:'Большая группа'},
      resident:{name:'Гость 😀',arrival:'2027-06-01',departure:'2027-06-03',adults:2,children:[],housing:[{resource:'resident',occupancy:2}],bathVisits:0}}
    const d=await descriptor(guest)
    const bridgeCall=async(name,args)=>{
      const response=await fetch(d.url,{method:'POST',headers:{'content-type':'application/json','x-bridge-ticket':d.ticket},body:JSON.stringify({tool:name,args}),signal:AbortSignal.timeout(10000)})
      const value=await response.json();assert.equal(value.ok,true,text(value));return value.value
    }
    for(const [kind,plan] of Object.entries(plans)){
      const api=await native(guest,{operation:'quote',params:{kind,plan}});assert(!api.isError,text(api))
      const quote=api.value.result
      const made=await registry.execute({name:'telegram_make_pdf',arguments:{kind,quote,guestName:'Тестовая Анна Ёжик'},agent:guest,callId:'pdf-'+kind,signal:AbortSignal.timeout(10000)})
      assert(!made.isError,text(made));assert.match(made.value.path,/^vydacha\/123456\/raschet-\d+\.pdf$/)
      const sent=await bridgeCall('telegram_send_file',{path:made.value.path,mode:'document'})
      assert.equal(sent.value.chat_id,'123456');assert.equal(uploads.at(-1).chat,'123456')
      assert(uploads.at(-1).file.data.subarray(0,5).equals(Buffer.from('%PDF-')))
      const madeHttp=await bridgeCall('telegram_make_pdf',{kind,quote,guestName:'Тест по MCP'})
      assert.match(madeHttp.value.path,/^vydacha\/123456\/raschet-\d+\.pdf$/)
    }
  })
  if(process.env.TELEGRAM_TEST_PLUGIN_ROOT)await check('API -0.0 represented as 0: native PDF accepts; no monetary recalculation',async()=>{
    const raw=await(await fetch(config.baseUrl+'/fixture/quote-negative-zero')).text()
    const original=JSON.parse(raw)
    assert(raw.includes('-0.0'),'actual API did not produce signed zero')
    assert(Object.is(original.lines.at(-1).amount,-0),'wrong field for zero probe')
    const rejected=await registry.execute({name:'telegram_make_pdf',arguments:{kind:'biggroup',quote:original,guestName:'Тест'},agent:guest,callId:'raw-zero',signal:AbortSignal.timeout(10000)})
    assert(rejected.isError,'native args unexpectedly accept signed zero')
    const args={operation:'quote',params:{kind:'biggroup',plan:{policyVersion:3,week:'2027-05-01',adults:25,teens:0,extraTeam:0,organizer:'Тест',title:'Нулевая скидка'}}}
    const body=await registry.get('ostrov_api',guest).execute(args,{agent:guest,signal:AbortSignal.timeout(5000)})
    assert.equal(Object.is(body.result.lines.at(-1).amount,-0),false,'client still returns -0')
    assert.deepEqual(body.result,JSON.parse(JSON.stringify(original)))
    const nativeApi=await native(guest,args);assert(!nativeApi.isError,text(nativeApi))
    const pdf=await registry.execute({name:'telegram_make_pdf',arguments:{kind:'biggroup',quote:nativeApi.value.result,guestName:'Тест'},agent:guest,callId:'normalized-zero',signal:AbortSignal.timeout(10000)})
    assert(!pdf.isError,text(pdf))
  })
  await check('request-state loss: native and MCP refuse before HTTP; reads survive; restore works',async()=>{
    const healthy=await native(guest,{operation:'catalog'});assert(!healthy.isError,text(healthy))
    const args={operation:'plan.create',params:{kind:'resident',catalogVersion:healthy.value.result.version,plan:{name:'Restore fixture',arrival:'2027-06-01',departure:'2027-06-04',adults:1,children:[],housing:[{resource:'resident',occupancy:1}],bathVisits:0}}}
    const n=(await calls()).length,hold=config.requestKeyDir+'.held'
    renameSync(config.requestKeyDir,hold)
    try{
      const nativeFailure=await native(guest,args);assert(nativeFailure.isError);assert(text(nativeFailure).includes('оператор'),text(nativeFailure))
      const mcpFailure=await invoke(guest,args);assert(text(mcpFailure).includes('оператор'),text(mcpFailure));assert.equal((await calls()).length,n)
      const read=await native(guest,{operation:'catalog'});assert(!read.isError,text(read))
    }finally{renameSync(hold,config.requestKeyDir)}
    const restored=await native(guest,args);assert(!restored.isError,text(restored))
  })
}finally{
  for(const dispose of effects)dispose?.()
  for(const scope of scopes)await scope.dispose()
  await ctx?.fiber.dispose()
  ledger?.db.close();if(work){rmSync(work,{recursive:true,force:true});assert(!existsSync(work))}
  backend.kill('SIGTERM')
  const delay=ms=>new Promise(resolve=>setTimeout(()=>resolve('timeout'),ms).unref())
  if(await Promise.race([ended,delay(3000)])==='timeout'){backend.kill('SIGKILL');assert.notEqual(await Promise.race([ended,delay(1000)]),'timeout','API fixture did not stop')}
  if(config)assert(!existsSync(config.temp))
}
console.log(`RESULT ${passed}/${passed+failed}`);process.exitCode=failed?1:0
