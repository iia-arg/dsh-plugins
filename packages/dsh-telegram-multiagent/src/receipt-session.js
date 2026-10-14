// RU: Проверяет идентичность и cwd сессии для receipt, предпочитает живого владельца и только затем persistence resume. Не создаёт новую сессию вместо отсутствующего поколения.
// EN: Validates receipt session identity/cwd, preferring the live owner before persistence resume. Never substitutes a newly created session for a missing generation.

export // RU: assertReceiptSession: Сравнивает ID/createdAt/cwd до доступа к истории или resume.
// EN: assertReceiptSession: Checks ID,createdAt,and cwd before session access/resume.
function assertReceiptSession(receipt, session) {
  const expected={id:receipt.session_id,createdAt:receipt.session_created};
  const header=session?.header ?? session?.meta;
  const actual=session?{id:session.id??header?.id,createdAt:header?.createdAt}:null;
  if(!expected.id || !Number.isFinite(expected.createdAt) || !actual || actual.id!==expected.id || actual.createdAt!==expected.createdAt) {
    const error=new Error('session_mapping_error: receipt and execution session do not match');
    error.code='session_mapping_error';error.detail={expected,actual};throw error;
  }
}
export // RU: resolveReceiptSession: Проверяет идентичность и cwd сессии для receipt, предпочитает живого владельца и только затем persistence resume. Не создаёт новую сессию вместо отсутствующего поколения.
// EN: resolveReceiptSession: Validates receipt session identity/cwd, preferring the live owner before persistence resume. Never substitutes a newly created session for a missing generation.
async function resolveReceiptSession(receipt,{entries,persistence,resume,adopt}) {
  for(const entry of entries) {
    if(entry.handle.agent.session.id===receipt.session_id) {
      assertReceiptSession(receipt,entry.handle.agent.session);
      return {...entry,sessionId:receipt.session_id,recovered:false};
    }
  }
  const live = await adopt?.(receipt.session_id);
  if (live) {
    assertReceiptSession(receipt, live.agent.session);
    return {handle:live,sessionId:receipt.session_id,recovered:true};
  }

  const cherezStat=typeof persistence?.inspect!=='function' && typeof persistence?.stat==='function';
  const read=typeof persistence?.inspect==='function' ? id=>persistence.inspect(id)
    : cherezStat ? id=>persistence.stat(id) : null;
  if(!read) {
    const e=new Error('session_read_error: persistence.inspect/stat unavailable');e.code='session_read_error';throw e;
  }
  let stored;
  try { stored=await read(receipt.session_id); }
  catch(cause) {
    const e=new Error('session_read_error: cannot inspect persisted execution session');e.code='session_read_error';e.cause=cause;throw e;
  }
  if(cherezStat && stored===undefined) {
    const e=new Error('session_read_error: persisted execution session not found');e.code='session_read_error';throw e;
  }
  assertReceiptSession(receipt,stored);

  const handle=await resume(receipt.session_id,agent=>assertReceiptSession(receipt,agent.session));
  assertReceiptSession(receipt,handle.agent.session);
  return {handle,sessionId:receipt.session_id,recovered:true};
}
