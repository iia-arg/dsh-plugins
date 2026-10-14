// RU: Проверка stend-image-limits: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-image-limits verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.
import assert from 'node:assert/strict';
import {imageContent,IMAGE_BASE64_LIMIT,IMAGE_DIMENSION_LIMIT,IMAGE_MARKER} from '../src/image-content.js';
const base={attachmentId:'fixture',mediaType:'image/png',width:32,height:32,bytes:3};
let reads=0,overrides={},onRead;
const store={imageLimits:{maxImageBytes:20*1024*1024,maxMessageImageBytes:200*1024*1024},async readImage(ref,signal){reads++;if(onRead)return onRead(ref,signal);return {ref:{...ref,...overrides},data:new Uint8Array(ref.bytes)}}};
const ctx={get:()=>store};
const result=ref=>({content:[{type:'text',text:'fixture'},{type:'image',attachment:ref}]});
let passed=0;const test=async(n,fn)=>{await fn();passed++;console.log('PASS',n)};
await test('exact API encoded-byte limit passes',async()=>{const r=await imageContent(ctx,result({...base,bytes:3*Math.floor(IMAGE_BASE64_LIMIT/4)}));assert.equal(r.mcpContent.find(b=>b.type==='image').data.length,IMAGE_BASE64_LIMIT)});
await test('one raw byte over API cap refuses before storage read',async()=>{const before=reads;await assert.rejects(()=>imageContent(ctx,result({...base,bytes:3*Math.floor(IMAGE_BASE64_LIMIT/4)+1})),/картинка больше 7500000/);assert.equal(reads,before)});
await test('storage stricter cap wins',async()=>{store.imageLimits.maxImageBytes=2;await assert.rejects(()=>imageContent(ctx,result(base)),/картинка больше 2/);store.imageLimits.maxImageBytes=20*1024*1024});
await test('dimension boundary and overflow',async()=>{await imageContent(ctx,result({...base,width:IMAGE_DIMENSION_LIMIT}));const before=reads;await assert.rejects(()=>imageContent(ctx,result({...base,height:IMAGE_DIMENSION_LIMIT+1})),/8000 px/);assert.equal(reads,before)});
await test('corrupt/ref mismatch and absent storage fail',async()=>{overrides={mediaType:'image/jpeg'};await assert.rejects(()=>imageContent(ctx,result(base)),/does not match/);overrides={};await assert.rejects(()=>imageContent({get(){}},result(base)),/unavailable/)});
await test('MIME and unknown blocks fail before bytes',async()=>{const before=reads;await assert.rejects(()=>imageContent(ctx,result({...base,mediaType:'application/pdf'})),/invalid attachment/);await assert.rejects(()=>imageContent(ctx,{content:[{type:'audio'}]}),/invalid result/);assert.equal(reads,before)});
await test('timeout stops one attempt even if store ignores signal',async()=>{let aborted=false;onRead=(_r,signal)=>{signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{})};const n=reads;const start=Date.now();await assert.rejects(()=>imageContent(ctx,result(base)),/10000 ms/);assert(aborted);assert.equal(reads,n+1);assert(Date.now()-start<12000);onRead=undefined});
await test('marker is counted in text limit',async()=>{const count=61440-Buffer.byteLength(IMAGE_MARKER);const value=result(base);value.content[0].text='x'.repeat(count);await imageContent(ctx,value);value.content[0].text+='x';await assert.rejects(()=>imageContent(ctx,value),/61440 bytes/)});
console.log(JSON.stringify({passed}));
