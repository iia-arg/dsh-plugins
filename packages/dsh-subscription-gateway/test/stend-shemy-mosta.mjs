// RU: B-N-1698 этап 2 (Искра, 07.10.2026): одна негодная схема инструмента моста (без верхнего type:object) не должна гасить
//     у модели ВЕСЬ список. Настоящий процесс шлюза, ветка anthropic, настоящий движок claude-agent-sdk; API и мост — подставные
//     на 127.0.0.1, к модели и подписке не ходит. Мост присылает 4 инструмента, один — со схемой {type:'string'}.
//     Зелёное: в system/init движка 3 инструмента моста (годные), негодного нет; в журнале шлюза «🔴 схема инструмента
//     "plohoj_instrument" отброшена шлюзом»; строка «мост у модели» — «отброшено шлюзом 1». На 1.4.44 движок собирает 0.
//     Доводы: [каталог раскладки шлюза с node_modules и sdk-runtime] [файл gateway.mjs для проверки]; по умолчанию —
//     GATEWAY_CANDIDATE (или ..) и его gateway.mjs. Коды: 0 — годно; 1 — расхождение; 2 — слепота.
//     ЧЕГО НЕ ЛОВИТ: ветку openai (Codex) — её список фильтр не трогает, это проверяется чтением кода, не этим стендом;
//     правила движка, кроме «верхний type: object».
// EN: B-N-1698 stage 2: one invalid bridge tool schema must not drop the whole list; real gateway process (anthropic) and real engine.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import crypto from 'node:crypto';
const base=path.resolve(process.argv[2]||process.env.GATEWAY_CANDIDATE||new URL('..',import.meta.url).pathname);
const gwFile=path.resolve(process.argv[3]||path.join(base,'gateway.mjs'));
for(const p of [path.join(base,'node_modules'),gwFile])if(!fs.existsSync(p)){console.log(`СЛЕПОТА: нет ${p} — задайте раскладку шлюза (GATEWAY_CANDIDATE)`);process.exit(2)}
const t=fs.mkdtempSync(path.join(os.tmpdir(),'shemy-mosta-')),copy=path.join(t,'package');fs.mkdirSync(copy);
const source=fs.readFileSync(gwFile,'utf8');const needle="if (m.type === 'result') { rezultatPrishyol = true;";
if(source.split(needle).length-1!==1){console.log('СЛЕПОТА: точка наблюдения system/init в gateway.mjs не найдена ровно один раз');process.exit(2)}
for(const f of fs.readdirSync(base))if(f!=='gateway.mjs')fs.symlinkSync(path.join(base,f),path.join(copy,f));
fs.writeFileSync(path.join(copy,'gateway.mjs'),source.replace(needle,"if(m.type==='system'&&m.subtype==='init')console.log('PROBE_INIT '+JSON.stringify(m.tools));\n      "+needle));
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(s.address().port)));const body=async req=>{let s='';for await(const x of req)s+=x;return s};
const api=http.createServer(async(req,res)=>{await body(req);if(req.url.includes('count_tokens')){res.end('{"input_tokens":1}');return}if(!req.url.startsWith('/v1/messages')){res.statusCode=404;res.end('{}');return}
 const message={id:'msg_test',type:'message',role:'assistant',model:'claude-opus-5',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:5,output_tokens:1}};
 res.setHeader('content-type','text/event-stream');for(const e of [{type:'message_start',message},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'ok'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}},{type:'message_stop'}])res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);res.end();});
const bridge=http.createServer(async(req,res)=>{await body(req);res.setHeader('content-type','application/json');res.end('{"ok":true,"value":"probe"}')});
const GODNYE=['rabota_odin','rabota_dva','rabota_tri'],PLOHOJ='plohoj_instrument';
const instrumenty=[{name:GODNYE[0],description:'probe',inputSchema:{type:'object',properties:{}}},{name:PLOHOJ,description:'probe',inputSchema:{type:'string'}},
 {name:GODNYE[1],description:'probe',inputSchema:{type:'object',properties:{x:{type:'string'}}}},{name:GODNYE[2],description:'probe',inputSchema:{type:'object',properties:{}}}];
