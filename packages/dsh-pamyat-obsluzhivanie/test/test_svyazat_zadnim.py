# RU: Стенд разовой команды src/svyazat_zadnim.py (A-N-1731/A-N-1732). Подставная база агента создаётся настоящим ядром;
#     урок пишет настоящая ступень уроков (run_stage + local_lessons.mjs), затем связь снимается — урок «до 1.1.17».
#     OMEGA — подставная таблица memories (только поля, которые читает lessons_store.verify); MainPID службы подменён.
#     Ловит: --suho, что пишет; --v-boj без связи/без списка/без копии; повтор со второй связью; откат, оставляющий связь
#     или отметку; проход при живой службе без ключа; ключ без причины или не с --v-boj; связь при несошедшемся тексте узла.
#     НЕ ловит: настоящую OMEGA и systemctl (подменены), гонку с живым агентом.
# EN: Harness for the one-off backfill command: real core and stage, stub OMEGA table and MainPID.
import unittest,sys,os,io,json,sqlite3,tempfile,contextlib,hashlib
from pathlib import Path
from unittest import mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
sys.path.insert(0,str(Path(__file__).resolve().parent))
import lessons,svyazat_zadnim
from test_svyaz_omega import sozdat_bazu,BLOCK

MEM='mem-t1732aaaaaaa'

class SvyazatZadnimTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();r=Path(self.tmp.name);self.r=r;self.home=r/'home';(self.home/'pamyat').mkdir(parents=True)
        self.uroki=self.home/'UROKI-AGENT-T.md';self.uroki.write_text(BLOCK);self.db=self.home/'pamyat/pamyat.db';sozdat_bazu(self.db)
        self.registry=r/'agents.yaml'
        self.registry.write_text('shema: 1\nagenty:\n- imya: agent-t\n  namerenie:\n    sluzhba: agent-t.service\n    dom: '+str(self.home)+'\n    polzovatel: agent-t\n    uroki_file: '+str(self.uroki)+'\n')
        self.state=r/'state';self.omega=r/'omega.db';self.omega.touch()
        class Writer:
            def __init__(s,db):pass
            def lookup(s,a,src,k,t):return None
            def embedding(s,t):return [1.0]*1024
            def put(s,a,src,k,t,v,raw,path):return {'id':MEM,'legacy':False}
            def close(s):pass
        with mock.patch.object(lessons,'assert_omega'):lessons.run_stage(self.state,self.registry,self.omega,Writer)
        # урок «до 1.1.17»: связи нет
        c=sqlite3.connect(self.db);c.execute('DELETE FROM svyaz_omega');c.commit()
        self.zid,self.text,self.src=c.execute("SELECT id,soderzhim,istochnik FROM zapisi WHERE klass='urok'").fetchone();c.close()
        key=lessons.parse_blocks(BLOCK.encode(),str(self.uroki),'agent-t')[0][0]['key']
        o=sqlite3.connect(self.omega)
        o.execute('CREATE TABLE memories(id INTEGER PRIMARY KEY,node_id TEXT,entity_id TEXT,content TEXT,status TEXT,event_type TEXT,source_uri TEXT,metadata TEXT,ttl_seconds INTEGER,valid_until TEXT)')
        o.execute('INSERT INTO memories(node_id,entity_id,content,status,event_type,source_uri,metadata) VALUES(?,?,?,?,?,?,?)',
                  (MEM,'agent-t',self.text,'active','lesson_learned',self.src,json.dumps({'source_key':key})))
        o.commit();o.close()
        self.out=r/'out'
    def tearDown(self):self.tmp.cleanup()
    def go(self,*args,pid=0):
        buf=io.StringIO()
        with mock.patch.object(lessons,'REGISTRY',self.registry),mock.patch.object(svyazat_zadnim,'mainpid',return_value=pid,create=True) as m,contextlib.redirect_stdout(buf):
            kod=svyazat_zadnim.main(['--agent','agent-t','--state',str(self.state/'lessons.json'),'--db',str(self.db),'--omega-db',str(self.omega),
                                     '--kopiya-v',str(self.out/'kopii'),'--spisok-v',str(self.out/'spiski'),*args])
        self.mainpid_zvan=[c.args for c in m.call_args_list]
        lines=[l for l in buf.getvalue().splitlines() if l.strip()]
        return kod,(json.loads(lines[-1]) if lines else None)
    def q(self,sql,*a):
        c=sqlite3.connect(self.db)
        try:return c.execute(sql,a).fetchall()
        finally:c.close()
    def svyazi(self):return self.q('SELECT zapis_id,mem_id,kak FROM svyaz_omega')
    def sha(self):return hashlib.sha256(self.db.read_bytes()).hexdigest()

    def test_suho_perechen_bez_zapisi(self):
        h=self.sha();kod,r=self.go('--suho')
        self.assertEqual((kod,r.get('svyazhet'),r.get('itog')),(0,1,{'svyazat:dostavka':1}),r)
        self.assertEqual(self.sha(),h,'--suho изменил базу')

    def test_v_boj_svyazyvaet_povtor_bez_vtoroj_otkat(self):
        zh0=self.q('SELECT count(*) FROM zhurnal')[0][0]
        kod,r=self.go('--v-boj')
        self.assertEqual(kod,0,r);self.assertEqual(r.get('itog'),{'svyazano:dostavka':1})
        self.assertEqual(self.svyazi(),[(self.zid,MEM,'dostavka')],'связи нет после --v-boj')
        self.assertTrue(Path(r['kopiya']).is_file(),'нет копии базы до прохода')
        self.assertEqual(self.mainpid_zvan,[('agent-t.service',)],'MainPID спрошен не у службы из реестра')
        shapka=json.loads(Path(r['spisok']).read_text().splitlines()[0])
        self.assertEqual(shapka['sluzhba'],{'imya':'agent-t.service','mainpid':0})
        kopiya_do=Path(r['kopiya']).read_bytes()
        try:kod2,r2=self.go('--v-boj')
        except Exception as e:self.fail('повтор --v-boj в ту же секунду упал: '+repr(e)[:160])
        self.assertEqual(kod2,0,'повтор --v-boj отказал: '+json.dumps(r2,ensure_ascii=False))
        self.assertEqual(r2.get('itog'),{'uzhe:ta_zhe':1},'повтор дал вторую связь');self.assertEqual(len(self.svyazi()),1)
        self.assertNotEqual(r2['kopiya'],r['kopiya'],'повтор в ту же секунду взял путь копии первого прохода')
        self.assertEqual(Path(r['kopiya']).read_bytes(),kopiya_do,'повтор перезаписал копию «до» первого прохода')
        kod3,r3=self.go('--otkat',r['spisok'])
        self.assertEqual((kod3,r3.get('snyato_svyazej'),r3.get('snyato_otmetok')),(0,1,1),r3)
        self.assertEqual(self.svyazi(),[],'откат оставил связь');self.assertEqual(self.q('SELECT count(*) FROM zhurnal')[0][0],zh0,'откат оставил отметку журнала')

    def test_zhivaya_sluzhba_otkaz_bez_klyucha(self):
        h=self.sha();kod,r=self.go('--v-boj',pid=4242)
        self.assertEqual((kod,r),(2,{'otkaz':'sluzhba_zhiva'}));self.assertEqual(self.sha(),h,'при отказе база изменена')
        self.assertFalse((self.out/'kopii').exists(),'при отказе снята копия — отказ должен быть до действия')

    def test_zhivaya_sluzhba_s_klyuchom_i_prichinoj(self):
        kod,r=self.go('--v-boj','--pri-zhivoj-sluzhbe','пустой ход, решение (а) ворот',pid=4242)
        self.assertEqual(kod,0,r);self.assertEqual(r.get('pri_zhivoj_sluzhbe'),{'mainpid':4242,'prichina':'пустой ход, решение (а) ворот'})
        shapka=json.loads(Path(r['spisok']).read_text().splitlines()[0])
        self.assertEqual(shapka['sluzhba']['pri_zhivoj'],'пустой ход, решение (а) ворот');self.assertEqual(len(self.svyazi()),1)

    def test_klyuch_bez_prichiny_ili_ne_s_v_boj(self):
        for args in (['--v-boj','--pri-zhivoj-sluzhbe',' '],['--suho','--pri-zhivoj-sluzhbe','x']):
            kod,r=self.go(*args,pid=4242);self.assertEqual(kod,2,args)
        self.assertEqual(self.svyazi(),[])

    def test_tekst_uzla_ne_soshelsya_ne_svyazyvaet(self):
        o=sqlite3.connect(self.omega);o.execute("UPDATE memories SET content=content||' '");o.commit();o.close()
        kod,r=self.go('--suho');self.assertEqual(r.get('itog'),{'propusk:canonical_collision_not_exact':1})
        kod,r=self.go('--v-boj');self.assertEqual(kod,1);self.assertEqual(self.svyazi(),[],'связь при несошедшемся тексте')

    def test_neizvestnyj_dovod_otkaz(self):
        for a in ('--dry-run','--suh','-n'):
            kod,_=self.go(a);self.assertEqual(kod,2,a)

    def test_mainpid_neizvestnaya_sluzhba_otkaz(self):
        self.assertTrue(hasattr(svyazat_zadnim,'mainpid') and hasattr(svyazat_zadnim,'subprocess'),'в команде нет проверки службы (mainpid)')
        class P:returncode=0;stdout='LoadState=not-found\nMainPID=0\n'
        with mock.patch.object(svyazat_zadnim.subprocess,'run',return_value=P()):
            with self.assertRaisesRegex(svyazat_zadnim.Refused,'sluzhba_neizvestna'):svyazat_zadnim.mainpid('netu.service')
        class P2:returncode=0;stdout='MainPID=1234\nLoadState=loaded\n'
        with mock.patch.object(svyazat_zadnim.subprocess,'run',return_value=P2()):self.assertEqual(svyazat_zadnim.mainpid('x.service'),1234)

if __name__=='__main__':unittest.main()
