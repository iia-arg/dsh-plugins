// RU: Изолированный стенд stend-outgoing-registration.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-outgoing-registration.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {testPlatform} from './test-platform.mjs';
import {installFileTools} from '../src/outgoing-files.js';
await testPlatform(['dsh-tools']);
const appDir=process.env.DSH_TEST_APP || fileURLToPath(new URL('.',import.meta.url));
const callbacks=new Map(),logs=[],effects=[];
const agent={session:{header:{cwd:'/workspace'}},ctx:{get(){return {register(){throw Error('duplicate name');}};}}};
const ctx={agents:{roots:()=>[agent]},on:(name,fn)=>callbacks.set(name,fn),effect:fn=>effects.push(fn)};
assert.doesNotThrow(()=>installFileTools(ctx,{workspace:'/workspace',appDir,log:s=>logs.push(s)}),'failed file registration must not stop text channel');
assert(logs.some(x=>x.includes('не подключён')));
assert.doesNotThrow(()=>callbacks.get('agent/created')({agent}),'failed listener must not abort agent creation');
console.log('PASS startup registration failure isolated');console.log('PASS created listener registration failure isolated');
