// Loaded-process version wire. Native headers and installed package paths are not witnesses.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const version=x=>typeof x==='string'&&/^[0-9A-Za-z.+_-]{1,64}$/.test(x);
export function sourceVersionKey(v){
 if(!v||!['codex','claude'].includes(v.engine)||!version(v.cliVersion))throw Error('VERSION_WITNESS_UNAVAILABLE');
 if(v.engine==='codex'){
  if(v.sdkVersion!==null||v.sdkEntrySha256!==null||v.profile!=='codex-app-server-v2-child-v1')throw Error('VERSION_WITNESS_UNAVAILABLE');
 }else if(!version(v.sdkVersion)||!/^claude-agent-sdk-child-v1$/.test(v.profile)||typeof v.sdkEntrySha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sdkEntrySha256))throw Error('VERSION_WITNESS_UNAVAILABLE');
 return 'sv1:'+createHash('sha256').update(JSON.stringify([1,v.engine,v.cliVersion,v.sdkVersion,v.sdkEntrySha256,v.profile])).digest('hex');
}
export function codexSourceVersion(reply,clientName){
 const ua=reply?.userAgent,prefix=clientName+'/';
 if(typeof clientName!=='string'||!clientName||typeof ua!=='string'||!ua.startsWith(prefix))throw Error('VERSION_WITNESS_UNAVAILABLE');
 const end=ua.indexOf(' ',prefix.length),cliVersion=ua.slice(prefix.length,end<0?undefined:end);
 const v={engine:'codex',cliVersion,sdkVersion:null,sdkEntrySha256:null,profile:'codex-app-server-v2-child-v1'};sourceVersionKey(v);return v;
}
export function claudeSourceVersion(init,sdk){
 const v={engine:'claude',cliVersion:init?.claude_code_version,sdkVersion:sdk?.sdkVersion,sdkEntrySha256:sdk?.sdkEntrySha256,profile:'claude-agent-sdk-child-v1'};sourceVersionKey(v);return v;
}

const manifest=JSON.parse(fs.readFileSync(new URL('./child-source-versions.json',import.meta.url),'utf8'));
if(manifest.schemaVersion!==1||!Array.isArray(manifest.supported))throw Error('CHILD_VERSION_MANIFEST_INVALID');
const supported=new Set(manifest.supported.map(sourceVersionKey));
export function supportedSourceVersion(v){return supported.has(sourceVersionKey(v))}
