// RU: Изолированный стенд stend-guard-events.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-guard-events.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';
import {extractFunction} from './extract.mjs';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'copy-decisions-'));let mode='personal',managed=false;
const logs=[],copies=[],sent=[];const context={fs,path,Date,log:x=>logs.push(x),deliveryMode:()=>mode,receipts:{managed:()=>managed?[{claimed_turn:7}]:[]},receiptRuntime:()=>({observe:async()=>{}}),attachmentStore:{confirm:async()=>[]},tg:{send:async(c,t)=>sent.push(t),typing:async()=>{}},stripGoalMarker:x=>x,stripFileAck:x=>x,sessionToChat:new Map([['s','a2a']]),tgChatFor:new Map(),A2A_CHAT:'a2a',A2A_OUT:root,MERGE_CHAT:'123',replyHeader:()=>'',goalOrigin:new Map(),pendingAsk:new Map(),turnAsk:new Map(),lastOrigin:new Map([['s','a2a']]),oborvalsyaOshibkoj:new Map(),momentPoslednegoHoda:0,sendCopy:(...x)=>copies.push(x)};
const scope=vm.createContext(context);const start=source.indexOf('const copyTo = '),end=source.indexOf('\n  };',start);assert(start>=0&&end>start);context.copyTo=vm.runInContext('('+source.slice(start+'const copyTo = '.length,end+4)+')',scope);
for(const name of ['copySkipped','copyAsk'])if(source.includes('function '+name+'('))context[name]=vm.runInContext('('+extractFunction(source,name)+')',scope);
const eventStart=source.indexOf("ctx.on('session/event', (session, event) => {");const functionStart=source.indexOf('(session, event) => {',eventStart),eventEnd=source.indexOf('\n  });',functionStart);assert(eventStart>=0&&eventEnd>functionStart);const handler=vm.runInContext('('+source.slice(functionStart,eventEnd)+'\n  })',scope);

let writes=0;class CountMap extends Map {set(k,v){writes++;return super.set(k,v);}}
context.oborvalsyaOshibkoj=new CountMap();
try {
 for(const [isManaged,kind,expected] of [[true,'error',1],[false,'error',1],[true,'completed',0],[false,'completed',0]]) {
  managed=isManaged;writes=0;context.oborvalsyaOshibkoj.clear();
  handler({id:'s'},{type:'turn/end',data:{turn:7,reason:{kind,error:{message:'probe'}}}});
  assert.equal(writes,expected);
  context.setTimeout=setTimeout;
  const nudge=vm.runInContext('('+extractFunction(source,'nudgeUntilClaimed')+')',scope);
  let wakes=0;const a={status:'idle',inbox:{hasPending:true},wakeDriver(){}};
  nudge(a,'test',800,()=>context.oborvalsyaOshibkoj.get('s'),null,()=>{wakes++;a.inbox.hasPending=false;return true;});
  await new Promise(resolve=>setTimeout(resolve,1100));assert.equal(wakes,kind==='error'?0:1);
  console.log(JSON.stringify({managed,kind,writes}));
 }
 managed=true;context.lastOrigin.set('s','tg');context.tgChatFor.set('s','123');sent.length=0;
 context.receipts.get=()=>({route_key:'123'});
 const deliver=vm.runInContext('('+extractFunction(source,'deliverReceiptOutbox')+')',scope);
 handler({id:'s'},{type:'assistant/message',data:{turn:7,message:{content:[{type:'text',text:'one answer'}]}}});
 await deliver({route:'tg',receipt_id:'test',body:'one answer'});
 assert.equal(sent.length,1,'managed primary delivery exactly once');
 console.log('PASS managed primary sends=1; error accounting 1/1, non-error 0/0');
}finally{fs.rmSync(root,{recursive:true,force:true});}
