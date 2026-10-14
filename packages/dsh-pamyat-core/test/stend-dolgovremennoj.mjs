// RU: Проверяем write-through и различаем причины отказа: нет канала — нужна установка; служба не смонтирована — настройка профиля; вызов без подтверждения — проверка провайдера. Отсутствие платформы означает слепоту проверки, а не дефект пакета; статический импорт не должен превращать её в код 1.
// EN: Test write-through and distinguish failure causes: missing channel requires installation; unmounted service requires profile configuration; an unconfirmed call requires provider inspection. A missing platform means the test cannot observe its subject, not that the package is broken; a static import must not turn that into exit code 1.
let Context, apply, name, Config, KLASSY_ZNANIY_UMOLCHANIE;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config, KLASSY_ZNANIY_UMOLCHANIE } = await import('../src/index.js'));
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND';
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'платформа (@deepseek-ai/cordis) не установлена' : String(e?.message ?? e).slice(0, 160)}`);
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.');
  process.exit(2);
}
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, bed = 0, slepot = 0;
// RU: Прогонщик синхронный и не ждёт промис: async-тело могло бы зачесть успех до исключения внутри. Возвращённый промис означает отказ пробы.
// EN: The runner is synchronous and does not await promises: an async body could record success before an inner exception. A returned promise fails the probe.
const proba = (imya, f) => { try {
    const vernulos = f();
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный — ждать не умеет. ' +
                      'Вынеси ожидание наружу либо сделай прогонщик ожидающим');
    }
    // RU: Тело пробы должно бросить ошибку или вернуть undefined. Любое другое значение, включая строку, false, 0, null и объект, означает отказ: игнорирование возврата даёт ложный успех. Проверка obyortka-krasneet подставляет заведомо ложную пробу в копию и сравнивает коды выхода.
    // EN: The probe body must throw an error or return undefined. Any other value, including a string, false, 0, null, or an object, means failure: ignoring returns produces false success. The obyortka-krasneet check injects a deliberately failing probe into a copy and compares exit codes.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. ' +
                      'Бросай ошибку либо ничего не возвращай');
    }
    ok++; console.log('  ok   ' + imya) }
  catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message) } };

const kat = vremennyj(join(tmpdir(), 'stend-dolgo-'));
let putBazy = '';

// RU: Поднимаем ядро с подставным долговременным слоем.
// EN: Start the core with a fake long-term layer.
async function podnyat({ dolgo = null, nastrojka = {} } = {}) {
  const koren = new Context();
  koren.provide('logger'); koren.logger = { error: () => {} };
  if (dolgo) { koren.provide('pamyatDolgovremennaya'); koren.pamyatDolgovremennaya = dolgo; }
  putBazy = join(kat, 'p-' + Math.random().toString(36).slice(2) + '.db');
  const cfg = new Config({ putBazy,
                           otvechayushchegoNet: true, agent: 'proba-uzel', ...nastrojka });
  koren.plugin({ name, apply }, cfg);
  await new Promise((r) => setTimeout(r, 40));
  return koren;
}

// RU: Читаем отдельные строки журнала прямо из базы независимым способом: служба возвращает лишь сводку причин.
// EN: Read individual journal rows directly from the database through an independent path; the service returns only a cause summary.
const zhurnalZapisi = (k) => {
  const put = k.pamyat.gdeBaza?.() ?? putBazy;
  const db = new DatabaseSync(put, { readOnly: true });
  const r = db.prepare('SELECT ishod, priroda, pochemu FROM zhurnal ORDER BY id').all();
  db.close();
  return r;
};

// RU: Исправный контроль: класс вне перечня не отправляется в долговременную память.
// EN: Healthy control: a class outside the list is not sent to long-term memory.
{
  const zvali = [];
  const k = await podnyat({ dolgo: { dostupna: () => true, pochemuNedostupna: () => '',
    sohranit: async (z) => { zvali.push(z); return { sostoyanie: 'dostavleno', id: 'mem-1' }; } } });
  k.pamyat.zapisat({ klass: 'svodka-kompakcii', soderzhim: 'сводка', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  proba('[0] сводка компакции в долговременную НЕ идёт (контроль на исправном)', () => {
    if (zvali.length !== 0) throw new Error('позвали ' + zvali.length + ' раз, ждали 0');
  });
}

// RU: Класс из перечня и доступный слой: доставка подтверждена, журнал содержит исход и id.
// EN: Listed class and available layer: delivery is confirmed, and the journal contains the outcome and id.
{
  const zvali = [];
  const k = await podnyat({ dolgo: { dostupna: () => true, pochemuNedostupna: () => '',
    sohranit: async (z) => { zvali.push(z); return { sostoyanie: 'dostavleno', id: 'mem-77' }; } } });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 'telegram-a2a#10-20' });
  await new Promise((r) => setTimeout(r, 60));
  proba('[A] знание уходит в долговременную, source_uri = istochnik', () => {
    if (zvali.length !== 1) throw new Error('позвали ' + zvali.length + ' раз');
    if (zvali[0].metadannye.source_uri !== 'telegram-a2a#10-20') {
      throw new Error('source_uri = ' + zvali[0].metadannye.source_uri);
    }
    if (zvali[0].tip !== 'urok') throw new Error('tip = ' + zvali[0].tip);
  });
  proba('[A] исход доставки попал в журнал с id', () => {
    const z = zhurnalZapisi(k).filter((x) => x.priroda === 'dolgovremennyj-sloj');
    if (!z.length) throw new Error('в журнале нет отметки долговременного слоя');
    if (z[0].ishod !== 'dostavleno') throw new Error('исход ' + z[0].ishod);
  });
}

// RU: Недоступный слой даёт причину недоступности и исход ne-otpravleno; оперативная запись сохраняется. Проверяем причину, определяющую лечение, отдельно от исхода.
// EN: An unavailable layer records the unavailability cause and ne-otpravleno outcome; the working-memory record survives. Check the cause that determines the remedy separately from the outcome.
{
  const k = await podnyat({ dolgo: { dostupna: () => false,
    pochemuNedostupna: () => 'служба OMEGA не отвечает',
    sohranit: async () => { throw new Error('не должны были звать'); } } });
  const id = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  proba('[B] недоступный слой НЕ откатывает оперативную запись', () => {
    if (!id) throw new Error('оперативная запись не сделана: id = ' + id);
  });
  proba('[B] природа отказа — «недоступен», с причиной от провайдера', () => {
    const z = zhurnalZapisi(k).filter((x) => String(x.priroda ?? '').startsWith('dolgovremennyj'));
    if (!z.length) throw new Error('отказ не отмечен в журнале — «выстрелил и забыл» стало молчанием');
    if (z[0].priroda !== 'dolgovremennyj-sloj-nedostupen') throw new Error('природа ' + z[0].priroda);
    if (!/не отвечает/.test(z[0].pochemu ?? '')) throw new Error('причина провайдера потеряна: ' + z[0].pochemu);
  });
}

// RU: Ответ без подтверждения даёт ne-najdeno; причина отличается от недоступного слоя.
// EN: A reply without confirmation gives ne-najdeno; its cause differs from an unavailable layer.
{
  const k = await podnyat({ dolgo: { dostupna: () => true, pochemuNedostupna: () => '',
    sohranit: async () => ({ sostoyanie: 'ne-najdeno', pochemu: 'записал, но чтением не подтвердилось' }) } });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 60));
  proba('[C] «позвал, но не подтвердилось» отличается от «канала нет»', () => {
    const z = zhurnalZapisi(k).filter((x) => String(x.priroda ?? '').startsWith('dolgovremennyj'));
    if (!z.length) throw new Error('исход не отмечен');
    if (z[0].ishod !== 'ne-najdeno') throw new Error('исход ' + z[0].ishod);
    if (z[0].priroda === 'dolgovremennyj-sloj-nedostupen') {
      throw new Error('природа совпала с [B] — два разных отказа неразличимы в журнале');
    }
  });
}

// RU: Несмонтированная служба оставляет отдельную причину в журнале.
// EN: An unmounted service leaves its own journal cause.
{
  const k = await podnyat({ dolgo: null });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  proba('[D] несмонтированная служба названа отдельно от недоступной', () => {
    const z = zhurnalZapisi(k).filter((x) => String(x.priroda ?? '').startsWith('dolgovremennyj'));
    if (!z.length) throw new Error('отсутствие службы не отмечено — тишина вместо причины');
    if (z[0].priroda !== 'dolgovremennyj-sloj-ne-smontirovan') throw new Error('природа ' + z[0].priroda);
  });
}

// RU: Проверяем вторую ветку записи: класс требует подтверждения, но отвечающего нет.
// EN: Test the second write branch: the class requires confirmation but no confirmer is available.
{
  const zvali = [];
  const k = await podnyat({
    nastrojka: { sprashivat: ['urok'] },
    dolgo: { dostupna: () => true, pochemuNedostupna: () => '',
      sohranit: async (z) => { zvali.push(z); return { sostoyanie: 'dostavleno', id: 'mem-9' }; } } });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 60));
  proba('[E] знание «без подтверждения» тоже уходит, и пометка едет с ним', () => {
    if (zvali.length !== 1) throw new Error('позвали ' + zvali.length + ' раз — ветка без подтверждения не покрыта');
    if (zvali[0].metadannye.bezPodtverzhdeniya !== true) {
      throw new Error('пометка не доехала: ' + JSON.stringify(zvali[0].metadannye));
    }
  });
}

// RU: Класс вне перечня должен оставить след в журнале: иначе решение не отправлять неотличимо от отсутствующего вызова слоя.
// EN: A class outside the list must leave a journal entry; otherwise the decision not to send is indistinguishable from a missing layer call.
{
  const k = await podnyat({ dolgo: { dostupna: () => true, pochemuNedostupna: () => '',
    sohranit: async () => ({ sostoyanie: 'dostavleno', id: 'mem-x' }) } });
  k.pamyat.zapisat({ klass: 'svodka-kompakcii', soderzhim: 'сводка', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  proba('[F] класс вне перечня — отдельный исход в журнале, а не тишина', () => {
    const z = zhurnalZapisi(k).filter((x) => x.priroda === 'klass-vne-klassyZnaniy');
    if (!z.length) throw new Error('ветка «вне перечня» молчит — решение неотличимо от сбоя');
    if (z[0].ishod !== 'ostalos-v-operativnom') throw new Error('исход ' + z[0].ishod + ', ждали ostalos-v-operativnom');
    if (!/не входит в klassyZnaniy/.test(z[0].pochemu ?? '')) throw new Error('причина не называет перечень: ' + z[0].pochemu);
  });
}

// RU: Сверяем перечень классов секретаря с перечнем долговременной доставки ядра: расхождение оставит часть знаний только в оперативном слое. Нет соседнего пакета — слепота, а не успех.
// EN: Compare the secretary’s class list with the core’s long-term delivery list; divergence leaves some knowledge only in working memory. A missing adjacent package means an unobservable test, not success.
{
  let klassySecretarya = null;
  for (const put of ['../../dsh-pamyat-secretary/src/promty.js',
                     '../node_modules/dsh-pamyat-secretary/src/promty.js']) {
    try { ({ KLASSY: klassySecretarya } = await import(new URL(put, import.meta.url).href)); break; }
    catch { /* RU: Продолжаем поиск.
 * EN: Continue searching.
 */ }
  }
  if (!klassySecretarya) {
    slepot++;
    console.log('  СЛЕПОТА: пакет секретаря не найден рядом — согласованность перечней не проверена');
    console.log('    Это НЕ «сошлось»: проверка не состоялась. Поставьте dsh-pamyat-secretary рядом.');
  } else {
    // RU: Умолчание перечня хранится в константе модуля. Схема возвращает undefined для отсутствующего ключа, чтобы отличать доставленную настройку от умолчания.
    // EN: The module constant holds the default class list. The schema returns undefined for an absent key to distinguish supplied configuration from the default.
    const nashi = KLASSY_ZNANIY_UMOLCHANIE;
    proba('[G] все классы секретаря входят в klassyZnaniy ядра', () => {
      const lishnie = klassySecretarya.filter((x) => !nashi.includes(x));
      if (lishnie.length) {
        throw new Error('секретарь пишет классы, которых ядро не отправит в долговременную память: ' +
                        lishnie.join(', ') + ' — знание останется только в оперативном слое');
      }
    });
  }
}

// RU: Проверяем единственность решения rezhim(): подмена в копии ядра должна уронить и стенд фильтра, и стенд записи. Один отказ означает две независимые таблицы правил. Ожидание выполняется вне синхронного тела пробы.
// EN: Test rezhim() as the sole decision source: mutating it in a core copy must fail both the filter and write suites. Only one failure indicates two independent rule tables. Await outside the synchronous probe body.
const kEdinstv = await podnyat();
proba('П-единственность: объявленный секрет ОТВЕРГАЕТСЯ через zapisat, не только фильтром', () => {
  let otkaz = null;
  try {
    // RU: Берём класс вне маски знаний и сводок, чтобы проверить отказ в zapisat, а не замену объявленного значения.
    // EN: Use a class outside knowledge and summary masking to test rejection in zapisat rather than declared-value replacement.
    kEdinstv.pamyat.zapisat({ klass: 'proba-vne-maski', soderzhim: 'password = Xk9#mQ2$vL8p', istochnik: 's#1-2' });
  } catch (e) { otkaz = e; }
  if (!otkaz) throw new Error('запись с объявленным секретом ПРОШЛА — ядро не заперло');
  const tekst = String(otkaz.message ?? otkaz);
  // RU: Ищем класс в тексте отказа: он приходит из rezhim() и показывает сработавшее правило; слово SEKRET этого не доказывает.
  // EN: Look for the class in the rejection text: it comes from rezhim() and identifies the matching rule; the word SEKRET cannot prove this.
  if (!tekst.includes('obyavlennyj')) throw new Error('отказ есть, но класс не назван: ' + tekst.slice(0, 70));
});

rmSync(kat, { recursive: true, force: true });
console.log('ИТОГО: сошлось ' + ok + ', расхождений ' + bed + ', слепота ' + slepot);
process.exit(bed ? 1 : (slepot ? 2 : 0));
