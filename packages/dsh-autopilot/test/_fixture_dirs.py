"""Directory creation for positive fixtures; never normalizes existing objects."""
from pathlib import Path

def fixture_mkdir(path, mode=0o755, parents=False, exist_ok=False):
    path = Path(path)
    if parents and not path.parent.exists():
        fixture_mkdir(path.parent, mode=0o755, parents=True, exist_ok=True)
    path.mkdir(mode=mode, exist_ok=exist_ok)
