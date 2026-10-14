// RU: Проверяем функции хранилища, а не загрузку пакета. Сначала заведомо исправный контроль: его отказ делает остальные результаты недостоверными.
// EN: Test storage functions rather than package loading. Start with a known healthy control; if it fails, the remaining results are unreliable.
import { mkdtempSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let otkrytHranilishche, zagruzitDrajver, zavestiZhurnal, blizost
try {
  ;({ otkrytHranilishche, zagruzitDrajver, blizost } = await import('../src/hranilishche.js'))
  ;({ zavestiZhurnal } = await import('../src/zhurnal.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// RU: Число берём из дерева во время прогона, чтобы справочное значение не устаревало.
// EN: Read the count from the tree during the run so a documented constant cannot go stale.
{
  const { createRequire } = await import('node:module')
  const trebovat = createRequire(import.meta.url)
  const versiya = (imya) => {
    try { return trebovat(`@deepseek-ai/${imya}/package.json`).version } catch { return 'НЕ НАЙДЕНА' }
  }
  console.log(`платформа: cordis ${versiya('cordis')} · schemastery ${versiya('schemastery')} · Node ${process.version}`)
}

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const vernulos = f();
    // RU: Прогонщик синхронный и не ждёт промис: async-тело могло бы зачесть успех до исключения внутри. Возвращённый промис означает отказ пробы.
    // EN: The runner is synchronous and does not await promises: an async body could record success before an inner exception. A returned promise fails the probe.
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    // RU: Тело пробы должно бросить ошибку или вернуть undefined. Любое другое значение, включая строку, false, 0, null и объект, означает отказ: игнорирование возврата даёт ложный успех.
    // EN: The probe body must throw an error or return undefined. Any other value, including a string, false, 0, null, or an object, means failure: ignoring returns produces false success.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 120)); }
};
const dolzhnoUpast = (kod, f) => {
  try { f(); } catch (e) {
    if (e.code === kod) return e;
    throw new Error('ожидался код ' + kod + ', получен ' + e.code);
  }
  throw new Error('не упало, а должно было (' + kod + ')');
};

const katalog = vremennyj(join(tmpdir(), 'pamyat-stend-'));
const put = join(katalog, 'pamyat.db');

proba('стенд годен: на исправном предмете хранилище открывается и пишет', () => {
  const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'проба пера', istochnik: 'session#1' });
  if (!(id > 0)) throw new Error('запись не вернула id');
  const zapisi = h.prochitat({ agent: 'stend' });
  if (zapisi.length !== 1) throw new Error('прочитано ' + zapisi.length + ' вместо 1');
  if (zapisi[0].soderzhim !== 'проба пера') throw new Error('содержимое не то');
  if (zapisi[0].istochnik !== 'session#1') throw new Error('ссылка на источник потеряна');
  h.zakryt();
});

proba('ПОРЧА: нет модуля хранилища → отказ с внятным текстом, а не пустая память', () => {
  const e = dolzhnoUpast('PAMYAT_NET_HRANILISHCHA', () => zagruzitDrajver('node:sqlite-takogo-net'));
  for (const slovo of ['НЕ РАБОТАЕТ', 'отказ', 'Node']) {
    if (!e.message.includes(slovo)) throw new Error('в сообщении нет слова «' + slovo + '»');
  }
});

proba('ПОРЧА: база не открывается → отказ, а не тишина', () => {
  dolzhnoUpast('PAMYAT_BAZA_NE_OTKRYLAS', () => otkrytHranilishche('/proc/net/dev/pamyat.db'));
});

proba('ПОРЧА: путь не задан → отказ', () => {
  dolzhnoUpast('PAMYAT_NET_PUTI', () => otkrytHranilishche(undefined));
});

// RU: A-N-1948 №3 (№23): новая база создаётся без доступа прочим учёткам; режим существующей не меняется.
// EN: A-N-1948 №3 (№23): a new database gets no access for others; an existing database keeps its mode.
proba('ПРАВА: новая база без доступа прочим; существующая не тронута', () => {
  const put = join(katalog, 'prava.db'); otkrytHranilishche(put).zakryt();
  const m = statSync(put).mode & 0o777; if (m & 0o007) throw new Error('новая база ' + m.toString(8));
  const est = join(katalog, 'bylo.db'); writeFileSync(est, ''); chmodSync(est, 0o644); otkrytHranilishche(est).zakryt();
  const m2 = statSync(est).mode & 0o777; if (m2 !== 0o644) throw new Error('существующая база стала ' + m2.toString(8));
});

proba('ПОРЧА: неполная запись отвергается', () => {
  const h = otkrytHranilishche(join(katalog, 'p2.db'));
  dolzhnoUpast('PAMYAT_NEPOLNAYA_ZAPIS', () => h.zapisat({ agent: 'stend', klass: 'x' }));
  // RU: A-N-1948 №3 (№2): содержимое из одних пробелов — та же неполная запись. EN: whitespace-only content is incomplete too.
  dolzhnoUpast('PAMYAT_NEPOLNAYA_ZAPIS', () => h.zapisat({ agent: 'stend', klass: 'x', soderzhim: '  \n\t ' }));
  h.zakryt();
});

proba('РАЗЛИЧЕНИЕ: пустая база отдаёт пустой список и НЕ считается отказом', () => {
  const h = otkrytHranilishche(join(katalog, 'p3.db'));
  const zapisi = h.prochitat({ agent: 'nikogo-net' });
  if (!Array.isArray(zapisi) || zapisi.length !== 0) throw new Error('ожидался пустой список');
  if (h.skolkoZapisej('nikogo-net') !== 0) throw new Error('счёт не ноль');
  h.zakryt();
});

proba('ВЕРА: записывается и читается', () => {
  const h = otkrytHranilishche(join(katalog, 'v1.db'));
  h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'проверенное знание', vera: 0.9 });
  const z = h.prochitat({ agent: 'stend' })[0];
  if (z.vera !== 0.9) throw new Error('вера ' + z.vera);
  h.zakryt();
});

