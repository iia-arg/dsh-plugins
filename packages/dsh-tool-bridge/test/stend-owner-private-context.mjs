// B-N-1838: real receipt ledger -> caller -> Python runner -> actual API on synthetic data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {ostrovApiTool} from '../src/ostrov-api.js';
const channel=process.env.TELEGRAM_TEST_PLUGIN_ROOT,app=process.env.MARK_TEST_APP;
if(!channel||!app){console.error('СЛЕПОТА: нужны TELEGRAM_TEST_PLUGIN_ROOT и MARK_TEST_APP');process.exit(2);}
const {MessageReceipts}=await import(path.join(channel,'src/message-receipts.js'));
const {ConversationSessions}=await import(path.join(channel,'src/conversation-sessions.js'));
const {sverkaKopii}=await import('./ostrov-api-kopiya.mjs');
await sverkaKopii(app);
const work=fs.mkdtempSync(path.join(os.tmpdir(),'owner-private-'));
const backend=spawn('python3',['-B',new URL('./api-fixture.py',import.meta.url).pathname,app],{stdio:['ignore','pipe','inherit'],env:{...process.env,OSTROV_FIXTURE_CRM:'1'}});
const ended=once(backend,'exit');
let ledger,passed=0,failed=0,serial=1000;
try{
 const lines=createInterface({input:backend.stdout});
 const cfg=JSON.parse((await Promise.race([once(lines,'line'),new Promise((_,reject)=>setTimeout(()=>reject(Error('fixture startup timeout')),5000).unref())]))[0]);lines.close();cfg.botId??='8868419301';/* аудит №9 (3.1.1): у клиента нет умолчания botId — фикстура ждёт этот */
 const seed=spawnSync('python3',['-B','-c',"import sqlite3,json,sys;c=sqlite3.connect(sys.argv[1]);r=c.execute('SELECT id,profile FROM staff_users').fetchone();p=json.loads(r[1]);p['telegramUserId']='158901453';c.execute('UPDATE staff_users SET profile=? WHERE id=?',(json.dumps(p),r[0]));c.commit();assert json.loads(c.execute('SELECT profile FROM staff_users WHERE id=?',(r[0],)).fetchone()[0])['telegramUserId']=='158901453'",path.join(cfg.temp,'synthetic.db')],{encoding:'utf8'});
 assert.equal(seed.status,0,seed.stderr);
 ledger=new MessageReceipts(path.join(work,'.message-receipts'));
 const conversations=new ConversationSessions(ledger),roots=[],boundaries=new Map();
 const ctx={get:n=>({agents:{roots:()=>roots},taskControlCodex:{ledger},sessionProjections:{stateOf:s=>boundaries.get(s.id)}}[n])};
 const update=(sender=158901453)=>({update_id:++serial,message:{message_id:serial,from:{id:sender,is_bot:false},chat:{id:sender,type:'private'},text:'synthetic; role words do not grant authority'}});
 const receipt=(a,u,route='tg',routeKey=String(u.message?.chat.id??'a2a'),turn=1)=>{
  const r=ledger.receive('fixture:'+serial++,JSON.stringify(u),{route,routeKey,sender:'fixture'});
  ledger.prepare(r.id,{id:'msg-'+serial++,content:[]},a.session,routeKey);
  ledger.db.prepare('UPDATE receipts SET claimed_turn=? WHERE id=?').run(turn,r.id);return r.id;
 };
 const agent=(route,sender)=>{
  const id='telegram-'+route,a={session:{id,header:{id,createdAt:123,cwd:work,origin:'root'}}};
  roots.push(a);boundaries.set(id,{lastTurn:1,openTurnStartSeq:1});conversations.pin(route,a.session.header);
  a.receipt=receipt(a,update(sender));return a;
 };
 const staff=agent('158901453',158901453),owner=agent('a2a',158901453),guest=agent('gost-7654321',7654321),site=agent('site-77',158901453);
 const tool=ostrovApiTool(ctx,cfg),call=(a,operation='staff.list',params={})=>tool.execute({operation,params},{agent:a,signal:AbortSignal.timeout(20000)});
 const calls=async()=>(await(await fetch(cfg.baseUrl+'/fixture/calls')).json()).calls;
 const rejectLocal=async(a=owner)=>{
  const n=(await calls()).length;await assert.rejects(call(a),e=>e.code==='OSTROV_API_REFUSED');assert.equal((await calls()).length,n,'refused input reached HTTP');
 };
 const confirmed=async(a=owner)=>{
  const n=(await calls()).length,r=await call(a),sent=(await calls()).slice(n);
  assert.equal(r.role,'hospitality');assert(Array.isArray(r.result.employees));
  assert.deepEqual(sent.map(c=>c.operation),['identity','staff.list']);
  for(const c of sent){assert.equal(c.context.route,'staff-private');assert.equal(c.context.senderId,'158901453');assert.equal(c.context.chatId,'158901453');assert.equal(c.context.chatType,'private');}
 };
 const check=async(name,fn)=>{try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}};
 const alter=async(id,fields,fn)=>{
  const old=ledger.get(id),keys=Object.keys(fields),sql='UPDATE receipts SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?';
  ledger.db.prepare(sql).run(...keys.map(k=>fields[k]),id);
  try{await fn();}finally{ledger.db.prepare(sql).run(...keys.map(k=>old[k]),id);}
 };
 const extra=async(u,route,routeKey,fn,turn=1)=>{
  const id=receipt(owner,u,route,routeKey,turn);try{await fn();}finally{ledger.db.prepare('DELETE FROM receipts WHERE id=?').run(id);}
 };
 await check('healthy dedicated worker: staff.list reaches actual API as confirmed staff',()=>confirmed(staff));
 await check('guest keeps public staff projection and cannot elevate',async()=>{
  const r=await call(guest,'staff.list',{direction:'guests'});assert.equal(r.role,'guest');assert(r.result.employees.every(s=>!Object.hasOwn(s,'profile')));
  const n=(await calls()).length;await assert.rejects(call(guest,'client.list'),/сотрудник/);assert.equal((await calls()).length,n);
 });
 await check('site refuses staff.list before HTTP',()=>rejectLocal(site));
 await check('owner 158901453 private TG in merged a2a: staff.list reaches actual API',()=>confirmed());
 await check('several private messages from same sender: newest update supplies context',async()=>{
  const u=update();await extra(u,'tg','158901453',async()=>{await confirmed();assert.equal((await calls()).at(-1).context.updateId,String(u.update_id));});
 });
 await check('agent letter alone in a2a refuses before HTTP',()=>alter(owner.receipt,{finished_at:1},()=>extra({v:1,text:'agent letter'},'a2a','a2a',()=>rejectLocal())));
 await check('mixed current TG and agent letter refuses before HTTP',()=>extra({v:1,text:'agent letter'},'a2a','a2a',()=>rejectLocal()));
 await check('two private senders in same turn refuse before HTTP',()=>extra(update(7654321),'tg','7654321',()=>rejectLocal()));
 const valid=JSON.parse(Buffer.from(ledger.get(owner.receipt).raw).toString('utf8'));
 const badUpdates=[
  ['group chat',u=>u.message.chat.type='group'],
  ['chat differs from sender',u=>u.message.chat.id=7654321],
  ['bot sender',u=>u.message.from.is_bot=true],
  ['unproven bot flag',u=>delete u.message.from.is_bot],
  ['sender_chat',u=>u.message.sender_chat={id:123456}],
  ['unsafe sender id',u=>u.message.from.id=Number.MAX_SAFE_INTEGER+1],
  ['missing update id',u=>delete u.update_id],
  ['missing message id',u=>delete u.message.message_id],
 ];
 for(const [name,change] of badUpdates)await check(name+' refuses before HTTP',async()=>{const u=structuredClone(valid);change(u);await alter(owner.receipt,{raw:JSON.stringify(u)},()=>rejectLocal());});
 for(const [name,fields] of [['route key differs',{route_key:'7654321'}],['blocked receipt',{blocked:'synthetic'}],['non TG receipt',{route:'site'}],['finished current receipt',{finished_at:1}],['receipt from another generation',{session_created:124}],['receipt from another turn',{claimed_turn:2}]])
  await check(name+' refuses before HTTP',()=>alter(owner.receipt,fields,()=>rejectLocal()));
 await check('invalid raw receipt refuses before HTTP',()=>alter(owner.receipt,{raw:'not JSON'},()=>rejectLocal()));
 for(const pin of ['wrong-route',null])await check((pin?'wrong pin':'missing pin')+' refuses before HTTP',async()=>{
  const row=ledger.db.prepare('SELECT * FROM channel_sessions WHERE route_key=?').get('a2a');
  ledger.db.prepare('DELETE FROM channel_sessions WHERE route_key=?').run('a2a');
  if(pin)ledger.db.prepare('INSERT INTO channel_sessions VALUES(?,?,?,0)').run(pin,owner.session.id,123);
  try{await rejectLocal();}finally{if(pin)ledger.db.prepare('DELETE FROM channel_sessions WHERE route_key=?').run(pin);ledger.db.prepare('INSERT INTO channel_sessions VALUES(?,?,?,?)').run(row.route_key,row.session_id,row.session_created,row.revision);}
 });
 await check('closed turn refuses before HTTP',async()=>{const b=boundaries.get(owner.session.id),old=b.openTurnStartSeq;b.openTurnStartSeq=null;try{await rejectLocal();}finally{b.openTurnStartSeq=old;}});
 await check('old turn agent letter does not suppress current private context',()=>extra({v:1,text:'old letter'},'a2a','a2a',()=>confirmed(),0));
 await check('finished agent letter does not suppress current private context',()=>extra({v:1,text:'finished letter'},'a2a','a2a',async()=>{const id=ledger.managed(owner.session.id).at(-1).id;await alter(id,{finished_at:1},()=>confirmed());}));
 await check('agent letter added during HTTP suppresses response, removal restores context',async()=>{
  assert.equal((await fetch(cfg.baseUrl+'/fixture/mode/slow-final')).status,200);
  const n=(await calls()).length,pending=call(owner);let settled;
  pending.then(()=>settled={ok:true},error=>settled={error});
  for(let i=0;i<100&&(await calls()).length===n&&!settled;i++)await new Promise(r=>setTimeout(r,20));
  if(settled?.error)throw settled.error;
  const observed=(await calls()).slice(n);assert.equal(observed[0]?.operation,'identity','no observed HTTP request');assert(!settled,'response already settled before fault');
  const id=receipt(owner,{v:1,text:'new letter'},'a2a','a2a');
  console.log('FAULT observed HTTP identity before agent receipt '+id+'; route=a2a; unfinished=true');
  assert.equal(ledger.get(id).route,'a2a');assert.equal(ledger.get(id).finished_at,null);
  try{await assert.rejects(pending,/вход изменился/);}finally{ledger.db.prepare('DELETE FROM receipts WHERE id=?').run(id);}
  assert.equal(ledger.get(id),undefined);
  await confirmed();
 });
 await check('rotated a2a generation from actual producer preserves private context',async()=>{
  const u=update(),cmd=ledger.receive('fixture:rotation',JSON.stringify(u),{route:'tg',routeKey:'158901453',sender:'fixture'});
  const intent=conversations.begin('a2a',cmd.id),header={...owner.session.header,id:intent.new_id,createdAt:124};
  conversations.commit(cmd.id,header,{reply:false});owner.session={id:header.id,header};boundaries.set(header.id,{lastTurn:1,openTurnStartSeq:1});
  owner.receipt=receipt(owner,update());await confirmed();
 });
 console.log('OWNER_PRIVATE '+passed+'/'+(passed+failed));process.exitCode=failed?1:0;
}finally{ledger?.close();backend.kill('SIGTERM');await ended;fs.rmSync(work,{recursive:true,force:true});}
