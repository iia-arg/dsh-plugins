// RU: Стенд stend-sekrety-vyhoda.mjs: правило выхода secret-redact.mjs на синтетических секретах во временных файлах.
//     Проверяет вычистку трёх форм (буквальная, JSON-экранированная, URI) трёх источников, перечитывание при смене файла,
//     белый список сырых полей и что выводы шлюза (send, log, console.error) идут через правило. Значения секретов не печатает.
//     Не проверяет: живые секреты, живой провайдер, сквозные пути шлюза (это проба probe_gateway.py).
// EN: Stand for the egress redaction rule on synthetic secrets in temporary files; never prints secret values.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const kat = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!fs.existsSync(path.join(kat, 'secret-redact.mjs'))) { console.log(`СЛЕПОТА: предмета нет: ${path.join(kat, 'secret-redact.mjs')}`); process.exit(2); }
const M = await import(path.join(kat, 'secret-redact.mjs'));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-sekrety-')); process.on('exit', () => fs.rmSync(T, { recursive: true, force: true }));
const sint = (p) => p + '-' + Math.random().toString(36).slice(2) + 'AB+/=C"D\\e-0123456789';
const tok = sint('tok'), ingress = 'ab'.repeat(32), access = sint('acc'), refresh = sint('ref'), idt = sint('idt');
fs.writeFileSync(path.join(T, 'token'), tok + '\n'); fs.writeFileSync(path.join(T, 'ingress'), ingress + '\n');
fs.mkdirSync(path.join(T, 'codex')); fs.writeFileSync(path.join(T, 'codex', 'auth.json'), JSON.stringify({ tokens: { access_token: access, refresh_token: refresh, id_token: idt, account_id: 'acct' } }));
const env = { GATEWAY_TOKEN_FILE: path.join(T, 'token'), GATEWAY_INGRESS_KEY_FILE: path.join(T, 'ingress'), CODEX_HOME: path.join(T, 'codex') };
const vse = [tok, ingress, access, refresh, idt];
const j = (x) => JSON.stringify(x).slice(1, -1); const formy = (v) => [v, j(v), j(j(v)), encodeURIComponent(v)];
const utechka = (s) => vse.flatMap(formy).filter((f) => s.includes(f)).length;
let bed = 0, vsego = 0; const proba = (imya, fn) => { vsego++; try { fn(); console.log('  ✅ ' + imya); } catch (e) { bed++; console.log('  🔴 ' + imya + ' — ' + String(e?.message ?? e).replace(/[^\x20-\x7eА-я]/g, '?').slice(0, 160)); } };
proba('источники прочитаны: токен, ingress, access/refresh/id Codex (короткое поле не секрет)', () => assert.equal(M.sekretyProcessa(env).length, 5));
proba('буквальная форма каждого секрета вычищена', () => { for (const v of vse) assert.equal(utechka(M.vychistit(`ошибка: ${v} конец`, M.sekretyProcessa(env))), 0); });
proba('JSON-форма: секрет в NDJSON-строке вычищен, строка остаётся JSON', () => {
  for (const v of vse) { const s = M.vychistit(JSON.stringify({ type: 'error', message: `rpc: ${v}` }), M.sekretyProcessa(env)); assert.equal(utechka(s), 0); JSON.parse(s); } });
proba('двойное JSON-экранирование: ошибка из JSON, сериализованная в NDJSON, — вычищена, разбор даёт чистую строку', () => {
  for (const v of vse) { const line = M.vychistit(JSON.stringify({ type: 'error', message: JSON.stringify({ status: 401, token: v }) }), M.sekretyProcessa(env));
    assert.equal(utechka(line), 0); assert.equal(utechka(JSON.parse(line).message), 0); } });
proba('URI-форма вычищена', () => { for (const v of vse) assert.equal(utechka(M.vychistit(`url?k=${encodeURIComponent(v)}&x=1`, M.sekretyProcessa(env))), 0); });
proba('чистая строка не тронута', () => { const s = 'обычная ошибка 500 без секретов'; assert.equal(M.vychistit(s, M.sekretyProcessa(env)), s); });
proba('смена файла токена — новое значение ловится, старое больше не секрет', () => {
  const nov = sint('tok2'); fs.writeFileSync(env.GATEWAY_TOKEN_FILE, nov + '\n'); const t = new Date(Date.now() + 5000); fs.utimesSync(env.GATEWAY_TOKEN_FILE, t, t);
  assert.equal(M.vychistit(`x ${nov} y`, M.sekretyProcessa(env)).includes(nov), false); });
proba('нет файлов — секретов 0, не исключение', () => assert.equal(M.sekretyProcessa({ GATEWAY_TOKEN_FILE: path.join(T, 'net') }).length, 0));
proba('белый список: известные формы проходят', () => { assert.equal(M.poBelomu('gpt-6-mini', 'model'), 'gpt-6-mini'); assert.equal(M.poBelomu('highRiskCyberActivity', 'prichina'), 'highRiskCyberActivity');
  assert.equal(M.poBelomu('interrupted', 'status'), 'interrupted'); assert.equal(M.poBelomu('turn/completed', 'metod'), 'turn/completed'); });
proba('белый список: секрет и произвольный текст в сыром поле — только вид и длина', () => {
  for (const [v, vid] of [[tok, 'model'], [access, 'prichina'], ['completed; rm -rf /', 'status'], [access, 'metod'], [tok, 'id']]) {
    const r = M.poBelomu(v, vid); assert.equal(utechka(r), 0); assert.ok(r.includes('не по списку')); } });
const g = fs.readFileSync(path.join(kat, 'gateway.mjs'), 'utf8'); const c = fs.readFileSync(path.join(kat, 'codex-app-server.mjs'), 'utf8');
proba('выводы шлюза идут через правило: send, log, оба console.error', () => {
  assert.match(g, /res\.write\(vychistit\(JSON\.stringify\(o\)\)/); assert.match(g, /const log = \(m\) => console\.error\(vychistit\(/);
  assert.equal((g.match(/console\.error\((?!vychistit\()/g) ?? []).length, 0, 'console.error мимо правила'); });
proba('сырые поля app-server — через белый список (модель, причина, статус, метод, id нити)', () => {
  for (const vid of ['model', 'prichina', 'status', 'metod', 'id']) assert.ok(c.includes(`'${vid}')`), vid); });
console.log(`итог: ${vsego - bed} из ${vsego}`); process.exit(bed ? 1 : 0);
