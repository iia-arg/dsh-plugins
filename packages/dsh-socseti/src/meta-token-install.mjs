// Manual owner hand only. stdin, never argv, carries the existing owner-issued token.
// This command neither requests OAuth authorization nor exchanges/reissues a token.
import crypto from 'node:crypto';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {loadConfig} from './config.mjs';import {Store,hash} from './store.mjs';import {MetaState} from './meta-receiver.mjs';import {MetaApi,MetaError} from './meta-api.mjs';import {acquireMetaTokenLock} from './meta-token-lock.mjs';import {installPassLocked} from './meta-refresh.mjs';
export async function installMetaToken(store,provider,config,token,{apiFactory,install}={}){
 if(!['instagram','threads'].includes(provider)||config.enabled!==true||config.armed!==true||!config.token?.passRef||typeof token!=='string'||!token||token.length>4096||/[\0\r\n]/.test(token))throw new MetaError('installer_input');
 const unlock=acquireMetaTokenLock(store,provider),state=new MetaState(store,provider+':'+store.target(provider),config);let api;
 try{
  api=apiFactory?apiFactory(token):new MetaApi({provider,account:store.target(provider),version:config.apiVersion,token,budget:state});const profile=await api.call('me');
  if((provider==='instagram'?profile.user_id??profile.id:profile.id)!==store.target(provider))throw new MetaError('installer_account');
  const id=crypto.randomUUID();state.patch({refresh:{id,phase:'installing',last_attempt:store.now(),candidate_hash:hash(token)}});
  await (install??((t,i)=>installPassLocked(store,provider,config,t,i)))(token,id);
  const issued=Date.parse(config.refresh?.issuedAt),expires=Date.parse(config.refresh?.expiresAt);
  state.patch({refresh:{id,phase:'saved_not_loaded',last_attempt:store.now(),candidate_hash:hash(token),issued_at:Number.isSafeInteger(issued)?issued:null,expires_at:Number.isSafeInteger(expires)?expires:null}});
  return {id,phase:'saved_not_loaded'};
 }catch(e){const current=state.get().refresh;if(current?.phase==='installing')state.patch({refresh:{...current,phase:'unknown'}});throw e instanceof MetaError?e:new MetaError('installer_unknown')}
 finally{api?.stop?.();unlock()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==4||!path.isAbsolute(process.argv[2])||!['instagram','threads'].includes(process.argv[3])){console.error('СЛЕПО: meta-token-install /absolute/config.json instagram|threads; token on stdin');process.exitCode=2}
 else{
  let store;
  try{const config=loadConfig(process.argv[2]),provider=process.argv[3],c=config.meta?.[provider];if(config.profile!=='anna'||!c?.enabled||!c.token?.passRef)throw Error('unarmed');let size=0,parts=[];for await(const b of process.stdin){size+=b.length;if(size>4097)throw Error('stdin bound');parts.push(b)}
   const token=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)).replace(/\n$/,'');store=new Store(config.stateDir,config.targets,{profile:'anna'});const result=await installMetaToken(store,provider,c,token);console.log(JSON.stringify({provider,...result}));
  }catch{console.error('Meta token installation rejected; reconcile private state');process.exitCode=1}
  finally{store?.close()}
 }
}
