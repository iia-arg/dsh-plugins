#!/usr/bin/python3
"""P5 entrypoint for the accepted transient User=autopilot-post unit only."""
import sys
sys.dont_write_bytecode = True
import argparse
import hashlib
import importlib.util
from pathlib import Path

MODULE = Path('/opt/autopilot/post/0.1.10/pilot/mail_service.py')
MODULE_SHA256 = '735befb36b553ebb1a809025df08908c43ee20c15fa13bc2be3e776ab8674f07'


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--socket', required=True, type=Path)
    parser.add_argument('--state', required=True, type=Path)
    args = parser.parse_args()
    socket, state = args.socket, args.state
    if (not socket.is_absolute() or socket.resolve() != socket or state.resolve() != state
            or not socket.is_relative_to('/var/tmp') or socket.name != 'post.sock'
            or socket.parent.name != 'run' or state != socket.parent.parent/'state'):
        parser.error('PRIVATE_SOCKET_STATE_REQUIRED')
    if MODULE.resolve() != MODULE or hashlib.sha256(MODULE.read_bytes()).hexdigest() != MODULE_SHA256:
        parser.error('INSTALLED_POSTAL_MODULE_CHANGED')
    sys.path.insert(0, str(MODULE.parent))
    spec = importlib.util.spec_from_file_location('pdry_installed_mail_service', MODULE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    # The only replaced module values; main retains production UID/NSS/TLS checks.
    m.SOCKET_PATH = str(socket)
    m.STATE_PATH = str(state)
    # Missing private config deliberately exercises main's real startup alert.
    # This does not modify the live copy configuration or any module API.
    sys.argv = [str(MODULE), '--copies', str(state.parent/'copy-disabled.json')]
    return m.main()


if __name__ == '__main__':
    sys.exit(main())
