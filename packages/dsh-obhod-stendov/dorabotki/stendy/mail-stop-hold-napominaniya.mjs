// mail-stop-hold-napominaniya.mjs <каталог> — B-N-1605: суд КОДОМ telegram (MSH_TELEGRAM): настоящий holdTick с часами +2 суток;
// печатает, открыта ли квитанция стопа ctl-1, сколько новых «УДЕРЖАНО» ей поставлено, и цела ли чужая удержанная квитанция.
import {MessageReceipts} from './mail-stop-hold-tg.mjs';
const l=new MessageReceipts(process.argv[2],{owner:'gen-judge',now:()=>Date.now()+2*86400000});
const rid=l.db.prepare("SELECT receipt_id FROM mail_stop_controls WHERE control_id='ctl-1'").get().receipt_id,foreign=l.db.prepare("SELECT value FROM meta WHERE key='fixture_foreign_receipt'").get().value;
const count=id=>l.db.prepare("SELECT count(*) AS n FROM outbox WHERE receipt_id=? AND id LIKE ?").get(id,id+':held:%').n;
const before=count(rid);l.holdTick();const r=l.get(rid),f=l.get(foreign);
console.log(JSON.stringify({stop_open:r.finished_at===null,stop_blocked:r.blocked,stop_new_notices:count(rid)-before,foreign_open:f.finished_at===null&&f.blocked==='mail_stop_intake'}));
