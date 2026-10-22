// RU: Изолированный стенд stend-copy-decisions.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-copy-decisions.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';
import {extractFunction} from './extract.mjs';
import {ClaudeTurnUsage} from '../src/claude-turn-usage.js';
const source=fs.readFileSync(process.argv[2] ?? new URL('../src/index.js',import.meta.url),'utf8');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'copy-decisions-'));let mode='personal',managed=false;
const logs=[],copies=[],sent=[];const context={autopilot:null,fs,path,Date,outMs:(()=>{let p=0;return()=>(p=Math.max(Date.now(),p+1));})(),log:x=>logs.push(x),deliveryMode:()=>mode,receipts:{managed:()=>managed?[{claimed_turn:7}]:[]},receiptRuntime:()=>({observe:async()=>{}}),attachmentStore:{confirm:async()=>[]},tg:{send:async(c,t)=>sent.push(t),typing:async()=>{}},stripGoalMarker:x=>x,stripFileAck:x=>x,sessionToChat:new Map([['s','a2a']]),tgChatFor:new Map(),A2A_CHAT:'a2a',A2A_OUT:root,MERGE_CHAT:'123',replyHeader:()=>'',goalOrigin:new Map(),pendingAsk:new Map(),turnAsk:new Map(),lastOrigin:new Map([['s','a2a']]),oborvalsyaOshibkoj:new Map(),momentPoslednegoHoda:0,sendCopy:(...x)=>copies.push(x)};
context.claudeTurnUsage=new ClaudeTurnUsage(root,'fixture'); // Actual observer; unbound session means no accounting.
const scope=vm.createContext(context);const start=source.indexOf('const copyTo = '),end=source.indexOf('\n  };',start);assert(start>=0&&end>start);context.copyTo=vm.runInContext('('+source.slice(start+'const copyTo = '.length,end+4)+')',scope);
for(const name of ['copySkipped','copyAsk'])if(source.includes('function '+name+'('))context[name]=vm.runInContext('('+extractFunction(source,name)+')',scope);
const eventStart=source.indexOf("ctx.on('session/event', (session, event) => {");const functionStart=source.indexOf('(session, event) => {',eventStart),eventEnd=source.indexOf('\n  });',functionStart);assert(eventStart>=0&&eventEnd>functionStart);const handler=vm.runInContext('('+source.slice(functionStart,eventEnd)+'\n  })',scope);
function voice(action,origin,expectedMode) {logs.length=0;copies.length=0;mode=expectedMode;action();assert.equal(copies.length,0);assert(logs.some(x=>x.includes('[копия]')&&x.includes('причина=')&&x.includes('режим='+expectedMode)&&x.includes('origin='+origin)),JSON.stringify(logs));}
try {
 voice(()=>context.copyAsk('a2a','координатор','вопрос'),'a2a','personal');
 voice(()=>context.copyAsk('tg','владелец','вопрос'),'tg','owner-all');
 context.lastOrigin.set('s','a2a');voice(()=>handler({id:'s'},{type:'assistant/message',data:{turn:7,message:{content:[{type:'text',text:'ответ'}]}}}),'a2a','personal');
 context.lastOrigin.set('s','tg');voice(()=>handler({id:'s'},{type:'assistant/message',data:{turn:7,message:{content:[{type:'text',text:'ответ'}]}}}),'tg','owner-all');
 console.log('PASS question and both legacy answer skips name reason, mode, origin');

}finally{context.claudeTurnUsage.close();fs.rmSync(root,{recursive:true,force:true});}
