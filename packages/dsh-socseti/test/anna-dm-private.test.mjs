import './approval-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Store} from '../src/store.mjs';import {TelegramQueue} from '../src/telegram-queue.mjs';
for(const platform of ['vk','instagram'])test('DM notice '+platform+' exposes only network/time/eventID; public comment unchanged',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anna-private-notice-'));let now=Date.parse('2026-10-16T05:59:00Z');const targets={telegram:'-1001925584120',vk:'127999849',instagram:'17841453053403067'};const s=new Store(dir,targets,{profile:'anna',now:()=>now});t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true})});
 const dm=s.ingestEvent('anna',{platform,account_id:targets[platform],provider_id:'private-dm',kind:'dm',conversation_id:'PRIVATE_CONVERSATION',subject_id:'PRIVATE_SUBJECT',text:'PRIVATE_BODY_🌊',occurred_at:now}).event_id;
 const comment=s.ingestEvent('anna',{platform,account_id:targets[platform],provider_id:'public-comment',kind:'comment',conversation_id:'public-post',subject_id:'public-author',text:'PUBLIC_COMMENT',occurred_at:now}).event_id;
 const queue=new TelegramQueue(s,{approvalChatId:-1001659691422,botId:77,writerEnabled:false});now=Date.parse('2026-10-16T06:00:00Z');queue.enqueueCards();const action=queue.claim();assert.ok(action);const text=action.request.args.text;
 assert.ok(text.includes(dm)&&text.includes(comment)&&text.includes(platform)&&text.includes('08:59'));for(const secret of ['PRIVATE_BODY_🌊','PRIVATE_SUBJECT','PRIVATE_CONVERSATION'])assert.ok(!text.includes(secret),'DM leaked '+secret);
 assert.ok(text.includes('PUBLIC_COMMENT')&&text.includes('public-author'));assert.equal(action.request.args.reply_markup,undefined);
 queue.finish(action.id,{result:{message_id:44,chat:{id:-1001659691422},from:{id:77,is_bot:true},text}});assert.equal(s.db.prepare("SELECT count(*) n FROM outbox WHERE kind='event_card_request' AND state='tg_sent'").get().n,2);
 const body=s.db.prepare('SELECT text FROM events WHERE id=?').get(dm).text;assert.equal(body,'PRIVATE_BODY_🌊','private input must remain available to Anna');
});
