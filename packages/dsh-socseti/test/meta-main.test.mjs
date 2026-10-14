import './approval-fixture.mjs';import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';import {fileURLToPath} from 'node:url';
test('real candidate main starts configured Meta reader with publishing disabled',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-main-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const keyFiles={};for(const [i,role] of ['anna','monitor','channel'].entries()){const file=path.join(dir,role+'.key');fs.writeFileSync(file,String(i+1).repeat(64),{mode:0o600});keyFiles[role]=file}
 const token=path.join(dir,'token');fs.writeFileSync(token,'dummy-meta-token\n',{mode:0o600});const stateDir=path.join(dir,'state'),config=path.join(dir,'config.json');
 fs.writeFileSync(config,JSON.stringify({profile:'anna',port,stateDir,keyFiles,targets:{vk:'127999849',instagram:'17841453053403067',threads:'26794519373575025',telegram:'-1001925584120'},meta:{instagram:{enabled:true,armed:true,apiVersion:'v22.0',token:{file:token},startAt:'2026-10-14T00:00:00Z',messagesEnabled:false}}}),{mode:0o600});
 const preload=path.join(dir,'fake-meta.mjs');
 fs.writeFileSync(preload,"globalThis.fetch=async url=>{const u=new URL(url);if(u.hostname!=='graph.instagram.com')throw Error('unexpected host');if(u.pathname==='/v22.0/me')return new Response(JSON.stringify({user_id:'17841453053403067'}));if(u.pathname==='/v22.0/17841453053403067/media')return new Response('{\"data\":[]}');throw Error('unexpected route')};\n");
 const main=fileURLToPath(new URL('../src/main.mjs',import.meta.url)),child=spawn(process.execPath,['--import',preload,main,config],{stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{error+=b});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL')});
 for(let i=0;i<500&&!output.includes('\"service\":\"socseti\"')&&child.exitCode===null;i++)await new Promise(r=>setTimeout(r,10));
 assert.ok(output.includes('\"service\":\"socseti\"'),error);assert.ok(output.includes('\"publishing\":false'));
 for(let i=0;i<500;i++){let ready=false;if(fs.existsSync(path.join(stateDir,'socseti.sqlite'))){const probe=new DatabaseSync(path.join(stateDir,'socseti.sqlite'),{readOnly:true});try{if(probe.prepare("SELECT count(*) n FROM sqlite_master WHERE name='meta_state'").get().n){const row=probe.prepare("SELECT json FROM meta_state WHERE source='instagram:17841453053403067'").get();ready=!!row&&JSON.parse(row.json).ready===true}}finally{probe.close()}}if(ready)break;await new Promise(r=>setTimeout(r,10))}
 const db=new DatabaseSync(path.join(stateDir,'socseti.sqlite'),{readOnly:true});
 try{assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='meta_state'").get().n,1,'main did not call Meta intake');const s=JSON.parse(db.prepare("SELECT json FROM meta_state WHERE source='instagram:17841453053403067'").get().json);assert.equal(s.calls,2);assert.equal(s.ready,true)}finally{db.close()}
 const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;
});
// Gate K1: unconditional Meta setup must not change a profile without meta.
test('real main without meta preserves startup status and database without Meta state',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'main-no-meta-'));let child,exited;
 t.after(async()=>{if(child?.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited}fs.rmSync(dir,{recursive:true,force:true})});
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const keyFiles={};for(const [i,role] of ['anna','monitor','channel'].entries()){keyFiles[role]=path.join(dir,role+'.key');fs.writeFileSync(keyFiles[role],String(i+1).repeat(64),{mode:0o600})}
 const stateDir=path.join(dir,'state'),config=path.join(dir,'config.json');
 fs.writeFileSync(config,JSON.stringify({profile:'anna',port,stateDir,keyFiles,targets:{vk:'127999849',instagram:'17841453053403067',threads:'26794519373575025',telegram:'-1001925584120'}}),{mode:0o600});
 const main=fileURLToPath(new URL('../src/main.mjs',import.meta.url));child=spawn(process.execPath,[main,config],{stdio:['ignore','pipe','pipe']});exited=new Promise(r=>child.once('exit',r));let output='',error='';
 child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{error+=b});
 for(let i=0;i<500&&!output.includes('"service":"socseti"')&&child.exitCode===null&&child.signalCode===null;i++)await new Promise(r=>setTimeout(r,10));
 assert.ok(output.includes('"service":"socseti"'),error||'candidate main did not start');
 const startup=output.split('\n').filter(Boolean).map(x=>JSON.parse(x)).find(x=>x.service==='socseti');
 const response=await fetch('http://127.0.0.1:'+port+'/mcp',{method:'POST',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+'2'.repeat(64),'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'status',arguments:{}}})});
 assert.equal(response.status,200);const rpc=await response.json();assert.notEqual(rpc.result?.isError,true);assert.equal(rpc.result.content.length,1);const status=JSON.parse(rpc.result.content[0].text);
 const db=new DatabaseSync(path.join(stateDir,'socseti.sqlite'),{readOnly:true});let tables;
 try{assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='events'").get().n,1,'wrong database');tables=db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='meta_state'").get().n}finally{db.close()}
 assert.deepEqual({started:child.exitCode===null&&child.signalCode===null,metaTables:tables,startHasMeta:Object.hasOwn(startup,'meta'),statusHasMeta:Object.hasOwn(status,'meta')},{started:true,metaTables:0,startHasMeta:false,statusHasMeta:false});
 child.kill('SIGTERM');await exited;assert.equal(child.exitCode,0);
});
