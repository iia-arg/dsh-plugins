// RU: Изолированный стенд stend-new-busy.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-new-busy.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import {newSessionRefusal} from '../src/new-session-refusal.js';
assert.match(newSessionRefusal({agent:{status:'running'}}),/сначала \/stop.*потом \/new/);
for(const status of [undefined,'unknown','stopped'])assert.match(newSessionRefusal({agent:{status}}),/не удалось проверить/);
assert.match(newSessionRefusal({}),/не удалось проверить/);
assert.equal(newSessionRefusal({agent:{status:'idle',inbox:{nextTurn:[{id:'pending'}],nextStep:[]}}}),null);
console.log('new-busy6/6: running and unknown refuse; pending idle work goes to audited cancellation');
