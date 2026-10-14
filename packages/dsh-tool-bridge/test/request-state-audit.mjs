import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {initializeRequestState,readRequestState,publishKeyState,keyFor,auditRequestState} from '../src/ostrov-request-state.mjs';
const temp=mkdtempSync(join(tmpdir(),'b1690-audit-')),ws=join(temp,'work'),dir=join(temp,'keys');mkdirSync(ws);mkdirSync(dir);
try{
 initializeRequestState(dir,ws);const g=readRequestState(dir,ws),digest='1'.repeat(64);publishKeyState(g,digest,{digest,key:keyFor(g,digest),telegramUpdate:null});assert.equal(auditRequestState(dir,ws).keyCount,1);
 const p=join(dir,digest+'.json'),saved=readFileSync(p);rmSync(p);assert.throws(()=>auditRequestState(dir,ws),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');writeFileSync(p,saved);assert.equal(auditRequestState(dir,ws).keyCount,1);
 const unreserved='2'.repeat(64);writeFileSync(join(dir,unreserved+'.json'),JSON.stringify({digest:unreserved,key:keyFor(g,unreserved),telegramUpdate:null}));assert.throws(()=>auditRequestState(dir,ws),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');rmSync(join(dir,unreserved+'.json'));assert.equal(auditRequestState(dir,ws).keyCount,1);
 console.log(JSON.stringify({passed:3,tests:['audit-healthy','audit-missing-key-refuses-and-restores','audit-unreserved-key-refuses-and-restores']}));
}finally{rmSync(temp,{recursive:true,force:true})}
