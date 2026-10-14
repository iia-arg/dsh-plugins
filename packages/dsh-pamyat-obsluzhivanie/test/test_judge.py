# RU: Тесты судьи пар вытеснения (src/judge.py): порядок пар, рост очереди, проверка вердикта, HTTP-контракт модели, страж секретов, цена, чтение журнала кандидатов и полный прогон judge.run на временной базе.
# EN: Tests for the supersession pair judge (src/judge.py): pair order, queue growth, verdict validation, model HTTP contract, secret guard, price, candidate journal reading and a full judge.run on a temporary database.
# RU: Подставлено: HTTP модели — mock urlopen, ключ — строка-заглушка; модель в IntegrationTests — метод self.model; старое хранилище — замороженная копия fixtures/v1-store.py; ожидание журнала сокращено до 0,01 с.
# EN: Substituted: model HTTP is a mocked urlopen, the key is a stub string; the IntegrationTests model is self.model; the old store is the frozen copy fixtures/v1-store.py; journal wait is cut to 0.01 s.
# RU: Не проверяет: настоящий API и тарифы поставщика, боевое хранилище OMEGA, сеть.
# EN: Does not check: the real provider API and prices, the production OMEGA store, the network.
import importlib.util
import json
import tempfile
import sqlite3
import hashlib
import shutil
import datetime
import os
import sys
import threading
from unittest import mock
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('judge', ROOT / 'src/judge.py')
j = importlib.util.module_from_spec(spec)
spec.loader.exec_module(j)
j.JOURNAL_WAIT_SECONDS = 0.01

