// Exercise the real bridge and cel-mosta reader in a private copy, without live units.
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'

const root = path.resolve(process.env.MOST_ROOT || new URL('..', import.meta.url).pathname)
const app = process.env.DSH_TEST_APP
if (!app || !fs.existsSync(path.join(app, 'node_modules/@deepseek-ai/schemastery'))) {
  console.error('СЛЕПОТА: нужен DSH_TEST_APP с установленной платформой')
  process.exit(2)
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cel-content-'))
const home = path.join(temp, 'fixture'), copy = path.join(home, 'plugins/dsh-tool-bridge')
const bin = path.join(temp, 'bin'), journal = path.join(temp, 'journal')
const src = path.join(copy, 'src/index.js'), manifest = path.join(copy, 'package.json')
const start = 'Wed 2021-01-06 00:00:00 UTC', unit = 'fixture.service'
const oldTime = new Date('2020-01-01T00:00:00Z')
let child, ok = 0, bad = 0
const check = async (name, fn) => {
  try { await fn(); ok++; console.log('PASS ' + name) }
  catch (error) { bad++; console.log('FAIL ' + name + ': ' + error.message) }
}
try {
  fs.mkdirSync(path.dirname(copy), { recursive: true })
  fs.cpSync(root, copy, { recursive: true, filter: p => !p.split(path.sep).includes('node_modules') })
  fs.symlinkSync(path.join(app, 'node_modules'), path.join(copy, 'node_modules'), 'dir')
  fs.symlinkSync(app, path.join(home, 'app'), 'dir')
  fs.mkdirSync(bin)
  const limits = path.join(temp, 'limits'); fs.mkdirSync(limits)
  fs.writeFileSync(path.join(limits, 'fixture.yml'), '{}\n')
  fs.utimesSync(path.join(limits, 'fixture.yml'), oldTime, oldTime)
  const config = { port: 0, limitsDir: limits, limitsAgent: 'fixture' }
  const layer = path.join(temp, 'layer.yml')
  fs.writeFileSync(layer, `plugins:\n  - name: dsh-tool-bridge\n    config:\n      port: 0\n      limitsAgent: fixture\n      limitsDir: ${limits}\n`)
  const original = fs.readFileSync(src), originalManifest = fs.readFileSync(manifest)
  fs.utimesSync(src, oldTime, oldTime)
  const sha = createHash('sha256').update(original).digest('hex')
  const runtime = path.join(temp, 'runtime.mjs')
  fs.writeFileSync(runtime, `
    import {pathToFileURL} from 'node:url';
    import {appendFileSync} from 'node:fs';
    const lines=[]; console.error=(...a)=>lines.push(a.join(' '));
    const module=await import(pathToFileURL(process.argv[2]));
    appendFileSync(process.argv[2], '\\n// CHANGED AFTER IMPORT BEFORE APPLY\\n');
    const effects=[];
    const services={agents:{roots:()=>[],get:()=>null,currentInitiator:()=>null},
      tools:{list:()=>[],get:()=>null,register(){}},jobs:{},goals:{},typertGateway:{}};
    const ctx={get:n=>services[n],provide:(n,s)=>services[n]=s,on:()=>()=>{},
      effect:fn=>effects.push(fn()),logger:{info(){},warn(){},error(){}}};
    module.apply(ctx,JSON.parse(process.argv[3]));
    await new Promise(r=>setTimeout(r,30));
    console.log(JSON.stringify({pid:process.pid,lines}));
    process.stdin.once('data',()=>{for(const fn of effects.reverse())if(typeof fn==='function')fn();process.exit(0)});
  `)
  child = spawn(process.execPath, [runtime, src, JSON.stringify(config)], {
    env: { ...process.env, HOME: home, AGENT_LIMITS_DIR: limits }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stderr = ''; child.stderr.on('data', b => { stderr += b })
  const loaded = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('runtime did not start: ' + stderr.slice(0, 300))), 8000)
    let text = ''
    child.stdout.on('data', b => {
      text += b
      if (text.includes('\n')) { clearTimeout(timer); try { resolve(JSON.parse(text.split('\n')[0])) } catch (e) { reject(e) } }
    })
    child.once('error', reject)
  })
  const interpreter = '#!' + process.execPath + '\n'
  fs.writeFileSync(path.join(bin, 'systemctl'), interpreter + `
const fs = require('node:fs');
if (process.argv.includes('MainPID')) {
  let pid = ${loaded.pid};
  if (process.env.CEL_FIXTURE_PID_SWITCH === '1') {
    if (fs.existsSync(process.env.CEL_FIXTURE_PID_READS)) pid++;
    else fs.writeFileSync(process.env.CEL_FIXTURE_PID_READS, 'seen');
  }
  console.log(pid);
} else console.log(${JSON.stringify(start)});
`, { mode: 0o755 })
  fs.writeFileSync(path.join(bin, 'journalctl'), interpreter +
    "process.stdout.write(require('node:fs').readFileSync(process.env.CEL_FIXTURE_JOURNAL));\n", { mode: 0o755 })
  const journalBody = loaded.lines.join('\n') + '\n'
  const writeJournal = body => fs.writeFileSync(journal, `#MOST_ZHURNAL_YUNITA ${unit} ${start}\n` + body)
  const run = (cached = true, changes = {}) => {
    const env = { ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH,
      MOST_KORNI: copy, MOST_SLOJ: layer, MOST_YUNIT: unit, MOST_APP: app,
      MOST_PREDELY: limits, CEL_FIXTURE_JOURNAL: path.join(temp, 'journal-body'),
      CEL_FIXTURE_PID_READS: path.join(temp, 'pid-reads'), ...changes }
    fs.rmSync(env.CEL_FIXTURE_PID_READS, { force: true })
    delete env.MOST_ZHURNAL_YUNITA
    if (cached) env.MOST_ZHURNAL_YUNITA = journal
    fs.writeFileSync(path.join(temp, 'journal-body'), fs.readFileSync(journal, 'utf8').split('\n').slice(1).join('\n'))
    const result = spawnSync(process.execPath, [path.join(copy, 'test/stend-cel-mosta.mjs')], { env, encoding: 'utf8', timeout: 12000 })
    assert.ifError(result.error)
    return { code: result.status, output: result.stdout + result.stderr }
  }
  const expect = (result, code) => assert.equal(result.code, code, result.output.slice(-1400))
  writeJournal(journalBody)
  await check('module import SHA survives disk change before first apply and names PID', () => {
    assert(!fs.readFileSync(src).equals(original))
    assert(loaded.lines.some(l => l.includes('src/index.js sha256=' + sha + ' pid=' + loaded.pid)), 'startup content receipt absent')
  })
  fs.writeFileSync(src, original); fs.utimesSync(src, oldTime, oldTime)
  await check('healthy code is green with cached journal', () => expect(run(), 0))
  await check('same bytes with newer mtime remain green', () => {
    fs.utimesSync(src, new Date(), new Date()); expect(run(), 0)
  })
  await check('test-only git archive commit preserves src content and stays green', () => {
    for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@sadik', 'commit', '-qm', 'base']]) {
      const q = spawnSync('git', ['-C', copy, ...args], { encoding: 'utf8' }); assert.equal(q.status, 0, q.stderr)
    }
    fs.appendFileSync(path.join(copy, 'test/stend-cel-mosta.mjs'), '\n// test-only commit\n')
    for (const args of [['add', 'test'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@sadik', 'commit', '-qm', 'tests only']]) {
      const q = spawnSync('git', ['-C', copy, ...args], { encoding: 'utf8' }); assert.equal(q.status, 0, q.stderr)
    }
    const archive = spawnSync('git', ['-C', copy, 'archive', 'HEAD', 'src/index.js'])
    assert.equal(archive.status, 0)
    const extracted = spawnSync('tar', ['-x', '-C', copy], { input: archive.stdout }); assert.equal(extracted.status, 0)
    assert(fs.readFileSync(src).equals(original)); assert(fs.statSync(src).mtime > new Date(start))
    expect(run(), 0)
  })
  await check('other source content is red even with older mtime', () => {
    fs.appendFileSync(src, '\n// B-N-1983 content corruption\n'); fs.utimesSync(src, oldTime, oldTime)
    const after = createHash('sha256').update(fs.readFileSync(src)).digest('hex')
    assert.notEqual(after, sha)
    assert.equal(spawnSync('grep', ['-cF', 'B-N-1983 content corruption', src], { encoding: 'utf8' }).stdout.trim(), '1')
    console.log('CORRUPTION src replacements=1 grepF=1 SHA256 ' + sha + '->' + after)
    expect(run(), 1)
  })
  fs.writeFileSync(src, original); fs.utimesSync(src, new Date(), new Date())
  await check('restored bytes are green again', () => expect(run(), 0))
  await check('manifest-only version change uses loaded startup signature', () => {
    const meta = JSON.parse(originalManifest); meta.version = '99.0.0'; fs.writeFileSync(manifest, JSON.stringify(meta))
    try { expect(run(), 0) } finally { fs.writeFileSync(manifest, originalManifest) }
  })
  await check('direct journal reader remains green', () => expect(run(false), 0))
  await check('receipt from another PID is blindness', () => {
    fs.utimesSync(src, oldTime, oldTime)
    writeJournal(journalBody.replace('pid=' + loaded.pid, 'pid=' + (loaded.pid + 100000)))
    try { expect(run(), 2) } finally { writeJournal(journalBody) }
  })
  await check('missing startup receipt is blindness, never mtime fallback', () => {
    writeJournal(loaded.lines.filter(l => !l.includes('src/index.js sha256=')).join('\n') + '\n')
    fs.utimesSync(src, oldTime, oldTime)
    try { expect(run(), 2) } finally { writeJournal(journalBody) }
  })
  await check('malformed content receipt is blindness', () => {
    writeJournal(journalBody.replace('sha256=' + sha, 'sha256=invalid'))
    try { expect(run(), 2) } finally { writeJournal(journalBody) }
  })
  await check('valid receipt cannot hide a later malformed receipt of same PID', () => {
    const receipt = loaded.lines.find(l => l.includes('src/index.js sha256='))
    writeJournal(journalBody + receipt.replace('sha256=' + sha, 'sha256=invalid') + '\n')
    try { expect(run(), 2) } finally { writeJournal(journalBody) }
  })
  await check('receipt with unreadable PID is blindness even beside valid receipt', () => {
    const receipt = loaded.lines.find(l => l.includes('src/index.js sha256='))
    writeJournal(journalBody + receipt.replace('pid=' + loaded.pid, 'pid=unknown') + '\n')
    try { expect(run(), 2) } finally { writeJournal(journalBody) }
  })
  await check('valid current receipt does not borrow another process receipt', () => {
    const receipt = loaded.lines.find(l => l.includes('src/index.js sha256='))
    writeJournal(journalBody + receipt.replace('pid=' + loaded.pid, 'pid=' + (loaded.pid + 1)).replace(sha, '0'.repeat(64)) + '\n')
    try { expect(run(), 0) } finally { writeJournal(journalBody) }
  })
  await check('conflicting hashes in one process are blindness', () => {
    const receipt = loaded.lines.find(l => l.includes('src/index.js sha256='))
    writeJournal(journalBody + receipt.replace(sha, '0'.repeat(64)) + '\n')
    try { expect(run(), 2) } finally { writeJournal(journalBody) }
  })
  await check('cached journal of another unit is blindness', () => {
    fs.writeFileSync(journal, `#MOST_ZHURNAL_YUNITA another.service ${start}\n` + journalBody)
    try { expect(run(), 2) } finally { writeJournal(journalBody) }
  })
  await check('process changed during journal read is blindness', () => expect(run(true, { CEL_FIXTURE_PID_SWITCH: '1' }), 2))
} finally {
  if (child && child.exitCode === null) {
    child.stdin.end('stop\n')
    await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 1000))])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  fs.rmSync(temp, { recursive: true, force: true })
}
console.log(`ИТОГО content/startup: ${ok + bad}, зелёных ${ok}, красных ${bad}`)
process.exit(bad ? 1 : 0)
