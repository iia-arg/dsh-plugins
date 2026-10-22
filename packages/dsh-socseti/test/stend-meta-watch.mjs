#!/usr/local/bin/node
// The DEREVO gate runs this source file without node_modules. Probe Anna's installed reader only.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const ROOT='/opt/socseti-anna',CONFIG='/opt/anna/.config/socseti/config.json';
try{
 if(process.argv.length!==2||process.env.META_WATCH_CONFIG!==undefined&&process.env.META_WATCH_CONFIG!==CONFIG)throw Error('arguments/config');
 const account=os.userInfo().username;if(!['anna','iskra','root'].includes(account))throw Error('account');
 if(account!=='anna'){
  const self=fs.realpathSync(fileURLToPath(import.meta.url));
  const child=spawnSync('/usr/bin/sudo',['-n','-u','anna','--','/usr/bin/env','META_WATCH_CONFIG='+CONFIG,'/usr/bin/timeout','-k2s','25s','/usr/local/bin/node',self],{encoding:'utf8',timeout:30000,killSignal:'SIGKILL',maxBuffer:65536,env:{PATH:'/usr/local/bin:/usr/bin:/bin'}});
  let result;try{result=JSON.parse(child.stdout)}catch{}
  if(child.error||child.signal||![0,1,2].includes(child.status)||result?.code!==child.status||result?.reader?.account!=='anna'||result.reader.root!==ROOT||result.reader.version!=='3.1.10'||result.reader.name!=='dsh-socseti'||result.reader.config!==CONFIG||!Number.isSafeInteger(result.reader.uid)||result.reader.uid<=0)throw Error('Anna reader subprocess unverified');
  process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);process.exitCode=child.status;
 }else{
  if(fs.realpathSync(ROOT)!==ROOT)throw Error('installed path');
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));if(pkg.name!=='dsh-socseti'||pkg.version!=='3.1.10')throw Error('installed release');
  const [{loadConfig},{probeMetaWatch}]=await Promise.all([import(pathToFileURL(path.join(ROOT,'src/config.mjs'))),import(pathToFileURL(path.join(ROOT,'src/meta-watch.mjs')))]);
  const result=await probeMetaWatch(loadConfig(CONFIG));
  if(!result||!Number.isInteger(result.code)||![0,1,2].includes(result.code)||!Array.isArray(result.issues)||result.issues.some(i=>!i||typeof i.subject!=='string'||typeof i.reason!=='string')||result.code===0&&result.issues.length!==0||result.code===1&&result.issues.length===0)throw Error('unknown probe result');
  console.log(JSON.stringify({...result,reader:{account,uid:process.getuid(),root:ROOT,config:CONFIG,name:pkg.name,version:pkg.version}}));process.exitCode=result.code;
 }
}catch{console.error('СЛЕПО: Anna installed Meta reader/account/config unverified');process.exitCode=2}
