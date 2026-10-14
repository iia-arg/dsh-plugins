import {installFixtureIngress} from './fixture-ingress.mjs';
installFixtureIngress();
// RU: stend-conversation-identity: проверяет соответствующий контракт настоящего адаптера на контролируемом HTTP/платформенном входе. При недоступной платформе результат не подтверждает работоспособность; live credentials не используются.
// EN: stend-conversation-identity: tests the actual adapter contract against controlled HTTP/platform inputs. Missing platform prerequisites cannot certify functionality; no live credentials are used.
import assert from 'node:assert/strict';import http from 'node:http';import {apply} from '../src/index.js';
let adapter,capability,agent,version=2,post=0,body;const order=[];
const server=http.createServer(async(req,res)=>{order.push(req.url);if(req.url==='/health'){res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,conversationIdentity:version,postavshchik:'openai'}));return;}post++;let raw='';for await(const x of req)raw+=x;body=JSON.parse(raw);res.end('{"type":"done"}\n');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const ctx={get:n=>n==='agents'?{currentInitiator:()=>agent}:n==='newConversationRestore'?{version:1}:undefined,provide:(n,v)=>{if(n==='conversationIdentity')capability=v;},llm:{registerAdapter(n,a){adapter=a;return()=>{}}},on(){},effect(){}};
try{
 apply(ctx,{baseURL:'http://127.0.0.1:'+server.address().port});
 // RU: Отделить one-shot mount metadata от обязательного capability запроса.
 // EN: Separate one-shot mount metadata from the mandatory capability request.
 for(let i=0;i<100&&!adapter.providerInfo('claude-oauth').name.includes('OpenAI');i++)await new Promise(r=>setTimeout(r,5));assert.match(adapter.providerInfo('claude-oauth').name,/OpenAI/);order.length=0;
 agent={session:{id:'telegram-v2-00000000-0000-4000-8000-000000000001',header:{createdAt:123,cwd:'/fixture'}}};
 for await(const e of adapter.stream({messages:[]})){}
 assert.equal(body.conversation?.id,agent.session.id,'new generation must be explicit');assert.equal(body.cwd,'/fixture');assert.deepEqual(order,['/health','/v2/agent-stream']);
 version=1;const previous=post;await assert.rejects(async()=>{for await(const e of adapter.stream({messages:[]})){}},/capability|поколен/);assert.equal(post,previous,'no POST to old gateway');
 assert.equal(capability.version,2);await assert.rejects(capability.check());version=2;await capability.check();
 agent=undefined;for await(const e of adapter.stream({messages:[]})){}assert.equal(body.conversation.mode,'stateless');
 agent={id:'telegram-a2a'};order.length=0;for await(const e of adapter.stream({messages:[]})){}assert.equal(body.conversation,undefined);assert.deepEqual(order,['/v1/agent-stream']);
 console.log('PASS new identity, capability before POST, no downgrade, stateless unknown, legacy unchanged');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
