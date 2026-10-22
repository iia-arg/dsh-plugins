const methods=new Set(['getMe','getWebhookInfo','getChat','getChatMember','getUpdates','sendMessage','sendDocument','answerCallbackQuery']);
const connectRefusal=e=>e?.code==='UND_ERR_CONNECT_TIMEOUT'||e?.syscall==='connect'&&e.code==='ECONNREFUSED'||e?.syscall==='getaddrinfo'&&['ENOTFOUND','EAI_AGAIN'].includes(e.code);
const provenUnsent=e=>e?.cause instanceof AggregateError?e.cause.errors.length>0&&e.cause.errors.every(connectRefusal):connectRefusal(e?.cause);
export const sameTelegramText=(actual,expected)=>typeof actual==='string'&&typeof expected==='string'&&actual.replace(/[ \t\r\n]+$/u,'')===expected.replace(/[ \t\r\n]+$/u,'');
export class TelegramFailure extends Error {constructor(kind,code=0,retryAfter=0,description=null){super('Telegram '+kind);this.kind=kind;this.code=code;this.retryAfter=retryAfter;this.description=description}}
export class TelegramApi {
 constructor(token,{fetchImpl=fetch}={}){if(!/^[0-9]{5,16}:[A-Za-z0-9_-]{20,128}$/.test(token))throw Error('Telegram token format rejected');this.token=token;this.fetch=fetchImpl;this.abort=new AbortController()}
 stop(){this.abort.abort()}
 async call(method,args={},documentText,{beforeSend}={}){
  if(!methods.has(method))throw Error('Telegram method rejected');
  let responseReceived=false;
  try{
   let body,headers;
   if(documentText!==undefined){body=new FormData();for(const [k,v] of Object.entries(args))body.append(k,typeof v==='object'?JSON.stringify(v):String(v));body.append('document',new Blob([documentText],{type:'text/plain;charset=utf-8'}),'draft.txt')}
   else{body=JSON.stringify(args);headers={'Content-Type':'application/json'}}
   if(beforeSend!==undefined&&(typeof beforeSend!=='function'||beforeSend()!==true))throw new TelegramFailure('deferred');
   const response=await this.fetch(`https://api.telegram.org/bot${this.token}/${method}`,{method:'POST',body,headers,redirect:'error',signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(25000)])});
   responseReceived=true;
   let size=0;const parts=[];for await(const part of response.body){size+=part.length;if(size>2*1024*1024)throw new TelegramFailure('unknown');parts.push(part)}
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
   if(value?.ok===true&&response.status===200)return value.result;
   if(value?.ok===false&&Number.isInteger(value.error_code)&&value.error_code>=400&&value.error_code<500&&value.error_code!==408)throw new TelegramFailure('rejected',value.error_code,value.parameters?.retry_after??0,typeof value.description==='string'?value.description.slice(0,200):null);
   throw new TelegramFailure('unknown');
  }catch(e){if(e instanceof TelegramFailure)throw e;throw new TelegramFailure(!responseReceived&&provenUnsent(e)?'not_sent':'unknown')}
 }
}
