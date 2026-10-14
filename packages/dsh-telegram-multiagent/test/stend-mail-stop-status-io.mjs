import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {generateKeyPairSync} from 'node:crypto';
import {verifyStopStatus} from '../src/mail-stop-protocol.js';
import {readVerifiedStopStatus} from '../src/read-mail-stop-status.mjs';
let api={};try{api=await import('../src/mail-stop-settings.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
assert.equal(typeof api.loadMailStopSettings,'function','missing protected status signing and routing');
if(process.getuid()!==0){console.log('СЛЕПОТА: protected config test needs root');process.exit(2)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-status-io-'));
try{
 const key=generateKeyPairSync('ed25519'),file=path.join(root,'key.pem'),config=path.join(root,'config.json');
 fs.writeFileSync(file,key.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 fs.writeFileSync(config,JSON.stringify({version:1,recipient:'fixture',status_key_id:'fixture-status',status_key_file:file,arrival_root:root}));
 const settings=api.loadMailStopSettings(config,'fixture'),now=Date.now(),status={control_id:'ctrl',receiver:'fixture',wire_sha:'a'.repeat(64),recipient:'coord-return',ledger_uuid:'reply-ledger',issued_at:now,expires_at:now+60000,state:'denied',reason:'expired'};
 const wire=settings.signStatus(status);assert(verifyStopStatus(wire,{receivers:{'fixture-status':'fixture'},keys:{'fixture-status':key.publicKey.export({type:'spki',format:'pem'})},recipient:'coord-return',ledger:'reply-ledger',expected:{control_id:'ctrl',wire_sha:'a'.repeat(64)}}).verified);
 const route={recipient:'zabavy',ledger_uuid:'reply-ledger',directory:root},target=api.deliverMailStopStatus({id:'one',body:wire.toString('base64')},route);
 const publicTrust=path.join(root,'status-trust.json');fs.writeFileSync(publicTrust,JSON.stringify({version:1,recipient:'coord-return',ledger_uuid:'reply-ledger',receivers:{'fixture-status':'fixture'},keys:{'fixture-status':key.publicKey.export({type:'spki',format:'pem'})}}));
 assert.equal(readVerifiedStopStatus(target,'ctrl','a'.repeat(64),publicTrust).reason,'expired');assert.throws(()=>readVerifiedStopStatus(target,'other','a'.repeat(64),publicTrust),/control_mismatch/);
 assert.equal(fs.readFileSync(target).equals(wire),true);assert.equal(api.deliverMailStopStatus({id:'one',body:wire.toString('base64')},route),target);
 fs.writeFileSync(target,'different');assert.throws(()=>api.deliverMailStopStatus({id:'one',body:wire.toString('base64')},route),/status_delivery_conflict/);
 fs.chmodSync(config,0o666);assert.throws(()=>api.loadMailStopSettings(config,'fixture'),/untrusted/);fs.chmodSync(config,0o644);
 assert.throws(()=>api.loadMailStopSettings(config,'foreign'),/recipient/);
 fs.chmodSync(file,0o644);assert.throws(()=>api.loadMailStopSettings(config,'fixture'),/untrusted/);fs.chmodSync(file,0o600);
 assert.equal(typeof api.loadMailStopSettings(config,'fixture').signStatus,'function');
 console.log('PASS protected signer config/key, exact recipient, signed bytes through outbox, idempotence and conflict');
}finally{fs.rmSync(root,{recursive:true,force:true})}

