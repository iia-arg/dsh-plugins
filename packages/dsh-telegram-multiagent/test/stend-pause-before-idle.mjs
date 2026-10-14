// RU: Изолированный стенд stend-pause-before-idle.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-pause-before-idle.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';import {MessageReceipts} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';import {ConversationPause} from '../src/conversation-pause.js';
import * as stopModule from '../src/telegram-stop.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'workertwo-stop-list-'));let p,l;
try{
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});l=new MessageReceipts(path.join(root,'ledger'));const pause=new ConversationPause(l,root);pause.mount(p.ctx);const runtime=new ReceiptRuntime(l,p.sessions,()=>{});runtime.conversationPause=pause;runtime.install(p.ctx);
 const h=await p.agents.create({sessionId:'telegram-a2a',meta:{cwd:root},agentOptions:{provider:'fixture',model:'fixture'}}),a=h.agent;let entered,first=true,release;const gate=new Promise(r=>entered=r),hold=new Promise(r=>release=r),requests=[];
 p.ctx.on('agent/pre-step',async(args,next)=>{if(first){first=false;entered();await new Promise(r=>args.signal.addEventListener('abort',r,{once:true}));await hold;args.signal.throwIfAborted()}return next()});
 p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));p.ctx.get('llm').stream=async function*(request){requests.push(JSON.parse(JSON.stringify(request.messages)));yield {type:'text-delta',index:0,text:'fixture result'};yield {type:'finish',reason:{kind:'stop'}}};
 const receive=(id,options={})=>l.receive(id,Buffer.from(JSON.stringify({message:{text:id,from:{id:7,first_name:'Owner'},chat:{id:7}}})),{route:'tg',routeKey:7,...options});
 const msg=text=>p.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'user'}});
 const original=receive('ORIGINAL_ONCE');await runtime.enqueue(original,a,()=>msg('ORIGINAL_ONCE'),7);await gate;
 const stop=receive('stop');const result=await stopModule.handleTelegramStop({text:'/stop',from:{id:7}},{allowed:new Set([7]),findAgent:()=>a,settleMs:5,pause:agent=>pause.pause(agent.session.header,stop.id)});
 assert.equal(result.state,'interrupting');
 const coordinator=receive('COORDINATOR_QUEUED',{route:'a2a',sender:'coordinator'});l.audit(coordinator.id,'coordinator_signature_verified','fixture trusted signature');await runtime.enqueue(coordinator,a,()=>msg('COORDINATOR_QUEUED'),'a2a');assert.equal(l.get(coordinator.id).claimed_turn,null);
 // A-N-1881: the interrupted turn is held by a lock (not a 60 ms timer) until owner input is queued — otherwise a slow disk let the turn end first and the «before idle» case was never exercised.
 if(a.status!=='running'){console.log(`СЛЕПОТА: агент «${a.status}» в момент письма владельца — сценарий «до простоя» не воспроизведён`);throw Error('СЛЕПОТА')}
 const owner=receive('OWNER_X');await runtime.enqueue(owner,a,()=>msg('OWNER_X'),7,null,{ownerResume:true});release();
 for(let i=0;i<300&&!requests.length;i++)await new Promise(r=>setTimeout(r,10));await a.whenIdle();await runtime.observe(a.session);
 assert(requests.length>0,'после письма владельца ход не начался: пауза снята, побудки нет');
 const firstRequest=JSON.stringify(requests[0]);assert.equal((firstRequest.match(/ORIGINAL_ONCE/g)??[]).length,1);assert(firstRequest.includes('OWNER_X'));assert(!firstRequest.includes('COORDINATOR_QUEUED'));assert.equal(l.get(original.id).outcome,'interrupted_unknown');console.log('PASS coordinator cannot resume; owner before idle preserves original exactly once without replay');
}catch(e){if(e?.message!=='СЛЕПОТА')throw e;process.exitCode=2}finally{await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true})}
