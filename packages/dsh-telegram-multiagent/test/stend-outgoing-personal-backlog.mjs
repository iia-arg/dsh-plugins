import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {MessageReceipts} from '../src/message-receipts.js';import {extractFunction} from './extract.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'outgoing-personal-backlog-'));let mode='personal',clock=1000;
let ledger=new MessageReceipts(root,{now:()=>clock,ownerCopyMode:()=>mode});
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
let telegramSends=0;
const context={receipts:ledger,deliveryMode:()=>mode,log:()=>{},Buffer,ownerChatId:()=>123,copyTo:(_o,m)=>m==='owner-all'?'tg':null,copySkipped:()=>{},tg:{send:async()=>telegramSends++}};vm.createContext(context);vm.runInContext(extractFunction(source,'prepareOutgoingCopies'),context);vm.runInContext(extractFunction(source,'deliverReceiptOutbox'),context);
try {
 ledger.addOutbox('private-failed',null,'a2a','SYNTHETIC_PRIVATE_BODY');context.prepareOutgoingCopies();
 await ledger.deliverResults(async()=>{throw Error('synthetic primary outage');});
 assert.equal(ledger.db.prepare('SELECT sent_at FROM outbox WHERE id=?').get('private-failed').sent_at,null);
 const interrupted=ledger.receive('private-interrupted',Buffer.from('ordinary synthetic letter'),{route:'a2a',sender:'fixture',expectsReply:false});ledger.completeLocal(interrupted.id,'interrupted_unknown','');
 const privateStatus=ledger.db.prepare("SELECT id,owner_copy_mode FROM outbox WHERE receipt_id=? AND route='a2a'").get(interrupted.id);assert(privateStatus,'actual interrupted outcome must produce a status');
 assert.equal(privateStatus.owner_copy_mode,'personal','direct interrupted producer must freeze its creation mode too');
 assert.equal(ledger.db.prepare("SELECT count(*) n FROM meta WHERE key LIKE 'outgoing-copy-disabled:%'").get().n,0);
 ledger.close();mode='owner-all';clock=2000;ledger=new MessageReceipts(root,{now:()=>clock,ownerCopyMode:()=>mode});context.receipts=ledger;
 context.prepareOutgoingCopies();assert(!ledger.db.prepare('SELECT id FROM outbox WHERE id=?').get('outgoing-copy:private-failed'),'failed personal body must stay private after restart and owner-all transition');
 assert(!ledger.db.prepare('SELECT id FROM outbox WHERE id=?').get('outgoing-copy:'+privateStatus.id),'private interrupted status must not become visible after restart');
 const privateOwner=ledger.db.prepare("SELECT * FROM outbox WHERE receipt_id=? AND id LIKE 'interrupt-owner:%'").get(interrupted.id);assert.equal(privateOwner.owner_copy_mode,'personal');await context.deliverReceiptOutbox(privateOwner);assert.equal(telegramSends,0,'secondary owner interruption copy created in personal stays disabled');
 const publicInterrupted=ledger.receive('public-interrupted',Buffer.from('ordinary public letter'),{route:'a2a',sender:'fixture',expectsReply:false});ledger.completeLocal(publicInterrupted.id,'interrupted_unknown','');
 const publicStatus=ledger.db.prepare("SELECT id,body,owner_copy_mode FROM outbox WHERE receipt_id=? AND route='a2a'").get(publicInterrupted.id);assert(publicStatus,'new public status must not be folded into an older personal row');assert.equal(publicStatus.owner_copy_mode,'owner-all');assert(!publicStatus.body.includes(interrupted.id),'mode-specific folding must not mix private receipt identifiers into a public status');
 ledger.addOutbox('public-current',null,'a2a','SYNTHETIC_PUBLIC_BODY');context.prepareOutgoingCopies();
 assert(ledger.db.prepare('SELECT id FROM outbox WHERE id=?').get('outgoing-copy:public-current'),'new owner-all output still needs its copy');
 context.prepareOutgoingCopies();assert.equal(ledger.db.prepare("SELECT count(*) n FROM outbox WHERE id='outgoing-copy:public-current'").get().n,1);
 console.log('PASS failed personal primary / restart / owner-all: private0, public1, no new per-row meta');
}finally{ledger.close();fs.rmSync(root,{recursive:true,force:true});}