class JudgeTests(unittest.TestCase):
    # RU: Пары из журнала старого хранилища (v1) идут первыми даже при большем расстоянии.
    # EN: Pairs from the old store journal (v1) come first even when more distant.
    # RU: B-N-1618: границы политики очереди — V1 по V1_MAX_DIST включительно, сосед по SOSED_MIN_SIM.
    # EN: B-N-1618: queue policy bounds — V1 by V1_MAX_DIST inclusive, neighbour by SOSED_MIN_SIM.
    def test_v_politike_granicy(self):
        self.assertTrue(j.v_politike({'v1':True,'distance':0.10}))
        self.assertFalse(j.v_politike({'v1':True,'distance':0.1001}))
        self.assertTrue(j.v_politike({'v1':False,'distance':0.07}))
        self.assertFalse(j.v_politike({'v1':False,'distance':0.09}))

    def test_v1_first_even_when_more_distant(self):
        pairs = [{'key':'ordinary','v1':False,'distance':0.01},
                 {'key':'candidate','v1':True,'distance':0.45}]
        self.assertEqual(j.order_pairs(pairs, {} )[0]['key'], 'candidate')

    # RU: Рост очереди — только четыре дня подряд со строго растущей очередью; отсутствие роста, разрыв дат и короткая история ростом не считаются.
    # EN: Queue growth means four consecutive days of strictly increasing queue; no increase, a date gap or a short history is not growth.
    def test_four_consecutive_dates_and_duplicate_date(self):
        history = {'2026-09-24':1, '2026-09-25':2, '2026-09-26':3}
        self.assertTrue(j.queue_growth(history, '2026-09-27', 4))
        self.assertFalse(j.queue_growth(history, '2026-09-27', 3))
        self.assertFalse(j.queue_growth(history, '2026-09-28', 5))
        self.assertFalse(j.queue_growth({'2026-09-26':3}, '2026-09-27', 4))

    # RU: Ответ модели не может подменить поля пары (key, v1). Ловит внедрение полей из ответа модели.
    # EN: The model answer cannot replace pair fields (key, v1). Catches field injection from the model answer.
    def test_verdict_cannot_replace_pair_fields(self):
        verdict = j.checked_verdict({'verdict':'same','reason':'ok','key':'attacker','v1':False})
        self.assertNotIn('key',verdict)
        self.assertNotIn('v1',verdict)

    # RU: Контракт запроса: thinking выключен, модель deepseek-flash, max_tokens 512, ответ JSON, таймаут 30 с; лишние поля ответа отбрасываются. Без настоящего ключа и сети.
    # EN: Request contract: thinking disabled, model deepseek-flash, max_tokens 512, JSON response, 30 s timeout; extra answer fields are dropped. No real key or network.
    def test_deepseek_http_contract_without_key_or_network(self):
        client=j.DeepSeek();client.key='stub-key'
        response=mock.MagicMock()
        response.__enter__.return_value.read.return_value=json.dumps({'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'verdict':'same','reason':'ok','key':'evil'})}}], 'usage':{'prompt_tokens':100,'completion_tokens':10}}).encode()
        record={'node_id':'x','entity_id':'gamma','created_at':'2026-09-27','content':'текст'}
        with mock.patch.object(j.urllib.request,'urlopen',return_value=response) as request:
            answer=client(record,record)
        payload=json.loads(request.call_args.args[0].data)
        self.assertEqual(payload['thinking'],{'type':'disabled'})
        self.assertEqual(payload['model'],'deepseek-flash')
        self.assertEqual(payload['max_tokens'],512)
        self.assertEqual(payload['response_format'],{'type':'json_object'})
        self.assertNotIn('key',answer)
        self.assertEqual(request.call_args.kwargs['timeout'],30)

    # RU: Текст с признаком секрета отвергается до чтения ключа и до HTTP. Ловит отправку секрета наружу.
    # EN: Text with a secret marker is refused before the key is read and before HTTP. Catches sending a secret out.
    def test_secret_guard_before_key_and_http(self):
        client=j.DeepSeek()
        record={'node_id':'x','entity_id':'gamma','created_at':'2026-09-27','content':'password='+('fixture'*3)}
        response=mock.MagicMock()
        response.__enter__.return_value.read.return_value=json.dumps({'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'verdict':'same','reason':'stub'})}}]}).encode()
        with mock.patch.object(j.subprocess,'run',return_value=mock.Mock(stdout='stub-key')) as key, mock.patch.object(j.urllib.request,'urlopen',return_value=response) as http:
            with self.assertRaises(ValueError):
                client(record,record)
        key.assert_not_called();http.assert_not_called()

    # RU: Цена по usage для льготного и пикового тарифа; без usage — None, а не 0.
    # EN: Price from usage for off-peak and peak rates; without usage — None, not 0.
    def test_price_known_usage_and_unknown(self):
        cost = j.price({'prompt_tokens':1000,'completion_tokens':100,'prompt_cache_hit_tokens':100})
        self.assertAlmostEqual(cost['offpeak_usd'],0.0001953)
        self.assertAlmostEqual(cost['peak_usd'],0.0003906)
        self.assertIsNone(j.price({}))

    # RU: Незавершённая строка под замком писателя — TimeoutError (недоступно), без замка — JournalDamage. Ловит ложную тревогу о порче во время записи.
    # EN: An incomplete line under the writer lock is TimeoutError (unavailable), without the lock JournalDamage. Catches a false damage alarm during a write.
    def test_incomplete_held_by_writer_is_unavailable_not_damage(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'journal'
            path.write_text('{')
            with path.open('a') as writer:
                j.fcntl.flock(writer,j.fcntl.LOCK_EX|j.fcntl.LOCK_NB)
                with self.assertRaises(TimeoutError):
                    j.read_journal(path)
            with self.assertRaises(j.JournalDamage):
                j.read_journal(path)

    # RU: Хвост, дописанный за время ожидания, читается без тревоги.
    # EN: A tail completed during the wait is read without an alarm.
    def test_incomplete_tail_completes_without_false_alarm(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'journal';path.write_text('{')
            row={'old':'a','by':'b','dist':0.1,'put':'A','at':'2026-09-27'}
            def finish(seconds):
                path.write_text(json.dumps(row)+'\n')
            with mock.patch.object(j.time,'sleep',side_effect=finish):
                self.assertEqual(j.read_journal(path),[row])

    # RU: Целый журнал читается; строка без перевода строки, пустой объект, битый JSON и NaN — порча.
    # EN: A complete journal is read; a line without newline, an empty object, broken JSON and NaN are damage.
    def test_journal_complete_tail_and_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'candidates.jsonl'
            row = {'old':'a','by':'b','dist':0.1,'put':'A','at':'2026-09-27T12:00:00+00:00'}
            path.write_text(json.dumps(row)+'\n')
            self.assertEqual(j.read_journal(path), [row])
            for bad in [json.dumps(row), '{}\n', '{broken}\n', json.dumps({**row,'dist':float('nan')})+'\n']:
                path.write_text(bad)
                with self.assertRaises(j.JournalDamage):
                    j.read_journal(path)

# RU: Каждый тест: копия базы с 4 активными записями одного корня и 2 без корня, журнал из 3 пар; tearDown сверяет сумму базы — судья не пишет в память.
# EN: Each test: a database copy with 4 active records of one root and 2 without a root, a 3-pair journal; tearDown compares the database hash — the judge never writes to memory.
class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.db = self.base / 'copy.db'
        from fixture import create_db
        create_db(self.db)
        c = sqlite3.connect(self.db)
        c.execute("UPDATE memories SET status='archived'")
        for name, root in [('j-a','gamma'),('j-b','gamma'),('j-c','gamma'),('j-d','gamma'),('j-empty-a',None),('j-empty-b',None)]:
            c.execute("INSERT INTO memories(node_id,content,metadata,created_at,entity_id,status) VALUES(?,?,?, ?,?,'active')", (name,'test '+name,'{}','2026-09-27T00:00:00+00:00',root))
        c.commit()
        c.close()
        self.journal = self.base / 'kandidaty-vytesneniya.jsonl'
        self.rows = [{'old':a,'by':b,'dist':0.1,'put':put,'at':'2026-09-27T12:00:00+00:00'} for a,b,put in [('j-a','j-b','A'),('j-c','j-d','B'),('j-empty-a','j-empty-b','A')]]
        self.journal.write_text(''.join(json.dumps(x)+'\n' for x in self.rows))
        self.alerts=[]
        self.calls=[]
        self.original = hashlib.sha256(self.db.read_bytes()).hexdigest()

    def tearDown(self):
        self.assertEqual(hashlib.sha256(self.db.read_bytes()).hexdigest(), self.original, 'judge changed database')
        self.tmp.cleanup()

    def model(self, a, b):
        self.calls.append((a['node_id'],b['node_id']))
        return {'verdict':'complementary','reason':'Разные факты','usage':{'prompt_tokens':100,'completion_tokens':20}}

    def go(self, model=None, day='2026-09-27', limit=40):
        return j.run(self.db,self.journal,self.base/'state',model or self.model,self.alerts.append,day=day,limit=limit)

    # RU: Очередь переживает прогоны (limit=1: разобрана 1, в очереди 2); пара без корня тоже разбирается; каждый прогон — одна тревога и отчёт .md.
    # EN: The queue persists across runs (limit=1: 1 reviewed, 2 queued); a pair without a root is reviewed too; each run sends one alert and writes a .md report.
    def test_queue_persists_and_empty_root(self):
        r=self.go(limit=1)
        self.assertEqual((r['accepted'],r['reviewed'],r['pending'],r['calls']),(3,1,2,1))
        r=self.go()
        self.assertEqual((r['accepted'],r['reviewed'],r['pending']),(0,2,0))
        r=self.go()
        self.assertEqual(r['calls'],0)
        self.assertIn(('j-empty-a','j-empty-b'),self.calls)
        self.assertEqual(len(self.alerts),3)
        self.assertTrue(list((self.base/'state/reports').glob('*.md')))

    # RU: Битый журнал: очередь «не измерено» (None), модель не вызывается, тревога о ремонте. Ловит ложный ноль.
    # EN: A damaged journal: queue "not measured" (None), the model is not called, a repair alert is sent. Catches a false zero.
    def test_damage_alert_and_no_model_no_false_zero(self):
        self.journal.write_text(self.journal.read_text()+'{')
        r=self.go()
        self.assertIsNone(r['pending'])
        self.assertEqual(self.calls,[])
        self.assertIn('журнал кандидатов требует ремонта',self.alerts[0])
        self.assertIn('не измерено',self.alerts[0])

    # RU: Недопустимый вердикт модели оставляет пары в очереди; повтор их разбирает.
    # EN: An invalid model verdict keeps pairs queued; a rerun reviews them.
    def test_bad_model_is_pending_and_retry(self):
        r=self.go(lambda a,b: {'verdict':'delete','reason':'bad'})
        self.assertEqual((r['reviewed'],r['pending']),(0,3))
        r=self.go()
        self.assertEqual((r['reviewed'],r['pending']),(3,0))

    # RU: Пара, найденная по настоящим векторам (sqlite_vec), идёт после пар журнала: при limit=3 остаётся в очереди и разбирается следующим прогоном; покрытие векторами — 2.
    # EN: A pair found by real vectors (sqlite_vec) is ordered after journal pairs: with limit=3 it stays queued and is reviewed on the next run; vector coverage is 2.
    def test_real_vectors_priority_and_inactive(self):
        import sqlite_vec
        import numpy as np
        c=sqlite3.connect(self.db)
        c.enable_load_extension(True)
        sqlite_vec.load(c)
        c.enable_load_extension(False)
        for name in ('j-a','j-c'):
            rowid=c.execute('select id from memories where node_id=?',(name,)).fetchone()[0]
            vec=np.zeros(1024,dtype=np.float32);vec[0]=1
            c.execute('insert into memories_vec(rowid,embedding) values(?,?)',(rowid,vec.tobytes()))
        c.commit();c.close()
        self.original=hashlib.sha256(self.db.read_bytes()).hexdigest()
        r=self.go(limit=3)
        self.assertEqual((r['reviewed'],r['pending']),(3,1))
        self.assertNotIn(('j-a','j-c'),self.calls)
        self.assertEqual(r['coverage']['vectors'],2)
        r=self.go()
        self.assertEqual(r['pending'],0)
        self.assertIn(('j-a','j-c'),self.calls)

    # RU: B-N-1618: политика очереди — строка V1 с dist ≤ V1_MAX_DIST берётся, дальше — нет (счёт journal_out_of_policy_rows).
    # EN: B-N-1618: queue policy — a V1 row with dist <= V1_MAX_DIST is taken, farther is not (journal_out_of_policy_rows).
    def test_politika_v1_po_rasstoyaniyu(self):
        rows=[dict(self.rows[0],dist=j.V1_MAX_DIST),dict(self.rows[1],dist=j.V1_MAX_DIST+0.01)]
        self.journal.write_text(''.join(json.dumps(x)+'\n' for x in rows))
        r=self.go()
        self.assertEqual((r['accepted'],r['reviewed'],r['pending']),(1,1,0))
        self.assertEqual(self.calls,[('j-a','j-b')])
        self.assertEqual(r['coverage']['journal_out_of_policy_rows'],1)

    # RU: B-N-1618: соседи по настоящим векторам — сходство 0,93 ≥ SOSED_MIN_SIM в очередь, 0,91 — нет (прежний порог 0,80 взял бы обе).
    # EN: B-N-1618: real-vector neighbours — similarity 0.93 >= SOSED_MIN_SIM is queued, 0.91 is not (the old 0.80 took both).
    def test_politika_sosedi_po_shodstvu(self):
        import sqlite_vec
        import numpy as np
        self.journal.write_text(json.dumps(self.rows[2])+'\n')
        c=sqlite3.connect(self.db)
        c.enable_load_extension(True);sqlite_vec.load(c);c.enable_load_extension(False)
        def vec(os_, sim=None):
            v=np.zeros(1024,dtype=np.float32)
            if sim is None: v[os_]=1
            else: v[os_]=sim; v[os_+1]=(1-sim*sim)**0.5
            return v
        for name,v in (('j-a',vec(0)),('j-b',vec(0,0.93)),('j-c',vec(2)),('j-d',vec(2,0.91))):
            rowid=c.execute('select id from memories where node_id=?',(name,)).fetchone()[0]
            c.execute('insert into memories_vec(rowid,embedding) values(?,?)',(rowid,v.tobytes()))
        c.commit();c.close()
        self.original=hashlib.sha256(self.db.read_bytes()).hexdigest()
        r=self.go()
        self.assertEqual((r['accepted'],r['reviewed'],r['pending']),(2,2,0))
        self.assertIn(('j-a','j-b'),self.calls)
        self.assertFalse({('j-c','j-d'),('j-d','j-c')} & set(self.calls))

    # RU: B-N-1618: пара, принятая до политики и теперь вне её, снимается из очереди при прогоне (otsecheno), а не ждёт судью.
    # EN: B-N-1618: a pair accepted before the policy and now outside it is dropped from the queue on a run (otsecheno).
    def test_politika_snimaet_staruyu_ochered(self):
        r=self.go(limit=0)
        self.assertEqual(r['pending'],3)
        st=self.base/'state/state.json';d=json.loads(st.read_text())
        key=[k for k,p in d['queue'].items() if p['a']=='j-c'][0]
        d['queue'][key]['distance']=0.2;st.write_text(json.dumps(d))
        self.journal.write_text(''.join(json.dumps(x)+'\n' for x in [self.rows[0],dict(self.rows[1],dist=0.2),self.rows[2]]))
        r=self.go(limit=0)
        self.assertEqual((r['pending'],r['otsecheno']),(2,1))

    # RU: Дубли строк журнала и строка с отсутствующей записью: принято 3 уникальные пары, неактивных строк 1.
    # EN: Duplicate journal rows and a row pointing to a missing record: 3 unique pairs accepted, 1 inactive row.
    def test_duplicate_rows_and_inactive_endpoint(self):
        self.journal.write_text(''.join(json.dumps(x)+'\n' for x in self.rows+[self.rows[0],dict(self.rows[0],put='B'),dict(self.rows[0],by='missing')]))
        r=self.go()
        self.assertEqual((r['accepted'],r['reviewed']),(3,3))
        self.assertEqual(r['coverage']['journal_inactive_rows'],1)

    # RU: Дневной предел сохраняется в состоянии и при повторе не сбрасывается; на следующие UTC-сутки вызовы возобновляются.
    # EN: The daily limit is kept in state and not reset on rerun; calls resume on the next UTC day.
    def test_daily_call_budget_survives_repeat(self):
        self.go(limit=1)
        path=self.base/'state/state.json'
        state=json.loads(path.read_text());state['calls']['2026-09-27']=j.MAX_CALLS
        path.write_text(json.dumps(state))
        r=self.go()
        self.assertEqual((r['calls'],r['pending']),(0,2))
        r=self.go(day='2026-09-28')
        self.assertEqual((r['calls'],r['pending']),(2,0))

    # RU: Очередь переживает ротацию (обнуление) журнала.
    # EN: The queue survives journal rotation (truncation).
    def test_pending_survives_journal_rotation(self):
        r=self.go(limit=0)
        self.assertEqual(r['pending'],3)
        self.journal.write_text('')
        r=self.go()
        self.assertEqual((r['reviewed'],r['pending']),(3,0))

    # RU: Смена UTC-суток во время прогона: новых вызовов нет, очередь из 3 сохраняется. Ловит вызовы, засчитанные не в те сутки.
    # EN: A UTC day change mid-run: no new calls, the 3-pair queue is kept. Catches calls counted against the wrong day.
    def test_no_call_after_utc_day_changes(self):
        original=j.dt.datetime
        class Clock(original):
            ticks=0
            @classmethod
            def now(cls,tz=None):
                cls.ticks+=1
                return original(2026,9,27 if cls.ticks<3 else 28,tzinfo=j.UTC)
        with mock.patch.object(j.dt,'datetime',Clock):
            r=j.run(self.db,self.journal,self.base/'state',self.model,self.alerts.append)
        self.assertEqual(r['calls'],0)
        self.assertEqual(r['pending'],3)

    # RU: Чтение журнала не блокирует настоящего писателя старого хранилища: запись кандидата посреди чтения проходит, повторное чтение видит 4 строки. Писатель законно меняет базу, поэтому сумма для tearDown снимается заново.
    # EN: Journal reading does not block the real old-store writer: a candidate written mid-read succeeds and a reread sees 4 rows. The writer legitimately changes the database, so the tearDown hash is retaken.
    def test_reader_does_not_block_actual_v1_writer(self):
        code=ROOT/'test/fixtures'
        spec=importlib.util.spec_from_file_location('omega.sqlite_store._v1_fixture',code/'v1-store.py')
        mod=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        StoreMixin=mod.StoreMixin
        import inspect
        self.assertEqual(Path(inspect.getfile(StoreMixin.record_supersession_candidate)).resolve(),(code/'v1-store.py').resolve())
        store=StoreMixin()
        store.db_path=self.db
        store._conn=sqlite3.connect(self.db)
        store._lock=threading.RLock()
        store._invalidate_query_cache=lambda:None
        store._commit=store._conn.commit
        original=json.loads
        fired=[]
        def parse(data,*args,**kwargs):
            if not fired:
                fired.append(True)
                store.record_supersession_candidate('j-a','j-c',0.2,'B')
            return original(data,*args,**kwargs)
        try:
            with mock.patch.object(j.json,'loads',side_effect=parse):
                j.read_journal(self.journal)
            rows=j.read_journal(self.journal)
            self.assertEqual(len(rows),4)
            metadata=original(store._conn.execute("select metadata from memories where node_id='j-a'").fetchone()[0])
            self.assertEqual(metadata['kandidat_vytesneniya'][-1]['by'],'j-c')
        finally:
            store._conn.close()
            self.original=hashlib.sha256(self.db.read_bytes()).hexdigest()

    # RU: Пара с секретом остаётся в очереди без внешнего вызова; секрет не попадает ни в тревоги, ни в файлы состояния.
    # EN: A pair with a secret stays queued without an external call; the secret appears neither in alerts nor in state files.
    def test_secret_pair_stays_pending_without_external_call(self):
        synthetic='password='+('fixture'*3)
        c=sqlite3.connect(self.db)
        c.execute("update memories set content=? where node_id='j-a'",(synthetic,))
        c.commit();c.close()
        self.original=hashlib.sha256(self.db.read_bytes()).hexdigest()
        r=self.go()
        self.assertEqual((r['reviewed'],r['pending'],r['calls']),(2,1,2))
        self.assertEqual(r['secret_pairs'],1)
        self.assertNotIn(('j-a','j-b'),self.calls)
        self.assertNotIn(synthetic,''.join(self.alerts))
        for p in (self.base/'state').rglob('*'):
            if p.is_file():
                self.assertNotIn(synthetic.encode(),p.read_bytes())

    # RU: Суточные итоги не сбрасываются между прогонами одних суток.
    # EN: Daily totals are not reset between runs of the same day.
    def test_daily_totals_not_reset(self):
        self.go(limit=1)
        r=self.go()
        self.assertEqual(r['daily_totals'],{'accepted':3,'reviewed':3})
        self.assertIn('кандидатов принято 3 · разобрано 3',self.alerts[-1])

    # RU: Каталог состояния, содержащий источник (базу или журнал), отвергается до записи.
    # EN: A state directory containing the source (database or journal) is refused before any write.
    def test_state_root_cannot_contain_source(self):
        with self.assertRaises(ValueError):
            j.run(self.db,self.journal,self.base,self.model,self.alerts.append)
        self.assertFalse((self.base/'state.json').exists())

    # RU: Отсутствующий журнал — «не измерено», а не пустая очередь.
    # EN: A missing journal is "not measured", not an empty queue.
    def test_missing_journal_is_not_empty(self):
        self.journal.unlink()
        r=self.go()
        self.assertIsNone(r['pending'])
        self.assertEqual(self.calls,[])

    # RU: Сбой отправки тревоги не теряет вердикты: повтор не зовёт модель заново.
    # EN: An alert send failure does not lose verdicts: a rerun does not call the model again.
    def test_alert_failure_preserves_verdicts(self):
        def fail(message):
            raise OSError('alert unavailable')
        with self.assertRaises(OSError):
            j.run(self.db,self.journal,self.base/'state',self.model,fail)
        count=len(self.calls)
        r=self.go()
        self.assertEqual(len(self.calls),count)
        self.assertEqual(r['pending'],0)

    # RU: Исключение модели не утекает в тревоги и файлы состояния; пары остаются в очереди.
    # EN: A model exception does not leak into alerts or state files; pairs stay queued.
    def test_model_exception_not_leaked(self):
        def fail(a,b):
            raise RuntimeError('secret-value-not-to-print')
        r=self.go(fail)
        self.assertEqual(r['pending'],3)
        self.assertNotIn('secret-value-not-to-print',''.join(self.alerts))
        for p in (self.base/'state').rglob('*'):
            if p.is_file():
                self.assertNotIn(b'secret-value-not-to-print',p.read_bytes())

if __name__ == '__main__':
    unittest.main(verbosity=2)
