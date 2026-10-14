import path from 'node:path';import {loadConfig} from './config.mjs';import {Store} from './store.mjs';import {MetaRefresh} from './meta-refresh.mjs';
if(process.argv.length!==4||!path.isAbsolute(process.argv[2])||!['instagram','threads'].includes(process.argv[3])){console.error('СЛЕПО: meta-token-refresh /absolute/config.json instagram|threads');process.exitCode=2}
else{
 let store;
 try{
  const config=loadConfig(process.argv[2]),provider=process.argv[3],c=config.meta?.[provider];
  if(config.profile!=='anna'||c?.enabled!==true||c.refresh?.enabled!==true)throw Error('unarmed');
  store=new Store(config.stateDir,config.targets,{profile:config.profile});const result=await new MetaRefresh(store,provider,c).run();
  console.log(JSON.stringify({provider,phase:result.phase}));process.exitCode=result.phase==='idle'?0:1;
 }catch{console.error('Meta refresh configuration or state rejected');process.exitCode=2}
 finally{store?.close()}
}
