// A separate observer remains awake while the receiver does not parse for 150 real seconds.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawn} from 'node:child_process';import {once} from 'node:events';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {MessageReceipts} from '../src/message-receipts.js';
import {ConversationPause} from '../src/conversation-pause.js';
import {MailStopReceiver} from '../src/mail-stop-receiver.js';
import {readStopArrival} from '../src/mail-stop-arrival.js';
import {signCoordinator} from '../src/coordinator-signature.js';
import {signStopStatus,verifyStopStatus} from '../src/mail-stop-protocol.js';
if(process.getuid()!==0){console.log('СЛЕПОТА: observer needs root-owned records');process.exit(2)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-expired-'));
let child,l;
try{
 const inbox=path.join(root,'inbox'),records=path.join(root,'records');fs.mkdirSync(inbox);fs.mkdirSync(records);
 const config=path.join(root,'observer.json');fs.writeFileSync(config,JSON.stringify({root:records,mailboxes:[{recipient:'fixture-agent',directory:inbox}]}));
 child=spawn(process.execPath,[new URL('../src/observe-mail-stop.mjs',import.meta.url).pathname,config],{stdio:['ignore','pipe','pipe']});
 let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
 for(let i=0;i<100&&!output.includes('ready');i++)await new Promise(r=>setTimeout(r,10));
 assert(output.includes('ready'),error||'observer not ready');
 l=new MessageReceipts(path.join(root,'ledger'));
 const pause=new ConversationPause(l,root,()=>{}),coord=generateKeyPairSync('ed25519'),status=generateKeyPairSync('ed25519');
 const pub=k=>k.publicKey.export({type:'spki',format:'pem'});
 const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{coord:pub(coord)},controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['pause','replace']}},returnRoutes:{coord:{recipient:'coord-return',ledger_uuid:'reply-ledger',directory:root}}};
 const at=Date.now(),id='expired-real-control';
 const payload=Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-stop/1',delivery_id:id,recipient:'fixture-agent',ledger_uuid:l.protocolIdentity(),mode:'pause',selector:{kind:'primary-a2a'}})+'\n');
 const raw=signCoordinator(payload,{action:'stop',delivery_id:id,key_id:'coord',recipient:'fixture-agent',ledger_uuid:l.protocolIdentity(),issued_at:at,expires_at:at+120000},coord.privateKey);
 const file=path.join(inbox,'control.txt');fs.writeFileSync(file+'.part',raw);fs.renameSync(file+'.part',file);
 let arrival;for(let i=0;i<100&&!arrival;i++){await new Promise(r=>setTimeout(r,10));arrival=readStopArrival(records,file,raw,'fixture-agent')}
 assert(arrival,'independent arrival was not captured');
 const start=Date.now();console.log(JSON.stringify({stage:'receiver-asleep',observer_pid:child.pid,delivered_at:arrival.delivered_at,ttl_ms:120000,sleep_ms:150000}));
 await new Promise(r=>setTimeout(r,150000));
 const wires=[];let targets=0,alerts=0;
 const receiver=new MailStopReceiver({ledger:l,pause,recipient:'fixture-agent',getTrust:()=>trust,getArrival:(file,bytes)=>readStopArrival(records,file,bytes,'fixture-agent'),resolveTarget:()=>{targets++;throw Error('expired must not select target')},signStatus:s=>signStopStatus(s,'fixture-status',status.privateKey),publishStatus:w=>wires.push(w),alert:()=>alerts++});
 const result=await receiver.handle(raw,{sourcePath:file,sourceKey:'real-expired'});
 assert.equal(result.reason,'expired');assert.equal(targets,0);assert.equal(alerts,0);assert.equal(wires.length,1);
 assert.equal(l.db.prepare('SELECT count(*) n FROM conversation_pauses').get().n,0);
 assert.equal(l.db.prepare('SELECT count(*) n FROM mail_stop_controls').get().n,0);
 const checked=verifyStopStatus(wires[0],{receivers:{'fixture-status':'fixture-agent'},keys:{'fixture-status':pub(status)},recipient:'coord-return',ledger:'reply-ledger',expected:{control_id:id,wire_sha:createHash('sha256').update(raw).digest('hex')}});
 assert.equal(checked.verified,true);assert.equal(checked.status.delivered_at,arrival.delivered_at);
 assert.equal(checked.status.delay_ms,checked.status.processed_at-arrival.delivered_at);assert(checked.status.delay_ms>=150000);
 assert.equal(checked.status.reason,'expired');assert(Date.now()-start>=150000);
 console.log(JSON.stringify({stage:'PASS',delivered_at:checked.status.delivered_at,processed_at:checked.status.processed_at,delay_ms:checked.status.delay_ms,target_selections:targets,pause_rows:0,control_rows:0,signed_statuses:wires.length}));
}finally{
 if(child&&child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}
 l?.close();fs.rmSync(root,{recursive:true,force:true});
}
