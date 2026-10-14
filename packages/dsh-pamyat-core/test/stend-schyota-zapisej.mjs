// RU: При отказе стенда в старом дереве сначала сверяй версии кода: стенд может проверять более новое поведение. Устаревший код нужно свести с проверяемой версией, а не ослаблять ожидания.
// EN: If this suite fails in an older tree, compare code versions first: it may test newer behavior. Bring stale code to the tested version rather than weakening expectations.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

const target = process.env.CORE_UNDER_TEST
  ? pathToFileURL(resolve(process.env.CORE_UNDER_TEST, 'src/index.js'))
  : new URL('../src/index.js', import.meta.url);
const { apply } = await import(target.href);
const { otkrytHranilishche } = await import(new URL('./hranilishche.js', target));
const { zavestiZhurnal } = await import(new URL('./zhurnal.js', target));
const masked = 'учебный образец password: Example.Pass1 для разбора фильтра';

function fixture(fn, config = {}, seed = null) {
  const dir = vremennyj(join(tmpdir(), 'core-count-'));
  const file = join(dir, 'test.db');
  if (seed) {
    const storage = otkrytHranilishche(file);
    try { seed(storage, zavestiZhurnal(storage.baza)); }
    finally { storage.zakryt(); }
  }
  let service; const dispose = [];
  const ctx = { provide(_name, object) { service = object; },
    // RU: Уборка ядра зарегистрирована через ctx.effect: события dispose в cordis нет. Подставной ctx собирает тот же обработчик.
    // EN: Core cleanup is registered through ctx.effect: cordis has no dispose event. The fake ctx collects the same handler.
    on() {}, effect(fn) { const d = fn(); if (typeof d === 'function') dispose.push(d); } };
  const mount = () => {
    apply(ctx, { putBazy: file, agent: 'probe', sprashivat: ['urok'], ...config });
    return service;
  };
  mount();
  const db = new DatabaseSync(file);
  try { fn(service, db, file, mount); }
  finally { db.close(); for (const callback of dispose) callback(); rmSync(dir, { recursive: true, force: true }); }
}

function summary(service) {
  const lines = []; const previous = console.error;
  console.error = (...args) => lines.push(args.join(' '));
  try { return { value: service.svodka(), lines }; }
  finally { console.error = previous; }
}

function proveCorruption(file, marker, before) {
  const after = createHash('sha256').update(readFileSync(file)).digest('hex');
  const count = spawnSync('grep', ['-acF', marker, file], { encoding: 'utf8' });
  console.log('CORRUPTION', marker, 'grep-lines', count.stdout.trim(), 'sha-before', before, 'sha-after', after);
  assert.ok(Number(count.stdout) > 0); assert.notEqual(after, before);
}

test('empty ledger and ordinary write count actual rows', () => fixture((s, db) => {
  assert.equal(s.svodka().zapisano, 0);
  assert.equal(s.svodka().otmetokZapisano, 0);
  s.zapisat({ klass: 'zametka', soderzhim: 'one' });
  const result = summary(s);
  assert.equal(result.value.zapisano, 1);
  assert.equal(result.value.otmetokZapisano, 1);
  assert.equal(result.value.raznicaZapisano, 0);
  assert.match(result.value.zapisiSvodka, /записей 1 \/ отметок 1/);
  assert.equal(result.lines.length, 0);
  db.exec("INSERT INTO zapisi(agent,klass,soderzhim,sozdano) VALUES('other','zametka','other',1)");
  assert.equal(s.svodka().zapisano, 1);
}));

test('mask, suspicion and cleanup are diagnostics, not additional successful writes', () => fixture((s, db) => {
  for (const text of [masked, 'хеш abcdef0123456789abcdef0123456789abcdef', 'текст '+ '\u{E0041}'.repeat(40)]) {
    s.zapisat({ klass: 'urok', soderzhim: text, podtverzhdenie: 'allowed-once' });
  }
  assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE ishod='zapisano'").get().n, 3);
  assert.deepEqual(db.prepare("SELECT DISTINCT priroda FROM zhurnal WHERE ishod='obrabotano' ORDER BY priroda").all().map(r => r.priroda),
    ['maska-obrazcov', 'ochistka-trevozhnaya', 'podozrenie-na-sekret']);
  assert.equal(s.svodka().zapisano, 3);
  assert.equal(s.svodka().otmetokZapisano, 3);
}));

test('confirmation rejection leaves no success or processing marks', () => fixture((s, db) => {
  assert.throws(() => s.zapisat({ klass: 'urok', soderzhim: masked, podtverzhdenie: 'rejected' }));
  assert.equal(db.prepare('SELECT count(*) n FROM zapisi').get().n, 0);
  assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE ishod IN ('zapisano','obrabotano')").get().n, 0);
  assert.equal(s.svodka().zapisano, 0);
}));

test('invalid confidence and failing INSERT leave no success marks', () => fixture((s, db, file) => {
  assert.throws(() => s.zapisat({ klass: 'urok', soderzhim: masked, vera: 2, podtverzhdenie: 'allowed-once' }));
  const before = createHash('sha256').update(readFileSync(file)).digest('hex');
  db.exec("CREATE TRIGGER fail_write BEFORE INSERT ON zapisi BEGIN SELECT RAISE(ABORT,'fixture insert failure'); END");
  proveCorruption(file, 'fixture insert failure', before);
  assert.throws(() => s.zapisat({ klass: 'urok', soderzhim: masked, podtverzhdenie: 'allowed-once' }));
  assert.equal(db.prepare('SELECT count(*) n FROM zapisi').get().n, 0);
  assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE ishod IN ('zapisano','obrabotano')").get().n, 0);
  db.exec('DROP TRIGGER fail_write');
  s.zapisat({ klass: 'urok', soderzhim: masked, podtverzhdenie: 'allowed-once' });
  assert.equal(s.svodka().zapisano, 1);
  assert.equal(s.svodka().otmetokZapisano, 1);
}));

