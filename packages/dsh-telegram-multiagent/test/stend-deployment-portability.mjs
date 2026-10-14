// RU: Проверяет настоящий ledger/обратный маршрут с явными нейтральными настройками; внешних служб нет.
// EN: Exercises the actual ledger and return route with explicit neutral settings; no external services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {MessageReceipts} from '../src/message-receipts.js';
import {cancellationReturn,deliverCancellationReturn} from '../src/cancellation-return.js';
import {deploymentSettings} from '../src/deployment-settings.js';
import {signCoordinator,TRUST_FILE} from '../src/coordinator-signature.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'deployment-portable-'));
const l=new MessageReceipts(path.join(root,'ledger'),{now:()=>1000000,reviewer:'operator-fixture',coordinatorTrustFile:path.join(root,'policy.json')});
const routes={spoolDir:path.join(root,'spool'),a2aDir:path.join(root,'exchange'),remoteReturnRecipients:{coordinator:'coordinator'},coordinatorReturnRecipient:'coordinator',sharedSenderName:'common-user'};
try {
  const row=l.receive('remote',Buffer.from('message'),{sender:'coordinator',sourcePath:path.join(routes.a2aDir,'in','message.txt'),route:'a2a',hold:false});
  assert.deepEqual(cancellationReturn(row,l,routes),{kind:'remote',recipient:'coordinator'});
  assert.equal(cancellationReturn(row,l,{...routes,remoteReturnRecipients:{}}).kind,'unknown');
  assert.deepEqual(cancellationReturn(row,l,routes),{kind:'remote',recipient:'coordinator'});
  l.audit(row.id,'coordinator_signature_verified');
  assert.deepEqual(cancellationReturn(row,l,{...routes,remoteReturnRecipients:{}}),{kind:'remote',recipient:'coordinator'});
  const held=l.receive('held',Buffer.from('hold'),{hold:true});l.db.prepare("UPDATE receipts SET received_at=0,blocked='dispatch_unknown' WHERE id=?").run(held.id);l.holdTick();
  assert(l.db.prepare("SELECT body FROM outbox WHERE id LIKE '%:held:%'").all().some(x=>x.body.includes('operator-fixture')));
  assert.equal(l.db.prepare("SELECT value FROM meta WHERE key='receipt_reviewer'").get().value,'operator-fixture');
  const keys=generateKeyPairSync('ed25519');fs.writeFileSync(path.join(root,'policy.json'),JSON.stringify({version:1,status:'approved',maxLifetimeMs:60000,clockSkewMs:0,keys:{fixture:keys.publicKey.export({type:'spki',format:'pem'})}}));
  const real=fs.lstatSync;fs.lstatSync=function(file,...args){const stat=real.call(this,file,...args);if(file===path.join(root,'policy.json'))stat.uid=0;return stat;};
  try{const signed=signCoordinator(Buffer.from('body'),{action:'message',delivery_id:'probe',key_id:'fixture',ledger_uuid:l.protocolIdentity(),recipient:'executor',issued_at:1000000,expires_at:1060000},keys.privateKey);assert.equal(l.coordinator(signed,'executor').trusted,true);}finally{fs.lstatSync=real;}
  assert.equal(TRUST_FILE,'');
  const courier=path.join(root,'courier.mjs'),seen=path.join(root,'seen.json');
  fs.writeFileSync(courier,`#!/usr/bin/env node\nimport fs from 'node:fs';fs.writeFileSync(${JSON.stringify(seen)},JSON.stringify({path:process.env.A2A_TELL_DIR}));\n`,{mode:0o700});
  await deliverCancellationReturn({id:'return',body:JSON.stringify({destination:{kind:'remote',recipient:'coordinator'},text:'notice'})},l.root,{...routes,remoteCourier:courier,remoteCourierEnvKey:'A2A_TELL_DIR'});
  assert.equal(JSON.parse(fs.readFileSync(seen,'utf8')).path,path.join(routes.a2aDir,'tell'));
  for(const key of ['pauseStateRoot','siteSpoolDir','siteStateFile'])assert.throws(()=>deploymentSettings({workspace:root},{[key]:''}),/absolute/);
  assert.throws(()=>deploymentSettings({workspace:root},{remoteCourierEnvKey:'A2A_ZERKALO'}),/reserved/);
  console.log('PASS explicit remote mapping/withdrawal/recovery, configured trust and reviewer, neutral courier environment');
} finally {l.close();fs.rmSync(root,{recursive:true,force:true});}
