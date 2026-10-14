// Test settings only: never invoke the installed reader or open production configuration.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
if(!process.env.SOCSETI_OWNER_READER||!process.env.SOCSETI_APPROVERS_FILE){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socseti-approval-fixture-'));const cfg=path.join(dir,'config');fs.mkdirSync(cfg,{mode:0o755});
 const file=path.join(cfg,'approvers.json');fs.writeFileSync(file,'[823456789,934567891]\n',{mode:0o644});
 const reader=path.join(dir,'owner');fs.writeFileSync(reader,'#!/bin/sh\necho 712345678\n',{mode:0o755});
 fs.chmodSync(cfg,0o755);fs.chmodSync(file,0o644);
 const set=spawnSync('sudo',['-n','chown','-R','0:0',cfg],{encoding:'utf8'});
 if(set.status!==0)throw Error('СЛЕПОТА: sudo нужен только для root-настройки стенда: '+set.stderr);
 process.env.SOCSETI_OWNER_READER=reader;process.env.SOCSETI_APPROVERS_FILE=file;
 process.once('exit',()=>{spawnSync('sudo',['-n','rm','-rf','--',cfg]);fs.rmSync(dir,{recursive:true,force:true})});
}
