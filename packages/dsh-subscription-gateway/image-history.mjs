// RU: При сжатии убирать только bridge-owned image results, связанные с точными tool IDs и границей checkpoint. Пользовательские изображения не стираются; restore после failure не допускает слепой перезаписи конкурентной истории.
// EN: During compaction remove only bridge-owned image results matched by exact tool IDs and checkpoint boundary. User images remain; failure restoration must not blindly overwrite concurrent history.

import fs from 'node:fs';import {randomUUID} from 'node:crypto';import {StringDecoder} from 'node:string_decoder';
const MARKER='<dsh-read-image-v1>';
const NOTICE='Изображение read_image снято из контекста при сжатии; при необходимости прочитай файл снова.';
// RU: snapshot: При сжатии убирать только bridge-owned image results, связанные с точными tool IDs и границей checkpoint. Пользовательские изображения не стираются; restore после failure не допускает слепой перезаписи конкурентной истории.
// EN: snapshot: During compaction remove only bridge-owned image results matched by exact tool IDs and checkpoint boundary. User images remain; failure restoration must not blindly overwrite concurrent history.
function snapshot(file){const stat=fs.lstatSync(file);if(!stat.isFile())throw Error('read_image history: not a regular file');return stat;}
// RU: unchanged: При сжатии убирать только bridge-owned image results, связанные с точными tool IDs и границей checkpoint. Пользовательские изображения не стираются; restore после failure не допускает слепой перезаписи конкурентной истории.
// EN: unchanged: During compaction remove only bridge-owned image results matched by exact tool IDs and checkpoint boundary. User images remain; failure restoration must not blindly overwrite concurrent history.
function unchanged(file,stat){const now=snapshot(file);if(now.ino!==stat.ino||now.size!==stat.size||now.mtimeMs!==stat.mtimeMs)throw Error('read_image history changed during cleanup');}
// RU: records: При сжатии убирать только bridge-owned image results, связанные с точными tool IDs и границей checkpoint. Пользовательские изображения не стираются; restore после failure не допускает слепой перезаписи конкурентной истории.
// EN: records: During compaction remove only bridge-owned image results matched by exact tool IDs and checkpoint boundary. User images remain; failure restoration must not blindly overwrite concurrent history.
function* records(file,stat){
 const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(65536),decoder=new StringDecoder('utf8');let pending='',left=stat.size;
 try{
  while(left>0){const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,left),null);if(!n)throw Error('read_image history truncated during read');left-=n;pending+=decoder.write(buffer.subarray(0,n));let end;
   while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);yield {line,ending:'\n',row:line.trim()?JSON.parse(line):null};}
  }
  pending+=decoder.end();if(pending)yield {line:pending,ending:'',row:pending.trim()?JSON.parse(pending):null};
 }finally{fs.closeSync(fd);}
 unchanged(file,stat);
}
// RU: toolIds: При сжатии убирать только bridge-owned image results, связанные с точными tool IDs и границей checkpoint. Пользовательские изображения не стираются; restore после failure не допускает слепой перезаписи конкурентной истории.
// EN: toolIds: During compaction remove only bridge-owned image results matched by exact tool IDs and checkpoint boundary. User images remain; failure restoration must not blindly overwrite concurrent history.
function toolIds(file,stat,toolName){
 const ids=new Set();for(const {row} of records(file,stat))if(Array.isArray(row?.message?.content))for(const block of row.message.content)if(block?.type==='tool_use'&&block.name===toolName&&typeof block.id==='string')ids.add(block.id);return ids;
}
// RU: hasMcpImageCalls: При сжатии убирать только bridge-owned image results, связанные с точными tool IDs и границей checkpoint. Пользовательские изображения не стираются; restore после failure не допускает слепой перезаписи конкурентной истории.
// EN: hasMcpImageCalls: During compaction remove only bridge-owned image results matched by exact tool IDs and checkpoint boundary. User images remain; failure restoration must not blindly overwrite concurrent history.
export function hasMcpImageCalls(file,toolName){return toolIds(file,snapshot(file),toolName).size>0;}
// RU: stripMcpImages: При сжатии убирать только bridge-owned image results, связанные с точными tool IDs и границей checkpoint. Пользовательские изображения не стираются; restore после failure не допускает слепой перезаписи конкурентной истории.
// EN: stripMcpImages: During compaction remove only bridge-owned image results matched by exact tool IDs and checkpoint boundary. User images remain; failure restoration must not blindly overwrite concurrent history.
export function stripMcpImages(file,{toolName,beforeUuid,allowedIds}={}){
 if(typeof toolName!=='string'||!/^mcp__.+__read_image$/.test(toolName))throw Error('read_image history: exact MCP tool name required');
 const stat=snapshot(file),ids=allowedIds??toolIds(file,stat,toolName);let removed=0,boundarySeen=beforeUuid===undefined;
 const temp=file+'.image-prune-'+randomUUID();let fd;
 const strip=blocks=>!Array.isArray(blocks)||!blocks.some(b=>b?.type==='text'&&b.text===MARKER)?blocks:blocks.map(b=>{if(b?.type!=='image')return b;removed++;return {type:'text',text:NOTICE};});
 try{
  fd=fs.openSync(temp,'wx',stat.mode&0o777);
  for(const {line,ending,row} of records(file,stat)){
   if(beforeUuid!==undefined&&row?.type==='system'&&row.subtype==='compact_boundary'&&row.uuid===beforeUuid)boundarySeen=true;
   const before=removed;
   if((beforeUuid===undefined||!boundarySeen)&&Array.isArray(row?.message?.content)){
    let ours=false;
    row.message.content=row.message.content.map(block=>{
     if(block?.type!=='tool_result'||!ids.has(block.tool_use_id))return block;
     if(Array.isArray(block.content)&&block.content.some(b=>b?.type==='text'&&b.text===MARKER)){ours=true;return {...block,content:strip(block.content)};}return block;
    });

    if(ours)row.toolUseResult=strip(row.toolUseResult);
   }
   fs.writeFileSync(fd,(removed!==before?JSON.stringify(row):line)+ending);
  }
  if(!boundarySeen)throw Error('read_image history: compact boundary not found');
  fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  unchanged(file,stat);if(removed)fs.renameSync(temp,file);
 }finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
 return removed;
}
// RU: compactMcpHistory: При сжатии убирать только bridge-owned image results, связанные с точными tool IDs и границей checkpoint. Пользовательские изображения не стираются; restore после failure не допускает слепой перезаписи конкурентной истории.
// EN: compactMcpHistory: During compaction remove only bridge-owned image results matched by exact tool IDs and checkpoint boundary. User images remain; failure restoration must not blindly overwrite concurrent history.
export async function compactMcpHistory(compact,file,sessionId,usage,toolName){
 if(!fs.existsSync(file))return compact(file,sessionId,usage);

 const ids=toolIds(file,snapshot(file),toolName);
 const result=await compact(file,sessionId,usage);
 if(result.sdelano){
  if(!ids.size){result.mcpImageBlocksRemoved=0;return result;}
  try{result.mcpImageBlocksRemoved=stripMcpImages(file,{toolName,allowedIds:ids});}
  catch(e){result.mcpImageCleanupError=String(e.message);}
 }
 return result;
}
