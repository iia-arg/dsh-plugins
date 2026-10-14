import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {hash} from './store.mjs';import {MetaError} from './meta-api.mjs';
export function acquireMetaTokenLock(store,provider){
 const file=store.db.prepare('PRAGMA database_list').all().find(x=>x.name==='main')?.file;
 if(!file||!path.isAbsolute(file))throw new MetaError('token_lock');
 const lock=path.join(path.dirname(file),'meta-token-'+hash(provider+':'+store.target(provider))+'.lock');let fd;
 try{
  fd=fs.openSync(lock,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);
  const st=fs.fstatSync(fd);if(!st.isFile()||st.uid!==process.getuid()||(st.mode&0o777)!==0o600||st.nlink!==1)throw Error('lock');
  execFileSync('/usr/bin/flock',['-w','5','3'],{timeout:5500,stdio:['ignore','ignore','ignore',fd]});return ()=>fs.closeSync(fd);
 }catch{if(fd!==undefined)fs.closeSync(fd);throw new MetaError('token_lock_busy')}
}
