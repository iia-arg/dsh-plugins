// RU: Ключ беседы включает provider/canonical cwd/DSH session ID/createdAt. v2 stateless не сохраняет mapping; legacy undefined остаётся только для v1. Имя беседы не берётся из первого текста.
// EN: Conversation keys include provider/canonical cwd/DSH session ID/createdAt. v2 stateless avoids persisted mapping; legacy undefined remains for v1 only. Initial text does not determine a v2 identity.
import {createHash} from 'node:crypto';
import path from 'node:path';
export const CONVERSATION_IDENTITY_VERSION = 2;
// RU: resolveConversation: Ключ беседы включает provider/canonical cwd/DSH session ID/createdAt. v2 stateless не сохраняет mapping; legacy undefined остаётся только для v1. Имя беседы не берётся из первого текста.
// EN: resolveConversation: Conversation keys include provider/canonical cwd/DSH session ID/createdAt. v2 stateless avoids persisted mapping; legacy undefined remains for v1 only. Initial text does not determine a v2 identity.
export function resolveConversation(value, provider, cwd) {
  if (value === undefined) return {key:undefined,identity:null};
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 2)
    throw Error('conversation identity: unsupported envelope');
  if (value.mode === 'stateless') {
    if (Object.keys(value).some(k=>!['version','mode'].includes(k))) throw Error('conversation identity: invalid stateless envelope');
    return {key:null,identity:null};
  }
  if (Object.keys(value).some(k=>!['version','id','createdAt','cwd'].includes(k))
      || !/^telegram-v2-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.id??'')
      || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0
      || typeof value.cwd !== 'string' || !path.isAbsolute(value.cwd)
      || typeof cwd !== 'string' || !path.isAbsolute(cwd)
      || path.resolve(value.cwd) !== path.resolve(cwd) || !['openai','anthropic'].includes(provider))
    throw Error('conversation identity: invalid session or workspace');
  const identity={dshId:value.id,dshCreated:value.createdAt,dshCwd:path.resolve(cwd),provider,routingVersion:2};
  const key='v2:'+createHash('sha256').update(JSON.stringify([provider,identity.dshCwd,identity.dshId,identity.dshCreated])).digest('hex');
  return {key,identity};
}
// RU: installConversationSchema: Ключ беседы включает provider/canonical cwd/DSH session ID/createdAt. v2 stateless не сохраняет mapping; legacy undefined остаётся только для v1. Имя беседы не берётся из первого текста.
// EN: installConversationSchema: Conversation keys include provider/canonical cwd/DSH session ID/createdAt. v2 stateless avoids persisted mapping; legacy undefined remains for v1 only. Initial text does not determine a v2 identity.
export function installConversationSchema(db) {
  const columns=new Set(db.prepare('PRAGMA table_info(sessions)').all().map(x=>x.name));
  if (!columns.has('kluch')) throw Error('conversation identity: sessions table missing');
  for (const [name,type] of [['dshId','TEXT'],['dshCreated','INTEGER'],['dshCwd','TEXT'],['provider','TEXT'],['routingVersion','INTEGER'],['obnovleno','INTEGER']])
    if (!columns.has(name)) db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`);
  // RU: Строкам без отметки (до срока хранения) — отметка «сейчас»: срок считается от обновления шлюза, а не стирает их сразу.
  // EN: Rows without a timestamp (pre-retention) get "now": retention counts from the upgrade instead of deleting them at once.
  db.prepare('UPDATE sessions SET obnovleno=? WHERE obnovleno IS NULL').run(Date.now());
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS sessions_dsh_identity ON sessions(dshId,dshCreated,dshCwd,provider) WHERE routingVersion=2');
}
// RU: writeConversation: Ключ беседы включает provider/canonical cwd/DSH session ID/createdAt. v2 stateless не сохраняет mapping; legacy undefined остаётся только для v1. Имя беседы не берётся из первого текста.
// EN: writeConversation: Conversation keys include provider/canonical cwd/DSH session ID/createdAt. v2 stateless avoids persisted mapping; legacy undefined remains for v1 only. Initial text does not determine a v2 identity.
export function writeConversation(db,key,state) {
  const i=state.identity;
  db.prepare('INSERT OR REPLACE INTO sessions(kluch,sessionId,otdano,hashPref,dshId,dshCreated,dshCwd,provider,routingVersion,obnovleno) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(key,state.sessionId,state.otdano,state.hashPref,i?.dshId??null,i?.dshCreated??null,i?.dshCwd??null,i?.provider??null,i?.routingVersion??null,Date.now());
}
