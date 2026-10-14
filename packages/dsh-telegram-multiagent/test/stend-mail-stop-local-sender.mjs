import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync,execFileSync} from 'node:child_process';import {generateKeyPairSync} from 'node:crypto';
import {evaluateSignedStop} from '../src/mail-stop-protocol.js';
if(process.getuid()!==0){console.log('СЛЕПОТА: local sender fixture needs root-owned key/config');process.exit(2)}
// A-N-1948 №24: получатель фикстуры — учётка coders; её нет (машина не sadik) — СЛЕПОТА, код 2, а не исключение execFileSync с кодом 1.
let uid,gid;try{uid=Number(execFileSync('id',['-u','coders'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));gid=Number(execFileSync('id',['-g','coders'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));}catch{console.log('СЛЕПОТА: нет учётки coders — фикстуре нужен непривилегированный получатель');process.exit(2)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-local-'));
try{
 fs.chownSync(root,0,gid);fs.chmodSync(root,0o750);
 // Root-owned key/config stay protected; the mailbox path belongs to the unprivileged recipient.
 const home=path.join(root,'home');fs.mkdirSync(home);fs.chownSync(home,uid,gid);fs.chmodSync(home,0o750);
 const inbox=path.join(home,'in');fs.mkdirSync(inbox);fs.chownSync(inbox,uid,gid);fs.chmodSync(inbox,0o770);
 const pair=generateKeyPairSync('ed25519'),key=path.join(root,'key.pem'),config=path.join(root,'sender.json');
 fs.writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o640});fs.chownSync(key,0,gid);
 fs.writeFileSync(config,JSON.stringify({version:1,key_id:'fixture-iskra',key_file:key,modes:['pause'],transport:'local',recipients:{fixture:{directory:inbox,ledger_uuid:'fixture-ledger'}}}));
 const command=['--no-new-privs','--reuid='+uid,'--regid='+gid,'--clear-groups',process.execPath,new URL('../src/send-mail-stop.mjs',import.meta.url).pathname,'--recipient','fixture','--mode','pause'];
 const run=spawnSync('setpriv',command,{env:{...process.env,DSH_MAIL_STOP_CONFIG:config},encoding:'utf8'});assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout);assert.equal(result.stage,'placed');
 const files=fs.readdirSync(inbox);assert.equal(files.length,1);const file=path.join(inbox,files[0]);assert.equal(fs.statSync(file).uid,uid,'unprivileged local sender does not change owner');
 const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{'fixture-iskra':pair.publicKey.export({type:'spki',format:'pem'})},controlPermissions:{'fixture-iskra':{principal:'iskra',recipients:['*'],modes:['pause']}},returnRoutes:{'fixture-iskra':{recipient:'iskra',ledger_uuid:'return-ledger',directory:root}}};
 const auth=evaluateSignedStop(fs.readFileSync(file),{trust,recipient:'fixture',ledger:'fixture-ledger',delivery:{delivered_at:Date.now(),event_id:'local-publication'}});assert.equal(auth.allowed,true);assert.equal(auth.principal,'iskra');
 console.log('PASS local signed Iskra pause from unprivileged actor with NoNewPrivs1, without sudo/scp/ssh');
}finally{fs.rmSync(root,{recursive:true,force:true})}
