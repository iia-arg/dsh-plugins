// RU: Изолированный стенд stend-site-retention.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-site-retention.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {MessageReceipts} from '../src/message-receipts.js';
import {ConversationSessions} from '../src/conversation-sessions.js';
import {GuestCopies} from '../src/guest-channel.js';
import {SiteChannel} from '../src/site-channel.js';
const DEN=86400e3,T0=2000000000000,S=n=>'SEKRET-'+n+'-'+crypto.randomBytes(4).toString('hex');
const SO=S('old'),SOA=S('oldans'),SM=S('mid'),SP=S('pend'),ST=S('tg');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'avr-site-ret-'));let now=T0,ok=0,bad=0;const zhurnal=[];
const proba=(n,u,d='')=>{if(u){ok++;console.log('  ok    '+n);}else{bad++;console.log('  FAIL  '+n+(d?' — '+d:''));}};
try{
  const l=new MessageReceipts(path.join(root,'ledger'),{now:()=>now});const dispatched=[];
  for(const x of ['vhod','kopii','vyhod','state'])fs.mkdirSync(path.join(root,x));
  const copies=new GuestCopies(l,{owner:()=>101,targets:()=>[{kind:'telegram',id:101}],sendTelegram:async()=>{}});
  const conversations=new ConversationSessions(l);
  const bind=r=>{const header={id:'telegram-'+r.route_key,createdAt:1};conversations.pin(r.route_key,header);l.prepare(r.id,{id:'msg-'+r.id},{id:header.id,header},r.route_key);};
  const site=new SiteChannel({owner:()=>101,ledger:l,conversations,copies,spool:root,state:path.join(root,'state/zakryto'),dispatch:async(r)=>{bind(r);dispatched.push(r);},stop:async()=>{},now:()=>now,log:s=>zhurnal.push(String(s))});
  const put=(id,n,text)=>fs.writeFileSync(path.join(root,'vhod',id+'.json'),JSON.stringify({v:1,id,conversation_id:n,message_id:1,text,received_at:now/1000}));
  const zakryt=(r,ans,otpravit=true)=>{l.completeLocal(r.id,'turn_completed',ans);copies.prepare();if(otpravit)l.db.prepare('UPDATE outbox SET sent_at=? WHERE receipt_id=?').run(now,r.id);};

  site.purgedAt=now;
  put('old',1,'посетитель: '+SO);put('pend',3,'посетитель: '+SP);await site.poll();
  const rOld=dispatched.find(r=>r.route_key==='site-1'),rPend=dispatched.find(r=>r.route_key==='site-3');
  if(!rOld||!rPend){console.log('СЛЕПОТА: сайт не принял конверты');process.exit(2);}
  zakryt(rOld,'ответ: '+SOA);zakryt(rPend,'ответ',false);
  const tg=l.receive('tg:old',Buffer.from('гость: '+ST),{route:'telegram',routeKey:'telegram-1001234567890',sender:'tg:5',hold:false});
  l.completeLocal(tg.id,'turn_completed','ответ гостю '+ST);l.db.prepare('UPDATE outbox SET sent_at=? WHERE receipt_id=?').run(now,tg.id);

  now=T0+2*DEN;site.purgedAt=now;
  put('mid',2,'посетитель: '+SM);await site.poll();
  const rMid=dispatched.find(r=>r.route_key==='site-2');zakryt(rMid,'ответ');
  const est=(t,k,id)=>!!l.db.prepare(`SELECT 1 FROM ${t} WHERE ${k}=?`).get(id);
  if(!est('outbox','receipt_id',rOld.id)||!est('guest_conversations','receipt_id',rOld.id)||!est('site_messages','receipt_id',rOld.id)){console.log('СЛЕПОТА: у старой квитанции нет строк в outbox/guest_conversations/site_messages');process.exit(2);}

  now=T0+31*DEN;await site.poll();
  proba('site 31 сут: квитанция и её строки удалены (receipts, outbox, guest_conversations, site_messages, audit, sources)',
    ['receipts:id','outbox:receipt_id','guest_conversations:receipt_id','site_messages:receipt_id','audit:receipt_id','sources:receipt_id'].every(x=>{const [t,k]=x.split(':');return !est(t,k,rOld.id);}));
  proba('site 29 сут: цела', est('receipts','id',rMid.id)&&est('outbox','receipt_id',rMid.id)&&est('guest_conversations','receipt_id',rMid.id));
  proba('гость Telegram 31 сут: цел (квитанция и исходящее)', est('receipts','id',tg.id)&&est('outbox','receipt_id',tg.id));
  proba('site 31 сут с неотправленным исходящим: цела, учтена как «ждут»', est('receipts','id',rPend.id)&&zhurnal.some(s=>/ждут закрытия\/отправки 1/.test(s)));
  proba('channel_sessions: site-1 снят, site-2 и site-3 на месте', !est('channel_sessions','route_key','site-1')&&est('channel_sessions','route_key','site-2')&&est('channel_sessions','route_key','site-3'));
  const bajty=fs.readFileSync(path.join(root,'ledger','receipts.sqlite')).toString('latin1');
  const naiti=s=>bajty.includes(Buffer.from(s,'utf8').toString('latin1'));
  proba('контроль зрячести: текст живой квитанции в файле БД виден', naiti(SM));
  proba('удалённый текст (вход и ответ) в файле БД не остался (secure_delete + VACUUM)', !naiti(SO)&&!naiti(SOA));
  const hvosty=['-journal','-wal','-shm'].map(x=>path.join(root,'ledger','receipts.sqlite'+x)).filter(f=>fs.existsSync(f));
  proba('файлы журнала транзакций (-journal/-wal): нет или без удалённого текста ('+hvosty.length+' шт.)', hvosty.every(f=>{const b=fs.readFileSync(f).toString('latin1');return ![SO,SOA].some(s=>b.includes(Buffer.from(s,'utf8').toString('latin1')));}));
  proba('журнал без текста посетителей', !zhurnal.join('\n').match(/SEKRET-/));
  proba('журнал называет число удалённых', zhurnal.some(s=>/удалено квитанций 1,/.test(s)));
  const n0=zhurnal.length;now+=30*60e3;await site.poll();
  proba('не чаще раза в час: опрос через 30 мин чистку не зовёт', zhurnal.length===n0);
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log(`ИТОГ: ok=${ok} FAIL=${bad}`);process.exit(bad?1:0);
