// B-N-1590: the status reader must bind each key to the one receiver it may sign for. A shared trust store {X,Y} must not accept
// a status of agent Y signed with X's key; Y's own key is accepted; a trust store without the binding is refused (fail closed).
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {generateKeyPairSync} from 'node:crypto';
import {signStopStatus} from '../src/mail-stop-protocol.js';import {readVerifiedStopStatus} from '../src/read-mail-stop-status.mjs';
if(process.getuid()!==0){console.log('СЛЕПОТА: the reader accepts only a root-owned trust store — run as root');process.exit(2)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-status-trust-'));const results=[];
const probe=(name,fn)=>{fn();results.push(name);console.log('PASS',name)};
try{
 const kx=generateKeyPairSync('ed25519'),ky=generateKeyPairSync('ed25519'),pub=k=>k.publicKey.export({type:'spki',format:'pem'}),now=Date.now();
 const keys={'status-x':pub(kx),'status-y':pub(ky)},base={version:1,recipient:'coord-return',ledger_uuid:'reply-ledger'};
 const trust=(name,value)=>{const f=path.join(root,name+'.json');fs.writeFileSync(f,JSON.stringify(value),{mode:0o644});return f};
 const shared=trust('shared',{...base,keys,receivers:{'status-x':'agent-x','status-y':'agent-y'}});
 const legacy=trust('legacy',{...base,keys});
 const partial=trust('partial',{...base,keys,receivers:{'status-y':'agent-y'}});
 const status=(receiver,keyId,key,id)=>{const f=path.join(root,id+'.status');fs.writeFileSync(f,signStopStatus({control_id:id,server_id:'srv',receiver,recipient:'coord-return',ledger_uuid:'reply-ledger',state:'paused',reason:'idle_existing_session',wire_sha:'b'.repeat(64),issued_at:now-1000,expires_at:now+600000},keyId,key.privateKey));return f};
 const forged=status('agent-y','status-x',kx,'forged'),own=status('agent-y','status-y',ky,'own');
 probe('legacy (the trust format before 2.5.79) trust without key-receiver binding — refused even for the forged status',()=>assert.throws(()=>readVerifiedStopStatus(forged,'forged','b'.repeat(64),legacy),/status_trust_unavailable/));
 probe('forged: status of agent-y signed with agent-x key, shared trust — refused',()=>assert.throws(()=>readVerifiedStopStatus(forged,'forged','b'.repeat(64),shared),/key_receiver_mismatch/));
 probe('own: status of agent-y signed with its own key, shared trust — accepted',()=>assert.equal(readVerifiedStopStatus(own,'own','b'.repeat(64),shared).receiver,'agent-y'));
 probe('binding missing for one key — trust refused',()=>assert.throws(()=>readVerifiedStopStatus(own,'own','b'.repeat(64),partial),/status_trust_unavailable/));
 console.log('PASS status trust: '+results.length+' of 4');
}finally{fs.rmSync(root,{recursive:true,force:true})}
