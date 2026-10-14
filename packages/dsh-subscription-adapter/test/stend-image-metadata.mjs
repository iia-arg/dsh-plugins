// RU: stend-image-metadata: проверяет соответствующий контракт настоящего адаптера на контролируемом HTTP/платформенном входе. При недоступной платформе результат не подтверждает работоспособность; live credentials не используются.
// EN: stend-image-metadata: tests the actual adapter contract against controlled HTTP/platform inputs. Missing platform prerequisites cannot certify functionality; no live credentials are used.


import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import path from 'node:path';
import {Context} from '@deepseek-ai/cordis';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import * as adapterPlugin from '../src/index.js';
const require=createRequire(import.meta.url);
let gatePath;
try{gatePath=require.resolve('@deepseek-ai/dsh-tool-fs');}
catch(error){
 try{if(!process.env.STEND_APP)throw error;gatePath=createRequire(path.join(path.resolve(process.env.STEND_APP),'package.json')).resolve('@deepseek-ai/dsh-tool-fs');}
 catch{console.log('СЛЕПОТА: нужен @deepseek-ai/dsh-tool-fs; задайте STEND_APP с установленной DSH');process.exit(2);}
}
const source=fs.readFileSync(gatePath,'utf8');
const start=source.indexOf('async function assertImageCapableRoute(');
const end=source.indexOf('\n}',start)+2;
assert(start>=0&&end>start,'actual platform gate not found');
const gate=vm.runInNewContext('('+source.slice(start,end)+')');
const signal=new AbortController().signal;
let passed=0,failed=0;
const probe=async(name,fn)=>{try{const result=await fn();if(result!==undefined&&result!==true)throw Error(typeof result==='string'?result:'body refused');passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}};
const ctx=new Context();ctx.provide('logger');ctx.logger={error(){},info(){},warn(){}};
ctx.plugin(LlmRuntime);ctx.provide('agents');ctx.agents={currentInitiator:()=>undefined};
await new Promise(r=>setTimeout(r,30));assert(ctx.llm,'real LlmRuntime not mounted');
const models=[{id:'vision',inputModalities:['text','image'],contextWindow:987654,maxTokens:1234},{id:'text',inputModalities:['text']},{id:'unspecified'}];
const scope=ctx.plugin(adapterPlugin,{models});
await new Promise(r=>setTimeout(r,30));
const exec=(model,provider='claude-oauth')=>({signal,agent:{session:{requestHeader:()=>({config:{provider,model}})},options:{provider:'claude-oauth',model:'vision'}}});
try{
 await probe('string modalities fail explicitly before registration',async()=>{assert.throws(()=>adapterPlugin.apply({llm:{registerAdapter(){throw Error('must not register')}},get(){}},{models:[{id:'bad',inputModalities:'image'}]}),/inputModalities must be an array/);});
 await probe('resolve metadata and existing limits',async()=>{const info=await ctx.llm.resolveModelInfo('claude-oauth','vision');assert.deepEqual(info.inputModalities,['text','image']);assert.equal(info.context.contextWindow,987654);assert.equal(Object.hasOwn(info,'defaultMaxTokens'),false);});
 await probe('discovery metadata agrees with resolve',async()=>{const all=await ctx.llm.listModels('claude-oauth');assert.deepEqual(all.find(x=>x.id==='vision').inputModalities,['text','image']);assert.deepEqual(all.find(x=>x.id==='text').inputModalities,['text']);assert.equal(Object.hasOwn(all.find(x=>x.id==='unspecified'),'inputModalities'),false);});
 await probe('declared vision passes real gate',()=>gate(ctx,exec('vision'),'fixture.png'));
 for(const model of ['text','unspecified','unknown'])await probe(model+' refuses real gate',()=>assert.rejects(()=>gate(ctx,exec(model),'fixture.png'),/does not declare image input/));
 await probe('route header overrides vision options',()=>assert.rejects(()=>gate(ctx,exec('text'),'fixture.png'),/model "text"/));
 await probe('unknown model keeps capability unspecified',async()=>{const m=await ctx.llm.resolveModelInfo('claude-oauth','unknown');assert.equal(Object.hasOwn(m,'inputModalities'),false);assert.equal(m.id,'unknown');});
 await probe('metadata arrays do not alias config',async()=>{let raw;adapterPlugin.apply({llm:{registerAdapter(_ids,a){raw=a;}},get(){}},{models});const info=await raw.resolveModel('claude-oauth','vision');info.inputModalities.pop();const list=await raw.listModels('claude-oauth');list[0].inputModalities.push('other');assert.deepEqual(models[0].inputModalities,['text','image']);});
}finally{await scope.dispose();}
if(process.env.ADAPTER_MODEL_SETTINGS){
 const settings=JSON.parse(fs.readFileSync(process.env.ADAPTER_MODEL_SETTINGS,'utf8'));
 for(const change of settings.changes)for(const state of ['before','after']){
  const scope=ctx.plugin(adapterPlugin,{models:change[state]});await new Promise(r=>setTimeout(r,30));
  try{await probe(change.agent+' '+state+' real route gate',async()=>{
   const fn=()=>gate(ctx,exec(change.selector.model),'fixture.png');
   if(state==='before')await assert.rejects(fn,/does not declare image input/);else await fn();
  });}finally{await scope.dispose();}
 }
}
console.log(JSON.stringify({passed,failed,gatePath}));assert.equal(failed,0);
