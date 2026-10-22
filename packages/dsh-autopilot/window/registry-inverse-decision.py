"""Prove the conservative no-commit case before skipping inverse pravka; never writes registry/Git/MO."""
import argparse,grp,hashlib,json,os,re,runpy,stat,subprocess,sys,time
from pathlib import Path

def safe_file(p, *, registry=False):
    st=p.lstat()
    allowed=(st.st_gid==grp.getgrnam('agent-registry').gr_gid and stat.S_IMODE(st.st_mode)==0o664) if registry else not st.st_mode&0o022
    if not stat.S_ISREG(st.st_mode) or p.resolve()!=p or st.st_uid!=0 or not allowed:raise ValueError('unsafe evidence file: '+str(p))
    return p.read_bytes()
def sha(p, *, registry=False):return hashlib.sha256(safe_file(p,registry=registry)).hexdigest()
def history(registry):
    git=['git','--no-optional-locks','-C',str(registry.parent)]
    def g(*args):return subprocess.check_output(git+list(args),text=True,stderr=subprocess.PIPE,timeout=5).strip()
    top=Path(g('rev-parse','--show-toplevel'));log=Path(g('rev-parse','--git-path','logs/HEAD'))
    if not log.is_absolute():log=registry.parent/log
    log=Path(os.path.normpath(log));head=g('rev-parse','HEAD');ref=g('symbolic-ref','HEAD');digest=sha(log)
    if not re.fullmatch('[0-9a-f]{40}',head):raise ValueError('invalid registry Git HEAD')
    if (head,ref,digest)!=(g('rev-parse','HEAD'),g('symbolic-ref','HEAD'),sha(log)):raise ValueError('registry Git changed during observation')
    return {'repo':str(top),'head':head,'ref':ref,'head_reflog':str(log),'head_reflog_sha256':digest}
def main():
    p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--save',type=Path,required=True);p.add_argument('action',choices=['snapshot','decide']);p.add_argument('--id');p.add_argument('--state-dir',type=Path,default=Path('/var/lib/montazh-okna'));a=p.parse_args()
    st=a.save.lstat()
    if os.geteuid()!=0 or a.save.resolve()!=a.save or not stat.S_ISDIR(st.st_mode) or st.st_uid!=0 or stat.S_IMODE(st.st_mode)!=0o700:raise ValueError('unsafe private SAVE')
    prepared=json.loads(safe_file(a.save/'PREPARED.json'));registry=Path(prepared['registry']);before=prepared['registry_before_sha256'];boundary=a.save/'registry-history.before.json';boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    if not re.fullmatch('[0-9a-f]{64}',before):raise ValueError('invalid PREPARED.before SHA')
    if a.action=='snapshot':
        observed=history(registry)
        if sha(registry,registry=True)!=before or observed!=history(registry):raise ValueError('registry changed before snapshot')
        data={'registry':str(registry),'before_sha256':before,'boot_id':boot,'captured_ns':time.clock_gettime_ns(time.CLOCK_BOOTTIME),'git':observed}
        with boundary.open('x') as out:out.write(json.dumps(data,indent=2)+'\n')
        boundary.chmod(0o600);print('REGISTRY_HISTORY_CAPTURED before first SMF');return
    if not a.id or not re.fullmatch('[0-9a-f]{32}',a.id):raise ValueError('invalid window ID')
    g=runpy.run_path('/usr/local/sbin/montazh-okno',run_name='registry_history')['main'].__globals__;record=g['validate'](g['read'](a.state_dir,a.id+'.json'),a.id+'.json')
    saved=json.loads(safe_file(boundary))
    keys={'registry','before_sha256','boot_id','captured_ns','git'};gitkeys={'repo','head','ref','head_reflog','head_reflog_sha256'}
    if not isinstance(saved,dict) or set(saved)!=keys or not isinstance(saved['git'],dict) or set(saved['git'])!=gitkeys:raise ValueError('invalid boundary schema')
    oldgit=saved['git']
    if any(not isinstance(v,str) or not v for v in oldgit.values()) or not re.fullmatch('[0-9a-f]{40}',oldgit['head']) or not re.fullmatch('[0-9a-f]{64}',oldgit['head_reflog_sha256']) or not oldgit['ref'].startswith('refs/heads/') or any(not Path(oldgit[k]).is_absolute() or os.path.normpath(oldgit[k])!=oldgit[k] for k in ('repo','head_reflog')):raise ValueError('invalid Git boundary schema')
    if subprocess.run(['git','check-ref-format',oldgit['ref']],capture_output=True,timeout=5).returncode:raise ValueError('invalid Git ref boundary schema')
    if type(saved['captured_ns']) is not int:raise ValueError('invalid snapshot clock type')
    if saved['boot_id']!=boot or record['boot_id']!=boot or not 0<saved['captured_ns']<=record['opened_ns']<=time.clock_gettime_ns(time.CLOCK_BOOTTIME):raise ValueError('snapshot must precede opened_ns on same boot')
    if saved['registry']!=str(registry) or saved['before_sha256']!=before:raise ValueError('snapshot differs from PREPARED')
    current=history(registry);digest=sha(registry,registry=True)
    if current!=history(registry) or digest!=sha(registry,registry=True):raise ValueError('registry changed during decision')
    # Unchanged HEAD/ref/reflog prove no commit in this observed HEAD-history
    # since pre-open. Standard pravka commits here; other refs/objects are outside.
    proven=current==saved['git'];decision='SKIP' if digest==before and proven else 'APPLY'
    proof={'decision':decision,'window':a.id,'opened_ns':record['opened_ns'],'captured_ns':saved['captured_ns'],'current_sha256':digest,'PREPARED_before_sha256':before,'no_pravka_commit_after_open_proven':proven,'basis':'unchanged HEAD/ref/full HEAD reflog since pre-open snapshot; wall-clock Git dates unused','current_git':current}
    out=a.save/'registry-inverse-decision.json';out.write_text(json.dumps(proof,indent=2)+'\n');out.chmod(0o600);print(decision)
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as e:
        print('REGISTRY_HISTORY_UNVERIFIED: '+str(e),file=sys.stderr);raise SystemExit(2)
