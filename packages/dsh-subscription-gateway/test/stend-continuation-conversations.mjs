// B-N-2009 gate delta: actual gateway selector + counter, two independent pressure sequences.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {ContinuationCounter} from '../live-pressure.mjs';import * as counters from '../live-pressure.mjs';import {resolveConversation} from '../conversation-identity.mjs';import {extractFunction} from './extract.mjs';
const source=fs.readFileSync(process.env.STEND_GATEWAY_SOURCE||new URL('../gateway.mjs',import.meta.url),'utf8');
const encode=(key,id='telegram-'+key,created=123)=>Buffer.from(JSON.stringify({key,session_id:id,session_created:created})).toString('base64url');
const scope=vm.createContext({Buffer,ContinuationCounter,ContinuationCounters:counters.ContinuationCounters,PREDEL_PRODOLZHENIJ:2});
if(counters.ContinuationCounters)scope.pressureCounters=new counters.ContinuationCounters(2);
let get;
if(source.includes('function pressureCounterFor('))get=vm.runInContext('('+extractFunction(source,'pressureCounterFor')+')',scope);
else {const declaration=source.match(/^const pressureCounter = new ContinuationCounter\(PREDEL_PRODOLZHENIJ\);$/m)?.[0];assert(declaration,'old gateway counter declaration unavailable');const shared=vm.runInContext(declaration+'pressureCounter;',scope);get=()=>shared;}
let n=0,bad=0;const test=(name,fn)=>{n++;try{fn();console.log('PASS',name)}catch(e){bad++;console.log('FAIL',name,e.message)}};
const stop=(c,placed=true)=>{const s=c.accepted();if(s.allowed)c.placed(placed);return s.allowed;};
const a=encode('-1004442041878'),b=encode('gost-123');
test('healthy one conversation permits exactly two successful letters',()=>{get(a).reset();assert(stop(get(a)));assert(stop(get(a)));assert.equal(stop(get(a)),false);});
test('A exhausted does not exhaust B',()=>{get(a).reset();get(b).reset();assert(stop(get(a)));assert(stop(get(a)));assert(stop(get(b)));assert(stop(get(b)));assert.equal(stop(get(b)),false);assert.equal(stop(get(a)),false);});
test('normal completion in B does not rearm exhausted A',()=>{get(a).reset();assert(stop(get(a)));assert(stop(get(a)));get(b).reset();assert.equal(stop(get(a)),false);});
test('same canonical address different JSON property order is one budget',()=>{get(a).reset();assert(stop(get(a)));const reordered=Buffer.from(JSON.stringify({session_created:123,session_id:'telegram--1004442041878',key:'-1004442041878'})).toString('base64url');assert(stop(get(reordered)));assert.equal(stop(get(a)),false);});
test('new generation has its own budget',()=>{get(a).reset();assert(stop(get(a)));assert(stop(get(a)));assert(stop(get(encode('-1004442041878','telegram-v2-11111111-1111-4111-8111-111111111111',124))));assert.equal(stop(get(a)),false);});
test('failed publication spends no successful-letter slot',()=>{get(b).reset();assert(stop(get(b),false));assert(stop(get(b)));assert(stop(get(b)));assert.equal(stop(get(b)),false);});
test('v2 without spool header uses distinct validated conversation keys',()=>{get(undefined,'v2:A').reset();get(undefined,'v2:B').reset();assert(stop(get(undefined,'v2:A')));assert(stop(get(undefined,'v2:A')));assert(stop(get(undefined,'v2:B')));assert.equal(stop(get(undefined,'v2:A')),false);});
test('in-flight handles remain on one budget after another request resets it',()=>{const pending=get(a);pending.reset();pending.accepted();get(a).reset();const next=get(a);next.accepted();next.placed(true);pending.placed(true);assert.equal(get(a).snapshot().letters,2);assert.equal(stop(get(a)),false);});
test('validated v2 generation is one budget with and without spool header',()=>{const id='telegram-v2-11111111-1111-4111-8111-111111111111';const key=resolveConversation({version:2,id,createdAt:123,cwd:'/fixture'},'openai','/fixture').key;const address=encode('100',id);get(address,key).reset();get(undefined,key).reset();assert(stop(get(address,key)));assert(stop(get(address,key)));assert.equal(stop(get(undefined,key)),false);get(undefined,key).reset();assert(stop(get(address,key)),'normal without-header completion must rearm the same generation');});
test('legacy unknown route remains one previous fallback budget',()=>{get().reset();assert(stop(get()));assert(stop(get('not-json')));assert.equal(stop(get()),false);});
console.log('RESULT',n-bad+'/'+n);process.exitCode=bad?1:0;
