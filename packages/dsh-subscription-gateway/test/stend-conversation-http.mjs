// RU: Проверка stend-conversation-http: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-conversation-http verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {resolveConversation} from '../conversation-identity.mjs';
const source=fs.readFileSync(new URL('../gateway.mjs',import.meta.url),'utf8');
// Аудит №1 (1.4.57): обработчик вынесен в async function obrabotatZapros (обёртка в createServer ловит исключения) — вырезка начинается с неё.
const start=source.indexOf('async function obrabotatZapros(req, res) {');
const end=source.indexOf('  let plan = planZaprosa',start);assert(start>0&&end>start);
let handler,input,admitted=0;
const c={admitIngress:()=>true,process:{env:{}},http:{createServer(fn){handler=fn}},readToken:()=>null,POSTAVSHCHIK:{trebuetNashToken:false},
 readBody:async()=>input,rolyDsh02VFormu011:x=>x,WORK_DIR:'/fixture',IMYA_POSTAVSHCHIKA:'openai',log(){},resolveConversation,MASKA_PDN:null,
 admit:()=>{admitted++},
 // B-N-1811 (выпуск 1.4.52, Заря): вырезка хендлера зовёт pressureForRequest (давление хода) — функция вне вырезки; предмет стенда — личность
 // разговора до потока, давление здесь не проверяется: заглушка «порога нет».
 pressureForRequest:()=>({})};
vm.createContext(c);vm.runInContext(source.slice(start,end)+'admit(); res.end(); }',c);handler=c.obrabotatZapros;
for(const conversation of [{version:99},{version:2,id:'invalid',createdAt:1,cwd:'/fixture'}]){
 input={conversation};const calls=[];await handler({method:'POST',url:'/v1/agent-stream'},{writeHead:code=>calls.push(code),end:body=>calls.push(JSON.parse(body).error.type)});
 assert.deepEqual(calls,[400,'bad_conversation']);assert.equal(admitted,0);
}
input={};const calls=[];await handler({method:'POST',url:'/v1/agent-stream'},{writeHead:code=>calls.push(code),end:()=>calls.push('end')});
assert.deepEqual(calls,[200,'end']);assert.equal(admitted,1);console.log('invalid identity -> 400 before stream; next legacy request admitted; SDK not invoked');

input={};const v2=[];await handler({method:'POST',url:'/v2/agent-stream'},{writeHead:c=>v2.push(c),end:b=>v2.push(JSON.parse(b).error.type)});assert.deepEqual(v2,[400,'bad_conversation']);console.log('v2 cannot downgrade to legacy when identity missing');
