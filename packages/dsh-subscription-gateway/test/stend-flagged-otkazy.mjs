// RU: Стенд B-N-1620 (Искра): шлюз отличает отказ фильтра поставщика (flagged) от лимитов/401 и шлёт ОДИН сигнал «нужен /new»
//   на помеченную беседу — владельцу (agent-alert) и координатору (tell-komu). Функции вырезаются из gateway.mjs и гоняются в vm
//   с подставными execFile/os.tmpdir; настоящие agent-alert и tell-komu НЕ зовутся. Тексты отказов — дословно из журналов 04–05.10.
// RU: Коды: 0 — все пробы зелёные; 1 — есть красные; 2 — слепота (в gateway.mjs нет нужных функций/констант).
// EN: Stand for B-N-1620: content-filter refusal kinds and the single "/new needed" signal per flagged conversation.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import vm from 'node:vm';
import { extractFunction, extractConst } from './extract.mjs';
// Аудит №16 (1.4.57): текст тревоги в argv идёт через vychistit — вырезке нужна настоящая функция пакета.
import { vychistit } from '../secret-redact.mjs';

const GW = process.env.STEND_GATEWAY || new URL('../gateway.mjs', import.meta.url).pathname;
const src = fs.readFileSync(GW, 'utf8');
const nuzhno = ['vidOtkaza', 'otmetitOtkaz', 'otmetitFlag', 'signalNuzhenNew', 'sbrositOtkazy'];
let kod;
try { kod = nuzhno.map((n) => extractFunction(src, n)).join('\n'); extractConst(src, 'ADRESAT_NUZHEN_NEW'); extractConst(src, 'POROG_TREVOGI_OTKAZOV'); }
catch (e) { console.log(`СЛЕПОТА: ${e.message} (${GW})`); process.exit(2); }

const SESSION = "Claude Code returned an error result: API Error: Opus 5.5's safeguards flagged this session (https://www.anthropic.com/legal/aup). You may be seeing this for the first time";
const MESSAGE = "Claude Code returned an error result: API Error: Opus 5.5's safeguards flagged this message (https://www.anthropic.com/legal/aup).";
const CODEX = 'This content was flagged for possible cybersecurity risk. If this seems wrong, try rephrasing your request.';
const LIMIT = "Claude Code returned an error result: You've hit your session limit · resets 3pm";
const AUTH = 'Codex: unexpected status 401 Unauthorized';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-flagged-'));
function nov({ tellOk = true, agent = 'marc' } = {}) {
  const c = { log: (s) => c.L.push(String(s)), L: [], vyzovy: [], pisma: [],
    execFile: (bin, args, opt, cb) => {
      c.vyzovy.push({ bin, arg: args[0] });
      if (bin.endsWith('tell-komu')) { c.pisma.push({ imya: path.basename(args[0]), tekst: fs.readFileSync(args[0], 'utf8') }); }
      const err = bin.endsWith('tell-komu') && !tellOk ? Object.assign(new Error('rc=3'), { code: 3 }) : null;
      cb(err, '', err ? 'tell-komu: щель не включена в перечень' : '');
    },
    fs, path, os: { tmpdir: () => tmp }, String, RegExp, Object, vychistit,
    PORT: 9999, PUT_BAZY_SESSIJ: '/var/lib/fixture/sessii.db', PAMYAT_AGENT: agent,
    OTKAZY_PODRYAD: new Map(), FLAG_PODRYAD: new Map() };
  vm.createContext(c);
  vm.runInContext(`const POROG_TREVOGI_OTKAZOV = ${extractConst(src, 'POROG_TREVOGI_OTKAZOV')}; const ADRESAT_NUZHEN_NEW = ${extractConst(src, 'ADRESAT_NUZHEN_NEW')};\n${kod}\n`
    + 'this.vidOtkaza=vidOtkaza;this.otmetitOtkaz=otmetitOtkaz;this.sbrositOtkazy=sbrositOtkazy;', c);
  return c;
}
const alerty = (c) => c.vyzovy.filter((v) => v.bin.endsWith('agent-alert'));
const tell = (c) => c.vyzovy.filter((v) => v.bin.endsWith('tell-komu'));
const newAlerty = (c) => alerty(c).filter((v) => v.arg.includes('нужен /new'));

let ok = 0, bed = 0;
const sud = (imya, uslovie, pochemu = '') => { if (uslovie) { ok++; console.log(`  ✅ ${imya}`); } else { bed++; console.log(`  🔴 ${imya} — ${pochemu}`); } };

