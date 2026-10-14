// RU: Проверить regular файл пропуска по открытому fd, запретить symlink/FIFO и раскрытие группе/прочим. Вход авторизуется до JSON и SDK; это отдельный секрет от подписки и MCP-пропуска.
// EN: Validate a regular ingress file through an open fd, reject symlink/FIFO and group/other access. Admission happens before JSON and SDK; this is separate from subscription and MCP tickets.
import fs from 'node:fs';
import crypto from 'node:crypto';
// RU: readIngressKey: Проверить regular файл пропуска по открытому fd, запретить symlink/FIFO и раскрытие группе/прочим. Вход авторизуется до JSON и SDK; это отдельный секрет от подписки и MCP-пропуска.
// EN: readIngressKey: Validate a regular ingress file through an open fd, reject symlink/FIFO and group/other access. Admission happens before JSON and SDK; this is separate from subscription and MCP tickets.
export function readIngressKey(file) {
 if(typeof file!=='string'||!file.startsWith('/'))throw Error('ingress key file must be an absolute path');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try {
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.size>256||(st.mode&0o077)!==0||![0,process.getuid()].includes(st.uid))throw Error('ingress key file owner/mode/type rejected');
  const key=fs.readFileSync(fd,'utf8').trim();
  if(!/^[a-f0-9]{64}$/.test(key))throw Error('ingress key must be 32 random bytes encoded as lowercase hex');
  return key;
 }finally{fs.closeSync(fd)}
}
// RU: admitIngress: Проверить regular файл пропуска по открытому fd, запретить symlink/FIFO и раскрытие группе/прочим. Вход авторизуется до JSON и SDK; это отдельный секрет от подписки и MCP-пропуска.
// EN: admitIngress: Validate a regular ingress file through an open fd, reject symlink/FIFO and group/other access. Admission happens before JSON and SDK; this is separate from subscription and MCP tickets.
// RU: Пропуск верен — без записи ответа (для /health: подробности конфигурации только с пропуском, аудит №18).
// EN: Bearer is valid — without writing a response (for /health: configuration details only with the bearer, audit #18).
export function ingressBearerVeren(req,file) {
 let key;try{key=readIngressKey(file)}catch{return false}
 const got=req.headers.authorization,expected=Buffer.from('Bearer '+key);
 return typeof got==='string'&&Buffer.byteLength(got)===expected.length&&crypto.timingSafeEqual(Buffer.from(got),expected);
}
export function admitIngress(req,res,file,log=()=>{}) {
 let key;
 try{key=readIngressKey(file)}catch(error){log('ingress configuration rejected: '+error.message);res.writeHead(503,{'content-type':'application/json'});res.end('{"error":{"type":"ingress_unavailable"}}');return false}
 const got=req.headers.authorization;
 const expected=Buffer.from('Bearer '+key);
 if(typeof got!=='string'||Buffer.byteLength(got)!==expected.length||!crypto.timingSafeEqual(Buffer.from(got),expected)){
  res.writeHead(401,{'content-type':'application/json','www-authenticate':'Bearer'});res.end('{"error":{"type":"unauthorized"}}');return false;
 }
 return true;
}
