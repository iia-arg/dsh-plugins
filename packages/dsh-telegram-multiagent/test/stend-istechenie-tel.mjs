// RU: Изолированный стенд stend-istechenie-tel.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-istechenie-tel.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import * as MR from '../src/message-receipts.js';
const {MessageReceipts,BODY_RETENTION_MS}=MR,PORCIYA=MR.BODY_EXPIRE_BATCH??50;
const DEN=86400e3,S=n=>'SEKRET-'+n+'-'+crypto.randomBytes(4).toString('hex');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'avr-istech-'));let now=2000000000000,ok=0,bad=0;
const proba=(n,u,d='')=>{if(u){ok++;console.log('  ok    '+n);}else{bad++;console.log('  FAIL  '+n+(d?' — '+d:''));}};
try{
  const l=new MessageReceipts(path.join(root,'ledger'),{now:()=>now});
  l.db.exec(`CREATE TABLE IF NOT EXISTS guest_conversations(receipt_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, chat_id TEXT NOT NULL,
    destinations TEXT NOT NULL, question TEXT NOT NULL, question_queued INTEGER NOT NULL DEFAULT 0, answer_queued INTEGER NOT NULL DEFAULT 0)`);
  const sozdat=(klyuch,tekst,otvet)=>{
    const r=l.receive(klyuch,Buffer.from('[служебный канал, от агента x]\n'+tekst),{route:'a2a',sender:'x',hold:false});
    l.prepare(r.id,{id:'msg-'+klyuch,content:[{type:'text',text:tekst}]},{id:'sess-1',header:{createdAt:1}},'a2a');
    l.completeLocal(r.id,'turn_completed','ответ: '+otvet);
    l.db.prepare("INSERT INTO outbox(id,receipt_id,route,body,created_at,next_at) VALUES(?,?,'copy-tg',?,?,?)").run(r.id+':copy:answer',r.id,'копия: '+tekst,now,now);
    l.db.prepare("INSERT INTO guest_conversations(receipt_id,user_id,chat_id,destinations,question,question_queued,answer_queued) VALUES(?,?,?,?,?,1,1)").run(r.id,5,'5','[]','вопрос: '+tekst);
    l.db.prepare('UPDATE outbox SET sent_at=? WHERE receipt_id=?').run(now,r.id);
    for(const k of [300,1200,40])l.db.prepare('UPDATE receipts SET blocked=? WHERE id=?').run('b'.repeat(k),r.id);
    l.db.prepare('UPDATE receipts SET blocked=NULL WHERE id=?').run(r.id);
    return r.id;
  };
  const T0=now,TO=S('staroe'),TOA=S('staroe-otvet'),TT=S('tretje'),TM=S('molodoe');
  const idO=sozdat('a2a:1',TO,TOA);
  now=T0+30*60e3; const idT=sozdat('a2a:3',TT,'ok3');
  now=T0+2*DEN; const idM=sozdat('a2a:2',TM,'ok');
  const est=(t,k,v,col)=>l.db.prepare(`SELECT ${col} AS v FROM ${t} WHERE ${k}=?`).get(v)?.v;
  if(!String(est('receipts','id',idO,'message_json')).includes(TO)||!String(est('outbox','id',idO+':result','body')).includes(TOA)){console.log('СЛЕПОТА: текст не лёг в message_json/outbox — пробе нечего различать');process.exit(2);}
  now=T0+BODY_RETENTION_MS+10*60e3;
  const n=l.expireBodies();
  const r=l.get(idO);
  proba('старше срока: истекла ровно одна квитанция (raw NULL у одной)', l.db.prepare('SELECT count(*) n FROM receipts WHERE raw IS NULL').get().n===1);
  proba('старше срока: raw = NULL', r.raw===null);
  let mj=null;try{mj=JSON.parse(r.message_json);}catch{}
  proba('надгробие message_json: JSON с id, без текста', mj&&mj.id==='msg-a2a:1'&&mj.istekla===1&&!r.message_json.includes(TO), String(r.message_json).slice(0,60));
  proba('result_json: тела ответа нет, прочие поля целы', !String(r.result_json).includes(TOA)&&JSON.parse(r.result_json).kind==='channel-handler');
  proba('outbox.body отправленных — пусто (ответ и копия)', l.db.prepare("SELECT count(*) n FROM outbox WHERE receipt_id=? AND body<>''").get(idO).n===0);
  proba('копия гостя (question) — пусто', est('guest_conversations','receipt_id',idO,'question')==='');
  proba('учёт цел: квитанция, outcome, finished_at, dsh_id, status()', r.outcome==='turn_completed'&&r.finished_at!==null&&r.dsh_id==='msg-a2a:1'&&l.status().some(x=>x.id===idO));
  const m=l.get(idM);
  proba('моложе срока: всё цело', m.raw!==null&&m.message_json.includes(TM)&&est('outbox','id',idM+':result','body').includes('ok'));
  const kopii=l.db.prepare(`SELECT r.id FROM receipts r LEFT JOIN outbox o ON o.id=r.id||':result' AND o.sent_at IS NULL
    WHERE r.route='a2a' AND r.finished_at IS NOT NULL AND (json_type(r.result_json,'$.ownerReplyBody')='text' OR o.id IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM outbox c WHERE c.id=r.id||':copy:answer')
    AND NOT EXISTS(SELECT 1 FROM audit a WHERE a.receipt_id=r.id AND a.kind='owner_copy_disabled')`).all().map(x=>x.id);
  proba('отбор копий ответа (как index.js prepareReceiptCopies) истёкшую не берёт', !kopii.includes(idO));
  const fajl=()=>fs.readFileSync(path.join(root,'ledger','receipts.sqlite')).toString('latin1');
  const v=s=>fajl().includes(Buffer.from(s,'utf8').toString('latin1'));
  proba('контроль зрячести: текст молодой в файле виден', v(TM));
  proba('текст старой (письмо и ответ) в файле не найден (secure_delete + VACUUM)', !v(TO)&&!v(TOA));
  const hv=['-journal','-wal','-shm'].map(x=>path.join(root,'ledger','receipts.sqlite'+x)).filter(f=>fs.existsSync(f));
  proba('-journal/-wal: нет или без текста ('+hv.length+')', hv.every(f=>!fs.readFileSync(f).toString('latin1').includes(Buffer.from(TO,'utf8').toString('latin1'))));

  now=T0+BODY_RETENTION_MS+40*60e3; const vac0=l.vacuumAt;
  l.expireBodies(); proba('третья истекла через 30 мин после первой: VACUUM отложен (раз в час)', l.db.prepare('SELECT count(*) n FROM receipts WHERE raw IS NULL').get().n===2&&l.vacuumAt===vac0&&l.vacuumNeeded===true, '');
  now=vac0+3600e3; l.expireBodies(); proba('через час без новых истечений: VACUUM выполнен, текст третьей из файла ушёл', l.vacuumAt===now&&!v(TT)&&l.vacuumNeeded===false);

  now=T0+3*DEN;
  const l2=new MessageReceipts(path.join(root,'ledger2'),{now:()=>now}); const T2=now;
  for(let i=0;i<PORCIYA+7;i++){const q=l2.receive('a2a:p'+i,Buffer.from('[служебный канал, от агента x]\nпорция '+i),{route:'a2a',sender:'x',hold:false});
    l2.prepare(q.id,{id:'msg-p'+i,content:[{type:'text',text:'порция '+i}]},{id:'sess-1',header:{createdAt:1}},'a2a');l2.completeLocal(q.id,'turn_completed','ok');
    l2.db.prepare('UPDATE outbox SET sent_at=? WHERE receipt_id=?').run(now,q.id);}
  now=T2+BODY_RETENTION_MS+60e3; const istekl=()=>l2.db.prepare('SELECT count(*) n FROM receipts WHERE raw IS NULL').get().n;
  const p1=l2.expireBodies(); proba(`порция: первый проход взял ровно ${PORCIYA} из ${PORCIYA+7}`, p1===PORCIYA&&istekl()===PORCIYA, `взято ${p1}, истекло ${istekl()}`);
  proba('порция: пока накопленное не разобрано — VACUUM не делается', l2.vacuumAt===undefined&&l2.vacuumNeeded===true, `vacuumAt=${l2.vacuumAt}`);
  now+=5e3; const p2=l2.expireBodies(); proba('порция: второй проход добрал остаток и сделал VACUUM', p2===7&&istekl()===PORCIYA+7&&l2.vacuumAt===now&&l2.vacuumNeeded===false, `взято ${p2}`);
  l2.close();
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log(`ИТОГ: ok=${ok} FAIL=${bad}`);process.exit(bad?1:0);
