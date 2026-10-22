"""Pure builder contract: a full raw map in and a full adapted map out."""
from pathlib import Path,PurePosixPath
import hashlib,importlib.util,json,os,unittest
ROOT=Path(__file__).resolve().parents[1]

class FullMapping(unittest.TestCase):
    def context(self):
        spec=importlib.util.spec_from_file_location('port_layout',ROOT/'runtime/part_b_layout.py');layout=importlib.util.module_from_spec(spec);spec.loader.exec_module(layout)
        source=Path(os.environ['AUTOPILOT_TEST_UPSTREAM']);raw={}
        for p in source.rglob('*'):
            rel=p.relative_to(source)
            if rel.parts[0]=='.git':continue
            path=PurePosixPath(rel.as_posix())
            if p.is_symlink():raw[path]=('link',0o777,os.readlink(p))
            elif p.is_dir():raw[path]=('dir',0o755,None)
            else:raw[path]=('file',0o755 if p.stat().st_mode&0o111 else 0o644,p.read_bytes())
        lock={'upstream_sha':'9fc898cbe941d5b8a369f1dd657e9119676eb44f','local_revision':'fixture'+json.loads((ROOT/'part-b-lock.json').read_text())['local_suffix'],'part_b_manifest_sha256':hashlib.sha256((ROOT/'part-b-lock.json').read_bytes()).hexdigest()}
        return layout,lock,raw

    def test_complete_map_and_raw_preservation(self):
        layout,lock,raw=self.context()
        before=raw.copy();lock_before=lock.copy()
        callback=layout.overlay
        out=callback(lock,raw)
        self.assertTrue(PurePosixPath('README.md') in out,'full-map integration must preserve files outside skill')
        self.assertTrue(PurePosixPath('skills/autopilot/tools/ap_sadik.py') in out)
        expected={PurePosixPath('skills/autopilot')/x for x in ['phases/0-instruments.md','phases/0-preflight.md','phases/0-resume.md','phases/4-plan.md','phases/5-subagents.md','phases/8-final.md','phases/dashboard-template.html','tools/ap.py','tools/ap_sadik.py','tools/run_catalog.py','tools/team_usage.py','tools/usage_registration.py','tools/mail_registration.py','tools/usage-reader-limits.json','tools/codex_account_map.py','tools/child_usage.py','tools/child-source-versions.json']}
        changed={k for k in out if out[k]!=raw.get(k)}
        self.assertEqual(changed,expected);self.assertTrue(raw==before,'input map changed');self.assertEqual(lock,lock_before);self.assertIsNot(out,raw)
        print('full raw input',len(raw),'full adapted output',len(out),'changed',len(changed),'raw and lock unchanged',flush=True)


    def test_corrupt_base_rejected_and_original_returns(self):
        layout,lock,raw=self.context();good=layout.overlay(lock,raw)
        path=PurePosixPath('skills/autopilot/tools/ap.py');entry=raw[path]
        marker=b'\nDAMAGED-BASE-FOR-MAIN\n';changed=entry[2]+marker
        self.assertEqual(changed.count(marker),1)
        before=hashlib.sha256(entry[2]).hexdigest();after=hashlib.sha256(changed).hexdigest();self.assertNotEqual(before,after)
        broken=dict(raw);broken[path]=(entry[0],entry[1],changed)
        print('DAMAGE base count=1 SHA',before,'->',after,flush=True)
        with self.assertRaisesRegex(ValueError,'overlay base differs'):layout.overlay(lock,broken)
        self.assertTrue(layout.overlay(lock,raw)==good,'return to original source differs')
        print('RESTORED source map original SHA',before,flush=True)

if __name__=='__main__':unittest.main(verbosity=2)
