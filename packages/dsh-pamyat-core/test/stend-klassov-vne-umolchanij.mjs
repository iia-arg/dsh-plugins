// RU: Класс из настройки вне KLASSY_ZNANIY_UMOLCHANIE должен громко называться при каждом apply, но не отвергаться. Горячую загрузку проверяем fiber.update(настройка) на настоящем Context: модуль тот же, apply повторяется. Используется локальный cordis пакета, а не экземпляр живой платформы.
// EN: A configured class outside KLASSY_ZNANIY_UMOLCHANIE must be reported on every apply without rejection. Test hot loading with fiber.update(config) on a real Context: the module remains and apply runs again. This uses the package’s local cordis, not the live platform’s instance.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let Context, apply, name, Config;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import('../src/index.js'));
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  process.exit(2)
}

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => {
  vsego++;
  try {
    const vernulos = await f();
    // RU: Любое возвращённое значение кроме undefined означает отказ синхронной пробы; возврат нельзя игнорировать.
    // EN: Any return value other than undefined fails the synchronous probe; do not ignore returns.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 180)); } };

const pauza = () => new Promise((r) => setTimeout(r, 50));
async function slushaya(f) {
  const kriki = []; const prezhnij = console.error;
  console.error = (...a) => kriki.push(a.join(' '));
  try { await f(); await pauza(); } finally { console.error = prezhnij; }
  return kriki.join('\n');
}
const VNE = /класс вне умолчаний: urk \(известные: reshenie, urok, vyvod, ogranichenie, oshibka, poryadok, nablyudenie, fakt\)/g;
const osnova = { putBazy: join(vremennyj(join(tmpdir(), 'klassy-vne-')), 'p.db'), agent: 'stend', otvechayushchegoNet: true };

const k = new Context();
let fiber;

await proba('умолчание (перечень не задан) → строки «вне умолчаний» нет', async () => {
  const t = await slushaya(() => { fiber = k.plugin({ name, Config, apply }, { ...osnova }); });
  if (!/подъём: база/.test(t)) throw new Error('ядро не поднялось: ' + t.slice(0, 160));
  if (/класс вне умолчаний/.test(t)) throw new Error('строка при умолчании: ' + t.slice(0, 160));
});

await proba('горячая смена с опечаткой «urk» → названа громко, с перечнем известных', async () => {
  const t = await slushaya(() => fiber.update({ ...osnova, klassyZnaniy: ['reshenie', 'urk'] }));
  if ((t.match(VNE) ?? []).length !== 1) throw new Error('строк «вне умолчаний: urk» не одна: ' + t.slice(0, 200));
  if (/класс вне умолчаний: reshenie/.test(t)) throw new Error('назван и известный класс');
});

await proba('класс НЕ отклонён: в строке подъёма перечень из настройки как есть', async () => {
  const t = await slushaya(() => fiber.update({ ...osnova, klassyZnaniy: ['reshenie', 'urk'] }));
  if (!/классы знаний в долговременную память: reshenie, urk \(настройка\)/.test(t)) throw new Error('перечень не тот: ' + t.slice(0, 200));
});

await proba('КАЖДЫЙ apply: при повторной горячей загрузке строка снова есть', async () => {
  const t = await slushaya(() => fiber.update({ ...osnova, klassyZnaniy: ['urk', 'fakt'] }));
  if ((t.match(VNE) ?? []).length !== 1) throw new Error('на повторе строки нет: ' + t.slice(0, 200));
});

await proba('возврат: перечень из известных классов → строки нет', async () => {
  const t = await slushaya(() => fiber.update({ ...osnova, klassyZnaniy: ['reshenie', 'urok'] }));
  if (/класс вне умолчаний/.test(t)) throw new Error('строка на известных: ' + t.slice(0, 160));
});

console.log(`\nИтог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
