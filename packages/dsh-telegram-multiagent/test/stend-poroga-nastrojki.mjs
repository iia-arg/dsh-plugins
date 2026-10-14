// RU: Изолированный стенд stend-poroga-nastrojki.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-poroga-nastrojki.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {formatStatus} from '../src/compact-status.js';
import {currentContextStatus} from '../src/context-status.js';
const src=process.argv[2]||process.env.SVYAZ_SRC||new URL('../src/index.js',import.meta.url).pathname;
console.log('предмет:',src);const source=readFileSync(src,'utf8');
const a=source.indexOf('handler: async (invocation) => {',source.indexOf("name: 'compact-status'"));const b=source.indexOf('\n            },',a);assert(a>=0&&b>a);
function handler(configs) {
 return new Function('ctx','schetchik','log','prichina','platform','fs','readCodexStatus','formatStatus','currentContextStatus',`return async invocation=>{${source.slice(a+'handler: async (invocation) => {'.length,b)}}`)(
 {get:()=>({resolveModelInfo:async()=>({context:{contextWindow:1000000}})}),emit:(scope,event,replies)=>{assert.equal(event,'our/compaction-status');assert.equal(scope.subject.id,'test');replies.push(...configs);}},
 {measure:()=>({totalTokens:100000,baseline:{kind:'usage',tokens:100000},surfaceDeltaTokens:0,logRevision:1})},()=>{},e=>e.message,
 {scopeTarget:(subject,key)=>{assert.equal(subject,key);return{subject};}}, {readFileSync:()=>JSON.stringify({})},async()=>{throw Error('not configured');},formatStatus,currentContextStatus);
}
const invocation={agent:{id:'test',session:{events:[],requestHeader:()=>({config:{provider:'p',model:'m'}})}}};


const cifry=t=>t.replace(/[\s  ]/g,'');
const proc=t=>/\d+(\.\d+)?%/.test(t);
for(const ratio of [0.95,0.7,0.95]) {
  const text=(await handler([{auto:true,thresholdRatio:ratio}])(invocation)).text, porog=Math.floor(1000000*ratio);
  assert.ok(cifry(text).includes(String(porog)),`порог ${porog} не напечатан: ${text}`);
  assert.ok(text.includes((100000/porog*100).toFixed(1)+'%'),`процент не ОТ ПОРОГА ${porog}: ${text}`);
  if(ratio<1) assert.ok(!text.includes('10.0%'),`процент посчитан ОТ ОКНА: ${text}`);
}
{const t=(await handler([{auto:true,thresholdRatio:0.95,modelPolicies:[{provider:'p',model:'m',thresholdRatio:0.6}]}])(invocation)).text;
 assert.ok(cifry(t).includes('600000')&&t.includes('16.7%'),`политика модели не перебила общую долю: ${t}`);}
for(const configs of [[],[{thresholdRatio:.8},{thresholdRatio:.9}]]){const t=(await handler(configs)(invocation)).text;assert.ok(!proc(t),`без однозначной настройки напечатаны проценты: ${t}`);}
for(const ratio of [0,NaN,1.1]){const t=(await handler([{thresholdRatio:ratio}])(invocation)).text;assert.ok(!proc(t),`при доле ${ratio} напечатаны проценты: ${t}`);}
{const svezh=(await handler([{auto:true,thresholdRatio:.9}])(invocation)).text;
 invocation.agent.session.events=[{type:'compaction/summary',seq:1}];const ustar=(await handler([{auto:true,thresholdRatio:.9}])(invocation)).text;invocation.agent.session.events=[];
 assert.notEqual(ustar,svezh,'опора после сжатия неотличима от свежей');}
console.log('PASS handler: порог по доле, проценты от порога, политика модели, отказ без настройки и при негодной доле, устаревшая опора');
