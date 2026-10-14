// RU: Изолированный стенд stend-arhiva-prochitannogo.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-arhiva-prochitannogo.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts,BODY_RETENTION_MS} from '../src/message-receipts.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-archive-'));let now=1;const ledger=new MessageReceipts(path.join(root,'ledger'),{now:()=>now});
try {
 const source=path.join(root,'letter');fs.writeFileSync(source,'body');const r=ledger.receive('source','body',{sourcePath:source});
 assert.throws(()=>ledger.release(r.id,'source'),/not flushed/);assert(fs.existsSync(source));
 ledger.completeLocal(r.id,'refused','refused');fs.writeFileSync(source,'changed');assert.throws(()=>ledger.release(r.id,'source'),/изменён/);assert.equal(fs.readFileSync(source,'utf8'),'changed');
 fs.writeFileSync(source,'body');ledger.release(r.id,'source');const archive=ledger.source('source').archive_path;assert.equal(fs.readFileSync(archive,'utf8'),'body');
 now+=BODY_RETENTION_MS+1;ledger.expireBodies();assert(fs.existsSync(archive),'unsent result retains bytes');await ledger.deliverResults(async()=>{});ledger.expireBodies();assert(fs.existsSync(archive));now+=BODY_RETENTION_MS+1;ledger.expireBodies();assert(!fs.existsSync(archive));assert.equal(ledger.get(r.id).raw,null);assert(ledger.get(r.id).payload_sha);
 console.log('PASS source preserved on refused release; archive bytes verified; retention waits result, identity survives');
}finally{ledger.close();fs.rmSync(root,{recursive:true,force:true});}
