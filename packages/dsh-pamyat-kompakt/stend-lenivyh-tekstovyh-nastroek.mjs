// RU: Импорт не читает необязательный JSON; EACCES/битый JSON отказывают только сжатие, после возврата тот же процесс работает.
// EN: Import does not read optional JSON; EACCES/malformed JSON refuse compaction only, and the same process recovers after repair.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kompakt-lazy-')),entry=new URL('./index.mjs',import.meta.url).pathname;
function run(kind){
 const d=fs.mkdtempSync(path.join(root,'case-')),file=path.join(d,'deployment.json');
 fs.writeFileSync(file,kind==='syntax'?'fixture-invalid-json':JSON.stringify({promptSubstitutions:{exampleHost:'fixture-host'}}));
 if(kind==='permission')fs.chmodSync(file,0);
 const env={...process.env,HOME:d,KOMPAKT_AGENT:'',KOMPAKT_RAZMESCHENIE:file,KOMPAKT_API_KEY:'fixture-only',KOMPAKT_OTKAZY:path.join(d,'refusal'),KOMPAKT_UDACHI:path.join(d,'success')}; // vorota-ob:dopusk=TOKEN
 delete env.KOMPAKT_NASTROJKI_KATALOG;
 const code=`let calls=0,imported=false,error=null,restored=null;globalThis.fetch=async(_u,o)=>{calls++;return{ok:true,status:200,json:async()=>({choices:[{message:{content:'[MODE=DIALOG]\\n\\nfixture summary'}}]}),text:async()=>''}};try{const m=await import(${JSON.stringify(entry)});imported=true;try{await m.svodkaNashejModelyu('fixture input')}catch(e){error=e.message}const fs=await import('node:fs');fs.chmodSync(${JSON.stringify(file)},0o600);fs.writeFileSync(${JSON.stringify(file)},'{}');try{await m.svodkaNashejModelyu('fixture input');restored=true}catch(e){restored=e.message}}catch(e){error=e.message}console.log('RESULT '+JSON.stringify({imported,error,restored,calls}));`;
 try{const child=spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8',timeout:20000});assert.equal(child.status,0,child.stderr);const line=child.stdout.split('\n').find(l=>l.startsWith('RESULT '));assert(line);return JSON.parse(line.slice(7));}finally{fs.chmodSync(file,0o600);}
}
try{
 // RU: Под root chmod 0 не запрещает чтение — EACCES не получить, проба permission слепа: она не выполняется и итог — код 2 (аудит A-N-1948 №12), а не трасса с кодом 1.
 // EN: Under root chmod 0 does not deny reading — EACCES cannot occur, so the permission probe is blind: it is skipped and the result is exit 2 (audit A-N-1948 #12), not a stack trace with exit 1.
 const podRoot=process.getuid?.()===0;
 for(const kind of podRoot?['syntax']:['permission','syntax']){const r=run(kind);assert.equal(r.imported,true,kind+' blocks import');assert(r.error&&r.error.includes('размещение компакта'),kind+' must name compaction failure');if(kind==='permission')assert(r.error.includes('EACCES'));assert.equal(r.restored,true,kind+' failed to recover');assert.equal(r.calls,1,kind+' calls provider on corrupted JSON');console.log('PASS '+kind+' import/refusal/recovery');}
 // RU: D-умолчание снимается отдельно от JSON, новым импортом porogi на фикстуре readFileSync.
 // EN: Observe the D default independently of JSON using a fresh thresholds import with a file-read fixture.
 const code=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';let seen=null;const originalRead=fs.readFileSync;fs.readFileSync=(p,...args)=>{if(String(p).endsWith('/worker.json')){seen=String(p);throw Error('fixture read')}return originalRead(p,...args)};syncBuiltinESMExports();const m=await import(${JSON.stringify(new URL('./porogi.mjs',import.meta.url).pathname)});m.chitatPorogD('worker');console.log('RESULT '+JSON.stringify({seen}));`;
 const env={...process.env};delete env.KOMPAKT_NASTROJKI_KATALOG;env.KOMPAKT_RAZMESCHENIE='/nonexistent/fixture-lazy.json';const child=spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8',timeout:10000});assert.equal(child.status,0,child.stderr);const seen=JSON.parse(child.stdout.split('\n').find(l=>l.startsWith('RESULT ')).slice(7)).seen;
 assert.equal(seen,'/etc/dsh-pamyat/agenty/worker.json');console.log('PASS legacy D default without deployment JSON');if(podRoot){console.log('СЛЕПОТА стенда: проба permission не выполнена — под root chmod 0 не запрещает чтение; запустите стенд от обычной учётки');console.log(JSON.stringify({passed:2,total:3,blind:1}));process.exitCode=2;}else console.log(JSON.stringify({passed:3,total:3}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
