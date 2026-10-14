import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {generateKeyPairSync} from 'node:crypto';
import {evaluateSignedStop} from '../src/mail-stop-protocol.js';
let api={};try{api=await import('../src/send-mail-stop.mjs')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
assert.equal(typeof api.prepareSignedStop,'function','missing signed stop sender');
if(process.getuid()!==0){console.log('СЛЕПОТА: sender trust fixture needs root-owned config');process.exit(2)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-sender-'));
try{
 const key=generateKeyPairSync('ed25519'),pub=key.publicKey.export({type:'spki',format:'pem'}),file=path.join(root,'key.pem'),config=path.join(root,'sender.json');
 fs.writeFileSync(file,key.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});fs.writeFileSync(config,JSON.stringify({version:1,key_id:'coord',key_file:file,modes:['pause','replace'],recipients:{fixture:{ledger_uuid:'fixture-ledger',directory:'/opt/fixture/a2a/in'}}}));
 const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{coord:pub},controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['pause','replace']}},returnRoutes:{coord:{recipient:'zabavy',ledger_uuid:'reply-ledger',directory:root}}};
 for(const mode of ['pause','replace']){
  const made=api.prepareSignedStop(config,'fixture',mode,mode==='replace'?'New task':'' ,{now:1000000});
  const result=evaluateSignedStop(made.wire,{trust,recipient:'fixture',ledger:'fixture-ledger',now:1000001,delivery:{delivered_at:1000000,event_id:'fixture-publication'}});
  assert.equal(result.allowed,true);assert.equal(result.control.mode,mode);assert.equal(result.meta.expires_at,1120000);assert.equal(made.control_id,result.meta.delivery_id);
 }
 assert.throws(()=>api.prepareSignedStop(config,'foreign','pause',''),/recipient/);
 assert.throws(()=>api.prepareSignedStop(config,'fixture','pause','unwanted'),/body/);
 assert.throws(()=>api.prepareSignedStop(config,'fixture','replace',''),/body/);
 assert.throws(()=>api.prepareSignedStop(config,'fixture','dry-run',''),/mode/);
 fs.chmodSync(config,0o666);assert.throws(()=>api.prepareSignedStop(config,'fixture','pause',''),/untrusted/);fs.chmodSync(config,0o644);
 assert.equal(api.prepareSignedStop(config,'fixture','pause','').mode,'pause');
 assert.equal(api.prepareSignedStop(config,'fixture','pause','').host,'sadik');
 const base=JSON.parse(fs.readFileSync(config,'utf8'));for(const [host,ok] of [['aclaude',true],['-oProxyCommand=x',false],[5,false]]){fs.writeFileSync(config,JSON.stringify({...base,host}));if(ok)assert.equal(api.prepareSignedStop(config,'fixture','pause','').host,host);else assert.throws(()=>api.prepareSignedStop(config,'fixture','pause',''),/untrusted/)}
 fs.writeFileSync(config,'PRIVATE-FIXTURE');const rejected=spawnSync(process.execPath,[new URL('../src/send-mail-stop.mjs',import.meta.url).pathname,'--recipient','fixture','--mode','pause'],{env:{...process.env,DSH_MAIL_STOP_CONFIG:config},encoding:'utf8'});assert.equal(rejected.status,2);assert.equal(rejected.stderr.includes('PRIVATE-FIXTURE'),false,'configuration parser errors must not print input values');
 console.log('PASS protected sender, exact receiver/ledger/action, both modes, TTL120, unknown fields/body/mode refusal, ssh host from config (default sadik)');
}finally{fs.rmSync(root,{recursive:true,force:true})}
