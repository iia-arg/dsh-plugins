// RU: Читает сохранённую беседу без запуска её драйвера для проверки paused/старых поколений. Неизвестный снимок не выдаётся за здоровый и не перезаписывается.
// EN: Inspects persisted conversations without starting their driver to verify paused/older generations. An unavailable snapshot is not reported as healthy or overwritten.
import path from 'node:path';


export // RU: inspectColdConversation: Читает состояние беседы без пробуждения драйвера.
// EN: inspectColdConversation: Inspects a conversation without waking its driver.
async function inspectColdConversation(persistence, projections, binding, cwd) {
  if(typeof persistence?.open!=='function'||typeof projections?.restore!=='function')
    throw Error('Нет хранилища или проекций для проверки холодной сессии');
  const signal=AbortSignal.timeout(15000);
  const handle=await persistence.open(binding.session_id,'read',{signal});
  try { return await readColdHandle(handle,projections,binding,cwd,signal); }
  finally { await handle.close(); }
}
export // RU: readColdHandle: Получает холодный handle по проверенному snapshot и поколению.
// EN: readColdHandle: Obtains a cold handle from a verified snapshot/generation.
async function readColdHandle(handle,projections,binding,cwd,signal=AbortSignal.timeout(15000)) {
    const header=handle.header;
    if(header?.id!==binding.session_id||!Number.isSafeInteger(header.createdAt)
      ||(binding.session_created!==null&&header.createdAt!==binding.session_created))throw Error('Не совпало поколение холодной сессии');
    if(typeof header.cwd!=='string'||!path.isAbsolute(header.cwd)||typeof cwd!=='string'||!path.isAbsolute(cwd)
      ||path.resolve(header.cwd)!==path.resolve(cwd))throw Error('Не совпал cwd холодной сессии');
    const saved=await handle.read(0,undefined,{signal});
    signal.throwIfAborted();
    const restored=projections.restore({},saved.events,0,header,handle.inheritedEventCount);
    const inbox=restored.snapshot?.values?.inbox,boundary=restored.checkpoint?.turnBoundary?.val;
    if(!Array.isArray(inbox?.['next-turn'])||!Array.isArray(inbox?.['next-step'])||!boundary
      ||!(boundary.openTurnStartSeq===null||(Number.isSafeInteger(boundary.openTurnStartSeq)&&boundary.openTurnStartSeq>=0)))
      throw Error('Нет достоверных проекций inbox/turnBoundary');
    return {header,events:saved.events,inbox,pendingCount:inbox['next-turn'].length+inbox['next-step'].length,
      openTurn:boundary.openTurnStartSeq!==null,asOfSeq:restored.snapshot.asOfSeq};
}