let gw,vsego=0,proshlo=0,slepota=null;const proba=(imya,u,p)=>{vsego++;if(u){proshlo++;console.log('  ✅ '+imya)}else console.log('  ❌ '+imya+(p?' — '+String(p).slice(0,300):''))};
try{
 const ap=await listen(api),bp=await listen(bridge),r1=http.createServer();const port=await listen(r1);await new Promise(r=>r1.close(r));const r2=http.createServer();const mp=await listen(r2);await new Promise(r=>r2.close(r));
 for(const x of ['home','work','inbox'])fs.mkdirSync(path.join(t,x));fs.writeFileSync(path.join(t,'token'),'sk-ant-oat01-fixture',{mode:0o600});const ingress=crypto.randomBytes(32).toString('hex');fs.writeFileSync(path.join(t,'ingress'),ingress,{mode:0o600});let journal=''; // RU: синтетический токен подставного API; vorota-ob:dopusk=TOKEN
 const env={PATH:process.env.PATH,HOME:path.join(t,'home'),GATEWAY_POSTAVSHIK:'anthropic',GATEWAY_PORT:String(port),GATEWAY_MCP_PORT:String(mp),GATEWAY_TOKEN_FILE:path.join(t,'token'),GATEWAY_INGRESS_KEY_FILE:path.join(t,'ingress'),GATEWAY_WORK_DIR:path.join(t,'work'),GATEWAY_BAZA_SESSIJ:path.join(t,'sessions.db'),GATEWAY_YASHCHIK:path.join(t,'inbox'),GATEWAY_DAVLENIE:'',ANTHROPIC_BASE_URL:`http://127.0.0.1:${ap}`,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',GATEWAY_INSTRUMENTY_DVIZHKA:'net'};
 gw=spawn(process.execPath,[path.join(copy,'gateway.mjs')],{env,stdio:['ignore','pipe','pipe']});gw.stdout.on('data',x=>journal+=x);gw.stderr.on('data',x=>journal+=x);
 const deadline=Date.now()+15000;while(!journal.includes('слушаю')&&Date.now()<deadline&&gw.exitCode===null)await new Promise(r=>setTimeout(r,50));
 if(!journal.includes('слушаю'))throw {slepota:'шлюз не поднялся\n'+journal.slice(-1500)}
 const result=await fetch(`http://127.0.0.1:${port}/v1/agent-stream`,{method:'POST',signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json',Authorization:'Bearer '+ingress},body:JSON.stringify({model:'claude-opus-5-5',messages:[{role:'user',content:'Say ok'}],bridge:{name:'probadsh',url:`http://127.0.0.1:${bp}/invoke`,ticket:'fixture',tools:instrumenty}})});await result.text();
 const line=journal.split('\n').find(x=>x.startsWith('PROBE_INIT '));if(!line)throw {slepota:'движок не прислал system/init\n'+journal.slice(-1500)}
 const most=JSON.parse(line.slice(11)).filter(x=>x.startsWith('mcp__probadsh__')).map(x=>x.slice('mcp__probadsh__'.length)).sort();
 console.log('инструменты моста у движка: '+JSON.stringify(most));
 proba('годные 3 из 4 дошли до модели (негодная схема не гасит список)',JSON.stringify(most)===JSON.stringify([...GODNYE].sort()),JSON.stringify(most));
 proba('негодного у модели нет',!most.includes(PLOHOJ));
 proba(`крик с именем: «🔴 схема инструмента "${PLOHOJ}" отброшена шлюзом»`,journal.includes(`🔴 схема инструмента "${PLOHOJ}" отброшена шлюзом`),journal.split('\n').filter(x=>/отброш|мост/.test(x)).slice(-4).join(' | '));
 const itog=journal.split('\n').find(x=>x.includes('мост у модели:'))??'';
 proba('строка «мост у модели»: прислано 4 · собрано 3 · отброшено шлюзом 1',/прислано 4 · собрано 3 · отброшено шлюзом 1/.test(itog),itog);
}catch(e){if(e?.slepota){slepota=e.slepota}else throw e}finally{if(gw&&gw.exitCode===null){gw.kill('SIGTERM');await Promise.race([new Promise(r=>gw.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(gw.exitCode===null)gw.kill('SIGKILL')}api.closeAllConnections();bridge.closeAllConnections();api.close();bridge.close();fs.rmSync(t,{recursive:true,force:true})}
if(slepota){console.log('СЛЕПОТА: '+slepota);process.exit(2)}
console.log(`итог: ${proshlo} из ${vsego}`);process.exit(proshlo===vsego?0:1);
