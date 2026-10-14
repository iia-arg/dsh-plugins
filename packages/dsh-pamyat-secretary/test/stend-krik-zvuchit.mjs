// RU: Проверяем слышимость сообщений секретаря по stderr отдельного процесса с настоящим Context. Перехват функции в своём процессе не доказывает, что строка дошла; logger cordis 4.0.1 может оставлять её в непрочитанном буфере.
// EN: Test secretary message audibility through stderr of a separate process using a real Context. Capturing a function in the same process does not prove delivery; the cordis 4.0.1 logger may retain the line in an unread buffer.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zdes = dirname(fileURLToPath(import.meta.url));
// RU: Временное создаём в отдельном mkdtemp и убираем через exit-хук и SIGTERM/SIGINT; общий фиксированный путь может остаться чужим или пережить прогон. SIGKILL уборку не выполнит.
// EN: Create temporary files in a separate mkdtemp and clean them through the exit hook and SIGTERM/SIGINT; a shared fixed path may belong to another account or survive a run. SIGKILL cannot run cleanup.
const KAT = mkdtempSync(join(tmpdir(), '.proba-krik-zvuchit-secretary-'));
process.on('exit', () => rmSync(KAT, { recursive: true, force: true }));
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));
let vsego = 0, proshlo = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы (правка 06.09.2026)'); };
const proba = (imya, f) => {
  vsego++;
  try { sud(f()); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 200)); }
};

function podnyat(kod) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', kod], {
    cwd: join(zdes, '..'), encoding: 'utf8', timeout: 20000,
  });
  return { stderr: r.stderr ?? '', stdout: r.stdout ?? '' };
}

// RU: Зависимости проверяем один раз. Если дочерний процесс не может стартовать без них, возвращаем слепоту с кодом 2 вместо дефекта с кодом 1.
// EN: Check dependencies once. If missing dependencies prevent child startup, report an unobservable test with code 2 rather than a defect with code 1.
{
  const rProba = podnyat("import '@deepseek-ai/cordis';")
  if (/ERR_MODULE_NOT_FOUND/.test(rProba.stderr)) {
    console.log('СЛЕПОТА: предмет не загрузился — не установлены зависимости пакета')
    console.log('  Выполните `npm install` в каталоге пакета и повторите.')
    process.exit(2)
  }
}


// RU: Поднимаем настоящий Context с требуемой службой памяти.
// EN: Start a real Context with the requested memory service.
const OSNOVA = (telo) => `
  import { Context } from '@deepseek-ai/cordis';
  import { name, inject, apply } from './src/index.js';
  const k = new Context();
  ${telo}
`;

proba('стенд годен: секретарь поднимается на настоящем Context', () => {
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, {});
    setTimeout(() => console.log('PODNYALSYA'), 30);
  `));
  if (!/PODNYALSYA/.test(r.stdout)) throw new Error('не поднялся: ' + r.stderr.slice(0, 160));
});

proba('🔴 ПРИЗНАК ГОТОВНОСТИ ЧИТАЕТ ТЕ ЖЕ ПОЛЯ, ЧТО И ПОТРЕБИТЕЛЬ', () => {
  // RU: Готовность должна читать плоский klyuchPass, объявленный в схеме, а не несуществующий вложенный config.klyuch.zapisPass. Проверяем согласие признака со схемой.
  // EN: Read readiness from the schema’s flat klyuchPass rather than nonexistent nested config.klyuch.zapisPass. Test agreement between the detector and schema.
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, { distillyaciya: true, putZhurnala: ${JSON.stringify(join(KAT, 'zhurnal.jsonl'))},
                                        klyuchPass: 'a/b', model: 'm', komandaTrevogi: '' });
    setTimeout(() => {}, 30);
  `));
  const stroka = (r.stderr.split('\n').find((x) => x.includes('подъём:')) ?? '');
  // RU: Несуществующая запись pass a/b означает НЕ взведена, но источник должен быть назван. komandaTrevogi задана пустой строкой, чтобы схема не вызвала рабочую команду тревоги.
  // EN: A missing pass a/b entry means not armed, but the source must be named. Set komandaTrevogi to an empty string so the schema cannot invoke the production alert command.
  if (!/дистилляция (взведена|НЕ взведена: ключ pass a\/b не получен)/.test(stroka)) {
    throw new Error('при ключе, заданном ПО СХЕМЕ, признак не прочёл поле klyuchPass: ' + stroka.slice(0, 200));
  }
  if (/klyuch\.|fajlKlyucha/.test(r.stderr)) {
    throw new Error('подсказка называет поле, которого нет в схеме — она учит писать неверно');
  }
});

