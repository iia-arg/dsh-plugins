// RU: Проверка stend-conversation-isolation: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-conversation-isolation verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.
import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {extractFunction} from './extract.mjs';
const source=fs.readFileSync(new URL('../gateway.mjs',import.meta.url),'utf8');const c={nodeCrypto:crypto,RESUME_ON:true,SESSII:new Map(),sessiyaIzBazy:()=>undefined/* аудит №2 (1.4.57): промах кэша читает базу; здесь базы нет */,buildPrompt:JSON.stringify,PREDEL_HVOSTA_ZN:120,log(){}};vm.createContext(c);vm.runInContext(['hashText','tekstSoobshcheniya','kluchBesedy','hashPrefiksa','planZaprosa','planHvosta','sHvostomEsliNado'].map(n=>extractFunction(source,n)).join('\n'),c);
const first=[{role:'user',content:'same'}],next=[...first,{role:'user',content:'new'}];c.SESSII.set(c.kluchBesedy(first),{sessionId:'OLD',otdano:1,hashPref:c.hashPrefiksa(first,1)});
assert.equal(c.planZaprosa(next,'v2:new').resume,null,'explicit generation must not reuse legacy cache');
assert.equal(c.planZaprosa(next,null).resume,null,'stateless must not reuse cache');
const {resolveConversation,installConversationSchema,writeConversation}=await import('../conversation-identity.mjs');
const a={version:2,id:'telegram-v2-00000000-0000-4000-8000-000000000001',createdAt:123,cwd:'/fixture'},b={...a,id:'telegram-v2-00000000-0000-4000-8000-000000000002'};
assert.notEqual(resolveConversation(a,'openai','/fixture').key,resolveConversation(b,'openai','/fixture').key);
assert.notEqual(resolveConversation(a,'openai','/fixture').key,resolveConversation(a,'anthropic','/fixture').key);
assert.throws(()=>resolveConversation({...a,cwd:'/other'},'openai','/fixture'));
assert.throws(()=>resolveConversation({...a,createdAt:null},'openai','/fixture'));
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE sessions(kluch TEXT PRIMARY KEY, sessionId TEXT, otdano INTEGER, hashPref TEXT)');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('legacy','OLD',1,'h');installConversationSchema(db);installConversationSchema(db);
for(const i of [a,b]){const r=resolveConversation(i,'openai','/fixture');writeConversation(db,r.key,{sessionId:i.id,otdano:1,hashPref:'h',identity:r.identity});}
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,3);assert.equal(db.prepare('SELECT sessionId FROM sessions WHERE dshId=? AND dshCreated=?').get(a.id,123).sessionId,a.id);db.close();console.log('gateway isolation and additive SQLite migration OK');

const long=[{role:'user',content:'x'.repeat(200)},{role:'user',content:'new message'}];
const scoped=c.planZaprosa(long,'v2:tail');scoped.identity={dshId:'fixture'};
const tail=c.sHvostomEsliNado(scoped,long);
assert.equal(tail.kluch,'v2:tail','initial truncation preserves namespace');assert.equal(tail.identity,scoped.identity);
const shorter=c.planHvosta(long,15,scoped);
assert.equal(shorter.kluch,'v2:tail','second truncation preserves namespace');assert.equal(shorter.identity,scoped.identity);
const stateless=c.sHvostomEsliNado(c.planZaprosa(long,null),long);assert.equal(stateless.kluch,null,'stateless truncation must not acquire a cache key');
console.log('tail namespace OK');

const retryStart=source.indexOf('      plan = sHvostomEsliNado({ ...planZaprosa');
assert(retryStart>=0,'retry expression exists');
const retryEnd=source.indexOf(';',retryStart)+1;
c.body={messages:long};c.conversation={key:'v2:retry',identity:{dshId:'retry-fixture'}};
vm.runInContext(source.slice(retryStart,retryEnd),c);
assert.equal(c.plan.kluch,'v2:retry');assert.equal(c.plan.identity,c.conversation.identity);assert.equal(c.plan.resume,null);
console.log('dead-session retry namespace OK');
