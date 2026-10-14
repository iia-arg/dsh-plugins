// B-N-738: датчик хода на формах DSH 0.1.1 (events) и 0.2.0 (snapshotEvents): platform_seq считается через службу ядра
// ctx.pamyat; журнал не читается — своя причина в строке, uuid всё равно коррелируется, строка пишется (не падаем).
// Служба — настоящий apply() ядра: DSH_PAMYAT_CORE (по умолчанию боевое /opt/agent-plugins/node_modules/dsh-pamyat-core).
// Коды: 0 — сошлось, 1 — расхождение, 2 — слепота.
import {installSensor} from './turn-sensor.mjs';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const yadro=process.env.DSH_PAMYAT_CORE||'/opt/agent-plugins/node_modules/dsh-pamyat-core';
let pm;try{const {apply}=await import(pathToFileURL(path.join(yadro,'src','index.js')).href);const s={};const kat=fs.mkdtempSync(path.join(os.tmpdir(),'sensor-core-'));apply({provide(i,o){s[i]=o},on(){},logger:{error(){}}},{putBazy:path.join(kat,'s.db'),agent:'stend'});pm=s.pamyat;process.on('exit',()=>fs.rmSync(kat,{recursive:true,force:true}))}catch(e){console.log('СЛЕПОТА: ядро не загрузилось ('+String(e?.code??e?.message).slice(0,80)+')');process.exit(2)}
if(typeof pm?.sobytiyaSessii!=='function'){console.log('СЛЕПОТА: в ядре нет помощника событий (ядро старше B-N-738) — ставится одним окном');process.exit(2)}
let ok=0,bad=0;const proba=(imya,p,z)=>{const r=JSON.stringify(p)===JSON.stringify(z);r?ok++:bad++;console.log(`${r?'ок ':'КРАСНОЕ'} ${imya}: получили ${JSON.stringify(p)}, ждали ${JSON.stringify(z)}`)};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turn-sensor-sob-'));
try{
 const dbPath=path.join(dir,'map.db');const db=new DatabaseSync(dbPath);db.exec('CREATE TABLE sessions(kluch TEXT,sessionId TEXT)');db.prepare('INSERT INTO sessions VALUES(?,?)').run(createHash('sha256').update('user\0probe').digest('hex').slice(0,32),'11111111-2222-3333-4444-555555555555');db.close();
 const E=[{type:'compaction/start',seq:3},{type:'compaction/end',seq:7},{type:'turn/start',seq:8}];
 const run=(agent,session,sPamyat)=>{const hooks={};const ctx={on:(n,f)=>hooks[n]=f,emit:(_,n,r)=>r.push({auto:true,thresholdRatio:.9}),get:n=>n==='tokenMeter'?{measure:()=>({totalTokens:500,baseline:{kind:'usage'}})}:n==='llm'?{resolveModelInfo:async()=>({context:{contextWindow:1000}})}:n==='pamyat'?(sPamyat?pm:undefined):undefined};
  installSensor(ctx,{agent,logDir:dir,gatewayDb:dbPath},(a)=>a);return hooks;};
 const common={header:{createdAt:1},requestHeader:()=>({config:{provider:'p',model:'m'}}),deriveMessages:()=>[{role:'user',content:'probe'}]};
 const cases=[['alfa',{id:'a',...common,events:E},false],['beta',{id:'b',...common,snapshotEvents:()=>Object.freeze([...E])},true],['gamma',{id:'g',...common},true]];
 for(const [agent,session,sp] of cases){const h=run(agent,session,sp);await h['agent/pre-step']({agent:{session},turn:1},()=>{});h['session/event'](session,{type:'turn/end',seq:9,time:1,data:{turn:1}});}
 const row=(a)=>JSON.parse(fs.readFileSync(path.join(dir,a+'.jsonl'),'utf8').trim().split('\n').pop());
 const a=row('alfa'),b=row('beta'),g=row('gamma');
 proba('0.1.1 без службы: platform_seq, uuid, без ошибки (прежнее)',[a.platform_seq,a.uuid,a.error??null],[7,'11111111-2222-3333-4444-555555555555',null]);
 proba('0.2.0 со службой: platform_seq = 0.1.1',[b.platform_seq,b.uuid,b.error??null],[7,'11111111-2222-3333-4444-555555555555',null]);
 proba('журнала нет: своя причина, uuid есть, строка записана',[g.platform_seq,g.uuid,g.error],[null,'11111111-2222-3333-4444-555555555555','session events unavailable (ни events, ни snapshotEvents)']);
}finally{fs.rmSync(dir,{recursive:true,force:true})}
console.log(`\ntest_turn_sensor_sobytiya: ok=${ok} FAIL=${bad}`);process.exit(bad===0?0:1);
