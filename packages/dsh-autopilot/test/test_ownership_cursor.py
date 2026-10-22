"""Exercise A+B through the persistent Reader, including conflict/cache return."""
import hashlib
import inspect
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from test_session_ownership import turn

PACKAGE=Path(__file__).resolve().parents[1]
def reader():
    spec=importlib.util.spec_from_file_location('ownership_cursor_test',PACKAGE/'runtime/runtime_incremental.py')
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

class CursorOwnership(unittest.TestCase):
    def context(self):return [dict(runId='r1',registeredAt=0,finishedAt=None,uid=os.getuid(),participant='worker',operator=None)]
    def fill(self,cursor):
        for t in [turn(1,900,2000,[('d1',1000)]),turn(2,3000,4000)]:
            t['claims']=[dict(c,receiptId='receipt',messageId='message') for c in t['claims']]
            cursor.db.execute('INSERT INTO turns VALUES(?,?,?,?)',(*[t[k] for k in ('sessionId','sessionCreated','turn')],json.dumps(t)))
            r=dict(t,uid=os.getuid(),recipient='worker',requestId='q'+str(t['turn']),requestGeneration='generation',registeredAt=t['turnStartedAt']+200)
            key=json.dumps(['generation',r['requestId']],separators=(',',':'))
            cursor.db.execute('INSERT INTO requests VALUES(?,?,?,?,?)',(key,t['sessionId'],t['sessionCreated'],t['turn'],json.dumps(r)))
        cursor.db.execute('INSERT INTO turn_deliveries VALUES(?,?,?,?)',('s',42,1,'d1'));cursor.db.commit()
    def test_continuation_and_version3_binding_survive_reopen(self):
        m=reader()
        self.assertIn('ownership',inspect.signature(m.Reader.candidates).parameters,'Reader has no interval-context input')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'state.sqlite';d={'d1':dict(kind='task',recipient='worker',runId='r1',jobId='j1',createdAt=100,deadline=10000,resultAt=8000)}
            with m.Reader(root/'R',path,os.getuid(),'worker') as c:
                self.fill(c)
                rows=c.candidates(d,'r1',ownership=self.context(),cut=12000)
                self.assertEqual({r['turn'] for r in rows.values()},{1,2});rid=next(iter(rows))
                c.save_binding('r1',rid,dict(sessionId='s',sessionCreated=42,turn=1,jobId='j1'))
                self.assertEqual(c.db.execute('PRAGMA user_version').fetchone()[0],4)
            with m.Reader(root/'R',path,os.getuid(),'worker') as c:
                c.candidates(d,'r1',ownership=self.context(),cut=12000);cached=c.binding('r1',rid)
                self.assertEqual(cached['ownershipRuleVersion'],3);self.assertEqual(cached['sessionKey'],[os.getuid(),'s',42])
    def test_warm_conflict_invalidates_success_and_return_restores_selection(self):
        m=reader()
        self.assertIn('ownership',inspect.signature(m.Reader.candidates).parameters,'Reader has no interval-context input')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);d={'d1':dict(kind='task',recipient='worker',runId='r1',jobId='j1',createdAt=100,deadline=10000,resultAt=8000)}
            with m.Reader(root/'R',root/'state.sqlite',os.getuid(),'worker') as c:
                self.fill(c);ctx=self.context();rows=c.candidates(d,'r1',ownership=ctx,cut=12000);rid=next(iter(rows));c.save_binding('r1',rid,dict(sessionId='s',sessionCreated=42,turn=1))
                ctx.append(dict(ctx[0],runId='r2',operator=None));d['d2']=dict(d['d1'],runId='r2',jobId='j2')
                value=json.loads(c.db.execute('SELECT payload FROM turns WHERE turn=1').fetchone()[0]);value['claims'].append(dict(deliveryId='d2',claimedAt=1100));c.db.execute('UPDATE turns SET payload=? WHERE turn=1',(json.dumps(value),));c.db.commit()
                c.candidates(d,'r1',ownership=ctx,cut=12000);self.assertTrue(c.conflicted);self.assertIsNone(c.binding('r1',rid))
                ctx.pop();d.pop('d2');value['claims'].pop();c.db.execute('UPDATE turns SET payload=? WHERE turn=1',(json.dumps(value),));c.db.commit()
                rows=c.candidates(d,'r1',ownership=ctx,cut=12000);self.assertFalse(c.conflicted);self.assertEqual(len(rows),2)
    def test_peer_claim_changes_warm_context_without_replacing_r_facts(self):
        m=reader()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ctx=[dict(self.context()[0],participant='master',operator=dict(sessionId='s',sessionCreated=42,turn=1,jobId='operator'))]
            d={'d1':dict(kind='task',recipient='worker',runId='r1',jobId='j1',createdAt=5400000,deadline=12600000,resultAt=None)}
            event=dict(runId='r1',deliveryId='d1',uid=os.getuid()+1,recipient='worker',sessionId='peer',sessionCreated=1,turn=2,claimedAt=11000000)
            with m.Reader(root/'R',root/'state.sqlite',os.getuid(),'master') as c:
                self.fill(c)
                for table in ('turns','requests'):
                    row=json.loads(c.db.execute('SELECT payload FROM '+table+' WHERE turn=2').fetchone()[0]);row.update(turnStartedAt=15000000,finishedAt=15001000)
                    if table=='requests':row['registeredAt']=15000200
                    c.db.execute('UPDATE '+table+' SET payload=? WHERE turn=2',(json.dumps(row),))
                c.db.commit();facts=c.requests()
                rows=c.candidates(d,'r1',ownership=ctx,cut=15002000,authenticated_events=[event]);self.assertEqual({r['turn'] for r in rows.values()},{1,2})
                rid=next(key for key,r in rows.items() if r['turn']==2);c.save_binding('r1',rid,dict(sessionId='s',sessionCreated=42,turn=2))
                c.candidates(d,'r1',ownership=ctx,cut=15002000,authenticated_events=[])
                self.assertIn('RUN_WINDOW_EXPIRED',c.ownership_issues);self.assertIsNone(c.binding('r1',rid))
                rows=c.candidates(d,'r1',ownership=ctx,cut=15002000,authenticated_events=[event]);self.assertEqual({r['turn'] for r in rows.values()},{1,2});self.assertEqual(c.requests(),facts)
    def test_interrupted_backup_and_schema3_return_can_migrate_again(self):
        m=reader()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=root/'state.sqlite';backup=Path(str(state)+'.schema3')
            with m.Reader(root/'R',state,os.getuid(),'worker') as c:
                self.fill(c);c.db.execute('PRAGMA user_version=3');c.db.commit()
            backup.write_bytes(b'interrupted backup');backup.chmod(0o600)
            with m.Reader(root/'R',state,os.getuid(),'worker') as c:self.assertEqual(c.db.execute('PRAGMA user_version').fetchone()[0],4)
            original3=backup.read_bytes();state.write_bytes(original3)
            with m.Reader(root/'R',state,os.getuid(),'worker') as c:self.assertEqual(c.db.execute('PRAGMA user_version').fetchone()[0],4);self.assertEqual(len(c.requests()),2)
            with sqlite3.connect('file:'+str(backup)+'?mode=ro',uri=True) as db:self.assertEqual(db.execute('PRAGMA quick_check').fetchone()[0],'ok');self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],3)
    def test_schema3_migration_keeps_facts_backs_up_and_discards_old_binding(self):
        m=reader()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=root/'state.sqlite'
            with m.Reader(root/'R',state,os.getuid(),'worker') as c:
                self.fill(c);c.db.execute('PRAGMA user_version=3');c.db.execute('INSERT INTO bindings VALUES(?,?,?)',('r1','old','{}'));c.db.commit()
            with m.Reader(root/'R',state,os.getuid(),'worker') as c:
                self.assertEqual(len(c.requests()),2);self.assertIsNone(c.binding('r1','old'));self.assertEqual(c.db.execute('PRAGMA user_version').fetchone()[0],4)
            backup=Path(str(state)+'.schema3')
            self.assertTrue(backup.exists());self.assertEqual(backup.stat().st_mode&0o777,0o600)
            with sqlite3.connect('file:'+str(backup)+'?mode=ro',uri=True) as db:self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],3);self.assertEqual(db.execute('SELECT COUNT(*) FROM requests').fetchone()[0],2)

