// Break caught: hardcoded/global originator discards witness from the actual spawn env.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const source=path.resolve(process.argv[2]??path.join(import.meta.dirname,'..'));
const {progonAppServer,sozdatKlienta}=await import(pathToFileURL(path.join(source,'codex-app-server.mjs')));
const {GatewayUsage,prepareGatewayUsage,inspectGatewaySegments}=await import(pathToFileURL(path.join(source,'usage-producer.mjs')));
const home=fs.mkdtempSync(path.join(os.tmpdir(),'originator-'));
const previous=process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE;
try{
 process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE='wrong-global-originator';
 for(const [i,label,override,witness,gap] of [
  [1,'gateway-default','codex_sdk_ts',1,0],
  [2,'gateway-default','wrong-expected-originator',0,1],
  [3,'gateway-default','codex_sdk_ts',1,0],
  [4,'no-override',null,1,0],
  [5,'external-override','ap014_external',1,0],
 ]){
  const env={PATH:process.env.PATH,HOME:home,CODEX_HOME:home,PROBE_INITIALIZE_LABEL:label,...(override?{CODEX_INTERNAL_ORIGINATOR_OVERRIDE:override}:{})};
  const file=prepareGatewayUsage({provider:'openai',env}),id='originator-'+i;
  const g=new GatewayUsage({file,engine:'codex',heartbeatMs:0,descriptor:{request_id:id,binding:{session_id:'originator',session_created:1,turn:i,generation:'fixture',recipient:'fixture'}}});
  for await(const _ of progonAppServer({bin:process.execPath,env,log:()=>{},zapros:'local fixture',usageObserver:g,klientImpl:o=>sozdatKlienta({...o,args:[path.join(import.meta.dirname,'fixtures/originator-app-server.mjs')]})})){}
  await g.close();const rows=inspectGatewaySegments(file).rows.filter(x=>x.requestId===id);
  assert.equal(rows.filter(x=>x.kind==='source_version').length,witness,label+' witness from actual spawn env');
  assert.equal(rows.filter(x=>x.kind==='child_capture_gap').length,gap,label+' strict mismatch');
  if(witness)assert.equal(rows.find(x=>x.kind==='source_version').sourceVersion.cliVersion,'0.162.1');
  else assert.equal(rows.find(x=>x.kind==='child_capture_gap').detail,'VERSION_WITNESS_UNAVAILABLE');
  console.log('PASS',i,label,'witness='+witness,'gap='+gap);
 }
}finally{
 if(previous===undefined)delete process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE;else process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE=previous;
 fs.rmSync(home,{recursive:true,force:true});
}
