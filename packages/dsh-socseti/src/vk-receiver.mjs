import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {VkApi,VK_GROUP,vkSession,readVkToken} from './vk-api.mjs';
const OFF=Date.parse('2026-10-13T11:35:20Z'),FROM=OFF-600000,SOURCE='vk:'+VK_GROUP;
const positive=n=>Number.isSafeInteger(n)&&n>0;
const ts=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,79})$/.test(x);
const revision=text=>createHash('sha256').update(text).digest('hex').slice(0,16);
class VkStartupFailure extends Error{constructor(detail){super('VK startup failed after 3 attempts');this.detail=detail}}
function event(kind,o,{peer,post}={}){
 if(!o||kind!=='dm'&&!positive(o.id)||!Number.isSafeInteger(o.date)||o.date<0||o.owner_id!==undefined&&o.owner_id!==-VK_GROUP||o.post_owner_id!==undefined&&o.post_owner_id!==-VK_GROUP)throw Error('VK object rejected');
 let text=o.text??'';if(typeof text!=='string')throw Error('VK text rejected');
 const attachments=(o.attachments??[]).map(a=>{const item=a?.[a.type];return item&&Number.isSafeInteger(item.id)?a.type+':'+(item.owner_id??'')+':'+item.id:'attachment'});
 if(attachments.length)text+=(text?'\n':'')+'Вложения: '+attachments.join(', ');
 if(!text.trim())text=kind==='dm'?'Сообщение без текста':kind==='comment'?'Комментарий без текста':'Пост без текста';
 let object,conversation,subject;
 if(kind==='dm'){peer??=o.peer_id;if(!Number.isSafeInteger(peer)||peer===0||!positive(o.conversation_message_id))throw Error('VK message identity rejected');object=`dm:${peer}:${o.conversation_message_id}`;conversation='peer:'+peer;subject='message:'+o.conversation_message_id}
 else if(kind==='comment'){post??=o.post_id;if(!positive(post))throw Error('VK comment identity rejected');object=`comment:${-VK_GROUP}:${post}:${o.id}`;conversation=`wall:${-VK_GROUP}:${post}`;subject='comment:'+o.id}
 else{object=`post:${-VK_GROUP}:${o.id}`;conversation=`wall:${-VK_GROUP}:${o.id}`;subject='post:'+o.id}
 return {platform:'vk',account_id:String(VK_GROUP),provider_id:object+':'+revision(text),provider_object_id:object,kind,conversation_id:conversation,subject_id:subject,text,occurred_at:o.date*1000};
}
function normalize(update,cursor,index){
 if(update?.group_id!==VK_GROUP||typeof update.type!=='string')throw Error('VK group rejected');
 if(['message_new','message_edit'].includes(update.type))return event('dm',update.object?.message??update.object);
 if(['wall_reply_new','wall_reply_edit'].includes(update.type))return event('comment',update.object);
 if(['wall_post_new','wall_post_edit'].includes(update.type))return event('post',update.object);
 if(update.type==='group_join'){const o=update.object;if(!positive(o?.user_id))throw Error('VK join rejected');const id=typeof update.event_id==='string'&&update.event_id?update.event_id:cursor+':'+index;return {platform:'vk',account_id:String(VK_GROUP),provider_id:'join:'+o.user_id+':'+id,kind:'join',conversation_id:'group:'+VK_GROUP,subject_id:'person:'+o.user_id,text:'Вступление в сообщество: '+o.user_id}}
 return null;
}
export function createVkReceiver(store,config,{api,wallApi,log=record=>console.log(JSON.stringify(record)),pause=sleep}={}){
 if(store.profile!=='anna'||store.target('vk')!==String(VK_GROUP)||config?.armed!==true||config.idleAt!=='2026-10-13T11:35:20Z')throw Error('VK armed/target/idle barrier rejected');
 api??=new VkApi(readVkToken(config.groupToken),{version:config.apiVersion});wallApi??=new VkApi(readVkToken(config.wallToken),{version:config.apiVersion});
 store.tx(()=>store.db.exec(`CREATE TABLE IF NOT EXISTS vk_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS vk_jobs(id TEXT PRIMARY KEY,method TEXT NOT NULL,args TEXT NOT NULL,offset INTEGER NOT NULL DEFAULT 0,expected_count INTEGER,phase TEXT NOT NULL DEFAULT 'pending',failures INTEGER NOT NULL DEFAULT 0,reason TEXT);
 CREATE TABLE IF NOT EXISTS vk_seen(provider_id TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(provider_id,source));
 CREATE TABLE IF NOT EXISTS vk_job_objects(job TEXT NOT NULL,object_id TEXT NOT NULL,PRIMARY KEY(job,object_id));
 CREATE TABLE IF NOT EXISTS vk_exclusions(subject TEXT PRIMARY KEY,reason TEXT NOT NULL);`));
 const get=key=>{const row=store.db.prepare('SELECT value FROM vk_meta WHERE key=?').get(key);return row?JSON.parse(row.value):null};
 const put=(key,value)=>store.db.prepare('INSERT INTO vk_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
 const job=(id,method,args)=>store.db.prepare('INSERT OR IGNORE INTO vk_jobs(id,method,args) VALUES(?,?,?)').run(id,method,JSON.stringify(args));
 if(get('from')!==null&&get('from')!==FROM)throw Error('VK transition window conflict');put('from',FROM);
 // One bounded replay after replacing total comment count with current-level count.
 if(get('backfill_page_count_version')!==2)store.tx(()=>{
  const rows=store.db.prepare("SELECT id FROM vk_jobs WHERE method='wall.getComments' AND phase IN('pending','partial') AND offset>0 AND expected_count IS NOT NULL").all();
  for(const row of rows){store.db.prepare('DELETE FROM vk_job_objects WHERE job=?').run(row.id);store.db.prepare("UPDATE vk_jobs SET offset=0,expected_count=NULL,phase='pending',failures=0,reason=NULL WHERE id=?").run(row.id)}
  put('backfill_page_count_version',2);if(rows.length)log({event:'vk_backfill_page_count_upgrade',reopened_jobs:rows.length});
 });
 const describe=(e,stage,method,credential)=>{
  if(e?.code==='ERR_SQLITE_ERROR')stage='storage';
  const allowed=['api_error','http_status','transport_or_json','response_limit','response_shape','method_or_target','not_started','stopped_or_deadline'];
  const reason=stage==='read'?(allowed.includes(e?.reason)?e.reason:'read_rejected'):stage==='page'?'page_rejected':stage==='normalize'?'object_rejected':'storage_rejected';
  return {stage,method,credential,reason,...(stage==='read'&&e?.reason==='api_error'&&Number.isSafeInteger(e.code)?{api_code:e.code}:{}),...(stage==='read'&&e?.reason==='http_status'&&Number.isSafeInteger(e.code)?{http_status:e.code}:{}),...(stage==='storage'&&Number.isSafeInteger(e?.errcode)?{sqlite_code:e.errcode}:{})};
 };

 let session,phase='armed',stopping=false,polling=false,backfilling=false,failures=0;
 const status=()=>{const until=get('until'),rows=store.db.prepare('SELECT id,phase,reason FROM vk_jobs ORDER BY id').all(),exclusions=store.db.prepare('SELECT * FROM vk_exclusions ORDER BY subject').all();const end=until===null?null:Math.max(until,...(get('gaps')??[]).map(g=>g.until));const complete=end!==null&&store.now()>=end&&get('final_sweep')===end&&rows.length>0&&rows.every(j=>j.phase==='done')&&exclusions.length===0;return {phase,cursor:store.cursor(SOURCE),window:{from:FROM,until},gaps:get('gaps')??[],backfill:{phase:complete?'complete':rows.some(j=>j.phase==='partial'||j.reason)||exclusions.length?'partial':until===null?'not_started':rows.every(j=>j.phase==='done')?'waiting_window_end':'pending',jobs:rows},coverage:{complete,scope:'accessible_rest_objects_for_window',transition_verified:false,provider_ids:store.db.prepare('SELECT DISTINCT provider_id FROM vk_seen ORDER BY provider_id').all().map(r=>r.provider_id),exclusions,not_covered:['group_join_during_gap','deleted_before_backfill','intermediate_edits','ostrov_unknown_replies']}}};
 store.vkStatus=()=>{const s=status();return {phase:s.phase,window:s.window,gaps:s.gaps.length,backfill:s.backfill.phase,jobs:s.backfill.jobs.length,completed_jobs:s.backfill.jobs.filter(j=>j.phase==='done').length,exclusions:s.coverage.exclusions.length}};
 const remember=(events,source)=>{for(const e of events)store.db.prepare('INSERT OR IGNORE INTO vk_seen VALUES(?,?)').run(e.provider_id,source)};
 const beginJobs=()=>{job('wall','wall.get',{domain:'naostrov',filter:'all',count:100});for(const filter of ['all','archive'])job('conversations:'+filter,'messages.getConversations',{group_id:VK_GROUP,filter,count:200})};
 const gap=reason=>store.tx(()=>{const gaps=get('gaps')??[];gaps.push({from:get('last_poll')??FROM,until:store.now()+600000,reason});put('gaps',gaps);store.db.exec('DELETE FROM vk_job_objects');store.db.prepare("UPDATE vk_jobs SET offset=0,expected_count=NULL,phase='pending',failures=0,reason=NULL").run();beginJobs();log({event:'vk_gap',reason})});
 async function start(){
  if(stopping||store.now()<OFF)throw Error('VK idle barrier rejected');
  for(let attempt=1;attempt<=3;attempt++){let stage='read';try{
   session=vkSession(await api.call('groups.getLongPollServer',{group_id:VK_GROUP}));stage='storage';
   if(store.cursor(SOURCE)===null)store.ingestBatch('anna',{source:SOURCE,expectedCursor:null,cursor:session.ts,events:[]});
   session.ts=store.cursor(SOURCE);phase='connecting';return;
  }catch(e){const detail=describe(e,stage,'groups.getLongPollServer','groupToken');log({event:'vk_start_failed',attempt,...detail});if(attempt===3){phase='halted';throw new VkStartupFailure(detail)}await pause(2000)}}
 }
 async function tick(){
  if(stopping||phase==='halted')return;if(polling)throw Error('VK poll already running');polling=true;let stage='read',method='groups.getLongPollServer';
  try{
   if(!session)await start();method='long_poll';const result=await api.poll(session,session.ts);stage='page';
   if(result?.failed){
    if(![1,2,3].includes(result.failed))throw Error('VK poll failure rejected');
    if(result.failed===1){if(!ts(result.ts))throw Error('VK cursor rejected');stage='storage';gap('failed1');session.ts=result.ts}
    else{stage='read';method='groups.getLongPollServer';const fresh=vkSession(await api.call(method,{group_id:VK_GROUP}));if(result.failed===3){stage='storage';method='long_poll';gap('failed3');session=fresh}else session={...fresh,ts:session.ts}}
    phase='gap';if(++failures>=3){phase='halted';throw Error('VK poll failed 3 times')}return;
   }
   if(!ts(result?.ts)||!Array.isArray(result.updates)||result.updates.length>1000||BigInt(result.ts)<BigInt(session.ts)||result.ts===session.ts&&result.updates.length)throw Error('VK poll response rejected');
   stage='normalize';const events=result.updates.map((u,i)=>normalize(u,result.ts,i)).filter(Boolean);stage='storage';const expectedCursor=store.cursor(SOURCE);
   const updateState=()=>{
    remember(events,'long_poll');put('last_poll',store.now());
    if(get('until')===null){put('until',store.now()+600000);beginJobs()}
   };
   stage='storage';if(result.ts!==expectedCursor)store.ingestBatch('anna',{source:SOURCE,expectedCursor,cursor:result.ts,events},updateState);
   else {if(events.length)throw Error('VK no-progress events rejected');store.tx(updateState)}
   session.ts=result.ts;phase='receiving';failures=0;
  }catch(e){log({event:'vk_poll_blocked',...describe(e,stage,method,'groupToken')});if(e.message?.includes('capacity'))phase='backpressure';else if(phase!=='halted'&&++failures>=3)phase='halted';throw e}finally{polling=false}
 }
 async function backfill({maxPages=100}={}){
  if(stopping||get('until')===null)return;if(backfilling)throw Error('VK backfill already running');if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100)throw Error('VK page budget rejected');backfilling=true;const deadline=performance.now()+120000;
  try{
   const end=Math.max(get('until'),...(get('gaps')??[]).map(g=>g.until));
   if(store.now()>=end&&get('final_sweep')!==end)store.tx(()=>{put('final_sweep',end);store.db.exec("UPDATE vk_jobs SET offset=0,expected_count=NULL,phase='pending',failures=0,reason=NULL; DELETE FROM vk_job_objects")});
   for(let page=0;page<maxPages&&!stopping&&performance.now()<deadline;page++){
    const j=store.db.prepare("SELECT * FROM vk_jobs WHERE phase='pending' ORDER BY rowid LIMIT 1").get();if(!j)break;
    const args=JSON.parse(j.args),client=j.method.startsWith('wall.')?wallApi:api,credential=j.method.startsWith('wall.')?'wallToken':'groupToken';let stage='read';
    try{
     const value=await client.call(j.method,{...args,offset:j.offset},{timeoutMs:Math.min(30000,deadline-performance.now())});
     stage='page';const count=j.method==='wall.getComments'&&value?.current_level_count!==undefined?value.current_level_count:value?.count;
     if(!Number.isSafeInteger(value?.count)||value.count<0||value.count>100000||!Number.isSafeInteger(count)||count<0||count>value.count||!Array.isArray(value.items)||value.items.length>args.count||value.items.length===0&&j.offset<count||j.expected_count!==null&&j.expected_count!==count)throw Error('VK incomplete or unstable page');
     const objectIds=value.items.map(o=>String(j.method==='messages.getConversations'?o?.conversation?.peer?.id:j.method==='messages.getHistory'?o?.conversation_message_id:o?.id));
     if(new Set(objectIds).size!==objectIds.length||j.offset+value.items.length>count)throw Error('VK repeated page');
     stage='storage';const repeated=objectIds.some(id=>store.db.prepare('SELECT 1 FROM vk_job_objects WHERE job=? AND object_id=?').get(j.id,id));stage='page';if(repeated)throw Error('VK repeated page');
     stage='storage';const until=Math.max(get('until'),...(get('gaps')??[]).map(g=>g.until));stage='normalize';const events=[],newJobs=[],excluded=[];
     for(const o of value.items){
      if(j.method==='messages.getConversations'){const peer=o?.conversation?.peer?.id;if(!Number.isSafeInteger(peer)||peer===0)throw Error('VK conversation rejected');if(Math.abs(peer)>=2000000000)excluded.push(['peer:'+peer,'group_chat_history_unavailable']);else newJobs.push(['history:'+peer,'messages.getHistory',{group_id:VK_GROUP,peer_id:peer,count:200,rev:0}]);continue}
      const kind=j.method==='wall.get'?'post':j.method==='wall.getComments'?'comment':'dm';
      const e=event(kind,o,{post:args.post_id,peer:args.peer_id});if(e.occurred_at>=FROM&&e.occurred_at<=until)events.push(e);
      if(kind==='post')newJobs.push(['comments:'+o.id,'wall.getComments',{owner_id:-VK_GROUP,post_id:o.id,count:100,sort:'asc',preview_length:0,thread_items_count:0}]);
      if(kind==='comment'&&!args.comment_id&&o.thread?.count>0)newJobs.push(['thread:'+args.post_id+':'+o.id,'wall.getComments',{owner_id:-VK_GROUP,post_id:args.post_id,comment_id:o.id,count:100,sort:'asc',preview_length:0,thread_items_count:0}]);
     }
     stage='storage';store.tx(()=>{for(const id of objectIds)store.db.prepare('INSERT INTO vk_job_objects VALUES(?,?)').run(j.id,id);for(const e of events)store.insertEvent('anna',e);remember(events,'backfill');for(const [id,method,params] of newJobs)job(id,method,params);for(const [subject,reason] of excluded)store.db.prepare('INSERT OR REPLACE INTO vk_exclusions VALUES(?,?)').run(subject,reason);const offset=j.offset+value.items.length;store.db.prepare('UPDATE vk_jobs SET offset=?,expected_count=?,phase=?,failures=0,reason=NULL WHERE id=?').run(offset,count,offset>=count?'done':'pending',j.id)});
    }catch(e){const capacity=e.message?.includes('capacity'),detail=describe(e,stage,j.method,credential);if(!capacity)store.db.prepare("UPDATE vk_jobs SET failures=failures+1,phase=CASE WHEN failures>=2 THEN 'partial' ELSE 'pending' END,reason=? WHERE id=?").run(stage+':'+detail.reason+(detail.api_code!==undefined?':'+detail.api_code:''),j.id);log({event:'vk_backfill_blocked',job:j.id,...detail,reason:capacity?'backpressure':detail.reason});break}
   }
  }finally{backfilling=false}
 }
 return {start,tick,backfill,status,stop(){stopping=true;phase='stopped';api.stop();if(wallApi!==api)wallApi.stop()}};
}
export async function startVkSubsystem(store,config,options={}){
 let receiver;try{receiver=createVkReceiver(store,config,options);await receiver.start()}catch(e){const detail=e instanceof VkStartupFailure?e.detail:{};store.vkStatus=()=>({phase:'halted',reason:'startup_rejected',...detail});(options.log??(r=>console.log(JSON.stringify(r))))({event:'vk_halted',reason:'startup_rejected',...detail});return null}
 let stopping=false;const abort=new AbortController();
 const poll=(async()=>{while(!stopping){try{await receiver.tick()}catch{(options.log??console.log)({event:'vk_poll_rejected'})}if(receiver.status().phase==='halted')break;try{await sleep(1000,undefined,{signal:abort.signal})}catch{}}})();
 const history=(async()=>{while(!stopping){try{await receiver.backfill()}catch{(options.log??console.log)({event:'vk_backfill_rejected'})}try{await sleep(60000,undefined,{signal:abort.signal})}catch{}}})();
 return {receiver,async stop(){stopping=true;abort.abort();receiver.stop();await Promise.allSettled([poll,history])}};
}
