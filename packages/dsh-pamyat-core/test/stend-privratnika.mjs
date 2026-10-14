// RU: Парно проверяем привратника: выключен по умолчанию; включённый отвечает точным разрешающим словом из словаря платформы; отказ регистрации слышен. Любое слово вне словаря молча становится unavailable и превращает разрешающий механизм в отказ всем.
// EN: Test the gatekeeper in pairs: disabled by default; when enabled, it returns the exact permitting word from the platform dictionary; registration failure is audible. Any word outside the dictionary silently becomes unavailable and turns the permitting mechanism into rejection for everyone.
let postavitPrivratnika, itogPrivratnika, RAZRESHENO, PRICHINY_PUSTOGO_SCHYOTCHIKA
try {
  ;({ postavitPrivratnika, itogPrivratnika, RAZRESHENO, PRICHINY_PUSTOGO_SCHYOTCHIKA } = await import('../src/privratnik.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// RU: Ожидаем вне тела пробы: прогонщик синхронный.
// EN: Await outside the probe body: the runner is synchronous.
const { createRequire } = await import('node:module');

let vsego = 0, proshlo = 0, slepot = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const vernulos = f();
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    // RU: Тело пробы должно бросить ошибку или вернуть undefined. Любое другое значение, включая строку, false, 0, null и объект, означает отказ: игнорирование возврата даёт ложный успех.
    // EN: The probe body must throw an error or return undefined. Any other value, including a string, false, 0, null, or an object, means failure: ignoring returns produces false success.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + (e?.message ?? e)); }
};

// RU: Подставная платформа сохраняет регистрацию и настройки, затем возвращает функцию снятия, как настоящая. undefined вместо этой функции ломает исправные пробы.
// EN: The fake platform records registration and settings, then returns a removal function like the real platform. Returning undefined instead breaks healthy probes.
const podstavnoj = (vozvrat = () => () => {}) => {
  const zapisi = [];
  const kriki = [];
  const ctx = { on: (imya, cb, opts) => { zapisi.push({ imya, cb, opts }); return vozvrat(); } };
  return { ctx, zapisi, kriki, gromko: (s) => kriki.push(String(s)) };
};

// RU: Проверяем умолчание.
// EN: Test the default.
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

// RU: Проверяем включённый режим.
// EN: Test enabled mode.
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

// RU: Проверяем ответ.
// EN: Test the response.
proba('спрос → отвечаем разрешением и считаем его', () => {
  const p = podstavnoj();
  const u = postavitPrivratnika(p.ctx, true, p.gromko);
  const otvet = p.zapisi[0].cb({ toolName: 'Bash' }, () => 'next-не-должен-зваться');
  if (otvet !== RAZRESHENO) throw new Error('ответ ' + JSON.stringify(otvet));
  if (u.sprosov !== 1 || u.razresheno !== 1) throw new Error('счёт ' + u.sprosov + '/' + u.razresheno);
  if (u.spisok[0]?.imya !== 'Bash') throw new Error('имя инструмента не записано: ' + JSON.stringify(u.spisok));
});

// RU: Словарь службы подтверждения ищем обычным разрешением и обходом вверх без зашитых путей. Если платформы нет, сверка слепа: нельзя ни зачесть её, ни обвинить пакет в расхождении.
// EN: Find the confirmation-service dictionary through normal resolution and upward traversal without hardcoded paths. Without the platform, the comparison is unobservable: neither count it as passed nor report a package mismatch.
let putSluzhby = null;
try { putSluzhby = createRequire(import.meta.url).resolve('@deepseek-ai/dsh-user-approval'); }
catch { putSluzhby = null; }
if (!putSluzhby) {
  // RU: Корень платформы задаётся снаружи без умолчания: служба не является зависимостью плагина, а чужой корень даст ответ про другой узел.
  // EN: Supply the platform root externally with no default: the service is not a plugin dependency, and another root answers for a different node.
  const koren = globalThis.process?.env?.DSH_KOREN_PLATFORMY ?? null;
  if (koren) {
    const fs0 = globalThis.process?.getBuiltinModule?.('node:fs') ?? null;
    const k = koren.replace(/\/+$/, '') + '/node_modules/@deepseek-ai/dsh-user-approval/lib/index.js';
    try { if (fs0?.existsSync(k)) putSluzhby = k; } catch { /* RU: Сохраняем исход слепоты.
 * EN: Retain the unobservable outcome.
 */ }
  }
}
if (!putSluzhby) {
  slepot++;
  console.log('  СЛЕПОТА: служба подтверждения не найдена рядом — словарь исходов не сверен');
  console.log('    Это НЕ «сошлось»: сверка не состоялась. Служба — часть платформы, а не');
  console.log('    зависимость пакета. Чтобы сверить: DSH_KOREN_PLATFORMY=<корень платформы>');
} else {
  // RU: Разводим непрочитанный или изменившийся словарь и отсутствие нашего слова: первое — слепота прибора, второе — расхождение предмета. Всегда печатаем прочитанный путь; чужой пакет может менять формат независимо.
  // EN: Distinguish an unreadable or changed dictionary from a missing expected word: the former is an unobservable detector, the latter a subject mismatch. Always print the inspected path; the external package may change its format independently.
  const fs = globalThis.process?.getBuiltinModule?.('node:fs') ?? null;
  let slovar = null, prichinaSlepoty = null;
  if (!fs) prichinaSlepoty = 'нет доступа к node:fs — читать нечем';
  else {
    let ish = null;
    try { ish = fs.readFileSync(putSluzhby, 'utf8'); }
    catch (e) { prichinaSlepoty = `файл не прочитан (${e?.code ?? 'причина не названа'})`; }
    if (ish !== null) {
      const m = ish.match(/const OUTCOMES = \[([^\]]*)\]/);
      if (!m) prichinaSlepoty = 'OUTCOMES в службе не найден — форма чужого пакета изменилась';
      else {
        const nabor = m[1].match(/"([a-z-]+)"/g)?.map((x) => x.replace(/"/g, '')) ?? [];
        if (nabor.length === 0) prichinaSlepoty = 'словарь разобран пустым — разбор не годится';
        else slovar = nabor;
      }
    }
  }
  if (slovar === null) {
    slepot++;
    console.log(`  СЛЕПОТА: словарь исходов НЕ СВЕРЕН — ${prichinaSlepoty}`);
    console.log(`    читала: ${putSluzhby}`);
    console.log('    Это НЕ «сошлось» и НЕ «наш исход неверен»: сверка не состоялась. Чужой');
    console.log('    пакет обновляется без нас, и его форма — не наш дефект.');
  } else {
    proba('СЛОВАРЬ: наш исход есть в OUTCOMES платформы (сверка с предметом)', () => {
      if (!slovar.includes(RAZRESHENO)) {
        throw new Error(`наш исход «${RAZRESHENO}» НЕ в словаре платформы [${slovar.join(', ')}] — `
          + 'служба нормализует его в unavailable молча, то есть мы будем отказывать всем');
      }
    });
    console.log(`    (словарь прочитан: ${putSluzhby} · исходов ${slovar.length})`);
  }
}

// RU: Итог должен появляться в журнале до dispose, иначе SIGKILL, OOM или падение уничтожат счётчик без следа. Парная проба ограничивает частоту, чтобы итог не печатался при каждом запросе.
// EN: The summary must reach the journal before dispose, or SIGKILL, OOM, or a crash destroys the counter without a trace. A paired probe limits frequency so the summary is not printed on every query.
proba('З1: итог печатается на ПЕРВОМ спросе — участие видно сразу', () => {
  const p = podstavnoj();
  postavitPrivratnika(p.ctx, true, p.gromko);
  const obr = p.zapisi[0].cb;
  p.kriki.length = 0;
  obr({ toolName: 'proba-1' }, () => {});
  const itogi = p.kriki.filter((s) => /привратник: спросов /.test(s));
  if (itogi.length !== 1) throw new Error('итогов после первого спроса: ' + itogi.length);
});

proba('З1-бис: со второго по девятый итог НЕ печатается — иначе журнал заплывёт', () => {
  const p = podstavnoj();
  postavitPrivratnika(p.ctx, true, p.gromko);
  const obr = p.zapisi[0].cb;
  obr({ toolName: 'proba-1' }, () => {});   /* RU: Первый итог разрешён.
 * EN: The first summary is allowed.
 */
  p.kriki.length = 0;
  for (let i = 2; i <= 9; i++) obr({ toolName: 'proba-' + i }, () => {});
  const itogi = p.kriki.filter((s) => /привратник: спросов /.test(s));
  if (itogi.length !== 0) throw new Error('лишних итогов: ' + itogi.length);
});

proba('З1-трет: на ДЕСЯТОМ спросе итог печатается снова', () => {
  const p = podstavnoj();
  postavitPrivratnika(p.ctx, true, p.gromko);
  const obr = p.zapisi[0].cb;
  for (let i = 1; i <= 9; i++) obr({ toolName: 'proba-' + i }, () => {});
  p.kriki.length = 0;
  obr({ toolName: 'proba-10' }, () => {});
  const itogi = p.kriki.filter((s) => /привратник: спросов 10 /.test(s));
  if (itogi.length !== 1) throw new Error('итогов на десятом: ' + itogi.length);
});

proba('ПРАВА ОТКАЗЫВАТЬ НЕТ: ветки rejected/cancelled в коде нет вовсе', () => {
  const fs = globalThis.process?.getBuiltinModule?.('node:fs') ?? null;
  if (!fs) throw new Error('нет доступа к fs');
  const ish = fs.readFileSync(new URL('../src/privratnik.js', import.meta.url), 'utf8');
  const kod = ish.split('\n').filter((s) => !s.trimStart().startsWith('*') && !s.trimStart().startsWith('//'));
  const vozvrat = kod.filter((s) => /return\s+['"](rejected|cancelled)['"]/.test(s));
  if (vozvrat.length > 0) throw new Error('появилась ветка отказа: ' + vozvrat.join(' | '));
  if (kod.length < 20) throw new Error('исходник разобран пустым — проба слепа');
});

// RU: Проверяем сорванную регистрацию.
// EN: Test failed registration.
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

// RU: Проверяем итог.
// EN: Test the summary.
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
  u.otkazano = 1;                       /* RU: Подставляем состояние, недостижимое штатным кодом.
 * EN: Supply a state unreachable through normal code.
 */
  const s = itogPrivratnika(u);
  if (!s.includes('🔴') || !s.includes('считаем не то')) throw new Error('прошло тихо: ' + s);
});

proba('итог при выключенном ключе не выдаёт себя за работу', () => {
  const p = podstavnoj();
  const u = postavitPrivratnika(p.ctx, false, p.gromko);
  const s = itogPrivratnika(u);
  if (!s.includes('выключен')) throw new Error('строка не называет состояние: ' + s);
});

// RU: Проверяем правило передачи цепочки через next.
// EN: Test chain forwarding through next.
proba('🔴 ветка, не отвечающая, ОБЯЗАНА звать next — стережём по исходнику', () => {
  // RU: Не отвечающий привратник обязан вызвать next(), а не завершить цепочку своим возвратом. Сейчас ветка недостижима, поэтому проверяем исходник, чтобы будущая ветка не выключила остальных отвечающих.
  // EN: A gatekeeper that does not answer must call next() rather than end the chain with its own return. The branch is currently unreachable, so inspect source to prevent a future branch from disabling other responders.
  const { readFileSync } = createRequire(import.meta.url)('node:fs');
  const src = readFileSync(new URL('../src/privratnik.js', import.meta.url), 'utf8');
  const telo = src.slice(src.indexOf('const obrabotchik'), src.indexOf('// 🔴 prepend'));
  // RU: Ищем return в любом месте строки, включая if (…) return и голый return;. Значение необязательно и не переходит на новую строку: иначе комментарий может склеиться со следующей точкой с запятой и дать ложный отказ.
  // EN: Find return anywhere on a line, including if (…) return and bare return;. Its value is optional and must not cross a newline; otherwise a comment can join the next semicolon and cause a false rejection.
  const vozvratov = [...telo.matchAll(/\breturn\b[ \t]*([^;\n]*);/g)].map((m) => m[1].trim());
  const chuzhie = vozvratov.filter((v) => v !== 'RAZRESHENO' && !/^next\b/.test(v))
    .map((v) => v === '' ? 'ГОЛЫЙ return; (цепочка обрывается молча)' : v);
  if (chuzhie.length) {
    return `в обработчике появился возврат помимо RAZRESHENO и next(): ${chuzhie.join(' | ')}. `
      + 'Ветка, которая не отвечает, обязана звать next(), иначе мы обрываем цепочку молча';
  }
  return true;
});

console.log('  итог: ' + proshlo + ' из ' + vsego + (slepot ? ' · слепота ' + slepot : ''));
// RU: Расхождение предмета имеет приоритет над слепотой инструмента.
// EN: Subject mismatch takes precedence over an unobservable detector.
process.exit(proshlo !== vsego ? 1 : (slepot ? 2 : 0));
