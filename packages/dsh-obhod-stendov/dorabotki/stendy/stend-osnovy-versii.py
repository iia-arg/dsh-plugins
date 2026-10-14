#!/usr/bin/env python3
"""Run the real walker on synthetic package/exception files; success is silent."""
import argparse
import datetime
import json
import os
import pathlib
import subprocess
import sys
import tempfile

import yaml

parser = argparse.ArgumentParser()
parser.add_argument('walker', type=pathlib.Path, nargs='?',
                    default=pathlib.Path(__file__).resolve().parents[1] / 'vse-stendy-boevye.sh')
parser.add_argument('--evidence', type=pathlib.Path)
args = parser.parse_args()
walker = args.walker.resolve(strict=True)

# A missing base matcher breaks the suffix cases; a broad matcher breaks foreign bases.
# All expected verdicts below are literals, independent of the walker implementation.
cases = [
    ('healthy bare version', '1.3.28', '1.3.28', True, 3, {}),
    ('same base with b1857 suffix', '1.3.28', '1.3.28-b1857', True, 3, {}),
    ('same base with another numeric suffix', '1.3.28', '1.3.28-b9999', True, 3, {}),
    ('foreign minor base with same suffix', '1.3.28', '1.3.29-b1857', True, 1, {}),
    ('foreign major base must not use legacy renumbering', '1.3.28', '2.3.28-b1857', True, 1, {}),
    ('foreign bare major base', '1.3.28', '2.3.28', True, 1, {}),
    ('base mode blocks forward 0.3.28 to 1.3.28 renumbering', '0.3.28', '1.3.28', True, 1, {}),
    ('base mode blocks reverse 1.3.28 to 0.3.28 renumbering', '1.3.28', '0.3.28', True, 1, {}),
    ('non numeric suffix', '1.3.28', '1.3.28-bWORD', True, 1, {}),
    ('additional suffix text', '1.3.28', '1.3.28-b1857-extra', True, 1, {}),
    ('other suffix family', '1.3.28', '1.3.28-rc1', True, 1, {}),
    ('empty version is not a base', '1.3.28', '', True, 1, {}),
    ('opt in absent keeps suffix exact', '1.3.28', '1.3.28-b1857', None, 1, {}),
    ('opt in false keeps suffix exact', '1.3.28', '1.3.28-b1857', False, 1, {}),
    ('explicit suffixed entry still matches', '1.3.28-b1857', '1.3.28-b1857', None, 3, {}),
    ('explicit suffixed entry cannot match another suffix', '1.3.28-b1857', '1.3.28-b1858', None, 1, {}),
    ('base mode rejects a suffixed exception version', '1.3.28-b1857', '1.3.28-b1857', True, 1, {}),
    ('base mode rejects wildcard', '*', '1.3.28-b1857', True, 1, {}),
    ('string opt in refuses', '1.3.28', '1.3.28', 'true', 1, {}),
    ('numeric opt in refuses', '1.3.28', '1.3.28', 1, 1, {}),
    ('wildcard without opt in survives', '*', '1.3.28-b1857', None, 3, {}),
    ('legacy renumbering without opt in survives', '1.3.28', '2.3.28', None, 3, {}),
    ('another code remains unexpected', '1.3.28', '1.3.28-b1857', True, 1, {'kod': 1}),
    ('another signature remains unexpected', '1.3.28', '1.3.28-b1857', True, 1, {'priznak': 'different failure'}),
    ('another stand remains unexpected', '1.3.28', '1.3.28-b1857', True, 1, {'stend': 'pkg/stend-other.sh'}),
    ('expired exception remains unexpected', '1.3.28', '1.3.28-b1857', True, 1, {'peresmotr': '2020-01-01T00:00:00Z'}),
    ('unconfirmed reason remains unexpected', '1.3.28', '1.3.28-b1857', True, 1, {'prichina': 'no measured cause'}),
]
results = []
with tempfile.TemporaryDirectory(prefix='alfa-b1862-') as work:
    root = pathlib.Path(work)
    package = root / 'pkg'
    (package / 'test').mkdir(parents=True)
    stand = package / 'test/stend-slep.sh'
    # B-N-1987: суд по покрытию — слепая строка заглушки обязана нести маркер красной строки (KRASNAYA), как у настоящих стендов.
    stand.write_text('#!/bin/bash\necho "СЛЕПОТА: known blindness"\nexit 2\n')
    (root / 'list').write_text(str(stand) + '\n')
    for name, expected_version, actual_version, opt_in, expected_code, overrides in cases:
        (package / 'package.json').write_text(json.dumps({'name': 'pkg', 'version': actual_version}))
        record = {'stend': 'pkg/stend-slep.sh', 'vypusk': expected_version, 'kod': 2,
                  'priznak': 'known blindness', 'prichina': 'замер 2026-10-08 чем: synthetic fixture',
                  'otvetstvennyj': 'Alfa', 'peresmotr': '2099-01-01T00:00:00Z'}
        if opt_in is not None:
            record['po_osnove'] = opt_in
        record.update(overrides)
        exceptions = root / 'exceptions.yaml'
        exceptions.write_text(yaml.safe_dump({'exceptions': [record]}, allow_unicode=True))
        env = {'PATH': os.environ['PATH'], 'TMPDIR': work, 'OBLAST_STENDOV': str(package) + '/',
               'PERECHEN_STENDOV': str(root / 'list'), 'ISKLYUCHENIYA_STENDOV': str(exceptions)}
        run = subprocess.run(['bash', str(walker)], env=env, capture_output=True, text=True, timeout=15)
        output = run.stdout + run.stderr
        marker = 'ОЖИДАЕМО: pkg/stend-slep.sh' if expected_code == 3 else 'НЕОЖИДАННО: pkg/stend-slep.sh'
        passed = run.returncode == expected_code and marker in output
        results.append({'name': name, 'expectedCode': expected_code, 'actualCode': run.returncode,
                        'passed': passed, 'output': output})
        if not passed:
            print(f'FAIL {name}: walker {walker}; expected {expected_code}, got {run.returncode}; marker={marker}', file=sys.stderr)
            print(output, file=sys.stderr)
if args.evidence:
    args.evidence.write_text(json.dumps({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                        'walker': str(walker), 'cases': results}, ensure_ascii=False, indent=2) + '\n')
sys.exit(0 if all(r['passed'] for r in results) else 1)
