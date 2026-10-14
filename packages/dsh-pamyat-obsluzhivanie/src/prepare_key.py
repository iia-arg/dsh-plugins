#!/usr/bin/python3
# RU: Подготовка ключа модели-судьи от root перед прогоном обслуживания и удаление ключа после него.
# EN: Root-side preparation of the judge model key before a maintenance run, and its removal afterwards.
#
# RU: Кто зовёт: юнит службы обслуживания (systemd/dsh-pamyat-obsluzhivanie.service):
# RU:   ExecStartPre=+… prepare_key.py prepare   — до запуска runner.py;
# RU:   ExecStopPost=+… prepare_key.py remove    — после завершения службы, при любом исходе.
# RU: Префикс «+» означает запуск от root, хотя сама служба работает под учётной записью omega.
# RU: Запускается системным /usr/bin/python3 -I -S -B из отдельной root-копии файла (вне каталогов пакета,
# RU: доступных на запись не-root): -I отбрасывает cwd/PYTHONPATH, -S — site/.pth, -B — запись байткода.
# RU: Поэтому здесь только стандартная библиотека.
# EN: Caller: the maintenance service unit (systemd/dsh-pamyat-obsluzhivanie.service):
# EN:   ExecStartPre=+… prepare_key.py prepare   — before runner.py starts;
# EN:   ExecStopPost=+… prepare_key.py remove    — after the service ends, whatever the outcome.
# EN: The "+" prefix runs it as root even though the service itself runs as the omega account.
# EN: It runs under the system /usr/bin/python3 -I -S -B from a separate root copy of the file (outside
# EN: package directories writable by non-root): -I drops cwd/PYTHONPATH, -S drops site/.pth, -B bytecode writes.
# EN: Hence standard library only.
#
# RU: Что делает prepare: проверяет маску таймера; читает ключ из хранилища pass от имени учётной записи
# RU: coders с очищенной средой и пределами по времени и размеру; атомарно кладёт первую строку ключа
# RU: в файл DIRECTORY/deepseek (каталог root:omega 0750, файл root:omega 0440), откуда его читает служба
# RU: (переменная DEEPSEEK_CREDENTIAL_FILE в юните).
# RU: Что делает remove: удаляет файл ключа; пустой каталог может остаться.
# EN: prepare: checks the timer mask; reads the key from the pass store as the coders account with a
# EN: cleared environment and time/size limits; atomically places the key's first line into
# EN: DIRECTORY/deepseek (directory root:omega 0750, file root:omega 0440), where the service reads it
# EN: (DEEPSEEK_CREDENTIAL_FILE in the unit).
# EN: remove: deletes the key file; an empty directory may remain.
#
# RU: Коды возврата: 0 — ключ положен / удалён / таймер замаскирован (ключ не готовится, прежний удаляется);
# RU: 1 — запуск не от root или любой отказ (печатается только имя класса исключения).
# EN: Exit codes: 0 — key placed / removed / timer masked (no key prepared, any old one removed);
# EN: 1 — not running as root or any refusal (only the exception class name is printed).
#
# RU: Чего НЕ делает: не печатает и не передаёт значение ключа через argv; не проверяет годность ключа
# RU: у поставщика модели; не удаляет сам каталог.
# RU: НЕ ловит: ACL на родительских каталогах (проверяются только владелец и биты режима);
# RU: посторонние файлы внутри каталога ключа, кроме самого файла deepseek.
# EN: Does NOT: print the key or pass its value via argv; check the key's validity with the model provider;
# EN: remove the directory itself.
# EN: Does NOT catch: ACLs on parent directories (only owner and mode bits are checked);
# EN: stray files inside the key directory other than the deepseek file itself.
"""Root credential preparation. stdlib only; invoke with python3 -I -S -B."""
# RU: Строка документации модуля выше выводится в --help (argparse description=__doc__),
# RU: поэтому описание вынесено в комментарии, а она оставлена как есть.
# EN: The module docstring above is shown by --help (argparse description=__doc__),
# EN: so the description lives in comments and the docstring is left unchanged.
import argparse
import grp
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import signal

# RU: Каталог ключа под /run (в бою /run — tmpfs, содержимое не переживает перезагрузку).
# EN: Key directory under /run (in production /run is tmpfs, contents do not survive a reboot).
DIRECTORY = Path('/run/dsh-pamyat-obsluzhivanie-key')


