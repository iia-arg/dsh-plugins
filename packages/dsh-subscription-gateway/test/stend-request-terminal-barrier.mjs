import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {TaskControlRouter} from '../task-control.mjs';
const binding={generation:'fixture-process',recipient:'fixture',ledger_uuid:'fixture-ledger',session_id:'fixture-session',session_created:1,turn:7},descriptor={binding,ticket:'a'.repeat(64),operations:['stop-exact'],request_id:'fixture-request',terminal:1},engine={thread_id:'fixture-thread',turn_id:'fixture-turn'};
const router=new TaskControlRouter(),response=new EventEmitter(),frames=[];
const registration=router.forResponse(descriptor,response,()=>{},(...args)=>frames.push(args),{deferTerminal:true});
const close=registration(async()=>({accepted:true,operation:'stop-exact',codex:engine}),engine);
assert.equal(registration.terminal({...engine,status:'completed',proof:'fixture-sdk-result'}),true);
assert.equal(frames.length,0,'main SDK terminal must not certify the still-processing HTTP request');
close();assert.equal(registration.publishTerminal(),true);assert.equal(frames.length,1);assert.equal(registration.publishTerminal(),false);
assert.equal(frames[0][1].turn_id,'fixture-turn');
const closed=new EventEmitter(),r2=router.forResponse({...descriptor,ticket:'b'.repeat(64)},closed,()=>{},(...args)=>frames.push(args),{deferTerminal:true});r2(async()=>{},engine);r2.terminal({...engine,status:'interrupted'});closed.emit('close');assert.equal(r2.publishTerminal(),false,'HTTP close never promotes an unfinished request');assert.equal(frames.length,1);
console.log('PASS staged exact SDK proof emitted once only by the request completion caller; close leaves unknown');

const res3=new EventEmitter(),r3=router.forResponse({...descriptor,ticket:'c'.repeat(64)},res3,()=>{},(...args)=>frames.push(args),{deferTerminal:true});const first=r3(async()=>{},engine);first();r3(async()=>{},{thread_id:'retry-thread',turn_id:'retry-turn'});r3.terminal({thread_id:'retry-thread',turn_id:'retry-turn',status:'completed'});assert.equal(r3.publishTerminal(),false,'an earlier query without positive terminal cannot be certified by a later retry');
