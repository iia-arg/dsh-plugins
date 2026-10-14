// Стенд B-N-1776 такт 2: rate_limit_event SDK → приёмная dsh-limity. Функции strokiLimita/zapisatLimit вынимаются из
// gateway.mjs (STEND_GATEWAY, по умолчанию ../gateway.mjs) и гоняются в vm на временном каталоге; вход — НАСТОЯЩЕЕ событие
// пробы А 07.10 (fixtures/rate-limit-event-proba-a.json). Сети нет, токена нет. Код: 0 — все пробы, 1 — красная, 2 — слепота.
// ЧЕГО НЕ ЛОВИТ: приём строки службой dsh-limity (её проверка godnaya — стенд такта 2 у службы) · живой ход SDK.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { extractFunction } from './extract.mjs';
const zdes = path.dirname(fileURLToPath(import.meta.url));
const G = process.env.STEND_GATEWAY || path.join(zdes, '..', 'gateway.mjs');
let src, kod;
try { src = fs.readFileSync(G, 'utf8'); kod = ['strokiLimita', 'zapisatLimit'].map((n) => extractFunction(src, n)).join('\n'); }
catch (e) { console.log(`СЛЕПОТА: ${G}: ${e.message}`); process.exit(2); }
const sobytie = JSON.parse(fs.readFileSync(path.join(zdes, 'fixtures', 'rate-limit-event-proba-a.json'), 'utf8'));
let proshlo = 0, vsego = 0;
const proba = (imya, ok, vyvod) => { vsego++; if (ok) { proshlo++; console.log('  ✅ ' + imya); } else console.log('  ❌ ' + imya + ' | ' + JSON.stringify(vyvod).slice(0, 400)); };
function progon(info, { tokenFile = '/etc/claude-oauth/token-podpiska-2', vhod = 'sozdat' } = {}) {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-limity-'));
  const v = vhod === 'sozdat' ? path.join(kat, 'vhod') : vhod;
  if (vhod === 'sozdat') fs.mkdirSync(v);
  const zhurnal = [];
  const ctx = vm.createContext({ fs, path, os, Date, JSON, Math, Number, Map, process, log: (m) => zhurnal.push(m), TOKEN_FILE: tokenFile, LIMITY_VHOD: v });
  let oshibka = null;
  try { vm.runInContext(`let limitySchet = 0;\n${kod}\nzapisatLimit(${JSON.stringify(info)});`, ctx); } catch (e) { oshibka = String(e?.message ?? e); }
  const fajly = vhod === 'sozdat' ? fs.readdirSync(v) : [];
  const stroki = fajly.filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(v, f), 'utf8')));
  const rezhimy = fajly.filter((f) => f.endsWith('.json')).map((f) => (fs.statSync(path.join(v, f)).mode & 0o777).toString(8));
  fs.rmSync(kat, { recursive: true, force: true });
  return { zhurnal, fajly, stroki, rezhimy, oshibka };
}
const po = (r, okno) => r.stroki.find((s) => s.okno === okno);
const KLYUCHI = 'dolya,istochnik,izmereno,moment_utc,okno,otkuda,podpiska,prichina,provajder,sbros_utc,status';
console.log('предмет: ' + G);
let r = progon(sobytie.rate_limit_info);
proba('событие пробы А → 2 файла: five_hour 0.33 (status null), seven_day 0.37 allowed_warning; сбросы — секунды; .tmp не осталось',
  r.stroki.length === 2 && r.fajly.every((f) => !f.endsWith('.tmp')) && po(r, 'five_hour')?.dolya === 0.33 && po(r, 'five_hour')?.status === null
  && po(r, 'five_hour')?.sbros_utc === 1791406800 && po(r, 'seven_day')?.dolya === 0.37 && po(r, 'seven_day')?.status === 'allowed_warning', r);
proba('строка — ровно 11 полей приёмной, provajder claude, podpiska 2, istochnik sdk_event, otkuda gateway@<учётка>, файлы 0640',
  r.stroki.every((s) => Object.keys(s).sort().join() === KLYUCHI && s.provajder === 'claude' && s.podpiska === 2 && s.izmereno === 1
    && s.istochnik === 'sdk_event' && /^gateway@[a-z0-9_-]+$/.test(s.otkuda)) && r.rezhimy.every((m) => m === '640'), r);
proba('в файлах нет ни uuid/session_id события, ни токеноподобного текста', !/session|uuid|sk-ant|eyJ/.test(JSON.stringify(r.stroki)), r.stroki);
proba('журнал: одна строка «лимиты: подписка 2 · five_hour 33% · seven_day 37% allowed_warning → приёмная»',
  r.zhurnal.length === 1 && r.zhurnal[0] === 'лимиты: подписка 2 · five_hour 33% · seven_day 37% allowed_warning → приёмная', r.zhurnal);
r = progon({ status: 'rejected', rateLimitType: 'five_hour', utilization: 1, resetsAt: 1791406800 });
proba('без unifiedWindows: одно окно из rateLimitType, status rejected', r.stroki.length === 1 && po(r, 'five_hour')?.status === 'rejected', r);
r = progon({ ...sobytie.rate_limit_info, unifiedWindows: { five_hour: { utilization: 33, resetsAt: 1791406800 } }, utilization: 37 });
proba('доля в процентах (33/37) → НЕ пишется, журнал «нет доли 0..1.5»', r.stroki.length === 0 && /нет доли/.test(r.zhurnal[0] ?? ''), r);
r = progon(sobytie.rate_limit_info, { tokenFile: '/run/credentials/claude-oauth-gateway@varvara.service/token' });
proba('файл токена без номера подписки → 0 файлов, журнал «номер подписки не выведен»', r.fajly.length === 0 && /номер подписки не выведен/.test(r.zhurnal[0] ?? ''), r);
r = progon(sobytie.rate_limit_info, { vhod: '/nonexistent/dsh-limity-vhod' });
proba('нет приёмной → исключения нет, журнал «🔴 замер НЕ записан … ENOENT»', r.oshibka === null && /🔴 замер НЕ записан .* ENOENT/.test(r.zhurnal[0] ?? ''), r);
r = progon(sobytie.rate_limit_info, { vhod: '' });
proba('GATEWAY_LIMITY_VHOD пустая → выключено: ни файлов, ни журнала', r.zhurnal.length === 0 && r.oshibka === null, r);
r = progon(undefined);
proba('событие без rate_limit_info → журнал, без исключения', r.oshibka === null && /без rate_limit_info/.test(r.zhurnal[0] ?? ''), r);
proba('точка вызова: в цикле сообщений SDK строка «if (m.type === \'rate_limit_event\') zapisatLimit(m.rate_limit_info);»',
  src.split("if (m.type === 'rate_limit_event') zapisatLimit(m.rate_limit_info);").length === 2
  && src.indexOf('zapisatLimit(m.rate_limit_info)') > src.indexOf('for await (const m of iter)'), 'нет строки вызова');
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
