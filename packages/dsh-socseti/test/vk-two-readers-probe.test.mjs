import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
let sut={};
try{sut=await import('../src/vk-two-readers-probe.mjs')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
const group=111222333,marker='B-N-2027-control-emoji-🌊';
async function fixture(t,mode='normal'){
 assert.equal(typeof sut.probeTwoReaders,'function','probe feature is missing');
 let gets=0,present=false,consumed=false;const requests=[];
 const event={type:'wall_reply_new',event_id:'controlled-event-1',group_id:group,object:{text:marker}};
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');requests.push({path:u.pathname,key:u.searchParams.get('key'),ts:u.searchParams.get('ts')});
  let body;
  if(u.pathname.includes('groups.getLongPollServer')){
   gets++;body={response:{server:'https://lp.vk.com/whp/'+group,key:gets===1?'synthetic-first-key':'synthetic-second-key',ts:'100'}};
  }else if(mode==='invalidate'&&gets===2&&u.searchParams.get('key')==='synthetic-first-key')body={failed:2};
  else{
   let events=present&&u.searchParams.get('ts')==='100'?[event]:[];
   if(mode==='consume'&&consumed)events=[];
   if(mode==='consume'&&events.length)consumed=true;
   if(mode==='other-group')events=events.map(e=>({...e,group_id:444555666}));
   if(mode==='no-control')events=[];
   body={ts:mode==='constant-ts'?'100':present?'101':'100',updates:events};
  }
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(body));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const fetchImpl=(url,options)=>{const u=new URL(url);return fetch('http://127.0.0.1:'+server.address().port+u.pathname+u.search,options)};
 const api=new sut.VkProbeClient({token:'synthetic-access-token-not-a-secret',apiVersion:'5.199',fetchImpl});
 return {api,requests,checkpoint:async()=>{present=true},gets:()=>gets};
}
test('two sessions and old cursor receive one independently marked event',async t=>{
 const f=await fixture(t);const r=await sut.probeTwoReaders({groupId:group,marker,api:f.api,checkpoint:f.checkpoint});
 assert.equal(r.verdict,'compatible');assert.equal(r.eventA,'controlled-event-1');assert.equal(r.eventB,r.eventA);
 assert.equal(r.repeatAfterAdvance,true);assert.equal(r.keysEqual,false);assert.equal(f.gets(),2);
 assert.equal(JSON.stringify(r).includes('synthetic-first-key'),false);assert.equal(JSON.stringify(r).includes('synthetic-access-token'),false);
});
test('first key failed2 after second getServer is an observation, never green',async t=>{
 const f=await fixture(t,'invalidate');const r=await sut.probeTwoReaders({groupId:group,marker,api:f.api,checkpoint:f.checkpoint});
 assert.equal(r.verdict,'interference_observed');assert.equal(r.oldKeyAfter,2);assert.equal(r.causalInvalidation,'not_proven');
 assert.ok(r.durationMs>0,'early failure copied a zero duration before final measurement');
});
test('global consuming fixture cannot be declared compatible',async t=>{
 const f=await fixture(t,'consume');const r=await sut.probeTwoReaders({groupId:group,marker,api:f.api,checkpoint:f.checkpoint});
 assert.notEqual(r.verdict,'compatible');assert.equal(r.eventA,'controlled-event-1');assert.equal(r.eventB,null);
});
test('no control event is not measured, not proof of event destruction',async t=>{
 const f=await fixture(t,'no-control');const r=await sut.probeTwoReaders({groupId:group,marker,api:f.api,checkpoint:f.checkpoint});
 assert.equal(r.verdict,'not_measured');assert.equal(r.eventA,null);
});
test('an event of another group cannot satisfy the control marker',async t=>{
 const f=await fixture(t,'other-group');const r=await sut.probeTwoReaders({groupId:group,marker,api:f.api,checkpoint:f.checkpoint});
 assert.equal(r.verdict,'not_measured');assert.equal(r.eventA,null);
});
test('Ostrov target refuses before any IO',async()=>{
 assert.equal(typeof sut.probeTwoReaders,'function','probe feature is missing');let calls=0;
 await assert.rejects(sut.probeTwoReaders({groupId:127999849,marker,api:{server:()=>{calls++}},checkpoint:async()=>{calls++}}),/test community/);
 assert.equal(calls,0);
});
test('CLI rejects customary unknown action flags without IO',()=>{
 assert.equal(typeof sut.probeTwoReaders,'function','probe feature is missing');
 const p=spawnSync(process.execPath,[new URL('../src/vk-two-readers-probe.mjs',import.meta.url).pathname,'--dry-run'],{encoding:'utf8'});
 assert.equal(p.status,2);assert.equal(p.stdout,'');
});
test('checkpoint cannot keep a probe alive beyond its budget',async t=>{
 const f=await fixture(t);const start=performance.now();
 const r=await sut.probeTwoReaders({groupId:group,marker,api:f.api,checkpoint:()=>new Promise(()=>{}),deadlineMs:100});
 assert.equal(r.verdict,'not_measured');assert.ok(performance.now()-start<1000);
 assert.ok(r.durationMs>=90);assert.equal(f.gets(),2);
});
test('invalid API version rejects before reading pass',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vk-probe-pass-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const trace=path.join(dir,'called');fs.writeFileSync(path.join(dir,'pass'),'#!/bin/sh\ntouch '+trace+'\necho synthetic-token\n',{mode:0o755});
 const p=spawnSync(process.execPath,[new URL('../src/vk-two-readers-probe.mjs',import.meta.url).pathname,'--live','--group',String(group),'--api-version','bad','--pass-ref','synthetic'],{env:{...process.env,PATH:dir+':'+process.env.PATH},encoding:'utf8'});
 assert.equal(p.status,2);assert.equal(fs.existsSync(trace),false);
});

