import fs from 'node:fs';
import crypto from 'node:crypto';
export function readPrivateFile(file){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{const st=fs.fstatSync(fd);if(!st.isFile()||![0,process.getuid()].includes(st.uid)||(st.mode&0o137)!==0||st.nlink!==1||st.size>4096)throw Error('private file rejected');
  const data=Buffer.alloc(4097);const n=fs.readSync(fd,data,0,data.length,0);if(n>4096)throw Error('private file too large');return new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(0,n));
 }finally{fs.closeSync(fd)}
}
export function loadKeys(files,profile='legacy'){
 const keys=(profile==='anna'?['anna','monitor','channel']:['varvara','monitor']).map(role=>{const key=readPrivateFile(files[role]).trim();if(!/^[a-f0-9]{64}$/.test(key))throw Error('key format rejected');return {role,bytes:Buffer.from(key)}});
 if(keys.some((k,i)=>keys.slice(i+1).some(other=>k.bytes.equals(other.bytes))))throw Error('keys must be distinct');return keys;
}
export function authenticate(header,keys){
 if(typeof header!=='string'||!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const bytes=Buffer.from(header.slice(7));return keys.find(k=>crypto.timingSafeEqual(bytes,k.bytes))?.role??null;
}
