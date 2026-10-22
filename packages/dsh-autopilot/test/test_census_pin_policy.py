"""Census/strict CLI parity and catalog admission, in private roots only.

Historical names are labels for reconstructed metadata fixtures, not a replay of
archived original state bytes and not a new machine census. Requires root, like
the existing owner/accepted-inventory fixture tests, for owner/scope metadata.
"""
import copy
import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

import test_attestation_pin as F

PKG = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PKG / 'runtime'))
import run_catalog as C


class CensusPinPolicy(unittest.TestCase):
    def setUp(self):
        self.f = F.AttestationPin()
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)

    def pair(self, expected):
        f = self.f
        accepted = f.accepted()
        census = F.A.capture(f.root, accepted=accepted)
        p = subprocess.run([sys.executable, '-I', '-B', str(PKG / 'tools/ap-run-inventory.py'),
                            'scan', '--root', str(f.root)], capture_output=True,
                           text=True, timeout=10)
        self.assertEqual(p.returncode, 0, p.stderr)
        scan = json.loads(p.stdout)
        safety = lambda v: [(r['path'], r['classification'], r['potentialProductionPin'],
                             r.get('status'), r.get('runId'), r.get('release'))
                            for r in v['records']]
        self.assertTrue(census['complete'], census['errors'])
        self.assertTrue(scan['complete'], scan['errors'])
        self.assertEqual(safety(census), safety(scan))
        row = next(r for r in census['records'] if r['path'] == str(f.state))
        self.assertEqual(row['classification'], 'canonical_run')
        self.assertIs(row['potentialProductionPin'], expected)
        self.assertEqual(sum(bool(r['potentialProductionPin']) for r in census['records']), int(expected))
        self.assertEqual(sum(r['active'] is True for r in census['runs']), int(expected))
        # Exercise the actual private bootstrap/catalog consumer, not a count-only model.
        report = f.root / 'accepted-report.json'
        report.write_text(json.dumps(census))
        base = f.root / 'var/lib/dsh-autopilot'
        C.bootstrap(base, f.root, report, hashlib.sha256(report.read_bytes()).hexdigest(),
                    window_id='fixture-policy')
        with C.Catalog(base) as catalog:
            if expected:
                with self.assertRaisesRegex(ValueError, 'LIVE_RUN_PINNED'):
                    catalog.assert_no_live_pins(f.release)
            else:
                catalog.assert_no_live_pins(f.release)
        # Never let a completed probe's private catalog influence the next phase.
        import shutil
        shutil.rmtree(base)
        return row

    def test_healthy_hidden_unfinished_damage_and_return(self):
        f = self.f
        f.write_state('2026-10-17T00:00:00Z')
        healthy = f.state.read_bytes()
        self.pair(False)
        print('HEALTHY active=0 pins=0 catalog guard permits', flush=True)
        f.write_state(None)
        probe = subprocess.run(['grep', '-cF', '"finishedAt": null', str(f.state)],
                               capture_output=True, text=True, timeout=5)
        self.assertEqual((probe.returncode, probe.stdout.strip()), (0, '1'))
        self.assertNotEqual(healthy, f.state.read_bytes())
        print('DAMAGE unfinished=1 grep-F=1 SHA before=' + F.O.digest(healthy)
              + ' after=' + F.O.digest(f.state.read_bytes()), flush=True)
        row = self.pair(True)
        print('CENSUS_PRODUCTION_PIN run=' + row['runId'] + ' path=' + row['path']
              + ' active=1 pins=1 catalog=LIVE_RUN_PINNED', flush=True)
        f.write_state('2026-10-17T00:00:00Z')
        self.assertEqual(f.state.read_bytes(), healthy)
        self.pair(False)
        print('RETURN active=0 pins=0 SHA=' + F.O.digest(healthy), flush=True)

    def test_old_accepted_waiver_refuses_even_with_valid_evidence(self):
        f = self.f
        old = f.accepted()
        row = next(r for r in old['records'] if r['path'] == str(f.state))
        row.pop('attestation')
        row.update(classification='attested_isolated_fixture', potentialProductionPin=False)
        with self.assertRaisesRegex(ValueError, 'inventory incomplete'):
            F.A.verify_fresh(old, f.root)

    def test_two_historical_names_have_two_pins_on_new_policy(self):
        fixture = json.loads((PKG / 'test/fixtures/hidden-production-9afce991.json').read_text())
        self.assertEqual(fixture['sourceCensusSha256'],
                         '9afce991f77581f08e2f79952378976bb9d2c2bd4e6c7f790b6f55a07f726545')
        f = self.f
        named = []
        for sample in fixture['records']:
            meta = copy.deepcopy(f.meta)
            meta['run_id'] = sample['runId']
            meta['project_id'] = sample['projectId']
            upstream, local = sample['release'].split('-', 1)
            meta['release'].update(upstream_sha=upstream, local_revision=local,
                                   skill_dir='/opt/autopilot/releases/' + sample['release'] + '/skill')
            f.meta = meta
            f.release = sample['release']
            f.write_state(None)
            row = self.pair(True)
            self.assertEqual(row['runId'], sample['runId'])
            self.assertEqual(row['release'], sample['release'])
            named.append(sample['path'])
            print('HISTORICAL_METADATA_FIXTURE source=' + sample['path'] + ' run=' + row['runId']
                  + ' classification=canonical_run pin=true', flush=True)
        self.assertEqual(len(named), 2)
        self.assertEqual(len(set(named)), 2)
        print('HISTORICAL_METADATA_FIXTURE old hidden pins=0 new named pins=2', flush=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
