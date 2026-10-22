import {cycleReporter} from './cycle-log.mjs';
import {hash,canonical} from './store.mjs';
import {MetaApi,MetaError} from './meta-api.mjs';
import {readVkToken} from './vk-api.mjs';
export function metaDefaults(config){
 return {maxRoots:10000,dailyCallLimit:2000,editCards:true,messagesEnabled:true,accessEpoch:0,...config};
}
export class MetaState{
 constructor(store,source,config,{now=store.now}={}){
  this.store=store;this.db=store.db;this.source=source;this.config=metaDefaults(config);this.now=now;
  if(!Number.isSafeInteger(this.config.dailyCallLimit)||this.config.dailyCallLimit<1||this.config.dailyCallLimit>100000||!Number.isSafeInteger(this.config.maxRoots)||this.config.maxRoots<1||this.config.maxRoots>100000)throw new MetaError('configuration');
  this.db.exec('CREATE TABLE IF NOT EXISTS meta_roots(source TEXT NOT NULL,object_id TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(source,object_id,kind)); CREATE TABLE IF NOT EXISTS meta_state(source TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta_objects(source TEXT NOT NULL,object_id TEXT NOT NULL,identity_json TEXT NOT NULL,fingerprint TEXT NOT NULL,version INTEGER NOT NULL,emitted INTEGER NOT NULL,PRIMARY KEY(source,object_id)); CREATE TABLE IF NOT EXISTS meta_holds(source TEXT NOT NULL,object_id TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(source,object_id)); CREATE TABLE IF NOT EXISTS meta_pages(source TEXT NOT NULL,page_key TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(source,page_key)); CREATE TABLE IF NOT EXISTS meta_jobs(source TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(source,id));');
  if(!this.db.prepare('PRAGMA table_info(meta_roots)').all().some(c=>c.name==='baseline_complete'))this.db.exec('ALTER TABLE meta_roots ADD COLUMN baseline_complete INTEGER NOT NULL DEFAULT 0');
  this.db.prepare('INSERT OR IGNORE INTO meta_state VALUES(?,?)').run(source,JSON.stringify({day:null,calls:0,usage:null,backoffUntil:0,backoffReason:null,last_attempt:null,last_success:null,last_completed_scan:null,epoch:0,cycle:0,ready:false}));
 }
 get(){return JSON.parse(this.db.prepare('SELECT json FROM meta_state WHERE source=?').get(this.source).json)}
 write(s){this.db.prepare('UPDATE meta_state SET json=? WHERE source=?').run(JSON.stringify(s),this.source)}
 patch(values){this.store.tx(()=>this.write({...this.get(),...values}))}
 backoff(reason,until){this.patch({backoffReason:reason,backoffUntil:until})}
 reserve(){
  return this.store.tx(()=>{
   const s=this.get(),now=this.now(),day=new Date(now).toISOString().slice(0,10);
   if(s.day&&day<s.day)throw new MetaError('clock_regression');
   if(s.backoffUntil>now)throw new MetaError(s.backoffReason,{retryAt:s.backoffUntil});
   if(day!==s.day){s.day=day;s.calls=0}
   if(s.calls>=this.config.dailyCallLimit)throw new MetaError('daily_budget',{retryAt:Date.parse(day+'T00:00:00Z')+86400000});
   s.calls++;s.last_attempt=now;this.write(s);
  });
 }
}
export class MetaReader{
 constructor(store,provider,config,options={}){
  if(store.profile!=='anna'||!['instagram','threads'].includes(provider)||config.enabled!==true||config.armed!==true||!Number.isFinite(Date.parse(config.startAt)))throw new MetaError('configuration');
  this.store=store;this.db=store.db;this.provider=provider;this.account=store.target(provider);this.source=provider+':'+this.account;this.config=metaDefaults(config);this.now=options.now??store.now;this.state=new MetaState(store,this.source,this.config,{now:this.now});this.api=options.api;this.busy=false;this.alive=true;
  this.store.tx(()=>{const state=this.state.get();if(state.startAt&&state.startAt!==this.config.startAt)throw new MetaError('baseline_change');state.startAt=this.config.startAt;const accessChanged=this.config.accessEpoch>(state.accessEpoch??0),rootsRaised=this.config.maxRoots>(state.rootLimit??0);if(this.config.accessEpoch<(state.accessEpoch??0))throw new MetaError('access_epoch_regression');state.accessEpoch=this.config.accessEpoch;if(accessChanged)state.profileHold=null;state.rootLimit=this.config.maxRoots;state.epoch++;state.ready=false;this.epoch=state.epoch;
   // B-N-2027: одноразовая переподача ответов, удержанных прежней нормализацией (ответ без автора) — только Instagram, только replies,
   //   только normalize_identity; пометка в состоянии не даёт повторить на следующем подъёме.
   const requeue=this.provider==='instagram'&&!state.requeueRepliesNoAuthor;let vozvrat=0;
   for(const row of this.db.prepare('SELECT * FROM meta_jobs WHERE source=?').all(this.source)){const j=JSON.parse(row.json);const otvet=requeue&&j.method==='replies'&&j.reason==='normalize_identity';if(j.state==='held'&&(j.reason==='permissions'&&accessChanged||j.reason==='root_limit'&&rootsRaised||otvet)){j.state='pending';j.failures=0;j.reason=null;j.notBefore=0;this.writeJob(j);if(otvet)vozvrat++}}
   if(requeue)state.requeueRepliesNoAuthor={jobs:vozvrat,at:new Date(this.now()).toISOString()};
   // B-N-2027 3.1.7 (ворота 10:41Z): разовое снятие удержаний identity_conflict:subject_id, оставленных 3.1.6, — только Instagram, только
   //   объекты, уже лежащие в meta_objects; пометка snyatieKonfliktaAvtora не даёт повторить. Иначе снятие ждало бы прохода до /replies.
   if(this.provider==='instagram'&&!state.snyatieKonfliktaAvtora)state.snyatieKonfliktaAvtora={holds:this.db.prepare("DELETE FROM meta_holds WHERE source=? AND reason='identity_conflict:subject_id' AND object_id IN (SELECT object_id FROM meta_objects WHERE source=?)").run(this.source,this.source).changes,at:new Date(this.now()).toISOString()};
   this.state.write(state);
  });

 }
 hold(id,reason){this.db.prepare('INSERT INTO meta_holds VALUES(?,?,?) ON CONFLICT(source,object_id) DO UPDATE SET reason=excluded.reason').run(this.source,id,reason)}
 accept(items,pageKey,updateState=()=>{}){
  if(!Array.isArray(items)||items.length>1000||typeof pageKey!=='string'||!pageKey||pageKey.length>1024)throw new MetaError('page_shape');
  const digest=hash(canonical(items)),old=this.db.prepare('SELECT digest FROM meta_pages WHERE source=? AND page_key=?').get(this.source,pageKey);
  if(old){if(old.digest!==digest)throw new MetaError('page_conflict');return {replayed:true}}
  const before=this.store.cursor(this.source),after=String(BigInt(before??'0')+1n);
  return this.store.ingestBatch('anna',{source:this.source,expectedCursor:before,cursor:after,events:[]},()=>{
   if(this.state.get().epoch!==this.epoch)throw new MetaError('stale_epoch');
   for(const item of items){
    if(typeof item.id!=='string'||!item.id||item.id.length>1024||/[\0-\x1f\x7f]/.test(item.id))throw new MetaError('normalize_identity');
    const identity={kind:item.kind,conversation_id:item.conversation_id,subject_id:item.subject_id};
    const prior=this.db.prepare('SELECT * FROM meta_objects WHERE source=? AND object_id=?').get(this.source,item.id);
    if(prior){const saved=JSON.parse(prior.identity_json);
     // B-N-2027 3.1.7: строка без автора (Meta не передала from) не перезаписывает уже известного автора объекта — берётся
     //   сохранённый subject_id; kind и conversation_id сверяются как прежде. Иначе 3.1.6 давал hold identity_conflict:subject_id.
     //   Зеркало (ворота 10:41Z): сохранена заглушка «автор не передан» ЭТОГО объекта, а строка пришла с автором — тоже берётся
     //   сохранённый (событие с новым subject_id store отверг бы как конфликт, store.mjs:135).
     if(item.avtorNePeredan===true||this.provider==='instagram'&&saved.subject_id===hash(canonical(['instagram','avtor_ne_peredan',item.id])))identity.subject_id=saved.subject_id;
     const field=Object.keys(identity).find(k=>saved[k]!==identity[k]);if(field){this.hold(item.id,'identity_conflict:'+field);continue}}
    const fingerprint=hash(canonical({text:item.text})),version=prior?prior.version+(prior.fingerprint===fingerprint?0:1):1;
    const emit=Boolean(prior?.emitted)||version>1||(!prior&&(this.state.get().baselineComplete===true||item.section&&this.db.prepare('SELECT baseline_complete FROM meta_roots WHERE source=? AND object_id=? AND kind=?').get(this.source,item.section.id,item.section.kind)?.baseline_complete===1))||item.occurred_at>=Date.parse(this.config.startAt);
    const event={platform:this.provider,account_id:this.account,provider_id:hash(canonical([this.source,item.id,version])),...identity,text:item.text,occurred_at:item.occurred_at};
    this.store.validateEvent('anna',event);
    this.db.exec('SAVEPOINT meta_object');
    try{
     if(emit){
      const result=this.store.insertEvent('anna',event);
      if(version>1&&!this.config.editCards&&!result.duplicate)this.db.prepare("DELETE FROM outbox WHERE kind='event_card_request' AND aggregate_id=? AND state='held_stage1'").run(result.event_id);
     }
     this.db.prepare('INSERT INTO meta_objects VALUES(?,?,?,?,?,?) ON CONFLICT(source,object_id) DO UPDATE SET fingerprint=excluded.fingerprint,version=excluded.version,emitted=excluded.emitted').run(this.source,item.id,canonical(identity),fingerprint,version,Number(emit));
     this.db.prepare('DELETE FROM meta_holds WHERE source=? AND object_id=?').run(this.source,item.id);
     this.db.exec('RELEASE meta_object');
    }catch(e){
     this.db.exec('ROLLBACK TO meta_object');this.db.exec('RELEASE meta_object');
     if(e.message!=='event conflict')throw e;
     const oldEvent=this.db.prepare('SELECT * FROM events WHERE platform=? AND provider_id=?').get(this.provider,event.provider_id);
     const field=oldEvent?.key_id!=='anna'?'key_id':['account_id','kind','conversation_id','subject_id','text'].find(k=>oldEvent[k]!==event[k]);
     this.hold(item.id,'event_conflict:'+(field??'unknown'));
    }
   }
   this.db.prepare('INSERT INTO meta_pages VALUES(?,?,?)').run(this.source,pageKey,digest);this.db.prepare('DELETE FROM meta_pages WHERE source=? AND rowid NOT IN (SELECT rowid FROM meta_pages WHERE source=? ORDER BY rowid DESC LIMIT 1000)').run(this.source,this.source);updateState();
  });
 }
 status(){
  const s=this.state.get();
  return {configured:true,armed:true,account:this.account,ready:s.ready,visibility:s.visibility??'unverified',refresh:s.refresh?{phase:s.refresh.phase,last_attempt:s.refresh.last_attempt,issued_at:s.refresh.issued_at??null,expires_at:s.refresh.expires_at??null}:{phase:'disabled'},calls_today:s.calls,call_day_utc:s.day,daily_call_limit:this.config.dailyCallLimit,max_roots:this.config.maxRoots,usage:s.usage,backoff_until:s.backoffUntil,last_attempt:s.last_attempt,last_success:s.last_success,last_completed_scan:s.last_completed_scan,reason:s.reason??null,held_objects:this.db.prepare('SELECT object_id,reason FROM meta_holds WHERE source=? ORDER BY object_id LIMIT 20').all(this.source),held_jobs:this.jobs().filter(j=>j.state==='held').map(j=>({method:j.method,object_id:j.args.id??this.account,reason:j.reason})),roots:{posts:this.db.prepare("SELECT count(*) n FROM meta_roots WHERE source=? AND kind='post'").get(this.source).n,conversations:this.db.prepare("SELECT count(*) n FROM meta_roots WHERE source=? AND kind='conversation'").get(this.source).n},held_count:this.db.prepare('SELECT count(*) n FROM meta_holds WHERE source=?').get(this.source).n,pending_jobs:this.db.prepare('SELECT count(*) n FROM meta_jobs WHERE source=?').get(this.source).n};
 }
 jobs(){return this.db.prepare('SELECT json FROM meta_jobs WHERE source=?').all(this.source).map(r=>JSON.parse(r.json)).sort((a,b)=>a.order-b.order)}
 writeJob(job){this.db.prepare('INSERT INTO meta_jobs VALUES(?,?,?) ON CONFLICT(source,id) DO UPDATE SET json=excluded.json').run(this.source,job.id,JSON.stringify(job))}
 enqueue(method,args={},root=null){
  const id=hash(canonical([method,args.id??null,root]));if(this.db.prepare('SELECT 1 FROM meta_jobs WHERE source=? AND id=?').get(this.source,id))return;
  if(this.jobs().length>=100000)throw new MetaError('job_limit');
  const s=this.state.get();s.queueSeq=(s.queueSeq??0)+1;this.state.write(s);this.writeJob({id,method,args,root,order:s.queueSeq,state:'pending',failures:0,reason:null,notBefore:0});
 }
 beginCycle(){
  this.store.tx(()=>{
   const s=this.state.get();s.cycle++;s.ready=false;s.reason=null;this.state.write(s);this.enqueue('roots');
   if(this.provider==='instagram'&&this.config.messagesEnabled)this.enqueue('conversations');
   for(const r of this.db.prepare('SELECT * FROM meta_roots WHERE source=? ORDER BY object_id').all(this.source))this.enqueue(r.kind==='post'?(this.provider==='instagram'?'comments':'conversation'):'messages',{id:r.object_id},r.object_id);
  });
 }
 shape(data,job){
  if(job.method==='message'){if(data.id!==job.args.id)throw new MetaError('normalize_identity');return [data]}
  const page=job.method==='messages'?data.messages:data;
  if(!page||!Array.isArray(page.data)||page.data.length>1000)throw new MetaError('page_shape');return page.data;
 }
 normalize(row,job){
  const own=this.state.get().ownIds??[this.account],time=Date.parse(row.timestamp??row.created_time);
  if(typeof row.id!=='string'||!row.id||!Number.isSafeInteger(time)||time<0)throw new MetaError('normalize_identity');
  if(this.provider==='instagram'){
   if(job.method==='message'){
    if(typeof row.from?.id!=='string'||!Array.isArray(row.to?.data))throw new MetaError('normalize_identity');
    if(own.includes(row.from.id))return null;
    if(!row.to.data.some(x=>own.includes(x.id)))throw new MetaError('normalize_target');
    if(typeof row.message!=='string')throw new MetaError('normalize_text');
    return {id:row.id,kind:'dm',conversation_id:hash(canonical(['instagram',job.root])),subject_id:hash(row.from.id),text:row.message.trim()?row.message:'[Сообщение без текстового тела; вложения не получены]',occurred_at:time};
   }
   // B-N-2027 (14.10.2026): /replies Instagram отдаёт строки вовсе БЕЗ автора (живой v26: ни from, ни username, ни user). Такая строка —
   //   НЕ своя: принимается с отдельным субъектом на объект, иначе она держала всю страницу и терялись ответы гостей. Свой ответ, если
   //   это он, станет лишней карточкой на одобрение, а не публикацией. Только /replies; кривой from (есть, но без строкового id) — отказ.
   if(job.method==='replies'&&row.from===undefined&&typeof row.text==='string')return {id:row.id,kind:'comment',conversation_id:hash(canonical(['instagram',job.root])),subject_id:hash(canonical(['instagram','avtor_ne_peredan',row.id])),text:row.text,occurred_at:time,avtorNePeredan:true};
   if(typeof row.from?.id!=='string'||typeof row.text!=='string')throw new MetaError('normalize_identity');if(own.includes(row.from.id))return null;
   return {id:row.id,kind:'comment',conversation_id:hash(canonical(['instagram',job.root])),subject_id:hash(row.from.id),text:row.text,occurred_at:time};
  }
  if(typeof row.text!=='string'||typeof row.username!=='string'||!row.username||row.root_post?.id!==job.root||typeof row.replied_to?.id!=='string'||typeof row.is_reply_owned_by_me!=='boolean')throw new MetaError('normalize_identity');
  if(row.is_reply_owned_by_me)return null;
  return {id:row.id,kind:'comment',conversation_id:hash(canonical(['threads',job.root,row.replied_to.id])),subject_id:hash(row.username),text:row.text,occurred_at:time};
 }
 async tick({maxPages=100,budgetMs=300000}={}){
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100||!Number.isFinite(budgetMs)||budgetMs<=0||budgetMs>300000)throw new MetaError('configuration');
  if(this.busy||!this.alive)return;this.busy=true;const begin=performance.now(),started=this.now(),deadline=begin+budgetMs;let pages=0;
  this.reportCycle??=cycleReporter(this.provider,'read',row=>this.log?.(row));
  try{
   this.store.tx(()=>{const s=this.state.get();if(s.epoch!==this.epoch)throw new MetaError('stale_epoch');s.last_loop=this.now();this.state.write(s)});
   if(!this.api)throw new MetaError('credential_unavailable');
   const current=this.state.get(),fingerprint=this.pendingCredentialFingerprint??current.credentialFingerprint??null;
   if(current.profileHold&&current.profileHold.accessEpoch===this.config.accessEpoch&&current.profileHold.fingerprint===fingerprint)return;
   if(!this.verified){
    pages++;const profile=await this.api.call('me',{}, {timeoutMs:Math.min(30000,deadline-performance.now())});
    if((this.provider==='instagram'?profile.user_id??profile.id:profile.id)!==this.account)throw new MetaError('account_mismatch');
    if(this.state.get().epoch!==this.epoch)throw new MetaError('stale_epoch');
    const prior=this.state.get();this.state.patch({profileHold:null,credentialFingerprint:fingerprint,...(prior.refresh?.phase==='saved_not_loaded'&&prior.refresh.candidate_hash===fingerprint?{loadedRefresh:prior.refresh.id}:{}),ownIds:[...new Set([this.account,profile.id,profile.user_id].filter(x=>typeof x==='string'))]});
    if(prior.credentialFingerprint&&fingerprint&&prior.credentialFingerprint!==fingerprint)for(const job of this.jobs().filter(j=>j.state==='held'&&j.reason==='permissions')){job.state='pending';job.failures=0;job.notBefore=0;this.writeJob(job)}
    this.verified=true;
   }
   if(!this.jobs().some(j=>j.state==='pending')){if((this.state.get().nextCycleAt??0)>this.now())return;this.beginCycle()}
   while(this.alive&&pages<maxPages&&performance.now()<deadline){
    const job=this.jobs().find(j=>j.state==='pending'&&j.notBefore<=this.now());if(!job)break;
    let data,stage='read';
    try{
     pages++;data=await this.api.call(job.method,job.args,{timeoutMs:Math.min(30000,deadline-performance.now())});
     if(this.state.get().epoch!==this.epoch||!this.alive)throw new MetaError('stale_epoch');
     stage='page';const rows=this.shape(data,job),page=job.method==='messages'?data.messages:data;
     const nextPath=job.method==='messages'?'/'+this.config.apiVersion+'/'+encodeURIComponent(job.args.id)+'/messages':this.api.route(job.method,job.args).pathname;
     const next=job.method==='message'?null:this.api.nextCursor(page.paging,nextPath);
     stage='normalize';const items=['roots','conversations','messages','message_page'].includes(job.method)?[]:rows.map(row=>this.normalize(row,job)).filter(Boolean).map(item=>({...item,section:{id:job.root,kind:job.method==='message'?'conversation':'post'}}));
     stage='storage';const pageKey=hash(canonical([this.epoch,this.state.get().cycle,job.id,job.args.after??null,job.method,rows,this.store.cursor(this.source)]));
     this.accept(items,pageKey,()=>{
      if(['roots','conversations'].includes(job.method)){
       const kind=job.method==='roots'?'post':'conversation';
       for(const row of rows){
        if(typeof row.id!=='string'||!row.id||row.id.length>1024)throw new MetaError('normalize_identity');
        if(!this.db.prepare('SELECT 1 FROM meta_roots WHERE source=? AND object_id=? AND kind=?').get(this.source,row.id,kind)){
         if(this.db.prepare('SELECT count(*) n FROM meta_roots WHERE source=?').get(this.source).n>=this.config.maxRoots)throw new MetaError('root_limit');
         this.db.prepare('INSERT INTO meta_roots(source,object_id,kind) VALUES(?,?,?)').run(this.source,row.id,kind);
        }
        this.enqueue(kind==='post'?(this.provider==='instagram'?'comments':'conversation'):'messages',{id:row.id},row.id);
       }
      }else if(this.provider==='instagram'&&job.method==='comments'){
       for(const row of rows)this.enqueue('replies',{id:row.id},job.root);
      }else if(['messages','message_page'].includes(job.method)){
       for(const row of rows){if(typeof row.id!=='string'||!row.id)throw new MetaError('normalize_identity');this.enqueue('message',{id:row.id},job.root)}
      }
      if(next){job.args.after=next;if(job.method==='messages')job.method='message_page';const s=this.state.get();s.queueSeq=(s.queueSeq??0)+1;job.order=s.queueSeq;job.failures=0;this.state.write(s);this.writeJob(job)}
      else {this.db.prepare('DELETE FROM meta_jobs WHERE source=? AND id=?').run(this.source,job.id);if(job.root&&!this.jobs().some(j=>j.root===job.root))this.db.prepare('UPDATE meta_roots SET baseline_complete=1 WHERE source=? AND object_id=?').run(this.source,job.root)}
      const s=this.state.get();s.last_success=this.now();s.reason=null;this.state.write(s);
     });
    }catch(e){
     if(e.reason==='stale_epoch')throw e;
     if(e instanceof MetaError&&e.reason==='api_error'&&e.code===100&&job.args.after&&(job.cursorResets??0)<1){delete job.args.after;job.cursorResets=(job.cursorResets??0)+1;job.reason='cursor_rewind';job.notBefore=0;this.writeJob(job);this.state.patch({reason:'cursor_rewind',ready:false});continue}
     const reason=e.message==='event capacity reached'?'backpressure':e instanceof MetaError?e.reason:'storage_rejected';job.reason=reason;job.stage=stage;job.code=e instanceof MetaError?e.code:0;
     if(['rate_limit','usage_limit','daily_budget','backpressure','clock_regression'].includes(reason)){job.notBefore=['backpressure','clock_regression'].includes(reason)?this.now()+900000:e.retryAt||this.state.get().backoffUntil;this.writeJob(job);this.state.patch({reason,ready:false});break}
     job.failures++;
     if(reason==='permissions'||['root_limit','job_limit','normalize_identity','normalize_text','normalize_target','page_shape','page_origin','page_cursor','page_conflict'].includes(reason)||job.failures>=3)job.state='held';
     else job.notBefore=this.now()+[1000,4000,16000][job.failures-1];
     this.writeJob(job);this.state.patch({reason,ready:false});
     this.log?.({event:'meta_read_blocked',source:this.source,job:job.id,method:job.method,stage,reason,code:job.code});
    }
   }
   const jobs=this.jobs(),s=this.state.get();if(!jobs.some(j=>j.state==='pending')){s.nextCycleAt=this.now()+900000;if(jobs.length===0){s.last_completed_scan=this.now();s.baselineComplete=true;s.ready=this.status().held_count===0;s.visibility=this.db.prepare('SELECT count(*) n FROM meta_objects WHERE source=?').get(this.source).n?'api_objects_seen':'unverified_empty';s.reason=s.ready?null:'objects_held'}this.state.write(s)}
   else if(pages>=maxPages||performance.now()>=deadline)this.state.patch({reason:'series_budget',ready:false});
  }catch(e){if(this.state.get().epoch===this.epoch)this.state.patch({ready:false,reason:e instanceof MetaError?e.reason:'storage_rejected',...(e.reason==='permissions'&&!this.verified?{profileHold:{accessEpoch:this.config.accessEpoch,fingerprint:this.pendingCredentialFingerprint??this.state.get().credentialFingerprint??null}}:{})});this.log?.({event:'meta_poll_blocked',source:this.source,reason:e instanceof MetaError?e.reason:'storage_rejected'})}
  finally{this.busy=false;try{const state=this.state.get();this.reportCycle({started,finished:this.now(),elapsed:performance.now()-begin,calls:pages,result:state.reason==='daily_budget'?'parked':state.ready?'ok':state.reason?'blocked':'partial'})}catch{this.log?.({event:'social_cycle_unavailable',platform:this.provider,lane:'read'})}}
 }

}

