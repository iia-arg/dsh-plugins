import './approval-fixture.mjs';import test from 'node:test';import assert from 'node:assert/strict';import {probeMetaWatch} from '../src/meta-watch.mjs';
test('daily budget exhaustion is a named coverage loss even when loop heartbeat is green',async()=>{
 const now=Date.parse('2026-10-16T12:00:00Z'),base={last_loop:now,last_attempt:now,last_success:now,last_completed_scan:now,ready:true,reason:null},config={meta:{instagram:{enabled:true,dailyCallLimit:2000}}};let state=base;const run=()=>probeMetaWatch(config,{now,readUnit:()=>({LoadState:'loaded',ActiveState:'active',UnitFileState:'enabled'}),readState:()=>state});assert.equal((await run()).code,0);
 state={...base,calls:2000,day:'2026-10-16',reason:'daily_budget',ready:false};const red=await run();assert.equal(red.code,1);assert.ok(red.issues.some(x=>x.subject==='instagram'&&x.reason==='current_coverage_daily_budget'));
 state=base;assert.equal((await run()).code,0);
});