{ const c = nov(); const v = [SESSION, MESSAGE, CODEX, LIMIT, AUTH].map((m) => c.vidOtkaza(m));
  sud('F1 вид: session/message/codex — свои, лимит и 401 — null', JSON.stringify(v) === JSON.stringify(['flag-session', 'flag-message', 'flag-codex', null, null]), JSON.stringify(v)); }
{ const c = nov(); for (let i = 0; i < 6; i++) c.otmetitOtkaz('af0e2941-marc', CODEX);
  sud('F2 Марк: 6 codex-флагов подряд → ровно 1 «нужен /new» владельцу и 1 письмо, общая тревога на 3-м НЕ дублируется',
    newAlerty(c).length === 1 && alerty(c).length === 1 && tell(c).length === 1 && c.L.some((s) => s.includes('общую тревогу не дублирую')),
    `alert ${alerty(c).length} (new ${newAlerty(c).length}), tell ${tell(c).length}`);
  const p = c.pisma[0] || { imya: '', tekst: '' };
  sud('F9 письмо: имя dlya-zabavy-…, в тексте «нужен /new marc (беседа af0e2941, причина flagged flag-codex», текста поставщика нет; временный файл убран',
    p.imya.startsWith('dlya-zabavy-') && p.tekst.includes('нужен /new marc (беседа af0e2941, причина flagged flag-codex') && !/cybersecurity/i.test(p.tekst)
    && !fs.readdirSync(tmp).length, `${p.imya} | ${p.tekst.slice(0, 120)} | в tmp ${fs.readdirSync(tmp).length}`); }
{ const c = nov({ agent: 'zarya' }); c.otmetitOtkaz('v2:a72da', SESSION);
  sud('F3 Заря: 1 «this session» → сигнал сразу (1 + 1)', newAlerty(c).length === 1 && tell(c).length === 1, `new ${newAlerty(c).length}, tell ${tell(c).length}`); }
{ const c = nov({ agent: 'iskra' }); c.otmetitOtkaz('f099ac4a', MESSAGE); c.sbrositOtkazy('f099ac4a');
  sud('F4 Искра: 1 «this message», затем удачный ход → сигнала нет, счёт снят', alerty(c).length === 0 && tell(c).length === 0 && !c.FLAG_PODRYAD.size && !c.OTKAZY_PODRYAD.size,
    `alert ${alerty(c).length}, flag ${c.FLAG_PODRYAD.size}`); }
{ const c = nov(); c.otmetitOtkaz('b', MESSAGE); c.otmetitOtkaz('b', MESSAGE);
  sud('F5 «this message» ×2 подряд → сигнал', newAlerty(c).length === 1, `new ${newAlerty(c).length}`); }
{ const c = nov(); c.otmetitOtkaz('c', CODEX); c.otmetitOtkaz('c', LIMIT); c.otmetitOtkaz('c', CODEX);
  sud('F6 codex, лимит, codex — серия порвана → сигнала «нужен /new» нет (общая тревога на 3-м — прежняя)', newAlerty(c).length === 0 && alerty(c).length === 1,
    `new ${newAlerty(c).length}, alert ${alerty(c).length}`); }
{ const c = nov(); c.otmetitOtkaz('d', CODEX); c.otmetitOtkaz('d', CODEX); c.sbrositOtkazy('d'); c.otmetitOtkaz('d', CODEX); c.otmetitOtkaz('d', CODEX);
  sud('F7 сигнал → удачный ход → снова 2 флага → второй сигнал (повтор только после удачи)', newAlerty(c).length === 2 && tell(c).length === 2, `new ${newAlerty(c).length}`); }
{ const c = nov(); for (let i = 0; i < 3; i++) c.otmetitOtkaz('e', LIMIT);
  sud('F8 лимит ×3 → прежняя общая тревога на 3-м, письма нет', alerty(c).length === 1 && newAlerty(c).length === 0 && tell(c).length === 0, `alert ${alerty(c).length}, tell ${tell(c).length}`); }
{ const c = nov({ tellOk: false }); c.otmetitOtkaz('f', SESSION);
  sud('F10 tell-komu отказал → «НЕ положено» в журнале, владелец сигнал получил, временный файл убран',
    newAlerty(c).length === 1 && c.L.some((s) => s.includes('координатору НЕ положено')) && !fs.readdirSync(tmp).length, c.L.slice(-1)[0]); }
{ const c = nov(); c.otmetitOtkaz('g1', SESSION); c.otmetitOtkaz('g2', SESSION);
  sud('F11 две беседы → два сигнала', newAlerty(c).length === 2 && tell(c).length === 2, `new ${newAlerty(c).length}`); }
{ const c = nov(); c.otmetitOtkaz(null, SESSION); c.otmetitOtkaz('', CODEX);
  sud('F12 без ключа беседы → ничего', c.vyzovy.length === 0, `вызовов ${c.vyzovy.length}`); }

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nИТОГ: зелёных ${ok}, красных ${bed} (предмет ${GW})`);
const ZHDYOM = 12;
if (ok + bed !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${ok + bed}, ждём ${ZHDYOM}`); process.exit(2); }
process.exit(bed ? 1 : 0);
