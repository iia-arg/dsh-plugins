# RU: Тесты сверки счёта записей локальной памяти агентов (src/memory_count.py) и её вызова из ночного прогона runner.execute.
# EN: Tests for the agents’ local memory record count check (src/memory_count.py) and its call from the nightly runner.execute.
# RU: Подставлено: базы pamyat.db — копии маленькой затравочной базы во временном каталоге; реестр агентов — временный agents.yaml в JSON; внешняя тревога — скрипт-заглушка, пишущий stdin в файл; судья и проверка целостности — заглушки. Читатель ядра (node) — настоящий.
# EN: Substituted: pamyat.db databases are copies of a small seed database in a temporary directory; the agent registry is a temporary agents.yaml in JSON; the external alert is a stub script writing stdin to a file; the judge and integrity check are stubs. The core reader (node) is real.
# RU: Не проверяет: боевые базы и боевой реестр агентов, настоящую доставку тревоги.
# EN: Does not check: production agent databases and registry, real alert delivery.
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import memory_count as m
import runner


class MemoryCountTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='count-copies-')
        self.root = Path(self.tmp.name)
        self.home = self.root / 'probe'
        self.db = self.home / 'pamyat/pamyat.db'
        self.db.parent.mkdir(parents=True)
        seed = self.root / 'seed.db'
        with sqlite3.connect(seed) as c:
            c.executescript('''CREATE TABLE zapisi(id INTEGER PRIMARY KEY, agent TEXT);
                CREATE TABLE zhurnal(agent TEXT, ishod TEXT, priroda TEXT);
                CREATE TABLE nastrojki(kluch TEXT PRIMARY KEY, znachenie TEXT, postavleno INTEGER);
                INSERT INTO zapisi VALUES(1,'probe'),(2,'probe'),(3,'other');
                INSERT INTO zhurnal VALUES('probe','zapisano',NULL),('probe','zapisano',NULL);
                INSERT INTO nastrojki VALUES('schet_zapisey:probe','0',1);''')
        # RU: Все порчи ниже идут по этой копии, никогда не по затравке и не по живой базе.
        # EN: Every mutation below targets this copy, never seed or a live database.
        shutil.copyfile(seed, self.db)
        self.agents = [{'agent': 'probe', 'home': str(self.home)}]

    def tearDown(self):
        self.tmp.cleanup()

    def digest(self):
        return hashlib.sha256(self.db.read_bytes()).hexdigest()

    # RU: Здоровая база — ok без тревог и без записи в базу; порча (удалена запись, суммы до/после печатаются) — finding с новой разницей 1; возврат записи — снова ok.
    # EN: A healthy database is ok with no alerts and no writes; damage (a deleted record, hashes printed before/after) is a finding with a new difference of 1; restoring the record is ok again.
    def test_healthy_delete_restore_and_no_writes(self):
        before = self.digest()
        healthy = m.run_stage(self.agents)
        self.assertEqual(healthy['status'], 'ok')
        self.assertEqual(healthy['checked'], 1)
        self.assertEqual((healthy['agents'][0]['zapisano'], healthy['agents'][0]['otmetokZapisano']), (2, 2))
        self.assertEqual(healthy['alerts'], [])
        self.assertEqual(self.digest(), before)
        with sqlite3.connect(self.db) as c:
            changed = c.execute('DELETE FROM zapisi WHERE id=1').rowcount
        damaged = self.digest()
        print('CORRUPTION copy=', self.db, 'deleted=', changed, 'before=', before, 'after=', damaged)
        self.assertEqual(changed, 1)
        self.assertNotEqual(damaged, before)
        bad = m.run_stage(self.agents)
        self.assertEqual(bad['status'], 'finding')
        self.assertEqual(bad['mismatches'], 1)
        self.assertEqual(bad['agents'][0]['novayaRaznica'], 1)
        self.assertIn('probe', bad['alerts'][0])
        self.assertIn('новое 1', bad['alerts'][0])
        self.assertEqual(self.digest(), damaged)
        with sqlite3.connect(self.db) as c:
            c.execute("INSERT INTO zapisi VALUES(1,'probe')")
        restored = m.run_stage(self.agents)
        self.assertEqual(restored['status'], 'ok')
        self.assertEqual(restored['alerts'], [])

    # RU: Пустой перечень агентов — error и «0/0», а не зелёный итог.
    # EN: An empty agent list is error and "0/0", not green.
    def test_empty_coverage_not_green(self):
        result = m.run_stage([])
        self.assertEqual(result['status'], 'error')
        self.assertIn('0/0', m.summary(result))

    # RU: Пропущенная база называется поимённо, покрытие 1/2 — error; отсутствующий каталог не создаётся.
    # EN: A missing database is named, coverage 1/2 is error; the missing directory is not created.
    def test_partial_coverage_names_missing_database_and_does_not_create_it(self):
        self.agents.append({'agent': 'missing', 'home': str(self.root / 'missing')})
        result = m.run_stage(self.agents)
        self.assertEqual((result['checked'], result['expected']), (1, 2))
        self.assertEqual(result['status'], 'error')
        self.assertIn('missing', m.summary(result))
        self.assertFalse((self.root / 'missing').exists())

    # RU: Испорченная или отсутствующая отметка отсечки — error без записи в базу; отрицательная историческая разница допустима (ok), а новая запись после отсечки даёт новую разницу -1.
    # EN: A corrupt or missing cutoff mark is error with no database writes; a negative historical difference is allowed (ok), and a new record after the cutoff gives a new difference of -1.
    def test_cutoff_missing_invalid_historical_negative(self):
        with sqlite3.connect(self.db) as c:
            c.execute("UPDATE nastrojki SET znachenie='bad'")
        self.assertEqual(m.run_stage(self.agents)['status'], 'error')
        with sqlite3.connect(self.db) as c:
            c.execute('DELETE FROM nastrojki')
        before = self.digest()
        self.assertEqual(m.run_stage(self.agents)['status'], 'error')
        self.assertEqual(self.digest(), before)
        with sqlite3.connect(self.db) as c:
            c.execute("INSERT INTO nastrojki VALUES('schet_zapisey:probe','-1',1)")
            c.execute("INSERT INTO zapisi VALUES(4,'probe')")
        self.assertEqual(m.run_stage(self.agents)['status'], 'ok')
        with sqlite3.connect(self.db) as c:
            c.execute("INSERT INTO zapisi VALUES(5,'probe')")
        self.assertEqual(m.run_stage(self.agents)['agents'][0]['novayaRaznica'], -1)

    # RU: Повтор агента или одна база под двумя именами — не покрытие, error.
    # EN: A repeated agent or one database under two names is not coverage, error.
    def test_duplicate_identity_or_database_is_not_coverage(self):
        self.assertEqual(m.run_stage(self.agents * 2)['status'], 'error')
        self.assertEqual(m.run_stage(self.agents + [{'agent': 'alias', 'home': str(self.home)}])['status'], 'error')

    # RU: Ночной вызывающий передаёт итог сверки в тревогу (баз 1/1, расхождений 1/1).
    # EN: The nightly caller passes the check result into the alert (databases 1/1, mismatches 1/1).
    def test_nightly_caller_and_reader_file_capture(self):
        with sqlite3.connect(self.db) as c:
            c.execute('DELETE FROM zapisi WHERE id=1')
        capture = self.root / 'alert.txt'
        def notify(message):
            capture.write_text(message)
        result, code = runner.execute(self.root / 'state', timer=lambda: 'enabled',
            step=lambda: {'pending': 0}, count_step=lambda: m.run_stage(self.agents), notify=notify)
        self.assertEqual(result['status'], 'finding')
        self.assertEqual(result['memory_count']['checked'], 1)
        self.assertEqual(code, 0)
        text = capture.read_text()
        for expected in ['баз 1/1', 'расхождений 1/1', 'probe', 'новое 1']:
            self.assertIn(expected, text)

    # RU: Пустое покрытие в ночном прогоне — error и ненулевой код.
    # EN: Empty coverage in the nightly run is error with a non-zero code.
    def test_nightly_empty_coverage_fails(self):
        result, code = runner.execute(self.root / 'state', timer=lambda: 'enabled',
            step=lambda: {'pending': 0}, count_step=lambda: m.run_stage([]), notify=lambda _: None)
        self.assertEqual(result['status'], 'error')
        self.assertNotEqual(code, 0)

    # RU: Девять баз и настоящая отправка через заглушку тревоги: в тексте все 9 агентов, длина меньше 3500 знаков.
    # EN: Nine databases and a real send through the alert stub: all 9 agents are in the text, length under 3500 characters.
    def test_nine_databases_actual_send_with_external_alert_stub(self):
        agents = []
        for i in range(9):
            name = 'agent' + str(i)
            home = self.root / name
            db = home / 'pamyat/pamyat.db'
            db.parent.mkdir(parents=True)
            shutil.copyfile(self.db, db)
            with sqlite3.connect(db) as c:
                c.execute('UPDATE zapisi SET agent=? WHERE agent=?', (name, 'probe'))
                c.execute('UPDATE zhurnal SET agent=?', (name,))
                c.execute('UPDATE nastrojki SET kluch=?', ('schet_zapisey:' + name,))
                c.execute('DELETE FROM zapisi WHERE id=1')
            agents.append({'agent': name, 'home': str(home)})
        capture = self.root / 'agent-alert-stdin.txt'
        stub = self.root / 'agent-alert.py'
        stub.write_text('import sys\nfrom pathlib import Path\n'
                        'assert sys.argv[2:] == ["--plain"]\n'
                        'Path(sys.argv[1]).write_text(sys.stdin.read())\n')
        actual_run = runner.subprocess.run
        def transport(argv, **kwargs):
            if argv[0] == '/usr/local/bin/agent-alert':
                return actual_run([sys.executable, '-B', str(stub), str(capture), *argv[1:]], **kwargs)
            self.assertEqual(argv[0], '/usr/local/bin/node')
            return actual_run(argv, **kwargs)
        registry = self.root / 'agents.yaml'
        registry.write_text(json.dumps({'shema': 1, 'agenty': [
            {'imya': a['agent'], 'namerenie': {'dom': a['home'], 'polzovatel': 'probe'}} for a in agents]}))
        # RU: Новый вызывающий использует настоящий загрузчик реестра и настоящий читатель ядра.
        # EN: The new caller uses the real registry loader and real core reader.
        # RU: Подменены только не относящаяся к делу работа с OMEGA и внешний транспорт тревоги.
        # EN: Only unrelated OMEGA work and the external alert transport are replaced.
        with patch.object(runner.subprocess, 'run', side_effect=transport), \
                patch.object(runner.lessons, 'REGISTRY', registry), \
                patch.object(runner.judge, 'run', return_value={'pending': 0}), \
                patch.object(runner, 'integrity', return_value={}):
            report, code = runner.execute(self.root / 'state', timer=lambda: 'enabled',
                db=self.root / 'unused-omega.db', journal=self.root / 'unused.jsonl',
                lesson_step=lambda: {'status': 'ok'}, chistka_step=lambda: {'status': 'ok'}, notify=runner.send)
        self.assertEqual(code, 0)
        self.assertEqual(report['delivery'], 'accepted')
        text = capture.read_text()
        self.assertIn('баз 9/9, расхождений 9/9', text)
        for a in agents:
            self.assertIn('агента ' + a['agent'] + ':', text)
        self.assertLess(len(text), 3500)

    # RU: Таймаут работника сверки не теряет знаменатель реестра: ожидалось 9, в тревоге «не измерено/9», код 1.
    # EN: A count worker timeout keeps the registry denominator: 9 expected, "not measured/9" in the alert, code 1.
    def test_production_worker_timeout_keeps_registry_denominator(self):
        names = ['agent' + str(i) for i in range(9)]
        registry = self.root / 'agents.yaml'
        registry.write_text(json.dumps({'shema': 1, 'agenty': [
            {'imya': name, 'namerenie': {'dom': str(self.root / name), 'polzovatel': 'probe'}} for name in names]}))
        actual_stage = runner.stage
        def short_count(step, target, timeout, timer):
            return actual_stage(step, target, .02 if target.name.endswith('.count.json') else timeout, timer)
        sent = []
        with patch.object(runner, 'stage', side_effect=short_count), \
                patch.object(runner.lessons, 'REGISTRY', registry), \
                patch.object(runner.memory_count, 'run_stage', side_effect=lambda _: time.sleep(1)), \
                patch.object(runner.judge, 'run', return_value={'pending': 0}), \
                patch.object(runner, 'integrity', return_value={}):
            report, code = runner.execute(self.root / 'state', timer=lambda: 'enabled',
                db=self.root / 'unused.db', journal=self.root / 'unused.jsonl',
                lesson_step=lambda: {'status': 'ok'}, chistka_step=lambda: {'status': 'ok'}, notify=sent.append)
        self.assertEqual(code, 1)
        self.assertEqual(report['status'], 'error')
        self.assertEqual(report['memory_count']['status'], 'timeout')
        self.assertEqual(report['memory_count']['expected_agents'], names)
        self.assertIn('баз не измерено/9', sent[0])
        saved = json.loads((self.root / 'state/latest.json').read_text())
        self.assertEqual(saved['memory_count']['expected'], 9)


if __name__ == '__main__':
    unittest.main(verbosity=2)
