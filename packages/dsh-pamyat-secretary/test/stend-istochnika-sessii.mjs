// RU: Проверяем zapisi_po_seq и sobrat_transkript по событиям текущей сессии: внешний несуществующий журнал не используется, оба seq находятся и исходный массив не меняется. Отсутствующий источник, неполный набор и дубль seq дают причину отказа; восстановленный полный набор снова проходит.
// EN: Test zapisi_po_seq and sobrat_transkript using current-session events: an external nonexistent journal is not used, both seq values are found, and the original array remains unchanged. A missing source, incomplete set, and duplicate seq produce a rejection reason; restoring the full set passes again.
import assert from 'node:assert/strict';
import {zapisi_po_seq,sobrat_transkript} from '../src/chtenie-zhurnala.js';
const events=[{seq:10,type:'user/message',data:{content:'текст именно A2A'}},{seq:11,type:'assistant/message',data:{message:{content:[{type:'text',text:'ответ A2A'}]}}}];
let result=zapisi_po_seq('/несуществующий/чужой-журнал.zstd',[10,11],events);
assert.equal(result.pochemu,undefined);assert.equal(result.najdeno,2);assert(sobrat_transkript(result.zapisi).includes('текст именно A2A'));
result=zapisi_po_seq('/чужой',[10,11],null);assert(result.pochemu);
result=zapisi_po_seq('/чужой',[10,11],events.slice(0,1));assert(result.pochemu);
result=zapisi_po_seq('/чужой',[10,11],[...events,events[0]]);assert(result.pochemu);
result=zapisi_po_seq('/чужой',[10,11],events);assert.equal(result.najdeno,2);assert.equal(result.pochemu,undefined);
assert.equal(events.length,2);console.log('PASS current-session source, missing/corrupt refused, restored; original events unchanged');
