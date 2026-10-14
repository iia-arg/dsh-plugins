// B-N-2027 (14.10.2026): Instagram /replies отдаёт строки БЕЗ автора — живой ответ graph.instagram.com v26 на
// fields=id,text,timestamp,from и на fields=id,timestamp,username,user,from: ключи только id,text,timestamp (from, username,
// user нет). Прежде такая строка держала ВСЮ страницу ответов (held normalize_identity). Ниже — форма из живого ответа,
// анонимизированная: свои id и тексты.
import './approval-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Store,hash,canonical} from '../src/store.mjs';import * as receiver from '../src/meta-receiver.mjs';import * as apiModule from '../src/meta-api.mjs';
const targets={vk:'127999849',instagram:'17841453053403067',threads:'26794519373575025',telegram:'-1001925584120'};
const cfg={enabled:true,armed:true,apiVersion:'v26.0',token:{file:'/tmp/test-only-meta-token'},startAt:'2026-10-14T00:00:00Z',messagesEnabled:false};
const tick=Date.parse('2026-10-14T02:00:00Z');
const profile={user_id:targets.instagram,username:'fixture_account'};
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socseti-reply-'));const store=new Store(dir,targets,{profile:'anna',now:()=>tick});t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true})});return {store,reader:new receiver.MetaReader(store,'instagram',cfg,{now:()=>tick})}}
function scripted(reader,replies,comments=[{id:'77',text:'top',timestamp:'2026-10-14T01:00:00Z',from:{id:'66'}}]){
 reader.api=new apiModule.MetaApi({provider:'instagram',account:reader.account,version:'v26.0',token:'fixture-token',budget:reader.state,fetchImpl:async url=>{const p=new URL(url).pathname;let body;
  if(p.endsWith('/me'))body=profile;else if(p.endsWith('/media'))body={data:[{id:'55',timestamp:'2025-01-01T00:00:00Z'}]};else if(p.endsWith('/55/comments'))body={data:comments};
  else if(p.endsWith('/77/replies'))body={data:replies};else if(/\/7[89]\/replies$/.test(p))body={data:[]};else throw Error('unexpected route '+p);
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}})}});
}
// Живая форма 14.10.2026 10:08Z/10:10Z: две строки, только id, text, timestamp.
const ZHIVAYA=[{id:'78',text:'ответ без автора',timestamp:'2026-10-14T01:01:00+0000'},{id:'79',text:'второй ответ без автора',timestamp:'2026-10-14T01:02:00+0000'}];
const held=r=>r.status().held_jobs;

test('IG reply without author (live 14.10 form) is accepted as a visitor reply; replies page is not held',async t=>{
 const {reader,store}=setup(t);scripted(reader,ZHIVAYA);await reader.tick();
 assert.deepEqual(held(reader),[]);const p=store.pendingAnna();assert.equal(p.length,3,'top comment + two replies without author');
 const s=new Set(p.map(e=>e.payload.subject_id));assert.ok([...s].every(x=>typeof x==='string'&&x),'subject present');assert.equal(s.size,3,'each authorless reply is its own subject, not merged into one person');
});
test('IG reply whose author is our own account is still skipped',async t=>{
 const {reader,store}=setup(t);scripted(reader,[{...ZHIVAYA[0],from:{id:targets.instagram}},ZHIVAYA[1]]);await reader.tick();
 assert.deepEqual(held(reader),[]);assert.equal(store.pendingAnna().length,2);
});
test('malformed author (from without string id) is still a held normalize_identity',async t=>{
 const {reader}=setup(t);scripted(reader,[{...ZHIVAYA[0],from:{}}]);await reader.tick();
 assert.deepEqual(held(reader).map(j=>[j.method,j.reason]),[['replies','normalize_identity']]);
});
test('top-level comment without author keeps the old strict hold (boundary: only /replies relaxed)',async t=>{
 const {reader}=setup(t);scripted(reader,[],[{id:'77',text:'top',timestamp:'2026-10-14T01:00:00Z'}]);await reader.tick();
 assert.deepEqual(held(reader).map(j=>[j.method,j.reason]),[['comments','normalize_identity']]);
});
test('one-time requeue: only IG replies held normalize_identity return to pending, once',t=>{
 const {reader,store}=setup(t);const job=(id,method,reason)=>({id,method,args:{id},root:'55',order:1,state:'held',failures:1,reason,notBefore:0,stage:'normalize',code:0});
 for(const j of [job('r1','replies','normalize_identity'),job('r2','replies','normalize_identity'),job('c1','comments','normalize_identity'),job('r3','replies','page_shape')])reader.writeJob(j);
 reader.state.patch({requeueRepliesNoAuthor:undefined});   // состояние от прежней версии: пометки нет
 const again=new receiver.MetaReader(store,'instagram',cfg,{now:()=>tick});
 assert.deepEqual(held(again).map(j=>[j.object_id,j.reason]).sort(),[['c1','normalize_identity'],['r3','page_shape']]);
 assert.equal(again.state.get().requeueRepliesNoAuthor?.jobs,2);
 again.writeJob(job('r4','replies','normalize_identity'));const third=new receiver.MetaReader(store,'instagram',cfg,{now:()=>tick});
 assert.ok(held(third).some(j=>j.object_id==='r4'),'second restart does not requeue again');
});

