/**
 * Стенд привратника (Т2). Доказывает три вещи, каждую отдельной парой проб:
 *   1) выключено по умолчанию и в цепочку не встаём;
 *   2) включённый отвечает РОВНО тем словом, которое платформа считает
 *      разрешением, — и слово сверяется со словарём платформы, не с нашим
 *      представлением о нём;
 *   3) сорванная регистрация ГРОМКАЯ, а не молчаливая.
 *
 * 🔴 ЗАЧЕМ ПРОБА НА СЛОВАРЬ. Служба подтверждения нормализует любой возврат
 * вне словаря в 'unavailable' МОЛЧА. Значит опечатка в одной строке
 * превращает привратника, у которого нет права отказывать, в отказывающий
 * всем, и выглядит это как «отвечающего нет». Сверять надо с предметом.
 */
let postavitPrivratnika, itogPrivratnika, RAZRESHENO, PRICHINY_PUSTOGO_SCHYOTCHIKA
try {
  ;({ postavitPrivratnika, itogPrivratnika, RAZRESHENO, PRICHINY_PUSTOGO_SCHYOTCHIKA } = await import('../src/privratnik.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// Ожидание вынесено НАРУЖУ тела проб: прогонщик синхронный (см. проверку природы ниже).
const { createRequire } = await import('node:module');

let vsego = 0, proshlo = 0, slepot = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const vernulos = f();
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    // 🔴 ВОЗВРАТ ТЕЛА УЧИТЫВАЕТСЯ (05.09.2026, второй пакет с этой бедой за день).
    // Обёртка краснела только на ИСКЛЮЧЕНИИ, а возврат выбрасывала — и всякая проба вида
    // «вернуть true либо строку с причиной» была зелёной при любом содержимом. Поймано
    // порчей: подложила в обработчик `return 'deny'` — проба-сторож промолчала, хотя её
    // признак чужой возврат ВИДЕЛ (проверено тем же кодом отдельным файлом).
    if (typeof vernulos === 'string') throw new Error(vernulos);
    if (vernulos === false) throw new Error('тело пробы вернуло false без причины');
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + (e?.message ?? e)); }
};

/** Подставная платформа: запоминает, ЧТО и С КАКИМИ настройками зарегистрировали. */
// 🔴 УМОЛЧАНИЕ ЗДЕСЬ — СНИМАЛКА, а не пустота. Первая редакция подставной
// возвращала undefined, и три пробы покраснели на ИСПРАВНОМ предмете: платформа
// в жизни отдаёт функцию-снималку. Чинить надо было пробу, а не предмет.
const podstavnoj = (vozvrat = () => () => {}) => {
  const zapisi = [];
  const kriki = [];
  const ctx = { on: (imya, cb, opts) => { zapisi.push({ imya, cb, opts }); return vozvrat(); } };
  return { ctx, zapisi, kriki, gromko: (s) => kriki.push(String(s)) };
};

// ─── 1. Умолчание ────────────────────────────────────────────────────────────
proba('выключено: в цепочку НЕ встаём', () => {
  const p = podstavnoj();
  const u = postavitPrivratnika(p.ctx, false, p.gromko);
  if (p.zapisi.length !== 0) throw new Error('зарегистрировались при выключенном ключе');
  if (u.vstal !== false) throw new Error('vstal=' + u.vstal);
});

proba('выключено: ключ ПРОЧИТАН вслух (иначе «не доехало» = «выключено»)', () => {
  const p = podstavnoj();
  postavitPrivratnika(p.ctx, false, p.gromko);
  if (!p.kriki.some((s) => s.includes('прочитан') && s.includes('ВЫКЛЮЧЕНО'))) {
    throw new Error('нет строки о прочитанном ключе: ' + JSON.stringify(p.kriki));
  }
});

// ─── 2. Включённый ───────────────────────────────────────────────────────────
proba('включено: регистрация на approval/request', () => {
  const p = podstavnoj();
  postavitPrivratnika(p.ctx, true, p.gromko);
  if (p.zapisi.length !== 1) throw new Error('регистраций ' + p.zapisi.length);
  if (p.zapisi[0].imya !== 'approval/request') throw new Error('событие ' + p.zapisi[0].imya);
});

proba('ПОРЧА-НАСТОРОЖЕ: prepend именно true (без него участие — дело удачи)', () => {
  const p = podstavnoj();
  postavitPrivratnika(p.ctx, true, p.gromko);
  if (p.zapisi[0].opts?.prepend !== true) {
    throw new Error('prepend=' + JSON.stringify(p.zapisi[0].opts)
      + ': отвечающий без prepend не зовётся вовсе, если кто-то встал раньше');
  }
});

proba('включено: регистрация проверена ВОЗВРАТОМ, не «не бросило»', () => {
  const p = podstavnoj();
  const u = postavitPrivratnika(p.ctx, true, p.gromko);
  if (u.vstal !== true) throw new Error('vstal=' + u.vstal);
  if (!p.kriki.some((s) => s.includes('регистрация УДАЛАСЬ'))) throw new Error('нет строки об удавшейся регистрации');
});

