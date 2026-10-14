#!/usr/bin/env node
// RU: ГЕРМЕТИЧНАЯ ПРОБА bin/proverka-opory.mjs на подставе с известным ответом (A-N-1589, Аврора, 05.10.2026).
//     Зачем: прежний стенд (stend-proverki-opory.mjs) проверяет поведение записи в базу и журналов не видит —
//     правки B-N-1563/b/d (форма #oknoN и «сессия#N», журнал v4 и выбор старый/v4 по времени записи, три свидетеля
//     вне журнала сессии, строка покрытия) он не различал: на приборе до них и после — один исход.
//     Как: во временном каталоге строится подстава — каталог сессий с журналами, сжатыми ВНЕШНИМ zstd (как в бою:
//     заголовок без seq, события {type, seq, time(мс), data}), файл уроков с заголовками в ограде и вне её, файл для
//     sha256, SDK-журнал с uuid, файл настройки (DSH_PAMYAT_STOROZHA_CONF) и по одной базе sqlite на случай. Прибор
//     зовётся ПОДПРОЦЕССОМ как в бою (node bin/proverka-opory.mjs <база>.db), исход случая — по его счётным строкам.
//     Каждая форма подставы достижима в бою (замер 05.10, база Искры /opt/iskra/pamyat/pamyat.db, 5704 записи):
//     #oknoN 5053, урок .md 339, «сессия#от-до» 305, «сессия#N» 3, файл+sha256 2, SDK 1; журналы — сессии с обоими
//     журналами и только с v4 есть на машине (/opt/*/.dsh/sessions/...).
//     Счёт раздельный: РАЗЛИЧАЮЩИЕ — случаи, где прибор до B-N-1563 (1.1.46) даёт иной исход; КОНТРОЛЬНЫЕ — где исход
//     тот же (зрячесть, граница выбора журнала). Прибор подменяется переменной STEND_OPORY_PRIBOR (только для проб на
//     основе и порче; подмена печатается).
//     КОДЫ: 0 — все зелёные · 1 — есть красные · 2 — слепота (нет zstd/прибора, прибор не различает здоровое и утраченное,
//     ответ прибора не разобран).
//     ЧЕГО НЕ ЛОВИТ: ключ --zapisat и --kontrol (их видит stend-proverki-opory.mjs); чтение настоящих журналов на
//     сотни тысяч событий; полную схему базы ядра (прибор читает только id, klass, istochnik, sozdano).
// EN: HERMETIC PROBE of bin/proverka-opory.mjs on a stand-in with a known answer (A-N-1589). The older harness did not
//     tell the B-N-1563/b/d changes apart. A temp stand-in (zstd session logs in the real v4 shape, a lessons file with
//     fenced and unfenced headings, a sha256 file, an SDK log, a settings file via DSH_PAMYAT_STOROZHA_CONF, one sqlite
//     base per case) is fed to the tool run as a subprocess, and each case is read from the tool's count lines.
//     DISTINGUISHING cases are those where the pre-B-N-1563 tool (1.1.46) gives a different outcome; CONTROL cases are
//     not. Codes: 0 all green · 1 red · 2 blindness.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const slepota = (p) => { console.log('СЛЕПОТА: ' + p); process.exit(2); };
const PRIBOR = process.env.STEND_OPORY_PRIBOR || join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'proverka-opory.mjs');
if (process.env.STEND_OPORY_PRIBOR) console.log('⚠️ ПОДМЕНА прибора: ' + PRIBOR);
if (!existsSync(PRIBOR)) slepota('прибора нет: ' + PRIBOR);
try { execFileSync('zstd', ['--version'], { stdio: 'ignore' }); } catch { slepota('внешнего zstd нет — подставу не сжать'); }

const kat = mkdtempSync(join(tmpdir(), 'stend-opory-1563-'));
process.on('exit', () => rmSync(kat, { recursive: true, force: true }));
const sessii = join(kat, 'sessii');
// RU: Журнал как в бою: строка-заголовок без seq, затем события. time — мс.
// EN: Log as in production: a header line without seq, then events. time is ms.
const T0 = 1759000000000;
function zhurnal(sessiya, imya, seqs, t0) {
  mkdirSync(join(sessii, sessiya), { recursive: true });
  const stroki = [JSON.stringify({ type: 'session', version: imya.includes('v4') ? 4 : 3, id: sessiya })]
    .concat(seqs.map((s, i) => JSON.stringify({ type: 'message', seq: s, time: t0 + i * 1000, data: {} })));
  execFileSync('zstd', ['-q', '-f', '-o', join(sessii, sessiya, imya)], { input: stroki.join('\n') + '\n' });
}
const ryad = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
zhurnal('s', 'session.jsonl.zstd', ryad(0, 10), T0);                     // только старый
zhurnal('v', 'session.v4.jsonl.zstd', ryad(0, 10), T0);                  // только v4 (сессия после DSH 0.2)
zhurnal('d', 'session.jsonl.zstd', ryad(100, 150), T0);                  // оба: старый — свои номера 100..150,
zhurnal('d', 'session.v4.jsonl.zstd', ryad(0, 60), T0 + 51 * 1000);      // v4 — плотные 0..60, позже старого
const DO_PEREHODA = T0 + 40 * 1000, POSLE = T0 + 200 * 1000;             // posled старого = T0 + 50 000

