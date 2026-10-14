import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
const MAX_WIRE=98304;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const publication=st=>[st.dev,st.ino,st.birthtimeNs,st.ctimeNs].map(String).join(':');
const recordName=(file,raw,recipient,object)=>digest(Buffer.from(path.resolve(file)+'\0'+digest(raw)+'\0'+recipient+'\0'+object))+'.json';
export function looksLikeStop(raw){
 const text=Buffer.from(raw).toString('utf8');
 if(text.startsWith('[coordinator-signature')){
  try{const outer=JSON.parse(text.slice(text.indexOf('\n')+1));if(outer.action==='stop')return true;return looksLikeStop(Buffer.from(outer.payload??'','base64'))}catch{return /"action"\s*:\s*"stop"/.test(text)}
 }
 if(!text.startsWith('[a2a-envelope version='))return false;
 try{const meta=JSON.parse(text.split('\n')[1]);return typeof meta.kind==='string'&&meta.kind.startsWith('task-stop/')}catch{return /"kind"\s*:\s*"task-stop\//.test(text)}
}
function secureRoot(root){const st=fs.lstatSync(root);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o022))throw Error('arrival_root_untrusted')}
export function readStopArrival(root,file,raw,recipient){
 if(!root)return null;
 try{
  secureRoot(root);const source=fs.lstatSync(file,{bigint:true});if(!source.isFile()||source.isSymbolicLink())return null;
  const object=publication(source),target=path.join(root,recordName(file,raw,recipient,object));
  const fd=fs.openSync(target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  let item;try{const st=fs.fstatSync(fd);if(!st.isFile()||st.uid!==0||(st.mode&0o022)||st.size>2048)return null;item=JSON.parse(fs.readFileSync(fd,'utf8'))}finally{fs.closeSync(fd)}
  if(item.version!==1||item.publication!==object||item.source_path!==path.resolve(file)||item.wire_sha!==digest(raw)||item.recipient!==recipient||!Number.isSafeInteger(item.delivered_at)||typeof item.event_id!=='string')return null;
  return item;
 }catch{return null}
}
// Run in a separate root process. Existing files at startup never acquire invented arrival times.
export function observeStopArrivals({root,mailboxes,now=Date.now,onError=()=>{}}){
 if(process.getuid()!==0)throw Error('arrival_observer_requires_root');
 if(!path.isAbsolute(root)||!Array.isArray(mailboxes)||!mailboxes.length||mailboxes.length>32)throw Error('invalid_observer_config');
 fs.mkdirSync(root,{recursive:true,mode:0o755});secureRoot(root);
 const watchers=[];let closed=false;
 try{
  for(const mailbox of mailboxes){
   if(!/^[a-z][a-z0-9_-]{0,63}$/.test(mailbox.recipient)||!path.isAbsolute(mailbox.directory))throw Error('invalid_observer_config');
   const dir=fs.lstatSync(mailbox.directory);if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('invalid_mailbox');
   const existing=new Map();for(const name of fs.readdirSync(mailbox.directory)){try{const st=fs.lstatSync(path.join(mailbox.directory,name));existing.set(name,String(st.dev)+':'+String(st.ino))}catch{}}
   const watcher=fs.watch(mailbox.directory,(_kind,name)=>{
    if(closed||!name||name.startsWith('.')||!['.txt','.md'].includes(path.extname(name)))return;
    const file=path.join(mailbox.directory,name);let fd;
    try{
     fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);const st=fs.fstatSync(fd,{bigint:true});
     if(!st.isFile()||st.size>BigInt(MAX_WIRE)||existing.get(name)===String(st.dev)+':'+String(st.ino))return;
     const buffer=Buffer.alloc(MAX_WIRE+1),length=fs.readSync(fd,buffer,0,buffer.length,0),raw=buffer.subarray(0,length);
     if(raw.length>MAX_WIRE||!looksLikeStop(raw))return;
     const object=publication(st);
     const fact={version:1,event_id:randomUUID(),recipient:mailbox.recipient,source_path:path.resolve(file),wire_sha:digest(raw),publication:object,delivered_at:now()};
     const target=path.join(root,recordName(file,raw,mailbox.recipient,object));
     if(!fs.existsSync(target)&&fs.readdirSync(root).filter(name=>name.endsWith('.json')).length>=4096){onError('observation_capacity_4096');return;}
     try{const out=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o644);try{fs.writeFileSync(out,JSON.stringify(fact));fs.fsyncSync(out)}finally{fs.closeSync(out)}}catch(error){if(error.code!=='EEXIST')throw error}
    }catch(error){if(error.code!=='ENOENT')onError(error.code??'observation_failed')}
    finally{if(fd!==undefined)fs.closeSync(fd)}
   });watchers.push(watcher);
  }
 }catch(error){for(const watcher of watchers)watcher.close();throw error}
 return {close(){closed=true;for(const watcher of watchers)watcher.close()}};
}
