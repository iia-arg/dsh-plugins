import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
if(process.argv.length!==3||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,79}$/.test(process.argv[2])){
 console.error('usage: node live-pilot.mjs request_id');process.exitCode=2;
}else{
 const c=new Client({name:'socseti-live-pilot',version:'0.2.1'});
 try{
  const m=/^([a-f0-9]{64})$/.exec(process.env.SOCSETI_MCP_KEY??'');if(!m)throw Error('key format');
  await c.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8381/mcp'),{requestInit:{headers:{Authorization:'Bearer '+m[1]}}}));
  const result=await c.callTool({name:'draft_post',arguments:{request_id:process.argv[2],platform:'telegram',text:'Приёмка socseti B-N-1481: '+process.argv[2]}});
  if(result.isError)throw Error('draft refused');const value=JSON.parse(result.content[0].text);
  console.log(JSON.stringify({request_id:process.argv[2],draft_id:value.draft_id,version:value.version,published:value.published,replayed:value.replayed??false}));
 }catch{console.error('pilot client refused; inspect service status without exposing keys');process.exitCode=1}finally{await c.close()}
}
