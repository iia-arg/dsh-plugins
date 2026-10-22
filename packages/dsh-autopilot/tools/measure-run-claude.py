#!/usr/bin/env python3
"""Read-only, explicitly scoped Claude SDK usage -> normalized usage snapshot.

Run records and ledger anchor scope; raw SDK spawn pairs verify declared children.
No model calls, source writes, panel writes or billing claim.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys
import tempfile

TOKEN_FIELDS = {
    'uncachedInputTokens': 'input_tokens',
    'outputTokens': 'output_tokens',
    'cacheReadTokens': 'cache_read_input_tokens',
    'cacheWriteTokens': 'cache_creation_input_tokens',
}
TOTAL_FIELDS = ['inputTokens', *TOKEN_FIELDS, 'modelCalls']
THREAD_ID = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\Z')


class Incomplete(Exception):
    def __init__(self, code, subject):
        self.code, self.subject = code, subject


def require(condition, code, subject):
    if not condition:
        raise Incomplete(code, subject)


def integer(value):
    return type(value) is int and 0 <= value <= 9007199254740991


def utc_ms(value):
    if not isinstance(value, str):
        raise ValueError('UTC timestamp required')
    stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if stamp.utcoffset() is None or stamp.utcoffset().total_seconds() != 0:
        raise ValueError('UTC timestamp required')
    return int(stamp.timestamp() * 1000)


def load_run_record(directory):
    """G0 source adapter; a live Autopilot run-record producer is separate work."""
    try:
        directory = Path(directory).resolve(strict=True)
        raw = {k: (directory / name).read_bytes() for k, name in
               [('puskSha256', 'pusk.json'), ('bookSha256', 'g0-book.json')]}
        pusk, book = (json.loads(raw[k]) for k in ('puskSha256', 'bookSha256'))
        parent = book['parent_before']['request']
        require(isinstance(pusk['run_id'], str) and pusk['run_id'], 'RUN_RECORD_INVALID', 'runId')
        require(utc_ms(pusk['t0']) < utc_ms(pusk['end']), 'RUN_RECORD_INVALID', 'window')
        root = dict(requestId=parent['request_id'], sessionId=parent['session_id'],
                    sessionCreated=parent['session_created'], turn=parent['turn'], role='parent')
        provenance = dict(kind='g0-fixture-v1', directory=str(directory),
                          **{k: hashlib.sha256(v).hexdigest() for k, v in raw.items()})
        return dict(runId=pusk['run_id'], startedAt=pusk['t0'], endedAt=pusk['end']), root, provenance
    except (OSError, ValueError, TypeError, KeyError):
        raise Incomplete('RUN_RECORD_INVALID', 'pusk/book') from None


def verify_run_record(m):
    origin = m.get('runRecord')
    if isinstance(origin, dict) and origin.get('kind') == 'root-mail-v1':
        import os, stat, importlib.util
        path = Path(__file__).resolve().with_name('claude-root-origin.py')
        for part in [path, *path.parents]:
            info = part.lstat()
            require(part.resolve() == part and info.st_uid == 0 and not info.st_mode & 0o022,
                    'ROOT_CODE_UNSAFE', 'root origin reader')
        require(os.geteuid() == 0, 'ROOT_REQUIRED', 'root origin')
        spec = importlib.util.spec_from_file_location('claude_root_origin', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        try: m['_rootLedgerSnapshot'] = module.verify(m)
        except (OSError, ValueError, KeyError, TypeError):
            raise Incomplete('RUN_RECORD_MISMATCH', 'root origin') from None
        return
    require(isinstance(origin, dict) and origin.get('kind') == 'g0-fixture-v1'
            and isinstance(origin.get('directory'), str), 'RUN_RECORD_REQUIRED', 'runRecord')
    scope, root, pins = load_run_record(origin['directory'])
    require(all(m[k] == v for k, v in scope.items()) and origin == pins,
            'RUN_RECORD_MISMATCH', 'runRecord')
    parents = [r for r in m['requests'] if r['role'] == 'parent']
    require(root['requestId'] in {r['requestId'] for r in parents} and
            all(all(r[k] == root[k] for k in ('sessionId', 'sessionCreated', 'turn')) for r in parents),
            'RUN_RECORD_MISMATCH', 'parent binding')


def manifest_read(path):
    try:
        m = json.loads(path.read_text(encoding='utf-8'))
        require(isinstance(m, dict) and m.get('schemaVersion') == 1,
                'MANIFEST_INVALID', 'schemaVersion')
        require(isinstance(m.get('runId'), str) and 0 < len(m['runId']) <= 200,
                'MANIFEST_INVALID', 'runId')
        start, end = utc_ms(m['startedAt']), utc_ms(m['endedAt'])
        require(start < end, 'MANIFEST_INVALID', 'window')
        require(m['children'] in ('explicit', 'excluded'), 'MANIFEST_INVALID', 'children')
        for field in ('ledger', 'sdkDirectory'):
            require(isinstance(m[field], str) and Path(m[field]).is_absolute(),
                    'MANIFEST_INVALID', field)
        require(isinstance(m['requests'], list) and len(m['requests']) > 0,
                'MANIFEST_INVALID', 'requests')
        seen = set()
        for item in m['requests']:
            require(isinstance(item, dict), 'MANIFEST_INVALID', 'request')
            for field in ('requestId', 'sessionId'):
                require(isinstance(item.get(field), str) and bool(item[field]),
                        'MANIFEST_INVALID', field)
            require(integer(item.get('sessionCreated')) and integer(item.get('turn')),
                    'MANIFEST_INVALID', 'sessionCreated/turn')
            require(item.get('role') in ('parent', 'child'), 'MANIFEST_INVALID', 'role')
            require(not (m['children'] == 'excluded' and item['role'] == 'child'),
                    'MANIFEST_INVALID', 'children excluded but child declared')
            require(item['requestId'] not in seen, 'MANIFEST_INVALID', 'duplicate request')
            seen.add(item['requestId'])
        require(any(i['role'] == 'parent' for i in m['requests']),
                'MANIFEST_INVALID', 'parent required')
        verify_run_record(m)
        return m, start, end
    except (OSError, ValueError, KeyError, TypeError):
        raise Incomplete('MANIFEST_INVALID', 'manifest') from None


def read_ledger(m, start, end, coverage):
    rows = ledger_snapshot(m, coverage, lambda path: query_ledger(m, start, end, coverage, path))
    if m.get('runRecord', {}).get('kind') == 'root-mail-v1':
        require(coverage['ledgerSnapshot'] == m['_rootLedgerSnapshot'],
                'LEDGER_SOURCE_CHANGED', 'root origin ledger')
    return rows


def ledger_snapshot(m, coverage, query):
    # SQLite mode=ro may CREATE -shm/-wal in a writable source directory.
    # Copy DB+WAL with ordinary read-only file IO; SQLite only opens our temp.
    try:
        # SQLite resolves DB symlinks before choosing its WAL name.
        source = Path(m['ledger']).resolve(strict=True)
        paths = [source, Path(str(source) + '-wal'), Path(str(source) + '-journal')]
        def stamps():
            result = []
            for path in paths:
                try:
                    s = path.stat()
                    result.append((s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns))
                except FileNotFoundError:
                    result.append(None)
            return result

        before = stamps()
        require(before[0] is not None, 'LEDGER_UNAVAILABLE', 'ledger')
        require(before[2] is None, 'LEDGER_JOURNAL_PRESENT', 'ledger')
        with tempfile.TemporaryDirectory(prefix='claude-usage-') as directory:
            copy_path = Path(directory) / 'ledger.sqlite'
            hashes = {}
            for index, suffix in ((0, ''), (1, '-wal')):
                if before[index] is not None:
                    raw = paths[index].read_bytes()
                    Path(str(copy_path) + suffix).write_bytes(raw)
                    hashes['walSha256' if index else 'mainSha256'] = hashlib.sha256(raw).hexdigest()
            require(before == stamps(), 'LEDGER_SOURCE_CHANGED', 'ledger')
            coverage['ledgerSnapshot'] = dict(sourceState='stable-during-copy', **hashes)
            return query(copy_path)
    except OSError:
        raise Incomplete('LEDGER_UNAVAILABLE', 'ledger') from None


def query_ledger(m, start, end, coverage, path):
    try:
        con = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    except sqlite3.Error:
        raise Incomplete('LEDGER_UNAVAILABLE', 'ledger') from None
    con.row_factory = sqlite3.Row
    try:
        con.execute('PRAGMA query_only=ON')
        con.execute('BEGIN')
        columns = {r['name'] for r in con.execute('PRAGMA table_info(mail_sdk_requests)')}
        require({'request_id', 'generation', 'session_id', 'session_created', 'turn',
                 'binding_json', 'state', 'started_at', 'terminal_at', 'reason'} <= columns,
                'LEDGER_INVALID', 'schema')
        expected = {i['requestId'] for i in m['requests']}
        rows = []
        for item in m['requests']:
            rid = item['requestId']
            matches = con.execute('SELECT * FROM mail_sdk_requests WHERE request_id=?',
                                  (rid,)).fetchall()
            require(len(matches) == 1, 'REQUEST_MISSING', rid)
            row = dict(matches[0])
            require(all(row[k] == item[v] for k, v in (
                ('session_id', 'sessionId'), ('session_created', 'sessionCreated'),
                ('turn', 'turn'))), 'BINDING_MISMATCH', rid)
            try:
                binding = json.loads(row['binding_json'])
            except (ValueError, TypeError):
                raise Incomplete('BINDING_MISMATCH', rid) from None
            require(isinstance(binding, dict), 'BINDING_MISMATCH', rid)
            require(all(binding.get(k) == row[k] for k in (
                'request_id', 'generation', 'session_id', 'session_created', 'turn')),
                'BINDING_MISMATCH', rid)
            thread = binding.get('sdk_thread_id')
            require(isinstance(thread, str) and bool(THREAD_ID.fullmatch(thread)),
                    'BINDING_MISMATCH', rid)
            require(all(isinstance(binding.get(k), str) and binding[k] for k in (
                'sdk_generation', 'sdk_turn_id', 'ledger_uuid')),
                'BINDING_MISMATCH', rid)
            require(row['state'] == 'terminal' and integer(row['terminal_at']),
                    'REQUEST_NOT_TERMINAL', rid)
            require(integer(row['started_at']) and
                    start <= row['started_at'] <= row['terminal_at'] <= end,
                    'REQUEST_OUTSIDE_WINDOW', rid)
            # A continuation in an explicitly named session/turn cannot vanish
            # merely because the operator forgot to list its request ID.
            scope_filter = ''
            params = [row['session_id']]
            if item['role'] == 'parent':
                scope_filter = 'AND session_created=? AND turn=? '
                params.extend([row['session_created'], row['turn']])
            peers = con.execute('SELECT request_id,session_created FROM mail_sdk_requests WHERE '
                                'session_id=? ' + scope_filter +
                                'AND started_at<=? AND (terminal_at IS NULL OR terminal_at>=?)',
                                (*params, end, start)).fetchall()
            if item['role'] == 'child':
                require(all(p['session_created'] == row['session_created'] for p in peers),
                        'CHILD_GRAPH_INVALID', 'ambiguous child incarnation: ' + row['session_id'])
            require(all(p['request_id'] in expected for p in peers),
                    'REQUEST_SET_INCOMPLETE', rid)
            row['sdk_thread_id'] = thread
            row['sdk_turn_id'] = binding['sdk_turn_id']
            rows.append(row)
            coverage['matchedRequests'] += 1
        # Inspect every ledger binding sharing a selected SDK thread, including
        # undeclared foreign sessions. Time-only attribution must be unambiguous.
        for other in con.execute('SELECT request_id,binding_json,started_at,terminal_at '
                                 'FROM mail_sdk_requests WHERE started_at<=? '
                                 'AND (terminal_at IS NULL OR terminal_at>=?)', (end, start)):
            try:
                thread = json.loads(other['binding_json']).get('sdk_thread_id')
            except (ValueError, TypeError, AttributeError):
                raise Incomplete('BINDING_MISMATCH', other['request_id']) from None
            for row in rows:
                if thread == row['sdk_thread_id'] and other['request_id'] != row['request_id']:
                    other_end = other['terminal_at'] if other['terminal_at'] is not None else end
                    require(other_end < row['started_at'] or other['started_at'] > row['terminal_at'],
                            'SDK_INTERVAL_OVERLAP', row['request_id'])
        return rows
    except (sqlite3.Error, KeyError, TypeError, ValueError):
        raise Incomplete('LEDGER_INVALID', 'ledger') from None
    finally:
        con.close()


def spawn_edges(records, windows):
    """Only typed MCP value.subagentId is identity, never free-text mentions."""
    uses, results = {}, {}
    for record in records:
        message = record.get('message')
        content = message.get('content', []) if isinstance(message, dict) else []
        if not isinstance(content, list):
            continue
        blocks = [b for b in content if isinstance(b, dict) and b.get('type') in ('tool_use', 'tool_result')]
        if not blocks:
            continue
        try:
            time = utc_ms(record['timestamp'])
        except (ValueError, TypeError, KeyError):
            raise Incomplete('SPAWN_TIMING_UNVERIFIED', 'tool record') from None
        owners = [r for r in windows if r['started_at'] <= time <= r['terminal_at']]
        if not owners:
            continue
        owner = owners[0]['session_id']
        require(record.get('sessionId') == owners[0]['sdk_thread_id'], 'SDK_SESSION_MISMATCH', owner)
        for block in blocks:
            if block['type'] == 'tool_use':
                if block.get('name') != 'mcp__sovadsh__subagent':
                    require(block.get('name') not in ('Agent', 'Task', 'subagent', 'spawn_agent')
                            and not str(block.get('name', '')).endswith(('__subagent', '__spawn_agent')),
                            'SPAWN_TOOL_UNSUPPORTED', owner)
                    continue
                require(record.get('type') == 'assistant', 'SPAWN_ROLE_MISMATCH', owner)
                key = block.get('id')
                require(isinstance(key, str) and key, 'SPAWN_RESULT_UNVERIFIED', owner)
                signature = hashlib.sha256(json.dumps(block, sort_keys=True).encode()).hexdigest()
                require(isinstance(message.get('id'), str) and message['id'],
                        'SPAWN_RESULT_UNVERIFIED', key)
                require(key not in uses or
                        (uses[key]['ownerSessionId'] == owner and
                         uses[key]['messageId'] == message['id'] and
                         uses[key]['toolSha256'] == signature), 'SPAWN_RESULT_AMBIGUOUS', key)
                uses.setdefault(key, dict(ownerSessionId=owner, usedAtMs=time,
                                         messageId=message['id'], toolSha256=signature))
            else:
                key = block.get('tool_use_id')
                if isinstance(key, str):
                    results.setdefault(key, []).append((time, block, record.get('type')))
    edges = []
    for key, use in uses.items():
        require(key in results, 'SPAWN_RESULT_MISSING', key)
        ids = set()
        for time, block, record_type in results[key]:
            require(record_type == 'user', 'SPAWN_ROLE_MISMATCH', key)
            try:
                text = block['content']
                if isinstance(text, list):
                    require(len(text) == 1 and text[0].get('type') == 'text',
                            'SPAWN_RESULT_UNVERIFIED', key)
                    text = text[0]['text']
                value = json.loads(text)
                require(not block.get('is_error') and value.get('isError') is False,
                        'SPAWN_RESULT_UNVERIFIED', key)
                child = value['value']
                require(child['kind'] == 'continuable' and isinstance(child['subagentId'], str)
                        and child['subagentId'], 'SPAWN_RESULT_UNVERIFIED', key)
                require(time >= use['usedAtMs'], 'SPAWN_TIMING_UNVERIFIED', key)
                ids.add(child['subagentId'])
            except (ValueError, TypeError, KeyError, AttributeError):
                raise Incomplete('SPAWN_RESULT_UNVERIFIED', key) from None
        require(len(ids) == 1, 'SPAWN_RESULT_AMBIGUOUS', key)
        edges.append(dict(**use, toolUseId=key, childId=ids.pop()))
    return edges


def verify_children(m, edges, coverage):
    if m['children'] == 'excluded':
        return
    parent_ids = {r['sessionId'] for r in m['requests'] if r['role'] == 'parent'}
    declared = {r['sessionId'] for r in m['requests'] if r['role'] == 'child'}
    discovered = {e['childId'] for e in edges}
    require(not (discovered & parent_ids), 'CHILD_GRAPH_INVALID', 'child equals parent')
    require(not (discovered - declared), 'UNLISTED_CHILD', ','.join(sorted(discovered - declared)))
    reachable = set(parent_ids)
    while True:
        new = reachable | {e['childId'] for e in edges if e['ownerSessionId'] in reachable}
        if new == reachable:
            break
        reachable = new
    require(declared <= reachable, 'CHILD_WITHOUT_SPAWN', ','.join(sorted(declared - reachable)))
    require(len(discovered) == len(edges), 'CHILD_GRAPH_INVALID', 'reused subagent ID')
    coverage['childProof'] = dict(verified=True, children=sorted(discovered), edges=edges)


def read_sdk(m, rows, coverage):
    root = Path(m['sdkDirectory']).resolve()
    messages = {}
    matched = {r['request_id']: 0 for r in rows}
    sources = []
    edges = []
    for thread in sorted({r['sdk_thread_id'] for r in rows}):
        path = root / (thread + '.jsonl')
        require(path.resolve().parent == root, 'SDK_SOURCE_UNAVAILABLE', thread)
        windows = [r for r in rows if r['sdk_thread_id'] == thread]
        try:
            with path.open('rb') as f:
                before = path.stat()
                digest = hashlib.sha256()
                records = []
                for number, raw in enumerate(f, 1):
                    digest.update(raw)
                    try:
                        record = json.loads(raw)
                        require(isinstance(record, dict), 'SDK_JSON_INVALID', thread)
                    except (ValueError, UnicodeError):
                        raise Incomplete('SDK_JSON_INVALID', thread) from None
                    records.append(record)
                    if record.get('type') != 'assistant':
                        continue
                    try:
                        timestamp = utc_ms(record['timestamp'])
                    except (KeyError, ValueError, TypeError):
                        raise Incomplete('SDK_TIMESTAMP_INVALID', thread) from None
                    hits = [r for r in windows if r['started_at'] <= timestamp <= r['terminal_at']]
                    if not hits:
                        message = record.get('message')
                        if isinstance(message, dict) and isinstance(message.get('id'), str):
                            late_key = (thread, message['id'])
                            if late_key in messages:
                                # Do not silently reuse a stale in-window block
                                # after a later block has escaped the ledger window.
                                messages[late_key]['outsideInterval'] = True
                        continue
                    require(record.get('sessionId') == thread, 'SDK_SESSION_MISMATCH', thread)
                    message = record.get('message')
                    require(isinstance(message, dict) and isinstance(message.get('id'), str)
                            and bool(message['id']), 'USAGE_INVALID', thread)
                    key = (thread, message['id'])
                    rid = hits[0]['request_id']
                    require(key not in messages or messages[key]['requestId'] == rid,
                            'MESSAGE_INTERVAL_AMBIGUOUS', thread)
                    # Physical order matters: later content blocks replace usage,
                    # even if a timestamp is earlier than the preceding block.
                    messages[key] = dict(usage=message.get('usage'), requestId=rid)
                    matched[rid] += 1
                after = path.stat()
                require((before.st_ino, before.st_size, before.st_mtime_ns) ==
                        (after.st_ino, after.st_size, after.st_mtime_ns),
                        'SDK_SOURCE_CHANGED', thread)
                sources.append(dict(sdkSessionId=thread, sha256=digest.hexdigest(),
                                    bytes=after.st_size))
                if m['children'] == 'explicit':
                    edges.extend(spawn_edges(records, windows))
        except OSError:
            raise Incomplete('SDK_SOURCE_UNAVAILABLE', thread) from None
    verify_children(m, edges, coverage)
    require(all(matched.values()), 'REQUEST_USAGE_MISSING',
            next((rid for rid, count in matched.items() if not count), 'requests'))
    totals = {field: 0 for field in TOKEN_FIELDS}
    for message in messages.values():
        require(not message.get('outsideInterval'), 'MESSAGE_OUTSIDE_INTERVAL', message['requestId'])
        usage = message['usage']
        require(isinstance(usage, dict) and all(integer(usage.get(k)) for k in TOKEN_FIELDS.values()),
                'USAGE_INVALID', message['requestId'])
        for field, key in TOKEN_FIELDS.items():
            totals[field] += usage[key]
    totals['inputTokens'] = (totals['uncachedInputTokens'] + totals['cacheReadTokens']
                             + totals['cacheWriteTokens'])
    totals['modelCalls'] = len(messages)
    require(all(integer(v) for v in totals.values()), 'USAGE_INVALID', 'aggregate exceeds safe integer')
    coverage['sources'] = sources
    coverage['interruptedRequests'] = sum(r['reason'] == 'interrupted' for r in rows)
    coverage['requests'] = [dict(requestId=r['request_id'], sessionId=r['session_id'],
                                 turn=r['turn'], sdkSessionId=r['sdk_thread_id'],
                                 sdkTurnId=r['sdk_turn_id'], startedAtMs=r['started_at'],
                                 terminalAtMs=r['terminal_at']) for r in rows]
    return totals


def measure(path):
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    coverage = dict(expectedRequests=None, matchedRequests=0, children=None, missing=[],
                    providerBillingCompleteness=False,
                    scopeNote='Only declared ledger requests/turns; run attribution is operator-supplied. '
                              'Undeclared descendants and other sessions are not discovered.')
    engine = dict(status='unavailable', measuredAt=now, source='claude-sdk-jsonl',
                  dedupKey='sdk_session_id + message.id; last physical row in selected intervals',
                  coverage=coverage, **dict.fromkeys(TOTAL_FIELDS))
    usage = dict(schemaVersion=1, runId=None, measuredAt=now, scope=None, byEngine={'claude': engine})
    try:
        m, start, end = manifest_read(path)
        usage.update(runId=m['runId'], scope=m['startedAt'] + '..' + m['endedAt'])
        coverage.update(expectedRequests=len(m['requests']), children=m['children'])
        require(utc_ms(now) >= end, 'WINDOW_NOT_FINISHED', 'windowEnd')
        rows = read_ledger(m, start, end, coverage)
        engine.update(read_sdk(m, rows, coverage))
        engine['status'] = 'observed'
    except Incomplete as error:
        coverage['missing'].append(dict(code=error.code, subject=error.subject))
        if coverage['matchedRequests']:
            engine['status'] = 'partial'
    return {'usage': usage}


def writer_snapshot(details):
    """Frozen wire contract: Alfa to-gamma-contract-final.md SHA32649d9e."""
    usage = details['usage']
    raw = usage['byEngine']['claude']
    status = {'observed': 'observed', 'partial': 'incomplete',
              'unavailable': 'not_measured'}[raw['status']]
    if status == 'observed':
        coverage = ('declared_parent_and_children' if raw['coverage']['children'] == 'explicit'
                    else 'declared_parent_only')
    else:
        coverage = 'incomplete' if status == 'incomplete' else 'unavailable'
    window = usage['scope'].split('..') if usage['scope'] else [None, None]
    engine = dict(status=status, measuredAt=raw['measuredAt'],
                  windowStart=window[0], windowEnd=window[1],
                  source='claude-sdk-jsonl', scope='declared_requests', coverage=coverage,
                  **{k: raw[k] for k in TOTAL_FIELDS})
    return dict(schemaVersion=1, runId=usage['runId'], byEngine={'claude': engine})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--details', action='store_true',
                        help='emit private binding/source diagnostics as one JSON on stderr')
    args = parser.parse_args()
    snapshot = measure(args.manifest)
    print(json.dumps(writer_snapshot(snapshot), ensure_ascii=False, allow_nan=False))
    if args.details:
        print(json.dumps(snapshot, ensure_ascii=False, allow_nan=False), file=sys.stderr)
    return 0 if snapshot['usage']['byEngine']['claude']['status'] == 'observed' else 2


if __name__ == '__main__':
    sys.exit(main())
