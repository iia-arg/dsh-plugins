// RU: Изолированный стенд stend-supervisor-registration.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-supervisor-registration.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {supervisorTool} from '../src/guest-channel.js';import {podnyatPlatformu02} from './platforma-02.mjs';import {testPlatform} from './test-platform.mjs';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const block=source.match(/  if \(config\.supervisor !== undefined\) \{[\s\S]*?\n  \}/)?.[0];assert(block,'actual registration block absent');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'supervisor-reg-'));const app=await podnyatPlatformu02({root});const {['dsh-tools']:tools}=await testPlatform(['dsh-tools']);const calls=[];
try{
 vm.runInNewContext(block,{config:{supervisor:'supervisor',agentName:'assistant'},supervisorTool:opts=>supervisorTool({...opts,send:async(recipient,text)=>{calls.push({recipient,text});return{status:'placed',recipient}}}),log(){},ctx:{inject:(deps,fn)=>app.ctx.inject(deps,c=>{try{fn(c);}catch(e){console.error('registration error',e);throw e;}})},platform:{defineTool:tools.defineTool}});
 for(let i=0;i<100&&!app.ctx.get('tools').get('pismo_rukovoditelyu');i++)await new Promise(r=>setTimeout(r,5));
 const definition=app.ctx.get('tools').get('pismo_rukovoditelyu');assert(definition,'tool not registered');const agent=await app.sozdatAgenta('supervisor-test');
 if(process.env.DSH_TEST_BRIDGE){const {naborDlyaAgenta}=await import(process.env.DSH_TEST_BRIDGE);assert(naborDlyaAgenta(app.ctx.get('tools'),agent).some(t=>t.name==='pismo_rukovoditelyu'));console.log('PASS installed MCP bridge discovers the registered channel tool');}
 const result=await app.ctx.get('tools').execute({name:'pismo_rukovoditelyu',arguments:{text:'test message'},agent,callId:'supervisor-call',signal:new AbortController().signal});assert(!result.isError,JSON.stringify(result));assert.equal(calls.length,1);assert.equal(calls[0].recipient,'supervisor');assert(calls[0].text.includes('test message'));assert(result);console.log('PASS actual registration block -> native ToolRuntime -> channel handler -> fixed supervisor');
}finally{await app.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true})}
