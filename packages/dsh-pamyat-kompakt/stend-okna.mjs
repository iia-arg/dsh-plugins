// RU: Готовые маршруты D: чтение, отсутствие пересчёта, отказ и возврат. Вычислитель порога (сборщик настроек)
//     проверяется отдельно.
// EN: Ready D routes: reading, no recomputation, refusal and recovery. The threshold calculator (settings
//     builder) is tested separately.
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const d=mkdtempSync(join(tmpdir(),'stend-gotovogo-D-'));let total=0,bad=0;
const policy={schema:1,defaultRoute:{provider:'p',model:'own'},routes:[{provider:'p',model:'own',window:921818,ratio:.8,nominalThreshold:737454},{provider:'p',model:'neighbor',window:1000000,ratio:.89,nominalThreshold:890000}]};
function write(p=policy){writeFileSync(join(d,'proba.json'),JSON.stringify({model:'deepseek-flash',oknoSvodki:700000,porogi:p}))}
function run(route=null,extra={}){
 const code=`import(${JSON.stringify(new URL('./index.mjs',import.meta.url).href)}).then(m=>console.log(JSON.stringify({p:m.porogIzPreseta('proba',${JSON.stringify(route)}),budget:m.OKNO_MODELI})))`;
 return spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,KOMPAKT_AGENT:'proba',KOMPAKT_NASTROJKI_KATALOG:d,...extra}});
}
function test(name,fn){total++;try{fn();console.log('✅ '+name)}catch(e){bad++;console.log('❌ '+name+': '+e.message)}}
function good(route){const r=run(route);if(r.status)throw Error(r.stderr);return JSON.parse(r.stdout)}
try{
 write();
 test('defaultRoute и независимое окно сумматора',()=>{const r=good();if(r.p.porog!==737454||r.p.routeSource!=='defaultRoute'||r.budget!==700000)throw Error(JSON.stringify(r))});
 test('точный маршрут соседа',()=>{if(good({provider:'p',model:'neighbor'}).p.porog!==890000)throw Error('wrong route')});
 test('неизвестный маршрут без числа',()=>{const p=good({provider:'other',model:'own'}).p;if(!p.prichina||p.porog!==undefined)throw Error('accepted')});
 test('порог не пересчитывается читателем',()=>{const p=structuredClone(policy);p.routes[0].nominalThreshold=737453;write(p);if(good().p.porog!==737453)throw Error('recomputed');write()});
 test('негодная schema даёт отказ',()=>{write({...policy,schema:2});const p=good().p;if(!p.prichina||p.porog!==undefined)throw Error('accepted');write()});
 test('битый JSON останавливает импорт, возврат работает',()=>{writeFileSync(join(d,'proba.json'),'{broken');if(run().status===0)throw Error('accepted JSON');write();if(good().p.porog!==737454)throw Error('not restored')});
 test('старый перебив не создаёт вторую правду',()=>{if(run(null,{KOMPAKT_POROG:'123'}).status===0)throw Error('accepted override')});
}finally{rmSync(d,{recursive:true,force:true})}
console.log(`итог: ${total-bad} из ${total}`);process.exitCode=bad?1:0;
