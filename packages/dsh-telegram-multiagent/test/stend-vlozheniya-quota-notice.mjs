// RU: Изолированный стенд stend-vlozheniya-quota-notice.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-vlozheniya-quota-notice.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {AttachmentStore} from '../src/attachments.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'file-notice-'));let now=1,sent=0;
try {
 const s=new AttachmentStore({workspace:root,now:()=>now,download:async()=>new Response('x')});
 const a=await s.receive({chat:{id:1},message_id:1,document:{file_id:'f',file_unique_id:'u',file_name:'a.txt',file_size:1}});await s.queued(a.deliveryId,'s');now=700000;
 const quota=s.quota;s.quota=s.used();
 for(let i=0;i<2;i++)await s.tick(async()=>{sent++;}).catch(()=>{});
 assert.equal(sent,0,'no external notification before durable attempt can fit');
 s.quota=quota;await s.tick(async()=>{sent++;});await s.tick(async()=>{sent++;});assert.equal(sent,1);
 fs.chmodSync(a.path,0o644);await assert.rejects(()=>s.receive({chat:{id:1},message_id:1,document:{file_id:'f',file_size:1}}),/прав|приват/);
 console.log('PASS quota blocks unsafe repeats; restored → one notification; private mode checked');
}finally{fs.rmSync(root,{recursive:true,force:true});}
