import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const positive=n=>Number.isSafeInteger(n)&&n>0;
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
export function selectLivePressure(proof,{model,adapterDir,readFile=fs.readFileSync,now=Date.now}={}){
 const blind=prichina=>({prichina});
 try{
  if(proof?.schema!==1)return blind('live-pressure-missing');
  const age=now()-proof.observedAt;
  if(!Number.isSafeInteger(proof.observedAt)||age>30000||age< -5000)return blind('live-pressure-stale');
  const p=proof.policy,identity=proof.process,a=proof.adapter;
  if(proof.route?.provider!=='claude-oauth'||proof.route.model!==model)return blind('live-pressure-route');
  if(!positive(identity?.pid)||!/^\d+$/.test(identity.startTicks??''))return blind('live-pressure-process');
  if(!positive(p?.window)||typeof p.ratio!=='number'||!Number.isFinite(p.ratio)||p.ratio<=0||p.ratio>=1
   ||!nonnegative(p.headroomTokens)||!nonnegative(p.reservedCompletionTokens)||p.auto!==true)return blind('live-pressure-policy');
  if(typeof adapterDir!=='string'||!path.isAbsolute(adapterDir))return blind('live-pressure-code-path');
  const version=JSON.parse(readFile(path.join(adapterDir,'package.json'),'utf8')).version;
  if(a?.version!==version||a.sourceSha!==sha(readFile(path.join(adapterDir,'src/index.js')))
   ||a.policySha!==sha(readFile(path.join(adapterDir,'src/live-pressure.js'))))return blind('live-pressure-code-drift');
  const stat=String(readFile(`/proc/${identity.pid}/stat`,'utf8'));
  if(stat.slice(stat.lastIndexOf(') ')+2).trim().split(/\s+/)[19]!==identity.startTicks)return blind('live-pressure-process-changed');
  const command=String(readFile(`/proc/${identity.pid}/cmdline`,'utf8')).split('\0');
  const home=path.dirname(path.dirname(adapterDir));
  if(!command.includes(path.join(home,'app/node_modules/@deepseek-ai/dsh/lib/bin.js'))||!command.includes('web'))return blind('live-pressure-process-route');
  const session=proof.session;
  if(typeof session?.id!=='string'||!session.id||session.id.length>200||!nonnegative(session.createdAt))return blind('live-pressure-session');
  const compact=proof.compact;
  if(compact!==null&&(!/^[a-f0-9-]{36}$/.test(compact?.id??'')||!nonnegative(compact.endSeq)||!positive(compact.time)||compact.time>proof.observedAt))return blind('live-pressure-compact');
  const porog=Math.floor(Math.min(p.window*p.ratio,p.window-p.reservedCompletionTokens-p.headroomTokens));
  if(!positive(porog))return blind('live-pressure-budget');
  return {porog,okno:p.window,dolya:p.ratio,headroomTokens:p.headroomTokens,pid:identity.pid,version,compact,session:{id:session.id,createdAt:session.createdAt}};
 }catch{return blind('live-pressure-unreadable')}
}
export class ContinuationCounter{
 constructor(limit=2){this.limit=limit;this.reset()}
 accepted(){this.stops++;return this.snapshot()}
 placed(ok){if(ok&&this.letters<this.limit)this.letters++;return this.snapshot()}
 reset(){this.stops=0;this.letters=0;return this.snapshot()}
 snapshot(){return {stops:this.stops,letters:this.letters,allowed:this.letters<this.limit}}
}

// B-N-2009: handles keep the conversation key, so a reset cannot detach an in-flight request from its current budget.
export class ContinuationCounters {
 constructor(limit=2){this.limit=limit;this.counters=new Map()}
 for(key){
  if(typeof key!=='string'||!key)throw Error('Continuation conversation key missing');
  const active=()=>{
   let counter=this.counters.get(key);
   if(!counter){counter=new ContinuationCounter(this.limit);this.counters.set(key,counter)}
   return counter;
  };
  return {
   accepted:()=>active().accepted(),
   placed:ok=>active().placed(ok),
   snapshot:()=> (this.counters.get(key)||new ContinuationCounter(this.limit)).snapshot(),
   reset:()=>{const counter=this.counters.get(key)||new ContinuationCounter(this.limit);this.counters.delete(key);return counter.reset()},
  };
 }
}
