#!/usr/bin/python3
"""Repeated single-writer refusal, not a general liveness watchdog."""
import argparse, datetime, json, os, pathlib, re, subprocess, sys, time
# Файл настройки пакета dsh-pamyat-storozha: строки «КЛЮЧ=значение», «#» — комментарий; берётся последнее вхождение.
# Путь меняет DSH_PAMYAT_STOROZHA_CONF. Порядок: переменная → файл → нейтральное умолчание; нет ничего — СЛЕПОТА, код 2.
# EN: Settings file of the dsh-pamyat-storozha package: "KEY=value" lines, a line starting with "#" is a
#     comment; the last occurrence wins.
#     DSH_PAMYAT_STOROZHA_CONF changes the path. Order: variable → file → neutral default; nothing at all —
#     BLINDNESS, code 2.
KONF=os.environ.get('DSH_PAMYAT_STOROZHA_CONF','/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf')
def _konf(key,default):
    value=None
    try:
        with open(KONF,encoding='utf-8') as f:
            for s in f:
                s=s.strip()
                if s and not s.startswith('#') and s.partition('=')[0].strip()==key:value=s.partition('=')[2]
    except OSError:pass
    # « #» в значении — громкий отказ, а не склеивание пояснения со значением: комментарий только с начала строки.
    # Код 3 — провал для юнитов, считающих успехом 1 и 2 (omega) или 1 (writer).
    # EN: " #" in a value is a loud refusal, not gluing the note into the value: a comment only from the line start.
    #     Code 3 is a failure for units counting 1 and 2 (omega) or 1 (writer) as success.
    if value is not None and (' #' in value or '\t#' in value):
        print(f'ОТКАЗ: значение ключа {key} в {KONF} содержит « #» — комментарий допускается только с начала строки'); raise SystemExit(3)
    value=value.strip() if value else value
    return value or default
VERSION = _konf('SWW_VERSIYA', 'session-writer-watch 3')
LIMIT = 300  # five minutes of recurring refusals; receiver retries about every 26 s
FRESH = 90   # a stopped error stream is not proof of a currently blocked receiver
WINDOW = 3600
COOLDOWN = 3600
# Пауза агента по /stop, договор ред. 2: <PAUZA_DIR>/<агент>/pauza.json. Переменная — только для стенда; в бою путь договора — ключ SWW_PAUZA_DIR; не задан — СЛЕПОТА.
# EN: Agent pause via /stop, contract rev. 2: <PAUZA_DIR>/<agent>/pauza.json. The variable is for the stand
#     only; in production the contract path is the SWW_PAUZA_DIR key; unset — BLINDNESS.
PAUZA_DIR = os.environ.get('SESSION_WRITER_PAUZA_DIR') or _konf('SWW_PAUZA_DIR', '')
REGISTRY = _konf('AGENT_REGISTRY', '')
CHITATEL = _konf('SWW_CHITATEL', 'не назначен')
PAUZA_STAR = 900   # updated старше 15 мин — файл устарел, это не пауза · EN: updated older than 15 min — the file is stale, this is not a pause
PAUZA_BUDUSHCHEE = 60   # updated позже «сейчас + 60 с» — время из будущего, файлу не верим (иначе он не устареет никогда) · EN: updated later than "now + 60 s" — time from the future, the file is not trusted (otherwise it would never go stale)
# ⚠️ ГРАНИЦА: «пишет только своя учётка» защищает от ошибки соседа, а НЕ от умысла — у агентов sudo ALL, подделать файл может любой.
# EN: ⚠️ BOUNDARY: "only its own account writes" protects against a neighbour's mistake, NOT against intent —
#     agents have sudo ALL, anyone can forge the file.
ERROR = re.compile(r'session "([^"\r\n]{1,160})" is already owned by an active write handle')
PROGRESS = re.compile(r'(?:type=turn/start session.id=|сессия )(telegram-[^\s,;:]+)')


