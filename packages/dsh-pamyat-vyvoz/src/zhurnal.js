import { DatabaseSync } from 'node:sqlite';
/**
 * RU: ЗАПИСЬ В ЖУРНАЛ ОПЕРАЦИЙ (условие приёмки В8).
 * EN: WRITING TO THE OPERATIONS JOURNAL (acceptance condition V8).
 *
 * RU: 🔴 ЗАЧЕМ. Вывоз выносит память НАРУЖУ, ввоз МЕНЯЕТ базу — обе операции меняют
 * RU: состояние машины и обе до сих пор не оставляли следа. Через неделю на вопрос
 * RU: «эта запись пришла извне или родилась здесь» ответить было бы нечем, а на вопрос
 * RU: «что и когда уезжало с машины» — тем более.
 * EN: 🔴 WHY. Export carries memory OUT, import CHANGES the database — both operations
 * EN: change the machine's state, and until now neither left a trace. A week later there
 * EN: would be nothing to answer "did this record come from outside or was it born here",
 * EN: let alone "what left this machine and when".
 *
 * RU: 🔴 ОТКАЗ ЖУРНАЛА НЕ ОТМЕНЯЕТ ОПЕРАЦИЮ И НЕ МОЛЧИТ. Не смогли записать след — говорим
 * RU: вслух и продолжаем: журнал сторожит историю, а не разрешает работу. Обратный порядок
 * RU: (нет журнала — нет вывоза) сделал бы отказ журнала отказом всего, а это не та цена.
 * RU: Но и глотать отказ нельзя: «в журнале ничего нет» читалось бы как «операций не было».
 * EN: 🔴 A JOURNAL FAILURE NEITHER CANCELS THE OPERATION NOR STAYS SILENT. If the trace cannot
 * EN: be written, we say so out loud and carry on: the journal guards history, it does not
 * EN: authorize work. The reverse order (no journal — no export) would turn a journal failure
 * EN: into a failure of everything, and that is the wrong price. Swallowing the failure is
 * EN: not allowed either: "nothing in the journal" would read as "no operations happened".
 *
 * RU: ⚠️ ГРАНИЦА: журнал ведётся у ТОЙ базы, которую трогает операция. Вывоз читает базу
 * RU: только на чтение, поэтому свою строку он пишет отдельным соединением на запись —
 * RU: и если база чужая или недоступна на запись, след не появится, о чём будет сказано.
 * EN: ⚠️ BOUNDARY: the journal lives in THE database the operation touches. Export opens the
 * EN: database read-only, so it writes its row through a separate read-write connection —
 * EN: and if the database has a foreign schema or is not writable, no trace appears, and
 * EN: that is reported.
 *
 * RU: Вход: { baza — путь к файлу SQLite; agent — кто пишет (умолчание 'vyvoz');
 * RU:   klass, ishod, pochemu — обязательные по смыслу поля строки; priroda, istochnik —
 * RU:   необязательные (пустое → NULL); krik — функция для предупреждения об отказе }.
 * RU: Выход: true — строка вставлена; false — не вставлена (причина уходит в krik).
 * RU: Отказы: сама не бросает — любая ошибка (база не открылась, таблицы zhurnal нет,
 * RU:   значение не привязалось к параметру) превращается в false и предупреждение;
 * RU:   наружу уйдёт только исключение, брошенное самим krik.
 * RU: Чего НЕ ловит: без krik отказ виден только по false — молчание тогда на совести
 * RU:   вызывающего; не проверяет, что столбцы таблицы zhurnal совпадают с ожидаемыми
 * RU:   (несовпадение станет отказом INSERT, а не отдельным признаком); соединение
 * RU:   открывается в режиме по умолчанию, то есть на несуществующем пути создаётся
 * RU:   пустой файл базы.
 * EN: Input: { baza — path to the SQLite file; agent — who writes (default 'vyvoz');
 * EN:   klass, ishod, pochemu — row fields required by meaning; priroda, istochnik —
 * EN:   optional (empty → NULL); krik — function that receives the failure warning }.
 * EN: Output: true — row inserted; false — not inserted (the reason goes to krik).
 * EN: Failures: does not throw by itself — any error (database did not open, no zhurnal
 * EN:   table, a value could not be bound to a parameter) becomes false plus a warning;
 * EN:   only an exception thrown by krik itself escapes.
 * EN: Does NOT catch: without krik a failure is visible only as false — silence is then
 * EN:   the caller's responsibility; does not verify that the zhurnal columns match the
 * EN:   expected ones (a mismatch becomes an INSERT failure, not a separate signal); the
 * EN:   connection opens in default mode, so a non-existent path gets an empty database
 * EN:   file created.
 */
export function zapisat_v_zhurnal({ baza, agent = 'vyvoz', klass, ishod, priroda, pochemu, istochnik, krik }) {
  let db;
  try {
    db = new DatabaseSync(baza);
    const est = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zhurnal'").get();
    if (!est) {
      // RU: Таблицы нет — это не поломка: база может быть чужой схемы. Но молчать нельзя.
      // EN: No table is not a breakage: the database may have a foreign schema. But we must not stay silent.
      throw new Error('таблицы zhurnal в этой базе нет');
    }
    // RU: Время ставится здесь, в момент записи следа, а не берётся у вызывающего.
    // EN: The timestamp is taken here, when the trace is written, not supplied by the caller.
    db.prepare('INSERT INTO zhurnal (kogda, agent, klass, ishod, priroda, pochemu, istochnik) VALUES (?,?,?,?,?,?,?)')
      .run(Date.now(), agent, klass, ishod, priroda ?? null, pochemu, istochnik ?? null);
    return true;
  } catch (e) {
    // RU: Отказ не бросается дальше: операция уже состоялась, о потере следа говорим через krik.
    // EN: The failure is not rethrown: the operation has already happened; the lost trace is reported via krik.
    if (krik) krik(`⚠️ след в журнале НЕ записан (${e?.message ?? e}): операция состоялась, но истории о ней не осталось`);
    return false;
  } finally {
    try { db?.close(); } catch {
      // RU: закрывать нечего
      // EN: nothing to close
    }
  }
}
