// RU: Изолированный стенд stend-new-return.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-new-return.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';import {cancellationReturn,cancellationNotice,deliverCancellationReturn} from '../src/cancellation-return.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'new-return-')),l=new MessageReceipts(path.join(root,'ledger'));
try{
 const routes={remoteReturnRecipients:{reviewer:'reviewer'},coordinatorReturnRecipient:'coordinator',sharedSenderName:'coders',spoolDir:path.join(root,'spool'),a2aDir:path.join(root,'a2a')};
 const make=(sender,origin)=>l.receive(sender+origin,Buffer.from('message '+sender),{sender,sourcePath:origin,hold:false});
 const local=make('dispatcher',path.join(routes.spoolDir,'one.txt')),remote=make('reviewer',path.join(routes.a2aDir,'in','two.txt')),unknown=make('coders',path.join(routes.spoolDir,'three.txt'));
 assert.deepEqual(cancellationReturn(local,l,routes),{kind:'local',recipient:'dispatcher'});assert.deepEqual(cancellationReturn(remote,l,routes),{kind:'remote',recipient:'reviewer'});assert.equal(cancellationReturn(unknown,l,routes).kind,'unknown');
 const courier=path.join(root,'courier.mjs'),captured=path.join(root,'captured.jsonl');
 fs.writeFileSync(courier,`#!/usr/bin/env node\nconst fs=require('node:fs');\n`,{mode:0o700});

 fs.writeFileSync(courier,`#!/usr/bin/env node\nimport fs from 'node:fs';let text='';for await(const x of process.stdin)text+=x;const args=process.argv.slice(2);if(args.length===1)text=fs.readFileSync(args[0],'utf8');fs.appendFileSync(${JSON.stringify(captured)},JSON.stringify({args,text})+'\\n');\n`,{mode:0o700});
 for(const r of [local,remote])await deliverCancellationReturn({id:r.id,body:JSON.stringify({destination:cancellationReturn(r,l,routes),text:cancellationNotice(r)})},l.root,{localCourier:courier,remoteCourier:courier,...routes});
 const received=fs.readFileSync(captured,'utf8').trim().split('\n').map(JSON.parse);assert.deepEqual(received[0].args,['--bez-kopii','dispatcher']);assert.equal(received[0].text,cancellationNotice(local));assert(received[1].args[0].includes('dlya-reviewer-'));assert(received[1].text.includes(cancellationNotice(remote)));
 await assert.rejects(deliverCancellationReturn({id:unknown.id,body:JSON.stringify({destination:cancellationReturn(unknown,l,routes),text:cancellationNotice(unknown)})},l.root),/^Error: HOLD:/);
 const pauseText=`агент на паузе по /stop с 2026-10-03T00:00:00.000Z, письмо ${local.id} в очереди (срез 2026-10-03T00:00:01.000Z).`;let fenced=0;
 for(const r of [local,remote])await deliverCancellationReturn({id:r.id+':pause-notice',body:JSON.stringify({kind:'pause',destination:cancellationReturn(r,l,routes),text:pauseText})},l.root,{localCourier:courier,remoteCourier:courier,...routes,beforeRemoteDispatch:()=>{fenced++;}});
 const all=fs.readFileSync(captured,'utf8').trim().split('\n').map(JSON.parse);assert.equal(all[2].text,pauseText);assert(all[3].args[0].includes('pause-notice-'));assert(all[3].text.includes('reply=no'));assert(all[3].text.includes(pauseText));assert.equal(fenced,1);
 const pauseAck=l.receive('pause-ack',Buffer.from(all[3].text),{sender:'workerthree',hold:false});assert.equal(cancellationReturn(pauseAck,l,routes).kind,'none');
 const ack=l.receive('ack',Buffer.from('[delivery-v1 id=return reply=no]\n'+cancellationNotice(local)),{sender:'workerthree',hold:false});assert.equal(cancellationReturn(ack,l,routes).kind,'none');
 const stoppedNotice=cancellationNotice({...local,claimed_turn:3});assert(stoppedNotice.includes('ход ранее прерван'));assert(!stoppedNotice.includes('не исполнялось'));
 const stoppedAck=l.receive('stopped-ack',Buffer.from('[delivery-v1 id=stopped-return reply=no]\n'+stoppedNotice),{sender:'workerthree',hold:false});assert.equal(cancellationReturn(stoppedAck,l,routes).kind,'none');
 console.log('PASS explicit local/remote routes, one-line body through subprocess couriers, unknown held, no ack loops');
}finally{l.close();fs.rmSync(root,{recursive:true,force:true})}
