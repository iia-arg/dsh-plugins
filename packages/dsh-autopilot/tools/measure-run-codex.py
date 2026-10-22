#!/usr/bin/env python3
"""measure-run-codex — замер прогона Autopilot по журналам Codex тем же прибором, что для Claude Code.

Зачем: upstream tools/measure-run.py (nick-vels/skills 46060c3) читает только ~/.claude/projects/*.jsonl;
у нас оператор и исполнители — Codex (coder-gateway@*), для них он слеп. Этот адаптер НЕ считает сам:
в текстовом режиме он переводит журналы Codex в раскладку Claude Code во временном HOME и зовёт неизменённый measure-run.py.
Режим --snapshot-json читает числовые usage напрямую, дедуплицирует thread+response_id и отдаёт snapshot v1, без norm и текстового парсинга.
Поэтому единица, формулы и вид отчёта — ровно те, что у upstream.

Запуск — от ВЛАДЕЛЬЦА CODEX_HOME (sudo -u master, учётка кодера), никогда от root: euid 0 → отказ 2
(чужой код upstream от root не исполняем — как охрана части А). measure-run.py принимается только с закреплённой
sha256 (ZAKREPLENO, сейчас — 46060c3); исполняется проверенная копия байтов, а не файл по пути.

Вызов:
    measure-run-codex.py --measure-run <путь к measure-run.py> --codex-home <CODEX_HOME> --potok <id потока>
                         [--s <ISO-время>] [--po <ISO-время>] [--sverka-shlyuz [--s-shlyuza <ISO>]]
  поток оператора — корень; его дочерние субагенты Codex (session_meta.source.subagent.thread_spawn.parent_thread_id,
  по всей глубине) — отдельные контексты, метка — имя из agent_path (по ней measure-run судит роль).
  --s/--po — окно по времени вызова: у оператора Codex один длинный поток на много задач.

--sverka-shlyuz (по умолчанию выкл): ПОЛНОТА корневого потока — для каждой строки шлюза $CODEX_HOME/dsh-usage-hodov.jsonl
  (итог хода из уведомлений app-server thread/tokenUsage/updated — канал протокола, не файл rollout) сравнить число вызовов
  и суммы input/cached/output/reasoning с записями token_usage_record того же turn_id; расхождение → «пробел журнала: turn …»,
  код 1 после отчёта; нет файла шлюза, ход без итога шлюза или законченный ход, начатый после монтажа шлюза, без его
  строки — СЛЕПОТА, код 2. Момент монтажа — --s-shlyuza или ts первой строки файла шлюза. Ход без строки шлюза — отдельно («нет строки шлюза»), не пробел. Субагенты Codex сверкой не покрыты:
  шлюз видит уведомления только своей нити.

Соответствие (один вызов модели = одна запись token_usage_record, ключ — response_id):
  Claude message.id                  ← response_id
  cache_read_input_tokens            ← cached_input_tokens
  cache_creation_input_tokens        ← cache_write_input_tokens
  input_tokens (без кэша)            ← input_tokens − cached − cache_write (у Codex input_tokens ВКЛЮЧАЕТ кэш)
  output_tokens                      ← output_tokens (у Codex включает reasoning_output_tokens)
  инструменты: exec с exec_command → Bash (текст вызова целиком); apply_patch → Edit по каждому «*** … File: <путь>».

Коды: 0 — отчёт measure-run напечатан; 1 — пробел журнала (сверка); 2 — ОТКАЗ/СЛЕПОТА (нет файла, потока, measure-run,
неверный довод; сверка не доказана), причина в выводе; 3 — сбой прибора (непойманное исключение); иначе — код measure-run.py.
НЕ ловит: вызовы модели, которых нет в журнале Codex (журнал отключён, потерян, другой CODEX_HOME); исполнителей
в ДРУГИХ домах (почта, часть В) — их потоки не потомки оператора; инструменты — приближённо (см. выше).
"""
import argparse, contextlib, glob, hashlib, io, json, os, re, subprocess, sys, tempfile
from datetime import datetime, timezone

