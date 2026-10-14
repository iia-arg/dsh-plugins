// B-N-2010: actual rollout watcher, no identity, model, service, SQLite or IPC fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const source=process.env.STEND_OBSERVER_SOURCE;
const {watchCodexCompactions,compactionParser}=await import(source?pathToFileURL(path.resolve(source)).href:new URL('../codex-compaction-watch.mjs',import.meta.url).href);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,what){const end=Date.now()+3500;while(!fn()){assert(Date.now()<end,what);await sleep(20)}}
const token={type:'event_msg',timestamp:'2026-10-12T00:00:01Z',payload:{type:'token_count',info:{last_token_usage:{input_tokens:10000},model_context_window:921818}}};
const line=JSON.stringify(token)+'\n';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let green=0,red=0;
async function proba(name,fn){try{const r=await fn();if(r!==undefined&&r!==true)throw Error(typeof r==='string'?r:'тело пробы вернуло '+JSON.stringify(r));green++;console.log('PASS '+name)}catch(e){red++;console.log('FAIL '+name+': '+e.message)}}
await proba('token and compacted reach numeric callbacks, malformed token reaches invalidation',()=>{
 const seen=[],compacts=[];const p=compactionParser(()=>{},()=>({}),e=>seen.push(e),()=>compacts.push(true));
 p.accept(token);assert.equal(seen.at(-1).last.input_tokens,10000);
 p.accept({type:'compacted',timestamp:token.timestamp,payload:{}});assert.equal(compacts.length,1);
 p.accept({type:'event_msg',timestamp:token.timestamp,payload:{type:'token_count'}});assert.equal(seen.at(-1).last,undefined);
});
await proba('missing resolved rollout invalidates, recovery and second disappearance invalidate again',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'context-observer-')),file=path.join(root,'rollout.jsonl');
 fs.writeFileSync(file,'');let state='waiting',blind=0,tokens=0;const logs=[];
 const w=watchCodexCompactions({resolveFile:()=>fs.existsSync(file)?file:null,log:s=>logs.push(s),
  onTokenCount:()=>{state='measured';tokens++},onBlind:()=>{state='blind';blind++},onCompacted:()=>{state='waiting'}});
 try{
  fs.appendFileSync(file,line);await until(()=>tokens===1,'healthy token_count was not read');assert.equal(blind,0);
  const preserved=fs.readFileSync(file);fs.renameSync(file,path.join(root,'saved'));
  console.log('CORRUPTION rollout missing: sha before='+sha(preserved)+' after=<absent>; original entries='+fs.readdirSync(root).filter(n=>n==='rollout.jsonl').length);
  assert(!fs.existsSync(file));assert.equal(fs.readdirSync(root).includes('rollout.jsonl'),false);
  await until(()=>state==='blind','resolver=null kept previous numeric snapshot fresh');
  fs.renameSync(path.join(root,'saved'),file);assert.equal(sha(fs.readFileSync(file)),sha(preserved));fs.appendFileSync(file,line);
  await until(()=>tokens===2,'restored watcher did not recover');assert.equal(state,'measured');
  fs.renameSync(file,path.join(root,'saved'));await until(()=>state==='blind','second resolver=null kept recovered snapshot fresh');
  assert(blind>=2);
  fs.renameSync(path.join(root,'saved'),file);fs.appendFileSync(file,line);
  await until(()=>tokens===3,'second restoration did not recover');assert.equal(state,'measured');
  assert.equal(logs.filter(s=>s.includes('observer_blind')).length,1,'only message is suppressed, not state');
 }finally{w.close();fs.rmSync(root,{recursive:true,force:true})}
});
console.log(`RESULT green=${green} red=${red} total=${green+red}`);process.exitCode=red?1:0;
