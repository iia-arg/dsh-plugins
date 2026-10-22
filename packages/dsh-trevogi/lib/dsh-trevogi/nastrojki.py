"""RU: Общий читатель путей: env → config → умолчание, без исполнения текста.
EN: Shared path reader: env → config → default, without evaluating configuration.
"""
import os
import socket
import re
import stat
import sys
from pathlib import Path

# RU: Номер пакета для строк журнала всех утилит — одна константа (3.1.6, info Вениамина 15.10 05:05Z: был литерал
#     «версия=3.1.1» при пакете 3.1.5). package.json в бой не ставится; bash читает строку sed'ом, без исполнения.
#     Менять вместе с package.json — расхождение ловит test/stend-agent-alert.sh.
# EN: Package version for journal lines of all utilities — a single constant; keep equal to package.json.
VERSIYA = '3.1.10'
MAX_GUEST_ROWS = 50

DEFAULT_CONFIG = '/etc/dsh-trevogi/dsh-trevogi.conf'
DEFAULTS = {
    'AGENT_ALERT_TOKEN_FILE': '/etc/dsh-trevogi/token',
    'AGENT_ALERT_CHAT_FILE': '/etc/dsh-trevogi/chat-id',
    'AGENT_ALERT_OWNER_CHAT_ID': '',
    'AGENT_ALERT_SPISOK_FILE': '/var/lib/alert-privratnik/spisok',
    'AGENT_ALERT_HVOST': '/var/log/dsh-trevogi/poslednie.log',
    'AGENT_ALERT_POPYTOK': '3',
    'AGENT_ALERT_PAUZY': '5 15',
    'AGENT_ALERT_TAJMAUT': '20',
    'AGENT_ALERT_HVOST_PREDEL': '20000000',
    'AGENT_ALERT_HVOST_STROK': '200',
    # RU: Способ 2 (B-N-2055): спул отправителей без доступа к токену; ожидание итога клиентом; квоты по учётке.
    # EN: Method 2 (B-N-2055): spool for senders without token access; client result wait; per-account quotas.
    'AGENT_ALERT_SPUL': '/var/spool/dsh-trevogi',
    'AGENT_ALERT_ITOG_ZHDAT': '120',
    'AGENT_ALERT_KVOTA_10MIN': '10',
    'AGENT_ALERT_KVOTA_SUTKI': '60',
    'OTKAZ_KLYUCH_KURSOR': '/var/lib/dsh-trevogi/otkaz-klyuch/kursor',
    'OTKAZ_KLYUCH_KANAL': '/usr/local/bin/agent-alert',
    'OTKAZ_KLYUCH_HOST': socket.gethostname().split('.')[0],
}
PATH_KEYS = {'AGENT_ALERT_SPISOK_FILE', 'AGENT_ALERT_TOKEN_FILE', 'AGENT_ALERT_CHAT_FILE', 'AGENT_ALERT_HVOST', 'AGENT_ALERT_SPUL',
             'OTKAZ_KLYUCH_KURSOR', 'OTKAZ_KLYUCH_KANAL'}


