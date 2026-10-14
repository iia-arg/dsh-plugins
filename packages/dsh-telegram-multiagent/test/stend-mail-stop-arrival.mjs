import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
let api={};try{api=await import('../src/mail-stop-arrival.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
assert.equal(typeof api.observeStopArrivals,'function','missing independent arrival observer');
if(process.getuid()!==0){console.log('СЛЕПОТА: arrival observer test needs root-owned records');process.exit(2)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-arrival-'));
try{
 const inbox=path.join(root,'inbox'),records=path.join(root,'records');fs.mkdirSync(inbox);fs.mkdirSync(records);
 const old=path.join(inbox,'old.txt');fs.writeFileSync(old,'[a2a-envelope version=2]\n{"kind":"task-stop/1"}\n');
 const observer=api.observeStopArrivals({root:records,mailboxes:[{recipient:'fixture-agent',directory:inbox}]});
 assert.equal(api.readStopArrival(records,old,fs.readFileSync(old),'fixture-agent'),null,'startup scan is not an arrival timestamp');
 const file=path.join(inbox,'new.txt'),raw=Buffer.from('[a2a-envelope version=2]\n{"kind":"task-stop/1"}\n');
 fs.writeFileSync(file+'.tmp',raw);fs.renameSync(file+'.tmp',file);
 let fact;for(let n=0;n<100&&!fact;n++){await new Promise(r=>setTimeout(r,10));fact=api.readStopArrival(records,file,raw,'fixture-agent')}
 assert.ok(fact,'observer did not record subject');assert.equal(fact.recipient,'fixture-agent');assert.ok(Number.isSafeInteger(fact.delivered_at));
 assert.equal(api.readStopArrival(records,file,Buffer.from('changed wire'),'fixture-agent'),null);
 assert.equal(api.readStopArrival(records,file,raw,'other-agent'),null);
 const first=fact.event_id;fs.unlinkSync(file);fs.writeFileSync(file+'.tmp',raw);fs.renameSync(file+'.tmp',file);
 let next;for(let n=0;n<100&&!next;n++){await new Promise(r=>setTimeout(r,10));next=api.readStopArrival(records,file,raw,'fixture-agent')}
 assert.ok(next);assert.notEqual(next.event_id,first,'new publication cannot borrow old arrival time');
 observer.close();console.log('PASS external arrival event, root-owned record, startup unknown, exact bytes/path/recipient and immutable first event');
}finally{fs.rmSync(root,{recursive:true,force:true})}
