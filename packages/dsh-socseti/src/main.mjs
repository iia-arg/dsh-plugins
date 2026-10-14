import manifest from '../package.json' with {type:'json'};
import {loadConfig} from './config.mjs';
import {startServer} from './server.mjs';
import {startTelegramSubsystem} from './telegram-worker.mjs';
import {startMetaSubsystem} from './meta-receiver.mjs';
import {startVkSubsystem} from './vk-receiver.mjs';
import {startVkReplySubsystem} from './vk-reply-writer.mjs';
import {startVkPostSubsystem} from './vk-post-writer.mjs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
if(process.argv.length!==3||!path.isAbsolute(process.argv[2])){
 console.error('usage: node src/main.mjs /absolute/config.json');process.exitCode=2;
}else{
 let service,worker,vkWorker,vkPostWorker,vkReplyWorker,metaWorker;
 try{
  const config=loadConfig(process.argv[2]);service=await startServer(config);
  if(config.meta){metaWorker=startMetaSubsystem(service.store,config.meta)}
  if(config.telegram?.enabled){worker=await startTelegramSubsystem(service.store,config.telegram)}
  if(config.vk?.enabled){vkWorker=await startVkSubsystem(service.store,config.vk)}
  if(config.vk?.writer?.enabled){vkPostWorker=startVkPostSubsystem(service.store,{...config.vk.writer,apiVersion:config.vk.apiVersion})}
  if(config.vk?.writer?.replies?.enabled){vkReplyWorker=startVkReplySubsystem(service.store,{...config.vk.writer.replies,commentToken:config.vk.writer.token,groupToken:config.vk.groupToken,apiVersion:config.vk.apiVersion})}
  console.log(JSON.stringify({service:'socseti',version:manifest.version,stage:2,port:config.port,publishing:service.store.status().publishing,external_io:service.store.status().external_io,vk:service.store.status().vk,meta:service.store.status().meta}));
  let closing=false;const stop=async()=>{if(closing)return;closing=true;await metaWorker?.stop();await vkReplyWorker?.stop();await vkPostWorker?.stop();await vkWorker?.stop();await worker?.stop();await service.close()};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  if(process.env.NOTIFY_SOCKET)execFileSync('/usr/bin/systemd-notify',['--ready'],{timeout:5000,stdio:'ignore'});
 }catch(e){await metaWorker?.stop();await vkReplyWorker?.stop();await vkPostWorker?.stop();await vkWorker?.stop();await worker?.stop();await service?.close();const known=new Map([['config rejected','config_rejected'],['stage2 Telegram production target refused','production_target_refused'],['private file rejected','private_file_rejected'],['key format rejected','key_format_rejected'],['keys must be distinct','keys_not_distinct'],['state directory owner/mode rejected','state_directory_rejected'],['database owner/mode rejected','database_rejected'],['database profile mismatch','database_profile_mismatch'],['unknown schema version','database_schema_rejected']]);const reason=known.get(e?.message)??(e instanceof SyntaxError?'config_json_invalid':['ENOENT','EACCES','EPERM','ELOOP','EADDRINUSE'].includes(e?.code)?e.code:'startup_failed');console.error('socseti startup rejected: '+reason);process.exitCode=1}
}
