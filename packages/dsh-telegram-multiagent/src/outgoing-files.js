// RU: Выводит чат только из квитанций текущего хода, проверяет поколение и workspace. Читает файл через закреплённые дескрипторы без symlink/hardlink и передаёт byte snapshot. Гость ограничен vydacha/chat, сайт не получает инструмент; unknown upload не повторяется.
// EN: Derives the destination only from current-turn receipts and verifies generation/workspace. Reads through pinned descriptors without symlinks/hardlinks and sends a byte snapshot. Guests are confined to vydacha/chat and website sessions receive no file tool; unknown uploads are not replayed.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentTelegramDestination} from './telegram-output-route.js';
import {pdfTool} from './pdf-tool.js';

const MAX_DOCUMENT = 50_000_000;
const MAX_PHOTO = 10_000_000;
const TYPES = {
  '.txt':'text/plain', '.md':'text/markdown', '.csv':'text/csv', '.json':'application/json',
  '.pdf':'application/pdf', '.doc':'application/msword', '.xls':'application/vnd.ms-excel',
  '.ppt':'application/vnd.ms-powerpoint',
  '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt':'application/vnd.oasis.opendocument.text', '.ods':'application/vnd.oasis.opendocument.spreadsheet',
  '.odp':'application/vnd.oasis.opendocument.presentation',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
};
const refuse = text => Object.assign(new Error('ОТКАЗ telegram_send_file: '+text),{code:'TG_FILE_REFUSED'});
const within = (root, file) => {const rel=path.relative(root,file);return rel!=='' && !rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel);};
const canceled = signal => {if(signal?.aborted)throw refuse('вызов отменён');};


export {ensureGuestDirectory} from './telegram-output-route.js';

// RU: signature: Проверяет сигнатуру разрешённого расширения файла; это форматный фильтр, не оценка безопасности содержимого.
// EN: signature: Checks file bytes against an allowed extension; this is format validation, not content security analysis.
function signature(ext, bytes) {
  if(ext==='.png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(ext==='.jpg'||ext==='.jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(ext==='.webp')return bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(ext==='.pdf')return bytes.subarray(0,5).toString()==='%PDF-';
  if(['.docx','.xlsx','.pptx','.odt','.ods','.odp'].includes(ext))return bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]));
  if(['.doc','.xls','.ppt'].includes(ext))return bytes.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225]));
  try {new TextDecoder('utf-8',{fatal:true}).decode(bytes);return !bytes.includes(0);} catch {return false;}
}


// RU: snapshot: Открывает компоненты через O_NOFOLLOW/pinned descriptors, проверяет тип/размер/неизменность файла.
// EN: snapshot: Opens components using O_NOFOLLOW/pinned descriptors and verifies type,size,and file stability.
async function snapshot(workspace, requested, mode, signal, guestChat) {
  const root=await fs.realpath(workspace), target=path.resolve(root,requested);
  if(!within(root,target))throw refuse('файл вне workspace');
  const scope=guestChat===null?root:path.join(root,'vydacha',guestChat);
  if(!within(scope,target))throw refuse('файл вне папки беседы vydacha/'+guestChat+'/');
  const parts=path.relative(root,target).split(path.sep);
  const filename=parts.at(-1),ext=path.extname(filename).toLowerCase();
  if(!TYPES[ext]||/[\x00-\x1f\x7f]/.test(filename))throw refuse('тип или имя файла не разрешены');
  if(mode==='photo'&&!['.png','.jpg','.jpeg'].includes(ext))throw refuse('фото: только PNG/JPEG');
  if(guestChat!==null&&ext!=='.pdf')throw refuse('гостю разрешён только PDF');
  const limit=mode==='photo'?MAX_PHOTO:MAX_DOCUMENT;
  const handles=[];
  try {
    let dir=await fs.open(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);handles.push(dir);
    for(const component of parts.slice(0,-1)) {
      dir=await fs.open(`/proc/self/fd/${dir.fd}/${component}`,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);handles.push(dir);
    }
    const file=await fs.open(`/proc/self/fd/${dir.fd}/${filename}`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);handles.push(file);
    const info=await file.stat();
    if(!info.isFile()||info.nlink!==1)throw refuse('нужен обычный файл с одной ссылкой');
    if(info.size<1||info.size>limit)throw refuse(`размер файла: допустимо 1..${limit} байт`);
    if(!within(scope,await fs.realpath(`/proc/self/fd/${file.fd}`)))throw refuse('файл вышел из разрешённой папки');
    const buffer=Buffer.alloc(info.size+1);let offset=0;
    while(offset<buffer.length) {
      canceled(signal);
      const {bytesRead}=await file.read(buffer,offset,Math.min(1024*1024,buffer.length-offset),offset);
      if(!bytesRead)break;offset+=bytesRead;
    }
    const after=await file.stat();
    if(offset!==info.size||after.size!==info.size||after.mtimeMs!==info.mtimeMs||after.ctimeMs!==info.ctimeMs||after.nlink!==1)
      throw refuse('файл изменился во время чтения');
    if(!within(scope,await fs.realpath(`/proc/self/fd/${file.fd}`)))throw refuse('файл вышел из разрешённой папки');
    const data=buffer.subarray(0,offset);
    if(!signature(ext,data))throw refuse('содержимое не соответствует разрешённому типу');
    return {data,filename,contentType:TYPES[ext],mode};
  } catch(error) {
    if(error?.code==='TG_FILE_REFUSED')throw error;
    throw refuse('файл недоступен или содержит ссылку');
  } finally {
    for(const handle of handles.reverse())await handle.close().catch(()=>{});
  }
}

