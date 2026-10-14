// RU: Изолированный стенд stend-vlozheniya-store.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-vlozheniya-store.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AttachmentStore} from '../src/attachments.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'attachment-test-'));
let calls=0,clock=1000;
const payload=Buffer.from('file data');
const msg=(id,uid='unique',name='a.zip',chat=7)=>({message_id:id,chat:{id:chat},document:{file_id:'f'+id,file_unique_id:uid,file_name:name,file_size:payload.length}});
try {
 const s=new AttachmentStore({workspace:root,now:()=>clock,download:async()=>{calls++;return new Response(payload);}});
 const a=await s.receive(msg(1));assert.equal(typeof a.path,'string','receive must save and identify a file');assert.equal(fs.readFileSync(a.path,'utf8'),'file data');assert.equal(fs.statSync(a.path).mode&0o777,0o600);
 const b=await s.receive(msg(2));assert.equal(b.path,a.path);assert.equal(calls,1,'same Telegram unique id must avoid network');
 const c=await s.receive(msg(3,'new-id'));assert.equal(c.path,a.path);assert.equal(calls,2,'new Telegram id requires SHA download but no second original');
 const d=await s.receive(msg(4,'another','bad\nSHA256=FAKE.zip'));assert(d.text.includes('bad\\nSHA256=FAKE.zip'));assert(!d.text.includes('\nSHA256=FAKE'));
 await s.queued(a.deliveryId,'session');clock+=600001;const sent=[];await s.tick(async(c,t)=>sent.push(t));assert(sent.some(t=>t.includes('10 минут')));
 const reloaded=new AttachmentStore({workspace:root,now:()=>clock,download:async()=>{throw Error('not needed')}});
 const again=[];await reloaded.tick(async(c,t)=>again.push(t));assert.equal(again.length,0,'timeout notification persists across restart');
 console.log('PASS saved bytes/mode; identity+SHA dedupe; safe name; durable timeout');
} finally {fs.rmSync(root,{recursive:true,force:true});}
