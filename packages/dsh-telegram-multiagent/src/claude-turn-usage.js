// Approximate parent usage from live events only. Never replay work or read session history.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
export const MAX_TURN_USAGE_BYTES=8*1024*1024;
const integer=n=>Number.isSafeInteger(n)&&n>=0;
// Native callbacks reuse the Session object; restored history never emits session/event.
// Weak keys keep one monotonic end watermark per live session/owner, across lease remounts.
const ended=new WeakMap();
const mounted=new Map();
let participantNotice=false;
export function acquireClaudeTurnUsage(root,_agentName,options){
 let participant;try{participant=os.userInfo().username}catch{participant=null}
 const key=JSON.stringify([root,participant]);let shared=mounted.get(key);
 if(!shared){shared={writer:new ClaudeTurnUsage(root,participant,options),refs:0};mounted.set(key,shared)}
 shared.refs++;let closed=false;
 return {
  observe(session,event){if(!closed)shared.writer.observe(session,event)},
  close(){if(closed)return;closed=true;if(--shared.refs===0){shared.writer.close();mounted.delete(key)}}
 };
}
export class ClaudeTurnUsage {
 constructor(root,participant,{log=()=>{}}={}){
  this.root=root;this.participant=participant;this.log=log;this.file=path.join(root,'ap-usage-hodov-v1.jsonl');this.pending=new Map();
 }
 notice(reason){if(reason==='CLAUDE_TURN_USAGE_PARTICIPANT_INVALID'){if(participantNotice)return;participantNotice=true}try{this.log('[usage] '+reason+' file='+this.file)}catch{}}
 observe(session,event){
  try{
   if(!['turn/start','assistant/message','turn/end'].includes(event.type))return;
   const sid=session?.id,created=session?.header?.createdAt,turn=event.data?.turn;
   if(typeof sid!=='string'||!sid||sid.length>256||!integer(created)||!integer(turn))return;
   const owner=JSON.stringify([this.root,this.participant,created]);
   let ends=ended.get(session);
   if(turn<=(ends?.get(owner)??-1))return;
   const key=JSON.stringify([sid,created,turn]);
   if(event.type==='turn/start'){
    for(const [k,row] of this.pending)if(row.sid===sid)this.pending.delete(k);
    return;
   }
   if(event.type==='assistant/message'){
    if(event.data?.message?.source?.provider!=='claude-oauth'||event.data.usage===undefined)return;
    let row=this.pending.get(key);
    if(!row){
     if(this.pending.size>=64){this.pending.delete(this.pending.keys().next().value);this.notice('CLAUDE_TURN_USAGE_PENDING_LIMIT')}
     row={sid,created,turn,input:0,cached:0,cache_write:0,output:0,vyzovov:0,lastSeq:-1,invalid:false};this.pending.set(key,row);
    }
    if(!integer(event.seq)){row.invalid=true;return}
    if(event.seq<=row.lastSeq)return;
    row.lastSeq=event.seq;
    const u=event.data.usage;
    const values=[u?.inputTokens,u?.cacheReadTokens===undefined?0:u.cacheReadTokens,u?.cacheWriteTokens===undefined?0:u.cacheWriteTokens,u?.outputTokens];
    const [input,cached,cache_write,output]=values;
    const totals={input:row.input+input+cached+cache_write,cached:row.cached+cached,cache_write:row.cache_write+cache_write,output:row.output+output,vyzovov:row.vyzovov+1};
    if(!values.every(integer)||!Object.values(totals).every(integer)){row.invalid=true;this.notice('CLAUDE_TURN_USAGE_INVALID');return}
    Object.assign(row,totals);return;
   }
   // Mark before append: an ambiguous write error must never cause a second row on retry.
   if(!ends){ends=new Map();ended.set(session,ends)}ends.set(owner,turn);
   const row=this.pending.get(key);this.pending.delete(key);
   const status=event.data?.reason?.kind;
   if(!row||row.invalid||!row.vyzovov||!integer(event.time)||typeof status!=='string'||!status||status.length>64||['aborted','error'].includes(status))return;
   if(typeof this.participant!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(this.participant)){this.notice('CLAUDE_TURN_USAGE_PARTICIPANT_INVALID');return}
   this.append({schemaVersion:1,kind:'turn_end',participant:this.participant,engine:'claude',ts:new Date(event.time).toISOString(),sessionId:sid,sessionCreated:created,turn,status,input:row.input,cached:row.cached,cache_write:row.cache_write,output:row.output,vyzovov:row.vyzovov,polnota:'parent_only'});
  }catch{this.notice('CLAUDE_TURN_USAGE_WRITE_FAILED')}
 }
 append(row){
  const root=fs.lstatSync(this.root);
  if(!root.isDirectory()||root.uid!==process.getuid()||(root.mode&0o077))throw Error('unsafe directory');
  const safe=st=>st.isFile()&&st.uid===process.getuid()&&(st.mode&0o777)===0o600&&st.nlink===1;
  const open=()=>fs.openSync(this.file,fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK,0o600);
  const raw=JSON.stringify(row)+'\n';let fd;
  try{
   fd=open();const st=fs.fstatSync(fd);if(!safe(st))throw Error('unsafe file');
   let seal='';
   if(st.size){const last=Buffer.alloc(1);if(fs.readSync(fd,last,0,1,st.size-1)!==1)throw Error('short read');if(last[0]!==10)seal='\n'}
   if(st.size+Buffer.byteLength(seal+raw)>MAX_TURN_USAGE_BYTES){
    const previous=this.file+'.1';
    try{if(!safe(fs.lstatSync(previous)))throw Error('unsafe previous file')}catch(e){if(e.code!=='ENOENT')throw e}
    fs.closeSync(fd);fd=undefined;fs.renameSync(this.file,previous);fd=open();if(!safe(fs.fstatSync(fd)))throw Error('unsafe new file');seal='';
   }
   fs.appendFileSync(fd,seal+raw);
  }finally{if(fd!==undefined)fs.closeSync(fd)}
 }
 close(){this.pending.clear()}
}