class ReaderUidLock(unittest.TestCase):
    def attempt(self,directory,state='second.sqlite'):
        code="""import importlib.util,json,os,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('uid_lock_reader',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
start=time.monotonic()
try:
 with m.Reader(Path(sys.argv[2])/'other-R',Path(sys.argv[2])/sys.argv[3],os.getuid(),'worker') as r:
  result=dict(status='ACQUIRED',schema=r.db.execute('PRAGMA user_version').fetchone()[0])
except ValueError as error:result=dict(status=str(error))
result['seconds']=time.monotonic()-start
print(json.dumps(result))
"""
        call=subprocess.run([sys.executable,'-I','-B','-c',code,str(PACKAGE/'runtime/runtime_incremental.py'),str(directory),state],capture_output=True,text=True,timeout=3)
        self.assertEqual(call.returncode,0,call.stderr);return json.loads(call.stdout)
    def test_two_sources_same_uid_wait_without_creating_second_store_then_return(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m=reader();first=root/'first.sqlite';second=root/'second.sqlite'
            with m.Reader(root/'first-R',first,os.getuid(),'worker') as current:
                result=self.attempt(root)
                self.assertEqual(result['status'],'R_STATE_BUSY',result)
                self.assertGreaterEqual(result['seconds'],.20);self.assertLess(result['seconds'],1.5)
                self.assertFalse(second.exists(),'busy attempt created an unreserved DB')
                print('UID_LOCK_BUSY',json.dumps(dict(result,secondStoreExists=second.exists(),waitBudgetSeconds=.25)),flush=True)
                self.assertEqual(current.db.execute('PRAGMA user_version').fetchone()[0],4)
                inode=(root/'.reader.lock').stat().st_ino
            result=self.attempt(root)
            self.assertEqual((result['status'],result['schema']),('ACQUIRED',4))
            print('UID_LOCK_RETURN',json.dumps(result),flush=True)
            self.assertEqual((root/'.reader.lock').stat().st_ino,inode)
            self.assertEqual({p.name for p in root.glob('*.lock')},{'.reader.lock'})
    def test_other_uid_directory_has_an_independent_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);first=root/'uid-a';second=root/'uid-b';first.mkdir();second.mkdir();m=reader()
            with m.Reader(root/'R',first/'a.sqlite',os.getuid(),'worker'):
                result=self.attempt(second)
                self.assertEqual(result['status'],'ACQUIRED',result)
    def test_unsafe_uid_lock_refuses_before_state_creation(self):
        for kind in ('symlink','hardlink','mode'):
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);target=root/'unchanged';target.write_bytes(b'lock-proof');target.chmod(0o600);lock=root/'.reader.lock'
                if kind=='symlink':lock.symlink_to(target)
                elif kind=='hardlink':os.link(target,lock)
                else:lock.write_bytes(b'');lock.chmod(0o644)
                with self.assertRaises((ValueError,OSError)):
                    with reader().Reader(root/'R',root/'state.sqlite',os.getuid(),'worker'):pass
                self.assertFalse((root/'state.sqlite').exists());self.assertEqual(target.read_bytes(),b'lock-proof')
    def test_constructor_failure_releases_uid_lock_for_other_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=root/'bad.sqlite';state.write_bytes(b'not-a-sqlite-db');state.chmod(0o600)
            with self.assertRaises(sqlite3.DatabaseError):reader().Reader(root/'R',state,os.getuid(),'worker')
            self.assertEqual(self.attempt(root)['status'],'ACQUIRED')
            state.write_bytes(b'');state.chmod(0o644)
            with self.assertRaisesRegex(ValueError,'R_STATE_UNSAFE'):reader().Reader(root/'R',state,os.getuid(),'worker')
            self.assertEqual(self.attempt(root,'third.sqlite')['status'],'ACQUIRED')

if __name__=='__main__':unittest.main(verbosity=2)
