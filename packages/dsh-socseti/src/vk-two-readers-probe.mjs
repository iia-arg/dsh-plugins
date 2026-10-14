// B-N-2027: bounded test-community observer, no writers/model/Telegram.
// A compatible fixture is not a measurement of VK. CLI requires --live.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import readline from 'node:readline/promises';
import {performance} from 'node:perf_hooks';

const LIMIT=300000;
function testGroup(id){
 if(!Number.isSafeInteger(id)||id<=0||id===127999849)throw Error('explicit test community required; Ostrov refused');
}
class ProbeIOError extends Error{}
export class VkProbeClient {
 constructor({token,apiVersion,fetchImpl=fetch}){
  if(typeof token!=='string'||!token||/[\r\n\0]/.test(token)||token.length>4096||!/^5\.\d+$/.test(apiVersion))throw Error('token reference/API version rejected');
  this.token=token;this.apiVersion=apiVersion;this.fetch=fetchImpl;
 }
 async read(url,budget){
  if(budget<=0)throw new ProbeIOError('deadline');
  const response=await this.fetch(url,{redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(35000,Math.floor(budget))))});
  if(!response.ok)throw new ProbeIOError('HTTP failed');
  let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw new ProbeIOError('response limit');chunks.push(chunk)}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 async server(groupId,budget){
  testGroup(groupId);const url=new URL('https://api.vk.com/method/groups.getLongPollServer');
  url.search=new URLSearchParams({access_token:this.token,group_id:String(groupId),v:this.apiVersion});
  const body=await this.read(url,budget),s=body.response;
  if(!s||typeof s.key!=='string'||!s.key||typeof s.ts!=='string'||!/^\d+$/.test(s.ts))throw new ProbeIOError('server schema');
  const endpoint=new URL(s.server);
  if(endpoint.protocol!=='https:'||!['lp.vk.com','lp.vk.ru'].includes(endpoint.hostname)||endpoint.username||endpoint.password)throw new ProbeIOError('server origin');
  return {server:endpoint.toString(),key:s.key,ts:s.ts};
 }
 async poll(session,ts,budget){
  const url=new URL(session.server);url.search=new URLSearchParams({act:'a_check',key:session.key,ts,wait:'1'});
  const body=await this.read(url,budget);
  if(body.failed!==undefined){if(![1,2,3,4].includes(body.failed))throw new ProbeIOError('unknown failed');return {failed:body.failed}}
  if(typeof body.ts!=='string'||!/^\d+$/.test(body.ts)||!Array.isArray(body.updates))throw new ProbeIOError('poll schema');
  return body;
 }
}
function control(body,groupId,marker){
 const ids=[...new Set((body.updates??[]).filter(e=>e.group_id===groupId&&typeof e.event_id==='string'&&
  [e.object?.text,e.object?.message?.text].some(text=>typeof text==='string'&&text.includes(marker))).map(e=>e.event_id))];
 return ids.length===1?ids[0]:null;
}
export async function probeTwoReaders({groupId,marker,api,checkpoint,deadlineMs=LIMIT}){
 testGroup(groupId);
 if(typeof marker!=='string'||!marker||marker.length>128||/[\r\n\0]/.test(marker)||typeof checkpoint!=='function'||!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>LIMIT)throw Error('probe arguments rejected');
 const start=performance.now(),left=()=>deadlineMs-(performance.now()-start);
 const result={groupId,verdict:'not_measured',eventA:null,eventB:null,oldKeyBefore:null,oldKeyAfter:null,keysEqual:null,repeatAfterAdvance:false,causalInvalidation:'not_proven',durationMs:0};
 try{
  const a=await api.server(groupId,left());
  const before=await api.poll(a,a.ts,left());result.oldKeyBefore=before.failed??'alive';
  if(before.failed)return Object.assign(result,{reason:'first_key_control_failed'});
  const b=await api.server(groupId,left());result.keysEqual=a.key===b.key;
  const after=await api.poll(a,a.ts,left());result.oldKeyAfter=after.failed??'alive';
  if(after.failed)return Object.assign(result,{verdict:'interference_observed',reason:'old_key_failed_after_second_issuance'});
  let timer;
  try{await Promise.race([checkpoint({groupId,marker,remainingMs:left()}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new ProbeIOError('control deadline')),Math.max(1,left()))})])}finally{clearTimeout(timer)}
  if(left()<=0)throw new ProbeIOError('deadline');
  const one=await api.poll(a,a.ts,left());result.eventA=control(one,groupId,marker);
  if(!result.eventA)return Object.assign(result,{reason:'control_event_missing'});
  if(BigInt(one.ts)<=BigInt(a.ts))return Object.assign(result,{reason:'control_cursor_did_not_advance'});
  // B deliberately uses A's old cursor, not its newly issued current cursor.
  const two=await api.poll(b,a.ts,left());result.eventB=control(two,groupId,marker);
  if(two.failed||result.eventB!==result.eventA)return Object.assign(result,{verdict:'interference_observed',reason:'second_reader_did_not_replay_same_event'});
  const advanced=await api.poll(a,one.ts,left());
  if(advanced.failed)return Object.assign(result,{verdict:'interference_observed',reason:'advance_failed'});
  const replay=await api.poll(a,a.ts,left());result.repeatAfterAdvance=control(replay,groupId,marker)===result.eventA;
  result.verdict=result.repeatAfterAdvance?'compatible':'interference_observed';
  result.reason=result.repeatAfterAdvance?'same_control_event_replayed':'old_cursor_did_not_replay';
 }catch{result.reason='IO_protocol_or_deadline_failed'}
 finally{result.durationMs=Math.ceil(performance.now()-start)}
 return result;
}
function parse(args){
 const values={},known=new Set(['--group','--api-version','--token-file','--pass-ref']);let live=false;
 for(let i=0;i<args.length;i++){
  const key=args[i];if(key==='--live'){if(live)throw Error('duplicate argument');live=true;continue}
  if(!known.has(key)||values[key]!==undefined||!args[i+1]||args[i+1].startsWith('-'))throw Error('unknown or missing argument');values[key]=args[++i];
 }
 if(!live||!/^\d+$/.test(values['--group']??'')||!/^5\.\d+$/.test(values['--api-version']??'')||Boolean(values['--token-file'])===Boolean(values['--pass-ref']))throw Error('explicit --live, --group, --api-version and one token reference required');
 if(values['--pass-ref']&&!/^[A-Za-z0-9_][A-Za-z0-9_./-]{0,1023}$/.test(values['--pass-ref']))throw Error('pass reference rejected');
 if(values['--pass-ref']?.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('pass reference rejected');
 if(values['--token-file']&&!path.isAbsolute(values['--token-file']))throw Error('absolute token path required');
 const groupId=Number(values['--group']);testGroup(groupId);return {groupId,values};
}
function tokenFromReference(values){
 if(values['--pass-ref']){
  const p=spawnSync('pass',['show',values['--pass-ref']],{encoding:'utf8',detached:true,timeout:5000,killSignal:'SIGKILL',maxBuffer:8192,stdio:['ignore','pipe','ignore']});
  if(p.pid)try{process.kill(-p.pid,'SIGKILL')}catch(e){if(e.code!=='ESRCH')throw Error('credential process cleanup failed')}
  if(p.status!==0)throw Error('token reference unavailable');return p.stdout.split('\n')[0];
 }
 const file=values['--token-file'];if(!path.isAbsolute(file))throw Error('absolute token path required');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{
  const st=fs.fstatSync(fd);if(!st.isFile()||st.size>8192||(st.mode&0o022)!==0||![0,process.getuid()].includes(st.uid))throw Error('token metadata rejected');
  return fs.readFileSync(fd,'utf8').split('\n')[0];
 }finally{fs.closeSync(fd)}
}
async function main(){
 const started=performance.now();let parsed;
 try{parsed=parse(process.argv.slice(2))}catch{console.error('vk-two-readers-probe: refused arguments; use --live --group <TEST_ID> --api-version <5.x> (--token-file <absolute-path> | --pass-ref <entry>)');return 2}
 let api;
 try{api=new VkProbeClient({token:tokenFromReference(parsed.values),apiVersion:parsed.values['--api-version']})}catch{console.error('vk-two-readers-probe: token reference or API version rejected; no values printed');return 2}
 const marker='B-N-2027-control-'+randomUUID();let input;
 const checkpoint=async()=>{
  console.error(JSON.stringify({stage:'create_control_event_on_test_community',groupId:parsed.groupId,marker}));
  input=readline.createInterface({input:process.stdin,output:process.stderr});
  const line=await input.question('Create one test comment/message containing this marker, then enter CREATED: ');
  if(line.trim()!=='CREATED')throw Error('control not acknowledged');
 };
 try{
  const result=await probeTwoReaders({groupId:parsed.groupId,marker,api,checkpoint,deadlineMs:Math.max(1,Math.floor(LIMIT-(performance.now()-started)))});result.durationMs=Math.ceil(performance.now()-started);console.log(JSON.stringify(result));
  return result.verdict==='compatible'?0:result.verdict==='interference_observed'?1:3;
 }finally{input?.close()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main();
