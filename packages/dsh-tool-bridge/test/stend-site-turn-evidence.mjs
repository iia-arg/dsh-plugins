// Breaks: alien/closed turn, forged route or raw, mixed visitor/operator receipts accepted as a Site tool input.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const moduleUrl=process.env.SITE_TURN_MODULE||new URL('../src/ostrov-site-turn.js',import.meta.url);
assert(fs.existsSync(moduleUrl),'Site root/turn evidence reader is not implemented');
const {readSiteTurnEvidence}=await import(moduleUrl);
const channel=process.env.TELEGRAM_TEST_PLUGIN_ROOT;
if(!channel){console.error('СЛЕПОТА: нужен TELEGRAM_TEST_PLUGIN_ROOT');process.exit(2);}
const {MessageReceipts}=await import(path.join(channel,'src/message-receipts.js'));
const {ConversationSessions}=await import(path.join(channel,'src/conversation-sessions.js'));
const {SiteChannel}=await import(path.join(channel,'src/site-channel.js'));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'site-turn-proof-'));let ledger;
try{
 ledger=new MessageReceipts(path.join(work,'.message-receipts'));
 const conversations=new ConversationSessions(ledger);
 const agent={session:{id:'telegram-site-77',header:{id:'telegram-site-77',createdAt:700,cwd:work,origin:'root'}}};
 const boundary={openTurnStartSeq:1,lastTurn:4};let roots=[agent];
 const ctx={get:n=>({agents:{roots:()=>roots},taskControlCodex:{ledger},sessionProjections:{stateOf:()=>boundary}}[n])};
 // Real producer-facing parser and ledger writes; dispatch stands in for platform admission only.
 const spool=path.join(work,'spool');for(const n of ['vhod','kopii','vyhod'])fs.mkdirSync(path.join(spool,n),{recursive:true});
 const site=new SiteChannel({ledger,conversations,spool,state:path.join(work,'closed'),owner:()=>999,
  copies:{targets:()=>[{kind:'telegram',id:999}],captureSite(){}},dispatch:async(r)=>{
   conversations.pin('site-77',agent.session.header);
   ledger.prepare(r.id,{id:'dsh-'+r.id,content:[]},agent.session,'site-77');
   ledger.db.prepare('UPDATE receipts SET claimed_turn=4 WHERE id=?').run(r.id);
  },log:()=>{}});
 const x={v:1,id:'cw-77-91',conversation_id:77,message_id:91,text:'synthetic visitor input',received_at:1700000000};
 fs.writeFileSync(path.join(spool,'vhod','cw-77-91.json'),JSON.stringify(x));await site.poll();
 const row=ledger.db.prepare('SELECT * FROM receipts WHERE route=?').get('site');assert(row);
 const first=readSiteTurnEvidence(ctx,agent);assert.equal(first.conversationNumber,77);assert.equal(first.receiptId,row.id);assert.equal(first.turn,4);assert(!Object.hasOwn(first,'conversationId'),'numeric route is not a permanent CRM identity');
 let tested=0;
 const bad=(name,change,restore)=>{change();try{assert.throws(()=>readSiteTurnEvidence(ctx,agent),/ОТКАЗ Site/,name);}finally{restore();}assert.deepEqual(readSiteTurnEvidence(ctx,agent),first,name+' restored');tested++;console.log('PASS refusal and restoration: '+name);};
 bad('nonroot',()=>roots=[],()=>roots=[agent]);
 bad('subagent',()=>agent.session.header.origin='subagent',()=>agent.session.header.origin='root');
 bad('header ID',()=>agent.session.header.id='other',()=>agent.session.header.id=agent.session.id);
 bad('generation',()=>agent.session.header.createdAt=701,()=>agent.session.header.createdAt=700);
 bad('cwd',()=>agent.session.header.cwd='/tmp',()=>agent.session.header.cwd=work);
 bad('closed turn',()=>boundary.openTurnStartSeq=null,()=>boundary.openTurnStartSeq=1);
 bad('alien turn',()=>boundary.lastTurn=5,()=>boundary.lastTurn=4);
 const edit=(col,value,table='receipts')=>ledger.db.prepare(`UPDATE ${table} SET ${col}=? WHERE ${table==='receipts'?'id':'receipt_id'}=?`).run(value,row.id);
 for(const [col,value] of [['route','tg'],['route_key','site-88'],['sender','site:operator'],['blocked','hold'],['finished_at',123],['session_created',701],['claimed_turn',3],['raw',Buffer.from('{broken')]])bad(col,()=>edit(col,value),()=>edit(col,row[col]));
 for(const [col,value] of [['conversation_id',88],['delivery_id','other'],['kind','operator']]){const old=ledger.db.prepare('SELECT * FROM site_messages WHERE receipt_id=?').get(row.id)[col];bad('site_messages.'+col,()=>edit(col,value,'site_messages'),()=>edit(col,old,'site_messages'));}
 bad('well-formed forged raw',()=>edit('raw',Buffer.from(JSON.stringify({...x,conversation_id:88}))),()=>edit('raw',row.raw));
 const receipt=ledger.receive('mixed',JSON.stringify({note:'operator'}),{route:'a2a',routeKey:'site-77'});ledger.prepare(receipt.id,{id:'mixed-dsh',content:[]},agent.session,'site-77');ledger.db.prepare('UPDATE receipts SET claimed_turn=4 WHERE id=?').run(receipt.id);
 assert.throws(()=>readSiteTurnEvidence(ctx,agent),/ОТКАЗ Site/);ledger.db.prepare('UPDATE receipts SET finished_at=1 WHERE id=?').run(receipt.id);assert.deepEqual(readSiteTurnEvidence(ctx,agent),first);tested++;
 console.log('PASS current SiteChannel input; '+tested+' corruptions with restoration; no permanent CRM key invented');
}finally{ledger?.db.close();fs.rmSync(work,{recursive:true,force:true});}
