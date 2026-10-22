"""The actual public projection and renderer must disclose session ownership."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
import test_team_usage as fixture

class OwnershipProjection(unittest.TestCase):
    setUp=fixture.TeamUsage.setUp
    write=fixture.TeamUsage.write
    collect=fixture.TeamUsage.collect
    def test_policy_survives_projection_and_is_visible(self):
        self.record.update(ownershipPolicy='session-interval',ownershipRuleVersion=3)
        receipt=fixture.load().public_receipt(self.collect()['receipt'],'run1')
        spec=importlib.util.spec_from_file_location('ownership_public',fixture.PACKAGE/'runtime/ap_sadik.py')
        ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
        public=ap.public_value(receipt,ap.PUBLIC_TEAM_RECEIPT)
        self.assertEqual(public.get('ownershipPolicy'),'session-interval')
        template=(fixture.PACKAGE/'overlay/phases/dashboard-template.html').read_text();before,tail=template.split('/*STATE-BEGIN*/');_,after=tail.split('/*STATE-END*/')
        page=self.root/'policy.html';page.write_text(before+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='copy',rev=1,usageTeam=public))+';/*STATE-END*/'+after)
        rendered=json.loads(subprocess.check_output(['node',str(fixture.PACKAGE/'test/render-dashboard.cjs'),str(page)],text=True))
        self.assertEqual(rendered['errors'],[]);self.assertIn('включает непомеченную работу той же сессии в интервале RUN',rendered['html'])
    def test_partial_or_old_policy_metadata_refuses(self):
        m=fixture.load();self.record.update(ownershipPolicy='session-interval',ownershipRuleVersion=3)
        receipt=self.collect()['receipt'];receipt['ownershipRuleVersion']=2
        with self.assertRaisesRegex(m.Incomplete,'RECEIPT_INVALID'):m.public_receipt(receipt,'run1')
        receipt=self.collect()['receipt'];del receipt['ownershipNotice']
        with self.assertRaisesRegex(m.Incomplete,'RECEIPT_INVALID'):m.public_receipt(receipt,'run1')

if __name__=='__main__':unittest.main(verbosity=2)
