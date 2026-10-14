// RU: Private Unix IPC живого шлюза; точная беседа и завершённый compact, без rollout/SQLite reads.
// EN: Private live-gateway Unix IPC; exact conversation and completed compaction, no rollout/SQLite reads.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
const positive=n=>nonnegative(n)&&n>0;
function addressBinding(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(value))return null;
 try{const b=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
  return b&&Object.keys(b).sort().join(',')==='key,session_created,session_id'
   &&typeof b.key==='string'&&b.key&&typeof b.session_id==='string'&&b.session_id
   &&nonnegative(b.session_created)?b:null;
 }catch{return null}
}
function completedCompact(session){
 const events=typeof session.snapshotEvents==='function'?session.snapshotEvents():session.events
  ??(typeof session.eventAt==='function'?Array.from({length:session.seq},(_,i)=>session.eventAt(i)):null);
 if(!Array.isArray(events))throw Error('session events unavailable');
 const starts=new Map();let latest=null,previousSeq=-1;
 for(const e of events){
  if(!e||typeof e.type!=='string'||!nonnegative(e.seq)||e.seq<=previousSeq)throw Error('session event incomplete or unordered');
  previousSeq=e.seq;
  if(e.type==='compaction/start'||e.type==='compaction/end'){
   if(typeof e.data?.compactionId!=='string'||!e.data.compactionId||!positive(e.time))throw Error('compaction boundary incomplete');
   if(e.type==='compaction/start'){if(starts.has(e.data.compactionId))throw Error('duplicate compaction start');starts.set(e.data.compactionId,e)}
   else{const start=starts.get(e.data.compactionId);if(!start||e.seq<=start.seq||e.time<start.time)throw Error('compaction start unavailable or unordered');if(e.data.error===undefined)latest=e;starts.delete(e.data.compactionId)}
  }
 }
 return latest;
}
// Recheck after the caller's asynchronous work; a compaction can finish after IPC returns.
export function currentContextStatus(session,status){
 if(!status?.supported)return status;
 let compact;try{compact=completedCompact(session)}catch{return {supported:true,state:'blind',active:status.active,reason:'session-events-unavailable'}}
 if(!compact)return status;
 if(status.state==='measured'&&(nonnegative(status.compactEndSeq)&&status.compactEndSeq<compact.seq
  ||!nonnegative(status.compactEndSeq)&&status.startedAt<=compact.time))
  return {supported:true,state:'waiting',active:status.active,afterCompact:true};
 return {...status,afterCompact:true};
}
function exchange(socketPath,request){
 return new Promise((resolve,reject)=>{
  const c=net.connect(socketPath);let bytes=Buffer.alloc(0),done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);c.destroy();error?reject(error):resolve(value)};
  const timer=setTimeout(()=>finish(Error('context-status timeout')),750);
  c.once('error',e=>finish(e));c.once('end',()=>finish(Error('context-status incomplete')));
  c.once('connect',()=>c.write(JSON.stringify(request)+'\n'));
  c.on('data',chunk=>{
   bytes=Buffer.concat([bytes,chunk]);if(bytes.length>4096){finish(Error('context-status oversized'));return}
   if(bytes.includes(10))try{finish(null,JSON.parse(bytes.toString('utf8').trim()))}catch(e){finish(e)}
  });
 });
}
async function gatewayExchange(gateway,request){
 const url=new URL(gateway.baseURL);
 if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('gateway route unavailable');
 const file=gateway.ingressKeyFile;
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('ingress file unavailable');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);let key;
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.size>256||(st.mode&0o077)!==0||![0,process.getuid()].includes(st.uid))throw Error('ingress file untrusted');
  key=fs.readFileSync(fd,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(key))throw Error('ingress invalid');
 }finally{fs.closeSync(fd)}
 url.pathname='/context-status';
 const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(750),
  headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(request)});
 if(response.status!==200){await response.body?.cancel();throw Error('gateway status unsupported')}
 const parts=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>4096)throw Error('gateway status oversized');parts.push(chunk)}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export async function readContextStatus(session,{dbPath,gateway,address,now=Date.now,running=false,model}={}){
 try{
  if(!addressBinding(address))return {supported:true,state:'unbound',reason:'conversation-unestablished'};
  const request={schema:1,address};
  if(Buffer.byteLength(JSON.stringify(request))>4095)return {supported:false,reason:'identity-oversized'};
  let support;
  if(typeof dbPath==='string'&&dbPath){
   const socketPath=path.resolve(dbPath)+'.context-status.sock',st=fs.lstatSync(socketPath);
   if(!st.isSocket()||st.uid!==process.getuid()||(st.mode&0o077)!==0)return {supported:false,reason:'endpoint-untrusted'};
   support=await exchange(socketPath,request);
  }else if(gateway)support=await gatewayExchange(gateway,request);
  else return {supported:false,reason:'endpoint-unavailable'};
  if(support?.schema!==1||support.spoolConversation!==1||!['openai','anthropic'].includes(support.provider)||!positive(support.pid)||!/^\d+$/.test(support.startTicks??'')
   ||!/^[-a-f0-9]{36}$/.test(support.generation??''))return {supported:false,reason:'gateway-unsupported'};
  const ticks=fs.readFileSync(`/proc/${support.pid}/stat`,'utf8').split(') ').at(-1).trim().split(/\s+/)[19];
  if(ticks!==support.startTicks)return {supported:false,reason:'gateway-process-changed'};
  if(support.address!==address)return {supported:true,state:'unbound',reason:'conversation-mismatch'};
  let compact;try{compact=completedCompact(session)}catch{return {supported:true,state:'blind',reason:'session-events-unavailable'}}
  const waiting={supported:true,state:'waiting',afterCompact:compact!==null},s=support.snapshot;
  if(!s)return compact?waiting:{supported:true,state:'unbound',reason:'conversation-unestablished'};
  if(s.schema!==1||s.generation!==support.generation||!['waiting','measured','blind'].includes(s.state)||!positive(s.startedAt)
   ||typeof s.active!=='boolean'||(model&&s.model!==model))return {...waiting,state:'blind',reason:'snapshot-invalid'};
  if(compact&&(nonnegative(s.compactEndSeq)&&s.compactEndSeq<compact.seq
   ||!nonnegative(s.compactEndSeq)&&s.startedAt<=compact.time))return {...waiting,active:s.active};
  if(running&&!s.active)return {...waiting,state:compact?'waiting':'unbound',reason:'request-unestablished'};
  if(s.state!=='measured')return {...waiting,active:s.active,state:s.state,afterCompact:waiting.afterCompact||s.afterCompact===true,reason:s.reason};
  const at=Date.parse(s.timestamp);
  if(!nonnegative(s.inputTokens)||!(positive(s.window)||support.provider==='anthropic'&&s.window===null)||(s.threshold!==null&&!positive(s.threshold))||!Number.isFinite(at)||at<s.startedAt-1000||at>now()+5000)
   return {...waiting,active:s.active,state:'blind',reason:'snapshot-invalid'};
  return {supported:true,...s};
 }catch{return {supported:false,reason:'gateway-status-unavailable'}}
}
