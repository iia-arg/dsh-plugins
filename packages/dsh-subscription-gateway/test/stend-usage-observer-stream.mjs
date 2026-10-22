// Real HTTP gateway; the SDK fixture exposes partial-frame opt-in to its consumer.
// Break caught: ordinary requests enabling partial frames, or observed requests losing them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const source=path.resolve(process.argv[2]??path.join(import.meta.dirname,'..'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'observer-stream-'));
let child,logs='';const sleep=n=>new Promise(r=>setTimeout(r,n));
async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const value=server.address().port;await new Promise(r=>server.close(r));return value}
try{
 const copy=path.join(root,'gateway'),home=path.join(root,'home');fs.mkdirSync(copy);fs.mkdirSync(home);
 for(const name of fs.readdirSync(source)){
  if(['sdk-runtime','.git'].includes(name))continue;
  if(name.endsWith('.mjs')||name==='child-source-versions.json')fs.copyFileSync(path.join(source,name),path.join(copy,name));
  else fs.symlinkSync(path.join(source,name),path.join(copy,name));
 }
 const sdk=path.join(copy,'sdk-runtime/node_modules/@anthropic-ai/claude-agent-sdk');fs.mkdirSync(sdk,{recursive:true});
 const trace=path.join(root,'sdk-trace.jsonl');
 const entry=`import fs from 'node:fs';export function query({options}){
 const sid=options.sessionId||options.resume;
 const emit=m=>{fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({type:m.type,event:m.event?.type??null})+'\\n');return m};
 const proc=options.spawnClaudeCodeProcess({command:process.execPath,args:['-e','setTimeout(()=>{},1500)'],cwd:options.cwd,env:options.env});
 const iter=(async function*(){try{
  yield emit({type:'system',subtype:'init',session_id:sid,claude_code_version:'2.1.299',tools:[]});
  if(options.includePartialMessages)for(const event of [
   {type:'message_start',message:{id:'msg_one',usage:{input_tokens:2,output_tokens:1,cache_read_input_tokens:0,cache_creation_input_tokens:0}}},
   {type:'content_block_start',index:0,content_block:{type:'text',text:''}},
   {type:'content_block_delta',index:0,delta:{type:'text_delta',text:'ONE'}},
   {type:'content_block_stop',index:0},
   {type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:9}},
   {type:'message_stop'}])yield emit({type:'stream_event',session_id:sid,event});
  yield emit({type:'assistant',session_id:sid,message:{id:'msg_one',content:[{type:'text',text:'ONE'}],usage:{input_tokens:2,output_tokens:1,cache_read_input_tokens:0,cache_creation_input_tokens:0}}});
  yield emit({type:'result',subtype:'success',session_id:sid,result:'ONE',usage:{input_tokens:2,output_tokens:9}});
 }finally{proc.kill()}})();iter.interrupt=async()=>{};return iter}
 export const createSdkMcpServer=()=>({});export const tool=()=>({});`;
 fs.writeFileSync(path.join(sdk,'package.json'),JSON.stringify({name:'@anthropic-ai/claude-agent-sdk',version:'0.3.299',type:'module',exports:'./index.js'}));fs.writeFileSync(path.join(sdk,'index.js'),entry);
 const manifestPath=path.join(copy,'child-source-versions.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));manifest.supported.push({engine:'claude',cliVersion:'2.1.299',sdkVersion:'0.3.299',sdkEntrySha256:createHash('sha256').update(entry).digest('hex'),profile:'claude-agent-sdk-child-v1'});fs.writeFileSync(manifestPath,JSON.stringify(manifest));
 const key=randomBytes(32).toString('hex'),keyFile=path.join(root,'key'),token=path.join(root,'token');fs.writeFileSync(keyFile,key,{mode:0o600});fs.writeFileSync(token,'fixture-only',{mode:0o600});
 const p=await port(),mcp=await port();child=spawn(process.execPath,[path.join(copy,'gateway.mjs')],{cwd:home,env:{PATH:process.env.PATH,LANG:'C.UTF-8',HOME:home,GATEWAY_POSTAVSHIK:'anthropic',GATEWAY_PORT:String(p),GATEWAY_MCP_PORT:String(mcp),GATEWAY_TOKEN_FILE:token,GATEWAY_INGRESS_KEY_FILE:keyFile,GATEWAY_WORK_DIR:home,GATEWAY_RESUME:'0',ANTHROPIC_BASE_URL:'http://127.0.0.1:1'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 let healthy=false;for(let n=0;n<150;n++){if(child.exitCode!==null)throw Error(logs);try{healthy=(await fetch('http://127.0.0.1:'+p+'/health',{signal:AbortSignal.timeout(200)})).ok}catch{}if(healthy)break;await sleep(20)}assert.ok(healthy,logs);
 const results=[];
 // A second ordinary request proves the observed request does not leave opt-in behind.
 for(const [turn,observe,wantSDK,wantPartial] of [[1,false,3,0],[2,true,9,6],[3,false,3,0]]){
  const before=fs.existsSync(trace)?fs.readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).length:0;
  const taskControl={binding:{generation:'fixture',recipient:'fixture',ledger_uuid:'ledger',session_id:'dsh-observer-stream',session_created:1,turn},request_id:'observer-stream-'+turn,terminal:1,operations:['stop','stop-exact'],ticket:randomBytes(32).toString('hex')};
  const response=await fetch('http://127.0.0.1:'+p+'/v1/agent-stream',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify({messages:[{role:'user',content:'fixture'}],...(observe?{taskControl}:{})}),signal:AbortSignal.timeout(8000)});
  const body=await response.text(),client=body.trim().split('\n').map(JSON.parse);assert.equal(response.status,200);assert.ok(!client.some(r=>r.type==='error'),body+logs);assert.equal(client.filter(r=>r.type==='done').length,1);assert.equal(client.filter(r=>r.type==='text'&&r.text==='ONE').length,1,'response duplicated by stream events');
  const sdkRows=fs.readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).slice(before);
  assert.equal(sdkRows.length,wantSDK,'SDK frame stream changed for observe='+observe);assert.equal(sdkRows.filter(r=>r.type==='stream_event').length,wantPartial);
  if(observe){
   const file=path.join(home,'.usage-meter/gateway-v1.jsonl');let rows=[];
   for(let n=0;n<150;n++){try{rows=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>r.requestId===taskControl.request_id)}catch{}if(rows.some(r=>r.kind==='child_capture_end'))break;await sleep(10)}
   assert.equal(rows.filter(r=>r.kind==='source_gap'||r.kind==='child_capture_gap').length,0,JSON.stringify(rows));
   assert.equal(rows.filter(r=>r.kind==='child_capture_end').length,1);
   const usage=rows.filter(r=>r.kind==='assistant_usage');assert.equal(usage.length,1);assert.equal(usage[0].usage.output_tokens,9,'observed stream lost final delta');
  }
  results.push({turn,observe,sdkFrames:sdkRows.length,partialFrames:wantPartial,clientKinds:client.map(r=>r.type)});
 }
 console.log('PASS ordinary/observed/ordinary: SDK3/9/3, partial0/6/0; exactly one client answer and done');console.log('WIRE',JSON.stringify(results));
}finally{
 if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1500)]);if(child.exitCode===null){child.kill('SIGKILL');await new Promise(r=>child.once('exit',r))}}
 fs.rmSync(root,{recursive:true,force:true});
}
