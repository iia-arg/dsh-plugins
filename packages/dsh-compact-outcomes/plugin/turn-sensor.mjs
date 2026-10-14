// Live sampler owned by dsh-compact-outcomes; no model calls, no alerts from the agent process.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
export const name='dsh-compact-outcomes-turns';
export const inject=['tokenMeter','llm'];
const LIMIT=8*1024*1024,KEEP=5;
export function appendRow(file,row){
 const text=JSON.stringify(row)+'\n';fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 if(fs.existsSync(file)&&fs.statSync(file).size+Buffer.byteLength(text)>LIMIT){
  for(let i=KEEP;i>=1;i--){const old=file+(i===1?'':'.'+(i-1));if(fs.existsSync(old))fs.renameSync(old,file+'.'+i)}
 }
 fs.appendFileSync(file,text,{mode:0o600});
}
export function sessionUuid(session,file){
 const first=session.deriveMessages?.()[0];if(!first)return null;
 const text=typeof first.content==='string'?first.content:(first.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
 const key=createHash('sha256').update((first.role??'')+'\0'+text).digest('hex').slice(0,32);
 const db=new DatabaseSync(file,{readOnly:true});try{const r=db.prepare('SELECT sessionId FROM sessions WHERE kluch=?').all(key);return r.length===1&&/^[a-f0-9-]{36}$/i.test(r[0].sessionId)?r[0].sessionId:null}finally{db.close()}
}
export function sobytiyaSessii(ctx,session){
 let pm;try{pm=ctx.get('pamyat')}catch{pm=undefined}
 return typeof pm?.sobytiyaSessii==='function'?pm.sobytiyaSessii(session):session.events;
}
export function installSensor(ctx,config,scopeTarget){
 if(!['alfa','beta','gamma'].includes(config.agent)||!path.isAbsolute(config.logDir)||!path.isAbsolute(config.gatewayDb))throw Error('turn sensor: agent/logDir/gatewayDb required');
 const parameters=new WeakMap();const seen=new WeakMap();
 ctx.on('agent/pre-step',async({agent,turn},next)=>{
  try{
   const session=agent.session;const target=session.requestHeader()?.config;const replies=[];
   ctx.emit(scopeTarget(agent,agent),'our/compaction-status',replies);
   if(replies.length!==1)throw Error('compaction config not unique');
   const c=replies[0];const policy=c.modelPolicies?.find(x=>x.provider===target?.provider&&x.model===target?.model);
   const ratio=policy?.thresholdRatio??c.thresholdRatio;
   let timer;
   let info;try{info=await Promise.race([ctx.get('llm').resolveModelInfo(target.provider,target.model),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('metadata timeout')),1000)})])}finally{clearTimeout(timer)}
   const window=info?.context?.contextWindow;
   if(!Number.isSafeInteger(window)||window<=0||!Number.isFinite(ratio)||ratio<=0||ratio>1)throw Error('window/threshold unavailable');
   parameters.set(session,{turn,window,threshold:Math.floor(window*ratio),auto:c.auto,model:target.model});
  }catch(e){parameters.set(agent.session,{turn,error:'window/threshold unavailable'})}
  return next();
 });
 ctx.on('session/event',(session,event)=>{
  if(event.type!=='turn/end'||seen.get(session)===event.seq)return;
  const row={time:event.time,agent:config.agent,session:session.id,created:session.header.createdAt,turn:event.data.turn,seq:event.seq,phase:'turn/end',tokens:null,threshold:null,window:null,auto:null,uuid:null,platform_seq:null,error:null};
  try{
   const m=ctx.get('tokenMeter').measure(session);if(!Number.isSafeInteger(m.totalTokens)||m.totalTokens<0)throw Error('invalid measurement');
   row.tokens=m.totalTokens;row.baseline=m.baseline?.kind??null;
   const param=parameters.get(session);if(param?.turn===row.turn)Object.assign(row,param);else row.error='no pre-step config for this turn';
   // B-N-738: журнал — через службу ядра ctx.pamyat (DSH 0.1.1 events | 0.1.7+/0.2.0 snapshotEvents()), БЕЗ inject; нет службы —
   // прежнее session.events. Журнал не читается — своя причина в строке, а корреляция по uuid всё равно делается (не падаем).
   const events=sobytiyaSessii(ctx,session);
   if(Array.isArray(events))row.platform_seq=Math.max(-1,...events.filter(e=>['compaction/start','compaction/summary','compaction/end','compaction/prune'].includes(e.type)).map(e=>e.seq));
   else row.error='session events unavailable (ни events, ни snapshotEvents)';
   row.uuid=sessionUuid(session,config.gatewayDb);
  }catch(e){row.error='measurement or correlation unavailable'}
  try{appendRow(path.join(config.logDir,config.agent+'.jsonl'),row);seen.set(session,event.seq)}catch(e){console.error('[compact-outcomes] turn log NOT written: '+e.code)}
 });
}
export function apply(ctx,config){
 const req=createRequire(path.join(config.appDir,'resolve.js'));
 installSensor(ctx,config,req('@deepseek-ai/dsh-scope').scopeTarget);
}
