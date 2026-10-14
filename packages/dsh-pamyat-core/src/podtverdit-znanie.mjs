#!/usr/bin/env node
/**
 * RU: Команда для ручного подтверждения ранее записанного знания. Подтверждение относится к полномочиям
 *    человека, поэтому команда не регистрируется как инструмент модели: иначе модель могла бы подписать
 *    собственное знание без одобрения.
 * EN: Command for a human to confirm previously stored knowledge. Confirmation requires human authority, so
 *    this command is not registered as a model tool: a model must not sign off on its own knowledge without
 *    approval.
 *
 * RU: Путь src/podtverdit-znanie.mjs — текущая точка входа. Скрипт лежит в src/ по исторической причине
 *    ограниченных прав на корень установленного пакета; перенос в bin/ требует согласованного изменения
 *    упаковки и установки, а не отдельной копии файла.
 * EN: src/podtverdit-znanie.mjs is the current entry point. The script remains in src/ because of historical
 *    write restrictions on the installed package root; moving it to bin/ requires coordinated packaging and
 *    installation changes rather than copying one file.
 *
 * RU: Имя одобрившего задаётся в --kem, а фактическая учётная запись вызова снимается через userInfo() и
 *    hostname() и записывается в основание. Это разные сведения: заявленный одобривший не доказывает
 *    личность того, кто запустил команду. Если замер не удался, основание явно сообщает об этом.
 * EN: The approver name is supplied through --kem, while the account that runs the command is read through
 *    userInfo() and hostname() and included in the rationale. These are different facts: a supplied approver
 *    name does not prove who ran the command. If account detection fails, the rationale states that
 *    explicitly.
 *
 * RU: Границы: один вызов подтверждает одну запись; команда не запрашивает одобрение, не снимает исходный
 *    флаг «без подтверждения», не меняет vera и оценки. --status печатает состояние и выходит до
 *    подтверждения; открытие хранилища при этом может выполнить миграции схемы, поэтому это не режим SQLite
 *    readOnly.
 * EN: Limits: one invocation confirms one record; the command does not request approval, clear the original
 *    “without approval” flag, or change vera and assessments. --status prints the state and exits before
 *    confirmation; opening storage may still run schema migrations, so it is not SQLite readOnly mode.
 *
 * RU: Коды завершения: 0 — подтверждение сохранено или --status напечатан; 1 — отказ по записи (не найдена,
 *    подтверждение не требовалось, уже подтверждена, отметка негодна); 2 — неверные аргументы или
 *    невозможность прочитать базу, а также вывод справки. Неудача чтения не выдаётся за отсутствие записи.
 * EN: Exit codes: 0 means confirmation was stored or --status was printed; 1 means a record-level refusal
 *    (missing record, approval not required, already confirmed, invalid mark); 2 means invalid arguments or
 *    failure to read the database, and is also used for help output. A read failure is not reported as a
 *    missing record.
 */
import { otkrytHranilishche } from './hranilishche.js';
import { userInfo, hostname } from 'node:os';
import { existsSync } from 'node:fs';

const dovody = process.argv.slice(2);
const vzyat = (imya) => {
  const i = dovody.indexOf(imya);
  return i >= 0 && i + 1 < dovody.length ? dovody[i + 1] : null;
};

if (dovody.length === 0 || dovody.includes('--pomoshch') || dovody.includes('-h')) {
  console.log('node src/podtverdit-znanie.mjs --baza <путь> --id <номер> --kem "<кто одобрил>" [--pochemu "<основание>"]');
  console.log('  --status  печатает статус записи и выходит, ничего не меняя');
  process.exit(2);
}

const putBazy = vzyat('--baza');
const syrojId = vzyat('--id');
const kem = vzyat('--kem');
const pochemuDano = vzyat('--pochemu');

if (!putBazy) {
  console.error('СЛЕПОТА: не назван путь к базе (--baza). Умолчания нет намеренно: подтвердить не ту базу хуже, чем не подтвердить вовсе.');
  process.exit(2);
}
const nomer = Number(syrojId);
if (!Number.isInteger(nomer) || nomer <= 0) {
  console.error('СЛЕПОТА: --id должен быть целым положительным; получено ' + JSON.stringify(syrojId));
  process.exit(2);
}

/**
 * RU: Проверить существование файла до открытия: драйвер иначе создаст пустую базу по ошибочному пути
 *    --baza. Такая база ответила бы «записи нет», скрыв ошибку выбора базы. Отсутствующий файл даёт код 2 и
 *    не создаётся; отсутствие записи в существующей базе — код 1.
 * EN: Check that the file exists before opening it: otherwise the driver can create an empty database at a
 *    mistyped --baza path. That database would report “record not found” and conceal the wrong database
 *    selection. A missing file yields exit code 2 and is not created; a missing record in an existing
 *    database yields exit code 1.
 */
if (!existsSync(putBazy)) {
  console.error('СЛЕПОТА: базы по пути ' + putBazy + ' нет. Файл НЕ создаётся: пустая база ответила бы '
    + '«записи нет» на любой опознаватель, и это читалось бы как ответ о вашей памяти.');
  process.exit(2);
}

let h;
try {
  h = otkrytHranilishche(putBazy);
} catch (e) {
  console.error('СЛЕПОТА: база не открылась (' + putBazy + '): ' + String(e?.message ?? e));
  process.exit(2);
}

const zapis = h.poId(nomer);
if (!zapis) {
  console.error('ОТКАЗ: записи ' + nomer + ' в этой базе нет.');
  h.zakryt();
  process.exit(1);
}

const st = h.statusPodtverzhdeniya(zapis);
console.log('запись ' + nomer + ' · класс ' + zapis.klass + ' · агент ' + zapis.agent);
console.log('  ' + String(zapis.soderzhim ?? '').slice(0, 120).replace(/\s+/g, ' '));
console.log('  статус подтверждения: ' + st.stroka);

if (dovody.includes('--status')) { h.zakryt(); process.exit(0); }

if (!kem || kem.trim() === '') {
  console.error('СЛЕПОТА: не назван одобривший (--kem). Подпись без автора подтверждением не является.');
  h.zakryt();
  process.exit(2);
}

/**
 * RU: Снять фактическую учётную запись на пишущей стороне в момент вызова, без подстановки имени из
 *    аргументов. Это след запуска, а не проверка права человека одобрять знание.
 * EN: Read the actual account on the writing side at invocation time rather than taking its name from
 *    arguments. This records who ran the command; it does not verify the human authority to approve
 *    knowledge.
 */
const ruka = (() => {
  try { return userInfo().username + '@' + hostname(); } catch { return 'рука НЕ УСТАНОВЛЕНА'; }
})();
const pochemu = 'рука вызова: ' + ruka + (pochemuDano ? '; основание: ' + pochemuDano : '; основание не названо');

try {
  const r = h.podtverdit({ id: nomer, kem: kem.trim(), pochemu });
  console.log('✅ подтверждено: ' + r.kem + ' · ' + new Date(r.kogda).toISOString());
  console.log('   ' + pochemu);
  console.log('   ⚠️ флаг «записано без подтверждения» ОСТАЁТСЯ: он про то, что запись какое-то время жила неподтверждённой.');
  h.zakryt();
  process.exit(0);
} catch (e) {
  console.error('ОТКАЗ: ' + String(e?.message ?? e) + ' [' + (e?.code ?? 'без кода') + ']');
  h.zakryt();
  process.exit(1);
}
