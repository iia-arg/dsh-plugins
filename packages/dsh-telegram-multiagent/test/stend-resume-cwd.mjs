// RU: Изолированный стенд stend-resume-cwd.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-resume-cwd.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import { sGostem } from './gost-kontekst.mjs';
import {resolveOwnerId} from '../src/guest-channel.js';
import {borrowLiveSession} from '../src/live-session.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const a=source.indexOf('  async function agentFor(chatId) {'),b=source.indexOf('\n  function copySkipped(',a);
assert(a>=0&&b>a);const body=source.slice(a,b);
function fixture(cwd='/fixture/own',failAlert=false,opts={}){
 const counts={resume:0,create:0,setup:0,observe:0,published:0,alerts:0,chats:[]};const logs=[];const header={cwd,id:'telegram-probe',createdAt:1};
 const persistence={list:async()=>[{id:'telegram-probe'}]};
 const runtime={install(){counts.setup++},async observe(){counts.observe++}};
 const ctx={agents:{async resume(options){counts.resume++;await options.setup({agent:{session:{header}}});counts.published++;return {agent:{session:{header}}}},async create(){counts.create++;throw Error('unexpected create')}}};
 const context={conversations:{holdsSession:()=>false,current:()=>({session_id:"telegram-probe",session_created:null}),pin(){}},borrowLiveSession,chats:new Map(),sessionToChat:new Map(),resumeCwdAlerts:new Set(),ctx,config:{workspace:'/fixture/own',provider:'fixture',model:'fixture',ownerChatId:('merge' in opts?opts.merge:1)                                            },path,process,log:m=>logs.push(m),allowed:new Set(opts.allowed??[1]),tg:{async call(_method,args,timeout,attempts){counts.alerts++;counts.chats.push(args.chat_id);assert.equal(timeout,5000);assert.equal(attempts,1);assert(args.text.includes('telegram-probe'));if(failAlert)throw Error('channel refused')}},waitService:async n=>n==='sessionPersistence'?persistence:null,receiptRuntime:()=>runtime,platform:{installModelSelection(){}},withFactoryRetry:async(_,f)=>f()};
context.ownerChatId=()=>resolveOwnerId(context.config,{},context.allowed,context.log);
 vm.createContext(sGostem(context));vm.runInContext(body,context);
 return {counts,logs,header,run:()=>context.agentFor('probe')};
}
let passed=0;async function test(name,fn){try{const v=await fn();if(v!==undefined&&v!==true)throw new Error('тело пробы ВЕРНУЛО «'+String(v).slice(0,60)+'», а обёртка судит по ИСКЛЮЧЕНИЮ (regression-case)');passed++;console.log('OK',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
await test('same cwd resumes',async()=>{const f=fixture();await f.run();assert.equal(f.counts.published,1);assert.equal(f.counts.alerts,0)});
await test('different cwd refuses, names both, no create/setup/publication',async()=>{const f=fixture('/fixture/foreign');await assert.rejects(f.run(),e=>e.message.includes('/fixture/foreign')&&e.message.includes('/fixture/own'));assert.equal(f.counts.create,0);assert.equal(f.counts.setup,0);assert.equal(f.counts.published,0);assert.equal(f.counts.alerts,1)});
await test('restore cwd allows resume',async()=>{const f=fixture('/fixture/foreign');await assert.rejects(f.run());f.header.cwd='/fixture/own';await f.run();assert.equal(f.counts.published,1)});
await test('missing header cwd refuses',async()=>{const f=fixture();delete f.header.cwd;await assert.rejects(f.run());assert.equal(f.counts.create,0);assert.equal(f.counts.published,0)});
await test('channel failure cannot allow resume',async()=>{const f=fixture('/fixture/foreign',true);await assert.rejects(f.run());assert.equal(f.counts.published,0);assert.equal(f.counts.create,0);assert(f.logs.some(x=>x.includes('тревога')))});
await test('repeat refusal logs but does not flood owner',async()=>{const f=fixture('/fixture/foreign');await assert.rejects(f.run());await assert.rejects(f.run());assert.equal(f.counts.alerts,1);assert.equal(f.counts.published,0)});
await test('regression-case r2: гость в allowedUsers тревогу cwd не получает, владелец — получает',async()=>{const f=fixture('/fixture/foreign',false,{allowed:[1,2]});await assert.rejects(f.run());assert.deepEqual(f.counts.chats,[1])});
await test('regression-case r2: владелец не определён → тревог 0, строка журнала',async()=>{const f=fixture('/fixture/foreign',false,{allowed:[1,2],merge:undefined});await assert.rejects(f.run());assert.equal(f.counts.alerts,0);assert(f.logs.some(x=>x.includes('владелец не определён')))});
console.log(`resume cwd ${passed}/8`);