proba('ГЛАВНОЕ: «веру не измеряли» ОТЛИЧАЕТСЯ от «вера ноль»', () => {
  const h = otkrytHranilishche(join(katalog, 'v2.db'));
  h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'неоценённое' });
  h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'признано негодным', vera: 0 });
  const zapisi = h.prochitat({ agent: 'stend' });
  const neizmereno = zapisi.find((z) => z.soderzhim === 'неоценённое');
  const nol = zapisi.find((z) => z.soderzhim === 'признано негодным');
  if (neizmereno.vera !== null) throw new Error('неизмеренная вера стала ' + neizmereno.vera);
  if (nol.vera !== 0) throw new Error('измеренный ноль стал ' + nol.vera);
  if (neizmereno.vera === nol.vera) throw new Error('схлопнулись — ветка verify потеряет смысл');
  h.zakryt();
});

proba('ПОРЧА: негодная вера отвергается, а не подменяется нулём', () => {
  const h = otkrytHranilishche(join(katalog, 'v3.db'));
  for (const durnoe of [1.5, -0.1, 'много', NaN]) {
    let upalo = false;
    try { h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'x', vera: durnoe }); }
    catch (e) { upalo = e.code === 'PAMYAT_VERA_NEGODNA'; }
    if (!upalo) throw new Error('принято негодное значение: ' + String(durnoe));
  }
  h.zakryt();
});

proba('МИГРАЦИЯ: база без столбца vera читается, старым строкам вера НЕ выдумывается', () => {
  const put = join(katalog, 'v4.db');
  const { DatabaseSync } = zagruzitDrajver();
  const staraya = new DatabaseSync(put);
  staraya.exec('CREATE TABLE zapisi (id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, klass TEXT NOT NULL, soderzhim TEXT NOT NULL, istochnik TEXT, sozdano INTEGER NOT NULL)');
  staraya.prepare('INSERT INTO zapisi (agent, klass, soderzhim, sozdano) VALUES (?,?,?,?)').run('stend', 'zametka', 'из прошлой версии', Date.now());
  staraya.close();
  const h = otkrytHranilishche(put);
  const z = h.prochitat({ agent: 'stend' })[0];
  if (z.soderzhim !== 'из прошлой версии') throw new Error('старая строка потеряна');
  if (z.vera !== null) throw new Error('старой строке приписали веру ' + z.vera);
  h.zakryt();
});

