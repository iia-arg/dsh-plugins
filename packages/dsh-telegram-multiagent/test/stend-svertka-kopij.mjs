// RU: Изолированный стенд stend-svertka-kopij.mjs (B-N-1639): копии разговора сайта наблюдателю идут одной свёрткой на
//     затихший разговор, а не письмом на реплику; ответ наблюдателя ровно «к сведению» владельцу не копируется, тревога — да.
//     Ledger — настоящий MessageReceipts с управляемым временем; GuestCopies и prepareReceiptCopies (из src/index.js) — настоящие;
//     внешняя отправка (Telegram, a2a-send) — записывающие заглушки. Живую доставку стенд не доказывает.
// EN: Isolated harness stend-svertka-kopij.mjs (B-N-1639): observer copies of a site conversation go as one fold letter per
//     quiet conversation; an exact «к сведению» observer reply is not copied to the owner, an alarm is.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {extractFunction} from './extract.mjs';
import {MessageReceipts} from '../src/message-receipts.js';
import {GuestCopies,SVERTKA,svedenieBezKopii,guestCopyTargets,trevogaNaSvertku,adresatyTrevogi} from '../src/guest-channel.js';
import {purgeSiteExpired} from '../src/site-retention.js';

const OWNER=158901453, MIN=60e3;
let T=Date.UTC(2026,9,5,8,0,0);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'svertka-'));
const ledger=new MessageReceipts(path.join(root,'ledger'),{now:()=>T});
const tg=[],a2a=[];
// B-N-1680: доставка свёртки требует маску ПДн; этот стенд проверяет механику свёртки — маска-тождество (саму маску проверяет stend-svertka-maska).
const targets=()=>guestCopyTargets({mode:'owner-all',owner:OWNER,allowed:new Set([OWNER]),configured:[{kind:'a2a-svertka',agent:'marc'}]});
let copies=new GuestCopies(ledger,{sendTelegram:async(id,t)=>tg.push({id,t}),sendA2A:async(agent,t)=>a2a.push({agent,t}),targets,owner:()=>OWNER,maska:async()=>t=>t});
let ok=0,bad=0;const p=(i,u,w)=>{u?ok++:bad++;console.log(`${u?'ЗЕЛЁНОЕ':'КРАСНОЕ'}  ${i}${u?'':' — '+w}`);};
const q=(sql,...a)=>ledger.db.prepare(sql).all(...a);
let n=0;
function replika(conv,gost,agent){ // одна пара «гость → агент» в разговоре conv в момент T
  n++;const r=ledger.receive(`site-src-${n}`,`гость ${n}`,{route:'site',routeKey:'site-'+conv});
  copies.captureSite(ledger.get(r.id),{conversation:conv,type:'visitor',kind:'incoming',text:gost,reason:'[проба]'});
  ledger.completeRow(ledger.get(r.id),'turn_completed',{},agent);
  copies.prepare();return r.id;
}
const kMarku=()=>q("SELECT * FROM outbox WHERE route='copy-tg' AND body LIKE '%\"a2a-svertka\"%'");
const zhdut=()=>q("SELECT * FROM outbox WHERE route='svertka' AND error='svertka:zhdet'");
// Доставщик берёт строки порциями — в бою каждый такт; здесь гоняется до пустой очереди, но не больше 100 кругов.
const dispatch=async()=>{let svertkaVDostavke=0;const d=async row=>{if(row.route==='svertka')svertkaVDostavke++;if(row.id.startsWith('guest-copy:'))await copies.deliver(row);};
  for(let i=0;i<100&&q('SELECT count(*) n FROM outbox WHERE sent_at IS NULL')[0].n;i++){await ledger.deliverResults(d);await ledger.deliverResults(d,{copyOnly:true});}return svertkaVDostavke;};

