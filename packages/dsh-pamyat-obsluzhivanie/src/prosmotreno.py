#!/usr/bin/env python3
"""RU: Ручная отметка «просмотрено человеком» для пар судьи памяти (решение владельца).

Зачем: пары с признаком секрета и слишком длинные пары судья модели не отдаёт никогда — они лежат в очереди и каждую
ночь дают статус finding. Человек, посмотрев пару, ставит отметку; ночной прогон (judge.run) такую пару больше
не считает ни в secret_pairs, ни в oversize и судье не отдаёт.

Кто зовёт: человек вручную из командной строки (от служебной учётки omega). Ночной прогон этот файл не исполняет,
а только читает результат его работы через judge.load_prosmotreno.

Где: <STATE>/prosmotreno.json рядом с state.json судьи (по умолчанию — значение STATE ниже, переопределяется
переменной PROSMOTRENO_STATE; учётка omega, каталог 0700). Отдельный файл: решения человека не зависят от
перестройки state.json.
Читает: <STATE>/state.json (очередь и разобранные пары), <STATE>/prosmotreno.json, базу OMEGA (только spisok,
только чтение, путь — DB ниже или PROSMOTRENO_DB). Пишет: <STATE>/prosmotreno.json (атомарно, judge.atomic_json),
создаёт <STATE>/lock, если его нет.
Ключ пары — pair_key (sha256 от node_id+текста+корня): правка любой из двух записей меняет ключ, и отметка
перестаёт действовать сама — отмечено то, что человек видел, а не «эта пара навсегда».

Команды (от omega):
  prosmotreno.py spisok                      — пары очереди с признаком секрета/длины (ключ, node_id, байты; ТЕКСТОВ НЕ ПЕЧАТАЕТ)
  prosmotreno.py otmetit КЛЮЧ КТО ПОЧЕМУ     — отметить; ключ обязан быть в очереди сейчас
  prosmotreno.py snyat   КЛЮЧ КТО ПОЧЕМУ     — снять отметку
Коды: 0 сделано · 2 отказ (неизвестная команда или ключ, пустые КТО/ПОЧЕМУ, идёт прогон, нет состояния).
Запись — под тем же замком <STATE>/lock, что и прогон (flock LOCK_NB: идёт прогон — отказ, не ожидание).
ЧЕГО НЕ ДЕЛАЕТ: не меняет память, не судит пару и не решает за человека, секрет ли это. Отметка — след решения.
НЕ ЛОВИТ: подлинность КТО (это свободный текст, не проверяемая личность); код 2 обещан только для OSError и
ValueError — ошибки SQLite и неполный state.json (нет ключа queue/done) выходят трассировкой с кодом 1.
Если ночной прогон уже убрал отмеченную пару из очереди, снятие отметки её не возвращает: вернёт только прогон,
который найдёт пару снова (журнал V1 или векторный поиск).

EN: Manual "reviewed by a human" mark for memory judge pairs (owner decision).

Purpose: pairs with a secret sign and oversized pairs are never sent to the model judge — they stay queued and give
a finding status every night. After looking at a pair, a human sets a mark; the nightly run (judge.run) then no
longer counts that pair in secret_pairs or oversize and does not send it to the judge.

Caller: a human, manually from the command line (as the omega service account). The nightly run does not execute
this file; it only reads its result via judge.load_prosmotreno.

Where: <STATE>/prosmotreno.json next to the judge state.json (default — the STATE value below, overridden by the
PROSMOTRENO_STATE variable; account omega, directory 0700). A separate file: human decisions do not depend on
state.json being rebuilt.
Reads: <STATE>/state.json (queue and judged pairs), <STATE>/prosmotreno.json, the OMEGA database (spisok only,
read-only, path — DB below or PROSMOTRENO_DB). Writes: <STATE>/prosmotreno.json (atomically, judge.atomic_json),
creates <STATE>/lock if absent.
The pair key is pair_key (sha256 of node_id+text+root): editing either record changes the key, and the mark stops
applying by itself — what is marked is what the human saw, not "this pair forever".

Commands (as omega):
  prosmotreno.py spisok                      — queued pairs with a secret/size sign (key, node_id, bytes; PRINTS NO TEXTS)
  prosmotreno.py otmetit KEY WHO WHY         — mark; the key must be in the queue right now
  prosmotreno.py snyat   KEY WHO WHY         — remove the mark
Exit codes: 0 done · 2 refusal (unknown command or key, empty WHO/WHY, a run in progress, no state).
Writes happen under the same <STATE>/lock as the run (flock LOCK_NB: a run in progress — refusal, no waiting).
DOES NOT: change memory, judge the pair, or decide for the human whether it is a secret. A mark is a trace of a decision.
DOES NOT CATCH: authenticity of WHO (free text, not a verified identity); code 2 is promised only for OSError and
ValueError — SQLite errors and an incomplete state.json (no queue/done key) exit with a traceback and code 1.
If a nightly run has already removed a marked pair from the queue, removing the mark does not bring it back: only a run
that finds the pair again (V1 journal or vector search) does.
"""
import datetime as dt
import fcntl
import importlib.util
import json
import os
import sqlite3
import sys
from pathlib import Path

