import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const mod=await import('../src/claude-turn-usage.js').catch(()=>({}));
assert.equal(typeof mod.ClaudeTurnUsage,'function','Claude end writer missing');
const {ClaudeTurnUsage,MAX_TURN_USAGE_BYTES}=mod;
const top=fs.mkdtempSync(path.join(os.tmpdir(),'claude-turn-usage-'));let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name)}
function fixture(name){
 const root=path.join(top,name);fs.mkdirSync(root,{mode:0o700});const logs=[];
 const writer=new ClaudeTurnUsage(root,'master',{log:s=>logs.push(s)});
 const session={id:'session-one',header:{createdAt:1000}};let seq=0;
 const emit=(type,data,time=2000)=>writer.observe(session,{type,data,time,seq:seq++});
 const usage=(u,turn=1,provider='claude-oauth')=>emit('assistant/message',{turn,message:{source:{provider,model:'claude-fixture'},content:[{type:'text',text:'PRIVATE BODY'}]},usage:u});
 const end=(turn=1,kind='completed')=>emit('turn/end',{turn,reason:{kind}},3000+turn);
 const rows=()=>fs.existsSync(writer.file)?fs.readFileSync(writer.file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 return {root,writer,session,emit,usage,end,rows,logs};
}
try{
 test('multiple calls sum disjoint input buckets once; one end row; no prompt/RUN/start',()=>{
  const f=fixture('sum');f.emit('turn/start',{turn:1});
  f.usage({inputTokens:100,cacheReadTokens:20,cacheWriteTokens:5,outputTokens:30,reasoningTokens:11});
  f.usage({inputTokens:7,outputTokens:9});assert.equal(f.rows().length,0);f.end();
  const [r]=f.rows();assert.equal(f.rows().length,1);assert.deepEqual([r.input,r.cached,r.cache_write,r.output,r.vyzovov],[132,20,5,39,2]);
  assert.equal(r.schemaVersion,1);assert.equal(r.kind,'turn_end');assert.equal(r.participant,'master');assert.equal(r.engine,'claude');assert.equal(r.polnota,'parent_only');
  assert.equal(r.sessionId,f.session.id);assert.equal(r.sessionCreated,1000);assert.equal(r.turn,1);assert.equal(r.ts,new Date(3001).toISOString());assert.equal(r.status,'completed');
  assert.equal(fs.statSync(f.writer.file).mode&0o777,0o600);
  const raw=fs.readFileSync(f.writer.file,'utf8');assert.ok(!raw.includes('PRIVATE BODY'));assert.ok(!raw.includes('runId'));assert.ok(!raw.includes('turn_start'));
 });
 test('abrupt missing end, aborted end and error end do not write',()=>{
  for(const kind of [null,'aborted','error']){const f=fixture('abort-'+kind);f.usage({inputTokens:3,outputTokens:4});if(kind)f.end(1,kind);f.writer.close();assert.deepEqual(f.rows(),[])}
 });
 test('two completed turns give two independent totals; duplicate event/end not counted twice',()=>{
  const f=fixture('two');const event={type:'assistant/message',time:2000,seq:99,data:{turn:1,message:{source:{provider:'claude-oauth'}},usage:{inputTokens:3,outputTokens:4}}};
  f.writer.observe(f.session,event);f.writer.observe(f.session,event);f.end();f.end();
  f.usage({inputTokens:8,outputTokens:9},2);f.end(2);assert.deepEqual(f.rows().map(r=>[r.turn,r.input,r.output,r.vyzovov]),[[1,3,4,1],[2,8,9,1]]);
 });
 test('replaying a completed turn after end and newer turns never appends it twice',()=>{
  const f=fixture('replay');
  const message={type:'assistant/message',seq:1,time:2000,data:{turn:1,message:{source:{provider:'claude-oauth'}},usage:{inputTokens:3,outputTokens:4}}};
  const start={type:'turn/start',seq:0,time:1999,data:{turn:1}};
  const end={type:'turn/end',seq:2,time:3000,data:{turn:1,reason:{kind:'completed'}}};
  const replay=()=>{for(const event of [start,message,end])f.writer.observe(f.session,event)};
  replay();replay();assert.equal(f.rows().length,1,'full callback replay appended the same end');
  f.emit('turn/start',{turn:2});f.usage({inputTokens:8,outputTokens:9},2);replay();f.end(2);
  assert.deepEqual(f.rows().map(r=>[r.turn,r.input]),[[1,3],[2,8]],'stale start must not discard a newer pending turn');
  for(let turn=3;turn<=70;turn++){f.emit('turn/start',{turn});f.usage({inputTokens:8,outputTokens:9},turn);f.end(turn)}
  replay();assert.equal(f.rows().length,70,'late retry must not outlive a bounded tombstone cache');
  assert.deepEqual(f.rows().map(r=>r.turn),Array.from({length:70},(_,i)=>i+1));
 });
 test('lease remount and retry after ambiguous append error cannot duplicate a completed turn',()=>{
  const f=fixture('retry');const message={type:'assistant/message',seq:1,time:2000,data:{turn:1,message:{source:{provider:'claude-oauth'}},usage:{inputTokens:3,outputTokens:4}}};
  const end={type:'turn/end',seq:2,time:3000,data:{turn:1,reason:{kind:'completed'}}};
  const a=mod.acquireClaudeTurnUsage(f.root,'master');a.observe(f.session,message);a.observe(f.session,end);a.close();
  const b=mod.acquireClaudeTurnUsage(f.root,'master');b.observe(f.session,message);b.observe(f.session,end);b.close();
  assert.equal(f.rows().length,1,'remount callback retry appended the same end');
  const append=f.writer.append.bind(f.writer);f.writer.append=row=>{append(row);throw Error('after append')};
  f.usage({inputTokens:5,outputTokens:6},2);f.end(2);f.usage({inputTokens:5,outputTokens:6},2);f.end(2);
  assert.equal(f.rows().length,2,'ambiguous successful write must not be retried');
 });
 test('same Session object with new createdAt accepts turn zero and retains per-epoch dedup',()=>{
  const f=fixture('epoch');f.usage({inputTokens:3,outputTokens:4},7);f.end(7);
  const sameSession=f.session;f.session.header.createdAt=2000;
  f.emit('turn/start',{turn:0});f.usage({inputTokens:8,outputTokens:9},0);f.end(0);
  assert.equal(f.session,sameSession,'must exercise an epoch change on the same live object');
  assert.deepEqual(f.rows().map(r=>[r.sessionCreated,r.turn,r.input,r.output]),[[1000,7,3,4],[2000,0,8,9]],'new epoch turn zero was silently discarded');
  f.usage({inputTokens:8,outputTokens:9},0);f.end(0);assert.equal(f.rows().length,2,'new epoch callback replay must still deduplicate');
  f.session.header.createdAt=1000;f.usage({inputTokens:3,outputTokens:4},7);f.end(7);assert.equal(f.rows().length,2,'old epoch callback replay must still deduplicate');
 });
 test('mounted writer uses process account rather than the display agentName',()=>{
  const f=fixture('account');const writer=mod.acquireClaudeTurnUsage(f.root,'искра');
  writer.observe(f.session,{type:'assistant/message',seq:1,time:2000,data:{turn:1,message:{source:{provider:'claude-oauth'}},usage:{inputTokens:3,outputTokens:4}}});
  writer.observe(f.session,{type:'turn/end',seq:2,time:3000,data:{turn:1,reason:{kind:'completed'}}});writer.close();
  assert.equal(f.rows().length,1,'display name must not prevent a measured end');assert.equal(f.rows()[0].participant,os.userInfo().username);
 });
 test('invalid or unavailable process account drops rows with only one notice across mounts',()=>{
  const userInfo=os.userInfo,logs=[];
  try{
   for(const scenario of ['invalid','unavailable']){
    os.userInfo=()=>{if(scenario==='unavailable')throw Error('fixture account unavailable');return{username:'не-ascii'}};
    const f=fixture('bad-account-'+scenario);const writer=mod.acquireClaudeTurnUsage(f.root,'sova',{log:x=>logs.push(x)});
    for(let turn=1;turn<=3;turn++){
     writer.observe(f.session,{type:'assistant/message',seq:turn*2,time:2000,data:{turn,message:{source:{provider:'claude-oauth'}},usage:{inputTokens:3,outputTokens:4}}});
     writer.observe(f.session,{type:'turn/end',seq:turn*2+1,time:3000,data:{turn,reason:{kind:'completed'}}});
    }
    writer.close();assert.equal(f.rows().length,0,'invalid identity must not fall back to config agentName');
   }
   assert.equal(logs.length,1,'bad identity notice must be once per process, not per turn or mount');assert.match(logs[0],/CLAUDE_TURN_USAGE_PARTICIPANT_INVALID/);
  }finally{os.userInfo=userInfo}
 });
 test('Codex and missing provider produce no Claude row, no invented empty zero',()=>{
  for(const provider of ['openai','fixture',null]){const f=fixture('other-'+provider);f.usage({inputTokens:100,cacheReadTokens:40,outputTokens:5},1,provider);f.end();assert.deepEqual(f.rows(),[])}
  const f=fixture('empty');f.emit('turn/start',{turn:1});f.end();assert.deepEqual(f.rows(),[]);
 });
 test('invalid and overflowing counts refuse this turn, next healthy turn recovers',()=>{
  for(const invalid of [-1,NaN,Number.MAX_SAFE_INTEGER]){const f=fixture('invalid-'+String(invalid));f.usage({inputTokens:invalid,cacheReadTokens:1,outputTokens:4});f.end();assert.deepEqual(f.rows(),[]);assert.ok(f.logs.some(x=>x.includes('CLAUDE_TURN_USAGE_INVALID')));f.usage({inputTokens:2,outputTokens:3},2);f.end(2);assert.equal(f.rows().length,1)}
 });
 test('rotation keeps one previous file, changes current inode, subsequent turn still writes',()=>{
  const f=fixture('rotation');f.usage({inputTokens:1,outputTokens:2});f.end();
  const payload=JSON.stringify({padding:'x'.repeat(MAX_TURN_USAGE_BYTES-30)})+'\n';fs.writeFileSync(f.writer.file,payload,{mode:0o600});const before=fs.statSync(f.writer.file).ino;
  f.usage({inputTokens:3,outputTokens:4},2);f.end(2);assert.notEqual(fs.statSync(f.writer.file).ino,before);assert.equal(fs.readFileSync(f.writer.file+'.1','utf8'),payload);assert.equal(f.rows()[0].turn,2);
  fs.writeFileSync(f.writer.file,payload);f.usage({inputTokens:5,outputTokens:6},3);f.end(3);assert.equal(f.rows()[0].turn,3);assert.equal(fs.readdirSync(f.root).length,2);assert.ok(fs.statSync(f.writer.file).size<=MAX_TURN_USAGE_BYTES);
 });
 test('unsafe symlink refuses without touching target or caller; next healthy turn recovers',()=>{
  const f=fixture('unsafe');const victim=path.join(top,'victim');fs.writeFileSync(victim,'untouched');fs.symlinkSync(victim,f.writer.file);
  f.usage({inputTokens:1,outputTokens:2});assert.doesNotThrow(()=>f.end());assert.equal(fs.readFileSync(victim,'utf8'),'untouched');assert.ok(f.logs.some(s=>s.includes('CLAUDE_TURN_USAGE_WRITE_FAILED')));
  fs.unlinkSync(f.writer.file);f.usage({inputTokens:3,outputTokens:4},2);f.end(2);assert.equal(f.rows()[0].turn,2);
 });
 test('shared mount release keeps in-flight usage until the last owner closes',()=>{
  const f=fixture('mounts');const a=mod.acquireClaudeTurnUsage(f.root,'master'),b=mod.acquireClaudeTurnUsage(f.root,'master');
  const message={type:'assistant/message',seq:1,time:2000,data:{turn:1,message:{source:{provider:'claude-oauth'}},usage:{inputTokens:3,outputTokens:4}}};
  a.observe(f.session,message);b.observe(f.session,message);a.close();a.close();
  b.observe(f.session,{type:'turn/end',seq:2,time:3000,data:{turn:1,reason:{kind:'completed'}}});assert.equal(f.rows().length,1);assert.equal(f.rows()[0].vyzovov,1);b.close();
 });
 test('pending memory is bounded at 64 and discarded old turns never become measured zeros',()=>{
  const f=fixture('pending');for(let n=0;n<65;n++){const s={id:'pending-'+n,header:{createdAt:1000}};f.writer.observe(s,{type:'assistant/message',seq:1,time:2000,data:{turn:1,message:{source:{provider:'claude-oauth'}},usage:{inputTokens:1,outputTokens:2}}})}
  assert.equal(f.writer.pending.size,64);assert.ok(f.logs.some(x=>x.includes('CLAUDE_TURN_USAGE_PENDING_LIMIT')));
  f.writer.observe({id:'pending-0',header:{createdAt:1000}},{type:'turn/end',seq:2,time:3000,data:{turn:1,reason:{kind:'completed'}}});assert.deepEqual(f.rows(),[]);f.writer.close();assert.equal(f.writer.pending.size,0);
 });
 test('partial previous line is separated and next valid end survives without replay',()=>{
  const f=fixture('partial');fs.writeFileSync(f.writer.file,'{"partial":',{mode:0o600});f.usage({inputTokens:0,outputTokens:0});f.end();
  const lines=fs.readFileSync(f.writer.file,'utf8').split('\n');assert.equal(lines[0],'{"partial":');const r=JSON.parse(lines[1]);assert.equal(r.input,0);assert.equal(r.vyzovov,1);
 });
 console.log(`Claude turn usage: ${passed}/${passed}`);
}finally{fs.rmSync(top,{recursive:true,force:true})}
