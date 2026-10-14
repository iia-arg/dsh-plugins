import './approval-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {Store} from '../src/store.mjs';import {TelegramQueue} from '../src/telegram-queue.mjs';
// These are test settings from the owner's decision, never executable defaults.
const owner=712345678,vasily=502127346,maria=964876829,policy={approvalChatId:-1001659691422,botId:77};
const priorApproversFile=process.env.SOCSETI_APPROVERS_FILE;
const settings=fs.mkdtempSync(path.join(os.tmpdir(),'anna-three-approvers-')),dir=path.join(settings,'config'),file=path.join(dir,'approvers.json');fs.mkdirSync(dir,{mode:0o755});fs.writeFileSync(file,JSON.stringify([vasily,maria]),{mode:0o644});fs.chmodSync(dir,0o755);fs.chmodSync(file,0o644);assert.equal(spawnSync('sudo',['-n','chown','-R','0:0',dir]).status,0);process.env.SOCSETI_APPROVERS_FILE=file;process.once('exit',()=>{spawnSync('sudo',['-n','rm','-rf','--',dir]);fs.rmSync(settings,{recursive:true,force:true})});
let seq=0;
function fixture(t,platform,kind){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anna-grant-'));let now=Date.parse('2026-10-13T05:59:00Z');const s=new Store(dir,{telegram:'-202',vk:'123',instagram:'456',threads:'789'},{profile:'anna',now:()=>now}),q=new TelegramQueue(s,policy);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true})});let args={request_id:'grant-'+(++seq),platform,text:'Черновик 🌊'},tool='draft_post';
 if(kind!=='post'){
  s.ingestEvent('anna',{platform,account_id:s.target(platform),provider_id:'control-'+seq,kind,conversation_id:'peer-42',subject_id:'person-99',text:'Входящее'});
  args={request_id:'reply-'+seq,event_token:s.pendingAnna()[0].payload.event_token,text:'Черновик ответа'};tool='draft_reply';
 }
 const d=s.execute('anna',tool,args);now=Date.parse('2026-10-13T06:00:00Z');q.enqueueCards();let card,message;
 for(let n=0;n<3;n++){
  const a=q.claim();assert.ok(a);const m={message_id:n+11,date:1,chat:{id:policy.approvalChatId},from:{id:77,is_bot:true},text:a.request.args.text,reply_markup:a.request.args.reply_markup};q.finish(a.id,{result:m});if(a.draft_id===d.draft_id){card=a;message=m;break}now+=3000;
 }
 assert.ok(card);return {s,q,d,card,message,update(person,id=1){return {update_id:id,callback_query:{id:'grant-cb-'+id,from:{id:person,is_bot:false},message,data:'publish:'+card.nonce}}}};
}
// Break caught: a configured human is denied for a reply in one of the social networks.
for(const platform of ['telegram','vk','instagram','threads'])for(const kind of ['post','dm','comment'])for(const person of [owner,vasily,maria])test(platform+' '+kind+' accepts one human grant from '+person,t=>{
 const f=fixture(t,platform,kind);assert.equal(f.q.claim(),null,'draft has no authority before human grant');const expected=platform==='telegram'&&kind==='post'?'approved':'approved_held_stage3';assert.equal(f.q.processUpdate(f.update(person)).decision,expected);assert.equal(f.s.db.prepare("SELECT count(*) n FROM approvals WHERE state='valid'").get().n,1);assert.equal(f.q.claim(),null,'transfer writer remains closed');
 if(expected==='approved'){const enabled=new TelegramQueue(f.s,{...policy,writerEnabled:true});assert.equal(enabled.claim().kind,'publication');assert.equal(enabled.claim(),null)}
});
// Break caught: strangers, bots, plain yes or a model produce authority without a human-bound card.
test('stranger, bot and batch yes cannot approve any draft',t=>{
 const f=fixture(t,'telegram','post');assert.equal(f.q.processUpdate(f.update(999)).decision,'denied');const bot=f.update(vasily,2);bot.callback_query.from.is_bot=true;assert.equal(f.q.processUpdate(bot).decision,'denied');assert.equal(f.q.processUpdate({update_id:3,message:{from:{id:maria},chat:{id:policy.approvalChatId},text:'да на всё'}}).decision,'denied');assert.equal(f.s.db.prepare('SELECT count(*) n FROM approvals').get().n,0);assert.equal(f.s.db.prepare('SELECT state FROM drafts').get().state,'pending_approval');assert.equal(f.q.claim(),null);
});

// Break caught: removed membership permits a new reply grant despite root settings.
test('removing a delegate refuses a reply grant; restoring the list permits it',t=>{
 const f=fixture(t,'telegram','dm');const original=process.env.SOCSETI_APPROVERS_FILE;t.after(()=>{process.env.SOCSETI_APPROVERS_FILE=original});process.env.SOCSETI_APPROVERS_FILE=priorApproversFile;
 assert.equal(f.q.processUpdate(f.update(vasily)).decision,'denied');assert.equal(f.s.db.prepare('SELECT count(*) n FROM approvals').get().n,0);assert.equal(f.s.db.prepare('SELECT state FROM drafts').get().state,'pending_approval');
 process.env.SOCSETI_APPROVERS_FILE=original;assert.equal(f.q.processUpdate(f.update(vasily,2)).decision,'approved_held_stage3');assert.equal(f.q.claim(),null);
});
