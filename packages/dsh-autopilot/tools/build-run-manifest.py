#!/usr/bin/env python3
"""Build a G0 usage manifest from script-produced run records, ledger and SDK spawns.

No runId/request-ID overrides. A live AP record-source adapter is not installed here.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys

spec = importlib.util.spec_from_file_location('claude_usage', Path(__file__).with_name('measure-run-claude.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def all_rows(path, start, end):
    with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as con:
        con.row_factory = sqlite3.Row
        con.execute('PRAGMA query_only=ON')
        return [dict(r) for r in con.execute('SELECT * FROM mail_sdk_requests WHERE started_at<=? '
                     'AND (terminal_at IS NULL OR terminal_at>=?)', (end, start))]


def discover(m, rows):
    edges = []
    threads = {}
    for row in rows:
        binding = json.loads(row['binding_json'])
        row['sdk_thread_id'] = binding['sdk_thread_id']
        reader.require(isinstance(row['sdk_thread_id'], str) and
                       reader.THREAD_ID.fullmatch(row['sdk_thread_id']), 'BINDING_MISMATCH', row['request_id'])
        reader.require(row['state'] == 'terminal' and reader.integer(row['terminal_at']),
                       'REQUEST_NOT_TERMINAL', row['request_id'])
        threads.setdefault(row['sdk_thread_id'], []).append(row)
    for thread, windows in threads.items():
        path = Path(m['sdkDirectory']).resolve() / (thread + '.jsonl')
        reader.require(path.resolve().parent == Path(m['sdkDirectory']).resolve(),
                       'SDK_SOURCE_UNAVAILABLE', thread)
        before = path.stat()
        records = [json.loads(raw) for raw in path.read_bytes().splitlines()]
        reader.require(all(isinstance(record, dict) for record in records),
                       'SDK_JSON_INVALID', thread)
        after = path.stat()
        reader.require((before.st_ino, before.st_size, before.st_mtime_ns) ==
                       (after.st_ino, after.st_size, after.st_mtime_ns), 'SDK_SOURCE_CHANGED', thread)
        edges.extend(reader.spawn_edges(records, windows))
    return edges


def build(args):
    scope, root, origin = reader.load_run_record(args.record_dir)
    m = dict(schemaVersion=1, **scope, runRecord=origin, ledger=str(args.ledger.resolve()),
             sdkDirectory=str(args.sdk_dir.resolve()), children='explicit', requests=[])
    start, end = reader.utc_ms(m['startedAt']), reader.utc_ms(m['endedAt'])
    available = reader.ledger_snapshot(m, {}, lambda path: all_rows(path, start, end))
    parents = [r for r in available if (r['session_id'], r['session_created'], r['turn']) ==
               (root['sessionId'], root['sessionCreated'], root['turn'])]
    reader.require(any(r['request_id'] == root['requestId'] for r in parents),
                   'RUN_RECORD_MISMATCH', 'parent not in ledger')
    selected = {r['request_id']: r for r in parents}
    parent_ids = {r['session_id'] for r in parents}
    while True:
        edges = discover(m, list(selected.values()))
        prior = set(selected)
        for child in {e['childId'] for e in edges}:
            reader.require(child not in parent_ids, 'CHILD_GRAPH_INVALID', child)
            child_rows = [r for r in available if r['session_id'] == child]
            reader.require(child_rows, 'CHILD_LEDGER_MISSING', child)
            reader.require(len({r['session_created'] for r in child_rows}) == 1,
                           'CHILD_GRAPH_INVALID', child)
            selected.update({r['request_id']: r for r in child_rows})
        if set(selected) == prior:
            break
    for row in sorted(selected.values(), key=lambda r: (r['started_at'], r['request_id'])):
        m['requests'].append(dict(requestId=row['request_id'], sessionId=row['session_id'],
            sessionCreated=row['session_created'], turn=row['turn'],
            role='parent' if row['session_id'] in parent_ids else 'child'))
    # Validate the result against a fresh read-only snapshot; never emit a usable
    # manifest merely because discovery succeeded against an earlier copy.
    reader.verify_run_record(m)
    rows = reader.read_ledger(m, start, end, {'matchedRequests': 0})
    reader.read_sdk(m, rows, {})
    return m


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record-dir', type=Path, required=True)
    parser.add_argument('--ledger', type=Path, required=True)
    parser.add_argument('--sdk-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(build(args), ensure_ascii=False, allow_nan=False))
        return 0
    except reader.Incomplete as error:
        reason = dict(code=error.code, subject=error.subject)
    except (OSError, ValueError, TypeError, KeyError, sqlite3.Error):
        reason = dict(code='RUN_BUILD_INVALID', subject='run record/ledger/SDK')
    print(json.dumps(reason), file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