// B-N-2027 3.1.7: тот же объект раньше пришёл С автором (настоящий subject_id), теперь /replies отдаёт его БЕЗ автора —
// в 3.1.6 это давало hold identity_conflict:subject_id (у Анны 9). Строка без автора не перезаписывает известного автора.
const obj=(id,extra={})=>({id,kind:'comment',conversation_id:'conv:55',subject_id:'avtor:nastoyashchij',text:'текст',occurred_at:tick,...extra});
const identity=(store,id)=>JSON.parse(store.db.prepare("SELECT identity_json FROM meta_objects WHERE object_id=?").get(id).identity_json);
test('known object re-arriving without author keeps saved author; its old subject hold is cleared',t=>{
 const {reader,store}=setup(t);reader.accept([obj('78')],'p1');reader.hold('78','identity_conflict:subject_id');
 reader.accept([obj('78',{subject_id:'avtor:ne_peredan',avtorNePeredan:true})],'p2');
 assert.deepEqual(reader.status().held_objects,[]);assert.equal(identity(store,'78').subject_id,'avtor:nastoyashchij');
});
test('boundary: authorless row with a different conversation still conflicts',t=>{
 const {reader}=setup(t);reader.accept([obj('78')],'p1');
 reader.accept([obj('78',{conversation_id:'conv:56',subject_id:'avtor:ne_peredan',avtorNePeredan:true})],'p2');
 assert.deepEqual(reader.status().held_objects.map(h=>h.reason),['identity_conflict:conversation_id']);
});
test('boundary: a row WITH a different author (no authorless mark) still conflicts on subject_id',t=>{
 const {reader}=setup(t);reader.accept([obj('78')],'p1');reader.accept([obj('78',{subject_id:'avtor:drugoj'})],'p2');
 assert.deepEqual(reader.status().held_objects.map(h=>h.reason),['identity_conflict:subject_id']);
});
test('normalize marks only the authorless /replies row',t=>{
 const {reader}=setup(t);const job={method:'replies',root:'55',args:{id:'77'}};
 assert.equal(reader.normalize({id:'78',text:'x',timestamp:'2026-10-14T01:01:00+0000'},job).avtorNePeredan,true);
 assert.equal(reader.normalize({id:'79',text:'x',timestamp:'2026-10-14T01:01:00+0000',from:{id:'66'}},job).avtorNePeredan,undefined);
});

// Дельта 3.1.7 по воротам 10:41Z. (в) Зеркало: 3.1.6 сохранил объект с заглушкой «автор не передан», потом тот же объект пришёл С
// настоящим автором — берётся сохранённый субъект (событие с новым subject_id store отверг бы как конфликт).
const zaglushka=id=>hash(canonical(['instagram','avtor_ne_peredan',id]));
test('mirror: object saved with the authorless stub, later arriving WITH an author, keeps the stub, no hold',t=>{
 const {reader,store}=setup(t);reader.accept([obj('78',{subject_id:zaglushka('78'),avtorNePeredan:true})],'p1');reader.accept([obj('78')],'p2');
 assert.deepEqual(reader.status().held_objects,[]);assert.equal(identity(store,'78').subject_id,zaglushka('78'));
});
test('mirror boundary: a stub of ANOTHER object does not count as this object stub',t=>{
 const {reader}=setup(t);reader.accept([obj('78',{subject_id:zaglushka('79')})],'p1');reader.accept([obj('78')],'p2');
 assert.deepEqual(reader.status().held_objects.map(h=>h.reason),['identity_conflict:subject_id']);
});
// (б) Разовое снятие при подъёме: только IG, только identity_conflict:subject_id, только объекты, уже лежащие в meta_objects; один раз.
test('one-time release on start: only IG subject conflicts of saved objects, once',t=>{
 const {reader,store}=setup(t);reader.accept([obj('78'),obj('80')],'p1');
 reader.hold('78','identity_conflict:subject_id');reader.hold('80','identity_conflict:conversation_id');reader.hold('99','identity_conflict:subject_id');
 reader.state.patch({snyatieKonfliktaAvtora:undefined});   // состояние от 3.1.6: пометки нет
 const again=new receiver.MetaReader(store,'instagram',cfg,{now:()=>tick});
 assert.deepEqual(again.status().held_objects.map(h=>[h.object_id,h.reason]).sort(),[['80','identity_conflict:conversation_id'],['99','identity_conflict:subject_id']]);
 assert.equal(again.state.get().snyatieKonfliktaAvtora?.holds,1);
 again.hold('78','identity_conflict:subject_id');const third=new receiver.MetaReader(store,'instagram',cfg,{now:()=>tick});
 assert.ok(third.status().held_objects.some(h=>h.object_id==='78'),'second start does not release again');
});
