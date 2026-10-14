"""Copy-only HMAC/policy corruptions against actual API+ToolRuntime; exact restore."""
import hashlib,json,os,shutil,subprocess,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
evidence=root.parent/'evidence'

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(subject,phase):
    env=dict(os.environ,DSH_TEST_APP='/opt/coders/gamma/app',MOST_ROOT=str(subject),MARK_TEST_APP=str(root.parent/'source/app'),TELEGRAM_TEST_PLUGIN_ROOT=os.environ['TELEGRAM_TEST_PLUGIN_ROOT'])
    r=subprocess.run(['node',str(root/'test/stend-ostrov-api.mjs')],env=env,text=True,capture_output=True,timeout=30)
    (evidence/(phase+'.log')).write_text(r.stdout+r.stderr)
    return r

cycles=[]
with tempfile.TemporaryDirectory(prefix='gamma-sh4-mutations-') as tmp:
    subject=Path(tmp)/'package'
    shutil.copytree(root,subject,ignore=shutil.ignore_patterns('.git','node_modules'))
    (subject/'node_modules').symlink_to('/opt/coders/gamma/app/node_modules',target_is_directory=True)
    healthy=run(subject,'mutations-healthy');assert healthy.returncode==0
    cases=[('signature','src/ostrov_api.py',"hmac.new(self.key, signed, hashlib.sha256)","hmac.new(self.key, b'gamma-signature-fault', hashlib.sha256)")]
    for label,name,old,new in cases:
        p=subject/name;original=p.read_bytes();before=digest(p)
        assert original.count(old.encode())==1
        p.write_bytes(original.replace(old.encode(),new.encode()));after=digest(p)
        count=subprocess.check_output(['grep','-cF',new,str(p)],text=True).strip()
        assert count=='1' and before!=after
        print(f'Порча {label}: замен=1; grep -cF={count}; SHA {before} -> {after}',flush=True)
        fault=run(subject,'mutation-'+label+'-fault');assert fault.returncode==1
        if label=='signature':
            assert 'HTTP 403' in fault.stdout+fault.stderr
            for operation in ['identity','catalog','objects']:
                assert 'FAIL HTTP guest read '+operation in fault.stderr
            assert 'FAIL HTTP guest quote resident' in fault.stderr
        else:assert 'FAIL paired channel-policy' in fault.stderr
        p.write_bytes(original);assert p.read_bytes()==original and digest(p)==before
        restored=run(subject,'mutation-'+label+'-restored');assert restored.returncode==0
        cycles.append({'label':label,'file':name,'replacements':1,'fixed_count':int(count),'before':before,'after':after,'restored':digest(p),'healthy':0,'fault':fault.returncode,'restore':restored.returncode})
        print(f'{label}: 0 -> 1 -> 0; exact bytes restored',flush=True)
assert not Path(tmp).exists()
(evidence/'mutation-cycles.json').write_text(json.dumps(cycles,indent=2)+'\n')
print('Temporary mutation package removed; API/receipt fixtures cleaned in each phase.')
