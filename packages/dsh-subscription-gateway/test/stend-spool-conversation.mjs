// B-N-2009: actual local publisher. Distinguishes destination in bytes and delivery identity.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import nodeCrypto from 'node:crypto';import assert from 'node:assert/strict';import {extractFunction} from './extract.mjs';
const source=fs.readFileSync(process.env.STEND_GATEWAY_SOURCE||new URL('../gateway.mjs',import.meta.url),'utf8');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gateway-spool-'));let bad=0,n=0;
const scope=vm.createContext({fs,os,path,nodeCrypto,YASHCHIK:dir,log(){}});const publish=vm.runInContext('('+extractFunction(source,'polozhitProdolzhenie')+')',scope);
try{
 for(const [name,key] of [['group continuation','-1004442041878'],['group B','-1004442041878'],['guest B','gost-123'],['private','100'],['service','a2a-2']]){
  n++;try{const address=Buffer.from(JSON.stringify({key,session_id:'telegram-'+key,session_created:123})).toString('base64url');const before=new Set(fs.readdirSync(dir));assert.equal(publish('SAME TEXT 🙂',name,address),true);const file=fs.readdirSync(dir).find(f=>!before.has(f));const text=fs.readFileSync(path.join(dir,file),'utf8');assert.match(text,/^\[delivery-v1 id=[a-f0-9]{64} reply=no\]\n/);assert(text.includes('[spool-conversation-v1 '+address+']\n'));assert.equal(fs.lstatSync(path.join(dir,file)).uid,process.getuid());console.log('PASS',name);}catch(e){bad++;console.log('FAIL',name,e.message);}
 }
 const ids=fs.readdirSync(dir).map(f=>fs.readFileSync(path.join(dir,f),'utf8').split('\n')[0]);n++;try{assert.equal(new Set(ids).size,4,'same text in distinct destinations must not deduplicate');console.log('PASS identity across destinations');}catch(e){bad++;console.log('FAIL identity',e.message);}
 n++;try{const before=new Set(fs.readdirSync(dir));publish('LEGACY');const file=fs.readdirSync(dir).find(f=>!before.has(f));assert(!fs.readFileSync(path.join(dir,file),'utf8').includes('spool-conversation'));console.log('PASS legacy');}catch(e){bad++;console.log('FAIL legacy',e.message);}
 console.log('RESULT',n-bad+'/'+n);process.exitCode=bad?1:0;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
