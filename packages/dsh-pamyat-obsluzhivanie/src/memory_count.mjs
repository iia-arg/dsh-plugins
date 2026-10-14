// RU: Счёт локальной памяти одного агента счётчиком ядра памяти — без apply(), без миграций и без создания отсечки.
// EN: Counts one agent's local memory with the memory core's own counter — no apply(), no migrations, no cutoff creation.
//
// RU: Кто зовёт: memory_count.py (функция read) отдельным процессом node, по одному вызову на базу,
// RU: с пределом 5 секунд; тот, в свою очередь, работает внутри ступени «счёт памяти» runner.py
// RU: (служба обслуживания под учётной записью omega, запуск по таймеру systemd).
// EN: Caller: memory_count.py (function read) spawns one node process per database with a 5-second limit;
// EN: that runs inside the "memory count" stage of runner.py (maintenance service under the omega account,
// EN: started by a systemd timer).
//
// RU: Вход (argv): ровно два аргумента — имя агента и абсолютный путь к его базе SQLite.
// RU: Выход: одна строка JSON в stdout — сводка ядра svodka(agent) при успехе,
// RU: либо {"error": <код>} и код возврата 1 при любом отказе. В stderr ничего намеренно не пишется.
// EN: Input (argv): exactly two arguments — agent name and absolute path to its SQLite database.
// EN: Output: one JSON line on stdout — the core's svodka(agent) summary on success,
// EN: or {"error": <code>} with exit code 1 on any refusal. Nothing is written to stderr on purpose.
//
// RU: Чего НЕ делает: не пишет в базу (readOnly + query_only + ROLLBACK), не повторяет чтение,
// RU: не сдвигает отсечку, не печатает значения SQL и содержимое записей.
// RU: НЕ ловит: изменений базы после снимка транзакции; расхождений, которых не видит сам счётчик ядра
// RU: (их перечень — в README пакета, раздел о счёте локальной памяти).
// EN: Does NOT: write to the database (readOnly + query_only + ROLLBACK), retry reads,
// EN: move the cutoff, or print SQL values or record contents.
// EN: Does NOT catch: database changes after the transaction snapshot; mismatches the core counter itself
// EN: cannot see (listed in the package README, local memory count section).
import { DatabaseSync } from 'node:sqlite';
import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
// RU: Счётчик берётся из ядра памяти, а не переписывается здесь: один источник правды для счёта.
// EN: The counter comes from the memory core rather than being reimplemented here: one source of truth.
import { zavestiZhurnal } from 'dsh-pamyat-core/src/zhurnal.js';

let db;
try {
  // RU: Ровно два пользовательских аргумента (argv[0] — node, argv[1] — этот файл); иначе отказ.
  // EN: Exactly two user arguments (argv[0] is node, argv[1] is this file); otherwise refuse.
  if (process.argv.length !== 4) throw Error('arguments');
  const [agent, file] = process.argv.slice(2);
  // RU: Проверка входа: имя агента из узкого алфавита; путь абсолютный; путь уже канонический
  // RU: (realpath совпадает с resolve) — значит, ни одна часть пути не является символической ссылкой.
  // RU: Несуществующий файл даёт отказ уже здесь (realpathSync бросает исключение).
  // RU: НЕ ловит: подмену файла между этой проверкой и открытием базы.
  // EN: Input check: agent name from a narrow alphabet; absolute path; the path is already canonical
  // EN: (realpath equals resolve) — so no path component is a symbolic link.
  // EN: A missing file is refused right here (realpathSync throws).
  // EN: Does NOT catch: the file being swapped between this check and opening the database.
  if (!/^[-a-z0-9_]+$/.test(agent) || !isAbsolute(file) || realpathSync(file) !== resolve(file)) throw Error('input');
  // RU: Три запрета записи подряд: открытие только на чтение, query_only, и транзакция, которая
  // RU: всегда завершается ROLLBACK. Ожидание занятой базы — до 1 секунды (busy_timeout).
  // RU: BEGIN даёт один согласованный снимок на все запросы счётчика.
  // EN: Three write barriers in a row: read-only open, query_only, and a transaction that always
  // EN: ends with ROLLBACK. Waiting on a busy database is capped at 1 second (busy_timeout).
  // EN: BEGIN gives one consistent snapshot for all counter queries.
  db = new DatabaseSync(file, { readOnly: true });
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN');
  // RU: Режим tolkoChtenie ядра: журнал не создаёт схему и отсечку, только считает.
  // EN: The core's tolkoChtenie (read-only) mode: the journal creates no schema or cutoff, it only counts.
  const result = zavestiZhurnal(db, { tolkoChtenie: true }).svodka(agent);
  db.exec('ROLLBACK');
  console.log(JSON.stringify(result));
} catch (e) {
  // RU: В канал ошибки не попадают значения SQL и содержимое записей: только код ошибки
  // RU: (e.code, если он есть у исключения) или общий код отказа чтения.
  // EN: No SQL values or record contents in error transport: only the error code
  // EN: (e.code when the exception has one) or a generic read-refusal code.
  console.log(JSON.stringify({ error: e.code || 'count_read_refused' }));
  process.exitCode = 1;
// RU: Базу закрываем всегда, если она успела открыться.
// EN: Always close the database if it was opened.
} finally { if (db?.isOpen) db.close(); }
