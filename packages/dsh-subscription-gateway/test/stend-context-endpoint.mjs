import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const producer=process.env.STEND_PRODUCER_SOURCE??new URL('../context-status.mjs',import.meta.url).pathname;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'context-endpoint-'));let green=0,red=0;
async function test(name,fn){try{await fn();green++;console.log('PASS '+name)}catch(e){red++;console.log('FAIL '+name+': '+e.message)}}
try{
 for(const how of ['explicit-close','natural-exit'])await test('replaced advertised endpoint survives '+how,async()=>{
  const dbPath=path.join(root,how+'.db'),file=dbPath+'.context-status.sock';
  const code=`import fs from 'node:fs';import{createContextStatus}from${JSON.stringify(pathToFileURL(producer).href)};const p=await createContextStatus(process.argv[1]);fs.renameSync(p.socketPath,p.socketPath+'.away');fs.writeFileSync(p.socketPath,'replacement');console.log('CORRUPTION endpoint replaced: regular file sha256='+ (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(p.socketPath)).digest('hex'));${how==='explicit-close'?'await p.close();':''}`;
  const got=spawnSync(process.execPath,['--input-type=module','-e',code,dbPath],{encoding:'utf8',timeout:5000});process.stdout.write(got.stdout);assert.equal(got.status,0,got.stderr);
  assert(fs.existsSync(file),'Node cleanup removed unrelated replacement endpoint');assert.equal(fs.readFileSync(file,'utf8'),'replacement');
 });
 await test('post-publish failure removes only its own endpoint and closes resources',async()=>{
  const {createContextStatus}=await import(pathToFileURL(producer));const dbPath=path.join(root,'publish-fault.db');
  const unlink=fs.unlinkSync;let injected=0;
  fs.unlinkSync=p=>{if(String(p).startsWith('/proc/self/fd/')&&!injected){injected++;const error=Error('injected EIO after publish');error.code='EIO';throw error}return unlink(p)};
  try{await assert.rejects(createContextStatus(dbPath),/injected EIO/)}finally{fs.unlinkSync=unlink}
  assert.equal(injected,1,'fault was not injected');console.log('CORRUPTION injected post-publish unlink EIO count='+injected);
  assert(!fs.existsSync(dbPath+'.context-status.sock'),'failed publisher leaves its own advertised endpoint');
 });
}finally{fs.rmSync(root,{recursive:true,force:true})}
console.log(`RESULT green=${green} red=${red} total=${green+red}`);process.exitCode=red?1:0;
