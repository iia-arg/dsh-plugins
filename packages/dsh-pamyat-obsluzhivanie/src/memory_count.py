"""RU: Счёт локальной памяти агентов только на чтение: без повторов, 5 секунд на базу.
EN: Read-only local memory ledger count: no retries, 5 seconds per database.

RU: Кто зовёт: runner.py, первой ступенью штатного прогона (до уроков, чистки и судьи), в отдельном
дочернем процессе с пределом 60 секунд на всю ступень. Работает под учётной записью службы
обслуживания (omega). Для каждой базы запускает memory_count.mjs (счётчик ядра памяти) отдельным
процессом node.
EN: Caller: runner.py, as the first stage of a production run (before lessons, cleanup and judge), in a
separate child process limited to 60 seconds for the whole stage. Runs under the maintenance service
account (omega). For each database it spawns memory_count.mjs (the memory core counter) as a separate
node process.

RU: Читает: базы <дом агента>/pamyat/pamyat.db по списку агентов из реестра (список передаёт вызывающий).
Пишет: ничего на диск; возвращает словарь отчёта, который runner сохраняет в JSON прогона.
EN: Reads: databases <agent home>/pamyat/pamyat.db for the agent list from the registry (passed in by the caller).
Writes: nothing to disk; returns a report dict that runner stores in the run JSON.

RU: Чего НЕ делает: не пишет в базы, не повторяет чтение, не сдвигает отсечку, не шлёт тревог сам —
строки alerts попадают в общий ночной итог через runner.
EN: Does NOT: write to databases, retry reads, move the cutoff, or send alerts itself —
the alerts lines go into the common nightly summary via runner.
"""
import json
import os
from pathlib import Path
import re
import subprocess


def read(agent, db):
    """RU: Считает одну базу через memory_count.mjs и проверяет форму ответа.
    Вход: имя агента, путь к базе. Выход: словарь сводки ядра (поля счёта — целые числа).
    Отказы: ValueError('core_read_failed') — node вернул ненулевой код или поле error;
    ValueError('count_or_cutoff_unknown') — нет или не целое одно из пяти полей счёта/отсечки;
    JSONDecodeError — stdout не JSON; subprocess.TimeoutExpired — дольше 5 секунд; OSError — node не запустился.
    Побочных эффектов нет, кроме запуска процесса node.
    НЕ ловит: правдоподобные, но неверные числа от ядра — их форма проверяется, смысл нет.

    EN: Counts one database via memory_count.mjs and validates the response shape.
    Input: agent name, database path. Output: the core's summary dict (count fields are integers).
    Refusals: ValueError('core_read_failed') — node returned non-zero or an error field;
    ValueError('count_or_cutoff_unknown') — one of the five count/cutoff fields is missing or not an int;
    JSONDecodeError — stdout is not JSON; subprocess.TimeoutExpired — over 5 seconds; OSError — node failed to start.
    No side effects other than spawning node.
    Does NOT catch: plausible but wrong numbers from the core — their shape is checked, not their meaning.
    """
    # RU: Путь к .mjs — рядом с этим файлом (та же папка, другое расширение). Среда наследуется целиком,
    # RU: добавлено только подавление предупреждений node, чтобы stdout оставался чистым JSON.
    # EN: The .mjs path is next to this file (same folder, other suffix). The environment is inherited as is,
    # EN: only node warnings are suppressed so stdout stays clean JSON.
    result = subprocess.run(['/usr/local/bin/node', str(Path(__file__).with_suffix('.mjs')), agent, str(db)],
                            capture_output=True, text=True, timeout=5,
                            env={**os.environ, 'NODE_NO_WARNINGS': '1'})
    # RU: JSON разбирается до проверки кода возврата: и успех, и отказ .mjs печатают одну строку JSON.
    # EN: JSON is parsed before checking the exit code: both success and refusal of the .mjs print one JSON line.
    data = json.loads(result.stdout)
    if result.returncode or data.get('error'):
        raise ValueError('core_read_failed')
    # RU: type(...) is int — строгая проверка: bool (подкласс int) и дробные числа не проходят.
    # EN: type(...) is int is strict: bool (an int subclass) and floats do not pass.
    for key in ['zapisano', 'otmetokZapisano', 'raznicaZapisano', 'istoricheskayaRaznica', 'novayaRaznica']:
        if type(data.get(key)) is not int:
            raise ValueError('count_or_cutoff_unknown')
    return data


