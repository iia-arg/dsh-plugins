import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import vm from 'node:vm';
import {MessageReceipts} from '../src/message-receipts.js';import {extractFunction} from './extract.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-owner-copy-')),out=path.join(root,'out');let mode='owner-all';
const l=new MessageReceipts(path.join(root,'ledger')),source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const c={fs,path,crypto,outMs:(()=>{let p=0;return()=>(p=Math.max(Date.now(),p+1));})(),receipts:l,A2A_OUT:out,deliveryMode:()=>mode,ownerChatId:()=>123,log(){},replyHeader:()=>'',receiptReplyHeader:()=>'',tg:{send(){throw Error('legacy copy must queue, not direct best-effort send')}},};vm.createContext(c);
for(const name of ['writeLegacyOutgoing','sendCopy','sayTo'])if(source.includes('function '+name+'('))vm.runInContext(extractFunction(source,name),c);
try{
 await c.sayTo('a2a','a2a','GOAL_STATUS_END');
 assert(l.db.prepare("SELECT 1 FROM outbox WHERE route='copy-tg' AND body LIKE '%GOAL_STATUS_END%'").get(),'legacy command status written to a2a/out needs durable owner copy');
 c.sendCopy('tg','fixture','LEGACY_REPLY_END');assert(l.db.prepare("SELECT 1 FROM outbox WHERE route='copy-tg' AND body LIKE '%LEGACY_REPLY_END%'").get());
 c.writeLegacyOutgoing(path.join(out,'error.txt'),'LEGACY_ERROR_END');assert(l.db.prepare("SELECT 1 FROM outbox WHERE route='copy-tg' AND body LIKE '%LEGACY_ERROR_END%'").get());
 const n=l.db.prepare('SELECT count(*) AS n FROM outbox').get().n;c.writeLegacyOutgoing(path.join(out,'error.txt'),'LEGACY_ERROR_END');assert.equal(l.db.prepare('SELECT count(*) AS n FROM outbox').get().n,n);
 mode='personal';c.writeLegacyOutgoing(path.join(out,'private.txt'),'PERSONAL_STATUS');assert(!l.db.prepare("SELECT 1 FROM outbox WHERE body LIKE '%PERSONAL_STATUS%'").get());
 console.log('PASS legacy owner-all: real sayTo command status, durable legacy reply, error file copy, stable dedup and personal');
}finally{l.close();fs.rmSync(root,{recursive:true,force:true})}
