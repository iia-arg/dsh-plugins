"""Historical schema2–4 collector shim through current in a private layout; not the new service caller.

A missing canonicalization must produce seven R_EXPORTER_UNSAFE rows; a healthy
collector must measure seven synthetic owners (700 input tokens). --damage-resolve
removes both independent normalizations ONLY in the disposable installed copy.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
import tempfile

PEOPLE=('master','vintik','shpuntik','gayka','shurup','tumbler','sova')

def private_case(package,damage):
    sys.path.insert(0,str(package/'test'))
    from _runtime_sources_private import setup
    setup()
    import copy,importlib.util,shlex,shutil,sqlite3,unittest
    from _runtime_receipt_root import ProtectedPipeline

    class CollectorCurrent(ProtectedPipeline):
        def test_current_native_exporter(self):
            self.index=Path('/var/lib/autopilot-usage/index.json')
            self.output=Path('/var/lib/autopilot-usage/runs')
            self.record['origin']['operatorReservation']=str(self.index.parent/'reservations'/(hashlib.sha256(self.record['project'].encode()).hexdigest()+'.json'))
            self.declaration.write_text(json.dumps(self.record))
            with sqlite3.connect(self.record['origin']['mailDatabase']) as con:
                con.execute('CREATE TABLE usage_registrations(run_id TEXT,request_sha TEXT,request_json TEXT,peer_uid INTEGER,peer_pid INTEGER,accepted_at REAL,operator_json TEXT)')
            profile=dict(schemaVersion=1,mailDatabase=self.record['origin']['mailDatabase'],projectRoots=[str(self.root)],participants=[dict(p,tgService=p['name']+'.service') for p in self.record['participants']])
            profile_path=self.index.parent/'source-profile.json'
            profile_path.write_text(json.dumps(profile));profile_path.chmod(0o600)
            self.register()
            release=Path('/opt/autopilot/releases/X')
            tools=release/'tools';consumer=release/'skill/tools'
            (release/'pilot').mkdir(parents=True,mode=0o755,exist_ok=True)
            shutil.copyfile(self.package/'lib/task_limits.py',release/'pilot/task_limits.py');(release/'pilot/task_limits.py').chmod(0o644)
            for folder in (release.parent,release,tools,consumer.parent,consumer):
                folder.mkdir(mode=0o755,parents=True,exist_ok=True);folder.chmod(0o755)
            for src in (self.package/'runtime').iterdir():
                if src.name not in {'team_usage.py','ap_sadik.py'}:
                    dst=tools/src.name;shutil.copyfile(src,dst);dst.chmod(0o644)
            for name in ('team_usage.py','ap_sadik.py'):
                dst=consumer/name;shutil.copyfile(self.package/'runtime'/name,dst);dst.chmod(0o644)
            for name in ('collect-team-usage.py','export-runtime-source.py'):
                dst=tools/name;shutil.copyfile(self.package/'tools'/name,dst);dst.chmod(0o644)
            if damage:
                replacements=0
                for path,before,after in (
                    (tools/'collect-team-usage.py',b"Path(__file__).resolve().with_name('runtime_receipt_source.py')",b"Path(__file__).with_name('runtime_receipt_source.py')"),
                    (tools/'runtime_receipt_source.py',b'HERE=Path(__file__).resolve().parent',b'HERE=Path(__file__).parent')):
                    raw=path.read_bytes();self.assertEqual(raw.count(before),1)
                    path.write_bytes(raw.replace(before,after,1));changed=path.read_bytes()
                    self.assertNotEqual(hashlib.sha256(raw).digest(),hashlib.sha256(changed).digest())
                    self.assertEqual(changed.count(before),0)
                    print('RESOLVE_DAMAGE '+json.dumps(dict(path=str(path),replacements=1,beforeSHA=hashlib.sha256(raw).hexdigest(),afterSHA=hashlib.sha256(changed).hexdigest(),remainingOriginal=0)),flush=True)
                    replacements+=1
                self.assertEqual(replacements,2)
            Path('/opt/autopilot/current').symlink_to('releases/X')
            unit=(package/'systemd/autopilot-usage.service').read_text()
            argv=shlex.split(next(line.split('=',1)[1] for line in unit.splitlines() if line.startswith('ExecStart=')))
            self.assertEqual(argv,['/usr/bin/python3','-I','-B','/opt/autopilot/current/tools/collect-team-usage.py'])
            self.assertTrue(Path('/opt/autopilot/current').is_symlink())
            self.assertFalse((release/'runtime').exists(),'fallback must be exercised, not package layout')
            with self.assertRaisesRegex(self.m.Incomplete,'R_EXPORTER_UNSAFE'):
                self.m.owner_export(dict(participant=dict(name='master',uid=pwd.getpwnam('master').pw_uid,gid=pwd.getpwnam('master').pw_gid),budget=1024),Path('/opt/autopilot/current/tools/export-runtime-source.py'))
            call=subprocess.run(argv,capture_output=True,text=True,timeout=35,umask=0o077)
            self.assertEqual(call.returncode,0,call.stdout+call.stderr)
            pointer=json.loads((self.output/'run1/current.json').read_bytes())
            receipt_path=self.output/'run1/public'/pointer['generation']/'receipt.json';raw=receipt_path.read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(),pointer['receiptSha256'])
            value=self.m.core.public_receipt(json.loads(raw),'run1');self.assertEqual(value['schemaVersion'],4)
            print('COLLECTOR_CURRENT '+json.dumps(dict(argv=argv,umask='0077',currentTarget=os.readlink('/opt/autopilot/current'),nativeRuntimeAbsent=True,status=value['status'],totals=value['totals'],missing=value['missing'],ownerUids={name:pwd.getpwnam(name).pw_uid for name in PEOPLE},directAliasOwnerGuard='R_EXPORTER_UNSAFE')),flush=True)
            self.assertEqual(value['status'],'observed',value['missing'])
            self.assertEqual(value['totals']['inputTokens'],700)
            self.assertEqual(value['totals']['modelCalls'],7)
            # Both real wrappers must load the physical module even from current.
            import runpy
            for name in ('collect-team-usage.py','export-runtime-source.py'):
                namespace=runpy.run_path('/opt/autopilot/current/tools/'+name,run_name='_loader_probe')
                path=Path(namespace['module'].__file__)
                self.assertEqual(path,path.resolve())
    suite=unittest.TestSuite([CollectorCurrent('test_current_native_exporter')])
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() and result.testsRun==1 and not result.skipped else 1

def main():
    parser=argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--package',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--damage-resolve',action='store_true')
    parser.add_argument('--private-child',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args()
    if os.geteuid()!=0:parser.error('root private fixture required')
    if args.private_child:return private_case(args.package,args.damage_resolve)
    sys.path.insert(0,str(args.package/'test'))
    from _runtime_sources_private import namespace
    with tempfile.TemporaryDirectory(prefix='ap-exporter-symlink-') as td:
        root=Path(td);passwd=['root:x:0:0:root:/root:/bin/sh'];groups=['root:x:0:']
        for i,name in enumerate((*PEOPLE,'autopilot-post'),60001):
            try:who=pwd.getpwuid(i)
            except KeyError:who=None
            if who is not None and who.pw_name!=name:raise ValueError('fixture UID occupied')
            passwd.append(f'{name}:x:{i}:{i}:fixture:/tmp/{name}:/bin/sh');groups.append(f'{name}:x:{i}:')
        coders=pwd.getpwnam('coders');passwd.append(f'coders:x:{coders.pw_uid}:{coders.pw_gid}:fixture:/tmp/coders:/bin/sh');groups.append(f'coders:x:{coders.pw_gid}:')
        for name,rows in [('passwd',passwd),('group',groups)]:
            (root/name).write_text('\n'.join(rows)+'\n');(root/name).chmod(0o644)
        argv=namespace(args.package)+['--tmpfs','/opt/autopilot','--ro-bind',str(root/'passwd'),'/etc/passwd','--ro-bind',str(root/'group'),'/etc/group','--','/usr/bin/python3','-I','-B',str(Path(__file__).resolve()),'--private-child','--package',str(args.package)]
        if args.damage_resolve:argv.append('--damage-resolve')
        child=subprocess.run(argv,capture_output=True,text=True,timeout=60)
        print(child.stdout+child.stderr,flush=True)
        return child.returncode
if __name__=='__main__':sys.exit(main())
