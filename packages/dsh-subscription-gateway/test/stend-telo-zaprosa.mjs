// RU: Стенд тела запроса (аудит №1): авторизованный клиент с негодным телом (null, массив, messages не массив / с null) получает 400, процесс шлюза жив, следующий ход проходит. Без правки такое тело роняет процесс TypeError вне try. Код: 0 — все пробы, 1 — красная, 2 — слепота (шлюз не поднялся).
// EN: Request-body stand (audit #1): an authorized client with an invalid body (null, array, non-array messages / messages with null) gets 400, the gateway process survives and the next turn passes. Without the fix such a body kills the process with a TypeError outside try. Exit: 0 — all probes, 1 — a red one, 2 — blind (gateway did not start).
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import crypto from 'node:crypto';
const base=path.resolve(process.argv[2]||new URL('..',import.meta.url).pathname);
// RU: Ход идёт через SDK движка из sdk-runtime: учётке без доступа к нему (iskra; слой 750 claudeoauth) стенд слеп, а не красен. Обход зовёт его Claude-веткой.
// EN: The turn uses the engine SDK from sdk-runtime: without read access (layer 750 claudeoauth) the stand is blind, not red. The runner calls it via its Claude branch.
{const sdk=path.join(base,'sdk-runtime/node_modules/@anthropic-ai/claude-agent-sdk/package.json');try{fs.accessSync(sdk,fs.constants.R_OK)}catch(e){console.log('СЛЕПОТА: SDK движка не читается ('+sdk+': '+(e.code||e.message)+') — ход проверять нечем');process.exit(2)}}
const t=fs.mkdtempSync(path.join(os.tmpdir(),'stend-telo-'));
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
 const ingress=crypto.randomBytes(32).toString('hex');fs.writeFileSync(path.join(t,'ingress'),ingress,{mode:0o600});
 const env={PATH:process.env.PATH,HOME:path.join(t,'home'),GATEWAY_POSTAVSHIK:'anthropic',GATEWAY_PORT:String(port),GATEWAY_MCP_PORT:String(mp),GATEWAY_TOKEN_FILE:path.join(t,'token'),GATEWAY_INGRESS_KEY_FILE:path.join(t,'ingress'),GATEWAY_WORK_DIR:path.join(t,'work'),GATEWAY_BAZA_SESSIJ:path.join(t,'sessions.db'),GATEWAY_YASHCHIK:path.join(t,'inbox'),GATEWAY_DAVLENIE:'',ANTHROPIC_BASE_URL:`http://127.0.0.1:${ap}`,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',GATEWAY_INSTRUMENTY_DVIZHKA:'net'};
 const podnyat=async()=>{journal='';gw=spawn(process.execPath,[path.join(base,'gateway.mjs')],{env,stdio:['ignore','pipe','pipe']});gw.stdout.on('data',x=>journal+=x);gw.stderr.on('data',x=>journal+=x);
  const deadline=Date.now()+15000;while(!journal.includes('слушаю')&&Date.now()<deadline&&gw.exitCode===null)await new Promise(r=>setTimeout(r,50));return journal.includes('слушаю')};
 // RU: Перед каждой пробой упавший шлюз поднимается заново — каждое тело мерится на живом процессе, а не на трупе предыдущей пробы.
 // EN: A crashed gateway is restarted before each probe — every body is measured on a live process, not on the previous probe's corpse.
 let podnyatij=0;
 if(!await podnyat()){console.log('СЛЕПОТА: шлюз не поднялся: '+journal.slice(-500));process.exitCode=2;}
 else{
  const post=(telo)=>fetch(`http://127.0.0.1:${port}/v1/agent-stream`,{method:'POST',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',Authorization:'Bearer '+ingress},body:telo});
  for(const [imya,telo] of [['тело null','null'],['тело массив','[]'],['тело строка','"str"'],['messages:[null]','{"messages":[null]}'],['messages:5','{"messages":5}'],['messages:[[1]]','{"messages":[[1]]}']])
   await proba(imya+' → 400, процесс жив',async()=>{
    if(gw.exitCode!==null){podnyatij++;if(!await podnyat())throw Error('СЛЕПОТА пробы: шлюз не поднялся заново');}
    let status;try{const r=await post(telo);status=r.status;await r.text();}catch(e){status='обрыв: '+e.message}
    await new Promise(r=>setTimeout(r,200));
    if(gw.exitCode!==null)throw Error(`процесс шлюза завершился (код ${gw.exitCode}); ответ ${status}; журнал: ${journal.slice(-300)}`);
    if(status!==400)throw Error('ответ '+status+', ждали 400');
   });
  await proba('после негодных тел — штатный ход проходит (done) без перезапуска',async()=>{if(podnyatij||gw.exitCode!==null)throw Error('шлюз поднимали заново '+podnyatij+' раз(а) — тела роняли процесс');const r=await post(JSON.stringify({model:'claude-opus-5-5',messages:[{role:'user',content:'Say ok'}]}));const s=await r.text();if(!s.includes('"type":"done"'))throw Error(s.slice(-300));});
  console.log('  итог: '+proshlo+' из '+vsego);process.exitCode=proshlo===vsego?0:1;
 }
}finally{if(gw&&gw.exitCode===null){gw.kill('SIGTERM');await Promise.race([new Promise(r=>gw.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(gw.exitCode===null)gw.kill('SIGKILL')}api.closeAllConnections();api.close();fs.rmSync(t,{recursive:true,force:true})}
