// RU: Изолированный стенд stend-site-platform-tools.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-site-platform-tools.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';import {testPlatform} from './test-platform.mjs';import {installSitePolicy} from '../src/site-policy.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-platform-tools-'));let p,timer;try{
 p=await podnyatPlatformu02({root});const mods=await testPlatform(['dsh-schedule']);const tools=p.ctx.get('tools');
 tools.register({name:'pismo_rukovoditelyu',description:'fixture',parameters:{},output:{schema:{type:'object',properties:{}},render:()=>[]},execute:async()=>({})});

 p.ctx.on('agent/created',({agent})=>{mods['dsh-schedule'].registerScheduleTools(p.ctx,agent.ctx,agent);agent.ctx.get('tools').register({name:'future_platform_tool',description:'fixture',parameters:{},output:{schema:{type:'object',properties:{}},render:()=>[]},execute:async()=>{throw Error('must not execute');}});});
 p.ctx.provide('mcpBridge',{descriptor:id=>({tools:tools.wireSchemas(p.agents.get(id)).schemas})});
 let reached,finish;const gate=new Promise(r=>reached=r),end=new Promise(r=>finish=r);
 const site=(await p.agents.create({sessionId:'telegram-site-1',setup:(ctx,a)=>{installSitePolicy(ctx,a,{closed:()=>false});ctx.on('agent/pre-step',async(args,next)=>{reached();await new Promise(r=>args.signal.addEventListener('abort',r,{once:true}));args.signal.throwIfAborted();return next();});}})).agent;
 const tg=(await p.agents.create({sessionId:'telegram-2'})).agent;
 if(!process.env.SITE_EXPECT_DIFFERS){
 assert.deepEqual(tools.wireSchemas(site).schemas.map(x=>x.name),['pismo_rukovoditelyu']);console.log('PASS platform schedules and future local tool excluded from site schemas');
 assert(tools.wireSchemas(tg).schemas.some(x=>x.name==='schedule_create'));assert(tools.wireSchemas(tg).schemas.some(x=>x.name==='future_platform_tool'));console.log('PASS Telegram platform tools remain');
 for(const name of ['schedule_create','schedule_delete','schedule_list','schedule_update','future_platform_tool'])assert((await tools.execute({name,arguments:{},agent:site,callId:name,signal:new AbortController().signal})).isError);console.log('PASS direct excluded tools denied');
 }
 p.ctx.on('session/event',(s,e)=>{if(s===site.session&&e.type==='turn/end')finish(e);});
 site.send(p.llm.createUserMessage({content:[{type:'text',text:'fixture'}],source:{kind:'user'}}),'next-turn',true);
 if(process.env.SITE_EXPECT_DIFFERS){const event=await Promise.race([end,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('no refusal')),3000))]);assert.match(JSON.stringify(event),/Site tool set differs from approved list/);console.log('PASS removed filter produces fail-closed differs');}
 else {
 await Promise.race([gate,end.then(e=>{throw Error('turn refused: '+JSON.stringify(e));}),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('turn not reached')),3000))]);
 site.cancel({kind:'user'});await end;console.log('PASS real driver passes policy to next pre-step; synthetic stop before model');
 }
}finally{clearTimeout(timer);await p?.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true});}
