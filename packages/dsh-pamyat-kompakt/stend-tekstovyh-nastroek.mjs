// RU: Проверяет настоящий запрос сводки и отказ новых настроек без сети; временные файлы удаляются.
// EN: Exercises the real summary request and refusal of new settings without network access; temporary files are removed.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kompakt-text-'));
const entry=new URL('./index.mjs',import.meta.url).pathname;
const labels={ownerInstrumental:'sample-owner-instrumental',ownerNominative:'sample-owner',ownerGenitive:'sample-owner-genitive',ownerDative:'sample-owner-dative',coordinatorExample:'sample coordinator example',evidenceRuleLabel:'sample trace rule',exampleHost:'sample-host',roleClarification:'sample role clarification'};
const policy={schema:1,defaultRoute:{provider:'sample',model:'sample'},routes:[{provider:'sample',model:'sample',window:1000000,ratio:0.8,nominalThreshold:800000}]};
function run(config,{raw,tail=false,overrideDirectory=false,transcript="fixture transcript",badTemplateToken}={}){
 const d=fs.mkdtempSync(path.join(root,'case-'));const directory=path.join(d,'agents');fs.mkdirSync(directory);
 fs.writeFileSync(path.join(directory,'worker.json'),JSON.stringify({model:'fixture-model',imya:'Агент',porogi:policy,oknoSvodki:1000000,imenaKlyucha:['KOMPAKT_API_KEY']}));
 const cfg=path.join(d,'placement.json');fs.writeFileSync(cfg,raw??JSON.stringify(config));
 const env={...process.env,HOME:d,KOMPAKT_RAZMESCHENIE:cfg,KOMPAKT_AGENT:'worker',KOMPAKT_NASTROJKI_KATALOG:directory,KOMPAKT_API_KEY:'fixture-only',KOMPAKT_UDACHI:path.join(d,'success'),KOMPAKT_OTKAZY:path.join(d,'refusal')}; // vorota-ob:dopusk=TOKEN
 for(const k of ['KOMPAKT_MODEL','CODEX_HOME'])delete env[k];
 if(overrideDirectory)env.KOMPAKT_NASTROJKI_KATALOG=directory;
 if(badTemplateToken){const prompt=path.join(d,'prompt.txt');fs.writeFileSync(prompt,'{{OT_LICA}}\n'+badTemplateToken);env.KOMPAKT_PROMT=prompt;}
 const code=`let calls=0,request=null;globalThis.fetch=async(_url,o)=>{calls++;request=JSON.parse(o.body);return{ok:true,status:200,json:async()=>({choices:[{message:{content:'[MODE=DIALOG]\\n\\nfixture summary'}}]}),text:async()=>''}};let error=null;try{const m=await import(${JSON.stringify(entry)});await m.svodkaNashejModelyu(${JSON.stringify(transcript)},${tail?"'fixture tail'":"undefined"})}catch(e){error=e.message}console.log('RESULT '+JSON.stringify({calls,request,error}));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);
 const line=result.stdout.split('\n').find(s=>s.startsWith('RESULT '));assert(line,result.stdout);return JSON.parse(line.slice(7));
}
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
try{
 check('legacy environment directory reaches real request',()=>{const r=run({});assert.equal(r.error,null);assert.equal(r.calls,1);assert.equal(r.request.model,'fixture-model');});
 check('configured labels reach system and frame with tail',()=>{const r=run({promptSubstitutions:labels},{tail:true});assert.equal(r.error,null);const system=r.request.messages[0].content,user=r.request.messages[1].content;for(const key of Object.keys(labels).filter(k=>k!=='roleClarification'))assert(system.includes(labels[key]),key);assert(user.includes(labels.roleClarification));assert(user.includes('fixture tail'));assert(!system.includes('{{KOMPAKT_'));assert(!user.includes('{{KOMPAKT_'));});
 check('neutral role default reaches frame',()=>{const r=run({});assert.equal(r.error,null);assert(r.request.messages[1].content.includes('агент-координатор'));assert(!r.request.messages[1].content.includes('{{KOMPAKT_'));});
 check('unknown and empty substitution refuse before provider',()=>{for(const values of [{unknown:'x'},{ownerNominative:''},{ownerNominative:'{{KOMPAKT_OWNER}}'},null]){const r=run({promptSubstitutions:values});assert(r.error);assert.equal(r.calls,0);}});
 check('unsupported placement fields refuse at compaction',()=>{for(const values of [{settingsDirectory:'relative'},{settingsDirectory:''},{settingsDirectory:null},{unknown:true}]){const r=run(values);assert(r.error);assert.equal(r.calls,0);}});
 check('duplicate configuration key refuses',()=>{const r=run({}, {raw:'{"promptSubstitutions":{},"promptSubstitutions":{}}'});assert(r.error);assert.equal(r.calls,0);});
 check('template-looking transcript remains literal material',()=>{const text='visitor {{KOMPAKT_OWNER_NOMINATIVE}} $&';const r=run({promptSubstitutions:labels},{transcript:text});assert.equal(r.error,null);assert(r.request.messages[1].content.includes(text));});
 check('malformed configuration does not echo its contents',()=>{const r=run({}, {raw:'private-fixture-content'});assert(r.error);assert(!r.error.includes('private'));assert.equal(r.calls,0);});
 check('all complete unknown marker suffixes refuse',()=>{for(const token of ['{{KOMPAKT_UNKNOWN2}}','{{KOMPAKT_unknown}}','{{KOMPAKT_}}']){const r=run({}, {badTemplateToken:token});assert(r.error);assert.equal(r.calls,0);}});
 check('environment directory remains older interface override',()=>{const r=run({},{overrideDirectory:true});assert.equal(r.error,null);assert.equal(r.request.model,'fixture-model');});
 console.log(JSON.stringify({passed,total:10}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
