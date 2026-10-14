# RU: B-N-1667 r4 (У1 Вениамина): память сбоев модели в состоянии судьи. Настоящий judge.run на временной базе (fixture.py),
#     модель подставная — стабильно падает на паре j-c/j-d; сквозной прогон — runner.execute с шагом judge.run (дочерний процесс).
#     S1: 3 ночи подряд по 1 сбою → finding, finding, error (один раз); S2: на 3-й ночи пара уходит в «отложено», при повторном
#     нахождении в очередь не возвращается, 4-я ночь не error; S3: недельная выдача называет отложенную пару без текстов;
#     S4: пропуск дня рвёт цепочку; S5: повторный прогон в тот же день ночь не прибавляет.
# RU: Не проверяет: настоящую модель, живой agent-alert.
import unittest, tempfile, sys, json, sqlite3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'src')); sys.path.insert(0, str(ROOT/'test'))
import judge as j
import runner as r
j.JOURNAL_WAIT_SECONDS = 0.01


class SboiNochej(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.base = Path(self.tmp.name); self.db = self.base/'copy.db'
        from fixture import create_db
        create_db(self.db)
        c = sqlite3.connect(self.db); c.execute("UPDATE memories SET status='archived'")
        # Приток как в бою: каждую ночь — новая партия из 12 исправных пар (5 партий заведены в базе, в журнал добавляются по одной
        # перед ночью). Сбой 1 из 13 вызовов ≈ 7,7% — ниже порога доли runner.OSHIBOK_MODELI_DOLYA, иначе проба мерила бы порог доли.
        self.partii = [[(f'e{n}-{2*i}', f'e{n}-{2*i+1}') for i in range(12)] for n in range(5)]
        self.ispravnye = [p for partiya in self.partii for p in partiya]
        for name, text in [('j-c', 'ТЕКСТ-ПАРЫ-СО-СБОЕМ один'), ('j-d', 'ТЕКСТ-ПАРЫ-СО-СБОЕМ два')] + [(x, 'Факт ' + x) for p in self.ispravnye for x in p]:
            c.execute("INSERT INTO memories(node_id,content,metadata,created_at,entity_id,status) VALUES(?,?,?,?,?,'active')",
                      (name, text, '{}', '2026-09-27T00:00:00+00:00', 'gamma'))
        c.commit(); c.close()
        self.journal = self.base/'kandidaty-vytesneniya.jsonl'
        self.journal.write_text(''.join(json.dumps({'old': a, 'by': b, 'dist': 0.05, 'put': 'A', 'at': '2026-09-27T12:00:00+00:00'})+'\n'
                                        for a, b in [('j-c', 'j-d')]))
        self.nochej = 0
        self.state = self.base/'state'; self.sent = []

    def tearDown(self): self.tmp.cleanup()

    def model(self, a, b):
        if {a['node_id'], b['node_id']} == {'j-c', 'j-d'}:
            raise json.JSONDecodeError('negodnyj', 'x', 0)
        return {'verdict': 'complementary', 'reason': 'р', 'usage': {}}

    def noch(self, day):
        partiya = self.partii[self.nochej]; self.nochej += 1
        with self.journal.open('a') as f:
            f.write(''.join(json.dumps({'old': a, 'by': b, 'dist': 0.05, 'put': 'A', 'at': '2026-09-27T12:00:00+00:00'})+'\n' for a, b in partiya))
        rep, code = r.execute(self.state, timer=lambda: 'enabled', notify=self.sent.append,
                              step=lambda: j.run(self.db, self.journal, self.state/'judge', self.model, lambda m: None, day=day, limit=40))
        return rep, code

    def st(self): return json.loads((self.state/'judge/state.json').read_text())

    def test_S1_S2_tri_nochi_tretya_error_i_otlozheno(self):
        ishody = [self.noch(d) for d in ('2026-10-01', '2026-10-02', '2026-10-03')]
        self.assertEqual([x[0]['status'] for x in ishody], ['finding', 'finding', 'error'])
        self.assertEqual([x[0]['judge']['sboi_nochej_podryad'] for x in ishody], [1, 2, 3])
        self.assertEqual(ishody[2][1], 1)
        s = self.st(); kl = [k for k, v in s['otlozheno'].items() if {v['a'], v['b']} == {'j-c', 'j-d'}]
        self.assertEqual(len(kl), 1); self.assertNotIn(kl[0], s['queue'])
        rep, code = self.noch('2026-10-04')
        self.assertNotEqual(rep['status'], 'error'); self.assertEqual(rep['judge']['failures'], [])
        self.assertNotIn(kl[0], self.st()['queue'], 'отложенная пара вернулась в очередь')
        self.assertIn('ночей подряд со сбоями 0, отложено пар 1', self.sent[-1])

    def test_S1b_trevoga_odin_raz_na_cepochku(self):
        # Сбои 4 ночи подряд, но пара уходит в отложено на 3-й — 4-й ночи сбоев нет. Проверяем функцию напрямую: 4-я ночь со сбоем не error второй раз.
        st = {'queue': {}}
        ish = [j.uchest_sboi(st, d, [{'key': f'k{d}', 'error': 'E'}], {}, {})[1] for d in ('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04')]
        self.assertEqual(ish, [False, False, True, False])

    def test_S3_vydacha_nazyvaet_otlozhennuyu(self):
        for d in ('2026-10-01', '2026-10-02', '2026-10-03'): self.noch(d)
        rep, _ = self.noch('2026-10-08')
        v = json.loads(Path(rep['judge']['nedelya']['fajl']).read_text()) if Path(rep['judge']['nedelya']['fajl']).exists() else None
        t = '\n'.join(self.sent[1:])
        self.assertIn('j-c ↔ j-d', t); self.assertIn('отложена 2026-10-03 после 3 ночей сбоя модели (JSONDecodeError)', t)
        self.assertNotIn('ТЕКСТ-ПАРЫ-СО-СБОЕМ', t)

    def test_S4_propusk_dnya_rvet_cepochku(self):
        st = {'queue': {}}
        ish = [j.uchest_sboi(st, d, [{'key': 'k', 'error': 'E'}], {}, {})[0] for d in ('2026-10-01', '2026-10-02', '2026-10-04')]
        self.assertEqual(ish, [1, 2, 1])

    def test_S5_povtornyj_progon_dnya_ne_pribavlyaet(self):
        st = {'queue': {}}
        ish = [j.uchest_sboi(st, d, [{'key': 'k', 'error': 'E'}], {}, {})[0] for d in ('2026-10-01', '2026-10-01', '2026-10-02')]
        self.assertEqual(ish, [1, 1, 2])

    # r5 (Вениамин 14:56Z): счёт сбоев пары — подряд по этой паре; запись ключа уходит вместе с вердиктом.
    def noch_f(self, st, day, sboj, uspeh=()):
        para = {'key': 'k', 'a': 'x', 'b': 'y', 'v1': True, 'distance': 0.05, 'paths': []}
        st['queue'] = {'k': para} if 'k' not in st.get('otlozheno', {}) else {}
        return j.uchest_sboi(st, day, [{'key': 'k', 'error': 'E'}] if sboj else [], dict(st['queue']), {'x': {'entity_id': 'g'}}, uspeh)

    def test_S6_sboj_uspeh_sboj_sboj_ne_otlozheno(self):
        st = {}
        self.noch_f(st, '2026-10-01', True); self.noch_f(st, '2026-10-02', False, uspeh=['k'])
        self.noch_f(st, '2026-10-03', True); self.noch_f(st, '2026-10-04', True)
        self.assertNotIn('k', st.get('otlozheno', {}), 'успех не сбросил счёт пары')
        self.noch_f(st, '2026-10-05', True)
        self.assertIn('k', st['otlozheno'])

    def test_S7_tri_podryad_otlozheno(self):
        st = {}
        for d in ('2026-10-01', '2026-10-02', '2026-10-03'): self.noch_f(st, d, True)
        self.assertIn('k', st['otlozheno']); self.assertNotIn('k', st['sboi']['po_klyuchu'])

    def test_S9_klyuch_vybyvshij_bez_verdikta_chistitsya(self):
        # Пара со сбоем выбыла из очереди без вердикта (запись снята/текст изменён/отсечена): её po_klyuchu не копится.
        st = {}
        self.noch_f(st, '2026-10-01', True); self.assertIn('k', st['sboi']['po_klyuchu'])
        st['queue'] = {}
        j.uchest_sboi(st, '2026-10-02', [], {}, {}, ())
        self.assertEqual(st['sboi']['po_klyuchu'], {})

    def test_S8_klyuch_proshedshej_pary_ischezaet(self):
        self.vtoraya_noch_uspeh = False
        def model(a, b):
            if {a['node_id'], b['node_id']} == {'j-c', 'j-d'} and not self.vtoraya_noch_uspeh:
                raise json.JSONDecodeError('negodnyj', 'x', 0)
            return {'verdict': 'complementary', 'reason': 'р', 'usage': {}}
        self.model = model
        self.noch('2026-10-01')
        s = self.st(); k = next(iter(s['sboi']['po_klyuchu'])); self.assertIn(k, s['queue'])
        self.vtoraya_noch_uspeh = True; self.noch('2026-10-02')
        s = self.st(); self.assertIn(k, s['done']); self.assertEqual(s['sboi']['po_klyuchu'], {})


if __name__ == '__main__':
    unittest.main()
