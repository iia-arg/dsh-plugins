import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {MessageReceipts} from '../src/message-receipts.js';
import {ConversationPause} from '../src/conversation-pause.js';
import {signCoordinator} from '../src/coordinator-signature.js';
import {signStopStatus,verifyStopStatus} from '../src/mail-stop-protocol.js';
let api={};try{api=await import('../src/mail-stop-receiver.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
assert.equal(typeof api.MailStopReceiver,'function','missing privileged control dispatcher');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-receiver-'));let l;
try{
 let now=1000000;l=new MessageReceipts(path.join(root,'ledger'),{now:()=>now,owner:'fixture-process'});const pause=new ConversationPause(l,'/fixture-cwd',()=>{});
 const coord=generateKeyPairSync('ed25519'),status=generateKeyPairSync('ed25519');
 const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{coord:coord.publicKey.export({type:'spki',format:'pem'})},controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['pause','replace']}},returnRoutes:{coord:{recipient:'coord-return',ledger_uuid:'reply-ledger',directory:'/fixture/coord'}}};
 const calls=[],statuses=[],alerts=[];let resolutions=0;
 const session={id:'fixture-session',header:{id:'fixture-session',createdAt:10,cwd:'/fixture-cwd'},events:[{type:'turn/start',data:{turn:3}}],requestHeader:()=>({config:{provider:'native',model:'fixture'}}),append(type,data){const e={seq:this.events.length,type,data};this.events.push(e);return e;}};
 const agent={session,status:'running',inbox:{nextTurn:[{id:'pending-old'}],nextStep:[]},cancel(cause,options){calls.push([cause,options]);agent.status='idle';session.append('turn/end',{turn:3});},whenIdle:async()=>{}};
 const receiver=new api.MailStopReceiver({ledger:l,pause,recipient:'fixture-agent',getTrust:()=>trust,getArrival:()=>({delivered_at:1000000,event_id:'observed-event'}),resolveTarget:()=>{resolutions++;return agent},signStatus:s=>signStopStatus(s,'fixture-status',status.privateKey),publishStatus:wire=>statuses.push(wire),alert:text=>alerts.push(text)});
 const wire=(id,issued=1000000)=>{const meta={kind:'task-stop/1',delivery_id:id,recipient:'fixture-agent',ledger_uuid:l.protocolIdentity(),mode:'pause',selector:{kind:'primary-a2a'}};return signCoordinator(Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify(meta)+'\n'),{action:'stop',delivery_id:id,key_id:'coord',recipient:'fixture-agent',ledger_uuid:l.protocolIdentity(),issued_at:issued,expires_at:issued+120000},coord.privateKey)};
 now=1150000;const expired=await receiver.handle(wire('expired-control'),{sourceKey:'expired'});assert.equal(expired.state,'denied');assert.equal(expired.reason,'expired');assert.equal(calls.length,0);assert.equal(resolutions,0);assert.equal(pause.state(session.header),null);
 const verified=verifyStopStatus(statuses.at(-1),{receivers:{'fixture-status':'fixture-agent'},keys:{'fixture-status':status.publicKey.export({type:'spki',format:'pem'})},recipient:'coord-return',ledger:'reply-ledger',now});assert.equal(verified.verified,true);assert.equal(verified.status.delivered_at,1000000);assert.equal(verified.status.processed_at,1150000);assert.equal(verified.status.control_issued_at,1000000);assert.equal(verified.status.control_expires_at,1120000);
 now=1000000;for(let n=0;n<5;n++)await receiver.handle(Buffer.from('[a2a-envelope version=2]\n{"kind":"task-stop/1"}\n'),{sourceKey:'unsigned-'+n});assert.equal(alerts.length,1);assert.equal(statuses.length,1,'unsigned controls never receive a response');assert.equal(calls.length,0);
 const noTargetRaw=wire('target-refused');const resolver=receiver.resolveTarget;receiver.resolveTarget=()=>null;assert.equal((await receiver.handle(noTargetRaw,{sourceKey:'refused-first'})).reason,'target_none');receiver.resolveTarget=resolver;await receiver.handle(noTargetRaw,{sourceKey:'refused-replay'});assert.equal(calls.length,0,'a closed denied control cannot acquire a target on replay');
 // B-N-1596: target_none names its cause in the signed status.
 const statusKeys={'fixture-status':status.publicKey.export({type:'spki',format:'pem'})},header=over=>({...agent,session:{...session,header:{...session.header,...over}}});
 for(const [n,res,cause] of [['none',null,'no_live_agent'],['held',{none:'holds_session'},'holds_session'],['created',{none:'session_created'},'session_created'],['sub',header({origin:'subagent'}),'subagent'],['cwd',header({cwd:'/other-cwd'}),'cwd']]){
  receiver.resolveTarget=async()=>res;const r=await receiver.handle(wire('cause-'+n),{sourceKey:'cause-'+n});assert.equal(r.reason,'target_none');assert.equal(r.cause,cause);assert.equal(!!l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='owner_copy_disabled'").get(r.receipt_id),false,'copies stay on by default');
  const s=verifyStopStatus(statuses.at(-1),{receivers:{'fixture-status':'fixture-agent'},keys:statusKeys,recipient:'coord-return',ledger:'reply-ledger',now});assert.equal(s.status.reason,'target_none');assert.equal(s.status.target_cause,cause,'cause '+n);
 }
 // B-N-1595: one setting decides owner copies of stop receipts; the signed status still goes out.
 const disabled=id=>!!l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='owner_copy_disabled'").get(id);
 receiver.ownerCopies=()=>false;const before=statuses.length,off=await receiver.handle(wire('copies-off'),{sourceKey:'copies-off'});
 assert.equal(disabled(off.receipt_id),true,'mailStopOwnerCopies=false marks the stop receipt');assert.equal(statuses.length,before+2,'the signed statuses (received, denied) are not copies');
 receiver.ownerCopies=()=>true;const on=await receiver.handle(wire('copies-on'),{sourceKey:'copies-on'});assert.equal(disabled(on.receipt_id),false);
 receiver.ownerCopies=undefined;
 // B-N-1596 r2: an unknown outcome after this control's own pause names that pause (own_pause) in the signed status.
 const rs={id:'remote-session',header:{id:'remote-session',createdAt:20,cwd:'/fixture-cwd'},events:[{type:'turn/start',data:{turn:7}}],requestHeader:()=>({config:{provider:'claude-oauth',model:'fixture'}}),append(type,data){const e={seq:this.events.length,type,data};this.events.push(e);return e;}};
 const ra={session:rs,status:'running',inbox:{nextTurn:[],nextStep:[]},cancel(){},whenIdle:async()=>{}};
 receiver.resolveTarget=async()=>ra;const ru=await receiver.handle(wire('remote-unknown'),{sourceKey:'remote-unknown'});assert.equal(ru.state,'unknown');
 const rus=verifyStopStatus(statuses.at(-1),{receivers:{'fixture-status':'fixture-agent'},keys:statusKeys,recipient:'coord-return',ledger:'reply-ledger',now});assert.equal(rus.status.state,'unknown');assert.equal(rus.status.reason,'no_exact_sdk_lease');
 assert.equal(rus.status.own_pause,true,'unknown names its own pause');assert.equal(pause.state(rs.header)?.state,'paused');
 // B-N-1603 (А): the control expires while the resolver awaits (agentFor since 2.5.73) — refused before fence and pause, signed.
 const mk=id=>({session:{id,header:{id,createdAt:30,cwd:'/fixture-cwd'},events:[{type:'turn/start',data:{turn:2}}],requestHeader:()=>({config:{provider:'native',model:'fixture'}}),append(type,data){const e={seq:this.events.length,type,data};this.events.push(e);return e;}},status:'running',inbox:{nextTurn:[],nextStep:[]},cancel(){},whenIdle:async()=>{}});
 const ea=mk('expiry-session');receiver.resolveTarget=async()=>{now=1120001;return ea};const ex=await receiver.handle(wire('expiry-during-resolve'),{sourceKey:'expiry-during-resolve'});
 const exr=l.db.prepare('SELECT state FROM mail_stop_controls WHERE control_id=?').get('expiry-during-resolve'),exs=verifyStopStatus(statuses.at(-1),{receivers:{'fixture-status':'fixture-agent'},keys:statusKeys,recipient:'coord-return',ledger:'reply-ledger',now});
 assert.equal(exr?.state,undefined,'an expired control leaves no fence row (base: admitted forever)');assert.equal(pause.state(ea.session.header),null,'no pause left behind');
 assert.equal(ex.state,'denied');assert.equal(exs.status.state+'/'+exs.status.reason,'denied/expired','the refusal is signed');now=1000000;
 // B-N-1603 (Б): fault injection — beginDispatch refused for any other reason: the row becomes unknown (snyat takes it), signed unknown names own pause.
 const da=mk('dispatch-session'),bd=receiver.store.beginDispatch;receiver.store.beginDispatch=()=>false;receiver.resolveTarget=async()=>da;
 const dr=await receiver.handle(wire('dispatch-refused'),{sourceKey:'dispatch-refused'});receiver.store.beginDispatch=bd;
 const drr=l.db.prepare('SELECT state,reason FROM mail_stop_controls WHERE control_id=?').get('dispatch-refused'),drs=verifyStopStatus(statuses.at(-1),{receivers:{'fixture-status':'fixture-agent'},keys:statusKeys,recipient:'coord-return',ledger:'reply-ledger',now});
 assert.equal(dr.state,'unknown');assert.equal(drr?.state+'/'+drr?.reason,'unknown/dispatch_not_started','refused dispatch is unknown, not admitted');
 assert.equal(drs.status.state+'/'+drs.status.reason,'unknown/dispatch_not_started','refused dispatch is signed');assert.equal(drs.status.own_pause,true);assert.equal(pause.state(da.session.header)?.state,'paused');
 receiver.resolveTarget=resolver;assert.equal(calls.length,0,'refused causes have no effect');
 const raw=wire('allowed-control');const stopped=await receiver.handle(raw,{sourceKey:'allowed'});assert.equal(stopped.state,'paused');assert.equal(calls.length,1);assert.deepEqual(calls[0],[{kind:'user'},{keepInbox:true}]);assert.equal(pause.state(session.header).state,'paused');assert.equal(agent.inbox.nextTurn.length,1);
 await receiver.handle(raw,{sourceKey:'duplicate'});assert.equal(calls.length,1,'duplicate control cannot interrupt twice');
 assert.equal(await receiver.handle(Buffer.from('ordinary unsigned mail'),{sourceKey:'ordinary'}),null);
 assert.equal(receiver.ingest(Buffer.from('ordinary unsigned mail'),{sourceKey:'ordinary'}),false);
 const deniedFile=path.join(root,'unsigned.txt');fs.writeFileSync(deniedFile,'[a2a-envelope version=2]\n{"kind":"task-stop/1"}\n');assert.equal(receiver.ingest(fs.readFileSync(deniedFile),{sourceKey:'inbox-file',sourcePath:deniedFile}),true);await Promise.all(receiver.jobs.values());assert.equal(fs.existsSync(deniedFile),false,'completed refused control must leave the mailbox through the receipt archive');
 console.log('PASS receiver: target_none causes, owner-copy setting, unknown names own pause, expiry during resolve, refused dispatch, signed expired status T/delay, no effects on rejection, unsigned threshold, one native stop, keepInbox and duplicate');
}finally{l?.close();fs.rmSync(root,{recursive:true,force:true})}
