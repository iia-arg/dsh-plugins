// RU: Проверка stend-compact-without-images: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-compact-without-images verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.

import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {compactMcpHistory} from '../image-history.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'compact-plain-'));
for(const key of Object.keys(process.env))if(key.startsWith('KOMPAKT_'))delete process.env[key];
Object.assign(process.env,{KOMPAKT_HVOST:'3',KOMPAKT_MIN_PROZA:'1000000',KOMPAKT_OTKAZY:tmp+'/bad',KOMPAKT_UDACHI:tmp+'/good'});
const {fizicheskiyKompakt}=await import(new URL('./fixtures/compaction-module.mjs',import.meta.url));
const source=fs.readFileSync(new URL('../gateway.mjs',import.meta.url),'utf8');
const start=source.indexOf('      try {\n        const it = POSTAVSHCHIK'),end=source.indexOf('\n    }\n    // Anthropic принимает',start);assert(start>=0&&end>start);
const run=new Function('POSTAVSHCHIK','compactMcpHistory','fizicheskiyKompakt','putSessii','sid','body','WORK_DIR','zanjatoPoslednee','bridgeName','STUPEN_SESSII','log','return (async()=>{'+source.slice(start,end)+'})()');
const rows=Array.from({length:10},(_,i)=>({type:i%2?'assistant':'user',uuid:'original-'+i,parentUuid:i?'original-'+(i-1):null,message:{role:i%2?'assistant':'user',content:'plain fixture message '+i}}));
const input=rows.map(JSON.stringify).join('\n')+'\n';const control=path.join(tmp,'control.jsonl'),candidate=path.join(tmp,'candidate.jsonl');fs.writeFileSync(control,input);fs.writeFileSync(candidate,input);
const logs=[],steps=new Map([['fixture',2]]);let cleanupTempOpens=0;const open=fs.openSync;
try{
 const before=await fizicheskiyKompakt(control,'fixture',100);assert.equal(before.sdelano,true);
 fs.openSync=function(file,...args){if(String(file).includes('.image-prune-'))cleanupTempOpens++;return open.call(this,file,...args)};
 await run({imya:'anthropic'},compactMcpHistory,fizicheskiyKompakt,()=>candidate,'fixture',{},tmp,100,'fixture',steps,s=>logs.push(s));
 assert(!steps.has('fixture'));assert(!logs.some(x=>x.includes('🔴')));assert.equal(cleanupTempOpens,0,'no cleanup for history without read_image');
 const read=file=>fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);const a=read(control),b=read(candidate);
 assert.equal(b[0].subtype,'compact_boundary');assert.deepEqual(b.map(x=>x.message??x.content),a.map(x=>x.message??x.content),'same summary and retained messages as original compactor');
 assert.deepEqual(b.slice(-3).map(x=>x.uuid),['original-7','original-8','original-9']);
 for(let i=1;i<b.length;i++)assert.equal(b[i].parentUuid,b[i-1].uuid);
 console.log('PASS gateway physical caller with fixture backend without images: summary/tail preserved, no cleanup temp, no new red logs');
}finally{fs.openSync=open;fs.rmSync(tmp,{recursive:true,force:true});}
