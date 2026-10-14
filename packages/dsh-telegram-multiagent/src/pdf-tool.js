// Local ReportLab renderer; destination derives exclusively from current receipts.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {currentTelegramDestination,ensureGuestDirectory} from './telegram-output-route.js';
const SCRIPT=fileURLToPath(new URL('./pdf-calculation.py',import.meta.url));
const refuse=(reason='неверные данные, путь или отказ генератора')=>Object.assign(new Error('ОТКАЗ telegram_make_pdf: '+reason),{code:'TG_PDF_REFUSED'});
const LETTERHEADS=['general_portrait','general_landscape','legal'];

function renderPdf(input,templatesDir,signal) {
  return new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/python3',['-B',SCRIPT,'--templates-dir',templatesDir],{stdio:['pipe','pipe','pipe'],signal});
    const chunks=[];let size=0,failed=false,diagnostic='';
    child.stderr.on('data',data=>{if(diagnostic.length<2048)diagnostic+=data.toString('utf8').slice(0,2048-diagnostic.length)});
    const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL')},30000);
    child.stdout.on('data',data=>{size+=data.length;if(size>10_000_000){failed=true;child.kill('SIGKILL')}else chunks.push(data)});
    child.on('error',()=>{failed=true;clearTimeout(timer);reject(refuse())});
    child.stdin.on('error',()=>{failed=true});
    child.on('close',code=>{clearTimeout(timer);const data=Buffer.concat(chunks);
      if(failed||code!==0||!data.subarray(0,5).equals(Buffer.from('%PDF-'))){
        const message=diagnostic.trim();
        reject(refuse(message.startsWith('ОТКАЗ PDF: бланк ')||message==='ОТКАЗ PDF: каталог фирменных бланков не настроен'
          ?message.replace('ОТКАЗ PDF: ',''):undefined));
      }else resolve(data)});
    child.stdin.end(input);
  });
}

export function pdfTool(options) {
  const route=exec=>currentTelegramDestination(options,exec);
  return {
    name:'telegram_make_pdf',
    description:'Собрать PDF-предложение Остров из quote API Марка без пересчёта. kind: group/biggroup/resident для старого quote, для saved берётся result.kind; quote — прежний полный результат quote без ссылки; либо result — полный DTO plan.create/read/edit с result.kind, result.quote, result.url и result.updatedAt, PDF печатает видимую кликабельную ссылку; передай ровно одно из quote/result, не HTTP-конверт. guestName — имя гостя. letterhead: general_portrait — общий вертикальный (по умолчанию); general_landscape — общий горизонтальный для широких таблиц; legal — юридический для официальных писем или по явной просьбе. Выбор 4/5 недоступен. Файл кладётся в vydacha текущего Telegram-чата. Вернёт path для telegram_send_file; ничего не отправляет сам.',
    parameters:{kind:{type:'string',enum:['group','biggroup','resident'],description:'Для старого quote обязательно; saved result содержит собственный kind.'},
      quote:{type:'object',additionalProperties:true,description:'Прежний quote для несохранённого расчёта, без ссылки. Не передавать вместе с result.'},
      result:{type:'object',additionalProperties:true,description:'Полный сохранённый DTO plan.create/read/edit: kind, quote, url, updatedAt, не внешняя HTTP-обёртка. Не передавать вместе с quote.'},
      guestName:{type:'string',required:true},
      letterhead:{type:'string',enum:LETTERHEADS,default:'general_portrait',description:'Бланк: general_portrait — №1, обычный расчёт; general_landscape — №2, широкие таблицы; legal — №3, официальное письмо или явная просьба.'}},
    output:{schema:{type:'object',additionalProperties:false,properties:{path:{type:'string',required:true}}},
      render:(_a,value)=>[{type:'text',text:JSON.stringify(value)}]},
    async execute(args,exec) {
      if(!args||Object.keys(args).some(k=>!['kind','quote','result','guestName','letterhead'].includes(k))
          ||typeof args.guestName!=='string'
          ||!args.guestName.trim()||[...args.guestName].length>128)throw refuse();
      if(Object.hasOwn(args,'quote')===Object.hasOwn(args,'result'))throw refuse('передай quote или сохранённый result, но не оба');
      const saved=Object.hasOwn(args,'result');
      const kind=saved?args.result?.kind:args.kind;
      if(!['group','biggroup','resident'].includes(kind))throw refuse('вид расчёта отсутствует или неверен');
      const quote=saved?args.result?.quote:args.quote;
      if(!quote||Array.isArray(quote)||typeof quote!=='object')throw refuse('данные расчёта отсутствуют');
      if(saved){
        if(!args.result||Array.isArray(args.result)||typeof args.result!=='object'
            ||(Object.hasOwn(args.result,'kind')&&Object.hasOwn(args,'kind')&&args.result.kind!==args.kind))throw refuse('вид сохранённого расчёта не совпадает');
        if(typeof args.result.updatedAt!=='string'||!args.result.updatedAt)throw refuse('дата сохранённого расчёта отсутствует');
        const url=args.result.url;
        try {
          if(typeof url!=='string'||!url||url.length>2048||/\s/.test(url)||/[\x00-\x1f]/.test(url))throw Error();
          const parsed=new URL(url);
          if(!['http:','https:'].includes(parsed.protocol)||!parsed.hostname||parsed.username||parsed.password)throw Error();
        } catch {throw refuse('ссылка сохранённого расчёта отсутствует или неверна')}
      }
      const letterhead=Object.hasOwn(args,'letterhead')?args.letterhead:'general_portrait';
      if(!LETTERHEADS.includes(letterhead))throw refuse('неизвестный бланк: доступны №1, №2 и №3');
      const templatesDir=options.config?.pdfTemplatesDir;
      if(typeof templatesDir!=='string'||!path.isAbsolute(templatesDir))throw refuse('каталог фирменных бланков не настроен');
      const input=JSON.stringify({...args,letterhead});if(Buffer.byteLength(input)>262144)throw refuse();
      const destination=route(exec);
      exec.signal?.throwIfAborted();
      const data=await renderPdf(input,templatesDir,exec.signal);
      exec.signal?.throwIfAborted();
      if(JSON.stringify(route(exec))!==JSON.stringify(destination))throw refuse();
      const directory=await ensureGuestDirectory(options.workspace,destination.chat);
      const dir=await fs.open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      let file,filename;
      try {
        exec.signal?.throwIfAborted();
        if(await fs.realpath(`/proc/self/fd/${dir.fd}`)!==directory)throw refuse();
        for(let attempt=0;attempt<10;attempt++) {
          exec.signal?.throwIfAborted();
          filename=`raschet-${Date.now()+attempt}.pdf`;
          try {file=await fs.open(`/proc/self/fd/${dir.fd}/${filename}`,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);break}
          catch(error){if(error.code!=='EEXIST')throw error}
        }
        if(!file)throw refuse();
        exec.signal?.throwIfAborted();
        await file.writeFile(data);await file.sync();
        exec.signal?.throwIfAborted();
        if(await fs.realpath(`/proc/self/fd/${dir.fd}`)!==directory||JSON.stringify(route(exec))!==JSON.stringify(destination))throw refuse();
        const root=await fs.realpath(options.workspace);
        exec.signal?.throwIfAborted();
        return {path:path.relative(root,path.join(directory,filename))};
      } catch {
        if(file)await fs.unlink(`/proc/self/fd/${dir.fd}/${filename}`).catch(()=>{});
        throw refuse();
      } finally {await file?.close();await dir.close()}
    },
  };
}
