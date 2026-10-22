"""Pure proposal for Alpha's installer; does not install or mutate source tree."""
import json
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1]


def entries(lock):
    contract = json.loads((PACKAGE/'lib/pilot-main.json').read_text())
    if lock.get('upstream_sha') != contract['upstream_sha']:
        raise ValueError('mail pilot requires pinned MAIN, not stable or unknown head')
    return {
        'pilot/pilot_mail.py': ('file', 0o644, (PACKAGE/'lib/pilot_mail.py').read_bytes()),
        'pilot/task_limits.py': ('file', 0o644, (PACKAGE/'lib/task_limits.py').read_bytes()),
        'pilot/pilot_archive.py': ('file', 0o644, (PACKAGE/'lib/pilot_archive.py').read_bytes()),
        'pilot/pilot-main.json': ('file', 0o644, (PACKAGE/'lib/pilot-main.json').read_bytes()),
        'pilot/README.md': ('file', 0o644, (PACKAGE/'README-PILOT.md').read_bytes()),
    }
