// RU: B-N-1629 (перенос на 2.5.93): статус прерывания письма из Telegram (interrupt-status:copy-tg:…) в режиме без копий владельцу (personal, в т.ч. откат
//     при нечитаемом JSON настроек). Предмет — copyTo/copySkipped/deliverReceiptOutbox из src/index.js (STEND_INDEX — порча), журнал —
//     настоящий MessageReceipts и completeRow; Telegram подставной. До лечения: throw → 5 попыток (RETRY_SECONDS) → исчерпание.
//     Не проверяет: чтение режима из JSON (settings), живой бот, reportReceiptExhaustion (признак исчерпания — attempts/sent_at строки).
// EN: B-N-1629 harness: interrupt-status copy rows must be dropped quietly when the mode gives the owner no copies.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';
import {extractFunction} from './extract.mjs';import {MessageReceipts,mailEnvelope,RETRY_SECONDS} from '../src/message-receipts.js';
const idx=process.env.STEND_INDEX?path.resolve(process.env.STEND_INDEX):new URL('../src/index.js',import.meta.url).pathname;
const source=fs.readFileSync(idx,'utf8');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'stend-interrupt-status-personal-'));
let clock=Date.UTC(2026,9,5,12,0,0),mode='personal';const ledger=new MessageReceipts(path.join(root,'ledger'),{now:()=>clock,ownerCopyMode:()=>mode}); // как в бою 2.5.93 (index.js:170)
const sent=[],logs=[];const tg={send:async(chat,text)=>{sent.push({chat,text});}};
const ctx={config:{},deployment:{},guestCopies:null,siteSource:null,fs,path,crypto,Buffer,JSON,mailEnvelope,RETRY_SECONDS,receipts:ledger,log:m=>logs.push(m),
 tg,deliveryMode:()=>mode,ownerChatId:()=>123,A2A_OUT:path.join(root,'out'),stripFileAck:x=>x,stripGoalMarker:x=>x};
const scope=vm.createContext(ctx);
const copyStart=source.indexOf('const copyTo = ');const copyEnd=source.indexOf('\n  };',copyStart);
if(copyStart<0||!source.includes('async function deliverReceiptOutbox(')){console.log('СЛЕПОТА: в '+idx+' нет copyTo/deliverReceiptOutbox');process.exit(2);}
ctx.copyTo=vm.runInContext('('+source.slice(copyStart+'const copyTo = '.length,copyEnd+4)+')',scope);
for(const n of ['copySkipped','deliverReceiptOutbox'])ctx[n]=vm.runInContext('('+extractFunction(source,n)+')',scope);
const progon=async()=>{for(let i=0;i<8;i++){clock+=15*60e3;await ledger.deliverResults(ctx.deliverReceiptOutbox,{copyOnly:true});}}; // 2 ч: все окна повторов (≈755 с) пройдены
let n=0;const oborvat=(o)=>{const r=ledger.receive('k'+(++n),'письмо '+n,{logicalKey:'k'+n,expectsReply:false,...o});
 ledger.tx(()=>ledger.completeRow(ledger.get(r.id),'interrupted_unknown',{end:{reason:{kind:'error',error:{message:'fetch failed'}}},outputs:[]},'x'));return r;};
