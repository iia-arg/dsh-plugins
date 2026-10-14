// RU: Изолированный стенд stend-outgoing-files.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-outgoing-files.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {MessageReceipts} from '../src/message-receipts.js';
import {ConversationSessions} from '../src/conversation-sessions.js';
import {TelegramClient} from '../src/client.js';
const candidate = await import('../src/outgoing-files.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
assert.equal(typeof candidate.fileTool,'function','channel file tool must be implemented');
const {fileTool}=candidate;
const root=await fs.mkdtemp(path.join(os.tmpdir(),'tg-outgoing-'));
const workspace=path.join(root,'workspace');await fs.mkdir(workspace);
const ledger=new MessageReceipts(path.join(workspace,'.message-receipts'));
const conversations=new ConversationSessions(ledger);
const header={id:'telegram-a2a',createdAt:1,cwd:workspace};
const session={id:header.id,header};
const agent={session};
conversations.pin('a2a',header);
const receipt=ledger.receive('fixture',JSON.stringify({message:{text:'file',chat:{id:123},from:{id:1}}}));
ledger.db.prepare("UPDATE receipts SET route='tg',route_key='123',session_id=?,session_created=1,dsh_id='m1',claimed_turn=1,finished_at=NULL WHERE id=?").run(header.id,receipt.id);
const boundary={openTurnStartSeq:1,lastTurn:1};
const rows=[];let responseMode='ok',pendingResponse;
const server=http.createServer(async(req,res)=>{
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const request=new Request('http://localhost/',{method:'POST',headers:req.headers,body:Buffer.concat(chunks)});
 const form=await request.formData();const media=form.get('document')??form.get('photo');
 rows.push({method:req.url,chat:form.get('chat_id'),caption:form.get('caption'),file:media?.name,bytes:media?Buffer.from(await media.arrayBuffer()):null,parse:form.get('parse_mode')});
 if(responseMode==='stall'){pendingResponse=res;return;}
 if(responseMode==='disconnect'){req.socket.destroy();return;}
 if(responseMode==='redirect'){res.writeHead(302,{Location:'http://127.0.0.1:1/'});res.end();return;}
 res.setHeader('Content-Type','application/json');
 if(responseMode==='bad'){res.end(JSON.stringify({ok:false,error_code:400,description:'DO_NOT_ECHO_TOKEN'}));return;}
 res.end(JSON.stringify({ok:true,result:{message_id:71,chat:{id:responseMode==='wrongchat'?999:123},document:{file_id:'fake'},photo:[{file_id:'fake'}]}}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const realFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{assert.match(url,/^https:\/\/api.telegram.org\/botSYNTHETIC\/send(Document|Photo)$/);return realFetch(`http://127.0.0.1:${server.address().port}/${url.split('/').at(-1)}`,options);};
const tg=new TelegramClient('SYNTHETIC');
const ctx={get:name=>name==='sessionProjections'?{stateOf:()=>boundary}:undefined};
const tool=fileTool({ctx,workspace,receipts:ledger,conversations,telegram:tg});
const exec={agent,signal:new AbortController().signal};
let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
async function refused(args,rx=/ОТКАЗ/){const before=rows.length;await assert.rejects(tool.execute(args,exec),rx);assert.equal(rows.length,before,'no upload on refusal');}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6aAAAAABJRU5ErkJggg==','base64');
try{
 await fs.writeFile(path.join(workspace,'hello.txt'),'Документ 🌲');await fs.writeFile(path.join(workspace,'photo.png'),png);
 await check('document multipart bytes/caption/current chat',async()=>{const value=await tool.execute({path:'hello.txt',caption:'Подпись 🌲'},exec);assert.equal(value.message_id,71);assert.deepEqual(rows.at(-1),{method:'/sendDocument',chat:'123',caption:'Подпись 🌲',file:'hello.txt',bytes:Buffer.from('Документ 🌲'),parse:null});});
 await check('photo uses sendPhoto and exact bytes',async()=>{await tool.execute({path:'photo.png',mode:'photo'},exec);assert.equal(rows.at(-1).method,'/sendPhoto');assert.deepEqual(rows.at(-1).bytes,png);});
 await check('foreign absolute path',async()=>{await fs.writeFile(path.join(root,'outside.txt'),'outside');await refused({path:path.join(root,'outside.txt')});});
 await check('parent traversal',()=>refused({path:'../outside.txt'}));
 await check('prefix sibling workspace',async()=>{await fs.mkdir(workspace+'-other');await fs.writeFile(path.join(workspace+'-other','file.txt'),'other');await refused({path:path.join(workspace+'-other','file.txt')});});
 await check('outside symlink',async()=>{await fs.symlink(path.join(root,'outside.txt'),path.join(workspace,'link.txt'));await refused({path:'link.txt'});});
 await check('directory symlink',async()=>{await fs.symlink(root,path.join(workspace,'linkdir'));await refused({path:'linkdir/outside.txt'});});
 await check('hardlink refused',async()=>{await fs.link(path.join(root,'outside.txt'),path.join(workspace,'hard.txt'));await refused({path:'hard.txt'});});
 await check('size limit 50 MB plus one',async()=>{const f=await fs.open(path.join(workspace,'big.pdf'),'w');await f.write('%PDF-1.7\n');await f.truncate(50_000_001);await f.close();await refused({path:'big.pdf'});});
 await check('photo limit 10 MB plus one',async()=>{const f=await fs.open(path.join(workspace,'big.png'),'w');await f.write(png);await f.truncate(10_000_001);await f.close();await refused({path:'big.png',mode:'photo'});});
 await check('unknown type',async()=>{await fs.writeFile(path.join(workspace,'file.exe'),'MZ');await refused({path:'file.exe'});});
 await check('extension does not hide wrong image signature',async()=>{await fs.writeFile(path.join(workspace,'fake.png'),'text');await refused({path:'fake.png',mode:'photo'});});
 await check('caption Unicode over limit',()=>refused({path:'hello.txt',caption:'🌲'.repeat(1025)}));
 await check('target argument forbidden',()=>refused({path:'hello.txt',chat_id:'999'}));
 await check('A2A receipt cannot send',async()=>{ledger.db.prepare("UPDATE receipts SET route='a2a' WHERE id=?").run(receipt.id);await refused({path:'hello.txt'});ledger.db.prepare("UPDATE receipts SET route='tg' WHERE id=?").run(receipt.id);});
 await check('mixed chats in one turn refused',async()=>{const other=ledger.receive('other-chat','other',{route:'tg',routeKey:'999',hold:false});ledger.db.prepare("UPDATE receipts SET session_id=?,session_created=1,dsh_id='m2',claimed_turn=1 WHERE id=?").run(header.id,other.id);await refused({path:'hello.txt'});ledger.db.prepare('UPDATE receipts SET finished_at=1 WHERE id=?').run(other.id);});
 await check('blocked receipt refused',async()=>{ledger.db.prepare("UPDATE receipts SET blocked='test' WHERE id=?").run(receipt.id);await refused({path:'hello.txt'});ledger.db.prepare('UPDATE receipts SET blocked=NULL WHERE id=?').run(receipt.id);});
 await check('route rechecked after reading',async()=>{const original=ledger.managed;let calls=0;ledger.managed=function(...args){if(++calls===2)ledger.db.prepare("UPDATE receipts SET route_key='999' WHERE id=?").run(receipt.id);return original.apply(this,args);};try{await refused({path:'hello.txt'});}finally{ledger.managed=original;ledger.db.prepare("UPDATE receipts SET route_key='123' WHERE id=?").run(receipt.id);}});
 await check('wrong generation',async()=>{header.createdAt=2;await refused({path:'hello.txt'});header.createdAt=1;});
 await check('no open turn',async()=>{boundary.openTurnStartSeq=null;await refused({path:'hello.txt'});boundary.openTurnStartSeq=1;});
 await check('unknown turn boundary denied',async()=>{boundary.openTurnStartSeq=undefined;await refused({path:'hello.txt'});boundary.openTurnStartSeq=1;});
 await check('wrong turn',async()=>{boundary.lastTurn=2;await refused({path:'hello.txt'});boundary.lastTurn=1;});
 await check('subagent denied',async()=>{header.origin='subagent';await refused({path:'hello.txt'});delete header.origin;});
 await check('wrong cwd',async()=>{header.cwd=root;await refused({path:'hello.txt'});header.cwd=workspace;});
 await check('aborted before upload',async()=>{const old=exec.signal;exec.signal=AbortSignal.abort();await refused({path:'hello.txt'});exec.signal=old;});
 await check('API rejection clean no retry',async()=>{responseMode='bad';const n=rows.length;await assert.rejects(tool.execute({path:'hello.txt'},exec),e=>!e.message.includes('DO_NOT_ECHO_TOKEN')&&/400/.test(e.message));assert.equal(rows.length,n+1);responseMode='ok';});
 await check('disconnect uncertain no retry',async()=>{responseMode='disconnect';const n=rows.length;await assert.rejects(tool.execute({path:'hello.txt'},exec),/неизвестен/);assert.equal(rows.length,n+1);responseMode='ok';});
 await check('redirect denied no retry',async()=>{responseMode='redirect';const n=rows.length;await assert.rejects(tool.execute({path:'hello.txt'},exec));assert.equal(rows.length,n+1);responseMode='ok';});
 await check('wrong chat in response not success',async()=>{responseMode='wrongchat';await assert.rejects(tool.execute({path:'hello.txt'},exec));responseMode='ok';});
 await check('one upload at a time and recovery',async()=>{responseMode='stall';const n=rows.length;const first=tool.execute({path:'hello.txt'},exec);for(let i=0;i<200&&rows.length===n;i++)await new Promise(r=>setTimeout(r,5));assert.equal(rows.length,n+1);await refused({path:'hello.txt'});pendingResponse.end(JSON.stringify({ok:true,result:{message_id:71,chat:{id:123}}}));await first;responseMode='ok';});
 await check('HTTP deadline aborts once',async()=>{responseMode='stall';const original=AbortSignal.timeout;const deadlines=[];AbortSignal.timeout=ms=>{deadlines.push(ms);return original(25);};const n=rows.length;try{await assert.rejects(tool.execute({path:'hello.txt'},exec),/неизвестен/);assert.deepEqual(deadlines,[60000]);assert.equal(rows.length,n+1);}finally{AbortSignal.timeout=original;responseMode='ok';}});
 await check('return to healthy',async()=>{const result=await tool.execute({path:'hello.txt'},exec);assert.equal(result.message_id,71);});
 console.log(`RESULT ${checks}/${checks}`);
}finally{globalThis.fetch=realFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));ledger.close();await fs.rm(root,{recursive:true,force:true});}
