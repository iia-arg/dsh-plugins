// RU: Формирует ограниченные описания отменяемых receipts/inbox/attachments с датой, источником и первыми словами. Описание не удостоверяет полномочия отправителя и не заменяет исход отмены.
// EN: Builds bounded cancellation descriptions for receipts/inbox/attachments with time, source, and a preview. Attribution is not authentication and does not replace cancellation evidence.
import {mailEnvelope} from './message-receipts.js';
export // RU: firstWords: Ограничивает текст предпросмотра без объявления его полным содержимым.
// EN: firstWords: Bounds preview text without claiming complete content.
function firstWords(value) {
  const text=String(value??'').replace(/\s+/gu,' ').trim(),chars=Array.from(text);
  return chars.slice(0,120).join('')+(chars.length>120?'…':'');
}
export // RU: whenText: Переводит наблюдённый timestamp в явную дату; неизвестное время не выдумывает.
// EN: whenText: Formats observed timestamps explicitly without inventing missing times.
function whenText(value) {
  const n=Number(value);return value!==null&&value!==undefined&&Number.isFinite(n)&&Math.abs(n)<=8640000000000000?new Date(n).toISOString():'время неизвестно';
}
// RU: telegramSender: Получает подпись отправителя из подтверждённого update, не назначает полномочий именем.
// EN: telegramSender: Attributes the sender from an update without granting authority through a name.
function telegramSender(from,chat) {
  return from?firstWords(`${[from.first_name,from.last_name].filter(Boolean).join(' ')}${from.username?' @'+from.username:''}${from.id!==undefined?' id='+from.id:''}`)||'чат '+chat:'чат '+chat;
}
export // RU: describeReceipt: Даёт ограниченное описание конкретной квитанции для отмены.
// EN: describeReceipt: Builds a bounded cancellation description for one receipt.
function describeReceipt(row,coordinator=false) {
  let sender=(coordinator?'координатор (подпись проверена)':row.sender)||'отправитель не указан',text='тело недоступно';
  if(row.raw)try {
    if(row.route==='tg'){
      const message=JSON.parse(Buffer.from(row.raw).toString('utf8')).message;
      sender=telegramSender(message?.from,message?.chat?.id??row.route_key);text=message?.text??message?.caption??'[вложение]';
    }else{
      text=mailEnvelope(row.raw).text;
      const from=/^From:\s*(\S+)\r?\n/.exec(text);
      if(from){if(!row.sender&&!coordinator)sender=from[1];text=text.slice(from[0].length);}
    }
  }catch{text='первые слова недоступны; исходные байты сохранены';}
  return {sender:firstWords(sender),receivedAt:row.received_at,preview:firstWords(text)};
}
export // RU: describeAttachment: Описывает отменяемое вложение по manifest и его устойчивому ID.
// EN: describeAttachment: Describes a cancellable attachment from its manifest and durable ID.
function describeAttachment(request,receipts) {
  let sender=request.sender||'чат '+request.chat;
  for(const row of receipts)if(row.route==='tg'&&row.raw)try{
    const message=JSON.parse(Buffer.from(row.raw).toString('utf8')).message;
    if(String(message?.chat?.id)===String(request.chat)&&message?.message_id===request.messageId){sender=telegramSender(message.from,request.chat);break;}
  }catch{}
  return {sender:firstWords(sender),receivedAt:request.createdAt,preview:firstWords(request.caption||request.original_name||request.kind||'[вложение]')};
}
export // RU: describeInbox: Описывает сообщение очереди без подмены неизвестного отправителя владельцем.
// EN: describeInbox: Describes an inbox item without treating unknown senders as owners.
function describeInbox(message,events,catalog) {
  const text=(message.content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
  const event=events.findLast(e=>e.type==='agent/inbox/spliced'&&e.data?.inserted?.some(m=>m.id===message.id));
  let schedules=catalog.filter(t=>t.lastDelivery?.messageId===message.id).map(t=>({id:t.id,kind:t.kind,title:t.title,scheduledAt:t.lastDelivery.scheduledAt})),preview=text;
  if(message.source?.kind==='schedule')try{
    const batch=/^reminders_json: (.+)$/m.exec(text),single=/^schedule_id_json: (.+)$/m.exec(text),prompt=/^reminder_prompt_json: (.+)$/m.exec(text),when=/^occurrence_at: (.+)$/m.exec(text);
    const deliveries=batch?JSON.parse(batch[1]):single?[{schedule_id:JSON.parse(single[1]),occurrence_at:when?.[1],reminder_prompt:prompt?JSON.parse(prompt[1]):''}]:[];
    if(!Array.isArray(deliveries)||deliveries.some(d=>typeof d?.schedule_id!=='string'||typeof d.occurrence_at!=='string'))throw Error('unknown schedule framing');
    if(deliveries.length){schedules=deliveries.map(d=>{const record=catalog.find(t=>t.id===d.schedule_id);return {id:d.schedule_id,kind:record?.kind??'вид неизвестен',title:record?.title??'заголовок неизвестен',scheduledAt:d.occurrence_at}});preview=deliveries.map(d=>d.reminder_prompt??'').join(' / ');}
  }catch{preview='метаданные расписания не разобраны; '+text;}
  return {sender:message.source?.kind==='schedule'?'расписатель':message.source?.senderSessionId??message.source?.kind??'источник не указан',receivedAt:event?.time,preview:firstWords(preview),deliveredSchedules:schedules};
}
