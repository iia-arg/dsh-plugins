// Real candidate file I/O on fixtures only; no services, native HOME or AP.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {UsageRuntime} from '../src/usage-runtime.js';import {policyFixture} from './usage-runtime-policy-fixture.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'usage-r-reset-'));let count=0,failed=0;
async function test(name,fn){try{await fn();count++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
function fixture(name,limits={schemaVersion:1,fileMaxBytes:512,recordMaxBytes:256}){const dir=path.join(root,name);fs.mkdirSync(dir,{mode:0o700});const policy=policyFixture(limits);return {dir,policy,file:path.join(dir,'usage-runtime-v1.jsonl'),open(){return new UsageRuntime({root:dir},'fixture',{heartbeatMs:0,policyPath:policy.file})}}}
function bytes(file){return fs.readFileSync(file,'utf8')}
try{
 await test('cap replaces inode and unlinks old history without archive',async()=>{
  const f=fixture('cap');try{fs.writeFileSync(f.file,'old\n'.repeat(128),{mode:0o600});const before=fs.statSync(f.file);const held=fs.openSync(f.file,'r');const j=f.open();j.watermark(100);await j.close();assert.equal(j.failure,null);const after=fs.statSync(f.file);assert.notEqual(after.ino,before.ino,'cap must replace inode');assert.equal(fs.fstatSync(held).nlink,0,'old inode must have no name');fs.closeSync(held);assert.ok(after.size<=512);assert.equal(JSON.parse(bytes(f.file)).at,100);assert.deepEqual(fs.readdirSync(f.dir),['usage-runtime-v1.jsonl']);}finally{f.policy.close()}
 });
 await test('real 32 MiB sparse boundary resets without reading historical bytes',async()=>{
  const f=fixture('real-cap',{schemaVersion:1,fileMaxBytes:33554432,recordMaxBytes:65536});try{const fd=fs.openSync(f.file,'wx',0o600);fs.ftruncateSync(fd,33554432);const before=fs.fstatSync(fd);const j=f.open();j.watermark(101);await j.close();assert.equal(j.failure,null);assert.notEqual(fs.statSync(f.file).ino,before.ino);assert.equal(fs.fstatSync(fd).nlink,0);fs.closeSync(fd);assert.ok(fs.statSync(f.file).size<65536);assert.equal(JSON.parse(bytes(f.file)).at,101);}finally{f.policy.close()}
 });
 await test('a healthy below-cap file survives restart and appends once',async()=>{
  const f=fixture('restart');try{const a=f.open();a.watermark(100);await a.close();const before=fs.statSync(f.file),original=bytes(f.file);const b=f.open();b.watermark(200);await b.close();assert.equal(b.failure,null);assert.equal(fs.statSync(f.file).ino,before.ino);assert.ok(bytes(f.file).startsWith(original));const rs=bytes(f.file).trim().split('\n').map(JSON.parse);assert.deepEqual(rs.map(r=>r.at),[100,200]);}finally{f.policy.close()}
 });
 await test('startup seals one partial tail with LF and keeps earlier history',async()=>{
  const f=fixture('tail');try{fs.writeFileSync(f.file,'{"kept":1}\n{"broken":',{mode:0o600});const before=fs.statSync(f.file);const j=f.open();j.watermark(300);await j.close();assert.equal(j.failure,null);assert.equal(fs.statSync(f.file).ino,before.ino);const lines=bytes(f.file).trim().split('\n');assert.equal(lines[0],'{"kept":1}');assert.equal(lines[1],'{"broken":','broken tail must be sealed, not concatenated');assert.equal(JSON.parse(lines[2]).at,300);assert.equal(lines.filter(s=>{try{JSON.parse(s);return false}catch{return true}}).length,1);}finally{f.policy.close()}
 });
 await test('a valid JSON without LF is closed without duplicating it',async()=>{
  const f=fixture('missing-lf');try{fs.writeFileSync(f.file,'{"kept":1}',{mode:0o600});const j=f.open();j.watermark(400);await j.close();const rs=bytes(f.file).trim().split('\n').map(JSON.parse);assert.equal(rs.length,2);assert.deepEqual(rs[0],{kept:1});assert.equal(rs[1].at,400);}finally{f.policy.close()}
 });
 await test('record cap comes from policy and oversize input skips without rotation',async()=>{
  const f=fixture('record',{schemaVersion:1,fileMaxBytes:512,recordMaxBytes:128});try{fs.writeFileSync(f.file,'kept\n',{mode:0o600});const ino=fs.statSync(f.file).ino;const j=f.open();j.emit({kind:'runtime_turn',payload:'x'.repeat(256)});await j.close();assert.equal(j.failure,null);assert.equal(fs.statSync(f.file).ino,ino);assert.equal(bytes(f.file),'kept\n');assert.ok(!bytes(f.file).includes('xxx'));}finally{f.policy.close()}
 });
 for(const [name,value] of [['zero',{schemaVersion:1,fileMaxBytes:0,recordMaxBytes:256}],['boolean',{schemaVersion:1,fileMaxBytes:true,recordMaxBytes:256}],['record-exceeds-file',{schemaVersion:1,fileMaxBytes:256,recordMaxBytes:512}],['unknown-key',{schemaVersion:1,fileMaxBytes:512,recordMaxBytes:256,extra:1}],['duplicate-key','{"schemaVersion":1,"fileMaxBytes":256,"fileMaxBytes":512,"recordMaxBytes":256}'],['escaped-duplicate-key','{"schemaVersion":1,"\\u0066ileMaxBytes":256,"fileMaxBytes":512,"recordMaxBytes":256}']])await test('invalid policy '+name+' refuses without writing',async()=>{
  const f=fixture('policy-'+name,value);try{fs.writeFileSync(f.file,'original\n',{mode:0o600});const j=f.open();j.watermark(500);await j.close();assert.equal(j.failure,'R_POLICY_INVALID');assert.equal(bytes(f.file),'original\n');}finally{f.policy.close()}
 });
 await test('missing policy never falls back to a compiled limit',async()=>{
  const dir=path.join(root,'missing-policy');fs.mkdirSync(dir,{mode:0o700});const j=new UsageRuntime({root:dir},'fixture',{heartbeatMs:0,policyPath:path.join(dir,'absent')});j.watermark(600);await j.close();assert.equal(j.failure,'R_POLICY_INVALID');assert.deepEqual(fs.readdirSync(dir),[]);
 });
 await test('unreadable policy names refusal and leaves R unchanged',async()=>{
  const f=fixture('unreadable-policy');const parent=path.dirname(f.policy.file);
  try{fs.writeFileSync(f.file,'original\n',{mode:0o600});fs.chmodSync(parent,0);
   const code="import fs from 'node:fs';const x=JSON.parse(fs.readFileSync(0,'utf8'));const {UsageRuntime}=await import(x.module);const logs=[];const j=new UsageRuntime({root:x.root},'fixture',{heartbeatMs:0,policyPath:x.policy,log:s=>logs.push(s)});j.watermark(605);await j.close();console.log(JSON.stringify({failure:j.failure,logs}))";
   const opts={input:JSON.stringify({module:new URL('../src/usage-runtime.js',import.meta.url).href,root:f.dir,policy:f.policy.file}),encoding:'utf8',timeout:5000,...(process.getuid()===0?{uid:65534,gid:65534}:{})};const r=spawnSync(process.execPath,['--input-type=module','-e',code],opts);assert.equal(r.status,0,r.stderr);const got=JSON.parse(r.stdout);assert.equal(got.failure,'R_POLICY_INVALID');assert.ok(got.logs.some(s=>s.includes('R_POLICY_INVALID')));assert.equal(bytes(f.file),'original\n');
  }finally{fs.chmodSync(parent,0o700);f.policy.close()}
 });
 await test('policy removed after startup stops R growth; restore and restart writes',async()=>{
  const f=fixture('policy-disappears');try{const j=f.open();j.watermark(610);await j.flush();const original=bytes(f.file);fs.renameSync(f.policy.file,f.policy.file+'.held');j.watermark(611);await j.close();assert.equal(j.failure,'R_POLICY_INVALID');assert.equal(bytes(f.file),original);fs.renameSync(f.policy.file+'.held',f.policy.file);const k=f.open();k.watermark(612);await k.close();assert.equal(k.failure,null);assert.deepEqual(bytes(f.file).trim().split('\n').map(JSON.parse).map(x=>x.at),[610,612]);}finally{f.policy.close()}
 });
 await test('policy lost just before reset cannot replace or grow the journal',async()=>{
  const f=fixture('policy-at-reset');const open=fs.promises.open;let removed=false;
  try{fs.writeFileSync(f.file,'old\n'.repeat(128),{mode:0o600});const before=fs.statSync(f.file).ino,original=bytes(f.file);const j=f.open();fs.promises.open=async(file,...args)=>{const fd=await open.call(fs.promises,file,...args);if(String(file)===f.file&&!removed){removed=true;fs.renameSync(f.policy.file,f.policy.file+'.held')}return fd};j.watermark(620);await j.close();assert.equal(removed,true);assert.equal(j.failure,'R_POLICY_INVALID');assert.equal(fs.statSync(f.file).ino,before);assert.equal(bytes(f.file),original);
  }finally{fs.promises.open=open;f.policy.close()}
 });
 await test('policy symlink is rejected and return to safe policy writes again',async()=>{
  const f=fixture('policy-symlink');try{const link=path.join(f.dir,'policy-link');fs.symlinkSync(f.policy.file,link);const bad=new UsageRuntime({root:f.dir},'fixture',{heartbeatMs:0,policyPath:link});bad.watermark(700);await bad.close();assert.equal(bad.failure,'R_POLICY_INVALID');assert.equal(fs.existsSync(f.file),false);fs.unlinkSync(link);const good=f.open();good.watermark(701);await good.close();assert.equal(good.failure,null);assert.equal(JSON.parse(bytes(f.file)).at,701);}finally{f.policy.close()}
 });
 await test('failed exclusive temp create does not unlink an existing object',async()=>{
  const f=fixture('exclusive-create');const open=fs.promises.open;let collision;
  try{fs.writeFileSync(f.file,'old\n'.repeat(128),{mode:0o600});const before=fs.statSync(f.file).ino;fs.promises.open=async(file,...args)=>{if(String(file).endsWith('.tmp')&&!collision){collision=String(file);fs.writeFileSync(collision,'preexisting\n',{mode:0o600})}return open.call(fs.promises,file,...args)};
   const j=f.open();j.watermark(750);await j.close();assert.equal(j.failure,'R_RESET_FAILED');assert.equal(fs.statSync(f.file).ino,before);assert.equal(fs.readFileSync(collision,'utf8'),'preexisting\n','failed O_EXCL must preserve collision subject');
  }finally{fs.promises.open=open;f.policy.close()}
 });
 for(const stage of ['before-rename','after-temp-sync','after-rename','after-directory-sync'])await test('SIGKILL '+stage+' leaves old or empty new file and restart returns',async()=>{
  const f=fixture(stage);try{fs.writeFileSync(f.file,'old\n'.repeat(128),{mode:0o600});const before=fs.statSync(f.file),old=bytes(f.file);const r=spawnSync(process.execPath,[new URL('./usage-runtime-reset-child.mjs',import.meta.url).pathname],{input:JSON.stringify({root:f.dir,policyPath:f.policy.file,stage}),encoding:'utf8',timeout:5000});assert.equal(r.signal,'SIGKILL',r.stderr);assert.match(r.stdout,/FAULT_ENTERED /,'kill stage must actually be reached');console.log(r.stdout.trim());const after=fs.statSync(f.file);if(stage==='before-rename'||stage==='after-temp-sync'){assert.equal(after.ino,before.ino);assert.equal(bytes(f.file),old)}else{assert.notEqual(after.ino,before.ino);assert.equal(bytes(f.file),'')}
  const j=f.open();j.watermark(800);await j.close();assert.equal(j.failure,null);assert.ok(fs.statSync(f.file).size<=512);assert.equal(JSON.parse(bytes(f.file)).at,800);
  }finally{f.policy.close()}
 });
 console.log('TOTAL',count,'PASS',failed,'FAIL');if(failed)process.exitCode=1;
}finally{fs.rmSync(root,{recursive:true,force:true})}
