// B-N-1583: the ordinary courier (iskra-tell family) must not let the recipient's mailbox poll see a partial or non-letter file.
// The poll skips names starting with '.' and takes only .txt/.md; a temporary name must therefore be dot-prefixed, renamed when complete.
// B-N-1609: the mailbox belongs to the agent (775); a link the agent plants at the temporary name must not redirect root's write.
// Real courier; fake scp/ssh/sudo run locally; a slow writer (cp, or the publisher's os.write) writes half, waits, writes the rest;
// a watcher samples the mailbox meanwhile. The attack probe makes the temporary name predictable (fake date +%s%N for the cp path,
// fixed secrets.token_hex for the publisher) and plants a link there to a victim file.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';
if(process.geteuid()===0){console.error('СЛЕПОТА: root (euid=0) создаёт root-owned ящик стенда; публикатор требует ящик агента. Запусти стенд от непривилегированного пользователя.');process.exit(2)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'courier-publication-'));const FIXED_NS='1700000000000000000';
// B-N-1993 (Заря): «удалённый» /tmp курьера — каталог стенда (FAKE_TMP). Прежде заглушка scp клала письмо в НАСТОЯЩИЙ /tmp машины, а при
//   отказе публикации курьер его не убирает (iskra-tell: rm -f $REMOTE только после «доставлено») — 2 письма за прогон, 397 в sadik:/tmp
//   к 10.10. Заглушка scp переписывает /tmp/iskra-tell-* в FAKE_TMP, иной путь — отказ (код 2), не запись.
const fakeTmp=path.join(root,'remote-tmp'),fakeTmpLog=path.join(root,'remote-tmp.log');const tmpDo=new Set(fs.readdirSync('/tmp').filter(n=>n.startsWith('iskra-tell-')));
try{
 const bin=path.join(root,'bin'),courier=path.join(root,'courier');for(const d of [bin,courier,fakeTmp])fs.mkdirSync(d);
 fs.copyFileSync(new URL('../courier/iskra-tell',import.meta.url),path.join(courier,'iskra-tell'));fs.chmodSync(path.join(courier,'iskra-tell'),0o755);fs.symlinkSync('iskra-tell',path.join(courier,'zarya-tell'));
 const w=(n,t)=>fs.writeFileSync(path.join(bin,n),t,{mode:0o755});
 w('scp','#!/usr/bin/python3\nimport os,sys,shutil\nd=sys.argv[-1].split(":",1)[1]\nif not d.startswith("/tmp/iskra-tell-") or "/" in d[5:]:sys.exit("scp-заглушка: удалённый путь не /tmp/iskra-tell-*: "+d)\nshutil.copyfile(sys.argv[-2],os.path.join(os.environ["FAKE_TMP"],d[5:]))\nopen(os.environ["FAKE_TMP_LOG"],"a").write(d[5:]+"\\n")\n');
 w('ssh','#!/usr/bin/python3\nimport os,sys,subprocess\ns=sys.argv[-1].replace("/opt/zarya/a2a/in",os.environ["FAKE_IN"]).replace("/tmp/iskra-tell-",os.environ["FAKE_TMP"]+"/iskra-tell-")\nsys.exit(subprocess.run(["sh","-c",s]).returncode)\n');
 w('sudo','#!/bin/sh\n[ "$1" = -n ] && shift\nexec "$@"\n');
 w('chown','#!/bin/sh\nexit 0\n');w('logger','#!/bin/sh\nexit 0\n');
 w('date','#!/bin/sh\nif [ "$1" = "+%s%N" ] && [ -n "$FIX_NAME" ]; then echo '+FIXED_NS+'; else exec /bin/date "$@"; fi\n');
 w('cp','#!/usr/bin/python3\nimport os,sys,time\nif os.environ.get("FAIL_WRITE"):sys.exit(1)\nsrc,dst=sys.argv[-2],sys.argv[-1];b=open(src,"rb").read();f=open(dst,"wb");f.write(b[:len(b)//2]);f.flush();time.sleep(1.0);f.write(b[len(b)//2:]);f.close()\n');
 // The publisher arrives on stdin («python3 -»): prepend a slow os.write and, for the attack probe, a predictable token.
 const patch=path.join(root,'patch.py');fs.writeFileSync(patch,'import os as _o,time as _t,secrets as _s\n_w=_o.write\ndef _slow(fd,b):\n    b=bytes(b);h=len(b)//2\n    if h:\n        _w(fd,b[:h]);_t.sleep(1.0);_w(fd,b[h:]);return len(b)\n    return _w(fd,b)\n_o.write=_slow\nif _o.environ.get("FAIL_WRITE"):\n    def _fail(fd,b):raise OSError(28,"No space left on device")\n    _o.write=_fail\nif _o.environ.get("FIX_NAME"):_s.token_hex=lambda n=8:"0"*16\n');
 w('python3','#!/bin/sh\nif [ "$1" = - ]; then shift; exec /usr/bin/python3 -c "$(cat "'+patch+'"; cat)" "$@"; fi\nexec /usr/bin/python3 "$@"\n');
 const marker='КОНЕЦ-ПИСЬМА-'+Date.now(),body=path.join(root,'body.txt');fs.writeFileSync(body,'Проба публикации\n'+'x'.repeat(4000)+'\n'+marker+'\n');
 const run=async(inbox,extra={})=>{
  const seen=[];let done=false,inFlight=0;
  const watch=(async()=>{while(!done){for(const n of fs.readdirSync(inbox)){if(n.startsWith('.')){inFlight++;continue;}let text='';try{text=fs.readFileSync(path.join(inbox,n),'utf8')}catch{}seen.push({n,complete:text.includes(marker)});}await new Promise(r=>setTimeout(r,10));}})();
  const env={...process.env,PATH:bin+':'+process.env.PATH,FAKE_IN:inbox,FAKE_TMP:fakeTmp,FAKE_TMP_LOG:fakeTmpLog,OT:'fixture',...extra};
  for(const name of Object.keys(env))if(name.startsWith('SUDO_'))delete env[name];
  const code=await new Promise(r=>{const c=spawn(path.join(courier,'zarya-tell'),[body],{env,stdio:['ignore','pipe','pipe']});let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('close',k=>r({k,out,err}))});
  done=true;await watch;return {code,seen,inFlight};
 };
 // (1) ordinary letter: one complete letter, nothing partial or non-letter visible, the write in progress sighted (sight control).
 const inbox=path.join(root,'in');fs.mkdirSync(inbox);const {code,seen,inFlight}=await run(inbox);
 const finals=fs.readdirSync(inbox).filter(n=>!n.startsWith('.')),hidden=fs.readdirSync(inbox).filter(n=>n.startsWith('.'));
 assert.equal(code.k,0,'courier exit '+code.k+': '+code.err.slice(0,300)+code.out.slice(0,300));assert.match(code.out,/доставлено: /);
 assert.equal(finals.length,1,'exactly one letter published: '+finals.join(','));assert.match(finals[0],/^fixture-\d+\.txt$/);
 assert(fs.readFileSync(path.join(inbox,finals[0]),'utf8').includes(marker),'the published letter is complete');assert.deepEqual(hidden,[],'no temporary file left behind');
 const bad=seen.filter(s=>!/\.(txt|md)$/.test(s.n)||!s.complete);
 assert.equal(bad.length,0,'the mailbox poll saw a partial or non-letter file: '+[...new Set(bad.map(s=>s.n))].join(','));
 assert(inFlight>0,'the watcher never saw the write in progress — the probe is blind');
 console.log('PASS courier publication: one complete letter, write in progress sighted '+inFlight+' times hidden, partial/non-letter sightings 0');
 // (3) a failed write into the mailbox must be reported as a refusal, never as «доставлено» (base: the outer remote shell went on).
 const failing=path.join(root,'in-failing');fs.mkdirSync(failing);const f=await run(failing,{FAIL_WRITE:'1'});
 assert.doesNotMatch(f.code.out,/доставлено: /,'a failed publication said «доставлено»');assert.notEqual(f.code.k,0,'a failed publication must not exit 0');
 assert.deepEqual(fs.readdirSync(failing),[],'nothing left in the mailbox after a failed write');
 console.log('PASS failed write: courier exit '+f.code.k+', no «доставлено», mailbox empty');
 // (2) B-N-1609 attack: links planted at the predictable temporary names (cp path and publisher path) point to a victim file.
 const attacked=path.join(root,'in-attacked'),victim=path.join(root,'victim.txt');fs.mkdirSync(attacked);fs.writeFileSync(victim,'VICTIM UNTOUCHED\n');
 for(const n of ['.fixture-'+FIXED_NS+'.part','.fixture-'+'0'.repeat(16)+'.part'])fs.symlinkSync(victim,path.join(attacked,n));
 const a=await run(attacked,{FIX_NAME:'1'});
 assert.equal(fs.readFileSync(victim,'utf8'),'VICTIM UNTOUCHED\n','root wrote through the planted link');
 assert.notEqual(a.code.k,0,'a refused publication must not exit 0');assert.doesNotMatch(a.code.out,/доставлено: /,'a refused publication must not say «доставлено»');
 assert.deepEqual(fs.readdirSync(attacked).filter(n=>!n.startsWith('.')),[],'no letter appears in the attacked mailbox');
 console.log('PASS planted link at the temporary name: victim untouched, courier exit '+a.code.k+', no «доставлено»');
 // (4) B-N-1993: в настоящий /tmp прогон не пишет. Зрячесть — журнал заглушки scp: письма клались в FAKE_TMP (≥1), путь пройден.
 //     (B-N-1994: прежде зрячесть бралась из писем, оставшихся в FAKE_TMP после отказов; теперь курьер их убирает — счёт по журналу scp.)
 const vFake=fs.readFileSync(fakeTmpLog,'utf8').split('\n').filter(Boolean);
 const novye=fs.readdirSync('/tmp').filter(n=>n.startsWith('iskra-tell-')&&!tmpDo.has(n)).filter(n=>{try{return fs.readFileSync(path.join('/tmp',n),'utf8').includes(marker)}catch{return false}});
 assert.deepEqual(novye,[],'прогон оставил письма в настоящем /tmp: '+novye.join(','));
 assert(vFake.length>0,'заглушка scp не положила в FAKE_TMP ни одного письма — путь не пройден, проба слепа');
 console.log('PASS /tmp машины: новых iskra-tell-* с меткой прогона 0; положено в FAKE_TMP стенда '+vFake.length+' (зрячесть)');
 // (5) B-N-1994: после успеха И после отказов публикации (3) и (2) в /tmp адресата (FAKE_TMP) не остаётся ни одного письма.
 //     Зрячесть — журнал scp: положено столько же, сколько прогонов курьера (3), все через FAKE_TMP.
 const ostalos=fs.readdirSync(fakeTmp).filter(n=>n.startsWith('iskra-tell-'));
 assert.equal(vFake.length,3,'заглушка scp положила не 3 письма (по одному на прогон): '+vFake.join(','));
 assert.deepEqual(ostalos,[],'в /tmp адресата остались письма после прогонов курьера (отказ публикации не убирает): '+ostalos.join(','));
 console.log('PASS /tmp адресата: положено '+vFake.length+', осталось 0 (успех и оба отказа публикации убирают за собой)');
}finally{fs.rmSync(root,{recursive:true,force:true})}
