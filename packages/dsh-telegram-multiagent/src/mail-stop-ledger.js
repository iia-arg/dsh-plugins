import {STOP_TERMINAL_MS} from './mail-stop-protocol.js';
import {createHash} from 'node:crypto';

// The ledger reserves effects before await; receipt acquisition and native claim remain shared.
export class MailStopLedger{
 constructor(ledger){
  this.l=ledger;
  const prior=ledger.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='mail_stop_controls'").get();
  if(prior&&!prior.sql.includes("'new'"))ledger.tx(()=>{
   ledger.db.exec('DROP INDEX IF EXISTS one_mail_stop_fence; ALTER TABLE mail_stop_controls RENAME TO mail_stop_controls_before_new');
   ledger.db.exec(prior.sql.replace("mode IN ('pause','replace')","mode IN ('pause','replace','new')"));
   ledger.db.exec('INSERT INTO mail_stop_controls SELECT * FROM mail_stop_controls_before_new; DROP TABLE mail_stop_controls_before_new');
  });
  ledger.db.exec(`CREATE TABLE IF NOT EXISTS mail_stop_controls(
   control_id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL,wire_sha TEXT NOT NULL,key_id TEXT NOT NULL,principal TEXT NOT NULL,
   mode TEXT NOT NULL CHECK(mode IN ('pause','replace','new')),session_id TEXT NOT NULL,session_created INTEGER NOT NULL,target_turn INTEGER,
   generation TEXT NOT NULL,target_json TEXT NOT NULL,binding_json TEXT NOT NULL,control_json TEXT NOT NULL,
   state TEXT NOT NULL CHECK(state IN ('admitted','dispatching','waiting','replacement_permitted','replacement_queued','resuming','unknown','complete','blocked_prior_pause','superseded')),started_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,
   sdk_terminal INTEGER NOT NULL DEFAULT 0,native_terminal INTEGER NOT NULL DEFAULT 0,
   dispatch_count INTEGER NOT NULL DEFAULT 0,resume_proven INTEGER NOT NULL DEFAULT 0,reason TEXT,
   replacement_receipt TEXT,replacement_message TEXT,owner_receipt TEXT,owner_message TEXT);
   CREATE UNIQUE INDEX IF NOT EXISTS one_mail_stop_fence ON mail_stop_controls(session_id,session_created)
    WHERE mode<>'new' AND state IN ('admitted','dispatching','waiting','replacement_permitted','replacement_queued','resuming','unknown');
   CREATE TABLE IF NOT EXISTS mail_stop_backlog(session_id TEXT,session_created INTEGER,message_id TEXT,
    control_id TEXT NOT NULL,PRIMARY KEY(session_id,session_created,message_id));`);
  ledger.db.prepare("UPDATE mail_stop_controls SET state='unknown',reason='process_changed' WHERE generation<>? AND state IN ('admitted','dispatching','waiting','replacement_permitted','replacement_queued','resuming')").run(ledger.owner);
 }
 row(id){return this.l.db.prepare('SELECT * FROM mail_stop_controls WHERE control_id=?').get(id)}
 active(header){return this.l.db.prepare("SELECT * FROM mail_stop_controls WHERE mode<>'new' AND session_id=? AND session_created=? AND state IN ('admitted','dispatching','waiting','replacement_permitted','replacement_queued','resuming','unknown')").get(header.id,header.createdAt)}
 fence(header){return !!this.active(header)}
 admit(auth,receiptId,target,binding){
  if(auth?.verified!==true||auth.allowed!==true||!this.l.get(receiptId))throw Error('not_authorized');
  const id=auth.meta.delivery_id,l=this.l;
  return l.tx(()=>{
   const old=this.row(id);
   if(old){if(old.wire_sha!==auth.wire_sha||old.key_id!==auth.meta.key_id)throw Error('identity_conflict');return {...old,fresh:false}}
   if(this.active({id:target.session_id,createdAt:target.session_created}))throw Error('busy');
   const now=l.now(),deadline=Math.min(now+STOP_TERMINAL_MS,auth.meta.expires_at);
   l.db.prepare(`INSERT INTO mail_stop_controls(control_id,receipt_id,wire_sha,key_id,principal,mode,session_id,session_created,target_turn,
    generation,target_json,binding_json,control_json,state,started_at,deadline_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'admitted',?,?)`).run(id,receiptId,auth.wire_sha,auth.meta.key_id,auth.principal,auth.control.mode,
     target.session_id,target.session_created,target.turn??null,l.owner,JSON.stringify(target),JSON.stringify(binding??{}),JSON.stringify(auth.control),now,deadline);
   l.audit(receiptId,'mail_stop_admitted',JSON.stringify({id,target,deadline}));return {...this.row(id),fresh:true};
  });
 }
 beginDispatch(id){
  return this.l.tx(()=>{
   const changed=this.l.db.prepare("UPDATE mail_stop_controls SET dispatch_count=1,state='dispatching' WHERE control_id=? AND state='admitted' AND dispatch_count=0 AND generation=? AND deadline_at>?").run(id,this.l.owner,this.l.now()).changes;
   if(changed)this.l.audit(this.row(id).receipt_id,'mail_stop_dispatch_intent',id);return changed===1;
  });
 }
 terminal(id,{platform=false,sdk=false}={}){
  const r=this.row(id);if(!r)return false;
  this.l.db.prepare('UPDATE mail_stop_controls SET native_terminal=max(native_terminal,?),sdk_terminal=max(sdk_terminal,?) WHERE control_id=?').run(platform?1:0,sdk?1:0,id);
  const after=this.row(id);return !!(after.native_terminal&&after.sdk_terminal);
 }
 permitReplacement(id){
  return this.l.tx(()=>{
   const won=this.l.db.prepare("UPDATE mail_stop_controls SET state='replacement_permitted',resume_proven=1 WHERE control_id=? AND mode='replace' AND state IN ('admitted','dispatching','waiting') AND native_terminal=1 AND sdk_terminal=1 AND generation=? AND deadline_at>?").run(id,this.l.owner,this.l.now()).changes===1;
   if(won)this.l.audit(this.row(id).receipt_id,'mail_stop_replacement_permit',id);return won;
  });
 }
 unknown(id,reason){
  this.l.db.prepare("UPDATE mail_stop_controls SET state='unknown',reason=? WHERE control_id=? AND state IN ('admitted','dispatching','waiting','replacement_permitted','replacement_queued','resuming','unknown')").run(reason,id);
 }
 complete(id,reason='terminal_confirmed',admission=null){
  const r=this.row(id);if(!r||r.state==='unknown')return false;
  if(r.mode==='replace'){
   const replacement=this.l.get(r.replacement_receipt),sha=replacement?.message_json&&createHash('sha256').update(replacement.message_json).digest('hex');
   if(r.state!=='resuming'||!r.resume_proven||reason!=='replacement_admitted'||!admission||admission.message_id!==r.replacement_message||admission.session_id!==r.session_id||admission.session_created!==r.session_created||!Number.isSafeInteger(admission.turn)||admission.turn===r.target_turn||!Number.isSafeInteger(admission.user_seq)||admission.body_sha!==sha)return false;
   this.l.audit(r.receipt_id,'mail_stop_replacement_admitted',JSON.stringify(admission));
  }
  return this.l.db.prepare("UPDATE mail_stop_controls SET state='complete',reason=? WHERE control_id=? AND native_terminal=1 AND sdk_terminal=1 AND state IN ('admitted','dispatching','waiting','resuming')").run(reason,id).changes===1;
 }
 backlogIds(header){return new Set(this.l.db.prepare('SELECT message_id FROM mail_stop_backlog WHERE session_id=? AND session_created=?').all(header.id,header.createdAt).map(r=>r.message_id))}
 holdBacklog(id,messages){
  const r=this.row(id);if(!r||r.mode!=='replace')return;
  this.l.tx(()=>{for(const message of messages)this.l.db.prepare('INSERT OR IGNORE INTO mail_stop_backlog VALUES(?,?,?,?)').run(r.session_id,r.session_created,message.id,id)});
 }
}
