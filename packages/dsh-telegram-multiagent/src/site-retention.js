// RU: Удаляет только завершённые site-квитанции старше30сут с отправленными исходящими и связанные текстовые дубли. secure_delete/VACUUM/WAL checkpoint очищают страницы; pending работа, другие маршруты, файлы сессий и backups не охватываются.
// EN: Purges finished site receipts older than30days only when outgoing delivery is complete, including related text copies. Secure deletion/VACUUM/WAL checkpoint clear pages; pending work, other routes, session files, and backups are excluded.


export const SROK_SAJTA_SUT = 30;
const TABLICY = [['outbox','receipt_id'],['guest_conversations','receipt_id'],['site_messages','receipt_id'],['audit','receipt_id'],
  ['rotation_items','receipt_id'],['session_rotations','receipt_id'],['sources','receipt_id'],['protocol_envelopes','receipt_id'],['decision_index','receipt_id']];
export // RU: purgeSiteExpired: Удаляет только завершённые site-квитанции старше30сут с отправленными исходящими и связанные текстовые дубли. secure_delete/VACUUM/WAL checkpoint очищают страницы; pending работа, другие маршруты, файлы сессий и backups не охватываются.
// EN: purgeSiteExpired: Purges finished site receipts older than30days only when outgoing delivery is complete, including related text copies. Secure deletion/VACUUM/WAL checkpoint clear pages; pending work, other routes, session files, and backups are excluded.
function purgeSiteExpired(ledger,{now=Date.now(),days=SROK_SAJTA_SUT,log=()=>{}}={}){
  const db=ledger.db,granica=now-days*86400e3;
  const est=t=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const PODHODIT="r.route='site' AND r.route_key LIKE 'site-%' AND r.received_at < ?";
  db.exec('PRAGMA secure_delete=ON');
  try{
    const itog=ledger.tx(()=>{
      const ids=db.prepare(`SELECT id FROM receipts r WHERE ${PODHODIT} AND r.finished_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.receipt_id=r.id AND o.sent_at IS NULL)`).all(granica).map(x=>x.id);
      const zhdut=db.prepare(`SELECT count(*) AS n FROM receipts r WHERE ${PODHODIT} AND (r.finished_at IS NULL
        OR EXISTS (SELECT 1 FROM outbox o WHERE o.receipt_id=r.id AND o.sent_at IS NULL))`).get(granica).n;
      const schet={};
      if(est('site_copy_alerts')){const st=db.prepare('DELETE FROM site_copy_alerts WHERE outbox_id IN (SELECT id FROM outbox WHERE receipt_id=?)');
        schet.site_copy_alerts=ids.reduce((n,id)=>n+Number(st.run(id).changes),0);}
      for(const [t,k] of TABLICY){if(!est(t))continue;const st=db.prepare(`DELETE FROM ${t} WHERE ${k}=?`);schet[t]=ids.reduce((n,id)=>n+Number(st.run(id).changes),0);}
      const st=db.prepare('DELETE FROM receipts WHERE id=?');schet.receipts=ids.reduce((n,id)=>n+Number(st.run(id).changes),0);
      schet.channel_sessions=est('channel_sessions')?Number(db.prepare(`DELETE FROM channel_sessions WHERE route_key LIKE 'site-%'
        AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.route_key=channel_sessions.route_key)`).run().changes):0;
      return {udaleno:ids.length,zhdut,schet};
    });
    if(itog.udaleno){db.exec('VACUUM');
      if(String(db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase()==='wal')db.exec('PRAGMA wal_checkpoint(TRUNCATE)');}
    if(itog.udaleno||itog.zhdut)log(`[сайт] срок ${days} сут: удалено квитанций ${itog.udaleno}, ждут закрытия/отправки ${itog.zhdut}; строк: `
      +Object.entries(itog.schet).filter(([,n])=>n).map(([t,n])=>t+' '+n).join(', '));
    return itog;
  }finally{db.exec('PRAGMA secure_delete=OFF');}
}
