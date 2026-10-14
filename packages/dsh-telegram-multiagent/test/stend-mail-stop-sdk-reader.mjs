import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';import {CodexTaskControl} from '../src/codex-task-control.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-sdk-reader-'));let l;
try{
 l=new MessageReceipts(path.join(root,'ledger'),{owner:'fixture-process'});const control=new CodexTaskControl(l,'fixture');
 assert.equal(typeof control.capture,'function','missing exact SDK request observer');
 const session={id:'fixture-session',header:{createdAt:10},events:[{type:'turn/start',data:{turn:7}}]};const agent={session,status:'running'};
 const lease=control.attach(agent,'http://127.0.0.1:1',{allowCancel:false,allowMessage:false,terminal:true});
 assert.equal(lease.descriptor.terminal,1);assert(lease.descriptor.operations.includes('stop-exact'));assert.equal(typeof lease.taskEvent,'function');
 const ready={type:'task-status',state:'ready',binding:lease.descriptor.binding,request_id:lease.descriptor.request_id,codex:{generation:'fixture-server',thread_id:'fixture-thread',turn_id:'fixture-turn'}};
 await lease.taskEvent(ready);const binding=control.capture(agent);assert.equal(binding.request_id,lease.descriptor.request_id);assert.equal(binding.sdk_turn_id,'fixture-turn');
 const waiting=control.waitTerminal(binding);
 await assert.rejects(()=>lease.taskEvent({...ready,state:'terminal',codex:{...ready.codex,turn_id:'other-turn',status:'completed'}}),/invalid_terminal/);
 await lease.taskEvent({...ready,state:'terminal',codex:{...ready.codex,status:'interrupted',proof:'fixture-exact-result'}});
  assert.equal(await waiting,true);assert.equal(control.capture(agent),null,'a terminal-seen lease cannot be captured for a new stop while native is running');assert.equal((await control.stopExact(agent,'late-stop',binding)).state,'unknown');lease.close();assert.equal(await control.waitTerminal(binding),true,'terminal fact survives transport close');
 const next=control.attach(agent,'http://127.0.0.1:1',{allowCancel:false,allowMessage:false,terminal:true});await next.taskEvent({...ready,binding:next.descriptor.binding,request_id:next.descriptor.request_id});const b2=control.capture(agent);const unknown=control.waitTerminal(b2);next.close();assert.equal(await unknown,false,'close without SDK event is unknown');
 assert.equal(control.absent(agent),false,'an unresolved request cannot prove remote idle');
 const retry=control.attach(agent,'http://127.0.0.1:1',{terminal:true,allowCancel:false,allowMessage:false});const frame={...ready,binding:retry.descriptor.binding,request_id:retry.descriptor.request_id};await retry.taskEvent(frame);await retry.taskEvent({...frame,codex:{...frame.codex,thread_id:'retry-thread',turn_id:'retry-turn'}});assert.equal(control.capture(agent).sdk_turn_id,'retry-turn','ordinary SDK retry before any control intent can establish its new exact lease');control.mailControls={store:{active:()=>({control_id:'reserved'})}};await assert.rejects(()=>retry.taskEvent({...frame,codex:{...frame.codex,thread_id:'third-thread',turn_id:'third-turn'}}),/invalid_terminal_ready/);retry.close();
 console.log('PASS stop-only exact ready/terminal, wrong tuple rejected, evidence after close, closed query unknown');
}finally{l?.close();fs.rmSync(root,{recursive:true,force:true})}
