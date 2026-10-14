// Real caller -> runner -> SDK -> signed HTTP -> Mark's synthetic server, with actual ledger/state guard.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {once} from 'node:events';import {createInterface} from 'node:readline';import {createHash} from 'node:crypto';
import {ostrovApiTool} from '../src/ostrov-api.js';import {initializeRequestState} from '../src/ostrov-request-state.mjs';
const channel=process.env.TELEGRAM_TEST_PLUGIN_ROOT;
if(!channel){console.error('СЛЕПОТА: нужен TELEGRAM_TEST_PLUGIN_ROOT');process.exit(2);}
const {MessageReceipts}=await import(path.join(channel,'src/message-receipts.js'));const {ConversationSessions}=await import(path.join(channel,'src/conversation-sessions.js'));
const serverApp=process.env.MARK_TEST_APP;if(!serverApp){console.error('СЛЕПОТА: нужен MARK_TEST_APP');process.exit(2);}
const work=fs.mkdtempSync(path.join(os.tmpdir(),'crm-caller-'));let ledger,cfg,passed=0;
const backend=spawn('python3',['-B',new URL('./api-fixture.py',import.meta.url).pathname,serverApp],{stdio:['ignore','pipe','inherit'],env:{...process.env,OSTROV_FIXTURE_CRM:'1'}}),ended=once(backend,'exit');
try{
 const lines=createInterface({input:backend.stdout});cfg=JSON.parse((await Promise.race([once(lines,'line'),new Promise((_,r)=>setTimeout(()=>r(Error('fixture startup timeout')),5000).unref())]))[0]);lines.close();cfg.botId??='8868419301';/* аудит №9 (3.1.1): у клиента нет умолчания botId — фикстура ждёт этот */cfg.requestKeyDir=path.join(cfg.temp,'keys');initializeRequestState(cfg.requestKeyDir,work);
 ledger=new MessageReceipts(path.join(work,'.message-receipts'));const conversations=new ConversationSessions(ledger),roots=[],boundaries=new Map();let serial=100;
 const ctx={get:n=>({agents:{roots:()=>roots},taskControlCodex:{ledger},sessionProjections:{stateOf:s=>boundaries.get(s.id)}}[n])};
 function agent(id,route,sender){
  const a={session:{id,header:{id,createdAt:123,cwd:work,origin:'root'}}};roots.push(a);boundaries.set(id,{lastTurn:1,openTurnStartSeq:1});
  ledger.db.prepare('INSERT INTO channel_sessions VALUES(?,?,?,0)').run(route,id,123);
  const raw=sender?{update_id:++serial,message:{message_id:serial,from:{id:sender,is_bot:false},chat:{id:sender,type:'private'},text:'synthetic'}}:{v:1,id:'cw-77-1',conversation_id:77,message_id:1,text:'synthetic',received_at:Date.now()/1000};
  const r=ledger.receive('fixture:'+id,JSON.stringify(raw),{route:sender?'tg':'site',routeKey:sender?String(sender):route,sender:sender?'fixture':'site:visitor'});
  ledger.prepare(r.id,{id:'msg-'+id,content:[]},a.session,sender?String(sender):route);ledger.db.prepare('UPDATE receipts SET claimed_turn=1 WHERE id=?').run(r.id);return a;
 }
 const staff=agent('telegram-123456','123456',123456),guest=agent('telegram-gost-7654321','gost-7654321',7654321),site=agent('telegram-v2-site-fixture','site-77');
 const tool=ostrovApiTool(ctx,cfg),call=(a,operation,params={})=>tool.execute({operation,params},{agent:a,signal:AbortSignal.timeout(20000)});
 const calls=async()=> (await(await fetch(cfg.baseUrl+'/fixture/calls')).json()).calls;
 const profile=name=>({name,phone:'',email:'',notes:'',messengers:[{type:'telegram',username:'fixture_'+name}]});
 const plan=name=>({name,arrival:'2027-06-01',departure:'2027-06-04',adults:1,children:[],housing:[{resource:'resident',occupancy:1}],bathVisits:0});
 const sql=()=>{const p=spawnSync('python3',['-B','-c',"import sqlite3,json,sys;c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True);print(json.dumps({t:c.execute('select * from '+t+' order by 1').fetchall()for t in ['clients','client_plans','resident_plans']}))",path.join(cfg.temp,'synthetic.db')],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);};
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const recover=async(operation,params)=>{
  const older=path.join(work,'state-before-'+(++serial));fs.cpSync(cfg.requestKeyDir,older,{recursive:true});
  const result=await call(staff,operation,params),sent=(await calls()).filter(c=>c.operation===operation).at(-1);assert(sent.requestKey);
  const file=fs.readdirSync(cfg.requestKeyDir).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).find(n=>JSON.parse(fs.readFileSync(path.join(cfg.requestKeyDir,n))).key===sent.requestKey);assert(file);
  const target=path.join(cfg.requestKeyDir,file),bytes=fs.readFileSync(target),before=sql(),count=(await calls()).length;
  fs.unlinkSync(target);assert(!fs.readdirSync(cfg.requestKeyDir).includes(file));console.log('FAULT',operation,file,'sha256='+createHash('sha256').update(bytes).digest('hex'),'missing=true');
  await assert.rejects(call(staff,operation,params),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');assert.equal((await calls()).length,count,'state loss reached HTTP');assert.deepEqual(sql(),before,'state loss changed server rows');
  fs.writeFileSync(target,bytes,{mode:0o600});assert(fs.readFileSync(target).equals(bytes));assert.deepEqual((await call(staff,operation,params)).result,result.result);assert.deepEqual(sql(),before,'retry duplicated or changed rows');
  const hold=path.join(cfg.temp,'state-held-'+(++serial)),fullNames=fs.readdirSync(cfg.requestKeyDir).sort();
  fs.renameSync(cfg.requestKeyDir,hold);assert(!fs.existsSync(cfg.requestKeyDir));console.log('FAULT',operation,'whole state missing; saved names='+fullNames.length);
  try{const count=(await calls()).length;await assert.rejects(call(staff,operation,params),e=>e.code==='OSTROV_API_RECOVERY_REQUIRED');assert.equal((await calls()).length,count);assert(!fs.existsSync(cfg.requestKeyDir));assert.deepEqual(sql(),before);}finally{fs.renameSync(hold,cfg.requestKeyDir);}
  assert.deepEqual((await call(staff,operation,params)).result,result.result);
  fs.renameSync(cfg.requestKeyDir,hold);fs.cpSync(older,cfg.requestKeyDir,{recursive:true});assert(!fs.existsSync(target));assert(!fs.existsSync(path.join(cfg.requestKeyDir,'.reservations',file.replace('.json','.sha256'))));console.log('FAULT',operation,'coherent old snapshot; key and reservation absent');
  try{assert.deepEqual((await call(staff,operation,params)).result,result.result);assert.equal((await calls()).filter(c=>c.operation===operation).at(-1).requestKey,sent.requestKey);assert.deepEqual(sql(),before);}finally{fs.rmSync(cfg.requestKeyDir,{recursive:true,force:true});fs.renameSync(hold,cfg.requestKeyDir);fs.rmSync(older,{recursive:true,force:true});}
  assert.deepEqual(fs.readdirSync(cfg.requestKeyDir).sort(),fullNames);assert(fs.readFileSync(target).equals(bytes));assert.deepEqual((await call(staff,operation,params)).result,result.result);assert.deepEqual(sql(),before);return result.result;
 };
 let card,other,doc,staffId;
 await check('staff identity and client.create use real confirmed actor and guarded key',async()=>{staffId=(await call(staff,'identity')).result.staffId;card=await recover('client.create',{profile:profile('first')});assert.equal(card.profile.messengers[0].userId,'');});
 await check('targeted save uses guest profile and guarded retry',async()=>{card=await recover('client.save',{id:card.id,version:card.version,profile:profile('edited')});assert.equal(card.profile.messengers[0].userId,'');assert.equal((await call(staff,'client.read',{id:card.id})).result.profile.name,'edited');});
 await check('plan.create clientId preserves card and plan.connections',async()=>{const v=(await call(staff,'catalog')).result.version;doc=await recover('plan.create',{kind:'resident',plan:plan('edited'),catalogVersion:v,clientId:card.id});assert.equal((await call(staff,'plan.connections',{kind:'resident',id:doc.id})).result.client.id,card.id);});
 await check('plan.link and client.assign share Alpha state path',async()=>{other=(await call(staff,'client.create',{profile:profile('second')})).result;await recover('plan.link',{kind:'resident',id:doc.id,documentVersion:doc.documentVersion,clientId:other.id,clientVersion:other.version});assert.equal((await call(staff,'plan.connections',{kind:'resident',id:doc.id})).result.client.id,other.id);other=(await call(staff,'client.read',{id:other.id})).result;await recover('client.assign',{id:other.id,version:other.version,staffId});assert.equal((await call(staff,'client.read',{id:other.id})).result.responsible.id,staffId);});
 await check('guest can read public staff projection without elevation',async()=>{const r=await call(guest,'staff.list',{direction:'guests'});assert.equal(r.role,'guest');assert(r.result.employees.every(s=>!Object.hasOwn(s,'profile')));const staffRow=(await call(staff,'staff.list')).result.employees[0];assert(!Object.hasOwn((await call(guest,'staff.read',{id:staffRow.id})).result,'profile'));});
 await check('guest cannot use staff-only CRM even with staff actor ID',async()=>{const a=agent('telegram-gost-123456','gost-123456',123456),n=(await calls()).length;await assert.rejects(call(a,'client.list'),/сотрудник/);assert.equal((await calls()).length,n);});
 await check('unproven current input refuses CRM before HTTP',async()=>{const b=boundaries.get(staff.session.id),n=(await calls()).length;b.openTurnStartSeq=null;try{await assert.rejects(call(staff,'staff.list'));assert.equal((await calls()).length,n);}finally{b.openTurnStartSeq=1;}});
 await check('rotated Site public quote reads without writes or actor',async()=>{const before=sql(),n=(await calls()).length,r=await call(site,'quote',{kind:'resident',plan:plan('site')});assert.equal(r.role,'guest');const sent=(await calls()).slice(n);assert.equal(sent.length,1);assert.equal(sent[0].operation,'quote');assert(!sent[0].context);assert(!sent[0].requestKey);assert.deepEqual(sql(),before);});
 await check('lost rotated route never becomes anonymous',async()=>{
  const version=(await call(staff,'catalog')).result.version,row=ledger.db.prepare('SELECT * FROM channel_sessions WHERE session_id=?').get(site.session.id),before=sql(),n=(await calls()).length;
  ledger.db.prepare('DELETE FROM channel_sessions WHERE session_id=?').run(site.session.id);assert(!ledger.db.prepare('SELECT 1 FROM channel_sessions WHERE session_id=?').get(site.session.id));console.log('FAULT rotated Site channel_sessions binding absent');
  try{await assert.rejects(call(site,'plan.create',{kind:'resident',plan:plan('orphan'),catalogVersion:version,clientProfile:profile('orphan')}),/маршрут|сайт|Site/);assert.equal((await calls()).length,n);assert.deepEqual(sql(),before);}finally{ledger.db.prepare('INSERT INTO channel_sessions VALUES(?,?,?,?)').run(row.route_key,row.session_id,row.session_created,row.revision);}
  assert.equal((await call(site,'catalog')).role,'guest');assert.equal((await calls()).length,n+1);assert.deepEqual(sql(),before);
 });
 await check('turn replacement during HTTP refuses old response',async()=>{const b=boundaries.get(staff.session.id),p=call(staff,'staff.list');b.lastTurn=2;ledger.db.prepare('UPDATE receipts SET claimed_turn=2 WHERE session_id=?').run(staff.session.id);try{await assert.rejects(p,/вход изменился/);}finally{b.lastTurn=1;ledger.db.prepare('UPDATE receipts SET claimed_turn=1 WHERE session_id=?').run(staff.session.id);}assert.equal((await call(staff,'staff.list')).ok,true);});
 console.log('CRM_CALLER',passed,'/',passed);
}finally{ledger?.close();backend.kill('SIGTERM');await ended;fs.rmSync(work,{recursive:true,force:true});}
