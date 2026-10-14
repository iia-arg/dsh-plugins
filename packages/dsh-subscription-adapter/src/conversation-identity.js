// RU: Identity берётся из живого platform session header. Новые telegram-v2 поколения требуют ID/createdAt/absolute cwd и запрета legacy fallback; без инициатора применяется stateless. path.resolve лексический, не filesystem realpath.
// EN: Identity comes from the live platform session header. New telegram-v2 generations require ID/createdAt/absolute cwd and forbid legacy fallback; no initiator uses stateless. path.resolve is lexical, not filesystem realpath.
import path from 'node:path';
export function conversationForAgent(agent) {
  if(!agent)return {version:2,mode:'stateless'};
  const id=String(agent.session?.id??agent.id??'');
  if(!id.startsWith('telegram-v2-'))return undefined;
  const header=agent.session?.header;
  if(!/^telegram-v2-[a-f0-9-]{36}$/.test(id)||!Number.isSafeInteger(header?.createdAt)
    ||typeof header?.cwd!=='string'||!path.isAbsolute(header.cwd))throw Error('Не определено поколение новой сессии; legacy fallback запрещён');
  return {version:2,id,createdAt:header.createdAt,cwd:path.resolve(header.cwd)};
}
// RU: Health capability имеет5секунд и caller AbortSignal; это проверка протокола2/provider, не успешный model turn. Redirect для health явно не запрещён, в отличие от POSTstream.
// EN: Health capability has a5second limit and caller AbortSignal; this verifies protocol2/provider, not a successful model turn. Health redirects are not explicitly forbidden unlike stream POST.
export async function checkConversationCapability(baseURL,signal) {
  const timeout=AbortSignal.timeout(5000);
  const response=await fetch(`${baseURL}/health`,{signal:signal?AbortSignal.any([signal,timeout]):timeout});
  if(!response.ok)throw Object.assign(Error('Capability HTTP '+response.status),{status:response.status});
  const health=await response.json();
  if(!response.ok||health.ok!==true||health.conversationIdentity!==2||!['openai','anthropic'].includes(health.postavshchik))
    throw Error('Шлюз не подтвердил capability поколения v2; запрос не отправлен');
  return health;
}
