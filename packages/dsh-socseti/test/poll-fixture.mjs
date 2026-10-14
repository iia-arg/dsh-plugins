import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Store} from '../src/store.mjs';import {createTelegramWorker} from '../src/telegram-worker.mjs';
export async function fixture(t,{poll=async()=>[],action=async()=>({message_id:1})}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socseti-b1810-'));const store=new Store(dir,{telegram:'-202'});const logs=[];let polls=0,stops=0;
 const api={stop(){stops++},async call(method,args,document){
  if(method==='getMe')return{id:77,is_bot:true,username:'ostrov_smm_bot'};
  if(method==='getWebhookInfo')return{url:''};if(method==='getChat')return{id:Number(args.chat_id),type:Number(args.chat_id)===-101?'supergroup':'channel'};
  if(method==='getChatMember')return{status:'administrator',can_post_messages:true};
  if(method==='getUpdates'){polls++;return poll(polls,args)};
  if(method==='answerCallbackQuery')return true;return action(method,args,document);
 }};
 const worker=await createTelegramWorker(store,{approvalChatId:-101},{api,log:r=>logs.push(r)});
 t.after(async()=>{await worker.stop();store.close();fs.rmSync(dir,{recursive:true,force:true});if(fs.existsSync(dir))throw Error('fixture not removed')});
 return {store,worker,logs,polls:()=>polls,stops:()=>stops};
}
