// RU: СТЕНД ПИСЬМА-ПРОДОЛЖЕНИЯ: если шлюз подписки уже положил своё письмо-продолжение (метка Codex или Claude)
//     и оно принято, отметка отменяется — второй побудки и второй вставки нет. Чужая метка не распознаётся —
//     прежний путь held_external. Шесть случаев: Codex/Claude/чужое × строка/блоки.
// EN: CONTINUATION LETTER STAND: if the subscription gateway has already put its continuation letter (Codex or
//     Claude marker) and it was admitted, the marker is cancelled — no second wake and no second insertion. A
//     foreign marker is not recognised — the usual held_external path. Six cases: Codex/Claude/foreign ×
//     string/blocks.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
// RU: Предмет marker-step.mjs берёт @deepseek-ai/dsh-llm/message из установки платформы; нет её рядом — СЛЕПОТА стенда, код 2, а не трасса с кодом 1 (аудит A-N-1948 №5).
// EN: marker-step.mjs takes @deepseek-ai/dsh-llm/message from the platform installation; if it is absent here — stand BLINDNESS, exit 2, not a stack trace with exit 1.
try{createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm/message');}catch(e){console.log('СЛЕПОТА стенда: @deepseek-ai/dsh-llm/message не разрешается рядом со стендом (нужна установка платформы в node_modules) — '+String(e?.message??e).split('\n')[0].slice(0,160));process.exit(2);}
const {installMarker}=await import('./marker-step.mjs');
let serial=0;
for(const [label,text,recognized] of [
 ['Codex','[шлюз Codex · продолжение после стопа]',true],
 ['Claude','[шлюз Claude · продолжение после стопа]',true],
 ['foreign','[шлюз Other · продолжение после стопа]',false],
])for(const shape of ['string','blocks']){
 const handlers={},events=[],alerts=[];let wakes=0;
 const session={id:'letter-'+(++serial),header:{createdAt:serial},snapshotEvents:()=>events,requestHeader:()=>({config:{provider:'claude-oauth',model:'claude-opus-5'}})};
 const agent={session,status:'running',inbox:{nextTurn:[],nextStep:[]},wakeDriver(){wakes++;}};
 const ctx={on(n,f){(handlers[n]??=[]).push(f);},get(n){return n==='sessions'?{flush:async()=>true}:n==='agents'?{get:()=>agent}:n==='pamyat'?{sobytiyaSessii:()=>events}:undefined;}};
 const api=installMarker(ctx,{name:session.id,log(){},alert:async text=>alerts.push(text),audit:async()=>[],mode:()=>true});
 const event=async(type,data,meta={})=>{const e={type,seq:events.length,time:Date.now(),data,...meta};events.push(e);for(const f of handlers['session/event']??[])await f(session,e);return e;};
 const step=(messages,turn)=>handlers['agent/pre-step'][0]({agent,messages,turn,signal:new AbortController().signal},async()=>({kind:'enter',messages}));
 try{
  // RU: Успешный эпизод сжатия: summary с [MODE=ACTIVE], checkpoint со ссылкой на неё, end без ошибки.
  // EN: A successful compaction episode: summary with [MODE=ACTIVE], a checkpoint referring to it, end without
  //     error.
  const summary=await event('compaction/summary',{compactionId:'c',summary:[{type:'text',text:'[MODE=ACTIVE]\ncheckpoint'}]});
  await event('user/message',{id:'checkpoint',source:{kind:'compact-checkpoint'}},{sourceEventSeqs:[summary.seq]});
  await event('compaction/end',{compactionId:'c'});
  const mail={id:'external',content:shape==='string'?text:[{type:'text',text}]};
  // RU: Шаг с письмом: письмо остаётся единственным входом; фаза — canceled (распознано) или held_external.
  // EN: Step with the letter: the letter stays the only input; phase — canceled (recognised) or held_external.
  const decision=await step([mail],1);assert.deepEqual(decision.messages,[mail],'original letter remains the only input');
  assert.equal(api.state(session).phase,recognized?'canceled':'held_external',label+' recognition');
  await event('turn/end',{turn:1,reason:{kind:'completed'}});agent.status='idle';
  for(const f of handlers['agent/status']??[])await f({agent,status:'idle'});
  await new Promise(r=>setImmediate(r));
  assert.equal(wakes,recognized?0:1,label+' extra wake');
  const next=await step([],2);assert.equal(next.messages.length,recognized?0:1,label+' next marker');
  assert.equal(alerts.length,0);console.log('PASS',label,shape,recognized?'recognized; no duplicate wake/marker':'not recognized; normal continuation preserved');
 }finally{api.dispose();}
}