def run_stage(agents):
    """RU: Ступень «счёт памяти»: обходит всех агентов из реестра, считает каждую базу.
    Вход: список словарей агентов (ключи agent и home), как отдаёт загрузчик реестра.
    Выход: словарь отчёта: status (ok | finding | error), expected (знаменатель), checked,
    mismatches, agents (поимённо, с путями и полями сводки), alerts (строки для итога), reason.
    finding — хотя бы у одного агента novayaRaznica != 0; error — слепота охвата
    (пустой реестр, повтор/негодная запись, отказ чтения любой базы).
    Побочных эффектов нет. Исключения вне перечня (OSError, ValueError, SubprocessError)
    не перехватываются и уходят вызывающему.
    НЕ ловит: агентов, которых нет в реестре; базу не по пути <дом>/pamyat/pamyat.db.

    EN: The "memory count" stage: walks all registry agents and counts each database.
    Input: list of agent dicts (keys agent and home) as returned by the registry loader.
    Output: report dict: status (ok | finding | error), expected (denominator), checked,
    mismatches, agents (per agent, with paths and summary fields), alerts (lines for the summary), reason.
    finding — at least one agent has novayaRaznica != 0; error — coverage blindness
    (empty registry, duplicate/invalid entry, read refusal for any database).
    No side effects. Exceptions outside the caught set (OSError, ValueError, SubprocessError)
    are not caught and propagate to the caller.
    Does NOT catch: agents missing from the registry; a database not at <home>/pamyat/pamyat.db.
    """
    report = {'status': 'ok', 'expected': len(agents), 'checked': 0,
              'mismatches': 0, 'agents': [], 'alerts': []}
    # RU: Первый проход — проверка реестра целиком до любого чтения: имя из узкого алфавита,
    # RU: абсолютный дом, нет повторов ни по имени, ни по канонизированному пути базы
    # RU: (две записи, ведущие к одной базе через ссылки, считаются повтором).
    # RU: Любой сбой — сразу error без чтения баз: неверный знаменатель хуже отсутствия счёта.
    # EN: First pass — validate the whole registry before any read: name from a narrow alphabet,
    # EN: absolute home, no duplicates by name or by the canonical database path
    # EN: (two entries leading to the same database via links count as a duplicate).
    # EN: Any failure returns error at once without reading: a wrong denominator is worse than no count.
    names, paths = set(), set()
    for a in agents:
        name, home = a['agent'], Path(a['home'])
        path = (home / 'pamyat/pamyat.db').resolve()
        if (not re.fullmatch(r'[-a-z0-9_]+', name) or not home.is_absolute()
                or name in names or path in paths):
            report.update(status='error', reason='duplicate_or_invalid_registry')
            report['alerts'].append('СЛЕПОТА счёта памяти: повтор или негодный агент/путь в реестре')
            return report
        names.add(name)
        paths.add(path)
    # RU: Пустой реестр — не «всё чисто», а слепота охвата 0/0.
    # EN: An empty registry is not "all clean" but 0/0 coverage blindness.
    if not agents:
        report.update(status='error', reason='empty_coverage')
        report['alerts'].append('СЛЕПОТА счёта памяти: пустой охват баз 0/0')
    # RU: Второй проход — чтение. Здесь путь НЕ канонизируется: memory_count.mjs сам отвергает путь
    # RU: со ссылкой, и такая база станет именованной ошибкой, а не тихим чтением чужой базы.
    # RU: Отказ одной базы не останавливает обход остальных.
    # EN: Second pass — reading. The path is NOT canonicalised here: memory_count.mjs itself refuses a path
    # EN: with a link, so such a database becomes a named error rather than a silent read of another database.
    # EN: One database's refusal does not stop the walk over the rest.
    for a in agents:
        name = a['agent']
        db = Path(a['home']) / 'pamyat/pamyat.db'
        item = {'agent': name, 'db': str(db)}
        report['agents'].append(item)
        try:
            data = read(name, db)
            item.update(data, status='ok')
            report['checked'] += 1
            # RU: Любая ненулевая «новая разница» (после отсечки) — находка; поле zapisiSvodka
            # RU: берётся из ответа ядра без проверки его наличия.
            # EN: Any non-zero "new difference" (after the cutoff) is a finding; the zapisiSvodka field
            # EN: is taken from the core response without checking that it exists.
            if data['novayaRaznica'] != 0:
                item['status'] = 'finding'
                report['mismatches'] += 1
                report['alerts'].append(f'РАСХОЖДЕНИЕ счёта памяти агента {name}: {data["zapisiSvodka"]}')
        except (OSError, ValueError, subprocess.SubprocessError) as e:
            # RU: В причину попадают только два известных кода или имя класса исключения —
            # RU: текст исключения может нести путь или данные, поэтому он не переносится.
            # EN: The reason carries only the two known codes or the exception class name —
            # EN: exception text may carry a path or data, so it is not copied.
            reason = str(e) if type(e) is ValueError and str(e) in {'core_read_failed', 'count_or_cutoff_unknown'} else type(e).__name__
            item.update(status='error', reason=reason)
            report['status'] = 'error'
            report['alerts'].append(f'СЛЕПОТА счёта памяти агента {name}: {item["reason"]}')
    # RU: error старше finding: при слепоте хоть одной базы итог — error, даже если есть расхождения.
    # EN: error outranks finding: if any database is blind the result is error even with mismatches.
    if report['status'] == 'ok' and report['mismatches']:
        report['status'] = 'finding'
    return report


def summary(report):
    """RU: Строка счёта памяти для общего ночного итога.
    Вход: отчёт run_stage (или заглушка {'status': 'not_run'}, если ступень не запускалась).
    Выход: строка «счёт памяти=<статус>: баз проверено/ожидалось, расхождений N/проверено» плюс
    все строки alerts; если строк нет, а статус не ok/not_run — пометка слепоты с причиной.
    Отсутствующие числа печатаются как «не измерено», а не как ноль. Побочных эффектов нет.

    EN: Memory count line for the common nightly summary.
    Input: run_stage report (or a {'status': 'not_run'} stub when the stage did not run).
    Output: "memory count=<status>: databases checked/expected, mismatches N/checked" plus
    all alerts lines; with no lines and a status other than ok/not_run — a blindness mark with the reason.
    Missing numbers are printed as "not measured", never as zero. No side effects.
    """
    checked, expected = report.get('checked', 'не измерено'), report.get('expected', 'не измерено')
    text = f'счёт памяти={report.get("status", "not_run")}: баз {checked}/{expected}, расхождений {report.get("mismatches", "не измерено")}/{checked}'
    if report.get('alerts'):
        text += '; ' + '; '.join(report['alerts'])
    elif report.get('status') not in {'ok', 'not_run'}:
        text += '; СЛЕПОТА счёта памяти: ' + report.get('reason', report['status'])
    return text