console.log(`пороги (назначенные): тишина ${SVERTKA.tishinaMs/MIN} мин, реплик ${SVERTKA.replik}, предел ${SVERTKA.maxMs/MIN} мин, знаков ${SVERTKA.znakov}`);
// С1: реплика пришла — владельцу копии как прежде, наблюдателю пока ничего
replika(16,'Привет! Который час сейчас в Токио?','Здравствуйте! В Токио сейчас 17:12.');
const ownerCopies=q("SELECT * FROM outbox WHERE route='copy-tg' AND body LIKE '%\"telegram\"%'").length;
p('С1 владельцу — копии вопроса и ответа как прежде (2)', ownerCopies===2, `было ${ownerCopies}`);
p('С1 наблюдателю — ни одного письма на реплику', kMarku().length===0, `писем ${kMarku().length}`);
p('С1 реплики ждут свёртки (2)', zhdut().length===2, `ждут ${zhdut().length}`);
// С2: 10 мин тишины — рано
T+=10*MIN;copies.prepare();
p('С2 через 10 мин тишины свёртки нет', kMarku().length===0, `писем ${kMarku().length}`);
// С3: 16 мин тишины — одна свёртка с обеими репликами
T+=6*MIN;copies.prepare();
const s1=kMarku();const b1=s1.length?JSON.parse(s1[0].body).body:'';
p('С3 через 16 мин — ровно одно письмо-свёртка', s1.length===1, `писем ${s1.length}`);
p('С3 шапка «к сведению», разговор 16, 2 реплики', b1.startsWith('[к сведению: свёртка разговора сайта 16, реплик 2,'), b1.slice(0,90));
p('С3 в свёртке и вопрос гостя, и ответ агента', b1.includes('Который час сейчас в Токио')&&b1.includes('В Токио сейчас 17:12'), 'нет одной из реплик');
p('С3 ждущих не осталось', zhdut().length===0, `ждут ${zhdut().length}`);
// С4: повторный такт — без второй свёртки
copies.prepare();p('С4 повторный такт — свёртка не удвоилась', kMarku().length===1, `писем ${kMarku().length}`);
// С5: доставка — одна отправка наблюдателю, ждущие реплики доставщик не трогает
const vDost=await dispatch();
p('С5 наблюдателю ушло одно a2a-письмо, адресат marc', a2a.length===1&&a2a[0].agent==='marc', JSON.stringify(a2a.map(x=>x.agent)));
p('С5 строки ожидания (route=svertka) доставщику не попадали', vDost===0, `попало ${vDost}`);
// С6: новая реплика после свёртки — следующая свёртка, без повтора старого
T+=4*MIN;replika(16,'А сколько стоит ретрит?','Стоимость уточнит менеджер.');T+=16*MIN;copies.prepare();
const s2=kMarku();const b2=s2.length===2?JSON.parse(s2[1].body).body:'';
p('С6 вторая свёртка — только новая пара', s2.length===2&&b2.includes('сколько стоит ретрит')&&!b2.includes('Токио'), `писем ${s2.length}`);
// С7: длинный разговор — сворачивается по числу реплик без тишины
const do7=kMarku().length;for(let i=0;i<10;i++){T+=MIN;replika(17,'вопрос '+i,'ответ '+i);}
p('С7 20 реплик за 10 мин — свёртка без ожидания тишины', kMarku().length===do7+1, `писем ${kMarku().length-do7}`);
// С8: перезапуск — новый экземпляр над тем же ledger не удваивает
T+=MIN;replika(18,'привет','здравствуйте');T+=20*MIN;
copies=new GuestCopies(ledger,{sendTelegram:async(id,t)=>tg.push({id,t}),sendA2A:async(agent,t)=>a2a.push({agent,t}),targets,owner:()=>OWNER,maska:async()=>t=>t});
copies.prepare();const do8=kMarku().length;copies.prepare();
copies=new GuestCopies(ledger,{sendTelegram:async(id,t)=>tg.push({id,t}),sendA2A:async(agent,t)=>a2a.push({agent,t}),targets,owner:()=>OWNER,maska:async()=>t=>t});copies.prepare();
p('С8 после «перезапуска» свёртка не удвоилась', kMarku().length===do8, `было ${do8}, стало ${kMarku().length}`);
// С9: срок хранения сайта — строки ожидания и свёртки уходят вместе с квитанциями
await dispatch();const vsego=q("SELECT count(*) n FROM outbox WHERE route IN ('svertka','copy-tg')")[0].n;
purgeSiteExpired(ledger,{now:T+31*86400e3});
const ostalos=q("SELECT count(*) n FROM outbox WHERE route IN ('svertka','copy-tg')")[0].n;
p('С9 через 31 сут строки ожидания и свёртки удалены сроком сайта', vsego>0&&ostalos===0, `было ${vsego}, осталось ${ostalos}`);
// С10: решение «не копировать владельцу»
const raw=Buffer.from('[delivery-v1 id=ab reply=no]\n[к сведению: свёртка разговора сайта 16, реплик 2, 08:00–08:00 UTC; …]\nтекст');
p('С10 «к сведению» на свёртку — без копии', svedenieBezKopii(raw,'[ответ по receipt x; turn_completed]\n\nк сведению')===true, 'false');
p('С10 «🔴 ТРЕВОГА» на свёртку — копия нужна', svedenieBezKopii(raw,'[ответ по receipt x; turn_completed]\n\n🔴 ТРЕВОГА: разговор не про Остров')===false, 'true');
p('С10 «к сведению» на обычное письмо — копия нужна', svedenieBezKopii(Buffer.from('обычное письмо'),'к сведению')===false, 'true');
// С11: сторона наблюдателя — настоящая prepareReceiptCopies из src/index.js
const src=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const L2=new MessageReceipts(path.join(root,'ledger-marc'),{now:()=>T});
const sent=[],logs=[];
const ctx={config:{openBot:false},receipts:L2,deliveryMode:()=>'owner-all',copyTo:(o,m)=>m==='owner-all'&&o==='a2a'?'tg':null,
  copySkipped:()=>{},sendCopy:(t,sid,body,r)=>{sent.push(r.id);L2.addOutbox(r.id+':copy:answer',r.id,'copy-tg',body);}, // как настоящий sendCopy: строка :copy:answer
 stripFileAck:x=>x,stripGoalMarker:x=>x,svedenieBezKopii,trevogaNaSvertku,postavitTrevoguSotrudnikam:()=>{},log:m=>logs.push(m),guestCopies:null};