# sha256 tools/measure-run.py в nick-vels/skills 46060c3efc19a3e5cb740415cdfb601d126c29fd (ворота Вениамина 20:32Z, У2)
ZAKREPLENO = '2e6b615e7c2ed74bc343e2bc58c73df730e63d8b678ea298cfdefd3c909ddb94'
PUTI = re.compile(r'\*\*\* (?:Add|Update|Delete) File: ([^\\\n"]+)')


def otkaz(t):
    print('measure-run-codex: ОТКАЗ — ' + t, file=sys.stderr)
    sys.exit(2)


def vremya(s):
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00')) if s else None
    except ValueError:
        otkaz('время не разобрано: ' + s)


def potoki(home):
    """id потока → (файл, id родителя или None, метка)."""
    est = {}
    for f in glob.glob(os.path.join(home, 'sessions', '*', '*', '*', 'rollout-*.jsonl')):
        with open(f, encoding='utf-8') as fh:
            try:
                m = json.loads(fh.readline())
            except json.JSONDecodeError:
                continue
        if m.get('type') != 'session_meta':
            continue
        p = m.get('payload') or {}
        ts = ((p.get('source') or {}).get('subagent') or {}).get('thread_spawn') if isinstance(p.get('source'), dict) else None
        metka = os.path.basename((ts or {}).get('agent_path') or '') or (ts or {}).get('agent_nickname') or p.get('id')
        est[p.get('id')] = (f, (ts or {}).get('parent_thread_id'), metka)
    return est


def perevesti(f, s, po):
    """Строки журнала Codex → строки в виде Claude Code (только то, что читает measure-run)."""
    vyhod = []
    with open(f, encoding='utf-8') as fh:
        for line in fh:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            t, p, ts = r.get('type'), r.get('payload') or {}, r.get('timestamp')
            v = vremya(ts)
            if (s and v and v < s) or (po and v and v > po):
                continue
            if t == 'token_usage_record' and p.get('response_id') and p.get('usage'):
                u = p['usage']
                cr = u.get('cached_input_tokens', 0) or 0
                cw = u.get('cache_write_input_tokens', 0) or 0
                vyhod.append({'type': 'assistant', 'timestamp': ts, 'message': {
                    'id': p['response_id'], 'role': 'assistant', 'usage': {
                        'input_tokens': max((u.get('input_tokens', 0) or 0) - cr - cw, 0),
                        'cache_read_input_tokens': cr, 'cache_creation_input_tokens': cw,
                        'output_tokens': u.get('output_tokens', 0) or 0}}})
            elif t == 'response_item' and p.get('type') in ('custom_tool_call', 'function_call'):
                tekst = str(p.get('input') or p.get('arguments') or '')
                vyzovy = []
                if 'apply_patch' in tekst:
                    vyzovy += [{'type': 'tool_use', 'name': 'Edit', 'input': {'file_path': x.strip()}} for x in PUTI.findall(tekst)]
                if 'exec_command' in tekst or p.get('name') in ('shell', 'exec_command'):
                    vyzovy.append({'type': 'tool_use', 'name': 'Bash', 'input': {'command': tekst}})
                if not vyzovy:
                    vyzovy.append({'type': 'tool_use', 'name': p.get('name') or '?', 'input': {}})
                # id вызова инструмента — свой, без usage: measure-run его как вызов модели не посчитает
                vyhod.append({'type': 'assistant', 'timestamp': ts,
                              'message': {'id': 'tool-' + str(p.get('call_id') or len(vyhod)), 'role': 'assistant', 'content': vyzovy}})
            elif ts:
                vyhod.append({'type': 'event', 'timestamp': ts})
    return vyhod


