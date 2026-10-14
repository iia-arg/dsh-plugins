// RU: Изолированный стенд stend-site-remount.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-site-remount.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';import {installSitePolicy} from '../src/site-policy.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-remount-'));let p;try{
 p=await podnyatPlatformu02({root});const tools=p.ctx.get('tools');let calls=0,oldActive=true;
 tools.register({name:'pismo_rukovoditelyu',description:'fixture',parameters:{},output:{schema:{type:'object',properties:{}},render:()=>[]},execute:async()=>{calls++;return{};}});
 const a=(await p.agents.create({sessionId:'telegram-site-1',setup:(ctx,agent)=>installSitePolicy(ctx,agent,{closed:()=>!oldActive})})).agent;
 oldActive=false;assert((await tools.execute({name:'pismo_rukovoditelyu',arguments:{},agent:a,callId:'old',signal:new AbortController().signal})).isError);
 installSitePolicy(a.ctx,a,{closed:()=>false});assert(!(await tools.execute({name:'pismo_rukovoditelyu',arguments:{},agent:a,callId:'new',signal:new AbortController().signal})).isError);assert.equal(calls,1);assert.deepEqual(tools.wireSchemas(a).schemas.map(x=>x.name),['pismo_rukovoditelyu']);console.log('PASS remount reuses policy and replaces stale closed callback on live agent');
}finally{await p?.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true});}
