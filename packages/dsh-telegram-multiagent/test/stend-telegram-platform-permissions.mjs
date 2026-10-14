// RU: Изолированный стенд stend-telegram-platform-permissions.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-telegram-platform-permissions.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { sGostem } from './gost-kontekst.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import * as fileModule from '../src/outgoing-files.js';
import {channelAdmission,resolveOwnerId} from '../src/guest-channel.js';
import {extractFunction} from './extract.mjs';import {podnyatPlatformu02} from './platforma-02.mjs';import {testPlatform} from './test-platform.mjs';import {handleTelegramStop} from '../src/telegram-stop.js';
const SRC=process.argv[2]||process.env.SVYAZ_SRC||new URL('../src/index.js',import.meta.url).pathname;
const source=fs.readFileSync(SRC,'utf8'),handler=extractFunction(source,'handleUpdate');const root=fs.mkdtempSync(path.join(os.tmpdir(),'b1483-'));const app=await podnyatPlatformu02({root});
const mods=await testPlatform(['dsh-commands','dsh-permission-presets','dsh-user-approval','dsh-command-compact','dsh-command-goal','dsh-command-feedback','dsh-session-log-export','dsh-plan-mode']);
app.ctx.provide('shell',{sandboxMode:'workspace-write'});
app.ctx.provide('approval',{config:{policy:'ask'},setPolicy(agent,policy){mods['dsh-user-approval'].setApprovalPolicy(agent.session,policy);}});
app.ctx.plugin(mods['dsh-commands'].default);
app.ctx.plugin(mods['dsh-permission-presets'].default,{defaultPreset:'workspace-write'});
for(let i=0;i<1000&&!app.ctx.get('permissionPresets');i++)await new Promise(r=>setTimeout(r,5));
const registry=app.ctx.get('commands'),permissions=app.ctx.get('permissionPresets');assert(registry&&permissions,'native services required');
app.ctx.provide('compaction',{compactNow:async()=>null});
app.ctx.provide('goals',{});
app.ctx.provide('connection',{fetch:{register:()=>()=>{}}});
for(const name of ['dsh-command-compact','dsh-command-goal','dsh-command-feedback','dsh-session-log-export','dsh-plan-mode'])app.ctx.plugin(mods[name].default??mods[name],name==='dsh-plan-mode'?{section:'Test deployment plan policy'}:{});
await new Promise(r=>setTimeout(r,50));
let n=0,ok=0,fail=0;const evidence=[];const OWNER=158901453,GUEST=502127346;
function check(name,cond,detail){evidence.push({name,passed:!!cond,...detail});console.log((cond?'PASS ':'FAIL ')+name+(detail?' '+JSON.stringify(detail):''));cond?ok++:fail++;}
async function scenario(text,user=GUEST,{allowedList=[OWNER,GUEST],owner=OWNER,goalList=[OWNER],bot=false,registryOff=false,openBot=false}={}){
 const agent=await app.sozdatAgenta('b1483-'+(++n));let input=null;let creates=0,model=0,executions=0,pauses=0,copies=0,goals=0;const sent=[],logs=[];const admission=channelAdmission({openBot,allowedUsers:allowedList});const allowed=admission.allowed;const original=registry.execute.bind(registry);const realRegistry={find:registry.find.bind(registry),execute:async(...args)=>{executions++;return original(...args);}};
 const state=()=>({preset:permissions.current(agent.session),...permissions.permissionState(agent.session)});const before=state();
 const scope={ownerChatId:()=>resolveOwnerId({ownerChatId:owner},{},allowed),ownerCopyTargets:()=>[],settings:()=>({}),ensureGuestDirectory:fileModule.ensureGuestDirectory,config:{workspace:root,mergeChatIntoA2A:owner,openBot},guestCopies:{capture:()=>{copies++;}},log(message){logs.push(String(message));},nastrojkaGruppy:()=>null,isAllowed:admission.isAllowed,allowed,who_:'stend',tg:{send:async(chat,text)=>sent.push({chat,text})},handleTelegramStop,conversations:{current:()=>({session_id:agent.session.header.id,session_created:null})},MERGE_CHAT:owner?String(owner):null,A2A_CHAT:'a2a',chats:new Map(),sessionToChat:new Map(),goalUsers:new Set(goalList),sayTo:async()=>{},goalCommand:async()=>{goals++;return 'goal';},ctx:{get:name=>name==='commands'?(registryOff?null:realRegistry):name==='agents'?{get:()=>agent}:name==='conversationPause'?{pause:()=>{pauses++;}}:null},agentFor:async()=>{creates++;return{handle:{agent},sessionId:agent.session.header.id};},tgChatFor:new Map(),lastOrigin:new Map(),pushAsk(){},copyAsk(){},stripMark:x=>x,platform:{createUserMessage:x=>x},receiptRuntime:()=>({enqueue:async(_r,_a,create)=>{model++;input=create();},wake(){}}),nudgeUntilClaimed(){},oborvalsyaOshibkoj:new Map(),receipts:{audit(){},get:()=>({finished_at:null}),db:{prepare:()=>({run(){}})}},setTimeout,AbortController,console};
 await vm.runInNewContext('('+handler+')', sGostem(scope))({message:{message_id:n,date:1,chat:{id:user,type:'private'},from:{id:user,is_bot:bot},text}},{id:'r'+n});await app.sessions.flush(agent.session);return {input,before,after:state(),creates,model,executions,pauses,copies,goals,sent,logs};
}
try{
 let r=await scenario('/permission danger-full-access');check('non-owner permission refused and state unchanged',r.executions===0&&r.after.sandbox==='workspace-write'&&r.after.approval==='ask'&&r.model===0,{...r});
 r=await scenario('/permission danger-full-access',OWNER);check('owner native permission changes durable session knobs',r.executions===1&&r.after.sandbox==='danger-full-access'&&r.after.approval==='never'&&r.model===0,r);
 r=await scenario('/permission danger-full-access',GUEST,{allowedList:[OWNER],openBot:true});check('open guest permission refused',r.executions===0&&r.after.sandbox==='workspace-write'&&r.model===0,r);
 r=await scenario('/permission danger-full-access',OWNER,{allowedList:[OWNER],openBot:true});check('owner on open bot retains native permission',r.executions===1&&r.after.approval==='never',r);
 r=await scenario('/permission danger-full-access',GUEST,{goalList:[GUEST]});check('goal delegate is not owner',r.executions===0&&r.after.sandbox==='workspace-write',r);
 for(const owner of [null,0,-100,'garbage']){r=await scenario('/permission danger-full-access',GUEST,{owner});check('undefined/invalid owner fails closed '+String(owner),r.executions===0&&r.after.sandbox==='workspace-write',r);}
 r=await scenario('/permission danger-full-access',OWNER,{bot:true});check('bot sender cannot be owner',r.executions===0&&r.after.sandbox==='workspace-write',r);
 for(const who of [OWNER,GUEST])for(const text of ['/unknown-task','/permission@other_bot danger-full-access','/PERMISSION danger-full-access','/']){r=await scenario(text,who);check('unknown slash never execute/model '+who+' '+text,r.executions===0&&r.model===0&&r.sent.length>0,r);}
 r=await scenario('/permission danger-full-access',OWNER,{registryOff:true});check('missing registry refuses without model',r.executions===0&&r.model===0&&r.sent.length>0,r);
 r=await scenario('/unknown_command DO_NOT_LOG_ARGUMENT',OWNER);check('unknown command refusal has a log without message arguments',r.executions===0&&r.model===0&&r.logs.some(s=>s.includes('command_not_found'))&&!r.logs.some(s=>s.includes('DO_NOT_LOG_ARGUMENT')),r);
 r=await scenario('/! DO_NOT_LOG_ARGUMENT',OWNER);check('malformed command refusal has a log without message text',r.executions===0&&r.model===0&&r.logs.some(s=>s.includes('command_syntax_invalid'))&&!r.logs.some(s=>s.includes('DO_NOT_LOG_ARGUMENT')),r);
 r=await scenario('ordinary text');check('ordinary text reaches model queue',r.model===1&&r.executions===0,r);
 for(const text of ['/switch-a','/switch-b']){r=await scenario(text);check('explicit switch keeps pre-existing unregistered chat route '+text,r.executions===0&&r.model===1,r);r=await scenario(text,GUEST,{registryOff:true});check('explicit switch keeps absent-registry chat route '+text,r.executions===0&&r.model===1,r);}
 for(const text of ['/switch-a','/switch-b']){r=await scenario(text,GUEST,{openBot:true});check('open privileged unregistered switch '+text,r.model===1&&r.executions===0,r);}
 for(const name of ['compact-status','switch-a','switch-b'])registry.register({definitionId:'b1483-'+name,name,description:'fixture command',handler:()=>({kind:'success',text:'fixture '+name})});
 for(const text of ['/compact','/ccc','/compact-status','/cs','/switch-a','/switch-b']){r=await scenario(text);check('existing allowed custom route '+text,r.executions===1&&r.model===0&&r.sent.length>0,r);}
 for(const text of ['/stop','/stop 7']){r=await scenario(text);check('stop handled before native command route '+text,r.executions===0&&r.model===0&&r.pauses===1&&r.sent.some(x=>x.text.includes('Пауза включена')),r);}
 for(const text of ['/cs','/ccc','/switch-a','/switch-b']){r=await scenario(text,GUEST,{openBot:true});check('open privileged registered command '+text,r.executions===1&&r.model===0,r);}
 r=await scenario('/stop',GUEST,{openBot:true});check('open privileged nonowner stop',r.pauses===1&&r.model===0,r);
 const catalog=registry.list(await app.sozdatAgenta('catalog-native')).map(x=>x.name);check('all six installed native command definitions registered',['permission','compact','goal','plan','export','feedback'].every(x=>catalog.includes(x)),{catalog});
 for(const text of ['/plan off','/export','/feedback']){r=await scenario(text,GUEST);check('other native command denied '+text,r.executions===0&&r.model===0,r);r=await scenario(text,OWNER);check('owner native command routed '+text,r.executions===1&&r.model===0,r);}
 for(const text of ['/stop','/cs','/ccc','/new','/goal work']){r=await scenario(text,GUEST,{allowedList:[OWNER],openBot:true});check('public guest gets no privileged command '+text,r.creates===0&&r.executions===0&&r.model===0&&r.sent.length>0,r);}
 r=await scenario('guest conversation',GUEST,{allowedList:[OWNER],openBot:true});check('open public dialogue reaches model and copy capture',r.model===1&&r.copies===1,r);
 check('channel creates guest directory before input',fs.existsSync(path.join(root,'vydacha',String(GUEST)))&&fs.lstatSync(path.join(root,'vydacha',String(GUEST))).isDirectory(),{});
 check('guest input identifies exact output directory',JSON.stringify(r.input).includes('vydacha/'+GUEST+'/'),{});
 const guestDir=path.join(root,'vydacha',String(GUEST));
 fs.writeFileSync(path.join(guestDir,'keep.txt'),'KEEP');
 r=await scenario('repeat guest input',GUEST,{allowedList:[OWNER],openBot:true});check('channel reuses directory without deleting existing artifact',r.model===1&&fs.readFileSync(path.join(guestDir,'keep.txt'),'utf8')==='KEEP',{});
 fs.renameSync(guestDir,guestDir+'-saved');fs.symlinkSync(guestDir+'-saved',guestDir);
 r=await scenario('symlink guest directory',GUEST,{allowedList:[OWNER],openBot:true});check('channel refuses symlink chat directory before model',r.model===0&&r.sent.some(x=>/папка беседы/.test(x.text)),{});
 fs.unlinkSync(guestDir);fs.renameSync(guestDir+'-saved',guestDir);
 fs.renameSync(path.join(root,'vydacha'),path.join(root,'saved-output'));fs.symlinkSync(path.join(root,'saved-output'),path.join(root,'vydacha'));
 r=await scenario('symlink output parent',GUEST,{allowedList:[OWNER],openBot:true});check('channel refuses symlink vydacha before model',r.model===0&&r.sent.some(x=>/папка беседы/.test(x.text)),{});
 fs.unlinkSync(path.join(root,'vydacha'));fs.renameSync(path.join(root,'saved-output'),path.join(root,'vydacha'));
 r=await scenario('directory restored',GUEST,{allowedList:[OWNER],openBot:true});check('channel resumes after directory symlink removal',r.model===1,{});
 r=await scenario('/stop',OWNER,{allowedList:[OWNER],openBot:true});check('open bot owner stop retains explicit privilege',r.pauses===1&&r.model===0,r);
 r=await scenario('/goal work',GUEST,{allowedList:[OWNER,GUEST],openBot:true});check('open bot privileged goal uses allowedUsers',r.goals===1&&r.model===0,r);
 console.log(JSON.stringify({ok,fail,nativeCommands:registry.list(await app.sozdatAgenta('catalog')).map(x=>x.name)}));
 if(process.env.B1483_EVIDENCE)fs.writeFileSync(process.env.B1483_EVIDENCE,JSON.stringify({source:SRC,ok,fail,scenarios:evidence},null,2)+'\n');
}finally{await app.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true});}
process.exitCode=fail?1:0;
