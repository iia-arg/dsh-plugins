#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {protectedBytes} from './mail-stop-settings.js';import {verifyStopStatus} from './mail-stop-protocol.js';
export function readVerifiedStopStatus(file,controlId,wireSha,trustFile){
 const trust=JSON.parse(protectedBytes(trustFile));
 // B-N-1590: receivers maps every key_id to the one receiver it may sign for; a trust store without it is refused.
 if(trust.version!==1||Object.keys(trust).sort().join(',')!=='keys,ledger_uuid,receivers,recipient,version'||!trust.receivers||typeof trust.receivers!=='object'||Array.isArray(trust.receivers)
  ||Object.keys(trust.keys??{}).sort().join(',')!==Object.keys(trust.receivers).sort().join(',')||!Object.values(trust.receivers).every(v=>typeof v==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(v)))throw Error('status_trust_unavailable');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW);
 let raw;try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>8192)throw Error('status_file_invalid');const b=Buffer.alloc(8193),n=fs.readSync(fd,b,0,b.length,0);if(n>8192)throw Error('status_file_invalid');raw=b.subarray(0,n);}finally{fs.closeSync(fd)}
 const result=verifyStopStatus(raw,{keys:trust.keys,receivers:trust.receivers,recipient:trust.recipient,ledger:trust.ledger_uuid,expected:{control_id:controlId,wire_sha:wireSha}});
 if(!result.verified)throw Error(result.reason);return result.status;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==5||process.argv.slice(2).some(x=>x.startsWith('-')))throw Error('expected status file, control ID and wire SHA');
  const value=readVerifiedStopStatus(...process.argv.slice(2),process.env.DSH_MAIL_STOP_STATUS_TRUST||'/etc/dsh-mail-stop/status-trust.json');
  console.log(JSON.stringify(value));
 }catch(error){const reason=error.code??(/^[a-z][a-z0-9_]{0,63}$/.test(error.message??'')?error.message:'status_reader_unavailable');console.error('ОТКАЗ status reader: '+reason);process.exitCode=2;}
}
