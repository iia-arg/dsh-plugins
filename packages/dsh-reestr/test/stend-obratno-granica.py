#!/usr/bin/env python3
"""3.1.5: обратная сверка (sverit_obratno) и закрытые ящики. Настоящая функция, подставной реестр, частные каталоги.
Run (НЕ от root): python3 -B test/stend-obratno-granica.py [candidate/bin/agent-registry].
Родитель ящика, заявленного закрытым ('0700'), не перечисляется рукой → «граница», не слепота, счёт в OBRATNO_GRANICA.
Родитель НЕзакрытого ящика с тем же отказом → СЛЕПОТА (slep 1), как было. Возврат прав → оба перечисляются.
"""
import importlib.machinery, importlib.util, os, sys, tempfile, unittest
from pathlib import Path

sys.dont_write_bytecode = True
SOURCE = Path(sys.argv.pop(1)) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'bin/agent-registry'
loader = importlib.machinery.SourceFileLoader('registry_obratno', str(SOURCE))
spec = importlib.util.spec_from_loader(loader.name, loader)
R = importlib.util.module_from_spec(spec)
loader.exec_module(R)

def reestr(*kanaly):
    return {'agenty': [{'namerenie': {'polzovatel': f'u{i}', 'kanal': k}} for i, k in enumerate(kanaly)], 'mashina': {}}

class Obratno(unittest.TestCase):
    def setUp(self):
        if os.geteuid() == 0:
            self.skipTest('стенд гоняется НЕ от root: у root отказа перечислить не бывает')
        self.t = tempfile.TemporaryDirectory(prefix='obratno-'); self.addCleanup(self.t.cleanup)
        self.root = Path(self.t.name)

    def roditel(self, name):
        p = self.root / name / 'zakryto'; (p / name).mkdir(parents=True)
        p.chmod(0o000); self.addCleanup(p.chmod, 0o700)
        return str(p / name)

    def sverka(self, d):
        stroki = []
        r = R.sverit_obratno(d, stroki)
        return r, [s for s in stroki if 'zakryto' in s], getattr(R, 'OBRATNO_GRANICA', 0)  # до 3.1.5 счётчика нет

    def test_zakrytyj_granica(self):
        y = self.roditel('zakr')
        (rash, slep), rows, gran = self.sverka(reestr({'yashchik': y, 'yashchik_rezhim': '0700'}))
        self.assertEqual((rash, slep, gran), (0, 0, 1), rows)
        self.assertIn('граница', rows[0])

    def test_nezakrytyj_slepota(self):   # условие (1) Вениамина: иной отказ — СЛЕПОТА
        for rezhim in (None, '1730'):
            with self.subTest(rezhim=rezhim):
                y = self.roditel('otkr' + str(rezhim))
                k = {'yashchik': y} if rezhim is None else {'yashchik': y, 'yashchik_rezhim': rezhim}
                (rash, slep), rows, gran = self.sverka(reestr(k))
                self.assertEqual((slep, gran), (1, 0), rows)
                self.assertIn(R.SLEP, rows[0])

    def test_vozvrat(self):
        y = self.roditel('vozvr'); Path(y).parent.chmod(0o700)
        (rash, slep), rows, gran = self.sverka(reestr({'yashchik': y, 'yashchik_rezhim': '0700'}))
        self.assertEqual((slep, gran, rows), (0, 0, []))

if __name__ == '__main__':
    unittest.main(verbosity=2)
