// RU: Изолированный стенд stend-new-switch.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-new-switch.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {extractFunction} from './extract.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'new-switch-')),file=path.join(dir,'settings.json');
try{
 const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),c={SETTINGS_FILE:file,fs,_setCache:{mtime:0,data:{}},log(){}};vm.createContext(c);vm.runInContext(extractFunction(source,'settings'),c);
 for(const text of ['{','null','true','[]']){fs.writeFileSync(file,text);c._setCache={mtime:0,data:{}};assert.equal(c.settings().newSessionsEnabled,false,'unreadable/invalid configuration must disable new rotations')}
 fs.writeFileSync(file,'{"newSessionsEnabled":true}');c._setCache={mtime:0,data:{}};assert.equal(c.settings().newSessionsEnabled,true);fs.unlinkSync(file);assert.equal(c.settings().newSessionsEnabled,false);
 console.log('PASS new switch fails closed on malformed, unknown and missing configuration; valid true restored');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
