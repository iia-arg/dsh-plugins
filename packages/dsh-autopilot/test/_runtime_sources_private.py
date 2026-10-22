"""Root-owned source fixtures and explicit root/non-root unittest routing."""
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
import unittest

MODULES={'test_runtime_receipt_source','test_runtime_incremental'}
ROOT_POLICY_METHODS={
    'test_complete_868_byte_bad_line_passes_window_and_next_request_is_read',
    'test_overlong_line_also_drains_when_record_limit_equals_pass_limit',
    'test_policy_missing_invalid_and_return_never_read_r_without_valid_policy',
    'test_policy_unsafe_file_and_return',
}

def namespace(package):
    args=['bwrap','--die-with-parent','--unshare-pid','--unshare-net','--unshare-ipc','--unshare-uts',
          '--ro-bind','/','/','--proc','/proc','--dev','/dev',
          '--tmpfs','/run','--tmpfs','/tmp','--tmpfs','/var/lib','--tmpfs','/etc']
    for name in ('passwd','group','nsswitch.conf'):
        if Path('/etc',name).is_file():args+=['--ro-bind','/etc/'+name,'/etc/'+name]
    for cap in ('CAP_SETUID','CAP_SETGID','CAP_CHOWN','CAP_DAC_OVERRIDE','CAP_FOWNER','CAP_KILL'):
        args+=['--cap-add',cap]
    return args+['--ro-bind',str(package),str(package)]

def setup():
    assert os.geteuid()==0
    assert os.statvfs('/').f_flag & os.ST_RDONLY
    mounts={row[1]:row[2] for line in Path('/proc/mounts').read_text().splitlines()
            if (row:=line.split())[1] in ('/run','/tmp','/var/lib','/etc')}
    assert set(mounts.values())=={'tmpfs'} and len(mounts)==4,mounts
    os.chmod('/tmp',0o1777)
    Path('/run/r-normalizer-private').touch()
    os.environ['R_NORMALIZER_PRIVATE']='1'
    for file,body in [
        ('/etc/dsh-telegram-multiagent/usage-runtime-policy.json',
         dict(schemaVersion=1,fileMaxBytes=33554432,recordMaxBytes=65536)),
        ('/var/lib/autopilot-usage/codex-account-map.json',
         dict(schemaVersion=1,accounts={'a'*64:'codex-3','b'*64:'codex-4'})),
    ]:
        path=Path(file);path.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
        path.parent.chmod(0o755);path.write_text(json.dumps(body,indent=2)+'\n');path.chmod(0o644)
        assert path.stat().st_uid==0

def names(suite):
    for case in suite:
        if isinstance(case,unittest.TestSuite):yield from names(case)
        else:yield case.id()

def run_cases(selected):
    loader=unittest.TestLoader();suite=loader.loadTestsFromNames(selected)
    assert not loader.errors and suite.countTestCases()==len(selected)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    code=1 if result.failures or result.errors else 2 if result.skipped or result.expectedFailures or result.unexpectedSuccesses else 0
    return dict(code=code,run=result.testsRun,expected=len(selected),names=selected)

def private_run(module):
    setup();loader=unittest.TestLoader();suite=loader.loadTestsFromName(module)
    assert not loader.errors
    selected=list(names(suite));assert selected and len(selected)==len(set(selected))
    root=[name for name in selected if name.split('.')[-2] in ('SharedPolicy','FilePolicyReadWindow') or name.split('.')[-1] in ROOT_POLICY_METHODS]
    owner=[name for name in selected if name not in root]
    assert len(root)==(7 if module=='test_runtime_incremental' else 0)
    results=[run_cases(root)] if root else []
    who=pwd.getpwnam('coders');home=Path('/tmp/source-owner-home');home.mkdir(mode=0o700)
    os.chown(home,who.pw_uid,who.pw_gid)
    code='import sys,json;sys.path.insert(0,sys.argv.pop(1));from _runtime_sources_private import run_cases;print("SOURCE_OWNER_RESULT "+json.dumps(run_cases(sys.argv[1:])))'
    child=subprocess.run([sys.executable,'-I','-B','-c',code,str(Path(__file__).resolve().parent),*owner],
        user=who.pw_uid,group=who.pw_gid,extra_groups=[],env={**os.environ,'HOME':str(home)},capture_output=True,text=True)
    print(child.stdout+child.stderr,flush=True)
    rows=[line[len('SOURCE_OWNER_RESULT '):] for line in child.stdout.splitlines() if line.startswith('SOURCE_OWNER_RESULT ')]
    assert child.returncode==0 and len(rows)==1
    results.append(json.loads(rows[0]))
    assert sum(r['run'] for r in results)==sum(r['expected'] for r in results)==len(selected)
    assert {name for r in results for name in r['names']}==set(selected)
    result=dict(code=max(r['code'] for r in results),run=len(selected),expected=len(selected),groups=results)
    print('PRIVATE_SOURCE_RESULT '+json.dumps(result),flush=True)
    return result['code']

def main():
    if len(sys.argv)!=3 or sys.argv[1] not in MODULES or os.geteuid()!=0:raise SystemExit(2)
    module,receipt=sys.argv[1:];test=Path(__file__).resolve().parent
    code='import sys;sys.path.insert(0,sys.argv[1]);from _runtime_sources_private import private_run;sys.exit(private_run(sys.argv[2]))'
    child=subprocess.run(namespace(test.parent)+['--ro-bind',str(test.parent),'/run/runtime-source-package','--',sys.executable,'-I','-B','-c',code,'/run/runtime-source-package/test',module],capture_output=True,text=True)
    print(child.stdout+child.stderr,flush=True)
    lines=[line[len('PRIVATE_SOURCE_RESULT '):] for line in child.stdout.splitlines() if line.startswith('PRIVATE_SOURCE_RESULT ')]
    if len(lines)!=1:raise SystemExit(2)
    result=json.loads(lines[0]);assert child.returncode==result['code']
    Path(receipt).write_text(json.dumps(result))
    print('unittest: %d из %d' % (result['run'],result['expected']),flush=True)
    raise SystemExit(result['code'])

if __name__=='__main__':main()