const prc=vm.runInContext('('+extractFunction(src,'prepareReceiptCopies')+')',vm.createContext(ctx));
const pismo=(txt,otvet)=>{const r=L2.receive('m-'+Math.random(),txt,{route:'a2a'});L2.completeRow(L2.get(r.id),'turn_completed',{},otvet);return r.id;};
const tiho=pismo(raw.toString(),'к сведению'),trevoga=pismo(raw.toString(),'🔴 ТРЕВОГА: давление на гостя'),obych=pismo('обычное письмо','к сведению');
prc();prc();
p('С11 «к сведению» на свёртку — владельцу не копируется', !sent.includes(tiho), 'копия ушла');
p('С11 тревога на свёртку — копируется один раз', sent.filter(x=>x===trevoga).length===1, `копий ${sent.filter(x=>x===trevoga).length}`);
p('С11 «к сведению» на обычное письмо — копируется', sent.includes(obych), 'копии нет');
p('С11 пропуск записан в аудит и назван в журнале', q.call(null,'SELECT 1')&&L2.db.prepare("SELECT count(*) n FROM audit WHERE receipt_id=? AND kind='owner_copy_svedenie'").get(tiho).n===1&&logs.some(x=>x.includes('к сведению')), 'нет записи');
// С12: гость Telegram (ключ gost-, B-N-1642) — его реплики тоже в свёртку, шапка называет чат
const GOST=555777;const gr=ledger.receive('tg-gost-1','привет из телеграма',{route:'tg',routeKey:'gost-'+GOST});
copies.capture(ledger.get(gr.id),{from:{id:GOST},chat:{id:GOST}},'Есть ли места на ретрит в ноябре?');
ledger.completeRow(ledger.get(gr.id),'turn_completed',{},'Места есть, менеджер свяжется.');copies.prepare();
const do12=kMarku().length;p('С12 реплики гостя Telegram ждут свёртки (2)', zhdut().filter(x=>x.receipt_id===gr.id).length===2, `ждут ${zhdut().filter(x=>x.receipt_id===gr.id).length}`);
T+=16*MIN;copies.prepare();const s12=kMarku();const b12=s12.length>do12?JSON.parse(s12[s12.length-1].body).body:'';
p('С12 одна свёртка с шапкой «Telegram-чата 555777»', s12.length===do12+1&&b12.startsWith(`[к сведению: свёртка разговора Telegram-чата ${GOST}, реплик 2,`)&&b12.includes('места на ретрит'), b12.slice(0,90));
// С13: битая ждущая строка не держит свёртку остальных и не обрывает такт; названа в журнале один раз
const glog=[];copies=new GuestCopies(ledger,{sendTelegram:async(id,t)=>tg.push({id,t}),sendA2A:async(agent,t)=>a2a.push({agent,t}),targets,owner:()=>OWNER,maska:async()=>t=>t,log:m=>glog.push(m)});
const zr=replika(20,'вопрос при битой строке','ответ');
ledger.addOutbox('guest-copy:bitaya-proba',zr,'svertka','{не json');ledger.db.prepare("UPDATE outbox SET sent_at=?,error='svertka:zhdet' WHERE id='guest-copy:bitaya-proba'").run(T);
T+=16*MIN;const do13=kMarku().length;let brosok=null;try{copies.prepare();copies.prepare();}catch(e){brosok=e.message;}
p('С13 prepare не бросил на битой строке', brosok===null, `бросок: ${brosok}`);
p('С13 разговор 20 свёрнут, несмотря на битую строку', kMarku().length===do13+1, `писем ${kMarku().length-do13}`);
p('С13 битая строка снята из ожидания (svertka:bitaya), строка журнала одна', q("SELECT error FROM outbox WHERE id='guest-copy:bitaya-proba'")[0]?.error==='svertka:bitaya'&&glog.filter(x=>x.includes('guest-copy:bitaya-proba')).length===1, `${q("SELECT error FROM outbox WHERE id='guest-copy:bitaya-proba'")[0]?.error}; журнал ${glog.length}`);
// С14: настоящая prepareReceiptCopies — бросок гостевых копий не обрывает такт: копии a2a готовятся, сбой в журнале
const ctx2={...ctx,config:{openBot:true},guestCopies:{prepare(){throw Error('проба броска свёртки');}}};logs.length=0;
const prc2=vm.runInContext('('+extractFunction(src,'prepareReceiptCopies')+')',vm.createContext(ctx2));
const posle=pismo('письмо после сбоя свёртки','ответ');let brosok2=null;try{prc2();}catch(e){brosok2=e.message;}
p('С14 prepareReceiptCopies не бросил, копия a2a приготовлена', brosok2===null&&sent.includes(posle), `бросок: ${brosok2}; копия ${sent.includes(posle)}`);
p('С14 сбой гостевых копий назван в журнале', logs.some(x=>x.includes('проба броска свёртки')), JSON.stringify(logs));
// С15–С19 (B-N-1640): тревога наблюдателя по свёртке — сотрудникам из файла адресатов; настоящие prepareReceiptCopies и
// postavitTrevoguSotrudnikam из src/index.js. Владелец 7 исключается (ему своя копия), «к сведению» и иной ответ сотрудникам не идут.
const L3=new MessageReceipts(path.join(root,'ledger-marc-3'),{now:()=>T});const sent3=[],logs3=[];
const fajl=path.join(root,'adresaty.json');fs.writeFileSync(fajl,JSON.stringify({revision:8,telegramUserIds:['7','111','111','222','abc']}));
const ctx3={config:{openBot:false},receipts:L3,deliveryMode:()=>'owner-all',copyTo:(o,m)=>m==='owner-all'&&o==='a2a'?'tg':null,copySkipped:()=>{},
  sendCopy:(t,sid,body,r)=>{sent3.push(r.id);L3.addOutbox(r.id+':copy:answer',r.id,'copy-tg',body);},stripFileAck:x=>x,stripGoalMarker:x=>x,
  svedenieBezKopii,trevogaNaSvertku,adresatyTrevogi,fs,Buffer,settings:()=>({adresatyTrevogFile:fajl}),ownerChatId:()=>7,who:'marc',log:m=>logs3.push(m),guestCopies:null};
