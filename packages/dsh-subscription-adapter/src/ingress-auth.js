// RU: Открыть fd с O_NOFOLLOW/O_NONBLOCK и проверить regular type, UID, permissions, size≤256 и64hex. Этот ключ не подписочный secret; каждый stream читает текущий файл, значения не логируются.
// EN: Open an fd with O_NOFOLLOW/O_NONBLOCK and check regular type, UID, permissions, size≤256 and64hex. This key is not a subscription credential; each stream reads its current file without logging values.
import fs from 'node:fs';
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
