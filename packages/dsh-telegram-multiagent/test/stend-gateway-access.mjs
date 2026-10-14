// RU: Изолированный стенд stend-gateway-access.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-gateway-access.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-access-'));
const source = fileURLToPath(new URL('..', import.meta.url));
const stands = ['stend-codex-control.mjs', 'stend-stop-route.mjs'];
const identity = process.getuid() === 0 ? { uid: 65534, gid: 65534 } : {};
const run = (args, gateway) => spawnSync(process.execPath, args, {
  ...identity, encoding: 'utf8', timeout: 10000,
  env: { ...process.env, GATEWAY_CANDIDATE: gateway },
});
let failed = 0, total = 0;
function test(name, fn) {
  total++;
  try { fn(); console.log('PASS', name); }
  catch (error) { failed++; console.error('FAIL', name, error.message); }
}
try {
  fs.chmodSync(dir, 0o755);
  fs.cpSync(path.join(source, 'src'), path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  for (const name of [...stands, 'platforma-02.mjs', 'test-platform.mjs']) {
    fs.copyFileSync(path.join(source, 'test', name), path.join(dir, 'test', name));
  }
  const who = run(['-e', 'process.stdout.write(require("node:os").userInfo().username)'], dir);
  assert.equal(who.status, 0, who.stderr);
  const gateway = path.join(dir, 'gateway');
  fs.mkdirSync(gateway);
  const missing = path.join(dir, 'missing');
  fs.mkdirSync(missing);
  const file = path.join(gateway, 'task-control.mjs');
  const sentinel = 'GATEWAY_IMPORT_REACHED';
  fs.writeFileSync(file, `throw new Error('${sentinel}');\n`);
  fs.writeFileSync(path.join(gateway, 'codex-app-server.mjs'), '');
  for (const stand of stands) {
    const args = [path.join(dir, 'test', stand)];
    function reached() {
      const r = run(args, gateway);
      assert.equal(r.status, 1, r.stderr);
      assert.ok(r.stderr.includes(sentinel), r.stderr);
      assert.ok(!r.stderr.includes('СЛЕПОТА:'), r.stderr);
    }
    test(`${stand}: readable fixture reaches import`, reached);
    test(`${stand}: ENOENT is missing, not permission/version`, () => {
      const r = run(args, missing);
      assert.equal(r.status, 1, r.stderr);
      assert.ok(r.stderr.includes('КРАСНЫЙ:') && r.stderr.includes('ENOENT'), r.stderr);
      assert.ok(!r.stderr.includes('СЛЕПОТА:'), r.stderr);
      assert.ok(r.stderr.includes('task-control.mjs'), r.stderr);
      assert.ok(!/нет доступа|старше/.test(r.stderr), r.stderr);
    });
    for (const [name, target, restore] of [['directory', gateway, 0o755], ['file', file, 0o644]]) {
      fs.chmodSync(target, 0);
      try {

        assert.equal(fs.statSync(target).mode & 0o777, 0);
        const probe = run(['-e', 'try{require("node:fs").accessSync(process.argv[1],4);process.exit(1)}catch(e){process.stdout.write(e.code)}', file], gateway);
        assert.equal(probe.status, 0, probe.stderr);
        assert.equal(probe.stdout, 'EACCES');
        console.log('FAULT', stand, name, 'stat mode=000; accessSync=EACCES');
        test(`${stand}: ${name} EACCES names actual account`, () => {
          const r = run(args, gateway);
          assert.equal(r.status, 2, r.stderr);
          assert.ok(r.stderr.includes('СЛЕПОТА:') && r.stderr.includes('EACCES'), r.stderr);
          assert.ok(r.stderr.includes(`нет доступа под ${who.stdout}`), r.stderr);
          assert.ok(r.stderr.includes(file), r.stderr);
          assert.ok(!/старше|файл отсутствует/.test(r.stderr), r.stderr);
        });
      } finally { fs.chmodSync(target, restore); }
      assert.equal(fs.statSync(target).mode & 0o777, restore);
      test(`${stand}: ${name} restored reaches import again`, reached);
    }
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log(`TOTAL ${total}; FAILED ${failed}`);
process.exitCode = failed ? 1 : 0;
