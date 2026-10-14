// RU: Стенд якоря родного приёма (B-N-1600): ABI rc.2 разрешается от appDir ПЛАТФОРМЫ агента, не от каталога плагина; без якоря — честный откат на next-turn с причиной в журнале.
// EN: Native-admission anchor harness (B-N-1600): the rc.2 ABI resolves from the agent platform appDir, not from the plugin directory; without an anchor, an honest next-turn fallback with the reason logged.
// Платформа — DSH_TEST_APP (как у остальных стендов SDK-входа). Нет её — СЛЕПОТА, код 2: исправный случай проверить нечем.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';
import {SdkInbox} from '../src/sdk-inbox.js';
const app=process.env.DSH_TEST_APP;
if(!app||!path.isAbsolute(app)||!fs.existsSync(path.join(app,'package.json'))){console.error(`СЛЕПОТА: нужен DSH_TEST_APP с платформой (сейчас ${JSON.stringify(app)})`);process.exit(2)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'stend-sdk-inbox-yakor-'));let n=0;
const agent={inbox:{mutate(){},claim(){},dispatch:{emit(){}}},session:{append(){}}};
function probe(name,appDir,ag,expectOk,expectReason){
 const logs=[];const l=new MessageReceipts(path.join(root,'l'+(++n)));
 const inbox=new SdkInbox(l,{},{},m=>logs.push(m),appDir);
 const ok=inbox.compatible(ag);inbox.compatible(ag);
 const un=logs.filter(m=>m.includes('native rc.2 admission ABI unavailable'));
 assert.equal(ok,expectOk,name+': compatible');
 if(expectOk)assert.equal(un.length,0,name+': строки unavailable быть не должно');
 else{assert.equal(un.length,1,name+': ровно одна строка unavailable (не повторяется)');assert.ok(un[0].includes(expectReason),name+`: в журнале причина «${expectReason}», а было: ${un[0]}`);}
 l.close?.();console.log('PASS '+name);
}
try{
 probe('платформа агента (DSH_TEST_APP) — родной путь принят',app,agent,true);
 probe('appDir не разрешается — откат с причиной','/nonexistent-B-N-1600',agent,false,'не разрешился от /nonexistent-B-N-1600');
 probe('appDir не задан — откат с причиной',undefined,agent,false,'не задан appDir');
 probe('у агента нет ABI rc.2 — откат с причиной',app,{inbox:{},session:{}},false,'нет inbox ABI rc.2');
 console.log('PASSED 4 anchor cases');
}finally{fs.rmSync(root,{recursive:true,force:true})}
