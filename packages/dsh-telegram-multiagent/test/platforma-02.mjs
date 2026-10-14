// RU: Изолированный стенд platforma-02.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness platforma-02.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { testPlatform } from './test-platform.mjs';
import { existsSync, mkdtempSync, rmSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ustanovitIstochnikPomoshchnika } from '../src/message-receipts.js';


async function pomoshchnikYadra() {
  const zdes = fileURLToPath(new URL('.', import.meta.url));
  const yadro = [join(zdes, '..', '..', 'dsh-pamyat-core', 'src', 'index.js'), join(zdes, '..', '..', 'node_modules', 'dsh-pamyat-core', 'src', 'index.js')].find(existsSync);
  if (!yadro) { console.error('СЛЕПОТА: соседнего ядра нет ни в дереве, ни в боевой раскладке'); process.exit(2); }
  const { apply } = await import(pathToFileURL(yadro).href);
  const kat = mkdtempSync(join(tmpdir(), 'platforma02-yadro-')); process.on('exit', () => rmSync(kat, { recursive: true, force: true }));
  const s = {}; apply({ provide(i, o) { s[i] = o; }, on() {}, logger: { error() {} } }, { putBazy: join(kat, 's.db'), agent: 'stend' });
  if (typeof s.pamyat?.sobytiyaSessii !== 'function') { console.error('СЛЕПОТА: в соседнем ядре нет помощника событий'); process.exit(2); }
  return s.pamyat;
}
const IMENA = ['cordis', 'dsh-session', 'dsh-session-persistence-jsonl', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-llm', 'dsh-agent', 'dsh-agent-loop'];
export async function podnyatPlatformu02({ root }) {


  const koren = resolve(String(root ?? '')), vrem = resolve(tmpdir());
  if (!root || /(^|\/)\.dsh(\/|$)/.test(koren) || koren.startsWith('/opt/') || !koren.startsWith(vrem + sep)) {
    console.error(`ОТКАЗ: корень сессий стенда «${koren}» не под ${vrem} (или в .dsh / под /opt) — в живые дома стенд не пишет`); process.exit(2);
  }
  const p = await testPlatform(IMENA);
  const ctx = new p['cordis'].Context();
  ctx.plugin(p['dsh-session'].default);
  ctx.plugin(p['dsh-session-persistence-jsonl'].default, { root, compression: 'none' });
  for (const n of ['dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-llm', 'dsh-agent', 'dsh-agent-loop']) ctx.plugin(p[n].default);
  for (let i = 0; i < 1000 && !(ctx.get('agents') && ctx.get('sessionPersistence') && ctx.get('sessionProjections')); i++) await new Promise((r) => setTimeout(r, 5));
  const agents = ctx.get('agents'), sessions = ctx.get('sessions'), backend = ctx.get('sessionPersistence');
  if (!agents || !sessions || !backend) {
    console.error('СЛЕПОТА: платформа 0.2 не подняла службы (agents/sessions/sessionPersistence)'); process.exit(2);
  }
  const pm = await pomoshchnikYadra(); ustanovitIstochnikPomoshchnika(() => pm);
  const sozdatAgenta = async (sessionId) => (await agents.create({ sessionId })).agent;
  return { ctx, agents, sessions, backend, sozdatAgenta, llm: p['dsh-llm'] };
}
