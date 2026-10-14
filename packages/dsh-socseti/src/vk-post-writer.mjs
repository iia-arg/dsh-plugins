import crypto from 'node:crypto';
import {VkApi,VK_GROUP,readVkToken} from './vk-api.mjs';import {approvers} from './contract.mjs';import {hash,canonical} from './store.mjs';
const positive=n=>Number.isSafeInteger(n)&&n>0;
const failure=kind=>Object.assign(new Error('VK post refused or outcome unconfirmed'),{kind});
export class VkPostApi{
 constructor(token,options={}){this.transport=new VkApi(token,options)}
 stop(){this.transport.stop()}
 async call(method,args,{beforeSend=()=>true}={}){
  if(method!=='wall.post'||!args||Object.keys(args).some(k=>!['owner_id','from_group','message','guid'].includes(k))||args.owner_id!==-VK_GROUP||args.from_group!==1||typeof args.message!=='string'||!args.message.trim()||[...args.message].length>4096||Buffer.byteLength(args.message)>16384||Buffer.from(args.message).toString()!==args.message||typeof args.guid!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(args.guid))throw failure('refused');
  const c=this.transport;let wireStarted=false;try{return await c.schedule(async budget=>{const body=new URLSearchParams({...args,access_token:c.token,v:c.version});
  try{if(beforeSend()!==true)throw failure('deferred')}catch{throw failure('deferred')}
  if(budget.remaining()<=0)throw failure('deferred');wireStarted=true;
  const data=await c.request('https://api.vk.com/method/wall.post',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:budget.signal},budget.remaining());
  if(Object.hasOwn(data??{},'error')){if(data.error!==null&&typeof data.error==='object'&&!Array.isArray(data.error)&&positive(data.error.error_code)&&!Object.hasOwn(data,'response'))throw failure('rejected');throw failure('unknown')}if(!positive(data?.response?.post_id))throw failure('unknown');return data.response;})}catch(e){if(!wireStarted)throw failure('deferred');throw e}
 }
 async verify(postId,text){
  if(!positive(postId))throw failure('refused');const result=await this.transport.call('wall.getById',{posts:`-${VK_GROUP}_${postId}`});
  const items=result?.items;if(!Array.isArray(items)||items.length!==1)throw failure('unverified');const p=items[0];
  if(p.id!==postId||p.owner_id!==-VK_GROUP||p.from_id!==-VK_GROUP||p.text!==text||p.is_deleted||p.post_type==='suggest'||p.post_type==='postpone')throw failure('unverified');
  return {post_id:p.id,owner_id:p.owner_id,from_id:p.from_id,text_hash:hash(p.text)};
 }
}
export function createVkPostWriter(store,config,{api,log=record=>console.log(JSON.stringify(record))}={}){
 if(store.profile!=='anna'||store.targets.vk!==String(VK_GROUP)||config?.enabled!==true||!api)throw failure('configuration');
 const db=store.db;let stopping=false,busy=false,failures=0;
 store.tx(()=>db.exec(`CREATE TABLE IF NOT EXISTS vk_post_actions(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES drafts(id),version INTEGER NOT NULL,payload_hash TEXT NOT NULL,request_json TEXT NOT NULL,state TEXT NOT NULL,post_id INTEGER,verify_attempts INTEGER NOT NULL DEFAULT 0,receipt_json TEXT,created_at INTEGER NOT NULL,UNIQUE(draft_id,version));`));
 function recover(){store.tx(()=>db.exec("UPDATE drafts SET state='unknown' WHERE id IN(SELECT draft_id FROM vk_post_actions WHERE state='sending'); UPDATE vk_post_actions SET state='unknown' WHERE state='sending'; UPDATE vk_post_actions SET state='verification_held' WHERE state='accepted' AND verify_attempts>=3"))}
 function data(a){const d=db.prepare('SELECT * FROM drafts WHERE id=?').get(a.draft_id),v=db.prepare('SELECT * FROM draft_versions WHERE draft_id=? AND version=?').get(a.draft_id,a.version);return {d,v,p:v?JSON.parse(v.payload_json):null}}
 function current(a,state,draftState){const row=db.prepare('SELECT * FROM vk_post_actions WHERE id=?').get(a.id),d=db.prepare('SELECT state FROM drafts WHERE id=?').get(a.draft_id);return row?.state===state&&d?.state===draftState&&['draft_id','version','payload_hash','request_json','post_id'].every(k=>row[k]===a[k])}
 function valid(a,state='queued',draftState='approved_held_stage3'){
  if(!current(a,state,draftState))return 'lost';
  let d,v,p,request;try{({d,v,p}=data(a));request=JSON.parse(a.request_json)}catch{return 'invalid'};
  if(store.targets.vk!==String(VK_GROUP)||!d||!v||d.platform!=='vk'||d.kind!=='post'||d.account_id!==String(VK_GROUP)||d.current_version!==a.version||v.payload_hash!==a.payload_hash||hash(v.payload_json)!==a.payload_hash||p.platform!=='vk'||p.kind!=='post'||p.account_id!==String(VK_GROUP)||canonical(request)!==canonical({owner_id:-VK_GROUP,from_group:1,message:p.text,guid:a.id}))return 'invalid';
  const approval=db.prepare("SELECT approver_id FROM approvals WHERE draft_id=? AND version=? AND payload_hash=? AND decision='approve' AND state='valid' ORDER BY created_at DESC LIMIT 1").get(a.draft_id,a.version,a.payload_hash);
  if(!approval||!approvers().includes(approval.approver_id))return 'reapproval';if(d.expires_at<=store.now())return 'expired';return current(a,state,draftState)?'valid':'lost';
 }
 function refuse(a,reason){if(reason==='lost')return;store.tx(()=>{
  if(!current(a,'queued','approved_held_stage3')&&!current(a,'sending','publishing'))return;
  db.prepare('UPDATE vk_post_actions SET state=? WHERE id=?').run(reason==='reapproval'?'awaiting_reapproval':'failed',a.id);
  if(reason==='reapproval'){db.prepare("UPDATE approvals SET state='invalidated' WHERE draft_id=? AND state='valid'").run(a.draft_id);db.prepare("UPDATE drafts SET state='pending_approval' WHERE id=? AND state IN('approved_held_stage3','publishing')").run(a.draft_id)}
  else db.prepare("UPDATE drafts SET state=? WHERE id=? AND state IN('approved_held_stage3','publishing')").run(reason==='expired'?'expired':'failed',a.draft_id);
 });log({event:'vk_post_refused',draft_id:a.draft_id,reason})}
 function enqueue(){store.expire();for(const d of db.prepare("SELECT * FROM drafts WHERE platform='vk' AND kind='post' AND state='approved_held_stage3' ORDER BY created_at LIMIT 100").all()){
  const v=db.prepare('SELECT * FROM draft_versions WHERE draft_id=? AND version=?').get(d.id,d.current_version),p=JSON.parse(v.payload_json),id=crypto.randomUUID();
  db.prepare("INSERT INTO vk_post_actions(id,draft_id,version,payload_hash,request_json,state,created_at) VALUES(?,?,?,?,?,'queued',?) ON CONFLICT(draft_id,version) DO UPDATE SET state='queued' WHERE vk_post_actions.state='awaiting_reapproval' AND vk_post_actions.payload_hash=excluded.payload_hash").run(id,d.id,d.current_version,v.payload_hash,JSON.stringify({owner_id:-VK_GROUP,from_group:1,message:p.text,guid:id}),store.now());
 }}
 async function verify(a){
  if(!current(a,'accepted','accepted_pending_verify'))return;
  let v,p;try{({v,p}=data(a))}catch{db.prepare("UPDATE vk_post_actions SET state='verification_held' WHERE id=? AND state='accepted'").run(a.id);return}if(!v||hash(v.payload_json)!==a.payload_hash){db.prepare("UPDATE vk_post_actions SET state='verification_held' WHERE id=? AND state='accepted'").run(a.id);return}
  const claimed=store.tx(()=>{if(!current(a,'accepted','accepted_pending_verify'))return false;return db.prepare("UPDATE vk_post_actions SET verify_attempts=verify_attempts+1 WHERE id=? AND state='accepted' AND verify_attempts=? AND verify_attempts<3").run(a.id,a.verify_attempts).changes===1});if(!claimed)return;
  try{const receipt=await api.verify(a.post_id,p.text);if(receipt?.post_id!==a.post_id||receipt.owner_id!==-VK_GROUP||receipt.from_id!==-VK_GROUP||receipt.text_hash!==hash(p.text))throw failure('unverified');store.tx(()=>{if(!current(a,'accepted','accepted_pending_verify'))return;if(db.prepare("UPDATE vk_post_actions SET state='verified',receipt_json=? WHERE id=? AND state='accepted'").run(JSON.stringify({...receipt,verified_at:store.now()}),a.id).changes!==1)return;db.prepare("UPDATE drafts SET state='published' WHERE id=? AND state='accepted_pending_verify'").run(a.draft_id)})}
  catch{if(a.verify_attempts+1>=3)db.prepare("UPDATE vk_post_actions SET state='verification_held' WHERE id=? AND state='accepted'").run(a.id);log({event:'vk_post_verification_unconfirmed',draft_id:a.draft_id,attempt:a.verify_attempts+1})}
 }
 async function tick(){if(stopping||busy||failures>=3)return;busy=true;
  try{
   const accepted=db.prepare("SELECT * FROM vk_post_actions WHERE state='accepted' AND verify_attempts<3 ORDER BY created_at LIMIT 1").get();if(accepted){await verify(accepted);return}
   approvers();store.tx(enqueue);failures=0;const a=db.prepare("SELECT * FROM vk_post_actions WHERE state='queued' ORDER BY created_at LIMIT 1").get();if(!a)return;
   const reason=valid(a);if(reason!=='valid'){refuse(a,reason);return}
   const claimed=store.tx(()=>{if(!current(a,'queued','approved_held_stage3'))return false;if(db.prepare("UPDATE vk_post_actions SET state='sending' WHERE id=? AND state='queued'").run(a.id).changes!==1)return false;if(db.prepare("UPDATE drafts SET state='publishing' WHERE id=? AND state='approved_held_stage3'").run(a.draft_id).changes!==1)throw failure('lost');return true});if(!claimed)return;
   try{
    const result=await api.call('wall.post',JSON.parse(a.request_json),{beforeSend:()=>{if(stopping)return false;const reason=valid(a,'sending','publishing');if(reason!=='valid'){refuse(a,reason);return false}return true}});
    if(!positive(result?.post_id))throw failure('unknown');
    const accepted=store.tx(()=>{if(!current(a,'sending','publishing'))return false;if(db.prepare("UPDATE vk_post_actions SET state='accepted',post_id=? WHERE id=? AND state='sending'").run(result.post_id,a.id).changes!==1)return false;db.prepare("UPDATE drafts SET state='accepted_pending_verify' WHERE id=? AND state='publishing'").run(a.draft_id);return true});
    if(accepted&&!stopping)await verify(db.prepare('SELECT * FROM vk_post_actions WHERE id=?').get(a.id));
   }catch(e){
    const state=db.prepare('SELECT state FROM vk_post_actions WHERE id=?').get(a.id).state;if(state!=='sending')return;
    if(e.kind==='deferred'){store.tx(()=>{db.prepare("UPDATE vk_post_actions SET state=? WHERE id=?").run(stopping?'queued':'held',a.id);db.prepare("UPDATE drafts SET state='approved_held_stage3' WHERE id=? AND state='publishing'").run(a.draft_id)});return}
    const outcome=['refused','rejected'].includes(e.kind)?'failed':'unknown';store.tx(()=>{db.prepare('UPDATE vk_post_actions SET state=? WHERE id=?').run(outcome,a.id);db.prepare('UPDATE drafts SET state=? WHERE id=?').run(outcome,a.draft_id)});log({event:'vk_post_'+outcome,draft_id:a.draft_id});
   }
  }catch{failures++;log({event:'vk_post_preflight_unavailable',failures,halted:failures>=3})}finally{busy=false}
 }
 recover();const worker={tick,recover,stop(){stopping=true;api.stop()},status(){return {ready:!stopping&&failures<3,scope:'vk_text_posts_only',halted:failures>=3,queue:Object.fromEntries(db.prepare('SELECT state,count(*) n FROM vk_post_actions GROUP BY state').all().map(r=>[r.state,r.n]))}}};store.vkPostStatus=worker.status;return worker;
}
export function startVkPostSubsystem(store,config){const api=new VkPostApi(readVkToken(config.token),{version:config.apiVersion??'5.199'}),worker=createVkPostWriter(store,config,{api});let active=null;const run=()=>{if(active)return;active=worker.tick().finally(()=>{active=null})};const timer=setInterval(run,5000);timer.unref();run();return {async stop(){clearInterval(timer);worker.stop();await active},status:worker.status}}