test('journal failure rolls back the knowledge row too', () => fixture((s, db, file) => {
  const before = createHash('sha256').update(readFileSync(file)).digest('hex');
  db.exec("CREATE TRIGGER fail_mark BEFORE INSERT ON zhurnal WHEN NEW.ishod='zapisano' BEGIN SELECT RAISE(ABORT,'fixture journal failure'); END");
  proveCorruption(file, 'fixture journal failure', before);
  assert.throws(() => s.zapisat({ klass: 'urok', soderzhim: masked, podtverzhdenie: 'allowed-once' }));
  assert.equal(db.prepare('SELECT count(*) n FROM zapisi').get().n, 0);
  assert.equal(db.prepare("SELECT count(*) n FROM zhurnal WHERE ishod='obrabotano'").get().n, 0);
  db.exec('DROP TRIGGER fail_mark');
  s.zapisat({ klass: 'urok', soderzhim: masked, podtverzhdenie: 'allowed-once' });
  assert.equal(s.svodka().zapisano, 1);
  assert.equal(s.svodka().otmetokZapisano, 1);
}));

test('no-answerer path uses the same atomic accounting', () => fixture((s) => {
  s.zapisat({ klass: 'urok', soderzhim: masked });
  assert.equal(s.svodka().zapisano, 1);
  assert.equal(s.svodka().otmetokZapisano, 1);
}, { otvechayushchegoNet: true }));

test('duplicate mark: quiet -> alarm with numbers -> quiet after removal', () => fixture((s, db, file) => {
  s.zapisat({ klass: 'zametka', soderzhim: 'one' });
  const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex');
  const before = hash();
  assert.equal(summary(s).lines.length, 0);
  const inserted = db.prepare("INSERT INTO zhurnal(kogda,agent,klass,ishod,pochemu) VALUES(1,'probe','zametka','zapisano','probe-duplicate-mark')").run();
  const grep = spawnSync('grep', ['-acF', 'probe-duplicate-mark', file], { encoding: 'utf8' });
  console.log('CORRUPTION duplicate: grep-lines', grep.stdout.trim(), 'sha-before', before, 'sha-after', hash());
  assert.ok(Number(grep.stdout) > 0); assert.notEqual(hash(), before);
  const bad = summary(s);
  assert.equal(bad.value.zapisano, 1);
  assert.equal(bad.value.otmetokZapisano, 2);
  assert.equal(bad.value.raznicaZapisano, 1);
  assert.ok(bad.lines.some(line => /РАСХОЖДЕНИЕ/.test(line) && /записей 1 \/ отметок 2/.test(line) && /разница 1/.test(line)));
  db.prepare('DELETE FROM zhurnal WHERE id=?').run(inserted.lastInsertRowid);
  db.exec('VACUUM');
  const restored = spawnSync('grep', ['-acF', 'probe-duplicate-mark', file], { encoding: 'utf8' });
  console.log('RESTORED duplicate: grep-lines', restored.stdout.trim(), 'sha', hash());
  assert.equal(Number(restored.stdout), 0);
  assert.equal(summary(s).lines.length, 0);
  assert.equal(s.svodka().raznicaZapisano, 0);
}));

test('historical difference stays visible but quiet; new difference survives reopening', () => fixture((s, db, file, mount) => {
  let state = summary(s);
  assert.equal(state.value.raznicaZapisano, 19);
  assert.equal(state.value.istoricheskayaRaznica, 19);
  assert.equal(state.value.novayaRaznica, 0);
  assert.equal(state.lines.length, 0);
  assert.match(state.value.zapisiSvodka, /историческое 19.*новое 0/);
  const cutoff = state.value.otsechkaSchetMs;
  const before = createHash('sha256').update(readFileSync(file)).digest('hex');
  const mark = db.prepare("INSERT INTO zhurnal(kogda,agent,klass,ishod,pochemu) VALUES(1,'probe','zametka','zapisano','new-after-cutoff')").run();
  proveCorruption(file, 'new-after-cutoff', before);
  state = summary(s);
  assert.equal(state.value.novayaRaznica, 1);
  assert.ok(state.lines.some(line => /историческое 19.*новое 1/.test(line)));
  s = mount();
  state = summary(s);
  assert.equal(state.value.otsechkaSchetMs, cutoff);
  assert.equal(state.value.istoricheskayaRaznica, 19);
  assert.equal(state.value.novayaRaznica, 1);
  assert.ok(state.lines.length > 0);
  db.prepare('DELETE FROM zhurnal WHERE id=?').run(mark.lastInsertRowid);
  db.exec('VACUUM');
  const grep = spawnSync('grep', ['-acF', 'new-after-cutoff', file], { encoding: 'utf8' });
  console.log('RESTORED cutoff: grep-lines', grep.stdout.trim(), 'sha', createHash('sha256').update(readFileSync(file)).digest('hex'));
  assert.equal(Number(grep.stdout), 0);
  state = summary(s);
  assert.equal(state.value.novayaRaznica, 0);
  assert.equal(state.value.raznicaZapisano, 19);
  assert.equal(state.lines.length, 0);
}, {}, (storage, journal) => {
  storage.zapisat({ agent: 'probe', klass: 'zametka', soderzhim: 'historical' });
  for (let i = 0; i < 20; i++) journal.otmetit({ agent: 'probe', klass: 'zametka', ishod: 'zapisano', pochemu: 'historical event' });
}));
