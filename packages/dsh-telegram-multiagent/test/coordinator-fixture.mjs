// RU: Изолированный стенд coordinator-fixture.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness coordinator-fixture.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import {generateKeyPairSync} from 'node:crypto';
import {signCoordinator,verifyCoordinator} from '../src/coordinator-signature.js';
export function coordinatorFixture(ledger,recipient){
  const keys=generateKeyPairSync('ed25519');
  const trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{fixture:keys.publicKey.export({type:'spki',format:'pem'})}};
  ledger.coordinator=(raw,receiver)=>verifyCoordinator(raw,{db:ledger.db,trust,recipient:receiver,ledger:ledger.protocolIdentity(),now:ledger.now()});
  return (payload,delivery_id,action)=>{const now=ledger.now();return signCoordinator(Buffer.from(payload),{key_id:'fixture',recipient,
    ledger_uuid:ledger.protocolIdentity(),delivery_id,action,issued_at:now,expires_at:now+900000},keys.privateKey);};
}