# RU: judge.py грузится по пути рядом с этим файлом, а не через sys.path: берётся именно соседний модуль пакета.
# EN: judge.py is loaded by path next to this file, not via sys.path: exactly the package's sibling module is used.
SRC = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('judge', SRC / 'judge.py')
judge = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(judge)

# RU: Каталог состояния судьи и путь к базе OMEGA; переменные окружения переопределяют значения по умолчанию
# RU: (так их подменяют стенды).
# EN: Judge state directory and OMEGA database path; environment variables override the defaults
# EN: (test benches substitute them this way).
STATE = Path(os.environ.get('PROSMOTRENO_STATE', '/var/lib/dsh-pamyat-obsluzhivanie/judge'))
DB = Path(os.environ.get('PROSMOTRENO_DB', '/var/lib/omega/.omega/omega.db'))


def otkaz(tekst):
    """RU: Печать отказа в stderr с префиксом «ОТКАЗ:». Выход: код 2 для возврата из команды.

    EN: Print a refusal to stderr with the «ОТКАЗ:» prefix. Output: exit code 2 to return from a command."""
    print(f'ОТКАЗ: {tekst}', file=sys.stderr)
    return 2


def sostoyanie():
    """RU: Чтение <STATE>/state.json судьи. Выход: dict состояния.
    Отказы: FileNotFoundError, если файла нет (судья ещё не работал); ValueError при версии ≠ 1 или негодном JSON.
    НЕ ловит: отсутствие ключей queue/done в состоянии версии 1 — дальше это KeyError.

    EN: Read the judge <STATE>/state.json. Output: the state dict.
    Failures: FileNotFoundError if the file is absent (the judge has not run yet); ValueError on version != 1 or bad JSON.
    Does NOT catch: missing queue/done keys in a version-1 state — later this is a KeyError."""
    p = STATE / 'state.json'
    if not p.exists():
        raise FileNotFoundError(f'нет {p}')
    s = json.loads(p.read_text())
    if s.get('version') != 1:
        raise ValueError('unknown state version')
    return s


def zapisi():
    """RU: Действующие записи памяти из живой базы OMEGA, открытой только на чтение (URI mode=ro), через judge.load_active.
    Выход: {node_id: запись}. Отказы: ошибки SQLite (нет файла, нет таблицы), ValueError из load_active.
    В отличие от ночного прогона, снимок не делается: читается живая база.

    EN: Active memory records from the live OMEGA database opened read-only (URI mode=ro), via judge.load_active.
    Output: {node_id: record}. Failures: SQLite errors (no file, no table), ValueError from load_active.
    Unlike the nightly run, no snapshot is taken: the live database is read."""
    with sqlite3.connect(f'file:{DB}?mode=ro', uri=True) as c:
        c.row_factory = sqlite3.Row
        return judge.load_active(c)


def spisok():
    """RU: Команда spisok: печать в stdout пар очереди, которые судья не отдаёт модели, — с признаком секрета
    (judge.sensitive_pair) и/или длиннее judge.MAX_INPUT_BYTES. Строка: ключ, node_id a, node_id b, байты, признаки.
    Пропускаются: пары с исчезнувшей записью, уже разобранные (done) и уже отмеченные. Итог-счётчик — в stderr.
    Тексты памяти не печатаются. Замок не берётся: только чтение (state.json пишется атомарно, половины не будет).
    Выход: 0. Отказы: см. sostoyanie и zapisi.
    НЕ ловит: пары, которых ещё нет в очереди (их найдёт только следующий ночной прогон).

    EN: The spisok command: print to stdout queued pairs the judge never sends to the model — with a secret sign
    (judge.sensitive_pair) and/or longer than judge.MAX_INPUT_BYTES. Line: key, node_id a, node_id b, bytes, signs.
    Skipped: pairs with a vanished record, already judged (done) and already marked. The summary counter goes to stderr.
    Memory texts are not printed. No lock is taken: read only (state.json is written atomically, never half).
    Output: 0. Failures: see sostoyanie and zapisi.
    Does NOT catch: pairs not yet in the queue (only the next nightly run will find them)."""
    s, otm, rec = sostoyanie(), judge.load_prosmotreno(STATE), zapisi()
    n = 0
    for key, p in s['queue'].items():
        a, b = rec.get(p['a']), rec.get(p['b'])
        if a is None or b is None or key in s['done'] or key in otm:
            continue
        # RU: Размер считается той же формулой, что в judge.run для deferred: JSON двух текстов в байтах UTF-8.
        # EN: Size uses the same formula as judge.run for deferred: JSON of the two texts in UTF-8 bytes.
        bajt = len(json.dumps([a['content'], b['content']], ensure_ascii=False).encode())
        priznaki = [x for x, da in (('secret', judge.sensitive_pair(a, b)), ('oversize', bajt > judge.MAX_INPUT_BYTES)) if da]
        if priznaki:
            n += 1
            print(f"{key}\t{p['a']}\t{p['b']}\t{bajt} Б\t{','.join(priznaki)}")
    print(f'# пар с признаком: {n}; отмечено ранее: {len(otm)}', file=sys.stderr)
    return 0


