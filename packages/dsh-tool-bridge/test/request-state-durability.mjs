import assert from 'node:assert/strict';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {initializeRequestState,readRequestState,publishKeyState,readKeyState,keyFor} from '../src/ostrov-request-state.mjs';
const dir=fs.mkdtempSync(join(tmpdir(),'b1690-durable-')),workspace=join(dir,'work'),state=join(dir,'state');fs.mkdirSync(workspace);fs.mkdirSync(state);
const original=fs.fsyncSync;let calls=0;
try{
 initializeRequestState(state,workspace);const guard=readRequestState(state,workspace),digest='e'.repeat(64);publishKeyState(guard,digest,{digest,key:keyFor(guard,digest),telegramUpdate:null});
 fs.fsyncSync=fd=>{calls++;return original(fd)};syncBuiltinESMExports();readKeyState(guard,digest);assert(calls>=5,'successful reader returned before file+marker+directories durability barrier');
 fs.fsyncSync=()=>{throw Error('injected-fsync-failure')};syncBuiltinESMExports();assert.throws(()=>readKeyState(guard,digest),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');
 fs.fsyncSync=original;syncBuiltinESMExports();assert(readKeyState(guard,digest));console.log(JSON.stringify({passed:true,reader_fsync_calls:calls,fault:'fsync failure refused',restored:'read succeeds'}));
}finally{fs.fsyncSync=original;syncBuiltinESMExports();fs.rmSync(dir,{recursive:true,force:true})}
