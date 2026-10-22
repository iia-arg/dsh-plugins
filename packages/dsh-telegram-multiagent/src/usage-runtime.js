// R records native runtime facts only. Postman authenticates delivery IDs; no model job labels.
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {receiptFacts,sobytiyaSessii,nasledovanoSessii} from './message-receipts.js';
const validTime=x=>Number.isSafeInteger(x)&&x>=0;
const POLICY='/etc/dsh-telegram-multiagent/usage-runtime-policy.json';
function loadPolicy(file){
 let fd;
 try{
  if(!path.isAbsolute(file)||fs.realpathSync(file)!==file)throw Error();
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.uid!==0||st.nlink!==1||(st.mode&0o022)||st.size>16384)throw Error();
  const buf=Buffer.alloc(16385),n=fs.readSync(fd,buf,0,buf.length,0),after=fs.fstatSync(fd);
  if(n!==st.size||st.size!==after.size||st.mtimeMs!==after.mtimeMs||st.ctimeMs!==after.ctimeMs)throw Error();
  const raw=buf.subarray(0,n).toString('utf8'),p=JSON.parse(raw),keys=[...raw.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map(m=>JSON.parse('"'+m[1]+'"'));
  if(!p||Array.isArray(p)||keys.length!==3||new Set(keys).size!==3||Object.keys(p).length!==3||p.schemaVersion!==1||!Object.hasOwn(p,'fileMaxBytes')||!Object.hasOwn(p,'recordMaxBytes')||!Number.isSafeInteger(p.fileMaxBytes)||!Number.isSafeInteger(p.recordMaxBytes)||p.recordMaxBytes<=0||p.fileMaxBytes<p.recordMaxBytes)throw Error();
  return p;
 }finally{if(fd!==undefined)fs.closeSync(fd)}
}
export class UsageRuntime {
 constructor(ledger,recipient,{heartbeatMs=15000,log=()=>{},policyPath=POLICY}={}){
  this.ledger=ledger;this.recipient=recipient;this.file=path.join(ledger.root,'usage-runtime-v1.jsonl');this.generation=randomUUID();this.seq=0;this.pending=0;this.tail=Promise.resolve();this.failure=null;this.log=log;this.closed=false;this.observations=0;
  this.checkedTail=false;this.policyPath=policyPath;this.skippedRecords=0;
  try{this.limits=loadPolicy(policyPath)}catch{this.fail('R_POLICY_INVALID')}
  if(heartbeatMs){this.timer=setInterval(()=>this.watermark(),heartbeatMs);this.timer.unref()}
 }
 fail(reason){if((this.failure&&this.failure!=='R_POLICY_INVALID')||this.failure===reason)return;this.failure=reason;try{this.log('[usage] '+reason+' recipient='+this.recipient)}catch{}if(this.limits)this.enqueue({kind:'source_gap',reason,at:Date.now()})}
 skipRecord(){this.skippedRecords++;try{this.log('[usage] R_RECORD_TOO_LARGE skipped='+this.skippedRecords)}catch{}}
 emit(value){
  if(this.closed||(this.failure&&this.failure!=='R_POLICY_INVALID'))return;
  if(this.pending>=1023){this.fail('SOURCE_GAP');return}
  this.enqueue(value);
 }
 enqueue(value){
  const raw=JSON.stringify({schemaVersion:1,generation:this.generation,seq:++this.seq,uid:process.getuid(),recipient:this.recipient,...value})+'\n';
  this.pending++;
  this.tail=this.tail.then(async()=>{
   if(this.failure&&this.failure!=='R_POLICY_INVALID'&&value.kind!=='source_gap'){this.pending--;return}
   let fd;
   try{
    try{this.limits=loadPolicy(this.policyPath)}catch{throw Error('R_POLICY_INVALID')}
    if(this.failure==='R_POLICY_INVALID')this.failure=null;
    if(Buffer.byteLength(raw)>this.limits.recordMaxBytes)throw Error('R_RECORD_TOO_LARGE');
    const st=await fs.promises.lstat(this.ledger.root);
    if(!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('R_SOURCE_UNSAFE');
    fd=await fs.promises.open(this.file,fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK,0o600);
    const info=await fd.stat();
    if(!info.isFile()||info.uid!==process.getuid()||(info.mode&0o777)!==0o600||info.nlink!==1)throw Error('R_SOURCE_UNSAFE');
    let seal=false;
    if(!this.checkedTail&&info.size){const last=Buffer.alloc(1);if((await fd.read(last,0,1,info.size-1)).bytesRead!==1)throw Error('SOURCE_GAP');seal=last[0]!==10}
    if(info.size+(seal?1:0)+Buffer.byteLength(raw)>this.limits.fileMaxBytes){
     if(this.failure)throw Error(this.failure);
     await fd.close();fd=null;await this.reset(Buffer.byteLength(raw));
     fd=await fs.promises.open(this.file,fs.constants.O_RDWR|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
     const fresh=await fd.stat();if(!fresh.isFile()||fresh.uid!==process.getuid()||(fresh.mode&0o777)!==0o600||fresh.nlink!==1||fresh.size!==0)throw Error('R_SOURCE_UNSAFE');seal=false;
    }
    if(Buffer.byteLength(raw)>this.limits.recordMaxBytes)throw Error('R_RECORD_TOO_LARGE');
    if(seal){await fd.writeFile('\n');await fd.sync()}
    this.checkedTail=true;
    await fd.writeFile(raw);await fd.sync();
   }catch(e){if(e.message==='R_RECORD_TOO_LARGE'){this.skipRecord();return}if(e.message==='R_POLICY_INVALID')this.limits=null;this.fail(e.code==='ELOOP'?'R_SOURCE_UNSAFE':(['R_SOURCE_UNSAFE','SOURCE_GAP','R_RESET_FAILED','R_POLICY_INVALID'].includes(e.message)?e.message:'SOURCE_GAP'))}
   finally{if(fd)await fd.close().catch(()=>{});this.pending--}
  });
 }
 async reset(recordBytes){
  try{this.limits=loadPolicy(this.policyPath)}catch{throw Error('R_POLICY_INVALID')}
  if(recordBytes>this.limits.recordMaxBytes)throw Error('R_RECORD_TOO_LARGE');
  let tmp=path.join(this.ledger.root,'.usage-runtime-reset-'+randomUUID()+'.tmp'),fd,dir,created=false;
  try{
   fd=await fs.promises.open(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
   created=true;
   await fd.sync();await fd.close();fd=null;
   await fs.promises.rename(tmp,this.file);tmp=null;
   dir=await fs.promises.open(this.ledger.root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);await dir.sync();
  }catch{throw Error('R_RESET_FAILED')}
  finally{if(fd)await fd.close().catch(()=>{});if(dir)await dir.close().catch(()=>{});if(tmp&&created)await fs.promises.unlink(tmp).catch(()=>{})}
 }
 facts(session,turn){
  const events=sobytiyaSessii(session),starts=events.filter(e=>e.type==='turn/start'&&e.data?.turn===turn),ends=events.filter(e=>e.type==='turn/end'&&e.data?.turn===turn);
  if(starts.length!==1||ends.length>1||!validTime(starts[0].time)||!Number.isSafeInteger(starts[0].seq)||!Number.isSafeInteger(session.header?.createdAt)||typeof session.id!=='string'||!Number.isSafeInteger(turn)||turn<0||events.indexOf(starts[0])<nasledovanoSessii(session))throw Error('R_NATIVE_BOUNDARY_UNPROVEN');
  if(ends.length&&(!validTime(ends[0].time)||!Number.isSafeInteger(ends[0].seq)||ends[0].seq<=starts[0].seq||ends[0].time<starts[0].time))throw Error('R_NATIVE_BOUNDARY_UNPROVEN');
  const rs=this.ledger.db.prepare('SELECT id,dsh_id,logical_key FROM receipts WHERE session_id=? AND session_created=? AND dsh_id IS NOT NULL').all(session.id,session.header.createdAt);
  const facts=receiptFacts(session,rs.map(r=>r.dsh_id));const links=[];
  for(const r of rs){
   const claims=facts.get(r.dsh_id).claims.filter(c=>c.turn===turn);
   if(!claims.length)continue;
   if(claims.length!==1||!validTime(claims[0].time)||claims[0].time<starts[0].time||(ends.length&&claims[0].time>ends[0].time))throw Error('R_NATIVE_BOUNDARY_UNPROVEN');
   // An ID-only notice is a reference, never an assertion that the sender was authenticated.
   const m=/^ap-notice:([a-f0-9]{64})$/.exec(r.logical_key??'');
   links.push({receiptId:r.id,messageId:r.dsh_id,claimedAt:claims[0].time,deliveryId:m?.[1]??null});
  }
  return {sessionId:session.id,sessionCreated:session.header.createdAt,turn,turnStartedAt:starts[0].time,finishedAt:ends[0]?.time??null,turnOutcome:ends[0]?.data?.reason?.kind??null,claimedAt:links.length?Math.min(...links.map(r=>r.claimedAt)):null,deliveryIds:links.filter(r=>r.deliveryId!==null).map(r=>r.deliveryId).sort(),claims:links};
 }
 request(agent,descriptor){
  try{
   if(agent.status!=='running'||!descriptor?.request_id||descriptor.binding?.session_id!==agent.session.id||descriptor.binding?.session_created!==agent.session.header.createdAt||descriptor.binding?.generation!==this.ledger.owner)throw Error('R_BINDING_UNPROVEN');
   const f=this.facts(agent.session,descriptor.binding.turn);
   if(f.finishedAt!==null)throw Error('R_BINDING_UNPROVEN');
   this.emit({kind:'runtime_request',requestId:descriptor.request_id,requestGeneration:descriptor.binding.generation,registeredAt:this.ledger.now(),...f});
  }catch(e){this.fail(/^R_/.test(e.message)?e.message:'SOURCE_GAP')}
 }
 observe(session,turn=null,expectEnd=false){
  try{
   const event=sobytiyaSessii(session).findLast(e=>e.type==='turn/start'||e.type==='turn/end');
   if(turn===null&&!event)return;
   const facts=this.facts(session,turn===null?event.data?.turn:turn);
   if(expectEnd&&facts.finishedAt===null)throw Error('R_NATIVE_BOUNDARY_UNPROVEN');
   this.emit({kind:'runtime_turn',...facts});
  }catch(e){this.fail(/^R_/.test(e.message)?e.message:'SOURCE_GAP')}
 }
 async afterFlush(session,turn,persisted){
  this.observations++;
  try{await persisted;if(!Number.isSafeInteger(turn)||turn<0)throw Error('R_NATIVE_BOUNDARY_UNPROVEN');this.observe(session,turn,true)}catch(e){this.fail(e.message==='R_NATIVE_BOUNDARY_UNPROVEN'?e.message:'R_DURABILITY_UNPROVEN')}finally{this.observations--}
 }
 watermark(at=Date.now()){if(this.observations)return;if(!validTime(at)){this.fail('R_NATIVE_BOUNDARY_UNPROVEN');return}this.emit({kind:'watermark',at})}
 async flush(){for(;;){const tail=this.tail;await tail;if(tail===this.tail)return}}
 async close(){clearInterval(this.timer);this.closed=true;await this.flush()}
}
