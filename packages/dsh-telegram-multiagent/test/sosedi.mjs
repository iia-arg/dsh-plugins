// RU: Откуда стенду брать шлюз и адаптер. В дереве — соседи ../../dsh-subscription-gateway и ../../dsh-subscription-adapter;
//     в бою (/opt/agent-plugins, соседей нет) — GATEWAY_CANDIDATE и ADAPTER_CANDIDATE (обходчик: строка SREDA_STENDOV).
//     Нет модуля ни там, ни там — СЛЕПОТА, код 2 (не красное «модуль не найден»).
// EN: Where a harness takes the gateway and adapter from: tree siblings, or GATEWAY_CANDIDATE / ADAPTER_CANDIDATE; missing → blind, exit 2.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
function dir(env,sosed,proba){
  const d=process.env[env]||path.join(here,'..','..',sosed);
  if(!fs.existsSync(path.join(d,proba))){console.error(`СЛЕПОТА: нет ${path.join(d,proba)} — задайте ${env} (в дереве — сосед ../../${sosed})`);process.exit(2);}
  return d;
}
export const gatewayDir=()=>dir('GATEWAY_CANDIDATE','dsh-subscription-gateway','task-control.mjs');
export const adapterDir=()=>dir('ADAPTER_CANDIDATE','dsh-subscription-adapter','src/index.js');
// RU: B-N-1734: мост инструментов — в дереве сосед ../../dsh-tool-bridge, в бою BRIDGE_CANDIDATE (обходчик: SREDA_STENDOV — мост Варвары).
// EN: B-N-1734: tool bridge — tree sibling ../../dsh-tool-bridge, in production BRIDGE_CANDIDATE.
export const bridgeDir=()=>dir('BRIDGE_CANDIDATE','dsh-tool-bridge','src/index.js');
export const iz=(d,f)=>import(pathToFileURL(path.join(d,f)).href);
