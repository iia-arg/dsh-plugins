// RU: Изолированный стенд stend-receipt-runtime.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipt-runtime.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';

import {podnyatPlatformu02} from './platforma-02.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-native-'));
const {sessions,backend,sozdatAgenta,llm}=await podnyatPlatformu02({root:path.join(root,'sessions')});
const {createUserMessage,createAssistantMessage}=llm;
const zhivoj=await sozdatAgenta('receipt-probe');const session=zhivoj.session;const inbox=zhivoj.inbox;
const l=new MessageReceipts(path.join(root,'ledger')),runtime=new ReceiptRuntime(l,sessions);let wake=0;

const agent={session,send:(m,target,w)=>{assert.equal(w,false);zhivoj.send(m,target,w);},wakeDriver:()=>wake++};
const source=path.join(root,'message.txt');fs.writeFileSync(source,'work');
const r=l.receive('file:test','work',{sourcePath:source,logicalKey:'stable-test'});
await runtime.enqueue(r,agent,()=>createUserMessage({content:[{type:'text',text:'test'}]}),'a2a','file:test');
assert.equal(wake,1);assert(!fs.existsSync(source));

const fajly=fs.readdirSync(path.join(root,'sessions'),{recursive:true}).map(f=>path.join(root,'sessions',String(f))).filter(f=>/\.jsonl$/.test(f)&&fs.statSync(f).isFile());
assert(fajly.length>0,'СЛЕПОТА: журнала сессии на диске нет');
const naDiske=fajly.flatMap(f=>fs.readFileSync(f,'utf8').split('\n').filter(Boolean).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean));
assert(naDiske.some(e=>e.type==='agent/inbox/spliced'&&e.data?.inserted?.some(m=>m.id===l.get(r.id).dsh_id)),'событие очереди не легло на диск до выпуска');
let gate;runtime.install({on:(name,fn)=>{assert.equal(name,'agent/pre-step');gate=fn;}});
session.append('turn/start',{turn:1});inbox.claim('next-turn',1);let entered=0;await gate({agent,turn:1},()=>entered++);assert.equal(entered,1);
session.append('assistant/message',{turn:1,message:createAssistantMessage({content:[{type:'text',text:'done'}],source:{provider:'test',model:'test'}})},{surfaceOp:'append'});session.append('turn/end',{turn:1,reason:{kind:'completed'}});await runtime.observe(session);assert.equal(l.get(r.id).outcome,'turn_completed');
inbox.append('next-turn',JSON.parse(l.get(r.id).message_json));session.append('turn/start',{turn:2});inbox.claim('next-turn',2);
await assert.rejects(gate({agent,turn:2},()=>entered++),/Повторное/);assert.equal(entered,1);
console.log('PASS native persistence before release; pre-step gate; replay refuses second execution');l.close();fs.rmSync(root,{recursive:true,force:true});process.exit(0);
