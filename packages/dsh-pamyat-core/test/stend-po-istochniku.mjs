// RU: Проверяем точный запрос poIstochniku: чужой агент не входит в счёт, пустой источник или агент дают отказ вместо пустого результата. Порча различает исключение и возвращённое значение.
// EN: Test the exact poIstochniku query: exclude other agents, and reject an empty source or agent rather than returning an empty result. Mutation distinguishes an exception from a returned value.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let otkrytHranilishche;
try { ({ otkrytHranilishche } = await import('../src/hranilishche.js')); }
catch (e) { console.log('СЛЕПОТА: ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v && typeof v.then === 'function') throw new Error('тело ОЖИДАЮЩЕЕ — прогонщик синхронный');
    if (v !== undefined && v !== true) throw new Error('тело ВЕРНУЛО «' + String(v).slice(0, 50) + '»');
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 130)); }
};
const dolzhnoUpast = (kod, f) => {
  try { f(); } catch (e) {
    if (e.code === kod) return e;
    throw new Error('ожидался код ' + kod + ', получен ' + e.code);
  }
  throw new Error('не упало, а должно было (' + kod + ')');
};

const katalog = vremennyj(join(tmpdir(), 'po-istochniku-'));
const h = otkrytHranilishche(join(katalog, 'p.db'));

proba('стенд годен: хранилище открылось и пишет', () => {
  h.zapisat({ agent: 'a', klass: 'zametka', soderzhim: 'своё', istochnik: 'session#1' });
});

proba('poIstochniku отдаёт ТОЛЬКО свои записи (чужое не считается своим)', () => {
  const h2 = otkrytHranilishche(join(katalog, 'p2.db'));
  h2.zapisat({ agent: 'a', klass: 'zametka', soderzhim: 'своё', istochnik: 'session#1' });
  h2.zapisat({ agent: 'b', klass: 'zametka', soderzhim: 'чужое', istochnik: 'session#1' });
  const z = h2.poIstochniku({ agent: 'a', istochnik: 'session#1' });
  if (z.length !== 1) throw new Error('ожидали 1 свою запись, получили ' + z.length);
  if (z[0].agent !== 'a') throw new Error('чужое сошло за своё');
});

proba('пустой источник — ОТКАЗ PAMYAT_ISTOCHNIK_PUST, а не пустота', () => {
  dolzhnoUpast('PAMYAT_ISTOCHNIK_PUST', () => h.poIstochniku({ agent: 'a', istochnik: '' }));
});

proba('пустой агент — ОТКАЗ PAMYAT_ISTOCHNIK_BEZ_AGENTA', () => {
  dolzhnoUpast('PAMYAT_ISTOCHNIK_BEZ_AGENTA', () => h.poIstochniku({ agent: '', istochnik: 'session#1' }));
});

proba('незаданный источник (нет записей) — ПУСТОЙ список, не отказ', () => {
  const h3 = otkrytHranilishche(join(katalog, 'p3.db'));
  const z = h3.poIstochniku({ agent: 'a', istochnik: 'nikakogo' });
  if (!Array.isArray(z) || z.length !== 0) throw new Error('ожидали пустой список, получили ' + JSON.stringify(z));
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
