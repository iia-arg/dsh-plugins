#!/usr/bin/env python3
"""Package/docs contract and actual private-fixture start from the documented env.
Does not start a unit or exercise systemd's EnvironmentFile parser.
"""
from pathlib import Path
import json, os, re, shlex, subprocess, sys, unittest
from importlib.machinery import SourceFileLoader
P=Path(__file__).resolve().parents[1]
A=SourceFileLoader('audit_fixture',str(P/'test/stend-audit-runtime.py')).load_module()

class Docs(unittest.TestCase):
    def test_contracts(self):
        requirements={
          'README.md':['python3 ≥ 3.9','PyYAML','git config --system --add safe.directory /path/to/tree','dsh-trevogi','dsh-montazh','HTML','VYPUSK_TEST_REFERENCE=src/vypusk-okno-watch.sh','VYPUSK_ISKLYUCHENIYA=src/vypusk-okno-watch.exceptions.list'],
          'docs/SETTINGS.md':['/var/lib/vypusk-okno-watch/poslednyaya.txt','ключ=путь1:путь2','не добавляет','VYPUSK_KORNI','повтор ключа','относительно каталога ссылки'],
          'docs/GUARDS.md':['7 проб','только в журнале','Python ≥ 3.9'],
          'docs/ARCHITECTURE.md':['dsh.prezhnie_imena','LICENSE','docs/','test/','plugins','services','восемь обязательных'],
          'docs/TROUBLESHOOTING.md':['git config --system --add safe.directory /path/to/tree','только в журнале'],
        }
        for path,phrases in requirements.items():
            txt=(P/path).read_text()
            for phrase in phrases:
                with self.subTest(path=path,phrase=phrase):self.assertIn(phrase,txt)
        entries=sorted(['test/'+p.name for p in (P/'test').glob('stend-*.sh')]+['test/stend-montazh-okno.py','test/stend-audit-runtime.py','test/stend-audit-docs.py'])
        for path in ['docs/GUARDS.md','docs/ARCHITECTURE.md']:
            txt=(P/path).read_text()
            for name in entries:
                with self.subTest(path=path,entry=name):self.assertIn(name,txt)
        self.assertIn('src',json.loads((P/'package.json').read_text())['files'])
        self.assertTrue((P/'src/vypusk-okno-watch.exceptions.list').is_file())

    def test_release_heading_and_b2032_drop_in(self):
        meta=json.loads((P/'package.json').read_text());top=next(line for line in (P/'CHANGELOG.md').read_text().splitlines() if line.startswith('## '))
        self.assertTrue(top.startswith('## '+meta['version']+' —'),top)
        drop=(P/'systemd/vypusk-okno-watch.service.d/60-bash-padenie-70.conf').read_text()
        self.assertIn('/usr/local/bin/bash-padenie-70 /usr/local/sbin/vypusk-okno-watch.sh --avto-montazh',drop)
        self.assertIn('SyslogIdentifier=vypusk-okno-watch.sh',drop)

    def test_documented_env_starts_actual_watcher(self):
        fixture=A.Audit();fixture.setUp();self.addCleanup(fixture.doCleanups)
        txt=(P/'docs/ARCHITECTURE.md').read_text()
        sample=txt.split('# /etc/vypusk-okno-watch.env',1)[1].split('# /etc/systemd/system/vypusk-okno-watch.timer',1)[0]
        sample=sample[sample.index('\n')+1:]
        sample=sample.replace('<рабочее-дерево · working-tree>',str(fixture.repo)).replace('<каталог-плагинов · plugins-dir>',str(fixture.root)).replace('<родитель-домов-агентов · agent-homes-parent>',str(fixture.d/'empty-homes'))
        env=dict(fixture.env)
        for key in list(env):
            if key.startswith('VYPUSK_'):env.pop(key)
        pairs=shlex.split(sample,comments=True)
        for pair in pairs:
            key,value=pair.split('=',1);env[key]=value
        required=['VYPUSK_REPO','VYPUSK_KORNI','VYPUSK_AGENT_POISK','VYPUSK_INFO_KORNI','VYPUSK_SOOTVETSTVIYA','VYPUSK_SSYLKI','VYPUSK_RASKLADKA','VYPUSK_REESTR']
        # Only the installation path and recording channel/state are fixture bindings.
        env.update(VYPUSK_ISKLYUCHENIYA=str(P/'src/vypusk-okno-watch.exceptions.list'),VYPUSK_ALERT=fixture.env['VYPUSK_ALERT'],VYPUSK_SOSTOYANIE=str(fixture.state))
        q=subprocess.run(['bash',str(A.WATCH)],env=env,text=True,capture_output=True,timeout=15)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('сошлось: demo',q.stdout);self.assertFalse(fixture.alerts())
        for key in required:self.assertIn(key,env)

if __name__=='__main__':
    run=unittest.main(verbosity=2,exit=False);sys.exit(0 if run.result.wasSuccessful() else 1)
