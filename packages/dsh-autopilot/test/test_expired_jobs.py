"""Persisted AP expiry, using real helper/ledger/Git; courier is the external seam."""
import json,unittest
import test_mail_pilot as fixture
class ExpiryTests(unittest.TestCase):
 def setUp(self):
  self.c=fixture.PilotTests();self.c.setUp();self.addCleanup(self.c.doCleanups)
 def test_expiry_persists_and_retry_does_not_resend(self):
  c=self.c;t=c.task();c.wire(t);c.now=1600;view=c.operator.reconcile();stored=json.loads(c.operator.file.read_text())['jobs']['j1']
  self.assertEqual((view['jobs'][0]['status'],stored['status']),('EXPIRED','EXPIRED'));self.assertEqual(stored['expiredAt'],1500)
  self.assertEqual(c.operator.submit(t,c.send)['status'],'EXPIRED');self.assertEqual(len(c.calls),1)
  c.now=1200;self.assertEqual(c.operator.reconcile()['jobs'][0]['status'],'EXPIRED')
 def test_expired_slot_frees_but_uncertain_zone_remains_held(self):
  c=self.c;c.wire();c.now=1600
  blocked=c.operator.submit(c.task(job='j2',deadline=2000),c.send);self.assertEqual(blocked['reason'],'EXPIRED_EXECUTION_UNPROVEN');self.assertEqual(len(c.calls),1)
  free=c.operator.submit(c.task(job='j3',deadline=2000,zone=['other-zone']),c.send);self.assertEqual(free['status'],'PLACED');self.assertEqual(len(c.calls),2)
 def test_late_result_saved_without_resurrection_or_duplicate(self):
  c=self.c;c.wire();c.now=1600;reply=c.accept(c.result());self.assertTrue(reply['late']);self.assertEqual(reply['status'],'RESULT_SAVED')
  job=json.loads(c.operator.file.read_text())['jobs']['j1'];self.assertEqual(job['status'],'EXPIRED');self.assertFalse(job['executionHold']);self.assertEqual(c.accept(c.result())['status'],'DUPLICATE')
  self.assertEqual(c.operator.checked('j1','a'*40)['reason'],'EXPIRED_RESULT_REQUIRES_RECONCILE')
 def test_already_saved_result_is_not_expired_by_clock(self):
  c=self.c;c.wire();c.accept(c.result());c.now=1600;self.assertEqual(c.operator.reconcile()['jobs'][0]['status'],'RESULT_SAVED')

 def test_expiry_during_courier_is_reported_from_saved_state(self):
  c=self.c
  def courier(recipient,body):
   c.now=1600;c.operator.reconcile();return 0
  reply=c.operator.submit(c.task(),courier);self.assertEqual(reply['status'],'EXPIRED');self.assertEqual(json.loads(c.operator.file.read_text())['jobs']['j1']['status'],'EXPIRED')
