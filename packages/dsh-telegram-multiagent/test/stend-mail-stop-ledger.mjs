import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';
let api={};try{api=await import('../src/mail-stop-ledger.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
assert.equal(typeof api.MailStopLedger,'function','missing durable control fence');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-ledger-'));let l;
try{
 let now=1000000;l=new MessageReceipts(path.join(root,'ledger'),{now:()=>now,owner:'process-one'});const store=new api.MailStopLedger(l);
 const target={session_id:'fixture-session',session_created:10,turn:3};
 const auth={verified:true,allowed:true,wire_sha:'a'.repeat(64),principal:'zabava',meta:{delivery_id:'control-one',key_id:'coord',expires_at:1120000},control:{mode:'replace',replacement:'new task'},delivered_at:1000000,processed_at:1000000};
 const receipt=l.receive('fixture',Buffer.from('fixture'));
 const admitted=store.admit(auth,receipt.id,target,{request_id:'request-one',sdk_thread_id:'thread-one',sdk_turn_id:'turn-one'});
 assert.equal(admitted.fresh,true);assert.equal(store.fence({id:'fixture-session',createdAt:10}),true);
 assert.equal(store.admit(auth,receipt.id,target,{}).fresh,false);
 assert.throws(()=>store.admit({...auth,wire_sha:'b'.repeat(64)},receipt.id,target,{}),/identity_conflict/);
 assert.throws(()=>store.admit({...auth,meta:{...auth.meta,delivery_id:'other-control'}},receipt.id,target,{}),/busy/);
 assert.equal(store.beginDispatch('control-one'),true);assert.equal(store.beginDispatch('control-one'),false);
 assert.equal(store.terminal('control-one',{platform:true,sdk:false}),false);
 assert.equal(store.permitReplacement('control-one'),false);
 assert.equal(store.terminal('control-one',{platform:false,sdk:true}),true);
 assert.equal(store.complete('control-one'),false,'replace cannot free fence using terminal bits before input admission');
 assert.equal(store.permitReplacement('control-one'),true);
 assert.equal(store.permitReplacement('control-one'),false,'replacement authorization is a single CAS');
 store.unknown('control-one','lost_after_permit');assert.equal(store.fence({id:'fixture-session',createdAt:10}),true);
 now+=40000;store.terminal('control-one',{platform:true,sdk:true});assert.equal(store.permitReplacement('control-one'),false,'late terminal must not resume unknown');
 l.owner='process-two';const restarted=new api.MailStopLedger(l);assert.equal(restarted.row('control-one').state,'unknown');assert.equal(restarted.beginDispatch('control-one'),false);
 assert.equal(restarted.fence({id:'fixture-session',createdAt:11}),false,'fence is exact generation');
 assert.throws(()=>restarted.admit({...auth,verified:false},receipt.id,target,{}),/not_authorized/);
 console.log('PASS durable exact fence, duplicate/conflict/busy, one dispatch, both terminal, one permit, unknown and restart hold');
}finally{l?.close();fs.rmSync(root,{recursive:true,force:true})}
