// RU: Проверяем состояния доверия, порядок правил, снятие отмены и ночной счёт на настоящем хранилище с временной базой. События создаём через zapisat, ustanovitOtnoshenie, podtverdit и otmetitProverku; читаем prochitat → prilozhitOtnosheniya. Негодную отметку и снятие отмены задаём SQL: штатный договор не снимает отношения.
// EN: Test trust states, rule order, revocation removal, and nightly counting using real storage and a temporary database. Create events with zapisat, ustanovitOtnoshenie, podtverdit, and otmetitProverku; read through prochitat → prilozhitOtnosheniya. Set an invalid mark and remove revocation via SQL: the normal contract does not remove relations.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let core, doverie, DatabaseSync;
try {
  core = await import('../src/hranilishche.js');
  doverie = await import('../src/doverie.js');
  ({ DatabaseSync } = await import('node:sqlite'));
} catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v && typeof v.then === 'function') throw new Error('тело ОЖИДАЮЩЕЕ — прогонщик синхронный');
    if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ');
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const A = 'stend', KL = ['reshenie', 'urok', 'vyvod', 'ogranichenie', 'oshibka', 'poryadok', 'nablyudenie', 'fakt'];
const put = join(vremennyj(join(tmpdir(), 'doverie-')), 'p.db');
const h = core.otkrytHranilishche(put);
const zap = (soderzhim, o = {}) => h.zapisat({ agent: A, klass: 'reshenie', soderzhim, ...o });
const otn = (id, vid, k) => h.ustanovitOtnoshenie({ agent: A, id, vid, k, klassyZnaniy: KL });
const sost = (id) => h.prochitat({ agent: A, skolko: 1000 }).find((r) => Number(r.id) === Number(id))?.doverie;
const ozhid = (id, s, kusok) => {
  const d = sost(id);
  if (!d) throw new Error('у записи #' + id + ' нет поля doverie — ядро его не приложило');
  if (d.sostoyanie !== s) throw new Error('#' + id + ': ждали «' + s + '», получили «' + d.sostoyanie + '» (' + d.stroka + ')');
  if (kusok && !d.stroka.includes(kusok)) throw new Error('#' + id + ': в строке нет «' + kusok + '»: ' + d.stroka);
};

const z1 = zap('обычная запись');
const z2 = zap('без подтверждения', { bezPodtverzhdeniya: true });
const z3 = zap('подтверждённая', { bezPodtverzhdeniya: true });
const z4 = zap('подтверждённая, затем опровергнутая', { bezPodtverzhdeniya: true });
const z5 = zap('опровергнутая');
const z6 = zap('уточнённая');
const z7 = zap('отменённая');
const z8 = zap('уточнённая И отменённая');
const z9 = zap('с негодной отметкой');
h.podtverdit({ id: z3, kem: 'chelovek:stend' });
h.podtverdit({ id: z4, kem: 'chelovek:stend' });
h.otmetitProverku({ id: z4, ishod: 'utrachena', chem: 'stend-sverka' });
h.otmetitProverku({ id: z5, ishod: 'utrachena', chem: 'stend-sverka' });
const u6 = zap('уточняет #6'); otn(u6, 'utochnyaet', z6);
const o7 = zap('отменяет #7'); otn(o7, 'otmenyaet', z7);
const u8 = zap('уточняет #8'); otn(u8, 'utochnyaet', z8);
const o8 = zap('отменяет #8'); otn(o8, 'otmenyaet', z8);
h.baza.prepare('UPDATE zapisi SET proverka = ? WHERE id = ?').run('{битая', z9);

proba('стенд годен: выдача prochitat прикладывает doverie к каждой записи', () => {
  const v = h.prochitat({ agent: A, skolko: 1000 });
  if (!v.length || v.some((r) => !r.doverie || !doverie.SOSTOYANIYA.includes(r.doverie.sostoyanie))) throw new Error('не у всех');
});
proba('ОБЫЧНАЯ — событий нет', () => ozhid(z1, 'obychnaya', 'событий доверия нет'));
proba('БЕЗ ПОДТВЕРЖДЕНИЯ', () => ozhid(z2, 'bez-podtverzhdeniya', 'без подтверждения'));
proba('ПОДТВЕРЖДЕНА — с «кем»', () => ozhid(z3, 'podtverzhdena', 'chelovek:stend'));
proba('ОПРОВЕРГНУТА — опора утрачена, с прибором', () => ozhid(z5, 'oprovergnuta', 'stend-sverka'));
proba('ПОРЯДОК: подтверждённая, затем опровергнутая → ОПРОВЕРГНУТА', () => ozhid(z4, 'oprovergnuta', 'опровергнута'));
proba('УТОЧНЕНА — с #уточняющей', () => ozhid(z6, 'utochnena', '#' + u6));
proba('ОТМЕНЕНА — «отменена #k (кем, когда)»', () => { ozhid(z7, 'otmenena', '#' + o7); ozhid(z7, 'otmenena', 'кем: '); ozhid(z7, 'otmenena', 'когда: '); });
proba('ПОРЯДОК: уточнённая и отменённая → ОТМЕНЕНА первой', () => ozhid(z8, 'otmenena', '#' + o8));
proba('ОТМЕТКА НЕГОДНА — битое поле сверки видно, не «обычная»', () => ozhid(z9, 'otmetka-negodna', 'сверка'));
proba('ночной счёт: та же формула на базе только-чтение, отменённые поимённо', () => {
  const b = new DatabaseSync(put, { readOnly: true });
  try {
    const r = doverie.schetDoveriya(b, KL);
    const s = r.schet;
    if (s.otmenena !== 2 || s.oprovergnuta !== 2 || s.utochnena !== 1 || s.podtverzhdena !== 1 || s['otmetka-negodna'] !== 1)
      throw new Error('счёт не тот: ' + JSON.stringify(s));
    if (JSON.stringify(r.otmenena.sort((x, y) => x - y)) !== JSON.stringify([z7, z8].sort((x, y) => x - y))) throw new Error('id отменённых: ' + r.otmenena);
  } finally { b.close(); }
});
proba('отмена снята (рукой, SQL) → снова ОБЫЧНАЯ', () => {
  h.baza.prepare('UPDATE zapisi SET otnoshenie = NULL, otnositsya_k = NULL WHERE id = ?').run(o7);
  ozhid(z7, 'obychnaya');
});
h.zakryt?.();
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
