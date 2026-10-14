// RU: Изолированный стенд stend-new-return-restart.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-new-return-restart.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {MessageReceipts,RETRY_SECONDS} from '../src/message-receipts.js';import {deliverCancellationReturn,cancellationReturn,cancellationNotice} from '../src/cancellation-return.js';import {extractFunction} from './extract.mjs';
if(process.argv[2]==='crash'){
 const root=process.argv[3],ledger=new MessageReceipts(path.join(root,'ledger'));
 const ctx={deployment:{coordinatorReturnRecipient:'coordinator'},receipts:ledger,config:{a2aDir:path.join(root,'a2a')},deliverCancellationReturn:(r,p,options)=>deliverCancellationReturn(r,p,{...options,remoteCourier:path.join(root,'courier.mjs')})};
 vm.createContext(ctx);vm.runInContext(extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'deliverReceiptOutbox'),ctx);
 await ledger.deliverResults(async row=>{await ctx.deliverReceiptOutbox(row);process.exit(0)});throw Error('dispatch did not happen');
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'return-restart-'));let ledger=new MessageReceipts(path.join(root,'ledger'));
try{
 const routes={coordinatorReturnRecipient:'coordinator',a2aDir:path.join(root,'a2a')},r=ledger.receive('signed',Buffer.from('message without From'),{sourcePath:path.join(root,'a2a','in','signed.txt'),route:'a2a',sender:''});ledger.audit(r.id,'coordinator_signature_verified','fixture accepted earlier');
 const destination=cancellationReturn(r,ledger,routes);assert.deepEqual(destination,{kind:'remote',recipient:'coordinator'});
 const command=ledger.receive('command',Buffer.from('/new'),{route:'tg',routeKey:7,expectsReply:false});
 ledger.addOutbox(r.id+':new-return',r.id,'new-return',JSON.stringify({destination,text:cancellationNotice(r),command:command.id}));
 fs.writeFileSync(path.join(root,'courier.mjs'),`#!/usr/bin/env node\nimport fs from 'node:fs';const body=fs.readFileSync(process.argv[2],'utf8')+'\\n--\\nположено в щель: '+new Date().toISOString()+'\\n';fs.appendFileSync(${JSON.stringify(path.join(root,'placed.jsonl'))},JSON.stringify(body)+'\\n');\n`,{mode:0o700});
 ledger.close();const child=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning',fileURLToPath(import.meta.url),'crash',root],{encoding:'utf8',timeout:15000});assert.equal(child.status,0,child.stderr);
 ledger=new MessageReceipts(path.join(root,'ledger'),{now:()=>Date.now()+1000000});const row=ledger.db.prepare('SELECT * FROM outbox WHERE id=?').get(r.id+':new-return');assert.equal(row.sent_at,null);assert.match(row.error,/^HOLD:/);assert.equal(row.attempts,1);
 let calls=0;await ledger.deliverResults(async()=>{calls++});assert.equal(calls,0);assert.equal(fs.readFileSync(path.join(root,'placed.jsonl'),'utf8').trim().split('\n').length,1);
 const ctx={deployment:{coordinatorReturnRecipient:'coordinator'},receipts:ledger,RETRY_SECONDS,a2aReported:new Set(),log(){}};vm.createContext(ctx);vm.runInContext(extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'reportReceiptExhaustion'),ctx);ctx.reportReceiptExhaustion();ctx.a2aReported.clear();ctx.reportReceiptExhaustion();
 const alerts=ledger.db.prepare("SELECT * FROM outbox WHERE id=?").all('new-return-hold:'+r.id+':new-return');assert.equal(alerts.length,1);assert.equal(alerts[0].route,'tg');assert.equal(alerts[0].receipt_id,command.id);assert(alerts[0].body.includes(r.id));
 console.log('PASS verified coordinator with empty sender; native outbox survives crash after stamped remote placement without resend');
}finally{ledger.close();fs.rmSync(root,{recursive:true,force:true})}
