// RU: Изолированный стенд stend-vlozheniya-route.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-vlozheniya-route.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import { sGostem } from './gost-kontekst.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {extractFunction} from './extract.mjs';
import {handleTelegramStop} from '../src/telegram-stop.js';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const delivered=[];
const tg={send:async()=>{},typing:async()=>{}};
const attachmentStore={receive:async()=>({text:'[Вложение] /saved/project.zip',deliveryId:'a',path:'/saved/project.zip',skipDispatch:false}),prepare:async()=>true,queued:async()=>{},tick:async()=>{}};
const ctx={handleTelegramStop,nastrojkaGruppy:()=>null,settings:()=>({}),config:{},ownerChatId:()=>null,isAllowed:()=>true,allowed:new Set([7]),tg,who_:'test',log:()=>{},attachmentStore,
 selectAttachment:m=>m.document?{kind:'document',...m.document}:null,
 transcribeVoice:async()=> 'голос',MERGE_CHAT:null,A2A_CHAT:'a2a',agentFor:async()=>({sessionId:'s',handle:{agent:{whenIdle:async()=>{},send:m=>delivered.push(m)}}}),
 tgChatFor:new Map(),lastOrigin:new Map(),pushAsk:()=>{},copyAsk:()=>{},stripMark:x=>x,platform:{createUserMessage:x=>x},
 receiptRuntime:()=>({enqueue:async(r,agent,makeMessage)=>{assert.equal(r.id,"receipt");agent.send(makeMessage());}}),
 nudgeUntilClaimed:()=>{},oborvalsyaOshibkoj:new Map(),setTimeout:()=>0};
const handler=vm.runInNewContext('('+extractFunction(source,'handleUpdate')+')', sGostem(ctx));
await handler({update_id:1,message:{message_id:1,chat:{id:7},from:{id:7},document:{file_id:'zip',file_name:'project.zip'}}},{id:'receipt'});
assert.equal(delivered.length,1,'ZIP must reach the real handleUpdate → agent.send path');
console.log('PASS actual handleUpdate delivers ZIP');
