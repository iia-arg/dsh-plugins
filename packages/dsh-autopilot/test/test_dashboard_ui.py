"""Real index renderer and inline dashboard: outcome, navigation, time provenance."""
import importlib.util
import hashlib
import json
import os
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import tempfile
import unittest

PACKAGE = Path(__file__).resolve().parents[1]
TEMPLATE = PACKAGE / 'overlay/phases/dashboard-template.html'
spec = importlib.util.spec_from_file_location('ui_sadik', PACKAGE / 'runtime/ap_sadik.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
NOW = datetime(2026, 10, 17, 12, tzinfo=timezone.utc)
PATH = 'a' * 32 + '/' + 'b' * 32


def state(**updates):
    return dict(dict(title='Проверка панели', slug='ui', startedAt='2026-10-17T08:00:00Z',
                     updatedAt='2026-10-17T10:00:00Z', finishedAt='2026-10-17T10:00:00Z'), **updates)


def dashboard(data, **options):
    source = TEMPLATE.read_text()
    prefix, tail = source.split('/*STATE-BEGIN*/')
    _, suffix = tail.split('/*STATE-END*/')
    page = prefix + 'window.STATE=' + json.dumps(data) + ';' + suffix
    with tempfile.TemporaryDirectory() as tmp:
        file = Path(tmp) / 'dashboard.html'
        file.write_text(page)
        result = subprocess.run(['node', str(PACKAGE / 'test/render-dashboard.cjs'), str(file), 'ru',
                                 json.dumps(options)], capture_output=True, text=True, check=True)
    rendered = json.loads(result.stdout)
    if rendered['errors']:
        raise AssertionError(rendered['errors'])
    return rendered['html']


class DashboardUI(unittest.TestCase):
    def setUp(self):
        # peer_state refuses group-writable run dirs; the stand runs this module as master (umask 0002)
        self.addCleanup(os.umask, os.umask(0o022))

    def test_index_path_and_hint_remain_data_not_markup(self):
        class Elements(HTMLParser):
            def __init__(self):
                super().__init__()
                self.tags = []
                self.text = []
            def handle_starttag(self, tag, attrs):
                self.tags.append((tag, dict(attrs)))
            def handle_data(self, data):
                self.text.append(data)
        payload = '\"><script>'
        for field in ('path', 'hint'):
            with self.subTest(field=field):
                row = ap.index_row(PATH, {}, state(), None, NOW)
                row[field] = payload
                parser = Elements()
                parser.feed(ap.render_index([row], TEMPLATE.read_text(), 'master', NOW))
                self.assertFalse(any(tag == 'script' for tag, _ in parser.tags))
                anchors = [attrs for tag, attrs in parser.tags if tag == 'a']
                self.assertEqual(len(anchors), 1)
                self.assertEqual(anchors[0]['href'], row['path'] + '/dashboard.html')
                if field == 'hint':
                    self.assertIn(payload, parser.text)

    def test_publish_survives_corrupt_peer_and_recovers(self):
        # Exercise the actual publisher, including its peer reader; never a live tree.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / 'private'; src.mkdir(mode=0o700)
            phases = root / 'release/phases'; phases.mkdir(parents=True)
            (phases / 'dashboard-template.html').write_bytes(TEMPLATE.read_bytes())
            public = root / 'public'; agent = public / 'master'; agent.mkdir(parents=True); agent.chmod(0o2750)
            peer = agent / PATH; peer.mkdir(parents=True)
            good = b'window.STATE={"title":"Peer intact"}'
            target = peer / 'state.js'; target.write_bytes(good)
            (agent / 'index.json').write_text(json.dumps({PATH: {'title': 'Peer intact'}}))
            data = state(_sadik={'agent': 'master', 'project_id': 'c' * 32, 'run_id': 'd' * 32,
                                'public_root': str(public), 'release': {'skill_dir': str(phases.parent)}})
            encoded = json.dumps(data)
            (src / 'state.js').write_text('window.STATE=' + encoded)
            (src / 'dashboard.html').write_text('/*STATE-BEGIN*/window.STATE=' + encoded + ';/*STATE-END*/')
            ap.publish(src)
            healthy = (agent / 'index.html').read_text()
            self.assertNotIn('JSONDecodeError', healthy)
            # Linux permits these characters in a directory name; publish must not.
            bad_path = 'peer\"><script>/run'
            bad_peer = agent / bad_path; bad_peer.mkdir(parents=True)
            (bad_peer / 'state.js').write_bytes(good)
            index = agent / 'index.json'; original_index = index.read_bytes()
            data_index = json.loads(original_index)
            data_index[bad_path] = {'title': 'Injected path'}
            index.write_text(json.dumps(data_index))
            self.assertTrue((bad_peer / 'state.js').is_file())
            self.assertEqual(index.read_text().count('<script>'), 1)
            self.assertNotEqual(hashlib.sha256(original_index).digest(), hashlib.sha256(index.read_bytes()).digest())
            print('DAMAGE index path', bad_path, 'marker=1', hashlib.sha256(original_index).hexdigest(), '->', hashlib.sha256(index.read_bytes()).hexdigest())
            with self.assertRaisesRegex(ap.Refusal, 'негодная ссылка в индексе'):
                ap.publish(src)
            self.assertEqual((agent / 'index.html').read_text(), healthy)
            index.write_bytes(original_index)
            ap.publish(src)
            self.assertNotIn('Injected path', (agent / 'index.html').read_text())
            self.assertEqual(index.read_bytes(), original_index)
            print('RESTORED index', hashlib.sha256(index.read_bytes()).hexdigest())
            damaged = b'window.STATE={BROKEN-STATE'
            target.write_bytes(damaged)
            self.assertEqual(target.read_bytes().count(b'BROKEN-STATE'), 1)
            self.assertNotEqual(hashlib.sha256(good).digest(), hashlib.sha256(target.read_bytes()).digest())
            print('DAMAGE', target, 'marker=1', hashlib.sha256(good).hexdigest(), '->', hashlib.sha256(damaged).hexdigest())
            ap.publish(src)
            broken = (agent / 'index.html').read_text()
            self.assertIn('JSONDecodeError', broken)
            self.assertIn('Проверка панели', broken)
            self.assertIn('Peer intact', broken)
            target.write_bytes(good)
            ap.publish(src)
            self.assertNotIn('JSONDecodeError', (agent / 'index.html').read_text())
            self.assertEqual(target.read_bytes(), good)
            print('RESTORED', target, hashlib.sha256(target.read_bytes()).hexdigest())

    def test_abandoned_is_not_success_in_both_views(self):
        data = state(result='ABANDONED/POLICY_PRODUCTION_DENIED')
        row = ap.index_row(PATH, {}, data, None, NOW)
        page = ap.render_index([row], TEMPLATE.read_text(), 'master', NOW)
        self.assertIn('Прогон оставлен', page)
        self.assertNotIn('p-done', page.split('<tbody>')[1])
        detail = dashboard(data)
        self.assertIn('Прогон оставлен', detail)
        self.assertNotIn('hero won', detail)
        self.assertNotIn('Сборка сдана', detail)
        self.assertIn('Результат не принят', detail)

    def test_success_still_has_success_state(self):
        self.assertIn('hero won', dashboard(state(result='Готово')))
        self.assertEqual(ap.run_status(state()), ('Сдано', 'p-done'))

    def test_browser_only_marks_are_disclosed(self):
        data = state()
        clean = dashboard(data)
        local = dashboard(data, storage={'autopilot-beats:ui:2026-10-17T08:00:00Z':
                                        '["2026-10-17T09:00:00Z"]'})
        self.assertNotIn('учтены дополнительные метки этого браузера', clean)
        self.assertIn('учтены дополнительные метки этого браузера', local)
        self.assertIn('45 минут', clean)

    def test_back_link_only_on_public_run_route(self):
        self.assertIn('href="../../"', dashboard(state(), pathname='/master/' + PATH + '/dashboard.html'))
        self.assertNotIn('href="../../"', dashboard(state(), pathname='/dashboard.html'))

    def test_empty_list_and_missing_fields_are_explicit(self):
        self.assertIn('Заданий пока нет', ap.render_index([], TEMPLATE.read_text(), 'master', NOW))
        row = ap.index_row(PATH, {}, {'title': 'Без полей'}, None, NOW)
        page = ap.render_index([row], TEMPLATE.read_text(), 'master', NOW)
        self.assertIn('не измерено', page)
        self.assertIn('Без полей', page)
        self.assertIn('>—<', page)
        self.assertNotIn('undefined', dashboard({'title': 'Без полей'}))

    def test_error_row_preserves_other_rows_and_escapes_content(self):
        title = '<img src=x onerror=alert(1)>'
        rows = [ap.index_row(PATH, {}, state(), None, NOW),
                ap.index_row('c/d', {'title': title}, None, 'JSONDecodeError', NOW)]
        page = ap.render_index(rows, TEMPLATE.read_text(), 'master', NOW)
        body = page.split('<tbody>')[1]
        self.assertIn('Проверка панели', body)
        self.assertIn('JSONDecodeError', body)
        self.assertNotIn('<img', body)
        self.assertIn('&lt;img', body)


if __name__ == '__main__':
    unittest.main(verbosity=2)
