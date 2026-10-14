// RU: СТЕНД НАСТРОЙКИ И РЕЗОЛВА: пути внешних команд и файла режима из файла настройки пакета; резолв пакета
//     платформы в marker-step в два шага (argv[1] → import.meta.url → отказ). Каждая проба — отдельный процесс node:
//     ключи читаются при загрузке модуля. Внешние команды не зовутся: проверяются значения и загрузка.
//     Коды: 0 — все пробы прошли; 1 — расхождение; 2 — слепота стенда.
// EN: SETTINGS AND RESOLUTION STAND: external command and mode file paths from the package settings file; two-step
//     resolution of the platform package in marker-step (argv[1] → import.meta.url → refusal). Each probe is a
//     separate node process: keys are read at module load. External commands are not called: values and loading
//     are checked. Codes: 0 — all probes passed; 1 — a divergence; 2 — stand blindness.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {createRequire} from 'node:module';
// RU: Предмет marker-step.mjs берёт @deepseek-ai/dsh-llm/message из установки платформы; нет её рядом — СЛЕПОТА стенда, код 2, а не трасса с кодом 1 (аудит A-N-1948 №5).
// EN: marker-step.mjs takes @deepseek-ai/dsh-llm/message from the platform installation; if it is absent here — stand BLINDNESS, exit 2, not a stack trace with exit 1.
try{createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm/message');}catch(e){console.log('СЛЕПОТА стенда: @deepseek-ai/dsh-llm/message не разрешается рядом со стендом (нужна установка платформы в node_modules) — '+String(e?.message??e).split('\n')[0].slice(0,160));process.exit(2);}

const zdes = dirname(fileURLToPath(import.meta.url));
const T = mkdtempSync(join(tmpdir(), 'stend-nastr-kd-'));
process.on('exit', () => { try { rmSync(T, { recursive: true, force: true }); } catch {} });
const KLYUCHI = ['KOMPAKT_AGENT_ALERT', 'KOMPAKT_AGENT_REGISTRY', 'KOMPAKT_JOURNALCTL', 'KOMPAKT_REZHIM_FAJL'];
const PRESHNIE = ['/usr/local/bin/agent-alert', '/usr/local/bin/agent-registry', '/usr/bin/journalctl', '/etc/dsh-pamyat/continuation-mode.json'];
const sreda = (konf) => { const e = { ...process.env, DSH_PAMYAT_KOMPAKT_DSH_CONF: konf }; for (const k of KLYUCHI) delete e[k]; return e; };
const zapusk = (kod, env, cwd = zdes) => spawnSync(process.execPath, ['--input-type=module', '-e', kod], { env, cwd, encoding: 'utf8', timeout: 60000 });
const putiIz = (modul) => `const m = await import(${JSON.stringify(pathToFileURL(modul).href)}); console.log(JSON.stringify([m.AGENT_ALERT, m.AGENT_REGISTRY, m.JOURNALCTL, m.MODE_FILE]));`;
const CM = join(zdes, 'continuation-mode.mjs');

let vsego = 0, bed = 0;
const proba = (imya, ok, pochemu) => { vsego++; if (ok) console.log('  ✅ ' + imya); else { bed++; console.log('  ❌ ' + imya + ' — ' + pochemu); } };
const polnyj = (r) => ((r.stdout || '') + (r.stderr || '')).replace(/\s+/g, ' ');
const vyvod = (r) => polnyj(r).slice(-220);

console.log('== настройка путей');
let r = zapusk(putiIz(CM), sreda(join(T, 'net.conf')));
if (r.status !== 0 && /ERR_MODULE_NOT_FOUND|Cannot find/.test(vyvod(r))) { console.log('СЛЕПОТА стенда: модуль не загрузился: ' + vyvod(r)); process.exit(2); }
proba('нет файла — прежние пути', r.status === 0 && r.stdout.trim() === JSON.stringify(PRESHNIE), 'код ' + r.status + ': ' + vyvod(r));

const SVOI = ['/x/alert', '/x/registry', '/x/journalctl', '/x/mode.json'];
writeFileSync(join(T, 'k.conf'), '# комментарий: KOMPAKT_AGENT_ALERT=не это\n' + KLYUCHI.map((k, i) => `${k} = ${SVOI[i]} \n`).join(''));
r = zapusk(putiIz(CM), sreda(join(T, 'k.conf')));
proba('ключи из файла доходят до модуля (4 из 4)', r.status === 0 && r.stdout.trim() === JSON.stringify(SVOI), 'код ' + r.status + ': ' + vyvod(r));

writeFileSync(join(T, 'reshetka.conf'), 'KOMPAKT_JOURNALCTL=/x/journalctl # пояснение\n');
r = zapusk(putiIz(CM), sreda(join(T, 'reshetka.conf')));
proba('« #» в значении — отказ загрузки с ключом', r.status !== 0 && /содержит « #»/.test(polnyj(r)) && /KOMPAKT_JOURNALCTL/.test(polnyj(r)), 'код ' + r.status + ': ' + vyvod(r));

writeFileSync(join(T, 'zakryt.conf'), 'KOMPAKT_AGENT_ALERT=/x/alert\n'); chmodSync(join(T, 'zakryt.conf'), 0o000);
r = zapusk(putiIz(CM), sreda(join(T, 'zakryt.conf')));
const podRootom = process.getuid?.() === 0;
proba('файл есть, но не читается — отказ с причиной', podRootom || (r.status !== 0 && /не читается/.test(polnyj(r))), 'код ' + r.status + ': ' + vyvod(r));

console.log('== резолв marker-step');
// argv[1] — не путь: прежде createRequire бросал и загрузка падала, теперь берётся import.meta.url.
const ms = pathToFileURL(join(zdes, 'marker-step.mjs')).href;
r = zapusk(`process.argv[1] = 'ne-put'; const m = await import(${JSON.stringify(ms)}); console.log(typeof m.installMarker);`, sreda(join(T, 'net.conf')));
proba('argv[1] не путь — загрузка через import.meta.url', r.status === 0 && r.stdout.trim() === 'function', 'код ' + r.status + ': ' + vyvod(r));
// Ни от зовущего, ни от модуля: копия модуля вне node_modules — громкий отказ с обеими причинами.
const odin = join(T, 'odin'); spawnSync('mkdir', ['-p', odin]);
for (const f of ['marker-step.mjs', 'continuation-mode.mjs']) copyFileSync(join(zdes, f), join(odin, f));
r = zapusk(`process.argv[1] = 'ne-put'; await import(${JSON.stringify(pathToFileURL(join(odin, 'marker-step.mjs')).href)});`, sreda(join(T, 'net.conf')), odin);
proba('не разрешается ни так, ни так — отказ с обеими причинами', r.status !== 0 && /ни от зовущего/.test(polnyj(r)) && /ни от модуля/.test(polnyj(r)), 'код ' + r.status + ': ' + vyvod(r));

console.log(`итог: ${vsego - bed} из ${vsego}`);
process.exit(bed ? 1 : 0);
