#!/usr/bin/python3
"""Root-only disposable tmpfiles/daemon stand; never uses production queue or ExecStart path."""
import argparse,hashlib,json,os,signal,stat,subprocess,tempfile,time
from pathlib import Path
p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--config',type=Path);a=p.parse_args()
PACKAGE=Path(__file__).resolve().parents[1];config=a.config or PACKAGE/'systemd/agent-button.tmpfiles'
if os.geteuid()!=0:raise SystemExit('ROOT_REQUIRED_FOR_METADATA_STAND')
names=['.git','.codex','.agents','.aws']
with tempfile.TemporaryDirectory(prefix='stend-knopki-tmpfiles-',dir='/var/tmp') as td:
    root=Path(td);etc=root/'etc';(etc/'tmpfiles.d').mkdir(parents=True)
    (etc/'group').write_text('root:x:0:\nagent-button:x:1004:\n');(etc/'passwd').write_text('root:x:0:0:root:/root:/bin/bash\n')
    target=etc/'tmpfiles.d/agent-button.conf';target.write_bytes(config.read_bytes())
    def apply():
        r=subprocess.run(['systemd-tmpfiles','--root',str(root),'--create',str(target)],capture_output=True,text=True,timeout=10)
        assert r.returncode==0,(r.returncode,r.stderr)
    def check():
        pending=root/'var/lib/agent-button/pending';s=pending.lstat();assert (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,1004,0o3770)
        for name in names:
            s=(pending/name).lstat();assert stat.S_ISDIR(s.st_mode) and (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,0,0o755)
        return pending
    apply();pending=check();before={name:(pending/name).stat().st_ino for name in names};apply();check();assert before=={name:(pending/name).stat().st_ino for name in names}
    # Actual package daemon on its own isolated root/allowlist. No live unit is called.
    daemon=PACKAGE/'sbin/agent-button-daemon.sh';assert daemon.resolve()!=Path('/usr/local/sbin/agent-button-daemon.sh')
    conf=root/'allowed.conf';conf.write_text("ping = printf 'INERT_PING_B2088\\n'\n")
    state=root/'var/lib/agent-button';proc=subprocess.Popen(['/bin/bash',str(daemon)],env={**os.environ,'AGENT_BUTTON_ROOT':str(state),'AGENT_BUTTON_CONF':str(conf)},start_new_session=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        (pending/'b2088-inert.cmd').write_text('ping\n')
        deadline=time.monotonic()+8
        while not ((state/'done/b2088-inert.rc').exists() and (state/'processed/b2088-inert.cmd').exists()):
            if time.monotonic()>=deadline:raise AssertionError('MODEL_DAEMON_NO_RESULT_WITHIN_8S')
            time.sleep(.1)
        assert (state/'done/b2088-inert.rc').read_text()=='0\n'
        assert 'INERT_PING_B2088' in (state/'done/b2088-inert.out').read_text()
        assert (state/'processed/b2088-inert.cmd').exists();check();assert before=={name:(pending/name).stat().st_ino for name in names}
    finally:
        os.killpg(proc.pid,signal.SIGTERM)
        try:proc.communicate(timeout=3)
        except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.communicate(timeout=2)
    print(json.dumps({'scope':'disposable root only; no production unit/queue','config_sha256':hashlib.sha256(config.read_bytes()).hexdigest(),'cases':['cold-create-pending3770-and-four-root0755','second-create-keeps-four-inodes','package-daemon-ignores-four-hidden-dirs-and-executes-inert-cmd'],'passed':3,'failed':0}))
