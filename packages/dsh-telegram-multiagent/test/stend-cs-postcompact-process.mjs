// B-N-2010: first held turn after native compaction, new/resumed Codex and root Claude.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cases=[{name:'stend-cs-live-process.mjs'},{name:'stend-cs-claude-process.mjs'},{name:'stend-cs-live-process.mjs',legacy:true}];
let green=0,red=0,blind=0;
for(const {name,legacy=false} of cases){
 const file=fileURLToPath(new URL(name,import.meta.url));
 const r=spawnSync(process.execPath,[file],{env:{...process.env,STEND_AFTER_COMPACT:'1',STEND_LEGACY_GROUP:legacy?'1':'0'},encoding:'utf8',timeout:60000,killSignal:'SIGKILL'});
 process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');
 if(r.status===0){green++;console.log('PASS postcompact provider '+name+(legacy?' legacy-group':''))}else if(r.status===2){blind++;console.log('СЛЕПОТА postcompact provider '+name+(legacy?' legacy-group':'')+' exit=2')}else{red++;console.log('FAIL postcompact provider '+name+(legacy?' legacy-group':'')+' exit='+r.status)}
}
console.log('RESULT providers green='+green+' red='+red+' blind='+blind+' total='+cases.length);process.exitCode=red?1:blind?2:0;
