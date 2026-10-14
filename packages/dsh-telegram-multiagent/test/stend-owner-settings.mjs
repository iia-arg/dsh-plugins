// RU: Проверяет настоящий owner-контракт на временном ledger: задано, снято, возвращено; боевых сообщений нет.
// EN: Exercises the actual owner contract on a temporary ledger: configured, removed, restored; no live messages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {MessageReceipts} from '../src/message-receipts.js';
import {SiteChannel} from '../src/site-channel.js';
import {GuestCopies} from '../src/guest-channel.js';
import * as guest from '../src/guest-channel.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'owner-settings-'));
const ledger=new MessageReceipts(path.join(root,'ledger'));
let owner=101,extra=false; const logs=[],sent=[];
const copies=new GuestCopies(ledger,{owner:()=>owner,targets:()=>owner?[{kind:'telegram',id:owner}]:extra?[{kind:'telegram',id:101}]:[],sendTelegram:async id=>sent.push(id)});
const state=path.join(root,'closed');
const site=new SiteChannel({ledger,copies,owner:()=>owner,spool:root,state,conversations:{},dispatch:async()=>{},stop:async()=>{},log:s=>logs.push(s)});
const message=id=>({text:'/sss',from:{id},chat:{id,type:'private'}});
try {
  assert.equal((await site.command(message(101))).state,'closed');
  fs.unlinkSync(state); owner=null;
  assert.equal((await site.command(message(101))).state,'denied');
  assert(!fs.existsSync(state)); assert(logs.some(s=>/ownerChatId.*(выключ|disabled)/.test(s)));
  owner=101; assert.equal((await site.command(message(101))).state,'closed');
  assert.equal((await site.command(message(202))).state,'denied');
  const receipt=ledger.receive('owner-probe',Buffer.from('probe'),{route:'site',routeKey:'site-1',hold:false});
  copies.captureSite(receipt,{conversation:1,type:'visitor',kind:'question',text:'probe',reason:''});
  assert.deepEqual(JSON.parse(ledger.db.prepare('SELECT destinations FROM guest_conversations WHERE receipt_id=?').get(receipt.id).destinations),[{kind:'telegram',id:101}]);
  copies.prepare();const queued=ledger.db.prepare("SELECT * FROM outbox WHERE receipt_id=? AND id LIKE 'guest-copy:%'").get(receipt.id);
  await copies.deliver(queued);owner=null;extra=true;await assert.rejects(copies.deliver(queued),/owner/);owner=101;await copies.deliver(queued);assert.deepEqual(sent,[101,101]);
  assert.equal(typeof guest.resolveOwnerId,'function');
  const allowed=new Set([101,202]);
  assert.equal(guest.resolveOwnerId({ownerChatId:101},{},allowed,()=>{}),101);
  assert.equal(guest.resolveOwnerId({ownerChatId:101},{ownerChatId:null},allowed,()=>{}),null);
  assert.equal(guest.resolveOwnerId({ownerChatId:101},{ownerChatId:202},allowed,()=>{}),202);
  assert.equal(guest.resolveOwnerId({}, {ownerChatId:999},allowed,()=>{}),null);
  const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  const line=source.split('\n').find(s=>s.includes('pollReceiptDirectory.koordinator ='));
  for(const value of [undefined,[],['coordinator']]) {
    const context={config:value===undefined?{}:{a2aCoordinatorPrefixes:value},pollReceiptDirectory:()=>{},settings:()=>({}),resolveCoordinatorPrefixes:guest.resolveCoordinatorPrefixes};
    vm.runInNewContext(line,context);
    assert.deepEqual([...context.pollReceiptDirectory.koordinator],value??[]);
  }
  const prefixContext={config:{a2aCoordinatorPrefixes:['profile-coordinator']},settings:()=>({a2aCoordinatorPrefixes:['json-coordinator']}),pollReceiptDirectory:()=>{},resolveCoordinatorPrefixes:guest.resolveCoordinatorPrefixes};
  vm.runInNewContext(line,prefixContext);
  assert.deepEqual([...prefixContext.pollReceiptDirectory.koordinator],['json-coordinator']);
  assert.throws(()=>guest.resolveCoordinatorPrefixes({}, {a2aCoordinatorPrefixes:'invalid'}),/array/);
  assert.throws(()=>guest.resolveCoordinatorPrefixes({a2aCoordinatorPrefixes:['profile-coordinator']},{a2aCoordinatorPrefixes:null}),/array/);
  assert.deepEqual(guest.resolveCoordinatorPrefixes({},{}),[]);
  console.log('PASS owner configured → empty → restored; JSON priority; no implicit coordinator');
} finally {ledger.close();fs.rmSync(root,{recursive:true,force:true});}