const vmc=vm.createContext(ctx3);ctx3.postavitTrevoguSotrudnikam=vm.runInContext('('+extractFunction(src,'postavitTrevoguSotrudnikam')+')',vmc);
const prc3=vm.runInContext('('+extractFunction(src,'prepareReceiptCopies')+')',vmc);
const p3=(txt,otvet)=>{const r=L3.receive('t-'+Math.random(),txt,{route:'a2a'});L3.completeRow(L3.get(r.id),'turn_completed',{},otvet);return r.id;};
const tr=p3(raw.toString(),'🔴 ТРЕВОГА: разговор 16 — просят бронь без оплаты'),sv=p3(raw.toString(),'к сведению'),inoe=p3(raw.toString(),'Получена копия, смотрю'),ob=p3('обычное письмо','🔴 ТРЕВОГА: не свёртка');
prc3();prc3();
const trevogi=id=>L3.db.prepare("SELECT id FROM outbox WHERE id LIKE ?").all(id+':trevoga:%').map(x=>x.id.split(':').pop()).sort();
p('С15 тревога на свёртку — сотрудникам 111 и 222 по одному (владелец 7, повтор и «abc» отброшены)',JSON.stringify(trevogi(tr))==='["111","222"]',JSON.stringify(trevogi(tr)));
p('С15 и владельцу копия, как прежде',sent3.includes(tr),'нет');
p('С16 «к сведению» и иной ответ — сотрудникам ничего',trevogi(sv).length===0&&trevogi(inoe).length===0,`${trevogi(sv)} ${trevogi(inoe)}`);
p('С17 «ТРЕВОГА» не на свёртку — сотрудникам ничего',trevogi(ob).length===0,JSON.stringify(trevogi(ob)));
ctx3.settings=()=>({});const bez=p3(raw.toString(),'🔴 ТРЕВОГА: вторая');prc3();
p('С18 без настройки adresatyTrevogFile — выключено',trevogi(bez).length===0&&sent3.includes(bez),JSON.stringify(trevogi(bez)));
ctx3.settings=()=>({adresatyTrevogFile:path.join(root,'net.json')});const net=p3(raw.toString(),'🔴 ТРЕВОГА: третья');prc3();
p('С19 файла нет — строка журнала 🔴, владелец копию получает',trevogi(net).length===0&&sent3.includes(net)&&logs3.some(x=>x.includes('🔴 [тревога] адресаты сотрудников не прочитаны')),logs3.slice(-2).join('|'));
// С20 (B-N-1640): доставщик — настоящая deliverReceiptOutbox: строка :trevoga:<id> уходит этому сотруднику и при режиме,
// где копия владельцу запрещена; обычная копия по-прежнему подчиняется режиму.
const otpr=[];const ctx4={tg:{send:async(chat,body)=>otpr.push({chat,body})},log:()=>{},receipts:L3,deliveryMode:()=>'personal',copyTo:()=>null,
  copySkipped:()=>{},ownerChatId:()=>7,guestCopies:null,siteSource:null,config:{}};
