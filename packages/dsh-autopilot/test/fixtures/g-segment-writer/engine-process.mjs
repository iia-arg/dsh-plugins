// Process identity is kernel metadata, never argv/env/model text. Ticks remain a string.
import fs from 'node:fs';
const pid=x=>Number.isSafeInteger(x)&&x>0;
const start=x=>typeof x==='string'&&/^[1-9][0-9]{0,31}$/.test(x);
const boot=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const fail=()=>{throw Error('G_PROCESS_UNPROVEN')};
export function parseEngineStat(raw,enginePid){
 if(!pid(enginePid)||typeof raw!=='string'||raw.length>65536||!raw.startsWith(enginePid+' ('))return fail();
 const end=raw.lastIndexOf(')');if(end<0||raw[end+1]!==' ')return fail();
 // comm (field2) may contain spaces, parentheses and newlines; tail starts at field3.
 const fields=raw.slice(end+2).trim().split(/\s+/),parent=Number(fields[1]),engineStart=fields[19];
 if(!/^[RSDTtWKPI]$/.test(fields[0]??'')||!pid(parent)||!start(engineStart))return fail();
 return {parent,engineStart};
}
export function readEngineIdentity(enginePid,expectedParent){
 if(!pid(enginePid))return fail();
 const {parent,engineStart}=parseEngineStat(fs.readFileSync('/proc/'+enginePid+'/stat','utf8'),enginePid);
 if(expectedParent!==undefined&&(!pid(expectedParent)||parent!==expectedParent))return fail();
 const boot_id=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();if(!boot(boot_id))return fail();
 return {enginePid,engineStart,boot_id};
}
export function sameEngineIdentity(a,b){
 return Boolean(a&&b&&pid(a.enginePid)&&pid(b.enginePid)&&start(a.engineStart)&&start(b.engineStart)&&boot(a.boot_id)&&boot(b.boot_id)&&a.enginePid===b.enginePid&&a.engineStart===b.engineStart&&a.boot_id===b.boot_id);
}
