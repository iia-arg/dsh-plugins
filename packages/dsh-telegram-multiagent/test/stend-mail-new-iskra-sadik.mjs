// B-N-1624: /new от Искры на sadik — отправитель целиком под sudo (transport=local, публикация root в чужой ящик), приёмник прежний.
// Цепочка: CLI send-mail-stop --mode new → placed → MailStopReceiver → complete; отказы: ход идёт, чужой адресат, чужой ключ, отказ адаптера.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';import {generateKeyPairSync} from 'node:crypto';
import {MessageReceipts} from '../src/message-receipts.js';import {ConversationSessions} from '../src/conversation-sessions.js';
import {MailStopReceiver} from '../src/mail-stop-receiver.js';import {signStopStatus,verifyStopStatus,evaluateSignedStop} from '../src/mail-stop-protocol.js';
if(process.getuid()!==0){console.log('СЛЕПОТА: отправитель Искры идёт под sudo — стенду нужен root');process.exit(2)}
// A-N-1948 №24: получатель фикстуры — учётка coders; её нет (машина не sadik) — СЛЕПОТА, код 2, а не исключение execFileSync с кодом 1.
let uid,gid;try{uid=Number(execFileSync('id',['-u','coders'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));gid=Number(execFileSync('id',['-g','coders'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));}catch{console.log('СЛЕПОТА: нет учётки coders — фикстуре нужен непривилегированный получатель');process.exit(2)}
const sender=new URL('../src/send-mail-stop.mjs',import.meta.url).pathname;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-new-iskra-'));let l;
try{
 fs.chmodSync(root,0o755);
 // Ящик получателя принадлежит агенту, отправитель в него писать не может — публикует root (как на sadik: 755/775 у владельца).
 const home=path.join(root,'home');fs.mkdirSync(home);fs.chownSync(home,uid,gid);fs.chmodSync(home,0o755);
 const inbox=path.join(home,'in');fs.mkdirSync(inbox);fs.chownSync(inbox,uid,gid);fs.chmodSync(inbox,0o755);
 l=new MessageReceipts(path.join(root,'ledger'));const c=new ConversationSessions(l);c.pin('a2a',{id:'telegram-a2a',createdAt:10});
 const iskra=generateKeyPairSync('ed25519'),foreign=generateKeyPairSync('ed25519'),signer=generateKeyPairSync('ed25519');
 const keyFile=path.join(root,'iskra-stop-1.key'),foreignFile=path.join(root,'foreign.key');
 fs.writeFileSync(keyFile,iskra.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});fs.writeFileSync(foreignFile,foreign.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const recipients={zarya:{directory:inbox,ledger_uuid:l.protocolIdentity()},marc:{directory:inbox,ledger_uuid:'marc-ledger'}};
 const config=(file,name)=>{const p=path.join(root,name);fs.writeFileSync(p,JSON.stringify({version:1,key_id:'iskra-stop-1',key_file:file,modes:['pause','new'],transport:'local',recipients}),{mode:0o644});return p;};
 const good=config(keyFile,'sender.json'),forged=config(foreignFile,'sender-forged.json');
 const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{},
  controlKeys:{'iskra-stop-1':iskra.publicKey.export({type:'spki',format:'pem'})},
  controlPermissions:{'iskra-stop-1':{principal:'iskra',recipients:['zarya','avrora','alfa','beta','gamma'],modes:['pause','new']}},
  returnRoutes:{'iskra-stop-1':{recipient:'iskra',ledger_uuid:'iskra-reply',directory:'/var/spool/mail-stop-status/iskra'}}};
 const send=(cfg,recipient,mode,extra=[])=>spawnSync(process.execPath,[sender,'--recipient',recipient,'--mode',mode,...extra],{env:{...process.env,DSH_MAIL_STOP_CONFIG:cfg},encoding:'utf8'});
 const placed=run=>{assert.equal(run.status,0,run.stderr);const r=JSON.parse(run.stdout);assert.equal(r.stage,'placed');const raw=fs.readFileSync(r.path);
  assert.equal(fs.statSync(r.path).uid,uid,'опубликованный файл принадлежит владельцу ящика');fs.unlinkSync(r.path);return {r,raw};};
 let mode='idle',rotations=0,failure=null;const statuses=[];
 const agent={status:'idle',session:{id:'telegram-a2a',header:{id:'telegram-a2a',createdAt:10,cwd:'/fixture'}},inbox:{nextTurn:[],nextStep:[]}};
 // Отметка прибытия ставится при ПЕРВОМ взгляде на письмо и дальше не меняется — как у сторожа прибытия в бою (readStopArrival читает
 // записанный файл). Прежде подстава отдавала l.now() при каждом чтении: повторная проверка приёмника читает now раньше getArrival,
 // и смена миллисекунды между ними давала delivered_at > now → denied/delivery_observation_invalid вместо ожидаемого исхода (мерцание П3).
 // Arrival is stamped at the FIRST look at a letter and never moves — like the production arrival observer. Previously the fixture returned
 // l.now() on every read: the receiver's recheck reads now before getArrival, and a millisecond tick in between made delivered_at > now.
 const prihod=new Map();const getArrival=(_file,raw)=>{const k=Buffer.from(raw??'').toString('base64');if(!prihod.has(k))prihod.set(k,{delivered_at:l.now(),event_id:'arrival'});return prihod.get(k);};
 const receiver=new MailStopReceiver({ledger:l,pause:{cwd:'/fixture',state:()=>null},recipient:'zarya',getTrust:()=>trust,getArrival,
  signStatus:s=>signStopStatus(s,'status-zarya',signer.privateKey),publishStatus:s=>statuses.push(s),conversations:c,resolveTarget:()=>agent,newEnabled:()=>true,
  resolveNewTarget:()=>{agent.status=mode;return{key:'a2a',entry:{handle:{agent}},header:agent.session.header};},
  rotateNew:async({receipt,beforeBegin})=>{
   if(failure)throw Error(failure);
   const attempt=c.begin('a2a',receipt.id,{beforeBegin});rotations++;const created=l.now()+rotations;
   c.commit(receipt.id,{id:attempt.new_id,createdAt:created},{reply:false});agent.session={id:attempt.new_id,header:{id:attempt.new_id,createdAt:created,cwd:'/fixture'}};
   return {sessionId:attempt.new_id,handle:{agent}};},
  bootstrapNew:async(fresh,text)=>{const row=l.receive('intro:'+fresh.sessionId,Buffer.from(text),{route:'a2a',expectsReply:true});
   l.db.prepare('UPDATE receipts SET session_id=?,session_created=? WHERE id=?').run(fresh.sessionId,agent.session.header.createdAt,row.id);return row.id;}});
 const lastStatus=()=>{const s=verifyStopStatus(statuses.at(-1),{keys:{'status-zarya':signer.publicKey.export({type:'spki',format:'pem'})},receivers:{'status-zarya':'zarya'},recipient:'iskra',ledger:'iskra-reply',now:l.now()});assert(s.verified,s.reason);return s.status;};

 // П1: разрешённый адресат, ход не идёт → placed → complete/new_committed, вводная называет Искру.
 const p1=placed(send(good,'zarya','new'));const o1=await receiver.handle(p1.raw,{sourceKey:'p1'});
 assert.equal(o1.state,'complete',JSON.stringify(o1));assert.equal(o1.reason,'new_committed');assert.equal(rotations,1);assert.equal(lastStatus().reason,'new_committed');
 assert(l.db.prepare('SELECT raw FROM receipts WHERE session_id=?').all(agent.session.id).some(r=>Buffer.from(r.raw).toString().includes('/new по почте от iskra')),'вводная нового поколения от iskra');
 console.log('PASS П1 iskra→zarya /new: placed → complete/new_committed, вводная «от iskra»');
 // П1б: своя вводная телом письма.
 const intro=path.join(root,'intro.txt');fs.writeFileSync(intro,'Перечитай SOSTOYANIE и продолжай наряд.');
 const p1b=placed(send(good,'zarya','new',['--body-file',intro]));assert.equal(evaluateSignedStop(p1b.raw,{trust,recipient:'zarya',ledger:l.protocolIdentity(),delivery:{delivered_at:Date.now(),event_id:'a'}}).control.replacement,'Перечитай SOSTOYANIE и продолжай наряд.');
 console.log('PASS П1б --mode new --body-file: вводная доходит в подписанном теле');
 // П2: адресат вне права Искры (marc) — отправитель кладёт, приёмник отказывает no_permission.
 const p2=placed(send(good,'marc','new'));const a2=evaluateSignedStop(p2.raw,{trust,recipient:'marc',ledger:'marc-ledger',delivery:{delivered_at:Date.now(),event_id:'a'}});
 assert.equal(a2.verified,true);assert.equal(a2.allowed,false);assert.equal(a2.reason,'no_permission');
 console.log('PASS П2 iskra→marc /new: подпись верна, отказ no_permission');
 // П3: у получателя идёт ход → refused/turn_running, смены поколения нет.
 mode='running';const o3=await receiver.handle(placed(send(good,'zarya','new')).raw,{sourceKey:'p3'});mode='idle';
 assert.equal(o3.state,'refused',JSON.stringify(o3));assert.equal(o3.reason,'turn_running',JSON.stringify(o3));assert.equal(rotations,1);
 console.log('PASS П3 получатель в ходу: refused/turn_running, поколение не сменено');
 // П4: подделка — тот же key_id, чужой закрытый ключ → подпись не сходится, отказ без смены поколения.
 const p4=placed(send(forged,'zarya','new'));const a4=evaluateSignedStop(p4.raw,{trust,recipient:'zarya',ledger:l.protocolIdentity(),delivery:{delivered_at:Date.now(),event_id:'a'}});
 assert.equal(a4.verified,false);assert.equal(a4.allowed,false);const o4=await receiver.handle(p4.raw,{sourceKey:'p4'});assert.notEqual(o4?.state,'complete');assert.equal(rotations,1);
 console.log('PASS П4 подделка подписи (iskra-stop-1, чужой ключ): '+a4.reason+', поколение не сменено');
 // П5: отказ адаптера (как у petrovich 05.10 17:53Z) → refused/rotation_refused, причина — в detail.
 failure='Адаптер не поддерживает поколения сессий';const o5=await receiver.handle(placed(send(good,'zarya','new')).raw,{sourceKey:'p5'});failure=null;
 assert.equal(o5.state,'refused');assert.equal(o5.reason,'rotation_refused');assert.equal(lastStatus().detail,'Адаптер не поддерживает поколения сессий');assert.equal(rotations,1);
 console.log('PASS П5 адаптер без поколений: refused/rotation_refused, detail «Адаптер не поддерживает поколения сессий»');
 // Доводы: pause с телом, replace Искре вне config.modes, незнакомый ключ — отказ до передачи.
 assert.equal(send(good,'zarya','pause',['--body-file',intro]).status,2);assert.equal(send(good,'zarya','replace',['--body-file',intro]).status,2);
 assert.equal(spawnSync(process.execPath,[sender,'--recipient','zarya','--mode','new','--dry-run','x'],{env:{...process.env,DSH_MAIL_STOP_CONFIG:good},encoding:'utf8'}).status,2);
 assert.equal(fs.readdirSync(inbox).length,0,'отказы до передачи ничего не кладут');
 console.log('PASS доводы: pause с телом, replace вне modes, --dry-run — отказ кодом 2, ящик пуст');
}finally{l?.close();fs.rmSync(root,{recursive:true,force:true})}
