// RU: Единственная попытка import при старте. Отсутствующий/неполный backend не роняет SDK транспорт; недоступные измерения возвращают null, физическое сжатие явно отказывает.
// EN: Import once at startup. A missing/incomplete backend preserves SDK transport; unavailable measurements return null and physical compaction explicitly refuses.
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const functions=['stupenZanjatosti','putSessii','fizicheskiyKompakt','porogIzPreseta','reshitKompakt','polnayaZanyatost','vedraPoImeni','zanyatostIzZhurnala'];
// RU: Reader возвращает измерение либо явную причину; null и безымянное отсутствие порога недопустимы.
// EN: Readers return a measurement or an explicit reason; null and unexplained missing thresholds are invalid.
function checkPolicy(p) {
 if(!p||typeof p!=='object'||(p.porog!==undefined?!(Number.isFinite(p.porog)&&p.porog>0):typeof p.prichina!=='string'||!p.prichina))throw Error('invalid compaction threshold reader');
 return p;
}
export async function loadCompaction(modulePath) {
 let reason='compaction unavailable: GATEWAY_COMPACTION_MODULE not configured';
 if(modulePath)try{
  const api=await import(pathToFileURL(resolve(modulePath)).href);
  const missing=functions.filter(k=>typeof api[k]!=='function');
  if(missing.length||!(api.STUPEN_SESSII instanceof Map)||!Array.isArray(api.KOMPAKT_STUPENI))throw Error('incomplete compaction contract: '+missing.join(', '));
  if(!Number.isFinite(api.KOMPAKT_POROG)||api.KOMPAKT_POROG<=0||!api.KOMPAKT_STUPENI.length||api.KOMPAKT_STUPENI.some(n=>!Number.isFinite(n)||n<=0||n>=1))throw Error('invalid compaction constants');
  checkPolicy(api.porogIzPreseta());
  const safeApi={...api,porogIzPreseta:(...args)=>{try{return checkPolicy(api.porogIzPreseta(...args))}catch(e){return {prichina:'compaction threshold unavailable: '+String(e?.message??e).slice(0,160)}}}};
  return {available:true,reason:null,api:safeApi};
 }catch(e){reason='compaction unavailable: '+String(e?.message??e).slice(0,300)}
 const unknown=()=>null;
 return {available:false,reason,api:{
  porogIzPreseta:()=>({prichina:reason}),putSessii:unknown,
  stupenZanjatosti:()=>-1,STUPEN_SESSII:new Map(),KOMPAKT_STUPENI:[],
  KOMPAKT_POROG:undefined,KOMPAKT_SHLYUZOVOJ:undefined,KOMPAKT_PLATFORMENNYJ:undefined,
  polnayaZanyatost:unknown,zanyatostIzZhurnala:unknown,
  vedraPoImeni:()=>({inputTokens:null,outputTokens:null,cacheReadTokens:null,cacheWriteTokens:null}),
  reshitKompakt:()=> 'nedostupen',fizicheskiyKompakt:async()=>{throw Error(reason)},
 }};
}
