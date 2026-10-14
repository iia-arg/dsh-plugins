#!/usr/bin/env node
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {protectedBytes} from './mail-stop-settings.js';import {signCoordinator} from './coordinator-signature.js';
const name=x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(x);
const quote=x=>"'"+String(x).replaceAll("'","'\\''")+"'";
export function prepareSignedStop(configFile,recipient,mode,body,{now=Date.now()}={}){
 const config=JSON.parse(protectedBytes(configFile));
 const fields=['key_file','key_id','modes','recipients','version',...(Object.hasOwn(config,'transport')?['transport']:[]),...(Object.hasOwn(config,'host')?['host']:[])].sort().join(',');
 if(Object.keys(config).sort().join(',')!==fields||config.version!==1||!['ssh','local'].includes(config.transport??'ssh')||Object.hasOwn(config,'host')&&(typeof config.host!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/.test(config.host))||typeof config.key_id!=='string'||!/^[a-zA-Z0-9:_-]{1,128}$/.test(config.key_id))throw Error('sender_config_untrusted');
 if(!name(recipient)||!Object.hasOwn(config.recipients??{},recipient))throw Error('sender_recipient_unknown');
 if(!['pause','replace','new'].includes(mode)||!Array.isArray(config.modes)||!config.modes.includes(mode))throw Error('sender_mode_denied');
 if(typeof body!=='string'||Buffer.byteLength(body)>60000||mode==='pause'&&body!==''||mode==='replace'&&!body.trim())throw Error('sender_body_invalid');
 const route=config.recipients[recipient];
 if(Object.keys(route).sort().join(',')!=='directory,ledger_uuid'||typeof route.ledger_uuid!=='string'||!/^[a-zA-Z0-9:_-]{1,128}$/.test(route.ledger_uuid)||typeof route.directory!=='string'||!path.isAbsolute(route.directory)||path.normalize(route.directory)!==route.directory||path.basename(route.directory)!=='in'||/[\r\n]/.test(route.directory))throw Error('sender_recipient_untrusted');
 const key=crypto.createPrivateKey(protectedBytes(config.key_file,true));if(key.asymmetricKeyType!=='ed25519')throw Error('sender_config_untrusted');
 const control_id=crypto.randomUUID(),meta={kind:'task-stop/1',delivery_id:control_id,recipient,ledger_uuid:route.ledger_uuid,mode,selector:{kind:'primary-a2a'}};
 const wire=signCoordinator(Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify(meta)+'\n'+body),{action:'stop',delivery_id:control_id,key_id:config.key_id,recipient,ledger_uuid:route.ledger_uuid,issued_at:now,expires_at:now+120000},key);
 return{control_id,wire,wire_sha:crypto.createHash('sha256').update(wire).digest('hex'),recipient,mode,directory:route.directory,transport:config.transport??'ssh',host:config.host??'sadik'};
}
async function main(){
 const args=process.argv.slice(2),opts={};
 for(let i=0;i<args.length;i+=2){const k=args[i];if(!['--recipient','--mode','--body-file'].includes(k)||Object.hasOwn(opts,k)||typeof args[i+1]!=='string'||args[i+1].startsWith('--'))throw Error('unknown_or_incomplete_argument');opts[k]=args[i+1];}
 if(!opts['--recipient']||!opts['--mode']||opts['--mode']==='pause'&&Object.hasOwn(opts,'--body-file')||opts['--mode']==='replace'&&!Object.hasOwn(opts,'--body-file'))throw Error('unknown_or_incomplete_argument');
 let body='';if(opts['--body-file']){const file=opts['--body-file'],st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>60000)throw Error('sender_body_invalid');const b=fs.readFileSync(file);body=b.toString('utf8');if(!b.equals(Buffer.from(body)))throw Error('sender_body_invalid');}
 const made=prepareSignedStop(process.env.DSH_MAIL_STOP_CONFIG||'/etc/dsh-mail-stop/sender.json',opts['--recipient'],opts['--mode'],body);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'signed-stop-')),local=path.join(tmp,'control.txt'),remote='/tmp/signed-stop-'+made.control_id+'.txt',target=made.directory+'/stop-'+made.control_id+'.txt';
 fs.writeFileSync(local,made.wire,{mode:0o600});
 try{
  let result;
  if(made.transport==='local'){
   fs.writeFileSync(remote,made.wire,{flag:'wx',mode:0o600});
   result=execFileSync('python3',[fileURLToPath(new URL('./publish-mail-stop.py',import.meta.url)),made.directory,remote,path.basename(target),made.wire_sha],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000});
  }else{
   execFileSync('scp',['-q','-o','ConnectTimeout=10',local,made.host+':'+remote],{stdio:['ignore','ignore','pipe'],timeout:15000});
  const publisher=fs.readFileSync(new URL('./publish-mail-stop.py',import.meta.url));
  const command='sudo -n python3 - '+[made.directory,remote,path.basename(target),made.wire_sha].map(quote).join(' ');
   result=execFileSync('ssh',['-o','ConnectTimeout=10',made.host,command],{input:publisher,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000});
  }
  if(!result.split('\n').includes('положено: '+target))throw Error('publication_unconfirmed');
  console.log(JSON.stringify({stage:'placed',machine:made.transport==='local'?os.hostname():made.host,path:target,control_id:made.control_id,wire_sha:made.wire_sha,recipient:made.recipient,mode:made.mode,execution:'unconfirmed'}));
 }catch{console.error('ОТКАЗ/UNKNOWN передачи control '+made.control_id+'; автоматического повтора нет');process.exitCode=3;}
 finally{fs.rmSync(tmp,{recursive:true,force:true});if(made.transport==='local')try{fs.unlinkSync(remote)}catch{}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{const reason=error.code??(/^[a-z][a-z0-9_]{0,63}$/.test(error.message??'')?error.message:'sender_unavailable');console.error('ОТКАЗ stop sender: '+reason);process.exitCode=2});