export function startMetaSubsystem(store,config,{fetchImpl=fetch,log=value=>console.log(JSON.stringify(value))}={}){
 const readers=[];
 for(const [provider,c] of Object.entries(config??{}))if(c.enabled){
  const reader=new MetaReader(store,provider,c);reader.log=log;
  const load=()=>{try{const token=readVkToken(c.token),fingerprint=hash(token);const refresh=reader.state.get().refresh;if(fingerprint!==reader.credentialFingerprint||refresh?.phase==='saved_not_loaded'&&refresh.id!==reader.observedRefresh){reader.observedRefresh=refresh?.id;reader.api?.stop();reader.api=new MetaApi({provider,account:reader.account,version:c.apiVersion,token,budget:reader.state,fetchImpl});reader.credentialFingerprint=fingerprint;reader.pendingCredentialFingerprint=fingerprint;reader.verified=false;}return true}catch{reader.state.patch({ready:false,reason:'credential_unavailable'});return false}};
  const run=async()=>{if(!reader.alive)return;if(load())await reader.tick()};
  const timer=setInterval(()=>void run().catch(()=>log({event:'meta_poll_blocked',source:reader.source,reason:'storage_rejected'})),900000);timer.unref();const reload=setInterval(()=>{const s=reader.state.get();if(reader.alive&&s.refresh?.phase==='saved_not_loaded'&&s.loadedRefresh!==s.refresh.id&&!reader.busy)void run().catch(()=>log({event:'meta_reload_blocked',source:reader.source,reason:'storage_rejected'}))},5000);reload.unref();const pending=run();readers.push({reader,timer,reload,pending});
 }
 store.metaStatus=()=>Object.fromEntries(readers.map(x=>[x.reader.provider,x.reader.status()]));
 return {async stop(){for(const x of readers){x.reader.alive=false;clearInterval(x.timer);clearInterval(x.reload);x.reader.api?.stop()}await Promise.allSettled(readers.map(x=>x.pending));while(readers.some(x=>x.reader.busy))await new Promise(resolve=>setTimeout(resolve,10))}};
}
