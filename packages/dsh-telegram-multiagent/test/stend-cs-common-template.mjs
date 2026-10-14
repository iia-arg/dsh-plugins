import assert from 'node:assert/strict';
import {formatStatus} from '../src/compact-status.js';
let green=0,red=0;
function check(name,fn){try{const r=fn();if(r!==undefined&&r!==true)throw Error(typeof r==='string'?r:'body refused');green++;console.log('PASS '+name)}catch(e){red++;console.log('FAIL '+name+': '+e.message)}}
for(const [name,model,window,threshold,input,remaining] of [['Codex','gpt-6-astra',921818,599181,254099,'345 082'],['Claude','claude-opus-5-5',1000000,650000,160009,'489 991']]){
 const args={model:{provider:'claude-oauth',model},window,measurement:{totalTokens:input+100,baseline:{kind:'usage',tokens:input}},freshness:{kind:'svezhaya'},configs:[{auto:true,thresholdRatio:.65}]};
 const snapshot={supported:true,state:'measured',model,window,threshold,inputTokens:input,timestamp:'2026-10-13T03:59:56.000Z'};
 check(name+' keeps the idle numeric template with a leading clock and measurement time',()=>{
  const idle=formatStatus({...args,contextStatus:{...snapshot,active:false}}).split('\n');
  assert.equal(idle.length,5);assert.equal(idle[0],'снято 06:59:56 МСК');assert.equal(idle[1],model);
  assert(idle[2].startsWith('модель '));assert(!idle[2].includes('снято'));
  assert(idle[3].startsWith('DSH    '));assert(idle[4].startsWith('порог '));assert(idle[4].includes(' = 65% от '));
  assert(!idle.join('\n').includes('внутри хода'));
 });
 check(name+' active and idle have byte-identical rows except one header annotation',()=>{
  const idle=formatStatus({...args,contextStatus:{...snapshot,active:false}});
  const active=formatStatus({...args,contextStatus:{...snapshot,active:true}});
  assert.equal(active.split('(снято внутри хода)').length-1,1);
  assert.equal(active.split('\n')[0],'снято 06:59:56 МСК (снято внутри хода)');assert.equal(active.split('\n')[1],model);
  assert.deepEqual(active.replace(' (снято внутри хода)','').split('\n'),idle.split('\n'));
 });
 check(name+' disabled auto-compaction retains remaining before OFF in both states',()=>{
  const base={...args,configs:[{auto:false,thresholdRatio:.65}]};
  const idle=formatStatus({...base,contextStatus:{...snapshot,active:false}});
  const active=formatStatus({...base,contextStatus:{...snapshot,active:true}});
  assert.equal(active.split('\n').length,5);assert.deepEqual(active.replace(' (снято внутри хода)','').split('\n'),idle.split('\n'));
  for(const text of [idle,active])assert(text.split('\n')[4].endsWith(' · осталось '+remaining+' · автосжатие ВЫКЛ'),text);
 });
 check(name+' disabled-auto remaining retains zero and negative values in both states',()=>{for(const [tokens,want] of [[threshold,' · осталось 0 · автосжатие ВЫКЛ'],[threshold+7,' · осталось -7 · автосжатие ВЫКЛ']])for(const active of [false,true]){const text=formatStatus({...args,configs:[{auto:false,thresholdRatio:.65}],contextStatus:{...snapshot,inputTokens:tokens,active}});assert.equal(text.split('\n').length,5);assert(text.split('\n')[4].endsWith(want),text);}});
 check(name+' legacy idle disabled-auto keeps known native DSH remaining',()=>{const text=formatStatus({...args,running:false,configs:[{auto:false,thresholdRatio:.65}],contextStatus:{supported:false,reason:'gateway-status-unavailable'}});assert(text.split('\n')[4].endsWith(' · осталось '+(name==='Codex'?'344 982':'489 891')+' · автосжатие ВЫКЛ'),text);assert(!text.includes('gateway-status-unavailable'));});
 check(name+' post-compaction hides old DSH while retaining the common rows',()=>{
  const text=formatStatus({...args,measurement:{totalTokens:611263,baseline:{kind:'usage',tokens:611000}},freshness:{kind:'ustarela',kompakt:1},contextStatus:{supported:true,state:'waiting',afterCompact:true}});
  assert.equal(text.split('\n').length,3);assert.equal(text.split('\n')[0],'время замера не установлено (МСК)');assert(text.includes('после сжатия, замера ещё нет'));assert(!text.includes('DSH'));assert(!text.includes('порог'));
  assert(!text.replace(/\s/gu,'').includes('611263'));assert(text.split('\n')[2].startsWith('причина недоступности: '));
 });
 check(name+' unavailable reason keeps one line and the 120-grapheme bound',()=>{
  const args2={...args,contextStatus:{supported:true,state:'blind',reason:'💻'.repeat(200)+'\nпричина'}};
  const inactive=formatStatus({...args2,contextStatus:{...args2.contextStatus,active:false}});
  const active=formatStatus({...args2,contextStatus:{...args2.contextStatus,active:true}});
  assert.equal(active.replace(' (снято внутри хода)',''),inactive);assert(active.split('\n')[0].endsWith(' (снято внутри хода)'));assert.equal(active.split('\n').length,3);
  const reasons=active.split('\n').filter(x=>x.startsWith('причина недоступности: '));assert.equal(reasons.length,1);
  assert([...new Intl.Segmenter('ru',{granularity:'grapheme'}).segment(reasons[0])].length<=120);
 });
}
check('snapshot window is used before calculating a missing snapshot threshold',()=>{
 const text=formatStatus({model:{provider:'claude-oauth',model:'claude-opus-5-5'},window:1000000,configs:[{auto:true,thresholdRatio:.65}],measurement:{totalTokens:160109},freshness:{kind:'svezhaya'},contextStatus:{supported:true,state:'measured',active:true,model:'claude-opus-5-5',window:921818,threshold:null,inputTokens:160009,timestamp:'2026-10-13T03:59:56Z'}});
 const flat=text.replace(/\s/gu,'');assert(flat.includes('порог599181=65%от921818'),text);assert(flat.includes('модель160009·26.7%'),text);assert(flat.includes('осталось439172'),text);
});
check('known threshold with unknown Claude window never invents zero percent of an unknown window',()=>{
 const text=formatStatus({model:{provider:'claude-oauth',model:'claude-opus-5-5'},configs:[],measurement:{},contextStatus:{supported:true,state:'measured',active:true,model:'claude-opus-5-5',window:null,threshold:650000,inputTokens:160009,timestamp:'2026-10-13T03:59:56Z'}});
 assert(text.replace(/\s/gu,'').includes('порог650000=?%от?'),text);assert(text.includes('24.6%'));assert(!text.includes('0% от ?'));
});
check('legacy estimate has an explicit unknown time instead of query time',()=>{const text=formatStatus({now:Date.parse('2026-10-13T04:00:00Z'),model:{model:'m'},window:1000,measurement:{totalTokens:2,baseline:{kind:'usage',tokens:1}},configs:[{thresholdRatio:.65}]});assert.equal(text.split('\n')[0],'время замера не установлено (МСК)');assert(text.includes('модель 1 ·'));});
check('invalid snapshot time never throws or invents a clock',()=>{const text=formatStatus({model:{model:'m'},contextStatus:{supported:true,state:'measured',active:false,inputTokens:1,timestamp:'bad',threshold:650}});assert.equal(text.split('\n')[0],'время замера не установлено (МСК)');});
console.log('RESULT green='+green+' red='+red+' total='+(green+red));process.exitCode=red?1:0;
