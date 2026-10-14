// RU: B-N-1630: предел расшифровки голосового. Настоящий transcribeVoice из src/index.js (extractFunction) в vm с настоящим
//     execFileSync (обёртка пишет переданный timeout) и заглушкой-транскрайбером на node (спит ZAGLUSHKA_MS, печатает текст).
//     Быстрый режим: предел по умолчанию 300000 (ключ не задан и неположительный); заданный предел: короче — текст, дольше — null
//     и строка журнала с длительностью звука и пределом. STEND_SEKUNDY=1 — настоящие секунды при умолчании: 130 с → текст, 310 с → ошибка.
//     B-N-1634: 6 — во время расшифровки таймер процесса тикает (процесс не замирает); 7 — после предела у обёртки на bash не остаётся
//     внука-sleep (группа процессов погашена); 8 — потомок, ушедший из группы и держащий stdout, не держит возврат дольше предел+10 с. Предел пишется из execFileSync(timeout) или первого setTimeout функции — код r2 и r3 оба.
// EN: B-N-1630 harness for the voice transcription limit on the real transcribeVoice; STEND_SEKUNDY=1 runs real 130 s / 310 s cases.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import vm from 'node:vm';
import { execFileSync, spawn } from 'node:child_process';
import { VoiceTempStore } from '../src/voice-temp.js';
import { extractFunction } from './extract.mjs';
const source = fs.readFileSync(process.env.STEND_INDEX ? path.resolve(process.env.STEND_INDEX) : new URL('../src/index.js', import.meta.url), 'utf8');
let fn;
try { fn = extractFunction(source, 'transcribeVoice'); } catch { console.log('СЛЕПОТА: transcribeVoice не найдена в src/index.js'); process.exit(2); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-transcribe-predel-'));
const zaglushka = path.join(root, 'transcribe-zaglushka.mjs');
fs.writeFileSync(zaglushka, "#!/usr/bin/env node\nsetTimeout(() => process.stdout.write('расшифровка заглушки\\n'), Number(process.env.ZAGLUSHKA_MS));\n", { mode: 0o755 });
let ok = 0, fail = 0;
const proba = async (imya, f) => { try { await f(); ok++; console.log('  ✅ ' + imya); } catch (e) { fail++; console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).split('\n')[0].slice(0, 200)); } };
const zapusk = async (config, spit, dlitelnost) => {
  const zhurnal = [], predely = [];
  let audio;
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace, {recursive: true});
  const voiceTemp = new VoiceTempStore({workspace, baseDirectory: root, log: s => zhurnal.push(s)});
  const context = { config: { transcribeCommand: zaglushka, ...config }, log: s => zhurnal.push(s), fs, voiceTemp, downloadTelegramFile: async (_id, directory) => { audio = path.join(directory, 'audio.ogg'); fs.writeFileSync(audio, 'x', {mode: 0o600}); return audio; }, process,
    execFileSync: (c, a, o) => { predely.push(o?.timeout); return execFileSync(c, a, o); }, spawn,
    setTimeout: (f, ms) => { if (!predely.length) predely.push(ms); return setTimeout(f, ms); }, clearTimeout };
  process.env.ZAGLUSHKA_MS = String(spit);
  const t0 = Date.now();
  const tekst = await vm.runInNewContext('(' + fn + ')', context)('file-id', dlitelnost, 'fixture-chat');
  return { tekst, zhurnal, predely, ms: Date.now() - t0, audioUbran: !fs.existsSync(audio) };
};
try {
  console.log('стенд предела расшифровки (B-N-1630)' + (process.env.STEND_SEKUNDY === '1' ? ' — НАСТОЯЩИЕ СЕКУНДЫ' : ''));
  if (process.env.STEND_SEKUNDY === '1') {
    await proba('С1 умолчание, заглушка 130 с (дольше прежних 120) → текст', async () => {
      const r = await zapusk({}, 130_000, 323); assert.equal(r.tekst, 'расшифровка заглушки'); assert.deepEqual(r.predely, [300000]);
      console.log(`     заняло ${Math.round(r.ms / 1000)} с`);
    });
    await proba('С2 умолчание, заглушка 310 с (дольше 300) → null, журнал: «предел исчерпан», звук 647 с, предел 300 с, ETIMEDOUT', async () => {
      const r = await zapusk({}, 310_000, 647); assert.equal(r.tekst, null); const z = r.zhurnal.join('\n');
      for (const s of ['(предел исчерпан)', 'звук 647 с', 'предел 300 с', 'ETIMEDOUT']) assert.ok(z.includes(s), 'нет «' + s + '» в: ' + z.slice(0, 160));
      console.log(`     заняло ${Math.round(r.ms / 1000)} с; журнал: ${z.slice(0, 120)}`);
    });
  } else {
    await proba('1 ключ не задан → в execFileSync уходит 300000; быстрый ответ → текст; аудио убрано', async () => {
      const r = await zapusk({}, 10, 5); assert.deepEqual(r.predely, [300000]); assert.equal(r.tekst, 'расшифровка заглушки'); assert.ok(r.audioUbran);
    });
    await proba('2 неположительный и нечисловой ключ → 300000', async () => {
      for (const v of [0, -5, 'abc']) { const r = await zapusk({ transcribeTimeoutMs: v }, 10, 5); assert.deepEqual(r.predely, [300000], 'для ' + v); }
    });
    await proba('3 заданный предел 1500, заглушка 300 мс → текст, предел 1500 передан', async () => {
      const r = await zapusk({ transcribeTimeoutMs: 1500 }, 300, 5); assert.deepEqual(r.predely, [1500]); assert.equal(r.tekst, 'расшифровка заглушки');
    });
    await proba('4 заданный предел 1500, заглушка 3 с → null, журнал: «предел исчерпан», звук 323 с, предел 1.5 с, ETIMEDOUT; аудио убрано', async () => {
      const r = await zapusk({ transcribeTimeoutMs: 1500 }, 3000, 323); assert.equal(r.tekst, null); assert.ok(r.audioUbran); const z = r.zhurnal.join('\n');
      for (const s of ['(предел исчерпан)', 'звук 323 с', 'предел 1.5 с', 'ETIMEDOUT']) assert.ok(z.includes(s), 'нет «' + s + '» в: ' + z.slice(0, 160));
      assert.ok(r.ms < 2900, 'ждали ' + r.ms + ' мс — предел не сработал');
    });
    await proba('6 во время расшифровки (заглушка 1,5 с, предел 5 с) таймер процесса тикает — процесс не замирает', async () => {
      let tiki = 0; const iv = setInterval(() => tiki++, 50);
      try { const r = await zapusk({ transcribeTimeoutMs: 5000 }, 1500, 5); assert.equal(r.tekst, 'расшифровка заглушки'); assert.ok(tiki >= 10, 'тиков ' + tiki + ' за ' + r.ms + ' мс'); }
      finally { clearInterval(iv); }
    });
    await proba('7 обёртка на bash с внуком-sleep, предел 1500 → null, и через 500 мс внуков 0 (группа погашена)', async () => {
      const metka = '37.' + process.pid + String(Date.now() % 100000);
      const obertka = path.join(root, 'obertka.sh'); fs.writeFileSync(obertka, '#!/bin/bash\nsleep ' + metka + '\necho поздно\n', { mode: 0o755 });
      const r = await zapusk({ transcribeCommand: obertka, transcribeTimeoutMs: 1500 }, 0, 9); assert.equal(r.tekst, null);
      assert.ok(r.ms < 4000, 'вернулось через ' + r.ms + ' мс — группа не погашена по пределу, дождались естественного конца');
      await new Promise(res => setTimeout(res, 500));
      let siroty = [];
      try { siroty = execFileSync('pgrep', ['-f', 'sleep ' + metka], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number); } catch (e) { if (e.status !== 1) throw e; }
      for (const pid of siroty) try { process.kill(pid, 'SIGKILL'); } catch {}
      assert.equal(siroty.length, 0, 'сирот-внуков ' + siroty.length + ' (pid ' + siroty.join(',') + ', погашены стендом по pid)');
    });
    await proba('8 потомок ушёл из группы (setsid sleep &) и держит stdout, предел 1500 → null не позже предел+10 с (жёсткий потолок)', async () => {
      const metka = '600.' + process.pid + String(Date.now() % 100000);
      const obertka = path.join(root, 'obertka-setsid.sh'); fs.writeFileSync(obertka, '#!/bin/bash\nsetsid sleep ' + metka + ' &\nsleep 60\n', { mode: 0o755 });
      const begletsy = () => { try { return execFileSync('pgrep', ['-f', 'sleep ' + metka], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number); } catch (e) { if (e.status === 1) return []; throw e; } };
      try {
        const r = await Promise.race([zapusk({ transcribeCommand: obertka, transcribeTimeoutMs: 1500 }, 0, 9), new Promise(res => setTimeout(() => res(null), 20000))]);
        assert.ok(r, 'за 20 с не вернулось — висит, пока жив беглец (' + begletsy().length + ' процесс(ов) с меткой)');
        assert.equal(r.tekst, null); assert.ok(r.ms < 13000, 'вернулось через ' + r.ms + ' мс'); console.log('     вернулось через ' + r.ms + ' мс');
        assert.ok(r.zhurnal.join('\n').includes('предел исчерпан'), r.zhurnal.join(' ').slice(0, 160));
      } finally { for (const pid of begletsy()) try { process.kill(pid, 'SIGKILL'); } catch {} }
    });
    await proba('5 длительность неизвестна → «звук ? с»; отказ не по пределу — без «предел исчерпан»', async () => {
      const r = await zapusk({ transcribeCommand: path.join(root, 'net-takogo') }, 10, undefined); assert.equal(r.tekst, null); const z = r.zhurnal.join('\n');
      assert.ok(z.includes('звук ? с'), z.slice(0, 160)); assert.ok(!z.includes('предел исчерпан'), z.slice(0, 160));
    });
  }
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`итог: ok=${ok} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
