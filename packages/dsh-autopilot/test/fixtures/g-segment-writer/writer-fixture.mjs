// Actual candidate writer on synthetic AP raw rows; no model, engine or live HOME.
import fs from 'node:fs';
import path from 'node:path';
const input=JSON.parse(fs.readFileSync(0,'utf8'));const G=await import(input.module);
let now=input.sourceCreatedAt??0;Date.now=()=>now;
try{
 fs.mkdirSync(path.dirname(input.file),{mode:0o700,recursive:true});G.prepareGatewaySegments(input.file);now=input.firstWriteAt??1000000;
 for(let i=0;i<input.parts.length;i++){
  for(const row of input.parts[i])G.appendGatewaySegment(input.file,JSON.stringify(row)+'\n');
  if(i+1<input.parts.length){now+=G.GATEWAY_USAGE_LIMITS.segmentMaxAgeSeconds*1000;G.maintainGatewaySegments(input.file)}
 }
 const result=G.inspectGatewaySegments(input.file);console.log(JSON.stringify({manifest:result.manifest,rows:result.rows.length}));
}finally{G.closeGatewaySegments()}
