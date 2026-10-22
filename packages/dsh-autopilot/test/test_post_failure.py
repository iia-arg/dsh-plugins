"""The systemd failure reader names only its own mail unit; no live alerts."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
import mail_service

class FailureReaderTests(unittest.TestCase):
    def test_only_own_failed_unit_can_generate_one_bounded_alert(self):
        self.assertTrue(callable(getattr(mail_service,'notify_unit_failure',None)),'missing OnFailure reader')
        seen=[]
        self.assertEqual(mail_service.notify_unit_failure('autopilot-mail.service',lambda text:seen.append(text) or 'sent'),0)
        self.assertEqual(len(seen),1);self.assertIn('autopilot-mail.service',seen[0])
        for value in ['beta.service','autopilot-mail-failed@x.service','--dry-run','',None]:
            self.assertEqual(mail_service.notify_unit_failure(value,lambda _:self.fail('unrelated unit must not send')),2)
        self.assertEqual(mail_service.notify_unit_failure('autopilot-mail.service',lambda _:'unknown'),1)

    def test_copy_unit_failure_alert_does_not_tell_operator_to_stop_jobs(self):
        seen=[]
        self.assertEqual(mail_service.notify_unit_failure('autopilot-copy.service',lambda text:seen.append(text) or 'sent'),0)
        self.assertEqual(len(seen),1);self.assertIn('работа продолжается',seen[0]);self.assertNotIn('не выдавать',seen[0])

if __name__=='__main__':unittest.main()
