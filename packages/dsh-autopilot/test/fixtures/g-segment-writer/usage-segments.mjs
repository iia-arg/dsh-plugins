// Writer-owned segment transport; no AP attribution, policy selection or parsed cache.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {spawnSync} from 'node:child_process';import {isDeepStrictEqual} from 'node:util';
import limits from './usage-limits.json' with {type:'json'};
const keys=['schemaVersion','legacyFileMaxBytes','segmentMaxBytes','segmentMaxAgeSeconds','rawRetentionSeconds','maxRecordBytes'].sort();
if(!isDeepStrictEqual(Object.keys(limits).sort(),keys)||limits.schemaVersion!==3||keys.filter(k=>k!=='schemaVersion').some(k=>!Number.isSafeInteger(limits[k])||limits[k]<=0)||limits.segmentMaxBytes<limits.maxRecordBytes||limits.maxRecordBytes>65536||limits.rawRetentionSeconds<780)throw Error('G_USAGE_LIMITS_INVALID');
export const GATEWAY_USAGE_LIMITS=Object.freeze(limits);
const stores=new Map(),hash=b=>createHash('sha256').update(b).digest('hex'),safe=x=>Number.isSafeInteger(x)&&x>=0;
const fail=(name,entry)=>{const e=Error(name);if(entry)e.segmentNo=entry.segmentNo;throw e};
function directory(p){const s=fs.lstatSync(p);if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o777)!==0o700)fail('G_SOURCE_UNSAFE')}
function regular(p,mode){const s=fs.lstatSync(p);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o777)!==mode||s.nlink!==1)fail('G_SOURCE_UNSAFE');return s}
function syncDir(p){const f=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(f)}finally{fs.closeSync(f)}}
function recoveryRaw(p,expected){let fd;try{fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);const st=fs.fstatSync(fd);if(!st.isFile()||st.uid!==process.getuid()||![0o600,0o400].includes(st.mode&0o777)||st.nlink!==1)fail('G_SOURCE_UNSAFE');if(expected!==undefined&&hash(fs.readFileSync(fd))!==expected)fail('G_SEGMENT_CORRUPT');fs.fchmodSync(fd,0o400);fs.fsyncSync(fd);const named=fs.lstatSync(p);if(named.ino!==st.ino||named.dev!==st.dev)fail('G_SOURCE_UNSAFE')}catch(e){if(e.code==='ELOOP')fail('G_SOURCE_UNSAFE');throw e}finally{if(fd!==undefined)fs.closeSync(fd)}}
function regularActive(p){regular(p,0o600);if(fs.statSync(p).size>limits.legacyFileMaxBytes+limits.maxRecordBytes)fail('G_SEGMENT_INVALID')}

