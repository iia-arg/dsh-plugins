// Raw G proof. Numeric aggregation/job attribution belongs to the independent AP collector.
import {readEngineIdentity,sameEngineIdentity} from './engine-process.mjs';
import fs from 'node:fs';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import limits from './usage-limits.json' with {type:'json'};
if(limits?.schemaVersion!==1||Object.keys(limits).sort().join(',')!=='gatewayV1FileMaxBytes,schemaVersion'||!Number.isSafeInteger(limits.gatewayV1FileMaxBytes)||limits.gatewayV1FileMaxBytes<=65536)throw Error('G_USAGE_LIMITS_INVALID');
export const GATEWAY_USAGE_FILE_MAX_BYTES=limits.gatewayV1FileMaxBytes;
export function prepareGatewayUsage({provider,env=process.env,log=()=>{}}){
 if(!['openai','anthropic'].includes(provider))return null;
 let fd;
 try{
  const home=provider==='openai'?env.CODEX_HOME:env.HOME;
  if(typeof home!=='string'||!path.isAbsolute(home))throw Error('G_SOURCE_UNAVAILABLE');
  const dir=path.join(home,'.usage-meter'),file=path.join(dir,'gateway-v1.jsonl');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});const d=fs.lstatSync(dir);
  if(!d.isDirectory()||d.uid!==process.getuid()||(d.mode&0o777)!==0o700)throw Error('G_SOURCE_UNSAFE');
  try{fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK,0o600)}catch(e){if(e.code!=='EEXIST')throw e}
  const info=fd===undefined?fs.lstatSync(file):fs.fstatSync(fd);
  if(!info.isFile()||info.uid!==process.getuid()||(info.mode&0o777)!==0o600||info.nlink!==1)throw Error('G_SOURCE_UNSAFE');
  return file;
 }catch{try{log('[usage] G_SOURCE_UNAVAILABLE')}catch{}return null}
 finally{if(fd!==undefined)try{fs.closeSync(fd)}catch{}}
}
const queue={generation:randomUUID(),pending:0,failed:null};
const fields=['inputTokens','cachedInputTokens','cacheWriteInputTokens','outputTokens','reasoningOutputTokens'];
const good=x=>Number.isSafeInteger(x)&&x>=0;const id=x=>typeof x==='string'&&/^[a-zA-Z0-9:_-]{1,256}$/.test(x);
// A link is a route, never evidence of the effective auth store/provider.
function codexLink(home){
 try{
  if(typeof home!=='string'||!path.isAbsolute(home))return null;
  const file=path.join(home,'auth.json'),a=fs.lstatSync(file,{bigint:true});
  if(!a.isSymbolicLink())return null;
  const target=fs.readlinkSync(file),b=fs.lstatSync(file,{bigint:true});
  if(!b.isSymbolicLink()||a.dev!==b.dev||a.ino!==b.ino||a.ctimeNs!==b.ctimeNs)return {target};
  const match=/^\/etc\/claude-oauth\/codex-podpiska-([34])\/auth\.json$/.exec(target);
  if(!match)return {target};
  const epoch=createHash('sha256').update(JSON.stringify([target,String(a.dev),String(a.ino),String(a.ctimeNs)])).digest('hex');
  return {target,authEpoch:'symlink-'+epoch};
 }catch{return null}
}
export class GatewayUsage {
 constructor({file,engine,descriptor,heartbeatMs=15000,log=()=>{}}){
  this.file=file;this.engine=engine;this.log=log;this.generation=randomUUID();this.seq=0;this.pending=0;this.tail=Promise.resolve();this._failure=null;this.closed=false;
  const b=descriptor?.binding??{};this.context={requestId:descriptor?.request_id,sessionId:b.session_id,sessionCreated:b.session_created,dshTurn:b.turn,requestGeneration:b.generation,recipient:b.recipient,uid:process.getuid(),engine};
  if(![descriptor?.request_id,b.session_id,b.generation,b.recipient].every(id)||!Number.isSafeInteger(b.session_created)||!good(b.turn)||!['codex','claude'].includes(engine)){this.context={uid:process.getuid()};this.fail('G_BINDING_UNPROVEN');return}
  if(heartbeatMs){this.timer=setInterval(()=>this.emit({kind:'watermark',at:Date.now()}),heartbeatMs);this.timer.unref()}
 }
 get failure(){return this._failure||queue.failed}
 processGap(){if(queue.failed)return;queue.failed='SOURCE_GAP';this._failure='SOURCE_GAP';try{this.log('[usage] SOURCE_GAP process queue')}catch{}this.enqueue({kind:'source_gap',reason:'SOURCE_GAP',scope:'process'})}
 fail(reason){if(this.failure)return;if(queue.pending>=1023){this.processGap();return}this._failure=reason;try{this.log('[usage] '+reason)}catch{}this.enqueue({kind:'source_gap',reason,scope:'request'})}
 emit(record){if(this.failure||this.closed)return;if(queue.pending>=1023){this.processGap();return}this.enqueue(record)}
 enqueue(record){
  if(queue.pending>=1024)return;
  const raw=JSON.stringify({schemaVersion:1,processGeneration:queue.generation,generation:this.generation,seq:++this.seq,...this.context,observedAt:Date.now(),...(this.processEpoch?{processEpoch:this.processEpoch}:{}),...record})+'\n';
  if(Buffer.byteLength(raw)>65536){if(!this.failure)this.fail('SOURCE_GAP');return}
  this.pending++;queue.pending++;
  this.tail=this.tail.then(async()=>{
   if(this.failure&&record.kind!=='source_gap'){this.pending--;queue.pending--;return}
   let f;
   try{
    const dir=path.dirname(this.file);await fs.promises.mkdir(dir,{mode:0o700,recursive:true});const st=await fs.promises.lstat(dir);
    if(!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('G_SOURCE_UNSAFE');
    f=await fs.promises.open(this.file,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK,0o600);const info=await f.stat();
    if(!info.isFile()||info.uid!==process.getuid()||(info.mode&0o777)!==0o600||info.nlink!==1)throw Error('G_SOURCE_UNSAFE');
    if(info.size+Buffer.byteLength(raw)>GATEWAY_USAGE_FILE_MAX_BYTES)throw Error('SOURCE_GAP');await f.writeFile(raw);await f.sync();
   }catch(e){this.fail(e.code==='ELOOP'?'G_SOURCE_UNSAFE':e.message==='G_SOURCE_UNSAFE'?e.message:'SOURCE_GAP')}
   finally{if(f)await f.close().catch(()=>{});this.pending--;queue.pending--}
  });
 }
 engineProcess(child){
  if(this.failure||this.closed)return;
  try{
   if(!this.processEpoch||child?.exitCode!==null||child?.signalCode!==null)throw Error('G_PROCESS_UNPROVEN');
   const identity=readEngineIdentity(child.pid,process.pid);
   if(!sameEngineIdentity(identity,readEngineIdentity(child.pid,process.pid)))throw Error('G_PROCESS_UNPROVEN');
   this.emit({kind:'engine_process_binding',...identity,sourceProcess:{pid:identity.enginePid,boot:identity.boot_id,start:identity.engineStart},request_id:this.context.requestId,sessionId:this.context.sessionId,sessionCreated:this.context.sessionCreated,turn:this.context.dshTurn});
  }catch{this.fail('G_PROCESS_UNPROVEN')}
 }
 authUnknown(reason='SUBSCRIPTION_UNBOUND'){this.emit({kind:'auth',subscription:null,authEpoch:null,reason})}
 claudeHandle(tokenFile,{env={}}={}){
  this.processEpoch=randomUUID();this.emit({kind:'engine_process_start'});
  if(['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN'].some(k=>Boolean(env[k]))||['CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','CLAUDE_CODE_USE_FOUNDRY'].some(k=>env[k]&&!['0','false'].includes(env[k]))){this.authUnknown();return}
  const slot=/^\/etc\/claude-oauth\/token-podpiska-([123])$/.exec(tokenFile);
  if(!slot){this.authUnknown();return}
  this.emit({kind:'auth',subscription:'claude-'+slot[1],authEpoch:this.processEpoch,proof:'actual-sdk-fd3-handle'});
 }
 ready(engine){if(!id(engine?.thread_id)||!id(engine?.turn_id)){this.fail('G_ENGINE_ID_UNPROVEN');return}if(this.engine==='codex')this.codexReady();this.emit({kind:'engine_ready',threadId:engine.thread_id,turnId:engine.turn_id})}
 terminal(engine){if(!id(engine?.thread_id)||!id(engine?.turn_id)||!['completed','interrupted','failed'].includes(engine.status)){this.fail('G_TERMINAL_UNPROVEN');return}if(this.engine==='codex')this.codexTerminal();this.emit({kind:'engine_terminal',threadId:engine.thread_id,turnId:engine.turn_id,status:engine.status,proof:engine.proof??null})}
 claudeMessage(message){
  if(message?.type!=='assistant')return;
  const m=message.message??{};
  if((m.content??[]).some(b=>b?.type==='tool_use'&&['Agent','Task'].includes(b.name)))this.emit({kind:'unsupported',reason:'CLAUDE_NATIVE_SUBAGENT_UNSUPPORTED'});
  if(m.usage===undefined)return;
  const names=['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens'];
  if(!id(m.id)||!names.every(k=>good(m.usage[k]))){this.fail('SOURCE_SCHEMA_UNSUPPORTED');return}
  this.emit({kind:'assistant_usage',threadId:message.session_id??null,messageId:m.id,usage:Object.fromEntries(names.map(k=>[k,m.usage[k]]))});
 }
 protocol(method,p){
  try{
   if(method==='thread/started'){
    const t=p.thread;if(!id(t?.id)||(t.parentThreadId!==null&&t.parentThreadId!==undefined&&!id(t.parentThreadId))){this.fail('CHILD_SOURCE_UNSUPPORTED');return}
    this.emit({kind:'thread',threadId:t.id,parentThreadId:t.parentThreadId??null,rawPath:typeof t.path==='string'?t.path:null});
   }else if(['turn/started','turn/completed'].includes(method)){
    if(!id(p.threadId)||!id(p.turn?.id)){this.fail('G_ENGINE_ID_UNPROVEN');return}
    this.emit({kind:method==='turn/started'?'turn_started':'turn_terminal',threadId:p.threadId,turnId:p.turn.id,status:p.turn.status??null,startedAtSeconds:good(p.turn.startedAt)?p.turn.startedAt:null,completedAtSeconds:good(p.turn.completedAt)?p.turn.completedAt:null});
   }else if(method==='thread/tokenUsage/updated'){
    if(!id(p.threadId)||!id(p.turnId)||!['last','total'].every(k=>fields.every(f=>good(p.tokenUsage?.[k]?.[f])))){this.fail('SOURCE_SCHEMA_UNSUPPORTED');return}
    this.emit({kind:'protocol_usage',threadId:p.threadId,turnId:p.turnId,last:Object.fromEntries(fields.map(f=>[f,p.tokenUsage.last[f]])),total:Object.fromEntries(fields.map(f=>[f,p.tokenUsage.total[f]]))});
   }else if(method==='item/completed'&&p.item?.type==='collabAgentToolCall'){
    const i=p.item;if(!['spawnAgent','sendInput','resumeAgent','wait','closeAgent','sendMessage','followupTask','interruptAgent','listAgents'].includes(i.tool)||!id(p.threadId)||!id(p.turnId)||!id(i.id)||!Array.isArray(i.receiverThreadIds)||!i.receiverThreadIds.every(id)){this.emit({kind:'unsupported',reason:'CHILD_SOURCE_UNSUPPORTED'});return}
    this.emit({kind:'child_edge',threadId:p.threadId,turnId:p.turnId,tool:i.tool,callId:i.id,status:i.status??null,childThreadIds:i.receiverThreadIds});
   }
  }catch{this.fail('SOURCE_SCHEMA_UNSUPPORTED')}
 }
 codexSpawn(env={}){
  this.processEpoch=randomUUID();this.codexAuthDone=false;
  const overrides=['CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_API_KEY','OPENAI_ACCESS_TOKEN','OPENAI_FEDERATION_RULE_ID','OPENAI_IDENTITY_TOKEN_FILE','OPENAI_WORKLOAD_IDENTITY_CONTEXT'];
  const seed=codexLink(env.CODEX_HOME);
  this.codexAuth={home:env.CODEX_HOME,seed,valid:Boolean(seed?.authEpoch),ready:false,envOverride:overrides.some(k=>Object.hasOwn(env,k)),argvSafe:null};
  this.emit({kind:'engine_process_start',authLinkTargetAtStart:seed?.target??null,authLinkMeaning:'route-not-applied-source'});
 }
 codexSpawnArgs(args){
  const a=this.codexAuth;if(!a||this.codexAuthDone)return;
  a.argvSafe=a.argvSafe!==false&&Array.isArray(args)&&args.length===3&&args[0]==='app-server'&&args[1]==='--listen'&&args[2]==='stdio://';
 }
 codexInitialized(){} // No account/config/vendor RPC; effective auth remains unproven.
 codexReady(){
  if(this.codexAuthDone)return;
  const a=this.codexAuth;if(!a)return;
  const now=codexLink(a.home);a.valid=a.valid&&Boolean(now&&now.authEpoch===a.seed.authEpoch);a.ready=true;
 }
 codexTerminal(){
  if(this.codexAuthDone)return;
  const a=this.codexAuth,now=a?codexLink(a.home):null;this.codexAuthDone=true;
  let condition='EFFECTIVE_AUTH_CONFIG_UNPROVEN';
  if(!a?.ready)condition='LINK_POINT_MISSING';
  else if(!a.valid||!now?.authEpoch||now.authEpoch!==a.seed.authEpoch)condition='LINK_UNSTABLE_OR_UNAVAILABLE';
  else if(a.envOverride)condition='ENV_OVERRIDE';
  else if(a.argvSafe!==true)condition='SPAWN_ARGV_UNPROVEN';
  // 0.162.1 reloads cloud-aware config before creating its final AuthManager.
  // No authorised source attests that manager's store/provider. Never upgrade
  // a route (even with clean env/argv) into a positive subscription proof.
  this.authUnknown('AUTH_SOURCE_UNPROVEN:'+condition);
 }
 codexFinished(){if(!this.codexAuthDone){this.authUnknown('AUTH_SOURCE_UNPROVEN:LINK_POINT_MISSING');this.codexAuthDone=true}this.emit({kind:'engine_process_closed',closure:'local-client-close'})}
 async flush(){for(;;){const p=this.tail;await p;if(p===this.tail)return}}
 async close(){if(this.engine==='codex'&&this.codexAuth&&!this.codexAuthDone){this.authUnknown('AUTH_SOURCE_UNPROVEN:LINK_POINT_MISSING');this.codexAuthDone=true}clearInterval(this.timer);this.closed=true;await this.flush()}
}

