// RU: Старый health ответ/ошибка не может затереть более свежую v2 metadata. Реальный HTTP и код адаптера, без vendor вызова.
// EN: An older health response/failure must not overwrite newer v2 metadata. Real HTTP and adapter code, no vendor calls.
import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {apply} from '../src/index.js';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'metadata-race-')),key=path.join(tmp,'key');fs.writeFileSync(key,'d'.repeat(64),{mode:0o600});let passed=0;
try{for(const mode of ['stale-success','stale-failure']){
 let healthCalls=0,adapter,replyOld;const clean=[];
 const server=http.createServer(async(req,res)=>{if(req.url==='/health'){if(++healthCalls===1){replyOld=()=>res.end(mode==='stale-success'?JSON.stringify({ok:true,conversationIdentity:2,postavshchik:'anthropic'}):'{bad');return;}res.end(JSON.stringify({ok:true,conversationIdentity:2,postavshchik:'openai'}));return;}for await(const b of req){}res.end('{"type":"done"}\n')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const ctx={get:()=>undefined,provide(){},effect:fn=>clean.push(fn()),llm:{registerAdapter(_ids,a){adapter=a;const h=()=>{};h.replace=()=>{};return h}}};
 try{apply(ctx,{baseURL:'http://127.0.0.1:'+server.address().port,ingressKeyFile:key,models:[]});for(let n=0;n<100&&!replyOld;n++)await new Promise(r=>setTimeout(r,5));assert(replyOld);for await(const ev of adapter.stream({messages:[],model:'fixture'})){}assert.match(adapter.providerInfo('claude-oauth').name,/OpenAI/);replyOld();await new Promise(r=>setTimeout(r,50));assert.match(adapter.providerInfo('claude-oauth').name,/OpenAI/);console.log('PASS',mode);passed++;}finally{for(const fn of clean)fn?.();server.closeAllConnections();await new Promise(r=>server.close(r))}
}}finally{fs.rmSync(tmp,{recursive:true,force:true})}console.log('RESULT',passed+'/2');
