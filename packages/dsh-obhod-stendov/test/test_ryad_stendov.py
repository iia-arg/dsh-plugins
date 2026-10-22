"""B-N-2105: ряд длительностей стендов — суд на подставном ryad.tsv и запись ряда настоящими обходчиком/обёрткой.

Run with python3 -B; sudo is used only by the real walker for its own transient fixture scopes (как test_night_abort.py).
No live stand, service, owner channel, registry or installed file is changed; ряд и отметка — во временном каталоге.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

PKG = Path(__file__).resolve().parents[1]
SUD = PKG / 'dorabotki/sud-ryada-stendov.py'
WALKER = PKG / 'dorabotki/vse-stendy-boevye.sh'
WRAPPER = PKG / 'dorabotki/vse-stendy-po-tajmeru.sh'
A, B, C, D = '/x/stend-a.sh', '/x/stend-b.sh', '/x/stend-c.py', '/x/stend-d.mjs'


def stroka(noch, s, sek, kod=0, predel=120, load=1.0, io=2.0, kopiya=0):
    return '\t'.join(map(str, [noch, noch + 'T03:40:00Z', s, '-', sek, kod, predel, kopiya, load, io])) + '\n'


def noch(i):
    return f'2026-10-{i:02d}'


class SudRyada(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory(prefix='B-N-2105-')
        self.ryad = Path(self.t.name) / 'ryad.tsv'
        self.otm = Path(self.t.name) / 'ryad-otmetka'

    def tearDown(self):
        self.t.cleanup()

    def rovnye(self, nochi=range(1, 9)):
        # исправное: ровный ряд, далеко от пределов
        with self.ryad.open('a') as f:
            for i in nochi:
                f.write(stroka(noch(i), A, 42 + i % 2)); f.write(stroka(noch(i), B, 30)); f.write(stroka(noch(i), C, 55, predel=300))

    def sud(self, i, *dop, sejchas=None):
        r = subprocess.run(['python3', '-B', str(SUD), '--ryad', str(self.ryad), '--otmetka', str(self.otm),
                            '--prohod', noch(i) + 'T03:40:00Z', '--sejchas', str(sejchas or 1_800_000_000 + i * 86400), *dop],
                           capture_output=True, text=True, timeout=20)
        return r

    def test_ispravnoe_molchit_porcha_krasneet_snyatie_molchit(self):
        self.rovnye(range(1, 8))
        with self.ryad.open('a') as f:   # ночь 8 — исправная
            f.write(stroka(noch(8), A, 43)); f.write(stroka(noch(8), B, 30)); f.write(stroka(noch(8), C, 55, predel=300))
        r = self.sud(8)
        self.assertEqual((r.returncode, r.stdout), (0, ''), r.stdout + r.stderr)
        # порча: ночь 9 — у A ступенька 1.6× и +25 с, нагрузка вдвое выше базы
        with self.ryad.open('a') as f:
            f.write(stroka(noch(9), A, 68, predel=300, load=2.4, io=5.0)); f.write(stroka(noch(9), B, 30)); f.write(stroka(noch(9), C, 55, predel=300))
        print('     внесено: строка порчи ночи 9 —', sum(1 for l in self.ryad.read_text().splitlines() if l.startswith(noch(9)) and A in l and '\t68\t' in l))
        r = self.sud(9)
        self.assertEqual(r.returncode, 0, r.stderr)
        signaly = [l for l in r.stdout.splitlines() if l.startswith('  СТУПЕНЬКА') or l.startswith('  ДО ПРЕДЕЛА')]
        self.assertEqual(len(signaly), 1, r.stdout)
        for nuzhno in ('СТУПЕНЬКА', A, 'load1 2.4', 'iowait 5.0', 'машина занята', 'НЕ подъём PREDEL'):
            self.assertIn(nuzhno, r.stdout)
        # снятие: ночь 10 — снова ровно → молчит, отметка сброшена
        with self.ryad.open('a') as f:
            f.write(stroka(noch(10), A, 43)); f.write(stroka(noch(10), B, 30)); f.write(stroka(noch(10), C, 55, predel=300))
        r = self.sud(10)
        self.assertEqual((r.returncode, r.stdout), (0, ''), r.stdout + r.stderr)
        self.assertEqual(self.otm.read_text(), '|0')

    def test_prognoz_do_predela_bez_stupenki(self):
        with self.ryad.open('a') as f:
            for i, v in zip(range(1, 6), (50, 60, 70, 80, 90)):
                f.write(stroka(noch(i), D, v, predel=150))   # Тейл–Сен 10 с/ночь; (150−90)/10 = 6 < 7; запас 40 %; 90/65 < 1.5
        r = self.sud(5)
        self.assertIn('ДО ПРЕДЕЛА 90/150', r.stdout); self.assertIn('~6 ночей', r.stdout)
        self.assertNotIn('СТУПЕНЬКА', r.stdout)
        self.assertNotIn('машина занята', r.stdout)

    def test_povtor_tolko_cherez_tri_nochi_ili_pri_smene_sostava(self):
        self.rovnye(range(1, 8))
        with self.ryad.open('a') as f:
            for i in (8, 9, 12):
                f.write(stroka(noch(i), A, 115))   # запас 4 % каждую ночь
        self.assertIn('ДО ПРЕДЕЛА', self.sud(8).stdout)
        self.assertEqual(self.sud(9).stdout, '')          # тот же состав через ночь — молчим
        self.assertIn('ПОВТОР', self.sud(12).stdout)       # через 4 ночи — напоминание

    def test_kod_124_ne_otdelnyj_signal_no_nazvan(self):
        self.rovnye(range(1, 8))
        with self.ryad.open('a') as f:
            f.write(stroka(noch(8), B, 120, kod=124)); f.write(stroka(noch(8), A, 115))
        r = self.sud(8)
        self.assertIn('упёрлись в предел', r.stdout); self.assertIn(B, r.stdout)
        self.assertNotIn('ДО ПРЕДЕЛА 120', r.stdout)
        with self.ryad.open('a') as f:
            f.write(stroka(noch(9), B, 120, kod=124)); f.write(stroka(noch(9), A, 43))
        self.assertEqual(self.sud(9).stdout, '')            # только 124 — молчим (тревожит обходчик)

    def test_nepolnyj_ryad_nazvan_i_kosaya_stroka_ne_v_kanal(self):
        self.rovnye(range(1, 8))
        with self.ryad.open('a') as f:
            f.write(stroka(noch(8), A, 43)); f.write('кривая строка\n')
        r = self.sud(8, '--stendov', '3')
        self.assertIn('РЯД НЕПОЛОН: строк прохода 1 из 3', r.stdout)
        self.assertNotIn('кривая', r.stdout); self.assertIn('не по форме', r.stderr)

    def test_slepota_bez_ryada_i_srez_60_nochej_tem_zhe_fajlom(self):
        r = self.sud(1)
        self.assertEqual(r.returncode, 2); self.assertIn('СЛЕПОТА РЯДА', r.stdout)
        with self.ryad.open('a') as f:
            for i in range(70):
                d = f'2026-{8 + i // 31:02d}-{i % 31 + 1:02d}'
                f.write(stroka(d, A, 43).replace(d + 'T03:40:00Z', d + 'T03:40:00Z'))
        ino = self.ryad.stat().st_ino
        self.assertEqual(self.sud(1).returncode, 0)
        self.assertEqual(len({l.split('\t')[0] for l in self.ryad.read_text().splitlines()}), 60)
        self.assertEqual(self.ryad.stat().st_ino, ino)


class ZapisRyada(unittest.TestCase):
    """Настоящие обходчик и обёртка: строка на стенд сразу после finished; убитый проход оставляет строки до обрыва."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='B-N-2105-walker-')
        self.root = Path(self.temp.name)
        self.alerts = self.root / 'alerts'
        alert = self.root / 'alert'
        alert.write_text('#!/usr/bin/python3\nimport json,sys\nfrom pathlib import Path\n'
                         f'p=Path({str(self.alerts)!r})\n'
                         'with p.open("a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\n')
        alert.chmod(0o755)
        self.paths = [self.root / 'stend-a.sh', self.root / 'stend-b.sh', self.root / 'stend-c.sh']
        for p in self.paths:
            p.write_text('#!/bin/bash\nexit 0\n')
        (self.root / 'inventory').write_text(''.join(str(p) + '\n' for p in self.paths))
        (self.root / 'exceptions').write_text('exceptions: []\n')
        self.ryad = self.root / 'state' / 'ryad.tsv'; self.ryad.parent.mkdir()
        self.env = {**os.environ, 'OBHODCHIK': str(WALKER), 'VSE_STENDY_ALERT': str(alert),
                    'OBLAST_STENDOV': '\n'.join(map(str, self.paths)), 'PERECHEN_STENDOV': str(self.root / 'inventory'),
                    'ISKLYUCHENIYA_STENDOV': str(self.root / 'exceptions'), 'SREDA_STENDOV': '', 'TMPDIR': str(self.root),
                    'VSE_STENDY_PREDEL': '20', 'PYTHONDONTWRITEBYTECODE': '1', 'VSE_STENDY_RYAD': str(self.ryad)}
        self.env.pop('PAKET_IMYA', None)

    def tearDown(self):
        self.temp.cleanup()

    def run_wrapper(self, **changes):
        log = self.root / 'output'
        with log.open('w') as stream:
            r = subprocess.run(['bash', str(WRAPPER)], env={**self.env, **changes}, stdout=stream,
                               stderr=subprocess.STDOUT, text=True, timeout=38)
        return r.returncode, log.read_text()

    def stroki(self):
        return [l.split('\t') for l in self.ryad.read_text().splitlines()] if self.ryad.exists() else []

    def test_polnyj_prohod_stroka_na_kazhdyj_stend(self):
        k, out = self.run_wrapper()
        self.assertEqual(k, 0, out)
        s = self.stroki()
        self.assertEqual([x[2] for x in s], [str(p) for p in self.paths], out)
        for x in s:
            self.assertEqual(len(x), 10, x)
            self.assertEqual((x[3], x[5], x[6]), ('-', '0', '120'), x)   # учётка, код, предел этой ночи
            self.assertRegex(x[1], r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$'); self.assertEqual(x[0], x[1][:10])
            float(x[8]); float(x[9])                                      # load1 и iowait — числа
            self.assertIn(x[7], ('0', '1'))
        self.assertFalse(self.alerts.exists(), out)                       # одна ночь ряда — суд молчит

    def test_bez_ryada_v_srede_ne_pishet(self):
        env = dict(self.env); env.pop('VSE_STENDY_RYAD')
        log = self.root / 'output'
        with log.open('w') as stream:
            r = subprocess.run(['bash', str(WRAPPER)], env=env, stdout=stream, stderr=subprocess.STDOUT, text=True, timeout=38)
        self.assertEqual(r.returncode, 0, log.read_text())
        self.assertFalse(self.ryad.exists())

    def test_obhodchik_napryamuyu_kak_vorota_ne_pishet(self):
        # ворота зовут обходчик сами, со средой ночного юнита (VSE_STENDY_RYAD есть), без id прохода обёртки и с PAKET_IMYA
        for dop in ({}, {'PAKET_IMYA': 'dsh-obhod-stendov'}, {'VSE_STENDY_RYAD_PROHOD': '2026-10-17T03:40:00Z', 'PAKET_IMYA': 'x'}):
            log = self.root / 'output'
            with log.open('w') as stream:
                subprocess.run(['bash', str(WALKER)], env={**self.env, **dop}, stdout=stream, stderr=subprocess.STDOUT, text=True, timeout=38)
            self.assertFalse(self.ryad.exists(), (dop, log.read_text()[-1500:]))

    def test_ubityj_prohod_stroki_do_obryva_ostalis(self):
        self.paths[1].write_text('#!/bin/bash\nsleep 30\n')                 # b висит; общий предел 4 с убивает проход на нём
        k, out = self.run_wrapper(VSE_STENDY_PREDEL='4')
        self.assertEqual(k, 3, out)
        self.assertIn('убит на стенде ' + str(self.paths[1]), out)
        s = self.stroki()
        self.assertEqual([x[2] for x in s], [str(self.paths[0])], out)      # a — записан до обрыва; b и c — нет
        self.assertNotIn('суд не прошёл', out)


if __name__ == '__main__':
    unittest.main(verbosity=2)
