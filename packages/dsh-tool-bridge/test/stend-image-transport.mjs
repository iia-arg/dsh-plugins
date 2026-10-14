// RU: Проверка stend-image-transport: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-image-transport verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
// Аудит №3 (1.3.44): пакеты платформы — все рядом с пакетом, иначе все из DSH_TEST_APP (два экземпляра cordis не смешиваются); нет нигде — СЛЕПОТА 2, а не падение кодом 1.
const PLATFORMA=['@deepseek-ai/cordis','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-attachment-local','@deepseek-ai/dsh-tool-fs'];
const vzyatVse=async()=>{try{return await Promise.all(PLATFORMA.map(x=>import(x)))}catch{}
 const app=process.env.DSH_TEST_APP;if(app){try{const req=createRequire(path.resolve(app,'package.json'));return await Promise.all(PLATFORMA.map(x=>import(pathToFileURL(req.resolve(x)).href)))}catch{}}
 console.log(`СЛЕПОТА: пакеты платформы ${PLATFORMA.join(', ')} не найдены ни рядом с пакетом, ни в DSH_TEST_APP (${app??'не задан'})`);process.exit(2)};
const [{Context},{ToolRuntime,defineTool},{LocalAttachmentStore},filesystem]=await vzyatVse();
let bridge;try{bridge=await import('../src/index.js')}catch(e){console.log('СЛЕПОТА: мост не загружен (зависимости пакета): '+String(e?.message??e).slice(0,160));process.exit(2)}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-image-'));
const png=fs.readFileSync(new URL('./fixtures/canary.png',import.meta.url));
fs.writeFileSync(path.join(tmp,'red.png'),png);
const blue=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC','base64');fs.writeFileSync(path.join(tmp,'blue.png'),blue);
const ctx=new Context();ctx.provide('logger');ctx.logger={error(){},info(){},warn(){}};
ctx.provide('systemPrompt',{tools(){},section(){},getSectionOrder(){return 1},register(){}});const registry=new ToolRuntime(ctx);
const attachments=new LocalAttachmentStore(ctx,{dshHome:tmp});
let model='claude-opus-5-5',reads=0;
const agent={id:'image-fixture',status:'running',session:{header:{cwd:tmp},requestHeader:()=>({config:{provider:'claude-oauth',model}}),append(){}}};
const second={...agent,id:'second-fixture'};
ctx.provide('agents',{get:id=>id===agent.id?agent:id===second.id?second:undefined,roots:()=>[agent,second],currentInitiator:()=>agent});
ctx.provide('sessionProjections',{stateOf:()=>({openTurnStartSeq:1,lastTurn:1})});
ctx.provide('llm',{resolveModelInfo:async()=>({inputModalities:['text','image']})});
ctx.provide('fs',{resolve:async p=>({displayPath:p,hostPath:path.resolve(tmp,p)}),stat:async()=>({type:'file',version:'fixture'}),readBytes:async target=>fs.readFileSync(target.hostPath)});
for(const name of ['goals','jobs','typertGateway'])ctx.provide(name,{});
filesystem.apply(ctx,filesystem.Config({}));
registry.register(defineTool({name:'fixture_text',description:'text',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=> 'ok'}));
await new Promise(r=>setTimeout(r,20));
const scope=ctx.plugin(bridge,{port:0});await new Promise(r=>setTimeout(r,30));
const read=attachments.readImage.bind(attachments);attachments.readImage=async(...args)=>{reads++;return read(...args)};
const descriptor=(id=agent.id)=>ctx.get('mcpBridge').descriptor(id);
const invoke=async(tool,args={},ticket,id=agent.id)=>{const d=descriptor(id);const res=await fetch(d.url,{method:'POST',headers:{'content-type':'application/json','x-bridge-ticket':ticket??d.ticket},body:JSON.stringify({tool,args,imageProtocol:1})});return {status:res.status,...await res.json()};};
let passed=0,failed=0;const probe=async(n,fn)=>{try{await fn();passed++;console.log('PASS',n)}catch(e){failed++;console.error('FAIL',n,e.message)}};
try{
 await probe('real platform read_image -> stored bytes -> MCP image',async()=>{const r=await invoke('read_image',{file_path:'red.png'});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.mcpImageVersion,1);const b=r.mcpContent.find(b=>b.type==='image');assert(b);const stored=await read(r.value.value.image);assert.equal(Buffer.compare(Buffer.from(b.data,'base64'),stored.data),0);assert.equal(b.mimeType,stored.ref.mediaType);assert.equal(r.value.content.find(b=>b.type==='image').attachment.attachmentId,stored.ref.attachmentId);});
 await probe('Codex exact route retains JSON; no image resolution',async()=>{model='gpt-6-astra';const n=reads;const r=await invoke('read_image',{file_path:'red.png'});assert.equal(r.ok,true);assert.equal(r.mcpContent,undefined);assert.equal(reads,n);model='claude-opus-5-5';});
 await probe('parallel descriptors retain their own result bytes',async()=>{const [red,blueResult]=await Promise.all([invoke('read_image',{file_path:'red.png'}),invoke('read_image',{file_path:'blue.png'},undefined,second.id)]);assert.equal(red.ok,true);assert.equal(blueResult.ok,true);assert.notEqual(red.mcpContent.find(b=>b.type==='image').data,blueResult.mcpContent.find(b=>b.type==='image').data);});
 await probe('old gateway without image negotiation refuses visibly',async()=>{const d=descriptor();const r=await fetch(d.url,{method:'POST',headers:{'content-type':'application/json','x-bridge-ticket':d.ticket},body:JSON.stringify({tool:'read_image',args:{file_path:'red.png'}})});const out=await r.json();assert.equal(out.ok,false);assert.match(out.error,/transport v1 required/);});
 await probe('text tool unchanged',async()=>{const r=await invoke('fixture_text');assert.equal(r.ok,true);assert.equal(r.mcpContent,undefined);assert.equal(r.value.value,'ok')});
 await probe('unauthorized ticket does not read attachment',async()=>{const n=reads;const r=await invoke('read_image',{file_path:'red.png'},'foreign');assert.equal(r.status,403);assert.equal(reads,n)});
 await probe('platform missing file does not read attachment',async()=>{const n=reads;const r=await invoke('read_image',{file_path:'missing.png'});assert.equal(r.ok,false);assert.equal(reads,n)});
}finally{await scope.dispose();fs.rmSync(tmp,{recursive:true,force:true});}
console.log(JSON.stringify({passed,failed}));assert.equal(failed,0);
