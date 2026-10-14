// Real archive wrapper on synthetic audio; guest flag must defeat configured PENDING_DIR.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const wrapper=process.env.VOICE_ARCHIVE_WRAPPER||'/usr/local/bin/transcribe-local-shared';
// A-N-1948 №24: умолчание делало проверку «не задан» недостижимой — проверяем существование обёртки.
if(!fs.existsSync(wrapper)){console.log(`СЛЕПОТА: обёртки архива голоса нет (${wrapper}) — задайте VOICE_ARCHIVE_WRAPPER`);process.exit(2);}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-archive-fixture-'));
try{
 const pending=path.join(root,'pending'),audio=path.join(root,'synthetic.oga'),core=path.join(root,'core'),config=path.join(root,'archive.conf');fs.mkdirSync(pending);fs.writeFileSync(audio,'SYNTHETIC OGG');fs.writeFileSync(core,"#!/bin/bash\nprintf 'Паблик синтетическая проба'\nexit \"${FAKE_ASR_EXIT:-0}\"\n",{mode:0o755});
 fs.writeFileSync(config,`REAL_TRANSCRIBER='${core}'\nPENDING_DIR='${pending}'\nVOICE_ARCHIVE_DISABLE=0\n`);
 const run=mode=>{const env={...process.env,VOICE_ARCHIVE_CONF:config};if(mode===undefined)delete env.VOICE_ARCHIVE_DISABLE;else env.VOICE_ARCHIVE_DISABLE=mode;return spawnSync('bash',[wrapper,audio,'auto'],{env,encoding:'utf8',timeout:5000});};
 let r=run(undefined);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'Паблик синтетическая проба');let entries=fs.readdirSync(pending);assert.equal(entries.length,2);for(const x of entries)fs.unlinkSync(path.join(pending,x));console.log('PASS owner/team default creates audio+text archive');
 r=run('1');assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'Паблик синтетическая проба');assert.deepEqual(fs.readdirSync(pending),[],'guest audio archived despite explicit disable');assert(r.stderr.includes('VOICE_ARCHIVE_DISABLE=1'));console.log('PASS guest archive explicitly disabled even with configured writable archive');
 for(const mode of ['typo','']) { r=run(mode);assert.equal(r.status,2,'invalid flag '+JSON.stringify(mode));assert.equal(r.stdout,'');assert.deepEqual(fs.readdirSync(pending),[]); }console.log('PASS unknown/empty archive flag refuses before recognition');
 r=run(undefined);assert.equal(r.status,0);assert.equal(fs.readdirSync(pending).length,2);console.log('PASS restored owner/team archiving');
}finally{fs.rmSync(root,{recursive:true,force:true});}
