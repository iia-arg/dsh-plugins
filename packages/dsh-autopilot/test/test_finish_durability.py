"""Installed AP CLI as master in a private root; all telemetry sockets are absent fixtures."""
from pathlib import Path
import hashlib,json,os,unittest
from unittest.mock import patch
import test_runtime_catalog as fixture

class FinishDurability(unittest.TestCase):
    bootstrap=fixture.RuntimeCatalog.bootstrap
    call=fixture.RuntimeCatalog.call
    state=fixture.RuntimeCatalog.state
    data=fixture.RuntimeCatalog.data
    def setUp(self):
        fixture.RuntimeCatalog.setUp(self)
        self.mail_patch=patch.dict(os.environ,AUTOPILOT_USAGE_MAIL_SOCKET=str(self.top/'absent-mail.sock'),AUTOPILOT_NO_UPDATE_CHECK='1')
        self.mail_patch.start();self.addCleanup(self.mail_patch.stop)

    def test_finish_attests_marker_without_unattested_warning(self):
        self.bootstrap()
        with patch.dict(os.environ,AUTOPILOT_USAGE_MAIL_SOCKET=str(self.top/'absent-mail.sock'),AUTOPILOT_NO_UPDATE_CHECK='1'):
            reply=self.call('init','--slug','finish-durable');self.assertEqual(reply.returncode,0,reply.stdout+reply.stderr)
            self.assertEqual(self.state()['usageRegistration']['state'],'UNBOUND')
            run=self.state()['_sadik']['run_id']
            done=self.call('finish','--result','done')
        self.assertEqual(done.returncode,0,done.stdout+done.stderr)
        marker=self.project/'.autopilot/usage-finish'/(run+'.json')
        value=json.loads(marker.read_text());self.assertEqual(value,dict(runId=run,project=str(self.project),finishedAt=self.state()['usageFinishedAt']))
        self.assertEqual(self.data()['runs'],{})
        self.assertNotIn('RUN_FINISH_UNATTESTED',done.stderr,done.stdout+done.stderr)

    def test_finish_conflict_reports_specific_cause(self):
        self.bootstrap()
        q=self.call('init','--slug','finish-conflict');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        run=self.state()['_sadik']['run_id'];folder=self.project/'.autopilot/usage-finish';folder.mkdir(mode=0o700);os.chown(folder,self.master.pw_uid,self.master.pw_gid)
        marker=folder/(run+'.json');marker.write_text(json.dumps(dict(runId=run,project=str(self.project),finishedAt='1970-01-01T00:00:00Z')));os.chown(marker,self.master.pw_uid,self.master.pw_gid);marker.chmod(0o600)
        before=hashlib.sha256(marker.read_bytes()).hexdigest();done=self.call('finish','--result','done')
        self.assertEqual(done.returncode,0,done.stdout+done.stderr)
        self.assertIn('UNBOUND: RUN_FINISH_UNATTESTED: Refusal: RUN_FINISH_CONFLICT',done.stderr)
        self.assertEqual(hashlib.sha256(marker.read_bytes()).hexdigest(),before)

if __name__=='__main__':
    # Exactly the new method; the other RuntimeCatalog tests are separate coverage.
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(FinishDurability))
    raise SystemExit(0 if result.wasSuccessful() else 1)
