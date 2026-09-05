/** Стенд порогов: когда подталкивает и что отвечает на «хватит ли». */
let name, Config, apply, Context
try {
  ;({ Context } = await import('@deepseek-ai/cordis'))
  ;({ name, Config, apply } = await import('../src/index.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => { vsego++; try { await f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 180)); } };

// Служба появляется НЕ СРАЗУ: cordis применяет плагин асинхронно.
function podnyat(nastrojka) {
  const k = new Context();
  k.plugin({ name, Config, apply }, nastrojka);
  return new Promise((gotovo) => setTimeout(() => gotovo(k), 50));
}
function slushat() {
  const kriki = []; const prezhnij = console.error;
  console.error = (...a) => kriki.push(a.join(' '));
  return { kriki, vernut: () => { console.error = prezhnij; } };
}

await proba('стенд годен: служба поднимается на настоящем Context', async () => {
  const s = slushat(); let k;
  try { k = await podnyat({ predel: 1000 }); } finally { s.vernut(); }
  if (typeof k.nudzhPamyati?.uchest !== 'function') throw new Error('службы нет');
});

await proba('ГЛАВНОЕ: порог перейдён → подталкивает ГРОМКО и с числами', async () => {
  const s = slushat();
  try {
    const k = await podnyat({ predel: 1000, dolyaTrevogi: 0.8 });
    // 🔴 МЕРА СМЕНИЛАСЬ 03.09.2026: порог считается от ЗАНЯТОСТИ окна (вход последнего
    // вызова), а не от суммы расхода по всем вызовам. Прежде здесь стояло 700+200=900
    // «расхода»; выход в занятость не входит — он станет частью ВХОДА следующего вызова.
    k.nudzhPamyati.uchest({ inputTokens: 900, outputTokens: 200 });
  } finally { s.vernut(); }
  const t = s.kriki.join(' ');
  if (!/пора подтолкнуть/.test(t)) throw new Error('молчит при переходе порога');
  if (!/занято 900 из 1000/.test(t)) throw new Error('нет чисел: ' + t.slice(0, 160));
});

await proba('🔴 СУММА ВЫШЕ ПОРОГА, А ЗАНЯТОСТЬ НЕТ → МОЛЧИТ (возврат к старой мере ловится)', async () => {
  const s = slushat();
  try {
    const k = await podnyat({ predel: 1000, dolyaTrevogi: 0.8 });
    // Два вызова по 700: сумма 1400 — выше и порога, и самого предела. Занятость 700 —
    // ниже порога 800. Это ровно боевая картина 03.09.2026 («1255120 из 1000000» при
    // двух вызовах и без всякого переполнения окна). Тревоги быть НЕ ДОЛЖНО.
    k.nudzhPamyati.uchest({ inputTokens: 700, outputTokens: 0 });
    k.nudzhPamyati.uchest({ inputTokens: 700, outputTokens: 0 });
  } finally { s.vernut(); }
  if (/пора подтолкнуть/.test(s.kriki.join(' '))) {
    throw new Error('тревога по СУММЕ: мера вернулась к прежней, занятость не считается');
  }
});

await proba('подталкивает ОДИН раз, а не на каждом вызове', async () => {
  const s = slushat();
  try {
    const k = await podnyat({ predel: 100, dolyaTrevogi: 0.5 });
    for (let i = 0; i < 5; i++) k.nudzhPamyati.uchest({ inputTokens: 50, outputTokens: 0 });
  } finally { s.vernut(); }
  const skolko = s.kriki.filter((m) => /пора подтолкнуть/.test(m)).length;
  if (skolko !== 1) throw new Error('криков ' + skolko);
});

await proba('🔴 В КРИКЕ СКАЗАНО, ЧТО РАСХОД МОЖЕТ БЫТЬ ТОЛЬКО БОЛЬШЕ', async () => {
  const s = slushat();
  try {
    const k = await podnyat({ predel: 100, dolyaTrevogi: 0.5 });
    k.nudzhPamyati.uchest({ inputTokens: 60, outputTokens: 0 });
  } finally { s.vernut(); }
  if (!/только БОЛЬШЕ/.test(s.kriki.join(' '))) throw new Error('нижняя оценка выдана за точную');
});

await proba('🔴 «ХВАТИТ ЛИ» НЕ ГОВОРИТ «ХВАТАЕТ»: только «перейдён» или «неизвестно»', async () => {
  const s = slushat(); let otvet;
  try {
    const k = await podnyat({ predel: 1000 });
    k.nudzhPamyati.uchest({ inputTokens: 10, outputTokens: 10 });
    otvet = k.nudzhPamyati.hvatitLi();
  } finally { s.vernut(); }
  if (otvet.sostoyanie !== 'neizvestno') throw new Error('состояние ' + otvet.sostoyanie);
  if (typeof otvet === 'boolean' || otvet.hvataet === true) throw new Error('пакет утверждает запас на неполных данных');
});

await proba('вызовы без числа НАЗВАНЫ в ответе «хватит ли»', async () => {
  const s = slushat(); let otvet;
  try {
    const k = await podnyat({ predel: 1000 });
    k.nudzhPamyati.uchest({ inputTokens: 10, outputTokens: 10 });
    k.nudzhPamyati.uchest(undefined);
    otvet = k.nudzhPamyati.hvatitLi();
  } finally { s.vernut(); }
  if (!/без числа/.test(otvet.pochemu)) throw new Error('пропуски не названы: ' + otvet.pochemu);
});

await proba('предел не задан → сказано вслух при подъёме', async () => {
  const s = slushat();
  try { await podnyat({ predel: 0 }); } finally { s.vernut(); }
  if (!/предел контекста НЕ ЗАДАН/.test(s.kriki.join(' '))) throw new Error('поднялся молча');
});

await proba('предел не задан → «хватит ли» отвечает неизвестно, а не «да»', async () => {
  const s = slushat(); let otvet;
  try { const k = await podnyat({ predel: 0 }); otvet = k.nudzhPamyati.hvatitLi(); } finally { s.vernut(); }
  if (otvet.sostoyanie !== 'neizvestno' || !/предел не задан/.test(otvet.pochemu)) {
    throw new Error(JSON.stringify(otvet));
  }
});

await proba('🔴 «НЕИЗВЕСТНО» ИДЁТ С МЕРОЙ: числа полноты — ПОЛЯМИ, не только в строке', async () => {
  const s = slushat(); let a, b, c;
  try {
    const k = await podnyat({ predel: 1000 });
    k.nudzhPamyati.uchest(undefined); k.nudzhPamyati.uchest({ inputTokens: 5, outputTokens: 5 });
    a = k.nudzhPamyati.hvatitLi();
    const k2 = await podnyat({ predel: 10, dolyaTrevogi: 0.5 });
    k2.nudzhPamyati.uchest({ inputTokens: 9, outputTokens: 0 });
    b = k2.nudzhPamyati.hvatitLi();
    const k3 = await podnyat({ predel: 0 });
    k3.nudzhPamyati.uchest(undefined);
    c = k3.nudzhPamyati.hvatitLi();
  } finally { s.vernut(); }
  for (const [imya, o] of [['неизвестно', a], ['порог перейдён', b], ['предел не задан', c]]) {
    if (typeof o.bezChisla !== 'number') throw new Error(imya + ': нет поля bezChisla');
    if (typeof o.uchtenoVyzovov !== 'number') throw new Error(imya + ': нет поля uchtenoVyzovov');
  }
  if (a.bezChisla !== 1) throw new Error('мера неверна: bezChisla ' + a.bezChisla);
});

await proba('🔴 СЧИТАЕТ САМ: событие assistant/message учитывается без посредника', async () => {
  const s = slushat(); let itog;
  try {
    const k = await podnyat({ predel: 1000 });
    k.emit('session/event', { id: 'sess-1' }, {
      seq: 1, time: 1, type: 'assistant/message',
      data: { turn: 1, step: 1, message: {}, usage: { inputTokens: 100, cacheReadTokens: 50, outputTokens: 20 } },
    });
    await new Promise((r) => setTimeout(r, 20));
    itog = k.nudzhPamyati.itog();
  } finally { s.vernut(); }
  if (itog.uchtenoVyzovov !== 1) throw new Error('событие не учтено: ' + itog.uchtenoVyzovov);
  if (itog.neMenshe !== 170) throw new Error('сумма ' + itog.neMenshe + ', ожидалось 170 (100+50+20)');
});

await proba('🔴 ПУСТОЕ сообщение с usage учитывается — оно и шлётся ради usage', async () => {
  const s = slushat(); let itog;
  try {
    const k = await podnyat({ predel: 1000 });
    k.emit('session/event', { id: 'sess-1' }, {
      seq: 1, time: 1, type: 'assistant/message',
      data: { turn: 1, step: 1, message: { content: [] }, usage: { inputTokens: 7, outputTokens: 3 } },
    });
    await new Promise((r) => setTimeout(r, 20));
    itog = k.nudzhPamyati.itog();
  } finally { s.vernut(); }
  if (itog.neMenshe !== 10) throw new Error('пустое сообщение пропущено: ' + itog.neMenshe);
});

await proba('🔴 СОБЫТИЕ БЕЗ usage — считается «без числа», а не нулём', async () => {
  const s = slushat(); let itog;
  try {
    const k = await podnyat({ predel: 1000 });
    k.emit('session/event', { id: 'sess-1' }, { seq: 1, time: 1, type: 'assistant/message', data: { turn: 1, step: 1, message: {} } });
    await new Promise((r) => setTimeout(r, 20));
    itog = k.nudzhPamyati.itog();
  } finally { s.vernut(); }
  if (itog.bezChisla !== 1) throw new Error('без числа ' + itog.bezChisla);
  if (itog.polnyj !== false) throw new Error('итог назван полным');
});

await proba('чужие события не считаются', async () => {
  const s = slushat(); let itog;
  try {
    const k = await podnyat({ predel: 1000 });
    k.emit('session/event', { id: 'sess-1' }, { seq: 1, time: 1, type: 'user/message', data: {} });
    k.emit('session/event', { id: 'sess-1' }, { seq: 2, time: 2, type: 'tool/call', data: { turn: 1 } });
    await new Promise((r) => setTimeout(r, 20));
    itog = k.nudzhPamyati.itog();
  } finally { s.vernut(); }
  if (itog.uchtenoVyzovov !== 0 || itog.bezChisla !== 0) throw new Error(JSON.stringify(itog));
});

await proba('ПОРЧА: негодный usage в событии → крик, чужой поток НЕ оборван', async () => {
  const s = slushat(); let dozhil = false;
  try {
    const k = await podnyat({ predel: 1000 });
    k.emit('session/event', { id: 'sess-1' }, {
      seq: 1, time: 1, type: 'assistant/message',
      data: { turn: 1, step: 1, message: {}, usage: { inputTokens: -5, outputTokens: 1 } },
    });
    await new Promise((r) => setTimeout(r, 20));
    dozhil = true;
  } finally { s.vernut(); }
  if (!dozhil) throw new Error('исключение вышло наружу — оборвало бы чужих подписчиков');
  if (!s.kriki.some((m) => /не смог учесть расход/.test(m))) throw new Error('сбой прошёл молча');
});

await proba('🔴 ШОВ: компакт НЕ БЕСПЛАТЕН — расход сводки тоже учитывается', async () => {
  const s = slushat(); let itog;
  try {
    const k = await podnyat({ predel: 100000 });
    k.emit('session/event', { id: 'sess-1' }, {
      seq: 1, time: 1, type: 'compaction/summary',
      data: { usage: { inputTokens: 1000, outputTokens: 500 } },
    });
    await new Promise((r) => setTimeout(r, 20));
    itog = k.nudzhPamyati.itog();
  } finally { s.vernut(); }
  if (itog.neMenshe !== 1500) throw new Error('расход сводки потерян: ' + itog.neMenshe);
});

await proba('🔴 ШОВ ЦЕЛИКОМ: два события с числом и одно без → 2 учтено, 1 без числа', async () => {
  const s = slushat(); let itog;
  try {
    const k = await podnyat({ predel: 100000 });
    k.emit('session/event', { id: 'sess-1' }, {
      seq: 1, time: 1, type: 'assistant/message',
      data: { turn: 1, step: 1, message: {},
              usage: { inputTokens: 2, outputTokens: 5, cacheReadTokens: 39996, cacheWriteTokens: 1236 } },
    });
    k.emit('session/event', { id: 'sess-1' }, {
      seq: 2, time: 2, type: 'compaction/summary', data: { usage: { inputTokens: 10, outputTokens: 20 } },
    });
    k.emit('session/event', { id: 'sess-1' }, { seq: 3, time: 3, type: 'assistant/message', data: { turn: 2, step: 1, message: {} } });
    await new Promise((r) => setTimeout(r, 20));
    itog = k.nudzhPamyati.itog();
  } finally { s.vernut(); }
  if (itog.uchtenoVyzovov !== 2) throw new Error('учтено ' + itog.uchtenoVyzovov);
  if (itog.bezChisla !== 1) throw new Error('без числа ' + itog.bezChisla);
  // 2+39996+1236+5 = 41239, плюс 30 от сводки
  if (itog.neMenshe !== 41269) throw new Error('сумма ' + itog.neMenshe + ', ожидалось 41269');
});

await proba('ПРЕРВАННЫЙ вызов считается: расход состоялся и оплачен', async () => {
  const s = slushat(); let itog;
  try {
    const k = await podnyat({ predel: 100000 });
    k.emit('session/event', { id: 'sess-1' }, {
      seq: 1, time: 1, type: 'assistant/message',
      data: { turn: 1, step: 1, message: {}, interrupted: true, usage: { inputTokens: 40, outputTokens: 10 } },
    });
    await new Promise((r) => setTimeout(r, 20));
    itog = k.nudzhPamyati.itog();
  } finally { s.vernut(); }
  if (itog.neMenshe !== 50) throw new Error('прерванный вызов не посчитан: ' + itog.neMenshe);
});

await proba('🔴 ЖИВАЯ ФОРМА СОБЫТИЯ: фикстура снята с журнала, а не выдумана', async () => {
  // 03.09 стенд был ЗЕЛЁНЫМ при неработающем коде: фикстуры клали usage рядом с
  // type (плоско), потому что их писал тот же, кто писал код, — и с той же
  // догадкой. Проба проверяла с ТОЙ ЖЕ стороны, что проверяемое.
  // Эта фикстура повторяет форму, снятую с живого журнала платформы:
  // { seq, time, type, data: { turn, step, message, usage } } — по d.ts
  // SessionEvent и по строке журнала (содержимое сообщения обезличено).
  const zhivoe = {
    seq: 40, time: 1756900000000, type: 'assistant/message',
    data: {
      turn: 3, step: 1,
      message: { role: 'assistant', content: [{ type: 'text', text: '<обезличено>' }] },
      usage: { inputTokens: 2, outputTokens: 5, cacheReadTokens: 39996, cacheWriteTokens: 1236 },
    },
  };
  const s = slushat(); let itog;
  try {
    const k = await podnyat({ predel: 100000 });
    k.emit('session/event', { id: 'sess-1' }, zhivoe);
    await new Promise((r) => setTimeout(r, 20));
    itog = k.nudzhPamyati.itog();
  } finally { s.vernut(); }
  if (itog.uchtenoVyzovov !== 1) throw new Error('живое событие НЕ учтено — usage читается не из data');
  if (itog.neMenshe !== 41239) throw new Error('сумма ' + itog.neMenshe + ', ожидалось 41239');
});

await proba('🔴 ПЛОСКАЯ форма (наша прежняя догадка) НЕ засчитывается как расход', async () => {
  // Обратная проба: если код вернётся к чтению usage рядом с type, эта проба
  // позеленеет и предупредит, что мы снова читаем не оттуда.
  const s = slushat(); let itog;
  try {
    const k = await podnyat({ predel: 100000 });
    k.emit('session/event', { id: 'sess-1' }, {
      seq: 1, time: 1, type: 'assistant/message', turn: 1, step: 1, message: {},
      usage: { inputTokens: 500, outputTokens: 500 },
    });
    await new Promise((r) => setTimeout(r, 20));
    itog = k.nudzhPamyati.itog();
  } finally { s.vernut(); }
  if (itog.neMenshe !== 0) throw new Error('плоская форма засчитана — код читает usage мимо data');
  if (itog.bezChisla !== 1) throw new Error('плоское событие должно попасть в «без числа»');
});


// ═══ ОТМЕТКИ ПУТИ (05.09.2026) ═══════════════════════════════════════════════
// 🔴 Они про НАБЛЮДЕНИЕ, а не про решение: пакет ведёт себя точно так же, отметки
// только печатаются. Поэтому проб две пары — что печатаются и что НЕ влияют.

await proba('отметки пути: печатаются по одной на пересечённую, в порядке пути', async () => {
  const s = slushat()
  try {
    const k = await podnyat({ predel: 1000, dolyaTrevogi: 0.9, otmetkiPuti: [0.7, 0.5, 0.6] })
    k.nudzhPamyati.uchest({ inputTokens: 650 })
    const stroki = s.kriki.filter((x) => x.includes('отметка пути'))
    if (stroki.length !== 2) throw new Error(`отметок ${stroki.length}, ожидалось 2: ${stroki.join(' | ')}`)
    if (!stroki[0].includes('50%') || !stroki[1].includes('60%')) {
      throw new Error(`порядок не по пути: ${stroki.join(' | ')}`)
    }
    if (!stroki[0].includes('НАБЛЮДЕНИЕ')) throw new Error('строка не называет себя наблюдением')
  } finally { s.vernut() }
})

await proba('отметки пути: каждая печатается ОДИН раз за цикл', async () => {
  const s = slushat()
  try {
    const k = await podnyat({ predel: 1000, dolyaTrevogi: 0.9, otmetkiPuti: [0.5] })
    k.nudzhPamyati.uchest({ inputTokens: 600 })
    k.nudzhPamyati.uchest({ inputTokens: 700 })
    const n = s.kriki.filter((x) => x.includes('отметка пути')).length
    if (n !== 1) throw new Error(`отметка напечатана ${n} раз(а), ожидался 1`)
  } finally { s.vernut() }
})

await proba('🔴 отметки НЕ влияют на тревогу: тот же порог, тот же исход', async () => {
  const bez = slushat(); let krikiBez
  try {
    const k = await podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
    k.nudzhPamyati.uchest({ inputTokens: 900 })
    krikiBez = bez.kriki.filter((x) => x.includes('пора подтолкнуть')).length
  } finally { bez.vernut() }
  const s = slushat()
  try {
    const k = await podnyat({ predel: 1000, dolyaTrevogi: 0.8, otmetkiPuti: [0.5, 0.7] })
    k.nudzhPamyati.uchest({ inputTokens: 900 })
    const s1 = s.kriki.filter((x) => x.includes('пора подтолкнуть')).length
    if (s1 !== krikiBez) throw new Error(`с отметками тревог ${s1}, без — ${krikiBez}`)
  } finally { s.vernut() }
})

await proba('отметки пути: пустой список → ни одной строки (прежнее поведение)', async () => {
  const s = slushat()
  try {
    const k = await podnyat({ predel: 1000, dolyaTrevogi: 0.9 })
    k.nudzhPamyati.uchest({ inputTokens: 800 })
    const n = s.kriki.filter((x) => x.includes('отметка пути')).length
    if (n !== 0) throw new Error(`при пустом списке напечатано ${n} отметок`)
  } finally { s.vernut() }
})

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
