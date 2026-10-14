# RU: B-N-1832: квитанции без связи с OMEGA — в отчёте ступени уроков и в итоге прогона (тревога штатным каналом).
#     Настоящие: lessons.run_stage, local_lessons.mjs, ядро и база агента, svyazat_zadnim (определение и возврат связи),
#     runner.execute (сведение статуса и итоговая строка). Подставлены: писатель OMEGA (Writer), таблица memories
#     подставной OMEGA, канал тревог (список self.sent), судья (лямбда), MainPID.
#     Ловит: связь снята у квитанции, а ступень и итог молчат; «не измерено» (база агента не читается), выданное нулём;
#     число, которое не гаснет после возврата связи.
#     НЕ ловит: настоящую OMEGA и agent-alert; уроки без квитанции omega_verified (их svyazat_zadnim не видит).
# EN: B-N-1832: receipts without an OMEGA link in the lessons stage report and in the run summary.
import unittest,sys,io,json,sqlite3,tempfile,contextlib,hashlib
from pathlib import Path
from unittest import mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
sys.path.insert(0,str(Path(__file__).resolve().parent))
import lessons,svyazat_zadnim,runner
from test_svyaz_omega import sozdat_bazu,BLOCK

MEM='mem-t1832aaaaaaa'

class BezSvyaziTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();r=Path(self.tmp.name);self.home=r/'home';(self.home/'pamyat').mkdir(parents=True)
        self.uroki=self.home/'UROKI-AGENT-T.md';self.uroki.write_text(BLOCK);self.db=self.home/'pamyat/pamyat.db';sozdat_bazu(self.db)
        self.registry=r/'agents.yaml'
        self.registry.write_text('shema: 1\nagenty:\n- imya: agent-t\n  namerenie:\n    sluzhba: agent-t.service\n    dom: '+str(self.home)+'\n    polzovatel: agent-t\n    uroki_file: '+str(self.uroki)+'\n')
        self.state=r/'state';self.omega=r/'omega.db';self.omega.touch();self.out=r/'out';self.sent=[]
        class Writer:
            def __init__(s,db):pass
            def lookup(s,a,src,k,t):return None
            def embedding(s,t):return [1.0]*1024
            def put(s,a,src,k,t,v,raw,path):return {'id':MEM,'legacy':False}
            def close(s):pass
        self.Writer=Writer
        with mock.patch.object(lessons,'assert_omega'):lessons.run_stage(self.state,self.registry,self.omega,Writer)
        c=sqlite3.connect(self.db);text,src=c.execute("SELECT soderzhim,istochnik FROM zapisi WHERE klass='urok'").fetchone();c.close()
        key=lessons.parse_blocks(BLOCK.encode(),str(self.uroki),'agent-t')[0][0]['key']
        o=sqlite3.connect(self.omega)
        o.execute('CREATE TABLE memories(id INTEGER PRIMARY KEY,node_id TEXT,entity_id TEXT,content TEXT,status TEXT,event_type TEXT,source_uri TEXT,metadata TEXT,ttl_seconds INTEGER,valid_until TEXT)')
        o.execute('INSERT INTO memories(node_id,entity_id,content,status,event_type,source_uri,metadata) VALUES(?,?,?,?,?,?,?)',
                  (MEM,'agent-t',text,'active','lesson_learned',src,json.dumps({'source_key':key})))
        o.commit();o.close()
    def tearDown(self):self.tmp.cleanup()
    def stupen(self):
        with mock.patch.object(lessons,'assert_omega'):return lessons.run_stage(self.state,self.registry,self.omega,self.Writer)
    def progon(self):
        # Настоящий runner.execute: ступень уроков в дочернем процессе (fork — подмена assert_omega переходит), судья — лямбда.
        self.sent.clear()
        with mock.patch.object(lessons,'assert_omega'),contextlib.redirect_stdout(io.StringIO()):
            report,kod=runner.execute(self.state,timer=lambda:'enabled',step=lambda:{'pending':0},notify=self.sent.append,
                                      lesson_step=lambda:lessons.run_stage(self.state,self.registry,self.omega,self.Writer))
        return report,kod
    def svyazej(self):
        c=sqlite3.connect(self.db)
        try:return c.execute('SELECT count(*) FROM svyaz_omega').fetchone()[0]
        finally:c.close()

    def test_ispravnoe_porcha_vozvrat(self):
        # 1. исправное: связь есть — 0 и ok, в итоге «без связи=0»
        self.assertEqual(self.svyazej(),1,'стенд: ступень не поставила связь — исправного предмета нет')
        r=self.stupen()
        self.assertEqual((r['bez_svyazi'],r['agents'][0]['svyaz'],r['status']),(0,{'kvitancij':1,'bez_svyazi':0,'itog':{}},'ok'),r)
        rep,kod=self.progon()
        self.assertEqual((rep['status'],kod,len(self.sent)),('ok',0,1),rep);self.assertIn('без связи=0,',self.sent[0])
        # 2. порча: связь снята у одной квитанции (печать внесения — число строк и сумма базы)
        h0=hashlib.sha256(self.db.read_bytes()).hexdigest()
        c=sqlite3.connect(self.db);n=c.execute('DELETE FROM svyaz_omega').rowcount;c.commit();c.close()
        h1=hashlib.sha256(self.db.read_bytes()).hexdigest()
        print(f'\nПОРЧА B-N-1832: снято связей {n}; sha базы {h0[:16]} → {h1[:16]}',file=sys.stderr)
        self.assertEqual(n,1,'порча не внесена');self.assertNotEqual(h0,h1,'порча не внесена: сумма базы прежняя')
        r=self.stupen()
        self.assertEqual((r['bez_svyazi'],r['agents'][0]['svyaz']['itog'],r['agents'][0]['status'],r['status']),
                         (1,{'svyazat:dostavka':1},'finding','finding'),r)
        rep,kod=self.progon()
        self.assertEqual((rep['status'],kod,len(self.sent)),('finding',0,2),rep);self.assertIn('без связи=1,',self.sent[0])
        self.assertIn('🔴',self.sent[1]);self.assertIn('уроки без связи с OMEGA: 1 (agent-t=1)',self.sent[1]);self.assertEqual(rep.get('svyaz_delivery'),'accepted')
        # 3. возврат: связь ставит сама команда svyazat_zadnim --v-boj — снова 0 и ok
        with mock.patch.object(lessons,'REGISTRY',self.registry),mock.patch.object(svyazat_zadnim,'mainpid',return_value=0),contextlib.redirect_stdout(io.StringIO()):
            kod=svyazat_zadnim.main(['--agent','agent-t','--v-boj','--state',str(self.state/'lessons.json'),'--db',str(self.db),
                                     '--omega-db',str(self.omega),'--kopiya-v',str(self.out/'kopii'),'--spisok-v',str(self.out/'spiski')])
        self.assertEqual((kod,self.svyazej()),(0,1),'возврат: команда не поставила связь')
        r=self.stupen();self.assertEqual((r['bez_svyazi'],r['status']),(0,'ok'),r)
        rep,kod=self.progon()
        self.assertEqual((rep['status'],len(self.sent)),('ok',1),rep);self.assertIn('без связи=0,',self.sent[0])

    def test_ne_izmereno_ne_nol(self):
        # База агента не читается (её нет): «не измерено» с именем агента и finding, а не 0.
        # Пустая OMEGA сюда не годится: при локальной связи perechen отвечает 'uzhe', не читая OMEGA (svyazat_zadnim.proverit).
        self.db.rename(self.db.with_name('pamyat.db.ubrana'))
        r=self.stupen()
        self.assertIsNone(r['agents'][0]['svyaz']['bez_svyazi'],r);self.assertEqual(r['bez_svyazi_ne_izmereno'],['agent-t'])
        self.assertEqual(r['status'],'finding')
        rep,kod=self.progon();self.assertEqual(rep['status'],'finding',rep);self.assertIn('(не измерено: agent-t)',self.sent[0])
        self.assertEqual(len(self.sent),2,'нет отдельной строки тревоги при «не измерено»');self.assertIn('не измерено: agent-t',self.sent[1])

    def test_trevoga_ne_dostavlena_kod_2(self):
        # Канал отказал ровно на строке тревоги «без связи» — исход unknown и код 2, как у итога
        c=sqlite3.connect(self.db);c.execute('DELETE FROM svyaz_omega');c.commit();c.close()
        def kanal(m):
            if m.startswith('🔴'):raise RuntimeError('канал')
            self.sent.append(m)
        with mock.patch.object(lessons,'assert_omega'),contextlib.redirect_stdout(io.StringIO()):
            rep,kod=runner.execute(self.state,timer=lambda:'enabled',step=lambda:{'pending':0},notify=kanal,
                                   lesson_step=lambda:lessons.run_stage(self.state,self.registry,self.omega,self.Writer))
        self.assertEqual((rep.get('svyaz_delivery'),kod),('unknown',2),rep)

if __name__=='__main__':unittest.main()