const uroki = join(kat, 'UROKI-PROBA.md');
writeFileSync(uroki, '# уроки\n### Урок про метки\nтекст\n### Урок про метки\nещё\n```\n### Урок про метки\n```\n');
const svid = join(kat, 'svidetel.txt'); writeFileSync(svid, 'свидетель ручной записи\n');
const sha = createHash('sha256').update('свидетель ручной записи\n').digest('hex');
const sdk = join(kat, 'sdk.jsonl');
const U1 = '11111111-2222-4333-8444-555555555555', U2 = '99999999-2222-4333-8444-555555555555';
writeFileSync(sdk, JSON.stringify({ type: 'user', uuid: U1 }) + '\n' + JSON.stringify({ type: 'assistant', uuid: 'aaaaaaaa-2222-4333-8444-555555555555' }) + '\n');
const konf = join(kat, 'storozha.conf');
writeFileSync(konf, `DSH_SESSII=${sessii}\n`);

function baza(imya, zapisi) {
  const put = join(kat, imya + '.db'); const db = new DatabaseSync(put);
  db.exec('CREATE TABLE zapisi (id INTEGER PRIMARY KEY, klass TEXT, istochnik TEXT, sozdano INTEGER)');
  const st = db.prepare('INSERT INTO zapisi (id, klass, istochnik, sozdano) VALUES (?, ?, ?, ?)');
  zapisi.forEach((z, i) => st.run(i + 1, 'urok', z.ist, z.sozdano ?? POSLE)); db.close(); return put;
}
function pribor(put) {
  const r = spawnSync(process.execPath, [PRIBOR, put], { encoding: 'utf8', env: { ...process.env, DSH_PAMYAT_STOROZHA_CONF: konf }, timeout: 60000 });
  return { kod: r.status, vyvod: (r.stdout ?? '') + (r.stderr ?? '') };
}
const chislo = (v, re) => { const m = re.exec(v); return m ? Number(m[1]) : 0; };
function iskhod(v) {
  const n = { 'сошлось': chislo(v, /опора на месте:\s+(\d+)/), 'утрачено': chislo(v, /опора УТРАЧЕНА:\s+(\d+)/),
              'нечем': chislo(v, /проверить нечем:\s+(\d+)/), 'форма': chislo(v, /негодная форма:\s+(\d+)/) };
  const est = Object.entries(n).filter(([, k]) => k === 1).map(([i]) => i);
  return est.length === 1 ? est[0] : 'не разобрано';
}
const KOD = { 'сошлось': 0, 'утрачено': 1, 'форма': 1, 'нечем': 2 };

