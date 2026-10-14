// RU: Изолированный стенд stend-merged-tools.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-merged-tools.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {podnyatPlatformu02} from './platforma-02.mjs';import {testPlatform} from './test-platform.mjs';
import {MessageReceipts} from '../src/message-receipts.js';import {ConversationSessions} from '../src/conversation-sessions.js';
import {supervisorTool} from '../src/guest-channel.js';import {installFileTools} from '../src/outgoing-files.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'merged-tools-'));let host,ledger,plugin;let count=0;const check=(name,ok)=>{assert(ok,name);count++;console.log('PASS '+name)};
try{
 host=await podnyatPlatformu02({root:path.join(root,'sessions')});const native=await testPlatform(['dsh-tools']);ledger=new MessageReceipts(path.join(root,'ledger'));const conversations=new ConversationSessions(ledger);
 const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');const fileHook=source.split('\n').find(l=>l.trim().startsWith('installFileTools(ctx,'));const supervisorHook=source.match(/  if \(config\.supervisor !== undefined\) \{[\s\S]*?\n  \}/)?.[0];assert(fileHook&&supervisorHook);
 const sentFiles=[],letters=[];const config={workspace:root,appDir:process.env.DSH_TEST_APP,supervisor:'supervisor',agentName:'assistant'};
 plugin=host.ctx.plugin({name:'merged-channel-test',inject:['agents'],apply(ctx){vm.runInNewContext(fileHook+'\n'+supervisorHook,{ctx,config,process,receipts:ledger,conversations,tg:{sendFile:async(chat,file)=>{sentFiles.push({chat,file});return{message_id:101}}},log(){},installFileTools,platform:{defineTool:native['dsh-tools'].defineTool},supervisorTool:opts=>supervisorTool({...opts,send:async(recipient,text)=>{letters.push({recipient,text});return{status:'placed',recipient}}})});}});
 await new Promise(r=>setTimeout(r,30));const handle=await host.agents.create({sessionId:'telegram-merged',meta:{cwd:root}});const agent=handle.agent,tools=host.ctx.get('tools');
 check('both tools coexist in the current agent',!!tools.get('telegram_send_file',agent)&&!!tools.get('pismo_rukovoditelyu',agent));
 conversations.pin('merged',agent.session.header);const receipt=ledger.receive('merged-input','fixture',{route:'tg',routeKey:'702',hold:false});ledger.db.prepare("UPDATE receipts SET session_id=?,session_created=?,dsh_id='merged-msg',claimed_turn=1 WHERE id=?").run(agent.id,agent.session.header.createdAt,receipt.id);agent.session.append('turn/start',{turn:1});fs.writeFileSync(path.join(root,'test.txt'),'merged file');
 let r=await tools.execute({name:'pismo_rukovoditelyu',arguments:{text:'merged supervisor message'},callId:'merged-letter',agent,signal:new AbortController().signal});check('supervisor route stays fixed after file-tool registration',!r.isError&&letters.length===1&&letters[0].recipient==='supervisor'&&sentFiles.length===0);
 r=await tools.execute({name:'telegram_send_file',arguments:{path:'test.txt'},callId:'merged-file',agent,signal:new AbortController().signal});check('file route stays at current Telegram chat',!r.isError&&sentFiles.length===1&&sentFiles[0].chat==='702'&&letters.length===1);
 check('model schema still has no caller-selected recipient',!JSON.stringify(tools.wireSchemas(agent).schemas.filter(x=>['telegram_send_file','pismo_rukovoditelyu'].includes(x.name)).map(x=>x.parameters)).includes('recipient'));
 agent.session.append('turn/end',{turn:1,reason:{kind:'completed'}});await plugin.dispose();check('channel disposal removes both additions',!tools.get('telegram_send_file',agent)&&!tools.get('pismo_rukovoditelyu',agent));console.log('RESULT '+count+'/'+count);
}finally{await host?.ctx.fiber.dispose();ledger?.close();fs.rmSync(root,{recursive:true,force:true})}
