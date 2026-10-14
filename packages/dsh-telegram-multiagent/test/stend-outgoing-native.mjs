// RU: Изолированный стенд stend-outgoing-native.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-outgoing-native.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {MessageReceipts} from '../src/message-receipts.js';
import {ConversationSessions} from '../src/conversation-sessions.js';
import {installFileTools} from '../src/outgoing-files.js';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'outgoing-native-'));
let p,ledger;let checks=0;
const check=(name,ok)=>{assert(ok,name);console.log('PASS '+name);checks++;};
try {
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});
 ledger=new MessageReceipts(path.join(root,'ledger'));const conversations=new ConversationSessions(ledger);
 const before=await p.agents.create({sessionId:'already-live',meta:{cwd:root}});
 const seen=[],logs=[];
 const plugin=p.ctx.plugin({name:'file-channel-fixture',inject:['agents'],apply(ctx){installFileTools(ctx,{workspace:root,receipts:ledger,conversations,telegram:{async sendFile(chat,file){seen.push({chat,file});return {message_id:19};}},appDir:process.env.DSH_TEST_APP || fileURLToPath(new URL('.',import.meta.url)),log:s=>logs.push(s)});}});
 await new Promise(resolve=>setTimeout(resolve,30));
 const tools=p.ctx.get('tools');
 console.log('registration observations',JSON.stringify(logs),before.agent.session.header.cwd);
 check('already live root registered',!!tools.get('telegram_send_file',before.agent));
 const {agent}=await p.agents.create({sessionId:'telegram-a2a',meta:{cwd:root}});
 check('new root registered by actual agent/created',!!tools.get('telegram_send_file',agent));
 check('tool not global',!tools.get('telegram_send_file'));
 const foreign=await p.agents.create({sessionId:'foreign',meta:{cwd:path.join(root,'elsewhere')}});
 check('foreign workspace receives no tool',!tools.get('telegram_send_file',foreign.agent));
 const schemas=tools.wireSchemas(agent).schemas;
 check('wire schema contains tool and no chat argument',schemas.some(x=>x.name==='telegram_send_file'&&!JSON.stringify(x.parameters).includes('chat_id')));
 await fs.writeFile(path.join(root,'hello.txt'),'native dispatcher');
 conversations.pin('a2a',agent.session.header);
 const r=ledger.receive('native-receipt','native test',{route:'tg',routeKey:'123',hold:false});
 ledger.db.prepare("UPDATE receipts SET session_id=?,session_created=?,dsh_id='native-message',claimed_turn=1 WHERE id=?").run(agent.id,agent.session.header.createdAt,r.id);
 agent.session.append('turn/start',{turn:1});
 const result=await tools.execute({name:'telegram_send_file',callId:'test-outgoing-1',arguments:{path:'hello.txt'},agent,signal:new AbortController().signal});
 assert(!result.isError,JSON.stringify(result));
 check('real DSH dispatch validated result',result.value?.message_id===19&&seen.length===1&&seen[0].chat==='123');
 ledger.db.prepare("UPDATE receipts SET route='a2a' WHERE id=?").run(r.id);
 const refused=await tools.execute({name:'telegram_send_file',callId:'test-outgoing-2',arguments:{path:'hello.txt'},agent,signal:new AbortController().signal});
 check('real DSH dispatch returns error for A2A',refused.isError===true&&seen.length===1);
 agent.session.append('turn/end',{turn:1,reason:{kind:'completed'}});
 await plugin.dispose();
 check('channel disposal removes scoped tools',!tools.get('telegram_send_file',agent)&&!tools.get('telegram_send_file',before.agent));
 console.log('RESULT '+checks+'/'+checks);
}finally{await p?.ctx.fiber.dispose();ledger?.close();await fs.rm(root,{recursive:true,force:true});}
