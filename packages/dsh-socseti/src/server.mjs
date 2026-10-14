import manifest from '../package.json' with {type:'json'};
import http from 'node:http';
import Ajv from 'ajv';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {Store} from './store.mjs';
import {toolsForRole,LIMITS} from './contract.mjs';
import {loadKeys,authenticate} from './auth.mjs';
const ajv=new Ajv({strict:true,coerceTypes:false,removeAdditional:false,allErrors:false});
const validators=new Map([...toolsForRole('varvara'),...toolsForRole('monitor')].map(t=>[t.name,ajv.compile(t.inputSchema)]));
const errors=new Set(['text rejected','request_id conflict','event not available','draft not available','version conflict','draft capacity reached','version capacity reached','platform not allowed']);
export async function startServer(config){
 const keys=loadKeys(config.keyFiles,config.profile),store=new Store(config.stateDir,config.targets,{profile:config.profile});let active=0;
 const server=http.createServer({headersTimeout:5000,requestTimeout:10000,maxHeaderSize:8192},async(req,res)=>{
  const fail=(status,message)=>{if(!res.headersSent)res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({error:message}))};
  const role=authenticate(req.headers.authorization,keys);
  if(!role){fail(401,'unauthorized');req.resume();return}
  if(req.headers.host!==`127.0.0.1:${server.address().port}`||req.headers.origin!==undefined){fail(403,'origin or host rejected');req.resume();return}
  const channelRoute=config.profile==='anna'&&['/channel/cursor','/channel/ingress','/channel/pending','/channel/ack','/channel/callback'].includes(req.url);
  if(channelRoute&&role!=='channel'){fail(403,'channel authority required');req.resume();return}
  if(req.url!=='/mcp'&&!channelRoute){fail(404,'not found');req.resume();return}
  if(req.method!=='POST'){fail(405,'POST required');req.resume();return}
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??'')){fail(415,'JSON required');req.resume();return}
  if(active>=16){fail(503,'busy');req.resume();return}
  active++;const timer=setTimeout(()=>req.destroy(),10000);timer.unref();let mcp;
  try{
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>LIMITS.bodyBytes){fail(413,'body too large');return}chunks.push(chunk)}
   let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch{fail(400,'invalid JSON');return}
   if(!body||typeof body!=='object'||Array.isArray(body)){fail(400,'single JSON-RPC object required');return}
   if(channelRoute){
    let result;
    const exact=names=>Object.keys(body).every(k=>names.includes(k))&&names.every(k=>Object.hasOwn(body,k));
    try{
     if(req.url==='/channel/cursor'){
      if(Object.keys(body).length)throw Error('channel input rejected');result={cursor:store.cursor(`telegram:${config.targets.telegram}`)};
     }else if(req.url==='/channel/ingress'){
      if(!exact(['source','expectedCursor','cursor','events'])||body.source!==`telegram:${config.targets.telegram}`)throw Error('channel input rejected');
      result=store.ingestTelegramBatch('anna',body);
     }else if(req.url==='/channel/pending'){
      if(Object.keys(body).length)throw Error('channel input rejected');result=store.pendingAnna();
     }else if(req.url==='/channel/ack'){
      if(!exact(['id','payload_hash']))throw Error('channel input rejected');result=store.acknowledgeAnna(body.id,body.payload_hash);
     }else{
      if(!store.telegramQueue){fail(503,'Telegram queue unavailable');return}result=store.telegramQueue.processUpdate(body);
     }
    }catch(e){fail(e.message.includes('capacity')?503:e.message.includes('conflict')?409:400,'channel input or storage rejected');return}
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(result));return;
   }
   const catalog=toolsForRole(role);
   mcp=new Server({name:'socseti',version:manifest.version},{capabilities:{tools:{}}});
   mcp.setRequestHandler(ListToolsRequestSchema,async()=>({tools:catalog}));
   mcp.setRequestHandler(CallToolRequestSchema,async({params})=>{
    const error=message=>({isError:true,content:[{type:'text',text:message}]});
    if(!catalog.some(t=>t.name===params.name))return error('tool unavailable');
    const args=params.arguments??{};if(!validators.get(params.name)(args))return error('arguments rejected');
    try{const result=params.name==='status'?store.status():store.execute(role,params.name,args);return {content:[{type:'text',text:JSON.stringify(result)}]}}
    catch(e){return error(errors.has(e.message)?e.message:'storage operation rejected')}
   });
   const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
   await mcp.connect(transport);res.setHeader('Cache-Control','no-store');await transport.handleRequest(req,res,body);
  }catch{fail(500,'request failed')}finally{clearTimeout(timer);active--;await mcp?.close()}
 });
 server.maxConnections=32;server.keepAliveTimeout=1000;
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'127.0.0.1',resolve)})}catch(e){store.close();throw e}
 return {url:`http://127.0.0.1:${server.address().port}/mcp`,store,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close()}};
}
