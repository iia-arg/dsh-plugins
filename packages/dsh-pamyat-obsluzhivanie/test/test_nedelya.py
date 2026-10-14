# RU: B-N-1667: читатель вердиктов contradiction — строка «противоречий новых N» в итоге судьи и недельная выдача пар
#     (тексты обеих записей, id, корень) отдельными сообщениями через runner. Настоящий judge.run на временной базе (fixture.py),
#     модель подставная; runner.execute — с подставным шагом судьи и notify-списком.
#     Пробы: N1 новое противоречие считается и попадает в выдачу с текстами; N2 выдача не чаще раза в 7 суток; N3 через 7 суток —
#     снова (пока человек не снял); N4 отметка prosmotreno снимает пару; N5 пара с признаком секрета — только id и вид, синтетический
#     секрет не лежит ни в одном файле состояния; N6 запись изменилась после вердикта — «устарела», без текстов; N7 части ≤ VYDACHA_CHAST;
#     R1 runner шлёт части после итога и удаляет файл; R2 отказ канала — файл остаётся, код 2; R3 строка итога «противоречий новых».
# EN: B-N-1667 harness: contradiction reader — new-contradiction count and the weekly listing via runner.
# RU: Не проверяет: живой agent-alert и Telegram, настоящую модель, ПДн без признака SECRET (тексты уходят как есть).
import unittest, tempfile, sys, json, sqlite3, hashlib, datetime
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'src')); sys.path.insert(0, str(ROOT/'test'))
import judge as j
import runner as r
j.JOURNAL_WAIT_SECONDS = 0.01


