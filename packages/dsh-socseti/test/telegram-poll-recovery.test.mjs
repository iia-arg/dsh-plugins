import './approval-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {setImmediate} from 'node:timers/promises';import {spawnSync} from 'node:child_process';
import {fixture} from './poll-fixture.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const requestedWatch=process.env.SOCSETI_WATCH_SOURCE;
const watchSource=requestedWatch??fileURLToPath(new URL('../../dsh-storozha-sadik/sbin/socseti-watch',import.meta.url));
if(requestedWatch!==undefined&&(!path.isAbsolute(watchSource)||!fs.existsSync(watchSource)))throw Error('SOCSETI_WATCH_SOURCE must name an existing absolute watcher file');
const hasWatcher=fs.existsSync(watchSource);
const checkWatcher=(t,status,expected)=>t.test('external socseti-watch status reader',{skip:!hasWatcher?'watcher is outside this package; worker assertions still run':false},()=>assert.deepEqual(watcher(status),expected));
const flush=async()=>{for(let i=0;i<12;i++)await setImmediate()};
const watcher=status=>{assert(hasWatcher,'external watcher unavailable');const code="import runpy,json,sys;m=runpy.run_path(sys.argv[1]);value=json.load(sys.stdin);rpc={'jsonrpc':'2.0','id':1,'result':{'content':[{'type':'text','text':json.dumps(value)}]}};print(json.dumps(m['parse_status'](json.dumps(rpc), 'synthetic-key-only')))";const p=spawnSync('python3',['-B','-c',code,watchSource],{input:JSON.stringify(status),encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout)};

test('healthy -> unavailable 7 polls -> restored: degraded without halt; actual watcher sees both states',async t=>{
 let offline=false;const f=await fixture(t,{poll:async()=>{if(offline)throw Error('synthetic unavailable');return[]}});
 await f.worker.tick();assert.equal(f.store.status().publishing,true);assert.equal(f.store.status().telegram.reason,null);assert.deepEqual(f.logs,[]);await checkWatcher(t,f.store.status(),['ready',null]);
 offline=true;console.log('FAULT network unavailable=true; planned failing polls=7');
 for(let i=0;i<7;i++){await f.worker.tick();assert.equal(f.store.status().telegram.halted,false);assert.equal(f.store.status().publishing,false);assert.equal(f.store.status().external_io,false);assert.equal(f.store.status().telegram.reason,'poll_failed')}
 assert.equal(f.polls(),8);await checkWatcher(t,f.store.status(),['blind','telegram_not_ready']);
 offline=false;console.log('RESTORE network unavailable=false');await f.worker.tick();assert.equal(f.store.status().telegram.halted,false);assert.equal(f.store.status().publishing,true);await checkWatcher(t,f.store.status(),['ready',null]);assert(f.logs.some(r=>r.event==='telegram_poll_recovered'));
});

test('real start loop retries at capped intervals and resets after recovery',{timeout:60000},async t=>{
 const times=[];let left=6;let completed;const enough=new Promise(r=>completed=r);
 const f=await fixture(t,{poll:async()=>{times.push(performance.now());if(left-- >0)throw Error('synthetic timeout');if(times.length===8)completed();return[]}});
 const loop=f.worker.start();await enough;await f.worker.stop();await loop;
 assert.equal(f.store.status().telegram.halted,false);assert(f.logs.some(r=>r.event==='telegram_poll_recovered'));
 const delays=times.slice(1,8).map((t,i)=>t-times[i]);
 for(const [i,expected] of [1000,2000,4000,8000,16000,16000,100].entries()){assert(delays[i]>=expected-50&&delays[i]<=expected+2500,'measured interval '+delays[i]+' expected '+expected)}
 console.log('REAL_BACKOFF_MS',JSON.stringify(delays));assert.equal(f.polls(),8);assert.equal(f.store.status().publishing,false,'stop clears ready');
});

for(const code of [401,403,409])test('fatal poll '+code+' still halts and never retries',async t=>{
 const f=await fixture(t,{poll:async()=>{throw Object.assign(Error('synthetic rejection'),{kind:'rejected',code})}});await f.worker.tick();assert.equal(f.store.status().telegram.halted,true);assert.equal(f.store.status().telegram.reason,'poll_failed');await checkWatcher(t,f.store.status(),['halted','poll_failed']);await f.worker.tick();assert.equal(f.polls(),1);
});

test('invalid successful batch still halts rather than declaring recovery',async t=>{
 const f=await fixture(t,{poll:async n=>{if(n===1)throw Error('unavailable');return[{update_id:'bad'}]}});await f.worker.tick();await f.worker.tick();assert.equal(f.store.status().telegram.halted,true);assert.equal(f.store.status().telegram.reason,'invalid_update_batch');assert.equal(f.store.status().publishing,false);
});

test('stop interrupts real backoff and prevents later requests',async t=>{
 const f=await fixture(t,{poll:async()=>{throw Error('unavailable')}});const loop=f.worker.start();await flush();assert.equal(f.polls(),1);const start=Date.now();await f.worker.stop();await loop;assert(Date.now()-start<750);await new Promise(r=>setTimeout(r,10));assert.equal(f.polls(),1);
});

test('stop during outstanding poll cannot restore readiness afterwards',async t=>{
 let release;const response=new Promise(r=>release=r);const f=await fixture(t,{poll:()=>response});const tick=f.worker.tick();await flush();assert.equal(f.polls(),1);await f.worker.stop();release([]);await tick;assert.equal(f.store.status().publishing,false);assert.equal(f.store.status().external_io,false);
});
