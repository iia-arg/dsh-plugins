import assert from 'node:assert/strict';
import * as stop from '../src/telegram-stop.js';
import {ustanovitIstochnikPomoshchnika} from '../src/message-receipts.js';
assert.equal(typeof stop.stopKeepingContext,'function','missing common stop kernel');
ustanovitIstochnikPomoshchnika(()=>({sobytiyaSessii:s=>s.events}));
function fixture(){
 const calls=[],listeners=[];
 const session={id:'fixture-session',header:{id:'fixture-session',createdAt:1},events:[{type:'turn/start',data:{turn:7}}],requestHeader:()=>({config:{provider:'claude-oauth',model:'gpt-fixture'}})};
 const agent={session,status:'running',ctx:{on:(_,fn)=>{listeners.push(fn);return()=>{};}},cancel(cause,options){calls.push(['cancel',cause,options]);session.events.push({type:'turn/end',data:{turn:7}});agent.status='idle';for(const fn of listeners)fn(session,session.events.at(-1));},whenIdle:async()=>{}};
 return {agent,calls};
}
const a=fixture();
const completed=await stop.stopKeepingContext({findAgent:()=>a.agent,pause:()=>a.calls.push(['pause']),stopRemote:async()=>{a.calls.push(['remote']);return{state:'interrupting'}},
 waitTerminal:async()=>{a.calls.push(['terminal']);assert.equal(a.agent.status,'running','native cancellation must not close terminal reader');return true;},settleMs:5});
assert.equal(completed.state,'stopped');assert.deepEqual(a.calls.map(x=>x[0]),['pause','remote','terminal','cancel']);assert.deepEqual(a.calls.at(-1)[2],{keepInbox:true});
const b=fixture();
const held=await stop.stopKeepingContext({findAgent:()=>b.agent,pause:()=>b.calls.push(['pause']),stopRemote:async()=>({state:'interrupting'}),waitTerminal:async()=>false,settleMs:5});
assert.equal(held.state,'unknown');assert.equal(b.agent.status,'running');assert.equal(b.calls.some(x=>x[0]==='cancel'),false);
const c=fixture();
const changed=await stop.stopKeepingContext({findAgent:()=>c.agent,pause:()=>{},stopRemote:async()=>({state:'interrupting'}),waitTerminal:async()=>{c.agent.session={...c.agent.session,id:'new-session'};return true;},settleMs:5});
assert.equal(changed.state,'unknown');assert.equal(c.calls.length,0);
const d=fixture();
const beforeRpc=await stop.stopKeepingContext({findAgent:()=>d.agent,pause:async()=>{d.agent.session={...d.agent.session,id:'new-before-rpc'};},stopRemote:async()=>{d.calls.push(['remote']);return{state:'interrupting'}},waitTerminal:async()=>true});
assert.equal(beforeRpc.state,'unknown');assert.equal(d.calls.length,0,'mail stop must not call remote on a new target after pause await');
console.log('PASS shared kernel: exact terminal before native cancel, timeout hold, changed target refused');
