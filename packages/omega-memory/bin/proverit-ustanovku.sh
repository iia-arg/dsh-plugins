#!/bin/sh
# RU: До старта: группы, обязательные EnvironmentFile, WorkingDirectory/HOME,
#     защищённый каталог .omega и файлы явно заданной модели. Только чтение.
# EN: Before startup: groups, mandatory EnvironmentFile, WorkingDirectory/HOME,
#     private .omega directory and explicitly configured model files. Read only.
# RU: 0 — проверенные предпосылки есть; 1 — отказ; 2 — слепота/неизвестный ввод.
# EN: 0 — checked prerequisites exist; 1 — refusal; 2 — blindness/unknown input.
# RU: Режим имени проверяет только эффективные группы через systemctl show.
#     Полную предполётную проверку делайте по файлу и соседним .d/*.conf.
# EN: Unit-name mode checks effective groups via systemctl show only.
#     For the full preflight use a unit file and its adjacent .d/*.conf.
# RU: Не проверяет семантику модели/ключа, схему БД, членство агентов, runtime,
#     прочие каталоги drop-in. Нет повторов; внешние команды ограничены 5 с.
# EN: Does not validate model/key semantics, DB schema, agent membership, runtime,
#     other drop-in directories. No retries; external commands are bounded to 5s.
set -eu
exec python3 - "$@" <<'PY'
import glob, os, re, shlex, stat, subprocess, sys
from pathlib import Path

class Blind(Exception): pass
class Refusal(Exception): pass

def words(value):
    quote = None; escaped = False; at_start = True; closed = False
    for char in value:
        if escaped: escaped = False; continue
        if quote:
            if char == '\\' and quote == '"': escaped = True
            elif char == quote: quote = None; closed = True
        elif char.isspace(): at_start = True; closed = False
        elif char in ("'", '"'):
            if not at_start: raise Blind('смешанные кавычки не поддержаны / mixed quotes unsupported')
            quote = char; at_start = False
        else:
            if closed or char == '\\': raise Blind('суффикс/escape не поддержан / suffix or escape unsupported')
            at_start = False
    if quote or escaped: raise Blind('многострочные кавычки не поддержаны / multiline quotes unsupported')
    try:
        return shlex.split(value, comments=False, posix=True)
    except ValueError:
        raise Blind('не разобраны кавычки директивы / directive quotes invalid')

def exact_path(path, label):
    if not path or not os.path.isabs(path) or '%' in path or '\x00' in path or '\\' in path:
        raise Blind(label + ': требуется точный абсолютный путь без specifier / exact absolute path without specifier required')

def directory(path, label, private=False):
    exact_path(path,label)
    try: st = os.lstat(path)
    except OSError: raise Refusal(label + ': каталог отсутствует/не доступен / directory unavailable: ' + path)
    if not stat.S_ISDIR(st.st_mode): raise Refusal(label + ': не обычный каталог / not a regular directory: ' + path)
    if private and st.st_mode & 0o022: raise Refusal(label + ': запись группе/прочим / group or world writable: ' + path)

def model_files(path):
    exact_path(path,'OMEGA_EMBEDDING_MODEL_DIR')
    for name in ('model.onnx', 'tokenizer.json'):
        p = Path(path) / name
        try: st = os.lstat(p)
        except OSError: raise Refusal('модель / model: нет ' + str(p))
        if not stat.S_ISREG(st.st_mode) or st.st_size == 0 or not os.access(p, os.R_OK):
            raise Refusal('модель / model: файл пуст/не прочитан / empty or unreadable: ' + str(p))

def parsed_file(unit):
    values = {'Group': [], 'SupplementaryGroups': [], 'EnvironmentFile': [], 'WorkingDirectory': [], 'Environment': {}}
    files = [unit] + sorted(glob.glob(unit + '.d/*.conf'))
    for file in files:
        try: text = Path(file).read_text(encoding='utf-8')
        except (OSError, UnicodeError): raise Blind('файл/вставка не прочитаны / unit or drop-in unreadable: ' + file)
        section = ''; pending = ''
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith(('#',';')): continue
            if line.endswith('\\'):
                pending += line[:-1] + ' '; continue
            line = pending + line; pending = ''
            if line.startswith('[') and line.endswith(']'):
                section = line[1:-1]; continue
            if section != 'Service' or '=' not in line: continue
            key, value = line.split('=',1); key = key.strip(); value = value.strip()
            if key in {'UnsetEnvironment','PassEnvironment','PAMName','RootDirectory','RootImage','BindPaths','BindReadOnlyPaths','TemporaryFileSystem','InaccessiblePaths','PrivateTmp','ProtectHome','DynamicUser'} and value:
                raise Blind(key + ': преобразование окружения/пространства путей не поддержано / environment or path namespace transformation unsupported')
            if key not in values: continue
            if '\\' in value and key != 'Environment':
                raise Blind(key + ': escaped values require effective unit-name group check / экранированное значение не поддержано')
            tokens = words(value)
            if key == 'Environment':
                if not tokens: values[key].clear()
                for item in tokens:
                    if '=' not in item: raise Blind('Environment: требуется имя=значение / expected name=value')
                    name, val = item.split('=',1); values[key][name] = val
            elif key in ('Group','WorkingDirectory'):
                if len(tokens) > 1: raise Blind(key + ': ожидалось одно значение / expected one value')
                values[key] = tokens
            elif not tokens: values[key] = []
            else: values[key].extend(tokens)
        if pending: raise Blind('оборвано продолжение / incomplete continuation: ' + file)
    return values