const stroka=(pref,r)=>ledger.db.prepare("SELECT * FROM outbox WHERE id LIKE ? AND body LIKE ?").get(pref+'%','%'+r.id+'%');
let bed=0;const proba=async(imya,fn)=>{try{await fn();console.log('  ✅ '+imya);}catch(e){bed++;console.log('  🔴 '+imya+' — '+String(e?.message??e).split('\n')[0].slice(0,220));}};
try{
 console.log('стенд статуса прерывания в personal (B-N-1629): index '+idx);
 const a=oborvat({route:'tg',routeKey:'555',sender:'555'});
 const s0=stroka('interrupt-status:copy-tg:',a);
 await proba('0 оборванное письмо из Telegram ставит interrupt-status:copy-tg (предмет есть)',async()=>{assert.ok(s0,'строки нет');});
 await progon();
 await proba('1 personal: статус прерывания снят тихо — 1 попытка, без ошибки, в Telegram не ушёл, audit interrupt_status_skipped',async()=>{
  const s=stroka('interrupt-status:copy-tg:',a);assert.ok(s.sent_at,'не снят: attempts='+s.attempts+' error='+s.error);assert.equal(s.attempts,1,'попыток '+s.attempts);
  assert.equal(s.error,null,'ошибка '+s.error);assert.equal(sent.filter(x=>x.text.includes(a.id)&&x.text.includes('не исполнено')).length,0);
  assert.ok(ledger.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='interrupt_status_skipped' AND detail='личный режим при создании'").get(a.id),'нет audit');});
 await proba('2 personal: исчерпания нет — ни одной copy-tg строки с attempts≥'+RETRY_SECONDS.length+' без отправки',async()=>{
  const ex=ledger.db.prepare("SELECT id,attempts,error FROM outbox WHERE route='copy-tg' AND sent_at IS NULL AND attempts>=?").all(RETRY_SECONDS.length);
  assert.equal(ex.length,0,'исчерпано: '+ex.map(x=>x.id.split(':').slice(0,2).join(':')+' ×'+x.attempts).join(', '));});
 await proba('3 personal: пометка владельцу interrupt-owner по-прежнему снята (регрессия B-N-1619)',async()=>{
  const s=stroka('interrupt-owner:',a);assert.ok(s?.sent_at&&s.attempts===1&&!s.error,'interrupt-owner: '+JSON.stringify({a:s?.attempts,e:s?.error}));});
 const c=ledger.receive('k'+(++n),'вопрос',{logicalKey:'k'+n,expectsReply:false});ledger.tx(()=>ledger.addOutbox(c.id+':copy:answer',c.id,'copy-tg','обычная копия'));
 await progon();
 await proba('4 personal: обычная копия (не прерывание) по-прежнему отказывает — лечение узкое',async()=>{
  const s=ledger.db.prepare('SELECT * FROM outbox WHERE id=?').get(c.id+':copy:answer');assert.ok(!s.sent_at&&s.error?.includes('запрещает'),JSON.stringify({sent:s.sent_at,e:s.error}));});
 mode='owner-all';const b=oborvat({route:'tg',routeKey:'556',sender:'556'});await progon();
 await proba('5 owner-all: статус прерывания доставлен в Telegram владельцу — режим с копиями не задет',async()=>{
  const s=stroka('interrupt-status:copy-tg:',b);assert.ok(s.sent_at&&!s.error,JSON.stringify({a:s.attempts,e:s.error}));
  assert.ok(sent.some(x=>x.chat===123&&x.text.includes(b.id)),'в Telegram не ушло');});
 mode='personal';const d=oborvat({route:'tg',routeKey:'557',sender:'557'});mode='owner-all';await progon();
 await proba('6 2.5.93: создан в personal, режим сменили на owner-all — статус по-прежнему снят (owner_copy_mode при создании), владельцу не ушёл',async()=>{
  const s=stroka('interrupt-status:copy-tg:',d);assert.ok(s.id.endsWith(':personal:'+s.id.split(':').pop())||s.id.includes(':personal:'),'ключ без суффикса режима: '+s.id.split(':').slice(0,5).join(':'));
  assert.equal(s.owner_copy_mode,'personal');assert.ok(s.sent_at&&s.attempts===1&&!s.error,JSON.stringify({a:s.attempts,e:s.error}));
  assert.ok(!sent.some(x=>x.text.includes(d.id)),'ушло владельцу');});
 ledger.close();
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log(`итог: ${bed?'🔴 красных '+bed:'всё зелёное'}`);process.exit(bed?1:0);