def sverka(home, potok_id, fajl, s, po, moment_yavno=None):
    """Число пробелов журнала Codex против строк шлюза по корневому потоку; печать по ходу."""
    put = os.path.join(home, 'dsh-usage-hodov.jsonl')
    if not os.path.isfile(put):
        print(f'сверка со шлюзом: СЛЕПОТА — нет {put} (шлюз без строки usage хода)'); return None, None
    shlyuz, pervaya = {}, None
    for line in open(put, encoding='utf-8'):
        try:
            z = json.loads(line)
        except json.JSONDecodeError:
            continue
        v = vremya(z.get('ts'))
        if v and (pervaya is None or v < pervaya):
            pervaya = v
        if z.get('thread') == potok_id and not ((s and v and v < s) or (po and v and v > po)):
            shlyuz[z.get('turn')] = z
    zhurnal, nachalo, zakoncheny, pervaya_zapis = {}, {}, set(), {}
    vybrannye = set()
    with open(fajl, encoding='utf-8') as fh:
        for line in fh:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            p = r.get('payload') or {}
            if r.get('type') == 'token_usage_record' and p.get('response_id') and p.get('usage'):
                zhurnal.setdefault(p.get('turn_id'), {})[p['response_id']] = p['usage']
                vx = vremya(r.get('timestamp'))
                if vx is None or not ((s and vx < s) or (po and vx > po)):
                    vybrannye.add(p.get('turn_id'))
                v0 = vremya(r.get('timestamp'))   # запасное начало хода — самая ранняя его запись (если task_started нет)
                if v0 and p.get('turn_id') and (p['turn_id'] not in pervaya_zapis or v0 < pervaya_zapis[p['turn_id']]):
                    pervaya_zapis[p['turn_id']] = v0
            elif p.get('type') == 'task_started' and p.get('turn_id'):
                nachalo[p['turn_id']] = vremya(r.get('timestamp'))
            elif p.get('type') == 'task_complete' and p.get('turn_id'):
                zakoncheny.add(p['turn_id'])
    probely = nedokazano = 0
    for t, z in shlyuz.items():
        zap = zhurnal.get(t, {})
        nash = {'vyzovov': len(zap), **{k: sum((u.get(f, 0) or 0) for u in zap.values()) for k, f in
                (('input', 'input_tokens'), ('cached', 'cached_input_tokens'), ('output', 'output_tokens'), ('reasoning', 'reasoning_output_tokens'))}}
        if z.get('polnota') != 'ok':
            nedokazano += 1
            print(f'шлюз не дал итога: turn {t} (полнота={z.get("polnota")}) — полнота хода НЕ доказана'); continue
        raz = [f'{k} шлюз {z.get(k)} / журнал {nash[k]}' for k in nash if z.get(k) != nash[k]]
        if raz:
            probely += 1
            print(f'пробел журнала: turn {t} — ' + '; '.join(raz))
    for t in sorted(vybrannye - set(shlyuz) - zakoncheny, key=str):
        nedokazano += 1
        print(f'незавершённый ход без итога шлюза: turn {t} — полнота хода НЕ доказана')
    # LOW-2 (ворота 21:07Z): законченный ход, начатый ПОСЛЕ монтажа 3.1.5, без строки шлюза — не доказан (код 2), а не «ноль».
    # Момент: явный --s-shlyuza (время монтажа из журнала окна) или ts первой строки файла шлюза (верхняя граница монтажа).
    moment, istochnik = (moment_yavno, '--s-shlyuza') if moment_yavno else (pervaya, 'первая строка файла шлюза')
    if moment is None:   # MED ворот 22:17Z: пустой файл шлюза (или строки без ts) и нет --s-shlyuza — момент неизвестен ⇒ не доказано
        print(f'сверка со шлюзом: СЛЕПОТА — в {put} нет ни одной строки со временем, --s-shlyuza не дан: момент монтажа неизвестен,'
              f' ходы после него не проверить (пробелов найдено {probely})')
        return probely, None
    for t in zakoncheny:
        nachalo.setdefault(t, pervaya_zapis.get(t))
    for t in sorted(zakoncheny, key=lambda x: (nachalo.get(x) is None, nachalo.get(x).isoformat() if nachalo.get(x) else x)):
        v = nachalo.get(t)
        if t in shlyuz:
            continue
        if v is None:   # законченный ход без строки шлюза, начало неизвестно (нет task_started и записей) — не доказан
            nedokazano += 1
            print(f'ход без строки шлюза с неизвестным началом: turn {t} — полнота хода НЕ доказана'); continue
        if v < moment or (s and v < s) or (po and v > po):
            continue
        nedokazano += 1
        print(f'ход после монтажа шлюза без его строки: turn {t} (начат {v.isoformat()}) — полнота хода НЕ доказана')
    print(f'сверка со шлюзом: момент монтажа шлюза {moment.isoformat() if moment else "неизвестен"} ({istochnik})')
    bez = [t for t in zhurnal if t not in shlyuz and not (s or po)]
    print(f'сверка со шлюзом: ходов со строкой шлюза {len(shlyuz)}, пробелов {probely}, без итога шлюза {nedokazano}'
          + (f'; ходов журнала без строки шлюза {len(bez)}' if not (s or po) else ''))
    return probely, nedokazano


