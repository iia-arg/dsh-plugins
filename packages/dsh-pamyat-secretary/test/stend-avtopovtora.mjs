// RU: Проверяем src/avtopovtor.js; ПРЕДМЕТ задаёт другую редакцию модуля. Задания лежат во временном каталоге, заход, журнал, число записей и немедленный таймер подставные. Модель и ядро не вызываются. Коды: 0 — успех, 1 — расхождение, 2 — модуль отсутствует или не импортируется.
// EN: Test src/avtopovtor.js; ПРЕДМЕТ selects another module revision. Tasks use a temporary directory; the run, journal, write count, and immediate timer are fake. No model or core is called. Codes: 0 success, 1 mismatch, 2 module missing or not importable.
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PREDMET = process.env.PREDMET ?? new URL('../src/avtopovtor.js', import.meta.url).pathname;
let mod;
try { mod = await import(PREDMET); } catch (e) { console.log(`СЛЕПОТА: модуль ${PREDMET} не импортирован (${e?.message ?? e})`); process.exit(2); }
if (typeof mod.zaplanirovatAvtopovtor !== 'function') { console.log('СЛЕПОТА: zaplanirovatAvtopovtor нет'); process.exit(2); }

let soshlos = 0, rash = 0;
const proba = (imya, ok, chto) => { if (ok) { soshlos++; console.log(`✅ ${imya}`); } else { rash++; console.log(`❌ ${imya}: ${chto}`); } };

const SREZ = 'telegram-a2a#100-104', SEANS = 'telegram-a2a';
const sob = { type: 'compaction/summary', seq: 105, data: { shadowedSeqs: [100, 101, 102, 103, 104], shadowedTokenCount: 9000 } };
const zadanie = (kat, imya, extra = {}) => writeFileSync(join(kat, `zadanie-prervan-${imya}.txt`),
  JSON.stringify({ chto: 'povtorit-distillyaciyu-po-srezu', srez: SREZ, seansId: SEANS, pozvana: '2026-10-01T06:00:00.000Z', pid: 111, seqs: [100, 101, 102, 103, 104], ...extra }));

async function progon({ zadaniya = [], zapisano = () => 0, ishod = { ishod: 'ok', zapisano: 7 }, zhurnal = { sobytiya: [sob] },
                        metkaZhiva = () => false, vyklyuchena = () => null }) {
  const kat = mkdtempSync(join(tmpdir(), 'stend-avtopovtora-'));
  for (const [imya, extra] of zadaniya) zadanie(kat, imya, extra);
  const stroki = [], trevogi = [], zahody = [], zakryto = [], ozhidaniya = [];
  const zaplanirovano = mod.zaplanirovatAvtopovtor({
    kat, krik: (s) => stroki.push(s), zapisano,
    zapustit: async (s, d) => { zahody.push({ id: s.id, seqs: d?.shadowedSeqs }); return ishod; },
    chitat: () => zhurnal, zakryt: (srez, prichina) => zakryto.push({ srez, prichina }),
    metkaZhiva, vyklyuchena, trevoga: (t) => trevogi.push(t), pid: 222, zaderzhkaMs: 1,
    tajmer: (f) => { ozhidaniya.push(Promise.resolve().then(f)); },
  });
  for (let i = 0; i < 20 && ozhidaniya.length; i++) { const o = ozhidaniya.splice(0); await Promise.all(o); await new Promise((r) => setTimeout(r, 5)); }
  const faily = readdirSync(kat).sort().map((f) => ({ f, m: (() => { try { return JSON.parse(readFileSync(join(kat, f), 'utf8')); } catch { return null; } })() }));
  rmSync(kat, { recursive: true, force: true });
  return { stroki, trevogi, zahody, zakryto, faily, zaplanirovano };
}

// RU: Ноль записей, первая попытка и исход ok: повторяем по событию среза, закрываем задание и печатаем ПОЗВАНА/ЗАКОНЧЕНА.
// EN: Zero writes, first attempt, and ok outcome: retry from the slice event, close the task, and print ПОЗВАНА/ЗАКОНЧЕНА.
{ const r = await progon({ zadaniya: [['1-111', {}]] });
  proba('А1 записано 0 → заход ровно 1, по seqs среза', r.zahody.length === 1 && r.zahody[0].id === SEANS && r.zahody[0].seqs?.length === 5, JSON.stringify(r.zahody));
  proba('А1 задание закрыто по исходу ok', r.zakryto.length === 1 && /автоповтор выполнен: исход ok, записано 7/.test(r.zakryto[0].prichina), JSON.stringify(r.zakryto));
  proba('А1 строки «ПОВТОР … ПОЗВАНА» и «ЗАКОНЧЕНА — исход ok»', r.stroki.some((s) => s.startsWith(`ПОВТОР среза ${SREZ}: ПОЗВАНА`)) && r.stroki.some((s) => s.includes('ЗАКОНЧЕНА — исход ok')), r.stroki.join(' | '));
  proba('А1 счётчик попытки записан в задание до захода', r.faily.some((x) => x.m?.avtopovtor?.popytka === 1 && x.m.avtopovtor.pid === 222), JSON.stringify(r.faily.map((x) => x.m?.avtopovtor))); }
