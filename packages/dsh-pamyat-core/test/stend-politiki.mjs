/**
 * Стенд политики записи. Доказывает главное: «человек отказал» и «канала нет» —
 * РАЗНЫЕ исходы с разными объяснениями. Если стенд это перестанет ловить,
 * сломанная установка станет неотличима от осторожного человека.
 */
let reshitPoKlassu, istolkovatPodtverzhdenie, KLASSY_SPRASHIVAT
try {
  ;({ reshitPoKlassu, istolkovatPodtverzhdenie, KLASSY_SPRASHIVAT } = await import('../src/politika.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 130)); }
};

proba('стенд годен: обычный класс пишется сам', () => {
  const r = reshitPoKlassu('zametka');
  if (r.reshenie !== 'auto') throw new Error('ожидалось auto, получено ' + r.reshenie);
  if (!r.pochemu) throw new Error('решение без объяснения');
});

proba('общефермовые классы требуют подтверждения', () => {
  for (const k of KLASSY_SPRASHIVAT) {
    const r = reshitPoKlassu(k);
    if (r.reshenie !== 'ask') throw new Error('класс ' + k + ' должен быть ask, а он ' + r.reshenie);
  }
});

proba('настройка перекрывает умолчание', () => {
  const r = reshitPoKlassu('zametka', { sprashivat: ['zametka'] });
  if (r.reshenie !== 'ask') throw new Error('настройка не подействовала');
});

proba('ПОРЧА: класс не задан → отказ, а не молчаливое auto', () => {
  try { reshitPoKlassu(''); throw new Error('не упало'); }
  catch (e) { if (e.code !== 'PAMYAT_NET_KLASSA') throw new Error('не тот код: ' + e.code); }
});

proba('ПОРЧА: пустой список классов НЕ отключает спрашивание', () => {
  const r = reshitPoKlassu('ogranichenie', { sprashivat: [] });
  if (r.reshenie !== 'ask') throw new Error('пустой список ослабил защиту: получено ' + r.reshenie);
});

proba('ЛИТЕРАЛЫ ЯДРА: каждый исход даёт СВОЮ природу', () => {
  const ozhidaem = {
    'rejected': 'otkazano-chelovekom',
    'cancelled': 'otmeneno',
    'unavailable': 'net-kanala',
    'not-supported': 'net-sluzhby',
    'no-agent': 'net-agenta',
  };
  for (const [ishod, priroda] of Object.entries(ozhidaem)) {
    const r = istolkovatPodtverzhdenie(ishod, true);
    if (r.zapisyvat !== false) throw new Error(ishod + ' не должен разрешать запись');
    if (r.priroda !== priroda) throw new Error(ishod + ' дал природу ' + r.priroda + ', ожидалась ' + priroda);
  }
});

proba('ГЛАВНОЕ: поломка НЕ записывается как решение человека', () => {
  const polomki = ['unavailable', 'not-supported', 'no-agent'];
  for (const p of polomki) {
    const r = istolkovatPodtverzhdenie(p, true);
    if (r.priroda === 'otkazano-chelovekom') throw new Error(p + ' присвоен человеку — схлопывание вернулось');
    if (/человек не разрешил/.test(r.pochemu)) throw new Error(p + ': текст приписывает решение человеку');
  }
  const chelovek = istolkovatPodtverzhdenie('rejected', true);
  if (chelovek.priroda !== 'otkazano-chelovekom') throw new Error('решение человека потеряно');
});

proba('«прервано» — это НЕ отказ: текст зовёт спросить снова', () => {
  const r = istolkovatPodtverzhdenie('cancelled', true);
  if (!/спросите снова/.test(r.pochemu)) throw new Error('cancelled подан как окончательный отказ');
});

proba('ПОРЧА: неизвестный исход → отказ с кодом, а НЕ «человек»', () => {
  try {
    const r = istolkovatPodtverzhdenie('denied', true);
    throw new Error('не упало, а вернуло природу ' + r.priroda + ' — выдуманный литерал принят за настоящий');
  } catch (e) {
    if (e.code !== 'PAMYAT_NEIZVESTNYJ_ISHOD') throw new Error('не тот код: ' + e.code);
    if (/человек/.test(e.message.replace('приписывать его человеку тоже нельзя',''))) {
      throw new Error('сообщение всё же валит на человека');
    }
  }
});

proba('ПОРЧА: канала нет вовсе → природа поломки, не решение', () => {
  const r = istolkovatPodtverzhdenie(null, false);
  if (r.priroda !== 'net-kanala') throw new Error('природа ' + r.priroda);
});

proba('разрешение работает', () => {
  const r = istolkovatPodtverzhdenie('allowed-once', true);
  if (r.zapisyvat !== true) throw new Error('разрешение не сработало');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