def secure_directory(directory):
    """RU: Проверяет цепочку родителей, создаёт (если нет) и проверяет каталог ключа.
    Вход: путь каталога. Выход: gid группы omega.
    Побочные эффекты: может создать каталог root:omega 0750.
    Отказы: KeyError — нет группы omega; PermissionError('unsafe_credential_parent') — любой родитель
    не каталог (в т.ч. ссылка), не принадлежит root или доступен на запись группе/прочим;
    PermissionError('unsafe_credential_directory') — сам каталог не каталог (в т.ч. ссылка),
    чужой владелец/группа или режим не 0750.
    НЕ ловит: ACL; изменение каталога после проверки (родители принадлежат root и закрыты на запись,
    поэтому подменить их может только root).

    EN: Checks the parent chain, creates the key directory if missing, and verifies it.
    Input: directory path. Output: gid of the omega group.
    Side effects: may create the directory root:omega 0750.
    Refusals: KeyError — no omega group; PermissionError('unsafe_credential_parent') — any parent is
    not a directory (incl. a symlink), not owned by root, or writable by group/others;
    PermissionError('unsafe_credential_directory') — the directory itself is not a directory (incl. a symlink),
    has a wrong owner/group, or a mode other than 0750.
    Does NOT catch: ACLs; changes after the check (parents are root-owned and not writable by others,
    so only root could swap them).
    """
    gid = grp.getgrnam('omega').gr_gid
    # RU: В бою родитель — фиксированный /run; отвергаем ссылки и родителей, доступных на запись не-root.
    # RU: lstat не идёт по ссылке, поэтому ссылка в цепочке даёт «не каталог» и отказ.
    # EN: Parent path is fixed /run in production; reject symlinks and writable ancestry.
    # EN: lstat does not follow links, so a link in the chain shows as "not a directory" and is refused.
    for parent in (directory.parent, *directory.parent.parents):
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise PermissionError('unsafe_credential_parent')
    # RU: mkdir без exist_ok: уже существующий каталог не пересоздаётся, а проверяется ниже как есть.
    # RU: chmod после mkdir — потому что режим mkdir урезается umask.
    # EN: mkdir without exist_ok: an existing directory is not recreated but verified below as is.
    # EN: chmod after mkdir because mkdir's mode is reduced by the umask.
    try:
        directory.mkdir(mode=0o750)
        os.chown(directory, 0, gid)
        directory.chmod(0o750)
    except FileExistsError:
        pass
    info = directory.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_gid != gid
            or stat.S_IMODE(info.st_mode) != 0o750):
        raise PermissionError('unsafe_credential_directory')
    return gid


