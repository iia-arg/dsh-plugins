// A missing chat argument must fail before deployment, including the private/audio branch.
import assert from 'node:assert/strict';
import {harness} from './attachment-harness.mjs';
for (const kind of ['voice','audio']) {
  const h=harness({});
  for (const chat of [123,456]) await h.run({update_id:chat,message:{chat:{id:chat,type:'private'},from:{id:chat},[kind]:{file_id:'fixture',duration:2}}},{id:'r'});
  assert.deepEqual(h.voiceRoutes,['123','456']);
  console.log('PASS handleUpdate forwards distinct conversation for '+kind);
}

for (const [allowedIds,want] of [[[],true],[[123],false]]) {
  const h=harness({}, {openBot:true,allowedIds});
  await h.run({update_id:1,message:{chat:{id:123,type:'private'},from:{id:123},voice:{file_id:'fixture',duration:2}}},{id:'r'});
  assert.deepEqual(h.archiveDisabled,[want]);
  console.log('PASS guest archive flag='+want+' from real admission inputs');
}
