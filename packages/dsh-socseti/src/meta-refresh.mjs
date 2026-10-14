import {acquireMetaTokenLock} from './meta-token-lock.mjs';
import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
import {MetaApi,MetaError} from './meta-api.mjs';import {MetaState} from './meta-receiver.mjs';import {readVkToken} from './vk-api.mjs';import {hash} from './store.mjs';
export function installPassLocked(store,provider,config,token,id){
 const ref=config.token?.passRef;
 if(os.userInfo().username!=='anna'||typeof ref!=='string'||!/^[A-Za-z0-9_][A-Za-z0-9_./-]{0,1023}$/.test(ref)||ref.split('/').some(x=>!x||x==='.'||x==='..')||typeof token!=='string'||!token||token.length>4096||/[\0\r\n]/.test(token))throw new MetaError('credential_install');
 const home=process.env.PASSWORD_STORE_DIR;if(home!=='/opt/anna/.password-store')throw new MetaError('credential_store');
 const file=path.join(home,ref+'.gpg'),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o022)!==0||st.nlink!==1||st.size>65536)throw new MetaError('credential_backup');
 const database=store.db.prepare('PRAGMA database_list').all().find(x=>x.name==='main');if(!database||!path.isAbsolute(database.file))throw new MetaError('credential_backup');
 const backup=path.join(path.dirname(database.file),'meta-token-'+provider+'-'+id+'.gpg.bak');
 fs.writeFileSync(backup,fs.readFileSync(file),{mode:0o600,flag:'wx'});
 const child=spawnSync('pass',['insert','--multiline','--force',ref],{input:token+'\n',detached:true,timeout:20000,killSignal:'SIGKILL',stdio:['pipe','ignore','ignore']});
 if(child.pid){try{process.kill(-child.pid,'SIGKILL')}catch{}}
 if(child.status!==0||hash(readVkToken(config.token))!==hash(token))throw new MetaError('credential_install');
}
export class MetaRefresh{
 constructor(store,provider,config,{read=()=>readVkToken(config.token),install=(token,id)=>installPassLocked(store,provider,config,token,id),loaded,apiFactory}={}){
  this.store=store;this.provider=provider;this.config=config;this.account=store.target(provider);this.state=new MetaState(store,provider+':'+this.account,config);this.read=read;this.install=install;
  this.apiFactory=apiFactory??(token=>new MetaApi({provider,account:this.account,version:config.apiVersion,token,budget:this.state,allowRefresh:true}));
  this.loaded=loaded??(async(id,fingerprint)=>{const until=performance.now()+60000;while(performance.now()<until){const s=this.state.get();if(s.loadedRefresh===id&&s.credentialFingerprint===fingerprint)return true;await sleep(1000)}return false});
 }
 async run(){
  let unlock;try{unlock=acquireMetaTokenLock(this.store,this.provider)}catch{return {phase:'busy'}}
  try{return await this.runLocked()}finally{unlock()}
 }
 async runLocked(){
  const r=this.config.refresh,now=this.store.now(),saved=this.state.get().refresh;
  if(saved&&['refreshing','installing','unknown','saved_not_loaded'].includes(saved.phase)){
   if(saved.phase==='saved_not_loaded'&&this.state.get().loadedRefresh===saved.id&&this.state.get().credentialFingerprint===saved.candidate_hash){this.state.patch({refresh:{...saved,phase:'idle'}});return {phase:'idle'}}
   if(saved.phase!=='saved_not_loaded'){this.state.patch({refresh:{...saved,phase:'unknown'}});return {phase:'unknown'}}
   return {phase:'saved_not_loaded'};
  }
  const issued=saved?.issued_at??Date.parse(r?.issuedAt),expires=saved?.expires_at??Date.parse(r?.expiresAt);
  if(!r?.enabled||r.contractVerified!==true||r.localSourceConfirmed!==true||r.tokenType!=='long_lived'||!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||issued>now||expires<=now||expires<=issued||!Number.isSafeInteger(r.minAgeSeconds)||r.minAgeSeconds<86400){
   this.state.patch({refresh:{phase:'precondition_missing',last_attempt:now,expires_at:Number.isSafeInteger(expires)?expires:null}});return {phase:'precondition_missing'};
  }
  if(expires-now>14*86400000||now-issued<r.minAgeSeconds*1000){this.state.patch({refresh:{...saved,phase:'idle',last_attempt:now,issued_at:issued,expires_at:expires}});return {phase:'idle'}}
  let operation;
  this.store.tx(()=>{
   const s=this.state.get();if(s.refresh&&['refreshing','installing','unknown','saved_not_loaded'].includes(s.refresh.phase))throw new MetaError('refresh_held');
   operation={id:crypto.randomUUID(),phase:'refreshing',last_attempt:now,issued_at:issued,expires_at:expires};s.refresh=operation;this.state.write(s);
  });
  let api,candidateApi;
  try{
   api=this.apiFactory(this.read());const response=await api.refresh();
   const token=response.access_token,seconds=response.expires_in;
   if(typeof token!=='string'||!token||token.length>4096||/[\0\r\n]/.test(token)||!Number.isSafeInteger(seconds)||seconds<1||seconds>5184000)throw new MetaError('refresh_shape');
   candidateApi=this.apiFactory(token);const profile=await candidateApi.call('me');
   if((this.provider==='instagram'?profile.user_id??profile.id:profile.id)!==this.account)throw new MetaError('refresh_account');
   operation={...operation,phase:'installing',candidate_hash:hash(token),issued_at:now,expires_at:now+seconds*1000};this.state.patch({refresh:operation});await this.install(token,operation.id);
   operation.phase='saved_not_loaded';this.state.patch({refresh:operation});
   if(!await this.loaded(operation.id,operation.candidate_hash))return {phase:'saved_not_loaded'};
   operation.phase='idle';this.state.patch({refresh:operation});return {phase:'idle'};
  }catch{
   operation.phase=operation.phase==='saved_not_loaded'?'saved_not_loaded':'unknown';this.state.patch({refresh:operation});return {phase:operation.phase};
  }finally{api?.stop?.();candidateApi?.stop?.()}
 }
}
