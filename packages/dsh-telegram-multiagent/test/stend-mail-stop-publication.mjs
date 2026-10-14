import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash,randomUUID} from 'node:crypto';
if(process.geteuid()===0){console.error('СЛЕПОТА: root (euid=0) создаёт root-owned ящик стенда; публикатор требует ящик агента. Запусти стенд от непривилегированного пользователя.');process.exit(2)}
const script=new URL('../src/publish-mail-stop.py',import.meta.url).pathname;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-publication-')),id=randomUUID(),source='/tmp/signed-stop-'+id+'.txt',leaf='stop-'+id+'.txt',target=path.join(root,leaf),sentinel=path.join(root,'sentinel');
try{
 const raw=Buffer.from('fixture bytes only'),sha=createHash('sha256').update(raw).digest('hex');fs.writeFileSync(source,raw);fs.writeFileSync(sentinel,'unchanged');fs.symlinkSync(sentinel,target+'.part');
 const run=(hash=sha)=>spawnSync('python3',[script,root,source,leaf,hash],{encoding:'utf8'});
 const r=run();assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(target).equals(raw),true);assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged');assert.equal(fs.lstatSync(target).isFile(),true);
 const inode=fs.statSync(target).ino;fs.writeFileSync(source,raw);assert.equal(run().status,2);assert.equal(fs.statSync(target).ino,inode,'existing final object cannot be replaced');assert.equal(fs.readFileSync(target).equals(raw),true);
 fs.unlinkSync(target);assert.equal(run('b'.repeat(64)).status,2);assert.equal(fs.existsSync(target),false);assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged');
 assert.equal(run().status,0);assert.equal(fs.readFileSync(target).equals(raw),true);
 console.log('PASS exact uploaded bytes, protected publication, ignored .part, no overwrite, bad hash refusal and restoration');
}finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(source,{force:true})}
