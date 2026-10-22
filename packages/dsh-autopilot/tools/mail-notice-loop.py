#!/usr/bin/env python3
"""ID-only AP notices; five-second polling without a systemd start per poll."""
import argparse
from pathlib import Path
import signal
import sys
import threading
import time

POSTAL = Path('/opt/autopilot/post/0.1.10/pilot')
POLL_SECONDS = 5


def run_loop(client, directory, stop):
    delay = POLL_SECONDS
    previous_error = None
    while not stop.is_set():
        started = time.monotonic()
        try:
            client.notice(directory)
        except (ValueError, OSError, KeyError, UnicodeError) as error:
            detail = str(error)[:200].replace('\n', '\\n').replace('\r', '\\r')
            message = 'SOURCE_UNVERIFIED_OR_UNAVAILABLE ' + type(error).__name__ + ': ' + detail
            if message != previous_error:
                print(message, file=sys.stderr, flush=True)
                previous_error = message
            stop.wait(delay)
            delay = min(delay * 2, 60)
        else:
            delay = POLL_SECONDS
            previous_error = None
            stop.wait(max(0, POLL_SECONDS - (time.monotonic() - started)))


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--directory', required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(POSTAL))
    from mail_client import MailClient
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    run_loop(MailClient(), args.directory, stop)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
