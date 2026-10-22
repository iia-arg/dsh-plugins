// Regression for false file/keyring attribution: config/read is NOT cached AuthManager storage.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {GatewayUsage} from '../usage-producer.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'usage-auth-'));let g;
try{
 const file=path.join(root,'facts');g=new GatewayUsage({file,engine:'codex',descriptor:{request_id:'request',binding:{generation:'R',session_id:'s',session_created:42,turn:1,recipient:'master'}},heartbeatMs:0});
 const calls=[];const client={async zapros(method){calls.push(method);return method==='config/read'?{config:{cli_auth_credentials_store:'file'}}:{account:{type:'chatgpt',email:'PRIVATE'}}}};
 g.codexSpawn({CODEX_HOME:root});await g.codexInitialized(client,{cwd:'/different/project'});g.codexFinished();await g.close();
 assert.deepEqual(calls,['account/read'],'only account/read is authorised; config/read is not an identity proof');const rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);const auth=rows.filter(r=>r.kind==='auth');assert.ok(auth.length);assert.ok(auth.every(r=>r.accountRef===null&&r.reason==='SUBSCRIPTION_UNBOUND'&&r.detail==='ACCOUNT_READ_SCHEMA_INVALID'));assert.ok(!JSON.stringify(rows).includes('PRIVATE'));console.log('PASS authorised account/read without identity -> named unbound; no config RPC or private field retention');
}finally{await g?.close();fs.rmSync(root,{recursive:true,force:true})}
