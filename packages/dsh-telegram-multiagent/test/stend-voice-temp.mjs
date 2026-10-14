// B-N-1691: real transcribeVoice + Telegram downloader; fake network and recognizer, no guest audio.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {TelegramClient} from '../src/client.js';import {extractFunction} from './extract.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-temp-probe-')),workspace=path.join(root,'workspace'),baseDirectory=path.join(root,'temp');fs.mkdirSync(workspace);fs.mkdirSync(baseDirectory);
const modulePath=process.env.STEND_VOICE_MODULE||path.resolve(new URL('../src/voice-temp.js',import.meta.url).pathname);const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const created=[],logs=[],nativeFetch=globalThis.fetch,oldMode=process.env.VOICE_TEST_MODE;
let store;
if(fs.existsSync(modulePath)){const {VoiceTempStore}=await import(pathToFileURL(modulePath));store=new VoiceTempStore({workspace,baseDirectory,log:x=>logs.push(x)});}
else store={prepare(){throw Error('voice store absent in baseline');},release(){},sweep(){}};
const command=path.join(root,'recognizer');fs.writeFileSync(command,`#!/usr/bin/env node\nconst fs=require('node:fs'),path=require('node:path'); if(process.env.TMPDIR!==path.dirname(process.argv[2]))process.exit(9); fs.writeFileSync(path.join(process.env.TMPDIR,'normalized.wav'),'SYNTHETIC',{mode:0o600});\nif(process.env.VOICE_TEST_MODE==='guest' && process.env.VOICE_ARCHIVE_DISABLE!=='1')process.exit(9); if(process.env.VOICE_TEST_MODE==='empty')process.exit(0);else if(process.env.VOICE_TEST_MODE==='fail')process.exit(3);else if(process.env.VOICE_TEST_MODE==='wait')setTimeout(()=>console.log('fixture transcript'),2000);else console.log('fixture transcript');\n`,{mode:0o755});
const tg=new TelegramClient('fixture-token',()=>{});tg.call=async(_name,args)=>{if(args.file_id==='slow-download')await new Promise(r=>setTimeout(r,150));if(args.file_id==='download-fails')throw Error('synthetic download failure');return {file_path:'voice.oga'};};
globalThis.fetch=async()=>new Response(Buffer.from('OggS SYNTHETIC fixture bytes'),{status:200});
const nativeDownload=tg.downloadFile.bind(tg);tg.downloadFile=async(...a)=>{const file=await nativeDownload(...a);const dir=path.dirname(file);created.push({file,dir,conversation:path.dirname(dir),fileMode:fs.statSync(file).mode&0o777,dirMode:fs.statSync(dir).mode&0o777});return file;};
const config={workspace,transcribeCommand:command,transcribeTimeoutMs:1000};const context=vm.createContext({config,tg,voiceTemp:store,fs,path,os,spawn,process,log:x=>logs.push(x),setTimeout,clearTimeout});
context.downloadTelegramFile=vm.runInContext('('+extractFunction(source,'downloadTelegramFile')+')',context);const transcribe=vm.runInContext('('+extractFunction(source,'transcribeVoice')+')',context);
try{
 process.env.VOICE_TEST_MODE='ok';assert.equal(await transcribe('one',1,'100'),'fixture transcript');assert.equal(await transcribe('two',1,'200'),'fixture transcript');
 assert.notEqual(created[0].conversation,created[1].conversation,'different conversations share a directory');
 for(const x of created){assert.equal(x.fileMode,0o600);assert.equal(x.dirMode,0o700);assert(!x.file.startsWith(workspace+path.sep));assert(!fs.existsSync(x.file),'voice file left: '+x.file);assert(!fs.existsSync(x.conversation),'empty conversation directory left');}
 console.log('PASS two conversations separated, modes0600/0700, outside workspace, immediate cleanup');
 const before=created.length;assert.deepEqual(await Promise.all([transcribe('fast',1,'300'),transcribe('slow-download',1,'300')]),['fixture transcript','fixture transcript']);const same=created.slice(before);assert.equal(same[0].conversation,same[1].conversation);assert.notEqual(same[0].dir,same[1].dir);assert(!fs.existsSync(same[0].conversation));console.log('PASS same conversation concurrent preparation is not removed by earlier completion');
 for(const [mode,id] of [['empty','empty-output'],['fail','child-fails'],['wait','timeout'],['ok','download-fails']]){process.env.VOICE_TEST_MODE=mode;config.transcribeTimeoutMs=mode==='wait'?40:1000;assert.equal(await transcribe(id,1,'400'),null);for(const x of created)assert(!fs.existsSync(x.file));if(store.root)assert.equal(fs.readdirSync(store.root).length,0);console.log('PASS cleanup '+id);}
 process.env.VOICE_TEST_MODE='guest';config.transcribeTimeoutMs=1000;assert.equal(await transcribe('guest',1,'guest-chat',true),'fixture transcript');assert.equal(fs.readdirSync(store.root).length,0);console.log('PASS actual spawn receives explicit guest archive disable');
 const savedCommand=config.transcribeCommand;config.transcribeCommand=null;assert.equal(await transcribe('unconfigured',1,'450'),null);assert.equal(fs.readdirSync(store.root).length,0);config.transcribeCommand=savedCommand;console.log('PASS cleanup unconfigured recognizer');
 process.env.VOICE_TEST_MODE='ok';config.transcribeTimeoutMs=1000;assert.equal(await transcribe('restored',1,'500'),'fixture transcript');assert.equal(fs.readdirSync(store.root).length,0);assert(logs.some(x=>x.includes('предел исчерпан')));console.log('PASS restored success after failures');
 console.log(JSON.stringify({paths:created,logs,cleanup:true}));
}finally{
 globalThis.fetch=nativeFetch;if(oldMode===undefined)delete process.env.VOICE_TEST_MODE;else process.env.VOICE_TEST_MODE=oldMode;
 for(const x of created)if(fs.existsSync(x.file))fs.unlinkSync(x.file);
 fs.rmSync(root,{recursive:true,force:true});
}