proba('🔴 ЗАПИСЬ ПЕРЕЖИВАЕТ ПЕРЕОТКРЫТИЕ ХРАНИЛИЩА (урок инцидента 03.09)', () => {
  // RU: Проверяем не только вставку, но и чтение после закрытия и повторного открытия: принятая запись может сломать следующую загрузку.
  // EN: Check insertion and reading after closing and reopening; an accepted record can break the next load.
  const put = join(katalog, 'perezagruzka.db');
  const h1 = otkrytHranilishche(put);
  const id = h1.zapisat({
    agent: 'stend', klass: 'navyk', soderzhim: 'знание, которое обязано пережить перезапуск',
    istochnik: 'session#7-9', vera: 0.75, bezPodtverzhdeniya: true,
  });
  h1.zakryt();

  const h2 = otkrytHranilishche(put);          /* RU: Новый экземпляр имитирует перезапуск службы.
 * EN: A new instance simulates service restart.
 */
  const zapisi = h2.prochitat({ agent: 'stend' });
  if (zapisi.length !== 1) throw new Error('после переоткрытия записей ' + zapisi.length);
  const z = zapisi[0];
  if (z.id !== id) throw new Error('опознаватель изменился');
  if (z.soderzhim !== 'знание, которое обязано пережить перезапуск') throw new Error('содержимое искажено');
  if (z.istochnik !== 'session#7-9') throw new Error('ссылка на источник потеряна');
  if (z.vera !== 0.75) throw new Error('вера потеряна: ' + z.vera);
  if (z.bez_podtverzhdeniya !== 1) throw new Error('отметка о подтверждении потеряна');
  // RU: Журнал также должен пережить повторное открытие.
  // EN: The journal must also survive reopening.
  const zh = zavestiZhurnal(h2.baza);
  h2.zakryt();
  if (!zh) throw new Error('журнал не поднялся на переоткрытой базе');
});

// RU: Причина отказа не должна быть пустой при пустом message. Оператор ?? не заменяет пустую строку; AggregateError от fetch может иметь такой message. Подставной драйвер вводит именно эту ошибку.
// EN: The failure reason must remain nonempty when message is empty. ?? does not replace an empty string; fetch may produce an AggregateError with such a message. The fake driver supplies that exact error.
proba('причина отказа непуста даже при пустом message (AggregateError)', () => {
  const drajver_s_pustym_message = {
    DatabaseSync: function () { throw new AggregateError([new Error('соединение отвергнуто')], ''); },
  };
  let brosheno = null;
  try { otkrytHranilishche(join(katalog, 'proba.db'), { drajver: drajver_s_pustym_message }); }
  catch (e) { brosheno = e; }
  if (!brosheno) throw new Error('отказа не случилось — проба не достала ветку');
  if (brosheno.code !== 'PAMYAT_BAZA_NE_OTKRYLAS') throw new Error('чужой код: ' + brosheno.code);
  const hvost = String(brosheno.message).split('Причина:')[1] ?? '';
  if (!hvost.trim()) throw new Error('«Причина:» с пустотой — нулевое слияние вернулось');
  if (!hvost.includes('AggregateError')) throw new Error('класс ошибки потерян: ' + hvost.trim());
  if (!hvost.includes('соединение отвергнуто'))
    throw new Error('внутренняя причина потеряна: ' + hvost.trim());
});


// RU: Парные пробы близости проверяют срабатывание и несрабатывание по каждой оси.
// EN: Paired proximity probes test matching and nonmatching on each axis.

proba('blizost: одинаковый текст даёт 1, непохожий — заметно меньше', () => {
  const odin = 'обёртка стенда выбрасывала возврат тела пробы';
  if (blizost(odin, odin) !== 1) throw new Error('на себе не единица: ' + blizost(odin, odin));
  const drugoj = 'реестр публикаций отвечает четыреста четыре несуществующему имени';
  const b = blizost(odin, drugoj);
  if (!(b < 0.2)) throw new Error('непохожие тексты дали ' + b);
});