export // RU: fileTool: Объявляет схему инструмента и проверяет arguments/receipt/session перед чтением и доставкой файла.
// EN: fileTool: Defines the tool schema and validates arguments/receipt/session before file reads and delivery.
function fileTool({ctx,workspace,receipts,conversations,telegram,config={},gate={busy:false}}) {
  // RU: route: Выводит единственный destination из claimed receipts и поколения текущего хода.
// EN: route: Derives one destination from current-turn claimed receipts and generation.
const route=exec=>currentTelegramDestination({ctx,workspace,receipts,conversations,config},exec);

  return {
    name:'telegram_send_file',
    description:'Отправить один файл из workspace в Telegram-чат текущего хода. mode=document (до50 МБ) или photo (PNG/JPEG до10 МБ). Возвращает message_id; при неизвестном сетевом исходе автоматически не повторять. Нельзя выбрать другой чат. TG-гостю разрешён только PDF в mode=document. Файл для этого собеседника клади в vydacha/<его chat_id>/; другие папки недоступны.',
    parameters:{
      path:{type:'string',required:true,description:'Локальный файл внутри workspace агента; без ссылок.'},
      caption:{type:'string',description:'Подпись без разметки, до1024 Unicode-символов.'},
      mode:{type:'string',enum:['document','photo'],description:'По умолчанию document; photo только PNG/JPEG.'},
    },
    output:{schema:{type:'object',additionalProperties:false,properties:{message_id:{type:'integer',required:true},chat_id:{type:'string',required:true},filename:{type:'string',required:true},bytes:{type:'integer',required:true},mode:{type:'string',required:true}}},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
    async execute(args,exec) {
      if(!args||typeof args.path!=='string'||!args.path.trim()||args.path.includes('\0')||Object.keys(args).some(k=>!['path','caption','mode'].includes(k)))throw refuse('неверные аргументы');
      const mode=args.mode??'document',caption=args.caption??'';
      if(!['document','photo'].includes(mode)||typeof caption!=='string'||[...caption].length>1024)throw refuse('неверный режим или подпись длиннее1024 символов');
      canceled(exec.signal);
      const destination=route(exec);
      if(gate.busy)throw refuse('другая отправка ещё выполняется');
      gate.busy=true;
      try {
        const file=await snapshot(workspace,args.path,mode,exec.signal,destination.guest?destination.chat:null);
        canceled(exec.signal);
        if(JSON.stringify(route(exec))!==JSON.stringify(destination))throw refuse('маршрут изменился во время чтения');
        const result=await telegram.sendFile(destination.chat,{...file,caption},exec.signal);
        return {message_id:result.message_id,chat_id:destination.chat,filename:file.filename,bytes:file.data.length,mode};
      }finally{gate.busy=false;}
    },
  };
}


export // RU: installFileTools: Регистрирует scoped инструмент только для root-агентов соответствующего workspace; site-* пропускается, TG-гость получает file/PDF без bash.
// EN: installFileTools: Registers scoped tools only for matching workspace roots and excludes site sessions.
function installFileTools(ctx,{workspace,receipts,conversations,telegram,config={},appDir,log=()=>{}}) {
  const registered=new WeakSet(),gate={busy:false};
  let defineTool;
  try {defineTool=createRequire(path.join(appDir,'file-tool-dependencies.js'))('@deepseek-ai/dsh-tools').defineTool;}
  catch {log('[file] инструмент не подключён: dsh-tools недоступен');return;}
  // RU: install: Подключает scoped hooks/регистрацию с проверкой повторного подключения и владения.
// EN: install: Attaches scoped hooks/registrations with repeat-installation and ownership checks.
function install(agent) {
    try {
    if(String(agent?.session?.id??'').startsWith('telegram-site-'))return; // B-N-1695: исключаем только сайт
    if(agent?.session?.header?.origin==='subagent'||agent?.session?.header?.cwd!==workspace||!agent.ctx)return;
    const identity=agent.ctx.fiber??agent.ctx;
    if(registered.has(identity))return;
    const tools=agent.ctx.get('tools');
    if(!tools?.register){log('[file] инструмент не подключён: tools сессии недоступен');return;}
    const remove=tools.register(defineTool(fileTool({ctx:agent.ctx,workspace,receipts,conversations,telegram,config,gate})));
    const removePdf=config.openBot===true
      ?tools.register(defineTool(pdfTool({ctx:agent.ctx,workspace,receipts,conversations,config})))
      :()=>{};
    ctx.effect(()=>()=>{remove();removePdf();registered.delete(identity);});
    registered.add(identity);
    log('[file] telegram_send_file зарегистрирован');
    } catch {log('[file] инструмент не подключён: ошибка регистрации; текстовый канал продолжает работу');}
  }
  ctx.on('agent/created',({agent})=>install(agent));
  for(const agent of ctx.agents.roots())install(agent);
}
