import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';import {execFileSync} from 'node:child_process';
import {loadConfig} from './config.mjs';import {canonical,hash} from './store.mjs';
export function readMetaUnit(unit){
 if(!/^(anna-meta-watch|anna-(instagram|threads)-token-refresh)\.timer$/.test(unit))throw Error('unit rejected');
 const text=execFileSync('/usr/bin/systemctl',['show',unit,'--property=LoadState,ActiveState,UnitFileState'],{encoding:'utf8',timeout:5000,maxBuffer:4096,stdio:['ignore','pipe','ignore']});
 const value={};for(const line of text.trim().split('\n')){const i=line.indexOf('=');if(i<1||Object.hasOwn(value,line.slice(0,i)))throw Error('unit shape');value[line.slice(0,i)]=line.slice(i+1)}
 return value;
}
export function readMetaState(config,provider){
 const dir=fs.lstatSync(config.stateDir),file=path.join(config.stateDir,'socseti.sqlite'),st=fs.lstatSync(file);
 if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid()||(dir.mode&0o077)!==0||!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o777)!==0o600||st.nlink!==1)throw Error('private state');
 const db=new DatabaseSync(file,{readOnly:true});
 try{const row=db.prepare('SELECT json FROM meta_state WHERE source=?').get(provider+':'+config.targets[provider]);if(!row||row.json.length>65536)throw Error('state missing');const s=JSON.parse(row.json);s.held_jobs=db.prepare('SELECT json FROM meta_jobs WHERE source=?').all(provider+':'+config.targets[provider]).map(r=>JSON.parse(r.json)).filter(j=>j.state==='held').map(j=>({method:j.method,object_id:j.args.id??config.targets[provider],reason:j.reason}));s.held_objects=db.prepare('SELECT object_id,reason FROM meta_holds WHERE source=? ORDER BY object_id LIMIT 20').all(provider+':'+config.targets[provider]);s.pending_events=db.prepare("SELECT count(*) n FROM events e WHERE EXISTS(SELECT 1 FROM outbox o WHERE o.aggregate_id=e.id AND o.kind IN ('anna_event','event_card_request') AND o.state NOT IN ('delivered','tg_sent'))").get().n;const after=fs.lstatSync(file);if(after.ino!==st.ino||after.dev!==st.dev)throw Error('state changed');return s}
 finally{db.close()}
}
export async function probeMetaWatch(config,{now=Date.now(),readUnit=readMetaUnit,readState=p=>readMetaState(config,p)}={}){
 const enabled=Object.entries(config.meta??{}).filter(([,c])=>c.enabled);
 if(!enabled.length)return {code:2,issues:[{subject:'meta',reason:'not_configured'}]};
 const issues=[],covered_subjects=[],units=['anna-meta-watch.timer',...enabled.filter(([,c])=>c.refresh?.enabled).map(([p])=>'anna-'+p+'-token-refresh.timer')];
 for(const unit of units){
  try{const s=await readUnit(unit);covered_subjects.push(unit);if(s.LoadState!=='loaded'||s.ActiveState!=='active'||!['enabled','enabled-runtime'].includes(s.UnitFileState))issues.push({subject:unit,reason:'timer_unarmed'})}
  catch{issues.push({subject:unit,reason:'timer_unreadable'})}
 }
 for(const [provider,c] of enabled){
  try{
   const s=await readState(provider);if(!s||typeof s!=='object')throw Error('state');covered_subjects.push(provider);
   const heartbeat=Number.isSafeInteger(s.last_loop)&&now-s.last_loop<=2100000&&s.last_loop<=now+300000;
   const parked=heartbeat&&(s.reason==='daily_budget'&&s.day===new Date(now).toISOString().slice(0,10)&&s.calls>=(c.dailyCallLimit??2000)||['rate_limit','usage_limit'].includes(s.reason)&&Number.isSafeInteger(s.backoffUntil)&&s.backoffUntil>now&&s.backoffUntil<=now+86400000||s.reason==='backpressure'&&s.pending_events>=30000);
   for(const held of [...(s.held_jobs??[]),...(s.held_objects??[])])issues.push({subject:provider,reason:'held_'+(/^[a-z_:]{1,96}$/.test(held.reason)?held.reason:'invalid_state'),object_id:held.object_id,generation:s.refresh?.id??c.accessEpoch??0});
   if(!heartbeat||!parked&&(!Number.isSafeInteger(s.last_attempt)||now-s.last_attempt>2100000))issues.push({subject:provider,reason:'receiver_not_called'});
   if(s.reason&&!parked&&s.reason!=='series_budget')issues.push({subject:provider,reason:'receiver_'+(/^[a-z_]{1,40}$/.test(s.reason)?s.reason:'invalid_state')});
   if(!parked&&s.ready===false&&Number.isSafeInteger(s.last_success)&&now-s.last_success>7200000)issues.push({subject:provider,reason:'scan_stalled'});
   if(c.refresh?.enabled){
    const r=s.refresh;
    if(!r||!Number.isSafeInteger(r.last_attempt)||now-r.last_attempt>108000000)issues.push({subject:provider,reason:'refresh_not_called'});
    else if(!Number.isSafeInteger(r.expires_at))issues.push({subject:provider,reason:'expiry_unknown'});
    else if(r.expires_at-now<=7*86400000)issues.push({subject:provider,reason:'token_expiring'});
    if(r&&r.phase!=='idle')issues.push({subject:provider,generation:r.id??0,reason:'refresh_'+(/^[a-z_]{1,40}$/.test(r.phase)?r.phase:'invalid_state')});
   }
  }catch{issues.push({subject:provider,reason:'state_unreadable'})}
 }
 return {code:issues.length?1:0,issues,covered_subjects};
}
export async function runMetaWatch(config,{probe=probeMetaWatch,alert=text=>execFileSync('/usr/local/bin/agent-alert',['--plain'],{input:text,encoding:'utf8',timeout:60000,maxBuffer:4096,stdio:['pipe','ignore','ignore']}),now=Date.now()}={}){
 const result=await probe(config),file=path.join(config.stateDir,'meta-watch-incidents.json'),lock=file+'.lock';let fd;
 try{fd=fs.openSync(lock,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);const st=fs.fstatSync(fd);if(!st.isFile()||st.uid!==process.getuid()||(st.mode&0o777)!==0o600||st.nlink!==1)throw Error('lock');execFileSync('/usr/bin/flock',['-n','3'],{timeout:5000,stdio:['ignore','ignore','ignore',fd]})}catch{if(fd!==undefined)fs.closeSync(fd);return {...result,code:2,issues:[{subject:'meta_watch',reason:'incident_lock'}]}}
 try{
  let saved={};if(fs.existsSync(file)){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o777)!==0o600||st.size>65536)throw Error('incident file');saved=JSON.parse(fs.readFileSync(file,'utf8'))}
  saved.incidents??={};const current=new Map();
  for(const issue of result.issues){const id=hash(canonical([issue.subject,issue.generation??0,issue.reason]));if(!current.has(id))current.set(id,{count:0,samples:[]});const group=current.get(id);group.count++;if(group.samples.length<3){const sample={...issue};if(typeof sample.object_id==='string'&&sample.object_id.length>128)sample.object_id='sha256:'+hash(sample.object_id);group.samples.push(sample)}}
  const write=()=>{const body=JSON.stringify(saved);if(Buffer.byteLength(body)>65535)throw Error('incident capacity');const staged=file+'.new-'+crypto.randomUUID();fs.writeFileSync(staged,body+'\n',{mode:0o600,flag:'wx'});fs.renameSync(staged,file)};
  const send=async(id,entry,text)=>{entry.attempt_at=now;entry.stage='attempting';saved.incidents[id]=entry;write();try{await alert(text);entry.stage='submitted'}catch{entry.stage='unconfirmed';result.code=1}write()};
  for(const [id,group] of current){const items=group.samples;const entry=saved.incidents[id]??{};entry.active=true;entry.items=items;entry.count=group.count;entry.updated_at=now;if(!Number.isSafeInteger(entry.attempt_at)||now-entry.attempt_at>=86400000)await send(id,entry,'B-N-2027 Meta '+JSON.stringify({count:entry.count,items}));else saved.incidents[id]=entry}
  for(const [id,entry] of Object.entries(saved.incidents))if(entry.active&&!current.has(id)&&(result.code===0||result.covered_subjects?.includes(entry.items?.[0]?.subject))){entry.active=false;entry.updated_at=now;await send(id,entry,'B-N-2027 Meta recovery '+JSON.stringify(entry.items))}
  for(const [id,entry] of Object.entries(saved.incidents))if(!entry.active&&now-entry.updated_at>7*86400000)delete saved.incidents[id];
  write();
  return result;
 }catch{return {code:2,issues:[{subject:'meta_watch',reason:'incident_storage'}]}}
 finally{fs.closeSync(fd)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3||!path.isAbsolute(process.argv[2])){console.error('СЛЕПО: meta-watch /absolute/config.json');process.exitCode=2}
 else try{const result=await runMetaWatch(loadConfig(process.argv[2]));console.log(JSON.stringify(result));process.exitCode=result.code}catch{console.error('СЛЕПО: Meta configuration/status unavailable');process.exitCode=2}
}
