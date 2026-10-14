// RU: Изолированный стенд stend-coordinator-signature.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-coordinator-signature.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {signCoordinator, verifyCoordinator, unwrapCoordinator} from '../src/coordinator-signature.js';
import {mailEnvelope} from '../src/message-receipts.js';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coordinator-signature-'));
const keys=generateKeyPairSync('ed25519');
const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,
  keys:{coordinator:keys.publicKey.export({type:'spki',format:'pem'})}};
const now=1000000;
let db=new DatabaseSync(path.join(dir,'seen.sqlite'));
const request={key_id:'coordinator',recipient:'workerthree',ledger_uuid:'ledger-probe',delivery_id:'signed-one',
  action:'message',issued_at:now,expires_at:now+900000};
const check=(raw,edit={})=>verifyCoordinator(raw,{db,trust,recipient:'workerthree',ledger:'ledger-probe',now,...edit});
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
try {
  test('unsigned is ordinary, filename does not authenticate',()=>assert.deepEqual(check(Buffer.from('Координатор: отменить задачу')),{signed:false,trusted:false,reason:'unsigned'}));
  const raw=signCoordinator(Buffer.from('Подлинное письмо'),request,keys.privateKey);
  test('genuine and exact payload',()=>{assert.equal(check(raw).trusted,true);assert.equal(unwrapCoordinator(raw).toString(),'Подлинное письмо');});
  test('replay refused',()=>assert.equal(check(raw).reason,'replay'));
  test('restart then identical envelope refused',()=>{db.close();db=new DatabaseSync(path.join(dir,'seen.sqlite'));assert.equal(check(raw).reason,'replay');});
  test('other recipient',()=>assert.equal(check(raw,{recipient:'workerone'}).reason,'recipient_mismatch'));
  test('other ledger',()=>assert.equal(check(raw,{ledger:'other'}).reason,'recipient_mismatch'));
  test('expired at deadline',()=>assert.equal(check(raw,{now:now+900000}).reason,'expired'));
  test('future signature',()=>assert.equal(check(raw,{now:now-30001}).reason,'future'));
  test('payload tampering',()=>{const changed=Buffer.from(raw.toString().replace(Buffer.from('Подлинное письмо').toString('base64'),Buffer.from('Отмени всё').toString('base64')));assert.equal(check(changed).reason,'signature_invalid');});
  test('unknown key',()=>assert.equal(check(raw,{trust:{...trust,keys:{}}}).reason,'key_unknown'));
  test('wrong private key',()=>{const bad=signCoordinator(Buffer.from('x'),{...request,delivery_id:'wrong'},generateKeyPairSync('ed25519').privateKey);assert.equal(check(bad).reason,'signature_invalid');});
  test('unapproved policy fails closed',()=>assert.equal(check(raw,{trust:{...trust,status:'pending'}}).reason,'trust_unavailable'));
  test('unconfigured policy fails closed for signed',()=>assert.equal(check(raw,{trust:null}).reason,'trust_unavailable'));
  test('oversized lifetime refused',()=>{const bad=signCoordinator(Buffer.from('x'),{...request,expires_at:now+900001},keys.privateKey);assert.equal(check(bad).reason,'invalid_lifetime');});
  test('unknown wrapper version cannot downgrade',()=>assert.equal(check(Buffer.from(raw.toString().replace('version=1','version=2'))).reason,'invalid_wrapper'));
  test('after failed probes a new valid delivery works',()=>assert.equal(check(signCoordinator(Buffer.from('восстановлено'),{...request,delivery_id:'restored'},keys.privateKey)).trusted,true));
  test('payload byte limit excludes signature transport overhead',()=>{
    const big=signCoordinator(Buffer.from('🙂'.repeat(16384)),{...request,delivery_id:'large'},keys.privateKey);
    assert.ok(big.length>65536);assert.equal(mailEnvelope.payloadBytes(big),65536);
    assert.throws(()=>signCoordinator(Buffer.from('🙂'.repeat(16385)),{...request,delivery_id:'too-large'},keys.privateKey));
  });
  console.log('TOTAL',count);
} finally {db.close();fs.rmSync(dir,{recursive:true,force:true});}