class Nedelya(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.base = Path(self.tmp.name); self.db = self.base/'copy.db'
        from fixture import create_db
        create_db(self.db)
        c = sqlite3.connect(self.db); c.execute("UPDATE memories SET status='archived'")
        for name, root, text in [('j-a', 'gamma', 'Сбор нацпарка 500 рублей в день'), ('j-b', 'gamma', 'Сбор нацпарка 350 рублей в день'),
                                 ('j-c', 'gamma', 'test j-c'), ('j-d', 'gamma', 'test j-d')]:
            c.execute("INSERT INTO memories(node_id,content,metadata,created_at,entity_id,status) VALUES(?,?,?,?,?,'active')",
                      (name, text, '{}', '2026-09-27T00:00:00+00:00', root))
        c.commit(); c.close()
        self.journal = self.base/'kandidaty-vytesneniya.jsonl'
        self.journal.write_text(''.join(json.dumps({'old': a, 'by': b, 'dist': 0.05, 'put': 'A', 'at': '2026-09-27T12:00:00+00:00'})+'\n'
                                        for a, b in [('j-a', 'j-b'), ('j-c', 'j-d')]))
        self.state = self.base/'state'

    def tearDown(self): self.tmp.cleanup()

    def model(self, a, b):
        v = 'contradiction' if {a['node_id'], b['node_id']} == {'j-a', 'j-b'} else 'complementary'
        return {'verdict': v, 'reason': 'Разные суммы сбора', 'usage': {'prompt_tokens': 10, 'completion_tokens': 5}}

    def go(self, day): return j.run(self.db, self.journal, self.state, self.model, lambda m: None, day=day, limit=40)

    def vydacha(self, s): return json.loads(Path(s['nedelya']['fajl']).read_text())

    def test_N1_novoe_protivorechie_i_vydacha_s_tekstami(self):
        s = self.go('2026-10-05')
        self.assertEqual(s['protivorechij_novyh'], 1)
        self.assertEqual(s['nedelya']['par'], 1); v = self.vydacha(s); t = '\n'.join(v['chasti'])
        for x in ('j-a', 'j-b', 'gamma', 'Сбор нацпарка 500 рублей', 'Сбор нацпарка 350 рублей', 'Разные суммы сбора'):
            self.assertIn(x, t)
        self.assertNotIn('test j-c', t, 'complementary в выдаче')

    def test_N2_ne_chashche_raza_v_nedelyu(self):
        self.go('2026-10-05'); s = self.go('2026-10-08')
        self.assertIsNone(s['nedelya']); self.assertEqual(s['protivorechij_novyh'], 0)

    def test_N3_cherez_nedelyu_snova(self):
        self.go('2026-10-05'); s = self.go('2026-10-12')
        self.assertEqual(s['nedelya']['par'], 1)

    def test_N4_prosmotreno_snimaet(self):
        s = self.go('2026-10-05'); key = next(k for k, v in json.loads((self.state/'state.json').read_text())['done'].items() if v['verdict'] == 'contradiction')
        (self.state/'prosmotreno.json').write_text(json.dumps({'version': 1, 'pary': {key: {'kto': 'стенд'}}}))
        s = self.go('2026-10-12'); self.assertEqual((s['nedelya']['par'], self.vydacha(s)['chasti']), (0, []))

    def test_N5_sekret_tolko_id_i_vid(self):
        synthetic = 'password=' + 'fixture'*3
        c = sqlite3.connect(self.db); c.execute("update memories set content=? where node_id='j-c'", (synthetic,)); c.commit(); c.close()
        s = self.go('2026-10-05'); t = '\n'.join(self.vydacha(s)['chasti'])
        self.assertEqual(s['nedelya']['par'], 2); self.assertIn('j-c ↔ j-d', t); self.assertIn('признак секрета (password)', t)
        for p in self.state.rglob('*'):
            if p.is_file(): self.assertNotIn(synthetic.encode(), p.read_bytes(), p.name)

    def test_N6_ustarela_bez_tekstov(self):
        self.go('2026-10-05')
        c = sqlite3.connect(self.db); c.execute("update memories set content='Сбор нацпарка 400 рублей' where node_id='j-b'"); c.commit(); c.close()
        s = self.go('2026-10-12'); t = '\n'.join(self.vydacha(s)['chasti'])
        # Старая пара — «устарела» без текстов (прежнего «350» нет); пара с новым текстом судится заново и идёт отдельной строкой.
        self.assertIn('устарела', t); self.assertNotIn('350 рублей', t); self.assertIn('400 рублей', t)

    def test_N7_chasti_ne_dlinnee_predela(self):
        st = {'done': {f'k{i:03}': {'verdict': 'contradiction', 'a': f'x{i}', 'b': f'y{i}', 'day': '2026-10-01', 'reason': 'р'*400} for i in range(12)}}
        rec = {}
        for i in range(12):
            for n in (f'x{i}', f'y{i}'): rec[n] = {'node_id': n, 'entity_id': 'gamma', 'created_at': '2026-10-01', 'content': 'т'*900}
        st['done'] = {j.pair_key(rec[f'x{i}'], rec[f'y{i}']): {**v} for i, v in enumerate(st['done'].values())}
        chasti, par = j.nedelnaya_vydacha(st, rec, {}, [])
        self.assertEqual(par, 12); self.assertGreater(len(chasti), 1)
        self.assertTrue(all(len(c) <= j.VYDACHA_CHAST for c in chasti), [len(c) for c in chasti])
        self.assertEqual(sum(c.count('↔') for c in chasti), 12)


    def test_N8_sekret_v_done_tolko_id(self):
        # Противоречие в done, у записи которого признак секрета (так бывает, если SECRET расширят после вердикта): только id и вид.
        synthetic = 'Bearer ' + 'fixture'*4
        rec = {'x': {'node_id': 'x', 'entity_id': 'gamma', 'created_at': '2026-10-01', 'content': synthetic},
               'y': {'node_id': 'y', 'entity_id': 'gamma', 'created_at': '2026-10-01', 'content': 'обычный текст'}}
        st = {'done': {j.pair_key(rec['x'], rec['y']): {'verdict': 'contradiction', 'a': 'x', 'b': 'y', 'day': '2026-10-01', 'reason': 'р'}}}
        chasti, par = j.nedelnaya_vydacha(st, rec, {}, []); t = '\n'.join(chasti)
        self.assertEqual(par, 1); self.assertIn('признак секрета (Bearer)', t)
        self.assertNotIn(synthetic, t); self.assertNotIn('обычный текст', t)


    def protivorechie_s(self, tekst):
        rec = {'x': {'node_id': 'x', 'entity_id': 'gamma', 'created_at': '2026-10-01', 'content': 'Настройка: ' + tekst},
               'y': {'node_id': 'y', 'entity_id': 'gamma', 'created_at': '2026-10-01', 'content': 'обычный текст'}}
        st = {'done': {j.pair_key(rec['x'], rec['y']): {'verdict': 'contradiction', 'a': 'x', 'b': 'y', 'day': '2026-10-01', 'reason': 'р'}}}
        return '\n'.join(j.nedelnaya_vydacha(st, rec, {}, [])[0])

    def test_N9_tokeny_bota_tolko_id_i_vid(self):
        # B-N-1667 r2 У1: токен бота Telegram (не ловится SECRET) — только id и вид.
        token = '123456789:' + 'AAH' + 'x'*32
        self.assertFalse(j.sensitive_pair({'content': token}, {'content': ''}), 'политика судьи не должна меняться')
        t = self.protivorechie_s(token)
        self.assertIn('x ↔ y', t); self.assertIn('токен бота Telegram', t); self.assertNotIn(token, t); self.assertNotIn('обычный текст', t)

    def test_N10_token_ravno_tolko_id_i_vid(self):
        znach = 'token=' + 'abcDEF0123456789xyz'
        self.assertFalse(j.sensitive_pair({'content': znach}, {'content': ''}))
        t = self.protivorechie_s(znach)
        self.assertIn('token/secret=', t); self.assertNotIn('abcDEF0123456789xyz', t)

    def test_N11_jwt_i_aws(self):
        for vid, znach in (('JWT', 'eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl'), ('AWS', 'AKIA' + 'ABCDEFGHIJKLMNOP')):
            t = self.protivorechie_s(znach); self.assertIn(vid, t); self.assertNotIn(znach, t)

    def test_N12_hex_summa_ne_skryvaet(self):
        # 64-hex (сумма файла) в выдаче не прячется — иначе выдача ослепнет.
        t = self.protivorechie_s('сумма ' + 'a1'*32)
        self.assertIn('a1'*32, t); self.assertIn('обычный текст', t)


class RunnerNedelya(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.p = Path(self.tmp.name); self.state = self.p/'state'; self.sent = []
        self.fajl = self.p/'vydacha-2026-10-05.json'
        self.fajl.write_text(json.dumps({'version': 1, 'chasti': ['часть 1', 'часть 2']}))
    def tearDown(self): self.tmp.cleanup()
    def step(self): return {'pending': 0, 'protivorechij_novyh': 3, 'nedelya': {'fajl': str(self.fajl), 'par': 5, 'chastej': 2}}

    def test_R1_chasti_posle_itoga_fajl_udalen(self):
        report, code = r.execute(self.state, timer=lambda: 'enabled', step=self.step, notify=self.sent.append)
        self.assertEqual(self.sent[1:], ['часть 1', 'часть 2']); self.assertEqual(report['nedelya_delivery'], 'accepted 2')
        self.assertFalse(self.fajl.exists()); self.assertEqual(code, 0)

    def test_R2_otkaz_kanala_fajl_ostaetsya_kod_2(self):
        def notify(m):
            if m == 'часть 2': raise OSError('канал')
            self.sent.append(m)
        report, code = r.execute(self.state, timer=lambda: 'enabled', step=self.step, notify=notify)
        self.assertEqual(report['nedelya_delivery'], 'unknown 2/2'); self.assertTrue(self.fajl.exists()); self.assertEqual(code, 2)

    def test_R3_stroka_itoga(self):
        r.execute(self.state, timer=lambda: 'enabled', step=self.step, notify=self.sent.append)
        self.assertIn('противоречий новых 3', self.sent[0]); self.assertIn('недельная выдача судьи: пар 5, сообщений 2', self.sent[0])


if __name__ == '__main__':
    unittest.main()