test('nonadvancing cursor never proves replay after advancing',async t=>{
 const f=await fixture(t,'constant-ts');const r=await sut.probeTwoReaders({groupId:group,marker,api:f.api,checkpoint:f.checkpoint});assert.equal(r.verdict,'not_measured');assert.equal(r.repeatAfterAdvance,false);
});
test('pass option as reference refuses before credential IO',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vk-probe-pass-opt-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const trace=path.join(dir,'called');
 fs.writeFileSync(path.join(dir,'pass'),'#!/bin/sh\ntouch '+trace+'\nexit 1\n',{mode:0o755});
 const p=spawnSync(process.execPath,[new URL('../src/vk-two-readers-probe.mjs',import.meta.url).pathname,'--live','--group',String(group),'--api-version','5.199','--pass-ref','-h'],{env:{...process.env,PATH:dir+':'+process.env.PATH},encoding:'utf8',timeout:1000,killSignal:'SIGKILL'});assert.equal(p.status,2);assert.equal(fs.existsSync(trace),false);
});
test('FIFO token reference refuses without blocking open',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vk-probe-fifo-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'token');assert.equal(spawnSync('mkfifo',[file]).status,0);
 const p=spawnSync(process.execPath,[new URL('../src/vk-two-readers-probe.mjs',import.meta.url).pathname,'--live','--group',String(group),'--api-version','5.199','--token-file',file],{encoding:'utf8',timeout:1000,killSignal:'SIGKILL'});assert.equal(p.status,2);assert.equal(p.signal,null);
});
test('pass ignoring TERM is killed within bounded credential deadline',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vk-probe-pass-hang-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'pass'),'#!/usr/bin/python3\nimport signal,time\nsignal.signal(signal.SIGTERM,signal.SIG_IGN)\ntime.sleep(30)\n',{mode:0o755});
 const p=spawnSync(process.execPath,[new URL('../src/vk-two-readers-probe.mjs',import.meta.url).pathname,'--live','--group',String(group),'--api-version','5.199','--pass-ref','synthetic'],{env:{...process.env,PATH:dir+':'+process.env.PATH},encoding:'utf8',timeout:6500,killSignal:'SIGKILL'});assert.equal(p.status,2);assert.equal(p.signal,null);
});
test('credential timeout cleans descendants in its own process group',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vk-probe-pass-tree-'));const pidFile=path.join(dir,'pid');let pid;
 t.after(()=>{if(pid)try{process.kill(pid,'SIGKILL')}catch{}fs.rmSync(dir,{recursive:true,force:true})});
 fs.writeFileSync(path.join(dir,'pass'),'#!/usr/bin/python3\nimport subprocess,os,time\np=subprocess.Popen(["/usr/bin/sleep","30"])\nopen(os.environ["TEST_CHILD_PID"],"w").write(str(p.pid))\ntime.sleep(30)\n',{mode:0o755});
 const p=spawnSync(process.execPath,[new URL('../src/vk-two-readers-probe.mjs',import.meta.url).pathname,'--live','--group',String(group),'--api-version','5.199','--pass-ref','synthetic'],{env:{...process.env,PATH:dir+':'+process.env.PATH,TEST_CHILD_PID:pidFile},encoding:'utf8',timeout:6500,killSignal:'SIGKILL'});
 pid=Number(fs.readFileSync(pidFile,'utf8'));assert.equal(p.status,2);
 const alive=()=>{try{return !/^State:\s+Z/m.test(fs.readFileSync('/proc/'+pid+'/status','utf8'))}catch(e){if(e.code==='ENOENT')return false;throw e}};
 for(let n=0;n<20&&alive();n++)await new Promise(r=>setTimeout(r,25));assert.equal(alive(),false,'credential descendant survives CLI timeout');
});