// ─── 3. Ответ ────────────────────────────────────────────────────────────────
proba('спрос → отвечаем разрешением и считаем его', () => {
  const p = podstavnoj();
  const u = postavitPrivratnika(p.ctx, true, p.gromko);
  const otvet = p.zapisi[0].cb({ toolName: 'Bash' }, () => 'next-не-должен-зваться');
  if (otvet !== RAZRESHENO) throw new Error('ответ ' + JSON.stringify(otvet));
  if (u.sprosov !== 1 || u.razresheno !== 1) throw new Error('счёт ' + u.sprosov + '/' + u.razresheno);
  if (u.spisok[0]?.imya !== 'Bash') throw new Error('имя инструмента не записано: ' + JSON.stringify(u.spisok));
});

// 🔴 СЛУЖБЫ ПОДТВЕРЖДЕНИЯ МОЖЕТ НЕ БЫТЬ РЯДОМ — ЭТО СЛЕПОТА, А НЕ РАСХОЖДЕНИЕ.
// Она живёт в дереве платформы, а не в зависимостях пакета: у получателя без платформы
// разрешение её не найдёт. Молча зачесть сверку, которой не было, нельзя; но и краснеть
// на исправном предмете проба не должна — «проверить нечем» и «не сошлось» разные вещи.
// Ищем ДВУМЯ способами, оба без зашитых путей: обычным разрешением (так её найдёт
// получатель, у которого служба в зависимостях) и обходом вверх по дереву (так она
// находится у нас — служба живёт в дереве платформы, а не рядом с пакетом).
let putSluzhby = null;
try { putSluzhby = createRequire(import.meta.url).resolve('@deepseek-ai/dsh-user-approval'); }
catch { putSluzhby = null; }
if (!putSluzhby) {
  // Служба — часть ПЛАТФОРМЫ, а не зависимость плагина: рядом с пакетом её нет и не
  // должно быть. Корень платформы задаётся снаружи, умолчания НЕТ намеренно —
  // подставить чужой корень значит уверенно ответить про не тот узел.
  const koren = globalThis.process?.env?.DSH_KOREN_PLATFORMY ?? null;
  if (koren) {
    const fs0 = globalThis.process?.getBuiltinModule?.('node:fs') ?? null;
    const k = koren.replace(/\/+$/, '') + '/node_modules/@deepseek-ai/dsh-user-approval/lib/index.js';
    try { if (fs0?.existsSync(k)) putSluzhby = k; } catch { /* оставим слепоту */ }
  }
}
if (!putSluzhby) {
  slepot++;
  console.log('  СЛЕПОТА: служба подтверждения не найдена рядом — словарь исходов не сверен');
  console.log('    Это НЕ «сошлось»: сверка не состоялась. Служба — часть платформы, а не');
  console.log('    зависимость пакета. Чтобы сверить: DSH_KOREN_PLATFORMY=<корень платформы>');
} else {
  proba('СЛОВАРЬ: наш исход есть в OUTCOMES платформы (сверка с предметом)', () => {
    const fs = globalThis.process?.getBuiltinModule?.('node:fs') ?? null;
    if (!fs) throw new Error('нет доступа к fs — сверить словарь нечем');
    const ish = fs.readFileSync(putSluzhby, 'utf8');
    const m = ish.match(/const OUTCOMES = \[([^\]]*)\]/);
    if (!m) throw new Error('OUTCOMES в службе не найден — форма изменилась, сверка слепа');
    const slovar = m[1].match(/"([a-z-]+)"/g)?.map((x) => x.replace(/"/g, '')) ?? [];
    if (slovar.length === 0) throw new Error('словарь разобран пустым — проба слепа');
    if (!slovar.includes(RAZRESHENO)) {
      throw new Error(`наш исход «${RAZRESHENO}» НЕ в словаре платформы [${slovar.join(', ')}] — `
        + 'служба нормализует его в unavailable молча, то есть мы будем отказывать всем');
    }
  });
}

proba('ПРАВА ОТКАЗЫВАТЬ НЕТ: ветки rejected/cancelled в коде нет вовсе', () => {
  const fs = globalThis.process?.getBuiltinModule?.('node:fs') ?? null;
  if (!fs) throw new Error('нет доступа к fs');
  const ish = fs.readFileSync(new URL('../src/privratnik.js', import.meta.url), 'utf8');
  const kod = ish.split('\n').filter((s) => !s.trimStart().startsWith('*') && !s.trimStart().startsWith('//'));
  const vozvrat = kod.filter((s) => /return\s+['"](rejected|cancelled)['"]/.test(s));
  if (vozvrat.length > 0) throw new Error('появилась ветка отказа: ' + vozvrat.join(' | '));
  if (kod.length < 20) throw new Error('исходник разобран пустым — проба слепа');
});

// ─── 4. Сорванная регистрация ────────────────────────────────────────────────
proba('ПОРЧА: платформа не вернула снималку → ГРОМКИЙ отказ, не тишина', () => {
  const p = podstavnoj(() => undefined);
  const u = postavitPrivratnika(p.ctx, true, p.gromko);
  if (u.vstal !== false) throw new Error('vstal=' + u.vstal + ' при сорванной регистрации');
  if (!p.kriki.some((s) => s.includes('🔴') && s.includes('НЕ УДАЛАСЬ'))) {
    throw new Error('сорванная регистрация прошла молча: ' + JSON.stringify(p.kriki));
  }
});

proba('ПОРЧА: ctx.on бросил → отказ громкий, причина названа', () => {
  const p = podstavnoj(() => { throw new Error('цепочка занята'); });
  const u = postavitPrivratnika(p.ctx, true, p.gromko);
  if (u.vstal !== false) throw new Error('vstal=' + u.vstal);
  if (!p.kriki.some((s) => s.includes('цепочка занята'))) throw new Error('причина не названа: ' + JSON.stringify(p.kriki));
});

// ─── 5. Итог ─────────────────────────────────────────────────────────────────
proba('итог при НУЛЕ спросов называет ВСЕ четыре причины пустоты', () => {
  const p = podstavnoj();
  const u = postavitPrivratnika(p.ctx, true, p.gromko);
  const s = itogPrivratnika(u);
  if (!s.includes('спросов 0')) throw new Error('нет числа: ' + s);
  for (const pr of PRICHINY_PUSTOGO_SCHYOTCHIKA) {
    if (!s.includes(pr)) throw new Error('причина не названа: «' + pr + '» в строке: ' + s);
  }
  if (PRICHINY_PUSTOGO_SCHYOTCHIKA.length !== 4) {
    throw new Error('причин ' + PRICHINY_PUSTOGO_SCHYOTCHIKA.length + ', а замер дал четыре');
  }
});

proba('итог: «отказано > 0» — невозможное состояние, печатается криком', () => {
  const p = podstavnoj();
  const u = postavitPrivratnika(p.ctx, true, p.gromko);
  p.zapisi[0].cb({ toolName: 'Read' }, () => {});
  u.otkazano = 1;                       // состояние, которого код породить не может
  const s = itogPrivratnika(u);
  if (!s.includes('🔴') || !s.includes('считаем не то')) throw new Error('прошло тихо: ' + s);
});

proba('итог при выключенном ключе не выдаёт себя за работу', () => {
  const p = podstavnoj();
  const u = postavitPrivratnika(p.ctx, false, p.gromko);
  const s = itogPrivratnika(u);
  if (!s.includes('выключен')) throw new Error('строка не называет состояние: ' + s);
});

// ─── просьба Михалыча 05.09.2026: правило про next накрыть ПРОБОЙ ────────────
proba('🔴 ветка, не отвечающая, ОБЯЗАНА звать next — стережём по исходнику', () => {
  // Правило: у нас нет права отказывать, значит нет права и молча заканчивать цепочку.
  // Сегодня оно соблюдается тем, что ветка одна — мы отвечаем всегда, next недостижим.
  // Но правило, живущее в комментарии, уйдёт с ближайшей правкой: появится ветка
  // «не отвечаем» — и если она вернёт своё вместо next(), мы сами станем тем, кого
  // поймали в замере водопада (первый ответивший выключает остальных).
  // Проверяем ИСХОДНИКОМ, потому что недостижимую ветку прогоном не проверить.
  const { readFileSync } = createRequire(import.meta.url)('node:fs');
  const src = readFileSync(new URL('../src/privratnik.js', import.meta.url), 'utf8');
  const telo = src.slice(src.indexOf('const obrabotchik'), src.indexOf('// 🔴 prepend'));
  // ⚠️ ИЩЕМ return В ЛЮБОМ МЕСТЕ СТРОКИ, а не только в её начале. Первая редакция брала
  // /^\s*return\s+/ и пропускала однострочное `if (…) return 'deny';` — порча легла в
  // тело, а проба осталась зелёной. Признак не знал второй законной формы; поймано порчей,
  // не чтением.
  const vozvratov = [...telo.matchAll(/\breturn\s+([^;]+);/g)].map((m) => m[1].trim());
  const chuzhie = vozvratov.filter((v) => v !== 'RAZRESHENO' && !/^next\b/.test(v));
  if (chuzhie.length) {
    return `в обработчике появился возврат помимо RAZRESHENO и next(): ${chuzhie.join(' | ')}. `
      + 'Ветка, которая не отвечает, обязана звать next(), иначе мы обрываем цепочку молча';
  }
  return true;
});

console.log('  итог: ' + proshlo + ' из ' + vsego + (slepot ? ' · слепота ' + slepot : ''));
// Расхождение проверяется ПЕРВЫМ: оно про предмет, слепота — про инструмент.
process.exit(proshlo !== vsego ? 1 : (slepot ? 2 : 0));
