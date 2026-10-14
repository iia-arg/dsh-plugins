import assert from 'node:assert/strict';
import {formatStatus} from '../src/compact-status.js';
let green=0,red=0;
function check(name,fn){try{const result=fn();if(result!==undefined&&result!==true)throw Error(typeof result==='string'?result:'body refused');green++;console.log('PASS '+name)}catch(e){red++;console.log('FAIL '+name+': '+e.message)}}
for(const model of ['gpt-6-astra','claude-opus-5-5']){
 const base={model:{provider:'claude-oauth',model},window:1000000,measurement:{totalTokens:521965,baseline:{kind:'usage',tokens:521965}},freshness:{kind:'svezhaya',usageAt:Date.parse('2026-10-13T04:28:33Z')},configs:[{auto:true,thresholdRatio:.8}]};
 check(model+' idle fallback keeps native estimate without gateway-error or obsolete-support lines',()=>{
  const text=formatStatus({...base,running:false,contextStatus:{supported:false,reason:'gateway-status-unavailable'},codexError:'gateway-status-unavailable'});
  assert(text.includes('модель 521 965 · 65.2%'));assert(text.includes('DSH    521 965 · 65.2%'));assert(text.includes('хода нет'));
  assert.equal(text.split('\n')[0],'снято 07:28:33 МСК');assert(!/причина недоступности|устарело|gateway-status-unavailable/.test(text));
 });
 check(model+' idle native fallback never borrows the old Codex model or decorations',()=>{const text=formatStatus({...base,running:false,contextStatus:{supported:false,reason:'gateway-status-unavailable'},codex:{model:'old-model',total:120000,timestamp:'2026-10-13T02:00:00Z',changed:true}});assert.equal(text.split('\n')[1],model+' (хода нет)');assert(!/old-model|журнал модели|замеру|контекст менялся|⚠️/.test(text),text);});
 check(model+' idle measured snapshot uses its actual last time and hides transport diagnostics',()=>{
  const text=formatStatus({...base,running:false,codexError:'former error',contextStatus:{supported:true,state:'measured',active:false,model,window:1000000,threshold:800000,inputTokens:521962,timestamp:'2026-10-13T04:28:32.644Z'}});
  assert.equal(text.split('\n')[0],'снято 07:28:32 МСК');assert(!/причина недоступности|устарело|former error/.test(text));assert(text.includes('модель 521 962 · 65.2%'));
 });
 check(model+' a validated active SDK request is not called absent just because the public agent is idle',()=>{const text=formatStatus({...base,running:false,contextStatus:{supported:true,state:'measured',active:true,model,window:1000000,threshold:800000,inputTokens:521962,timestamp:'2026-10-13T04:28:32.644Z'}});assert(text.includes('(снято внутри хода)'),text);assert(!text.includes('хода нет'),text);});
 check(model+' idle after compaction names no turn and no measurement without old numbers',()=>{
  const text=formatStatus({...base,running:false,freshness:{kind:'ustarela',kompakt:10},contextStatus:{supported:true,state:'waiting',afterCompact:true}});
  assert(text.includes('хода нет'));assert(text.includes('после сжатия, замера ещё нет'));assert(!/521|800|причина недоступности|устарело/.test(text));
 });
 check(model+' invalid or future native usage time cannot become a measurement clock',()=>{for(const usageAt of [1e99,Date.now()+86400000]){const text=formatStatus({...base,running:false,freshness:{kind:'svezhaya',usageAt}});assert.equal(text.split('\n')[0],'время замера не установлено (МСК)');}});
 check(model+' running transport failure remains a diagnostic rather than claiming no turn',()=>{
  const text=formatStatus({...base,running:true,contextStatus:{supported:false,reason:'gateway-status-unavailable'}});
  assert(text.includes('причина недоступности: gateway-status-unavailable'));assert(!text.includes('хода нет'));
 });
}
console.log('RESULT green='+green+' red='+red+' total='+(green+red));process.exitCode=red?1:0;
