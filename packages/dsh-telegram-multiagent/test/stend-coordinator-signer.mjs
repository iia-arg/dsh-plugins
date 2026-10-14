// RU: Изолированный стенд stend-coordinator-signer.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-coordinator-signer.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {verifyCoordinator} from '../src/coordinator-signature.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coordinator-signer-'));
const script=new URL('../src/sign-coordinator.mjs',import.meta.url).pathname;
let db;
try{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const key=path.join(dir,'fixture-private.pem');
 fs.writeFileSync(key,privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
 const policy=path.join(dir,'policy.json');fs.writeFileSync(policy,JSON.stringify({status:'pending',maxLifetimeMs:900000}));
 const input=path.join(dir,'input.txt');fs.writeFileSync(input,'подлинное');
 const request={action:'message',delivery_id:'cli-probe',input,key_file:key,key_id:'test',ledger_uuid:'ledger',output:path.join(dir,'signed.txt'),policy_file:policy,recipient:'workerthree'};
 const req=path.join(dir,'request.json');fs.writeFileSync(req,JSON.stringify(request));
 const run=(args=[req])=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:5000});
  assert.equal(run(['--dry-run']).status,2);assert.equal(run().status,2);assert.equal(fs.existsSync(request.output),false);
 fs.writeFileSync(req,JSON.stringify({...request,key_file:0}));const invalid=run();assert.equal(invalid.status,2);assert.match(invalid.stderr,/request fields/);fs.writeFileSync(req,JSON.stringify(request));
 fs.writeFileSync(policy,JSON.stringify({status:'approved',maxLifetimeMs:900000}));
 const result=run();assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).status,'signed_not_delivered');assert.equal(JSON.parse(result.stdout).expires_at-JSON.parse(result.stdout).signed_at,900000);
 db=new DatabaseSync(path.join(dir,'seen.db'));
 const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{test:publicKey.export({format:'pem',type:'spki'})}};
 assert.equal(verifyCoordinator(fs.readFileSync(request.output),{db,trust,recipient:'workerthree',ledger:'ledger'}).trusted,true);
 assert.equal(run().status,2,'existing output must never be overwritten');
 console.log('PASS signer: unknown flag, unapproved policy, approved signing, receiver verification, no overwrite');
}finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
