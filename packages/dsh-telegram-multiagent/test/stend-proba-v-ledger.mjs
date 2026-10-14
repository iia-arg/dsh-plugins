// RU: Изолированный стенд stend-proba-v-ledger.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-proba-v-ledger.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {svedenieBezKopii,trevogaNaSvertku} from '../src/guest-channel.js'; // B-N-1639, B-N-1640: prepareReceiptCopies зовёт её из импорта модуля
const {MessageReceipts,mailEnvelope}=await import(process.env.READER_MODULE ?? new URL('../src/message-receipts.js',import.meta.url).href);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'b1057-copy-'));
const receipts=new MessageReceipts(tmp,{owner:'fixture'});
try{
 const receive=(id,m)=>{
  const raw=Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify(m)+'\nbody');
  const e=mailEnvelope(raw),r=receipts.receive(id,raw,{logicalKey:e.logicalKey});
  receipts.acceptEnvelope(r.id,e.protocol,'memoryworker');return r.id;
 };
 const probe=(id,quiet)=>receive(id,{kind:'capability_probe',delivery_id:id,recipient:{id:'memoryworker'},supersedes:{decision_id:'absent'},...(quiet?{reply_channel:'ledger'}:{})});
 const old=probe('legacy',false),quiet=probe('machine',true);
 const raw=Buffer.from('обычное письмо');const regular=receipts.receive('regular',raw,{expectsReply:true});
 receipts.completeLocal(regular.id,'turn_completed','ответ человеку');
 const src=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const start=src.indexOf('  function prepareReceiptCopies() {');
 const end=src.indexOf('\n  /** Копия ответа',start);assert.ok(start>0&&end>start);
 const code=src.slice(start,end);
 const context={svedenieBezKopii,trevogaNaSvertku,postavitTrevoguSotrudnikam:()=>{},config:{},receipts,deliveryMode:()=> 'owner-all',copyTo:()=> 'tg',copySkipped:()=>{},stripFileAck:x=>x,stripGoalMarker:x=>x,
  sendCopy:(target,sid,body,r)=>receipts.addOutbox(r.id+':copy:answer',r.id,'copy-tg',body)};
 new Function(...Object.keys(context),code+';prepareReceiptCopies();')(...Object.values(context));
 const routes=id=>receipts.db.prepare('SELECT route FROM outbox WHERE receipt_id=? ORDER BY route').all(id).map(x=>x.route);
 assert.deepEqual(routes(old),['a2a','copy-tg']);assert.deepEqual(routes(regular.id),['a2a','copy-tg']);
 assert.deepEqual(routes(quiet),[],'тихая проба ушла человеку/владельцу');
 assert.ok(JSON.parse(receipts.get(quiet).result_json).machineReplyBody);
 console.log('PASS: реальный prepareReceiptCopies сохраняет legacy и обычные ответы, тихую пробу не рассылает');
}finally{receipts.close();fs.rmSync(tmp,{recursive:true,force:true});}
