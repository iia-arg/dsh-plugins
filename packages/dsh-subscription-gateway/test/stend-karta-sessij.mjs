// RU: Стенд карты сессий (аудит №2): кэш в памяти ограничен восемью беседами, SQLite — нет. После девяти бесед строка первой остаётся в базе, и её продолжение идёт resume, а не полной историей. Без правки вытеснение из кэша удаляло строку из базы. Код: 0 — все пробы, 1 — красная, 2 — слепота.
// EN: Session-map stand (audit #2): the in-memory cache is bounded to eight conversations, SQLite is not. After nine conversations the first one's row stays in the database and its continuation resumes instead of sending full history. Without the fix cache eviction deleted the row from the database. Exit: 0 — all probes, 1 — a red one, 2 — blind.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import crypto from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
const base=path.resolve(process.argv[2]||new URL('..',import.meta.url).pathname);
// RU: Ход идёт через SDK движка из sdk-runtime: учётке без доступа к нему (iskra; слой 750 claudeoauth) стенд слеп, а не красен. Обход зовёт его Claude-веткой.
// EN: The turn uses the engine SDK from sdk-runtime: without read access (layer 750 claudeoauth) the stand is blind, not red. The runner calls it via its Claude branch.
{const sdk=path.join(base,'sdk-runtime/node_modules/@anthropic-ai/claude-agent-sdk/package.json');try{fs.accessSync(sdk,fs.constants.R_OK)}catch(e){console.log('СЛЕПОТА: SDK движка не читается ('+sdk+': '+(e.code||e.message)+') — ход проверять нечем');process.exit(2)}}
const t=fs.mkdtempSync(path.join(os.tmpdir(),'stend-karta-'));
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(s.address().port)));const read=async req=>{let s='';for await(const x of req)s+=x;return s};
const api=http.createServer(async(req,res)=>{const text=await read(req);if(req.url.includes('count_tokens')){res.end('{"input_tokens":1}');return}if(!req.url.startsWith('/v1/messages')){res.statusCode=404;res.end('{}');return}
 const b=JSON.parse(text||'{}');const message={id:'msg_test',type:'message',role:'assistant',model:'claude-opus-5',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:5,output_tokens:1}};
 if(!b.stream){res.setHeader('content-type','application/json');res.end(JSON.stringify({...message,content:[{type:'text',text:'ok'}],stop_reason:'end_turn'}));return}
 res.setHeader('content-type','text/event-stream');for(const e of [{type:'message_start',message},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'ok'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}},{type:'message_stop'}])res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);res.end();});
