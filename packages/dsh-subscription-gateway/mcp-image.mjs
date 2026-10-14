// RU: Ограничить поток ответа моста перед JSON parse, валидировать image envelope и разрешённый tool/provider. Только protocol1 read_image может принести бинарные image blocks.
// EN: Bound bridge replies before JSON parsing and validate the image envelope and allowed tool/provider. Only protocol1 read_image may supply binary image blocks.

export const IMAGE_BASE64_LIMIT=10_000_000;
export const IMAGE_REPLY_LIMIT=IMAGE_BASE64_LIMIT+65536;
const TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
// RU: readBridgeReply: Ограничить поток ответа моста перед JSON parse, валидировать image envelope и разрешённый tool/provider. Только protocol1 read_image может принести бинарные image blocks.
// EN: readBridgeReply: Bound bridge replies before JSON parsing and validate the image envelope and allowed tool/provider. Only protocol1 read_image may supply binary image blocks.
export async function readBridgeReply(response, image) {
  if(!image)return response.json();
  const reader=response.body?.getReader();if(!reader)throw Error('read_image: image transport response body absent');
  const chunks=[];let size=0,timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('read_image: image transport response exceeded 30000 ms')),30000)});
  try{for(;;){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.byteLength;if(size>IMAGE_REPLY_LIMIT)throw Error(`read_image: image transport response exceeds ${IMAGE_REPLY_LIMIT} bytes`);chunks.push(value);}}
  finally{clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
// RU: mcpImageResponse: Ограничить поток ответа моста перед JSON parse, валидировать image envelope и разрешённый tool/provider. Только protocol1 read_image может принести бинарные image blocks.
// EN: mcpImageResponse: Bound bridge replies before JSON parsing and validate the image envelope and allowed tool/provider. Only protocol1 read_image may supply binary image blocks.
export function mcpImageResponse(out, tool, provider) {
  if(provider!=='anthropic'||tool!=='read_image')return {content:[{type:'text',text:JSON.stringify(out.value??null)}]};
  const content=out.mcpContent;
  if(out.mcpImageVersion!==1||!Array.isArray(content))throw Error('read_image: image transport v1 absent; mount bridge and gateway together');
  if(content.filter(b=>b?.type==='text'&&b.text==='<dsh-read-image-v1>').length!==1)throw Error('read_image: image transport marker absent or duplicated');
  let images=0,textBytes=0;
  for(const b of content){
    if(b?.type==='text'&&typeof b.text==='string'){textBytes+=Buffer.byteLength(b.text);continue;}
    if(b?.type!=='image'||!TYPES.has(b.mimeType)||typeof b.data!=='string'||b.data.length===0||b.data.length>IMAGE_BASE64_LIMIT||b.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))throw Error('read_image: invalid or oversized MCP image block');
    if(Buffer.from(b.data,'base64').toString('base64')!==b.data)throw Error('read_image: non-canonical base64');
    images++;
  }
  if(images!==1||textBytes>61440)throw Error('read_image: invalid image count/text envelope');
  return {content};
}
