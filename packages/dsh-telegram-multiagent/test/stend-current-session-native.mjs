// RU: Изолированный стенд stend-current-session-native.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-current-session-native.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import { sGostem } from './gost-kontekst.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {MessageReceipts} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';import {ConversationSessions} from '../src/conversation-sessions.js';
import {borrowLiveSession} from '../src/live-session.js';import {resolveReceiptSession} from '../src/receipt-session.js';import {extractFunction} from './extract.mjs';import {podnyatPlatformu02} from './platforma-02.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'beta1462-current-'));let p,ledger;let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('OK',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
try{
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});ledger=new MessageReceipts(path.join(root,'receipts'));const conversations=new ConversationSessions(ledger),runtime=new ReceiptRuntime(ledger,p.sessions,()=>{});
 const old=await p.agents.create({sessionId:'telegram-a2a',meta:{cwd:root}});await p.sessions.flush(old.agent.session);const oldHeader=old.agent.session.header;conversations.pin('a2a',oldHeader);
 const receipt=ledger.receive('new-command',Buffer.from('/new'),{route:'tg',routeKey:7});const intent=conversations.begin('a2a',receipt.id);
 const fresh=await p.agents.create({sessionId:intent.new_id,meta:{cwd:root}});await p.sessions.flush(fresh.agent.session);const freshHeader=fresh.agent.session.header;conversations.commit(receipt.id,freshHeader);await fresh.dispose();
 const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 let currentHandle;
 const c={conversations,receiptSessions:new Map(),chats:new Map(),sessionToChat:new Map(),tgChatFor:new Map(),resumeCwdAlerts:new Set(),ctx:{agents:p.agents,get:n=>n==='sessionPersistence'?p.backend:n==='sessions'?p.sessions:undefined},config:{workspace:root,provider:'unused',model:'unused'},path,process,log(){},allowed:new Set(),tg:{async call(){}},waitService:async n=>n==='sessionPersistence'?p.backend:null,receiptRuntime:()=>runtime,platform:{installModelSelection(){}},withFactoryRetry:async(_,fn)=>fn(),borrowLiveSession,resolveReceiptSession};
 vm.createContext(sGostem(c));vm.runInContext(extractFunction(source,'agentFor')+'\n'+extractFunction(source,'receiptAgentFor'),c);
 await test('persisted current ID wins over still-live old scheduler session',async()=>{const e=await c.agentFor('a2a');currentHandle=e.handle;assert.equal(e.sessionId,freshHeader.id);assert.equal(e.handle.agent.session.header.createdAt,freshHeader.createdAt);assert.equal(p.agents.get('telegram-a2a'),old.agent)});
 await test('stale cached old entry cannot replace current binding',async()=>{c.chats.set('a2a',{sessionId:oldHeader.id,handle:{agent:old.agent,borrowed:true}});const e=await c.agentFor('a2a');assert.equal(e.sessionId,freshHeader.id)});
 await test('old receipt recovery keeps current chat and old execution separate',async()=>{const r={id:'old-receipt',session_id:oldHeader.id,session_created:oldHeader.createdAt,route:'a2a',route_key:'a2a'};const before=c.chats.get('a2a');const e=await c.receiptAgentFor(r);assert.equal(e.handle.agent,old.agent);assert.equal(c.chats.get('a2a'),before);assert.equal(conversations.current('a2a').session_id,freshHeader.id);assert.equal((await c.agentFor('a2a')).sessionId,freshHeader.id)});
 await test('missing pinned generation refuses rather than create same ID',async()=>{conversations.pin('missing',{id:'telegram-missing',createdAt:1});await assert.rejects(c.agentFor('missing'),/сохранённ|поколени|persist/i);assert.equal(p.agents.get('telegram-missing'),undefined)});
 await test('rotation during lookup cannot fall through to create legacy generation',async()=>{
  const legacy=await p.agents.create({sessionId:'telegram-racepin',meta:{cwd:root}});await p.sessions.flush(legacy.agent.session);const header=legacy.agent.session.header;await legacy.dispose();
  const originalWait=c.waitService,originalAgents=c.ctx.agents;let creates=0,changed=false;
  c.ctx.agents=new Proxy(p.agents,{get(target,key){if(key==='create')return (...args)=>{creates++;return target.create(...args)};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
  c.waitService=async name=>{
   if(!changed){changed=true;conversations.pin('racepin',header);const r=ledger.receive('race-rotate',Buffer.from('/new'),{route:'tg',routeKey:42,hold:false});const intent=conversations.begin('racepin',r.id);const h=await p.agents.create({sessionId:intent.new_id,meta:{cwd:root}});await p.sessions.flush(h.agent.session);conversations.commit(r.id,h.agent.session.header);await h.dispose();}
   return originalWait(name);
  };
  try{await assert.rejects(c.agentFor('racepin'),/поколени/);assert.equal(creates,0,'pin failure must not call create');assert.equal(p.agents.get('telegram-racepin'),undefined)}
  finally{c.waitService=originalWait;c.ctx.agents=originalAgents}
 });
 await test('generation mismatch refuses before agent publication',async()=>{await old.dispose();ledger.db.prepare('UPDATE channel_sessions SET session_created=session_created+1 WHERE route_key=?').run('a2a');await currentHandle.dispose();c.chats.clear();await assert.rejects(c.agentFor('a2a'),/поколени/);assert.equal(p.agents.get(freshHeader.id),undefined)});
}finally{ledger?.close();await p?.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true})}
console.log(`current-session-native ${passed}/${passed+failed}`);process.exitCode=failed?1:0;
