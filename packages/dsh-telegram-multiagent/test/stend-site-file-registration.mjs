// RU: Изолированный стенд stend-site-file-registration.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-site-file-registration.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';import {installFileTools} from '../src/outgoing-files.js';import {installSitePolicy} from '../src/site-policy.js';import {MessageReceipts} from '../src/message-receipts.js';import {ConversationSessions} from '../src/conversation-sessions.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-file-reg-'));let p,l;let ok=0,fail=0;
async function test(n,f){try{await f();ok++;console.log('PASS '+n);}catch(e){fail++;console.error('FAIL '+n+': '+e.message);}}
try{
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});l=new MessageReceipts(path.join(root,'ledger'));const conversations=new ConversationSessions(l),tools=p.ctx.get('tools');
 tools.register({name:'pismo_rukovoditelyu',description:'fixture',parameters:{},output:{schema:{type:'object',properties:{}},render:()=>[]},execute:async()=>({})});
 const make=async id=>(await p.agents.create({sessionId:id,meta:{cwd:root},setup:(ctx,a)=>{if(id.startsWith('telegram-site-'))installSitePolicy(ctx,a,{closed:()=>false});}})).agent;
 const existing=await make('telegram-site-10');const logs=[];
 const plugin=p.ctx.plugin({name:'file-channel',inject:['agents'],apply(ctx){installFileTools(ctx,{workspace:root,receipts:l,conversations,telegram:{sendFile:async()=>{throw Error('network forbidden');}},config:{openBot:true},appDir:process.env.DSH_TEST_APP,log:x=>logs.push(x)});}});
 await new Promise(r=>setTimeout(r,25));
 const fresh=await make('telegram-site-11'),rotated=await make('telegram-site-12-v2-1234'),tg=await make('telegram-13');
 for(const [label,a]of [['existing site',existing],['new site',fresh],['rotated site',rotated]])await test(label+' exact pismo list',async()=>assert.deepEqual(tools.wireSchemas(a).schemas.map(x=>x.name).sort(),['pismo_rukovoditelyu']));
 await test('Telegram file tool retained',async()=>assert(tools.wireSchemas(tg).schemas.some(x=>x.name==='telegram_send_file')));
 await test('site direct file call denied',async()=>assert((await tools.execute({name:'telegram_send_file',arguments:{path:'fixture.txt'},agent:fresh,callId:'denied',signal:new AbortController().signal})).isError));
 await plugin.dispose();await test('channel unload removes Telegram file tool',async()=>assert(!tools.wireSchemas(tg).schemas.some(x=>x.name==='telegram_send_file')));
}finally{await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true});}
console.log(`RESULT ${ok}/${ok+fail}`);process.exitCode=fail?1:0;
