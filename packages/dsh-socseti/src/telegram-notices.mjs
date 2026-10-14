import crypto from 'node:crypto';
import {hash,canonical} from './store.mjs';
import {sameTelegramText} from './telegram-api.mjs';
const LIMIT=3500;
function parts(payload){
 const time=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}).format(payload.occurred_at??payload.received_at);
 const header=`Событие ${payload.event_id}\n${time} МСК\n${payload.platform} / ${payload.kind}\nДиалог: ${payload.conversation_id}\nАвтор: ${payload.subject_id}`;
 const width=LIMIT-header.length-64;if(width<1)throw Error('notice header rejected');
 const bodies=[];let current='';for(const c of payload.text){if(current.length+c.length>width){bodies.push(current);current=''}current+=c}bodies.push(current);
 return bodies.map((body,i)=>header+(bodies.length>1?`\nЧасть ${i+1}/${bodies.length}`:'')+'\n\n'+body);
}
export class TelegramNotices{
 constructor(store,config){this.store=store;this.db=store.db;this.config=config;
  store.tx(()=>this.db.exec(`CREATE TABLE IF NOT EXISTS tg_notice_actions(id TEXT PRIMARY KEY,request_json TEXT NOT NULL,payload_hash TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,not_before INTEGER NOT NULL DEFAULT 0,result_json TEXT,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS tg_notice_items(action_id TEXT NOT NULL REFERENCES tg_notice_actions(id),outbox_id TEXT NOT NULL REFERENCES outbox(id),PRIMARY KEY(action_id,outbox_id));`));
  store.tx(()=>this.db.exec("UPDATE outbox SET state='held_stage1' WHERE kind='event_card_request' AND state='tg_queued' AND aggregate_id IN (SELECT event_id FROM tg_event_actions WHERE kind='event_card' AND state='queued'); UPDATE tg_event_actions SET state='superseded' WHERE kind='event_card' AND state='queued'"));
 }
 enqueue(){
  const events=this.db.prepare("SELECT o.*,COALESCE((SELECT MAX(a.attempts) FROM tg_event_actions a WHERE a.event_id=o.aggregate_id AND a.kind='event_card' AND a.state='superseded'),0) spent_attempts,COALESCE((SELECT MAX(a.not_before) FROM tg_event_actions a WHERE a.event_id=o.aggregate_id AND a.kind='event_card' AND a.state='superseded'),0) retry_at FROM outbox o JOIN tg_batch_items b ON b.outbox_id=o.id WHERE o.kind='event_card_request' AND o.state='held_stage1' ORDER BY o.created_at,o.rowid LIMIT 20").all();
  const groups=[];let group={text:'',items:[],attempts:0,notBefore:0};
  for(const row of events)for(const text of parts(JSON.parse(row.payload_json))){
   const joined=group.text+(group.text?'\n\n':'')+text;
   if(joined.length>LIMIT){if(group.text)groups.push(group);group={text,items:[row.id],attempts:row.spent_attempts,notBefore:row.retry_at}}
   else {group.text=joined;group.items.push(row.id);group.attempts=Math.max(group.attempts,row.spent_attempts);group.notBefore=Math.max(group.notBefore,row.retry_at)}
  }
  if(group.text)groups.push(group);
  for(const g of groups){const id=crypto.randomUUID(),request={method:'sendMessage',args:{chat_id:this.config.approvalChatId,text:g.text}};
   this.db.prepare('INSERT INTO tg_notice_actions(id,request_json,payload_hash,state,attempts,not_before,created_at) VALUES(?,?,?,?,?,?,?)').run(id,JSON.stringify(request),hash(canonical(request)),'queued',g.attempts,g.notBefore,this.store.now());
   for(const outboxId of new Set(g.items))this.db.prepare('INSERT INTO tg_notice_items VALUES(?,?)').run(id,outboxId);
  }
  for(const row of events)this.db.prepare("UPDATE outbox SET state='tg_queued' WHERE id=?").run(row.id);
  return groups.length;
 }
 claim(){
  const row=this.db.prepare("SELECT * FROM tg_notice_actions WHERE state='queued' AND not_before<=? ORDER BY created_at,rowid LIMIT 1").get(this.store.now());if(!row)return null;
  const request=JSON.parse(row.request_json);
  if(row.attempts>=3||hash(canonical(request))!==row.payload_hash||request.method!=='sendMessage'||request.args?.chat_id!==this.config.approvalChatId||typeof request.args.text!=='string'||request.args.text.length>LIMIT||request.args.reply_markup!==undefined){
   this.db.prepare("UPDATE tg_notice_actions SET state='failed' WHERE id=?").run(row.id);this.updateOutboxes(row.id);return null;
  }
  this.db.prepare("UPDATE tg_notice_actions SET state='sending',attempts=attempts+1 WHERE id=? AND state='queued'").run(row.id);
  this.db.prepare("INSERT INTO tg_meta VALUES('next_card_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(this.store.now()+3000);
  return {...row,kind:'notice',state:'sending',attempts:row.attempts+1,request:JSON.parse(row.request_json)};
 }
 defer(id){return this.db.prepare("UPDATE tg_notice_actions SET state='queued',attempts=MAX(0,attempts-1) WHERE id=? AND state='sending'").run(id).changes===1}
 updateOutboxes(id){
  const rows=this.db.prepare('SELECT outbox_id FROM tg_notice_items WHERE action_id=?').all(id);
  for(const {outbox_id} of rows){const states=this.db.prepare('SELECT a.state FROM tg_notice_items i JOIN tg_notice_actions a ON a.id=i.action_id WHERE i.outbox_id=?').all(outbox_id).map(r=>r.state);
   const state=states.every(s=>s==='sent')?'sent':states.includes('unknown')?'unknown':states.includes('failed')?'failed':'queued';
   this.db.prepare('UPDATE outbox SET state=? WHERE id=?').run('tg_'+state,outbox_id);
  }
 }
 finish(id,outcome){
  const row=this.db.prepare("SELECT * FROM tg_notice_actions WHERE id=? AND state='sending'").get(id);if(!row)return false;
  const request=JSON.parse(row.request_json);let state='unknown',receipt=null;
  if(outcome.result){const m=outcome.result;if(Number.isSafeInteger(m.message_id)&&m.message_id>0&&m.chat?.id===this.config.approvalChatId&&m.from?.id===this.config.botId&&m.from.is_bot===true&&sameTelegramText(m.text,request.args.text)){state='sent';receipt={message_id:m.message_id,chat_id:m.chat.id,text:m.text,sent_at:this.store.now()}}}
  else if(outcome.rejected===true||outcome.notSent===true){const retryAfter=outcome.notSent===true?1:outcome.retryAfter;if(retryAfter>=1&&retryAfter<=60&&row.attempts<3){this.db.prepare("UPDATE tg_notice_actions SET state='queued',not_before=? WHERE id=?").run(this.store.now()+retryAfter*1000,id);return true}state='failed'}
  this.db.prepare('UPDATE tg_notice_actions SET state=?,result_json=? WHERE id=?').run(state,receipt?JSON.stringify(receipt):null,id);this.updateOutboxes(id);return true;
 }
 recover(){const rows=this.db.prepare("SELECT id FROM tg_notice_actions WHERE state='sending'").all();this.db.exec("UPDATE tg_notice_actions SET state='unknown' WHERE state='sending'");for(const row of rows)this.updateOutboxes(row.id)}
 stats(){return this.db.prepare('SELECT state,count(*) n FROM tg_notice_actions GROUP BY state').all()}
}
