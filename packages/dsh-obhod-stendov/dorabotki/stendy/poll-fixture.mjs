// B-N-1599: builds a channel ledger through the REAL pollReceiptDirectory of the telegram package (sliced from src/index.js as
// test/stend-coordinator-poll.mjs does), with a real coordinator signature check and the real ReceiptRuntime for task-control.
// Env: TG — package root; LEDGER — ledger directory to create. Prints {case:{id,outcome,blocked,finished}} as JSON.
import fs from 'node:fs';import path from 'node:path';import {generateKeyPairSync} from 'node:crypto';
const TG=process.env.TG,LEDGER=process.env.LEDGER;
const {MessageReceipts,mailEnvelope}=await import(TG+'/src/message-receipts.js');
const {signCoordinator,verifyCoordinator}=await import(TG+'/src/coordinator-signature.js');
const {ReceiptRuntime}=await import(TG+'/src/receipt-runtime.js');
const source=fs.readFileSync(TG+'/src/index.js','utf8');
const start=source.indexOf('  async function pollReceiptDirectory('),end=source.indexOf('  async function pollSpool()',start);
if(start<0||end<0)throw Error('pollReceiptDirectory not found');
const code=source.slice(start,source.lastIndexOf('\n  }',end)+5).trim();
const keys=generateKeyPairSync('ed25519'),stranger=generateKeyPairSync('ed25519');
const trust={version:1,status:'approved',maxLifetimeMs:240000,clockSkewMs:30000,keys:{coordinator:keys.publicKey.export({type:'spki',format:'pem'})}};
const receipts=new MessageReceipts(LEDGER);
receipts.coordinator=(raw,receiver)=>verifyCoordinator(raw,{db:receipts.db,trust,recipient:receiver,ledger:receipts.protocolIdentity(),now:receipts.now()});
const runtime=new ReceiptRuntime(receipts,{flush:async()=>true},()=>{});
const asked=new Set(),logs=[];
const context={mailStops:{ingest:()=>false},fs,path,receipts,mailEnvelope,A2A_EXT:['.txt'],a2aReported:new Set(),who:'fixture',who_:'fixture',log:x=>logs.push(x),
 splitSender:t=>{const m=/^From: ([^\n]+)\n/.exec(t);return m?{sender:m[1],text:t.slice(m[0].length)}:{text:t};},spoolSender:()=>'unknown',
 agentFor:async()=>({handle:{agent:null},sessionId:'s'}),A2A_CHAT:'a2a',SPOOL_IN:'/var/spool/example-bus/fixture',spoolAgeHours:()=>0,SPOOL_STALE_HOURS:12,
 stripMark:s=>s,lastOrigin:new Map(),copyAsk:(_o,_w,_b,r)=>asked.add(r.id),
 receiptRuntime:()=>({acceptTaskControl:(...a)=>runtime.acceptTaskControl(...a),cancelPending:async()=>({action:'text',text:'after cancel'}),enqueue:async()=>{}}),
 goalA2ASenders:new Set(),goalCommand:async()=>'ok',platform:{createUserMessage:x=>x}};
const poll=new Function(...Object.keys(context),'return ('+code+')')(...Object.values(context));
const now=receipts.now(),wrap=(payload,id,action,key=keys)=>signCoordinator(Buffer.from(payload),{key_id:'coordinator',recipient:'fixture',
 ledger_uuid:receipts.protocolIdentity(),delivery_id:id,action,issued_at:now,expires_at:now+240000},key.privateKey);
const env=(meta,body='')=>'[a2a-envelope version=2]\n'+JSON.stringify(meta)+'\n'+body;
const cases={
 'plain-question':'From: fixture\nОбычный вопрос',
 'signature-rejected':wrap('From: fixture\nподделка','forged-1','message',stranger),
 'task-control':wrap(env({kind:'task-control/1',op:'cancel',delivery_id:'cancel-1'},'STOP'),'cancel-1','cancel'),
 'capability-probe':env({kind:'capability_probe',delivery_id:'probe-1',recipient:{id:'fixture'},supersedes:{decision_id:'decision-1'}}),
 'empty-letter':'\n  \n',
 'signed-goal':wrap('/goal новая цель','goal-1','goal'),
 'invalid-utf8':Buffer.from([0x46,0x72,0xff,0xfe,0x0a]),
};
const input=path.join(path.dirname(LEDGER),'in');fs.mkdirSync(input,{recursive:true});const out={};
for(const [name,raw] of Object.entries(cases)){
 fs.writeFileSync(path.join(input,name+'.txt'),raw);await poll(input,'a2a');
 const row=receipts.db.prepare('SELECT r.* FROM receipts r JOIN sources s ON s.receipt_id=r.id WHERE s.path=? ORDER BY r.rowid DESC LIMIT 1').get(path.resolve(path.join(input,name+'.txt')));
 out[name]=row?{id:row.id,route:row.route,outcome:row.outcome,blocked:row.blocked,finished:row.finished_at!==null,copy_ask:asked.has(row.id)}:null;
}
receipts.close();console.log(JSON.stringify(out));
