import test from 'node:test';import assert from 'node:assert/strict';
const m=await import('../src/cycle-log.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e});
test('bounded cycle summary preserves actual interval range and excludes payload data',()=>{
 assert.equal(typeof m.cycleReporter,'function','safe cycle reporter missing');let now=100000;const rows=[];const record=m.cycleReporter('telegram','delivery',r=>rows.push(r),{now:()=>now,windowMs:60000});
 record({started:99990,finished:100000,elapsed:10,result:'ok',calls:0,text:'PRIVATE',subject_id:'PRIVATE'});assert.equal(rows.length,1);
 for(let i=1;i<=600;i++){now=100000+i*100;record({started:now-5,finished:now,elapsed:5,result:'ok',calls:i===600?1:0,text:'PRIVATE'})}
 assert.equal(rows.length,2,'idle ticks must not flood journal');assert.equal(rows[1].cycles,600);assert.equal(rows[1].interval_min_ms,100);assert.equal(rows[1].interval_max_ms,100);assert.equal(rows[1].api_attempts,1);assert.ok(!JSON.stringify(rows).includes('PRIVATE'));assert.equal(rows[1].event,'social_cycle');
});
test('one completed network cycle is not a made-up interval; clock reversal explicit',()=>{
 assert.equal(typeof m.cycleReporter,'function');const out=[];const report=m.cycleReporter('instagram','read',r=>out.push(r));report({started:5,finished:10,elapsed:5,result:'parked',calls:0});assert.equal(out[0].interval_min_ms,null);assert.equal(out[0].result,'parked');report({started:2,finished:3,elapsed:1,result:'blocked',calls:0});assert.equal(out[1].clock_regression,true);assert.equal(out[1].interval_min_ms,null);
});
test('bounded summary retains a blocked middle tick after next successful one',()=>{const rows=[],report=m.cycleReporter('telegram','delivery',x=>rows.push(x),{windowMs:60000});report({started:0,finished:1,elapsed:1,result:'ok',calls:0});report({started:2,finished:3,elapsed:1,result:'blocked',calls:0});report({started:60000,finished:60001,elapsed:1,result:'ok',calls:0});assert.equal(rows.length,2);assert.equal(rows[1].cycles,2);assert.equal(rows[1].outcomes.blocked,1);assert.equal(rows[1].outcomes.ok,1);assert.equal(rows[1].last_result,'ok');assert.equal(rows[1].result,'blocked')});
