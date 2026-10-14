// RU: Проверка stend-pressure-event-time: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-pressure-event-time verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {watchCodexCompactions,davlenieCodex} from '../codex-compaction-watch.mjs';
const events=JSON.parse(fs.readFileSync(new URL('./pressure-events.json',import.meta.url),'utf8'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'fixture-pressure-time-'));
try {
 const file=path.join(root,'rollout.jsonl');fs.writeFileSync(file,events.map(x=>JSON.stringify(x)).join('\n')+'\n');
 const rows=[];let visible=false;const pressure=davlenieCodex({porog:{porog:400000,okno:1000000,dolya:.4},log:s=>rows.push(s)});
 const watch=watchCodexCompactions({resolveFile:()=>visible?file:null,log:()=>{},onTokenCount:pressure.accept});visible=true;watch.close();pressure.close();
 const normal=rows.filter(s=>s.startsWith('давление Codex внутри хода: занято'));
 assert.equal(normal.length,21,'подставная последовательность должна дать 21 строку');
 for(const row of normal){
  const z=Number(/занято (\d+)/.exec(row)[1]);const t=/событие (\S+)/.exec(row)?.[1];assert.ok(t,'нет явного времени события: '+row);
  assert.ok(events.some(e=>e.timestamp===t&&e.payload.info.last_token_usage.input_tokens===z),'время/давление не из rollout: '+row);
  assert.ok(row.includes('напечатано в конце хода'),row);
 }
 const crossing=events.find(e=>e.payload.info.last_token_usage.input_tokens>=400000);assert.ok(rows.find(s=>s.startsWith('🔴 ДАВЛЕНИЕ:')).includes('событие '+crossing.timestamp));
 assert.ok(rows.at(-1).includes('событие максимума '));
 const during=[];const d=davlenieCodex({porog:{porog:400000},log:s=>during.push(s)});d.accept({time:events[0].timestamp,last:events[0].payload.info.last_token_usage,window:1000000});assert.ok(during[0].includes('событие '+events[0].timestamp));assert.ok(!during[0].includes('в конце хода'));
 const pollFile=path.join(root,'poll.jsonl');fs.writeFileSync(pollFile,'');const pollRows=[];
 const pollPressure=davlenieCodex({porog:{porog:400000},log:s=>pollRows.push(s)});
 const pollWatch=watchCodexCompactions({resolveFile:()=>pollFile,log:()=>{},onTokenCount:pollPressure.accept});
 fs.appendFileSync(pollFile,JSON.stringify(events[0])+'\n');await new Promise(resolve=>setTimeout(resolve,1150));pollWatch.close();
 assert.equal(pollRows.length,1);assert.ok(pollRows[0].includes('чтение rollout в ходе'));assert.ok(!pollRows[0].includes('в конце хода'));
 const missing=[];davlenieCodex({porog:{porog:1},log:s=>missing.push(s)}).accept({last:{input_tokens:2},window:3,atClose:true});assert.ok(missing.every(s=>s.includes('время события не сообщено')));
 console.log(JSON.stringify({fixture_lines:normal.length,rows,live_read: during[0],missing_time:missing},null,2));
} finally {fs.rmSync(root,{recursive:true,force:true});}
