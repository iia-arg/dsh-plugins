// Isolated JSON-RPC fixture: never calls a model, account store or network.
import readline from 'node:readline';
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
const notify=(method,params)=>send({method,params});
const fields={inputTokens:2,cachedInputTokens:0,cacheWriteInputTokens:0,outputTokens:4,reasoningOutputTokens:0};
for await(const line of readline.createInterface({input:process.stdin})){
 const m=JSON.parse(line),reply=result=>send({id:m.id,result});
 if(m.method==='initialize')reply({userAgent:'subscription-gateway/0.162.1 (fixture) terminal (subscription-gateway; 99.99)',codexHome:'/fixture',platformFamily:'unix',platformOs:'linux'});
 else if(m.method==='initialized')continue;
 else if(m.method==='account/read')reply({account:null,workspaceRouting:{chatgptAccountId:null,accountRoutingOverride:null}});
 else if(m.method==='thread/start')reply({thread:{id:'root-thread',parentThreadId:null}});
 else if(m.method==='turn/start'){
  notify('turn/started',{threadId:'root-thread',turn:{id:'root-turn',status:'inProgress',startedAt:1}});
  notify('thread/started',{thread:{id:'child-thread',parentThreadId:'root-thread'}});
  notify('turn/started',{threadId:'child-thread',turn:{id:'child-turn',status:'inProgress',startedAt:1}});
  notify('item/completed',{threadId:'root-thread',turnId:'root-turn',item:{type:'collabAgentToolCall',tool:'spawnAgent',id:'call_fixture',status:'completed',receiverThreadIds:['child-thread'],prompt:'PRIVATE_CHILD_PROMPT'}});
  notify('thread/tokenUsage/updated',{threadId:'child-thread',turnId:'child-turn',tokenUsage:{last:fields,total:fields}});
  notify('turn/completed',{threadId:'child-thread',turn:{id:'child-turn',status:'completed',completedAt:2}});
  reply({turn:{id:'root-turn',status:'inProgress'}});
  setTimeout(()=>{notify('thread/tokenUsage/updated',{threadId:'root-thread',turnId:'root-turn',tokenUsage:{last:fields,total:fields}});notify('turn/completed',{threadId:'root-thread',turn:{id:'root-turn',status:'completed',completedAt:2}})},5);
 }else if(m.id!==undefined)reply({});
}
