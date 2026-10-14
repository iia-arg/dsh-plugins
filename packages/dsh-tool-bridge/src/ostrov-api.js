// Tool adapter: the single HTTP/HMAC implementation is ostrov_api.py, based on Mark's direct client.
import {readFileSync,existsSync,realpathSync} from 'node:fs'
import {readRequestState,readKeyState,publishKeyState,keyFor} from './ostrov-request-state.mjs'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {resolve,dirname,isAbsolute,relative,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {validateJsonSchemaValue,assertSupportedJsonSchema} from '@deepseek-ai/dsh-tools'
const schema=JSON.parse(readFileSync(new URL('./ostrov-api-schema.json',import.meta.url),'utf8'))
const validation=JSON.parse(readFileSync(new URL('./ostrov-api-validation.json',import.meta.url),'utf8'))
assertSupportedJsonSchema(schema)
assertSupportedJsonSchema(validation)
const RUNNER=fileURLToPath(new URL('./ostrov-api-runner.py',import.meta.url)),LIMIT=4*1024*1024+4096,TIMEOUT=15000
const refuse=text=>Object.assign(new Error('ОТКАЗ ostrov_api: '+text),{code:'OSTROV_API_REFUSED'})
const unknown=()=>Object.assign(new Error('API Острова: исход не установлен, не повторять'),{code:'OSTROV_API_UNKNOWN'})
const WRITES=new Set(['plan.create','plan.edit','client.save','client.create','plan.link','client.assign'])
const PRIVATE_CONTEXT=new Set(['client.read','client.save','plan.list','staff.list','staff.read','client.list','client.create','plan.connections','plan.link','client.assign'])
const CONTEXT_OPERATIONS=new Set([...PRIVATE_CONTEXT,'plan.create','plan.edit','plan.read'])
const SITE_PUBLIC=new Set(['catalog','objects','quote'])
function rootBinding(ctx,agent,operation){
  const s=agent?.session,h=s?.header
  if(!h||typeof s.id!=='string'||h.id!==s.id||h.origin==='subagent'||typeof h.cwd!=='string'||!ctx.get('agents')?.roots?.().includes(agent))throw refuse('нужен текущий корневой агент')
  const db=ctx.get('taskControlCodex')?.ledger?.db
  const pinned=typeof db?.prepare==='function'?db.prepare('SELECT route_key FROM channel_sessions WHERE session_id=? AND session_created=?').get(s.id,h.createdAt):null
  if((s.id.startsWith('telegram-v2-')||(s.id.startsWith('telegram-site-')&&s.id.includes('-v2-')))&&!pinned)throw refuse('маршрут поколения сессии не подтверждён')
  const site=s.id.startsWith('telegram-site-')||String(pinned?.route_key).startsWith('site-')
  if(site&&!SITE_PUBLIC.has(operation))throw refuse('сайту доступны только catalog/objects/quote')
  const boundary=ctx.get('sessionProjections')?.stateOf(s,'turnBoundary')
  return {id:s.id,createdAt:h.createdAt,turn:boundary?.lastTurn,openTurn:boundary?.openTurnStartSeq,...(site?{route:pinned?.route_key??null}:{})}
}
function guestSession(ctx,agent){
  if(agent.session.id.startsWith('telegram-gost-')||agent.session.id.startsWith('telegram-site-'))return true
  const db=ctx.get('taskControlCodex')?.ledger?.db
  if(typeof db?.prepare!=='function')return false
  const pinned=db.prepare('SELECT route_key FROM channel_sessions WHERE session_id=? AND session_created=?').get(agent.session.id,agent.session.header.createdAt)
  return ['gost-','site-'].some(prefix=>String(pinned?.route_key).startsWith(prefix))
}
function workerUpdate(ctx,agent){
  const s=agent.session,h=s.header
  const ledger=ctx.get('taskControlCodex')?.ledger,boundary=ctx.get('sessionProjections')?.stateOf(s,'turnBoundary')
  if(!ledger?.db||typeof ledger.managed!=='function'||typeof ledger.root!=='string'||resolve(dirname(ledger.root))!==resolve(h.cwd)
      ||!Number.isSafeInteger(h.createdAt)||!Number.isSafeInteger(boundary?.openTurnStartSeq)||!Number.isSafeInteger(boundary?.lastTurn))return undefined
  const pinned=ledger.db.prepare('SELECT route_key FROM channel_sessions WHERE session_id=? AND session_created=?').get(s.id,h.createdAt)
  if(!pinned||String(pinned.route_key).startsWith('site-'))return undefined
  const rows=ledger.managed(s.id).filter(r=>r.session_created===h.createdAt&&r.claimed_turn===boundary.lastTurn&&r.finished_at===null)
  if(!rows.length||rows.some(r=>r.blocked||r.route!=='tg'))return undefined
  const updates=[]
  for(const r of rows){
    let u;try{u=JSON.parse(Buffer.from(r.raw??'').toString('utf8'))}catch{return undefined}
    const m=u.message
    if(!Number.isSafeInteger(u.update_id)||!Number.isSafeInteger(m?.message_id)||!Number.isSafeInteger(m?.from?.id)||m.from.id<=0||m.from.is_bot!==false||m.sender_chat
        ||m.chat?.type!=='private'||m.chat.id!==m.from.id||String(m.chat.id)!==String(r.route_key)
        ||![String(m.chat.id),'gost-'+m.chat.id,'a2a'].includes(String(pinned.route_key)))return undefined
    updates.push(u)
  }
  if(updates.some(u=>u.message.from.id!==updates[0].message.from.id))return undefined
  return updates.reduce((a,b)=>b.update_id>a.update_id?b:a)
}
// RU: Python 3 — из PATH процесса DSH; baseUrl/keyFile/botId — только из настройки, умолчаний частной сети нет (аудит №8, №9).
// EN: Python 3 comes from the DSH process PATH; baseUrl/keyFile/botId only from config, no private-network defaults (audit #8, #9).
export async function callClient(config,request,signal){
  return await new Promise((accept,reject)=>{
    const child=spawn('python3',['-B',RUNNER,'--key-file',config.keyFile,
      '--url',config.baseUrl,'--bot-id',config.botId],{stdio:['pipe','pipe','ignore'],signal})
    const chunks=[];let size=0,failed=false
    const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL')},TIMEOUT)
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>LIMIT){failed=true;child.kill('SIGKILL')}else chunks.push(chunk)})
    // RU: Процесс не создан (ENOENT/EACCES/отмена до запуска) — запрос не уходил: известный отказ, не «исход не установлен» (аудит №8).
    // EN: Process never created (ENOENT/EACCES/abort before start) — no request was sent: a known refusal, not "outcome unknown" (audit #8).
    child.on('error',e=>{failed=true;clearTimeout(timer);reject(child.pid===undefined?refuse(`Python 3 не запущен (${e?.code??e?.name??'ошибка'}); запрос не отправлен`):unknown())})
    child.stdin.on('error',()=>{failed=true})
    child.on('close',code=>{
      clearTimeout(timer)
      if(failed)return reject(unknown())
      let result
      try{result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),(_key,value)=>Object.is(value,-0)?0:value)}catch{return reject(unknown())}
      if(code!==0||result.ok!==true){
        const message=typeof result.error==='string'?result.error:''
        const status=/API HTTP (\d{3}):/.exec(message)
        if((status&&![400,403,404,405,409,413,415].includes(Number(status[1])))
            ||/некорректный ответ|неожиданный формат ответа|не вернул допустимую роль|недоступен или не ответил|исход/.test(message))return reject(unknown())
        return reject(refuse(message||'клиент отказал'))
      }
      accept(result)
    })
    child.stdin.end(JSON.stringify(request))
  })
}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical)
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]))
  return value
}
function checkSavedUpdate(update,actor,anonymousReplay){
  if(update===null){if(actor&&!anonymousReplay)throw refuse('сохранённый контекст отсутствует; запрос не отправлен');return}
  const m=update?.message
  if(anonymousReplay||!Number.isSafeInteger(update?.update_id)||update.update_id<0||!Number.isSafeInteger(m?.message_id)||m.message_id<=0||m?.from?.id!==actor?.sender||m?.chat?.id!==actor?.chat||m?.chat?.type!==actor?.chatType||m?.from?.is_bot!==false)throw refuse('сохранённый контекст повреждён; запрос не отправлен')
}
function savedKey(config,agent,request){
  const u=request.telegramUpdate,m=u?.message
  const actor=m?{sender:m.from.id,chat:m.chat.id,chatType:m.chat.type}:null
  const basis={session:rootKey(agent),...request,telegramUpdate:actor,botId:config.botId}
  const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
  const digest=hash(basis)
  if(typeof config.requestKeyDir!=='string'||!isAbsolute(config.requestKeyDir))throw refuse('requestKeyDir обязателен: абсолютный путь вне workspace')
  const dir=resolve(config.requestKeyDir),workspace=resolve(agent.session.header.cwd)
  const inside=(base,target)=>{const part=relative(base,target);return part===''||(part!=='..'&&!part.startsWith('..'+sep)&&!isAbsolute(part))}
  if(inside(workspace,dir))throw refuse('requestKeyDir должен быть вне workspace')
  let ancestor=dir
  while(!existsSync(ancestor))ancestor=dirname(ancestor)
  if(inside(realpathSync(workspace),realpathSync(ancestor)))throw refuse('requestKeyDir через ссылку ведёт в workspace')
  const guard=readRequestState(dir,workspace),stored=readKeyState(guard,digest)
  let key
  let anonymousReplay=false
  let original=u?{update_id:u.update_id,message:{message_id:m.message_id,from:{id:m.from.id,is_bot:false},chat:{id:m.chat.id,type:m.chat.type}}}:null
  // Reuse pre-upgrade keys: removed policy flag must not create another logical save.
  if(!stored){
    const previous=[],bases=[{value:basis,anonymous:false}]
    const rotated=agent.session.id.startsWith('telegram-v2-')||(agent.session.id.startsWith('telegram-gost-')&&agent.session.id.includes('-v2-'))
    if(actor&&rotated&&['plan.create','plan.edit'].includes(request.operation))for(const guest of [false,true])bases.push({value:{...basis,telegramUpdate:null,guest},anonymous:true})
    for(const candidate of bases)for(const flag of [false,true]){
      const oldDigest=hash({...candidate.value,allowClientOperations:flag}),old=readKeyState(guard,oldDigest)
      if(!old)continue
      let data;try{data=JSON.parse(old)}catch{throw refuse('прежний ключ повреждён; запрос не отправлен')}
      if(data.digest!==oldDigest||!/^vp-[a-f0-9]{48}$/.test(data.key))throw refuse('прежний ключ повреждён; запрос не отправлен')
      checkSavedUpdate(data.telegramUpdate,actor,candidate.anonymous)
      previous.push({data,anonymous:candidate.anonymous})
    }
    if(new Set(previous.map(d=>JSON.stringify([d.data.key,d.data.telegramUpdate]))).size>1)throw refuse('у сохранения разные прежние ключи; сначала проверить исход')
    if(previous.length){key=previous[0].data.key;original=previous[0].data.telegramUpdate;anonymousReplay=previous[0].anonymous}
    else key=keyFor(guard,digest)
  }
  checkSavedUpdate(original,actor,anonymousReplay)
  let data=stored?JSON.parse(stored):publishKeyState(guard,digest,{digest,key,telegramUpdate:original,anonymousReplay})
  if(data.digest!==digest||!/^vp-[a-f0-9]{48}$/.test(data.key))throw refuse('сохранённый ключ повреждён; запрос не отправлен')
  if(data.anonymousReplay!==undefined&&typeof data.anonymousReplay!=='boolean')throw refuse('сохранённый признак повтора повреждён')
  checkSavedUpdate(data.telegramUpdate,actor,data.anonymousReplay===true)
  return {key:data.key,telegramUpdate:data.telegramUpdate,anonymousReplay:data.anonymousReplay===true}
}
const rootKey=agent=>({id:agent.session.id,createdAt:agent.session.header.createdAt})
export function ostrovApiTool(ctx,config){
  const parameters=structuredClone(schema)
  return {name:'ostrov_api',description:'Остров: catalog/objects/quote/identity, staff.list/read, client.read/save и plan.list. Подтверждённому сотруднику доступны client.list/create/assign, plan.connections/link и сохранение расчёта для выбранного гостя. plan.create/read/edit возвращают постоянную url и quote; правка требует свежих версий. Заявки/брони закрыты. Context и requestKey назначает код, не модель; после неизвестного исхода не повторять вслепую. Сайту доступны только публичные catalog/objects/quote, без сохранений и CRM.',parameters,
    output:{schema:{type:'object',properties:{ok:{type:'boolean'},operation:{type:'string'},route:{type:'string'},role:{type:'string'},result:{}},required:['ok','operation','route','role','result'],additionalProperties:false},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
    async execute(args,exec){
      const input=args&&typeof args==='object'&&!Array.isArray(args)&&!Object.hasOwn(args,'params')?{...args,params:{}}:args
      if(validateJsonSchemaValue(validation,input).length)throw refuse('операция/параметры не разрешены; context, senderId и requestKey модель не назначает')
      if(exec.signal?.aborted)throw refuse('вызов отменён до отправки')
      const binding=rootBinding(ctx,exec.agent,input.operation),guest=guestSession(ctx,exec.agent)
      const update=(!guest||CONTEXT_OPERATIONS.has(input.operation))?workerUpdate(ctx,exec.agent):undefined
      if(PRIVATE_CONTEXT.has(input.operation)&&!update)throw refuse('нет текущего приватного Telegram update')
      const request={...input,...(update?{telegramUpdate:update}:{}),guest}
      if(WRITES.has(input.operation)){
        const saved=savedKey(config,exec.agent,request)
        request.requestKey=saved.key
        if(saved.telegramUpdate)request.telegramUpdate=saved.telegramUpdate
        else if(saved.anonymousReplay)delete request.telegramUpdate
      }
      const result=await callClient(config,canonical(request),exec.signal)
      if(guestSession(ctx,exec.agent)!==guest||JSON.stringify(rootBinding(ctx,exec.agent,input.operation))!==JSON.stringify(binding)||JSON.stringify((!guest||CONTEXT_OPERATIONS.has(input.operation))?workerUpdate(ctx,exec.agent):undefined)!==JSON.stringify(update))throw refuse('текущий вход изменился; результат не выдан')
      return result
    }}
}
export function installOstrovApi(ctx,config){
  if(config?.enabled!==true)return
  for(const k of ['baseUrl','keyFile','botId'])if(typeof config[k]!=='string'||!config[k])throw refuse(`${k} обязателен при enabled — умолчаний нет`)
  const registry=ctx.get('tools');if(typeof registry?.register!=='function')throw refuse('реестр инструментов недоступен')
  const dispose=registry.register(ostrovApiTool(ctx,config));ctx.effect(()=>dispose)
}
