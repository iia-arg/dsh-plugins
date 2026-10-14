// Read-only proof of the current Site input. This does NOT establish a permanent CRM conversation identity.
// ЗАГОТОВКА · STUB: модуль пока никем в src не импортируется (Site DTO не подключён, docs/OSTROV-API.md); поставляется ради стенда test/stend-site-turn-evidence.mjs, который гоняет ночной обход (аудит №24). Not imported by src yet; shipped for its stand.
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const refuse=()=>{throw Object.assign(Error('ОТКАЗ Site: текущий root/turn/receipt не доказан'),{code:'OSTROV_SITE_CONTEXT_REFUSED'});};
export function readSiteTurnEvidence(ctx,agent){
  const s=agent?.session,h=s?.header;
  if(!h||typeof s.id!=='string'||h.id!==s.id||h.origin==='subagent'||typeof h.cwd!=='string'
    ||!Number.isSafeInteger(h.createdAt)||!ctx.get('agents')?.roots?.().includes(agent))refuse();
  const ledger=ctx.get('taskControlCodex')?.ledger,boundary=ctx.get('sessionProjections')?.stateOf(s,'turnBoundary');
  if(!ledger?.db||typeof ledger.managed!=='function'||typeof ledger.root!=='string'||resolve(dirname(ledger.root))!==resolve(h.cwd)
    ||!Number.isSafeInteger(boundary?.openTurnStartSeq)||!Number.isSafeInteger(boundary?.lastTurn))refuse();
  try{
    const pinned=ledger.db.prepare('SELECT route_key FROM channel_sessions WHERE session_id=? AND session_created=?').get(s.id,h.createdAt);
    if(!pinned||!/^site-[1-9][0-9]*$/.test(pinned.route_key))refuse();
    const conversationNumber=Number(pinned.route_key.slice(5));
    if(!Number.isSafeInteger(conversationNumber))refuse();
    const rows=ledger.managed(s.id).filter(r=>r.session_created===h.createdAt&&r.claimed_turn===boundary.lastTurn&&r.finished_at===null);
    if(!rows.length)refuse();
    const receipts=[];
    for(const r of rows){
      if(r.blocked||r.route!=='site'||r.route_key!==pinned.route_key||r.sender!=='site:visitor'||r.expects_reply!==1)refuse();
      const raw=Buffer.from(r.raw??'');
      if(createHash('sha256').update(raw).digest('hex')!==r.payload_sha)refuse();
      const x=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
      const meta=ledger.db.prepare('SELECT * FROM site_messages WHERE receipt_id=?').get(r.id);
      if(x?.v!==1||x.conversation_id!==conversationNumber||!Number.isSafeInteger(x.message_id)||x.message_id<=0
        ||typeof x.id!=='string'||!meta||meta.kind!=='incoming'||meta.conversation_id!==conversationNumber||meta.delivery_id!==x.id)refuse();
      receipts.push({receiptId:r.id,deliveryId:x.id,messageId:x.message_id,payloadSha256:r.payload_sha});
    }
    receipts.sort((a,b)=>a.messageId-b.messageId||a.receiptId.localeCompare(b.receiptId));
    if(new Set(receipts.map(r=>r.messageId)).size!==receipts.length)refuse();
    return {sessionId:s.id,sessionCreated:h.createdAt,turn:boundary.lastTurn,routeKey:pinned.route_key,
      conversationNumber,receiptId:receipts.at(-1).receiptId,receipts};
  }catch{refuse();}
}
