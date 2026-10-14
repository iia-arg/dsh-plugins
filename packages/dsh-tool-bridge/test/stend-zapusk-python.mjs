// RU: Стенд запуска клиента API Острова (аудит №8, №9): Python 3 берётся из PATH, отказ запуска интерпретатора — известный отказ («запрос не отправлен»), а не «исход не установлен»; при enabled без baseUrl/keyFile/botId мост не включает инструмент (умолчаний частной сети нет). Сеть не нужна: ключ — несуществующий файл, клиент отказывает до запроса. Код: 0 — все пробы, 1 — красная, 2 — слепота.
// EN: Ostrov API client launch stand (audit #8, #9): Python 3 comes from PATH, an interpreter launch failure is a known refusal ("request not sent"), not "outcome unknown"; with enabled and no baseUrl/keyFile/botId the bridge does not install the tool (no private-network defaults). No network: the key is a missing file, the client refuses before any request. Exit: 0 — all probes, 1 — a red one, 2 — blind.
import path from 'node:path';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const base=path.resolve(process.argv[2]||new URL('..',import.meta.url).pathname);
let m;try{m=await import(pathToFileURL(path.join(base,'src/ostrov-api.js')).href)}catch(e){console.log('СЛЕПОТА: модуль не загружен: '+String(e?.message??e).slice(0,200));process.exit(2)}
if(typeof m.callClient!=='function'){console.log('СЛЕПОТА: callClient не экспортирован — пробовать нечем');process.exit(2)}
if(spawnSync('python3',['-c','pass']).status!==0){console.log('СЛЕПОТА: python3 в PATH не запускается — проба «есть интерпретатор» невозможна');process.exit(2)}
let proshlo=0,vsego=0;
const proba = async (imya, f) => {vsego++;try{const r=await f();if(r!==undefined&&r!==true)throw Error('тело пробы ВЕРНУЛО «'+String(r).slice(0,60)+'» — возврат не зеленеет (проверка по устройству, A-N-1948 №6)');proshlo++;console.log('  ✅ '+imya)}catch(e){console.log('  ❌ '+imya+': '+String(e?.message??e).slice(0,240))}};
const config={keyFile:'/nonexistent/stend-ostrov.key',baseUrl:'http://127.0.0.1:9',botId:'1000001'};
const vyzov=async()=>{try{await m.callClient(config,{operation:'catalog',params:{}},undefined);return {ok:true}}catch(e){return {code:e.code,message:e.message}}};
await proba('python3 есть: клиент запущен и отказал по ключу — известный отказ, не «исход не установлен»',async()=>{
 const r=await vyzov();if(r.code!=='OSTROV_API_REFUSED'||!/Файл ключа/.test(r.message))throw Error(JSON.stringify(r));});
await proba('python3 нет в PATH: известный отказ «не запущен; запрос не отправлен», а не «исход не установлен»',async()=>{
 const prezhnij=process.env.PATH;process.env.PATH='/nonexistent-stend-path';let r;try{r=await vyzov()}finally{process.env.PATH=prezhnij}
 if(r.code!=='OSTROV_API_REFUSED'||!/не запущен/.test(r.message))throw Error('интерпретатор взят мимо PATH или отказ не тот: '+JSON.stringify(r));});
for(const net of ['baseUrl','keyFile','botId'])
 await proba(`enabled без ${net}: инструмент не ставится (умолчаний нет)`,async()=>{
  const cfg={enabled:true,requestKeyDir:'/nonexistent-keys',baseUrl:'http://127.0.0.1:9',keyFile:'/nonexistent.key',botId:'1000001'};delete cfg[net];
  let zaregistrirovano=0;const ctx={get:k=>k==='tools'?{register:()=>{zaregistrirovano++;return ()=>{}}}:undefined,effect:()=>{}};
  let otkaz=null;try{m.installOstrovApi(ctx,cfg)}catch(e){otkaz=e}
  if(zaregistrirovano||otkaz?.code!=='OSTROV_API_REFUSED')throw Error(`зарегистрировано ${zaregistrirovano}, отказ ${otkaz?.code??'нет'}`);});
console.log('  итог: '+proshlo+' из '+vsego);process.exitCode=proshlo===vsego?0:1;
