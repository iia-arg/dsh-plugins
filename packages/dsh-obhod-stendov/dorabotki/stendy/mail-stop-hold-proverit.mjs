// mail-stop-hold-proverit.mjs <каталог> — суд КОДОМ telegram (MSH_TELEGRAM): держит ли fence, удержано ли письмо, блокирован ли ход
import {MessageReceipts,ConversationPause,MailStopReceiver} from './mail-stop-hold-tg.mjs';
const l=new MessageReceipts(process.argv[2],{owner:'gen-new'});
const pause=new ConversationPause(l,'/tmp',()=>{});
const r=new MailStopReceiver({ledger:l,pause,recipient:'proba',log(){}});
const header={id:'sess-1',createdAt:111};
const agent={session:{header},inbox:{nextTurn:[{id:'msg-1'}],nextStep:[]}};
console.log(JSON.stringify({fence:r.store.fence(header),backlog:r.store.backlogIds(header).size,nativeBlocked:r.nativeBlocked(agent),deferOwner:r.store.active(header)?.state??null,pause:pause.state(header)?.state??null}));
