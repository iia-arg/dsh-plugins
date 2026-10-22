"""G4 truth through the physical release CLI and its exported dashboard data."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
from test_sadik import Sadik, state


class G4(Sadik):
    def exported_state(self):
        return json.loads((self.exported(state(self.project))/'state.js').read_text().split('=',1)[1])

    def template_gate(self, public):
        # Execute the actual upstream fallback, rather than a Python model of it.
        template=(self.release/'phases/dashboard-template.html').read_text()
        fallback=next(line for line in template.splitlines() if 'if (!G.G4 && B)' in line)
        code='const S='+json.dumps(public)+';const G=S.gates||{},B=S.blind;'+fallback+';console.log(JSON.stringify(G));'
        q=subprocess.run(['node','-e',code],capture_output=True,text=True,check=True)
        return json.loads(q.stdout).get('G4')

    def test_g4_unequal_counts_without_mismatch_are_not_passed(self):
        self.init()
        q=self.call('blind','checked=12','matched=11');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertIs(state(self.project)['gates']['G4']['ok'],False)
        public=self.exported_state();self.assertIs(public['gates']['G4']['ok'],False)
        self.assertIs(self.template_gate(public)['ok'],False)

    def test_g4_invalid_counts_refuse_before_writes(self):
        self.init();self.assertEqual(self.call('blind','checked=12','matched=12').returncode,0)
        ledger=(self.project/'.autopilot/state.js').read_bytes();remote=(self.exported(state(self.project))/'state.js').read_bytes()
        for args in [('checked=12',),('matched=12',),('checked=0','matched=0'),('checked=12','matched=0'),
                     ('checked=12','matched=13'),('checked=-1','matched=1'),('checked=12','matched=1.5'),
                     ('checked=true','matched=1'),('checked=12','matched=1','matched=12'),
                     ('checked=12','matched=12','status=unknown'),('checked=12','matched=12','typo=1')]:
            with self.subTest(args=args):
                q=self.call('blind',*args);self.assertEqual(q.returncode,2,q.stdout+q.stderr)
                self.assertIn('blind',q.stdout+q.stderr)
                self.assertEqual((self.project/'.autopilot/state.js').read_bytes(),ledger)
                self.assertEqual((self.exported(state(self.project))/'state.js').read_bytes(),remote)

    def test_g4_reopen_clears_passed_acceptance(self):
        self.init();self.assertEqual(self.call('blind','checked=12','matched=12').returncode,0)
        self.assertIs(state(self.project)['gates']['G4']['ok'],True)
        self.assertEqual(self.call('finish').returncode,0)
        self.assertEqual(self.call('reopen').returncode,0)
        for s in (state(self.project),self.exported_state()):
            self.assertIsNone(s['blind']);self.assertNotIn('G4',s['gates'])
            self.assertIsNone(self.template_gate(s))

    def test_g4_unknown_is_null_and_gate_absent_even_before_sync(self):
        self.init()
        spec=importlib.util.spec_from_file_location('g4_projection',self.release/'tools/ap_sadik.py')
        runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
        path=self.project/'.autopilot/state.js';original=state(self.project)
        for unknown in ({'status':'BLINDNESS_NOT_PROVEN'}, {}, None,
                        {'checked':12,'matched':12,'status':'unknown'},
                        {'checked':True,'matched':True}, {'checked':12,'matched':12,'mismatches':'bad'}):
            with self.subTest(unknown=unknown):
                damaged=dict(original,blind=unknown,gates={'G4':{'ok':True}})
                public,_=runtime.public_payload(damaged,(self.release/'phases/dashboard-template.html').read_text())
                self.assertIsNone(public['blind']);self.assertNotIn('G4',public['gates'])
                self.assertIsNone(self.template_gate(public))
                path.write_text('window.STATE =\n'+json.dumps(damaged)+'\n')
                q=self.call('sync');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
                self.assertIsNone(state(self.project)['blind']);self.assertNotIn('G4',state(self.project)['gates'])
                self.assertIsNone(self.template_gate(self.exported_state()))

    def test_g4_equal_counts_pass_only_without_mismatch(self):
        self.init()
        for extra,want in [((),True),(('--mismatch','R07 is missing'),False),((),True)]:
            q=self.call('blind','checked=12','matched=12',*extra);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
            for s in (state(self.project),self.exported_state()):
                self.assertIs(s['gates']['G4']['ok'],want)
                self.assertIs(self.template_gate(s)['ok'],want)


def load_tests(loader, tests, pattern):
    return unittest.TestSuite(G4(name) for name in loader.getTestCaseNames(G4) if name.startswith('test_g4_'))

if __name__=='__main__':unittest.main(verbosity=2)
