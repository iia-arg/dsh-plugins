#!/usr/bin/env python3
"""Окружение юнита так, как его соберёт systemd при следующем запуске; печатает KEY=VALUE в файл.

RU: Порядок systemd: сначала Environment= (юнит и все drop-in, `systemctl show -p Environment`),
    затем EnvironmentFile= в их порядке; значение из файла побеждает Environment=, более поздний
    файл — более ранний. Источник — systemd после daemon-reload, а не процесс: канарейка проверяет
    то, что получит следующий подъём. Отказ (юнит не загружен, файл не читается) — код 2 с причиной,
    пустого окружения не бывает. Значения не печатаются никуда, кроме файла вывода. Файл вывода
    создаётся заново (O_EXCL|O_NOFOLLOW): уже существующий путь или ссылка на его месте — отказ.
    Чего не делает: не раскрывает ${VAR} внутри значений и не добавляет то, что systemd задаёт сам
    (PATH, HOME от User=, INVOCATION_ID) — шлюзу копии их даёт запускающий. Не видит того, что меняет
    обёртка в ExecStart: у гостевого шлюза guest-launch.sh переписывает GATEWAY_TOKEN_FILE на путь
    LoadCredential (сверено с /proc/<pid>/environ: 8 шлюзов из 9 совпали ключ в ключ, гость — этим ключом).
EN: The unit environment as systemd will build it on the next start; writes KEY=VALUE to a file.
    systemd order: first Environment= (unit and all drop-ins, `systemctl show -p Environment`), then
    EnvironmentFile= in order; a file value beats Environment=, a later file beats an earlier one.
    The source is systemd after daemon-reload, not the process: the canary checks what the next start
    gets. Failure (unit not loaded, file unreadable) — exit 2 with a reason; never an empty environment.
    Values go nowhere but the output file. The output file is created fresh (O_EXCL|O_NOFOLLOW): an
    existing path or a link in its place is a failure.
    Not done: ${VAR} inside values is not expanded, and what systemd sets itself (PATH, HOME from
    User=, INVOCATION_ID) is not added — the launcher gives those to the copy. Changes made by an ExecStart
    wrapper are not seen: the guest gateway's guest-launch.sh rewrites GATEWAY_TOKEN_FILE to the
    LoadCredential path (checked against /proc/<pid>/environ: 8 of 9 gateways matched key for key, the guest
    differs in this key).
Использование · usage: sreda-yunita.py <юнит> <файл вывода>
"""
import os, re, shlex, subprocess, sys


def otkaz(prichina):
    print(f'СЛЕПОТА: окружение юнита: {prichina}', file=sys.stderr)
    sys.exit(2)


def show(unit, pole):
    r = subprocess.run(['systemctl', 'show', unit, '-p', pole, '--value'], capture_output=True, text=True)
    if r.returncode != 0:
        otkaz(f'systemctl show {unit} -p {pole}: код {r.returncode}')
    return r.stdout


def razobrat_fajl(put):
    """RU: Разбор файла окружения по правилам systemd: пустые строки и начинающиеся с # или ; — мимо;
    кавычки вокруг значения снимаются. · EN: systemd env-file rules: blank, # and ; lines skipped;
    quotes around the value are removed."""
    para = {}
    with open(put, encoding='utf-8') as f:
        for n, stroka in enumerate(f, 1):
            s = stroka.strip()
            if not s or s[0] in '#;':
                continue
            if '=' not in s:
                otkaz(f'{put}:{n}: строка без «=»')
            k, v = s.split('=', 1)
            k, v = k.strip(), v.strip()
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', k):
                otkaz(f'{put}:{n}: имя ключа не годится')
            if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
                v = shlex.split(v)[0] if v[0] == '"' else v[1:-1]
            para[k] = v
    return para


def main():
    if len(sys.argv) != 3:
        otkaz('нужно два довода: <юнит> <файл вывода>')
    unit, vyvod = sys.argv[1], sys.argv[2]
    if show(unit, 'LoadState').strip() != 'loaded':
        otkaz(f'{unit} не загружен')
    sreda = {}
    for x in shlex.split(show(unit, 'Environment')):
        k, sep, v = x.partition('=')
        if not sep:
            otkaz(f'Environment= без «=»: {k[:40]}')
        sreda[k] = v
    for stroka in show(unit, 'EnvironmentFiles').splitlines():
        m = re.fullmatch(r'(.*) \(ignore_errors=(yes|no)\)', stroka.strip())
        if not m:
            otkaz(f'EnvironmentFiles не разобран: {stroka[:80]}')
        put, ignor = m[1], m[2] == 'yes'
        try:
            sreda.update(razobrat_fajl(put))
        except OSError as e:
            if not ignor:
                otkaz(f'{put} не читается ({e.strerror})')
    try:
        fd = os.open(vyvod, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except OSError as e:
        otkaz(f'{vyvod} не создан ({e.strerror}): файл вывода должен быть новым, не ссылкой')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        for k, v in sreda.items():
            if '\n' in v:
                otkaz(f'значение {k} многострочное — в файл KEY=VALUE не ложится')
            f.write(f'{k}={v}\n')
    print(f'окружение юнита {unit}: ключей {len(sreda)}')


main()