proba('🔴 A-N-1870: ГОТОВНОСТЬ НЕ ТРЕБУЕТ putZhurnala (файл не читается с A-P-056)', () => {
  // RU: Без putZhurnala, с ключом по схеме строка подъёма обязана назвать ключ, а не «НЕ ГОТОВА — не задан putZhurnala»: дистилляция берёт события сессии, файл не читает.
  // EN: Without putZhurnala and with a schema key, the startup line must name the key, not report unreadiness for putZhurnala: distillation reads session events, never the file.
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, { distillyaciya: true, klyuchPass: 'a/b', model: 'm', komandaTrevogi: '' });
    setTimeout(() => {}, 30);
  `));
  const stroka = (r.stderr.split('\n').find((x) => x.includes('подъём:')) ?? '');
  if (!stroka) throw new Error('следа подъёма нет вовсе: ' + r.stderr.slice(0, 160));
  if (/putZhurnala|НЕ ГОТОВА/.test(stroka)) throw new Error('готовность всё ещё требует putZhurnala: ' + stroka.slice(0, 200));
  if (!/дистилляция (взведена|НЕ взведена: ключ pass a\/b не получен)/.test(stroka)) throw new Error('ключ не назван: ' + stroka.slice(0, 200));
});

proba('🔴 КАЖДАЯ строка несёт ИМЯ И ВЕРСИЮ, и версия взята ИЗ МАНИФЕСТА', () => {
  // RU: Каждая строка должна различать редакцию; версию читаем из package.json, а не задаём константой.
  // EN: Each line must identify the revision; read the version from package.json rather than a constant.
  const nastoyashchaya = JSON.parse(readFileSync(join(zdes, '..', 'package.json'), 'utf-8')).version;
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, {});
    setTimeout(() => {}, 30);
  `));
  const stroka = (r.stderr.split('\n').find((x) => x.includes('подъём:')) ?? '');
  if (!stroka) throw new Error('следа подъёма нет вовсе: ' + r.stderr.slice(0, 160));
  // RU: Ищем имя, полную версию и пробел: после версии идёт timestamp, а не закрывающая скобка.
  // EN: Match the name, complete version, and a space: a timestamp follows the version, not a closing bracket.
  if (!stroka.includes('[dsh-pamyat-secretary ' + nastoyashchaya + ' ')) {
    throw new Error('в строке нет версии из манифеста (' + nastoyashchaya + '): ' + stroka.slice(0, 120));
  }
});

proba('ПРЕДПОСЫЛКА: настоящий ctx.logger ЕСТЬ и НЕМ (иначе стенд про другой мир)', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    const k = new Context();
    if (typeof k.logger?.error !== 'function') { console.log('NET-LOGGERA'); process.exit(0); }
    k.logger.error('ETU-STROKU-NIKTO-NE-USLYSHIT');
    console.log('EST-I-NEM');
  `);
  if (/NET-LOGGERA/.test(r.stdout)) throw new Error('логгера нет — платформа сменилась, перечитать вместе с krik');
  if (/ETU-STROKU-NIKTO-NE-USLYSHIT/.test(r.stderr + r.stdout)) {
    throw new Error('логгер СТАЛ звучать: платформа обновилась, вернуть развилку нельзя — будет двойная печать');
  }
});

proba('ГЛАВНОЕ: «сводка ПОТЕРЯНА» слышна в stderr настоящего процесса', () => {
  // RU: Сообщение «знание извлечено, но записать некуда» должно быть слышно: иначе потеря неотличима от отсутствия знания.
  // EN: The “knowledge extracted but nowhere to write” message must be audible; otherwise loss looks like absence of knowledge.
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, {});
    setTimeout(() => {
      k.pamyat = undefined;            // служба пропала между событиями
      k.emit('session/event', { id: 'sess-1' }, {
        type: 'compaction/summary',
        data: { summary: [{ type: 'text', text: 'знание' }], shadowedSeqs: [21, 22] },
      });
    }, 30);
  `));
  if (!/dsh-pamyat-secretary/.test(r.stderr)) throw new Error('в stderr нет строки пакета');
  if (!/ПОТЕРЯНА/.test(r.stderr)) throw new Error('строка есть, но не про потерю: ' + r.stderr.slice(0, 200));
});

proba('негодная сводка: отказ записи тоже слышен, а не только потеря', () => {
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, {});
    setTimeout(() => k.emit('session/event', { id: 'sess-1' }, {
      type: 'compaction/summary', data: { summary: [], shadowedSeqs: [] },
    }), 30);
  `));
  if (!/НЕ записана/.test(r.stderr)) throw new Error('пропуск прошёл молча: ' + r.stderr.slice(0, 200));
});

proba('ВЫКЛЮЧЕН НАСТРОЙКОЙ: молчаливого выключения не бывает', () => {
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, { vklyuchen: false });
  `));
  if (!/ВЫКЛЮЧЕН/.test(r.stderr)) throw new Error('выключение прошло молча — снаружи неотличимо от поломки');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
