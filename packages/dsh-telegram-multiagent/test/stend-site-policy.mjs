// RU: Изолированный стенд stend-site-policy.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-site-policy.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {podnyatPlatformu02} from './platforma-02.mjs';import {installSitePolicy,checkSiteBridge} from '../src/site-policy.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-policy-'));let p;
try{
 p=await podnyatPlatformu02({root});let calls=[],closed=false;
 const tools=p.ctx.get('tools');
 for(const name of ['pismo_rukovoditelyu','omega_query','omega_store','bash','read','gws','socseti_draft','spawn_agent'])tools.register({name,description:name,parameters:{},output:{schema:{type:'object',properties:{},additionalProperties:false},render:()=>[]},async execute(){calls.push(name);return{};}});
 assert.throws(()=>checkSiteBridge({get:()=>({descriptor:()=>({tools:[{name:'pismo_rukovoditelyu'},{name:'omega_query'}]})})},{id:'telegram-site-1'}),/bridge|мост/i);
 assert.throws(()=>checkSiteBridge({get:()=>undefined},{id:'telegram-site-1'}),/bridge|мост/i);
 checkSiteBridge({get:()=>({descriptor:()=>({tools:[{name:'pismo_rukovoditelyu'}]})})},{id:'telegram-site-1'});console.log('PASS bridge descriptor must match exact capability list, unavailable refuses');
 const a=(await p.agents.create({sessionId:'telegram-site-1',setup:async(ctx,agent)=>installSitePolicy(ctx,agent,{closed:()=>closed})})).agent;
 const b=(await p.agents.create({sessionId:'telegram-site-2',setup:async(ctx,agent)=>installSitePolicy(ctx,agent,{closed:()=>closed})})).agent;
 const tg=(await p.agents.create({sessionId:'telegram-123'})).agent;
 assert.deepEqual(tools.wireSchemas(a).schemas.map(x=>x.name),['pismo_rukovoditelyu']);assert.deepEqual(tools.wireSchemas(b).schemas.map(x=>x.name),['pismo_rukovoditelyu']);assert(tools.wireSchemas(tg).schemas.some(x=>x.name==='omega_query'));console.log('PASS exact site tool list A/B; Telegram unchanged');
 for(const name of ['omega_query','omega_store','bash','read','gws','socseti_draft','spawn_agent']){const r=await tools.execute({name,arguments:{},agent:a,callId:name,signal:new AbortController().signal});assert(r.isError);}
 assert.equal(calls.length,0);console.log('PASS forbidden direct calls refuse without side effect');
 a.ctx.get('tools').register({name:'late-own-tool',description:'fixture',parameters:{},output:{schema:{type:'object',properties:{}},render:()=>[]},execute:async()=>{calls.push('late-own-tool');return{};}});
 assert((await tools.execute({name:'late-own-tool',arguments:{},agent:a,callId:'late',signal:new AbortController().signal})).isError);assert.equal(calls.length,0);console.log('PASS scoped late tool denied by monotonic execution guard');
 assert(!(await tools.execute({name:'pismo_rukovoditelyu',arguments:{},agent:a,callId:'ok',signal:new AbortController().signal})).isError);assert.deepEqual(calls,['pismo_rukovoditelyu']);closed=true;assert((await tools.execute({name:'pismo_rukovoditelyu',arguments:{},agent:a,callId:'closed',signal:new AbortController().signal})).isError);assert.equal(calls.length,1);console.log('PASS approved letter works; closed denies');
}finally{await p?.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true});}
