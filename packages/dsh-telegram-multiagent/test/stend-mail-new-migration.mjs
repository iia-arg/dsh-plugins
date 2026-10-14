import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';import {MailStopLedger} from '../src/mail-stop-ledger.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-new-migrate-'));const l=new MessageReceipts(root);
try{
 // Frozen pre-new schema from telegram2.5.91/599731e; independent of the current constructor.
 l.db.exec(`CREATE TABLE IF NOT EXISTS mail_stop_controls(
   control_id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL,wire_sha TEXT NOT NULL,key_id TEXT NOT NULL,principal TEXT NOT NULL,
   mode TEXT NOT NULL CHECK(mode IN ('pause','replace')),session_id TEXT NOT NULL,session_created INTEGER NOT NULL,target_turn INTEGER,
   generation TEXT NOT NULL,target_json TEXT NOT NULL,binding_json TEXT NOT NULL,control_json TEXT NOT NULL,
   state TEXT NOT NULL CHECK(state IN ('admitted','dispatching','waiting','replacement_permitted','replacement_queued','resuming','unknown','complete','blocked_prior_pause','superseded')),started_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,
   sdk_terminal INTEGER NOT NULL DEFAULT 0,native_terminal INTEGER NOT NULL DEFAULT 0,
   dispatch_count INTEGER NOT NULL DEFAULT 0,resume_proven INTEGER NOT NULL DEFAULT 0,reason TEXT,
   replacement_receipt TEXT,replacement_message TEXT,owner_receipt TEXT,owner_message TEXT);
   CREATE UNIQUE INDEX IF NOT EXISTS one_mail_stop_fence ON mail_stop_controls(session_id,session_created)
    WHERE state IN ('admitted','dispatching','waiting','replacement_permitted','replacement_queued','resuming','unknown');
   CREATE TABLE IF NOT EXISTS mail_stop_backlog(session_id TEXT,session_created INTEGER,message_id TEXT,
    control_id TEXT NOT NULL,PRIMARY KEY(session_id,session_created,message_id));`);
 const receipt=l.receive('pause-original',Buffer.from('fixture'),{route:'a2a'});
 const auth={verified:true,allowed:true,wire_sha:'a'.repeat(64),principal:'zabava',meta:{delivery_id:'old-pause',key_id:'coord',expires_at:l.now()+120000},control:{mode:'pause'}};
 const target={session_id:'s',session_created:1,turn:17};
 const original={control_id:'old-pause',receipt_id:receipt.id,wire_sha:'a'.repeat(64),key_id:'coord',principal:'zabava',
  mode:'pause',session_id:'s',session_created:1,target_turn:17,generation:l.owner,
  target_json:JSON.stringify(target),binding_json:'{"fixture":"preserve"}',control_json:'{"mode":"pause"}',
  state:'admitted',started_at:l.now(),deadline_at:l.now()+30000,sdk_terminal:0,native_terminal:0,
  dispatch_count:1,resume_proven:1,reason:'fixture-before-new',replacement_receipt:'replacement-receipt',
  replacement_message:'replacement-message',owner_receipt:'owner-receipt',owner_message:'owner-message'};
 const columns=Object.keys(original);const insert=l.db.prepare(`INSERT INTO mail_stop_controls(${columns.join(',')}) VALUES(${columns.map(name=>'@'+name).join(',')})`);
 insert.run(original);
 assert.throws(()=>insert.run({...original,control_id:'unsupported-before',mode:'new'}),/CHECK constraint failed/,'fixture must reject new before migration');
 const before=l.db.prepare('SELECT * FROM mail_stop_controls WHERE control_id=?').get('old-pause');
 assert.equal(l.db.prepare('SELECT control_id FROM mail_stop_controls WHERE session_id=? AND session_created=? AND state=?').get('s',1,'admitted').control_id,'old-pause');
 const current=new MailStopLedger(l);assert.deepEqual(l.db.prepare('SELECT * FROM mail_stop_controls WHERE control_id=?').get('old-pause'),before,'all populated old columns must survive CHECK migration');assert(current.fence({id:'s',createdAt:1}),'old active stop remains a fence');
 current.terminal('old-pause',{platform:true,sdk:true});current.complete('old-pause');const next=l.receive('new-command',Buffer.from('fixture'),{route:'a2a'});current.admit({...auth,meta:{...auth.meta,delivery_id:'new-control'},control:{mode:'new'}},next.id,target,{fixture:'new'});assert(!current.fence({id:'s',createdAt:1}),'new rotation reservation is not a stop fence');
 const index=l.db.prepare("SELECT sql FROM sqlite_master WHERE name='one_mail_stop_fence'").get().sql;assert(index.includes("mode<>'new'"));new MailStopLedger(l);assert.equal(l.db.prepare('SELECT count(*) n FROM mail_stop_controls').get().n,2,'repeat migration preserves both named controls');assert.deepEqual(l.db.prepare('SELECT control_id FROM mail_stop_controls ORDER BY control_id').all().map(x=>x.control_id),['new-control','old-pause']);
 console.log('PASS populated old CHECK migration, repeat idempotence, old fence retained, new control excluded');
}finally{l.close();fs.rmSync(root,{recursive:true,force:true});}
