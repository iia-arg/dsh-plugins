// Local RPC transport; initialize userAgent is copied verbatim from a real CLI reply.
import readline from 'node:readline';
import fs from 'node:fs';
const sample=JSON.parse(fs.readFileSync(new URL('./codex-initialize-actual.json',import.meta.url)));
const ua=sample.results.find(x=>x.label===process.env.PROBE_INITIALIZE_LABEL).userAgent;
const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
for await(const line of readline.createInterface({input:process.stdin})){
 const m=JSON.parse(line),reply=result=>send({id:m.id,result});
 if(m.method==='initialize')reply({userAgent:ua});
 else if(m.method==='thread/start')reply({thread:{id:'root-thread'}});
 else if(m.method==='turn/start'){
  reply({turn:{id:'root-turn'}});
  setTimeout(()=>send({method:'turn/completed',params:{threadId:'root-thread',turn:{id:'root-turn',status:'completed'}}}),5);
 }else if(m.id!==undefined)reply({});
}
