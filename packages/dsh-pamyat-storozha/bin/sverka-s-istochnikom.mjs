#!/usr/bin/env node
// RU: Совместимое имя read-only проверки опоры. Все формы источников и выбор old/v4 — в proverka-opory.mjs.
// EN: Compatibility name for the read-only anchor check; source parsing and old/v4 choice live in proverka-opory.mjs.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const KONF = process.env.DSH_PAMYAT_STOROZHA_CONF || '/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf';
// « #» в значении — громкий отказ (код 2), а не склеивание пояснения со значением: комментарий только с начала строки.
// EN: " #" in a value is a loud refusal (code 2), not gluing the note into the value: a comment only from the line start.
const konf = (k) => { let z = ''; try { for (const s of readFileSync(KONF, 'utf8').split('\n')) { const t = s.trim(), i = t.indexOf('='); if (t && !t.startsWith('#') && i > 0 && t.slice(0, i).trim() === k) z = t.slice(i + 1); } } catch {} if (/\s#/.test(z)) { console.log('ОТКАЗ: значение ключа ' + k + ' в ' + KONF + ' содержит « #» — комментарий допускается только с начала строки'); process.exit(2); } return z.trim(); };
const args = process.argv.slice(2);
if (args.length > 1 || args.some(a => a.startsWith('-') || !a.endsWith('.db'))) {
  console.error('ОТКАЗ: sverka-s-istochnikom.mjs [база.db] — только чтение'); process.exit(2);
}
const baza = args[0] ?? konf('PAMYAT_BAZA');
if (!baza) { console.error('СЛЕПОТА: база не задана — ключ PAMYAT_BAZA в ' + KONF); process.exit(2); }
const result = spawnSync(process.execPath, [fileURLToPath(new URL('./proverka-opory.mjs', import.meta.url)), baza], {
  env: process.env, stdio: 'inherit', timeout: 300000,
});
if (result.error || result.signal) { console.error('СЛЕПОТА: проверка опоры не завершилась'); process.exit(2); }
process.exit(result.status ?? 2);
