# RU: A-N-1705: урок, доставленный ступенью уроков в OMEGA, получает связь svyaz_omega с узлом и честный исход в журнале
#     ядра. Настоящие: lessons.run_stage, lessons.local → node local_lessons.mjs, ядро dsh-pamyat-core и база агента
#     (создаётся ядром во временном каталоге). Подставлен: писатель OMEGA (Writer) — отдаёт заданный node_id.
#     Ловит: урок без связи; последний исход урока «не смонтирован»; связь не к той записи; legacy без вида
#     vosstanovleno-tekstom; конфликт связи, который молча переписывается или не называется; вторую отметку на повторе.
#     НЕ ловит: настоящую OMEGA и её проверку корня (это lessons_store.verify, тесты test_lessons); боевые базы.
# EN: A-N-1705: a lesson delivered to OMEGA gets a svyaz_omega link and an honest core journal outcome. Real stage,
#     local bridge, core and agent database; the OMEGA writer is a stub.
import unittest,sys,os,json,sqlite3,subprocess,tempfile
from pathlib import Path
from unittest import mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import lessons

BLOCK='### 2026-10-07 02:00Z\n- Что случилось: Проба связи.\n- Урок: Связь ставится после подтверждения.\n- Откуда знаю: Стенд.\n'
SRC_DIR=Path(__file__).resolve().parents[1]/'src'

def sozdat_bazu(put):
    # RU: Базу агента создаёт само ядро (штатная схема), как при подъёме агента.
    # EN: The agent database is created by the core itself (standard schema), as on agent start.
    kod=("const {otkrytHranilishche}=await import('dsh-pamyat-core/src/hranilishche.js');"
         "otkrytHranilishche(process.argv[1]).zakryt();")
    subprocess.run(['/usr/local/bin/node','--input-type=module','-e',kod,str(put)],check=True,cwd=SRC_DIR,
                   capture_output=True,env={**os.environ,'NODE_NO_WARNINGS':'1'})

class SvyazTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();r=Path(self.tmp.name);self.home=r/'home';(self.home/'pamyat').mkdir(parents=True)
        self.uroki=self.home/'UROKI-AGENT-S.md';self.uroki.write_text(BLOCK);self.db=self.home/'pamyat/pamyat.db';sozdat_bazu(self.db)
        self.registry=r/'agents.yaml';self.state=r/'state';(r/'omega.db').touch();self.omega=r/'omega.db'
        self.registry.write_text('shema: 1\nagenty:\n- imya: agent-s\n  namerenie:\n    dom: '+str(self.home)+'\n    polzovatel: agent-s\n    uroki_file: '+str(self.uroki)+'\n')
        self.remote={};self.mem='mem-a1705aaaaaaa'
        t=self
        class Writer:
            def __init__(self,db):pass
            def lookup(self,a,s,k,txt):return t.remote.get(k)
            def embedding(self,txt):return [1.0]*1024
            def put(self,a,s,k,txt,v,raw,path):t.remote[k]={'id':t.mem,'legacy':False};return t.remote[k]
            def close(self):pass
        self.Writer=Writer
    def tearDown(self):self.tmp.cleanup()
    def go(self):
        with mock.patch.object(lessons,'assert_omega'):return lessons.run_stage(self.state,self.registry,self.omega,self.Writer)
    def q(self,sql,*a):
        c=sqlite3.connect(self.db)
        try:return c.execute(sql,a).fetchall()
        finally:c.close()
    def urok_id(self):return self.q("select id from zapisi where klass='urok'")[0][0]
    def zhurnal(self):return self.q("select ishod,priroda from zhurnal where klass='urok' and ishod not in ('zapisano') order by id")

    # RU: Урок записан этим проходом: связь к своей записи, вид dostavka; последний исход — dostavleno/dolgovremennyj-sloj.
    def test_put_daet_svyaz_i_ishod_dostavleno(self):
        r=self.go();self.assertEqual(r['omega_verified'],1,r)
        self.assertEqual(self.q('select zapis_id,mem_id,kak from svyaz_omega'),[(self.urok_id(),self.mem,'dostavka')],'урок без связи с OMEGA')
        self.assertEqual(self.zhurnal()[-1],('dostavleno','dolgovremennyj-sloj'),'последний исход урока — не «доставлено»')

    # RU: Урок уже был в OMEGA прежним переносом (legacy): связь вида vosstanovleno-tekstom, исход подтверждён чтением.
    def test_legacy_svyaz_vosstanovleno_tekstom(self):
        k=lessons.parse_blocks(BLOCK.encode(),str(self.uroki),'agent-s')[0][0]['key'];self.remote[k]={'id':self.mem,'legacy':True}
        self.go()
        self.assertEqual(self.q('select kak from svyaz_omega'),[('vosstanovleno-tekstom',)])
        self.assertEqual(self.zhurnal()[-1],('dostavleno','podtverzhdeno-chteniem'))

    # RU: Повтор прохода (квитанция omega_verified) второй отметки и второй связи не даёт.
    def test_povtor_bez_vtoroj_otmetki(self):
        self.go();n=len(self.zhurnal());r=self.go()
        self.assertEqual(r['cached_verified'],1);self.assertEqual(len(self.zhurnal()),n);self.assertEqual(len(self.q('select * from svyaz_omega')),1)

    # RU: Запись уже связана с ДРУГИМ узлом: связь не переписана, отказ назван по имени, доставка не отменена.
    def test_konflikt_nazvan_svyaz_ne_perepisana(self):
        self.go();zid=self.urok_id()
        # RU: подставить чужую связь и заставить урок пройти заново (квитанцию стираем)
        c=sqlite3.connect(self.db);c.execute("update svyaz_omega set mem_id='mem-chuzhoj0000' where zapis_id=?",(zid,));c.commit();c.close()
        for f in self.state.glob('*.json'):f.unlink()
        r=self.go();item=r['agents'][0]
        self.assertEqual(self.q('select mem_id from svyaz_omega'),[('mem-chuzhoj0000',)],'конфликтная связь переписана')
        self.assertIn({'key':item['issues'][0]['key'],'reason':'link:link_conflict'},item['issues'],item)
        self.assertEqual(self.zhurnal()[-1],('ne-udalos-proverit','svyaz-omega-konflikt'))
        self.assertEqual(r['omega_verified'],1,'отказ связи отменил доставку')

if __name__=='__main__':unittest.main()
