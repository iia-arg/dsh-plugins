// RU: Изолированный стенд stend-receipt-lag.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipt-lag.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {MessageReceipts} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lag-'));const home=path.join(root,'ledger');let clock=1000;
let l=new MessageReceipts(home,{now:()=>clock,owner:'first'});const lines=[];
const log=line=>{const db=new DatabaseSync(path.join(home,'receipts.sqlite'),{readOnly:true});assert.equal(db.prepare('SELECT claimed_turn FROM receipts').get().claimed_turn,7);db.close();lines.push(line)};
let rt=new ReceiptRuntime(l,{flush:async()=>true},log);
const session={id:'probe',header:{createdAt:42},events:[]};
const append=(type,data,time)=>session.events.push({type,data,time,seq:session.events.length});
try{
 const source=path.join(root,'letter');fs.writeFileSync(source,'probe');
 const r=l.receive('file','probe',{logicalKey:'probe',sourcePath:source});const msg={id:'msg',role:'user',content:[]};l.prepare(r.id,()=>msg,session,'a2a');
 clock=1100;await l.queue(r.id,{contains:()=>session.events.length>0,send:async m=>append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:0,inserted:[m]},1100),flush:async()=>true});
 clock=1110;l.release(r.id,'file');
 await rt.observe(session);assert.equal(lines.length,0,'до claim молчит');
 append('turn/start',{turn:7},1200);append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:1,inserted:[]},1250);
 clock=2000;for(let i=0;i<4;i++)await rt.observe(session,7);
 const count=lines.length;assert.equal(count,Number(process.env.EXPECT_LINES||1),'число строк за 4 шага');
 const data=JSON.parse(lines[0].slice(lines[0].indexOf('{')));assert.equal(data.taken_at,1250);assert.equal(data.observed_at,2000);assert.equal(data.lag_ms,140);assert.equal(data.receipt,r.id);
 l.db.close();
 const child=spawnSync(process.execPath,['--input-type=module','-e',`
   import {MessageReceipts} from ${JSON.stringify(new URL('../src/message-receipts.js',import.meta.url).href)};
   import {ReceiptRuntime} from ${JSON.stringify(new URL('../src/receipt-runtime.js',import.meta.url).href)};
   const l=new MessageReceipts(${JSON.stringify(home)},{now:()=>3000,owner:'restarted'});
   const rt=new ReceiptRuntime(l,{flush:async()=>true});
   await rt.observe(${JSON.stringify(session)},null,true);l.db.close();
 `],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'','новый процесс не печатает строк');
 l=new MessageReceipts(home,{now:()=>3000,owner:'reopened'});
 console.log(`PASS first-transition lines=${count}; four steps; COMMIT visible from independent connection; event time; restart=0`);
}finally{l.db.close();fs.rmSync(root,{recursive:true,force:true})}