def snapshot_time(value):
    if type(value) is not str: raise ValueError('timestamp missing')
    stamp = datetime.fromisoformat(value.replace('Z','+00:00'))
    if stamp.utcoffset() is None: raise ValueError('timestamp has no offset')
    return stamp


def numeric_records(path, start, end):
    """Dedup final physical rows first; selected responses cannot escape their turn/window."""
    latest, all_turns, selected_ids, begun, completed, owners = {}, {}, set(), {}, {}, {}
    for line in open(path, encoding='utf-8'):
        if not line.strip(): continue
        record = json.loads(line)
        if type(record) is not dict: raise ValueError('record shape')
        p = record.get('payload') or {}
        if type(p) is not dict: raise ValueError('payload shape')
        if p.get('type') in {'task_started','task_complete'} and p.get('turn_id'):
            target = begun if p['type']=='task_started' else completed
            target[p['turn_id']] = snapshot_time(record.get('timestamp'))
        if record.get('type') != 'token_usage_record': continue
        stamp = snapshot_time(record.get('timestamp'))
        turn, rid, usage = p.get('turn_id'), p.get('response_id'), p.get('usage')
        if type(turn) is not str or not turn or type(rid) is not str or not rid or type(usage) is not dict:
            raise ValueError('usage identity missing')
        if rid in owners and owners[rid] != turn: raise ValueError('response belongs to different turns')
        owners[rid] = turn;latest[rid] = (turn,stamp,usage)
        all_turns.setdefault(turn,set()).add(rid)
        if start <= stamp <= end: selected_ids.add(rid)
    selected, selected_turns = {}, {}
    for rid in selected_ids:
        turn,stamp,usage = latest[rid]
        if turn not in begun or turn not in completed or not start <= begun[turn] <= stamp <= completed[turn] <= end:
            raise ValueError('final response escapes window/turn')
        required = ('input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens')
        if any(k not in usage for k in required): raise ValueError('usage field missing')
        fields = [usage[k] for k in required]
        if any(type(n) is not int or not 0 <= n <= 9007199254740991 for n in fields) or fields[0] < fields[1]+fields[2]:
            raise ValueError('usage values invalid')
        selected[rid] = fields;selected_turns.setdefault(turn,set()).add(rid)
    if any(rids != all_turns[turn] for turn,rids in selected_turns.items()):
        raise ValueError('window cuts a turn')
    return selected, selected_turns


