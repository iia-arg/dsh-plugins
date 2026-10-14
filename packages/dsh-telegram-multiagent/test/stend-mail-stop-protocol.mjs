import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {signCoordinator,verifyCoordinator} from '../src/coordinator-signature.js';
let api={};try{api=await import('../src/mail-stop-protocol.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
assert.equal(typeof api.evaluateSignedStop,'function','missing stop authorization after pure crypto');
const keys=Object.fromEntries(['coord','iskra','other','status'].map(id=>[id,generateKeyPairSync('ed25519')]));
const pub=k=>keys[k].publicKey.export({type:'spki',format:'pem'});
const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{coord:pub('coord'),iskra:pub('iskra'),other:pub('other')},
 controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['pause','replace']},iskra:{principal:'iskra',recipients:['*'],modes:['pause']},other:{principal:'fixture-other',recipients:['*'],modes:['pause','replace']}},
 returnRoutes:{coord:{recipient:'coord-return',ledger_uuid:'return-ledger',directory:'/fixture/coord'},iskra:{recipient:'iskra-return',ledger_uuid:'return-ledger',directory:'/fixture/iskra'},other:{recipient:'other-return',ledger_uuid:'return-ledger',directory:'/fixture/other'}}};
const frame={kind:'task-stop/1',delivery_id:'fixture-control',recipient:'fixture-agent',ledger_uuid:'fixture-ledger',mode:'pause',selector:{kind:'primary-a2a'}};
const outer={action:'stop',delivery_id:'fixture-control',recipient:'fixture-agent',ledger_uuid:'fixture-ledger',issued_at:1000000,expires_at:1120000};
const wire=(key='coord',change={},meta={})=>signCoordinator(Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({...frame,...change})+'\n'+(change.mode==='replace'?'fixture replacement':'')),{...outer,...meta,key_id:key},keys[key].privateKey);
const options={trust,recipient:'fixture-agent',ledger:'fixture-ledger',now:1010000,delivery:{delivered_at:1001000,event_id:'transport-event'}};
assert.equal(api.evaluateSignedStop(wire(),options).allowed,true);
assert.equal(api.evaluateSignedStop(wire('coord',{mode:'replace'}),options).allowed,true);
assert.equal(api.evaluateSignedStop(wire('iskra'),options).allowed,true);
assert.equal(api.evaluateSignedStop(wire('iskra',{mode:'replace'}),options).reason,'no_permission');
assert.equal(api.evaluateSignedStop(wire('other'),options).reason,'no_permission');
const denied=api.evaluateSignedStop(wire(),{...options,trust:{...trust,controlPermissions:{}}});
assert.equal(denied.verified,true);assert.equal(denied.reason,'no_permission');assert.equal(denied.returnRoute.directory,'/fixture/coord');
const expired=api.evaluateSignedStop(wire(),{...options,now:1150000});
assert.equal(expired.verified,true);assert.equal(expired.allowed,false);assert.equal(expired.reason,'expired');
assert.equal(expired.delivered_at,1001000);assert.equal(expired.processed_at,1150000);assert.equal(expired.delay_ms,149000);
assert.equal(api.evaluateSignedStop(wire(),{...options,delivery:null}).reason,'delivery_unobserved');
// B-N-2017: часы шагнули назад между прибытием и проверкой — допуск trust.clockSkewMs (30000): на 1 с и ровно на границе принято,
// на skew+1 с — отказ; отрицательная отметка — отказ, как прежде. EN: a clock step back within clockSkewMs is accepted, beyond it refused.
const nazad1=api.evaluateSignedStop(wire(),{...options,delivery:{delivered_at:options.now+1000,event_id:'transport-event'}});
assert.equal(nazad1.allowed,true,JSON.stringify(nazad1.reason));assert.equal(nazad1.delay_ms,-1000);
assert.equal(api.evaluateSignedStop(wire(),{...options,delivery:{delivered_at:options.now+trust.clockSkewMs,event_id:'transport-event'}}).allowed,true,'граница допуска включительно');
assert.equal(api.evaluateSignedStop(wire(),{...options,delivery:{delivered_at:options.now+trust.clockSkewMs+1000,event_id:'transport-event'}}).reason,'delivery_observation_invalid');
assert.equal(api.evaluateSignedStop(wire(),{...options,delivery:{delivered_at:-1,event_id:'transport-event'}}).reason,'delivery_observation_invalid');
assert.equal(api.evaluateSignedStop(wire('coord',{delivery_id:'different'}),options).reason,'action_or_id_mismatch');
assert.equal(api.evaluateSignedStop(wire('coord',{recipient:'different'}),options).reason,'recipient_mismatch');
assert.equal(api.evaluateSignedStop(wire('coord',{reply_to:'/attacker'}),options).reason,'invalid_control');
assert.equal(api.evaluateSignedStop(Buffer.from('unsigned control'),options).verified,false);
const status={control_id:'fixture-control',server_id:'receiver-audit',receiver:'fixture-agent',recipient:'coord-return',ledger_uuid:'return-ledger',state:'denied',reason:'expired',wire_sha:'a'.repeat(64),delivered_at:1001000,processed_at:1150000,issued_at:1150000,expires_at:1210000};
const signed=api.signStopStatus(status,'fixture-status',keys.status.privateKey);
assert.equal(api.verifyStopStatus(signed,{receivers:{'fixture-status':'fixture-agent'},keys:{'fixture-status':pub('status')},recipient:'coord-return',ledger:'return-ledger',now:1150000}).verified,true);
const corrupt=Buffer.from(signed);corrupt[corrupt.indexOf(Buffer.from('expired'))]='X'.charCodeAt(0);
assert.equal(api.verifyStopStatus(corrupt,{receivers:{'fixture-status':'fixture-agent'},keys:{'fixture-status':pub('status')},recipient:'coord-return',ledger:'return-ledger',now:1150000}).verified,false);
assert.equal(api.verifyStopStatus(signed,{receivers:{'fixture-status':'fixture-agent'},keys:{'fixture-status':pub('status')},recipient:'different',ledger:'return-ledger',now:1150000}).verified,false);
console.log('PASS stop ACL, authenticated refusals, delivery delay, expiry, fixed reply route and signed status');

assert.equal(api.verifyStopStatus(signed,{receivers:{'fixture-status':'fixture-agent'},keys:{'fixture-status':pub('status')},recipient:'coord-return',ledger:'return-ledger',now:1150000,expected:{control_id:'another-control',wire_sha:'a'.repeat(64)}}).reason,'control_mismatch');
assert.equal(api.verifyStopStatus(signed,{receivers:{'fixture-status':'fixture-agent'},keys:{'fixture-status':pub('status')},recipient:'coord-return',ledger:'return-ledger',now:1150000,expected:{control_id:'fixture-control',wire_sha:'b'.repeat(64)}}).reason,'control_mismatch');

const splitTrust={...trust,keys:{coord:pub('coord'),other:pub('other')},controlKeys:{iskra:pub('iskra')}};assert.equal(api.evaluateSignedStop(wire('iskra'),{...options,trust:splitTrust}).allowed,true,'control-only Iskra key must authenticate pause');const ordinary=signCoordinator(Buffer.from('/goal unexpected'),{...outer,action:'goal',key_id:'iskra'},keys.iskra.privateKey);assert.equal(verifyCoordinator(ordinary,{trust:splitTrust,recipient:'fixture-agent',ledger:'fixture-ledger',now:1010000,db:{exec(){throw Error('control-only key cannot reach ordinary replay table')}}}).reason,'key_unknown','stop key must not grant general coordinator privileges');
