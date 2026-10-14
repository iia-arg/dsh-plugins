// RU: Изолированный стенд stend-sent-copies.mjs: копия владельцу писем, которые агент сам уложил через инструмент отправки (зеркало polnye).
//     Предмет — prepareSentCopies и доставка copy-tg из src/index.js, разбор зеркала — src/sent-copies.js; Telegram подставной.
//     Не проверяет: живой инструмент отправки, живой бот, файловую почту соседям (у неё своя видимость).
// EN: Isolated harness stend-sent-copies.mjs: owner copies of letters placed through the sending tool; Telegram is stubbed.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';
import {extractFunction} from './extract.mjs';import {MessageReceipts,mailEnvelope,RETRY_SECONDS} from '../src/message-receipts.js';
import {sentCopyCandidates,sentCopyText} from '../src/sent-copies.js';import {TelegramClient} from '../src/client.js';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sent-copies-'));const a2a=path.join(root,'a2a');const polnye=path.join(a2a,'polnye');const out=path.join(a2a,'out');
fs.mkdirSync(polnye,{recursive:true});fs.mkdirSync(out,{recursive:true});
let clock=Date.UTC(2026,9,4,18,0,0),mode='owner-all';const ledger=new MessageReceipts(path.join(root,'ledger'),{now:()=>clock});
const chunks=[],logs=[];const tg=new TelegramClient('stend-token');tg.call=async(method,args)=>{chunks.push({method,...args});return {};};
const ctx={config:{},deployment:{},guestCopies:null,siteSource:null,fs,path,crypto,Buffer,JSON,mailEnvelope,RETRY_SECONDS,receipts:ledger,log:m=>logs.push(m),
 tg,deliveryMode:()=>mode,ownerChatId:()=>123,A2A_POLNYE:polnye,A2A_OUT:out,sentCopyCandidates,sentCopyText,stripFileAck:x=>x,stripGoalMarker:x=>x};
const scope=vm.createContext(ctx);
const copyStart=source.indexOf('const copyTo = ');const copyEnd=source.indexOf('\n  };',copyStart);
if(copyStart<0||!source.includes('function prepareSentCopies(')){console.log('СЛЕПОТА: в src/index.js нет prepareSentCopies/copyTo — предмета нет');process.exit(2);}
ctx.copyTo=vm.runInContext('('+source.slice(copyStart+'const copyTo = '.length,copyEnd+4)+')',scope);
for(const n of ['copySkipped','prepareSentCopies','deliverReceiptOutbox'])ctx[n]=vm.runInContext('('+extractFunction(source,n)+')',scope);
const stamp=t=>`\n--\nположено в щель: ${new Date(t).toISOString().replace('T',' ').slice(0,19)} UTC (снято командой в момент укладки, не рукой автора)\n`;
const name=(komu,t,pid)=>`dlya-${komu}-tema-${new Date(t).toISOString().replace(/[-:]/g,'').slice(0,15)}Z-${pid}.md`;
function polozhit(komu,t,text,{bezShtampa=false}={}){const f=name(komu,t,Math.floor(Math.random()*1e6));fs.writeFileSync(path.join(polnye,f),text+(bezShtampa?'':stamp(t)));return f;}
async function tick(){ctx.prepareSentCopies();await ledger.deliverResults(ctx.deliverReceiptOutbox,{copyOnly:true});}
const sent=()=>chunks.filter(c=>c.method==='sendMessage');const kopii=()=>sent().filter(c=>c.text.startsWith('✉️ письмо → '));
let bed=0,vsego=0;const proba=async(imya,fn)=>{vsego++;try{await fn();console.log('  ✅ '+imya);}catch(e){bed++;console.log('  🔴 '+imya+' — '+(e?.message??e));}};
try{
 polozhit('koordinatora',clock-3600e3,'Старое письмо до отметки');
 await proba('первый проход заводит отметку и историю НЕ рассылает',async()=>{await tick();assert.equal(kopii().length,0);
  assert.ok(ledger.db.prepare("SELECT value FROM meta WHERE key='sent_copy_since'").get());});
 clock+=60e3;const f1=polozhit('koordinatora',clock,'Агент → координатору · письмо посреди хода');
 await proba('уложенное письмо → копия владельцу с пометкой «письмо → koordinatora» и текстом как ушёл',async()=>{await tick();
  const k=kopii();assert.equal(k.length,1);assert.equal(k[0].chat_id,123);assert.ok(k[0].text.startsWith('✉️ письмо → koordinatora'));
  assert.ok(k[0].text.includes('письмо посреди хода')&&k[0].text.includes(f1)&&k[0].text.includes('положено в щель: '));});
 await proba('повторный проход — без дубля',async()=>{await tick();assert.equal(kopii().length,1);});
 clock+=60e3;polozhit('auditora',clock,'Зеркало без штампа: в щель не легло',{bezShtampa:true});
 await proba('зеркало без штампа «положено в щель» (письмо не уложено) → копии нет',async()=>{await tick();assert.equal(kopii().length,1);});
 clock+=60e3;const dlinnoe='абв '.repeat(2500);polozhit('auditora',clock,dlinnoe);
 await proba('длинное письмо — разбиением на части, не обрезкой (весь текст дошёл)',async()=>{const do_=sent().length;await tick();const novye=sent().slice(do_);
  assert.ok(novye.length>=3,'частей '+novye.length);assert.ok(novye[0].text.startsWith('✉️ письмо → auditora'));
  assert.equal(novye.map(c=>c.text).join(' ').replace(/\s+/g,' ').split('абв').length-1,2500);});
 mode='personal';clock+=60e3;polozhit('koordinatora',clock,'Письмо в режиме personal');
 await proba('режим personal → копии нет и в очередь она не ставится',async()=>{const k=kopii().length;await tick();assert.equal(kopii().length,k);
  assert.equal(ledger.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE 'sent-copy:%' AND body LIKE '%режиме personal%'").get().n,0);});
 mode='owner-all';
 await proba('возврат в owner-all — письмо из personal не досылается (и после окна повторов)',async()=>{const k=kopii().length;await tick();clock+=3600e3;await tick();assert.equal(kopii().length,k);});
 clock+=60e3;fs.writeFileSync(path.join(out,'receipt-abc.txt'),'[delivery-v1 id=abc reply=no]\nИтоговый ответ хода');
 await proba('ответ хода (каталог out, не зеркало) — копии «письмо» нет, дубля ответа нет',async()=>{const k=kopii().length;await tick();assert.equal(kopii().length,k);});
}finally{ledger.close();fs.rmSync(root,{recursive:true,force:true});}
console.log(`итог: ${vsego-bed} из ${vsego}`);process.exit(bed?1:0);
