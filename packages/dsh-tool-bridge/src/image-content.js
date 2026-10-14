// RU: Экспортировать байты только результата разрешённого read_image на маршруте Claude; reference заново читается из attachment service и проверяется по всем метаданным. URL/путь из ответа модели не используется.
// EN: Export bytes only for an authorized read_image result on a Claude route; reread the reference through the attachment service and check every metadata field. No model-supplied URL or path is fetched.
// RU: Потолки: 10000000 base64 байт, сторона8000px, текст61440байт, чтение10000мс. Abort по сроку не гарантирует физическую отмену непослушного backend.
// EN: Ceilings: 10000000 base64 bytes, 8000px per side, 61440 text bytes and 10000ms reads. Deadline abort does not guarantee physical cancellation of an uncooperative backend.


export const IMAGE_BASE64_LIMIT = 10_000_000;
export const IMAGE_DIMENSION_LIMIT = 8000;
export const IMAGE_MARKER = '<dsh-read-image-v1>';
const TYPES = new Set(['image/png','image/jpeg','image/webp','image/gif']);
export function claudeImageCall(agent, tool) {
  const route=agent?.session?.requestHeader?.()?.config ?? agent?.options;
  return tool==='read_image' && route?.provider==='claude-oauth' && typeof route.model==='string' && route.model.startsWith('claude-');
}
export async function imageContent(ctx, result) {
  const store=ctx.get('attachments');
  if (!store?.readImage) throw Error('read_image: attachment service unavailable');
  const blocks=result?.content;
  if (!Array.isArray(blocks) || blocks.some(b=>!['text','image'].includes(b?.type))) throw Error('read_image: invalid result blocks');
  const images=blocks.filter(b=>b.type==='image');
  if (images.length!==1) throw Error('read_image: expected exactly one stored image');
  const ref=images[0].attachment, limits=store.imageLimits;
  if (![limits?.maxImageBytes,limits?.maxMessageImageBytes].every(n=>Number.isSafeInteger(n)&&n>0)) throw Error('read_image: storage byte limits unavailable');
  const maxBytes=Math.min(limits.maxImageBytes,limits.maxMessageImageBytes,3*Math.floor(IMAGE_BASE64_LIMIT/4));
  if (!ref || !Number.isSafeInteger(ref.bytes) || ref.bytes<1 || !TYPES.has(ref.mediaType) || typeof ref.attachmentId!=='string') throw Error('read_image: invalid attachment reference');
  if (ref.bytes>maxBytes) throw Error(`read_image: картинка больше ${maxBytes} байт (base64 не более ${IMAGE_BASE64_LIMIT})`);
  if (![ref.width,ref.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=IMAGE_DIMENSION_LIMIT)) throw Error(`read_image: картинка больше ${IMAGE_DIMENSION_LIMIT} px или неверные размеры`);
  if (blocks.some(b=>b.type==='text'&&typeof b.text!=='string') || Buffer.byteLength(blocks.filter(b=>b.type==='text').map(b=>b.text).join(''))+Buffer.byteLength(IMAGE_MARKER)>60*1024) throw Error('read_image: text envelope exceeds 61440 bytes');
  const ac=new AbortController();let timer,stored;
  try {
    stored=await Promise.race([store.readImage(ref,ac.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{ac.abort();reject(Error('read_image: attachment read exceeded 10000 ms'));},10000)})]);
  } finally {clearTimeout(timer);}
  if (!(stored?.data instanceof Uint8Array) || stored.data.byteLength!==ref.bytes || ['attachmentId','mediaType','width','height','bytes'].some(k=>stored.ref?.[k]!==ref[k])) throw Error('read_image: stored image does not match reference');
  const content=blocks.map(b=>b.type==='text'?{type:'text',text:b.text}:{type:'image',mimeType:stored.ref.mediaType,data:Buffer.from(stored.data).toString('base64')});
  content.unshift({type:'text',text:IMAGE_MARKER});
  return {mcpImageVersion:1,mcpContent:content};
}
