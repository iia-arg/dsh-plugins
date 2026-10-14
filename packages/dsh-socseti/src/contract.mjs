export const PLATFORMS=['vk','instagram','threads','telegram'];
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';
export class OwnerIdUnavailable extends Error{}
export function approvers(){
 const r=spawnSync(process.env.SOCSETI_OWNER_READER??'/usr/local/bin/vladelec-tg-id',[],{encoding:'utf8',timeout:3000,maxBuffer:4096});
 if(r.status!==0||!/^\d{5,15}\n$/.test(r.stdout??'')||Number(r.stdout)<=0)throw new OwnerIdUnavailable('владелец не установлен: '+(r.stderr?.trim()||r.error?.message||'неверный ответ читателя'));
 const file=process.env.SOCSETI_APPROVERS_FILE??'/etc/socseti/approvers.json';
 try{
  const dir=fs.lstatSync(path.dirname(file)),st=fs.lstatSync(file);
  if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==0||(dir.mode&0o022)!==0||!st.isFile()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o022)!==0||st.size>4096)throw Error('владелец/права/тип файла или каталога');
  const list=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(list)||list.some(x=>!Number.isSafeInteger(x)||x<10000||x>999999999999999))throw Error('нужен JSON-массив целых Telegram-ID по 5–15 цифр');
  return [...new Set([Number(r.stdout),...list])];
 }catch(e){throw new OwnerIdUnavailable('список одобряющих не установлен: '+file+': '+e.message)}
}
export const LIMITS=Object.freeze({bodyBytes:65536,textCharacters:4096,textBytes:16384,drafts:100,versions:20,events:1000,ttlMs:7*24*60*60*1000});
const request={type:'string',minLength:8,maxLength:80,pattern:'^[a-zA-Z0-9][a-zA-Z0-9._:-]+$'};
const token={type:'string',pattern:'^[a-f0-9]{64}$'};
const id={type:'string',format:undefined,minLength:36,maxLength:36,pattern:'^[a-f0-9-]+$'};delete id.format;
const text={type:'string',minLength:1,maxLength:LIMITS.textCharacters};
const schema=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const tools=[
 {name:'draft_post',description:'Создать только текстовый черновик поста для одной закреплённой площадки Острова. Требует одобрения человека, не публикует. request_id повторять только для того же запроса.',inputSchema:schema({request_id:request,platform:{type:'string',enum:PLATFORMS},text})},
 {name:'revise_draft',description:'Новая версия своего черновика по draft_token только до решения человека (pending_approval). После решения нужен новый черновик. Не читает другие черновики и не публикует.',inputSchema:schema({request_id:request,draft_id:id,draft_token:token,expected_version:{type:'integer',minimum:1,maximum:LIMITS.versions},text})},
 {name:'draft_reply',description:'Только черновик ответа на конкретное служебное событие по event_token. Адресат берётся из события, не из аргументов. Все ответы требуют одобрения.',inputSchema:schema({request_id:request,event_token:token,text})},
 {name:'status',description:'Технический статус службы без содержимого событий и черновиков.',inputSchema:schema({})}
];
const allowed={anna:['draft_post','revise_draft','draft_reply'],varvara:['draft_post','revise_draft','draft_reply'],monitor:['status']};
export function toolsForRole(role){return tools.filter(t=>(allowed[role]??[]).includes(t.name))}
