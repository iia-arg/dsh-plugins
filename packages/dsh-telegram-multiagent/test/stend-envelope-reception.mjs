// RU: Изолированный стенд stend-envelope-reception.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-envelope-reception.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as m from '../src/message-receipts.js';
assert.equal(typeof m.migrateReceiptProtocol,'function','K1 migration absent');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'k1-'));let now=1000;const l=new m.MessageReceipts(dir,{now:()=>now});
const header='[a2a-envelope version=2]\n';
const send=(key,meta,body='служебная проба')=>{const raw=Buffer.from(header+JSON.stringify(meta)+'\n'+body);const e=m.mailEnvelope(raw);const r=l.receive(key,raw,{logicalKey:e.logicalKey,expectsReply:e.expectsReply});return {r,result:l.acceptEnvelope(r.id,e.protocol,'workertwo')};};
try{
 const uuid=l.protocolIdentity();assert.match(uuid,/^[a-f0-9-]{36}$/);
 const probe={kind:'capability_probe',delivery_id:'probe1',recipient:{id:'workertwo'},supersedes:{decision_id:'nonexistent'}};
 const p=send('probe1',probe);assert.equal(p.result.action,'terminal');const reply=JSON.parse(l.db.prepare('select body from outbox where receipt_id=?').get(p.r.id).body.split('\n\n').slice(1).join('\n\n'));assert.equal(reply.status,'decision_not_found');assert.equal(reply.ledger_uuid,uuid);
 const decision={kind:'decision',delivery_id:'d1',decision_id:'decision1',recipient:{id:'workertwo',ledger_uuid:uuid},supersedes:{recipient:'workertwo',ledger_uuid:uuid,decision_id:'old'}};
 const held=send('d1',decision,'тестовый текст');assert.equal(held.result.action,'held');assert.equal(l.get(held.r.id).dispatch_started,0);assert.equal(l.db.prepare('select count(*) n from outbox where receipt_id=?').get(held.r.id).n,0,'regression-case: awaiting_cancellation — письма удержания при приёме нет (решает cancelPending)');
 now+=100; l.resolve(held.r.id,'release-text','operator','fixture decision');assert.equal(l.acceptEnvelope(held.r.id,m.mailEnvelope(l.get(held.r.id).raw).protocol,'workertwo').action,'text');assert.equal(l.db.prepare('select hold_duration_ms from protocol_envelopes where receipt_id=?').get(held.r.id).hold_duration_ms,100);
 const d2=send('d2',{...decision,delivery_id:'d2',decision_id:'decision2'});now+=m.ENVELOPE_HOLD_MS;l.holdTick();assert.equal(l.get(d2.r.id).outcome,'envelope_rejected');assert.equal(l.db.prepare('select exit_reason from protocol_envelopes where receipt_id=?').get(d2.r.id).exit_reason,'hold_deadline');
 const wrong=send('wrong',{...probe,delivery_id:'wrong',recipient:{id:'other'}});assert.equal(wrong.result.action,'held');
 assert.deepEqual(m.mailEnvelope(Buffer.from('ordinary')), {logicalKey:null,text:'ordinary',expectsReply:true});
 const probeCount=l.db.prepare('select count(*) n from outbox where receipt_id=?').get(p.r.id).n;
 l.acceptEnvelope(p.r.id,m.mailEnvelope(l.get(p.r.id).raw).protocol,'workertwo');assert.equal(l.db.prepare('select count(*) n from outbox where receipt_id=?').get(p.r.id).n,probeCount);
 const raw=Buffer.from('[a2a-envelope version=3]\n{}\nfixture');const e=m.mailEnvelope(raw);const u=l.receive('unsupported',raw);assert.equal(l.acceptEnvelope(u.id,e.protocol,'workertwo').reason,'unsupported_version');
 const malformed=Buffer.from('[a2a-envelope version=2]\nnot-json\nfixture');const me=m.mailEnvelope(malformed);const mr=l.receive('malformed',malformed);assert.equal(l.acceptEnvelope(mr.id,me.protocol,'workertwo').reason,'invalid_metadata');assert.equal(l.db.prepare("select count(*) n from outbox where receipt_id=? and body like 'УДЕРЖАНО%invalid_metadata%'").get(mr.id).n,1,'regression-case: окончательное удержание при приёме — письмо есть');
 assert.throws(()=>l.resolve(mr.id,'approve-new','op','fixture'),/не допускает/);
 l.resolve(mr.id,'reject-envelope','op','fixture');assert.equal(l.get(mr.id).outcome,'envelope_rejected');
 const again=new m.MessageReceipts(dir,{now:()=>now});assert.equal(again.protocolIdentity(),uuid);again.close();
 console.log('K1 core acceptance PASS: probe, duplicate, hold, release-text, reject, deadline, wrong-recipient, unknown-version, malformed, legacy, UUID reopen');
}finally{l.close();fs.rmSync(dir,{recursive:true,force:true});}
