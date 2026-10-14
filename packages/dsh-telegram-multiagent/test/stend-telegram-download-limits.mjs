// RU: Настоящие HTTP-ответы локального сервера проверяют размер и таймаут; Telegram и секреты не используются.
// EN: Real local HTTP responses verify size and timeout; Telegram and secrets are not used.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TelegramClient} from '../src/client.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'download-limits-'));
let mode='small'; const nativeFetch=globalThis.fetch;
const server=http.createServer((req,res)=>{
  console.log('HTTP fixture: '+mode);
  if(mode==='exact'){res.end('abcdefgh');return;}
  if(mode==='stall') return;
  if(mode==='body-stall'){res.writeHead(200);res.write('a');return;}
  if(mode==='oversize-header'){res.writeHead(200,{'Content-Length':'100'});res.end('x'.repeat(100));return;}
  if(mode==='oversize-stream'){res.writeHead(200);res.write('abcdefgh');setTimeout(()=>res.end('ijk'),20);return;}
  res.end('abc');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const client=new TelegramClient('fixture-token',()=>{});
client.call=async()=>({file_path:'audio.oga'});
globalThis.fetch=(_url,options)=>nativeFetch(`http://127.0.0.1:${server.address().port}/file`,options);
const options={timeoutMs:500,maxBytes:8,directory:root};
const healthy=async(expected='abc')=>{const file=await client.downloadFile('fixture',options);assert.equal(fs.readFileSync(file,'utf8'),expected);assert.equal(fs.statSync(file).mode&0o777,0o600);fs.unlinkSync(file);};
try {
  assert.equal(typeof client.downloadFile,'function');
  await healthy();mode='exact';await healthy('abcdefgh');mode='small';
  for(const bad of ['oversize-header','oversize-stream','stall','body-stall']){
    mode=bad; await assert.rejects(client.downloadFile('fixture',options),/limit|timeout/i);
    assert.deepEqual(fs.readdirSync(root),[]);
    mode='small'; await healthy();
  }
  client.call=async()=>new Promise(()=>{});
  await assert.rejects(client.downloadFile('fixture',options),/timeout/i);
  assert.deepEqual(fs.readdirSync(root),[]);
  console.log('PASS bounded success → size/headers/body/metadata timeout → recovery; no partial files');
} finally {globalThis.fetch=nativeFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
