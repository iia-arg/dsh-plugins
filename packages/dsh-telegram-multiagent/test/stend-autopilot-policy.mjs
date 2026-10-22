import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {obrashchenie} from '../src/rabochij-chat.js';
import {autopilotSettings,droppedPublisher} from '../src/autopilot-notice.js';import {extractFunction} from './extract.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ap-policy-'));
try{
 const notice=path.join(root,'notice');fs.mkdirSync(notice,{mode:0o700});
 const config={agentName:'master',spoolDir:path.join(root,'primary'),autopilotMail:{noticeDir:notice,trafficChatId:-5388098055,publisherBotIds:[777],names:['Мастер']}};
 const ap=autopilotSettings(config);assert(ap&&!ap.only);
 for(const bad of [{publisherBotIds:['777']},{publisherBotIds:[]},{trafficChatId:'-5388098055'},{noticeDir:path.join(root,'missing')},{names:[]},{unknown:true}]){
  assert.throws(()=>autopilotSettings({...config,autopilotMail:{...config.autopilotMail,...bad}}));
 }
 assert.throws(()=>autopilotSettings({...config,agentName:'outsider'}));assert.throws(()=>autopilotSettings({...config,spoolDir:notice}));
 const alias=path.join(root,'alias');fs.symlinkSync(notice,alias);assert.throws(()=>autopilotSettings({...config,autopilotMail:{...config.autopilotMail,noticeDir:alias}}));
 assert(droppedPublisher({message:{from:{id:'777',is_bot:false}}},ap),'malformed string ID fails closed before SocialIngress');
 let social=0;const ctx={droppedPublisher,autopilot:ap,config:{social:true},socialIngress:{handles(){social++;return true},handle(){social++}},botKto:async()=>({id:123})};
 vm.createContext(ctx);vm.runInContext(extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'handleUpdate'),ctx);
 for(const from of [{id:777,is_bot:false},{id:778,is_bot:true},{id:'777',is_bot:false}])await ctx.handleUpdate({message:{from}},{});
 assert.equal(social,0,'bot/invalid ID denial precedes even a matching SocialIngress');
 const addressed=text=>obrashchenie({text,from:{id:7}},{me:{id:123,username:'vintik_fixture_bot'},names:['Винтик'],strictAddress:true,tekst:text});
 assert.equal(addressed('/cs@vintik_fixture_bot').addressed,true,'own bot_command is an explicit @nick');
 assert.equal(addressed('/stop@vintik_fixture_bot').addressed,true);
 assert.equal(addressed('/cs').addressed,false);assert.equal(addressed('/cs@other_bot').addressed,false);
 console.log('PASS AP config refusals and pre-SocialIngress publisher/bot filters');
}finally{fs.rmSync(root,{recursive:true,force:true})}