def read_key():
    """RU: Читает ключ из pass от имени coders и возвращает сырые байты stdout (не более 65537).
    Вход: нет (каталог временного файла — константа DIRECTORY). Выход: bytes.
    Побочные эффекты: запускает runuser → env -i → prlimit → pass в новой группе процессов;
    после ожидания убивает всю группу; временный файл анонимный и исчезает при закрытии.
    Отказы: RuntimeError('credential_reader_failed') — pass вернул ненулевой код
    (в т.ч. при превышении размера, если prlimit оборвал запись); subprocess.TimeoutExpired — дольше 20 секунд.
    НЕ ловит: содержимое — годность ключа проверяет prepare, а не эта функция.

    EN: Reads the key from pass as coders and returns raw stdout bytes (at most 65537).
    Input: none (the temp file directory is the DIRECTORY constant). Output: bytes.
    Side effects: runs runuser → env -i → prlimit → pass in a new process group;
    kills the whole group after waiting; the temp file is anonymous and vanishes on close.
    Refusals: RuntimeError('credential_reader_failed') — pass exited non-zero
    (including on size overflow if prlimit cut the write); subprocess.TimeoutExpired — over 20 seconds.
    Does NOT catch: content problems — key validity is checked by prepare, not here.
    """
    # RU: stdout — недоверенные данные от coders: ограничиваем их, не держа целиком в памяти root.
    # RU: Вывод идёт во временный файл в каталоге ключа (root:omega 0750), а не в канал.
    # EN: stdout is untrusted data from coders; cap it without buffering it in root RAM.
    # EN: Output goes to a temp file in the key directory (root:omega 0750), not to a pipe.
    # RU: Источник ключа — настройки юнита (вставка машины): OBSL_KLYUCH_HOME — домашний каталог учётной записи
    #     хранилища (GNUPGHOME = его .gnupg), OBSL_KLYUCH_HRANILISHCHE — каталог хранилища pass. Обе — абсолютные
    #     пути; не заданы — отказ до запуска pass, а не путь, зашитый в код.
    # EN: The key source comes from unit settings (a machine drop-in): OBSL_KLYUCH_HOME — the store account's home
    #     (GNUPGHOME = its .gnupg), OBSL_KLYUCH_HRANILISHCHE — the pass store directory. Both are absolute paths;
    #     unset — a refusal before pass starts, instead of a path hard-coded in the code.
    home = os.environ.get('OBSL_KLYUCH_HOME', '')
    store = os.environ.get('OBSL_KLYUCH_HRANILISHCHE', '')
    if not (os.path.isabs(home) and os.path.isabs(store)):
        raise RuntimeError('credential_source_not_set')
    with tempfile.TemporaryFile(dir=DIRECTORY) as output:
        # RU: Цепочка: runuser меняет учётную запись на coders; env -i очищает среду и задаёт только
        # RU: PATH, HOME, GNUPGHOME и каталог хранилища pass; prlimit ограничивает размер записываемого
        # RU: файла 64 КиБ (ставится после runuser, т.е. уже для процесса coders).
        # RU: start_new_session — чтобы потом убить всю группу процессов разом.
        # EN: Chain: runuser switches to the coders account; env -i clears the environment and sets only
        # EN: PATH, HOME, GNUPGHOME and the pass store directory; prlimit caps written file size at 64 KiB
        # EN: (applied after runuser, i.e. to the coders process).
        # EN: start_new_session lets us kill the whole process group at once later.
        process = subprocess.Popen([
            '/usr/sbin/runuser', '-u', 'coders', '--', '/usr/bin/env', '-i',
            'PATH=/usr/bin:/bin', f'HOME={home}', f'GNUPGHOME={home}/.gnupg',
            f'PASSWORD_STORE_DIR={store}',
            '/usr/bin/prlimit', '--fsize=65536:65536', '--',
            '/usr/bin/pass', 'show', 'api/deepseek'], stdout=output,
            stderr=subprocess.DEVNULL, start_new_session=True)
        try:
            # RU: Предел 20 секунд на чтение ключа; по истечении wait бросает TimeoutExpired.
            # EN: 20-second limit for reading the key; on expiry wait raises TimeoutExpired.
            code = process.wait(timeout=20)
        finally:
            # RU: Убиваем и потомков, даже если их непосредственный родитель уже вышел.
            # EN: Include descendants even if their immediate parent already exited.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=3)
        if code != 0:
            raise RuntimeError('credential_reader_failed')
        output.seek(0)
        # RU: Читаем на байт больше предела, чтобы prepare мог отличить «ровно предел» от «больше предела».
        # EN: Read one byte past the limit so prepare can tell "exactly the limit" from "over the limit".
        return output.read(65537)


def prepare(directory=DIRECTORY, fetch=read_key):
    """RU: Готовит файл ключа directory/deepseek атомарно.
    Вход: каталог ключа и функция получения байтов (по умолчанию read_key; в пробах подменяется).
    Выход: нет. Побочные эффекты: создаёт/проверяет каталог; пишет временный файл .deepseek-*
    и переименовывает его в deepseek (root:omega 0440, с переводом строки в конце).
    Отказы: всё из secure_directory и fetch; ValueError('invalid_credential') — не bytes, больше 64 КиБ,
    пустая первая строка, ключ длиннее 4095 байт или с нулевым байтом.
    Берётся только первая строка вывода pass без пробелов по краям; остальные строки отбрасываются.
    НЕ ловит: неверный, но правильно оформленный ключ.

    EN: Prepares the key file directory/deepseek atomically.
    Input: key directory and a byte-fetching function (read_key by default; replaced in tests).
    Output: none. Side effects: creates/verifies the directory; writes a temp .deepseek-* file
    and renames it to deepseek (root:omega 0440, with a trailing newline).
    Refusals: everything from secure_directory and fetch; ValueError('invalid_credential') — not bytes,
    over 64 KiB, empty first line, key longer than 4095 bytes or containing a NUL byte.
    Only the first line of pass output is taken, stripped; other lines are discarded.
    Does NOT catch: a wrong but well-formed key.
    """
    gid = secure_directory(directory)
    data = fetch()
    if not isinstance(data, bytes) or len(data) > 65536:
        raise ValueError('invalid_credential')
    key = data.splitlines()[0].strip() if data.splitlines() else b''
    if not key or len(key) > 4095 or b'\0' in key:
        raise ValueError('invalid_credential')
    # RU: Атомарная запись: временный файл в том же каталоге → fsync → владелец и права → os.replace.
    # RU: Служба видит либо прежний файл, либо полностью записанный новый, но не половину.
    # RU: Права выставляются через дескриптор (fchown/fchmod), а не по имени — без гонки с подменой имени.
    # EN: Atomic write: temp file in the same directory → fsync → owner and mode → os.replace.
    # EN: The service sees either the old file or the fully written new one, never half of it.
    # EN: Ownership and mode are set via the descriptor (fchown/fchmod), not by name — no name-swap race.
    fd, name = tempfile.mkstemp(prefix='.deepseek-', dir=directory)
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(key+b'\n')
            out.flush()
            os.fsync(out.fileno())
            os.fchown(out.fileno(), 0, gid)
            os.fchmod(out.fileno(), 0o440)
        os.replace(name, directory/'deepseek')
    finally:
        # RU: После успешного replace временного имени уже нет (missing_ok); при отказе — убираем остаток.
        # EN: After a successful replace the temp name is gone (missing_ok); on failure the leftover is removed.
        Path(name).unlink(missing_ok=True)


