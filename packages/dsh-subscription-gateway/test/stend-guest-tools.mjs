// RU: Проверка stend-guest-tools: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-guest-tools verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.


import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import crypto from 'node:crypto';
const base=path.resolve(process.argv[2]||new URL('..',import.meta.url).pathname),mode=process.argv[3]||'net';
const t=fs.mkdtempSync(path.join(os.tmpdir(),'guest-tools-')),copy=path.join(t,'package');fs.mkdirSync(copy);
const source=fs.readFileSync(path.join(base,'gateway.mjs'),'utf8');const needle="if (m.type === 'result') { rezultatPrishyol = true;";assert.equal(source.split(needle).length-1,1);
// RU: B-N-1906 — слой SDK, как в stend-env-dvizhka.mjs (B-N-1899): рядом, если читается; иначе раскладка гостя; STEND_SDK — явно. Печатается «слой SDK: …»;
// RU: B-N-1910: если слой взят не рядом с пакетом, версия claude-agent-sdk слоя сверяется с записью claude-agent-sdk в plugins.yaml (ниже): расхождение — код 1, не читается — СЛЕПОТА 2.
const sdkRyadom=path.join(base,'sdk-runtime');let SDK=process.env.STEND_SDK||sdkRyadom;
if(!process.env.STEND_SDK){try{fs.accessSync(path.join(sdkRyadom,'node_modules'),fs.constants.R_OK|fs.constants.X_OK)}catch{SDK='/opt/subscription-gateway-guest/sdk-runtime'}}
{let r;try{r=fs.realpathSync(SDK)}catch(e){r=`НЕ ЧИТАЕТСЯ ${SDK} (${e.code}) — движок не поднимется`}console.log(`слой SDK: ${r}${SDK===sdkRyadom?' (рядом с пакетом)':' (рядом не читается — взят из раскладки гостя или STEND_SDK)'}`)}
for(const f of fs.readdirSync(base))if(f!=='gateway.mjs'&&f!=='sdk-runtime')fs.symlinkSync(path.join(base,f),path.join(copy,f));
try{fs.accessSync(path.join(SDK,'node_modules'),fs.constants.R_OK|fs.constants.X_OK)}catch(e){console.log(`СЛЕПОТА: слой SDK не читается учёткой: ${path.join(SDK,'node_modules')} (${e.code}) — движок не поднимется, судить нечего`);fs.rmSync(t,{recursive:true,force:true});process.exit(2)}
if (SDK !== sdkRyadom) {   // B-N-1910: слой не тот, что у шлюза, — сверить версию движка с реестром (installed_check записи claude-agent-sdk читает слой шлюза /opt/claude-oauth/sdk-runtime)
  const REESTR = '/etc/agent-registry/plugins.yaml'; let vr = null, vs = null;
  try { vr = fs.readFileSync(REESTR, 'utf8').match(/^  - id: claude-agent-sdk\n(?:    .*\n)*?    version: "?([^"\s#]+)/m)?.[1] ?? null; } catch (e) { console.log(`СЛЕПОТА: реестр плагинов не прочитан: ${REESTR} (${e.code}) — версию движка шлюза сверить не с чем`); (fs.rmSync(t,{recursive:true,force:true}),process.exit(2)); }
  if (!vr) { console.log(`СЛЕПОТА: в ${REESTR} нет записи claude-agent-sdk с version — версию движка шлюза сверить не с чем`); (fs.rmSync(t,{recursive:true,force:true}),process.exit(2)); }
  try { vs = JSON.parse(fs.readFileSync(path.join(SDK, 'node_modules/@anthropic-ai/claude-agent-sdk/package.json'), 'utf8')).version ?? null; } catch (e) { console.log(`СЛЕПОТА: версия claude-agent-sdk слоя ${SDK} не прочитана (${e.code ?? e.message})`); (fs.rmSync(t,{recursive:true,force:true}),process.exit(2)); }
  if (vs !== vr) { console.log(`РАСХОЖДЕНИЕ: слой SDK стенда ${SDK}: claude-agent-sdk ${vs} ≠ шлюз (${REESTR}, claude-agent-sdk) ${vr} — стенд судил бы шлюз на чужом движке`); (fs.rmSync(t,{recursive:true,force:true}),process.exit(1)); }
  console.log(`версия движка: claude-agent-sdk ${vs} = записи реестра (слой шлюза)`);
}
fs.symlinkSync(SDK,path.join(copy,'sdk-runtime'));
fs.writeFileSync(path.join(copy,'gateway.mjs'),source.replace(needle,"if(m.type==='system'&&m.subtype==='init')console.log('PROBE_INIT '+JSON.stringify(m.tools));\n      "+needle));
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(s.address().port)));const body=async req=>{let s='';for await(const x of req)s+=x;return s};let apiTools=[];
const api=http.createServer(async(req,res)=>{const text=await body(req);if(req.url.includes('count_tokens')){res.end('{"input_tokens":1}');return}if(!req.url.startsWith('/v1/messages')){res.statusCode=404;res.end('{}');return}
 const b=JSON.parse(text||'{}');apiTools.push((b.tools||[]).map(x=>x.name));const message={id:'msg_test',type:'message',role:'assistant',model:'claude-opus-5',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:5,output_tokens:1}};
 if(!b.stream){res.setHeader('content-type','application/json');res.end(JSON.stringify({...message,content:[{type:'text',text:'ok'}],stop_reason:'end_turn'}));return}
 res.setHeader('content-type','text/event-stream');for(const e of [{type:'message_start',message},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'ok'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}},{type:'message_stop'}])res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);res.end();});