proba('blizost: сравнивать нечем → null, а НЕ ноль (отказ измерения ≠ непохожесть)', () => {
  if (blizost('', 'длинные слова тексту нужны') !== null) throw new Error('пустой вход дал не null');
  if (blizost('а б в го', 'длинные слова тексту нужны') !== null) throw new Error('текст из коротких слов дал не null');
  if (blizost(null, undefined) !== null) throw new Error('пустота дала не null');
  // RU: Нулевой результат должен быть достижим, чтобы null не поглощал все случаи.
  // EN: A zero result must be reachable so null does not absorb every case.
  const nol = blizost('обёртка стенда выбрасывала возврат', 'реестр публикаций отвечает несуществующему');
  if (nol !== 0) throw new Error('заведомо непересекающиеся тексты дали ' + nol + ', а не 0');
});

proba('blizhajshaya: три исхода различаются РАЗНЫМИ словами', () => {
  const h = otkrytHranilishche(join(katalog, 'blizost-ishody.db'));
  const tekst = 'знание дистилляции теряется молча когда модель возвращает прозу';
  const pusto = h.blizhajshaya({ agent: 'stend', klass: 'urok', soderzhim: tekst });
  if (pusto.ishod !== 'ne-s-chem') throw new Error('пустой класс дал исход ' + pusto.ishod);
  h.zapisat({ agent: 'stend', klass: 'urok', soderzhim: tekst + ' и потому запись пропадает' });
  const est = h.blizhajshaya({ agent: 'stend', klass: 'urok', soderzhim: tekst });
  if (est.ishod !== 'sravneno') throw new Error('при наличии записи исход ' + est.ishod);
  if (!(est.blizost > 0.5)) throw new Error('близость почти одинаковых текстов ' + est.blizost);
  if (est.sravneno_s !== 1) throw new Error('окно сравнения не названо: ' + est.sravneno_s);
  const nechem = h.blizhajshaya({ agent: 'stend', klass: 'urok', soderzhim: 'а б в го' });
  if (nechem.ishod !== 'sravnit-nechem') throw new Error('текст без длинных слов дал ' + nechem.ishod);
  h.zakryt();
});

proba('blizhajshaya: ближайшая выбирается ПО БЛИЗОСТИ, а не по свежести', () => {
  // RU: Похожую запись кладём первой, непохожую последней: ORDER BY sozdano DESC не должен подменить близость свежестью.
  // EN: Insert the similar record first and the dissimilar one last: ORDER BY sozdano DESC must not substitute recency for proximity.
  const h = otkrytHranilishche(join(katalog, 'blizost-svezhest.db'));
  const iskomoe = 'фильтр запирает объявленный секрет на входе в память';
  h.zapisat({ agent: 'stend', klass: 'urok', soderzhim: iskomoe + ' и отклоняет запись', sozdano: 1000 });
  const svezhaya = h.zapisat({ agent: 'stend', klass: 'urok', soderzhim: 'реестр публикаций отвечает несуществующему имени', sozdano: 9000 });
  const r = h.blizhajshaya({ agent: 'stend', klass: 'urok', soderzhim: iskomoe });
  if (r.id === svezhaya) throw new Error('вернулась СВЕЖАЯ, а не близкая');
  if (!(r.blizost > 0.5)) throw new Error('близость ' + r.blizost + ' — вернулась не та запись');
  if (r.sravneno_s !== 2) throw new Error('окно ' + r.sravneno_s + ' вместо 2');
  h.zakryt();
});

proba('blizhajshaya: чужой класс и чужой агент в сравнение НЕ попадают', () => {
  const h = otkrytHranilishche(join(katalog, 'blizost-oblast.db'));
  const tekst = 'подставной предмет обязан нести свойство ради которого прибор существует';
  h.zapisat({ agent: 'stend', klass: 'fakt', soderzhim: tekst });
  h.zapisat({ agent: 'sosed', klass: 'urok', soderzhim: tekst });
  const r = h.blizhajshaya({ agent: 'stend', klass: 'urok', soderzhim: tekst });
  if (r.ishod !== 'ne-s-chem') throw new Error('в область попало чужое: ' + JSON.stringify(r));
  h.zakryt();
});

