import './approval-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Store} from '../src/store.mjs';import {createTelegramWorker,CONFLICT_LIMIT} from '../src/telegram-worker.mjs';import {TelegramApi,TelegramFailure} from '../src/telegram-api.mjs';

// 16.10.2026: halt 15.10 17:52Z (poll_failed) пришёл при обрыве сети, код ответа в журнал не попал.
// Стенд: 409 на getUpdates — ограниченный повтор; 401/403 — halt сразу; код и описание Telegram — в событиях.
const conflict=()=>new TelegramFailure('rejected',409,0,'Conflict: terminated by other getUpdates request');
async function worker(t,script,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socseti-conflict-'));const s=new Store(dir,{telegram:'-202'});
 t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true})});
 const log=[],polls=[];
 const api={stop(){},async call(name,args){if(name==='getMe')return{id:77,is_bot:true,username:'ostrov_smm_bot'};if(name==='getWebhookInfo')return{url:''};if(name==='getChat')return{id:Number(args.chat_id),type:Number(args.chat_id)===-101?'supergroup':'channel'};if(name==='getChatMember')return{status:'administrator',can_post_messages:true};
  if(name==='getUpdates'){polls.push(Date.now());const step=script.shift();if(step instanceof Error)throw step;return step??[]}throw Error('unexpected call')}};
 const w=await createTelegramWorker(s,{approvalChatId:-101},{api,log:r=>log.push(r),...options});return {s,w,log,polls};
}
const events=(log,name)=>log.filter(r=>r.event===name);

test('409 below the limit is retried, success resets the conflict count',async t=>{
 assert.equal(CONFLICT_LIMIT,3);
 const {s,w,log}=await worker(t,[conflict(),conflict(),[],conflict(),conflict(),[]]);
 for(let i=0;i<6;i++)await w.tick();
 assert.equal(s.status().telegram.halted,false);
 assert.deepEqual(events(log,'telegram_poll_conflict').map(r=>r.attempt),[1,2,1,2]);
 assert.equal(events(log,'telegram_poll_conflict')[0].error_code,409);
 assert.match(events(log,'telegram_poll_conflict')[0].description,/terminated by other getUpdates/);
 assert.equal(events(log,'telegram_halted').length,0);assert.equal(s.status().publishing,true);await w.stop();
});
test('409 at the limit halts with code and description',async t=>{
 const {s,w,log}=await worker(t,[conflict(),conflict(),conflict()]);
 for(let i=0;i<3;i++)await w.tick();
 assert.equal(s.status().telegram.halted,true);assert.equal(s.status().telegram.reason,'poll_failed');
 const [h]=events(log,'telegram_halted');assert.equal(h.error_code,409);assert.match(h.description,/Conflict/);await w.stop();
});
test('network errors between conflicts do not reset the conflict count',async t=>{
 const {s,w}=await worker(t,[conflict(),Error('synthetic timeout'),conflict(),Error('synthetic timeout')]);
 for(let i=0;i<4;i++)await w.tick();
 assert.equal(s.status().telegram.halted,false);
 const more=await worker(t,[conflict(),Error('synthetic timeout'),conflict(),Error('synthetic timeout'),conflict()]);
 for(let i=0;i<5;i++)await more.w.tick();
 assert.equal(more.s.status().telegram.halted,true);await w.stop();await more.w.stop();
});
test('401 and 403 halt at once and carry the Telegram code',async t=>{
 for(const code of [401,403]){
  const {s,w,log}=await worker(t,[new TelegramFailure('rejected',code,0,'Unauthorized or Forbidden')]);
  await w.tick();assert.equal(s.status().telegram.halted,true);
  const [h]=events(log,'telegram_halted');assert.equal(h.error_code,code);assert.equal(events(log,'telegram_poll_conflict').length,0);await w.stop();
 }
});
test('degraded event names a transport failure kind',async t=>{
 const {w,log}=await worker(t,[new TelegramFailure('unknown')]);
 await w.tick();const [d]=events(log,'telegram_poll_degraded');assert.equal(d.kind,'unknown');assert.equal(d.error_code,undefined);await w.stop();
});
test('worker loop waits conflictPauseMs after a conflict, not the 1 s failure backoff',async t=>{
 const {w,polls}=await worker(t,[conflict()],{conflictPauseMs:2500});
 w.start();while(polls.length<2)await new Promise(r=>setTimeout(r,20));
 assert.ok(polls[1]-polls[0]>=2500,`gap ${polls[1]-polls[0]} ms`);await w.stop();
});
test('TelegramApi keeps a bounded Telegram description on rejection',async()=>{
 const reply=description=>async()=>new Response(JSON.stringify({ok:false,error_code:409,description}),{status:409});
 const token='12345:'+'a'.repeat(30);
 await assert.rejects(()=>new TelegramApi(token,{fetchImpl:reply('Conflict: terminated by other getUpdates request')}).call('getUpdates'),e=>e.code===409&&e.description==='Conflict: terminated by other getUpdates request');
 await assert.rejects(()=>new TelegramApi(token,{fetchImpl:reply('x'.repeat(500))}).call('getUpdates'),e=>e.description.length===200);
 await assert.rejects(()=>new TelegramApi(token,{fetchImpl:reply(42)}).call('getUpdates'),e=>e.code===409&&e.description===null);
});
