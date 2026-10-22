// Root-owned policy fixture; all writes stay below a fresh private temp directory.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
export function policyFixture(value={schemaVersion:1,fileMaxBytes:33554432,recordMaxBytes:65536}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'usage-r-policy-')),file=path.join(root,'policy.json');
 const code="const fs=require('node:fs');const x=JSON.parse(fs.readFileSync(0,'utf8'));fs.writeFileSync(x.file,x.raw,{flag:'wx',mode:0o644})";
 const input=JSON.stringify({file,raw:typeof value==='string'?value:JSON.stringify(value)});
 const r=spawnSync(process.getuid()===0?process.execPath:'sudo',process.getuid()===0?['-e',code]:['-n',process.execPath,'-e',code],{input,encoding:'utf8'});
 if(r.status!==0){fs.rmSync(root,{recursive:true,force:true});throw Error('fixture root policy unavailable: '+r.stderr)}
 return {file,close(){fs.rmSync(root,{recursive:true,force:true})}};
}
