"""B-N-2068: actual s2_obertka, real scopes, exit 7 and self-SIGKILL 137.

Manual regression: sudo python3 -B test/test_s2_collect.py. No memory pressure:
the payload kills only itself. Record actual CLI arguments to catch a missing
--collect; self-SIGKILL alone does not reproduce an OOM-failed scope. Historical
failed -> collected evidence is retained in the handoff, never repeated here.
Only exact UUID names created here are cleaned, after recording observations.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import pwd
import subprocess
import tempfile
import time
import unittest
import uuid

WALKER = Path(__file__).resolve().parents[1] / 'dorabotki/vse-stendy-boevye.sh'


def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, timeout=25, **kwargs)


def state(unit):
    p = run(['systemctl', 'show', unit,
             '--property=LoadState,ActiveState,CollectMode,Result,InvocationID,Transient'])
    return dict(line.split('=', 1) for line in p.stdout.splitlines() if '=' in line)


class S2Collect(unittest.TestCase):
    def test_scope_gc_preserves_exit_output_and_caller_context(self):
        self.assertEqual(os.geteuid(), 0, 'run this manual scope regression with sudo')
        source = WALKER.read_text()
        start = source.index('s2_obertka() {')
        block = source[start:source.index('\n}\n', start)+3]
        caller = pwd.getpwnam('iskra')
        groups = sorted(set(os.getgrouplist('iskra', caller.pw_gid)))
        rows = []
        for killed in (False, True):
            with self.subTest(killed=killed), tempfile.TemporaryDirectory(prefix='bn2068-s2-', dir='/var/tmp') as td:
                root = Path(td)
                root.chmod(0o755)
                work = root/'work'
                work.mkdir()
                os.chown(work, caller.pw_uid, caller.pw_gid)
                prefix = 'bn2068-s2-'+uuid.uuid4().hex+'-'
                actual = prefix+'1.scope'
                shim = root/'sudo'
                shim.write_text('''#!/bin/bash
set -euo pipefail
[ "$1" = -n ] && [ "$2" = systemd-run ] || exit 98
shift 2
printf '%s\\0' "$@" > "$BN2068_CALLS"
exec /usr/bin/sudo -n /usr/bin/systemd-run "$@"
''')
                shim.chmod(0o755)
                payload = root/'payload.py'
                payload.write_text('''import json,os,sys
from pathlib import Path
context = dict(uid=os.getuid(), gid=os.getgid(), groups=sorted(os.getgroups()),
               umask=os.umask(0), marker=os.environ['BN2068_MARKER'],
               ns={n:os.readlink('/proc/self/ns/'+n) for n in ('mnt','net','pid')})
Path(sys.argv[1]).write_text(json.dumps(context))
print('BN2068-OUT',flush=True)
print('BN2068-ERR',file=sys.stderr,flush=True)
if sys.argv[2]=='kill': os.kill(os.getpid(), 9)
sys.exit(7)
''')
                program = root/'run.sh'
                program.write_text('set -uo pipefail\numask 027\n'
                    'S2_KAT=$1; S2_SREDA=$1/env; S2_SLEP=""; S2_PREFIKS=$2\n'
                    'S2_UID=$(id -u); S2_GID=$(id -g); S2_GRUPPY=$(id -G | tr " " ,); S2_UMASK=$(umask)\n'
                    +block+'\ns2_obertka 1 /usr/bin/python3 -B "$3" "$1/context" "$4"\n')
                try:
                    p = run(['sudo', '-n', '-u', 'iskra', 'env', '-i',
                             'PATH='+str(root)+':/usr/bin:/bin', 'BN2068_MARKER=среда-😀',
                             'BN2068_CALLS='+str(work/'calls'),
                             '/bin/bash', str(program), str(work), prefix,
                             str(payload), 'kill' if killed else 'exit'])
                    observed = state(actual)
                    deadline = time.monotonic()+5
                    while observed.get('LoadState') != 'not-found' and time.monotonic()<deadline:
                        time.sleep(.05)
                        observed = state(actual)
                    context = json.loads((work/'context').read_text())
                    row = dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                               source_sha256=hashlib.sha256(WALKER.read_bytes()).hexdigest(),
                               self_sigkill=killed, unit=actual, code=p.returncode, stdout=p.stdout,
                               stderr=p.stderr, context=context, unit_after=observed,
                               actual_arguments=(work/'calls').read_bytes().decode().split('\0')[:-1],
                               scopes=(work/'scopes').read_text(), env_mode=(work/'env').stat().st_mode & 0o777)
                    rows.append(row)
                    if os.environ.get('BN2068_EVIDENCE'):
                        Path(os.environ['BN2068_EVIDENCE']).write_text(json.dumps(rows, ensure_ascii=False, indent=2)+'\n')
                    self.assertEqual(p.returncode, 137 if killed else 7, row)
                    self.assertEqual(p.stdout, 'BN2068-OUT\n')
                    self.assertIn('BN2068-ERR\n', p.stderr)
                    self.assertEqual(context, dict(uid=caller.pw_uid, gid=caller.pw_gid, groups=groups,
                        umask=0o027, marker='среда-😀',
                        ns={n:os.readlink('/proc/self/ns/'+n) for n in ('mnt','net','pid')}))
                    self.assertEqual(row['env_mode'], 0o600)
                    self.assertEqual(row['scopes'], actual+'\n')
                    self.assertIn('--scope', row['actual_arguments'])
                    self.assertIn('--collect', row['actual_arguments'])
                    self.assertNotIn('--wait', row['actual_arguments'])
                    self.assertEqual(observed.get('LoadState'), 'not-found', row)
                finally:
                    before = state(actual)
                    if before.get('LoadState') != 'not-found':
                        self.assertEqual(before.get('Transient'), 'yes', before)
                        run(['systemctl', 'stop', '--', actual])
                        run(['systemctl', 'reset-failed', '--', actual])
                    self.assertEqual(state(actual).get('LoadState'), 'not-found')


if __name__ == '__main__':
    unittest.main(verbosity=2)