// RU: Если записано больше нуля, повтор запрещён во избежание дублей; печатается ПРОПУЩЕН.
// EN: If any records were written, skip retry to prevent duplicates and print ПРОПУЩЕН.
{ const r = await progon({ zadaniya: [['1-111', {}]], zapisano: () => 52 });
  proba('А2 записано 52 → заходов 0, строка «ПРОПУЩЕН — записано 52»', r.zahody.length === 0 && r.stroki.some((s) => s.includes('ПРОПУЩЕН — записано 52')), r.stroki.join(' | ')); }
// RU: Неизвестное число записей запрещает автоматический повтор.
// EN: An unknown write count prevents automatic retry.
{ const r = await progon({ zadaniya: [['1-111', {}]], zapisano: () => null });
  proba('А3 записано неизвестно → заходов 0', r.zahody.length === 0 && r.stroki.some((s) => s.includes('НЕ ИЗВЕСТНО')), r.stroki.join(' | ')); }
// RU: Второй обрыв того же среза при avtopovtor не запускает заход: одна тревога и пометка vtoroj_obryv.
// EN: A second interruption of the same slice with avtopovtor starts no run: one alert and the vtoroj_obryv mark.
{ const r = await progon({ zadaniya: [['1-111', { avtopovtor: { popytka: 1, nachat: 'x', pid: 111 } }], ['2-333', {}]] });
  proba('А4 второй обрыв → заходов 0, тревога 1', r.zahody.length === 0 && r.trevogi.length === 1, JSON.stringify({ z: r.zahody.length, t: r.trevogi }));
  proba('А4 новое задание помечено vtoroj_obryv', r.faily.some((x) => x.f.includes('2-333') && x.m?.avtopovtor?.vtoroj_obryv === true), JSON.stringify(r.faily.map((x) => [x.f, x.m?.avtopovtor]))); }
// RU: После второго обрыва следующий старт не создаёт ни заход, ни тревогу; цикл остановлен.
// EN: After a second interruption, another startup creates neither a run nor an alert; the cycle is stopped.
{ const r = await progon({ zadaniya: [['1-111', { avtopovtor: { popytka: 1 } }], ['2-333', { avtopovtor: { vtoroj_obryv: true } }]] });
  proba('А5 старт после второго обрыва → заходов 0, тревог 0', r.zahody.length === 0 && r.trevogi.length === 0, JSON.stringify({ z: r.zahody.length, t: r.trevogi.length })); }
// RU: Не-ok исход оставляет задание открытым, но расходует попытку.
// EN: A non-ok outcome leaves the task open but consumes the attempt.
{ const r = await progon({ zadaniya: [['1-111', {}]], ishod: { ishod: 'otkaz-zahoda' } });
  proba('А6 исход otkaz-zahoda → закрытий 0, строка «попытка израсходована»', r.zakryto.length === 0 && r.stroki.some((s) => s.includes('попытка израсходована')), r.stroki.join(' | ')); }
// RU: Занятый агент получает не более OTSROCHEK_MAKS отсрочек; затем ПРОПУЩЕН без захода.
// EN: A busy agent receives at most OTSROCHEK_MAKS deferrals; then report ПРОПУЩЕН without a run.
{ const r = await progon({ zadaniya: [['1-111', {}]], metkaZhiva: () => true });
  proba('А7 занят → отсрочек и «ПРОПУЩЕН — агент занят», заходов 0', r.zahody.length === 0 && r.stroki.some((s) => s.includes('агент занят')), r.stroki.join(' | ')); }
// RU: Нет события среза — отказ без захода и без расхода попытки.
// EN: A missing slice event rejects without a run or attempt consumption.
{ const r = await progon({ zadaniya: [['1-111', {}]], zhurnal: { sobytiya: [] } });
  proba('А8 нет compaction/summary → заходов 0, счётчик не записан', r.zahody.length === 0 && !r.faily.some((x) => x.m?.avtopovtor), JSON.stringify(r.faily.map((x) => x.m?.avtopovtor))); }
// RU: Выключенная дистилляция даёт ПРОПУЩЕН.
// EN: Disabled distillation gives ПРОПУЩЕН.
{ const r = await progon({ zadaniya: [['1-111', {}]], vyklyuchena: () => 'выключена файлом' });
  proba('А9 выключена → заходов 0', r.zahody.length === 0 && r.stroki.some((s) => s.includes('выключена файлом')), r.stroki.join(' | ')); }
// RU: Без заданий ничего не выполняется.
// EN: With no tasks, nothing runs.
{ const r = await progon({ zadaniya: [] });
  proba('А10 заданий нет → запланировано 0, заходов 0', r.zaplanirovano.length === 0 && r.zahody.length === 0, JSON.stringify(r.zaplanirovano)); }

console.log(`ИТОГ: сошлось ${soshlos}, расхождений ${rash}`);
process.exit(rash ? 1 : 0);
