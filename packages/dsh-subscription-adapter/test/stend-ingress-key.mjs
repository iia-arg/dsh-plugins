// RU: stend-ingress-key: проверяет соответствующий контракт настоящего адаптера на контролируемом HTTP/платформенном входе. При недоступной платформе результат не подтверждает работоспособность; live credentials не используются.
// EN: stend-ingress-key: tests the actual adapter contract against controlled HTTP/platform inputs. Missing platform prerequisites cannot certify functionality; no live credentials are used.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import http from 'node:http';import {apply} from '../src/index.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'adapter-ingress-'));const key=crypto.randomBytes(32).toString('hex'),file=path.join(root,'key');fs.writeFileSync(file,key,{mode:0o600});let adapter,requests=0;
const server=http.createServer(async(req,res)=>{if(req.url==='/health'){res.end(JSON.stringify({ok:true,conversationIdentity:2,postavshchik:'anthropic'}));return}requests++;assert(req.headers.authorization==='Bearer '+key,'ingress header mismatch');for await(const chunk of req){}res.end('{"type":"done"}\n')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const ctx={get:()=>undefined,provide(){},llm:{registerAdapter(n,a){adapter=a;return()=>{}}},on(){},effect(){}};
try{
 apply(ctx,{baseURL:'http://127.0.0.1:'+server.address().port,ingressKeyFile:file});for await(const e of adapter.stream({messages:[]})){}assert.equal(requests,1);
 fs.chmodSync(file,0o644);await assert.rejects(async()=>{for await(const e of adapter.stream({messages:[]})){}},/owner\/mode/);assert.equal(requests,1);
 fs.chmodSync(file,0o600);fs.unlinkSync(file);await assert.rejects(async()=>{for await(const e of adapter.stream({messages:[]})){}},/ENOENT/);assert.equal(requests,1);
 console.log('PASS adapter sends private key; readable-by-others/missing key never sends request');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
