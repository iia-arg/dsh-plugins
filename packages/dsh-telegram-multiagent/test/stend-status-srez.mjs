// RU: Изолированный стенд stend-status-srez.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-status-srez.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{DatabaseSync}from'node:sqlite';import{createHash}from'node:crypto';
const mod=await import('../src/compact-status.js').catch(()=>({}));
assert.equal(typeof mod.readCodexStatus,'function','точный читатель сессии отсутствует');
const d=mkdtempSync(join(tmpdir(),'status-proof-')); const id='11111111-1111-1111-1111-111111111111';
try {
 mkdirSync(join(d,'sessions')); const dbfile=join(d,'sessii.db');const db=new DatabaseSync(dbfile);db.exec('CREATE TABLE sessions(kluch TEXT,sessionId TEXT)');
 const m={role:'user',content:[{type:'text',text:'first'}]};const key=createHash('sha256').update('user\0first').digest('hex').slice(0,32);db.prepare('INSERT INTO sessions VALUES(?,?)').run(key,id);db.close();
 const event={timestamp:'2026-09-18T08:00:00Z',payload:{type:'token_count',info:{last_token_usage:{input_tokens:141100,output_tokens:172,cached_input_tokens:139648,total_tokens:141272},model_context_window:258400}}};
 const f=join(d,'sessions',`rollout-${id}.jsonl`);const original=JSON.stringify({type:'turn_context',payload:{model:'gpt-6-astra'}})+'\n'+JSON.stringify(event)+'\n';writeFileSync(f,original);
 writeFileSync(join(d,'sessions','rollout-other.jsonl'),JSON.stringify({...event,payload:{...event.payload,info:{...event.payload.info,last_token_usage:{input_tokens:999999}}}}));
 const session={deriveMessages:()=>[m]};const opts={home:d,dbPath:dbfile};
 let got=await mod.readCodexStatus(session,opts);assert.equal(got.input,141100);assert.equal(got.total,141272);assert.equal(got.model,'gpt-6-astra');assert.equal(got.sessionId,id);
 writeFileSync(f,original+JSON.stringify({type:'compacted',timestamp:'2026-09-18T08:01:00Z',payload:{}})+'\n');got=await mod.readCodexStatus(session,opts);assert.equal(got.changed,true);
 console.log('CORRUPTION token_count removed:',createHash('sha256').update(original).digest('hex'));writeFileSync(f,'{}\n');console.log('after:',createHash('sha256').update('{}\n').digest('hex'));
 await assert.rejects(mod.readCodexStatus(session,opts),/token_count/);writeFileSync(f,original);assert.equal((await mod.readCodexStatus(session,opts)).input,141100);
 await assert.rejects(mod.readCodexStatus({deriveMessages:()=>[{role:'user',content:'other'}]},opts),/соответствие/);
 const text=mod.formatStatus({now:Date.parse('2026-09-18T08:02:00Z'),codex:got,sessionId:'chat',model:{provider:'p',model:'m'},window:1000000,measurement:{totalTokens:238947,baseline:{kind:'usage',tokens:238879,usage:{inputTokens:1452,cacheReadTokens:139648,cacheWriteTokens:0,outputTokens:97779}},surfaceDeltaTokens:68,logRevision:1306},freshness:{kind:'svezhaya'},configs:[{auto:true,thresholdRatio:0.6,modelPolicies:[]}]});


 {const c=text.replace(/[\s\u00a0\u202f]/g,'');assert.ok(text.includes('39.8%'),'процент не от порога: '+text);assert.ok(!text.includes('23.9%'),'процент от окна: '+text);
  assert.ok(c.includes('600000'),'порог не напечатан: '+text);assert.ok(c.includes('141272'),'расхождение с журналом модели не названо: '+text);}
 const invalid=structuredClone(event);invalid.payload.info.last_token_usage.cached_input_tokens=999999;
 writeFileSync(f,JSON.stringify(invalid)+'\n');await assert.rejects(mod.readCodexStatus(session,opts),/годного token_count/);
 writeFileSync(f,original);assert.equal((await mod.readCodexStatus(session,opts)).cache,139648);
 const errorText=mod.formatStatus({measurement:{totalTokens:1,logRevision:0},freshness:{kind:'ne-znayu'},configs:[{auto:true,thresholdRatio:.9}],configError:'listener failed'});
 assert.ok(!/\d+(\.\d+)?%/.test(errorText),'при ошибке движка напечатаны проценты: '+errorText);
 console.log('PASS exact session, concurrent file ignored, compact freshness, corruption/recovery, проценты от порога, отказ при ошибке движка');
} finally{rmSync(d,{recursive:true,force:true})}
