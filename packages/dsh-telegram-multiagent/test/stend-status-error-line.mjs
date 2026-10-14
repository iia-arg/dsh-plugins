// RU: Изолированный стенд stend-status-error-line.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-status-error-line.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import {formatStatus} from '../src/compact-status.js';
const base={model:{model:'m'},window:1000,configs:[{auto:true,thresholdRatio:.8}],measurement:{totalTokens:1,baseline:{kind:'usage',tokens:1}}};
let passed=0,failed=0;
const cases=[['unset',undefined],['empty',''],['multiline','ошибка\r\nдвижка\tздесь\u2028конец'],['long','я'.repeat(500)],['emoji','👩‍💻'.repeat(100)+'кириллица'],['short','короткая ошибка']];
for(const field of ['configError','windowError'])for(const [name,value] of cases){
 try{
  const text=formatStatus({...base,...(field==='windowError'?{window:0}:{}),[field]:value});
  assert.equal(text.split('\n').length,5);assert.ok(!/[\r\t\u2028\u2029]/u.test(text));
  const line=text.split('\n').at(-1);

  const r=line.match(/^порог НЕИЗВЕСТЕН \((.*)\) — проценты выше не посчитаны$/u)?.[1]??'';
  assert.ok(Array.from(r).length<=120);
  if(name==='long'||name==='emoji')assert.ok(r.endsWith('…'));
  if(name==='short')assert.ok(text.includes(value));
  if(name==='emoji') {
    assert.ok(!r.includes('\ufffd'));
    const segmenter=new Intl.Segmenter('ru',{granularity:'grapheme'});
    const input=field==='configError'?`ошибка движка (${value})`:value;
    const source=[...segmenter.segment(input)].map(x=>x.segment);
    const kept=[...segmenter.segment(r.slice(0,-1))].map(x=>x.segment);
    assert.ok(kept.length>0);
    assert.deepEqual(kept,source.slice(0,kept.length),'обрезка обязана сохранить префикс целых исходных графем');
  }
  passed++;console.log('PASS',field,name);
 }catch(e){failed++;console.log('FAIL',field,name,e.message)}
}
// B-N-2010 replaces the unused-argument contract: one bounded visible diagnostic, absent on measured state.
const graphemes=text=>[...new Intl.Segmenter('ru',{granularity:'grapheme'}).segment(text)].length;
for(const [name,value] of cases){
 try{
  const text=formatStatus({...base,codexError:value});
  const reason=text.split('\n').filter(line=>line.startsWith('причина недоступности: '));
  assert.equal(reason.length,value?1:0,'one reason line for a nonempty error');
  if(value){assert.ok(!/[\r\t\u2028\u2029]/u.test(reason[0]));assert.ok(graphemes(reason[0])<=120,'entire reason line must fit 120 graphemes');if(name==='short')assert.ok(reason[0].includes(value));if(name==='long')assert.ok(reason[0].endsWith('…'))}
  const measured={supported:true,state:'measured',inputTokens:2,timestamp:'2026-10-12T00:00:00.000Z',threshold:800};
  assert.equal(formatStatus({...base,contextStatus:measured,codexError:value}),formatStatus({...base,contextStatus:measured}),'measured snapshot suppresses obsolete error');
  passed++;console.log('PASS codexError',name);
 }catch(e){failed++;console.log('FAIL codexError',name,e.message)}
}
console.log(JSON.stringify({passed,failed}));process.exitCode=failed?1:0;
