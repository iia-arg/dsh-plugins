// RU: Стенд stend-maska-modul-prava.mjs (A-N-1948 №2, находка №22): модуль маски ПДн свёртки (pdnMaskaSvertki.modul) грузится
//     в процесс агента только как trust-файл — обычный файл, не ссылка, владелец root, без записи группе/прочим. Подставные модули
//     в своём mktemp (каждый со своим именем — кеш import() не подменяет предмет). Запуск ОТ ROOT (создать файл root и испортить
//     владельца). Коды: 0 — все пробы; 1 — красные; 2 — слепота (не root).
// EN: Harness for A-N-1948 №2 finding 22: the PII mask module loads only if it is a regular root-owned file without group/other write.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { zagruzitMaskuSvertki } from '../src/guest-channel.js';

if (process.getuid?.() !== 0) { console.log('СЛЕПОТА: нужен root (модуль-подстава root и порча владельца)'); process.exit(2); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1948-02-n22-'));
const reestr = path.join(root, 'reestr'), belyj = path.join(root, 'belyj'); fs.writeFileSync(reestr, ''); fs.writeFileSync(belyj, '');
let n = 0;
function modul({ uid = 0, mode = 0o644, ssylka = false } = {}) {
  const f = path.join(root, `m${++n}.mjs`);
  fs.writeFileSync(f, "export const prochestReestr=()=>({});\nexport const maskirovatTekst=t=>t.replace(/\\d/g,'*');\n");
  fs.chmodSync(f, mode); fs.chownSync(f, uid, uid);
  if (!ssylka) return f;
  const l = path.join(root, `l${n}.mjs`); fs.symlinkSync(f, l); return l;
}
const opis = f => { const st = fs.lstatSync(f); return `uid ${st.uid}, режим ${(st.mode & 0o777).toString(8)}${st.isSymbolicLink() ? ', ссылка' : ''}`; };
const zagruzit = f => zagruzitMaskuSvertki({ modul: f, reestr, belyjSpisok: belyj });
let ok = 0, krasnyh = 0;
const proba = async (imya, fn) => { try { await fn(); ok++; console.log('  ok   ' + imya); } catch (e) { krasnyh++; console.log('  FAIL ' + imya + ': ' + String(e.message).split('\n')[0]); } };
try {
  const f1 = modul(); console.log(`   подстава П1: ${opis(f1)}`);
  await proba('П1 модуль root 644 — грузится, маска работает', async () => { const m = await zagruzit(f1); assert.equal(m('тел 123'), 'тел ***'); });
  const f2 = modul({ uid: 65534 }); console.log(`   порча П2: ${opis(f2)}`);
  await proba('П2 владелец не root (65534) — отказ до import', async () => { await assert.rejects(zagruzit(f2), /не обычный файл root/); });
  const f3 = modul({ mode: 0o666 }); console.log(`   порча П3: ${opis(f3)}`);
  await proba('П3 root, но запись группе/прочим (666) — отказ', async () => { await assert.rejects(zagruzit(f3), /не обычный файл root/); });
  const f4 = modul({ ssylka: true }); console.log(`   порча П4: ${opis(f4)}`);
  await proba('П4 символьная ссылка на модуль root — отказ', async () => { await assert.rejects(zagruzit(f4), /не обычный файл root/); });
  const f5 = modul(); console.log(`   порча снята П5: ${opis(f5)}`);
  await proba('П5 снова root 644 — грузится', async () => { const m = await zagruzit(f5); assert.equal(m('9'), '*'); });
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`итог: ${ok} из ${ok + krasnyh}`); process.exit(krasnyh ? 1 : 0);
