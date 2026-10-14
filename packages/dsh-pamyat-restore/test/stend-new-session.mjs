// RU: Стенд изоляции /new запускает настоящий apply с временными отметками. Telegram-v2 с пустой историей не получает старую глобальную сводку ни через welcome, ни после чужого compaction/end, но получает знания (A-N-1719); прежняя telegram-a2a сохраняет оба пути. Подставная память возвращает узнаваемый образец, который проверяется в реально возвращённом сообщении.
// EN: The /new isolation test runs actual apply with temporary markers. Telegram-v2 with empty history receives no old global summary through welcome or after an external compaction/end; earlier telegram-a2a retains both paths. Fake memory returns a recognizable sample checked in the actual returned message.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
try { await import('../src/index.js'); } catch(error) { if(error.code==='ERR_MODULE_NOT_FOUND'){console.log('СЛЕПОТА: зависимости restore не установлены');process.exit(2);}throw error;}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'restore-new-'));let seq=0;
try{
 for(const sid of ['telegram-a2a','telegram-v2-00000000-0000-4000-8000-000000000001']){
  delete globalThis.__pamyatRestore;const {apply,Config}=await import('../src/index.js?new='+seq++);const handlers={};
  const ctx={on:(name,f)=>{handlers[name]=f;return()=>{}},get:n=>n==='pamyat'?{sessiyaIsklyuchena:()=>false,prochitat:async q=>q.klass==='svodka-kompakcii'?[{id:1,klass:'svodka-kompakcii',soderzhim:'OLD_SUMMARY_CANARY',sozdano:Date.now()}]:[{id:1,klass:'svodka-kompakcii',soderzhim:'OLD_SUMMARY_CANARY',sozdano:Date.now()},{id:2,klass:'urok',soderzhim:'ZNANIE_V2_KANAREJKA',sozdano:Date.now()}]}:undefined};
  apply(ctx,Config({welcomeEnabled:true,welcomeOtmetki:path.join(root,sid)}));
  const session={id:sid,events:[]},input={agent:{id:sid,session},turn:1,step:1,signal:new AbortController().signal};
  const result=await handlers['agent/pre-step'](input,async()=>({kind:'enter',messages:[]}));
  assert.equal(JSON.stringify(result).includes('OLD_SUMMARY_CANARY'),sid==='telegram-a2a','welcome must not import old context after /new');
  assert.ok(JSON.stringify(result).includes('ZNANIE_V2_KANAREJKA'),'welcome must bring knowledge to '+sid+' (A-N-1719: v2 too)');
  handlers['session/event'](session,{type:'compaction/end',time:Date.now(),data:{compactionId:'foreign'}});
  const after=await handlers['agent/pre-step'](input,async()=>({kind:'enter',messages:[]}));
  assert.equal(JSON.stringify(after).includes('OLD_SUMMARY_CANARY'),sid==='telegram-a2a','external compaction must not import old global summary');
 }
 console.log('PASS legacy restore preserved; /new welcome brings knowledge without old summary; foreign summary suppressed');
}finally{fs.rmSync(root,{recursive:true,force:true})}