def snapshot_json(o):
    start, end = vremya(o.s), vremya(o.po)
    if not re.fullmatch('[0-9a-f]{32}',o.run_id or '') or not start or not end or start.utcoffset() is None or end.utcoffset() is None or start >= end:
        otkaz('snapshot-json requires run-id from state and an explicit UTC time window')
    engine = dict(status='not_measured',measuredAt=datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
        windowStart=start.astimezone(timezone.utc).isoformat().replace('+00:00','Z'),
        windowEnd=end.astimezone(timezone.utc).isoformat().replace('+00:00','Z'),
        source='codex-rollout-gateway',scope='declared_threads',coverage='unavailable',
        **dict.fromkeys(('modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens')))
    try:
        if end > datetime.now(timezone.utc): raise ValueError('window is in the future')
        if hashlib.sha256(open(o.measure_run,'rb').read()).hexdigest() != ZAKREPLENO: raise ValueError('measurement pin')
        threads = potoki(o.codex_home)
        if o.potok not in threads: raise ValueError('thread unavailable')
        engine.update(status='incomplete',coverage='incomplete')
        queue, seen = [o.potok], {o.potok}
        for parent in queue:
            for tid,(_,ancestor,_) in threads.items():
                if ancestor != parent: continue
                if tid in seen: raise ValueError('thread ancestry cycle')
                seen.add(tid);queue.append(tid)
        # Text diagnostics stay private; stdout is exactly the agreed numeric object.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            gaps, unknown = sverka(o.codex_home,o.potok,threads[o.potok][0],start,end,vremya(o.s_shlyuza))
        if gaps != 0 or unknown != 0: raise ValueError('gateway coverage incomplete')
        gateway = [json.loads(l) for l in open(os.path.join(o.codex_home,'dsh-usage-hodov.jsonl'),encoding='utf-8') if l.strip()]
        if any(type(z) is not dict for z in gateway): raise ValueError('gateway shape')
        selected_gateway = {z.get('turn'):z for z in gateway if z.get('thread')==o.potok and z.get('ts') and start <= snapshot_time(z['ts']) <= end}
        if not selected_gateway: raise ValueError('no selected gateway total')
        for z in selected_gateway.values():
            if z.get('polnota')!='ok' or any(type(z.get(k)) is not int or not 0 <= z[k] <= 9007199254740991 for k in ('vyzovov','input','cached','output','reasoning')):
                raise ValueError('gateway totals invalid')
        responses = {}
        for tid in queue:
            records, turns = numeric_records(threads[tid][0],start,end)
            if tid == o.potok:
                if not set(turns) <= set(selected_gateway): raise ValueError('selected root turn has no gateway total')
                for turn,z in selected_gateway.items():
                    rows = [records[rid] for rid in turns.get(turn,())]
                    actual = [len(rows),sum(v[0] for v in rows),sum(v[1] for v in rows),sum(v[3] for v in rows)]
                    if actual != [z[k] for k in ('vyzovov','input','cached','output')]: raise ValueError('selected response totals differ from gateway')
            for rid,values in records.items():responses[(tid,rid)] = values
        totals = [sum(v[i] for v in responses.values()) for i in range(4)]
        if any(n > 9007199254740991 for n in totals): raise ValueError('unsafe aggregate')
        engine.update(status='observed',coverage='root_gateway_and_children' if len(queue)>1 else 'root_gateway_only',
            modelCalls=len(responses),inputTokens=totals[0],uncachedInputTokens=totals[0]-totals[1]-totals[2],
            outputTokens=totals[3],cacheReadTokens=totals[1],cacheWriteTokens=totals[2])
    except (OSError,ValueError,TypeError,KeyError,AttributeError,SystemExit):
        print('measure-run-codex: SNAPSHOT_SOURCE_UNVERIFIED',file=sys.stderr)
    print(json.dumps(dict(schemaVersion=1,runId=o.run_id,byEngine={'codex':engine}),ensure_ascii=False,allow_nan=False))
    return 0 if engine['status']=='observed' else 2


