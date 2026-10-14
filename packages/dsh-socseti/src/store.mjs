import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import {LIMITS,PLATFORMS,approvers} from './contract.mjs';
export const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
export const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const capability=()=>crypto.randomBytes(32).toString('hex');
const ensureText=text=>{if(typeof text!=='string'||!text.trim()||Array.from(text).length>LIMITS.textCharacters||Buffer.byteLength(text)>LIMITS.textBytes||Buffer.from(text).toString()!==text)throw Error('text rejected')};
export class Store {
 constructor(stateDir,targets,{now=Date.now,profile='legacy'}={}){
  if(!['legacy','anna'].includes(profile))throw Error('profile rejected');
  approvers();this.profile=profile;this.targets=targets;this.now=now;process.umask(0o077);
  fs.mkdirSync(stateDir,{recursive:true,mode:0o700});const st=fs.lstatSync(stateDir);
  if(!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o777)!==0o700)throw Error('state directory owner/mode rejected');
  const file=path.join(stateDir,'socseti.sqlite');if(fs.existsSync(file)){const s=fs.lstatSync(file);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o777)!==0o600)throw Error('database owner/mode rejected')}
  this.db=new DatabaseSync(file);this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;');
  const version=this.db.prepare('PRAGMA user_version').get().user_version;if(![0,1,2,3].includes(version))throw Error('unknown schema version');
  this.db.exec(`CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,key_id TEXT NOT NULL,token_hash TEXT NOT NULL,platform TEXT NOT NULL,account_id TEXT NOT NULL,kind TEXT NOT NULL,event_id TEXT,current_version INTEGER NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS draft_versions(draft_id TEXT NOT NULL REFERENCES drafts(id),version INTEGER NOT NULL,payload_json TEXT NOT NULL,payload_hash TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(draft_id,version));
   CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES drafts(id),version INTEGER NOT NULL,payload_hash TEXT NOT NULL,approver_id INTEGER NOT NULL CHECK(typeof(approver_id)='integer' AND approver_id>0),decision TEXT NOT NULL CHECK(decision IN ('approve','reject')),state TEXT NOT NULL,update_id TEXT UNIQUE,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,kind TEXT NOT NULL,aggregate_id TEXT NOT NULL,version INTEGER NOT NULL,payload_json TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(kind,aggregate_id,version));
   CREATE TABLE IF NOT EXISTS requests(key_id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,response_json TEXT NOT NULL,PRIMARY KEY(key_id,request_id));
   CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,platform TEXT NOT NULL,provider_id TEXT NOT NULL,key_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,account_id TEXT NOT NULL,kind TEXT NOT NULL,conversation_id TEXT NOT NULL,subject_id TEXT NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,UNIQUE(platform,provider_id));
   `);if(version===0)this.db.exec('PRAGMA user_version=1');
  this.db.exec("CREATE TABLE IF NOT EXISTS store_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE INDEX IF NOT EXISTS outbox_by_event ON outbox(aggregate_id,kind,state); CREATE TABLE IF NOT EXISTS provider_cursors(source TEXT PRIMARY KEY,cursor TEXT NOT NULL,batch_hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS telegram_batches(cursor TEXT PRIMARY KEY,batch_hash TEXT NOT NULL,stored_events INTEGER NOT NULL,ignored_self INTEGER NOT NULL)");
  const saved=this.db.prepare("SELECT value FROM store_meta WHERE key='profile'").get();
  if(saved&&saved.value!==profile)throw Error('database profile mismatch');
  this.db.prepare("INSERT OR IGNORE INTO store_meta VALUES('profile',?)").run(profile);
  const oldApproval=this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='approvals'").get().sql;
  if(/CHECK\s*\(\s*approver_id\s+IN\s*\(/i.test(oldApproval))this.tx(()=>this.db.exec(`
   CREATE TABLE approvals_owner_setting(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES drafts(id),version INTEGER NOT NULL,payload_hash TEXT NOT NULL,approver_id INTEGER NOT NULL CHECK(typeof(approver_id)='integer' AND approver_id>0),decision TEXT NOT NULL CHECK(decision IN ('approve','reject')),state TEXT NOT NULL,update_id TEXT UNIQUE,created_at INTEGER NOT NULL);
   INSERT INTO approvals_owner_setting SELECT * FROM approvals;
   DROP TABLE approvals;
   ALTER TABLE approvals_owner_setting RENAME TO approvals;`));
 }
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}
 close(){this.db.close()}
 status(){return {...(this.metaStatus?{meta:this.metaStatus()}:{}),stage:2,external_io:Boolean(this.telegramStatus?.ready||this.vkPostStatus?.().ready||this.vkReplyStatus?.().ready),publishing:Boolean(this.vkReplyStatus?.().ready)||Boolean(this.vkPostStatus?.().ready)||Boolean(this.telegramStatus?.ready)&&(this.profile!=='anna'||this.telegramStatus?.writerEnabled===true),vk_post:this.vkPostStatus?.()??null,vk_reply:this.vkReplyStatus?.()??null,telegram:this.telegramStatus?{halted:this.telegramStatus.halted,reason:this.telegramStatus.reason??null,actions:this.telegramStatus.queue()}:null,vk:this.vkStatus?.()??null,event_delivery:this.profile==='anna'?'pending_anna_dispatch':'held_no_private_route',drafts:this.db.prepare('SELECT count(*) n FROM drafts').get().n,outbox:this.db.prepare("SELECT count(*) n FROM outbox WHERE state LIKE 'held_%'").get().n}}
 target(platform){if(!PLATFORMS.includes(platform)||!this.targets[platform])throw Error('platform not allowed');return this.targets[platform]}
 execute(keyId,tool,args){
  return this.tx(()=>{
   this.expire();const digest=hash(canonical({tool,args}));const old=this.db.prepare('SELECT * FROM requests WHERE key_id=? AND request_id=?').get(keyId,args.request_id);
   if(old){if(old.request_hash!==digest)throw Error('request_id conflict');return {...JSON.parse(old.response_json),replayed:true}}
   ensureText(args.text);let result;
   if(tool==='draft_post')result=this.create(keyId,args.platform,args.text,null);
   else if(tool==='draft_reply'){
    const event=this.db.prepare('SELECT * FROM events WHERE key_id=? AND token_hash=?').get(keyId,hash(args.event_token));
    if(!event||event.expires_at<=this.now()||event.account_id!==this.target(event.platform))throw Error('event not available');
    result=this.create(keyId,event.platform,args.text,event);
   }else if(tool==='revise_draft')result=this.revise(keyId,args);
   else throw Error('tool unavailable');
   this.db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(keyId,args.request_id,digest,JSON.stringify(result));return result;
  });
 }
 expire(){
  this.db.prepare("UPDATE drafts SET state='expired' WHERE state IN ('pending_approval','approved','approved_held_stage3') AND expires_at<=?").run(this.now());
  this.db.exec("UPDATE outbox SET state='expired' WHERE state='held_stage1' AND aggregate_id IN (SELECT id FROM drafts WHERE state='expired'); UPDATE approvals SET state='invalidated' WHERE state='valid' AND draft_id IN (SELECT id FROM drafts WHERE state='expired')");
 }
 create(keyId,platform,text,event){
  if(this.db.prepare("SELECT count(*) n FROM drafts WHERE key_id=? AND state NOT IN ('expired','published','rejected','failed')").get(keyId).n>=LIMITS.drafts)throw Error('draft capacity reached');
  const id=crypto.randomUUID(),token=capability(),now=this.now(),account=this.target(platform),kind=event?'reply':'post';
  this.db.prepare('INSERT INTO drafts VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,keyId,hash(token),platform,account,kind,event?.id??null,1,'pending_approval',now,this.profile==='anna'?Number.MAX_SAFE_INTEGER:now+LIMITS.ttlMs);
  const payload={platform,account_id:account,kind,text,event_id:event?.id??null,conversation_id:event?.conversation_id??null,subject_id:event?.subject_id??null};
  const digest=this.version(id,1,payload,now);return {draft_id:id,draft_token:token,version:1,state:'pending_approval',payload_sha256:digest,approval_required:true,published:false};
 }
 version(id,version,payload,now){
  const json=canonical(payload),digest=hash(json);this.db.prepare('INSERT INTO draft_versions VALUES(?,?,?,?,?)').run(id,version,json,digest,now);
  const nonce=crypto.randomBytes(16).toString('hex');const card={draft_id:id,version,payload_sha256:digest,payload,...this.profile==='anna'?{bot:'@anna_arg_bot',approval_chat_id:-1001659691422}:{},buttons:[{text:'Опубликовать',callback_data:'publish:'+nonce},{text:'Отклонить',callback_data:'reject:'+nonce}]};
  this.db.prepare('INSERT INTO outbox VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),'approval_card_request',id,version,JSON.stringify(card),'held_stage1',now);return digest;
 }
 revise(keyId,args){
  const row=this.db.prepare('SELECT * FROM drafts WHERE id=? AND key_id=? AND token_hash=?').get(args.draft_id,keyId,hash(args.draft_token));
  if(!row||row.state!=='pending_approval'||row.expires_at<=this.now()||row.account_id!==this.target(row.platform))throw Error('draft not available');
  if(row.current_version!==args.expected_version)throw Error('version conflict');if(row.current_version>=LIMITS.versions)throw Error('version capacity reached');
  const old=this.db.prepare('SELECT payload_json FROM draft_versions WHERE draft_id=? AND version=?').get(row.id,row.current_version);const payload={...JSON.parse(old.payload_json),text:args.text};const version=row.current_version+1;
  this.db.prepare("UPDATE approvals SET state='invalidated' WHERE draft_id=? AND state='valid'").run(row.id);
  this.db.prepare("UPDATE outbox SET state='superseded' WHERE kind='approval_card_request' AND aggregate_id=? AND state='held_stage1'").run(row.id);
  this.db.prepare('UPDATE drafts SET current_version=?,expires_at=? WHERE id=?').run(version,this.profile==='anna'?Number.MAX_SAFE_INTEGER:row.expires_at,row.id);const digest=this.version(row.id,version,payload,this.now());
  return {draft_id:row.id,version,state:'pending_approval',payload_sha256:digest,approval_required:true,published:false};
 }
 // Trusted in-process ingress for future provider adapters. NOT an HTTP/MCP method.
 ingestEvent(keyId,event){return this.tx(()=>this.insertEvent(keyId,event))}
 pendingAnna(){
  if(this.profile!=='anna')throw Error('Anna delivery unavailable');
  return this.db.prepare("SELECT id,payload_json FROM outbox WHERE kind='anna_event' AND state='held_no_private_route' ORDER BY created_at,rowid LIMIT 20").all().map(r=>({id:r.id,payload_hash:hash(canonical(JSON.parse(r.payload_json))),payload:JSON.parse(r.payload_json)}));
 }
 acknowledgeAnna(id,digest){return this.tx(()=>{
  if(this.profile!=='anna'||typeof id!=='string'||typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))throw Error('delivery rejected');
  const row=this.db.prepare("SELECT * FROM outbox WHERE id=? AND kind='anna_event'").get(id);
  if(!row||hash(canonical(JSON.parse(row.payload_json)))!==digest)throw Error('delivery conflict');
  if(!['held_no_private_route','delivered'].includes(row.state))throw Error('delivery conflict');
  this.db.prepare("UPDATE outbox SET state='delivered' WHERE id=?").run(id);return {acknowledged:true};
 })}
 cursor(source){return this.db.prepare('SELECT cursor FROM provider_cursors WHERE source=?').get(source)?.cursor??null}
 // Telegram offset belongs to MessageReceipts. This is max admitted ID, NOT a complete frontier.
 ingestTelegramBatch(keyId,batch){
  const {source,expectedCursor,cursor,events}=batch;
  if(this.profile!=='anna'||keyId!=='anna'||source!==`telegram:${this.target('telegram')}`||typeof cursor!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(cursor)||(!Number.isSafeInteger(Number(cursor))||Number(cursor)>=Number.MAX_SAFE_INTEGER)||expectedCursor!==null&&(typeof expectedCursor!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(expectedCursor)||!Number.isSafeInteger(Number(expectedCursor))||Number(expectedCursor)>=Number.MAX_SAFE_INTEGER)||!Array.isArray(events)||events.length>1000)throw Error('Telegram batch rejected');
  if(events.some(e=>e.platform!=='telegram'||e.account_id!==this.target('telegram')))throw Error('Telegram source rejected');
  return this.tx(()=>{
   const digest=hash(canonical({keyId,...batch})),prior=this.db.prepare('SELECT * FROM telegram_batches WHERE cursor=?').get(cursor);
   if(prior){if(prior.batch_hash!==digest)throw Error('Telegram batch conflict');return {accepted:events.length,stored_events:prior.stored_events,ignored_self:prior.ignored_self,replayed:true}}
   let stored=0,ignored=0;
   for(const event of events){this.validateEvent(keyId,event);if(this.ownTelegramPost(event)){ignored++;continue}if(!this.insertEvent(keyId,event).duplicate)stored++}
   this.db.prepare('INSERT INTO telegram_batches VALUES(?,?,?,?)').run(cursor,digest,stored,ignored);
   const max=this.cursor(source);if(max===null||BigInt(cursor)>BigInt(max))this.db.prepare('INSERT INTO provider_cursors VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,batch_hash=excluded.batch_hash').run(source,cursor,digest);
   return {accepted:events.length,stored_events:stored,ignored_self:ignored,replayed:false};
  });
 }
 ownTelegramPost(event){
  const match=/^post:(-[0-9]+):([1-9][0-9]*)$/.exec(event.provider_id);
  if(event.kind!=='post'||!match||match[1]!==this.target('telegram')||!Number.isSafeInteger(Number(match[2]))||!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='tg_actions'").get())return false;
  return Boolean(this.db.prepare("SELECT 1 FROM tg_actions WHERE kind='publication' AND state='sent' AND json_valid(result_json) AND CAST(json_extract(result_json,'$.chat_id') AS TEXT)=? AND json_extract(result_json,'$.message_id')=? AND json_extract(result_json,'$.text')=?").get(match[1],Number(match[2]),event.text));
 }
 ingestBatch(keyId,{source,expectedCursor,cursor,events},updateState=()=>{}){
  if(typeof updateState!=='function')throw Error('ingress state callback rejected');
  if(this.profile!=='anna'||keyId!=='anna'||typeof source!=='string'||!/^([a-z]+):([0-9-]+)$/.test(source)||
    typeof cursor!=='string'||!cursor||cursor.length>256||expectedCursor!==null&&(typeof expectedCursor!=='string'||!expectedCursor||expectedCursor.length>256)||!Array.isArray(events)||events.length>1000)throw Error('ingress batch rejected');
  const [platform,account]=source.split(':');if(account!==this.target(platform)||events.some(e=>e.platform!==platform||e.account_id!==account))throw Error('ingress source rejected');
  return this.tx(()=>{
   const digest=hash(canonical({keyId,source,expectedCursor,cursor,events}));const previous=this.db.prepare('SELECT * FROM provider_cursors WHERE source=?').get(source);
   if(previous?.cursor===cursor){if(previous.batch_hash!==digest)throw Error('cursor conflict');updateState();return {accepted:events.length,replayed:true}}
   if((previous?.cursor??null)!==expectedCursor)throw Error('cursor conflict');
   for(const event of events)this.insertEvent(keyId,event);
   this.db.prepare('INSERT INTO provider_cursors VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,batch_hash=excluded.batch_hash').run(source,cursor,digest);
   updateState();return {accepted:events.length,replayed:false};
  });
 }
 validateEvent(keyId,event){
  if(this.profile==='anna'&&keyId!=='anna')throw Error('Anna ingress recipient rejected');
  if(event.occurred_at!==undefined&&(!Number.isSafeInteger(event.occurred_at)||event.occurred_at<0))throw Error('event time rejected');
  if(this.profile==='anna'){if(typeof event.text!=='string'||!event.text.trim()||Array.from(event.text).length>65536||Buffer.byteLength(event.text)>262144||Buffer.from(event.text).toString()!==event.text)throw Error('event text rejected')}else ensureText(event.text);if(!(this.profile==='anna'?['dm','comment','post','edited_post','join']:['dm','comment']).includes(event.kind)||event.account_id!==this.target(event.platform))throw Error('event target rejected');
  for(const key of ['provider_id','conversation_id','subject_id'])if(typeof event[key]!=='string'||!event[key]||event[key].length>128)throw Error('event identity rejected');
 }
 insertEvent(keyId,event){
  this.validateEvent(keyId,event);
   const old=this.db.prepare('SELECT * FROM events WHERE platform=? AND provider_id=?').get(event.platform,event.provider_id);
   if(old){if(old.key_id!==keyId||['account_id','kind','conversation_id','subject_id','text'].some(k=>old[k]!==event[k]))throw Error('event conflict');return {event_id:old.id,duplicate:true}};
   const pending=this.profile==='anna'?this.db.prepare("SELECT count(*) n FROM events e WHERE EXISTS (SELECT 1 FROM outbox o WHERE o.aggregate_id=e.id AND o.kind IN ('anna_event','event_card_request') AND o.state NOT IN ('delivered','tg_sent'))").get().n:this.db.prepare('SELECT count(*) n FROM events').get().n;
   if(pending>=(this.profile==='anna'?30000:LIMITS.events))throw Error('event capacity reached');
   const id=crypto.randomUUID(),token=capability(),now=this.now();this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,event.platform,event.provider_id,keyId,hash(token),event.account_id,event.kind,event.conversation_id,event.subject_id,event.text,now,this.profile==='anna'?Number.MAX_SAFE_INTEGER:now+LIMITS.ttlMs);
   const envelope={occurred_at:event.occurred_at??now,received_at:now,recipient:keyId,event_id:id,event_token:token,platform:event.platform,kind:event.kind,conversation_id:event.conversation_id,subject_id:event.subject_id,text:event.text,trust:'external_untrusted_data',memory:'socseti_private_only',delivery_requires:this.profile==='anna'?'anna_channel_ack':'verified_private_route_no_omega'};
   this.db.prepare('INSERT INTO outbox VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),this.profile==='anna'?'anna_event':'varvara_event',id,1,JSON.stringify(envelope),'held_no_private_route',now);
   if(this.profile==='anna')this.db.prepare('INSERT INTO outbox VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),'event_card_request',id,1,JSON.stringify({event_id:id,platform:event.platform,kind:event.kind,conversation_id:event.conversation_id,subject_id:event.subject_id,text:event.text,received_at:now,occurred_at:event.occurred_at??now,trust:'external_untrusted_data'}),'held_stage1',now);
   return {event_id:id,duplicate:false};
 }
}
