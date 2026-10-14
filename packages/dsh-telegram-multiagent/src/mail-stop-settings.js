import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {signStopStatus} from './mail-stop-protocol.js';
export function protectedBytes(file,privateFile=false){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('mail_stop_settings_untrusted');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.uid!==0||(st.mode&(privateFile?0o037:0o022))||st.size>16384)throw Error('mail_stop_settings_untrusted');
  const b=Buffer.alloc(16385),n=fs.readSync(fd,b,0,b.length,0);if(n>16384)throw Error('mail_stop_settings_untrusted');return b.subarray(0,n);
 }finally{fs.closeSync(fd)}
}
export function loadMailStopSettings(file,recipient){
 const c=JSON.parse(protectedBytes(file));
 if(Object.keys(c).sort().join(',')!=='arrival_root,recipient,status_key_file,status_key_id,version'||c.version!==1||c.recipient!==recipient)throw Error('mail_stop_settings_recipient');
 if(!/^[a-zA-Z0-9:_-]{1,128}$/.test(c.status_key_id)||typeof c.arrival_root!=='string'||!path.isAbsolute(c.arrival_root))throw Error('mail_stop_settings_untrusted');
 const key=crypto.createPrivateKey(protectedBytes(c.status_key_file,true));if(key.asymmetricKeyType!=='ed25519')throw Error('mail_stop_settings_untrusted');
 return {arrivalRoot:c.arrival_root,signStatus:status=>signStopStatus(status,c.status_key_id,key)};
}
// Return directories are selected exclusively from the root-owned receiver trust store.
export function deliverMailStopStatus(row,route){
 if(!route||typeof route.directory!=='string'||!path.isAbsolute(route.directory)||!/^[a-z][a-z0-9_-]{0,63}$/.test(route.recipient))throw Error('status_route_unavailable');
 const dir=fs.lstatSync(route.directory);if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('status_route_unavailable');
 const bytes=Buffer.from(row.body,'base64');if(bytes.length>8192||bytes.toString('base64')!==row.body||!bytes.toString().startsWith('[task-stop-status version=1]\n'))throw Error('status_bytes_invalid');
 const digest=crypto.createHash('sha256').update(row.id).digest('hex');
 const file=path.join(route.directory,`dlya-${route.recipient}-mail-stop-status-${digest}.txt`);
 if(fs.existsSync(file)){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||!fs.readFileSync(file).equals(bytes))throw Error('status_delivery_conflict');return file;}
 const tmp=path.join(route.directory,'.mail-stop-'+crypto.randomUUID());
 try{
  const fd=fs.openSync(tmp,'wx',0o644);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  fs.linkSync(tmp,file);const fdDir=fs.openSync(route.directory,'r');try{fs.fsyncSync(fdDir)}finally{fs.closeSync(fdDir)}
 }catch(e){if(e.code!=='EEXIST')throw e;const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||!fs.readFileSync(file).equals(bytes))throw Error('status_delivery_conflict');}
 finally{try{fs.unlinkSync(tmp)}catch{}}
 return file;
}
