// Restore guard for bridge-owned request keys. No HTTP, credentials or implicit initialization.
import {existsSync,realpathSync,lstatSync,statSync,fstatSync,readSync,constants,mkdirSync,readdirSync,openSync,writeFileSync,fsyncSync,closeSync,linkSync,unlinkSync} from 'node:fs';
import {resolve,dirname,join,relative,isAbsolute,sep} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
const HEX=/^[a-f0-9]{64}$/,ALGORITHM='epoch-digest-v1';
const recover=reason=>Object.assign(new Error('ОТКАЗ ostrov_api: состояние ключей не подтверждено ('+reason+'); исход прежней записи неизвестен. Запрос не отправлен; требуется восстановление оператором.'),{code:'OSTROV_API_RECOVERY_REQUIRED'});
const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=(base,target)=>{const r=relative(base,target);return r===''||(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r))};
function locations(directory,workspace){
 if(typeof directory!=='string'||typeof workspace!=='string'||!isAbsolute(directory)||!isAbsolute(workspace))throw recover('неверный путь');
 const w=realpathSync(workspace),d=resolve(directory);let parent=d;
 while(!existsSync(parent))parent=dirname(parent);
 if(inside(w,realpathSync(parent))||inside(resolve(workspace),d))throw recover('state должен быть вне workspace');
 const actual=existsSync(d)?realpathSync(d):d;
 return {directory:actual,workspace:w,ready:join(actual,'.request-state.json'),anchor:join(w,'.ostrov-api-state.json'),reservations:join(actual,'.reservations')};
}
function regular(path,max,durable=false){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const info=fstatSync(fd);if(!info.isFile()||info.size>max)throw recover('неверный файл состояния');
  const buffer=Buffer.alloc(Math.min(info.size+1,max+1));let size=0;
  while(size<buffer.length){const n=readSync(fd,buffer,size,buffer.length-size,null);if(!n)break;size+=n}
  if(size>info.size||size>max)throw recover('файл состояния изменился при чтении');
  if(durable)fsyncSync(fd);
  return buffer.subarray(0,size);
 }finally{closeSync(fd)}
}
function canonicalGuard(raw,where){
 const g=JSON.parse(raw);
 if(!g||Object.keys(g).sort().join(',')!=='directory,epoch,keyAlgorithm,legacyDigests,schema,workspace'||g.schema!==1||g.keyAlgorithm!==ALGORITHM||!/^[a-f0-9]{32}$/.test(g.epoch)||g.directory!==where.directory||g.workspace!==where.workspace||!Array.isArray(g.legacyDigests)||g.legacyDigests.length>100000||g.legacyDigests.some(x=>typeof x!=='string'||!HEX.test(x))||new Set(g.legacyDigests).size!==g.legacyDigests.length)throw recover('неверный маркер поколения');
 return {schema:1,keyAlgorithm:ALGORITHM,epoch:g.epoch,directory:g.directory,workspace:g.workspace,legacyDigests:[...g.legacyDigests].sort()};
}
export function readRequestState(directory,workspace){
 try{
  const paths=locations(directory,workspace),a=canonicalGuard(regular(paths.anchor,8*1024*1024),paths),b=canonicalGuard(regular(paths.ready,8*1024*1024),paths);
  if(JSON.stringify(a)!==JSON.stringify(b))throw recover('поколения расходятся');
  const info=lstatSync(paths.reservations);if(!info.isDirectory()||info.isSymbolicLink())throw recover('журнал резервирования отсутствует');
  return {...a,...paths};
 }catch(error){if(error.code==='OSTROV_API_RECOVERY_REQUIRED')throw error;throw recover('хранилище отсутствует или не читается')}
}
export function readKeyState(guard,digest){
 try{
  if(!HEX.test(digest))throw recover('неверный digest');
  const file=join(guard.directory,digest+'.json'),marker=join(guard.reservations,digest+'.sha256');
  const keyExists=existsSync(file),markerExists=existsSync(marker);
  if(!keyExists&&!markerExists&&!guard.legacyDigests.includes(digest))return null;
  if(!keyExists||!markerExists)throw recover('неполная пара ключ/резервирование');
  const bytes=regular(file,65536,true),hash=regular(marker,65,true);
  if(!hash.equals(Buffer.from(sha(bytes)+'\n')))throw recover('сумма ключа не совпала с резервированием');
  syncDirectory(guard.reservations);syncDirectory(guard.directory);syncDirectory(guard.workspace);
  return bytes;
 }catch(error){if(error.code==='OSTROV_API_RECOVERY_REQUIRED')throw error;throw recover('ключ или резервирование не подтверждено')}
}
export function auditRequestState(directory,workspace){
 try{
  const guard=readRequestState(directory,workspace),digests=new Set(guard.legacyDigests);
  for(const name of readdirSync(guard.directory)){
   if(/^[a-f0-9]{64}\.json$/.test(name))digests.add(name.slice(0,-5));
   else if(!['.request-state.json','.reservations'].includes(name)&&!/^[a-f0-9]{64}(?:\.json)?\.[a-f0-9]{16}\.tmp$/.test(name))throw recover('неизвестное имя в state');
  }
  for(const name of readdirSync(guard.reservations)){
   if(/^[a-f0-9]{64}\.sha256$/.test(name))digests.add(name.slice(0,-7));
   else if(!/^[a-f0-9]{64}\.sha256\.[a-f0-9]{16}\.tmp$/.test(name))throw recover('неизвестное резервирование');
  }
  for(const digest of digests){
   const bytes=readKeyState(guard,digest);if(!bytes)throw recover('пара исчезла при проверке');
   const data=JSON.parse(bytes);
   if(data.digest!==digest||!/^vp-[a-f0-9]{48}$/.test(data.key)||!Object.hasOwn(data,'telegramUpdate'))throw recover('неверный прежний ключ');
  }
  return {directory:guard.directory,workspace:guard.workspace,legacyCount:guard.legacyDigests.length,keyCount:digests.size};
 }catch(error){if(error.code==='OSTROV_API_RECOVERY_REQUIRED')throw error;throw recover('аудит состояния не завершён')}
}
function syncDirectory(dir){const fd=openSync(dir,'r');try{fsyncSync(fd)}finally{closeSync(fd)}}
function publishExclusive(path,bytes){
 const temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';let fd;
 try{
  fd=openSync(temp,'wx',0o600);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;
  try{linkSync(temp,path)}catch(e){if(e.code==='EEXIST')return false;throw e}
  syncDirectory(dirname(path));return true;
 }finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temp)}catch{}}
}
export function keyFor(guard,digest){
 if(!HEX.test(digest))throw recover('неверный digest');
 return 'vp-'+sha('ostrov-request-v1\n'+guard.epoch+'\n'+digest).slice(0,48);
}
export function publishKeyState(guard,digest,data){
 try{
  const current=readRequestState(guard.directory,guard.workspace);
  if(current.epoch!==guard.epoch||JSON.stringify(current.legacyDigests)!==JSON.stringify(guard.legacyDigests))throw recover('поколение изменилось во время вызова');
  const existing=readKeyState(current,digest);if(existing)return JSON.parse(existing);
  const bytes=Buffer.from(JSON.stringify(data)),marker=join(current.reservations,digest+'.sha256'),file=join(current.directory,digest+'.json');
  // Reservation wins first; interrupted publication refuses until operator recovery.
  if(!publishExclusive(marker,sha(bytes)+'\n')){const winner=readKeyState(current,digest);if(!winner)throw recover('пара исчезла во время вызова');return JSON.parse(winner)}
  publishExclusive(file,bytes);
  const saved=readKeyState(current,digest);if(!saved)throw recover('пара исчезла во время вызова');return JSON.parse(saved);
 }catch(error){if(error.code==='OSTROV_API_RECOVERY_REQUIRED')throw error;throw recover('не удалось надёжно сохранить ключ и резервирование')}
}
export function initializeRequestState(directory,workspace,{plan=false}={}){
 try{
  const paths=locations(directory,workspace);
  if(existsSync(paths.ready)||existsSync(paths.anchor)||existsSync(paths.reservations))throw recover('маркер уже есть; повторная инициализация запрещена');
  if(!plan&&(statSync(paths.workspace).uid!==process.getuid()||(existsSync(paths.directory)&&statSync(paths.directory).uid!==process.getuid())))throw recover('инициализацию выполняет владелец workspace и state');
  const files=new Map();
  if(existsSync(paths.directory))for(const name of readdirSync(paths.directory)){
   if(/^[a-f0-9]{64}(?:\.json)?\.[a-f0-9]{16}\.tmp$/.test(name))continue;
   if(!/^[a-f0-9]{64}\.json$/.test(name))throw recover('неизвестное имя в state');
   const bytes=regular(join(paths.directory,name),65536),data=JSON.parse(bytes),digest=name.slice(0,-5);
   if(data.digest!==digest||!/^vp-[a-f0-9]{48}$/.test(data.key)||!Object.hasOwn(data,'telegramUpdate'))throw recover('неверный прежний ключ');
   files.set(digest,bytes);
  }
  if(files.size>100000)throw recover('слишком большой legacy-набор');
  if(plan)return {legacyCount:files.size,directory:paths.directory,workspace:paths.workspace};
  // RU: Каталог создаётся первым, пути пересчитываются через realpath: иначе маркеры несли бы путь через ссылку, а самопроверка сравнивала бы с настоящим — «неверный маркер», частичная подготовка (аудит №5).
  // EN: Create the directory first, then recompute paths via realpath: otherwise markers would carry the symlinked path while the self-check compares with the real one — "invalid marker", partial preparation (audit #5).
  mkdirSync(paths.directory,{recursive:true,mode:0o700});Object.assign(paths,locations(directory,workspace));
  mkdirSync(paths.reservations,{mode:0o700});syncDirectory(paths.directory);
  for(const [digest,bytes] of files)if(!publishExclusive(join(paths.reservations,digest+'.sha256'),sha(bytes)+'\n'))throw recover('резервирование уже существует');
  // Old writer must be stopped. Detect a changed input set before publishing readiness.
  const current=readdirSync(paths.directory).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).sort();
  if(JSON.stringify(current)!==JSON.stringify([...files.keys()].map(x=>x+'.json').sort())||[...files].some(([d,b])=>!regular(join(paths.directory,d+'.json'),65536).equals(b)))throw recover('state изменился при подготовке');
  const value={schema:1,keyAlgorithm:ALGORITHM,epoch:randomBytes(16).toString('hex'),directory:paths.directory,workspace:paths.workspace,legacyDigests:[...files.keys()].sort()},bytes=JSON.stringify(value)+'\n';
  if(!publishExclusive(paths.ready,bytes)||!publishExclusive(paths.anchor,bytes))throw recover('частичная подготовка; требуется оператор');
  readRequestState(directory,workspace);return {legacyCount:files.size,directory:paths.directory,workspace:paths.workspace};
 }catch(error){if(error.code==='OSTROV_API_RECOVERY_REQUIRED')throw error;throw recover('подготовка state не завершена')}
}
