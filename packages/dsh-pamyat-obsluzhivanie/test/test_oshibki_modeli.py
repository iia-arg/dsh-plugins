# RU: B-N-1667 r3: сбой модели на отдельных парах не валит прогон — finding (код 0), пары ждут в очереди; error — при ошибке прогона
#     (journal) или доле сбоев ≥ runner.OSHIBOK_MODELI_DOLYA; строка итога называет «ошибок модели N из M».
#     Подставлено: шаг судьи — лямбда с итогом судьи; тревога — список. Не проверяет: настоящую модель и повтор пары следующей ночью.
# EN: B-N-1667 r3 harness: per-pair model failures make the run a finding; mass failures or run errors make it an error.
import unittest, tempfile, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'src'))
import runner as r


class OshibkiModeli(unittest.TestCase):
    def setUp(self): self.tmp = tempfile.TemporaryDirectory(); self.state = Path(self.tmp.name)/'state'; self.sent = []
    def tearDown(self): self.tmp.cleanup()
    def go(self, itog): return r.execute(self.state, timer=lambda: 'enabled', step=lambda: itog, notify=self.sent.append)
    def sboi(self, n): return [{'key': f'k{i}', 'error': 'JSONDecodeError'} for i in range(n)]

    def test_E1_odin_iz_460_finding(self):
        report, code = self.go({'pending': 152, 'calls': 460, 'reviewed': 459, 'failures': self.sboi(1)})
        self.assertEqual((report['judge']['status'], report['status'], code), ('finding', 'finding', 0))

    def test_E2_odin_iz_odnogo_error(self):
        report, code = self.go({'pending': 1, 'calls': 1, 'reviewed': 0, 'failures': self.sboi(1)})
        self.assertEqual((report['status'], code), ('error', 1))

    def test_E3_desyat_procentov_error(self):
        report, code = self.go({'pending': 46, 'calls': 460, 'reviewed': 414, 'failures': self.sboi(46)})
        self.assertEqual(report['status'], 'error')
        report, code = self.go({'pending': 45, 'calls': 460, 'reviewed': 415, 'failures': self.sboi(45)})
        self.assertEqual(report['status'], 'finding')

    def test_E4_oshibka_zhurnala_error(self):
        report, code = self.go({'accepted': None, 'reviewed': 0, 'pending': None, 'calls': 0, 'error': 'journal'})
        self.assertEqual((report['status'], code), ('error', 1))

    def test_E5_stroka_itoga(self):
        self.go({'pending': 152, 'calls': 460, 'reviewed': 459, 'failures': self.sboi(1)})
        self.assertIn('ошибок модели 1 из 460', self.sent[0])
        self.go({'pending': 0, 'calls': 3, 'reviewed': 3, 'failures': []})
        self.assertIn('ошибок модели 0 из 3', self.sent[1])


if __name__ == '__main__':
    unittest.main()
