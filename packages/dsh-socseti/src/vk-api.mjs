import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readPrivateFile} from './auth.mjs';
import {setTimeout as sleep} from 'node:timers/promises';
export const VK_GROUP=127999849;
// Read/write clients of the same credential share the API pace; LP has its own server.
// Only token hashes and timing/promise state remain in this process-local map.
const RATE_STATE=new Map();
export class VkReadError extends Error{constructor(reason,code=0){super('VK read rejected');this.reason=reason;this.code=code}}
export function readVkToken(ref){
 if(!ref||typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).length!==1)throw new VkReadError('token_reference');
 let token;
 if(ref.file){token=readPrivateFile(ref.file).trim()}
 else if(typeof ref.passRef==='string'&&/^[A-Za-z0-9_][A-Za-z0-9_./-]{0,1023}$/.test(ref.passRef)&&!ref.passRef.split('/').some(p=>!p||p==='.'||p==='..')){
  const p=spawnSync('pass',['show',ref.passRef],{encoding:'utf8',detached:true,timeout:5000,killSignal:'SIGKILL',maxBuffer:8192,stdio:['ignore','pipe','ignore']});
  if(p.pid){try{process.kill(-p.pid,'SIGKILL')}catch{}}
  if(p.status!==0)throw new VkReadError('token_reference');token=p.stdout.split('\n')[0];
 }else throw new VkReadError('token_reference');
 if(typeof token!=='string'||!token||token.length>4096||/[\r\n\0]/.test(token))throw new VkReadError('token_reference');return token;
}
export function vkSession(value){
 if(!value||typeof value.key!=='string'||!value.key||value.key.length>4096||/[\r\n\0]/.test(value.key)||typeof value.ts!=='string'||! /^(0|[1-9][0-9]{0,79})$/.test(value.ts))throw new VkReadError('session_shape');
 const server=new URL(value.server);
 if(server.protocol!=='https:'||!['lp.vk.com','lp.vk.ru'].includes(server.hostname)||server.port||server.username||server.password||server.search||server.hash||server.pathname!==`/whp/${VK_GROUP}`)throw new VkReadError('session_origin');
 return {server:server.href,key:value.key,ts:value.ts};
}
export class VkApi{
 constructor(token,{version='5.199',fetchImpl=fetch}={}){if(typeof token!=='string'||!token||/[\r\n\0]/.test(token)||!/^5\.\d+$/.test(version))throw new VkReadError('configuration');this.token=token;this.version=version;this.fetch=fetchImpl;this.abort=new AbortController();const key=crypto.createHash('sha256').update(token).digest('hex');if(!RATE_STATE.has(key))RATE_STATE.set(key,{next:0,tail:Promise.resolve()});this.rate=RATE_STATE.get(key)}
 stop(){this.abort.abort();this.token=''}
 async request(url,options,timeoutMs){
  const signal=AbortSignal.any([...(options.signal?[options.signal]:[]),this.abort.signal,AbortSignal.timeout(Math.max(1,Math.floor(Math.min(30000,timeoutMs))))]);
  try{const r=await this.fetch(url,{...options,signal,redirect:'error'});if(!r.ok)throw new VkReadError('http_status',r.status);let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>8388608)throw new VkReadError('response_limit');chunks.push(chunk)}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch(e){if(e instanceof VkReadError)throw e;throw new VkReadError('transport_or_json')}
 }
 schedule(work,timeoutMs=30000){
  const limit=Math.max(1,Math.floor(Math.min(30000,timeoutMs))),deadline=performance.now()+limit;
  const signal=AbortSignal.any([this.abort.signal,AbortSignal.timeout(limit)]);let canceled;
  const execute=async()=>{if(signal.aborted||performance.now()>=deadline)throw new VkReadError('not_started');const wait=this.rate.next-performance.now();if(wait>0)await sleep(wait,undefined,{signal});if(signal.aborted||performance.now()>=deadline)throw new VkReadError('not_started');try{return await work({signal,remaining:()=>Math.max(0,deadline-performance.now())})}finally{this.rate.next=performance.now()+350}};
  const pending=this.rate.tail.then(execute);this.rate.tail=pending.catch(()=>{});
  const aborted=new Promise((resolve,reject)=>{canceled=()=>reject(new VkReadError('stopped_or_deadline'));if(signal.aborted)canceled();else signal.addEventListener('abort',canceled,{once:true})});
  return Promise.race([pending,aborted]).finally(()=>signal.removeEventListener('abort',canceled));
 }
 async call(method,args={},options={}){
  // All writes are unavailable in this receiver. Unknown method/target rejects before HTTP.
  const fields={'groups.getLongPollServer':['group_id'],'messages.getConversations':['group_id','filter','count','offset'],'messages.getHistory':['group_id','peer_id','count','offset','rev'],'wall.getComment':['owner_id','comment_id'],'wall.getById':['posts'],'wall.get':['domain','filter','count','offset'],'wall.getComments':['owner_id','post_id','comment_id','count','offset','sort','preview_length','thread_items_count']};
  if(!fields[method]||Object.keys(args).some(k=>!fields[method].includes(k)))throw new VkReadError('method_or_target');
  const group=['groups.getLongPollServer','messages.getConversations','messages.getHistory'].includes(method)&&args.group_id===VK_GROUP;
  const wall=method==='wall.get'&&args.domain==='naostrov'||method==='wall.getById'&&typeof args.posts==='string'&&/^\-127999849_[1-9][0-9]{0,15}$/.test(args.posts);
  const singleComment=method==='wall.getComment'&&args.owner_id===-VK_GROUP&&Number.isSafeInteger(args.comment_id)&&args.comment_id>0;
  const comments=method==='wall.getComments'&&args.owner_id===-VK_GROUP&&Number.isSafeInteger(args.post_id)&&args.post_id>0;
  if(!group&&!wall&&!comments&&!singleComment)throw new VkReadError('method_or_target');
  const execute=async budget=>{if(budget.remaining()<=0)throw new VkReadError('not_started');const body=new URLSearchParams({...args,access_token:this.token,v:this.version});const data=await this.request('https://api.vk.com/method/'+method,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:budget.signal},budget.remaining());if(data?.error)throw new VkReadError('api_error',Number.isSafeInteger(data.error.error_code)?data.error.error_code:0);if(!Object.hasOwn(data??{},'response'))throw new VkReadError('response_shape');return data.response};
  return this.schedule(execute,options.timeoutMs??30000);
 }
 async poll(session,ts){const s=vkSession({...session,ts});const url=new URL(s.server);url.search=new URLSearchParams({act:'a_check',key:s.key,ts:s.ts,wait:'25'});return this.request(url.href,{method:'GET'},30000)}
}
