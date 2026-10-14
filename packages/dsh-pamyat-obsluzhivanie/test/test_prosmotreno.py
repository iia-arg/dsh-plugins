"""RU: Граница слова у признака ключа sk- и ручная отметка «просмотрено человеком» (src/prosmotreno.py + judge.run). / EN: Word boundary for the sk- key marker and the manual "reviewed by a human" mark (src/prosmotreno.py + judge.run)."""
# RU: Подставлено: временная база-копия с одной парой, содержащей признак секрета; модель — метод self.model; STATE и DB модуля prosmotreno перенаправлены во временный каталог.
# EN: Substituted: a temporary database copy with one pair carrying a secret marker; the model is self.model; STATE and DB of the prosmotreno module point to a temporary directory.
# RU: Не проверяет: боевое состояние судьи, права на файл отметок, вывод перечня в боевом окружении.
# EN: Does not check: the production judge state, mark file permissions, listing output in production.
import fcntl
import hashlib
import importlib.util
import io
import json
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def zagruzit(imya):
    spec = importlib.util.spec_from_file_location(imya, ROOT / f'src/{imya}.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


j = zagruzit('judge')
j.JOURNAL_WAIT_SECONDS = 0.01
pr = zagruzit('prosmotreno')


class SkGranica(unittest.TestCase):
    # RU: sk- считается признаком ключа только с левой границей слова; внутри путей и имён задач — нет. Ловит ложные секретные пары.
    # EN: sk- counts as a key marker only with a left word boundary; not inside paths or task names. Catches false secret pairs.
    def test_sk_needs_left_boundary(self):
        hvost = 'a1b2c3d4e5f6g7h8i9j0'
        for t in (f'sk-{hvost}', f'ключ sk-{hvost}', f'(sk-{hvost})'):
            self.assertTrue(j.SECRET.search(t), t)
        for t in (f'/backups/uborka-vypusk-{hvost}', f'do-razdela-disk-{hvost}', f'task-{hvost}'):
            self.assertFalse(j.SECRET.search(t), t)


class Prosmotreno(unittest.TestCase):
    # RU: Каждый тест: 4 активные записи, у одной в тексте признак секрета, журнал из 2 пар; tearDown сверяет, что база не изменилась.
    # EN: Each test: 4 active records, one with a secret marker in its text, a 2-pair journal; tearDown checks that the database is unchanged.
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.db = self.base / 'copy.db'
        from fixture import create_db
        create_db(self.db)
        c = sqlite3.connect(self.db)
        c.execute("UPDATE memories SET status='archived'")
        for name in ('j-a', 'j-b', 'j-c', 'j-d'):
            c.execute("INSERT INTO memories(node_id,content,metadata,created_at,entity_id,status) VALUES(?,?,?,?,?,'active')",
                      (name, 'test ' + name, '{}', '2026-09-27T00:00:00+00:00', 'gamma'))
        c.execute("update memories set content=? where node_id='j-a'", ('password=' + 'fixture' * 3,))
        c.commit(); c.close()
        self.journal = self.base / 'kandidaty-vytesneniya.jsonl'
        rows = [{'old': a, 'by': b, 'dist': 0.1, 'put': 'A', 'at': '2026-09-27T12:00:00+00:00'} for a, b in (('j-a', 'j-b'), ('j-c', 'j-d'))]
        self.journal.write_text(''.join(json.dumps(x) + '\n' for x in rows))
        self.state = self.base / 'state'
        pr.STATE, pr.DB = self.state, self.db
        self.calls = []
        self.original = hashlib.sha256(self.db.read_bytes()).hexdigest()

    def tearDown(self):
        self.assertEqual(hashlib.sha256(self.db.read_bytes()).hexdigest(), self.original, 'память изменена')
        self.tmp.cleanup()

    def model(self, a, b):
        self.calls.append((a['node_id'], b['node_id']))
        return {'verdict': 'complementary', 'reason': 'Разные факты', 'usage': {'prompt_tokens': 1, 'completion_tokens': 1}}

    def go(self):
        return j.run(self.db, self.journal, self.state, self.model, lambda m: None, day='2026-09-27')

    def cmd(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            kod = pr.main(list(argv))
        return kod, out.getvalue() + err.getvalue()

    def sekretnyj_klyuch(self):
        q = json.loads((self.state / 'state.json').read_text())['queue']
        (key,) = [k for k, p in q.items() if {p['a'], p['b']} == {'j-a', 'j-b'}]
        return key

    # RU: Отметка снимает признак секрета, судья пару не зовёт; перечень не печатает тексты записей.
    # EN: The mark clears the secret flag and the judge does not call the pair; the listing never prints record texts.
    def test_otmetka_snimaet_secret_i_ne_zovyot_sudyu(self):
        r = self.go()
        self.assertEqual((r['secret_pairs'], r['prosmotreno']), (1, 0))
        key = self.sekretnyj_klyuch()
        kod, vyvod = self.cmd('spisok')
        self.assertEqual(kod, 0); self.assertIn(key, vyvod); self.assertIn('secret', vyvod)
        self.assertNotIn('fixture' * 3, vyvod, 'список не печатает тексты')
        kod, vyvod = self.cmd('otmetit', key, 'Проверяющий', 'проба: учебная строка, не секрет')
        self.assertEqual(kod, 0, vyvod)
        self.calls.clear(); r = self.go()
        self.assertEqual((r['secret_pairs'], r['prosmotreno'], r['pending']), (0, 1, 0))
        self.assertNotIn(('j-a', 'j-b'), self.calls); self.assertNotIn(('j-b', 'j-a'), self.calls)
        d = json.loads((self.state / 'prosmotreno.json').read_text())
        self.assertEqual(d['pary'][key]['kto'], 'Проверяющий')

    # RU: Правка записи меняет ключ пары — старая отметка больше не действует.
    # EN: Editing a record changes the pair key — the old mark no longer applies.
    def test_pravka_zapisi_menyaet_klyuch_otmetka_ne_deystvuet(self):
        self.go(); key = self.sekretnyj_klyuch()
        self.assertEqual(self.cmd('otmetit', key, 'Проверяющий', 'проба')[0], 0)
        c = sqlite3.connect(self.db); c.execute("update memories set content=? where node_id='j-a'", ('password=' + 'drugoe' * 3,)); c.commit(); c.close()
        self.original = hashlib.sha256(self.db.read_bytes()).hexdigest()
        r = self.go()
        self.assertEqual((r['secret_pairs'], r['prosmotreno']), (1, 0))

    # RU: Снятие отметки возвращает пару в счёт секретных.
    # EN: Removing the mark returns the pair to the secret count.
    def test_snyat_vozvrashchaet_v_schet(self):
        self.go(); key = self.sekretnyj_klyuch()
        self.assertEqual(self.cmd('otmetit', key, 'Проверяющий', 'проба')[0], 0)
        self.go()
        self.assertEqual(self.cmd('snyat', key, 'Проверяющий', 'передумала')[0], 0)
        r = self.go()
        self.assertEqual((r['secret_pairs'], r['prosmotreno']), (1, 0))

    # RU: Отказы с кодом 2: неизвестный ключ, пустое имя, пустая причина, --dry-run, нехватка аргументов, снятие несуществующей отметки, занятый замок прогона; файл отметок не создаётся.
    # EN: Refusals with code 2: unknown key, empty name, empty reason, --dry-run, missing arguments, removing a non-existent mark, a held run lock; no mark file is created.
    def test_otkazy(self):
        self.go(); key = self.sekretnyj_klyuch()
        self.assertEqual(self.cmd('otmetit', 'f' * 64, 'Проверяющий', 'проба')[0], 2)
        self.assertEqual(self.cmd('otmetit', key, ' ', 'проба')[0], 2)
        self.assertEqual(self.cmd('otmetit', key, 'Проверяющий', '')[0], 2)
        self.assertEqual(self.cmd('--dry-run')[0], 2)
        self.assertEqual(self.cmd('otmetit', key, 'Проверяющий')[0], 2)
        self.assertEqual(self.cmd('snyat', key, 'Проверяющий', 'не было')[0], 2)
        with (self.state / 'lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            kod, vyvod = self.cmd('otmetit', key, 'Проверяющий', 'проба')
        self.assertEqual(kod, 2); self.assertIn('прогон', vyvod)
        self.assertFalse((self.state / 'prosmotreno.json').exists(), 'после отказов отметок нет')

    # RU: Файл отметок неизвестной версии — ошибка ValueError, а не догадка.
    # EN: A mark file of unknown version raises ValueError instead of guessing.
    def test_bityj_fajl_otmetok_ne_ugadyvaetsya(self):
        self.go()
        (self.state / 'prosmotreno.json').write_text('{"version": 2}')
        with self.assertRaises(ValueError):
            self.go()


if __name__ == '__main__':
    unittest.main()
