import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,renameSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {initializeRequestState,readRequestState,readKeyState,publishKeyState,keyFor} from '../src/ostrov-request-state.mjs';
const tmp=mkdtempSync(join(tmpdir(),'b1690-guard-')),ws=join(tmp,'workspace'),dir=join(tmp,'requests');mkdirSync(ws);mkdirSync(dir);
const hash=x=>createHash('sha256').update(x).digest('hex'),digest='a'.repeat(64),oldKey='vp-'+'b'.repeat(48),old={digest,key:oldKey,telegramUpdate:null};let passed=0;
try{
 writeFileSync(join(dir,digest+'.json'),JSON.stringify(old));
 assert.throws(()=>readRequestState(dir,ws),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');passed++;
 const plan=initializeRequestState(dir,ws,{plan:true});assert.equal(plan.legacyCount,1);assert(!existsSync(join(dir,'.request-state.json')));passed++;
 initializeRequestState(dir,ws);let guard=readRequestState(dir,ws);assert(guard.legacyDigests.includes(digest));assert.equal(JSON.parse(readKeyState(guard,digest)).key,oldKey);passed++;
 assert.throws(()=>initializeRequestState(dir,ws),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');passed++;
 const before=hash(readFileSync(join(dir,digest+'.json')));renameSync(join(dir,digest+'.json'),join(tmp,'old.saved'));
 console.log(JSON.stringify({fault:'legacy-key-missing',file_exists:existsSync(join(dir,digest+'.json')),before_sha256:before,legacy_marker:true}));
 assert.throws(()=>readKeyState(guard,digest),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');renameSync(join(tmp,'old.saved'),join(dir,digest+'.json'));assert.equal(hash(readKeyState(guard,digest)),before);passed++;
 const newer='c'.repeat(64),key=keyFor(guard,newer);assert.match(key,/^vp-[a-f0-9]{48}$/);const data={digest:newer,key,telegramUpdate:null};publishKeyState(guard,newer,data);
 assert.equal(JSON.parse(readKeyState(guard,newer)).key,key);passed++;
 // Coherent older state of a post-cutover action: neither local file exists; derived key still identical.
 rmSync(join(dir,newer+'.json'));rmSync(join(dir,'.reservations',newer+'.sha256'));assert.equal(readKeyState(guard,newer),null);assert.equal(keyFor(guard,newer),key);publishKeyState(guard,newer,data);passed++;
 const marker=join(dir,'.reservations',newer+'.sha256'),markerBytes=readFileSync(marker);rmSync(marker);assert.throws(()=>readKeyState(guard,newer),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');writeFileSync(marker,markerBytes);assert.equal(JSON.parse(readKeyState(guard,newer)).key,key);passed++;
 renameSync(dir,dir+'.saved');mkdirSync(dir);assert.throws(()=>readRequestState(dir,ws),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');assert.throws(()=>initializeRequestState(dir,ws),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');rmSync(dir,{recursive:true});renameSync(dir+'.saved',dir);assert.equal(readRequestState(dir,ws).epoch,guard.epoch);passed++;
 const anchor=join(ws,'.ostrov-api-state.json'),bytes=readFileSync(anchor);rmSync(anchor);symlinkSync(join(dir,'.request-state.json'),anchor);assert.throws(()=>readRequestState(dir,ws),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');rmSync(anchor);writeFileSync(anchor,bytes);assert.equal(readRequestState(dir,ws).epoch,guard.epoch);passed++;
 const checksum=join(dir,'.reservations',newer+'.sha256'),checksumBefore=readFileSync(checksum),corrupt=Buffer.from(checksumBefore);corrupt[0]|=128;writeFileSync(checksum,corrupt);
 console.log(JSON.stringify({fault:'checksum-high-bit',before_sha256:hash(checksumBefore),after_sha256:hash(readFileSync(checksum))}));assert.throws(()=>readKeyState(guard,newer),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');writeFileSync(checksum,checksumBefore);assert(readKeyState(guard,newer));passed++;
 const next='d'.repeat(64);assert.throws(()=>publishKeyState({...guard,epoch:'0'.repeat(32)},next,{digest:next,key:keyFor(guard,next),telegramUpdate:null}),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');assert(!existsSync(join(dir,next+'.json')));passed++;
 console.log(JSON.stringify({passed,tests:['uninitialized-refuse','plan-read-only','legacy-bootstrap-preserves-key','no-reinitialize','missing-legacy-refuse-and-restore','new-key-healthy','coherent-old-state-stable-key','missing-reservation-refuse-and-restore','whole-state-loss-refuse-and-restore','symlink-anchor-refuse-and-restore','epoch-change-refuse-before-publish','checksum-corruption-refuse-and-restore']}));
}finally{rmSync(tmp,{recursive:true,force:true})}
