import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../gateway.mjs',import.meta.url),'utf8');
const start=source.indexOf('    const reshenie = reshitKompakt('),end=source.indexOf('\n    // Anthropic принимает',start);assert(start>=0&&end>start);
const run=new Function('explicitMailStop','reshitKompakt','zanjatoPoslednee','KOMPAKT_POROG','KOMPAKT_SHLYUZOVOJ','COMPACTION','POSTAVSHCHIK','plan','sessionId','body','WORK_DIR','bridgeName','compactMcpHistory','fizicheskiyKompakt','putSessii','STUPEN_SESSII','log','return (async()=>{'+source.slice(start,end)+'})()');
for(const provider of ['anthropic','openai'])for(const stopped of [false,true]){
 let calls=0;
 const compact=async()=>{calls++;return{sdelano:false,pochemu:'fixture backend'}};
 await run(stopped,()=> 'zhat',100,50,undefined,{available:true},{imya:provider},{resume:'fixture'},'fixture',{},'/fixture','fixture',fn=>fn(),compact,()=>'/fixture/history',new Map(),()=>{});
 assert.equal(calls,stopped?0:1,'explicit signed stop must not start an auxiliary query after terminal');
}
console.log('PASS signed stop suppresses post-terminal physical query; ordinary compaction preserved for both providers');
