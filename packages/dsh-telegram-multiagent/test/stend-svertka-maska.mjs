// RU: Стенд B-N-1680 — маска ПДн в свёртке разговора гостя для модели наблюдателя (a2a-svertka). Настоящий модуль маски
//     гостевого шлюза (PDN_MASKA_MODUL, по умолчанию /opt/subscription-gateway-guest/pdn-maska.mjs) на подставном реестре гостей
//     и подставном белом списке во временном каталоге. Нет модуля — СЛЕПОТА, код 2.
//     Чего НЕ проверяет: живую доставку Марку; что маска ловит имя вне реестра и склонённые формы (граница самого модуля).
// EN: B-N-1680 harness — PII mask in guest fold letters for the observer model, with the real guest-gateway mask module.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';
import {GuestCopies,SVERTKA,guestCopyTargets,zagruzitMaskuSvertki} from '../src/guest-channel.js';

const modul=process.env.PDN_MASKA_MODUL||'/opt/subscription-gateway-guest/pdn-maska.mjs';
if(!fs.existsSync(modul)){console.log(`СЛЕПОТА: нет модуля маски ${modul} — задайте PDN_MASKA_MODUL`);process.exit(2);}
const OWNER=158901453, MIN=60e3;
let T=Date.UTC(2026,9,5,8,0,0);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'svertka-maska-'));
const reestr=path.join(root,'reestr');fs.mkdirSync(reestr);
fs.writeFileSync(path.join(reestr,'g1.json'),JSON.stringify({imya:'Аглая Тестова',telefony:['+7 912 345-67-89'],pochty:['aglaya@primer.ru']}));
const belyjSpisok=path.join(root,'belyj.txt');fs.writeFileSync(belyjSpisok,'# публичный телефон агента\nтел: +7 495 111-22-33\n');
const nastrojka={modul,reestr,belyjSpisok};
const ledger=new MessageReceipts(path.join(root,'ledger'),{now:()=>T});
const tg=[],a2a=[],glog=[];
const targets=()=>guestCopyTargets({mode:'owner-all',owner:OWNER,allowed:new Set([OWNER]),configured:[{kind:'a2a-svertka',agent:'marc'}]});
let maskaNastrojka=nastrojka;
const copies=new GuestCopies(ledger,{sendTelegram:async(id,t)=>tg.push({id,t}),sendA2A:async(agent,t)=>a2a.push({agent,t}),targets,owner:()=>OWNER,
  log:m=>glog.push(m),maska:()=>zagruzitMaskuSvertki(maskaNastrojka)});
let ok=0,bad=0;const p=(i,u,w)=>{u?ok++:bad++;console.log(`${u?'ЗЕЛЁНОЕ':'КРАСНОЕ'}  ${i}${u?'':' — '+w}`);};
const q=(sql,...a)=>ledger.db.prepare(sql).all(...a);
let n=0;
function replika(conv,gost,agent){
  n++;const r=ledger.receive(`site-src-${n}`,`гость ${n}`,{route:'site',routeKey:'site-'+conv});
  copies.captureSite(ledger.get(r.id),{conversation:conv,type:'visitor',kind:'incoming',text:gost,reason:'[проба]'});
  ledger.completeRow(ledger.get(r.id),'turn_completed',{},agent);
  copies.prepare();return r.id;
}
const svertki=()=>q("SELECT * FROM outbox WHERE route='copy-tg' AND id LIKE 'guest-copy:svertka:%' ORDER BY rowid");
// ID маски — непрозрачный hex: цифры внутри него не являются открытым контактом.
// B-N-1691b остаток (08.10, Аврора): из проверки «нет 912» убираются и UUID квитанций («ответ по receipt <uuid>») — случайный UUID v4
//   содержит «912» в ~0,59% (1 на ~171), и проба краснела на исправной маске; подстава randomUUID→«912…»: прежде 14 из 18, теперь 18 из 18.
const bezZaglushek=text=>text.replace(/⟦(?:тел|почта):[0-9a-f]{8}⟧/g,'').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,'');
// Доставщик: одна попытка на строку свёртки, исход — отправлено или текст отказа.
async function dostavit(row){const do_=a2a.length;try{await copies.deliver(row);return {ushlo:a2a.length>do_,text:a2a.at(-1)?.t};}catch(e){return {ushlo:a2a.length>do_,otkaz:e.message};}}
const svezhaya=async()=>{T+=16*MIN;copies.prepare();const row=svertki().at(-1);return {row,...await dostavit(row)};};

// М1–М3: контакты гостя и белый список
replika(21,'Здравствуйте, я Аглая Тестова, в телеграме @aglaya_t. Мой телефон +7 912 345-67-89, почта aglaya@primer.ru, муж — +7 (921) 555-44-33.',
  'Спасибо! Перезвоните нам по +7 495 111-22-33.');
