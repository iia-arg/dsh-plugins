// RU: Изолированный стенд stend-guest-file-scope.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-guest-file-scope.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {MessageReceipts} from '../src/message-receipts.js';import {ConversationSessions} from '../src/conversation-sessions.js';
import {installFileTools} from '../src/outgoing-files.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'guest-file-scope-'));let p,ledger,ok=0,fail=0,serial=0;
async function test(name,fn){try{await fn();ok++;console.log('PASS '+name)}catch(e){fail++;console.error('FAIL '+name+' '+e.message)}}
try {
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});ledger=new MessageReceipts(path.join(root,'ledger'));const conversations=new ConversationSessions(ledger),seen=[];
 const config={workspace:root,openBot:true,allowedUsers:[703],appDir:process.env.DSH_TEST_APP};
 const line=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8').split('\n').find(l=>l.trim().startsWith('installFileTools(ctx,'));assert(line);
 const plugin=p.ctx.plugin({name:'guest-file-channel',inject:['agents'],apply(ctx){vm.runInNewContext(line,{ctx,config,allowed:new Set([703]),process,receipts:ledger,conversations,installFileTools,log(){},tg:{async sendFile(chat,file){seen.push({chat,body:file.data.toString()});return{message_id:111}}}})}});
 async function agent(chat,user=Number(chat),rawOverride){serial++;
  const a=(await p.agents.create({sessionId:'telegram-'+chat,meta:{cwd:root}})).agent;conversations.pin(chat,a.session.header);
  const raw=rawOverride??JSON.stringify({message:{chat:{id:Number(chat)},from:{id:user,is_bot:false},text:'synthetic'}});
  const r=ledger.receive('source-'+serial,raw,{route:'tg',routeKey:chat,hold:false});ledger.db.prepare('UPDATE receipts SET session_id=?,session_created=?,dsh_id=?,claimed_turn=1 WHERE id=?').run(a.id,a.session.header.createdAt,'m'+serial,r.id);a.session.append('turn/start',{turn:1});return {a,r};
 }
 const a=await agent('701'),b=await agent('702'),priv=await agent('703'),group=await agent('-704',703);
 for(const chat of ['701','702','-704']){fs.mkdirSync(path.join(root,'vydacha',chat),{recursive:true});fs.writeFileSync(path.join(root,'vydacha',chat,'own.pdf'),'%PDF-1.4\nFOR_'+chat)}
 fs.writeFileSync(path.join(root,'root.txt'),'ROOT');fs.symlinkSync('../../root.txt',path.join(root,'vydacha/701/link.pdf'));fs.symlinkSync('../702',path.join(root,'vydacha/701/alias'));
 const tools=p.ctx.get('tools');
 async function call(who,file,extra={}){return tools.execute({name:'telegram_send_file',arguments:{path:file,...extra},agent:who.a,callId:'scope-'+(++serial),signal:new AbortController().signal})}
 async function denied(who,file,reason,extra){const n=seen.length,r=await call(who,file,extra);assert.equal(r.isError,true,JSON.stringify(r));assert.equal(seen.length,n,'transport must remain untouched');if(reason)assert.match(JSON.stringify(r),reason)}
 await test('guest own file delivered only to A',async()=>{const r=await call(a,'vydacha/701/own.pdf');assert(!r.isError,JSON.stringify(r));assert.deepEqual(seen.at(-1),{chat:'701',body:'%PDF-1.4\nFOR_701'})});
 await test('guest A cannot read B directory',()=>denied(a,'vydacha/702/own.pdf',/папк|бесед/));
 await test('guest A cannot read workspace root',()=>denied(a,'root.txt',/папк|бесед/));
 await test('guest absolute path to B refused',()=>denied(a,path.join(root,'vydacha/702/own.pdf'),/папк|бесед/));
 await test('guest parent traversal refused',()=>denied(a,'vydacha/701/../../root.txt',/папк|бесед/));
 await test('guest outward symlink refused',()=>denied(a,'vydacha/701/link.pdf',/ссылк|папк|бесед/));
 await test('guest intermediate symlink refused',()=>denied(a,'vydacha/701/alias/own.pdf',/ссылк|папк|бесед/));
 await test('guest cannot select destination',()=>denied(a,'vydacha/701/own.pdf',null,{chat_id:'702'}));
 await test('guest B own file stays in B',async()=>{const r=await call(b,'vydacha/702/own.pdf');assert(!r.isError);assert.deepEqual(seen.at(-1),{chat:'702',body:'%PDF-1.4\nFOR_702'})});
 await test('allowed user retains workspace root',async()=>{const r=await call(priv,'root.txt');assert(!r.isError,JSON.stringify(r));assert.deepEqual(seen.at(-1),{chat:'703',body:'ROOT'})});
 await test('privilege uses sender identity not group chat id',async()=>{const r=await call(group,'root.txt');assert(!r.isError,JSON.stringify(r));assert.deepEqual(seen.at(-1),{chat:'-704',body:'ROOT'})});
 const unknown=await agent('705',705,'unparseable');await test('unknown sender evidence never grants full workspace',()=>denied(unknown,'root.txt'));
 const wrong=await agent('706',703,JSON.stringify({message:{chat:{id:999},from:{id:703}}}));await test('mismatched raw chat never grants privilege',()=>denied(wrong,'root.txt'));

 const extra=ledger.receive('mixed','{"message":{"chat":{"id":-704},"from":{"id":701},"text":"guest"}}',{route:'tg',routeKey:'-704',hold:false});ledger.db.prepare('UPDATE receipts SET session_id=?,session_created=?,dsh_id=?,claimed_turn=1 WHERE id=?').run(group.a.id,group.a.session.header.createdAt,'mixed',extra.id);
 await test('mixed-sender group turn remains guest scoped',()=>denied(group,'root.txt',/папк|бесед/));
 await test('mixed-sender turn can send own group file',async()=>{assert(!(await call(group,'vydacha/-704/own.pdf')).isError);assert.equal(seen.at(-1).chat,'-704')});
 await test('tool schema tells agent the conversation directory',async()=>{assert.match(JSON.stringify(tools.wireSchemas(a.a).schemas),/vydacha/)});
 await plugin.dispose();
 const closed=p.ctx.plugin({name:'closed-file-channel',inject:['agents'],apply(ctx){installFileTools(ctx,{workspace:root,receipts:ledger,conversations,config:{openBot:false,allowedUsers:[]},appDir:process.env.DSH_TEST_APP,telegram:{async sendFile(chat,file){seen.push({chat,body:file.data.toString()});return{message_id:1}}}})}});
 await test('closed channel retains workspace behavior',async()=>{assert(!(await call(a,'root.txt')).isError);assert.deepEqual(seen.at(-1),{chat:'701',body:'ROOT'})});
 await closed.dispose();
}finally{await p?.ctx.fiber.dispose();ledger?.close();fs.rmSync(root,{recursive:true,force:true})}
console.log(JSON.stringify({ok,fail}));process.exitCode=fail?1:0;
