// B-N-2009: actual adapter POST, positive capability in both channel and gateway.
import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {apply} from '../src/index.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'adapter-spool-'));const keyFile=path.join(root,'ingress');fs.writeFileSync(keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
let adapter,header,body,gw=1,channel=1,bad=0,n=0,healthCalls=0;const agent={session:{id:'telegram-gost-123',header:{id:'telegram-gost-123',createdAt:123,cwd:'/fixture'}}};
const address=Buffer.from(JSON.stringify({key:'gost-123',session_id:agent.session.id,session_created:123})).toString('base64url');
const server=http.createServer(async(req,res)=>{if(req.url==='/health'){healthCalls++;res.end(JSON.stringify({ok:true,conversationIdentity:2,postavshchik:'openai',spoolConversation:gw}));return;}header=req.headers['x-dsh-spool-conversation'];let raw='';for await(const c of req)raw+=c;body=JSON.parse(raw);res.end('{"type":"done"}\n');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const ctx={get:n=>n==='agents'?{currentInitiator:()=>agent}:n==='taskControlCodex'?{mailStopVersion:1}:n==='spoolConversation'?{version:channel,forAgent:a=>{assert.equal(a,agent);return address;}}:undefined,provide(){},llm:{registerAdapter(n,a){adapter=a;return()=>{}}},on(){},effect(){}};
try{
 apply(ctx,{baseURL:'http://127.0.0.1:'+server.address().port,ingressKeyFile:keyFile});
 for(const [name,g,c,want] of [['guest both capable',1,1,address],['old gateway',0,1,undefined],['old channel',1,0,undefined],['unsupported gateway',2,1,undefined]]){
  n++;gw=g;channel=c;await new Promise(r=>setTimeout(r,30));healthCalls=0;try{for await(const e of adapter.stream({messages:[]})){}assert.equal(header,want);assert.equal(healthCalls,1,'one capability request per stream');assert.equal(body.conversation,undefined,'legacy conversation protocol preserved');console.log('PASS',name);}catch(e){bad++;console.log('FAIL',name,e.message);}
 }
 console.log('RESULT',n-bad+'/'+n);process.exitCode=bad?1:0;
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
