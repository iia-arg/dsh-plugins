import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Only package code is copied. The source may also be claudeoauth's home directory.
export function copyGatewayFixture(target){
 const source=process.env.STEND_GATEWAY_SOURCE||fileURLToPath(new URL('../../dsh-subscription-gateway/',import.meta.url));
 const deps=process.env.STEND_GATEWAY_NODE_MODULES;
 const blind=message=>Object.assign(new Error('СЛЕПОТА: '+message),{code:'STEND_BLIND'});
 const read=file=>{let fd;try{
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  if(!fs.fstatSync(fd).isFile())throw Error('источник должен быть обычным файлом: '+file);
  return fs.readFileSync(fd);
 }finally{if(fd!==undefined)fs.closeSync(fd)}};
 try{
  if(!deps||!path.isAbsolute(deps))throw blind('STEND_GATEWAY_NODE_MODULES — публичные зависимости шлюза — не заданы');
  fs.accessSync(deps,fs.constants.R_OK|fs.constants.X_OK);
  if(!path.isAbsolute(source))throw blind('STEND_GATEWAY_SOURCE должен быть абсолютным путём');
  for(const dir of [source,path.join(source,'test')])if(!fs.lstatSync(dir).isDirectory())throw Error('источник должен быть обычным каталогом: '+dir);
  const manifest=read(path.join(source,'package.json')),pkg=JSON.parse(manifest);
  if(!Array.isArray(pkg.files)||!pkg.files.includes('gateway.mjs')||!pkg.files.includes('test/extract.mjs'))throw Error('package.json files не объявляет gateway.mjs и test/extract.mjs');
  const publicJson=['usage-limits.json','child-source-versions.json','schedule.json'].filter(name=>pkg.files.includes(name));
  const names=[...new Set([...pkg.files.filter(name=>typeof name==='string'&&/^[a-zA-Z0-9_-]+\.mjs$/.test(name)),...publicJson])];
  // Ignore directories and all other JSON, even when declared by a source home's manifest.
  const rows=[['package.json',manifest],...names.map(name=>[name,read(path.join(source,name))]),['test/extract.mjs',read(path.join(source,'test/extract.mjs'))]];
  fs.mkdirSync(path.join(target,'test'),{recursive:true});
  for(const [name,bytes] of rows)fs.writeFileSync(path.join(target,name),bytes);
  return {deps};
 }catch(e){
  if(['ENOENT','EACCES','EPERM','ENOTDIR'].includes(e.code))throw blind('источник шлюза или публичные зависимости недоступны; нужны STEND_GATEWAY_SOURCE и STEND_GATEWAY_NODE_MODULES');
  throw e;
 }
}