proba('blizhajshaya: без обязательных полей — отказ, а не тихая пустота', () => {
  const h = otkrytHranilishche(join(katalog, 'blizost-otkaz.db'));
  dolzhnoUpast('PAMYAT_NEPOLNYJ_ZAPROS', () => h.blizhajshaya({ klass: 'urok', soderzhim: 'длинные слова тут' }));
  dolzhnoUpast('PAMYAT_NEPOLNYJ_ZAPROS', () => h.blizhajshaya({ agent: 'stend', soderzhim: 'длинные слова тут' }));
  h.zakryt();
});

// RU: Парные пробы подтверждения проверяют действие метода и его границы.
// EN: Paired confirmation probes test the method’s action and limits.

proba('статус: у записи, не ждавшей подтверждения, — «не требовалось», а не пустота', () => {
  const h = otkrytHranilishche(join(katalog, 'podtv-chistaya.db'));
  const id = h.zapisat({ agent: 'stend', klass: 'fakt', soderzhim: 'обычная запись без спроса' });
  const st = h.statusPodtverzhdeniya(h.poId(id));
  if (st.status !== 'ne-trebovalos') throw new Error('статус ' + st.status);
  if (st.kem !== null) throw new Error('назван подтвердивший там, где его не было: ' + st.kem);
  h.zakryt();
});

proba('статус: запись с флагом и без отметки — «записано без подтверждения»', () => {
  const h = otkrytHranilishche(join(katalog, 'podtv-flag.db'));
  const id = h.zapisat({ agent: 'stend', klass: 'ogranichenie', soderzhim: 'нельзя трогать чужие службы', bezPodtverzhdeniya: true });
  const st = h.statusPodtverzhdeniya(h.poId(id));
  if (st.status !== 'bez-podtverzhdeniya') throw new Error('статус ' + st.status);
  h.zakryt();
});

proba('podtverdit: отметка ложится, ФЛАГ ОСТАЁТСЯ — след «жила неподтверждённой» не стирается', () => {
  const h = otkrytHranilishche(join(katalog, 'podtv-est.db'));
  const id = h.zapisat({ agent: 'stend', klass: 'ogranichenie', soderzhim: 'нельзя публиковать до беты', bezPodtverzhdeniya: true });
  const r = h.podtverdit({ id, kem: 'владелец', kogda: 1757000000000, pochemu: 'сказано голосом' });
  if (r.kem !== 'владелец') throw new Error('вернулось не то имя: ' + r.kem);
  const zapis = h.poId(id);
  if (Number(zapis.bez_podtverzhdeniya) !== 1) throw new Error('флаг снят — след того, что запись жила неподтверждённой, потерян');
  const st = h.statusPodtverzhdeniya(zapis);
  if (st.status !== 'podtverzhdeno-pozzhe') throw new Error('статус ' + st.status);
  if (st.kem !== 'владелец') throw new Error('статус не называет подтвердившего');
  if (!st.stroka.includes('подтверждено позже')) throw new Error('строка не называет, что подтверждение пришло позже: ' + st.stroka);
  h.zakryt();
});

proba('podtverdit: запись БЕЗ флага подтвердить нельзя — подпись там, где не спрашивали', () => {
  const h = otkrytHranilishche(join(katalog, 'podtv-ne-trebovalos.db'));
  const id = h.zapisat({ agent: 'stend', klass: 'fakt', soderzhim: 'класс auto, человека не спрашивали' });
  dolzhnoUpast('PAMYAT_PODTVERZHDENIE_NE_TREBOVALOS', () => h.podtverdit({ id, kem: 'кто-то' }));
  const st = h.statusPodtverzhdeniya(h.poId(id));
  if (st.status !== 'ne-trebovalos') throw new Error('отметка всё-таки легла: ' + st.status);
  h.zakryt();
});

