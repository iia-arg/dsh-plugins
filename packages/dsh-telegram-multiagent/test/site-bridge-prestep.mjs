// RU: Изолированный стенд site-bridge-prestep.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness site-bridge-prestep.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';import {installSitePolicy} from '../src/site-policy.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-prestep-'));let p,timer;
try{
 p=await podnyatPlatformu02({root});let descriptions=0,finish;
 p.ctx.provide('mcpBridge',{descriptor:()=>{descriptions++;return {tools:[{name:'pismo_rukovoditelyu'},{name:'omega_query'}]};}});
 p.ctx.get('tools').register({name:'pismo_rukovoditelyu',description:'fixture',parameters:{},output:{schema:{type:'object',properties:{}},render:()=>[]},execute:async()=>({})});
 const end=new Promise(r=>finish=r);p.ctx.on('session/event',(s,e)=>{if(s.id==='telegram-site-1'&&e.type==='turn/end')finish(e);});
 const agent=(await p.agents.create({sessionId:'telegram-site-1',setup:(ctx,a)=>installSitePolicy(ctx,a,{closed:()=>false})})).agent;
 agent.send(p.llm.createUserMessage({content:[{type:'text',text:'fixture'}],source:{kind:'user'}}),'next-turn',true);
 const event=await Promise.race([end,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('no turn/end')),3000);})]);
 assert.equal(descriptions,1);assert.match(JSON.stringify(event),/Site bridge capability list/);console.log('PASS actual driver rejects unsafe bridge at pre-step; model is not reached');
}finally{clearTimeout(timer);await p?.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true});}
