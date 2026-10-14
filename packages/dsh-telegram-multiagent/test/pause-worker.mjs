// RU: Изолированный стенд pause-worker.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness pause-worker.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import path from 'node:path';import fs from 'node:fs';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {podnyatPlatformu02} from './platforma-02.mjs';import {MessageReceipts} from '../src/message-receipts.js';import {ConversationPause} from '../src/conversation-pause.js';
const root=process.argv[2],p=await podnyatPlatformu02({root:path.join(root,'sessions')}),l=new MessageReceipts(path.join(root,'ledger')),pause=new ConversationPause(l,root);pause.mount(p.ctx);
const h=await p.agents.create({sessionId:'telegram-cold',meta:{cwd:root}}),cmd=l.receive('cold-stop',Buffer.from('/stop'),{route:'tg',routeKey:7});pause.pause(h.agent.session.header,cmd.id);
h.agent.followup(p.llm.createUserMessage({content:[{type:'text',text:'COLD_PENDING'}],source:{kind:'schedule'}}));await p.sessions.flush(h.agent.session);
fs.writeFileSync(path.join(root,'cold-header.json'),JSON.stringify(h.agent.session.header));
if(process.argv[3]){
 const runtime=new ReceiptRuntime(l,p.sessions,()=>{});runtime.conversationPause=pause;runtime.install(p.ctx);
 const row=l.receive('cold-owner',Buffer.from('OWNER_BEFORE_CRASH'),{route:'tg',routeKey:7}),message=p.llm.createUserMessage({content:[{type:'text',text:'OWNER_BEFORE_CRASH'}],source:{kind:'user'}});
 l.prepare(row.id,()=>message,h.agent.session,7);await l.queue(row.id,{contains:id=>h.agent.inbox.nextTurn.some(m=>m.id===id),send:m=>h.agent.send(m,'next-turn',false),flush:()=>p.sessions.flush(h.agent.session)});pause.resumeOwner(h.agent,row.id,message.id);
 if(process.argv[3]==='claimed'){
  p.ctx.on('agent/pre-step',async()=>{await p.sessions.flush(h.agent.session);process.exit(0)});h.agent.wakeDriver();await h.agent.whenIdle();throw Error('worker must exit at claim');
 }
}
process.exit(0);