def analyze(events, now, pids):
    pending = {}
    for event in sorted(events, key=lambda e: int(e['__REALTIME_TIMESTAMP'])):
        unit, pid = event.get('_SYSTEMD_UNIT'), str(event.get('_PID'))
        if unit not in pids or pid != pids[unit]:
            continue
        stamp = int(event['__REALTIME_TIMESTAMP']) / 1e6
        if not now-WINDOW <= stamp <= now:
            continue
        message = event.get('MESSAGE')
        if not isinstance(message, str):
            continue
        match = ERROR.search(message)
        if match:
            session = match.group(1)
            key = json.dumps([unit, event.get('_BOOT_ID'), pid, session])
            if key not in pending or stamp-pending[key]['last'] > FRESH:
                pending[key] = {'key':key, 'unit':unit, 'pid':pid, 'session':session,
                                'first':stamp, 'last':stamp, 'errors':0}
            pending[key]['last'] = stamp
            pending[key]['errors'] += 1
        elif ('продолжена с диска' in message
              or 'канал подключён к живому агенту' in message):
            progress = PROGRESS.search(message)
            if progress:
                pending = {k:v for k,v in pending.items()
                           if not (v['unit']==unit and v['pid']==pid and v['session']==progress.group(1))}
    return [dict(v, seconds=int(now-v['first'])) for v in pending.values()
            if v['errors'] >= 2 and now-v['first'] >= LIMIT and now-v['last'] <= FRESH]


def pauza(agent, user, base, now):
    """Нет файла — (None, None); пауза — ('pauza', строка); иначе ('beda', строка): устарел/недоверен/нечитаем — НЕ пауза.
    Верим файлу, только если каталог агента принадлежит его учётке (поле реестра polzovatel), файл — ей же или root, без записи g/o."""
    # EN: No file — (None, None); pause — ('pauza', line); otherwise ('beda', line): stale/untrusted/unreadable
    #     — NOT a pause.
    #     The file is trusted only if the agent's directory belongs to its account (registry field polzovatel),
    #     and the file to that account or root, with no g/o write.
    d = pathlib.Path(base) / agent
    f = d / 'pauza.json'
    if not f.exists():
        return None, None
    import pwd
    bedy = []
    for what, path, owners in (('каталог', d, {user}), ('файл', f, {user, 'root'})):
        st = path.stat()
        owner = pwd.getpwuid(st.st_uid).pw_name
        if owner not in owners:
            bedy.append(f'{what}: владелец {owner}, а не {user}')
        if st.st_mode & 0o022:
            bedy.append(f'{what}: права {oct(st.st_mode & 0o777)[2:]} (запись g/o)')
    if bedy:
        return 'beda', f"{agent}: файл паузы недоверен: {'; '.join(bedy)}"
    try:
        data = json.loads(f.read_text())
        if not isinstance(data, dict) or not isinstance(data.get('paused'), bool):
            raise ValueError('поле paused не true/false')
        if not data['paused']:
            return None, None
        updated = datetime.datetime.fromisoformat(str(data.get('updated', '')).replace('Z', '+00:00')).timestamp()
    except Exception as error:
        return 'beda', f'{agent}: файл паузы нечитаем: {error}'
    if updated - now > PAUZA_BUDUSHCHEE:
        return 'beda', f"{agent}: файл паузы недоверен: время из будущего (updated {data.get('updated')})"
    if now - updated > PAUZA_STAR:
        return 'beda', f"{agent}: файл паузы устарел с {data.get('updated')}"
    queue = data.get('queue') if isinstance(data.get('queue'), dict) else {}
    return 'pauza', (f"{agent} на паузе по /stop с {data.get('since', '?')}, в очереди писем {queue.get('letters', '?')},"
                     f" заданий {queue.get('tasks', '?')}")


def notify(alarms, now, state_file, send):
    state_file = pathlib.Path(state_file)
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    if not isinstance(state, dict) or any(not isinstance(v, (int,float)) for v in state.values()):
        raise ValueError('invalid alert state')
    active = {a['key'] for a in alarms}
    state = {k:v for k,v in state.items() if k in active}
    due = [a for a in alarms if now-state.get(a['key'], -COOLDOWN) >= COOLDOWN]
    if due:
        message = f'🔴 {os.uname().nodename}: канал удержан конфликтом writer более 5 минут\n' + '\n'.join(
            f"{a['unit']} / {a['session']} / PID {a['pid']}: {a['seconds']} с, отказов {a['errors']}"
            for a in due)
        send(message)  # failure must not become an acknowledgement
        for alarm in due:
            state[alarm['key']] = now
    state_file.parent.mkdir(parents=True, exist_ok=True)
    temp = state_file.with_name(state_file.name + '.new')
    with temp.open('w') as stream:
        json.dump(state, stream)
    os.replace(temp, state_file)


