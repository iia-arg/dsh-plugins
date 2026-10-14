// RU: СТЕНД КОМАНДЫ /stop: обычные слова человека и машинные входы отметку СОХРАНЯЮТ; только «/stop» человека в
//     начале личного сообщения Telegram её отменяет. Случаи: обычный «СТОП» словами, /stop с аргументом и
//     переводом строки, упоминание и цитата, /stopping, /stop!, регистр, вход без рамки транспорта, подпись
//     плагина к вложению, машинные источники. Каждый — в виде строки и блоков.
//     Переменная MARKER_INPUT_FIXTURE — путь к JSON с историческими входами: все они обязаны НЕ распознаваться.
//     Код выхода: 0 — всё сошлось; иначе assert с числом неудач.
// EN: /stop COMMAND STAND: ordinary human words and machine inputs KEEP the marker; only a human "/stop" at the
//     start of a private Telegram message cancels it. Cases: an ordinary "STOP" in words, /stop with an
//     argument and a newline, a mention and a quote, /stopping, /stop!, letter case, input without the
//     transport envelope, a plugin attachment caption, machine sources. Each as a string and as blocks.
//     The variable MARKER_INPUT_FIXTURE is a path to a JSON file of historical inputs: all of them must NOT be
//     recognised. Exit code: 0 — all passed; otherwise an assert with the number of failures.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
// RU: Предмет marker-step.mjs берёт @deepseek-ai/dsh-llm/message из установки платформы; нет её рядом — СЛЕПОТА стенда, код 2, а не трасса с кодом 1 (аудит A-N-1948 №5).
// EN: marker-step.mjs takes @deepseek-ai/dsh-llm/message from the platform installation; if it is absent here — stand BLINDNESS, exit 2, not a stack trace with exit 1.
try{createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm/message');}catch(e){console.log('СЛЕПОТА стенда: @deepseek-ai/dsh-llm/message не разрешается рядом со стендом (нужна установка платформы в node_modules) — '+String(e?.message??e).split('\n')[0].slice(0,160));process.exit(2);}
const {installMarker}=await import('./marker-step.mjs');
let serial=0;
// RU: Сообщение человека в штатной рамке личного чата Telegram.
// EN: A human message in the standard Telegram private-chat envelope.
const human=text=>({source:{kind:'user'},content:'[личный чат, от Человек]\n'+text});
const cases=[
 ['ordinary-human',human('СТОП. Задачу отменяю. не продолжай, остановись'),false],
 ['command',human('/stop'),true],
 ['command-argument',human('/stop эту задачу'),true],
 ['command-newline',human('/stop\nпричина'),true],
 ['mention',human('Обсудим /stop'),false],
 ['quote',human('> /stop'),false],
 ['suffix',human('/stopping'),false],
 ['punctuation',human('/stop!'),false],
 ['uppercase',human('/STOP'),true],
 ['mixed-case',human('/Stop'),true],
 ['no-transport',{source:{kind:'user'},content:'/stop'},false],
 ['plugin-caption',{source:{kind:'user'},content:'[личный чат, допись плагина к вложению]\n/stop'},false],
 ...['agent-message','webhook','plugin:dsh-pamyat-kompakt-dsh','model',undefined].map(kind=>['machine-'+kind,{...human('/stop'),source:{kind}},false]),
];
if(process.env.MARKER_INPUT_FIXTURE){
 const {readFileSync}=await import('node:fs');
 for(const row of JSON.parse(readFileSync(process.env.MARKER_INPUT_FIXTURE,'utf8')))cases.push(['historical-'+row.agent,row.message,false]);
}
let failed=0;
// RU: Каждый случай: успешный эпизод сжатия, шаг с этим входом, конец хода, простой — и проверка фазы, побудок
//     и следующей вставки.
// EN: Each case: a successful compaction episode, a step with this input, end of turn, idle — then check the
//     phase, wakes and the next insertion.
for(const [label,input,recognized] of cases)for(const shape of ['string','blocks']){
 const handlers={},events=[],alerts=[];let wakes=0;
 const session={id:'letter-'+(++serial),header:{createdAt:serial},snapshotEvents:()=>events,requestHeader:()=>({config:{provider:'claude-oauth',model:'claude-opus-5'}})};
 const agent={session,status:'running',inbox:{nextTurn:[],nextStep:[]},wakeDriver(){wakes++;}};
 const ctx={on(n,f){(handlers[n]??=[]).push(f);},get(n){return n==='sessions'?{flush:async()=>true}:n==='agents'?{get:()=>agent}:n==='pamyat'?{sobytiyaSessii:()=>events}:undefined;}};
 const api=installMarker(ctx,{name:session.id,log(){},alert:async text=>alerts.push(text),audit:async()=>[],mode:()=>true});
 const event=async(type,data,meta={})=>{const e={type,seq:events.length,time:Date.now(),data,...meta};events.push(e);for(const f of handlers['session/event']??[])await f(session,e);return e;};
 const step=(messages,turn)=>handlers['agent/pre-step'][0]({agent,messages,turn,signal:new AbortController().signal},async()=>({kind:'enter',messages}));
 try{
  const summary=await event('compaction/summary',{compactionId:'c',summary:[{type:'text',text:'[MODE=ACTIVE]\ncheckpoint'}]});
  await event('user/message',{id:'checkpoint',source:{kind:'compact-checkpoint'}},{sourceEventSeqs:[summary.seq]});
  await event('compaction/end',{compactionId:'c'});
  const text=typeof input.content==='string'?input.content:input.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
  const mail={...input,id:'external',content:shape==='string'?text:[{type:'text',text}]};
  const decision=await step([mail],1);assert.deepEqual(decision.messages,[mail],'original letter remains the only input');
  assert.equal(api.state(session).phase,recognized?'canceled':'held_external',label+' recognition');
  await event('turn/end',{turn:1,reason:{kind:'completed'}});agent.status='idle';
  for(const f of handlers['agent/status']??[])await f({agent,status:'idle'});
  await new Promise(r=>setImmediate(r));
  assert.equal(wakes,recognized?0:1,label+' extra wake');
  const next=await step([],2);assert.equal(next.messages.length,recognized?0:1,label+' next marker');
  assert.equal(alerts.length,0);console.log('PASS',label,shape,recognized?'recognized; no duplicate wake/marker':'not recognized; normal continuation preserved');
 }catch(e){failed++;console.error('FAIL',label,shape,e.message);}finally{api.dispose();}
}

assert.equal(failed,0,`${failed} failed of ${cases.length*2}`);
