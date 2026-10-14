// B-N-2009: actual HTTP gateway -> controlled Codex app-server RPC -> actual spool writer.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import {spawn} from 'node:child_process';import {once} from 'node:events';import assert from 'node:assert/strict';
const sourceBase=path.resolve(new URL('..',import.meta.url).pathname);const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-spool-http-'));const base=path.join(root,'gateway');let child,journal='';
const pause=ms=>new Promise(r=>setTimeout(r,ms));const free=async()=>{const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;};
try{
 // RU: Соседний sdk-runtime дерева может вести в закрытый /opt/claude-oauth. Как Claude-стенды, берём доступный слой;
 // RU: явный STEND_SDK не заменяется догадкой. Запускаем побайтную копию gateway.mjs, не боевой процесс.
 const sdkNearby=path.join(sourceBase,'sdk-runtime');let sdk=process.env.STEND_SDK||sdkNearby;
 if(!process.env.STEND_SDK){try{fs.accessSync(path.join(sdk,'node_modules/@openai/codex-sdk/package.json'),fs.constants.R_OK);}catch{sdk='/opt/subscription-gateway-guest/sdk-runtime';}}
 const sdkManifest=JSON.parse(fs.readFileSync(path.join(sdk,'node_modules/@openai/codex-sdk/package.json'),'utf8'));
 console.log('SDK',fs.realpathSync(sdk),'codex-sdk',sdkManifest.version);
 fs.mkdirSync(base);
 for(const entry of fs.readdirSync(sourceBase))if(entry!=='gateway.mjs'&&entry!=='sdk-runtime')fs.symlinkSync(path.join(sourceBase,entry),path.join(base,entry));
 fs.symlinkSync(fs.realpathSync(sdk),path.join(base,'sdk-runtime'));
 const gatewaySource=fs.readFileSync(path.join(sourceBase,'gateway.mjs'));fs.writeFileSync(path.join(base,'gateway.mjs'),gatewaySource);
 assert.deepEqual(fs.readFileSync(path.join(base,'gateway.mjs')),gatewaySource,'gateway fixture must preserve candidate bytes');
 console.log('SUBJECT',path.join(sourceBase,'gateway.mjs'),'SHA256',crypto.createHash('sha256').update(gatewaySource).digest('hex'));
 for(const name of ['home','codex','work','inbox'])fs.mkdirSync(path.join(root,name));fs.writeFileSync(path.join(root,'codex/auth.json'),'{}',{mode:0o600});
 const key=crypto.randomBytes(32).toString('hex');fs.writeFileSync(path.join(root,'ingress'),key,{mode:0o600});
 const stub=path.join(root,'app-server.mjs');fs.copyFileSync(path.join(base,'test/zaglushka-app-server.mjs'),stub);fs.chmodSync(stub,0o755);
 const port=await free();const env={PATH:process.env.PATH,HOME:path.join(root,'home'),CODEX_HOME:path.join(root,'codex'),GATEWAY_POSTAVSHIK:'openai',GATEWAY_PORT:String(port),GATEWAY_MCP_PORT:String(await free()),GATEWAY_CODEX_PUT:'app-server',GATEWAY_CODEX_BIN:stub,GATEWAY_INSTRUMENTY_DVIZHKA:'net',GATEWAY_INGRESS_KEY_FILE:path.join(root,'ingress'),GATEWAY_WORK_DIR:path.join(root,'work'),GATEWAY_BAZA_SESSIJ:path.join(root,'map.db'),GATEWAY_YASHCHIK:path.join(root,'inbox'),GATEWAY_COMPACTION_MODULE:path.join(base,'test/fixtures/compaction-module.mjs'),GATEWAY_CONTINUATION_MODE_FILE:path.join(root,'absent-mode.json'),GATEWAY_DAVLENIE:'storozh,signal',GATEWAY_DAVLENIE_OKNO:'100000',KOMPAKT_AGENT:'fixture-agent',STUB_ZANYATO:'60000,70000',STUB_PREDEL_CODEX:'1000000',STUB_SHAG_MS:'100'};
 child=spawn(process.execPath,[path.join(base,'gateway.mjs')],{env,cwd:root,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>journal+=b);child.stderr.on('data',b=>journal+=b);
 for(let i=0;i<150&&!journal.includes('слушаю')&&child.exitCode===null;i++)await pause(100);assert(journal.includes('слушаю'),'copy gateway failed to start');
 const health=await (await fetch('http://127.0.0.1:'+port+'/health')).json();assert.equal(health.spoolConversation,1);assert.equal(health.ok,true);
 const address=process.env.STEND_SPOOL_ADDRESS||Buffer.from(JSON.stringify({key:'-1004442041878',session_id:'telegram--1004442041878',session_created:123})).toString('base64url');
 const ask=async(header,normal=false,label='fixture',conversation)=>{
  const before=new Set(fs.readdirSync(path.join(root,'inbox')));
  const response=await fetch('http://127.0.0.1:'+port+(conversation?'/v2/agent-stream':'/v1/agent-stream'),{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key,...(header===undefined?{}:{'x-dsh-spool-conversation':header})},body:JSON.stringify({model:'gpt-6-astra',...(conversation?{conversation}:{}),messages:[{role:'user',content:'fixture continuation '+label}],...(normal?{livePressure:{schema:1,error:'fixture-pressure-off'}}:{})}),signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);const events=await response.text();assert(!events.includes('"type":"error"'),events);
  return fs.readdirSync(path.join(root,'inbox')).filter(f=>!f.startsWith('.')&&!before.has(f)).map(f=>fs.readFileSync(path.join(root,'inbox',f),'utf8'));
 };
 if(process.env.STEND_V2_COUNTER_MATRIX==='1'){
  const id='telegram-v2-11111111-1111-4111-8111-111111111111';const conversation={version:2,id,createdAt:123,cwd:path.join(root,'work')};const header=Buffer.from(JSON.stringify({key:'100',session_id:id,session_created:123})).toString('base64url');const cases=[];
  for(const [name,address,normal,want] of [['header1',header,false,1],['header2',header,false,1],['no header third blocked',undefined,false,0],['no header normal completion',undefined,true,0],['header rearmed',header,false,1],['no header same rearmed budget',undefined,false,1],['header third blocked',header,false,0]]){
   const letters=await ask(address,normal,'v2',conversation);console.log('COUNTER',name,letters.length,'want',want);assert.equal(letters.length,want,name);if(address===undefined)for(const letter of letters)assert(!letter.includes('[spool-conversation-v1'));cases.push({name,letters:letters.length,want});
  }
  console.log(JSON.stringify({provider:'openai',cases,letters:cases.reduce((n,x)=>n+x.letters,0)}));
 }else if(process.env.STEND_COUNTER_MATRIX==='1'){
  const a=Buffer.from(JSON.stringify({key:'-1004442041878',session_id:'telegram--1004442041878',session_created:123})).toString('base64url');
  const b=Buffer.from(JSON.stringify({key:'gost-123',session_id:'telegram-gost-123',session_created:123})).toString('base64url');const cases=[];
  for(const [name,header,label,normal,want] of [['A1',a,'A',false,1],['A2',a,'A',false,1],['B1',b,'B',false,1],['B2',b,'B',false,1],['A3 blocked',a,'A',false,0],['B3 blocked',b,'B',false,0],['B normal',b,'B',true,0],['A still blocked',a,'A',false,0],['B reset only itself',b,'B',false,1]]){
   const letters=await ask(header,normal,label);console.log('COUNTER',name,letters.length,'want',want);assert.equal(letters.length,want,name);for(const letter of letters)assert(letter.includes('[spool-conversation-v1 '+header+']'));cases.push({name,letters:letters.length,want});
  }
  console.log(JSON.stringify({provider:'openai',cases,letters:cases.reduce((n,x)=>n+x.letters,0)}));
 }else{
  const letters=await ask(address);assert.equal(letters.length,1,'Codex pressure must publish exactly one continuation');const raw=letters[0];assert(raw.includes('[spool-conversation-v1 '+address+']'));assert(raw.includes('[шлюз Codex · продолжение'));assert(journal.includes('Steer')||journal.includes('steer'),'pressure signal must actually have been sent');
  console.log(JSON.stringify({pisem:1,pisma:[raw],provider:'openai',healthCapability:health.spoolConversation}));
 }

}finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'close'),pause(5000)]);if(child.exitCode===null)child.kill('SIGKILL');}fs.rmSync(root,{recursive:true,force:true});}