// RU: Случаи. r — различающий (прибор до B-N-1563 даёт иной исход); пометка — что прибор 1.1.46 скажет.
// EN: Cases. r — distinguishing (the pre-B-N-1563 tool gives another outcome).
const sluchai = [
  { id: 'К1', ist: 's#1-3', zhdem: 'сошлось', r: false, chto: 'здоровая опора, старая форма' },
  { id: 'К2', ist: 's#500-502', zhdem: 'утрачено', r: false, chto: 'утраченная опора' },
  { id: 'К3', ist: 'net-takoj-sessii#1-2', zhdem: 'нечем', r: false, chto: 'журнала сессии нет' },
  { id: 'К4', ist: 'просто текст без формы', zhdem: 'форма', r: false, chto: 'неизвестная форма' },
  { id: 'К5', ist: 'd#120-122', sozdano: DO_PEREHODA, zhdem: 'сошлось', r: false, chto: 'оба журнала, запись ДО перехода → старый (в v4 таких номеров нет)' },
  { id: 'Р1', ist: 's#1-3#okno2', zhdem: 'сошлось', r: true, chto: 'хвост #oknoN (1.1.46: негодная форма)' },
  { id: 'Р2', ist: 's#5', zhdem: 'сошлось', r: true, chto: 'одно событие «сессия#N» (1.1.46: негодная форма)' },
  { id: 'Р3', ist: 'v#1-3', zhdem: 'сошлось', r: true, chto: 'только журнал v4 (1.1.46: нечем)' },
  { id: 'Р4', ist: 'd#55-57', sozdano: POSLE, zhdem: 'сошлось', r: true, chto: 'оба журнала, запись ПОСЛЕ перехода → v4 (1.1.46: утрачено по старому)' },
  { id: 'Р5', ist: `${uroki}:Урок про метки [2]`, zhdem: 'сошлось', r: true, chto: 'урок: заголовок 2 раза вне ограды (1.1.46: негодная форма)' },
  { id: 'Р6', ist: `${uroki}:Урок про метки [3]`, zhdem: 'утрачено', r: true, chto: 'урок: третий заголовок в ограде кода не считается (1.1.46: форма)' },
  { id: 'Р7', ist: `${svid} sha256:${sha.slice(0, 16)}`, zhdem: 'сошлось', r: true, chto: 'файл + sha256 сходится (1.1.46: форма)' },
  { id: 'Р8', ist: `${svid} sha256:deadbeefdeadbeef`, zhdem: 'утрачено', r: true, chto: 'файл + sha256 не сходится (1.1.46: форма)' },
  { id: 'Р9', ist: `${join(kat, 'net-fajla.txt')} sha256:${sha.slice(0, 16)}`, zhdem: 'утрачено', r: true, chto: 'файла свидетеля нет — утрачено, не слепота (1.1.46: форма)' },
  { id: 'Р10', ist: `SDK: ${sdk}#${U1}`, zhdem: 'сошлось', r: true, chto: 'SDK-журнал: uuid есть (1.1.46: форма)' },
  { id: 'Р11', ist: `SDK: ${sdk}#${U2}`, zhdem: 'утрачено', r: true, chto: 'SDK-журнал: uuid нет (1.1.46: форма)' },
];

let zel = 0, zelR = 0, vsegoR = 0, zelK = 0, vsegoK = 0;
const otmetit = (ok, r, stroka) => { if (ok) { zel++; r ? zelR++ : zelK++; } r ? vsegoR++ : vsegoK++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${stroka}`); };
const iskhody = {};
for (const s of sluchai) {
  const { kod, vyvod } = pribor(baza(s.id, [{ ist: s.ist, sozdano: s.sozdano }]));
  const ish = iskhod(vyvod); iskhody[s.id] = ish;
  if (ish === 'не разобрано' && ![0, 1, 2].includes(kod)) slepota(`${s.id}: прибор упал (код ${kod}): ${vyvod.split('\n').slice(0, 2).join(' | ').slice(0, 200)}`);
  const ok = ish === s.zhdem && kod === KOD[s.zhdem];
  otmetit(ok, s.r, `${s.id} ${s.r ? '[различающий]' : '[контроль]  '} ${s.chto}: получили «${ish}», код ${kod}; ждали «${s.zhdem}», код ${KOD[s.zhdem]}`);
}
// RU: Контроль зрячести: здоровая и утраченная опора обязаны разойтись — иначе прибор различает не то, а стенд слеп.
// EN: Sight control: healthy and lost anchors must differ — otherwise the harness is blind.
if (iskhody['К1'] === iskhody['К2']) slepota(`здоровая и утраченная опора дали один исход «${iskhody['К1']}» — прибор их не различает`);

// RU: Покрытие: все случаи одной базой — строка «проверено N из M» обязана сложиться (B-N-1563: прежде её не было).
// EN: Coverage: all cases in one base — the "checked N of M" line must add up (absent before B-N-1563).
{
  const vse = sluchai.map((s) => ({ ist: s.ist, sozdano: s.sozdano }));
  const proverennyh = sluchai.filter((s) => s.zhdem === 'сошлось' || s.zhdem === 'утрачено').length;
  const { vyvod } = pribor(baza('vse', vse));
  const m = /покрытие: проверено (\d+) из (\d+)/.exec(vyvod);
  const ok = !!m && Number(m[1]) === proverennyh && Number(m[2]) === sluchai.length;
  otmetit(ok, true, `Р12 [различающий] строка покрытия по ${sluchai.length} записям: получили «${m ? m[0] : 'строки нет'}»; ждали «покрытие: проверено ${proverennyh} из ${sluchai.length}»`);
}

console.log(`\nstend-opory-1563: зелёных ${zel} из ${vsegoR + vsegoK} · различающих (правила B-N-1563) зелёных ${zelR} из ${vsegoR} · контрольных зелёных ${zelK} из ${vsegoK}`);
process.exit(zel === vsegoR + vsegoK ? 0 : 1);
