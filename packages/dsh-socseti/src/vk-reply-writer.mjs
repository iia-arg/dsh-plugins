import crypto from 'node:crypto';
import {VkApi,VK_GROUP,readVkToken} from './vk-api.mjs';import {approvers} from './contract.mjs';import {hash,canonical} from './store.mjs';
const positive=n=>Number.isSafeInteger(n)&&n>0;
const fail=kind=>Object.assign(new Error('VK reply refused or outcome unconfirmed'),{kind});
function route(store,id,{checkExpiry=true}={}){
 const e=store.db.prepare('SELECT * FROM events WHERE id=?').get(id);
 if(store.profile!=='anna'||store.target('vk')!==String(VK_GROUP)||!e||e.platform!=='vk'||e.account_id!==String(VK_GROUP)||e.key_id!=='anna'||checkExpiry&&e.expires_at<=store.now())throw fail('refused');
 if(e.kind==='comment'){
  const post=new RegExp(`^wall:-${VK_GROUP}:([1-9][0-9]{0,15})$`).exec(e.conversation_id),comment=/^comment:([1-9][0-9]{0,15})$/.exec(e.subject_id);
  if(!post||!comment||!positive(Number(post[1]))||!positive(Number(comment[1])))throw fail('refused');
  const object=`comment:-${VK_GROUP}:${post[1]}:${comment[1]}`;if(e.provider_id!==object+':'+hash(e.text).slice(0,16))throw fail('refused');
  return {kind:'comment',method:'wall.createComment',object,args:{owner_id:-VK_GROUP,from_group:VK_GROUP,post_id:Number(post[1]),reply_to_comment:Number(comment[1])}};
 }
 if(e.kind==='dm'){
  const peer=/^peer:(-?[1-9][0-9]{0,15})$/.exec(e.conversation_id),message=/^message:([1-9][0-9]{0,15})$/.exec(e.subject_id);
  if(!peer||!message||!Number.isSafeInteger(Number(peer[1]))||Math.abs(Number(peer[1]))>=2000000000||!positive(Number(message[1])))throw fail('refused');
  const object=`dm:${peer[1]}:${message[1]}`;if(e.provider_id!==object+':'+hash(e.text).slice(0,16))throw fail('refused');
  return {kind:'dm',method:'messages.send',object,args:{group_id:VK_GROUP,peer_id:Number(peer[1])}};
 }
 throw fail('refused');
}
export class VkReplyApi{
 constructor(store,token,kind,options={}){if(!['comment','dm'].includes(kind))throw fail('configuration');this.store=store;this.kind=kind;this.transport=new VkApi(token,options)}
 stop(){this.transport.stop()}
 async call(method,args,{eventId,beforeSend=()=>true}={}){
  const r=route(this.store,eventId),fields=r.kind==='comment'?['owner_id','from_group','post_id','reply_to_comment','message','guid']:['group_id','peer_id','random_id','message'];
  if(r.kind!==this.kind||method!==r.method||!args||Object.keys(args).some(k=>!fields.includes(k))||Object.entries(r.args).some(([k,v])=>args[k]!==v)||typeof args.message!=='string'||!args.message.trim()||[...args.message].length>4096||Buffer.byteLength(args.message)>16384||Buffer.from(args.message).toString()!==args.message||r.kind==='comment'&&(typeof args.guid!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(args.guid))||r.kind==='dm'&&(!positive(args.random_id)||args.random_id>2147483647))throw fail('refused');
  const c=this.transport;let started=false;try{return await c.schedule(async budget=>{
   try{if(beforeSend()!==true||canonical(route(this.store,eventId))!==canonical(r)||budget.remaining()<=0)throw fail('deferred')}catch{throw fail('deferred')}
   const body=new URLSearchParams({...args,access_token:c.token,v:c.version});started=true;const d=await c.request('https://api.vk.com/method/'+method,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:budget.signal},budget.remaining());
   if(Object.hasOwn(d??{},'error')){if(d.error!==null&&typeof d.error==='object'&&!Array.isArray(d.error)&&positive(d.error.error_code)&&!Object.hasOwn(d,'response'))throw fail('rejected');throw fail('unknown')}
   if(r.kind==='comment'?!positive(d?.response?.comment_id):!Number.isSafeInteger(d?.response)||d.response<0)throw fail('unknown');return d.response;
  })}catch(e){if(!started)throw fail('deferred');throw e}
 }
 async verify(eventId,args,result,text){
  const r=route(this.store,eventId,{checkExpiry:false});if(r.kind!==this.kind||Object.entries(r.args).some(([k,v])=>args[k]!==v))throw fail('refused');
  if(r.kind==='comment'){
   if(!positive(result?.comment_id))throw fail('unverified');const v=await this.transport.call('wall.getComment',{owner_id:-VK_GROUP,comment_id:result.comment_id});
   if(!Array.isArray(v?.items)||v.items.length!==1)throw fail('unverified');const p=v.items[0];
   if(p.id!==result.comment_id||p.from_id!==-VK_GROUP||p.owner_id!==undefined&&p.owner_id!==-VK_GROUP||p.post_id!==undefined&&p.post_id!==r.args.post_id||p.reply_to_comment!==r.args.reply_to_comment||p.text!==text||p.deleted||p.is_deleted)throw fail('unverified');
   return {object:r.object,comment_id:p.id,from_id:p.from_id,text_hash:hash(p.text)};
  }
  const v=await this.transport.call('messages.getHistory',{group_id:VK_GROUP,peer_id:r.args.peer_id,count:200,offset:0,rev:0});
  if(!Number.isSafeInteger(v?.count)||v.count<0||!Array.isArray(v.items)||v.items.length>200)throw fail('unverified');const found=v.items.filter(p=>p.random_id===args.random_id);
  if(found.length!==1)throw fail('unverified');const p=found[0];
  if(p.peer_id!==r.args.peer_id||p.from_id!==-VK_GROUP||p.out!==1||!positive(p.conversation_message_id)||p.text!==text||result!==0&&p.id!==result)throw fail('unverified');
  return {object:r.object,peer_id:p.peer_id,conversation_message_id:p.conversation_message_id,from_id:p.from_id,random_id:p.random_id,text_hash:hash(p.text)};
 }
}
export function createVkReplyWriter(store,config,{commentApi,messageApi,log=record=>console.log(JSON.stringify(record))}={}){
 if(store.profile!=='anna'||store.target('vk')!==String(VK_GROUP)||config?.enabled!==true||!commentApi||!messageApi)throw fail('configuration');
 const db=store.db;let stopped=false,busy=false,failures=0;const inventoryKnown=Array.isArray(config.unknownReplyObjects);if(config.unknownReplyObjects!==undefined&&(!inventoryKnown||config.unknownReplyObjects.length>2000||config.unknownReplyObjects.some(x=>typeof x!=='string'||x.length>128||!(/^(comment:-127999849:[1-9][0-9]*:[1-9][0-9]*|dm:-?[1-9][0-9]*:[1-9][0-9]*)$/).test(x))))throw fail('configuration');
 store.tx(()=>db.exec(`CREATE TABLE IF NOT EXISTS vk_reply_actions(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES drafts(id),version INTEGER NOT NULL,event_id TEXT NOT NULL REFERENCES events(id),object_id TEXT NOT NULL,payload_hash TEXT NOT NULL,method TEXT NOT NULL,request_json TEXT NOT NULL,random_id INTEGER UNIQUE,state TEXT NOT NULL,result_json TEXT,verify_attempts INTEGER NOT NULL DEFAULT 0,receipt_json TEXT,created_at INTEGER NOT NULL,UNIQUE(draft_id,version));`));
 const recover=()=>store.tx(()=>db.exec("UPDATE drafts SET state='unknown' WHERE id IN(SELECT draft_id FROM vk_reply_actions WHERE state='sending'); UPDATE vk_reply_actions SET state='unknown' WHERE state='sending'; UPDATE vk_reply_actions SET state='verification_held' WHERE state='accepted' AND verify_attempts>=3"));
 function info(a,checkExpiry=true){const d=db.prepare('SELECT * FROM drafts WHERE id=?').get(a.draft_id),v=db.prepare('SELECT * FROM draft_versions WHERE draft_id=? AND version=?').get(a.draft_id,a.version);return {d,v,p:v?JSON.parse(v.payload_json):null,r:route(store,a.event_id,{checkExpiry})}}
 function args(r,p,id,random){return {...r.args,message:p.text,...(r.kind==='comment'?{guid:id}:{random_id:random})}}
 function binding(a,checkExpiry=true){
  const {d,v,p,r}=info(a,checkExpiry),request=JSON.parse(a.request_json);
  if(!d||!v||d.platform!=='vk'||d.kind!=='reply'||d.key_id!=='anna'||d.current_version!==a.version||d.event_id!==a.event_id||p.event_id!==a.event_id||d.account_id!==String(VK_GROUP)||p.account_id!==d.account_id||p.kind!=='reply'||p.platform!=='vk'||a.object_id!==r.object||a.method!==r.method||v.payload_hash!==a.payload_hash||hash(v.payload_json)!==a.payload_hash)throw fail('invalid');
  const e=db.prepare('SELECT * FROM events WHERE id=?').get(a.event_id);if(p.conversation_id!==e.conversation_id||p.subject_id!==e.subject_id||canonical(request)!==canonical(args(r,p,a.id,a.random_id)))throw fail('invalid');
  return {d,v,p,r};
 }
 function current(a,state,draftState){const row=db.prepare('SELECT * FROM vk_reply_actions WHERE id=?').get(a.id),d=db.prepare('SELECT state FROM drafts WHERE id=?').get(a.draft_id);return row?.state===state&&d?.state===draftState&&['draft_id','version','event_id','object_id','payload_hash','method','request_json','random_id'].every(k=>row[k]===a[k])}
 function valid(a,state='queued',draftState='approved_held_stage3'){
  if(!current(a,state,draftState))return 'lost';let d,r;try{({d,r}=binding(a))}catch{return 'invalid'};
  if(config.unknownReplyObjects.includes(r.object))return 'legacy_outcome_unconfirmed';
  if(db.prepare("SELECT 1 FROM vk_reply_actions WHERE object_id=? AND id<>? AND state IN('sending','accepted','unknown','verification_held')").get(r.object,a.id))return 'previous_outcome_unconfirmed';
  const ap=db.prepare("SELECT approver_id FROM approvals WHERE draft_id=? AND version=? AND payload_hash=? AND decision='approve' AND state='valid' ORDER BY created_at DESC LIMIT 1").get(d.id,a.version,a.payload_hash);
  if(!ap||!approvers().includes(ap.approver_id))return 'reapproval';if(d.expires_at<=store.now())return 'expired';return current(a,state,draftState)?'valid':'lost';
 }
 function refuse(a,reason){if(reason==='lost')return;store.tx(()=>{if(!current(a,'queued','approved_held_stage3')&&!current(a,'sending','publishing'))return;db.prepare('UPDATE vk_reply_actions SET state=? WHERE id=?').run(reason==='reapproval'?'awaiting_reapproval':['previous_outcome_unconfirmed','legacy_outcome_unconfirmed'].includes(reason)?'held':'failed',a.id);if(reason==='reapproval'){db.prepare("UPDATE approvals SET state='invalidated' WHERE draft_id=? AND state='valid'").run(a.draft_id);db.prepare("UPDATE drafts SET state='pending_approval' WHERE id=? AND state IN('approved_held_stage3','publishing')").run(a.draft_id)}else db.prepare("UPDATE drafts SET state=? WHERE id=? AND state IN('approved_held_stage3','publishing')").run(reason==='expired'?'expired':['previous_outcome_unconfirmed','legacy_outcome_unconfirmed'].includes(reason)?'held':'failed',a.draft_id)});log({event:'vk_reply_refused',draft_id:a.draft_id,reason})}
 function enqueue(){store.expire();for(const d of db.prepare("SELECT * FROM drafts WHERE platform='vk' AND kind='reply' AND state='approved_held_stage3' ORDER BY created_at LIMIT 100").all()){
  if(db.prepare('SELECT 1 FROM vk_reply_actions WHERE draft_id=? AND version=?').get(d.id,d.current_version)){db.prepare("UPDATE vk_reply_actions SET state='queued' WHERE draft_id=? AND version=? AND state='awaiting_reapproval'").run(d.id,d.current_version);continue}
  let r;try{r=route(store,d.event_id)}catch{db.prepare("UPDATE drafts SET state='failed' WHERE id=?").run(d.id);log({event:'vk_reply_target_refused',draft_id:d.id});continue}
  const v=db.prepare('SELECT * FROM draft_versions WHERE draft_id=? AND version=?').get(d.id,d.current_version),p=JSON.parse(v.payload_json),id=crypto.randomUUID();let random=null;
  if(r.kind==='dm'){for(let n=0;n<16;n++){const value=crypto.randomInt(1,2147483647);if(!db.prepare('SELECT 1 FROM vk_reply_actions WHERE random_id=?').get(value)){random=value;break}}if(random===null)throw fail('capacity')}
  db.prepare("INSERT INTO vk_reply_actions(id,draft_id,version,event_id,object_id,payload_hash,method,request_json,random_id,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,'queued',?)").run(id,d.id,d.current_version,d.event_id,r.object,v.payload_hash,r.method,JSON.stringify(args(r,p,id,random)),random,store.now());
 }}
 async function verify(a){let p,r;
  if(!current(a,'accepted','accepted_pending_verify'))return;
  try{({p,r}=binding(a,false))}catch{db.prepare("UPDATE vk_reply_actions SET state='verification_held' WHERE id=? AND state='accepted'").run(a.id);log({event:'vk_reply_verification_corrupt',draft_id:a.draft_id});return}
  const claimed=store.tx(()=>{if(!current(a,'accepted','accepted_pending_verify'))return false;return db.prepare("UPDATE vk_reply_actions SET verify_attempts=verify_attempts+1 WHERE id=? AND state='accepted' AND verify_attempts=? AND verify_attempts<3").run(a.id,a.verify_attempts).changes===1});if(!claimed)return;
  try{const api=r.kind==='comment'?commentApi:messageApi,receipt=await api.verify(a.event_id,JSON.parse(a.request_json),JSON.parse(a.result_json),p.text);if(receipt?.object!==a.object_id||receipt.from_id!==-VK_GROUP||receipt.text_hash!==hash(p.text))throw fail('unverified');store.tx(()=>{if(!current(a,'accepted','accepted_pending_verify'))return;binding(a,false);if(db.prepare("UPDATE vk_reply_actions SET state='verified',receipt_json=? WHERE id=? AND state='accepted'").run(JSON.stringify({...receipt,verified_at:store.now()}),a.id).changes!==1)return;db.prepare("UPDATE drafts SET state='published' WHERE id=? AND state='accepted_pending_verify'").run(a.draft_id)})}
  catch{if(a.verify_attempts+1>=3)db.prepare("UPDATE vk_reply_actions SET state='verification_held' WHERE id=? AND state='accepted'").run(a.id);log({event:'vk_reply_verification_unconfirmed',draft_id:a.draft_id,attempt:a.verify_attempts+1})}
 }
 async function tick(){if(!inventoryKnown||stopped||busy||failures>=3)return;busy=true;try{
  const accepted=db.prepare("SELECT * FROM vk_reply_actions WHERE state='accepted' AND verify_attempts<3 ORDER BY created_at,rowid LIMIT 1").get();if(accepted){await verify(accepted);return}
  approvers();store.tx(enqueue);failures=0;const a=db.prepare("SELECT * FROM vk_reply_actions WHERE state='queued' ORDER BY created_at,rowid LIMIT 1").get();if(!a)return;const reason=valid(a);if(reason!=='valid'){refuse(a,reason);return}
  const claimed=store.tx(()=>{if(!current(a,'queued','approved_held_stage3'))return false;if(db.prepare("UPDATE vk_reply_actions SET state='sending' WHERE id=? AND state='queued'").run(a.id).changes!==1)return false;if(db.prepare("UPDATE drafts SET state='publishing' WHERE id=? AND state='approved_held_stage3'").run(a.draft_id).changes!==1)throw fail('lost');return true});if(!claimed)return;const r=route(store,a.event_id),api=r.kind==='comment'?commentApi:messageApi;
  try{const result=await api.call(a.method,JSON.parse(a.request_json),{eventId:a.event_id,beforeSend:()=>{if(stopped)return false;const check=valid(a,'sending','publishing');if(check!=='valid'){refuse(a,check);return false}return true}});if(r.kind==='comment'?!positive(result?.comment_id):!Number.isSafeInteger(result)||result<0)throw fail('unknown');const accepted=store.tx(()=>{if(!current(a,'sending','publishing'))return false;if(db.prepare("UPDATE vk_reply_actions SET state='accepted',result_json=? WHERE id=? AND state='sending'").run(JSON.stringify(result),a.id).changes!==1)return false;db.prepare("UPDATE drafts SET state='accepted_pending_verify' WHERE id=? AND state='publishing'").run(a.draft_id);return true});if(accepted&&!stopped)await verify(db.prepare('SELECT * FROM vk_reply_actions WHERE id=?').get(a.id))}
  catch(e){if(db.prepare('SELECT state FROM vk_reply_actions WHERE id=?').get(a.id).state!=='sending')return;if(e.kind==='deferred'){store.tx(()=>{db.prepare('UPDATE vk_reply_actions SET state=? WHERE id=?').run(stopped?'queued':'held',a.id);db.prepare("UPDATE drafts SET state='approved_held_stage3' WHERE id=? AND state='publishing'").run(a.draft_id)});return}const state=['rejected','refused'].includes(e.kind)?'failed':'unknown';store.tx(()=>{db.prepare('UPDATE vk_reply_actions SET state=? WHERE id=?').run(state,a.id);db.prepare('UPDATE drafts SET state=? WHERE id=?').run(state,a.draft_id)});log({event:'vk_reply_'+state,draft_id:a.draft_id})}
 }catch{failures++;log({event:'vk_reply_preflight_unavailable',failures})}finally{busy=false}}
 recover();const worker={tick,recover,stop(){stopped=true;commentApi.stop();if(messageApi!==commentApi)messageApi.stop()},status(){return {ready:inventoryKnown&&!stopped&&failures<3,reason:inventoryKnown?null:'legacy_inventory_missing',scope:'vk_comment_and_private_dm_replies',halted:failures>=3,queue:Object.fromEntries(db.prepare('SELECT state,count(*) n FROM vk_reply_actions GROUP BY state').all().map(r=>[r.state,r.n]))}}};store.vkReplyStatus=worker.status;return worker;
}
export function startVkReplySubsystem(store,config){const commentApi=new VkReplyApi(store,readVkToken(config.commentToken),'comment',{version:config.apiVersion}),messageApi=new VkReplyApi(store,readVkToken(config.groupToken),'dm',{version:config.apiVersion});const worker=createVkReplyWriter(store,config,{commentApi,messageApi});let active=null;const run=()=>{if(!active)active=worker.tick().finally(()=>{active=null})};const timer=setInterval(run,5000);timer.unref();run();return {status:worker.status,async stop(){clearInterval(timer);worker.stop();await active}}}
