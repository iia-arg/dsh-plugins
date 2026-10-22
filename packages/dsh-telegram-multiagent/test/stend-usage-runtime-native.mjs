// Real DSH session/inbox/flush; no LLM or service manager.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts,receiptFacts} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';import {CodexTaskControl} from '../src/codex-task-control.js';import {UsageRuntime} from '../src/usage-runtime.js';import {podnyatPlatformu02} from './platforma-02.mjs';
import {policyFixture} from './usage-runtime-policy-fixture.mjs';
const policy=policyFixture();
const root=fs.mkdtempSync(path.join(os.tmpdir(),'usage-r-native-'));let l,j;
try{
 const p=await podnyatPlatformu02({root:path.join(root,'platform')});const native=await p.sozdatAgenta('native-usage');l=new MessageReceipts(path.join(root,'ledger'));j=new UsageRuntime(l,'sova',{heartbeatMs:0,policyPath:policy.file});const rt=new ReceiptRuntime(l,p.sessions,()=>{});const c=new CodexTaskControl(l,'sova');c.usage=j;
 const mail='f'.repeat(64);const r=l.receive('ap-notice','not exported',{logicalKey:'ap-notice:'+mail,route:'ap-notice'});l.prepare(r.id,()=>({id:'native-message',role:'user',content:[]}),native.session,'autopilot-team');await l.queue(r.id,{contains:id=>rt.contains(native.session,id),send:m=>native.inbox.append('next-turn',m),flush:async()=>true});native.session.append('turn/start',{turn:1});native.inbox.claim('next-turn',1);await rt.observe(native.session);
 const a={session:native.session,status:'running'};const lease=c.attach(a,'http://127.0.0.1:7891',{terminal:false});lease.close();native.session.append('turn/end',{turn:1,reason:{kind:'completed'}});await rt.observe(native.session);j.observe(native.session);j.watermark();await j.flush();assert.equal(j.failure,null);
 const rs=fs.readFileSync(j.file,'utf8').trim().split('\n').map(JSON.parse);const req=rs.find(x=>x.kind==='runtime_request');const claimed=receiptFacts(native.session,['native-message']).get('native-message').claims[0];assert.equal(req.claimedAt,claimed.time);assert.equal(req.claimedAt,l.get(r.id).claimed_at);assert.equal(req.requestId,lease.descriptor.request_id);assert.equal(req.turn,1);assert.deepEqual(req.deliveryIds,[mail]);assert.equal(req.sessionCreated,native.session.header.createdAt);assert.ok(rs.some(x=>x.kind==='runtime_turn'&&Number.isSafeInteger(x.finishedAt)));
 console.log('PASS real DSH Agent/inbox claim/session flush -> R actual turn/request/delivery; no model');
}finally{policy.close();await j?.close();try{l?.close()}catch{}fs.rmSync(root,{recursive:true,force:true})}
