"""Offline postal layout: self-contained runtime and an explicit package CORE list."""
import hashlib
import json
import os
import re
import stat
from pathlib import Path

PACKAGE=Path(__file__).resolve().parents[1]
RUNTIME='/opt/autopilot/post/0.1.10'


def entries():
    paths={'bin/autopilot-mail':('lib/autopilot-mail',0o755),
      'doc/README-CORE.md':('README-CORE.md',0o644),
      'source-lock.json':('source-lock.json',0o644)}
    for name in ['task_limits.py','pilot_mail.py','pilot_archive.py','pilot_transport.py','mail_service.py','mail_client.py','mail_registration.py','prune_registration_queue.py','mail_retention.py','mail_failure.py','mail_copies.py','mail_copy_worker.py','pilot-main.json']:
        paths['pilot/'+name]=('lib/'+name,0o644)
    for f in (PACKAGE/'systemd').glob('*'):
        if f.is_file():paths['units/'+f.name]=('systemd/'+f.name,0o644)
    return {name:('file',mode,(PACKAGE/source).read_bytes()) for name,(source,mode) in paths.items()}


def manifest(*,runtime_files=None,runtime_root=None):
    core=[];metadata=[]
    for f in sorted(PACKAGE.rglob('*')):
        if not f.is_file() or '__pycache__' in f.parts:continue
        name=f.relative_to(PACKAGE).as_posix()
        if name=='MAIL-LAYOUT.json':continue
        row={'source':name,'mode':0o755 if f.stat().st_mode&0o111 else 0o644,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
        part=name.split('/')[0]
        if part in {'lib','test','systemd','config','skill','overlay','runtime','checks','tools','razdacha','vendor','patches'} or name in {'install.sh','source-lock.json','part-b-lock.json'}:
            row['category']='CORE';core.append(row)
        else:row['category']='METADATA';metadata.append(row)
    runtime_root=RUNTIME if runtime_root is None else runtime_root
    layout=entries() if runtime_files is None else runtime_files
    rows=[{'target':runtime_root+'/'+name,'mode':mode,'uid':0,'gid':0,'sha256':hashlib.sha256(body).hexdigest()} for name,(_,mode,body) in sorted(layout.items())]
    # Preserve the accepted postal-manifest baseline. AP package ancestry is
    # recorded by Git/P7; this descriptive field does not select runtime paths.
    return {'schema':1,'package':'dsh-autopilot','version':'0.1.14','base':'32a6353dcbc81fc0ab5b7253bea9c59fbe417b17',
      'part':'AP 0.1.14 end-of-run; postal runtime stays 0.1.10',
      'runtime_root':runtime_root,'runtime_directory_mode':0o755,'runtime_directory_uid':0,'runtime_directory_gid':0,'runtime_files':rows,'package_core':core,'package_metadata':metadata,
      'core_digest':hashlib.sha256(json.dumps(core,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
      'links':[{'target':'/usr/local/bin/autopilot-mail','value':runtime_root+'/bin/autopilot-mail','uid':0,'gid':0,'backup_previous':True}],
      'config':[{'source':'config/copy.example.json','target':'/etc/autopilot-mail/copy.json','mode':0o644,'operation':'example only; coordinator replaces fixture bot IDs and accepts per-agent flags before activation'},
                {'source':'config/retention.json','target':'/etc/autopilot-mail/retention.json','mode':0o644},
                {'source':'config/dsh-trevogi-spul-acl.conf','target':'/etc/tmpfiles.d/dsh-trevogi-spul-acl.conf','mode':0o644,'operation':'preserve previous rules; append autopilot-post rules; recheck live base hash before mount'}],
      'system_units':[{'source':'systemd/'+f.name,'target':'/etc/systemd/system/'+f.name} for f in sorted((PACKAGE/'systemd').glob('*')) if f.is_file()],
      'preconditions':['AP 0.1.14 release window: OPEN=0 in accounting index.json; schemaVersion4 receipt and visible unknown-version renderer; see window/LIST-P-0.1.12.md',
        'AP-only window: post/0.1.10 is not rewritten; compare22 existing postal files before/after and retain their actual accepted rows in installed_check public manifest, not this raw MAIL-LAYOUT',
        'AP reader before separate gateway1e899dc5; actual-subscription canary and both compatibility checks before ordinary workload',
        'AP-011 0.1.1 mounted/tagged before postal mount','create distinct autopilot-post user/group; autopilot-mail members TEAM/service only',
        'initial TLS deployment only: provision root-owned server.pem0644 and service-owned server.key0600 nlink1 with synchronized server/client cutover; no private key in package',
        'AP010 queue pruning requires collector and mail stopped together; mount BOTH server and CLI on new postal0.1.10, run bounded cleanup as autopilot-post, then accepted restart; never pair new pruner with old collector or overwrite previous immutable postal shelves',
        'six team accounts outside primary a2a-pochta; master retains primary','root-owned /etc/autopilot-mail 0755, retention.json0644',
        'tmpfiles ACL getfacl user:autopilot-post:-wx and create rerun preserves it','AP-notice profile routing and all seven numeric bot IDs installed before first publication',
        'create distinct autopilot-copy user/group in autopilot-mail, outside primary mail; seven root:autopilot-copy0640 keys in root:autopilot-copy0750 directory; verify token prefixes locally',
        'inventory legacy copy_outbox explicitly; never replay old rows into Telegram; refuse display until reviewed',
        'copy.json remains accepted on its worker restart via digest/root-file handshake; this candidate does not change credentials or worker role',
        'root-owned usage source-profile.json and empty canonical index are provisioned before enabling usage timer; G sourceProcess is proven by the G producer, not inferred from a request body'],
      'mount_hand':'coordinator after Veniamin gates, own update window; no installer performed by this module'}

def candidate_entries(directory):
    directory=Path(directory)
    if not directory.is_absolute() or directory.resolve()!=directory:raise ValueError('почтовый кандидат: нужен physical путь')
    expected=entries()
    actual={p.relative_to(directory).as_posix() for p in directory.rglob('*') if not p.is_dir() or p.is_symlink()}
    if actual!=set(expected):raise ValueError('почтовый кандидат: состав отличается '+repr(sorted(actual^set(expected))))
    result={}
    for name,(_,mode,_) in expected.items():
        path=directory/name;info=path.lstat()
        if path.resolve()!=path or not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or stat.S_IMODE(info.st_mode)!=mode:raise ValueError('почтовый кандидат: тип/права '+str(path))
        body=path.read_bytes();after=path.lstat()
        if (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,info.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise ValueError('почтовый кандидат изменился '+str(path))
        result[name]=('file',mode,body)
    return result

if __name__=='__main__':
    import argparse
    import importlib.util
    import sys
    parser=argparse.ArgumentParser(description='Postal layout with mandatory candidate deadline preflight',allow_abbrev=False)
    parser.add_argument('--preflight-ap',type=Path,required=True)
    parser.add_argument('--post-candidate',type=Path,required=True)
    parser.add_argument('--post-target',required=True)
    args=parser.parse_args()
    spec=importlib.util.spec_from_file_location('postal_deadline_gate',PACKAGE/'checks/deadline-check.py')
    gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
    try:
        if not re.fullmatch(r'/opt/autopilot/post/[0-9]+\.[0-9]+\.[0-9]+',args.post_target):raise ValueError('не versioned post-target')
        payload=candidate_entries(args.post_candidate)
        gate.check(args.preflight_ap/'pilot/pilot_mail.py',args.post_candidate/'pilot/pilot_mail.py',args.preflight_ap/'pilot/task_limits.py')
        if candidate_entries(args.post_candidate)!=payload:raise ValueError('почтовый кандидат изменился после AST-проверки')
        current=str(gate.installed_post()) if os.path.lexists('/usr/local/bin/autopilot-mail') else None
        value=manifest(runtime_files=payload,runtime_root=args.post_target)
        value['deadline_preflight']=dict(ap=str(args.preflight_ap),candidate=str(args.post_candidate),currentReceiver=current)
    except (gate.LimitError,ValueError,OSError) as error:print(str(error),file=sys.stderr);raise SystemExit(1)
    print(json.dumps(value,ensure_ascii=False,indent=2))
