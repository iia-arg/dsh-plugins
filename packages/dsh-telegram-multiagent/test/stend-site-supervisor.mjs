// RU: Изолированный стенд stend-site-supervisor.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-site-supervisor.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import {supervisorTool} from '../src/guest-channel.js';
let body;const tool=supervisorTool({recipient:'supervisor',agentName:'assistant',send:async(_,text)=>{body=text;return {status:'placed',recipient:'supervisor'}}});
await tool.execute({text:'help'},{agent:{session:{header:{id:'telegram-site-12'}}}});
assert.match(body,/источник не удостоверен; посетитель сайта, разговор 12/);
console.log('PASS site supervisor attribution');
await tool.execute({text:'help'},{agent:{session:{header:{id:'telegram-23'}}}});assert(!body.includes('посетитель сайта'));console.log('PASS Telegram unchanged');
