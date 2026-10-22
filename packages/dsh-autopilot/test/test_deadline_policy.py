"""The AST gate must refuse drift and unknown syntax without running inputs."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest

PACKAGE=Path(__file__).resolve().parents[1]

def checker():
    path=PACKAGE/'checks/deadline-check.py'
    if not path.exists():raise AssertionError('deadline AST gate is missing')
    spec=importlib.util.spec_from_file_location('deadline_check_test',path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

class DeadlineGate(unittest.TestCase):
    def fixture(self,root):
        ap=root/'AP/pilot/pilot_mail.py';post=root/'post/pilot/pilot_mail.py';limit=ap.with_name('task_limits.py')
        ap.parent.mkdir(parents=True,exist_ok=True);post.parent.mkdir(parents=True,exist_ok=True)
        limit.write_text('TASK_DEADLINE_MAX = 7200\n')
        body='class Postman:\n    def validate(self,task):\n        if not self.clock() < task["deadline"] <= self.clock() + LIMIT:\n            return {"status":"STATUS_REQUIRED"}\n'
        ap.write_bytes((PACKAGE/'lib/pilot_mail.py').read_bytes())
        post.write_text(body.replace('LIMIT','7200'))
        return ap,post,limit
    def test_literal_drift_refuses_with_path_and_both_numbers_then_returns(self):
        m=checker()
        with tempfile.TemporaryDirectory() as tmp:
            ap,post,limit=self.fixture(Path(tmp));self.assertEqual(m.check(ap,post,limit)['limit'],7200)
            original=post.read_bytes();damaged=original.replace(b'+ 7200',b'+ 7201');self.assertNotEqual(original,damaged)
            print('MUTATION',post,'before',hashlib.sha256(original).hexdigest(),'after',hashlib.sha256(damaged).hexdigest(),flush=True)
            post.write_bytes(damaged)
            counted=subprocess.run(['grep','-cF','+ 7201',str(post)],capture_output=True,text=True,check=True)
            self.assertEqual(counted.stdout.strip(),'1');print('grep -cF + 7201',counted.stdout.strip(),flush=True)
            with self.assertRaises(m.LimitError) as error:m.check(ap,post,limit)
            self.assertIn(str(post),str(error.exception));self.assertIn('7201',str(error.exception));self.assertIn('7200',str(error.exception))
            post.write_bytes(original);self.assertEqual(m.check(ap,post,limit)['limit'],7200)
    def test_expression_refuses_as_missing_limit_then_returns(self):
        m=checker()
        with tempfile.TemporaryDirectory() as tmp:
            ap,post,limit=self.fixture(Path(tmp));original=post.read_bytes();damaged=original.replace(b'+ 7200',b'+ (7200 + 0)');post.write_bytes(damaged)
            self.assertNotEqual(hashlib.sha256(original).digest(),hashlib.sha256(post.read_bytes()).digest())
            counted=subprocess.run(['grep','-cF','+ (7200 + 0)',str(post)],capture_output=True,text=True,check=True)
            self.assertEqual(counted.stdout.strip(),'1');print('EXPRESSION-MUTATION',post,hashlib.sha256(original).hexdigest(),hashlib.sha256(damaged).hexdigest(),'grep-F',counted.stdout.strip(),flush=True)
            with self.assertRaisesRegex(m.LimitError,'предел не найден'):m.check(ap,post,limit)
            post.write_bytes(original);self.assertEqual(m.check(ap,post,limit)['limit'],7200)
    def test_ap_expression_or_shadowed_limit_is_not_silently_accepted(self):
        m=checker()
        with tempfile.TemporaryDirectory() as tmp:
            ap,post,limit=self.fixture(Path(tmp));ap.write_text(ap.read_text().replace('+ TASK_DEADLINE_MAX','+ (TASK_DEADLINE_MAX + 0)'))
            with self.assertRaisesRegex(m.LimitError,'предел не найден'):m.check(ap,post,limit)
    def test_top_level_input_code_is_never_executed(self):
        m=checker()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ap,post,limit=self.fixture(root);marker=root/'executed'
            for p in (ap,post,limit):p.write_text('open('+repr(str(marker))+',"w").write("BAD")\n'+p.read_text())
            self.assertEqual(m.check(ap,post,limit)['limit'],7200);self.assertFalse(marker.exists())
    def test_named_post_uses_its_own_constant_not_the_ap_value(self):
        m=checker()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ap,post,limit=self.fixture(root);shelf=root/'postal/pilot';shelf.mkdir(parents=True)
            other=shelf/'pilot_mail.py';other.write_text(ap.read_text());(shelf/'task_limits.py').write_text('TASK_DEADLINE_MAX = 7201\n')
            with self.assertRaisesRegex(m.LimitError,'7201.*7200'):m.check(ap,other,limit)
    def test_postal_manifest_preflight_checks_candidate_before_emitting_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ap=root/'L';post=root/'new-post'
            (ap/'pilot').mkdir(parents=True);(post/'pilot').mkdir(parents=True)
            spec=importlib.util.spec_from_file_location('postal_layout_test',PACKAGE/'lib/post_layout.py')
            layout=importlib.util.module_from_spec(spec);spec.loader.exec_module(layout)
            for name,(_,mode,body) in layout.entries().items():
                file=post/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(body);file.chmod(mode)
            source_ap,source_post,limit=self.fixture(root)
            (ap/'pilot/pilot_mail.py').write_bytes(source_ap.read_bytes());(ap/'pilot/task_limits.py').write_bytes(limit.read_bytes())
            target=post/'pilot/pilot_mail.py';original=source_post.read_bytes();target.write_bytes(original.replace(b'+ 7200',b'+ 7201'))
            args=[sys.executable,'-I','-B',str(PACKAGE/'lib/post_layout.py'),'--preflight-ap',str(ap),'--post-candidate',str(post),'--post-target','/opt/autopilot/post/0.1.11']
            red=subprocess.run(args,capture_output=True,text=True)
            self.assertNotEqual(red.returncode,0);self.assertIn(str(target),red.stderr);self.assertIn('7201',red.stderr)
            target.write_bytes(original);green=subprocess.run(args,capture_output=True,text=True)
            self.assertEqual(green.returncode,0,green.stderr);self.assertIn('runtime_files',green.stdout)
            import json
            rows=json.loads(green.stdout)['runtime_files'];published=next(r for r in rows if r['target'].endswith('/pilot/pilot_mail.py'))
            self.assertEqual(published['sha256'],hashlib.sha256(target.read_bytes()).hexdigest(),'manifest describes different bytes than preflight')
    def test_fake_import_and_annotated_shadow_are_not_a_source_of_truth(self):
        m=checker()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ap,post,limit=self.fixture(root);original=ap.read_text()
            ap.write_text(original.replace('_task_limits = _limits_import.module_from_spec(_limits_spec)','_task_limits = Fake()'))
            with self.assertRaisesRegex(m.LimitError,'предел не найден'):m.check(ap,post,limit)
            ap.write_text(original);limit.write_text('TASK_DEADLINE_MAX=7200\nTASK_DEADLINE_MAX: int=7201\n')
            with self.assertRaisesRegex(m.LimitError,'предел не найден'):m.check(ap,post,limit)
    def test_loader_rebinding_attribute_write_and_parameter_shadow_refuse(self):
        m=checker()
        with tempfile.TemporaryDirectory() as tmp:
            ap,post,limit=self.fixture(Path(tmp));original=ap.read_text()
            for damaged in [original.replace('def validate(self, task):','def validate(self, task, TASK_DEADLINE_MAX=7201):'),
                            original.replace('_limits_spec =','_limits_import = fake_import\n_limits_spec =',1),
                            original.replace('TASK_DEADLINE_MAX = _task_limits.TASK_DEADLINE_MAX','_task_limits.TASK_DEADLINE_MAX=7201\nTASK_DEADLINE_MAX = _task_limits.TASK_DEADLINE_MAX',1),
                            original+'\nfrom fake_limit import TASK_DEADLINE_MAX\n']:
                self.assertNotEqual(original,damaged);ap.write_text(damaged)
                with self.assertRaisesRegex(m.LimitError,'предел не найден'):m.check(ap,post,limit)
            ap.write_text(original);self.assertEqual(m.check(ap,post,limit)['limit'],7200)
    def test_missing_post_and_unknown_constant_refuse(self):
        m=checker()
        with tempfile.TemporaryDirectory() as tmp:
            ap,post,limit=self.fixture(Path(tmp));post.unlink()
            with self.assertRaisesRegex(m.LimitError,'предел не найден'):m.check(ap,post,limit)
            ap,post,limit=self.fixture(Path(tmp));limit.write_text('TASK_DEADLINE_MAX=7200+0\n')
            with self.assertRaisesRegex(m.LimitError,'предел не найден'):m.check(ap,post,limit)

if __name__=='__main__':unittest.main(verbosity=2)
