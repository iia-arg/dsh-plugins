# RU: B-N-1831: повтор get/save ступени уроков при «database is locked» и текст ошибки в квитанции.
#     Настоящие: lessons.local_s_povtorom/run_stage, local_lessons.mjs, ядро и база агента (создана ядром). Замок держит
#     второе соединение sqlite3 (BEGIN IMMEDIATE — как пишущий секретарь агента) в отдельном потоке заданное время.
#     Подставлен: писатель OMEGA (Writer).
#     Ловит: отказ при замке короче суммы пауз; повтор без предела (замок дольше — обязан быть отказ, ровно 2 повтора);
#     квитанцию без текста ошибки; текст, оставшийся в квитанции после доставки.
#     НЕ ловит: замок читателя (SHARED) и EXCLUSIVE — их гоняет zond-povtor.py на копии боевой базы; гонку в настоящей ночи.
# EN: B-N-1831: lessons stage retry on "database is locked" and the error text in the receipt.
import unittest,sys,sqlite3,tempfile,threading,time
from pathlib import Path
from unittest import mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
sys.path.insert(0,str(Path(__file__).resolve().parent))
import lessons
from test_svyaz_omega import sozdat_bazu,BLOCK

class Zamok:
    """Второе соединение держит RESERVED (BEGIN IMMEDIATE) sek секунд; внесение проверяется до выхода из __enter__."""
    def __init__(s,db,sek):s.db=db;s.sek=sek;s.gotov=threading.Event()
    def _derzhat(s):
        c=sqlite3.connect(s.db,isolation_level=None,timeout=0);c.execute('BEGIN IMMEDIATE');s.gotov.set()
        time.sleep(s.sek);c.execute('ROLLBACK');c.close()
    def __enter__(s):
        s.t=threading.Thread(target=s._derzhat);s.t.start();s.gotov.wait(5)
        c=sqlite3.connect(s.db,isolation_level=None,timeout=0)
        try:c.execute('BEGIN IMMEDIATE');c.execute('ROLLBACK');s.vneseno=False
        except sqlite3.OperationalError:s.vneseno=True
        finally:c.close()
        print(f'\nЗАМОК B-N-1831: держу {s.sek} с, внесение (BEGIN IMMEDIATE timeout=0 занят) = {s.vneseno}',file=sys.stderr)
        return s
    def __exit__(s,*a):s.t.join()

class ZamokPovtorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();r=Path(self.tmp.name);self.home=r/'home';(self.home/'pamyat').mkdir(parents=True)
        self.uroki=self.home/'UROKI-AGENT-Z.md';self.uroki.write_text(BLOCK);self.db=self.home/'pamyat/pamyat.db';sozdat_bazu(self.db)
        self.registry=r/'agents.yaml';self.state=r/'state';self.omega=r/'omega.db';self.omega.touch()
        self.registry.write_text('shema: 1\nagenty:\n- imya: agent-z\n  namerenie:\n    dom: '+str(self.home)+'\n    polzovatel: agent-z\n    uroki_file: '+str(self.uroki)+'\n')
        self.block=lessons.parse_blocks(BLOCK.encode(),str(self.uroki),'agent-z')[0][0]
        self.text=lessons.local('prepare','agent-z',None,self.block)['text']
        class Writer:
            def __init__(s,db):pass
            def lookup(s,a,src,k,t):return None
            def embedding(s,t):return [1.0]*1024
            def put(s,a,src,k,t,v,raw,path):return {'id':'mem-t1831aaaaaaa','legacy':False}
            def close(s):pass
        self.Writer=Writer
    def tearDown(self):self.tmp.cleanup()
    def save(self,rep):return lessons.local_s_povtorom('save','agent-z',self.db,self.block,self.text,rep)

    def test_bez_zamka_srazu(self):
        rep={};row=self.save(rep);self.assertIsNotNone(row['id']);self.assertEqual(rep.get('zamok_povtorov',0),0)

    def test_zamok_koroche_predela_dostavleno(self):
        rep={}
        with Zamok(self.db,0.7) as z:
            self.assertTrue(z.vneseno,'порча не внесена');row=self.save(rep)
        self.assertIsNotNone(row['id'],'при замке 0,7 с (< суммы пауз) урок не записан');self.assertGreaterEqual(rep.get('zamok_povtorov',0),1)

    def test_zamok_dolshe_predela_otkaz_s_tekstom(self):
        rep={}
        with Zamok(self.db,sum(lessons.LOCK_PAUZY)+8) as z:
            self.assertTrue(z.vneseno,'порча не внесена')
            with self.assertRaises(lessons.Refused) as cm:self.save(rep)
        self.assertEqual(str(cm.exception),'ERR_SQLITE_ERROR');self.assertIn('database is locked',cm.exception.detail or '')
        self.assertEqual(rep.get('zamok_povtorov',0),lessons.LOCK_POPYTOK-1,'повторов не ровно предел')

    def test_kvitanciya_s_tekstom_i_vozvrat(self):
        with Zamok(self.db,sum(lessons.LOCK_PAUZY)+8) as z:
            self.assertTrue(z.vneseno,'порча не внесена')
            with mock.patch.object(lessons,'assert_omega'):r=lessons.run_stage(self.state,self.registry,self.omega,self.Writer)
        rec=next(iter(__import__('json').loads((self.state/'lessons.json').read_text())['records'].values()))
        self.assertEqual((r['refused'],rec['status'],rec['reason']),(1,'pending','ERR_SQLITE_ERROR'),r)
        self.assertIn('database is locked',rec.get('reason_detail',''));self.assertIn('database is locked',r['agents'][0]['issues'][0].get('detail',''))
        with mock.patch.object(lessons,'assert_omega'):r=lessons.run_stage(self.state,self.registry,self.omega,self.Writer)
        rec=next(iter(__import__('json').loads((self.state/'lessons.json').read_text())['records'].values()))
        self.assertEqual((r['refused'],rec['status']),(0,'omega_verified'),r);self.assertNotIn('reason_detail',rec,'текст отказа остался после доставки')

if __name__=='__main__':unittest.main()
