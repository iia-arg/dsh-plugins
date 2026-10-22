// Anna's single Telegram poller persists external data before handing it to socseti.
// Model delivery uses the separate SocialDispatcher and ordinary Anna conversation (owner variant a).
import fs from 'node:fs';import crypto from 'node:crypto';
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function socialUpdates(config){if(config.social===undefined)return ['message'];if(config.agentName!=='anna')throw Error('Social input is only Anna');return ['message','edited_message','channel_post','edited_channel_post','callback_query']}
export function socialRoute(update,config){if(!config.social)return update.message?.chat?.id??null;return (update.message??update.edited_message??update.channel_post??update.edited_channel_post??update.callback_query?.message)?.chat?.id??null}
function key(file){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);try{const st=fs.fstatSync(fd);if(!st.isFile()||![0,process.getuid()].includes(st.uid)||(st.mode&0o137)!==0||st.nlink!==1||st.size>256)throw Error('social key rejected');const data=Buffer.alloc(257),n=fs.readSync(fd,data,0,257,0),text=data.subarray(0,n).toString().trim();if(!/^[a-f0-9]{64}$/.test(text))throw Error('social key rejected');return text}finally{fs.closeSync(fd)}}
export class SocialIngress{
 constructor({config,ledger,log=()=>{}}){
  socialUpdates(config);this.config=config.social;this.ledger=ledger;this.log=log;
  const c=this.config,url=new URL(c.serviceUrl);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!Number.isSafeInteger(Number(url.port))||Number(url.port)<1024||typeof c.keyFile!=='string'||!c.keyFile.startsWith('/')||c.channelId!==-1001925584120||c.discussionId!==-1002103269359||Object.keys(c).some(k=>!['serviceUrl','keyFile','channelId','discussionId'].includes(k)))throw Error('social config rejected');
  this.url=url.origin;ledger.db.exec("CREATE TABLE IF NOT EXISTS social_requests(receipt_id TEXT PRIMARY KEY,input_hash TEXT NOT NULL,request_json TEXT,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0); UPDATE social_requests SET request_json=NULL WHERE state='done'");
 }
 handles(u){return Boolean(u.channel_post||u.edited_channel_post||u.callback_query||u.message?.chat?.id===this.config.discussionId||u.edited_message?.chat?.id===this.config.discussionId)}
 normalize(u,botId){
  let m=u.channel_post??u.edited_channel_post??u.edited_message??u.message;if(!m||!Number.isSafeInteger(m.message_id)||m.message_id<1)return null;
  const chat=m.chat?.id,c=this.config;
  if(![c.channelId,c.discussionId].includes(chat)||m.from?.id===botId)return null;
  const forward=chat===c.discussionId&&m.is_automatic_forward===true&&m.forward_origin?.type==='channel'&&m.forward_origin.chat?.id===c.channelId&&Number.isSafeInteger(m.forward_origin.message_id);
  const post=chat===c.channelId||forward,edited=Boolean(u.edited_channel_post||u.edited_message),id=forward?m.forward_origin.message_id:m.message_id;
  const text=typeof m.text==='string'?m.text:typeof m.caption==='string'?m.caption:['photo','video','document','audio','voice','sticker','animation'].filter(k=>m[k]).map(k=>'['+k+']').join(' ');
  if(!text.trim())return null;
  if(edited&&!Number.isSafeInteger(m.edit_date))throw Error('social edit identity rejected');
  const commentEdit=edited&&!post;
  if(commentEdit&&!Number.isSafeInteger(u.update_id))throw Error('social edit identity rejected');
  return {platform:'telegram',account_id:String(c.channelId),provider_id:(edited?'edit':'post')+':'+(post?c.channelId:c.discussionId)+':'+id+(edited?':'+m.edit_date:'')+(commentEdit?':'+u.update_id:''),kind:post?(edited?'edited_post':'post'):'comment',conversation_id:String(post?c.channelId:c.discussionId),subject_id:post?'channel':String(m.from?.id??m.sender_chat?.id??'anonymous'),text:commentEdit?'[Правка комментария Telegram '+c.discussionId+':'+id+'; edit_date='+m.edit_date+'; update_id='+u.update_id+']\n'+text:text};
 }
 async post(route,body){
  try{
   const response=await fetch(this.url+route,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key(this.config.keyFile)},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error('rejected');let size=0,chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>(route==='/channel/pending'?8*1024*1024:65536))throw Error('size');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{throw Error('social transport refused or outcome unconfirmed')}
 }
 async handle(update,receipt,botId,answer=async()=>{}){
  if(!Number.isSafeInteger(update.update_id)||!Number.isSafeInteger(botId)||botId<=0||!this.handles(update))throw Error('social update identity rejected');
  const l=this.ledger,current=l.get(receipt.id);if(current.finished_at!==null)return;
  const input=digest(update);l.db.prepare("INSERT OR IGNORE INTO social_requests(receipt_id,input_hash,state) VALUES(?,?,'pending')").run(receipt.id,input);
  const row=l.db.prepare('SELECT * FROM social_requests WHERE receipt_id=?').get(receipt.id);if(row.input_hash!==input)throw Error('social input conflict');if(row.attempts>=3)throw Error('social ingress held after 3 attempts');
  l.db.prepare('UPDATE social_requests SET attempts=attempts+1 WHERE receipt_id=?').run(receipt.id);
  let outcome;
  if(update.callback_query){
   const result=await this.post('/channel/callback',update);outcome='social_callback_'+result.decision;
   try{await answer(update.callback_query.id,result.decision==='observed'?'Ознакомление отмечено':result.decision==='approved'?'Одобрено':result.decision==='rejected'?'Отклонено':'Карточка не разрешает это действие')}catch{this.log('[соцсети] callback answer unconfirmed; queue decision persisted')}
  }else{
   const event=this.normalize(update,botId);
   if(event){
    let request=row.request_json?JSON.parse(row.request_json):null;
    if(!request){const state=await this.post('/channel/cursor',{});if(state.cursor!==null&&typeof state.cursor!=='string')throw Error('social cursor rejected');request={source:'telegram:'+this.config.channelId,expectedCursor:state.cursor,cursor:String(update.update_id),events:[event]};l.db.prepare('UPDATE social_requests SET request_json=? WHERE receipt_id=?').run(JSON.stringify(request),receipt.id)}
    const result=await this.post('/channel/ingress',request);if(result.accepted!==1)throw Error('social admission not confirmed');outcome='social_ingested';
   }else outcome='social_ignored';
  }
  l.tx(()=>{l.db.prepare("UPDATE social_requests SET state='done',request_json=NULL WHERE receipt_id=?").run(receipt.id);l.db.prepare('UPDATE receipts SET expects_reply=0 WHERE id=?').run(receipt.id);l.completeRow(l.get(receipt.id),outcome,{},'Соцсобытие сохранено; чтение моделью не утверждается.');});
 }
 fail(id){
  const row=this.ledger.db.prepare('SELECT attempts FROM social_requests WHERE receipt_id=?').get(id),retry=row?.attempts<3;
  this.ledger.db.prepare('UPDATE receipts SET channel_started=?,blocked=? WHERE id=?').run(retry?0:1,retry?null:'social_ingress_held',id);
  this.log('[соцсети] receipt='+id+(retry?' сохранён, повтор до3попыток':' УДЕРЖАН: доставка не подтверждена после3попыток; нужен разбор координатора'));
 }
}