const bridge=http.createServer(async(req,res)=>{await body(req);res.setHeader('content-type','application/json');res.end('{"ok":true,"value":"probe"}')});
let gw;try{
 const ap=await listen(api),bp=await listen(bridge),reserve=http.createServer();const port=await listen(reserve);await new Promise(r=>reserve.close(r));const reserve2=http.createServer();const mp=await listen(reserve2);await new Promise(r=>reserve2.close(r));
 for(const x of ['home','work','inbox'])fs.mkdirSync(path.join(t,x));fs.writeFileSync(path.join(t,'token'),'sk-ant-oat01-fixture',{mode:0o600});const ingress=crypto.randomBytes(32).toString('hex');fs.writeFileSync(path.join(t,'ingress'),ingress,{mode:0o600});let journal=''; // RU: Синтетический токен только локальной API-фикстуры; vorota-ob:dopusk=TOKEN
// EN: Synthetic credential for the local API fixture only; never a live subscription token.
 const env={PATH:process.env.PATH,HOME:path.join(t,'home'),GATEWAY_POSTAVSHIK:'anthropic',GATEWAY_PORT:String(port),GATEWAY_MCP_PORT:String(mp),GATEWAY_TOKEN_FILE:path.join(t,'token'),GATEWAY_INGRESS_KEY_FILE:path.join(t,'ingress'),GATEWAY_WORK_DIR:path.join(t,'work'),GATEWAY_BAZA_SESSIJ:path.join(t,'sessions.db'),GATEWAY_YASHCHIK:path.join(t,'inbox'),GATEWAY_DAVLENIE:'',ANTHROPIC_BASE_URL:`http://127.0.0.1:${ap}`,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',...(mode==='net'?{GATEWAY_INSTRUMENTY_DVIZHKA:'net'}:{})};
 gw=spawn(process.execPath,[path.join(copy,'gateway.mjs')],{env,stdio:['ignore','pipe','pipe']});gw.stdout.on('data',x=>journal+=x);gw.stderr.on('data',x=>journal+=x);
 const deadline=Date.now()+15000;while(!journal.includes('слушаю')&&Date.now()<deadline&&gw.exitCode===null)await new Promise(r=>setTimeout(r,50));assert(journal.includes('слушаю'),journal.slice(-2000));
 const result=await fetch(`http://127.0.0.1:${port}/v1/agent-stream`,{method:'POST',signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json',Authorization:'Bearer '+ingress},body:JSON.stringify({model:'claude-opus-5-5',messages:[{role:'user',content:'Say ok'}],bridge:{name:'probadsh',url:`http://127.0.0.1:${bp}/invoke`,ticket:'fixture',tools:[{name:'rabota_proba',description:'probe',inputSchema:{type:'object',properties:{}}}]}})});const stream=await result.text();assert(stream.includes('"type":"done"'),stream);
 const line=journal.split('\n').find(x=>x.startsWith('PROBE_INIT '));assert(line,'no system/init observed');const tools=JSON.parse(line.slice(11));assert(tools.some(x=>x.startsWith('mcp__probadsh__')),'DSH bridge missing');
 const builtins=tools.filter(x=>!x.startsWith('mcp__'));
 const report=journal.split('\n').find(x=>x.includes('движок: встроенных инструментов '));assert(report,'missing cloner P6 system/init line');const parsed=/движок: встроенных инструментов (\d+) \[(.*?)\]; mcp (\d+)/.exec(report);assert(parsed,'malformed P6 line');assert.equal(Number(parsed[1]),builtins.length);assert.equal(Number(parsed[3]),tools.length-builtins.length);assert.equal(parsed[2],builtins.join(', '));console.log(report);
console.log(JSON.stringify({mode,uid:process.getuid(),source_sha256:crypto.createHash('sha256').update(source).digest('hex'),tools,apiTools,observer_replacements:1}));
 if((process.argv[4]||mode)==='net')assert.deepEqual(builtins,[],'guest has built-in tools');else assert(tools.includes('Bash'),'default lost Bash');
}finally{if(gw&&gw.exitCode===null){gw.kill('SIGTERM');await Promise.race([new Promise(r=>gw.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(gw.exitCode===null)gw.kill('SIGKILL')}api.closeAllConnections();bridge.closeAllConnections();api.close();bridge.close();fs.rmSync(t,{recursive:true,force:true})}
