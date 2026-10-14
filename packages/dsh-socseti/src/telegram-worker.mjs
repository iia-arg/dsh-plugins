import {approvers,OwnerIdUnavailable} from './contract.mjs';
import {setTimeout as sleep} from 'node:timers/promises';
import {TelegramQueue} from './telegram-queue.mjs';
import {TelegramApi} from './telegram-api.mjs';
import {readPrivateFile} from './auth.mjs';
export async function createTelegramWorker(store,config,{api,log=record=>console.log(JSON.stringify(record))}={}){
 try{
 if(store.profile==='anna'&&config.externalPoll!==true)throw Error('Anna Telegram poll ownership rejected');
 api??=new TelegramApi(readPrivateFile(config.tokenFile).trim());
 const me=await api.call('getMe');
 if(me?.username!==(store.profile==='anna'?'anna_arg_bot':'ostrov_smm_bot')||me.is_bot!==true||!Number.isSafeInteger(me.id)||me.id<=0||me.can_read_all_group_messages===true)throw Error('Telegram identity or privacy rejected');
 const hook=await api.call('getWebhookInfo');if(hook?.url!=='')throw Error('Telegram existing webhook rejected');
 for(const [id,types] of [[config.approvalChatId,['group','supergroup']],[Number(store.targets.telegram),['channel']]]){
  const chat=await api.call('getChat',{chat_id:id});if(chat?.id!==id||!types.includes(chat.type))throw Error('Telegram chat identity rejected');
 }
 const member=await api.call('getChatMember',{chat_id:store.targets.telegram,user_id:me.id});
 if(member?.status!=='creator'&&(member?.status!=='administrator'||member.can_post_messages!==true))throw Error('Telegram channel rights rejected');
 const queue=new TelegramQueue(store,{approvalChatId:config.approvalChatId,botId:me.id,writerEnabled:config.writerEnabled});queue.recover();store.telegramQueue=queue;
 let stopping=false,halted=false,busy=false,failures=0,ownerUnavailable=false,sendUnavailable=false,loop;const abort=new AbortController();
 store.telegramStatus={ready:true,halted:false,reason:null,writerEnabled:config.writerEnabled===true,queue:()=>queue.stats()};
 const halt=reason=>{halted=true;store.telegramStatus.ready=false;store.telegramStatus.halted=true;store.telegramStatus.reason=reason;log({event:'telegram_halted',reason})};
 async function poll(timeout){
   let updates;
   try{updates=await api.call('getUpdates',{offset:queue.offset(),timeout,limit:100,allowed_updates:['callback_query']})}
   catch(e){
    if(stopping)return false;
    if([401,403,409].includes(e.code)){halt('poll_failed');return false}
    failures=Math.min(5,failures+1);
    store.telegramStatus.ready=false;store.telegramStatus.reason='poll_failed';
    if(failures===1)log({event:'telegram_poll_degraded',reason:'poll_failed'});
    return false;
   }
   if(stopping)return false;
   if(!Array.isArray(updates)||updates.length>100||updates.some(u=>!Number.isSafeInteger(u?.update_id)||u.update_id<0)){halt('invalid_update_batch');return false}
   if(failures){log({event:'telegram_poll_recovered'});failures=0}
   store.telegramStatus.ready=true;store.telegramStatus.reason=null;
   for(const update of updates.sort((a,b)=>a.update_id-b.update_id)){
    if(stopping)break;const result=queue.processUpdate(update);const callback=update.callback_query;
    if(callback&&typeof callback.id==='string'&&callback.id.length<=256){
     try{await api.call('answerCallbackQuery',{callback_query_id:callback.id,text:result.decision==='approved'?'Одобрено, публикация в очереди':result.decision==='rejected'?'Отклонено':result.decision==='approved_held_stage3'?'Одобрено, площадка ожидает такта 3':'Карточка недействительна или уже обработана'})}catch{log({event:'telegram_callback_answer_failed'})}
    }
   }
   return !stopping&&!halted;
 }
 async function tick(timeout=0){
  if(stopping||halted)return;if(busy)throw Error('Telegram tick already running');busy=true;
  try{
   approvers();
   if(ownerUnavailable){ownerUnavailable=false;log({event:'telegram_owner_recovered'})}
   let polled=false;
   if(failures&&config.externalPoll!==true){if(!await poll(timeout))return;polled=true}
   queue.enqueueCards();
   for(let i=0;i<10&&!stopping&&!halted;i++){
    approvers();const action=queue.claim();if(!action)break;
    if(!queue.canSendNow(action)){queue.deferSending(action);break}
    let hold=false;
    try{const result=await api.call(action.request.method,action.request.args,action.request.documentText,{beforeSend:()=>queue.canSendNow(action)});queue.finish(action.id,{result});if(sendUnavailable){sendUnavailable=false;log({event:'telegram_send_recovered'})}store.telegramStatus.ready=true;store.telegramStatus.reason=null}
    catch(e){if(e.kind==='deferred'){queue.deferSending(action);break}queue.finish(action.id,e.kind==='not_sent'?{notSent:true}:e.kind==='rejected'?{rejected:true,retryAfter:Number.isSafeInteger(e.retryAfter)?e.retryAfter:0}:{unknown:true});if([401,403,409].includes(e.code))halt('authorization_or_conflict');else if(e.kind!=='rejected'){hold=true;store.telegramStatus.ready=false;store.telegramStatus.reason='send_unavailable';if(!sendUnavailable)log({event:'telegram_send_degraded',reason:'send_unavailable'});sendUnavailable=true}}
    const state=action.kind==='notice'?store.db.prepare('SELECT state FROM tg_notice_actions WHERE id=?').get(action.id).state:store.db.prepare('SELECT state FROM tg_actions WHERE id=? UNION ALL SELECT state FROM tg_event_actions WHERE id=?').get(action.id,action.id).state;
    log({event:'telegram_action',id:action.id,kind:action.kind,state});if(hold)break;
   }
   if(stopping||halted)return;
   if(config.externalPoll===true){if(!sendUnavailable){store.telegramStatus.ready=true;store.telegramStatus.reason=null}return;}
   if(!polled)await poll(timeout);
  }catch(error){
   if(!(error instanceof OwnerIdUnavailable))throw error;
   store.telegramStatus.ready=false;store.telegramStatus.reason='owner_id_unavailable';
   if(!ownerUnavailable)log({event:'telegram_owner_unavailable',reason:error.message});
   ownerUnavailable=true;
  }finally{busy=false}
 }
 return {queue,tick,start(){if(loop)return loop;loop=(async()=>{try{while(!stopping&&!halted){await tick(20);if(!stopping&&!halted)await sleep(ownerUnavailable?1000:failures?Math.min(16000,1000*2**(failures-1)):100,undefined,{signal:abort.signal})}}catch{if(!stopping)halt('worker_failed')}})();return loop},async stop(){stopping=true;store.telegramStatus.ready=false;abort.abort();api.stop();await loop}};
 }catch(e){api?.stop();throw e}
}

