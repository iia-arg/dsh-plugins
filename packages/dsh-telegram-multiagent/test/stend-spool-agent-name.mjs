// B-N-2021: real filename helpers; no live mailbox, postman or Telegram calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {extractFunction} from './extract.mjs';

const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'spool-agent-name-'));
let username='my-agent',foreign=false;
const scope=vm.createContext({fs:{statSync(dir){const s=fs.statSync(dir);return {uid:s.uid+(foreign?1:0)};}},
  process,os:{userInfo:()=>({username})}});
scope.spoolSender=vm.runInContext('('+extractFunction(source,'spoolSender')+')',scope);
const shown=vm.runInContext('('+extractFunction(source,'spoolPokazanPochtalonom')+')',scope);
let good=0,bad=0;
function check(name,fn){try{fn();good++;console.log('ЗЕЛЁНОЕ '+name);}catch(e){bad++;console.error('КРАСНОЕ '+name+': '+e.message);}}
const stamp='20261014T031500Z-',hex='a'.repeat(64);
try {
  for(const [tail,want] of [['01234567','my-agent'],['2703553','my-agent'],['ownerall-01234567','my-agent'],['v2-'+hex,'my-agent']]) {
    const file=stamp+'my-agent-'+tail+'.txt';
    check('полное имя, '+tail,()=>assert.equal(scope.spoolSender(file),want));
    check('своя учётка сохраняет копию, '+tail,()=>assert.equal(shown(file,root),false));
    username='other-agent';
    check('чужая учётка учитывает почтальона, '+tail,()=>assert.equal(shown(file,root),true));
    foreign=true;
    check('чужой ящик сохраняет копию, '+tail,()=>assert.equal(shown(file,root),false));
    foreign=false;username='my-agent';
  }
  for(const own of ['my-agent-ownerall','my-agent-v2','_my-agent','my-agent-']) {
    username=own;
    for(const tail of ['01234567','ownerall-01234567','v2-'+hex,'v2-'+'1'.repeat(64)])
      check('точный собственный префикс '+own+'/'+tail,()=>assert.equal(shown(stamp+own+'-'+tail+'.txt',root),false));
  }
  username='my-agent-v2';
  check('своя -v2 учётка и PID из 64 цифр',()=>assert.equal(shown(stamp+'my-agent-v2-'+'1'.repeat(64)+'.txt',root),false));
  username='my-agent';
  const invalid=['bad.name','bad/name','bad name','bad:name','Bad-name','9bad-name','-bad-name','имя-агента','bad\nname'];
  for(const name of invalid) {
    const file=stamp+name+'-01234567.txt';
    check('нет атрибуции недопустимого '+JSON.stringify(name),()=>assert.equal(scope.spoolSender(file),'(имя не разобрано)'));
    check('нет признания показа '+JSON.stringify(name),()=>assert.equal(shown(file,root),false));
  }
  for(const tail of ['abc.txt','01234567.md','01234567.txt.extra','v2-'+hex.slice(1)+'.txt','v2-'+hex+'x.txt','01234567.txt\n'])
    check('битый хвост '+tail,()=>assert.equal(shown(stamp+'other-agent-'+tail,root),false));
  check('старое имя без дефиса',()=>assert.equal(scope.spoolSender(stamp+'coders-01234567.txt'),'coders'));
  check('имя через underscore',()=>assert.equal(scope.spoolSender(stamp+'_worker_two-v2-'+hex+'.txt'),'_worker_two'));
} finally {fs.rmSync(root,{recursive:true,force:true});}
console.log(`ИТОГ: ${good} из ${good+bad}`);process.exit(bad?1:0);
