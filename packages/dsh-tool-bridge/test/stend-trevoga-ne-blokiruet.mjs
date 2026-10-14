// RU: Стенд неблокирующей тревоги (аудит №7): отправщик тревоги зависает на 2 с — вызов тревоги о пропаже источника возвращается сразу (event loop процесса DSH не держится), письмо всё равно приходит; отказ отправщика не съедает выдержку — следующая тревога уходит. Настоящий execFile, функции вырезаны из моста. Код: 0 — все пробы, 1 — красная, 2 — слепота.
// EN: Non-blocking alert stand (audit #7): the alert sender hangs for 2 s — the source-loss alert call returns at once (the DSH event loop is not held), the letter still arrives; a sender failure does not consume the cooldown — the next alert goes out. Real execFile, functions cut from the bridge. Exit: 0 — all probes, 1 — a red one, 2 — blind.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFile,execFileSync} from 'node:child_process';
const SRC=process.env.MOST_SRC||path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)),'src','index.js');
const lines=fs.readFileSync(SRC,'utf8').split('\n');
const stroka=(nachalo)=>lines.find((l)=>l.startsWith(nachalo))??null;
const vyrez=(imya)=>{const i=lines.findIndex((l)=>l.startsWith(`function ${imya}(`));if(i<0)return null;const j=lines.findIndex((l,k)=>k>i&&l==='}');return j<0?null:lines.slice(i,j+1).join('\n')};
const kuski=[stroka('const TREVOGA_POVTOR_MS ='),stroka('const otkazIstochnika ='),vyrez('trevogaOtkazIstochnika')];
if(kuski.some((k)=>k===null)){console.log('СЛЕПОТА: в предмете нет TREVOGA_POVTOR_MS / otkazIstochnika / trevogaOtkazIstochnika ('+SRC+')');process.exit(2)}
const zhurnal=[];const log=(s)=>zhurnal.push(String(s));
const T=new Function('log','existsSync','execFile','execFileSync','process',`${kuski.join('\n')}\nreturn { trevogaOtkazIstochnika, otkazIstochnika }`)(log,fs.existsSync,execFile,execFileSync,process);
const stol=fs.mkdtempSync(path.join(os.tmpdir(),'stend-trevoga-'));const pisma=path.join(stol,'pisma.txt'),otkaz=path.join(stol,'otkaz'),otpr=path.join(stol,'otpravshchik');
fs.writeFileSync(otpr,`#!${process.execPath}\nconst fs=require('fs');setTimeout(()=>{if(fs.existsSync(${JSON.stringify(otkaz)}))process.exit(1);fs.appendFileSync(${JSON.stringify(pisma)},'pismo\\n')},2000)\n`,{mode:0o755});
const pisem=()=>fs.existsSync(pisma)?fs.readFileSync(pisma,'utf8').split('\n').filter(Boolean).length:0;
const zhdat=async(usl,ms)=>{const d=Date.now()+ms;while(!usl()&&Date.now()<d)await new Promise((r)=>setTimeout(r,50));return usl()};
let proshlo=0,vsego=0;
const proba = async (imya, f) => {vsego++;try{const r=await f();if(r!==undefined&&r!==true)throw Error('тело пробы ВЕРНУЛО «'+String(r).slice(0,60)+'» — возврат не зеленеет (проверка по устройству, A-N-1948 №6)');proshlo++;console.log('  ✅ '+imya)}catch(e){console.log('  ❌ '+imya+': '+String(e?.message??e).slice(0,240))}};
try{
 await proba('отправщик висит 2 с — вызов тревоги возвращается сразу (< 500 мс)',async()=>{const t0=Date.now();T.trevogaOtkazIstochnika('a1',60,86400,otpr);const ms=Date.now()-t0;if(ms>=500)throw Error(`вызов держал процесс ${ms} мс`);});
 await proba('письмо всё равно приходит (до 5 с)',async()=>{if(!await zhdat(()=>pisem()===1,5000))throw Error('писем '+pisem());});
 fs.writeFileSync(otkaz,'');
 await proba('отказ отправщика не съедает выдержку: после отказа следующая тревога уходит',async()=>{
  T.trevogaOtkazIstochnika('a2',60,86400,otpr);await new Promise((r)=>setTimeout(r,3000));fs.rmSync(otkaz);
  T.trevogaOtkazIstochnika('a2',60,86400,otpr);if(!await zhdat(()=>pisem()===2,5000))throw Error('писем '+pisem()+', ждали 2 — повтор подавлен выдержкой после отказа');});
 await proba('успешная тревога держит выдержку: повтор сразу подавлен',async()=>{T.trevogaOtkazIstochnika('a1',60,86400,otpr);await new Promise((r)=>setTimeout(r,2500));if(pisem()!==2)throw Error('писем '+pisem()+', ждали 2');});
}finally{fs.rmSync(stol,{recursive:true,force:true})}
console.log('  итог: '+proshlo+' из '+vsego);process.exitCode=proshlo===vsego?0:1;
