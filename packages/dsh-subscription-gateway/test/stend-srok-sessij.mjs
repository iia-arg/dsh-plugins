// RU: Стенд срока хранения карты сессий (находка Вениамина к аудиту №2): на старте шлюз удаляет строки sessions, не обновлявшиеся дольше GATEWAY_SESSII_SROK_DNEJ суток (умолчание 30); строки без отметки (до правки) получают «сейчас» и не стираются; неверная настройка — тревога и ничего не удаляется. Код: 0 — все пробы, 1 — красная, 2 — слепота.
// EN: Session-map retention stand: on startup the gateway deletes sessions rows not updated for GATEWAY_SESSII_SROK_DNEJ days (default 30); pre-retention rows get "now" and survive; an invalid setting alerts and deletes nothing. Exit: 0 — all probes, 1 — a red one, 2 — blind.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import crypto from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
const base=path.resolve(process.argv[2]||new URL('..',import.meta.url).pathname);
const t=fs.mkdtempSync(path.join(os.tmpdir(),'stend-srok-'));
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(s.address().port)));
let gw,proshlo=0,vsego=0,journal='';
const proba = async (imya, f) => {vsego++;try{const r=await f();if(r!==undefined&&r!==true)throw Error(typeof r==='string'?r:'тело пробы вернуло '+JSON.stringify(r));proshlo++;console.log('  ✅ '+imya)}catch(e){console.log('  ❌ '+imya+': '+String(e?.message??e).slice(0,300))}};
const DEN=86400000;
try{
 const free=async()=>{const s=http.createServer();const p=await listen(s);await new Promise(r=>s.close(r));return p};const port=await free(),mp=await free();
 for(const x of ['home','work','inbox'])fs.mkdirSync(path.join(t,x));fs.writeFileSync(path.join(t,'token'),'sk-ant-oat01-fixture',{mode:0o600}); // vorota-ob:dopusk=TOKEN
 fs.writeFileSync(path.join(t,'ingress'),crypto.randomBytes(32).toString('hex'),{mode:0o600});const baza=path.join(t,'sessions.db');
 const env0={PATH:process.env.PATH,HOME:path.join(t,'home'),GATEWAY_POSTAVSHIK:'anthropic',GATEWAY_PORT:String(port),GATEWAY_MCP_PORT:String(mp),GATEWAY_TOKEN_FILE:path.join(t,'token'),GATEWAY_INGRESS_KEY_FILE:path.join(t,'ingress'),GATEWAY_WORK_DIR:path.join(t,'work'),GATEWAY_BAZA_SESSIJ:baza,GATEWAY_YASHCHIK:path.join(t,'inbox'),GATEWAY_DAVLENIE:'',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',GATEWAY_INSTRUMENTY_DVIZHKA:'net'};
 const podnyat=async(dop={})=>{journal='';gw=spawn(process.execPath,[path.join(base,'gateway.mjs')],{env:{...env0,...dop},stdio:['ignore','pipe','pipe']});gw.stdout.on('data',x=>journal+=x);gw.stderr.on('data',x=>journal+=x);
  const deadline=Date.now()+15000;while(!journal.includes('слушаю')&&Date.now()<deadline&&gw.exitCode===null)await new Promise(r=>setTimeout(r,50));return journal.includes('слушаю')};
 const ostanovit=async()=>{gw.kill('SIGTERM');await new Promise(r=>gw.exitCode!==null?r():gw.once('exit',r))};
 const sdb=(f)=>{const db=new DatabaseSync(baza);try{return f(db)}finally{db.close()}};
 const kluchi=()=>sdb(db=>db.prepare('SELECT kluch FROM sessions ORDER BY kluch').all().map(r=>r.kluch).join(','));
 // RU: База прежней схемы (без отметки) с одной строкой — как у боевого шлюза до правки.
 // EN: Old-schema database (no timestamp) with one row — as on a live gateway before the fix.
 sdb(db=>{db.exec('CREATE TABLE sessions (kluch TEXT PRIMARY KEY, sessionId TEXT, otdano INTEGER, hashPref TEXT)');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('prezhnyaya','s0',1,'h0')});
 if(!await podnyat()){console.log('СЛЕПОТА: шлюз не поднялся: '+journal.slice(-500));process.exitCode=2;}
 else{
  await ostanovit();
  await proba('строка прежней схемы пережила первый старт и получила отметку',async()=>{const r=sdb(db=>{const c=new Set(db.prepare('PRAGMA table_info(sessions)').all().map(x=>x.name));return c.has('obnovleno')?db.prepare("SELECT obnovleno FROM sessions WHERE kluch='prezhnyaya'").get():'нет колонки obnovleno'});if(typeof r==='string')throw Error(r);if(!r)throw Error('строки нет');if(!(r.obnovleno>Date.now()-DEN))throw Error('отметка '+r.obnovleno);});
  // RU: Подставные строки: 40 суток (старше умолчания), 20 суток, 1 сутки.
  // EN: Fixture rows: 40 days (older than default), 20 days, 1 day.
  const vstavit=(k,dnej)=>sdb(db=>{const c=new Set(db.prepare('PRAGMA table_info(sessions)').all().map(x=>x.name));if(!c.has('obnovleno'))db.exec('ALTER TABLE sessions ADD COLUMN obnovleno INTEGER');db.prepare('INSERT OR REPLACE INTO sessions(kluch,sessionId,otdano,hashPref,obnovleno) VALUES(?,?,?,?,?)').run(k,'s-'+k,1,'h',Date.now()-dnej*DEN)});
  vstavit('d40',40);vstavit('d20',20);vstavit('d01',1);
  if(!await podnyat())throw Error('шлюз не поднялся (умолчание)');await ostanovit();
  await proba('умолчание 30 сут.: удалена только строка 40 сут.',async()=>{const k=kluchi();if(k!=='d01,d20,prezhnyaya')throw Error('остались: '+k);});
  await proba('журнал называет срок и число удалённых',async()=>{if(!journal.includes('срок хранения карты сессий 30 сут.: удалено строк 1'))throw Error((journal.match(/срок хранения[^\n]*/)||['строки нет'])[0]);});
  vstavit('d40',40);
  if(!await podnyat({GATEWAY_SESSII_SROK_DNEJ:'abc'}))throw Error('шлюз не поднялся (abc)');await ostanovit();
  await proba('неверная настройка: тревога, ничего не удалено',async()=>{const k=kluchi();if(k!=='d01,d20,d40,prezhnyaya')throw Error('остались: '+k);if(!journal.includes('GATEWAY_SESSII_SROK_DNEJ «abc» не целое ≥ 1'))throw Error('тревоги нет');});
  if(!await podnyat({GATEWAY_SESSII_SROK_DNEJ:'10'}))throw Error('шлюз не поднялся (10)');await ostanovit();
  await proba('настройка 10 сут.: удалены 40 и 20 сут., свежие остались',async()=>{const k=kluchi();if(k!=='d01,prezhnyaya')throw Error('остались: '+k);});
  console.log('  итог: '+proshlo+' из '+vsego);process.exitCode=proshlo===vsego?0:1;
 }
}finally{if(gw&&gw.exitCode===null){gw.kill('SIGTERM');await Promise.race([new Promise(r=>gw.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(gw.exitCode===null)gw.kill('SIGKILL')}fs.rmSync(t,{recursive:true,force:true})}
