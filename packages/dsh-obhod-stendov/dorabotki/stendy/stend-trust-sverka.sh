#!/usr/bin/env bash
# stend-trust-sverka.sh <сверка.mjs> — от root (sudo bash): образцовый trust и по порче на правило; каждая порча — ровно своя 🔴.
S=${1:?сверка}; T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; ok=0; bad=0
node - "$T" <<'JS'
const fs=require('fs'),c=require('crypto'),T=process.argv[2];
const pub=()=>c.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
const route=(r)=>({recipient:r,ledger_uuid:'l-'+r,directory:'/var/spool/a2a/'+r});
const base={version:1,status:'approved',clockSkewMs:30000,maxLifetimeMs:900000,keys:{'zabava-20261002':pub()},
 controlKeys:{'zabava-stop-1':pub(),'iskra-stop-1':pub()},
 controlPermissions:{'zabava-stop-1':{principal:'zabava',recipients:['*'],modes:['pause','replace']},'iskra-stop-1':{principal:'iskra',recipients:['*'],modes:['pause']}},
 returnRoutes:{'zabava-stop-1':route('zabavy'),'iskra-stop-1':route('iskra')}};
const w=(n,f)=>{const z=structuredClone(base);f(z);fs.writeFileSync(`${T}/${n}.json`,JSON.stringify(z));};
w('ispravnoe',()=>{});
w('p2',z=>{z.controlPermissions['zabava-20261002']={principal:'zabava',recipients:['*'],modes:['pause']};z.returnRoutes['zabava-20261002']=route('zabavy');}); // как в MAIL-STOP.md
w('p3',z=>{z.keys['iskra-stop-1']=z.controlKeys['iskra-stop-1'];});
w('p4',z=>{z.controlPermissions['iskra-stop-1'].modes=['pause','replace'];});
w('p5',z=>{z.controlKeys['iskra-stop-1']='не ключ';});
w('p7',z=>{delete z.returnRoutes['iskra-stop-1'];});
w('pusto',z=>{z.controlKeys={};z.controlPermissions={};z.returnRoutes={};});
fs.writeFileSync(`${T}/stop-ok.json`,JSON.stringify({status_key_id:'status-sadik-1'}));
fs.writeFileSync(`${T}/stop-bad.json`,JSON.stringify({status_key_id:'zabava-20261002'}));
JS
chmod 644 $T/*.json
zov(){ node "$S" --trust $T/$1.json --stop-config $T/$2.json > $T/out 2>&1; echo $?; }
pr(){ local k=$(zov $2 $3); local red=$(grep -oE '^🔴 [0-9]' $T/out | grep -oE '[0-9]$' | tr '\n' ' ' | sed 's/ $//'); if [ "$k" = "$4" ] && [ "$red" = "$5" ]; then ok=$((ok+1)); echo "✅ $1: код $k, красные [$red]"; else bad=$((bad+1)); echo "❌ $1: код $k, красные [$red] (ждала $4 [$5])"; fi; }
pr "исправное" ispravnoe stop-ok 0 ""
pr "право на ОБЫЧНОМ ключе (как MAIL-STOP.md)" p2 stop-ok 1 "2"
pr "ключ стопа и в keys" p3 stop-ok 1 "3"
pr "iskra с replace" p4 stop-ok 1 "4"
pr "controlKeys не Ed25519" p5 stop-ok 1 "5"
pr "ключ статусов в keys" ispravnoe stop-bad 1 "6"
pr "нет маршрута у iskra" p7 stop-ok 1 "7"
pr "стоп не настроен (пусто)" pusto stop-ok 1 "0"
chmod 666 $T/ispravnoe.json; pr "trust пишется прочими" ispravnoe stop-ok 1 "8"
echo "ИТОГ: ok $ok · fail $bad"; [ $bad = 0 ]
