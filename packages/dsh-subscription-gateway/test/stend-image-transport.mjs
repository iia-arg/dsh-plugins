// RU: Проверка stend-image-transport: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-image-transport verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../gateway.mjs',import.meta.url),'utf8');
const helperUrl=new URL('../mcp-image.mjs',import.meta.url);const helpers=fs.existsSync(helperUrl)?await import(helperUrl):{};
const extract=name=>{const start=source.indexOf('async function '+name+'('),end=source.indexOf('\n}',start)+2;assert(start>=0&&end>start);return source.slice(start,end)};
const data=Buffer.from('fixture-image').toString('base64');
let payload={ok:true,value:{content:[{type:'image',attachment:{attachmentId:'fixture'}}]},mcpImageVersion:1,mcpContent:[{type:'text',text:'<dsh-read-image-v1>'},{type:'image',mimeType:'image/png',data}]};
const sent=[];const fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));return new Response(JSON.stringify(payload));};
async function handlers(provider){
 const globals={...helpers,Buffer,fetch,IMYA_POSTAVSHCHIKA:provider,IMYA_MOSTA:'fixture',log(){},shape:()=>({}),zagruzitSdk:async()=>({createSdkMcpServer:x=>x,tool:(name,description,schema,handler)=>({name,handler})})};
 const descriptor={url:'http://fixture.invalid',ticket:'fixture',tools:[{name:'read_image'}]};
 // B-N-1698 этап 2: buildBridgeServer зовёт фильтр схем — функции фильтра берутся из того же исходника (если они в нём есть).
 for(const f of ['mcpSchemaRefusal','filterBridgeSchemas']){const s=source.indexOf('\nfunction '+f+'(');if(s>=0){const e=source.indexOf('\n}',s+1)+2;globals[f]=vm.runInNewContext('('+source.slice(s+1,e)+')',globals)}}
 const sdk=await vm.runInNewContext('('+extract('buildBridgeServer')+')',globals)(descriptor);
 const start=source.indexOf('const obrabotchikVyzova = (most)'),end=source.indexOf('\n    };',start)+7;assert(start>=0&&end>start);
 const http=vm.runInNewContext(source.slice(start,end)+'; obrabotchikVyzova',globals)(()=>descriptor);
 return [()=>sdk.tools[0].handler({file_path:'x.png'}),()=>http({params:{name:'read_image',arguments:{file_path:'x.png'}}})];
}
let passed=0,failed=0;const probe=async(n,fn)=>{try{await fn();passed++;console.log('PASS',n)}catch(e){failed++;console.error('FAIL',n,e.message)}};
for(const provider of ['anthropic','openai']){
 const calls=await handlers(provider);
 for(let i=0;i<calls.length;i++)await probe(provider+' '+['SDK','HTTP'][i]+' real handler',async()=>{
  const r=await calls[i]();const images=r.content.filter(b=>b.type==='image');assert.equal(images.length,provider==='anthropic'?1:0);
  if(provider==='anthropic'){assert.equal(images[0].data,data);assert.equal(sent.at(-1).imageProtocol,1);}else{assert.equal(sent.at(-1).imageProtocol,undefined);assert.equal(r.content[0].text,JSON.stringify(payload.value));}
 });
}
const calls=await handlers('anthropic');
payload={ok:true,value:{legacy:'only text'}};
await probe('old bridge is named refusal, never false text success',async()=>{const r=await calls[0]();assert.equal(r.isError,true);assert.match(r.content[0].text,/image transport/);await assert.rejects(calls[1],/image transport/)});
console.log(JSON.stringify({passed,failed}));assert.equal(failed,0);
