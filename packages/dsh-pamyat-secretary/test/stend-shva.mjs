/**
 * Стенд шва секретаря — на НАСТОЯЩЕМ Context платформы, не на заглушке.
 *
 * 🔴 ПОЧЕМУ НЕ ЗАГЛУШКА. Заглушка слепа к запретам платформы: она отдаёт любую
 * службу и не знает про `inject`. На боевом контексте (плагин под runtime)
 * чтение незаявленной службы БРОСАЕТ — и пакет, зелёный на заглушке, упал бы
 * при первом же событии. Проверено живым отказом в бою и перемером на cordis
 * 4.0.1, взятом из каталога стенда, а не из реестра.
 *
 * 🔴 ПОДПИСКА СЧИТАЕТСЯ РАБОЧЕЙ ТОЛЬКО ПО ПОЛУЧЕННОМУ СОБЫТИЮ. «Подписался без
 * ошибки» — не доказательство: мы это правило заводили не про секретаря, но
 * оно ровно про него.
 */
let apply, inject, name, Context
try {
  ;({ Context } = await import('@deepseek-ai/cordis'))
  ;({ apply, inject, name } = await import('../src/index.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => {
  vsego++;
  try { await f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 140)); }
};

const SOBYTIE = {
  type: 'compaction/summary',
  data: {
    compactionId: 'c-7',
    summary: [{ type: 'text', text: 'Решение владельца: пробы ставить на боевом объекте.' }],
    shadowedSeqs: [21, 22, 23],
    shadowedTokenCount: 4096,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
  },
};

/**
 * Ловить крик ОБОИМИ путями.
 * 🔴 На боевом контексте служба логгера плагину не даётся (проверено), поэтому
 * сообщение уходит в обычный вывод. Стенд, слушающий только службу, показал бы
 * «прошло молча» на исправном коде — это уже случилось в первой редакции и
 * стоило трёх ложно-красных проб. Ловим оба канала.
 */
function slushat() {
  const kriki = [];
  const prezhnij = console.error;
  console.error = (...a) => kriki.push(a.join(' '));
  return { kriki, vernut: () => { console.error = prezhnij; } };
}

/** Поднять плагин на настоящем контексте, подсунув службу памяти. */
function podnyat({ pamyatEst = true } = {}) {
  const koren = new Context();
  const zapisi = [], kriki = [];
  if (pamyatEst) {
    koren.provide('pamyat');
    koren.pamyat = { zapisat: (z) => { zapisi.push(z); return zapisi.length; } };
  }
  koren.provide('logger');
  koren.logger = { error: (m) => kriki.push(m) };
  return new Promise((gotovo) => {
    koren.plugin({ name, inject, apply }, {});
    setTimeout(() => gotovo({ koren, zapisi, kriki }), 30);
  });
}

await proba('стенд годен: плагин поднимается на настоящем Context', async () => {
  const { koren } = await podnyat();
  if (!koren) throw new Error('контекст не создан');
});

await proba('ГЛАВНОЕ: подписка доказана ПОЛУЧЕННЫМ событием — сводка записана', async () => {
  const { koren, zapisi } = await podnyat();
  koren.emit('session/event', { id: 'sess-1' }, SOBYTIE);
  await new Promise((r) => setTimeout(r, 20));
  if (zapisi.length !== 1) throw new Error('записей ' + zapisi.length + ' — событие не обработано');
  if (zapisi[0].istochnik !== 'sess-1#21-23') throw new Error('ссылка ' + zapisi[0].istochnik);
});

await proba('чужие события сессии игнорируются молча', async () => {
  const { koren, zapisi, kriki } = await podnyat();
  koren.emit('session/event', { id: 'sess-1' }, { type: 'user/message', data: {} });
  await new Promise((r) => setTimeout(r, 20));
  if (zapisi.length !== 0) throw new Error('записано лишнее');
  if (kriki.length !== 0) throw new Error('крик на чужом событии: ' + kriki[0]);
});

await proba('ПОРЧА: негодное событие → НЕ записано и СКАЗАНО вслух', async () => {
  const { koren, zapisi } = await podnyat();
  const sluh = slushat();
  try {
    koren.emit('session/event', { id: 'sess-1' }, { type: 'compaction/summary', data: { summary: [], shadowedSeqs: [] } });
    await new Promise((r) => setTimeout(r, 20));
  } finally { sluh.vernut(); }
  if (zapisi.length !== 0) throw new Error('пустая сводка записана');
  if (sluh.kriki.length === 0) throw new Error('пропуск прошёл молча');
  if (!/НЕ записана/.test(sluh.kriki.join(' '))) throw new Error('сообщение не объясняет пропуск');
});

await proba('ПОРЧА: исключение внутри обработчика НЕ рвёт чужой поток событий', async () => {
  const koren = new Context();
  const kriki = [];
  koren.provide('pamyat');
  koren.pamyat = { zapisat: () => { throw new Error('память сломалась'); } };
  koren.provide('logger');
  koren.logger = { error: (m) => kriki.push(m) };
  koren.plugin({ name, inject, apply }, {});
  await new Promise((r) => setTimeout(r, 30));
  let drugoj = 0;
  koren.on('session/event', () => { drugoj++; });
  let brosilo = false;
  const sluh = slushat();
  try { koren.emit('session/event', { id: 's' }, SOBYTIE); } catch { brosilo = true; }
  await new Promise((r) => setTimeout(r, 20));
  sluh.vernut();
  if (brosilo) throw new Error('исключение вышло наружу');
  if (drugoj !== 1) throw new Error('другой подписчик не получил событие');
  if (sluh.kriki.length === 0 && kriki.length === 0) throw new Error('сбой прошёл молча');
});

await proba('ПОРЧА: выключён настройкой → говорит об этом громко', async () => {
  const koren = new Context();
  koren.provide('pamyat'); koren.pamyat = { zapisat: () => 1 };
  const sluh = slushat();
  try {
    koren.plugin({ name, inject, apply }, { vklyuchen: false });
    await new Promise((r) => setTimeout(r, 30));
  } finally { sluh.vernut(); }
  if (sluh.kriki.length === 0) throw new Error('выключился молча');
  if (!/ВЫКЛЮЧЕН/.test(sluh.kriki.join(' '))) throw new Error('причина не названа');
});

await proba('inject объявлен — иначе боевой контекст бросит на первом обращении', () => {
  if (!Array.isArray(inject) || !inject.includes('pamyat')) throw new Error('inject не объявляет pamyat');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
