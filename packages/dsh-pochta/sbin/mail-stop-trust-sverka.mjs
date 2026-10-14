#!/usr/bin/env node
// mail-stop-trust-sverka.mjs — сверка доверия подписанного стопа (B-N-1536, условие М2 Вениамина; Заря, 05.10.2026). ТОЛЬКО ЧТЕНИЕ.
// ВЫЗОВ: sudo node mail-stop-trust-sverka.mjs [--trust /etc/a2a/coordinator-signature.json] [--stop-config <файл mailStopConfigFile>]…
// ПРОВЕРЯЕТ (каждое — строкой ✅/🔴; любое 🔴 → код 1; файл не читается — код 2):
//   0 controlKeys и controlPermissions не пусты (пустое прошло бы все проверки молча);   1 version=1, status=approved;   2 controlPermissions ⊆ controlKeys (ключ с правом стопа обязан лежать в controlKeys:
//   иначе verifyControlSignature возьмёт его из ОБЫЧНЫХ keys — coordinator-signature.js:48);   3 controlKeys ∩ keys = ∅;
//   4 права: principal ∈ {zabava, iskra}; режимы pause/replace/new; iskra — pause и new, new только поимённо из шести (B-N-1624); recipients — непустой список;   5 каждый controlKeys — Ed25519;
//   6 ключ статусов (status_key_id каждого --stop-config) НЕ в keys/controlKeys/controlPermissions;   7 returnRoutes[key_id]
//   для каждого ключа из controlPermissions — ровно recipient/ledger_uuid/directory (абсолютный);   8 trust-файл root, без записи группой/прочими.
// НЕ ПРОВЕРЯЕТ: что приватные ключи у нужных рук (права файлов на aclaude — рука Забавы), что ящики returnRoutes живые.
import fs from 'node:fs';import crypto from 'node:crypto';
const a=process.argv.slice(2);let trustFile='/etc/a2a/coordinator-signature.json';const stopConfigs=[];
while(a.length){const x=a.shift();if(x==='--trust'&&a.length)trustFile=a.shift();else if(x==='--stop-config'&&a.length)stopConfigs.push(a.shift());else{console.error(`🔴 ОТКАЗ: довод «${x}» не знаю`);process.exit(2);}}
let t,st;try{st=fs.statSync(trustFile);t=JSON.parse(fs.readFileSync(trustFile,'utf8'));}catch(e){console.error(`🔴 ${trustFile} не читается: ${e.message}`);process.exit(2);}
let bad=0;const sud=(ok,text)=>{if(!ok)bad++;console.log(`${ok?'✅':'🔴'} ${text}`)};
const keys=Object.keys(t.keys??{}),ck=Object.keys(t.controlKeys??{}),cp=Object.keys(t.controlPermissions??{});
sud(cp.length>0&&ck.length>0,`0 стоп настроен: controlKeys ${ck.length}, controlPermissions ${cp.length} (ноль — пустое ⊆ чего угодно, «сходится» было бы молчанием)`);
sud(t.version===1&&t.status==='approved',`1 version=${t.version} status=${t.status}`);
const vne=cp.filter(k=>!ck.includes(k));sud(vne.length===0,`2 controlPermissions ⊆ controlKeys: права ${cp.length}, вне controlKeys: [${vne}]`);
const peres=ck.filter(k=>keys.includes(k));sud(peres.length===0,`3 controlKeys ∩ keys = ∅: пересечение [${peres}]`);
// B-N-1624 (2.5.101+): режим new. Забава — new любым адресатам своего списка; Искра — pause и new, new только поимённо из шести
// (mail-stop-protocol.js ISKRA_NEW_RECIPIENTS; «*» и прочие имена — НЕГОДНО). Перечень дублирует код канала: правка одного без другого — расхождение.
const ISKRA_NEW=['zarya','avrora','petrovich','alfa','beta','gamma'];
const pr=cp.map(k=>{const p=t.controlPermissions[k];const m=Array.isArray(p?.modes)?p.modes:[];
 const ok=['zabava','iskra'].includes(p?.principal)&&Array.isArray(p?.recipients)&&p.recipients.length>0&&m.length>0&&m.every(x=>['pause','replace','new'].includes(x))&&(p.principal!=='iskra'||(m.every(x=>['pause','new'].includes(x))&&(!m.includes('new')||p.recipients.every(r=>ISKRA_NEW.includes(r)))));
 return [k,p?.principal,m.join('/'),ok]});
sud(pr.every(x=>x[3]),`4 права: ${pr.map(x=>`${x[0]}→${x[1]}:${x[2]}${x[3]?'':' НЕГОДНО'}`).join(' · ')||'нет'}`);
const ed=ck.map(k=>{try{return [k,crypto.createPublicKey(t.controlKeys[k]).asymmetricKeyType]}catch{return [k,'не разобран']}});
sud(ed.every(x=>x[1]==='ed25519'),`5 controlKeys Ed25519: ${ed.map(x=>x.join('=')).join(' · ')||'нет'}`);
for(const f of stopConfigs){let id;try{id=JSON.parse(fs.readFileSync(f,'utf8')).status_key_id}catch(e){console.error(`🔴 ${f} не читается: ${e.message}`);process.exit(2);}
 const gde=[['keys',keys],['controlKeys',ck],['controlPermissions',cp]].filter(([,s])=>s.includes(id)).map(([n])=>n);
 sud(typeof id==='string'&&gde.length===0,`6 ключ статусов ${id} (${f}) вне keys/controlKeys/controlPermissions: ${gde.length?'НАЙДЕН в '+gde:'да'}`);}
if(!stopConfigs.length)console.log('⚪ 6 ключ статусов не сверялся (нет --stop-config)');
const rr=t.returnRoutes??{};const net=cp.filter(k=>{const r=Object.hasOwn(rr,k)?rr[k]:null;return !(r&&Object.keys(r).sort().join()==='directory,ledger_uuid,recipient'&&typeof r.directory==='string'&&r.directory.startsWith('/')&&r.recipient&&r.ledger_uuid)});
sud(net.length===0,`7 returnRoutes по key_id (ровно recipient/ledger_uuid/directory, путь абсолютный — mail-stop-protocol.js:30): без годного маршрута [${net}]`);
sud(st.uid===0&&(st.mode&0o022)===0,`8 ${trustFile}: владелец uid ${st.uid}, режим ${(st.mode&0o777).toString(8)}`);
console.log(bad?`ИТОГ: 🔴 ${bad} — НЕ включать стоп`:'ИТОГ: ✅ доверие стопа сходится');process.exit(bad?1:0);
