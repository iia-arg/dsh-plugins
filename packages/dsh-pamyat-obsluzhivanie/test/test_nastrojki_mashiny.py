# RU: Пробы настроек машины: пути реестра агентов и источника ключа берутся из окружения юнита, а не из кода;
#     незаданная настройка — отказ с именем причины; имя узла в текстах тревог — из системы.
#     Подставлено: окружение процесса (patch.dict), запуск pass (subprocess.Popen — заглушка), каталог ключа — временный.
#     Не проверяет: боевую вставку юнита и настоящий pass — это проверка монтажа (MONTAZH).
# EN: Machine settings probes: the agent registry and key source paths come from the unit environment, not the code;
#     a missing setting is a refusal naming the cause; the node name in alert texts comes from the system.
#     Substituted: the process environment (patch.dict), the pass launch (subprocess.Popen is a stub), the key dir is temp.
#     Does not check: the production unit drop-in and the real pass — that is the installation check (MONTAZH).
import unittest, sys, os, importlib, tempfile
from pathlib import Path
from unittest import mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'src'))
import lessons, prepare_key, judge, runner
from lessons_store import Refused

class RegistryTests(unittest.TestCase):
    # RU: Без AGENTS_REGISTRY реестра нет, и load_agents отказывает registry_not_set.
    # EN: Without AGENTS_REGISTRY there is no registry, and load_agents refuses with registry_not_set.
    def test_unset_registry_refuses(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('AGENTS_REGISTRY', None)
            mod = importlib.reload(lessons)
            self.assertIsNone(mod.REGISTRY)
            with self.assertRaisesRegex(Refused, '^registry_not_set$'):
                mod.load_agents(mod.REGISTRY)
        importlib.reload(lessons)

    # RU: С AGENTS_REGISTRY путь реестра берётся ровно из настройки.
    # EN: With AGENTS_REGISTRY the registry path is taken exactly from the setting.
    def test_set_registry_used(self):
        with mock.patch.dict(os.environ, {'AGENTS_REGISTRY': '/srv/proba/agents.yaml'}):
            mod = importlib.reload(lessons)
            self.assertEqual(mod.REGISTRY, Path('/srv/proba/agents.yaml'))
        importlib.reload(lessons)

class KeySourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = mock.patch.object(prepare_key, 'DIRECTORY', Path(self.tmp.name)); self.dir.start()
    def tearDown(self):
        self.dir.stop(); self.tmp.cleanup()

    # RU: Без настроек источника — отказ credential_source_not_set ДО запуска pass.
    # EN: Without key source settings — credential_source_not_set refusal BEFORE pass starts.
    def test_unset_source_refuses_before_pass(self):
        env = {k: v for k, v in os.environ.items() if k not in ('OBSL_KLYUCH_HOME', 'OBSL_KLYUCH_HRANILISHCHE')}
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(prepare_key.subprocess, 'Popen', side_effect=AssertionError('pass запущен')) as popen:
            with self.assertRaisesRegex(RuntimeError, '^credential_source_not_set$'):
                prepare_key.read_key()
            popen.assert_not_called()

    # RU: С настройками pass получает HOME, GNUPGHOME = HOME/.gnupg и PASSWORD_STORE_DIR ровно из них.
    # EN: With the settings pass gets HOME, GNUPGHOME = HOME/.gnupg and PASSWORD_STORE_DIR exactly from them.
    def test_set_source_passed_to_pass(self):
        seen = {}
        class Fake:
            def __init__(self, args, **kw): seen['args'] = args
            def wait(self, timeout=None): return 1
            pid = 0
        env = {'OBSL_KLYUCH_HOME': '/srv/proba-home', 'OBSL_KLYUCH_HRANILISHCHE': '/srv/proba-store'}
        with mock.patch.dict(os.environ, env), mock.patch.object(prepare_key.subprocess, 'Popen', Fake), \
             mock.patch.object(prepare_key.os, 'killpg', lambda *a: None):
            with self.assertRaises(RuntimeError):
                prepare_key.read_key()
        self.assertIn('HOME=/srv/proba-home', seen['args'])
        self.assertIn('GNUPGHOME=/srv/proba-home/.gnupg', seen['args'])
        self.assertIn('PASSWORD_STORE_DIR=/srv/proba-store', seen['args'])

class NodeNameTests(unittest.TestCase):
    # RU: Имя узла в текстах тревог и отчёта — из системы.
    # EN: The node name in alert and report texts comes from the system.
    def test_node_name_from_system(self):
        self.assertEqual(judge.UZEL, os.uname().nodename)
        self.assertEqual(runner.UZEL, os.uname().nodename)

if __name__ == '__main__':
    unittest.main()