function json(p){try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{fail('G_SEGMENT_INVALID')}}
function atomic(p,value,mode=0o600){
 if(fs.existsSync(p))regular(p,mode);const tmp=p+'.'+randomUUID()+'.new';let fd;
 try{fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);fs.fchmodSync(fd,mode);fs.closeSync(fd);fd=undefined;fs.renameSync(tmp,p);syncDir(path.dirname(p))}finally{if(fd!==undefined)fs.closeSync(fd)}
}
function names(file){const dir=path.join(path.dirname(file),'segments'),prefix=path.basename(file)==='gateway-v1.jsonl'?'':path.basename(file)+'.';return {dir,source:file+'.source.json',manifest:path.join(dir,prefix+'manifest.json'),intent:path.join(dir,prefix+'intent.json'),lock:path.join(dir,prefix+'writer.lock')}}
function rows(bytes){if(!bytes.length)return [];if(bytes.at(-1)!==10)fail('G_SEGMENT_INVALID');return bytes.toString('utf8').split('\n').slice(0,-1).map(line=>{let r;try{r=JSON.parse(line)}catch{fail('G_SEGMENT_INVALID')}if(!r||r.schemaVersion!==1||typeof r.generation!=='string'||!r.generation.length||r.generation.length>256||!safe(r.seq)||r.seq<1||!safe(r.observedAt))fail('G_SEGMENT_INVALID');return r})}
function summary(records,origins,no){const groups=new Map();for(const r of records){let g=groups.get(r.generation);if(!g){g={generation:r.generation,firstSeq:r.seq,finalSeq:r.seq,finalObservedAt:r.observedAt,maxObservedAt:r.observedAt,firstSegmentNo:origins[r.generation]??no};groups.set(r.generation,g)}g.finalSeq=r.seq;g.finalObservedAt=r.observedAt;g.maxObservedAt=Math.max(g.maxObservedAt,r.observedAt)}return [...groups.values()]}
function validEntry(e,m){
 if(!e||!isDeepStrictEqual(Object.keys(e).sort(),['schemaVersion','sourceId','sourceEpoch','segmentNo','file','closedAt','byteLength','sha256','generations'].sort())||e.schemaVersion!==1||e.sourceId!==m.sourceId||e.sourceEpoch!==m.sourceEpoch||!safe(e.segmentNo)||e.file!==m.sourceEpoch+'-'+e.segmentNo+'.jsonl'||!safe(e.closedAt)||!safe(e.byteLength)||e.byteLength===0||e.byteLength>(e.segmentNo===0?limits.legacyFileMaxBytes+limits.maxRecordBytes:limits.segmentMaxBytes)||!/^([0-9a-f]{64})$/.test(e.sha256)||!Array.isArray(e.generations)||e.generations.length===0)fail('G_SEGMENT_INVALID');
 const seen=new Set();for(const g of e.generations){if(!g||!isDeepStrictEqual(Object.keys(g).sort(),['generation','firstSeq','finalSeq','finalObservedAt','maxObservedAt','firstSegmentNo'].sort())||typeof g.generation!=='string'||!g.generation.length||g.generation.length>256||seen.has(g.generation)||!safe(g.firstSeq)||g.firstSeq<1||!safe(g.finalSeq)||g.finalSeq<g.firstSeq||!safe(g.finalObservedAt)||!safe(g.maxObservedAt)||g.maxObservedAt<g.finalObservedAt||!safe(g.firstSegmentNo)||g.firstSegmentNo>e.segmentNo)fail('G_SEGMENT_INVALID');seen.add(g.generation)}
}
function manifestAt(file){const n=names(file);directory(path.dirname(file));directory(n.dir);regular(n.manifest,0o600);const m=json(n.manifest);regular(n.source,0o400);const enrollment=json(n.source);if(!m||typeof m!=='object'||!enrollment||typeof enrollment!=='object'||!safe(enrollment.sourceCreatedAt)||enrollment.sourceId!==m.sourceId||enrollment.sourceEpoch!==m.sourceEpoch)fail('G_SEGMENT_INVALID');
 if(!m||!isDeepStrictEqual(Object.keys(m).sort(),['schemaVersion','sourceId','sourceEpoch','active','segments','deletedMaxObservedAt','retainedFrom'].sort())||m.schemaVersion!==1||typeof m.sourceId!=='string'||!/^[0-9a-f-]{36}$/.test(m.sourceEpoch)||!m.active||!safe(m.active.segmentNo)||!safe(m.active.openedAt)||!m.active.origins||Object.getPrototypeOf(m.active.origins)!==Object.prototype||!Array.isArray(m.segments)||m.deletedMaxObservedAt!==null&&!safe(m.deletedMaxObservedAt)||!safe(m.retainedFrom))fail('G_SEGMENT_INVALID');
 let last=m.retainedFrom-1;for(const e of m.segments){validEntry(e,m);if(e.segmentNo!==last+1||e.segmentNo>=m.active.segmentNo)fail('G_SEGMENT_INVALID');last=e.segmentNo}if(last+1!==m.active.segmentNo)fail('G_SEGMENT_INVALID');for(const x of Object.values(m.active.origins))if(!safe(x)||x>m.active.segmentNo)fail('G_SEGMENT_INVALID');return m;
}
function readClosed(file,m,e){validEntry(e,m);const raw=path.join(names(file).dir,e.file),seal=raw.replace(/\.jsonl$/,'.seal.json');
 try{regular(raw,0o400);regular(seal,0o400)}catch(err){if(err.code==='ENOENT')fail('G_SEGMENT_MISSING',e);throw err}
 if(!isDeepStrictEqual(json(seal),e))fail('G_SEGMENT_INVALID',e);const a=fs.statSync(raw,{bigint:true});if(a.size!==BigInt(e.byteLength))fail('G_SEGMENT_CORRUPT',e);const bytes=fs.readFileSync(raw),b=fs.statSync(raw,{bigint:true});
 if(a.ino!==b.ino||a.size!==b.size||a.mtimeNs!==b.mtimeNs||a.ctimeNs!==b.ctimeNs||bytes.length!==e.byteLength||hash(bytes)!==e.sha256)fail('G_SEGMENT_CORRUPT',e);
 const rr=rows(bytes),origins=Object.fromEntries(e.generations.map(g=>[g.generation,g.firstSegmentNo]));if(!isDeepStrictEqual(summary(rr,origins,e.segmentNo),e.generations))fail('G_SEGMENT_INVALID',e);return rr;
}
export function inspectGatewaySegments(file,{verifyCoverage=true}={}){const m=manifestAt(file),all=[];for(const e of m.segments)for(const r of readClosed(file,m,e))all.push(r);regular(file,0o600);for(const r of rows(fs.readFileSync(file)))all.push(r);if(verifyCoverage){const available=new Set([...m.segments.map(e=>e.segmentNo),m.active.segmentNo]);for(const e of m.segments)for(const g of e.generations)if(!available.has(g.firstSegmentNo))fail('G_SEGMENT_MISSING',{segmentNo:g.firstSegmentNo});for(const origin of Object.values(m.active.origins))if(!available.has(origin))fail('G_SEGMENT_MISSING',{segmentNo:origin})}return {manifest:m,rows:all}}
class SegmentWriter{
 constructor(file){this.file=file;this.n=names(file);this.lock=undefined;this.timer=null;
  try{directory(path.dirname(file));fs.mkdirSync(this.n.dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e}directory(this.n.dir);
  try{
   this.lock=fs.openSync(this.n.lock,fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);regular(this.n.lock,0o600);
   const lock=spawnSync('/usr/bin/flock',['-n','3'],{stdio:['ignore','ignore','pipe',this.lock],timeout:3000});if(lock.status!==0)fail('G_WRITER_BUSY');
   const enrolled=fs.existsSync(this.n.source),established=fs.existsSync(this.n.manifest);
   if(enrolled!==established)fail('G_SEGMENT_INVALID');
   if(!fs.existsSync(file)&&established&&!fs.existsSync(this.n.intent))fail('G_SEGMENT_MISSING');
   if(!established){
    if(!fs.existsSync(file)){const f=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);fs.fsyncSync(f);fs.closeSync(f)}regular(file,0o600);
    this.m={schemaVersion:1,sourceId:randomUUID(),sourceEpoch:randomUUID(),active:{segmentNo:0,openedAt:Date.now(),origins:{}},segments:[],deletedMaxObservedAt:null,retainedFrom:0};
    atomic(this.n.source,{schemaVersion:1,sourceId:this.m.sourceId,sourceEpoch:this.m.sourceEpoch,sourceCreatedAt:Date.now()},0o400);atomic(this.n.manifest,this.m);
   }
   this.m=manifestAt(file);this.recover();this.m=manifestAt(file);this.origins=Object.create(null);
   for(const e of this.m.segments){readClosed(file,this.m,e);for(const g of e.generations)this.origins[g.generation]=g.firstSegmentNo}
   Object.assign(this.origins,this.m.active.origins);regularActive(file);this.records=rows(fs.readFileSync(file));for(const r of this.records){if(!(r.generation in this.origins))this.origins[r.generation]=this.m.active.segmentNo;this.m.active.origins[r.generation]=this.origins[r.generation]}
   this.bytes=fs.statSync(file).size;this.stamp=fs.statSync(file,{bigint:true});this.cleanup();this.schedule();
  }catch(e){if(this.lock!==undefined)fs.closeSync(this.lock);throw e}
 }
 persist(){atomic(this.n.manifest,this.m)}
 recover(){if(!fs.existsSync(this.n.intent))return;regular(this.n.intent,0o600);const intent=json(this.n.intent);
  if(intent.op==='active_gap'){this.recoverActiveGap(intent);return}
  if(intent.op==='seal'){if(!safe(intent.nextOpenedAt))fail('G_SEGMENT_INVALID');const e=intent.entry;validEntry(e,this.m);const target=path.join(this.n.dir,e.file),seal=target.replace(/\.jsonl$/,'.seal.json');
   if(!this.m.segments.some(s=>s.segmentNo===e.segmentNo)){
    if(!fs.existsSync(target)){regularActive(this.file);if(hash(fs.readFileSync(this.file))!==e.sha256)fail('G_SEGMENT_CORRUPT',e);fs.renameSync(this.file,target)}
    recoveryRaw(target,e.sha256);
    if(fs.existsSync(seal)){regular(seal,0o400);if(!isDeepStrictEqual(json(seal),e))fail('G_SEGMENT_INVALID')}else atomic(seal,e,0o400);
    if(!fs.existsSync(this.file)){const f=fs.openSync(this.file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);fs.fsyncSync(f);fs.closeSync(f)}else if(regular(this.file,0o600).size)fail('G_SEGMENT_INVALID');
    this.m.segments.push(e);this.m.active={segmentNo:e.segmentNo+1,openedAt:intent.nextOpenedAt,origins:{}};this.m.retainedFrom=this.m.segments[0].segmentNo;this.persist();syncDir(path.dirname(this.file));
   }
  }else if(intent.op==='gc'){
   if(!Array.isArray(intent.entries)||intent.entries.length>32||intent.quarantines!==undefined&&(!Array.isArray(intent.quarantines)||intent.quarantines.some(q=>!intent.entries.some(e=>q===this.m.sourceEpoch+'-'+e.segmentNo+'.replaced'))))fail('G_SEGMENT_INVALID');for(const e of intent.entries)validEntry(e,this.m);
   const remove=new Set(intent.entries.map(e=>e.segmentNo));this.m.segments=this.m.segments.filter(e=>!remove.has(e.segmentNo));let max=this.m.deletedMaxObservedAt??0;for(const e of intent.entries)for(const g of e.generations)max=Math.max(max,g.maxObservedAt);this.m.deletedMaxObservedAt=max;this.m.retainedFrom=this.m.segments[0]?.segmentNo??this.m.active.segmentNo;this.persist();
   for(const e of intent.entries){const q=this.m.sourceEpoch+'-'+e.segmentNo+'.replaced',raw=path.join(this.n.dir,e.file),files=[e.file,e.file.replace(/\.jsonl$/,'.seal.json')];
    // The canonical gap row is the durable authority for deleting this exact quarantine.
    if(fs.existsSync(raw)){const rr=readClosed(this.file,this.m,e);if(rr.some(r=>r.kind==='source_gap'&&r.scope==='process'&&r.reason==='G_ACTIVE_REPLACED'&&r.replacedFile===q))files.unshift(q)}
    else if(intent.quarantines?.includes(q))files.unshift(q);
    for(const f of files){const p=path.join(this.n.dir,f);try{regular(p,0o400);fs.unlinkSync(p)}catch(err){if(err.code!=='ENOENT')throw err}}
   }
  }else fail('G_SEGMENT_INVALID');fs.unlinkSync(this.n.intent);syncDir(this.n.dir);
 }
 recoverActiveGap(intent){
  const no=this.m.active.segmentNo,quarantine=this.m.sourceEpoch+'-'+no+'.replaced';
  if(intent.segmentNo!==no||intent.quarantine!==quarantine||!safe(intent.origin)||intent.origin>no||!safe(intent.closedAt))fail('G_SEGMENT_INVALID');
  const gapRows=rows(Buffer.from(JSON.stringify(intent.gap)+'\n'));if(gapRows.length!==1||intent.gap.kind!=='source_gap'||intent.gap.scope!=='process'||intent.gap.reason!=='G_ACTIVE_REPLACED'||intent.gap.replacedFile!==quarantine)fail('G_SEGMENT_INVALID');
  const lost=path.join(this.n.dir,quarantine),gapBytes=Buffer.from(JSON.stringify(intent.gap)+'\n');if(gapBytes.length>limits.maxRecordBytes)fail('G_SEGMENT_INVALID');
  if(!fs.existsSync(lost)&&fs.existsSync(this.file)){regular(this.file,0o600);fs.renameSync(this.file,lost);syncDir(this.n.dir);syncDir(path.dirname(this.file))}
  if(fs.existsSync(lost))recoveryRaw(lost);
  if(!fs.existsSync(this.file)){const fd=fs.openSync(this.file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);fs.closeSync(fd)}
  regular(this.file,0o600);const present=fs.readFileSync(this.file);if(present.length>gapBytes.length||!present.equals(gapBytes.subarray(0,present.length)))fail('G_SEGMENT_CORRUPT');
  if(present.length!==gapBytes.length){const fd=fs.openSync(this.file,fs.constants.O_WRONLY|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW);try{fs.writeFileSync(fd,gapBytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}syncDir(path.dirname(this.file));
  const entry={schemaVersion:1,sourceId:this.m.sourceId,sourceEpoch:this.m.sourceEpoch,segmentNo:no,file:this.m.sourceEpoch+'-'+no+'.jsonl',closedAt:intent.closedAt,byteLength:gapBytes.length,sha256:hash(gapBytes),generations:summary(gapRows,{[intent.gap.generation]:intent.origin},no)};
  atomic(this.n.intent,{op:'seal',entry,nextOpenedAt:Date.now()});this.recover();
 }
 activeGap(row,origin){
  const no=this.m.active.segmentNo,quarantine=this.m.sourceEpoch+'-'+no+'.replaced',gap={};
  for(const key of ['schemaVersion','processGeneration','generation','seq','requestId','requestGeneration','uid','recipient','engine','sessionId','sessionCreated','dshTurn','processEpoch'])if(Object.hasOwn(row,key))gap[key]=row[key];
  Object.assign(gap,{observedAt:Date.now(),kind:'source_gap',reason:'G_ACTIVE_REPLACED',scope:'process',replacedFile:quarantine});const e=Error('G_ACTIVE_REPLACED');e.gapWritten=false;
  try{atomic(this.n.intent,{op:'active_gap',segmentNo:no,quarantine,origin:this.origins[row.generation]??origin??no,closedAt:Date.now(),gap});this.recover();e.gapWritten=true;this.replaced=true;this.records=[];this.bytes=0;this.stamp=fs.statSync(this.file,{bigint:true});this.cleanup();this.schedule()}catch(cause){this.fault=cause.message?.startsWith('G_')?cause.message:'SOURCE_GAP';e.cause=cause}
  throw e;
 }
 checkActive(row,origin){if(fs.existsSync(this.n.intent))fail('G_SEGMENT_RECOVERY_REQUIRED');let st;try{regular(this.file,0o600);st=fs.statSync(this.file,{bigint:true})}catch(e){if(e.code==='ENOENT')this.activeGap(row,origin);throw e}if(st.dev!==this.stamp.dev||st.ino!==this.stamp.ino||st.size!==this.stamp.size||st.mtimeNs!==this.stamp.mtimeNs||st.ctimeNs!==this.stamp.ctimeNs)this.activeGap(row,origin)}
 seal(){if(!this.bytes)return;const last=this.records.at(-1);this.checkActive({...last,seq:last.seq+1});const bytes=fs.readFileSync(this.file);if(bytes.length!==this.bytes)fail('G_SEGMENT_CORRUPT');const e={schemaVersion:1,sourceId:this.m.sourceId,sourceEpoch:this.m.sourceEpoch,segmentNo:this.m.active.segmentNo,file:this.m.sourceEpoch+'-'+this.m.active.segmentNo+'.jsonl',closedAt:Date.now(),byteLength:bytes.length,sha256:hash(bytes),generations:summary(this.records,this.origins,this.m.active.segmentNo)};
  if(!isDeepStrictEqual(rows(bytes),this.records))fail('G_SEGMENT_CORRUPT');atomic(this.n.intent,{op:'seal',entry:e,nextOpenedAt:Date.now()});this.recover();this.records=[];this.bytes=0;this.stamp=fs.statSync(this.file,{bigint:true});this.cleanup();
 }
 cleanup(){const cutoff=Date.now()-limits.rawRetentionSeconds*1000,entries=[];for(const e of this.m.segments){if(e.closedAt>cutoff)break;entries.push(e);if(entries.length===32)break}if(!entries.length)return;const quarantines=[];for(const e of entries){const q=this.m.sourceEpoch+'-'+e.segmentNo+'.replaced';if(readClosed(this.file,this.m,e).some(r=>r.kind==='source_gap'&&r.scope==='process'&&r.reason==='G_ACTIVE_REPLACED'&&r.replacedFile===q))quarantines.push(q)}atomic(this.n.intent,{op:'gc',entries,quarantines});this.recover()}
 schedule(){clearTimeout(this.timer);const delay=this.bytes?Math.max(1,this.m.active.openedAt+limits.segmentMaxAgeSeconds*1000-Date.now()):limits.segmentMaxAgeSeconds*1000;this.timer=setTimeout(()=>{try{this.maintain()}catch(e){if(!e.gapWritten)this.fault=e.message;console.error('[usage] '+e.message)}if(!this.fault)this.schedule()},delay);this.timer.unref()}
 maintain(){if(this.fault)fail(this.fault);if(this.bytes&&Date.now()-this.m.active.openedAt>=limits.segmentMaxAgeSeconds*1000)this.seal();else this.cleanup()}
 append(raw,origin){if(this.fault)fail(this.fault);const buf=Buffer.from(raw);if(buf.length>limits.maxRecordBytes)fail('SOURCE_GAP');const r=rows(buf);if(r.length!==1)fail('G_SEGMENT_INVALID');if(this.replaced){const e=Error('G_ACTIVE_REPLACED');e.gapWritten=true;throw e}this.checkActive(r[0],origin);
  if(this.bytes&&(this.bytes+buf.length>limits.segmentMaxBytes||Date.now()-this.m.active.openedAt>=limits.segmentMaxAgeSeconds*1000))this.seal();
  const row=r[0];if(!(row.generation in this.origins))this.origins[row.generation]=origin??this.m.active.segmentNo;
  if(!(row.generation in this.m.active.origins)){this.m.active.origins[row.generation]=this.origins[row.generation];this.persist()}
  const fd=fs.openSync(this.file,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW);try{const actual=fs.fstatSync(fd);if(actual.uid!==process.getuid()||!actual.isFile()||(actual.mode&0o777)!==0o600)fail('G_SOURCE_UNSAFE');const named=fs.lstatSync(this.file,{bigint:true});if(BigInt(actual.ino)!==this.stamp.ino||BigInt(actual.dev)!==this.stamp.dev||BigInt(actual.size)!==this.stamp.size||actual.nlink!==1||named.ino!==this.stamp.ino||named.dev!==this.stamp.dev)this.activeGap(row,origin);let offset=0;while(offset<buf.length){const n=fs.writeSync(fd,buf,offset);if(!n)fail('SOURCE_GAP');offset+=n}fs.fsyncSync(fd);const end=fs.fstatSync(fd,{bigint:true}),namedAfter=fs.lstatSync(this.file,{bigint:true});if(end.ino!==namedAfter.ino||end.dev!==namedAfter.dev||end.size!==this.stamp.size+BigInt(buf.length)||namedAfter.size!==end.size)this.activeGap(row,origin)}finally{fs.closeSync(fd)}
  this.records.push(row);this.bytes+=buf.length;this.stamp=fs.statSync(this.file,{bigint:true});this.schedule();return this.origins[row.generation];
 }
 close(){clearTimeout(this.timer);if(this.lock!==undefined){fs.closeSync(this.lock);this.lock=undefined}}
}
export function prepareGatewaySegments(file){if(!stores.has(file))stores.set(file,new SegmentWriter(file));return stores.get(file)}
export function appendGatewaySegment(file,raw,origin){return prepareGatewaySegments(file).append(raw,origin)}
export function maintainGatewaySegments(file){return prepareGatewaySegments(file).maintain()}
export function closeGatewaySegments(file){for(const [key,s] of stores)if(file===undefined||key===file){s.close();stores.delete(key)}}
process.once('exit',()=>closeGatewaySegments());
