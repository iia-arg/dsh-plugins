// RU: Изолированный стенд site-command-integration.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness site-command-integration.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {MessageReceipts} from '../src/message-receipts.js';import {GuestCopies} from '../src/guest-channel.js';import {SiteChannel} from '../src/site-channel.js';import {ConversationSessions} from '../src/conversation-sessions.js';import {extractFunction} from './extract.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-command-')),ledger=new MessageReceipts(path.join(root,'ledger'));try{
 const state=path.join(root,'zakryto'),copies=new GuestCopies(ledger,{owner:()=>158901453,targets:()=>[{kind:'telegram',id:158901453}]}),site=new SiteChannel({owner:()=>158901453,ledger,copies,conversations:new ConversationSessions(ledger),spool:root,state,dispatch:async()=>{throw Error('model must not run');},stop:async()=>{}});
 const src=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');const scope={config:{site:{},openBot:true},siteSource:site,receipts:ledger,settings:()=>({}),nastrojkaGruppy:()=>null,isAllowed:()=>true,allowed:new Set([158901453]),log(){},tg:{send:async()=>{}},agentFor:()=>{throw Error('command reached agent');}};
 const handler=vm.runInNewContext('('+extractFunction(src,'handleUpdate')+')',scope);
 let i=0;for(const [text,user,type,want]of [['/sss',9,'private',false],['/sss',158901453,'private',true],['/sss_on',9,'private',true],['/sss_on',158901453,'private',false]]){
  const msg={text,from:{id:user,is_bot:false},chat:{id:user,type},message_id:++i};const r=ledger.receive('cmd-'+i,JSON.stringify(msg),{hold:false,route:'tg',routeKey:user});await handler({message:msg},r);assert.equal(fs.existsSync(state),want);assert(ledger.get(r.id).finished_at!==null);console.log('PASS handler '+text+' user='+user+' state='+want);
 }
}finally{ledger.close();fs.rmSync(root,{recursive:true,force:true});}