def load():
    path = os.environ.get('DSH_TREVOGI_CONFIG', DEFAULT_CONFIG)
    if not path or not Path(path).is_absolute():
        raise ValueError('DSH_TREVOGI_CONFIG: нужен абсолютный путь / absolute path required')
    settings = {}
    try:
        lines = Path(path).read_text(encoding='utf-8').splitlines()
    except FileNotFoundError:
        if 'DSH_TREVOGI_CONFIG' in os.environ:
            raise ValueError(f'config отсутствует / missing: {path}') from None
        lines = []
    except (OSError, UnicodeError) as e:
        raise ValueError(f'config не читается / unreadable: {path} ({type(e).__name__})') from None
    for number, line in enumerate(lines, 1):
        # RU: Комментарий только в начале строки; # внутри значения остаётся данными.
        # EN: Only a leading # starts a comment; # inside a value remains data.
        if not line.strip() or line.startswith('#'):
            continue
        key, sep, value = line.partition('=')
        if not sep or key not in DEFAULTS or key in settings:
            raise ValueError(f'config {path}:{number}: неизвестный/повторный ключ или формат / unknown/duplicate key or format')
        settings[key] = value
    result = {key: os.environ.get(key, settings.get(key, default)) for key, default in DEFAULTS.items()}
    for key, value in result.items():
        if key == 'AGENT_ALERT_OWNER_CHAT_ID' and value == '':
            continue
        if not value or value != value.strip() or any(c in value for c in '\n\r\t\0'):
            raise ValueError(f'{key}: пустое/негодное значение / empty or invalid value')
        if key in PATH_KEYS and not Path(value).is_absolute():
            raise ValueError(f'{key}: нужен абсолютный путь / absolute path required')
    for key, ceiling in [('AGENT_ALERT_POPYTOK', 10), ('AGENT_ALERT_TAJMAUT', 300),
                         ('AGENT_ALERT_HVOST_PREDEL', 1000000000), ('AGENT_ALERT_HVOST_STROK', 1000000),
                         ('AGENT_ALERT_ITOG_ZHDAT', 600), ('AGENT_ALERT_KVOTA_10MIN', 1000),
                         ('AGENT_ALERT_KVOTA_SUTKI', 100000)]:
        value = result[key]
        if not value.isascii() or not value.isdecimal() or not 1 <= int(value) <= ceiling:
            raise ValueError(f'{key}: нужно целое 1..{ceiling} / integer required')
    owner = result['AGENT_ALERT_OWNER_CHAT_ID']
    if owner and not re.fullmatch(r'-?[0-9]{5,15}', owner):
        raise ValueError('AGENT_ALERT_OWNER_CHAT_ID: требуется целый chat-id 5..15 цифр')
    pauses = result['AGENT_ALERT_PAUZY'].split(' ')
    if any(not p.isascii() or not p.isdecimal() or not 0 <= int(p) <= 300 for p in pauses):
        raise ValueError('AGENT_ALERT_PAUZY: секунды 0..300 через пробел / space-separated seconds')
    return result


def recipients(path):
    """Guests only; root or StateDirectory owner, no symlinks, all-or-nothing."""
    path = Path(path)
    try:
        before = path.lstat()
    except FileNotFoundError:
        return [], None
    except OSError as e:
        return [], f'{path}: {type(e).__name__}: {e.strerror}'
    if stat.S_ISLNK(before.st_mode):
        return [], f'{path}: ссылка вместо файла'
    if not stat.S_ISREG(before.st_mode):
        return [], f'{path}: не обычный файл'
    try:
        state_uid = path.parent.stat().st_uid
        if before.st_uid not in (0, state_uid):
            return [], f'{path}: владелец uid={before.st_uid}, ожидается root или StateDirectory uid={state_uid}'
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, encoding='utf-8') as stream:
            current = os.fstat(stream.fileno())
            if (current.st_dev, current.st_ino, current.st_uid) != (before.st_dev, before.st_ino, before.st_uid):
                return [], f'{path}: файл подменён между проверкой и открытием'
            chats, seen, valid_rows = [], set(), 0
            for number, raw in enumerate(stream, 1):
                value = raw.rstrip('\r\n').partition('#')[0]
                if not value.strip():
                    continue
                if not re.fullmatch(r'-?[0-9]{5,15}', value):
                    return [], f'{path}:{number}: негодная строка {raw.rstrip()!r}, требуется ^-?[0-9]{{5,15}}$'
                valid_rows += 1
                if valid_rows > MAX_GUEST_ROWS:
                    return [], f'{path}:{number}: больше 50 валидных строк, весь список отвергнут'
                key = int(value)
                if key not in seen:
                    seen.add(key)
                    chats.append(value)
            return chats, None
    except (OSError, UnicodeError) as e:
        return [], f'{path}: {type(e).__name__}: {e}'


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] == '--gosti':
            chats, problem = recipients(sys.argv[2])
            print('REJECT\n' + problem if problem else 'OK' + ''.join('\n' + chat for chat in chats))
            sys.exit(0)
        if len(sys.argv) != 1:
            raise ValueError('читатель: ожидается --gosti ABS_PATH или без аргументов')
        for key, value in load().items():
            print(f'{key}={value}')
    except ValueError as e:
        print(f'dsh-trevogi: {e}', file=sys.stderr)
        sys.exit(2)
