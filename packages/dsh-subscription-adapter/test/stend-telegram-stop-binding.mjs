import {installFixtureIngress} from './fixture-ingress.mjs';
installFixtureIngress();
// RU: stend-telegram-stop-binding: проверяет соответствующий контракт настоящего адаптера на контролируемом HTTP/платформенном входе. При недоступной платформе результат не подтверждает работоспособность; live credentials не используются.
// EN: stend-telegram-stop-binding: tests the actual adapter contract against controlled HTTP/platform inputs. Missing platform prerequisites cannot certify functionality; no live credentials are used.
import assert from 'node:assert/strict';import http from 'node:http';import {apply} from '../src/index.js';
let adapter,configSeen,body;const server=http.createServer(async(req,res)=>{if(req.url==='/health'){res.end(JSON.stringify({ok:true,conversationIdentity:2,postavshchik:'openai'}));return;}let data='';for await(const x of req)data+=x;body=JSON.parse(data);res.end('{"type":"done"}\n');});await new Promise(r=>server.listen(0,'127.0.0.1',r));let closes=0;const agent={id:'A'};const service={telegramStopVersion:1,attach(a,url,options){assert.equal(a,agent);configSeen=options;return {descriptor:{binding:{turn:1},ticket:'fixture'},close(){closes++;}};}};
const ctx={get:n=>n==='taskControlCodex'?service:n==='agents'?{currentInitiator:()=>agent}:undefined,llm:{registerAdapter(n,a){adapter=a;return()=>{};}},on(){},effect(){}};
try{
 for(const enabled of [false,true]){apply(ctx,{baseURL:'http://127.0.0.1:'+server.address().port,taskControlCodex:enabled});for await(const e of adapter.stream({messages:[]})){}assert.ok(body.taskControl,'/stop needs binding even when legacy cancel is off');assert.deepEqual(configSeen,{allowCancel:enabled});}assert.equal(closes,2);console.log('PASS stop binding independent of legacy key; lease released');
 delete service.telegramStopVersion;apply(ctx,{baseURL:'http://127.0.0.1:'+server.address().port,taskControlCodex:false});for await(const e of adapter.stream({messages:[]})){}assert.equal(body.taskControl,undefined);console.log('PASS older receiver is not silently enabled');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
