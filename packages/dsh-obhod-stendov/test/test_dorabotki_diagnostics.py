"""Actual acyclicity stand with private subjects and a stubbed first account."""
from pathlib import Path
import json,os,subprocess,tempfile,unittest

PACKAGE=Path(__file__).resolve().parents[1]

class Diagnostics(unittest.TestCase):
    def run_stand(self,payload,code):
        self.assertEqual(os.geteuid(),0,'run this private namespace test as root')
        with tempfile.TemporaryDirectory(prefix='dorabotki-diagnostic-') as tmp:
            root=Path(tmp);subject=root/'nashi';manifest=root/'manifest';registry=root/'plugins.yaml';first=root/'agent-plugins'
            subject.write_text("#!/bin/bash\ncat <<'LIST' >/dev/null\nE|/etc/agent-registry/plugins.yaml|registry\nE|/etc/agent-registry/agents.yaml|agents\nLIST\ncat <<'OUTPUT'\n"+payload+"\nOUTPUT\nexit "+str(code)+"\n");subject.chmod(0o755)
            manifest.write_text('E|/etc/agent-registry/plugins.yaml|0\nE|/etc/agent-registry/agents.yaml|0\n')
            registry.write_text(json.dumps(dict(plugins=[dict(id='fixture',installed_check='/opt/iskra/workspace/dorabotki/nashi-dorabotki.sh')],services=[])))
            first.write_text('#!/bin/sh\n[ "$1" = verify ] || exit 2\nexit 0\n');first.chmod(0o755)
            env=dict(os.environ,SH=str(subject),MAN=str(manifest),REG=str(registry),PYTHONDONTWRITEBYTECODE='1')
            command=['bwrap','--die-with-parent','--unshare-net','--unshare-pid','--ro-bind','/','/','--dev','/dev','--proc','/proc','--tmpfs','/tmp','--ro-bind',str(root),str(root),'--ro-bind',str(first),'/usr/local/bin/agent-plugins','--','bash',str(PACKAGE/'dorabotki/stend-atsiklichnosti.sh')]
            result=subprocess.run(command,env=env,capture_output=True,text=True,timeout=15)
            self.assertIn('итог:',result.stdout,result.stdout+result.stderr)
            return result

    def test_informational_warning_does_not_fail_healthy_accounts(self):
        result=self.run_stand('🔴 применения progon за сутки: 0 — механизм есть и НЕ ПРИМЕНЯЕТСЯ.\n🔴 РАЗОШЛИСЬ dvojniki',0)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr);self.assertIn('ok=10 fail=0',result.stdout)

    def test_manifest_difference_precedes_unrelated_red_messages(self):
        result=self.run_stand('🔴 применения progon за сутки: 0 — механизм есть и НЕ ПРИМЕНЯЕТСЯ.\n🔴 РАЗОШЛИСЬ dvojniki\nРАСХОЖДЕНИЙ НАЙДЕНО — что затёрто или изменено:\n-E|/etc/agent-registry/agents.yaml|old\n+E|/etc/agent-registry/agents.yaml|new',1)
        self.assertEqual(result.returncode,1,result.stdout+result.stderr)
        failure=next(s for s in result.stdout.splitlines() if 'FAIL второй учёт:' in s)
        self.assertIn('manifest.txt',failure);self.assertIn('-E|/etc/agent-registry/agents.yaml|old',failure)
        self.assertNotIn('первая: 🔴 применения',failure)

    def test_terminal_refusal_precedes_informational_warning(self):
        result=self.run_stand('🔴 применения progon за сутки: 0 — механизм есть и НЕ ПРИМЕНЯЕТСЯ.\nно ХОЗЯИН деревьев чужой: 1 (B-N-967)',1)
        self.assertEqual(result.returncode,1,result.stdout+result.stderr)
        failure=next(s for s in result.stdout.splitlines() if 'FAIL второй учёт:' in s)
        self.assertIn('но ХОЗЯИН деревьев чужой',failure)

    def test_unknown_failure_remains_red_without_an_invented_cause(self):
        result=self.run_stand('🔴 применения progon за сутки: 0 — механизм есть и НЕ ПРИМЕНЯЕТСЯ.',1)
        self.assertEqual(result.returncode,1,result.stdout+result.stderr)
        failure=next(s for s in result.stdout.splitlines() if 'FAIL второй учёт:' in s)
        self.assertIn('причина кода 1 не выделена',failure)

    def test_startup_integrity_refusal_keeps_the_affected_file(self):
        result=self.run_stand('🔴 применения progon за сутки: 0\n🔴 ПИШЕТ-ПОДЪЁМ: /fixture/kanon.txt: сумма не совпала\nно ПИШЕТ-ПОДЪЁМ: ошибок целостности 1',1)
        failure=next(s for s in result.stdout.splitlines() if 'FAIL второй учёт:' in s)
        self.assertEqual(result.returncode,1);self.assertIn('/fixture/kanon.txt',failure)

    def test_missing_promised_control_keeps_the_affected_file(self):
        result=self.run_stand('🔴 применения progon за сутки: 0\n  🔴 описание обещает --kontrol, в коде его НЕТ: /fixture/checker\nно ОБЕЩАННЫЙ КОНТРОЛЬ ЗРЯЧЕСТИ не найден в коде',1)
        failure=next(s for s in result.stdout.splitlines() if 'FAIL второй учёт:' in s)
        self.assertEqual(result.returncode,1);self.assertIn('/fixture/checker',failure)

if __name__=='__main__':unittest.main()
