// RU: Изолированный стенд stend-telegram-stop.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-telegram-stop.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import { sGostem } from './gost-kontekst.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs';
import {ustanovitIstochnikPomoshchnika} from '../src/message-receipts.js';
ustanovitIstochnikPomoshchnika(()=>({sobytiyaSessii:s=>s.events}));
const stop=await import('../src/telegram-stop.js').catch(()=>({handleTelegramStop:()=>{throw Error('stop handler missing');}}));
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');const begin=source.indexOf('  async function handleUpdate(');const end=source.indexOf('\n  }',begin)+4;const code=source.slice(begin,end);
async function run({text='/stop',users=[7],sender=7,bot=false,provider='deepseek-direct',model='deepseek-v4-pro',running=true,tail=false,remote='interrupting',currentId='telegram-a2a',cached=true,pinnedCreated=1}={}){
 const answers=[],calls=[],audits=[];const session={id:currentId,header:{createdAt:1},events:running?[{type:'turn/start',data:{turn:3}}]:[],requestHeader:()=>({config:{provider,model}})};
 const agent={session,status:running?'running':'idle',cancel:(cause,options)=>calls.push(['cancel',cause,options])};
 const allowed=new Set(users);const ctx={get:n=>n==='conversationPause'?{pause(){}}:n==='agents'?{get:id=>id===currentId?agent:undefined}:undefined};
 const context={conversations:{current:()=>({session_id:currentId,session_created:pinnedCreated})},handleTelegramStop:stop.handleTelegramStop,nastrojkaGruppy:()=>null,settings:()=>({}),config:{},ownerChatId:()=>null,isAllowed:id=>allowed.size===0||allowed.has(Number(id)),allowed,who_:'test',log(){},tg:{send:async(chat,t)=>answers.push(t)},ctx,chats:new Map(cached?[['a2a',{sessionId:currentId,handle:{agent}}]]:[]),MERGE_CHAT:'1',A2A_CHAT:'a2a',codexControl:{stop:async(a,id)=>{calls.push(['remote',id]);return {state:remote};}},receipts:{audit:(...args)=>audits.push(args)},agentFor(){throw Error('must not create agent or enqueue /stop');}};
 const fn=new Function(...Object.keys(sGostem(context)),'return ('+code+')')(...Object.values(context));await fn({message:{text,chat:{id:1},from:{id:sender,is_bot:bot,first_name:'user'}}},{id:'receipt-stop'});return {answers,calls,audits};
}
for(const text of ['/stop','/STOP',' /stop 123 ','/stop anything']){const r=await run({text});assert.equal(r.calls.length,1);assert.deepEqual(r.calls[0],['cancel',{kind:'user'},{keepInbox:true}]);assert.ok(r.answers.some(x=>x.includes('прерывается')));if(text.trim().split(/\s/).length>1)assert.ok(r.answers.some(x=>x.includes('Адресация по номеру ещё не поддержана')));console.log('PASS native',JSON.stringify(text));}
for(const users of [[],[8]]){const r=await run({users});assert.equal(r.calls.length,0);console.log('PASS no permission',users.length);}
assert.equal((await run({bot:true})).calls.length,0);console.log('PASS bot cannot command');
const idle=await run({running:false});assert.equal(idle.calls.length,0);assert.match(idle.answers.at(-1),/Пауза включена/);console.log('PASS idle no spawn');
const gpt=await run({provider:'claude-oauth',model:'gpt-6-astra'});assert.equal(gpt.calls[0][0],'remote');assert.equal(gpt.calls[1][0],'cancel');assert.match(gpt.answers.at(-1),/прерывается/);console.log('PASS Codex then outer turn cancel');
const claude=await run({provider:'claude-oauth',model:'claude-opus-5'});assert.equal(claude.calls[0][0],'remote');assert.equal(claude.calls[1][0],'cancel');assert.match(claude.answers.at(-1),/прерывается/);console.log('PASS Claude remote then outer turn cancel (regression-case шаг 4)');
const claudeOld=await run({provider:'claude-oauth',model:'claude-opus-5',remote:'unknown'});assert.equal(claudeOld.calls.length,1);assert.equal(claudeOld.calls[0][0],'remote');assert.doesNotMatch(claudeOld.answers.at(-1),/ход прерывается/);assert.match(claudeOld.answers.at(-1),/не подтверждено/);console.log('PASS Claude on gateway without route: not confirmed, outer turn untouched');
const strange=await run({provider:'claude-oauth',model:'o9-strange'});assert.equal(strange.calls.length,0);assert.match(strange.answers.at(-1),/неизвестный путь шлюза/);console.log('PASS unknown gateway model refused');
const unknown=await run({provider:'claude-oauth',model:'gpt-6-astra',remote:'unknown'});assert.equal(unknown.calls.length,1);assert.doesNotMatch(unknown.answers.at(-1),/ход прерывается/);console.log('PASS unknown never claims interruption');
for(const text of ['ordinary /stop','/stopwatch','/stop123'])assert.equal(await stop.handleTelegramStop({text},{}),null);console.log('PASS non-commands untouched');

const rotated=await run({currentId:'telegram-v2-00000000-0000-4000-8000-000000000001',cached:false});assert.equal(rotated.calls.length,1);assert.match(rotated.answers.at(-1),/прерывается/);console.log('PASS stop uses persisted current generation without cache');

const wrongGeneration=await run({cached:false,pinnedCreated:2});assert.equal(wrongGeneration.calls.length,0);assert.match(wrongGeneration.answers.at(-1),/неизвестен/);console.log('PASS stop refuses changed generation');
