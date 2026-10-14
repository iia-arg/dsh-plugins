// mail-stop-hold-podgotovit.mjs <каталог> <состояние> — база КОДОМ telegram (MSH_TELEGRAM): одна строка control в <состояние>, письмо в backlog, пауза;
// B-N-1605: квитанция стопа — настоящая (receive), удержана mail_stop_intake, как оставляет приёмник; плюс ЧУЖАЯ удержанная квитанция другого стопа.
import {MessageReceipts,ConversationPause,MailStopReceiver} from './mail-stop-hold-tg.mjs';
const [dir,state]=process.argv.slice(2);
const l=new MessageReceipts(dir,{owner:'gen-old'});
const pause=new ConversationPause(l,'/tmp',()=>{});
new MailStopReceiver({ledger:l,pause,recipient:'proba',log(){}});
const t=Date.now()-60000;
const held=(key,logical)=>{const r=l.receive(key,Buffer.from('[a2a-envelope version=2]\n{"kind":"task-stop/1"}\n'+key),{logicalKey:logical,expectsReply:false});l.db.prepare("UPDATE receipts SET blocked='mail_stop_intake' WHERE id=?").run(r.id);return r.id};
const rid=held('stop-source:fixture-1','signed:ctl-1'),foreign=held('stop-source:fixture-9','signed:ctl-9');
l.db.prepare("INSERT INTO mail_stop_controls(control_id,receipt_id,wire_sha,key_id,principal,mode,session_id,session_created,target_turn,generation,target_json,binding_json,control_json,state,started_at,deadline_at,reason) VALUES('ctl-1',?,'sha','k','zabava','replace','sess-1',111,5,'gen-old','{}','{}','{}',?,?,?,'process_changed')").run(rid,state,t,t+120000);
l.db.prepare("INSERT INTO mail_stop_backlog VALUES('sess-1',111,'msg-1','ctl-1')").run();
l.db.prepare("INSERT INTO conversation_pauses(session_id,session_created,cwd,command_id,command_order,paused_at,state,owner_id,owner_turn,backlog_json) VALUES('sess-1',111,'/tmp',?,1,?, 'paused',NULL,NULL,'[]')").run(rid,t);
l.db.prepare("INSERT INTO meta VALUES('fixture_foreign_receipt',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(foreign);
console.log('готово',state);
