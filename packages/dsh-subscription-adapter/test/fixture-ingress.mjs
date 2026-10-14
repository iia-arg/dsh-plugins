import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomBytes} from 'node:crypto';
// Every fixture owns its key. Never borrow the process's production ingress credential.
export function installFixtureIngress(){
 const previous=process.env.GATEWAY_INGRESS_KEY_FILE;const root=fs.mkdtempSync(path.join(os.tmpdir(),'adapter-test-key-'));const file=path.join(root,'key');
 fs.writeFileSync(file,randomBytes(32).toString('hex'),{mode:0o600});process.env.GATEWAY_INGRESS_KEY_FILE=file;
 let closed=false;const close=()=>{if(closed)return;closed=true;fs.rmSync(root,{recursive:true,force:true});if(previous===undefined)delete process.env.GATEWAY_INGRESS_KEY_FILE;else process.env.GATEWAY_INGRESS_KEY_FILE=previous;};
 process.once('exit',close);return close;
}
