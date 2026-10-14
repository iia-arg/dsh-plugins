/**
 * СТЕНД ПРИБОРА П2 — по воротам приёмки В1–В8, семь порч.
 *
 * 🔴 СТЕНД ДО НАСТОЯЩЕГО КОНЦА (В7): подставной профиль с настоящим конфигом и настоящими
 * каталогами пакетов, подставной РЕЕСТР ПЛАГИНОВ, настоящий вызов прибора отдельным процессом.
 *
 * 🔴 A-N-755 (24.09.2026): прибор берёт принятое из реестра плагинов (--reestr-plaginov), а ключ
 * --summy отвергает. Стенд до 04.10 подавал --summy во все вызовы и стоял МЁРТВЫМ: 34 из 41
 * красные на ИСПРАВНОМ приборе — красное, которое все привыкли не читать. Оживлён 04.10.2026:
 * пробы переведены на подставной реестр; пробы предметов, снятых A-N-755 (второй режим свёртки,
 * «вне области приёмки», статусы строк файла сумм), сняты и перечислены ниже, у снятия
 * названа причина.
 * Первая проба — на заведомо исправном: если она красная, красное всех прочих ничего
 * не значит, и разбирать надо стенд, а не предмет.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, cpSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PRIBOR = join(dirname(fileURLToPath(import.meta.url)), '..', 'pered-podyomom.mjs');
let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v && typeof v.then === 'function') throw new Error('тело пробы ОЖИДАЮЩЕЕ, прогонщик синхронный');
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 170)); }
};

const kat = mkdtempSync(join(tmpdir(), 'p2-stend-'));
const profil = join(kat, 'profil');
const mods = join(profil, 'node_modules');
mkdirSync(mods, { recursive: true });

// Три настоящих пакета — берём готовые, чтобы канон снимал настоящую сумму.
const PAKETY = ['dsh-pamyat-core', 'dsh-pamyat-nudzh', 'dsh-pamyat-omega'];
// 🔴 ПУТЬ К НАСТОЯЩИМ ПАКЕТАМ — ОДНИМ МЕСТОМ (правка 14.09.2026).
// Стенд написан 07.09, когда пакеты лежали в /opt/iskra/plugins. Они переехали в
// /opt/agent-plugins/node_modules — и стенд с тех пор падал на ПОСТРОЕНИИ ОБСТАНОВКИ,
// не дойдя ни до одной пробы. То есть весь набор проб ворот был МЁРТВ несколько суток,
// а его отказ читался как «что-то сломалось», а не «стенда нет».
// ⚠️ Путь берётся из переменной: переедут снова — править одно место, а не два.
const PLAGINY = process.env.STEND_PLAGINY || '/opt/agent-plugins/node_modules';
for (const p of PAKETY) cpSync(`${PLAGINY}/${p}`, join(mods, p), { recursive: true });
writeFileSync(join(profil, 'cordis.patch.yml'),
  PAKETY.map((p) => `    - name: ${p}\n`).join('') + '\n');

// 🔴 ОТПЕЧАТОК — СВОЕЙ КОМАНДОЙ, ЗАПИСАННОЙ В ЗАПИСЬ (A-N-755). Прибор исполняет fingerprint_check
// записи (bash -c) и сравнивает последнюю строку с fingerprint. Боевой реестр считает через npm pack;
// стенд — через find+sha256: предмет проб — механизм «команда записи → последняя строка ↔ запись»,
// а не способ свёртки. Сеть и npm стенду не нужны.
// Отпечаток не снялся — стенд СЛЕП и останавливается кодом 2: иначе в реестр ушла бы пустота
// как отпечаток, и пробы отвечали бы о стенде, а не о приборе.
const kmd_otpechatka = (put) => `cd '${put}' && find . -type f | LC_ALL=C sort | xargs -d '\\n' sha256sum | sha256sum | cut -c1-16`;
const otpechatok_ili_slepota = (put) => {
  const r = spawnSync('bash', ['-c', kmd_otpechatka(put)], { encoding: 'utf8' });
  const s = (r.stdout || '').trim().split('\n').pop();
  if (r.status === 0 && /^[0-9a-f]{16}$/.test(s || '')) return s;
  console.log(`\n  СЛЕПОТА: отпечаток ${put} не снят (код ${r.status}): ${(r.stderr || '').trim().slice(0, 300)}`);
  console.log('  Пробы не прогнаны: стенд отвечает о своей обстановке, а не о предмете.');
  rmSync(kat, { recursive: true, force: true });
  process.exit(2);
};
const versiya_pak = (p) => JSON.parse(readFileSync(join(mods, p, 'package.json'), 'utf8')).version;
const zapis = (p, put = join(mods, p)) => ({ id: p, path: put, version: JSON.parse(readFileSync(join(put, 'package.json'), 'utf8')).version,
  fingerprint: otpechatok_ili_slepota(put), fingerprint_check: kmd_otpechatka(put) });
// Реестр пишется JSON-ом: это допустимый YAML, прибор читает его yaml.safe_load, как боевой.
let nomer_reestra = 0;
const reestr = (zapisi, services = []) => {
  const put = join(kat, `reestr-${++nomer_reestra}.yaml`);
  writeFileSync(put, JSON.stringify({ plugins: zapisi, services }, null, 1) + '\n');
  return put;
};
const ZAPISI_OK = PAKETY.map((p) => zapis(p));
const reestr_ok = reestr(ZAPISI_OK);

// Цель по умолчанию — «то, что лежит»: пробы про другое не должны краснеть о цель.
const CEL_OK = PAKETY.map((p) => `${p}=${versiya_pak(p)}`).join(',');
const zvat = (dop = [], cel = CEL_OK, reestr_put = reestr_ok) => {
  const r = spawnSync(process.execPath, [PRIBOR, '--profil', profil, '--konfig', join(profil, 'cordis.patch.yml'),
    '--reestr-plaginov', reestr_put, ...(cel ? ['--cel', cel] : []), ...dop], { encoding: 'utf8' });
  return { kod: r.status, vyvod: (r.stdout || '') + (r.stderr || '') };
};

// 🔴 УЧЁТКА ЗАПУСКА — ПЕРВОЙ СТРОКОЙ (правка 14.09.2026, предложение Вениамина).
// Стенд даёт РАЗНЫЙ ИТОГ РАЗНЫМ УЧЁТКАМ и раньше об этом молчал: у автора 39 из 39, у
// проверяющего через sudo 38 из 39. Сегодня безобидно — проверяющий идёт разбираться.
// Опасен обратный случай: проба, КРАСНАЯ у автора и ЗЕЛЁНАЯ в иной обстановке, — тогда
// дефект уедет незамеченным, и по выводу эти два случая не различить.
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: печать НЕ делает пробы независимыми от обстановки, она лишь не даёт
// разнице быть молчаливой. Пробу, стоящую на правах, лечит переписывание пробы, а не эта строка.
const UCHYOTKA_RABOCHAYA = 'iskra';
const kto = (() => { const r = spawnSync('id', ['-un'], { encoding: 'utf8' }); return (r.stdout || '').trim() || '?'; })();
console.log('\n═══ П2: ворота В1–В8 ═══');
console.log(`  обстановка: учётка ${kto} · рабочая ${UCHYOTKA_RABOCHAYA} · HOME ${process.env.HOME || '?'}`);
if (kto !== UCHYOTKA_RABOCHAYA) {
  console.log(`  ⚠️ ЗАПУСК НЕ ОТ РАБОЧЕЙ УЧЁТКИ (${kto}, не ${UCHYOTKA_RABOCHAYA}).`);
  console.log('     Итог может отличаться от авторского: пробы, стоящие на ПРАВАХ, от root');
  console.log('     ведут себя иначе. Расхождение итогов — повод сверить вызовы, а не вердикт.');
}

proba('ПЕРВАЯ — НА ЗАВЕДОМО ИСПРАВНОМ: три пакета, все приняты → код 0', () => {
  const r = zvat();
  if (r.kod !== 0) throw new Error('код ' + r.kod + ' на исправном:\n' + r.vyvod.slice(0, 300));
  if (!/принято 3/.test(r.vyvod)) throw new Error('не сосчитало три принятых: ' + r.vyvod.match(/объявлено.*/)?.[0]);
});

