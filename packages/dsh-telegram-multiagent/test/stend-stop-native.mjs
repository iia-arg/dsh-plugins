// RU: Изолированный стенд stend-stop-native.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-stop-native.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';import {handleTelegramStop} from '../src/telegram-stop.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stop-native-'));
try{
 const {ctx,sozdatAgenta}=await podnyatPlatformu02({root:path.join(dir,'platform')});let reached,ended;const gate=new Promise(r=>reached=r),done=new Promise(r=>ended=r);let signalSeen;
 ctx.on('agent/pre-step',async(args,next)=>{signalSeen=args.signal;reached();await new Promise(r=>args.signal.addEventListener('abort',r,{once:true}));args.signal.throwIfAborted();return next();});
 ctx.on('session/event',(session,e)=>{if(e.type==='turn/end')ended(e);});
 const agent=await sozdatAgenta('stop-native');agent.session.requestHeader=()=>({config:{provider:'deepseek-direct',model:'test'}});
 const message=id=>({id,role:'user',content:[{type:'text',text:id}]});agent.send(message('A'),'next-turn',true);
 await Promise.race([gate,new Promise((_,reject)=>setTimeout(()=>reject(Error('pre-step not reached')),3000))]);
 agent.send(message('NEXT'),'next-turn',false);const r=await handleTelegramStop({text:'/stop',from:{id:7}},{allowed:new Set([7]),findAgent:()=>agent});assert.equal(r.state,'interrupting');assert.equal(signalSeen.aborted,true);assert.equal(signalSeen.reason.kind,'user');
 const end=await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('turn did not end')),3000))]);assert.equal(end.data.reason.kind,'aborted');assert.equal(agent.inbox.nextTurn.some(m=>m.id==='NEXT'),true,'next turn must remain queued');console.log('PASS actual DSH turn aborted; next-turn retained; no model called');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
