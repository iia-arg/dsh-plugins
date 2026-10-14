// RU: Проверка stend-image-platform-checkpoint: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-image-platform-checkpoint verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.

import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import * as nodeCrypto from 'node:crypto';
const source=fs.readFileSync(new URL('../gateway.mjs',import.meta.url),'utf8');
const functions=['buildPrompt','hashText','tekstSoobshcheniya','kluchBesedy','hashPrefiksa','planZaprosa'].map(name=>{const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start)+2;assert(start>=0&&end>start);return source.slice(start,end)}).join('\n');
const SESSII=new Map();const api=vm.runInNewContext(functions+'; ({planZaprosa,kluchBesedy,hashPrefiksa})',{nodeCrypto,SESSII,RESUME_ON:true,log(){},sessiyaIzBazy:()=>undefined /* аудит №2 (1.4.57): промах кэша читает базу — здесь базы нет, предмет стенда — кэш */});
const old=[{role:'user',content:'original task'},{role:'assistant',content:'image was read'}];
SESSII.set(api.kluchBesedy(old),{sessionId:'old-sdk-session-with-images',otdano:old.length,hashPref:api.hashPrefiksa(old,old.length)});
assert.equal(api.planZaprosa([...old,{role:'user',content:'continue'}]).resume,'old-sdk-session-with-images');
const checkpoint=[{role:'user',content:'[MODE=ACTIVE]\nCompacted summary'},{role:'user',content:'Continue from checkpoint'}];
const after=api.planZaprosa(checkpoint);assert.equal(after.resume,null);assert(!after.prompt.includes('base64'));

const rewritten=[old[0],{role:'user',content:'Compacted summary'},{role:'user',content:'continue'}];assert.equal(api.planZaprosa(rewritten).resume,null);
console.log('PASS actual gateway planner: unchanged prefix resumes; DSH compacted prefix starts a new SDK session, no old image replay');