proba('В2: «ОЖИДАЕТСЯ» и «В БОЮ» — разные слова, оба на месте', () => {
  const r = zvat(['--posle', '--sluzhba', 'cron.service']);
  if (!/ОЖИДАЕТСЯ \(/.test(r.vyvod)) throw new Error('нет слова ОЖИДАЕТСЯ');
  if (!/В БОЮ \(/.test(r.vyvod)) throw new Error('нет слова В БОЮ');
});

proba('В1/П-сосед: отпечаток на месте ≠ записи → «ПОДМЕНА ПРЕДМЕТА» код 1, имя и обе стороны названы', () => {
  const r = zvat([], CEL_OK, reestr(ZAPISI_OK.map((z, i) => i === 0 ? { ...z, fingerprint: '0'.repeat(16) } : z)));
  if (r.kod !== 1) throw new Error('код ' + r.kod + ', ожидался 1');
  if (!new RegExp('ПОДМЕНА ПРЕДМЕТА: dsh-pamyat-core \\[dsh-pamyat-core\\] .*в реестре 0{16}, на месте ' + ZAPISI_OK[0].fingerprint).test(r.vyvod))
    throw new Error('имя и обе стороны не названы: ' + (r.vyvod.match(/ПОДМЕНА[^\n]*/) || ['нет строки'])[0]);
});

proba('В1/П-реестр: реестра НЕТ → код 2 СЛЕПОТА, не 0', () => {
  const r = zvat([], CEL_OK, join(kat, 'net-takogo.yaml'));
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/СЛЕПОТА: реестр .* не прочитан/.test(r.vyvod)) throw new Error('слепота по реестру не названа');
  if (/принято \d/.test(r.vyvod)) throw new Error('без реестра напечатано «принято»');
});

proba('В1/П-пусто: реестр ЕСТЬ, но записей нет → код 2, не «всё принято»', () => {
  const r = zvat([], CEL_OK, reestr([]));
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/нет записей/.test(r.vyvod)) throw new Error('пустота реестра не названа');
  if (/принято 3/.test(r.vyvod)) throw new Error('пустой реестр прочитан как «всё принято»');
});

proba('В1/П-путь: корень профиля неразбираем → код 2, ни одного «можно»', () => {
  const r = spawnSync(process.execPath, [PRIBOR, '--profil', join(kat, 'net-kornya'), '--reestr-plaginov', reestr_ok, '--cel', CEL_OK], { encoding: 'utf8' });
  if (r.status !== 2) throw new Error('код ' + r.status + ', ожидался 2');
  if (/принято \d/.test(r.stdout)) throw new Error('напечатал «принято» при неразбираемом корне');
});

proba('В8: реестр не разбирается → СЛЕПОТА с причиной разбора, не тихий пропуск', () => {
  const bit = join(kat, 'reestr-slomannyj.yaml');
  writeFileSync(bit, 'plugins:\n  - id: [незакрытая\n');
  const r = zvat([], CEL_OK, bit);
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/СЛЕПОТА: реестр [^\n]* не прочитан:\s+\S[^\n]*line \d+/.test(r.vyvod)) throw new Error('причина разбора не названа: ' + (r.vyvod.match(/СЛЕПОТА.*/) || [''])[0]);
});

// ═══ Р1–Р3 СНЯТЫ (A-N-755): второй режим свёртки и его примечание были свойством ФАЙЛА СУММ; прибор
// сверяет отпечаток командой самой записи, второго прибора свёртки у него нет. Вместо них — пробы
// разрядов реестра, которых прежде не было вовсе.
proba('Р-две: две записи с разными id на одном месте → СЛЕПОТА код 2, обе названы', () => {
  const z = ZAPISI_OK[0];
  const r = zvat([], CEL_OK, reestr([...ZAPISI_OK, { ...z, id: 'dvojnik' }]));
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/две записи реестра на одном месте — dsh-pamyat-core и dvojnik/.test(r.vyvod)) throw new Error('обе записи не названы: ' + (r.vyvod.match(/СЛЕПОТА.*/) || [''])[0]);
});

