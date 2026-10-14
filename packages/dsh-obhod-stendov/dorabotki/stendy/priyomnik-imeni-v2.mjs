// B-N-1090 · подставной приёмник ящика: НАСТОЯЩИЕ spoolSender/spoolAgeHours (вырезаны из index.js пакета extract.mjs)
// и НАСТОЯЩИЙ MessageReceipts получателя. Не index.js целиком: тот поднимает Telegram и службу.
// Аргументы: <каталог пакета> <спул получателя> <корень ledger> <предел мс>
// Печатает по строке на файл: ФАЙЛ <имя> · ОТПРАВИТЕЛЬ <spoolSender> · ВОЗРАСТ_Ч <spoolAgeHours> · RECEIPT <id> · ПРИЁМ <исход>
import fs from 'node:fs';import path from 'node:path';
const [pkg,spool,root,predel]=process.argv.slice(2);
const {readSource,extractFunction}=await import(path.join(pkg,'test/extract.mjs'));
const {MessageReceipts,mailEnvelope}=await import(path.join(pkg,'src/message-receipts.js'));
const src=readSource(path.join(pkg,'src/index.js'));
const spoolSender=new Function(extractFunction(src,'spoolSender')+'\nreturn spoolSender;')();
const spoolAgeHours=new Function('fs',extractFunction(src,'spoolAgeHours')+'\nreturn spoolAgeHours;')(fs);
const l=new MessageReceipts(root,{owner:'b1090'});
console.log('ГОТОВ ledger '+l.protocolIdentity());
const konec=Date.now()+Number(predel);
while(Date.now()<konec){
  for(const f of fs.readdirSync(spool).filter(x=>!x.startsWith('.'))){
    const full=path.join(spool,f);const raw=fs.readFileSync(full);const e=mailEnvelope(raw);
    const kto=spoolSender(f),vozrast=spoolAgeHours(f,full).toFixed(1);
    let itog;
    try{const r=l.receive('file:'+full,raw,{sourcePath:full,sender:kto??'',logicalKey:e.logicalKey,expectsReply:e.expectsReply});
      const a=e.protocol?l.acceptEnvelope(r.id,e.protocol,path.basename(spool)):{action:'text'};
      itog=`RECEIPT ${r.id} · sender в ledger ${l.get(r.id).sender} · ПРИЁМ ${a.action}/${a.reason??''}`;}
    catch(x){itog='ОТКАЗ ПРИЁМА: '+x.message;}
    console.log(`ФАЙЛ ${f} · ОТПРАВИТЕЛЬ ${kto} · ВОЗРАСТ_Ч ${vozrast} · ${itog}`);
    fs.unlinkSync(full);
  }
  await new Promise(r=>setTimeout(r,100));
}
l.close();