proba('podtverdit: второй подтвердивший НЕ затирает первого', () => {
  const h = otkrytHranilishche(join(katalog, 'podtv-povtor.db'));
  const id = h.zapisat({ agent: 'stend', klass: 'navyk', soderzhim: 'повторное подтверждение', bezPodtverzhdeniya: true });
  h.podtverdit({ id, kem: 'первый' });
  const e = dolzhnoUpast('PAMYAT_PODTVERZHDENIE_UZHE_EST', () => h.podtverdit({ id, kem: 'второй' }));
  if (!e.message.includes('первый')) throw new Error('отказ не называет, кто подтвердил раньше: ' + e.message);
  const st = h.statusPodtverzhdeniya(h.poId(id));
  if (st.kem !== 'первый') throw new Error('первого затёрли: ' + st.kem);
  h.zakryt();
});

proba('podtverdit: без имени — отказ, а не умолчание', () => {
  const h = otkrytHranilishche(join(katalog, 'podtv-bez-imeni.db'));
  const id = h.zapisat({ agent: 'stend', klass: 'navyk', soderzhim: 'подпись без автора', bezPodtverzhdeniya: true });
  dolzhnoUpast('PAMYAT_PODTVERZHDENIE_BEZ_IMENI', () => h.podtverdit({ id, kem: '   ' }));
  dolzhnoUpast('PAMYAT_PODTVERZHDENIE_BEZ_IMENI', () => h.podtverdit({ id }));
  if (h.statusPodtverzhdeniya(h.poId(id)).status !== 'bez-podtverzhdeniya') throw new Error('что-то легло при отказе');
  h.zakryt();
});

proba('podtverdit: негодная отметка НЕ переписывается — след чужой ошибки остаётся', () => {
  const h = otkrytHranilishche(join(katalog, 'podtv-negodnaya.db'));
  const id = h.zapisat({ agent: 'stend', klass: 'navyk', soderzhim: 'кто-то положил мусор в поле', bezPodtverzhdeniya: true });
  // RU: Порчу вносим через тот же драйвер: подмена файла проверяла бы устойчивость SQLite вместо поведения метода.
  // EN: Introduce the mutation through the same driver; replacing the file would test SQLite resilience rather than method behavior.
  const syraya = otkrytHranilishche(join(katalog, 'podtv-negodnaya.db'));
  syraya.zakryt();
  const { DatabaseSync } = zagruzitDrajver();
  const b = new DatabaseSync(join(katalog, 'podtv-negodnaya.db'));
  b.prepare('UPDATE zapisi SET podtverzhdenie = ? WHERE id = ?').run('это не json', id);
  b.close();
  const h2 = otkrytHranilishche(join(katalog, 'podtv-negodnaya.db'));
  if (h2.statusPodtverzhdeniya(h2.poId(id)).status !== 'otmetka-negodna') throw new Error('негодная отметка не названа');
  dolzhnoUpast('PAMYAT_PODTVERZHDENIE_OTMETKA_NEGODNA', () => h2.podtverdit({ id, kem: 'кто-то' }));
  if (h2.poId(id).podtverzhdenie !== 'это не json') throw new Error('негодную отметку переписали');
  h2.zakryt();
});

proba('статус: отметка на записи, не ждавшей подтверждения, названа ЛИШНЕЙ, а не принята молча', () => {
  const h = otkrytHranilishche(join(katalog, 'podtv-lishnyaya.db'));
  const id = h.zapisat({ agent: 'stend', klass: 'fakt', soderzhim: 'подпись без спроса' });
  h.zakryt();
  const { DatabaseSync } = zagruzitDrajver();
  const b = new DatabaseSync(join(katalog, 'podtv-lishnyaya.db'));
  b.prepare('UPDATE zapisi SET podtverzhdenie = ? WHERE id = ?').run(JSON.stringify({ kem: 'самозванец', kogda: 1 }), id);
  b.close();
  const h2 = otkrytHranilishche(join(katalog, 'podtv-lishnyaya.db'));
  const st = h2.statusPodtverzhdeniya(h2.poId(id));
  if (st.status !== 'otmetka-lishnyaya') throw new Error('статус ' + st.status + ' — подпись без спроса принята как настоящая');
  h2.zakryt();
});

rmSync(katalog, { recursive: true, force: true });
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
