import {installFixtureIngress} from './fixture-ingress.mjs';
installFixtureIngress();
// RU: stend-task-control: проверяет соответствующий контракт настоящего адаптера на контролируемом HTTP/платформенном входе. При недоступной платформе результат не подтверждает работоспособность; live credentials не используются.
// EN: stend-task-control: tests the actual adapter contract against controlled HTTP/platform inputs. Missing platform prerequisites cannot certify functionality; no live credentials are used.

import assert from 'node:assert/strict';import http from 'node:http';import {apply} from '../src/index.js';
const bodies=[];let mode='ok';const server=http.createServer(async(req,res)=>{if(req.url==='/health'){res.end(JSON.stringify({ok:true,conversationIdentity:2,postavshchik:'openai'}));return;}let raw='';for await(const x of req)raw+=x;bodies.push(JSON.parse(raw));if(mode==='error'){res.writeHead(503);res.end('refused');return;}res.writeHead(200);res.end(JSON.stringify({type:'text',text:'response'})+'\n'+JSON.stringify({type:'done'})+'\n');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let closes=0,attached=0,adapter;const agent={id:'current'};
const service={attach(a,url){assert.equal(a,agent);assert.match(url,/127\.0\.0\.1/);attached++;return {descriptor:{binding:{session_id:'current',turn:1},ticket:'test-only'},close(){closes++;}};}};
const ctx={get:n=>n==='agents'?{currentInitiator:()=>agent}:n==='taskControlCodex'?service:undefined,llm:{registerAdapter(names,a){adapter=a;return ()=>{};}},on(){},effect(){}};
try{
 apply(ctx,{baseURL:'http://127.0.0.1:'+server.address().port,taskControlCodex:true});
 for await(const e of adapter.stream({messages:[],model:'test'})){}
 assert.equal(attached,1,'stream must obtain request binding from its current initiator');assert.equal(closes,1);assert.equal(bodies[0].taskControl.binding.session_id,'current');
 mode='error';await assert.rejects(async()=>{for await(const e of adapter.stream({messages:[]})){} });assert.equal(closes,2);
 mode='ok';apply(ctx,{baseURL:'http://127.0.0.1:'+server.address().port});for await(const e of adapter.stream({messages:[]})){};assert.equal(bodies.at(-1).taskControl,undefined);assert.equal(attached,2);console.log('PASS identity, success/error release, default disabled');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
