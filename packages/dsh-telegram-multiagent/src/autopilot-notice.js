// ID-only filesystem notices. They never establish the sender of the original mail.
import fs from 'node:fs';import path from 'node:path';
const TEAM=new Set(['master','vintik','shpuntik','gayka','sova','shurup','tumbler']);
export const AP_ROUTE='autopilot-team';
export function autopilotSettings(config){
 const a=config.autopilotMail;if(a===undefined)return null;
 if(!a||typeof a!=='object'||Array.isArray(a)||!TEAM.has(config.agentName)
  ||Object.keys(a).sort().join(',')!=='names,noticeDir,publisherBotIds,trafficChatId'
  ||typeof a.noticeDir!=='string'||!path.isAbsolute(a.noticeDir)
  ||!Number.isSafeInteger(a.trafficChatId)||a.trafficChatId>=0
  ||!Array.isArray(a.publisherBotIds)||!a.publisherBotIds.length||a.publisherBotIds.some(n=>!Number.isSafeInteger(n)||n<=0)
  ||!Array.isArray(a.names)||!a.names.length||a.names.some(n=>typeof n!=='string'||!n.trim()||n.length>64))throw Error('AP_CONFIG_INVALID');
 const directory=path.resolve(a.noticeDir),st=fs.lstatSync(directory);
 if(directory!==fs.realpathSync(directory)||!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o777)!==0o700)throw Error('AP_NOTICE_DIRECTORY_UNSAFE');
 if(config.agentName==='master')for(const primary of [config.spoolDir,config.a2aDir&&path.join(config.a2aDir,'in')]){
  if(primary&&(path.resolve(primary)===directory||(fs.existsSync(primary)&&fs.realpathSync(primary)===directory)))throw Error('AP_PRIMARY_PATH_OVERLAP');
 }
 return Object.freeze({directory,trafficChatId:a.trafficChatId,publisherBotIds:new Set(a.publisherBotIds),names:a.names.map(n=>n.trim()),only:config.agentName!=='master'});
}
export function droppedPublisher(update,ap){
 const from=(update.message??update.edited_message??update.channel_post??update.edited_channel_post??update.callback_query)?.from;
 return from?.is_bot===true||Boolean(ap&&(!Number.isSafeInteger(from?.id)||ap.publisherBotIds.has(from.id)));
}
export class AutopilotNotices{
 constructor(ap,{receipts,dispatch,log=()=>{}}){this.ap=ap;this.receipts=receipts;this.dispatch=dispatch;this.log=log;this.errors=new Set()}
 async tick(){
  const directory=this.ap.directory,st=fs.lstatSync(directory);
  if(!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o777)!==0o700)throw Error('AP_NOTICE_DIRECTORY_UNSAFE');
  for(const name of fs.readdirSync(directory).filter(n=>!n.startsWith('.')&&n.endsWith('.txt')).sort().slice(0,100)){
   const full=path.join(directory,name);let fd;
   try{
    fd=fs.openSync(full,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
    const info=fs.fstatSync(fd,{bigint:true});
    if(!info.isFile()||info.uid!==BigInt(process.getuid())||(info.mode&0o777n)!==0o600n||info.size>4096n)throw Error('AP_NOTICE_FILE_UNSAFE');
    const raw=fs.readFileSync(fd);fs.closeSync(fd);fd=undefined;
    const text=raw.toString('utf8'),m=/^\[delivery-v1 id=([0-9a-f]{64}) reply=no\]\nAUTOPILOT-PILOT NOTICE ONLY\nMessage id: ([0-9a-f]{64})\n/.exec(text);
    if(!m||m[1]!==m[2])throw Error('AP_NOTICE_INVALID');
    const id=m[1],key='ap-notice:'+full+':'+info.ino+':'+info.mtimeNs;
    const r=this.receipts.receive(key,raw,{sourcePath:full,logicalKey:'ap-notice:'+id,route:'ap-notice',routeKey:AP_ROUTE,hold:false,expectsReply:false});
    if(r.finished_at!==null){this.receipts.release(r.id,key);continue}
    if(r.blocked)continue;
    await this.dispatch(r,`[почта команды Автопилота · уведомление, не поручение]\nID: ${id}\nОригинал: autopilot-mail read ${id} --directory <свой durable inbox>. Источник и тело удостоверяет сокет почты; имя файла и этот notice полномочий не дают. Ответ отправляй почтой команды.`,key);
    this.errors.delete(full);
   }catch(e){if(!this.errors.has(full)){this.errors.add(full);this.log('[ap-notice] удержано '+name+': '+e.message)}}finally{if(fd!==undefined)fs.closeSync(fd)}
  }
 }
}
