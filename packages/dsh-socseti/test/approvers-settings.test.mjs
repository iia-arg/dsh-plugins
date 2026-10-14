import './approval-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {approvers,OwnerIdUnavailable} from '../src/contract.mjs';import {Store} from '../src/store.mjs';import {TelegramQueue} from '../src/telegram-queue.mjs';
const sudo=(...args)=>{const r=spawnSync('sudo',['-n',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout};
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socseti-approvers-'));const cfg=path.join(dir,'config');fs.mkdirSync(cfg,{mode:0o755});const file=path.join(cfg,'approvers.json');fs.writeFileSync(file,'[845678912,956789123]\n',{mode:0o644});fs.chmodSync(cfg,0o755);fs.chmodSync(file,0o644);sudo('chown','-R','0:0',cfg);
 const old=process.env.SOCSETI_APPROVERS_FILE;process.env.SOCSETI_APPROVERS_FILE=file;
 t.after(()=>{process.env.SOCSETI_APPROVERS_FILE=old;sudo('rm','-rf','--',cfg);fs.rmSync(dir,{recursive:true,force:true})});
 return {dir,cfg,file,write(s){sudo('python3','-c','from pathlib import Path;import sys;Path(sys.argv[1]).write_text(sys.argv[2])',file,s)}};
}
test('configured delegates replace prior authority and changes are read for every approval',t=>{
 const f=fixture(t);assert.deepEqual(approvers(),[712345678,845678912,956789123]);
 const s=new Store(path.join(f.dir,'state'),{telegram:'-100222'}),q=new TelegramQueue(s,{approvalChatId:-100111,botId:999});t.after(()=>s.close());
 s.execute('varvara','draft_post',{request_id:'request-0001',platform:'telegram',text:'Synthetic'});q.enqueueCards();const c=q.claim();const message={message_id:7,date:1,chat:{id:-100111},from:{id:999,is_bot:true},text:c.request.args.text,reply_markup:c.request.args.reply_markup};q.finish(c.id,{ok:true,result:message});
 const update=(id,n)=>({update_id:n,callback_query:{id:'cb-'+n,from:{id,is_bot:false},message,data:'publish:'+c.nonce}});
 assert.equal(q.processUpdate(update(823456789,1)).decision,'denied');
 f.write('[867891234]\n');assert.deepEqual(approvers(),[712345678,867891234]);assert.equal(q.processUpdate(update(845678912,2)).decision,'denied');assert.equal(q.processUpdate(update(867891234,3)).decision,'approved');
});
test('missing settings refuse before state write and return restores the same reader',t=>{
 const f=fixture(t);sudo('mv',f.file,f.file+'.saved');assert.throws(()=>new Store(path.join(f.dir,'state'),{telegram:'-100222'}),OwnerIdUnavailable);assert.equal(fs.existsSync(path.join(f.dir,'state')),false);sudo('mv',f.file+'.saved',f.file);assert.deepEqual(approvers(),[712345678,845678912,956789123]);
});
test('invalid lists and unsafe file metadata cannot add approval authority',t=>{
 const f=fixture(t);
 for(const text of ['', '{}','[0]','[true]','["845678912"]','[1.5]','[1000000000000000]','null']){f.write(text);assert.throws(approvers,OwnerIdUnavailable)}
 f.write('[]');assert.deepEqual(approvers(),[712345678]);
 sudo('chmod','666',f.file);assert.throws(approvers,OwnerIdUnavailable);sudo('chmod','644',f.file);assert.deepEqual(approvers(),[712345678]);
 sudo('chown',String(process.getuid()===0?65534:process.getuid()),f.file);assert.throws(approvers,OwnerIdUnavailable);sudo('chown','0',f.file);
 const link=path.join(f.dir,'link');fs.symlinkSync(f.file,link);process.env.SOCSETI_APPROVERS_FILE=link;assert.throws(approvers,OwnerIdUnavailable);process.env.SOCSETI_APPROVERS_FILE=f.file;
 sudo('chmod','777',f.cfg);assert.throws(approvers,OwnerIdUnavailable);sudo('chmod','755',f.cfg);assert.deepEqual(approvers(),[712345678]);
});
