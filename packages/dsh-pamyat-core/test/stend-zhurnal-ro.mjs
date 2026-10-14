// RU: Проверяем журнал в режиме tolkoChtenie на временной базе без таблицы журнала: читатель не создаёт схему или рубеж, svodka сообщает отсутствие таблицы, ustanovitOtsechku отвергается, байты файла не меняются. Чтение существующего журнала и остальные методы здесь не проверяются.
// EN: Test the journal in tolkoChtenie mode on a temporary database without a journal table: the reader creates neither schema nor cutoff, svodka reports the missing table, ustanovitOtsechku is rejected, and file bytes remain unchanged. Reading an existing journal and other methods are outside this test.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zavestiZhurnal } from '../src/zhurnal.js';

test('read-only reader neither creates schema nor initializes a cutoff', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhurnal-ro-'));
  const file = join(dir, 'copy.db');
  let db;
  try {
    db = new DatabaseSync(file);
    db.exec('CREATE TABLE nastrojki(kluch TEXT PRIMARY KEY, znachenie TEXT, postavleno INTEGER)');
    db.close();
    const before = readFileSync(file);
    db = new DatabaseSync(file, { readOnly: true });
    const journal = zavestiZhurnal(db, { tolkoChtenie: true });
    assert.throws(() => journal.svodka('probe'), /no such table/);
    assert.throws(() => journal.ustanovitOtsechku('probe'));
    db.close(); db = null;
    assert.deepEqual(readFileSync(file), before);
  } finally { if (db?.isOpen) db.close(); rmSync(dir, { recursive: true, force: true }); }
});