def command(args, timeout):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f'{args[0]} refused ({result.returncode})')
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', action='version', version=VERSION)
    parser.add_argument('--check', action='store_true', help='read journal and report only; no state or alert writes')
    args = parser.parse_args()
    import yaml
    if not REGISTRY:
        raise ValueError(f'реестр агентов не задан — ключ AGENT_REGISTRY в {KONF}')
    if not PAUZA_DIR:
        raise ValueError(f'каталог паузы не задан — SESSION_WRITER_PAUZA_DIR или ключ SWW_PAUZA_DIR в {KONF}')
    registry = yaml.safe_load(pathlib.Path(REGISTRY).read_text())
    units = sorted({a['namerenie']['sluzhba'] for a in registry['agenty']})
    if not units or any(not re.fullmatch(r'[A-Za-z0-9_.@-]+\.service', u) for u in units):
        raise ValueError('invalid service inventory')
    properties = command(['systemctl','show',*units,'-p','Id','-p','MainPID'], 10)
    pids = {}
    for block in properties.strip().split('\n\n'):
        values = dict(line.split('=',1) for line in block.splitlines() if '=' in line)
        if values.get('Id') in units and values.get('MainPID','').isdigit():
            pids[values['Id']] = values['MainPID']
    if set(pids) != set(units):
        raise ValueError('incomplete service PID inventory')
    now = time.time()
    query = ['journalctl','--no-pager','-o','json','--since',f'@{int(now-WINDOW)}','--until',f'@{int(now)}']
    for unit in units:
        query += ['-u',unit]
    raw = command(query, 20)
    events = [json.loads(line) for line in raw.splitlines() if line]
    alarms = analyze(events, now, pids)
    # Конфликт писателя у ЖИВОГО агента на паузе — строкой, не тревогой. Служба без процесса (MainPID 0) паузой не оправдывается.
    # Устаревший / недоверенный / нечитаемый файл — НЕ пауза: тревога о конфликте остаётся, строка — в поле pauza (тревогу о самом файле
    # поднимает сторож машины, группа «pauza»; здесь её не дублирую).
    # EN: A writer conflict for a LIVE agent on pause — as a line, not an alarm. A service without a process
    #     (MainPID 0) is not excused by a pause.
    #     A stale / untrusted / unreadable file is NOT a pause: the conflict alarm stays, the line goes into the
    #     pauza field (the alarm about the file itself is raised by the machine watcher, group "pauza"; it is
    #     not duplicated here).
    agenty = {a['namerenie']['sluzhba']: (a['imya'], a['namerenie'].get('polzovatel')) for a in registry['agenty']}
    pauzy, stroki = {}, []
    for unit in units:
        imya, user = agenty[unit]
        status, text = pauza(imya, user, PAUZA_DIR, now)
        if status == 'pauza' and pids.get(unit, '0') != '0':
            pauzy[unit] = text
        if text:
            stroki.append(text)
    bez_trevogi = [dict(a, pauza=pauzy[a['unit']]) for a in alarms if a['unit'] in pauzy]
    alarms = [a for a in alarms if a['unit'] not in pauzy]
    # Recheck process identity after reading a potentially long journal.
    if command(['systemctl','show',*units,'-p','Id','-p','MainPID'], 10) != properties:
        raise RuntimeError('service generation changed during measurement')
    if not args.check:
        notify(alarms, now, '/var/lib/session-writer-watch/state.json',
               lambda text: command(['/usr/local/bin/agent-alert',text], 10))
    print(json.dumps({'version':VERSION,'reader':CHITATEL,'units':units,'journal_events':len(events),
                      'scope':'recurring writer refusals only','alarms':alarms,
                      'pauza':stroki,'na_pauze_bez_trevogi':bez_trevogi}, ensure_ascii=False))
    return 1 if alarms else 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(f'СЛЕПОТА session-writer-watch: {error}', file=sys.stderr)
        sys.exit(2)
