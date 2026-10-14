// RU: Проверка stend-ingress-key-file: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-ingress-key-file verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {readIngressKey} from '../ingress-auth.mjs';
const d=fs.mkdtempSync(path.join(os.tmpdir(),'ingress-file-'));const f=path.join(d,'key');
try{
 fs.writeFileSync(f,'a'.repeat(64),{mode:0o600});assert.equal(readIngressKey(f),'a'.repeat(64));
 fs.chmodSync(f,0o644);assert.throws(()=>readIngressKey(f),/owner\/mode/);fs.chmodSync(f,0o600);
 const symlink=path.join(d,'link');fs.symlinkSync(f,symlink);assert.throws(()=>readIngressKey(symlink));
 const fifo=path.join(d,'fifo');execFileSync('mkfifo',[fifo]);const start=Date.now();assert.throws(()=>readIngressKey(fifo),/type rejected/);assert(Date.now()-start<1000,'FIFO must not block');
 fs.writeFileSync(f,'x');assert.throws(()=>readIngressKey(f),/32 random bytes/);
 fs.writeFileSync(f,'a'.repeat(300));assert.throws(()=>readIngressKey(f),/type rejected/);
 assert.throws(()=>readIngressKey(path.join(d,'missing')),/ENOENT/);assert.throws(()=>readIngressKey(undefined),/absolute path/);
 console.log('PASS valid key, mode, symlink, FIFO nonblocking, malformed, oversized, missing, unset');
}finally{fs.rmSync(d,{recursive:true,force:true})}
