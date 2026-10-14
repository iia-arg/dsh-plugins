import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
const refuse = text => Object.assign(new Error('ОТКАЗ Telegram output: '+text),{code:'TG_FILE_REFUSED'});

export // RU: ensureGuestDirectory: Создаёт папку выдачи гостя через закреплённые directory descriptors, не следует symlink.
// EN: ensureGuestDirectory: Creates the guest output directory through pinned directory descriptors without following symlinks.
async function ensureGuestDirectory(workspace, chat) {
  if (!/^(-?[1-9][0-9]*)$/.test(String(chat))) throw refuse('неверный chat_id папки беседы');
  const root=await fs.realpath(workspace),handles=[];
  try {
    let dir=await fs.open(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);handles.push(dir);
    for(const component of ['vydacha',String(chat)]) {
      const target=`/proc/self/fd/${dir.fd}/${component}`;
      try {await fs.mkdir(target,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
      dir=await fs.open(target,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);handles.push(dir);
    }
    const expected=path.join(root,'vydacha',String(chat));
    if(await fs.realpath(`/proc/self/fd/${dir.fd}`)!==expected)throw refuse('папка беседы перемещена');
    return expected;
  } catch(error) {
    if(error?.code==='TG_FILE_REFUSED')throw error;
    throw refuse('папка беседы недоступна или содержит ссылку');
  } finally {for(const handle of handles.reverse())await handle.close().catch(()=>{});}
}


export function currentTelegramDestination({ctx,workspace,receipts,conversations,config={}},exec) {
    const allowed=new Set((config.allowedUsers??[]).map(Number));
    const session=exec.agent?.session, header=session?.header;
    if(!header||header.origin==='subagent'||header.id!==session.id||!Number.isSafeInteger(header.createdAt))throw refuse('нужна корневая сессия канала');
    if(typeof header.cwd!=='string'||path.resolve(header.cwd)!==path.resolve(workspace))throw refuse('workspace сессии не совпал');
    const boundary=ctx.get('sessionProjections')?.stateOf(session,'turnBoundary');
    if(!boundary||!Number.isSafeInteger(boundary.openTurnStartSeq)||boundary.openTurnStartSeq<0||!Number.isSafeInteger(boundary.lastTurn))throw refuse('нет открытого хода');
    const pinned=receipts.db.prepare('SELECT route_key FROM channel_sessions WHERE session_id=? AND session_created=?').get(session.id,header.createdAt);
    if(!pinned||conversations.holdsSession(session.id))throw refuse('сессия не текущая или удержана');
    const rows=receipts.managed(session.id).filter(r=>r.session_created===header.createdAt&&r.claimed_turn===boundary.lastTurn&&r.finished_at===null);
    if(!rows.length||rows.some(r=>r.blocked||r.route!=='tg'||!/^(-?[1-9][0-9]*)$/.test(String(r.route_key))))throw refuse('нет однозначного Telegram-маршрута текущего хода');
    const chats=new Set(rows.map(r=>String(r.route_key)));
    if(chats.size!==1)throw refuse('ход содержит несколько чатов');
    const chat=[...chats][0];
    if(session.id.startsWith('telegram-site-'))throw refuse('сайт не Telegram-чат');
    let guest=session.id.startsWith('telegram-gost-');
    if(config.openBot===true) {
      const privileged=rows.map(r=>{
        let msg;try{msg=JSON.parse(Buffer.from(r.raw??'').toString('utf8')).message;}catch{throw refuse('нет подтверждённого отправителя');}
        if(!Number.isSafeInteger(msg?.from?.id)||msg.from.id<=0||msg.from.is_bot===true||!Number.isSafeInteger(msg?.chat?.id)||String(msg.chat.id)!==chat)
          throw refuse('отправитель или чат квитанции не подтверждены');
        return allowed.has(msg.from.id);
      });
      guest=guest||privileged.some(p=>!p);
    }
    return {chat,guest,session:session.id,created:header.createdAt,turn:boundary.lastTurn};
  }
