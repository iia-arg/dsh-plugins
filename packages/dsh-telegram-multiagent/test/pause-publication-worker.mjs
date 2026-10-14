// RU: Изолированный стенд pause-publication-worker.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness pause-publication-worker.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';import {testPlatform} from './test-platform.mjs';import {MessageReceipts} from '../src/message-receipts.js';import {ConversationPause} from '../src/conversation-pause.js';
const [root,mode]=process.argv.slice(2),file=path.join(root,'state/workertwo/pauza.json');fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o755});
const p=await podnyatPlatformu02({root:path.join(root,'sessions')}),l=new MessageReceipts(path.join(root,'ledger')),pause=new ConversationPause(l,root,()=>{},{agent:'workertwo',file});
const native=await testPlatform(['dsh-schedule']),task={id:'schedule-restart',kind:'at',scheduledAt:'2030-01-01T00:00:00Z',title:'restart fixture',prompt:'wait',sessionId:'telegram-a2a',status:'active'};p.ctx.provide('schedule',{catalog:async()=>[task]});pause.mount(p.ctx);
if(mode==='seed'){
 const h=await p.agents.create({sessionId:'telegram-a2a',meta:{cwd:root}}),cmd=l.receive('stop',Buffer.from('/stop'),{route:'tg',routeKey:7});pause.pause(h.agent.session.header,cmd.id);
 for(const [kind,text] of [['agent-message','letter'],['schedule',native['dsh-schedule'].renderReminderFraming(task)]])h.agent.followup(p.llm.createUserMessage({source:{kind},content:[{type:'text',text}]}));
 await p.sessions.flush(h.agent.session);
}else assert.equal(p.agents.roots().length,0,'publisher must not resume an agent to count cold queue');
await pause.visibility.flush();assert.equal(pause.visibility.error,null);console.log(JSON.stringify(JSON.parse(fs.readFileSync(file,'utf8'))));process.exit(0);