def main():
    a = argparse.ArgumentParser(add_help=True)
    a.add_argument('--measure-run', required=True)
    a.add_argument('--codex-home', required=True)
    a.add_argument('--potok', required=True)
    a.add_argument('--s'); a.add_argument('--po')
    a.add_argument('--sverka-shlyuz', action='store_true')
    a.add_argument('--snapshot-json', action='store_true')
    a.add_argument('--run-id')
    a.add_argument('--s-shlyuza', help='момент монтажа шлюза 3.1.5 (ISO); по умолчанию — ts первой строки dsh-usage-hodov.jsonl')
    try:
        o = a.parse_args()
    except SystemExit:
        sys.exit(2)
    if os.geteuid() == 0:
        otkaz('запуск от root запрещён — звать от владельца CODEX_HOME (sudo -u <учётка>)')
    if o.snapshot_json: return snapshot_json(o)
    if o.run_id: otkaz('--run-id requires --snapshot-json')
    try:
        with open(o.measure_run, 'rb') as fh:
            mr_bajty = fh.read()
    except OSError as e:
        otkaz(f'measure-run.py не прочитан: {o.measure_run}: {e.strerror}')
    if hashlib.sha256(mr_bajty).hexdigest() != ZAKREPLENO:
        otkaz(f'sha256 measure-run.py {hashlib.sha256(mr_bajty).hexdigest()[:16]} ≠ закреплённой {ZAKREPLENO[:16]} — не исполняю')
    if not os.path.isdir(os.path.join(o.codex_home, 'sessions')):
        otkaz('нет каталога sessions в ' + o.codex_home)
    s, po = vremya(o.s), vremya(o.po)
    est = potoki(o.codex_home)
    if o.potok not in est:
        otkaz(f'поток {o.potok} не найден в {o.codex_home} (потоков {len(est)})')
    deti, ochered, vidennye = [], [o.potok], {o.potok}
    while ochered:
        x = ochered.pop()
        for k, (_, rod, _) in est.items():
            if rod == x:
                if k in vidennye:
                    otkaz(f'цикл в родстве потоков: {k} уже встречен (родитель {x})')
                vidennye.add(k); deti.append(k); ochered.append(k)
    with tempfile.TemporaryDirectory(prefix='measure-run-codex-') as dom:
        proekt = '/codex/' + o.potok
        kat = os.path.join(dom, '.claude', 'projects', re.sub(r'[^A-Za-z0-9]', '-', proekt))
        os.makedirs(os.path.join(kat, o.potok, 'subagents'))
        def zapisat(put, stroki):
            with open(put, 'w', encoding='utf-8') as fh:
                for r in stroki:
                    fh.write(json.dumps(r, ensure_ascii=False) + '\n')
        zapisat(os.path.join(kat, o.potok + '.jsonl'), perevesti(est[o.potok][0], s, po))
        for k in deti:
            zapisat(os.path.join(kat, o.potok, 'subagents', k + '.jsonl'), perevesti(est[k][0], s, po))
            with open(os.path.join(kat, o.potok, 'subagents', k + '.meta.json'), 'w', encoding='utf-8') as fh:
                json.dump({'description': est[k][2]}, fh, ensure_ascii=False)
        print(f'measure-run-codex: CODEX_HOME {o.codex_home} · поток {o.potok} · субагентов {len(deti)}'
              f'{" · окно " + (o.s or "…") + " — " + (o.po or "…") if s or po else ""}')
        probely, nedokazano = sverka(o.codex_home, o.potok, est[o.potok][0], s, po, vremya(o.s_shlyuza)) if o.sverka_shlyuz else (0, 0)
        sys.stdout.flush()
        mr = os.path.join(dom, 'measure-run.py')
        with open(mr, 'wb') as fh:
            fh.write(mr_bajty)
        kod = subprocess.run([sys.executable, mr, proekt, o.potok], env={**os.environ, 'HOME': dom}).returncode
        # пробел → 1; сверка слепа (нет файла) или хоть один ход без итога шлюза → 2; иначе 0 — не тихий ноль
        return kod if kod else (1 if probely else 2 if (probely is None or nedokazano is None or nedokazano) else 0)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:   # совет ворот: непойманное — код 3 (сбой прибора), не 1 (1 — «пробел журнала»)
        print(f'measure-run-codex: СБОЙ ПРИБОРА — {type(e).__name__}: {e}', file=sys.stderr)
        sys.exit(3)
