// RU: Проверка stend-image-cleanup-caller: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-image-cleanup-caller verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.

import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {DatabaseSync} from 'node:sqlite';
import * as history from '../image-history.mjs';
const source=fs.readFileSync(new URL('../gateway.mjs',import.meta.url),'utf8');
const extract=name=>{let start=source.indexOf('async function '+name+'(');if(start<0)start=source.indexOf('function '+name+'(');const end=source.indexOf('\n}',start)+2;assert(start>=0&&end>start);return source.slice(start,end)};
const start=source.indexOf('      if (granicySdk.length) {'),end=source.indexOf('\n    }\n    if (pervyjText',start);assert(start>=0&&end>start);const code=source.slice(start,end);
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/sdk-image-history.json',import.meta.url),'utf8'));
const imageRow=fixture.rows.find(r=>r.type==='user'),base64=imageRow.message.content[0].content.find(b=>b.type==='image').source.data;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cleanup-caller-r2-'));const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE saved (body TEXT)');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
async function run({images=true,boundary=true,closeError=false,stripError=false,turnError=false,second=false}={}){
 db.exec('DELETE FROM saved');const calls=[],logs=[];let strips=0;
 const rows=images?structuredClone(fixture.rows):[{type:'user',uuid:'ordinary',message:{content:'ordinary history'}}];
 if(boundary)rows.push({type:'system',subtype:'compact_boundary',uuid:'boundary'},{type:'user',isCompactSummary:true,message:{content:'fixture saved summary'}});
 const file=path.join(dir,'session.jsonl');fs.writeFileSync(file,rows.map(JSON.stringify).join('\n')+'\n');const before=fs.readFileSync(file,'utf8');
 const file2=path.join(dir,'second.jsonl');if(second)fs.writeFileSync(file2,before);
 const globals={COMPACTION:{available:true},fs,PAMYAT_BAZA:'fixture-only',PAMYAT_AGENT:'fixture',pamyatSdk:{zapisat(entry){calls.push('saved');db.prepare('INSERT INTO saved VALUES(?)').run(JSON.stringify(entry));return 1}},putSessii:sid=>sid==='second'?file2:file,log:s=>logs.push(s)};
 const save=vm.runInNewContext(extract('svodkaIzTranskripta')+'\n'+extract('svodkiSdkVPamyat')+';svodkiSdkVPamyat',globals);
 const args=['COMPACTION','granicySdk','iter','svodkiSdkVPamyat','body','WORK_DIR','putSessii','hasMcpImageCalls','stripMcpImages','bridgeName','log','turnError'];
 const execute=new Function(...args,'return (async()=>{try{if(turnError)throw turnError;return "original success";}finally{'+code+'}})()');
 const originalError=turnError?Error('original model failure'):null;let result,error;
 try{result=await execute(globals.COMPACTION,[{sessiya:'first',uuid:'boundary'},...(second?[{sessiya:'second',uuid:'boundary'}]:[])],{close(){calls.push('closed');if(closeError)throw Error('fixture close failure')}},save,{},dir,globals.putSessii,history.hasMcpImageCalls,(...a)=>{strips++;calls.push('strip');if(stripError&&strips===1)throw Error('history changed during cleanup');return history.stripMcpImages(...a)},'fixture',globals.log,originalError)}catch(e){error=e}
 return {result,error,originalError,calls,logs,strips,saved:db.prepare('SELECT body FROM saved').all().map(x=>JSON.parse(x.body)),before,after:fs.readFileSync(file,'utf8'),secondAfter:second?fs.readFileSync(file2,'utf8'):null};
}
try{
 await test('summary saved before close; successful images removed',async()=>{const r=await run();assert.equal(r.result,'original success');assert.deepEqual(r.calls,['saved','closed','strip']);assert.equal(r.saved[0].klass,'svodka-kompakcii');assert(r.saved[0].soderzhim.includes('fixture saved summary'));assert(!r.after.includes(base64));assert(!r.logs.some(s=>s.includes('🔴')))});
 await test('throwing close preserves summary and success; cleanup not attempted',async()=>{const r=await run({closeError:true});assert.equal(r.result,'original success');assert.equal(r.saved.length,1);assert.equal(r.strips,0);assert.equal(r.before,r.after);assert(r.logs.some(s=>s.includes('🔴')&&s.includes('fixture close failure')))});
 await test('missing boundary logs red, original turn does not fall',async()=>{const r=await run({boundary:false});assert.equal(r.result,'original success');assert(r.logs.some(s=>s.includes('🔴')&&s.includes('compact boundary not found')));assert.equal(r.after,r.before)});
 await test('cleanup failure preserves original model error',async()=>{const r=await run({stripError:true,turnError:true});assert.equal(r.error,r.originalError);assert.equal(r.saved.length,1);assert(r.logs.some(s=>s.includes('🔴')&&s.includes('history changed during cleanup')))});
 await test('one cleanup failure does not suppress next boundary cleanup',async()=>{const r=await run({stripError:true,second:true});assert.equal(r.result,'original success');assert.equal(r.saved.length,2);assert.equal(r.strips,2);assert(!r.secondAfter.includes(base64))});
 await test('SDK compact without read_image: saved summary, untouched history, no cleanup/red',async()=>{const r=await run({images:false});assert.equal(r.result,'original success');assert.equal(r.saved.length,1);assert.equal(r.strips,0);assert.equal(r.before,r.after);assert(!r.logs.some(s=>s.includes('🔴')))});
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
console.log(JSON.stringify({passed,failed}));assert.equal(failed,0);