const m1=await svezhaya();
p('М1 свёртка ушла наблюдателю',m1.ushlo&&!m1.otkaz,String(m1.otkaz));
const t1=m1.text??'';
p('М1 телефон гостя из реестра — маска (нет «912», есть ⟦тел:)',!/912/.test(bezZaglushek(t1))&&/⟦тел:[0-9a-f]{8}⟧/.test(t1),t1.slice(0,300));
p('М1 почта гостя — маска',!t1.includes('aglaya@primer.ru')&&/⟦почта:[0-9a-f]{8}⟧/.test(t1),'почта видна');
// Слово владельца 05.10 20:26 МСК: наблюдателю имя и ник гостя остаются, маскируются только телефон и почта.
p('М1 имя гостя (есть в реестре) — видно, не маска',t1.includes('Аглая Тестова')&&!/⟦имя:/.test(t1),'имя замаскировано');
p('М1 ник гостя @aglaya_t — виден',t1.includes('@aglaya_t'),'ника нет');
p('М2 телефон вне реестра (образец) — маска',!/921|555-44-33/.test(bezZaglushek(t1)),'«921» виден');
p('М3 телефон из белого списка — открыт',t1.includes('+7 495 111-22-33'),'нет +7 495 111-22-33');
p('М3 шапка свёртки на месте (признак Марка)',t1.startsWith('[к сведению: свёртка разговора сайта 21, реплик 2,'),t1.slice(0,80));

// М4: обрезка посреди телефона — маска до обрезки, фрагмента цифр нет.
// У реплики есть служебная шапка: её длина снимается с части из М1, чтобы отметка 8000 пришлась на середину телефона.
const gost1=JSON.parse(m1.row.body).parts.find(x=>x.kind==='question').body;
const shapka=gost1.indexOf('Здравствуйте, я Аглая');
const dlinnyj='а'.repeat(SVERTKA.naRepliku-shapka-8)+' +7 912 345-67-89 конец';
replika(22,dlinnyj,'ок');
const m4=await svezhaya();const t4=m4.text??'';
const syraya=JSON.parse(m4.row.body).parts.find(x=>x.kind==='question').body.slice(0,SVERTKA.naRepliku);
p('М4 контроль зрячести: сырая реплика на отметке 8000 кончается обрывком телефона',shapka>0&&/912 ?$/.test(syraya)&&!syraya.includes('345-67-89'),JSON.stringify(syraya.slice(-20)));
p('М4 обрезка посреди телефона — ни «912», ни «+7 9» в письме',m4.ushlo&&!/912|\+7 9/.test(bezZaglushek(t4)),JSON.stringify(t4.slice(t4.indexOf('… обрезано')-30,t4.indexOf('… обрезано'))));
p('М4 обрезка на месте (… обрезано)',/… обрезано: 8000 из \d+ знаков/.test(t4),'нет пометки обрезки');

// М5: маска не настроена — отказ, наблюдателю ничего
maskaNastrojka=undefined;
replika(23,'Телефон +7 912 345-67-89','ок');
const m5=await svezhaya();
p('М5 без pdnMaskaSvertki — отказ доставки, сырое не ушло',!m5.ushlo&&/mask unavailable/.test(m5.otkaz??''),`ушло=${m5.ushlo} ${m5.otkaz}`);
maskaNastrojka=nastrojka;

// М6: нечитаемый реестр — отказ
maskaNastrojka={...nastrojka,reestr:path.join(root,'net-takogo')};
const m6=await dostavit(m5.row);
p('М6 нечитаемый реестр — отказ, сырое не ушло',!m6.ushlo&&!!m6.otkaz,`ушло=${m6.ushlo}`);
maskaNastrojka=nastrojka;
const m6v=await dostavit(m5.row);
p('М6 реестр снова читается — та же свёртка уходит с маской',m6v.ushlo&&!/912/.test(bezZaglushek(m6v.text??'')),String(m6v.otkaz));

// М7: части не сходятся с шапкой — отказ
replika(24,'Телефон +7 912 345-67-89','ок');
T+=16*MIN;copies.prepare();const r7=svertki().at(-1);const b7=JSON.parse(r7.body);
const m7a=await dostavit({...r7,body:JSON.stringify({...b7,parts:b7.parts.slice(1)})});
p('М7 частей меньше, чем в шапке — отказ',!m7a.ushlo&&/source unavailable/.test(m7a.otkaz??''),`ушло=${m7a.ushlo} ${m7a.otkaz}`);
const m7b=await dostavit({...r7,body:JSON.stringify({...b7,parts:b7.parts.map(x=>({...x,chat:'site-999'}))})});
p('М7 часть чужого разговора — отказ',!m7b.ushlo&&/mismatch/.test(m7b.otkaz??''),`ушло=${m7b.ushlo} ${m7b.otkaz}`);

// М8: свёртка, собранная до B-N-1680 (без parts) — части из ждущих строк, маска есть
const m8=await dostavit({...r7,body:JSON.stringify({target:b7.target,body:b7.body})});
p('М8 свёртка без parts — части из исходных строк, с маской',m8.ushlo&&!/912/.test(bezZaglushek(m8.text??''))&&/⟦тел:/.test(m8.text??''),`${m8.otkaz} ${(m8.text??'').slice(0,200)}`);

// М9: копии владельцу (telegram) маской не трогаются — владелец видит как прежде
const vlad=q("SELECT body FROM outbox WHERE route='copy-tg' AND body LIKE '%\"telegram\"%' AND body LIKE '%912%'").length;
p('М9 копия владельцу по-прежнему без маски (владелец — не модель)',vlad>0,`строк ${vlad}`);

console.log(`ОБЛАСТЬ: модуль маски ${modul}; подставные реестр (1 гость) и белый список (1 телефон). Живой доставки и реестра Варвары нет.`);
console.log(`ИТОГ: ${ok} из ${ok+bad}`);
fs.rmSync(root,{recursive:true,force:true});
process.exit(bad?1:0);
