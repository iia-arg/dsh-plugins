import {initializeRequestState} from '../src/ostrov-request-state.mjs'
// Breaks caught: writes absent, unstable keys, DTO truncation, gate bypass, model context injection.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {createInterface} from 'node:readline'
import {once} from 'node:events'
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync,existsSync,renameSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
const root=resolve(process.env.MOST_ROOT||new URL('..',import.meta.url).pathname)
const app=resolve(process.env.MARK_TEST_APP||join(root,'../source/app'))
if(!existsSync(join(app,'server.py'))){console.error('СЛЕПОТА: MARK_TEST_APP не указывает копию API Марка с server.py');process.exit(2)}
const {sverkaKopii}=await import(new URL('./ostrov-api-kopiya.mjs',import.meta.url))
await sverkaKopii(app)
const fixture=spawn('python3',['-B',join(root,'test/api-fixture.py'),app],{stdio:['ignore','pipe','inherit']})
const ended=once(fixture,'exit'),work=mkdtempSync(join(tmpdir(),'gamma-saved-plans-'))
let passed=0,failed=0,config
try{
 const lines=createInterface({input:fixture.stdout});config=JSON.parse((await Promise.race([once(lines,'line'),new Promise((_,reject)=>setTimeout(()=>reject(Error('fixture startup')),5000).unref())]))[0]);lines.close();config.botId??='8868419301';/* аудит №9 (3.1.1): у клиента нет умолчания botId — фикстура ждёт этот */config.requestKeyDir=join(config.temp,'request-keys')
 initializeRequestState(config.requestKeyDir,work)
 const {ostrovApiTool}=await import(pathToFileURL(join(root,'src/ostrov-api.js')))
 const agent={session:{id:'telegram-gost-7654321',header:{id:'telegram-gost-7654321',createdAt:17,cwd:work,origin:'root'}}}
 const services={agents:{roots:()=>[agent]}}
 const ctx={get:n=>services[n]}
 let tool=ostrovApiTool(ctx,config)
 const call=(args)=>tool.execute(args,{agent,signal:AbortSignal.timeout(20000)})
 const calls=async()=> (await(await fetch(config.baseUrl+'/fixture/calls')).json()).calls
 // Legacy upgrade tests use their own pre-cutover store; never run an old writer in an initialized store.
 const withLegacyStore=async fn=>{
  const hold=config.requestKeyDir+'.before-legacy-test',anchor=join(work,'.ostrov-api-state.json'),anchorHold=anchor+'.before-legacy-test'
  renameSync(config.requestKeyDir,hold);renameSync(anchor,anchorHold)
  try{return await fn()}finally{rmSync(config.requestKeyDir,{recursive:true,force:true});rmSync(anchor,{force:true});renameSync(hold,config.requestKeyDir);renameSync(anchorHold,anchor)}
 }

 const check=async(name,fn)=>{try{await fn();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
 const plan={name:'Тест 😀',arrival:'2027-06-01',departure:'2027-06-04',adults:1,children:[],housing:[{resource:'resident',occupancy:1}],bathVisits:0}
 const catalog=await call({operation:'catalog'}),version=catalog.result.version
 let doc,createdArgs={operation:'plan.create',params:{kind:'resident',plan,catalogVersion:version}}
 await check('default schema exposes saved plans and all three client operations',async()=>{
  const e=tool.parameters.properties.operation.enum
  assert(e.includes('plan.create')&&e.includes('plan.read')&&e.includes('plan.edit'))
  for(const op of ['client.read','client.save','plan.list'])assert(e.includes(op))
  assert.equal(tool.parameters.type,'object');for(const k of ['oneOf','anyOf','allOf'])assert(!Object.hasOwn(tool.parameters,k))
 })
 await check('create -> read -> edit -> read: whole D, stable URL, fresh quote',async()=>{
  doc=(await call(createdArgs)).result
  for(const k of ['id','kind','url','documentVersion','catalogVersion','state','editable','plan','quote','updatedAt'])assert(Object.hasOwn(doc,k),k)
  assert.equal(doc.state,'draft');assert(doc.editable);assert(doc.url.includes(doc.id))
  assert.deepEqual((await call({operation:'plan.read',params:{kind:'resident',id:doc.id}})).result,doc)
  const edit={operation:'plan.edit',params:{kind:'resident',id:doc.id,documentVersion:doc.documentVersion,catalogVersion:version,plan:{...plan,bathVisits:1}}}
  const changed=(await call(edit)).result
  assert.equal(changed.id,doc.id);assert.equal(changed.url,doc.url);assert.notEqual(changed.documentVersion,doc.documentVersion);assert(changed.quote.total>doc.quote.total)
  assert.deepEqual((await call({operation:'plan.read',params:{kind:'resident',id:doc.id}})).result,changed)
  assert.deepEqual((await call(edit)).result,changed,'same edit retry must use same key, not fail as stale')
 })
 await check('create retry across new tool instance gives same record and same persisted key',async()=>{
  tool=ostrovApiTool(ctx,config)
  assert.deepEqual((await call(createdArgs)).result,doc)
  const sent=(await calls()).filter(c=>c.operation==='plan.create')
  assert(sent.length>=2);assert.equal(new Set(sent.map(c=>c.requestKey)).size,1)
  assert(/^[A-Za-z0-9._:-]{16,120}$/.test(sent[0].requestKey));assert(!Object.hasOwn(sent[0],'context'))
 })
 await check('wrong token/wrong kind refuse honestly; link holder does have access',async()=>{
  await assert.rejects(call({operation:'plan.read',params:{kind:'resident',id:'A'.repeat(32)}}),/404/)
  await assert.rejects(call({operation:'plan.read',params:{kind:'biggroup',id:doc.id}}),/404/)
  assert.equal((await call({operation:'plan.read',params:{kind:'resident',id:doc.id}})).result.id,doc.id)
 })
 await check('client operations need real context; application/staff mutations remain unavailable',async()=>{
  const n=(await calls()).length
  for(const args of [{operation:'client.read'},{operation:'plan.list'},{operation:'client.save',params:{profile:{name:'Тест'},version:null}},{operation:'application.create',params:{}},{operation:'plan.archive',params:{}},{operation:'contacts'}])await assert.rejects(call(args))
  assert.equal((await calls()).length,n)
 })
 await check('model requestKey/context/senderId/clientId and params extras refuse before network',async()=>{
  const n=(await calls()).length
  for(const args of [{...createdArgs,requestKey:'model-key'},{...createdArgs,context:{senderId:'900'}},{...createdArgs,params:{...createdArgs.params,senderId:'900'}},{...createdArgs,params:{...createdArgs.params,clientId:'900'}},{operation:'plan.read',params:{kind:'resident',id:doc.id,route:'staff-private'}}])await assert.rejects(call(args))
  assert.equal((await calls()).length,n)
 })
 await check('lost create ACK: unknown; explicit same invocation uses old key and does not duplicate',async()=>{
  const input={operation:'plan.create',params:{...createdArgs.params,plan:{...plan,name:'Потерянный ответ'}}}
  await fetch(config.baseUrl+'/fixture/mode/lost-ack')
  await assert.rejects(call(input),/исход не установлен, не повторять/)
  tool=ostrovApiTool(ctx,config)
  const recovered=(await call(input)).result
  const sent=(await calls()).filter(c=>c.params?.plan?.name==='Потерянный ответ')
  assert.equal(sent.length,2);assert.equal(sent[0].requestKey,sent[1].requestKey)
  const stats=await(await fetch(config.baseUrl+'/fixture/stats')).json();assert.equal(stats.residentPlans,2);assert(recovered.id!==doc.id)
 })
 await check('persisted key survives separate Node process and JSON key ordering',async()=>{
  const script=`import {ostrovApiTool} from ${JSON.stringify(pathToFileURL(join(root,'src/ostrov-api.js')).href)};const a=${JSON.stringify(agent)};const c={get:n=>n==='agents'?{roots:()=>[a]}:undefined};const t=ostrovApiTool(c,${JSON.stringify(config)});const d=await t.execute(${JSON.stringify(createdArgs)},{agent:a,signal:AbortSignal.timeout(20000)});console.log(JSON.stringify(d));`
  const sub=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','inherit']})
  let output='';sub.stdout.on('data',b=>output+=b);const [code]=await once(sub,'exit');assert.equal(code,0);assert.equal(JSON.parse(output).result.id,doc.id)
  const reordered={operation:'plan.create',params:{catalogVersion:version,plan:Object.fromEntries(Object.entries(plan).reverse()),kind:'resident'}}
  assert.equal((await call(reordered)).result.id,doc.id)
  assert.equal(new Set((await calls()).filter(c=>c.params?.plan?.name==='Тест 😀').map(c=>c.requestKey)).size,2,'one create key plus one edit key')
 })
 await check('damaged persisted key refuses without HTTP, restored key works',async()=>{
  const files=readdirSync(config.requestKeyDir).filter(x=>x.endsWith('.json'))
  const create=(await calls()).find(c=>c.operation==='plan.create'),target=files.find(x=>JSON.parse(readFileSync(join(config.requestKeyDir,x))).key===create.requestKey)
  const path=join(config.requestKeyDir,target),before=readFileSync(path),n=(await calls()).length
  writeFileSync(path,'{}');await assert.rejects(call(createdArgs),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');assert.equal((await calls()).length,n)
  writeFileSync(path,before);assert.equal((await call(createdArgs)).result.id,doc.id)
 })
 await check('guest actual context: default client.read/save/list active, old gate cannot suppress them',async()=>{
  const {MessageReceipts}=await import('/opt/agent-plugins/dsh-telegram-multiagent/src/message-receipts.js')
  const {ConversationSessions}=await import('/opt/agent-plugins/dsh-telegram-multiagent/src/conversation-sessions.js')
  const {CodexTaskControl}=await import('/opt/agent-plugins/dsh-telegram-multiagent/src/codex-task-control.js')
  const ledger=new MessageReceipts(join(work,'.message-receipts')),conversations=new ConversationSessions(ledger)
  try{
   conversations.pin('gost-7654321',agent.session.header)
   const update={update_id:81,message:{message_id:19,from:{id:7654321,is_bot:false},chat:{id:7654321,type:'private'},text:'сохрани'}}
   const receipt=ledger.receive('tg:81',JSON.stringify(update),{route:'tg',routeKey:7654321})
   const msg=ledger.prepare(receipt.id,{id:'dsh-81',content:[]},agent.session,7654321)
   agent.session.events=[{seq:0,time:1,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[msg]}},{seq:1,time:2,type:'turn/start',data:{turn:1}},{seq:2,time:3,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[],outcome:'claimed'}}]
   ledger.reconcile(agent.session,1)
   services.taskControlCodex=new CodexTaskControl(ledger,'fixture');services.sessionProjections={stateOf:()=>({openTurnStartSeq:1,lastTurn:1})}
   const enabledFirst=ostrovApiTool(ctx,config)
   assert.equal((await enabledFirst.execute({operation:'client.read'},{agent,signal:AbortSignal.timeout(20000)})).result,null,'absent own card is null, not unknown')
   const input={operation:'plan.create',params:{...createdArgs.params,plan:{...plan,name:'Из текущего гостевого входа'}}}
   const d=(await call(input)).result
   const sent=(await calls()).at(-1);assert.equal(sent.context.senderId,'7654321');assert.equal(sent.context.updateId,'81');assert.equal(sent.context.route,'guest-telegram')
   assert.equal(sent.operation,'plan.create');assert.equal(d.kind,'resident')
   // Same logical save after another update must reuse old context/body/key.
   const newer={...update,update_id:82,message:{...update.message,message_id:20,text:'проверь прежнее сохранение'}}
   const r2=ledger.receive('tg:82',JSON.stringify(newer),{route:'tg',routeKey:7654321})
   const m2=ledger.prepare(r2.id,{id:'dsh-82',content:[]},agent.session,7654321)
   agent.session.events.push({seq:3,time:4,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[m2]}},{seq:4,time:5,type:'turn/start',data:{turn:2}},{seq:5,time:6,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[],outcome:'claimed'}})
   ledger.reconcile(agent.session,2);services.sessionProjections={stateOf:()=>({openTurnStartSeq:4,lastTurn:2})}
   const again=(await call(input)).result;assert.equal(again.id,d.id)
   const retried=(await calls()).at(-1);assert.equal(retried.requestKey,sent.requestKey);assert.deepEqual(retried.context,sent.context)
   let n=(await calls()).length
   const enabled=ostrovApiTool(ctx,config)
   assert(enabled.parameters.properties.operation.enum.includes('client.read'))
   const invoke=args=>enabled.execute(args,{agent,signal:AbortSignal.timeout(20000)})
   await fetch(config.baseUrl+'/fixture/card-second-binding')
   const c=(await invoke({operation:'client.read'})).result;assert.equal(c.profile.name,'Из текущего гостевого входа')
   const profile={name:'Обновлённое имя',phone:'',email:'',notes:'',messengers:[{type:'whatsapp',username:'',userId:'wa-account'},...c.profile.messengers.map(m=>({...m,username:m.userId==='7654321'?'changed_name':m.username}))]}
   const changed=(await invoke({operation:'client.save',params:{profile,version:c.version}})).result
   assert.equal(changed.profile.name,profile.name);assert(changed.profile.messengers.some(m=>m.type==='telegram'&&m.userId==='7654321'&&m.username==='changed_name'))
   assert.deepEqual(changed.profile.messengers.filter(m=>m.type==='telegram').map(m=>m.userId).sort(),['','','7654321','7654322'])
   assert.deepEqual(changed.profile.messengers.filter(m=>m.type==='telegram'&&!m.userId).map(m=>m.username),['alpha','beta'])
   assert(changed.profile.messengers.some(m=>m.type==='whatsapp'&&m.userId==='wa-account'))
   assert.deepEqual((await invoke({operation:'client.save',params:{profile,version:c.version}})).result,changed,'client.save retry with same key returns same card/result')
   const list=(await invoke({operation:'plan.list'})).result;assert(list.plans.some(p=>p.id===d.id))
   // Actual rotated conversation IDs are opaque. Context comes from the pin, not ID parsing.
   const savedSession=agent.session,oldId=agent.session.id
   agent.session={id:'telegram-v2-fixture-opaque',header:{id:'telegram-v2-fixture-opaque',createdAt:18,cwd:work,origin:'root'},events:[]}
   ledger.db.prepare('UPDATE channel_sessions SET session_id=?,session_created=? WHERE route_key=?').run(agent.session.id,18,'gost-7654321')
   const update3={...newer,update_id:83,message:{...newer.message,message_id:21}}
   const r3=ledger.receive('tg:83',JSON.stringify(update3),{route:'tg',routeKey:7654321})
   const m3=ledger.prepare(r3.id,{id:'dsh-83',content:[]},agent.session,7654321)
   agent.session.events=[{seq:0,time:1,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[m3]}},{seq:1,time:2,type:'turn/start',data:{turn:1}},{seq:2,time:3,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[],outcome:'claimed'}}]
   ledger.reconcile(agent.session,1);services.sessionProjections={stateOf:()=>({openTurnStartSeq:1,lastTurn:1})}
   assert.equal((await invoke({operation:'client.read'})).result.id,c.id)
   const route=(await calls()).at(-1).context;assert.equal(route.senderId,'7654321');assert.equal(route.route,'guest-telegram')
   if(process.env.LEGACY_TOOL_ROOT){
    const {ostrovApiTool:oldTool}=await import(pathToFileURL(join(process.env.LEGACY_TOOL_ROOT,'src/ostrov-api.js')))
    const oldInput={operation:'plan.create',params:{...createdArgs.params,plan:{...plan,name:'Старое anonymous сохранение opaque'}}}
    const beforeCount=(await(await fetch(config.baseUrl+'/fixture/stats')).json()).residentPlans
    await withLegacyStore(async()=>{
    await fetch(config.baseUrl+'/fixture/mode/lost-ack')
    await assert.rejects(oldTool(ctx,config).execute(oldInput,{agent,signal:AbortSignal.timeout(20000)}),/исход не установлен/)
    initializeRequestState(config.requestKeyDir,work)
    const recovered=(await call(oldInput)).result
    const sent=(await calls()).filter(x=>x.params?.plan?.name==='Старое anonymous сохранение opaque')
    assert.equal(sent.length,2);assert.equal(sent[0].requestKey,sent[1].requestKey)
    assert(!Object.hasOwn(sent[0],'context'));assert(!Object.hasOwn(sent[1],'context'),'legacy replay must keep old anonymous signed body')
    const afterCount=(await(await fetch(config.baseUrl+'/fixture/stats')).json()).residentPlans
    assert.equal(afterCount,beforeCount+1,'old commit + recovery must be one row');assert(recovered.id)
    })
   }
   for(const flag of [undefined,false,'true',1]){
    const disabled=ostrovApiTool(ctx,{...config,allowClientOperations:flag});n=(await calls()).length
    const active=await disabled.execute({operation:'client.read'},{agent,signal:AbortSignal.timeout(20000)});assert.equal(active.result.id,c.id);assert.equal((await calls()).length,n+1)
   }
   // New card: context supplies Telegram ID; model ID cannot assign the binding.
   agent.session={id:'telegram-gost-87654321',header:{id:'telegram-gost-87654321',createdAt:19,cwd:work,origin:'root'},events:[]}
   conversations.pin('gost-87654321',agent.session.header)
   const update4={update_id:84,message:{message_id:22,from:{id:87654321,is_bot:false},chat:{id:87654321,type:'private'},text:'моя карточка'}}
   const r4=ledger.receive('tg:84',JSON.stringify(update4),{route:'tg',routeKey:87654321}),m4=ledger.prepare(r4.id,{id:'dsh-84',content:[]},agent.session,87654321)
   agent.session.events=[{seq:0,time:1,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[m4]}},{seq:1,time:2,type:'turn/start',data:{turn:1}},{seq:2,time:3,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[],outcome:'claimed'}}]
   ledger.reconcile(agent.session,1)
   assert.equal((await invoke({operation:'client.read'})).result,null)
   const createCard={operation:'client.save',params:{version:null,profile:{name:'Новая карточка',phone:'',email:'',notes:'',messengers:[{type:'telegram',username:'new_name',userId:'99999999'},{type:'max',username:'max_name',userId:'max-contact'}]}}}
   const newCard=(await invoke(createCard)).result
   assert(newCard.profile.messengers.some(m=>m.type==='telegram'&&m.userId==='87654321'))
   assert(!newCard.profile.messengers.some(m=>m.type==='telegram'&&m.userId==='99999999'))
   assert.deepEqual((await invoke(createCard)).result,newCard)
   assert.equal((await invoke({operation:'client.read'})).result.id,newCard.id)
  }finally{delete services.taskControlCodex;delete services.sessionProjections;ledger.close()}
 })
 if(process.env.LEGACY_TOOL_ROOT)await check('upgrade from old gate digest reuses key and same saved record',async()=>withLegacyStore(async()=>{
  const {ostrovApiTool:oldTool}=await import(pathToFileURL(join(process.env.LEGACY_TOOL_ROOT,'src/ostrov-api.js')))
  const input={operation:'plan.create',params:{...createdArgs.params,plan:{...plan,name:'Ключ до включения карточек'}}}
  const old=await oldTool(ctx,config).execute(input,{agent,signal:AbortSignal.timeout(20000)})
  initializeRequestState(config.requestKeyDir,work)
  const fresh=await call(input);assert.equal(fresh.result.id,old.result.id)
  const sent=(await calls()).filter(x=>x.params?.plan?.name==='Ключ до включения карточек');assert.equal(sent.length,2);assert.equal(sent[0].requestKey,sent[1].requestKey)
 }))
 await check('all saved kinds preserve D.quote (group/biggroup)',async()=>{
  for(const [kind,p]of Object.entries({group:{policyVersion:3,week:'2027-05-01',adults:8,teens:0,extraTeam:0,group:8,foodDays:7,organizer:'Тест',title:'Малая',housing:[{resource:'dome-house',occupancy:2,quantity:5}],activities:[]},biggroup:{policyVersion:3,week:'2027-05-01',adults:50,teens:0,extraTeam:0,organizer:'Тест',title:'Большая'}})){
   const d=(await call({operation:'plan.create',params:{kind,plan:p,catalogVersion:version}})).result
   assert.equal(d.kind,kind);assert.equal(typeof d.url,'string');assert.equal(typeof d.quote,'object');assert.deepEqual((await call({operation:'plan.read',params:{kind,id:d.id}})).result,d)
  }
 })
 await check('requestKeyDir mandatory/absolute/outside workspace: refusal before HTTP',async()=>{
  for(const dir of [undefined,'','relative-keys',work,join(work,'nested-keys')]){
   const isolated=ostrovApiTool(ctx,{...config,requestKeyDir:dir}),before=(await calls()).length
   await assert.rejects(isolated.execute(createdArgs,{agent,signal:AbortSignal.timeout(20000)}),/requestKeyDir/)
   assert.equal((await calls()).length,before)
  }
  assert(!existsSync(join(work,'nested-keys')),'refused directory must not be created')
 })
 console.log('SAVED_PLANS',passed,'/',passed+failed)
}finally{fixture.kill('SIGTERM');await ended;rmSync(work,{recursive:true,force:true})}
process.exitCode=failed?1:0
