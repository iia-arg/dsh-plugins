// RU: Новый SQLite-файл не должен сохранять исторические SQL-комментарии в sqlite_master. Проверяем настоящую схему отдельным read-only соединением; это не очистка уже установленных баз и не проверка содержимого знаний.
// EN: A new SQLite file must not retain historical SQL comments in sqlite_master. Inspect the actual schema using a separate read-only connection; this neither cleans existing installations nor validates stored knowledge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const subject = process.env.CORE_SOURCE ? pathToFileURL(path.join(process.env.CORE_SOURCE, 'hranilishche.js')) : new URL('../src/hranilishche.js', import.meta.url);
const { otkrytHranilishche } = await import(subject.href);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-schema-'));
try {
  const file = path.join(dir, 'schema.db');
  const storage = otkrytHranilishche(file); storage.zakryt();
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db.prepare('SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name').all();
    assert.ok(rows.some(x => x.name === 'zapisi')); assert.ok(rows.some(x => x.name === 'svyaz_omega'));
    assert.ok(rows.every(x => !x.sql.includes('--')), 'new persisted SQL must not contain comments');
    console.log('PASS persisted schema without historical SQL comments');
  } finally { db.close(); }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