// A Telegram preflight refusal is local to this subsystem, never a reason to close draft MCP.
export async function startTelegramSubsystem(store,config,options={}){
 const stats=()=>{
  const tables=['tg_actions','tg_event_actions','tg_notice_actions'].filter(name=>store.db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(name));
  if(!tables.length)return {};
  const rows=store.db.prepare('SELECT state,count(*) n FROM ('+tables.map(name=>'SELECT state FROM '+name).join(' UNION ALL ')+') GROUP BY state').all();
  return Object.fromEntries(rows.map(r=>[r.state,r.n]));
 };
 store.telegramStatus={ready:false,halted:false,reason:'preflight',queue:stats};
 try{const worker=await createTelegramWorker(store,config,options);worker.start();return worker}
 catch(e){
  const reasons=new Map([['Telegram token format rejected','token_invalid'],['Telegram existing webhook rejected','webhook_present'],['Telegram identity or privacy rejected','identity_or_privacy_rejected'],['Telegram chat identity rejected','chat_identity_rejected'],['Telegram channel rights rejected','channel_rights_rejected'],['private file rejected','token_file_rejected']]);
  const reason=reasons.get(e?.message)??(e?.kind==='rejected'&&e.code===401?'token_rejected':e?.kind==='unknown'?'api_unavailable_or_unconfirmed':['ENOENT','EACCES','EPERM','ELOOP'].includes(e?.code)?'token_file_unavailable':'preflight_failed');
  store.telegramStatus={ready:false,halted:true,reason,queue:stats};
  (options.log??(record=>console.log(JSON.stringify(record))))({event:'telegram_halted',reason});return null;
 }
}