proba('Р-без-команды: в записи нет fingerprint_check → «сверить нечем», код 2, не «принято»', () => {
  const r = zvat([], CEL_OK, reestr(ZAPISI_OK.map((z, i) => { if (i) return z; const { fingerprint_check, ...bez } = z; return bez; })));
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/СЛЕПОТА \(сверить нечем\): dsh-pamyat-core \[dsh-pamyat-core\]: в записи нет fingerprint_check/.test(r.vyvod)) throw new Error('не названо: ' + (r.vyvod.match(/сверить нечем.*/) || ['нет строки'])[0]);
  if (/принято 3/.test(r.vyvod)) throw new Error('запись без команды засчитана принятой');
});

proba('Р-отказ-команды: команда отпечатка отказала → «сверить нечем», код 2', () => {
  const r = zvat([], CEL_OK, reestr(ZAPISI_OK.map((z, i) => i ? z : { ...z, fingerprint_check: 'exit 3' })));
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/dsh-pamyat-core \[dsh-pamyat-core\]: команда отпечатка отказала/.test(r.vyvod)) throw new Error('отказ команды не назван');
});

proba('В4: пакет из конфига, не назвавший себя → «НЕ СВЕРЯЕМ» поимённо, код не 0', () => {
  const r = zvat(['--posle', '--sluzhba', 'cron.service']);
  if (!/НЕ СВЕРЯЕМ: dsh-pamyat-core/.test(r.vyvod)) throw new Error('не назван поимённо');
  if (!/не сверяемых 3/.test(r.vyvod)) throw new Error('счёт не сверяемых не напечатан');
  if (r.kod === 0) throw new Error('код 0 при трёх не сверяемых');
});

proba('В5: счёт и перечень СХОДЯТСЯ у ОБОИХ разрядов, и подмена не путается с отсутствием записи', () => {
  // Порча двух разных родов в одном реестре: у первого пакета чужой отпечаток (ПОДМЕНА), записи
  // второго нет вовсе (НЕТ ЗАПИСИ). Каждый разряд обязан насчитать РОВНО 1 и назвать его строкой:
  // разведение в ярлыке без разведения предметов эта проба ловит.
  const r = zvat([], CEL_OK, reestr([{ ...ZAPISI_OK[0], fingerprint: 'deadbeefdeadbeef' }, ZAPISI_OK[2]]));
  const pary = [
    [/ПОДМЕНА \(отпечаток ≠ записи\) (\d+)/, /^ {2}🔴 ПОДМЕНА ПРЕДМЕТА: /gm, 'подмена'],
    [/нет записи в реестре (\d+)/,             /^ {2}🔴 НЕТ ЗАПИСИ В РЕЕСТРЕ: /gm, 'нет записи'],
  ];
  for (const [reChislo, reStroki, imya] of pary) {
    const zayavleno = Number(r.vyvod.match(reChislo)?.[1]);
    const strok = (r.vyvod.match(reStroki) ?? []).length;
    if (!Number.isFinite(zayavleno)) throw new Error(`разряд «${imya}»: счёт не напечатан вовсе`);
    if (zayavleno !== 1 || strok !== 1) throw new Error(`разряд «${imya}»: заявлено ${zayavleno}, строк ${strok}, ожидалось 1 и 1`);
  }
  if (r.kod !== 1) throw new Error('код ' + r.kod + ', ожидался 1');
});

proba('В6: прибор НЕ трогает службы — ни одного вызова systemctl с restart/stop/start', () => {
  // 🔴 ПРИЗНАК ПО ВЫЗОВУ, А НЕ ПО СЛОВУ В СТРОКЕ. Грубый греп «systemctl.*(restart|stop|start)»
  // даёт ЛОЖНО-КРАСНОЕ на исправном приборе: в строке `start = execFileSync('systemctl',
  // ['show', ...])` слово start — имя переменной, а не команда. Смотрим АРГУМЕНТЫ.
  const kod = readFileSync(PRIBOR, 'utf8');
  const opasnye = [...kod.matchAll(/execFileSync\(\s*'systemctl'\s*,\s*\[\s*'([a-z-]+)'/g)].map((m) => m[1]);
  const zapreshcheno = opasnye.filter((k) => ['restart', 'stop', 'start', 'kill', 'reload'].includes(k));
  if (zapreshcheno.length) throw new Error('прибор трогает службы: ' + zapreshcheno.join(', '));
  if (!opasnye.length) throw new Error('проба негодна: ни одного вызова systemctl не разобрано — признак смотрит не туда');
});

proba('🔴 ЦЕЛЬ НЕ НАЗВАНА → СЛЕПОТА, и прибор дальше НЕ идёт', () => {
  const r = zvat([], null);
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/цель подъёма НЕ НАЗВАНА/.test(r.vyvod)) throw new Error('причина не названа');
  if (/объявлено \d+ · сверено/.test(r.vyvod)) throw new Error('прибор пошёл проверять дальше — напечатал ответ на ДРУГОЙ вопрос рядом со словом СЛЕПОТА');
});

proba('ГЛАВНОЕ (уточнение предмета): на пути ПРИНЯТОЕ, но НЕ ЦЕЛЬ → НЕЛЬЗЯ', () => {
  const r = zvat([], `dsh-pamyat-core=9.9.9,${PAKETY.slice(1).map((p) => p + '=' + versiya_pak(p)).join(',')}`);
  if (r.kod !== 1) throw new Error('код ' + r.kod + ', ожидался 1 — принятое не есть «то, что решили поднять»');
  if (!new RegExp('НЕ ЦЕЛЬ: dsh-pamyat-core: на пути ' + versiya_pak(PAKETY[0]).replace(/\./g, '\\.') + ' \\(принята\\), а ЦЕЛЬ 9\\.9\\.9').test(r.vyvod))
    throw new Error('обе стороны не названы: ' + (r.vyvod.match(/НЕ ЦЕЛЬ.*/) ?? ['нет строки'])[0]);
});

proba('цель совпала с тем, что лежит → 0 и счёт «совпало с целью»', () => {
  const r = zvat();
  if (r.kod !== 0) throw new Error('код ' + r.kod + ' при совпавшей цели');
  if (!/совпало с целью 3/.test(r.vyvod)) throw new Error('счёт по цели не напечатан');
});

proba('цель в негодной форме → СЛЕПОТА с указанием куска, не «сверю с любой»', () => {
  const r = zvat([], 'это-не-форма-цели');
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/цель подъёма не разобрана/.test(r.vyvod)) throw new Error('причина не названа');
});

