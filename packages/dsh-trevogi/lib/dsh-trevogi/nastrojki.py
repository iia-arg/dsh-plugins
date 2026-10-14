"""RU: Общий читатель путей: env → config → умолчание, без исполнения текста.
EN: Shared path reader: env → config → default, without evaluating configuration.
"""
import os
import socket
import sys
from pathlib import Path

DEFAULT_CONFIG = '/etc/dsh-trevogi/dsh-trevogi.conf'
DEFAULTS = {
    'AGENT_ALERT_TOKEN_FILE': '/etc/dsh-trevogi/token',
    'AGENT_ALERT_CHAT_FILE': '/etc/dsh-trevogi/chat-id',
    'AGENT_ALERT_HVOST': '/var/log/dsh-trevogi/poslednie.log',
    'AGENT_ALERT_POPYTOK': '3',
    'AGENT_ALERT_PAUZY': '5 15',
    'AGENT_ALERT_TAJMAUT': '20',
    'AGENT_ALERT_HVOST_PREDEL': '20000000',
    'AGENT_ALERT_HVOST_STROK': '200',
    'OTKAZ_KLYUCH_KURSOR': '/var/lib/dsh-trevogi/otkaz-klyuch/kursor',
    'OTKAZ_KLYUCH_KANAL': '/usr/local/bin/agent-alert',
    'OTKAZ_KLYUCH_HOST': socket.gethostname().split('.')[0],
}
PATH_KEYS = {'AGENT_ALERT_TOKEN_FILE', 'AGENT_ALERT_CHAT_FILE', 'AGENT_ALERT_HVOST',
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
        if not value or value != value.strip() or any(c in value for c in '\n\r\t\0'):
            raise ValueError(f'{key}: пустое/негодное значение / empty or invalid value')
        if key in PATH_KEYS and not Path(value).is_absolute():
            raise ValueError(f'{key}: нужен абсолютный путь / absolute path required')
    for key, ceiling in [('AGENT_ALERT_POPYTOK', 10), ('AGENT_ALERT_TAJMAUT', 300),
                         ('AGENT_ALERT_HVOST_PREDEL', 1000000000), ('AGENT_ALERT_HVOST_STROK', 1000000)]:
        value = result[key]
        if not value.isascii() or not value.isdecimal() or not 1 <= int(value) <= ceiling:
            raise ValueError(f'{key}: нужно целое 1..{ceiling} / integer required')
    pauses = result['AGENT_ALERT_PAUZY'].split(' ')
    if any(not p.isascii() or not p.isdecimal() or not 0 <= int(p) <= 300 for p in pauses):
        raise ValueError('AGENT_ALERT_PAUZY: секунды 0..300 через пробел / space-separated seconds')
    return result


if __name__ == '__main__':
    try:
        for key, value in load().items():
            print(f'{key}={value}')
    except ValueError as e:
        print(f'dsh-trevogi: {e}', file=sys.stderr)
        sys.exit(2)
