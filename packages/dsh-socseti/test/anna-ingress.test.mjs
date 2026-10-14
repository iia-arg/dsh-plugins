import './approval-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Store} from '../src/store.mjs';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anna-ingress-'));const s=new Store(dir,{telegram:'-202',vk:'123',instagram:'456',threads:'789'},{profile:'anna',now:()=>Date.parse('2026-10-13T02:00:00Z')});t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true})});return s}
const event=n=>({platform:'vk',account_id:'123',provider_id:'event-'+n,kind:'dm',conversation_id:'dialog-42',subject_id:'person-99',text:'Вопрос 🌊 '+n});
// Break caught: total-history quota incorrectly blocks intake with an empty pending queue.
test('delivered history no longer occupies Anna pending quota',t=>{const s=fixture(t);for(let n=0;n<1000;n++)s.ingestEvent('anna',event(n));s.db.exec("UPDATE outbox SET state='delivered'");assert.equal(s.ingestEvent('anna',event(1000)).duplicate,false);assert.equal(s.db.prepare('SELECT count(*) n FROM events').get().n,1001)});
// Break caught: duplicate provider event creates two private deliveries/cards.
test('one incoming event durably creates one Anna delivery and one card request',t=>{const s=fixture(t);const a=s.ingestEvent('anna',event(1));assert.equal(s.ingestEvent('anna',event(1)).duplicate,true);const rows=s.db.prepare('SELECT kind,payload_json FROM outbox WHERE aggregate_id=? ORDER BY kind').all(a.event_id);assert.deepEqual(rows.map(r=>r.kind),['anna_event','event_card_request']);const envelope=JSON.parse(rows[0].payload_json);assert.equal(envelope.recipient,'anna');assert.equal(envelope.trust,'external_untrusted_data');assert.equal(envelope.memory,'socseti_private_only');assert.equal(JSON.parse(rows[1].payload_json).event_token,undefined)});
// Break caught: cursor is advanced despite failure of the second durable event.
test('batch commit and cursor are atomic; failure rolls back all then restoration succeeds',t=>{
 const s=fixture(t);assert.equal(typeof s.ingestBatch,'function','durable ingress/cursor boundary missing');
 const batch={source:'vk:123',expectedCursor:null,cursor:'101',events:[event(1),event(2)]};
 s.db.exec("CREATE TRIGGER ingress_fault BEFORE INSERT ON events WHEN NEW.provider_id='event-2' BEGIN SELECT RAISE(ABORT,'injected durable failure'); END");assert.equal(s.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='ingress_fault'").get().n,1);
 assert.throws(()=>s.ingestBatch('anna',batch),/injected durable failure/);assert.equal(s.db.prepare('SELECT count(*) n FROM events').get().n,0);assert.equal(s.cursor('vk:123'),null);
 s.db.exec('DROP TRIGGER ingress_fault');assert.equal(s.ingestBatch('anna',batch).accepted,2);assert.equal(s.cursor('vk:123'),'101');assert.equal(s.ingestBatch('anna',batch).replayed,true);assert.equal(s.db.prepare('SELECT count(*) n FROM outbox').get().n,4);
 assert.throws(()=>s.ingestBatch('anna',{...batch,events:[event(3)]}),/conflict/);assert.throws(()=>s.ingestBatch('anna',{...batch,cursor:'102'}),/conflict/);assert.equal(s.cursor('vk:123'),'101');
});
// Break caught: wrong subject or empty cursor is committed / one event quota counted twice.
test('pending cap stops ingress at 30000 and frees only after both deliveries finish',t=>{
 const s=fixture(t);s.ingestEvent('anna',event(0));
 s.db.exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<29998) INSERT INTO events SELECT 'seed-'||x,platform,'seed-'||x,key_id,'hash-'||x,account_id,kind,conversation_id,subject_id,text,created_at,expires_at FROM events,n WHERE events.provider_id='event-0';
 INSERT INTO outbox SELECT 'private-'||id,'anna_event',id,1,'{}','held_no_private_route',created_at FROM events WHERE id LIKE 'seed-%';
 INSERT INTO outbox SELECT 'card-'||id,'event_card_request',id,1,'{}','held_stage1',created_at FROM events WHERE id LIKE 'seed-%';`);
 assert.equal(s.ingestEvent('anna',event(29999)).duplicate,false);assert.throws(()=>s.ingestEvent('anna',event(30000)),/capacity/);
 s.db.prepare("UPDATE outbox SET state='delivered' WHERE kind='anna_event' AND aggregate_id=?").run('seed-1');assert.throws(()=>s.ingestEvent('anna',event(30000)),/capacity/);
 s.db.prepare("UPDATE outbox SET state='tg_sent' WHERE kind='event_card_request' AND aggregate_id=?").run('seed-1');assert.equal(s.ingestEvent('anna',event(30000)).duplicate,false);
});
