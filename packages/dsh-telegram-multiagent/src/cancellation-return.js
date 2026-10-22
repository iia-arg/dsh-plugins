// RU: Определяет проверенный обратный маршрут и доставляет cancellation/pause notices. Начало удалённой отправки отмечается до I/O; неизвестный исход не повторяет операцию автоматически.
// EN: Resolves verified return routes and delivers cancellation/pause notices. Remote dispatch intent precedes I/O; unknown outcomes do not automatically replay the operation.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFile} from 'node:child_process';
import {mailEnvelope} from './message-receipts.js';import {whenText} from './cancellation-description.js';

const inside=(root,file)=>typeof root==='string'&&!!root&&typeof file==='string'&&path.dirname(path.resolve(file))===path.resolve(root);
export // RU: verifiedCoordinator: Проверяет сохранённые свидетельства подписи перед выбором обратного доверенного маршрута.
// EN: verifiedCoordinator: Checks stored signature evidence before choosing a trusted return route.
function verifiedCoordinator(row,ledger) {return !!ledger.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='coordinator_signature_verified' LIMIT 1").get(row.id);}
export // RU: cancellationReturn: Выбирает обратный маршрут cancellation по исходной квитанции, не по тексту модели.
// EN: cancellationReturn: Selects cancellation return routing from the original receipt, not model text.
function cancellationReturn(row,ledger,{spoolDir,a2aDir,remoteReturnRecipients={},coordinatorReturnRecipient='',sharedSenderName='shared-user'}={}) {
  if(row.route!=='a2a')return null;
  let envelope;try{envelope=mailEnvelope(row.raw??Buffer.alloc(0))}catch{}
  const first=envelope?.text?.replace(/^From:\s*\S+\r?\n/,'').split('\n')[0];
  if(envelope?.expectsReply===false&&/^письмо [a-f0-9-]{36} от .+(?: отменено командой \/new владельца, не исполнялось|: ход ранее прерван; дальнейшее исполнение отменено командой \/new владельца)\.$/u.test(first??''))return {kind:'none',reason:'квитанция на квитанцию не создаётся'};
  if(envelope?.expectsReply===false&&/^агент на паузе(?: по \/stop с [^,\n]+)?, письмо [a-f0-9-]{36} в очереди[;( ]/u.test(first??''))return {kind:'none',reason:'квитанция на квитанцию не создаётся'};
  if(envelope?.expectsReply===false&&/^письмо [a-f0-9-]{36} НЕ исполнено: удержано replace-STOP /u.test(first??''))return {kind:'none',reason:'квитанция на квитанцию не создаётся'};
  const origin=ledger.db.prepare('SELECT path FROM sources WHERE receipt_id=? ORDER BY rowid LIMIT 1').get(row.id)?.path;
  const sender=row.sender;
  if(inside(spoolDir,origin)&&/^[a-z][a-z0-9_-]*$/.test(sender??'')&&sender!==sharedSenderName)return {kind:'local',recipient:sender};
  if(a2aDir&&inside(path.join(a2aDir,'in'),origin)&&verifiedCoordinator(row,ledger)&&coordinatorReturnRecipient)return {kind:'remote',recipient:coordinatorReturnRecipient};
  if(a2aDir&&inside(path.join(a2aDir,'in'),origin)&&Object.hasOwn(remoteReturnRecipients,sender??''))return {kind:'remote',recipient:remoteReturnRecipients[sender]};
  return {kind:'unknown',reason:sender===sharedSenderName?'обратный адрес неизвестен: общая учётка coders':'обратный адрес неизвестен'};
}
export // RU: cancellationNotice: Формирует уведомление о сохранённой отмене и границах её подтверждения.
// EN: cancellationNotice: Builds a notice of persisted cancellation and its evidence limits.
function cancellationNotice(row,principal='владельца') {
  if(row.claimed_turn!=null)return `письмо ${row.id} от ${whenText(row.received_at)}: ход ранее прерван; дальнейшее исполнение отменено командой /new ${principal}.`;
  return `письмо ${row.id} от ${whenText(row.received_at)} отменено командой /new ${principal}, не исполнялось.`;
}
// RU: runCourier: Запускает фиксированный курьер с телом через stdin и конечным сроком ожидания.
// EN: runCourier: Runs a fixed courier using stdin and a bounded wait.
function runCourier(binary,args,input,env) {
  return new Promise((resolve,reject)=>{
    const child=execFile(binary,args,{timeout:15000,maxBuffer:65536,...(env?{env}:{})},(error,stdout,stderr)=>{
      if(!error||error.code===4)return resolve();
      if(error.killed||error.signal)return reject(Error('HOLD: исход курьера неизвестен; автоматический повтор запрещён'));
      reject(Error(`Курьер квитанции отказал: ${error.code??error.message}; ${String(stderr).slice(0,250)}`));
    });
    child.stdin.on('error',()=>{});child.stdin.end(input??'');
  });
}
export // RU: deliverCancellationReturn: Доставляет устойчивый возврат; remote intent отмечается до внешнего действия.
// EN: deliverCancellationReturn: Delivers a durable return notice with remote intent persisted before I/O.
async function deliverCancellationReturn(row,root,{localCourier='/usr/local/bin/a2a-send',remoteCourier='/usr/local/bin/tell-komu',a2aDir,remoteReturnRecipients={},coordinatorReturnRecipient='',remoteCourierEnvKey='A2A_TELL_DIR',beforeRemoteDispatch=()=>{}}={}) {
  if(typeof remoteCourierEnvKey!=='string'||!/^[A-Z_][A-Z0-9_]*$/.test(remoteCourierEnvKey)||remoteCourierEnvKey==='A2A_ZERKALO')throw Error('HOLD: invalid or reserved courier environment key');
  const data=JSON.parse(row.body),route=data.destination;
  if(route?.kind==='unknown')throw Error('HOLD: '+route.reason);
  if(typeof data.text!=='string'||data.text.includes('\n'))throw Error('HOLD: негодная строка обратной квитанции');
  if(!route||!/^[a-z][a-z0-9_-]*$/.test(route.recipient??''))throw Error('HOLD: негодный обратный адрес');
  if(route.kind==='local')return runCourier(localCourier,['--bez-kopii',route.recipient],data.text);
  if(route.kind!=='remote'||![...Object.values(remoteReturnRecipients),coordinatorReturnRecipient].filter(Boolean).includes(route.recipient))throw Error('HOLD: неизвестный обратный маршрут');
  if(typeof a2aDir!=='string'||!path.isAbsolute(a2aDir))throw Error('HOLD: не задан собственный каталог обратного a2a-канала');
  const dir=path.join(root,'return-notices');fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const key=crypto.createHash('sha256').update(row.id).digest('hex'),prefix=data.kind==='pause'?'pause-notice':'new-cancel',file=path.join(dir,`dlya-${route.recipient}-${prefix}-${key}.md`);
  const body=`[delivery-v1 id=${prefix}-${key} reply=no]\n${data.text}\n`;
  if(fs.existsSync(file)){if(fs.readFileSync(file,'utf8')!==body)throw Error('HOLD: конфликт сохранённой обратной квитанции');}
  else fs.writeFileSync(file,body,{mode:0o600,flag:'wx'});
  await beforeRemoteDispatch();
  try { return await runCourier(remoteCourier,[file],undefined,{...process.env,[remoteCourierEnvKey]:path.join(a2aDir,'tell'),A2A_ZERKALO:path.join(a2aDir,'polnye')}); } catch(error) { throw Error('HOLD: результат remote-квитанции требует сверки; '+error.message); }
}