def pravka(komanda, key, kto, pochemu):
    """RU: Команды otmetit / snyat: поставить или снять отметку для ключа пары.
    Вход: komanda ('otmetit' или 'snyat'), key, kto, pochemu (непустые после strip).
    otmetit: ключ ещё не отмечен и есть в очереди state.json сейчас; в отметку пишутся kto, kogda (UTC, секунды),
    pochemu и node_id обеих записей. snyat: ключ должен быть отмечен.
    Побочные эффекты: создание <STATE>/lock при отсутствии; атомарная перезапись <STATE>/prosmotreno.json; строка в stdout.
    Выход: 0 сделано, 2 отказ. Отказы с кодом 2: пустые КТО/ПОЧЕМУ, замок занят (идёт ночной прогон), повторная
    отметка, ключа нет в очереди, снимать нечего. OSError/ValueError уходят наверх (в __main__ → код 2).
    НЕ ловит: что ключ действительно относится к паре с признаком секрета/длины — отметить можно любую пару очереди.

    EN: The otmetit / snyat commands: set or remove a mark for a pair key.
    Input: komanda ('otmetit' or 'snyat'), key, kto, pochemu (non-empty after strip).
    otmetit: the key is not yet marked and is in the state.json queue right now; the mark stores kto, kogda (UTC,
    seconds), pochemu and both node_ids. snyat: the key must be marked.
    Side effects: creates <STATE>/lock if absent; atomically rewrites <STATE>/prosmotreno.json; a line to stdout.
    Output: 0 done, 2 refusal. Refusals with code 2: empty WHO/WHY, lock busy (a nightly run is in progress), repeated
    mark, key not in the queue, nothing to remove. OSError/ValueError propagate (in __main__ -> code 2).
    Does NOT catch: whether the key really belongs to a secret/oversize pair — any queued pair can be marked."""
    if not kto.strip() or not pochemu.strip():
        return otkaz('КТО и ПОЧЕМУ обязательны')
    # RU: Тот же файл замка, что у judge.run: без ожидания — пока идёт прогон, правка отказывает, а не ждёт.
    # RU: Состояние и отметки читаются уже под замком, чтобы прогон не поменял их между чтением и записью.
    # EN: Same lock file as judge.run, non-waiting: while a run is in progress the edit refuses instead of waiting.
    # EN: State and marks are read under the lock so a run cannot change them between read and write.
    with (STATE / 'lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return otkaz('идёт ночной прогон (замок занят) — повторите позже')
        s, otm = sostoyanie(), judge.load_prosmotreno(STATE)
        if komanda == 'otmetit':
            if key in otm:
                return otkaz(f'{key} уже отмечен ({otm[key]["kto"]}, {otm[key]["kogda"]})')
            p = s['queue'].get(key)
            if p is None:
                return otkaz(f'{key} нет в очереди судьи — отмечать нечего (опечатка или пара уже разобрана/ушла)')
            otm[key] = {'kto': kto, 'kogda': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
                        'pochemu': pochemu, 'a': p['a'], 'b': p['b']}
        else:
            if key not in otm:
                return otkaz(f'{key} не отмечен — снимать нечего')
            del otm[key]
        # RU: Атомарная запись (временный файл + rename): ночной прогон не прочтёт половину файла.
        # EN: Atomic write (temp file + rename): the nightly run never reads half a file.
        judge.atomic_json(STATE / judge.PROSMOTRENO, {'version': 1, 'pary': otm})
    print(f"{'отмечено' if komanda == 'otmetit' else 'снято'}: {key} · {kto} · {pochemu}")
    return 0


def main(argv):
    """RU: Разбор вызова: только «spisok» без аргументов или «otmetit|snyat КЛЮЧ КТО ПОЧЕМУ» ровно с тремя аргументами.
    Любой другой вызов, включая привычные ключи вроде --dry-run, — отказ с кодом 2, а не действие.

    EN: Argument parsing: only "spisok" with no arguments or "otmetit|snyat KEY WHO WHY" with exactly three arguments.
    Any other call, including habitual flags like --dry-run, is a refusal with code 2, not an action."""
    if argv[:1] == ['spisok'] and len(argv) == 1:
        return spisok()
    if len(argv) == 4 and argv[0] in ('otmetit', 'snyat'):
        return pravka(*argv)
    return otkaz('неизвестный вызов — только: spisok | otmetit КЛЮЧ КТО ПОЧЕМУ | snyat КЛЮЧ КТО ПОЧЕМУ (ключей вроде --dry-run нет)')


if __name__ == '__main__':
    # RU: OSError (включая «нет state.json») и ValueError превращаются в отказ с кодом 2.
    # RU: НЕ ловит: ошибки SQLite и KeyError — они выходят трассировкой с кодом 1.
    # EN: OSError (including "no state.json") and ValueError become a refusal with code 2.
    # EN: Does NOT catch: SQLite errors and KeyError — they exit with a traceback and code 1.
    try:
        sys.exit(main(sys.argv[1:]))
    except (OSError, ValueError) as e:
        sys.exit(otkaz(f'{type(e).__name__}: {e}'))
