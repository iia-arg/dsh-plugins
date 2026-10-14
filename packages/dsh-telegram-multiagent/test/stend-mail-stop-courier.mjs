import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {generateKeyPairSync} from 'node:crypto';
import {evaluateSignedStop} from '../src/mail-stop-protocol.js';
if(process.getuid()!==0){console.log('СЛЕПОТА: courier fixture needs root-owned signer config');process.exit(2)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-courier-'));
try{
 const bin=path.join(root,'bin'),courier=path.join(root,'courier'),capture=path.join(root,'capture');fs.mkdirSync(bin);fs.mkdirSync(courier);
 for(const name of ['iskra-tell','coder-tell'])fs.copyFileSync(new URL('../courier/'+name,import.meta.url),path.join(courier,name));
 for(const name of ['zarya-tell','avrora-tell'])fs.symlinkSync('iskra-tell',path.join(courier,name));
 fs.writeFileSync(path.join(bin,'scp'),'#!/usr/bin/env python3\nimport os,sys,shutil\nshutil.copyfile(sys.argv[-2],os.environ["CAPTURE"])\n',{mode:0o755});
 fs.writeFileSync(path.join(bin,'ssh'),'#!/usr/bin/env python3\nimport sys,shlex\ns=sys.argv[-1]\na=shlex.split(s)\nif a[:4]==["sudo","-n","python3","-"]:\n sys.stdin.read()\n print("положено: "+a[4]+"/"+a[6])\nelse:print("доставлено: /fixture/mail.txt")\n',{mode:0o755});
 fs.writeFileSync(path.join(bin,'logger'),'#!/bin/sh\nexit 0\n',{mode:0o755});
 const key=generateKeyPairSync('ed25519'),keyfile=path.join(root,'key.pem'),config=path.join(root,'config.json'),body=path.join(root,'body.txt');fs.writeFileSync(body,'NEW TASK');fs.writeFileSync(keyfile,key.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const recipients=Object.fromEntries(['beta','zarya','avrora'].map(n=>[n,{directory:'/opt/'+n+'/a2a/in',ledger_uuid:'ledger-'+n}]));
 fs.writeFileSync(config,JSON.stringify({version:1,key_id:'coord',key_file:keyfile,modes:['pause','replace'],recipients}));
 const env={...process.env,PATH:bin+':'+process.env.PATH,CAPTURE:capture,OT:'fixture',DSH_MAIL_STOP_CONFIG:config,DSH_MAIL_STOP_SENDER:new URL('../src/send-mail-stop.mjs',import.meta.url).pathname};
 const run=(name,args)=>spawnSync(path.join(courier,name),args,{env,encoding:'utf8'});
 for(const [name,args,recipient,mode] of [['coder-tell',['beta','--stop-pause'],'beta','pause'],['coder-tell',['beta','--stop-replace','-f',body],'beta','replace'],['zarya-tell',['--stop-pause'],'zarya','pause'],['avrora-tell',['--stop-replace','-f',body],'avrora','replace']]){
  const r=run(name,args);assert.equal(r.status,0,r.stderr);const raw=fs.readFileSync(capture),trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{coord:key.publicKey.export({type:'spki',format:'pem'})},controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['pause','replace']}},returnRoutes:{coord:{recipient:'zabavy',ledger_uuid:'reply-ledger',directory:root}}};
  const result=evaluateSignedStop(raw,{trust,recipient,ledger:'ledger-'+recipient,delivery:{delivered_at:Date.now(),event_id:'fixture-transport'}});assert.equal(result.allowed,true);assert.equal(result.control.mode,mode);assert.equal(result.control.replacement,mode==='replace'?'NEW TASK':'');assert.equal(JSON.parse(r.stdout).stage,'placed');
 }
 fs.unlinkSync(capture);for(const args of [['beta','--dry-run'],['beta','--stop-pause','--dry-run'],['beta','--stop-replace'],['beta','--stop-replace','-f',body,'extra']]){assert.equal(run('coder-tell',args).status,2);assert.equal(fs.existsSync(capture),false)}
 const old=run('coder-tell',['beta','-f',body]);assert.equal(old.status,0,old.stderr);assert(fs.readFileSync(capture,'utf8').startsWith('[delivery-v1 id='),'ordinary courier envelope unchanged');
 console.log('PASS sender wrappers both modes/four addresses, preserved exact signed wire, bad arguments no transport, ordinary delivery-v1 retained');
}finally{fs.rmSync(root,{recursive:true,force:true})}
