export class MetaError extends Error{
 constructor(reason,{code=0,retryAt=0}={}){super('Meta operation rejected');this.reason=reason;this.code=code;this.retryAt=retryAt}
}
const safeId=x=>typeof x==='string'&&x.length>0&&x.length<=1024&&!/[\0-\x1f\x7f]/.test(x);
export class MetaApi{
 constructor({provider,account,version,token,budget,fetchImpl=fetch,allowRefresh=false}){
  if(!['instagram','threads'].includes(provider)||!safeId(account)||!/^v[0-9]{1,2}\.[0-9]{1,2}$/.test(version)||typeof token!=='string'||!token||token.length>4096||/[\r\n\0]/.test(token)||typeof budget?.reserve!=='function')throw new MetaError('configuration');
  Object.assign(this,{provider,account,version,token,budget,fetch:fetchImpl});this.allowRefresh=allowRefresh===true;this.origin=provider==='instagram'?'https://graph.instagram.com':'https://graph.threads.net';this.abort=new AbortController();
 }
 stop(){this.abort.abort();this.token=''}
 nextCursor(paging,path){
  if(!paging)return null;
  if(typeof paging!=='object'||Array.isArray(paging))throw new MetaError('page_shape');
  if(paging.next!==undefined){
   let url;try{url=new URL(paging.next)}catch{throw new MetaError('page_origin')}
   if(url.origin!==this.origin||url.username||url.password||url.hash||typeof path!=='string'||url.pathname!==path)throw new MetaError('page_origin');
   const cursor=paging.cursors?.after??url.searchParams.get('after');
   if(!safeId(cursor)||cursor.length>1024)throw new MetaError('page_cursor');return cursor;
  }
  return null;
 }
 route(method,args){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(x=>!['id','after'].includes(x))||args.after!==undefined&&!safeId(args.after))throw new MetaError('method_or_target');
  const id=args.id;if(id!==undefined&&!safeId(id))throw new MetaError('method_or_target');
  const p=this.provider,own=encodeURIComponent(this.account),object=encodeURIComponent(id??'');
  let edge,fields;
  if(method==='me'&&id===undefined){edge='me';fields=p==='instagram'?'user_id,username':'id,username'}
  else if(method==='roots'&&id===undefined){edge=own+(p==='instagram'?'/media':'/threads');fields='id,timestamp'}
  else if(p==='instagram'&&method==='conversations'&&id===undefined){edge=own+'/conversations';fields='id'}
  else if(p==='instagram'&&method==='messages'&&id){edge=object;fields='messages{id,created_time,from,to,message}'}
  else if(p==='instagram'&&method==='message_page'&&id){edge=object+'/messages';fields='id,created_time,from,to,message'}
  else if(p==='instagram'&&method==='message'&&id){edge=object;fields='id,created_time,from,to,message'}
  else if(p==='instagram'&&method==='comments'&&id){edge=object+'/comments';fields='id,text,timestamp,from'}
  else if(p==='instagram'&&method==='replies'&&id){edge=object+'/replies';fields='id,text,timestamp,from'}
  else if(p==='threads'&&['replies','conversation'].includes(method)&&id){edge=object+'/'+method;fields='id,text,timestamp,username,is_reply_owned_by_me,root_post,replied_to'}
  else throw new MetaError('method_or_target');
  const url=new URL(this.origin+'/'+this.version+'/'+edge);url.searchParams.set('fields',fields);
  if(method!=='me'&&method!=='message')url.searchParams.set('limit','50');
  if(args.after!==undefined)url.searchParams.set('after',args.after);
  return url;
 }
 usage(headers){
  let peak=0,known=false;
  for(const name of ['x-app-usage','x-business-use-case-usage']){
   const raw=headers.get(name);if(!raw)continue;
   if(raw.length>16384)throw new MetaError('usage_shape');
   let data;try{data=JSON.parse(raw)}catch{throw new MetaError('usage_shape')}
   const walk=(v,depth=0)=>{if(depth>4)throw new MetaError('usage_shape');if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(['call_count','total_time','total_cputime'].includes(k)){if(typeof x!=='number'||!Number.isFinite(x)||x<0)throw new MetaError('usage_shape');peak=Math.max(peak,Math.min(100,x));known=true}else if(x&&typeof x==='object')walk(x,depth+1)}};
   walk(data);
  }
  if(known){this.budget.patch({usage:peak});if(peak>=90)this.budget.backoff('usage_limit',this.budget.now()+3600000)}
 }
 async call(method,args={},options={}){
  return this.request(this.route(method,args),options);
 }
 async refresh(options={}){
  if(!this.allowRefresh)throw new MetaError('refresh_not_armed');
  const url=new URL(this.origin+'/refresh_access_token');url.searchParams.set('grant_type',this.provider==='instagram'?'ig_refresh_token':'th_refresh_token');url.searchParams.set('access_token',this.token);
  return this.request(url,options);
 }
 async request(url,options={}){
  const remaining=Math.min(30000,options.timeoutMs??30000);
  if(!Number.isFinite(remaining)||remaining<=0)throw new MetaError('deadline');
  this.budget.reserve();let response,data;
  try{
   response=await this.fetch(url.href,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+this.token},signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(Math.max(1,Math.floor(remaining)))])});
   this.usage(response.headers);
   let size=0;const chunks=[];for await(const chunk of response.body??[]){size+=chunk.length;if(size>8388608)throw new MetaError('response_limit');chunks.push(chunk)}
   data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  }catch(e){if([429,401,403].includes(response?.status))data={};else {if(e instanceof MetaError)throw e;throw new MetaError('transport_or_json')}}
  const code=Number.isSafeInteger(data?.error?.code)?data.error.code:0;
  if(response.status===429||[4,17,32,613,80002,80004,80006].includes(code)){
   const raw=response.headers.get('retry-after'),seconds=raw&&/^[0-9]{1,6}$/.test(raw)?Number(raw):900;
   const retryAt=this.budget.now()+Math.min(86400,Math.max(1,seconds))*1000;this.budget.backoff('rate_limit',retryAt);throw new MetaError('rate_limit',{code,retryAt});
  }
  if([401,403].includes(response.status)||[10,190,200,299].includes(code))throw new MetaError('permissions',{code});
  if(!response.ok||data?.error)throw new MetaError('api_error',{code:code||response.status});
  if(!data||typeof data!=='object'||Array.isArray(data))throw new MetaError('response_shape');
  return data;
 }
}
