// RU: Числовой снимок в памяти живого шлюза; private Unix IPC, без записи mapping/текста/ключей.
// EN: Numeric state in the live gateway; private Unix IPC, no mapping/text/credential writes.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
const positive=n=>nonnegative(n)&&n>0;
// B-N-2009 supplies the wire bytes; the same three values identify a conversation.
function addressBinding(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(value))return null;
 try{const b=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
  return b&&Object.keys(b).sort().join(',')==='key,session_created,session_id'
   &&typeof b.key==='string'&&b.key&&typeof b.session_id==='string'&&b.session_id
   &&nonnegative(b.session_created)?b:null;
 }catch{return null}
}
const addressKey=b=>JSON.stringify([b.key,b.session_id,b.session_created]);
export async function createContextStatus(dbPath,{now=Date.now,provider='openai'}={}){
 if(!['openai','anthropic'].includes(provider))throw Error('context-status provider unsupported');
 const socketPath=path.resolve(dbPath)+'.context-status.sock';
 if(Buffer.byteLength(socketPath)>107)throw Error('context-status socket path exceeds107bytes');
 try{
  const st=fs.lstatSync(socketPath);
  if(!st.isSocket()||st.uid!==process.getuid())throw Error('context-status endpoint is not our socket');
  const active=await new Promise(resolve=>{
   const c=net.connect(socketPath);let done=false;
   const finish=value=>{if(done)return;done=true;clearTimeout(t);c.destroy();resolve(value)};
   const t=setTimeout(()=>finish(true),250);
   c.once('connect',()=>finish(true));c.once('error',e=>finish(!['ECONNREFUSED','ENOENT'].includes(e.code)));
  });
  if(active)throw Error('context-status publisher already active');
  const current=fs.lstatSync(socketPath);
  if(!current.isSocket()||current.ino!==st.ino||current.dev!==st.dev)throw Error('context-status endpoint changed');
  fs.unlinkSync(socketPath);
 }catch(e){if(e.code!=='ENOENT')throw e}
 const generation=randomUUID(),ticks=fs.readFileSync(`/proc/${process.pid}/stat`,'utf8').split(') ').at(-1).trim().split(/\s+/)[19];
 const entries=new Map(),connections=new Set();let closed=false,httpPending=0;
 const serialize=q=>{
  const binding=addressBinding(q?.address);
  if(q?.schema!==1||Object.keys(q).sort().join(',')!=='address,schema'||!binding)throw Error('request invalid');
  const reply=JSON.stringify({schema:1,spoolConversation:1,provider,pid:process.pid,startTicks:ticks,generation,address:q.address,
    snapshot:entries.get(addressKey(binding))?.snapshot??null})+'\n';
  if(Buffer.byteLength(reply)>4096)throw Error('response oversized');return reply;
 };
 const server=net.createServer(c=>{
  if(connections.size>=32){c.destroy();return}connections.add(c);
  let bytes=Buffer.alloc(0),answered=false;
  const timer=setTimeout(()=>c.destroy(),500);
  c.on('error',()=>{});c.once('close',()=>{clearTimeout(timer);connections.delete(c)});
  c.on('data',chunk=>{
   if(answered)return;bytes=Buffer.concat([bytes,chunk]);
   if(bytes.length>4096){c.destroy();return}
   if(!bytes.includes(10))return;answered=true;
   try{
    c.end(serialize(JSON.parse(bytes.toString('utf8').trim())));
   }catch{c.end('{"schema":1,"supported":false,"reason":"request-invalid"}\n')}
  });
 });
 // Node unlinks its original bind path on close/exit. Publish another hard link atomically,
 // then remove that original name so Node cannot remove a replaced advertised endpoint.
 const dirFd=fs.openSync(path.dirname(socketPath),'r');let endpoint;
 const boundPath=`/proc/self/fd/${dirFd}/.context-${randomUUID()}`;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(boundPath,resolve)});
  fs.chmodSync(boundPath,0o600);endpoint=fs.lstatSync(boundPath);
  fs.linkSync(boundPath,socketPath);fs.unlinkSync(boundPath);
 }catch(e){
  await new Promise(resolve=>server.close(resolve));
  try{const st=fs.lstatSync(socketPath);if(endpoint&&st.isSocket()&&st.ino===endpoint.ino&&st.dev===endpoint.dev)fs.unlinkSync(socketPath)}catch{}
  fs.closeSync(dirFd);throw e;
 }
 server.unref();
 return {socketPath,async http(req,res){
  if(closed||httpPending>=32){res.writeHead(503);res.end();return}httpPending++;
  try{
   const bytes=await new Promise((resolve,reject)=>{
    let parts=[],size=0,done=false;
    const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);req.removeListener('data',data);req.removeListener('end',end);req.removeListener('error',fault);req.removeListener('aborted',fault);error?reject(error):resolve(Buffer.concat(parts));};
    const data=chunk=>{size+=chunk.length;if(size>4096)finish(Error('frame oversized'));else parts.push(chunk)};
    const end=()=>finish(),fault=()=>finish(Error('request closed'));
    const timer=setTimeout(()=>finish(Error('request timeout')),500);
    req.on('data',data);req.once('end',end);req.once('error',fault);req.once('aborted',fault);
   });
   if(closed)throw Error('publisher closed');
   const reply=serialize(JSON.parse(bytes.toString('utf8')));res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(reply);
  }catch{if(!res.destroyed){res.writeHead(400,{'connection':'close'});res.end('{"schema":1,"supported":false}');}}finally{httpPending--}
 },begin(address,{model,threshold,compact,native}={}){
  if(closed)return null;
  // An unaddressed request cannot be attributed safely. Retire diagnostic snapshots,
  // never infer its conversation from SDK mapping or the initial message.
  const binding=addressBinding(address);
  // Cross-check the same address with the existing request envelope when available;
  // native identity never creates a diagnostic key or provides a fallback.
  if(!binding||native&&(binding.session_id!==native.dshId||binding.session_created!==native.dshCreated)){entries.clear();return null}
  const k=addressKey(binding);
  if(typeof model!=='string'||Buffer.byteLength(model)>200){entries.delete(k);return null}
  if(!entries.has(k)&&entries.size>=128){
   const oldest=[...entries].find(([,v])=>!v.snapshot.active);if(!oldest)return null;entries.delete(oldest[0]);
  }
  const row={requestId:randomUUID(),snapshot:{schema:1,generation,state:'waiting',active:true,startedAt:now(),model,
   threshold:positive(threshold)?threshold:null,compactEndSeq:compact?.endSeq??null}};
  entries.delete(k);entries.set(k,row);let ended=false,minimumMeasurementAt=row.snapshot.startedAt-1000;
  const current=()=>!closed&&!ended&&entries.get(k)?.requestId===row.requestId;
  return {
   token({time,last,window}){
    if(!current())return;const measuredAt=Date.parse(time);
    if(!(positive(window)||provider==='anthropic'&&window===null)||!nonnegative(last?.input_tokens)||!Number.isFinite(measuredAt)
     ||measuredAt<minimumMeasurementAt||measuredAt>now()+5000){
     row.snapshot={...row.snapshot,state:'blind',inputTokens:undefined,timestamp:undefined,reason:'invalid-token-count'};return;
    }
    row.snapshot={...row.snapshot,state:'measured',inputTokens:last.input_tokens,window,timestamp:new Date(measuredAt).toISOString(),afterCompact:false,reason:undefined};
   },
   compacted(event){if(current()){
    const at=Date.parse(event?.time),valid=Number.isFinite(at)&&at>=row.snapshot.startedAt-1000&&at<=now()+5000;
    minimumMeasurementAt=Math.max(minimumMeasurementAt,valid?at:now());
    row.snapshot={...row.snapshot,state:'waiting',inputTokens:undefined,timestamp:undefined,afterCompact:true};
   }},
   blind(){if(current())row.snapshot={...row.snapshot,state:'blind',inputTokens:undefined,timestamp:undefined,reason:'observer-unavailable'}},
   end(){if(current())row.snapshot={...row.snapshot,active:false};ended=true},
  };
 },async close(){
  if(closed)return;closed=true;entries.clear();for(const c of connections)c.destroy();
  await new Promise(resolve=>server.close(resolve));fs.closeSync(dirFd);
  try{const st=fs.lstatSync(socketPath);if(st.isSocket()&&st.ino===endpoint.ino&&st.dev===endpoint.dev)fs.unlinkSync(socketPath)}catch(e){if(e.code!=='ENOENT')throw e}
 }};
}