def groups(primary, supplementary):
    names = primary + supplementary
    if not names: raise Blind('нет Group= и SupplementaryGroups= — проверять нечего / no groups declared')
    missing_primary, missing_extra = [], []
    for name in dict.fromkeys(names):
        if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*', name):
            raise Blind('группа требует раскрытия systemd / group needs systemd expansion')
        q = subprocess.run(['getent','group',name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        if q.returncode: (missing_primary if name in primary else missing_extra).append(name)
    if missing_primary or missing_extra:
        messages = ['нет групп / missing groups: ' + ', '.join(missing_primary + missing_extra) + '; 216/GROUP']
        if missing_primary: messages.append('основная группа: шаг 1 — создать служебную учётку / primary group: step 1, create the service account')
        if missing_extra: messages.append('дополнительная группа: шаг 1а — sudo groupadd --system <группа> / supplementary group: step 1a')
        raise Refusal('; '.join(messages))
    print('группы есть / groups exist: ' + ' '.join(names))

def main():
    if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1].startswith('-')):
        raise Blind('довод: файл или имя юнита; неизвестные ключи запрещены / one unit path or name; unknown flags refused')
    unit = sys.argv[1] if len(sys.argv) == 2 else 'omega-memory.service'
    if '/' not in unit:
        q = subprocess.run(['systemctl','show',unit,'-p','LoadState','-p','Group','-p','SupplementaryGroups'],capture_output=True,text=True,timeout=5)
        data = dict(line.split('=',1) for line in q.stdout.splitlines() if '=' in line)
        if q.returncode or data.get('LoadState') != 'loaded': raise Blind('юнит не загружен / unit not loaded: ' + unit)
        groups(words(data.get('Group','')),words(data.get('SupplementaryGroups','')))
        print('проверены только эффективные группы / effective groups only'); return 0
    data = parsed_file(unit)
    groups(data['Group'],data['SupplementaryGroups'])
    for path in data['EnvironmentFile']:
        optional = path.startswith('-'); path = path[1:] if optional else path
        if not os.path.isabs(path) or '%' in path or glob.has_magic(path): raise Blind('EnvironmentFile: требуется точный абсолютный путь / exact absolute path required')
        try: st = os.lstat(path)
        except FileNotFoundError:
            if optional: continue
            raise Refusal('EnvironmentFile: обязательный файл отсутствует / mandatory file missing: ' + path)
        if not stat.S_ISREG(st.st_mode): raise Refusal('EnvironmentFile: не обычный файл / not a regular file: ' + path)
        if st.st_size > 65536: raise Blind('EnvironmentFile: больше 64KiB / exceeds 64KiB: ' + path)
        try: text = Path(path).read_text(encoding='utf-8')
        except (OSError, UnicodeError): raise Blind('EnvironmentFile: не прочитан / unreadable: ' + path)
        # Only effective path settings are parsed; key values are never printed or stored.
        for line in text.splitlines():
            if '=' not in line or line.lstrip().startswith(('#',';')): continue
            name, value = line.split('=',1); name=name.strip()
            value=value.strip()
            # Validate every assignment's quote boundary before skipping secret/other values.
            # Multiline/continuation syntax is refused, never scanned as new assignments.
            if value.endswith('\\'): raise Blind('EnvironmentFile: продолжение строки не поддержано / continuation unsupported')
            tokens=words(value)
            if name not in {'HOME','OMEGA_EMBEDDING_MODEL_DIR','OMEGA_HOME','OMEGA_ONNX_MODEL_DIR'}: continue
            if '\\' in value: raise Blind('EnvironmentFile: экранированный путь не поддержан / escaped path unsupported')
            tokens=words(value)
            if value.startswith(("'", '"')):
                if len(tokens)!=1: raise Blind('EnvironmentFile: ожидается один quoted путь / expected one quoted path')
                value=tokens[0]
            elif any(c in value for c in ("'", '"', '\\')):
                raise Blind('EnvironmentFile: смешанные кавычки/escape не поддержаны / mixed quotes or escape unsupported')
            data['Environment'][name]=value

    for path in data['WorkingDirectory']:
        optional=path.startswith('-');path=path[1:] if optional else path
        exact_path(path,'WorkingDirectory')
        if optional and not os.path.exists(path): continue
        directory(path,'WorkingDirectory')
    if any(k in data['Environment'] for k in ('OMEGA_HOME','OMEGA_ONNX_MODEL_DIR')):
        raise Blind('переопределение путей движка требует отдельной приёмки / engine path override requires separate acceptance')
    home = data['Environment'].get('HOME')
    if home is not None:
        directory(home,'HOME',private=True)
        memory = os.path.join(home,'.omega')
        if os.path.lexists(memory): directory(memory,'.omega',private=True)
    model = data['Environment'].get('OMEGA_EMBEDDING_MODEL_DIR')
    if model is not None: model_files(model)
    print('проверенные предпосылки установки есть; семантика модели/ключа не проверена / checked install prerequisites exist; model/key semantics not checked')
    return 0

try:
    sys.exit(main())
except Refusal as error:
    print('ОТКАЗ / REFUSAL: ' + str(error)); sys.exit(1)
except (Blind, OSError, subprocess.SubprocessError) as error:
    print('СЛЕПОТА / BLINDNESS: ' + str(error)); sys.exit(2)
PY
