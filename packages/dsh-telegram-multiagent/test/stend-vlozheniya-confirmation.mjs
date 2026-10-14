// RU: Изолированный стенд stend-vlozheniya-confirmation.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-vlozheniya-confirmation.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {AttachmentStore} from '../src/attachments.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'file-ack-'));let now=0;
try {
 const s=new AttachmentStore({workspace:root,now:()=>now,download:async()=>new Response('x')});const a=await s.receive({chat:{id:1},message_id:1,document:{file_id:'x',file_size:1}});await s.queued(a.deliveryId,'s');
 const marker=`[[file-read:${a.deliveryId}:${a.sha256}]]`;
 assert.deepEqual(await s.confirm('s',`Когда прочту, отправлю ${marker}.`),[],'quoting the protocol is not confirmation');
 assert.deepEqual(await s.confirm('s',marker),[],'bare marker without a human-visible result must not silence the sender');
 const b=await s.receive({chat:{id:1},message_id:2,document:{file_id:'y',file_size:1}});await s.queued(b.deliveryId,'s');
 const marker2=`[[file-read:${b.deliveryId}:${b.sha256}]]`;
 assert.equal((await s.confirm('s','Оба файла содержат x.\n'+marker+'\n'+marker2)).length,2);
 console.log('PASS only explicit final acknowledgement with visible result closes wait');
}finally{fs.rmSync(root,{recursive:true,force:true});}