proba('«в бою» сверяется С ТОЙ ЖЕ ЦЕЛЬЮ, а не с «любой принятой»', () => {
  // Служба без наших строк: важно, что механизм сверки с целью существует и печатает цель.
  const r = zvat(['--posle', '--sluzhba', 'cron.service'], `dsh-pamyat-core=9.9.9,${PAKETY.slice(1).map((p) => p + '=' + versiya_pak(p)).join(',')}`);
  if (!/цель подъёма: dsh-pamyat-core=9\.9\.9/.test(r.vyvod)) throw new Error('цель не названа в выводе');
  if (r.kod === 0) throw new Error('код 0 при цели, которой нет на пути');
});

// ═══ Н2 ПРИЁМКИ: ПРИ ЦЕЛИ С ДИСКА РАЗРЯД «В БОЮ» БЫЛ СЛЕП (06.09.2026) ═══════════
// 🔴 Разряд сверял версию в бою ТОЛЬКО с явной целью (--cel). При --cel-s-diska карта
// целей пуста, и «в бою» проверялось лишь «назвался ли пакет», а не «та ли версия». То
// есть подъём, не взявший новое, прошёл бы молча — ровно там, где прибор и нужен: приёмка
// «ПОСЛЕ» опирается на этот разряд. Нашла приёмка, не я.
// Пара проб держит оба конца: цель с диска ДОЛЖНА печататься и ДОЛЖНА краснить при
// расхождении; при этом явная цель по-прежнему сильнее.

proba('🔴 Н2: явная цель СИЛЬНЕЕ снятой с диска (иначе откат стал бы невозможен)', () => {
  const r = zvat(['--posle', '--sluzhba', 'cron.service'], `${PAKETY[0]}=9.9.9`);
  if (!new RegExp('цель подъёма: ' + PAKETY[0] + '=9\\.9\\.9').test(r.vyvod)) {
    throw new Error('явная цель не названа — значит с диска она бы её перекрыла');
  }
});

// 🔴 ПОДСКАЗКА ПРИ СЛЕПОТЕ ПО ИМЕНИ ЦЕЛИ. 06.09.2026 приёмка позвала `--cel core=…`,
// прочла строку «совпало с целью 0» ОТДЕЛЬНО от блока слепоты и решила, что прибор молчит.
// Он не молчал — не хватало ПРИМЕРА полного имени рядом с отказом. Пара проб держит оба
// конца: единственное совпадение подсказывается, неоднозначное — перечисляется, и НИ В
// ОДНОМ случае имя не подставляется молча.
proba('короткое имя цели → слепота И подсказка полного имени (одно совпадение)', () => {
  const r = zvat([], 'core=0.0.0');
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2 (слепота)');
  if (!/похоже, имелось в виду: dsh-pamyat-core=/.test(r.vyvod)) throw new Error('подсказки нет: ' + (r.vyvod.match(/СЛЕПОТА[\s\S]{0,300}/)?.[0] || ''));
  if (!/подсказка, не подстановка/.test(r.vyvod)) throw new Error('не сказано, что имя НЕ подставлено');
});

proba('неоднозначный кусок имени → перечень всех совпавших, а не выбор одного', () => {
  const r = zvat([], 'pamyat=0.0.0');
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/входит в несколько объявленных имён/.test(r.vyvod)) throw new Error('перечня нет');
  for (const im of ['dsh-pamyat-core', 'dsh-pamyat-nudzh', 'dsh-pamyat-omega']) {
    if (!r.vyvod.includes(im)) throw new Error('в перечне нет ' + im);
  }
  if (/похоже, имелось в виду/.test(r.vyvod)) throw new Error('при неоднозначности предложено ОДНО имя');
});

// ── П2: ДВЕ ПРИЧИНЫ — ДВЕ СТРОКИ (поправка приёмки 06.09.2026) ────────────────────
// 🔴 Прежде оба случая звучали «среди принятых её нет». Это разные новости и лечатся
// по-разному: версии в файле НЕТ вовсе → ждём вердикт; версия ЕСТЬ, но сумма другая →
// ПОДМЕНА ПРЕДМЕТА, чинить надо путь, а не приёмку. Одно имя на две причины склеивает
// разбор — тот же класс, что «знание потеряно» с четырьмя причинами у секретаря.
// ── П2 (A-N-755): ОТПЕЧАТОК СОВПАЛ, А ВЕРСИЯ В ЗАПИСИ ДРУГАЯ — запись правлена наполовину ──────────
// Это не подмена (содержимое то самое) и не отсутствие записи: своя строка, своя причина.
proba('П2: отпечаток совпал, версия в записи другая → «ВЕРСИЯ ≠ ЗАПИСИ», не «подмена»', () => {
  const r = zvat([], CEL_OK, reestr(ZAPISI_OK.map((z, i) => i ? z : { ...z, version: '9.9.9-zapis' })));
  if (r.kod !== 1) throw new Error('код ' + r.kod + ', ожидался 1');
  if (!/ВЕРСИЯ ≠ ЗАПИСИ: dsh-pamyat-core \[dsh-pamyat-core\]: отпечаток совпал, а версия в реестре 9\.9\.9-zapis/.test(r.vyvod))
    throw new Error('не названо: ' + (r.vyvod.match(/🔴[^\n]*/) || ['нет строки'])[0]);
  if (/ПОДМЕНА ПРЕДМЕТА/.test(r.vyvod)) throw new Error('половинчатая запись названа подменой — две причины слиты');
});

