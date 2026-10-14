#!/usr/bin/env node
// Explicit operator preparation. Never called by the model tool or at plugin startup.
import {initializeRequestState,auditRequestState} from '../src/ostrov-request-state.mjs';
const args=process.argv.slice(2);
try{
 if(args.length!==3||!['--plan','--initialize','--check'].includes(args[0]))throw Error('usage: --plan|--initialize|--check <absolute requestKeyDir> <absolute workspace>; other flags refused');
 const [mode,directory,workspace]=args;
 const result=mode==='--check'?auditRequestState(directory,workspace):initializeRequestState(directory,workspace,{plan:mode==='--plan'});
 console.log(JSON.stringify({ok:true,mode,directory:result.directory,workspace:result.workspace,legacyCount:result.legacyCount,...(result.keyCount===undefined?{}:{keyCount:result.keyCount})}));
}catch(error){console.error(error.message);process.exitCode=2}
