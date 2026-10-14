// RU: Подставной compaction backend: без сети; сохраняет полный backup и последние три строки для проб gateway caller. Не проверяет алгоритм внешнего модуля.
// EN: Fixture compaction backend: no network; preserves a full backup and the last three rows for gateway caller tests. Does not test the external module algorithm.
import fs from 'node:fs';import path from 'node:path';
export const KOMPAKT_POROG=1000000,KOMPAKT_STUPENI=[.6,.8,.95],STUPEN_SESSII=new Map(),KOMPAKT_SHLYUZOVOJ=true,KOMPAKT_PLATFORMENNYJ=false;
export const porogIzPreseta=()=>({porog:1000000,okno:2000000,dolya:.5});
export const stupenZanjatosti=z=>z<600000?-1:z<800000?0:z<950000?1:2;
export const putSessii=(sid,cwd)=>path.join(cwd,sid+'.jsonl');
export const vedraPoImeni=u=>({inputTokens:u?.input_tokens??0,outputTokens:u?.output_tokens??0,cacheReadTokens:u?.cache_read_input_tokens??0,cacheWriteTokens:u?.cache_creation_input_tokens??0});
export const polnayaZanyatost=u=>(u?.input_tokens??0)+(u?.cache_read_input_tokens??0)+(u?.cache_creation_input_tokens??0);
export const zanyatostIzZhurnala=()=>null;
export const reshitKompakt=(z,p,on)=>z===null||z===undefined||Number.isNaN(z)?'neizvestno':z<p?'zdyot':on===false?'vyklyuchen':'zhat';
export async function fizicheskiyKompakt(file) {
 const raw=fs.readFileSync(file,'utf8'),rows=raw.trim().split('\n').map(JSON.parse),backup=file+'.fixture-backup';fs.writeFileSync(backup,raw);
 const tail=rows.slice(-3),boundary={type:'system',subtype:'compact_boundary',uuid:'fixture-boundary',content:'fixture summary'};
 let parent=boundary.uuid;for(const row of tail){row.parentUuid=parent;parent=row.uuid}
 fs.writeFileSync(file,[boundary,...tail].map(JSON.stringify).join('\n')+'\n');
 return {sdelano:true,zapas:backup,svodkaZnakov:15,vhodZnakov:raw.length,vsegoZnakov:raw.length,vhodHodov:rows.length,otbrosheno:0,obrezano:false,bylo:rows.length,stalo:tail.length+1};
}
