import './approval-fixture.mjs';import test from 'node:test';import assert from 'node:assert/strict';
const mod=await import('../src/meta-watch.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e});
const now=Date.parse('2026-10-14T03:00:00Z'),config={meta:{instagram:{enabled:true}}};
const healthy={last_loop:now,last_attempt:now,last_success:now,last_completed_scan:now,ready:true,reason:null};
const unit=()=>({LoadState:'loaded',ActiveState:'active',UnitFileState:'enabled'});
test('external timer probe detects removed meta-watch timer and recovers',async()=>{
 assert.equal(typeof mod.probeMetaWatch,'function','external Meta watchdog probe missing');
 const units={'anna-meta-watch.timer':unit()};const opts={now,readUnit:n=>units[n]??{LoadState:'not-found',ActiveState:'inactive',UnitFileState:''},readState:()=>healthy};
 assert.equal((await mod.probeMetaWatch(config,opts)).code,0);delete units['anna-meta-watch.timer'];
 const missing=await mod.probeMetaWatch(config,opts);assert.equal(missing.code,1);assert.deepEqual(missing.issues,[{subject:'anna-meta-watch.timer',reason:'timer_unarmed'}]);
 units['anna-meta-watch.timer']=unit();assert.equal((await mod.probeMetaWatch(config,opts)).code,0);
});
test('timer active cannot hide absent receiver calls or missing refresh execution',async()=>{
 assert.equal(typeof mod.probeMetaWatch,'function');const stale={...healthy,last_attempt:now-2101000};
 const bad=await mod.probeMetaWatch(config,{now,readUnit:unit,readState:()=>stale});assert.equal(bad.code,1);assert.equal(bad.issues[0].reason,'receiver_not_called');
 const c={meta:{instagram:{enabled:true,refresh:{enabled:true}}}},s={...healthy,refresh:{phase:'idle',last_attempt:now-108000001,expires_at:now+8*86400000}};
 const refresh=await mod.probeMetaWatch(c,{now,readUnit:unit,readState:()=>s});assert.equal(refresh.issues[0].reason,'refresh_not_called');
});
test('intentional daily-budget pause does not become missing-call alarm; expiry is independent',async()=>{
 assert.equal(typeof mod.probeMetaWatch,'function');const opts={now,readUnit:unit,readState:()=>({...healthy,last_attempt:now-3000000,last_loop:now,reason:'daily_budget',day:new Date(now).toISOString().slice(0,10),calls:2000})};const parked=await mod.probeMetaWatch(config,opts);assert.equal(parked.code,1);assert.ok(parked.issues.some(x=>x.reason==='current_coverage_daily_budget'));assert.ok(!parked.issues.some(x=>x.reason==='receiver_not_called'));
 const c={meta:{instagram:{enabled:true,refresh:{enabled:true}}}};opts.readState=()=>({...healthy,refresh:{phase:'idle',last_attempt:now,expires_at:now+6*86400000}});assert.equal((await mod.probeMetaWatch(c,opts)).issues[0].reason,'token_expiring');
});
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('alert journal holds unconfirmed send for one day and emits recovery once',async t=>{
 assert.equal(typeof mod.runMetaWatch,'function','operational alert caller missing');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-watch-journal-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let calls=0,bad=true;
 const probe=async()=>bad?{code:1,issues:[{subject:'instagram',reason:'permissions'}]}:{code:0,issues:[]},alert=()=>{calls++;if(bad)throw Error('lost confirmation')};
 await mod.runMetaWatch({stateDir:dir},{probe,alert,now});await mod.runMetaWatch({stateDir:dir},{probe,alert,now:now+1000});assert.equal(calls,1);assert.equal(Object.values(JSON.parse(fs.readFileSync(path.join(dir,'meta-watch-incidents.json'),'utf8')).incidents)[0].stage,'unconfirmed');
 bad=false;await mod.runMetaWatch({stateDir:dir},{probe,alert,now:now+2000});await mod.runMetaWatch({stateDir:dir},{probe,alert,now:now+3000});assert.equal(calls,2);
});
test('lock pathname remaining after crash does not silence subsequent health alarms',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-watch-crash-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'meta-watch-incidents.json.lock'),'',{mode:0o600});let calls=0;
 const result=await mod.runMetaWatch({stateDir:dir},{now,probe:async()=>({code:1,issues:[{subject:'instagram',reason:'permissions'}]}),alert:()=>{calls++}});assert.equal(result.code,1);assert.equal(calls,1);
});
test('expired parking cannot conceal a stopped receiver',async()=>{
 const c={meta:{instagram:{enabled:true,dailyCallLimit:2000}}};
 for(const reason of ['daily_budget','rate_limit','usage_limit','backpressure']){
  const s={...healthy,last_attempt:now-3*86400000,last_loop:now-3*86400000,last_success:now-3*86400000,ready:false,reason,day:'2026-10-11',calls:2000,backoffUntil:now-1000,pending_events:30000};
  const r=await mod.probeMetaWatch(c,{now,readUnit:unit,readState:()=>s});assert.ok(r.issues.some(x=>x.reason==='receiver_not_called'),reason);
 }
});
test('held object has its own alarm despite successful adjacent roads',async()=>{
 const result=await mod.probeMetaWatch(config,{now,readUnit:unit,readState:()=>({...healthy,ready:false,held_jobs:[{method:'conversation',object_id:'bad-root',reason:'normalize_identity'}]})});
 assert.equal(result.code,1);assert.equal(result.issues[0].object_id,'bad-root');
});
test('neighboring failure changes cannot resend the same incident within one day',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-watch-incidents-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const a={subject:'instagram',reason:'refresh_unknown'},b={subject:'threads',reason:'receiver_permissions'};let outputs=[],issues=[a];
 const probe=async()=>({code:1,issues,covered_subjects:['instagram','threads']}),alert=text=>{outputs.push(text)};await mod.runMetaWatch({stateDir:dir},{now,probe,alert});issues=[a,b];await mod.runMetaWatch({stateDir:dir},{now:now+1000,probe,alert});issues=[a];await mod.runMetaWatch({stateDir:dir},{now:now+2000,probe,alert});
 assert.equal(outputs.filter(x=>x.includes('refresh_unknown')).length,1);assert.equal(outputs.filter(x=>x.includes('recovery')).length,1);
});
test('unknown source state retains prior incidents instead of announcing recovery',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-watch-blind-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let issues=[{subject:'instagram',reason:'held_permissions'}],out=[];
 const probe=async()=>({code:1,issues,covered_subjects:issues[0].reason==='state_unreadable'?[]:['instagram']}),alert=x=>out.push(x);
 await mod.runMetaWatch({stateDir:dir},{now,probe,alert});issues=[{subject:'instagram',reason:'state_unreadable'}];await mod.runMetaWatch({stateDir:dir},{now:now+1000,probe,alert});assert.equal(out.filter(x=>x.includes('recovery')).length,0);
});
test('large valid incident group produces a journal the next run can still read',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-watch-bound-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const issues=Array.from({length:1000},(_,i)=>({subject:'instagram',reason:'held_permissions',object_id:String(10000000000000000000n+BigInt(i))}));let sent=0;const probe=async()=>({code:1,issues}),alert=()=>{sent++};
 await mod.runMetaWatch({stateDir:dir},{now,probe,alert});assert.ok(fs.statSync(path.join(dir,'meta-watch-incidents.json')).size<=65536);assert.equal((await mod.runMetaWatch({stateDir:dir},{now:now+86400000,probe,alert})).code,1);assert.equal(sent,2);
});
test('refresh API attempts cannot replace receiver heartbeat',async()=>{
 const result=await mod.probeMetaWatch(config,{now,readUnit:unit,readState:()=>({...healthy,last_loop:now-3*86400000,last_success:now-3*86400000,last_attempt:now})});assert.ok(result.issues.some(x=>x.reason==='receiver_not_called'));
});
import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {Store} from '../src/store.mjs';import {MetaReader} from '../src/meta-receiver.mjs';
test('tree stand without node_modules runs the installed reader as Anna: healthy, budget, recovery',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-tree-stand-'));fs.chmodSync(dir,0o755);t.after(()=>{const r=childProcess.spawnSync('sudo',['-n','rm','-rf','--',dir]);assert.equal(r.status,0)});
 const pkg=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'),source=path.join(dir,'source/packages/dsh-socseti'),live=path.join(dir,'installed');fs.mkdirSync(path.join(source,'test'),{recursive:true});fs.mkdirSync(live);
 for(const d of [source,live]){fs.cpSync(path.join(pkg,'src'),path.join(d,'src'),{recursive:true});fs.copyFileSync(path.join(pkg,'package.json'),path.join(d,'package.json'))}
 fs.symlinkSync(fs.realpathSync(path.join(pkg,'node_modules')),path.join(live,'node_modules'),'dir');assert.equal(fs.existsSync(path.join(source,'node_modules')),false);
 const configFile=path.join(dir,'config.json'),stand=path.join(source,'test/stend-meta-watch.mjs');
 // Only immutable data paths are mapped; the stand and reader logic are the candidate's.
 const text=fs.readFileSync(path.join(pkg,'test/stend-meta-watch.mjs'),'utf8').replace(/^const ROOT='[^']+',CONFIG='[^']+';/m,'const ROOT='+JSON.stringify(live)+',CONFIG='+JSON.stringify(configFile)+';');fs.writeFileSync(stand,text,{mode:0o644});
 const targets={vk:'127999849',instagram:'17841453053403067',threads:'26794519373575025',telegram:'-1001925584120'},stateDir=path.join(dir,'state'),store=new Store(stateDir,targets,{profile:'anna'}),meta={instagram:{enabled:true,armed:true,apiVersion:'v22.0',token:{file:'/tmp/dummy-token'},startAt:'2026-10-14T00:00:00Z'}},reader=new MetaReader(store,'instagram',meta.instagram);
 const at=Date.now(),healthy={last_loop:at,last_attempt:at,last_success:at,last_completed_scan:at,ready:true,reason:null};reader.state.patch(healthy);store.close();
 fs.writeFileSync(configFile,JSON.stringify({profile:'anna',port:8899,stateDir,keyFiles:{anna:'/tmp/a',monitor:'/tmp/m',channel:'/tmp/c'},targets,meta}),{mode:0o600});
 const setOwner=()=>{const r=childProcess.spawnSync('sudo',['-n','chown','-R','anna:anna',stateDir,configFile]);assert.equal(r.status,0,String(r.stderr))};setOwner();
 const outcomes=[];
 for(const [phase,reason,want] of [['healthy',null,0],['budget','daily_budget',1],['recovered',null,0]]){
  // Seed fixture state through SQLite; the external reader opens it read-only.
  const patch=JSON.stringify({...healthy,reason,day:new Date().toISOString().slice(0,10),calls:reason?2000:0});
  const update=`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.prepare('UPDATE meta_state SET json=?').run(process.argv[2]);db.close()`;
  let r=childProcess.spawnSync('sudo',['-n','-u','anna','--','/usr/local/bin/node','--input-type=module','-e',update,path.join(stateDir,'socseti.sqlite'),patch],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  r=childProcess.spawnSync('sudo',['-n','-u','iskra','--','env','-u','META_WATCH_CONFIG','/usr/local/bin/node',stand],{encoding:'utf8',timeout:40000});assert.equal(r.status,want,r.stdout+r.stderr);const out=JSON.parse(r.stdout);assert.equal(out.code,want);assert.equal(out.reader.account,'anna');assert.equal(out.reader.root,live);assert.equal(out.reader.version,'3.1.10');assert.deepEqual(out.issues,reason?[{subject:'instagram',reason:'current_coverage_daily_budget'}]:[]);outcomes.push(r.status);console.log('TREE-STAND-CASE '+JSON.stringify({phase,source_node_modules:false,code:out.code,issues:out.issues,reader:out.reader}))
 }
 for(const args of [['env','META_WATCH_CONFIG=/wrong/config','/usr/local/bin/node',stand],['env','-u','META_WATCH_CONFIG','/usr/local/bin/node',stand,'--bogus']]){const r=childProcess.spawnSync('sudo',['-n','-u','iskra','--',...args],{encoding:'utf8',timeout:40000});assert.equal(r.status,2,r.stdout+r.stderr)}
 const probeFile=path.join(live,'src/meta-watch.mjs'),probeBody=fs.readFileSync(probeFile);try{fs.writeFileSync(probeFile,'export async function probeMetaWatch(){return {issues:[]}}');const r=childProcess.spawnSync('sudo',['-n','-u','anna','--','env','-u','META_WATCH_CONFIG','/usr/local/bin/node',stand],{encoding:'utf8',timeout:40000});assert.equal(r.status,2,'unknown probe result must not become direct-Anna green: '+r.stdout+r.stderr)}finally{fs.writeFileSync(probeFile,probeBody)}
 assert.deepEqual(outcomes,[0,1,0]);const absent=childProcess.spawnSync('sudo',['-n','-u','anna','--','/usr/bin/test','!','-e',path.join(stateDir,'meta-watch-incidents.json')]);assert.equal(absent.status,0,'probe must not alert/write incidents (checked as state owner)');
});
