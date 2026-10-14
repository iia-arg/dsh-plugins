// RU: Стенд инициализации хранилища ключей через путь с символической ссылкой (аудит №5): каталог ключей ещё не существует, его родитель — ссылка на другой каталог; --initialize обязан пройти и сразу читаться, а не оставить частичную подготовку («неверный маркер поколения»). Код: 0 — все пробы, 1 — красная, 2 — слепота.
// EN: Request-key store initialization through a symlinked path (audit #5): the key directory does not exist yet, its parent is a symlink to another directory; --initialize must succeed and read back, not leave a partial preparation ("invalid generation marker"). Exit: 0 — all probes, 1 — a red one, 2 — blind.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const base=path.resolve(process.argv[2]||new URL('..',import.meta.url).pathname);
const {initializeRequestState,readRequestState}=await import(pathToFileURL(path.join(base,'src/ostrov-request-state.mjs')).href);
const t=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'stend-simlink-')));
let proshlo=0,vsego=0;
const proba = (imya, f) => {vsego++;try{const r=f();if(r!==undefined&&r!==true)throw Error('тело пробы ВЕРНУЛО «'+String(r).slice(0,60)+'» — возврат не зеленеет (проверка по устройству, A-N-1948 №6)');proshlo++;console.log('  ✅ '+imya)}catch(e){console.log('  ❌ '+imya+': '+String(e?.message??e).slice(0,240))}};
try{
 const real=path.join(t,'real'),link=path.join(t,'link'),ws=path.join(t,'workspace');fs.mkdirSync(real);fs.mkdirSync(ws);fs.symlinkSync(real,link);
 const dir=path.join(link,'ostrov-keys');
 proba('initialize через ссылку на ещё не созданный каталог — проходит',()=>{initializeRequestState(dir,ws);});
 proba('после initialize состояние читается (маркеры с настоящим путём)',()=>{const s=readRequestState(dir,ws);if(s.directory!==path.join(real,'ostrov-keys'))throw Error('directory '+s.directory);});
 const ws2=path.join(t,'ws2'),real2=path.join(t,'real2');fs.mkdirSync(ws2);fs.mkdirSync(path.join(real2,'ostrov-keys'),{recursive:true});fs.symlinkSync(real2,path.join(t,'link2'));
 proba('контроль: каталог под ссылкой уже существует — проходит, как прежде',()=>{initializeRequestState(path.join(t,'link2','ostrov-keys'),ws2);readRequestState(path.join(t,'link2','ostrov-keys'),ws2);});
}finally{fs.rmSync(t,{recursive:true,force:true})}
console.log('  итог: '+proshlo+' из '+vsego);process.exitCode=proshlo===vsego?0:1;
