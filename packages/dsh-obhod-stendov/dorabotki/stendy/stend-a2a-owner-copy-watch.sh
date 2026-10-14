#!/bin/bash
# B-N-1595: a2a-owner-copy-watch must not report «нет подтверждения question» for receipts of the signed stop path.
# Usage: stend-a2a-owner-copy-watch.sh [<watch script>] — default /usr/local/bin/a2a-owner-copy-watch.
# The ledger is built by the real telegram package (MSH_TELEGRAM, default the installed one); the watch is read through its own inspect().
# B-N-1599: a second ledger is built by the real pollReceiptDirectory (poll-fixture.mjs next to this file): branches that by design
# never make a question copy must not be reported; an ordinary question and an invalid-UTF-8 hold must stay reported.
# Exit: 0 all probes passed; 1 a probe failed; 2 blind (no package/watch, fixture not built).
set -u
W=${1:-/usr/local/bin/a2a-owner-copy-watch}; TG=${MSH_TELEGRAM:-/opt/agent-plugins/dsh-telegram-multiagent}
[ -r "$W" ] || { echo "СЛЕПОТА: сторож не читается: $W"; exit 2; }
[ -r "$TG/src/message-receipts.js" ] && [ -r "$TG/src/mail-stop-ledger.js" ] || { echo "СЛЕПОТА: нет telegram с mail-stop-ledger: $TG"; exit 2; }
T=$(mktemp -d /tmp/stend-owner-copy-watch.XXXXXX) || exit 2; trap 'rm -rf -- "$T"' EXIT
mkdir -p "$T/dom/workspace" "$T/spool" "$T/dom2/workspace"
FIX=$(dirname "$(readlink -f "$0")")/poll-fixture.mjs; [ -r "$FIX" ] || { echo "СЛЕПОТА: нет $FIX"; exit 2; }
TG="$TG" LEDGER="$T/dom2/workspace/.message-receipts" node "$FIX" > "$T/poll.json" || { echo "СЛЕПОТА: опрос ящика не построил базу"; exit 2; }
TG="$TG" T="$T" node --input-type=module -e '
const {MessageReceipts}=await import(process.env.TG+"/src/message-receipts.js");const {MailStopLedger}=await import(process.env.TG+"/src/mail-stop-ledger.js");
const l=new MessageReceipts(process.env.T+"/dom/workspace/.message-receipts");new MailStopLedger(l);const ids={};
const r=(name,opts)=>{const x=l.receive(name,Buffer.from("From: fixture\n"+name),opts);ids[name]=x.id;return x};
r("plain-question",{expectsReply:true});
const a=r("stop-finished",{logicalKey:"signed:ctl-1",expectsReply:false});l.completeLocal(a.id,"mail_stop_denied","target_none:no_live_agent");
const b=r("stop-intake",{logicalKey:"signed:ctl-2",expectsReply:false});l.db.prepare("UPDATE receipts SET blocked=? WHERE id=?").run("mail_stop_intake",b.id);
r("stop-replacement",{logicalKey:"stop-replacement:ctl-3",expectsReply:false});
const d=r("stop-controlled",{logicalKey:"signed:ctl-4",expectsReply:false});
l.db.prepare("INSERT INTO mail_stop_controls(control_id,receipt_id,wire_sha,key_id,principal,mode,session_id,session_created,generation,target_json,binding_json,control_json,state,started_at,deadline_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("ctl-4",d.id,"0".repeat(64),"k","zabava","pause","s",1,"g","{}","{}","{}","unknown",1,2);
l.close();console.log(JSON.stringify(ids));' > "$T/ids.json" || { echo "СЛЕПОТА: база не построена"; exit 2; }
printf 'agenty:\n- imya: fixture\n  namerenie:\n    dom: %s\n    kanal: {tip: telegram, rezhim_dostavki: owner-all, yashchik: %s}\n- imya: polled\n  namerenie:\n    dom: %s\n    kanal: {tip: telegram, rezhim_dostavki: owner-all, yashchik: %s}\n' "$T/dom" "$T/spool" "$T/dom2" "$T/spool" > "$T/registry.yaml"
W="$W" T="$T" python3 - <<'PY'
import json,os,sys,time,types
from pathlib import Path
T=os.environ['T'];ids=json.load(open(T+'/ids.json'));polled=json.load(open(T+'/poll.json'))
# Compiled from the source every run: SourceFileLoader reuses __pycache__ keyed by mtime (seconds) and size, so two
# same-size edits within a second would run the previous code (caught on B-N-1599 corruption probes).
m=types.ModuleType('watch');m.__file__=os.environ['W'];exec(compile(open(os.environ['W'],'rb').read(),os.environ['W'],'exec'),m.__dict__)
pending,errors,seen=m.inspect(Path(T+'/registry.yaml'),int(time.time()*1000)+3600000,0)
named={k:any(ids[k] in p['text'] for p in pending) for k in ids};fail=0
def probe(ok,text):
    global fail;print(('✅ ' if ok else '🔴 ')+text);fail+=0 if ok else 1
want={'plain-question':(None,None),'signature-rejected':('signature_rejected',None),'task-control':('task_control_recorded','task_control'),'capability-probe':('capability_response',None),'empty-letter':('empty',None),'signed-goal':('channel_completed',None),'invalid-utf8':(None,'invalid_utf8')}
got={k:(v and (v['outcome'],v['blocked'])) for k,v in polled.items()}
if got!=want:print('СЛЕПОТА: опрос ящика построил не те ветки: %s'%got);sys.exit(2)
probe(not errors and seen==['fixture','polled'],'сторож прочитал базы без ошибок: errors=%s seen=%s'%(errors,seen))
probe(named['plain-question'],'обычный вопрос без копии question назван (контроль зрячести)')
for k in ['stop-finished','stop-intake','stop-replacement','stop-controlled']:probe(not named[k],'квитанция стопа %s не названа'%k)
said=lambda k:any(polled[k]['id'] in p['text'] for p in pending)
probe(said('plain-question'),'опрос ящика: обычный вопрос без копии question назван (контроль зрячести)')
for k in ['signature-rejected','task-control','capability-probe','empty-letter','signed-goal']:probe(not said(k),'опрос ящика: %s (вопроса нет по замыслу) не назван'%k)
probe(said('invalid-utf8'),'опрос ящика: удержание invalid_utf8 по-прежнему названо')
print('ИТОГ: %d из 13'%(13-fail));sys.exit(1 if fail else 0)
PY
