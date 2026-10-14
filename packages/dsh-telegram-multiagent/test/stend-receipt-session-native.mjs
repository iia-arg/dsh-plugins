// RU: Изолированный стенд stend-receipt-session-native.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipt-session-native.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {resolveReceiptSession} from '../src/receipt-session.js';


import {podnyatPlatformu02} from './platforma-02.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-inspect-'));
try{
 const {sessions,backend:p,sozdatAgenta}=await podnyatPlatformu02({root});assert(p);assert.equal(typeof p.inspect,'undefined');
 const session=(await sozdatAgenta('telegram-test')).session;await sessions.flush(session);
 const stored=await p.stat(session.id);assert.equal(stored.header.createdAt,session.header.createdAt);
 const receipt={session_id:session.id,session_created:session.header.createdAt};let called=0;
 const resolved=await resolveReceiptSession(receipt,{entries:[],persistence:p,resume:async(id,validate)=>{called++;assert.equal(id,session.id);validate({session});return {agent:{session}};}});
 assert.equal(called,1);assert.equal(resolved.sessionId,session.id);
 console.log('PASS native stat header shape (0.2) and generation (factory transport stubbed)');
}finally{fs.rmSync(root,{recursive:true,force:true});}process.exit(0);
