// RU: Изолированный стенд attachment-harness.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness attachment-harness.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import { sGostem } from './gost-kontekst.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {extractFunction} from './extract.mjs';
import {handleTelegramStop} from '../src/telegram-stop.js';
export function harness(store,{authorized=true,noticeFailure=false,openBot=false,allowedIds=[]}={}) {
 const delivered=[],sent=[];let transcribed=0,nudged=0;const voiceRoutes=[],archiveDisabled=[];
 const tg={send:async(c,t)=>{if(noticeFailure)throw Error('test transport failure');sent.push(t);},typing:async()=>{}};
 const context={handleTelegramStop,nastrojkaGruppy:()=>null,settings:()=>({}),config:{openBot},ownerChatId:()=>null,isAllowed:()=>authorized,allowed:new Set(allowedIds),tg,who_:'test',log:()=>{},attachmentStore:store,
 transcribeVoice:async(_id,_duration,routeKey,disableArchive)=>{transcribed++;voiceRoutes.push(routeKey);archiveDisabled.push(disableArchive);return 'голос';},opisanieSledom:()=>{},MERGE_CHAT:null,A2A_CHAT:'a2a',agentFor:async()=>({sessionId:'s',handle:{agent:{whenIdle:async()=>{},send:m=>delivered.push(m)}}}),
 tgChatFor:new Map(),lastOrigin:new Map(),pushAsk:()=>{},copyAsk:()=>{},stripMark:x=>x,platform:{createUserMessage:x=>x},
 receiptRuntime:()=>({enqueue:async(r,agent,makeMessage)=>agent.send(makeMessage())}),
 nudgeUntilClaimed:()=>{nudged++;},oborvalsyaOshibkoj:new Map(),setTimeout:()=>0};
 const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 return {run:vm.runInNewContext('('+extractFunction(source,'handleUpdate')+')', sGostem(context)),delivered,sent,voiceRoutes,archiveDisabled,counts:()=>({transcribed,nudged})};
}
