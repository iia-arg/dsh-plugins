import crypto from 'node:crypto';
import {approvers} from './contract.mjs';
import {hash,canonical} from './store.mjs';
const positive=x=>Number.isSafeInteger(x)&&x>0;
export class TelegramQueue {
 constructor(store,config){
  this.store=store;this.db=store.db;this.config=config;this.hourly=store.profile==='anna';
  if(this.hourly&&config.approvalChatId!==-1001659691422)throw Error('Anna Marketing target rejected');
  if(!Number.isSafeInteger(config.approvalChatId)||config.approvalChatId>=0||!positive(config.botId))throw Error('Telegram policy rejected');
  store.tx(()=>this.db.exec(`CREATE TABLE IF NOT EXISTS tg_actions(
   id TEXT PRIMARY KEY,kind TEXT NOT NULL,draft_id TEXT NOT NULL REFERENCES drafts(id),version INTEGER NOT NULL,
   payload_hash TEXT NOT NULL,nonce TEXT UNIQUE,request_json TEXT NOT NULL,state TEXT NOT NULL,
   attempts INTEGER NOT NULL DEFAULT 0,not_before INTEGER NOT NULL DEFAULT 0,result_json TEXT,
   created_at INTEGER NOT NULL,UNIQUE(kind,draft_id,version));
   CREATE TABLE IF NOT EXISTS tg_event_actions(
   id TEXT PRIMARY KEY,kind TEXT NOT NULL,event_id TEXT NOT NULL UNIQUE REFERENCES events(id),draft_id TEXT,version INTEGER NOT NULL,
   payload_hash TEXT NOT NULL,nonce TEXT UNIQUE,request_json TEXT NOT NULL,state TEXT NOT NULL,
   attempts INTEGER NOT NULL DEFAULT 0,not_before INTEGER NOT NULL DEFAULT 0,result_json TEXT,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS tg_updates(update_id INTEGER PRIMARY KEY,update_hash TEXT NOT NULL,decision TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS tg_meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
   INSERT OR IGNORE INTO tg_meta VALUES('offset',0);PRAGMA user_version=3;
   CREATE TABLE IF NOT EXISTS tg_batches(slot INTEGER PRIMARY KEY);
   CREATE TABLE IF NOT EXISTS tg_batch_items(outbox_id TEXT PRIMARY KEY REFERENCES outbox(id),slot INTEGER NOT NULL REFERENCES tg_batches(slot));`));
 }
 cardSlot(){
  const now=this.store.now();const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(now));
  return hour>=9&&hour<=23?Math.floor(now/3600000)*3600000:null;
 }
 enqueueCards(){return this.store.tx(()=>{
  this.store.expire();let count=0;
  if(this.hourly){
   const slot=this.cardSlot();if(slot===null)return 0;
   if(this.db.prepare('INSERT OR IGNORE INTO tg_batches VALUES(?)').run(slot).changes){
    this.db.prepare("INSERT OR IGNORE INTO tg_batch_items SELECT o.id,? FROM outbox o LEFT JOIN drafts d ON d.id=o.aggregate_id WHERE o.state='held_stage1' AND (o.kind='event_card_request' OR o.kind='approval_card_request' AND d.state='pending_approval' AND d.current_version=o.version) AND o.created_at<=?").run(slot,slot);
   }
  }
  const rows=this.db.prepare("SELECT o.* FROM outbox o JOIN drafts d ON d.id=o.aggregate_id WHERE o.kind='approval_card_request' AND o.state='held_stage1' AND d.state='pending_approval' AND d.current_version=o.version AND (?=0 OR o.id IN (SELECT outbox_id FROM tg_batch_items)) ORDER BY o.created_at,o.rowid LIMIT 20").all(this.hourly?1:0);
  for(const row of rows){
   const card=JSON.parse(row.payload_json),nonce=card.buttons[0].callback_data.slice(8);
   const payload=card.payload,header=`Черновик ${card.draft_id}\nВерсия ${card.version}\n${payload.platform} / ${payload.account_id}\nSHA256 ${card.payload_sha256}`;
   const address=payload.kind==='reply'?`\nТип: reply\nСобытие: ${payload.event_id}\nДиалог: ${payload.conversation_id}\nАдресат: ${payload.subject_id}`:'\nТип: post';
   const full=header+address+'\n\n'+payload.text;const args={chat_id:this.config.approvalChatId,reply_markup:{inline_keyboard:[card.buttons]}};
   const request=full.length<=4096?{method:'sendMessage',args:{...args,text:full}}:{method:'sendDocument',args:{...args,caption:header+address+'\nПолный текст — в приложенном draft.txt.'},documentText:full};
   this.insert('card',row.aggregate_id,row.version,card.payload_sha256,nonce,request);
   this.db.prepare("UPDATE outbox SET state='tg_queued' WHERE id=?").run(row.id);count++;
  }
  if(this.hourly){
   const events=this.db.prepare("SELECT o.* FROM outbox o JOIN tg_batch_items b ON b.outbox_id=o.id WHERE o.kind='event_card_request' AND o.state='held_stage1' ORDER BY o.created_at,o.rowid LIMIT 20").all();
   for(const row of events){
    const payload=JSON.parse(row.payload_json),digest=hash(canonical(payload)),nonce=crypto.randomBytes(16).toString('hex');
    const time=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}).format(payload.occurred_at??payload.received_at);
    const full=`Событие ${payload.event_id}\n${time} МСК\n${payload.platform} / ${payload.kind}\nДиалог: ${payload.conversation_id}\nАвтор: ${payload.subject_id}\nSHA256 ${digest}\nВнешние данные; разрешение на ответ не выдано.\n\n${payload.text}`;
    const args={chat_id:this.config.approvalChatId,reply_markup:{inline_keyboard:[[{text:'Ознакомлен',callback_data:'observe:'+nonce}]]}};
    const request=full.length<=4096?{method:'sendMessage',args:{...args,text:full}}:{method:'sendDocument',args:{...args,caption:`Событие ${payload.event_id}\n${time} МСК\nSHA256 ${digest}\nПолный текст — в event.txt.`},documentText:full};
    this.db.prepare('INSERT INTO tg_event_actions(id,kind,event_id,version,payload_hash,nonce,request_json,state,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),'event_card',row.aggregate_id,1,digest,nonce,JSON.stringify(request),'queued',this.store.now());
    this.db.prepare("UPDATE outbox SET state='tg_queued' WHERE id=?").run(row.id);count++;
   }
  }
  return count;
 })}
 insert(kind,id,version,digest,nonce,request){this.db.prepare("INSERT INTO tg_actions(id,kind,draft_id,version,payload_hash,nonce,request_json,state,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(kind,draft_id,version) DO UPDATE SET state=excluded.state WHERE tg_actions.kind='publication' AND tg_actions.state='awaiting_reapproval' AND tg_actions.payload_hash=excluded.payload_hash").run(crypto.randomUUID(),kind,id,version,digest,nonce,JSON.stringify(request),'queued',this.store.now())}
 claim(){return this.store.tx(()=>{
  this.store.expire();
  const rows=this.db.prepare("SELECT *,NULL AS event_id,CASE kind WHEN 'publication' THEN 0 ELSE 1 END AS priority FROM tg_actions WHERE state='queued' AND not_before<=? AND (kind!='publication' OR ?=0 OR ?=1) UNION ALL SELECT id,kind,draft_id,version,payload_hash,nonce,request_json,state,attempts,not_before,result_json,created_at,event_id,1 AS priority FROM tg_event_actions WHERE state='queued' AND not_before<=? ORDER BY priority,created_at LIMIT 32").all(this.store.now(),this.hourly?1:0,this.config.writerEnabled===true?1:0,this.store.now());
  for(const row of rows){
   if(this.hourly&&row.kind==='publication'&&this.config.writerEnabled!==true)continue;
   if(this.hourly&&row.kind!=='publication'&&(this.cardSlot()===null||(this.db.prepare("SELECT value FROM tg_meta WHERE key='next_card_at'").get()?.value??0)>this.store.now()))continue;
   if(row.kind==='event_card'){
    this.db.prepare("UPDATE tg_event_actions SET state='sending',attempts=attempts+1 WHERE id=? AND state='queued'").run(row.id);
    this.db.prepare("INSERT INTO tg_meta VALUES('next_card_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(this.store.now()+3000);
    return {...row,attempts:row.attempts+1,state:'sending',request:JSON.parse(row.request_json)};
   }
   const d=this.db.prepare('SELECT * FROM drafts WHERE id=?').get(row.draft_id);
   const v=this.db.prepare('SELECT * FROM draft_versions WHERE draft_id=? AND version=?').get(row.draft_id,row.version);
   const valid=d.current_version===row.version&&d.expires_at>this.store.now()&&v.payload_hash===row.payload_hash&&hash(v.payload_json)===row.payload_hash&&d.account_id===this.store.target(d.platform);
   const approved=row.kind==='card'||this.db.prepare("SELECT approver_id FROM approvals WHERE draft_id=? AND version=? AND payload_hash=? AND decision='approve' AND state='valid'").get(row.draft_id,row.version,row.payload_hash);
   const currentApprover=!this.hourly||row.kind==='card'||approved&&approvers().includes(approved.approver_id);
   if(valid&&approved&&!currentApprover&&d.state==='approved'){
    this.db.prepare("UPDATE approvals SET state='invalidated' WHERE draft_id=? AND state='valid'").run(row.draft_id);
    this.db.prepare("UPDATE drafts SET state='pending_approval' WHERE id=?").run(row.draft_id);
    this.db.prepare("UPDATE tg_actions SET state='awaiting_reapproval' WHERE id=?").run(row.id);continue;
   }
   if(!valid||!approved||!currentApprover||d.state!==(row.kind==='card'?'pending_approval':'approved')){this.db.prepare("UPDATE tg_actions SET state='superseded' WHERE id=?").run(row.id);continue}
   this.db.prepare("UPDATE tg_actions SET state='sending',attempts=attempts+1 WHERE id=? AND state='queued'").run(row.id);
   if(this.hourly&&row.kind==='card')this.db.prepare("INSERT INTO tg_meta VALUES('next_card_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(this.store.now()+3000);
   if(row.kind==='publication')this.db.prepare("UPDATE drafts SET state='publishing' WHERE id=?").run(row.draft_id);
   return {...row,attempts:row.attempts+1,state:'sending',request:JSON.parse(row.request_json)};
  }return null;
 })}
 finish(id,outcome){return this.store.tx(()=>{
  const row=this.db.prepare("SELECT * FROM tg_actions WHERE id=? AND state='sending'").get(id)??this.db.prepare("SELECT * FROM tg_event_actions WHERE id=? AND state='sending'").get(id);if(!row)return false;
  const table=row.kind==='event_card'?'tg_event_actions':'tg_actions';
  const request=JSON.parse(row.request_json);let state='unknown',receipt=null;
  if(outcome.result){const m=outcome.result;
   const bodyOK=request.method==='sendDocument'?m.caption===request.args.caption&&typeof m.document?.file_id==='string'&&m.document.file_id.length>0:m.text===request.args.text;
   if(positive(m.message_id)&&String(m.chat?.id)===String(request.args.chat_id)&&bodyOK&&(row.kind==='publication'||m.from?.id===this.config.botId&&m.from?.is_bot===true)){
    state='sent';receipt={sent_at:this.store.now(),message_id:m.message_id,chat_id:m.chat.id,text:m.text??null,caption:m.caption??null,file_id:m.document?.file_id??null};
   }
  }else if(outcome.rejected===true){
   if(outcome.retryAfter>=1&&outcome.retryAfter<=60&&row.attempts<3){
    this.db.prepare(`UPDATE ${table} SET state='queued',not_before=? WHERE id=?`).run(this.store.now()+outcome.retryAfter*1000,id);
    if(row.kind==='publication')this.db.prepare("UPDATE drafts SET state='approved' WHERE id=?").run(row.draft_id);return true;
   }state='failed';
  }
  this.db.prepare(`UPDATE ${table} SET state=?,result_json=? WHERE id=?`).run(state,receipt?JSON.stringify(receipt):null,id);
  if(this.hourly&&row.kind==='card'&&state==='sent')this.db.prepare("UPDATE drafts SET expires_at=? WHERE id=? AND current_version=? AND state='pending_approval'").run(this.store.now()+86400000,row.draft_id,row.version);
  if(row.kind==='publication')this.db.prepare('UPDATE drafts SET state=? WHERE id=?').run(state==='sent'?'published':state,row.draft_id);
  if(row.kind==='event_card'){this.db.prepare("UPDATE outbox SET state=? WHERE aggregate_id=? AND kind='event_card_request'").run('tg_'+state,row.event_id);return true}
  this.db.prepare('UPDATE outbox SET state=? WHERE aggregate_id=? AND version=? AND kind=?').run('tg_'+state,row.draft_id,row.version,'approval_card_request');
  return true;
 })}
 recover(){return this.store.tx(()=>{
  this.db.exec("UPDATE drafts SET state='unknown' WHERE id IN (SELECT draft_id FROM tg_actions WHERE kind='publication' AND state='sending'); UPDATE tg_actions SET state='unknown' WHERE state='sending'; UPDATE tg_event_actions SET state='unknown' WHERE state='sending'");
 })}
 offset(){return this.db.prepare("SELECT value FROM tg_meta WHERE key='offset'").get().value}
 processUpdate(update){
  if(!Number.isSafeInteger(update?.update_id)||update.update_id<0||update.update_id>=Number.MAX_SAFE_INTEGER)throw Error('invalid update identity');
  return this.store.tx(()=>{
   const digest=hash(canonical(update));const prior=this.db.prepare('SELECT * FROM tg_updates WHERE update_id=?').get(update.update_id);
   if(prior){if(prior.update_hash!==digest)throw Error('update conflict');return {decision:prior.decision,replayed:true}}
   this.store.expire();const decision=this.decide(update);
   this.db.prepare('INSERT INTO tg_updates VALUES(?,?,?,?)').run(update.update_id,digest,decision,this.store.now());
   this.db.prepare("UPDATE tg_meta SET value=MAX(value,?) WHERE key='offset'").run(update.update_id+1);
   return {decision};
  });
 }
 decide(update){
  const q=update.callback_query,m=q?.message;
  if(!q||typeof q.id!=='string'||!q.id||q.id.length>256||q.from?.is_bot!==false||!approvers().includes(q.from.id)||q.inline_message_id||q.game_short_name)return 'denied';
  if(!m||!positive(m.date)||m.edit_date||m.forward_origin||m.from?.id!==this.config.botId||m.from?.is_bot!==true||m.chat?.id!==this.config.approvalChatId)return 'denied';
  if(this.hourly&&/^observe:[a-f0-9]{32}$/.test(q.data??'')){
   const card=this.db.prepare("SELECT * FROM tg_event_actions WHERE nonce=? AND state='sent'").get(q.data.slice(8));if(!card)return 'denied';
   const receipt=JSON.parse(card.result_json),request=JSON.parse(card.request_json);
   if(m.message_id!==receipt.message_id||m.text!==(receipt.text??undefined)||m.caption!==(receipt.caption??undefined)||m.document?.file_id!==(receipt.file_id??undefined)||canonical(m.reply_markup)!==canonical(request.args.reply_markup))return 'denied';
   if(receipt.sent_at+86400000<=this.store.now())return 'stale';
   return 'observed';
  }
  const match=/^(publish|reject):([a-f0-9]{32})$/.exec(q.data??'');if(!match)return 'denied';
  const card=this.db.prepare("SELECT * FROM tg_actions WHERE kind='card' AND nonce=? AND state='sent'").get(match[2]);if(!card)return 'denied';
  const receipt=JSON.parse(card.result_json),request=JSON.parse(card.request_json);
  if(m.message_id!==receipt.message_id||m.text!==(receipt.text??undefined)||m.caption!==(receipt.caption??undefined)||m.document?.file_id!==(receipt.file_id??undefined)||canonical(m.reply_markup)!==canonical(request.args.reply_markup))return 'denied';
  const d=this.db.prepare('SELECT * FROM drafts WHERE id=?').get(card.draft_id),v=this.db.prepare('SELECT * FROM draft_versions WHERE draft_id=? AND version=?').get(card.draft_id,card.version);
  if(d.state!=='pending_approval'||d.current_version!==card.version||d.expires_at<=this.store.now()||v.payload_hash!==card.payload_hash||hash(v.payload_json)!==card.payload_hash||d.account_id!==this.store.target(d.platform))return 'stale';
  const payload=JSON.parse(v.payload_json);if(payload.account_id!==d.account_id)return 'stale';
  const decision=match[1]==='reject'?'rejected':d.platform==='telegram'&&d.kind==='post'?'approved':'approved_held_stage3';
  const changed=this.db.prepare("UPDATE drafts SET state=? WHERE id=? AND state='pending_approval' AND current_version=?").run(decision,d.id,card.version);if(changed.changes!==1)return 'stale';
  this.db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),d.id,card.version,card.payload_hash,q.from.id,match[1]==='reject'?'reject':'approve','valid',String(update.update_id),this.store.now());
  if(decision==='approved')this.insert('publication',d.id,card.version,card.payload_hash,null,{method:'sendMessage',args:{chat_id:d.account_id,text:payload.text}});
  return decision;
 }
 stats(){const rows=this.db.prepare('SELECT state,count(*) n FROM (SELECT state FROM tg_actions UNION ALL SELECT state FROM tg_event_actions) GROUP BY state').all();return Object.fromEntries(rows.map(r=>[r.state,r.n]))}
}
