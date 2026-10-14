// B-N-1691: actual startup sweep, real files, synthetic data only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {VoiceTempStore} from '../src/voice-temp.js';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-sweep-'));
const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
const logs = [], store = new VoiceTempStore({workspace, baseDirectory: root, log: x => logs.push(x)});
const old = new Date(Date.now() - 31 * 60 * 1000);
const age = p => fs.utimesSync(p, old, old);
const abandoned = (name, stale = true) => {
  const job = store.prepare(name); store.active.delete(job.directory);
  const file = path.join(job.directory, 'voice.oga'); fs.writeFileSync(file, 'SYNTHETIC', {mode: 0o600});
  if (stale) for (const p of [file, job.directory, job.conversationDirectory]) age(p);
  return {...job, file};
};
try {
  const stale = abandoned('old'), fresh = abandoned('fresh', false), mixed = abandoned('mixed');
  const freshFile = path.join(mixed.directory, 'new.wav'); fs.writeFileSync(freshFile, 'new'); age(mixed.directory);
  const live = store.prepare('live'); age(live.directory); age(live.conversationDirectory);
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside); const sentinel = path.join(outside, 'keep'); fs.writeFileSync(sentinel, 'keep'); age(sentinel);
  const links = abandoned('links'); fs.symlinkSync(outside, path.join(links.directory, 'escape')); age(links.directory);
  const otherWorkspace = path.join(root, 'other'); fs.mkdirSync(otherWorkspace);
  const other = new VoiceTempStore({workspace: otherWorkspace, baseDirectory: root, log: x => logs.push(x)});
  const otherJob = other.prepare('old'); age(otherJob.directory);
  const result = store.sweep();
  assert(!result.limited); assert(!fs.existsSync(stale.conversationDirectory));
  for (const p of [fresh.file, freshFile, live.directory, sentinel, otherJob.directory]) assert(fs.existsSync(p), p);
  assert(!fs.existsSync(mixed.file)); assert(fs.lstatSync(path.join(links.directory, 'escape')).isSymbolicLink());
  console.log('PASS old removed; fresh files/jobs, active job, symlink target, other workspace preserved');
  store.release(live); other.release(otherJob);
  for (const p of fs.readdirSync(store.root)) fs.rmSync(path.join(store.root, p), {recursive: true, force: true});
  const empty = store.prepare('empty'); store.active.delete(empty.directory); age(empty.directory); age(empty.conversationDirectory);
  store.sweep(); assert(!fs.existsSync(empty.conversationDirectory)); console.log('PASS old empty directories removed');
  const many = store.prepare('many'); store.active.delete(many.directory);
  for (let i=0; i<1005; i++) { const p=path.join(many.directory, String(i)); fs.writeFileSync(p, 'x'); age(p); }
  age(many.directory); age(many.conversationDirectory);
  const bounded=store.sweep(); assert.equal(bounded.visited,1000); assert(bounded.limited); assert(fs.readdirSync(many.directory).length>0); assert(logs.some(x=>x.includes('неполная')));
  console.log('PASS 1000-entry budget stops traversal and reports incomplete cleanup');
  assert.throws(()=>store.prepare(''),/не задан разговор/);
  fs.chmodSync(store.root,0o755); assert.throws(()=>store.prepare('unsafe'),/небезопасный каталог/); fs.chmodSync(store.root,0o700);
  const moved=store.root+'-saved'; fs.renameSync(store.root,moved); fs.symlinkSync(moved,store.root);
  assert.throws(()=>store.prepare('symlink'),/небезопасный каталог/); fs.unlinkSync(store.root); fs.renameSync(moved,store.root);
  const inside=new VoiceTempStore({workspace,baseDirectory:workspace,log:x=>logs.push(x)}); assert.throws(()=>inside.prepare('inside'),/внутри workspace/);
  console.log('PASS missing route, wrong mode, symlink root, inside workspace refuse');
  const fail=store.prepare('cleanup-failure'), original=fs.rmSync;
  try { fs.rmSync=()=>{throw Error('synthetic EACCES');}; store.release(fail); } finally {fs.rmSync=original;}
  assert(logs.some(x=>x.includes(fail.directory)&&x.includes('synthetic EACCES'))); assert(fs.existsSync(fail.directory)); store.release(fail); assert(!fs.existsSync(fail.directory));
  console.log('PASS cleanup failure named, restored cleanup succeeds');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
