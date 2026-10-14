#!/usr/bin/env node
// RU: CLI подписи конверта по фиксированному trust-контракту. Секрет ключа читается файлом, подпись не заменяет проверку принимающей стороны; следуй справке и не печатай ключ.
// EN: CLI for signing envelopes under the trust contract. Reads signing material from a file; signatures still require receiver verification. Follow the help contract and never print keys.


import fs from 'node:fs';
import crypto from 'node:crypto';
import {signCoordinator} from './coordinator-signature.js';

try {
  if(process.argv.length!==3||process.argv[2].startsWith('-'))throw Error('expected one request JSON file');
  const q=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const fields=['action','delivery_id','input','key_file','key_id','ledger_uuid','output','policy_file','recipient'];
  if(Object.keys(q).sort().join(',')!==fields.sort().join(','))throw Error('request fields');
  if(fields.some(k=>typeof q[k]!=='string'||!q[k].length))throw Error('request fields');
  const policy=JSON.parse(fs.readFileSync(q.policy_file,'utf8'));
  if(policy.status!=='approved'||!Number.isSafeInteger(policy.maxLifetimeMs)||policy.maxLifetimeMs<=0)throw Error('approved measured lifetime policy required');
  const issued_at=Date.now();
  const raw=signCoordinator(fs.readFileSync(q.input),{key_id:q.key_id,recipient:q.recipient,
    ledger_uuid:q.ledger_uuid,delivery_id:q.delivery_id,action:q.action,issued_at,
    expires_at:issued_at+policy.maxLifetimeMs},crypto.createPrivateKey(fs.readFileSync(q.key_file)));
  fs.writeFileSync(q.output,raw,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:'signed_not_delivered',delivery_id:q.delivery_id,
    signed_at:issued_at,expires_at:issued_at+policy.maxLifetimeMs,output:q.output,
    sha256:crypto.createHash('sha256').update(raw).digest('hex')}));
}catch(e){
  const safe=['expected one request JSON file','request fields','approved measured lifetime policy required'];
  console.error('ОТКАЗ подписания: '+(safe.includes(e.message)?e.message:(e.code||'signing_failed')));
  process.exitCode=2;
}