proba('В6 расширенное: прибор НИЧЕГО не пишет — ни файлов, ни sudo сверх чтения журнала', () => {
  // 🔴 «Только смотрю» — про намерение, а не про инструмент: чтение базы без mode=ro
  // СОЗДАЁТ файл, если его нет. Поэтому смотрим ВЫЗОВЫ, а не обещания.
  const kod = readFileSync(PRIBOR, 'utf8');
  const zapisi = [...kod.matchAll(/\b(writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|createWriteStream)\b/g)].map((m) => m[1]);
  if (zapisi.length) throw new Error('прибор пишет: ' + [...new Set(zapisi)].join(', '));
  const sudos = [...kod.matchAll(/execFileSync\(\s*'sudo'\s*,\s*\[\s*'-n'\s*,\s*'([a-z-]+)'/g)].map((m) => m[1]);
  const lishnie = sudos.filter((k) => k !== 'journalctl');
  if (lishnie.length) throw new Error('sudo сверх чтения журнала: ' + lishnie.join(', '));
  if (!sudos.length) throw new Error('проба негодна: ни одного вызова sudo не разобрано — признак смотрит не туда');
});


// 🔴 СВОЙ ВЫЗОВ, А НЕ zvat(): у прибора `znach()` берёт ПЕРВОЕ вхождение ключа, а zvat
// подставляет свои --reestr-plaginov/--konfig раньше добавочных. Пробы ниже переопределяют именно эти
// ключи, и через zvat они молча проигрывали: проба думала, что управляет предметом, а не
// управляла. Поймано первым же красным — «на пути 0.0.0, а ЦЕЛЬ alpha.36».
const zvat_svoim = (kljuchi) => {
  const r = spawnSync(process.execPath, [PRIBOR, '--profil', profil, ...kljuchi], { encoding: 'utf8' });
  return { kod: r.status, vyvod: (r.stdout || '') + (r.stderr || '') };
};
// 🔴 ВЫЗОВ БЕЗ ПОДСТАНОВКИ ПРОФИЛЯ. Нужен для проб П3: zvat_svoim ВСЕГДА добавляет
// `--profil <подставной>`, то есть явный обход, — и проба на «профиль выводится из службы»
// через него измеряла бы не то. Поймано прогоном: проба краснела на исправном предмете,
// потому что слепота не наступала по построению вызова.
const zvat_golym = (kljuchi) => {
  const r = spawnSync(process.execPath, [PRIBOR, ...kljuchi], { encoding: 'utf8' });
  return { kod: r.status, vyvod: (r.stdout || '') + (r.stderr || '') };
};

// 🔴 ПРОБЫ СТОЯТ ПОСЛЕ ОБЪЯВЛЕНИЯ zvat_svoim — первая редакция была ВЫШЕ него и упала
// с «Cannot access before initialization». Это класс Михалыча от 06.09 («сообразил про
// порядок определения функций и не перенёс на переменные»), только у меня наоборот:
// знала про переменные и не подумала про порядок в СТЕНДЕ. Поймал прогон, не чтение.
// ── П3: ОБЛАСТЬ НЕ СМЕШИВАЕТСЯ (дыра приёмки 06.09.2026) ──────────────────────────
// 🔴 Было: `--sluzhba petrovich.service` печатал «служба: petrovich.service · профиль: …/iskra/…» —
// прибор выносил вердикт о МОЁМ узле ПОД ИМЕНЕМ СОСЕДА. Оба значения правдивы порознь,
// негодна связь между ними. И позиционный довод (`… petrovich.service` без ключа) проглатывался
// молча — первый прогон приёмки по соседу был на самом деле по мне.
// 🔴 ПРАВКА 14.09.2026 — ПРОБА СТОЯЛА НА ПРАВАХ УЧЁТКИ, А НЕ НА ЗАМЫСЛЕ.
// Было: требовалось дословное «мне не читается», то есть отказ ПО ПРАВАМ. От root чужой
// профиль ЧИТАЕТСЯ, отказа нет — и проба краснела на ИСПРАВНОМ предмете: 38 из 39 у
// проверяющего против 39 из 39 у автора. Нашёл Вениамин, прогнав стенд через sudo.
// Замысел дыры 06.09 другой: прибор не должен выносить вердикт о МОЁМ узле ПОД ЧУЖИМ
// ИМЕНЕМ. Этот инвариант обязан держаться при ЛЮБОЙ учётке, а способ слепоты — нет.
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: проба не проверяет, ЧТО именно мешает снять вердикт (права, отсутствие
// цели, иное) — только что чужое имя не приписано моему профилю и счёт не ведётся.
proba('П3: чужая служба без явного профиля → вердикт НЕ под чужим именем (при любой учётке)', () => {
  const r = zvat_golym(['--sluzhba', 'petrovich.service']);
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидалась слепота 2');
  if (!/petrovich\.service/.test(r.vyvod)) throw new Error('не названа служба, о которой речь');
  const mp = r.vyvod.match(/профиль[^\n]*?(\/opt\/[a-z-]+\/\.dsh\/profiles\/[a-z0-9-]+)/i);
  if (!mp) throw new Error('профиль, выведенный ИЗ службы, не назван вовсе');
  if (!mp[1].startsWith('/opt/petrovich/')) throw new Error('рядом с чужой службой назван НЕ её профиль: ' + mp[1]);
  if (/объявлено \d+/.test(r.vyvod)) throw new Error('прибор ВСЁ РАВНО посчитал профиль под чужим именем');
});

proba('П3: позиционный довод → ОТКАЗ с перечнем ключей, не молчание', () => {
  const r = zvat_golym(['petrovich.service']);
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/позиционный довод/.test(r.vyvod)) throw new Error('причина не названа: ' + r.vyvod.slice(0, 160));
  if (!/--sluzhba/.test(r.vyvod)) throw new Error('не сказано, каким ключом задавать службу');
  // 🔴 КОДА МАЛО: прибор и БЕЗ этой защиты вернёт 2 — упрётся дальше в «цель не названа».
  // Две разные причины дают одно число, и проба на код совпадала бы случайно (наш класс
  // «величина, совпадающая с другой на всех проверенных данных, не проверена вовсе»).
  // Поймано порчей: снятие process.exit дало 30 из 30. Проверяем, что прибор ОСТАНОВИЛСЯ.
  if (/объявлено \d+/.test(r.vyvod)) throw new Error('прибор пошёл дальше и всё-таки посчитал профиль');
  if (/машина: /.test(r.vyvod)) throw new Error('прибор начал обычный вывод — значит отказ не оборвал ход');
});

proba('П3: явный --profil ОСТАЁТСЯ обходом (иначе не проверить чужой узел с его же машины)', () => {
  const r = zvat_svoim(['--sluzhba', 'petrovich.service', '--profil', '/opt/iskra/.dsh/profiles/web', '--cel-s-diska']);
  if (r.kod === 2 && /мне не читается/.test(r.vyvod)) throw new Error('явный профиль не сработал как обход');
  if (!/служба: petrovich\.service/.test(r.vyvod)) throw new Error('служба не названа');
});


// ═══ ПРОБЫ НА СВОЙСТВА, ДОБАВЛЕННЫЕ 05.09.2026 ═══
// Стенд отстал от предмета: за один заход в прибор вошли четыре новых свойства, и ни одно
// не было под пробой. Замораживать предмет, часть которого не покрыта, нельзя — иначе
// «16 из 16» описывает вчерашний прибор.

proba('корни хранения ВЫЧИСЛЯЮТСЯ и печатаются числом (не список внутри прибора)', () => {
  const r = zvat();
  const m = r.vyvod.match(/корней хранения: (\d+) —/);
  if (!m) throw new Error('строки о корнях нет вовсе');
  if (Number(m[1]) < 1) throw new Error('корней 0 при трёх живых пакетах — счёт не работает');
});

proba('ЦЕЛЬ С ДИСКА: вопрос «поедет ли ПРИНЯТОЕ», обе стороны снимаются сейчас', () => {
  const r = zvat_svoim(['--konfig', join(profil, 'cordis.patch.yml'), '--reestr-plaginov', reestr_ok, '--cel-s-diska']);
  if (r.kod !== 0) throw new Error('код ' + r.kod + ' при всём принятом: ' + (r.vyvod.match(/🔴.*/) ?? [''])[0]);
  if (!/цель подъёма: СНЯТА С ДИСКА/.test(r.vyvod)) throw new Error('не сказано, что цель снята с диска');
  if (!/совпало с целью 3/.test(r.vyvod)) throw new Error('счёт по цели не напечатан');
});

proba('ЦЕЛЬ С ДИСКА ловит пакет БЕЗ ЗАПИСИ в реестре', () => {
  const r = zvat_svoim(['--konfig', join(profil, 'cordis.patch.yml'), '--reestr-plaginov', reestr(ZAPISI_OK.slice(1)), '--cel-s-diska']);
  if (r.kod !== 1) throw new Error('код ' + r.kod + ', ожидался 1 — на диске лежит то, чего нет в реестре');
  if (!/НЕТ ЗАПИСИ В РЕЕСТРЕ: dsh-pamyat-core: на месте \S+ записи в реестре НЕТ/.test(r.vyvod)) throw new Error('пакет без записи не назван поимённо');
});

// ═══ «ВНЕ ОБЛАСТИ ПРИЁМКИ» СНЯТО (A-N-755) ═══════════════════════════════════════════════
// Пять проб (вне области на исход не влияет; причина своими словами; причины нет; строка при пустом
// списке; --strogo возвращает запрет) и проба «неопознанный статус» стерегли статусы строк ФАЙЛА СУММ.
// У реестра статусов нет: у каждого имени на пути ОБЯЗАНА быть запись, иначе красное. Сняты вместе с
// предметом; вместо них — то, что прибор теперь обещает: источник назван, --strogo ничего не меняет,
// --summy отвергается вслух.
proba('ИСТОЧНИК: реестр назван строкой с числом записей и правилом «имя без записи — красное»', () => {
  const r = zvat();
  if (!new RegExp('источник принятого: реестр ' + reestr_ok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\(записей 3, с разрешимым путём 3\\)').test(r.vyvod))
    throw new Error('источник не назван: ' + (r.vyvod.match(/источник принятого.*/) || ['нет строки'])[0]);
  if (!/«вне области приёмки» нет: имя без записи — красное/.test(r.vyvod)) throw new Error('смена правила молчаливая');
});

proba('--strogo принимается и НИЧЕГО не меняет: исход и счёт те же', () => {
  const a = zvat(), b = zvat(['--strogo']);
  const schyot = (v) => (v.match(/объявлено \d+ · сверено \d+ · принято \d+/) || [''])[0];
  if (a.kod !== 0 || b.kod !== 0) throw new Error(`коды ${a.kod}/${b.kod}, ожидались 0/0`);
  if (!schyot(a.vyvod) || schyot(a.vyvod) !== schyot(b.vyvod)) throw new Error(`счёт разошёлся: «${schyot(a.vyvod)}» и «${schyot(b.vyvod)}»`);
});

proba('ключ --summy → ОТКАЗ код 2 с подсказкой --reestr-plaginov, а не тихий пропуск', () => {
  const r = zvat_svoim(['--konfig', join(profil, 'cordis.patch.yml'), '--summy', join(kat, 'lyuboj.txt'), '--cel', CEL_OK]);
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/ОТКАЗ: ключ --summy снят/.test(r.vyvod) || !/--reestr-plaginov/.test(r.vyvod)) throw new Error('отказ или подсказка не названы');
  if (/объявлено \d+/.test(r.vyvod)) throw new Error('прибор пошёл дальше после отказа');
});

proba('две цели сразу — ОТКАЗ, а не тихий выбор одной', () => {
  const r = zvat(['--cel-s-diska'], CEL_OK);
  if (r.kod !== 2) throw new Error('код ' + r.kod + ', ожидался 2');
  if (!/не совмещается/.test(r.vyvod)) throw new Error('причина не названа');
});

proba('объявлено имя, которого НЕТ на месте → НЕЛЬЗЯ (1), а не слепота', () => {
  const konf = join(kat, 'konfig-s-prizrakom.yml');
  writeFileSync(konf, PAKETY.map((pk) => `    - name: ${pk}\n`).join('') + '    - name: takogo-plagina-net-vovse\n');
  const r = zvat_svoim(['--konfig', konf, '--reestr-plaginov', reestr_ok, '--cel', CEL_OK]);
  if (!/объявлен, но НЕ НАЙДЕН ни по одному пути: takogo-plagina-net-vovse/.test(r.vyvod))
    throw new Error('отсутствующий пакет не назван');
  if (r.kod !== 1) throw new Error('код ' + r.kod + ', ожидался 1 — это факт о ПРЕДМЕТЕ, не отказ инструмента');
});

// ═══ ЦЕЛЬ С ДИСКА СНИМАЕТСЯ СО ВСЕХ ОБЪЯВЛЕННЫХ ИМЁН (моя находка 06.09.2026) ═══
// 🔴 ЗАЧЕМ ПАРА. Разряд «В БОЮ» сверяет версию с целью, снятой с диска. Цель писалась ПОСЛЕ
// проверки приёмки — то есть у пакета, чья версия НЕ принята, цели не было, и разряд молчал
// именно по тому имени, за которым надо следить пристальнее прочих. Молчание там читается
// как согласие: приёмка «ПОСЛЕ» получила бы зелёное на подъёме, не взявшем новое.
// Разряд «В БОЮ» читает журнал ЖИВОЙ службы и пробой не накрывается — поэтому проверяем
// видимую снаружи опору: число снятых целей против числа объявленных имён.
proba('цель с диска снимается и для ПОДМЕНЁННОГО (отпечаток ≠ записи)', () => {
  const r = zvat_svoim(['--konfig', join(profil, 'cordis.patch.yml'), '--reestr-plaginov',
    reestr(ZAPISI_OK.map((z, i) => i ? z : { ...z, fingerprint: '0'.repeat(16) })), '--cel-s-diska']);
  if (r.kod !== 1) throw new Error('код ' + r.kod + ', ожидался 1 — отпечаток не сошёлся, это факт о предмете');
  if (!new RegExp('целей снято с диска: ' + PAKETY.length + ' из ' + PAKETY.length).test(r.vyvod)) {
    throw new Error('цель снята не со всех имён — разряд «В БОЮ» по подменённому слеп');
  }
});

proba('цель с диска снимается и для имени БЕЗ ЗАПИСИ в реестре', () => {
  const r = zvat_svoim(['--konfig', join(profil, 'cordis.patch.yml'), '--reestr-plaginov', reestr(ZAPISI_OK.slice(1)), '--cel-s-diska']);
  if (r.kod !== 1) throw new Error('код ' + r.kod + ', ожидался 1 — имя без записи красное');
  if (!new RegExp('целей снято с диска: ' + PAKETY.length + ' из ' + PAKETY.length).test(r.vyvod)) {
    throw new Error('«нет записи» превратилось во «вне наблюдения»');
  }
});

proba('пакет, подключённый ПРЯМЫМ ПУТЁМ из НЕобъявленного, входит в область', () => {
  // 🔴 ВОСПРОИЗВОДИТСЯ ДВУХСЛОЙНОСТЬ БОЕВОГО СЛУЧАЯ, а не только его верхний слой:
  // ссылающийся пакет САМ не назван в конфиге профиля (как dsh-pamyat-kompakt-dsh),
  // а тот, кого он подключает, не назван нигде (как dsh-pamyat-kompakt). Проба на одном
  // слое зеленела бы и на старом приборе — проверено порчей 14.09.
  const cel_kat = join(kat, 'podklyuchennyj');
  mkdirSync(cel_kat, { recursive: true });
  writeFileSync(join(cel_kat, 'package.json'), JSON.stringify({ name: 'stend-podklyuchennyj', version: '0.0.7' }));
  writeFileSync(join(cel_kat, 'index.mjs'), 'export const x = 1;\n');
  const ssyl = join(mods, 'stend-ssylayushchijsya');
  mkdirSync(ssyl, { recursive: true });
  writeFileSync(join(ssyl, 'package.json'), JSON.stringify({ name: 'stend-ssylayushchijsya', version: '0.0.1', main: 'index.mjs' }));
  writeFileSync(join(ssyl, 'index.mjs'), 'import { x } from "' + join(cel_kat, 'index.mjs') + '";\nexport default x;\n');
  // у ссылающегося своя запись: он лежит в node_modules и тоже входит в область
  const f = reestr([...ZAPISI_OK, zapis('stend-ssylayushchijsya', ssyl), zapis('stend-podklyuchennyj', cel_kat)]);
  const r = zvat([], `${CEL_OK},stend-podklyuchennyj=0.0.7`, f);
  if (/НЕТ среди объявленных/.test(r.vyvod)) throw new Error('СЛЕПОТА: прямое подключение не попало в область — область снова «что объявлено»');
  if (!/совпало с целью 4/.test(r.vyvod)) throw new Error('цель по подключённому не сверена: ' + (r.vyvod.match(/совпало с целью \d+/) || ['нет строки'])[0]);
  if (r.kod !== 0) throw new Error('код ' + r.kod + ', ожидался 0');
});

proba('разряд «предмет-против-номера» ВЫКЛЮЧЕН распоряжением, а знаменатель — по ЖИВЫМ', () => {
  // 🔴 ЗАЧЕМ. 14.09.2026 разряд выключен по распоряжению владельца 06.09 («отмена проверки
  // версий ОПУБЛИКОВАННОГО»): он тянул тарбол из реестра npm и сверял с ним сумму диска.
  // Прежняя проба стерегла ДРУГОЙ предмет — «ключ подан, сверено 0». Того предмета больше нет.
  // 🔴 И ВТОРОЕ, РАВНО ВАЖНОЕ: знаменатель. Считай выключенные в общий счёт — покрытие
  // навечно «2 из 5», а это читается как недоработка, хотя два разряда СНЯТЫ РЕШЕНИЕМ.
  // Вечно-красное перестают читать; поэтому знаменатель по ЖИВЫМ, а выключенные названы.
  // ⚠️ СЕТЬ НЕ ЗОВЁМ: npm и curl подменены заглушками с отказом. Если разряд вдруг
  // исполнится, заглушка не даст ему уйти наружу, и проба покраснеет на следующей строке.
  const zagl = join(kat, 'zaglushki');
  mkdirSync(zagl, { recursive: true });
  for (const imya of ['npm', 'curl']) {
    writeFileSync(join(zagl, imya), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  }
  const r = spawnSync(process.execPath, [PRIBOR, '--profil', profil, '--konfig', join(profil, 'cordis.patch.yml'),
    '--reestr-plaginov', reestr_ok, '--cel', CEL_OK, '--reestr'],
    { encoding: 'utf8', env: { ...process.env, PATH: zagl + ':' + process.env.PATH } });
  const v = (r.stdout || '') + (r.stderr || '');
  // контроль зрячести ВНУТРИ пробы: ключ подан и прибор до этого места дошёл,
  // иначе «разряд молчит» значило бы «блок не звали», а не «выключен».
  if (!/ПРЕДМЕТ ПРОТИВ НОМЕРА: РАЗРЯД ВЫКЛЮЧЕН/.test(v)) {
    throw new Error('объявления о выключении нет — блок не звали либо формулировка ушла');
  }
  // тело НЕ исполняется: строки работавшего разряда быть не должно
  if (/ПРЕДМЕТ ПРОТИВ НОМЕРА \(сумма диска/.test(v)) throw new Error('разряд ИСПОЛНЯЛСЯ, хотя выключен');
  // ⚠️ МАСКА ПО СВОЕЙ ФОРМЕ, А НЕ ПО СЛОВУ: `сверено N` печатает и соседний разряд
  // «файл-сумм-против-дерева» («объявлено 12 · сверено 12 · …»). Первая редакция этой пробы
  // краснела на ЧУЖОЙ строке — образец был шире предмета. Ловим формат выключенного:
  // «сверено N · РАЗОШЛОСЬ M», такой только у него.
  if (/сверено \d+ · РАЗОШЛОСЬ/.test(v)) throw new Error('разряд считал: сверка шла при выключенном разряде');
  // знаменатель по ЖИВЫМ, а не по всем пяти
  if (!/проверено разрядов \d+ из \d+ живых/.test(v)) throw new Error('знаменатель не по живым: ' + (v.match(/проверено разрядов[^;]*/) || [''])[0]);
  const m = v.match(/проверено разрядов (\d+) из (\d+) живых/);
  // A-N-755 выключил третий разряд — «файл-сумм-против-дерева»: живых два (состав-и-приёмка, в-бою)
  if (Number(m[2]) !== 2) throw new Error('живых разрядов ожидалось 2, названо ' + m[2]);
  if (!/ВЫКЛЮЧЕНО:.*файл-сумм-против-дерева \(A-N-755/.test(v)) throw new Error('выключенный A-N-755 разряд не назван причиной');
  // оба выключенных названы ПРИЧИНОЙ, а не смешаны с непройденными
  if (!/ВЫКЛЮЧЕНО:.*предмет-против-номера \(отменено распоряжением владельца 06\.09/.test(v)) {
    throw new Error('причина выключения не названа: снятое решением смешается с непройденным');
  }
  if (!/ВЫКЛЮЧЕНО:.*метка-против-вердикта/.test(v)) throw new Error('соседний выключенный пропал из строки');
});

// 🔴 УБОРКА — ПОСЛЕДНИМ ДЕЙСТВИЕМ, А НЕ В СЕРЕДИНЕ. Пробы, дописанные ниже уборки, падали
// на «нет такого файла»: они отвечали про ПОРЯДОК СТРОК в стенде, а не про предмет. Тот же
// класс поймал меня утром в другом стенде — значит место уборки надо назначать, а не оставлять
// там, где оно оказалось после первой редакции.
rmSync(kat, { recursive: true, force: true });

// ═══ Н2: ПОЧЕМУ ЗДЕСЬ НЕТ ПРОБЫ, И ЧЕМ ОНА ЗАМЕНЕНА ════════════════════════════
// 🔴 Дыра была настоящая: при --cel-s-diska разряд «В БОЮ» сверял только «назвался ли
// пакет», а не «та ли версия» — карта целей при этом режиме пуста. Нашла приёмка.
// ⚠️ АВТОМАТИЧЕСКОЙ ПРОБЫ НА ЭТО НЕТ, и вот почему: разряд читает НАСТОЯЩИЙ журнал
// службы. На чужой службе (cron) наших строк нет вовсе — проба проверяла бы своё
// умение звать прибор, а не предмет; на своей — стенд стал бы зависеть от того, что
// сейчас в бою, и краснел бы от чужих причин.
// ✅ ЧЕМ ПРОВЕРЕНО ВМЕСТО: порчей рукой на живой службе 06.09.2026 03:2xZ. Подмена
// версии, снятой с диска (+'-PORCHA'), дала «🔴 ЦЕЛЬ …-PORCHA» у ВСЕХ семи назвавшихся
// пакетов; без порчи — «✅ цель» у всех и исход 0. То есть разряд зряч в обе стороны.
// Проба «явная цель сильнее снятой с диска» стоит выше и покрывает вторую половину.

console.log(`\nитог П2: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
