"""Behavioral fixtures: real SQLite + JSONL, no mocked collector methods."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import shutil
import subprocess
import sys
import tempfile
import unittest

READER = Path(__file__).resolve().parents[1] / 'tools/measure-run-claude.py'
THREAD = '11111111-1111-4111-8111-111111111111'
CHILD_THREAD = '22222222-2222-4222-8222-222222222222'
FIELDS = ['inputTokens', 'uncachedInputTokens', 'outputTokens', 'cacheReadTokens',
          'cacheWriteTokens', 'modelCalls']


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.db = self.base / 'ledger.sqlite'
        self.sdk = self.base / 'sdk'
        _fixture_mkdir(self.sdk, mode=0o755)
        with sqlite3.connect(self.db) as con:
            con.execute('CREATE TABLE mail_sdk_requests(request_id TEXT PRIMARY KEY, '
                        'generation TEXT, session_id TEXT, session_created INTEGER, turn INTEGER, '
                        'binding_json TEXT, state TEXT, started_at INTEGER, '
                        'terminal_at INTEGER, reason TEXT)')
        self.manifest = dict(schemaVersion=1, runId='RUN-test',
                             startedAt='2026-01-01T00:00:00Z',
                             endedAt='2026-01-01T00:00:10Z', ledger=str(self.db),
                             sdkDirectory=str(self.sdk), children='explicit', requests=[])
        self.add_request('parent-request', 'parent', THREAD, 1000, 4000, 'parent')
        self.add_request('child-request', 'child', CHILD_THREAD, 2000, 5000, 'child')
        self.record = self.base / 'run-record'
        _fixture_mkdir(self.record, mode=0o755)
        self.write_record()
        # Same message has two content blocks. Last physical row wins, not max
        # timestamp nor sum; out-of-run messages must not enter the result.
        self.write_rows(THREAD, [self.row(THREAD, 'outside', 500, 900, 900, 900, 900),
                                self.row(THREAD, 'm1', 3000, 2, 100, 7, 11),
                                self.row(THREAD, 'm1', 2500, 2, 5, 7, 11),
                                self.row(THREAD, 'unrelated', 6000, 900, 900, 900, 900),
                                *self.spawn_rows()])
        self.write_rows(CHILD_THREAD, [self.row(CHILD_THREAD, 'm1', 3000, 3, 13, 17, 19)])

    def write_record(self, end='2026-01-01T00:00:10Z'):
        (self.record / 'pusk.json').write_text(json.dumps(dict(
            run_id='RUN-test', t0='2026-01-01T00:00:00Z', end=end)))
        (self.record / 'g0-book.json').write_text(json.dumps(dict(parent_before=dict(
            request=dict(request_id='parent-request', session_id='parent',
                         session_created=123, turn=1)))))
        self.manifest['runRecord'] = dict(kind='g0-fixture-v1', directory=str(self.record),
            puskSha256=hashlib.sha256((self.record / 'pusk.json').read_bytes()).hexdigest(),
            bookSha256=hashlib.sha256((self.record / 'g0-book.json').read_bytes()).hexdigest())

    def spawn_rows(self, child='child', use_id='tool-spawn', zero=False):
        return [dict(type='assistant', sessionId=THREAD, timestamp='2026-01-01T00:00:01.500Z',
                     message=dict(id='m1', usage=dict(input_tokens=0 if zero else 2,
                                  output_tokens=0 if zero else 5, cache_read_input_tokens=0 if zero else 7,
                                  cache_creation_input_tokens=0 if zero else 11),
                                  content=[dict(type='tool_use', id=use_id,
                                  name='mcp__sovadsh__subagent', input={'run_in_background': True})])),
                dict(type='user', sessionId=THREAD, timestamp='2026-01-01T00:00:02.500Z',
                     message=dict(content=[dict(type='tool_result', tool_use_id=use_id,
                        content=[dict(type='text', text=json.dumps(dict(isError=False,
                                  value=dict(kind='continuable', subagentId=child))))])]))]

    def add_request(self, rid, session, thread, start, end, role):
        self.manifest['requests'].append(dict(requestId=rid, sessionId=session,
                                              sessionCreated=123, turn=1, role=role))
        binding = dict(request_id=rid, generation='g', session_id=session,
                       session_created=123, turn=1, sdk_thread_id=thread,
                       sdk_turn_id='sdk-' + rid, sdk_generation='sdk-generation',
                       ledger_uuid='ledger', recipient='sova')
        with sqlite3.connect(self.db) as con:
            con.execute('INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?,?,?,?)',
                        (rid, 'g', session, 123, 1, json.dumps(binding), 'terminal',
                         1767225600000 + start, 1767225600000 + end, 'completed'))

    def row(self, thread, mid, ms, cold, out, read, write):
        return dict(type='assistant', sessionId=thread,
                    timestamp=f'2026-01-01T00:00:{ms//1000:02}.{ms%1000:03}Z',
                    message=dict(id=mid, model='claude-test', role='assistant',
                                 usage=dict(input_tokens=cold, output_tokens=out,
                                            cache_read_input_tokens=read,
                                            cache_creation_input_tokens=write,
                                            output_tokens_details={'thinking_tokens': 999})))

    def write_rows(self, thread, rows):
        (self.sdk / (thread + '.jsonl')).write_text(
            ''.join(json.dumps(r) + '\n' for r in rows))

    def run_reader(self):
        path = self.base / 'manifest.json'
        path.write_text(json.dumps(self.manifest))
        result = subprocess.run([sys.executable, '-B', str(READER), '--manifest', str(path), '--details'],
                                capture_output=True, text=True)
        self.assertTrue(result.stdout.strip(), result.stderr)
        json.loads(result.stdout)
        snapshot = json.loads(result.stderr)
        return result, snapshot['usage'], snapshot['usage']['byEngine']['claude']

    def assert_unknown(self, result, engine, reason):
        self.assertEqual(result.returncode, 2)
        self.assertIn(engine['status'], ['partial', 'unavailable'])
        self.assertTrue(all(engine[k] is None for k in FIELDS), engine)
        self.assertIn(reason, [x['code'] for x in engine['coverage']['missing']])

    def test_dedup_last_line_scope_child_and_no_thinking_double_count(self):
        r, usage, e = self.run_reader()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual([e[k] for k in FIELDS], [59, 5, 18, 24, 30, 2])
        self.assertEqual(e['status'], 'observed')
        self.assertEqual(usage['runId'], 'RUN-test')
        self.assertEqual(e['coverage']['expectedRequests'], 2)
        self.assertEqual(e['coverage']['matchedRequests'], 2)
        self.assertFalse(e['coverage']['providerBillingCompleteness'])
        self.assertNotIn('codex', usage['byEngine'])

    def test_missing_child_source_is_unknown_not_parent_only(self):
        (self.sdk / (CHILD_THREAD + '.jsonl')).unlink()
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'SDK_SOURCE_UNAVAILABLE')

    def test_missing_usage_field_is_unknown_not_zero(self):
        row = self.row(CHILD_THREAD, 'm1', 3000, 3, 13, 17, 19)
        del row['message']['usage']['cache_creation_input_tokens']
        self.write_rows(CHILD_THREAD, [row])
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'USAGE_INVALID')

    def test_wrong_ledger_binding_refuses_attribution(self):
        with sqlite3.connect(self.db) as c:
            binding = json.loads(c.execute('SELECT binding_json FROM mail_sdk_requests '
                                           'WHERE request_id=?', ('child-request',)).fetchone()[0])
            binding['session_id'] = 'foreign'
            c.execute('UPDATE mail_sdk_requests SET binding_json=? WHERE request_id=?',
                      (json.dumps(binding), 'child-request'))
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'BINDING_MISMATCH')
        self.assertEqual(e['coverage']['matchedRequests'], 1)

    def test_missing_request_does_not_create_empty_ledger(self):
        self.manifest['ledger'] = str(self.base / 'absent.sqlite')
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'LEDGER_UNAVAILABLE')
        self.assertFalse((self.base / 'absent.sqlite').exists())

    def test_undeclared_request_in_same_turn_refuses_silent_omission(self):
        self.add_request('continuation', 'parent', THREAD, 6000, 8000, 'parent')
        self.manifest['requests'].pop()
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'REQUEST_SET_INCOMPLETE')

    def test_terminal_outside_run_window_refuses_truncation(self):
        self.manifest['endedAt'] = '2026-01-01T00:00:04Z'
        self.write_record(end='2026-01-01T00:00:04Z')
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'REQUEST_OUTSIDE_WINDOW')

    def test_overlapping_sdk_requests_refuse_ambiguous_time_attribution(self):
        self.add_request('overlap', 'other', THREAD, 3000, 6000, 'child')
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'SDK_INTERVAL_OVERLAP')

    def test_ready_request_is_incomplete(self):
        with sqlite3.connect(self.db) as c:
            c.execute("UPDATE mail_sdk_requests SET state='ready', terminal_at=NULL "
                      "WHERE request_id='child-request'")
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'REQUEST_NOT_TERMINAL')

    def test_bad_jsonl_is_not_silently_skipped(self):
        with (self.sdk / (THREAD + '.jsonl')).open('a') as f:
            f.write('{broken\n')
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'SDK_JSON_INVALID')

    def test_child_exclusion_is_explicit(self):
        self.manifest['children'] = 'excluded'
        self.manifest['requests'].pop()
        r, _, e = self.run_reader()
        self.assertEqual(r.returncode, 0)
        self.assertEqual(e['coverage']['children'], 'excluded')
        self.assertEqual(e['modelCalls'], 1)
        self.assertEqual(e['outputTokens'], 5)

    def test_noninteger_or_negative_usage_refuses(self):
        for bad in [True, -1, 1.5, '4', None]:
            with self.subTest(value=bad):
                row = self.row(CHILD_THREAD, 'm1', 3000, 3, bad, 17, 19)
                self.write_rows(CHILD_THREAD, [row])
                r, _, e = self.run_reader()
                self.assert_unknown(r, e, 'USAGE_INVALID')

    def test_zero_is_a_measured_value(self):
        self.write_rows(THREAD, [self.row(THREAD, 'm1', 3000, 0, 0, 0, 0), *self.spawn_rows(zero=True)])
        self.write_rows(CHILD_THREAD, [self.row(CHILD_THREAD, 'm', 3000, 0, 0, 0, 0)])
        r, _, e = self.run_reader()
        self.assertEqual(r.returncode, 0)
        self.assertEqual([e[k] for k in FIELDS], [0, 0, 0, 0, 0, 2])

    def test_no_assistant_usage_is_unknown(self):
        self.write_rows(CHILD_THREAD, [{'type': 'system', 'message': 'no usage'}])
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'REQUEST_USAGE_MISSING')

    def test_duplicate_request_manifest_refuses_double_count(self):
        self.manifest['requests'].append(copy.deepcopy(self.manifest['requests'][0]))
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'MANIFEST_INVALID')

    def test_corrupt_ledger_schema_returns_unknown_json(self):
        with sqlite3.connect(self.db) as c:
            c.execute('ALTER TABLE mail_sdk_requests DROP COLUMN reason')
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'LEDGER_INVALID')

    def test_last_message_update_after_terminal_refuses_stale_usage(self):
        with (self.sdk / (THREAD + '.jsonl')).open('a') as f:
            f.write(json.dumps(self.row(THREAD, 'm1', 4500, 2, 99, 7, 11)) + '\n')
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'MESSAGE_OUTSIDE_INTERVAL')

    def test_wal_source_is_read_without_creating_shm_or_changing_wal(self):
        # Real WAL fixture: main DB lacks the committed update until WAL replay.
        staged = self.base / 'staged.sqlite'
        with sqlite3.connect(self.db) as source, sqlite3.connect(staged) as c:
            source.backup(c)
        c = sqlite3.connect(staged)
        try:
            c.execute('PRAGMA journal_mode=WAL')
            c.execute("UPDATE mail_sdk_requests SET reason='interrupted' "
                      "WHERE request_id='child-request'")
            c.commit()
            shutil.copyfile(staged, self.db)
            shutil.copyfile(str(staged) + '-wal', str(self.db) + '-wal')
        finally:
            c.close()
        before = {p.name: p.read_bytes() for p in self.base.glob('ledger.sqlite*')}
        r, _, e = self.run_reader()
        self.assertEqual(r.returncode, 0)
        self.assertEqual(e['coverage']['interruptedRequests'], 1)
        after = {p.name: p.read_bytes() for p in self.base.glob('ledger.sqlite*')}
        self.assertEqual(before, after)
        alias = self.base / 'alias.sqlite'
        alias.symlink_to(self.db)
        self.manifest['ledger'] = str(alias)
        r, _, e = self.run_reader()
        self.assertEqual(r.returncode, 0)
        self.assertEqual(e['coverage']['interruptedRequests'], 1)

    def test_frozen_writer_contract_is_flat_and_hides_private_identifiers(self):
        r, _, _ = self.run_reader()
        snapshot = json.loads(r.stdout)
        self.assertEqual(set(snapshot), {'schemaVersion', 'runId', 'byEngine'})
        self.assertEqual(set(snapshot['byEngine']), {'claude'})
        e = snapshot['byEngine']['claude']
        self.assertEqual(set(e), set(FIELDS + ['status', 'measuredAt', 'windowStart',
                                              'windowEnd', 'coverage', 'scope', 'source']))
        self.assertEqual(e['status'], 'observed')
        self.assertEqual(e['coverage'], 'declared_parent_and_children')
        self.assertEqual(e['scope'], 'declared_requests')
        self.assertEqual(e['windowStart'], '2026-01-01T00:00:00Z')
        self.assertNotIn(str(self.base), r.stdout)
        self.assertNotIn('parent-request', r.stdout)
        (self.sdk / (CHILD_THREAD + '.jsonl')).unlink()
        r, _, _ = self.run_reader()
        e = json.loads(r.stdout)['byEngine']['claude']
        self.assertEqual(e['status'], 'incomplete')
        self.assertEqual(e['coverage'], 'incomplete')
        self.assertTrue(all(e[k] is None for k in FIELDS))

    def test_future_window_is_not_claimed_observed(self):
        self.manifest['endedAt'] = '2099-01-01T00:00:00Z'
        self.write_record(end='2099-01-01T00:00:00Z')
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'WINDOW_NOT_FINISHED')

    def test_unsafe_javascript_integer_is_not_exported(self):
        self.write_rows(CHILD_THREAD,
                        [self.row(CHILD_THREAD, 'm', 3000, 2**53, 1, 0, 0)])
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'USAGE_INVALID')

    def test_unlisted_spawned_child_is_incomplete(self):
        self.manifest['requests'].pop()
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'UNLISTED_CHILD')

    def test_declared_child_without_spawn_is_incomplete(self):
        rows=[self.row(THREAD, 'm1', 3000, 2, 5, 7, 11)]
        self.write_rows(THREAD, rows)
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'CHILD_WITHOUT_SPAWN')

    def test_spawn_pairs_are_matched_by_id_not_adjacent_lines(self):
        use, result = self.spawn_rows()
        self.write_rows(THREAD, [result, self.row(THREAD, 'm1', 3000, 2, 5, 7, 11), use])
        r, _, e = self.run_reader()
        self.assertEqual(r.returncode, 0)
        self.assertEqual(e['modelCalls'], 2)

    def test_unmatched_spawn_is_incomplete(self):
        use, result = self.spawn_rows()
        result['message']['content'][0]['tool_use_id'] = 'foreign-id'
        self.write_rows(THREAD, [self.row(THREAD, 'm1', 3000, 2, 5, 7, 11), use, result])
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'SPAWN_RESULT_MISSING')

    def test_one_shot_or_unknown_spawn_result_is_not_claimed_complete(self):
        use, result = self.spawn_rows()
        result['message']['content'][0]['content'][0]['text'] = json.dumps(
            dict(isError=False, value=dict(kind='one-shot', output='finished')))
        self.write_rows(THREAD, [self.row(THREAD, 'm1', 3000, 2, 5, 7, 11), use, result])
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'SPAWN_RESULT_UNVERIFIED')

    def test_missing_run_record_never_yields_observed(self):
        del self.manifest['runRecord']
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'RUN_RECORD_REQUIRED')

    def test_run_id_cannot_be_relabelled_by_manifest(self):
        self.manifest['runId'] = 'DIFFERENT-RUN'
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'RUN_RECORD_MISMATCH')

    def test_builder_derives_requests_from_record_ledger_and_spawn(self):
        builder = READER.parent / 'build-run-manifest.py'
        r = subprocess.run([sys.executable, '-B', str(builder), '--record-dir', str(self.record),
                            '--ledger', str(self.db), '--sdk-dir', str(self.sdk)],
                           text=True, capture_output=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        m = json.loads(r.stdout)
        self.assertEqual(m['runId'], 'RUN-test')
        self.assertEqual({i['requestId'] for i in m['requests']},
                         {'parent-request', 'child-request'})
        self.manifest = m
        r, _, e = self.run_reader()
        self.assertEqual(r.returncode, 0)
        self.assertEqual(e['modelCalls'], 2)

    def test_unlisted_grandchild_is_incomplete(self):
        use, result = self.spawn_rows(child='grandchild', use_id='tool-grandchild')
        for r in (use, result):
            r['sessionId'] = CHILD_THREAD
            r['timestamp'] = '2026-01-01T00:00:03.500Z'
        self.write_rows(CHILD_THREAD, [self.row(CHILD_THREAD, 'm1', 3000, 3, 13, 17, 19),
                                      use, result])
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'UNLISTED_CHILD')

    def test_child_later_turn_cannot_be_omitted(self):
        self.add_request('child-later', 'child', CHILD_THREAD, 6000, 8000, 'child')
        with sqlite3.connect(self.db) as con:
            b=json.loads(con.execute("SELECT binding_json FROM mail_sdk_requests WHERE request_id='child-later'").fetchone()[0])
            b['turn']=2
            con.execute("UPDATE mail_sdk_requests SET turn=2,binding_json=? WHERE request_id='child-later'", (json.dumps(b),))
        self.manifest['requests'].pop()
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'REQUEST_SET_INCOMPLETE')

    def test_other_spawn_tool_cannot_silently_claim_completeness(self):
        for name in ['Agent', 'Task', 'subagent', 'spawn_agent', 'mcp__other__subagent']:
            with self.subTest(tool=name):
                unsupported, _ = self.spawn_rows(use_id='other-tool')
                unsupported['message']['content'][0]['name'] = name
                self.write_rows(THREAD, [self.row(THREAD, 'm1', 3000, 2, 5, 7, 11),
                                        *self.spawn_rows(), unsupported])
                r, _, e = self.run_reader()
                self.assert_unknown(r, e, 'SPAWN_TOOL_UNSUPPORTED')

    def test_child_session_id_reused_in_another_incarnation_is_ambiguous(self):
        thread = '33333333-3333-4333-8333-333333333333'
        self.add_request('reused-child', 'child', thread, 6000, 8000, 'child')
        with sqlite3.connect(self.db) as con:
            b=json.loads(con.execute("SELECT binding_json FROM mail_sdk_requests WHERE request_id='reused-child'").fetchone()[0])
            b['session_created']=456
            con.execute("UPDATE mail_sdk_requests SET session_created=456,binding_json=? WHERE request_id='reused-child'", (json.dumps(b),))
        self.write_rows(thread, [self.row(thread, 'other-incarnation', 7000, 100, 100, 100, 100)])
        self.manifest['requests'].pop()
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'CHILD_GRAPH_INVALID')

    def test_conflicting_tool_id_in_another_message_is_not_a_duplicate_block(self):
        use, result = self.spawn_rows()
        conflict = copy.deepcopy(use)
        conflict['message']['id'] = 'different-model-message'
        conflict['message']['content'][0]['input'] = {'run_in_background': False}
        conflict['timestamp'] = '2026-01-01T00:00:03.000Z'
        self.write_rows(THREAD, [self.row(THREAD, 'm1', 3000, 2, 5, 7, 11), use, result, conflict])
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'SPAWN_RESULT_AMBIGUOUS')

    def test_builder_nonobject_sdk_json_returns_named_failure(self):
        with (self.sdk / (THREAD + '.jsonl')).open('a') as f:
            f.write('42\n')
        builder = READER.parent / 'build-run-manifest.py'
        r = subprocess.run([sys.executable, '-B', str(builder), '--record-dir', str(self.record),
                            '--ledger', str(self.db), '--sdk-dir', str(self.sdk)],
                           text=True, capture_output=True)
        self.assertEqual(r.returncode, 2)
        self.assertFalse(r.stdout)
        self.assertEqual(json.loads(r.stderr)['code'], 'SDK_JSON_INVALID')

    def test_spawn_roles_must_be_assistant_use_and_user_result(self):
        use, result = self.spawn_rows()
        use['type'] = 'user'
        result['type'] = 'assistant'
        result['message'].update(id='forged-role-message', usage=dict(
            input_tokens=0, output_tokens=0, cache_read_input_tokens=0, cache_creation_input_tokens=0))
        self.write_rows(THREAD, [self.row(THREAD, 'm1', 3000, 2, 5, 7, 11), use, result])
        r, _, e = self.run_reader()
        self.assert_unknown(r, e, 'SPAWN_ROLE_MISMATCH')


if __name__ == '__main__':
    unittest.main()
