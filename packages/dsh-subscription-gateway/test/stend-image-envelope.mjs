// RU: Проверка stend-image-envelope: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-image-envelope verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.
import assert from 'node:assert/strict';
import {mcpImageResponse,readBridgeReply,IMAGE_REPLY_LIMIT} from '../mcp-image.mjs';
const good=()=>({ok:true,value:'legacy',mcpImageVersion:1,mcpContent:[{type:'text',text:'<dsh-read-image-v1>'},{type:'image',mimeType:'image/png',data:'YWJj'}]});
let passed=0;const test=async(n,fn)=>{await fn();passed++;console.log('PASS',n)};
await test('valid envelope',()=>assert.equal(mcpImageResponse(good(),'read_image','anthropic').content[1].data,'YWJj'));
for(const name of ['missing marker','duplicate marker','bad mime','bad base64','two images','version'])await test(name,()=>{const r=good();if(name==='missing marker')r.mcpContent.shift();if(name==='duplicate marker')r.mcpContent.push(r.mcpContent[0]);if(name==='bad mime')r.mcpContent[1].mimeType='text/plain';if(name==='bad base64')r.mcpContent[1].data='!!!!';if(name==='two images')r.mcpContent.push(r.mcpContent[1]);if(name==='version')r.mcpImageVersion=2;assert.throws(()=>mcpImageResponse(r,'read_image','anthropic'))});
await test('Codex retains JSON even on image envelope',()=>assert.equal(mcpImageResponse(good(),'read_image','openai').content[0].text,'"legacy"'));
await test('oversized HTTP body rejected before JSON parsing',()=>assert.rejects(()=>readBridgeReply(new Response('x'.repeat(IMAGE_REPLY_LIMIT+1)),true),/exceeds/));
await test('ordinary JSON unaffected',async()=>assert.deepEqual(await readBridgeReply(new Response('{"ok":true}'),false),{ok:true}));
console.log(JSON.stringify({passed}));