const dro=vm.runInContext('('+extractFunction(src,'deliverReceiptOutbox')+')',vm.createContext(ctx4));
const strok=L3.db.prepare("SELECT * FROM outbox WHERE id=?").get(tr+':trevoga:222');try{await dro(strok);}catch(e){otpr.push({chat:'ОТКАЗ',body:e.message});}
p('С20 :trevoga:222 доставлена чату 222 при режиме personal',otpr.length===1&&otpr[0].chat===222&&otpr[0].body.includes('🔴 тревога по разговору гостя'),JSON.stringify(otpr.map(x=>x.chat)));
let otkaz=null;try{await dro(L3.db.prepare("SELECT * FROM outbox WHERE id=?").get(tr+':copy:answer'));}catch(e){otkaz=e.message;}
p('С20 обычная копия владельцу при personal — отказ, как прежде',otkaz?.includes('запрещает')&&otpr.length===1,String(otkaz));
// С21–С24 (У1 ворот): предел рассылки — 1 тревога на разговор за 30 мин, 10 за сутки; исчерпанная доставка — 🔴 в журнале.
ctx3.settings=()=>({adresatyTrevogFile:fajl});
const svertka=n=>Buffer.from(`[delivery-v1 id=s${n} reply=no]\n[к сведению: свёртка разговора сайта ${n}, реплик 3, 08:00–08:10 UTC; …]\nтекст`).toString();
const rassylki=()=>L3.db.prepare("SELECT count(DISTINCT receipt_id) n FROM outbox WHERE id LIKE '%:trevoga:%'").get().n;
const predely=()=>L3.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE '%:trevoga-predel'").get().n;
const r0=rassylki(),p0=predely();
for(let i=0;i<3;i++){p3(svertka(77),'🔴 ТРЕВОГА: разговор 77 — '+i);prc3();T+=MIN;}
p('С21 3 тревоги подряд по одному разговору → сотрудникам 1 рассылка, владельцу 2 пометки «предел»',rassylki()-r0===1&&predely()-p0===2,`рассылок ${rassylki()-r0}, пометок ${predely()-p0}`);
p('С21 пометка «предел рассылки» называет разговор',L3.db.prepare("SELECT body FROM outbox WHERE id LIKE '%:trevoga-predel' ORDER BY rowid DESC LIMIT 1").get()?.body.includes('предел рассылки: тревога по разговору сайта 77'),'нет');
T+=31*MIN;p3(svertka(77),'🔴 ТРЕВОГА: разговор 77 — снова');prc3();
p('С22 через 31 мин тот же разговор — снова рассылка',rassylki()-r0===2,`рассылок ${rassylki()-r0}`);
const r1=rassylki(),p1=predely(),bylo=L3.db.prepare("SELECT count(*) n FROM audit WHERE kind='trevoga_sotrudnikam' AND at>?").get(T-86400e3).n;
for(let i=0;i<12-bylo;i++){p3(svertka(100+i),'🔴 ТРЕВОГА: разные '+i);prc3();T+=MIN;}
p('С23 сверх 10 тревог за сутки на всех — только пометка владельцу',L3.db.prepare("SELECT count(*) n FROM audit WHERE kind='trevoga_sotrudnikam' AND at>?").get(T-86400e3).n===10&&predely()-p1===2,`за сутки ${L3.db.prepare("SELECT count(*) n FROM audit WHERE kind='trevoga_sotrudnikam' AND at>?").get(T-86400e3).n}, пометок ${predely()-p1}`);
const ish=[];const ctx5={receipts:L3,RETRY_SECONDS:[1,2],a2aReported:new Set(),log:m=>ish.push(m),deployment:{receiptReviewer:'operator'},who:'marc'};
const rre=vm.runInContext('('+extractFunction(src,'reportReceiptExhaustion')+')',vm.createContext(ctx5));
L3.db.prepare("UPDATE outbox SET attempts=5,error='403 Forbidden: bot was blocked' WHERE id=?").run(tr+':trevoga:111');rre(true);
p('С24 исчерпанная доставка сотруднику — строка 🔴 с причиной и «Start»',ish.some(x=>x.startsWith('🔴 [тревога] сотруднику НЕ доставлено')&&x.includes('403')&&x.includes('Start')),ish.join('|').slice(0,200));
fs.rmSync(root,{recursive:true,force:true});
console.log(`ИТОГ: ${ok} из ${ok+bad}`);process.exit(bad?1:0);
