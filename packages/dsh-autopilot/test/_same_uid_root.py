"""Two physical sources under one UID, entered with a private NSS passport."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import sqlite3
from _ownership_root import RootOwnership


class SameUidSources(RootOwnership):
    def test_two_sources_one_uid_are_both_measured(self):
        self.assertEqual(pwd.getpwnam('vintik').pw_uid,pwd.getpwnam('gayka').pw_uid)
        p=next(p for p in self.record['participants'] if p['name']=='gayka')
        # Distinct native sessions: a shared UID must not alias session identity.
        def session(value):
            if isinstance(value,dict):return {k:session(v) for k,v in value.items()}
            if isinstance(value,list):return [session(v) for v in value]
            return 's-gayka' if value=='s' else value
        for file in {p['runtimeSource']['raw'],*p['runtimeSource']['native'],p['sources']['gateway']}:
            path=Path(file);path.write_text(''.join(json.dumps(session(row))+'\n' for row in self.m.lines(path.read_bytes())))
        with sqlite3.connect(p['runtimeSource']['ledger']) as db:
            db.execute("UPDATE receipts SET session_id='s-gayka'")
            db.execute("UPDATE mail_sdk_requests SET session_id='s-gayka'")
            binding=json.loads(db.execute('SELECT binding_json FROM mail_sdk_requests').fetchone()[0])
            db.execute('UPDATE mail_sdk_requests SET binding_json=?',(json.dumps(session(binding)),))
        self.registered_fixture()
        calls=[];original=self.m.owner_export
        def observe(request,exporter,seconds=None):
            result=original(request,exporter,seconds)
            lock=Path(request['runtimeCursorDir'])/'.reader.lock'
            # A different open description proves RELEASE after child exit.
            with lock.open('rb') as stream:
                fcntl.flock(stream,fcntl.LOCK_EX|fcntl.LOCK_NB)
                fcntl.flock(stream,fcntl.LOCK_UN)
            calls.append(dict(name=request['participant']['name'],uid=request['participant']['uid'],source=request['participant']['runtimeSource']['raw'],lock=str(lock)))
            return result
        self.m.owner_export=observe
        prepared=self.m.prepare(self.index,self.output,self.exporter)
        self.assertEqual(prepared['failed'],[],prepared)
        staged=self.m.core.trusted_json(self.m.core.trusted_json(prepared['index'])['runs'][0]['record'])
        self.m.core.verify_record_origin(staged)
        value=self.m.core.collect_record(staged,prepared['cut'],{},drop_identity=True)['receipt']
        print('SAME_UID_RECEIPT '+json.dumps(value),flush=True)
        self.assertEqual(value['status'],'observed',value)
        for name in ('vintik','gayka'):
            rows=[r for r in value['rows'] if r['participant']==name]
            self.assertEqual(len(rows),1);self.assertEqual(rows[0]['totals']['inputTokens'],100)
            self.assertEqual(rows[0]['totals']['outputTokens'],5)
        self.assertEqual(value['totals']['inputTokens'],700);self.assertEqual(value['totals']['outputTokens'],35)
        sources=[p for p in staged['participants'] if p['name'] in ('vintik','gayka')]
        self.assertNotEqual(sources[0]['sources']['runtime'],sources[1]['sources']['runtime'])
        shared=[c for c in calls if c['name'] in ('vintik','gayka')]
        self.assertEqual(len(shared),4);self.assertEqual(len({c['source'] for c in shared}),2)
        self.assertEqual(len({c['lock'] for c in shared}),1)
        directory=Path(shared[0]['lock']).parent
        for source in {c['source'] for c in shared}:
            self.assertTrue((directory/(hashlib.sha256(source.encode()).hexdigest()+'.sqlite')).is_file())
        print('SAME_UID_PROOF '+json.dumps(dict(uid=p['uid'],calls=shared,inputTokens=700,outputTokens=35,lockReleasedAfterEveryExport=True)),flush=True)
