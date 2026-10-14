// RU: Изолированный стенд stend-cold-conversation.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-cold-conversation.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {podnyatPlatformu02} from './platforma-02.mjs';
let inspectColdConversation;try{({inspectColdConversation}=await import('../src/cold-conversation.js'))}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
assert.equal(typeof inspectColdConversation,'function','cold inspection must not resume an agent');
if(process.argv[2]==='worker'){
 const root=process.argv[3],p=await podnyatPlatformu02({root});
 const h=await p.agents.create({sessionId:'telegram-crashed',meta:{cwd:root}});
 h.agent.send(p.llm.createUserMessage({content:[{type:'text',text:'pending after abrupt process exit'}],source:{kind:'user'}}),'next-turn',false);
 assert(await p.sessions.flush(h.agent.session));
 fs.writeFileSync(path.join(root,'binding.json'),JSON.stringify({session_id:h.agent.session.id,session_created:h.agent.session.header.createdAt}));
 process.exit(0);
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'beta1462-cold-'));let p;let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('OK',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
try{
 p=await podnyatPlatformu02({root});const projections=p.ctx.get('sessionProjections');
 const h=await p.agents.create({sessionId:'telegram-cold',meta:{cwd:root}});await p.sessions.flush(h.agent.session);const header=h.agent.session.header;
 const binding={session_id:header.id,session_created:header.createdAt};
 const read=(b=binding,pr=projections)=>inspectColdConversation(p.backend,pr,b,root);
 await test('empty durable inbox reads without adding an agent',async()=>{const before=p.agents.roots().length;const r=await read();assert.equal(r.pendingCount,0);assert.equal(r.openTurn,false);assert.equal(p.agents.roots().length,before)});
 const m=p.llm.createUserMessage({content:[{type:'text',text:'pending cold fixture'}],source:{kind:'user'}});h.agent.send(m,'next-turn',false);await p.sessions.flush(h.agent.session);
 await test('actual queued message is visible through cold projection',async()=>{assert.equal((await read()).pendingCount,1)});
 h.agent.inbox.remove(m.id);await p.sessions.flush(h.agent.session);
 await test('removal returns the same session to clean',async()=>{assert.equal((await read()).pendingCount,0)});
 await test('persisted open turn refuses a clean interpretation until its end',async()=>{h.agent.session.append('turn/start',{turn:1});await p.sessions.flush(h.agent.session);assert.equal((await read()).openTurn,true);h.agent.session.append('turn/end',{turn:1,reason:{kind:'completed'}});await p.sessions.flush(h.agent.session);assert.equal((await read()).openTurn,false)});
 h.agent.send(p.llm.createUserMessage({content:[{type:'text',text:'keep dormant'}],source:{kind:'user'}}),'next-turn',false);await p.sessions.flush(h.agent.session);await h.dispose();
 await test('dormant persisted pending inbox after process exit is read without resume',async()=>{
  const crashed=path.join(root,'crashed');fs.mkdirSync(crashed);
  const child=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning',fileURLToPath(import.meta.url),'worker',crashed],{encoding:'utf8',timeout:15000});assert.equal(child.status,0,child.stderr);
  const binding=JSON.parse(fs.readFileSync(path.join(crashed,'binding.json'),'utf8'));
  const q=await podnyatPlatformu02({root:crashed});
  try{assert.equal(q.agents.get(binding.session_id),undefined);const r=await inspectColdConversation(q.backend,q.ctx.get('sessionProjections'),binding,crashed);assert.equal(r.pendingCount,1);assert.equal(q.agents.get(binding.session_id),undefined)}finally{await q.ctx.fiber.dispose()}
 });
 await test('wrong generation and cwd refuse',async()=>{await assert.rejects(read({...binding,session_created:header.createdAt+1}),/поколени/);await assert.rejects(inspectColdConversation(p.backend,projections,binding,root+'/foreign'),/cwd/)});
 await test('missing projection fails closed rather than returning empty',async()=>{await assert.rejects(read(binding,{restore:()=>({snapshot:{values:{}},checkpoint:{}})}),/проекци/)});
}finally{await p?.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true})}
console.log(`cold-conversation ${passed}/${passed+failed}`);process.exitCode=failed?1:0;
