import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {signCoordinator} from '../src/coordinator-signature.js';
import {evaluateSignedStop,decodeStopPayload} from '../src/mail-stop-protocol.js';
const keys=Object.fromEntries(['z','i','o'].map(k=>[k,generateKeyPairSync('ed25519')]));
const recipients=['zarya','avrora','petrovich','alfa','beta','gamma'];
const trust={version:1,status:'approved',clockSkewMs:0,maxLifetimeMs:120000,
 controlKeys:Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,v.publicKey.export({type:'spki',format:'pem'})])),
 controlPermissions:{z:{principal:'zabava',recipients:['*'],modes:['new']},i:{principal:'iskra',recipients,modes:['pause','new']},o:{principal:'other',recipients:['*'],modes:['new']}},
 returnRoutes:Object.fromEntries(['z','i','o'].map(k=>[k,{recipient:'coord',ledger_uuid:'return',directory:'/fixture/in'}]))};
const payload=(id,recipient,body='')=>'[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-stop/1',delivery_id:id,recipient,ledger_uuid:'ledger',mode:'new',selector:{kind:'primary-a2a'}})+'\n'+body;
const auth=(k,recipient,body='',extra={})=>evaluateSignedStop(signCoordinator(Buffer.from(payload('c-'+k,recipient,body)),{action:'stop',delivery_id:'c-'+k,recipient,ledger_uuid:'ledger',key_id:k,issued_at:1000000,expires_at:1120000},keys[k].privateKey),{recipient,ledger:'ledger',trust,now:1000001,delivery:{delivered_at:1000000,event_id:'arrival'},...extra});
assert.equal(auth('z','marc').allowed,true,'Zabava signed new must be admitted, not invalid_control');
for(const recipient of recipients)assert.equal(auth('i',recipient).allowed,true,recipient);
assert.equal(auth('i','marc').reason,'no_permission');
assert.equal(auth('o','alfa').reason,'no_permission');
const permissive=structuredClone(trust);permissive.controlPermissions.i.recipients=['*'];
assert.equal(auth('i','marc','',{trust:permissive}).reason,'no_permission','wildcard config must not broaden Iskra new ACL');
assert.equal(auth('z','alfa','read disk before work').control.replacement,'read disk before work');
assert.equal(auth('z','alfa','',{now:1120000}).reason,'expired');
assert.throws(()=>decodeStopPayload(Buffer.from(payload('bad','alfa')+'\0')),/invalid_control/);
console.log('PASS new: signed source, exact Iskra six recipients, marc/wildcard/other denied, optional introduction and expiry');
