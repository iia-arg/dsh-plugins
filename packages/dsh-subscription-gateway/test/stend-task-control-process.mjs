// RU: Проверка stend-task-control-process: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-task-control-process verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.

import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {progonAppServer,sozdatKlienta} from '../codex-app-server.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'control-process-'));const stub=fileURLToPath(new URL('./zaglushka-app-server.mjs',import.meta.url));
try{
 for(const phase of ['before-tool','during-tool','after-tool'])for(let repeat=1;repeat<=3;repeat++){
  const trace=path.join(root,phase+'-'+repeat);let handler;let release;const ready=new Promise(r=>release=r);let phaseReady;const boundary=new Promise(r=>phaseReady=r);const events=[];
  const run=(async()=>{for await(const e of progonAppServer({bin:process.execPath,klientImpl:o=>{const k=sozdatKlienta({...o,args:[stub]});k.slushat((m,p)=>{if(phase==='during-tool'&&m==='item/started')phaseReady();if(phase==='after-tool'&&m==='item/completed'&&p.item?.type==='commandExecution')phaseReady();});return k;},env:{...process.env,STUB_SCENARIJ:'task-control',STUB_SHAG_MS:'100',STUB_ZANYATO:'11,12,13,14',STUB_ZHURNAL:trace},log(){},zapros:'A',porog:{porog:10},tekstSignala:'PRESSURE',registerTaskControl:f=>{handler=f;release();return ()=>{};}}))events.push(e);})();
  await ready;if(phase!=='before-tool')await boundary;
  const result=await handler({binding:{control_id:'B',target_receipt:'A'},body:'STOP-A',op:'cancel'});assert.equal(result.accepted,true);assert.equal(result.model_response,'unknown');await run;
  const methods=fs.readFileSync(trace,'utf8').split('\n');const steers=methods.filter(x=>x.startsWith('<- turn/steer ')).map(x=>JSON.parse(x.slice('<- turn/steer '.length)));assert.equal(steers.length,2);assert.ok(steers.every(s=>s.expectedTurnId==='hod-1'));assert.equal(steers.filter(s=>s.input[0].text==='PRESSURE').length,1);assert.equal(steers.filter(s=>s.input[0].text.includes('STOP-A')).length,1);assert.equal(methods.some(s=>s.includes('INTERRUPT')),false);assert.equal(events.at(-1).ostanovlenShlyuzom,true);console.log('PASS subprocess',phase,repeat);
 }
}finally{fs.rmSync(root,{recursive:true,force:true});}
