// RU: Проверка stend-image-history: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-image-history verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'image-history-'));
for(const key of Object.keys(process.env))if(key.startsWith('KOMPAKT_'))delete process.env[key];
Object.assign(process.env,{KOMPAKT_HVOST:'3',KOMPAKT_MIN_PROZA:'1000000',KOMPAKT_OTKAZY:dir+'/bad',KOMPAKT_UDACHI:dir+'/good'});
const {fizicheskiyKompakt}=await import(new URL('./fixtures/compaction-module.mjs',import.meta.url));
const moduleUrl=new URL('../image-history.mjs',import.meta.url);
const {stripMcpImages,compactMcpHistory}=fs.existsSync(moduleUrl)?await import(moduleUrl):{stripMcpImages:()=>0,compactMcpHistory:async(compact,file,sid,usage)=>compact(file,sid,usage)};
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/sdk-image-history.json',import.meta.url),'utf8'));
const row=fixture.rows.find(x=>x.type==='user'),use=fixture.rows.find(x=>x.type==='assistant');
const base64=row.message.content[0].content.find(x=>x.type==='image').source.data;
const file=path.join(dir,'history.jsonl'),toolName='mcp__fixture__read_image';
const write=rows=>fs.writeFileSync(file,rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
const read=()=>fs.readFileSync(file,'utf8');
let passed=0,failed=0;const test=async(name,fn)=>{try{await fn();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}};
try{
 await test('fixture physical compact: retained MCP result loses both base64 copies',async()=>{
  const text=Array.from({length:7},(_,i)=>({type:'user',uuid:'text'+i,message:{role:'user',content:'fixture text '+i}}));write([...text,use,{type:'user',uuid:'filler',message:{content:'tail'}},row,{type:'assistant',uuid:'end',message:{role:'assistant',content:[{type:'text',text:'done'}]}}]);
  const result=await compactMcpHistory(fizicheskiyKompakt,file,'fixture',100,toolName);assert.equal(result.sdelano,true);assert(!read().includes(base64),'base64 survived physical compact');const parsed=read().trim().split('\n').map(JSON.parse);assert(!parsed.some(x=>x.uuid===use.uuid),'tool_use must be cut from retained tail');assert.equal(parsed.find(x=>x.uuid===row.uuid).message.content[0].tool_use_id,'image-call');assert.equal(stripMcpImages(file,{toolName}),0,'idempotent');assert(fs.readFileSync(result.zapas,'utf8').includes(base64),'backup retention boundary');
 });
 await test('native boundary: old image removed, later image preserved',async()=>{const newer=structuredClone(row);newer.uuid='later';newer.message.content[0].tool_use_id='later-call';const laterUse=structuredClone(use);laterUse.message.content[0].id='later-call';write([use,row,{type:'system',subtype:'compact_boundary',uuid:'boundary'},laterUse,newer]);stripMcpImages(file,{toolName,beforeUuid:'boundary'});const rows=read().trim().split('\n').map(JSON.parse);assert(!JSON.stringify(rows[1]).includes(base64));assert(JSON.stringify(rows.at(-1)).includes(base64));});
 await test('user image and other tool preserved even with copied marker',async()=>{const otherUse=structuredClone(use);otherUse.message.content[0].name='mcp__other__read_image';write([otherUse,row,{type:'user',message:{content:[row.message.content[0].content[2]]}}]);const before=read();assert.equal(stripMcpImages(file,{toolName}),0);assert.equal(read(),before)});
 await test('cleanup failure does not lie about successful compact',async()=>{write([use,row]);const result=await compactMcpHistory(async()=>{fs.writeFileSync(file,'{bad\n');return {sdelano:true}},file,'fixture',1,toolName);assert.equal(result.sdelano,true);assert.match(result.mcpImageCleanupError,/JSON/);});
 await test('bad JSON and missing boundary refuse without rewriting',async()=>{write([use,row]);fs.appendFileSync(file,'{bad\n');const before=read();assert.throws(()=>stripMcpImages(file,{toolName}));assert.equal(read(),before);write([use,row]);const good=read();assert.throws(()=>stripMcpImages(file,{toolName,beforeUuid:'absent'}));assert.equal(read(),good)});
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log(JSON.stringify({passed,failed}));assert.equal(failed,0);
