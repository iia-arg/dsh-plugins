// RU: Проверяем шов секретаря на настоящем Context платформы: runtime запрещает чтение службы без inject, чего заглушка не проверяет. Работа подписки доказывается полученным событием, а не успешной регистрацией.
// EN: Test the secretary boundary on a real platform Context: runtime forbids reading a service without inject, which a stub cannot test. Prove subscription behavior through a received event rather than successful registration.
// RU: Изоляция от машины (A-N-1955): выключатели дистилляции и рассуждений — онлайн-файлы в $HOME/pamyat. На машине, где
//     они стоят, проба «включена, но ключа нет» краснела при исправном коде: ветка выключателя срабатывает раньше проверки
//     ключа. Стенд направляет обе переменные на заведомо несуществующие пути; ветку выключателя проверяет отдельная проба
//     с временным файлом.
// EN: Isolation from the host (A-N-1955): the distillation and reasoning switches are online files in $HOME/pamyat. On a
//     host where they exist, the probe «enabled without a key» went red with correct code: the switch branch fires before
//     the key check. The stand points both variables at paths that do not exist; a separate probe checks the switch
//     branch with a temporary file.
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const VREM = mkdtempSync(join(tmpdir(), 'stend-shva-'))
process.on('exit', () => { try { rmSync(VREM, { recursive: true, force: true }) } catch {} })
process.env.PAMYAT_DISTILLYACIYA_VYKL = join(VREM, 'net-vyklyuchatelya-distillyacii')
process.env.PAMYAT_RASSUZHDENIYA_VYKL = join(VREM, 'net-vyklyuchatelya-rassuzhdenij')
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
  try {
    const vernulos = await f();
    // RU: Асинхронная обёртка учитывает возврат тела; любое значение кроме undefined означает отказ. Перечень отдельных значений неполон и пропускает 0, null или объект.
    // EN: The asynchronous wrapper inspects the body’s return; any value other than undefined means failure. A list of individual values is incomplete and can miss 0, null, or an object.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судила по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya); }
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

// RU: Перехватываем сообщения обоими путями: logger и console.error. Доступность logger и фактический путь вывода зависят от контекста; один перехват может дать ложную тишину.
// EN: Capture messages through both logger and console.error. Logger access and the actual output route depend on context; capturing only one may produce false silence.
function slushat() {
  const kriki = [];
  const prezhnij = console.error;
  console.error = (...a) => kriki.push(a.join(' '));
  return { kriki, vernut: () => { console.error = prezhnij; } };
}

// RU: Поднимаем плагин на настоящем Context с подставной службой памяти.
// EN: Start the plugin on a real Context with a fake memory service.
function podnyat({ pamyatEst = true, nastrojka = {} } = {}) {
  const koren = new Context();
  const zapisi = [], kriki = [];
  if (pamyatEst) {
    koren.provide('pamyat');
    koren.pamyat = { zapisat: (z) => { zapisi.push(z); return zapisi.length; } };
  }
  koren.provide('logger');
  koren.logger = { error: (m) => kriki.push(m) };
  return new Promise((gotovo) => {
    koren.plugin({ name, inject, apply }, nastrojka);
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

// RU: Проверяем разведение: выключенная дистилляция не вызывает платный API, включённая без ключа громко отказывает. Ответы модели проверяет отдельный stend-distillyacii.
// EN: Test branching: disabled distillation makes no paid API call; enabled distillation without a key rejects audibly. stend-distillyacii separately tests model responses.
await proba('дистилляция ВЫКЛЮЧЕНА по умолчанию: сводка записана, к API не ходили', async () => {
  const { koren, zapisi, kriki } = await podnyat();
  koren.emit('session/event', { id: 'sess-1' }, SOBYTIE);
  await new Promise((r) => setTimeout(r, 60));
  if (zapisi.length !== 1) throw new Error('сводка не записана');
  if (kriki.some((k) => /дистилляц/i.test(String(k)))) throw new Error('дистилляция пошла при выключенной настройке');
});

await proba('ПОРЧА: включена, но ключа нет → отказ ВСЛУХ и сводка всё равно записана', async () => {
  const prezhnij = console.error; const skazano = [];
  console.error = (...a) => skazano.push(a.join(' '));
  let zapisi;
  try {
    const p = await podnyat({ nastrojka: { distillyaciya: true, putZhurnala: '/net/takogo/zhurnala' } });
    zapisi = p.zapisi;
    p.koren.emit('session/event', { id: 'sess-1' }, SOBYTIE);
    await new Promise((r) => setTimeout(r, 120));
  } finally { console.error = prezhnij; }
  if (zapisi.length !== 1) throw new Error('штатная сводка потеряна из-за дистилляции');
  if (!skazano.some((k) => /дистилляция не начата|нет shadowedSeqs/i.test(k))) {
    throw new Error('отказ дистилляции НЕ назван вслух: ' + JSON.stringify(skazano).slice(0, 160));
  }
});

await proba('ВЫКЛЮЧАТЕЛЬ: включена настройкой, но лежит файл выключения → пропуск НАЗВАН файлом, сводка записана', async () => {
  const fajl = join(VREM, 'distillyaciya-vyklyuchena')
  writeFileSync(fajl, 'проба стенда\n')
  if (!existsSync(fajl)) throw new Error('временный выключатель не создан — проба слепа')
  const prezhnijPut = process.env.PAMYAT_DISTILLYACIYA_VYKL
  process.env.PAMYAT_DISTILLYACIYA_VYKL = fajl
  const prezhnij = console.error; const skazano = [];
  console.error = (...a) => skazano.push(a.join(' '));
  let zapisi;
  try {
    const p = await podnyat({ nastrojka: { distillyaciya: true, putZhurnala: '/net/takogo/zhurnala' } });
    zapisi = p.zapisi;
    p.koren.emit('session/event', { id: 'sess-1' }, SOBYTIE);
    await new Promise((r) => setTimeout(r, 120));
  } finally { console.error = prezhnij; process.env.PAMYAT_DISTILLYACIYA_VYKL = prezhnijPut; rmSync(fajl, { force: true }) }
  if (zapisi.length !== 1) throw new Error('штатная сводка потеряна при выключателе');
  if (!skazano.some((k) => /ПРОПУЩЕНА/.test(k) && k.includes(fajl))) {
    throw new Error('пропуск по файлу НЕ назван с путём: ' + JSON.stringify(skazano).slice(0, 160));
  }
  if (skazano.some((k) => /дистилляция не начата/i.test(k))) throw new Error('при выключателе дошли до проверки ключа');
});

await proba('inject объявлен — иначе боевой контекст бросит на первом обращении', () => {
  if (!Array.isArray(inject) || !inject.includes('pamyat')) throw new Error('inject не объявляет pamyat');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
