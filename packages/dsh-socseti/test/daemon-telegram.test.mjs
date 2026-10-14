import './approval-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const until=async f=>{for(let i=0;i<150;i++){if(await f())return;await new Promise(r=>setTimeout(r,20))}throw Error('test condition timeout')};
test('separate daemon: MCP draft, HTTP card, callback, publication, restart without duplicate',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socseti-daemon-'));const messages=[],offsets=[];let updates=[],child,client;let stdout='',stderr='';
 const api=http.createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const args=JSON.parse(raw||'{}'),method=req.url.split('/').at(-1);let result;
  if(method==='getMe')result={id:77,is_bot:true,username:'ostrov_smm_bot'};
  else if(method==='getWebhookInfo')result={url:''};
  else if(method==='getChat')result={id:Number(args.chat_id),type:Number(args.chat_id)===-101?'supergroup':'channel'};
  else if(method==='getChatMember')result={status:'administrator',can_post_messages:true};
  else if(method==='getUpdates'){offsets.push(args.offset);result=updates.filter(u=>u.update_id>=args.offset)}
  else if(method==='answerCallbackQuery')result=true;
  else if(method==='sendMessage'){result={message_id:messages.length+1,date:1,chat:{id:Number(args.chat_id)},from:{id:77,is_bot:true},text:args.text,...(args.reply_markup?{reply_markup:args.reply_markup}:{})};messages.push(result)}
  else{res.writeHead(400).end(JSON.stringify({ok:false,error_code:400}));return}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,result}));
 });await new Promise(r=>api.listen(0,'127.0.0.1',r));
 t.after(async()=>{await client?.close();if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit')}api.closeAllConnections();await new Promise(r=>api.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 const listener=http.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const keyFiles={varvara:path.join(dir,'v'),monitor:path.join(dir,'m')};for(const [role,file] of Object.entries(keyFiles))fs.writeFileSync(file,(role==='varvara'?'a':'b').repeat(64),{mode:0o600});
 const tokenFile=path.join(dir,'bot');fs.writeFileSync(tokenFile,'123456789:synthetic_abcdefghijklmnopqrstuvwxyz',{mode:0o600});
 const config={port,stateDir:path.join(dir,'state'),keyFiles,targets:{telegram:'-202',vk:'1',instagram:'2',threads:'3'},telegram:{enabled:true,tokenFile,approvalChatId:-101}};
 const file=path.join(dir,'config.json');fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});
 const preload=path.join(dir,'preload.mjs');fs.writeFileSync(preload,`const real=globalThis.fetch;globalThis.fetch=(url,opts)=>{const u=new URL(url);if(u.hostname!=='api.telegram.org')throw Error('test unexpected target');return real('http://127.0.0.1:${api.address().port}'+u.pathname,opts)};`);
 async function start(){stdout='';stderr='';child=spawn(process.execPath,['--import',preload,'src/main.mjs',file],{cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);await until(()=>stdout.includes('"publishing":true')||child.exitCode!==null);assert.equal(child.exitCode,null,stderr)}
 await start();client=new Client({name:'daemon-test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`),{requestInit:{headers:{Authorization:'Bearer '+'a'.repeat(64)}}}));
 const made=await client.callTool({name:'draft_post',arguments:{request_id:'daemon-0001',platform:'telegram',text:'Проверка полного пути 🌊'}});assert.notEqual(made.isError,true);
 await until(()=>messages.some(m=>m.chat.id===-101));const card=messages.find(m=>m.chat.id===-101);
 updates=[{update_id:10,callback_query:{id:'cb-10',from:{id:934567891,is_bot:false},message:card,data:card.reply_markup.inline_keyboard[0][0].callback_data}}];
 await until(()=>messages.some(m=>m.chat.id===-202));assert.equal(messages.filter(m=>m.chat.id===-202).length,1);assert.equal(messages.find(m=>m.chat.id===-202).text,'Проверка полного пути 🌊');
 await client.close();client=null;child.kill('SIGTERM');await once(child,'exit');await start();await until(()=>offsets.at(-1)===11);await new Promise(r=>setTimeout(r,150));assert.equal(messages.filter(m=>m.chat.id===-202).length,1);assert.ok(!stdout.includes('synthetic')&&!stderr.includes('synthetic'));
});