def remove(directory=DIRECTORY):
    """RU: Удаляет файл ключа directory/deepseek.
    Вход: каталог ключа. Выход: нет.
    Если каталога нет (и это не висячая ссылка) — ничего не делает. Иначе сначала проверяет каталог
    тем же secure_directory (ссылка или чужой каталог → отказ, ничего не удаляется), затем удаляет файл.
    Каталог остаётся. НЕ ловит: прочие файлы в каталоге.

    EN: Removes the key file directory/deepseek.
    Input: key directory. Output: none.
    If the directory is absent (and is not a dangling link) — does nothing. Otherwise first verifies the
    directory with the same secure_directory (a link or foreign directory → refusal, nothing deleted),
    then deletes the file. The directory remains. Does NOT catch: other files in the directory.
    """
    if not directory.exists() and not directory.is_symlink():
        return
    secure_directory(directory)
    (directory/'deepseek').unlink(missing_ok=True)


def main():
    """RU: Точка входа: аргумент prepare или remove. Коды возврата — в шапке файла.
    Для prepare сначала спрашивает systemctl is-enabled о таймере (предел 10 секунд):
    masked/masked-runtime — ключ не готовится, прежний удаляется, код 0; значение вне известного
    перечня — отказ; иначе prepare(). Любое исключение → печать имени класса и код 1.
    Перечень состояний таймера здесь продублирован, а не импортирован: root-копия работает
    только на стандартной библиотеке и не импортирует модули пакета.

    EN: Entry point: argument prepare or remove. Exit codes are in the file header.
    For prepare it first asks systemctl is-enabled about the timer (10-second limit):
    masked/masked-runtime — no key prepared, any old one removed, exit 0; a value outside the known
    set — refusal; otherwise prepare(). Any exception → print the class name, exit 1.
    The timer state set is duplicated here rather than imported: the root copy runs on the
    standard library only and does not import package modules.
    """
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['prepare', 'remove'])
    args = p.parse_args()
    if os.geteuid() != 0:
        print('credential: root required')
        return 1
    # RU: Всё, что создаётся дальше, по умолчанию закрыто для группы и прочих; нужные права ставятся явно.
    # EN: Everything created from here on is closed to group and others by default; needed modes are set explicitly.
    os.umask(0o077)
    try:
        if args.action == 'remove':
            remove()
        else:
            # RU: Маска таймера проверяется ДО чтения ключа: при замаскированном таймере pass не вызывается.
            # EN: The timer mask is checked BEFORE reading the key: with a masked timer pass is not called.
            state = subprocess.run(['/usr/bin/systemctl', 'is-enabled', 'dsh-pamyat-obsluzhivanie.timer'],
                                   capture_output=True, text=True, timeout=10).stdout.strip()
            if state in {'masked', 'masked-runtime'}:
                remove()
                print('disabled: timer masked; credential not prepared')
                return 0
            if state not in {'enabled', 'enabled-runtime', 'disabled', 'static', 'linked', 'linked-runtime'}:
                raise RuntimeError('timer_unknown')
            prepare()
        return 0
    except Exception as e:
        # RU: Печатается только имя класса исключения: текст может содержать путь или данные.
        # EN: Only the exception class name is printed: its text may contain a path or data.
        print('credential: refused ('+type(e).__name__+')')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