let gw,proshlo=0,vsego=0,journal='';
const proba = async (imya, f) => {vsego++;try{const r=await f();if(r!==undefined&&r!==true)throw Error(typeof r==='string'?r:'тело пробы вернуло '+JSON.stringify(r));proshlo++;console.log('  ✅ '+imya)}catch(e){console.log('  ❌ '+imya+': '+String(e?.message??e).slice(0,300))}};
try{
 const ap=await listen(api);const free=async()=>{const s=http.createServer();const p=await listen(s);await new Promise(r=>s.close(r));return p};const port=await free(),mp=await free();
 for(const x of ['home','work','inbox'])fs.mkdirSync(path.join(t,x));fs.writeFileSync(path.join(t,'token'),'sk-ant-oat01-fixture',{mode:0o600}); // vorota-ob:dopusk=TOKEN
 const ingress=crypto.randomBytes(32).toString('hex');fs.writeFileSync(path.join(t,'ingress'),ingress,{mode:0o600});const baza=path.join(t,'sessions.db');
 const env={PATH:process.env.PATH,HOME:path.join(t,'home'),GATEWAY_POSTAVSHIK:'anthropic',GATEWAY_PORT:String(port),GATEWAY_MCP_PORT:String(mp),GATEWAY_TOKEN_FILE:path.join(t,'token'),GATEWAY_INGRESS_KEY_FILE:path.join(t,'ingress'),GATEWAY_WORK_DIR:path.join(t,'work'),GATEWAY_BAZA_SESSIJ:baza,GATEWAY_YASHCHIK:path.join(t,'inbox'),GATEWAY_DAVLENIE:'',ANTHROPIC_BASE_URL:`http://127.0.0.1:${ap}`,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',GATEWAY_INSTRUMENTY_DVIZHKA:'net'};
 const podnyat=async()=>{journal='';gw=spawn(process.execPath,[path.join(base,'gateway.mjs')],{env,stdio:['ignore','pipe','pipe']});gw.stdout.on('data',x=>journal+=x);gw.stderr.on('data',x=>journal+=x);
  const deadline=Date.now()+15000;while(!journal.includes('слушаю')&&Date.now()<deadline&&gw.exitCode===null)await new Promise(r=>setTimeout(r,50));return journal.includes('слушаю')};
 const hod=async(messages)=>{const r=await fetch(`http://127.0.0.1:${port}/v1/agent-stream`,{method:'POST',signal:AbortSignal.timeout(60000),headers:{'content-type':'application/json',Authorization:'Bearer '+ingress},body:JSON.stringify({model:'claude-opus-5-5',messages})});const s=await r.text();if(!s.includes('"type":"done"'))throw Error('ход без done: '+s.slice(-300));};
 const strok=()=>{const db=new DatabaseSync(baza,{readOnly:true});try{return db.prepare('SELECT count(*) AS n FROM sessions').get().n}finally{db.close()}};
 if(!await podnyat()){console.log('СЛЕПОТА: шлюз не поднялся: '+journal.slice(-500));process.exitCode=2;}
 else{
  // RU: Девять бесед v1 — ключ беседы из первого сообщения; девятая переполняет кэш на восемь.
  // EN: Nine v1 conversations — the key comes from the first message; the ninth overflows the eight-slot cache.
  for(let i=1;i<=9;i++)await hod([{role:'user',content:'беседа '+i}]);
  await proba('9 бесед → в базе 9 строк (вытеснение только из памяти)',async()=>{const n=strok();if(n!==9)throw Error('строк в базе '+n+', ждали 9');});
  await proba('журнал называет вытеснение из памяти',async()=>{if(!journal.includes('вытесняю из карты сессий'))throw Error('строки о вытеснении нет');});
  const dlina=journal.length;
  await hod([{role:'user',content:'беседа 1'},{role:'assistant',content:'ok'},{role:'user',content:'дальше'}]);
  await proba('продолжение вытесненной беседы 1 идёт resume из базы',async()=>{const s=journal.slice(dlina);if(!s.includes('подсказка: продолжаю сессию'))throw Error('план хода: '+((s.match(/подсказка: [^\n]*/)||['нет строки'])[0]));});
  // RU: Перезапуск: из базы в память поднимаются только последние восемь, беседа 1 (вытесненная) продолжается чтением базы.
  // EN: Restart: only the latest eight rows are loaded into memory; conversation 1 still continues via a database read.
  gw.kill('SIGTERM');await new Promise(r=>gw.once('exit',r));
  if(!await podnyat())throw Error('шлюз не поднялся после перезапуска');
  await proba('после перезапуска в память поднято не больше восьми',async()=>{const m=journal.match(/сессий из базы восстановлено: (\d+)/);if(!m||Number(m[1])>8)throw Error('строка восстановления: '+(m?m[0]:'нет'));});
  const dlina2=journal.length;
  await hod([{role:'user',content:'беседа 2'},{role:'assistant',content:'ok'},{role:'user',content:'дальше'}]);
  await proba('после перезапуска продолжение беседы 2 идёт resume',async()=>{const s=journal.slice(dlina2);if(!s.includes('подсказка: продолжаю сессию'))throw Error('план хода: '+((s.match(/подсказка: [^\n]*/)||['нет строки'])[0]));});
  console.log('  итог: '+proshlo+' из '+vsego);process.exitCode=proshlo===vsego?0:1;
 }
}finally{if(gw&&gw.exitCode===null){gw.kill('SIGTERM');await Promise.race([new Promise(r=>gw.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(gw.exitCode===null)gw.kill('SIGKILL')}api.closeAllConnections();api.close();fs.rmSync(t,{recursive:true,force:true})}
