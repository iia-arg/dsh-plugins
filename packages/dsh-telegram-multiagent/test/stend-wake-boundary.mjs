// RU: Изолированный стенд stend-wake-boundary.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-wake-boundary.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const root=new URL('../src/',import.meta.url);

function violations(files) {
 const found=[];
 for(const [name,raw] of files) {
  const s=raw.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  const calls=[...s.matchAll(/(?:\.\s*wakeDriver\s*(?:\?\.)?|\[\s*['"]wakeDriver['"]\s*\]\s*)\(/g)];
  for(const m of calls)if(name!=='wake-gate.js')found.push(name+': direct wake');
  if(name==='wake-gate.js' && calls.length!==1)found.push('gate must have exactly one native call');
  if(/\.send\([^;\n]*,\s*true\s*\)/.test(s)||/\.followup\s*\(/.test(s))found.push(name+': implicit wake');
 }
 return found;
}
function collect(dir,prefix='') {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?collect(new URL(e.name+'/',dir),prefix+e.name+'/'): /\.(?:js|mjs)$/.test(e.name)?[[prefix+e.name,fs.readFileSync(new URL(e.name,dir),'utf8')]]:[]);}
const files=collect(root);assert.deepEqual(violations(files),[]);
assert.equal(violations([...files,['new-route.js','agent.wakeDriver();']]).length,1);
assert.equal(violations([...files,['new-route.js',"agent['wakeDriver']();"]]).length,1);
assert.deepEqual(violations(files),[]);
console.log(`PASS ${files.length} source files; bypass=0; injected direct/bracket call=1; restored=0`);
