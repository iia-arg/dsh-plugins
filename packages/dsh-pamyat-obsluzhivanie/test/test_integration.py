# RU: Сквозные тесты ночного прогона: runner.execute вместе с настоящим judge.run на временной базе (fixture.create_db) и журнале кандидатов из 45 пар.
# EN: End-to-end tests of the nightly run: runner.execute with the real judge.run on a temporary database (fixture.create_db) and a candidate journal of 45 pairs.
# RU: Подставлено: модель-судья — функция-заглушка; тревоги — список; таймер — лямбда «enabled». Не проверяет: настоящий API модели, systemd, доставку тревоги.
# EN: Substituted: the judge model is a stub function; alerts go to a list; the timer is an "enabled" lambda. Does not check: the real model API, systemd, alert delivery.
import unittest,tempfile,sys,json,time,sqlite3,datetime,multiprocessing as mp
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import runner as r
import judge
from fixture import create_db
class Integration(unittest.TestCase):
 # RU: Каждый тест: 90 активных записей одного корня и журнал из 45 пар во временном каталоге.
 # EN: Each test: 90 active records of one root and a 45-pair journal in a temporary directory.
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.p=Path(self.tmp.name);self.db=self.p/'source.db';create_db(self.db)
  self.journal=self.p/'journal.jsonl';self.state=self.p/'state'
  with sqlite3.connect(self.db) as c:
   for i in range(2*(judge.MAX_CALLS+5)):c.execute("insert into memories(node_id,content,metadata,created_at,entity_id,status)values(?,?,?,?,?,'active')",(str(i),'Факт номер '+str(i),'{}','2026-09-28T00:00:00+00:00','beta'))
  self.journal.write_text(''.join(json.dumps({'old':str(i),'by':str(i+1),'dist':.1,'put':'A','at':'2026-09-28T00:00:00+00:00'})+'\n' for i in range(0,2*(judge.MAX_CALLS+5),2)))
 def tearDown(self):self.tmp.cleanup()
 # RU: Дневной предел MAX_CALLS вызовов (B-N-1618 r2: фикстура MAX_CALLS+5 пар, а не 45): первый прогон делает MAX_CALLS, оставляет 5 в очереди и шлёт одну тревогу; повтор в тот же день вызовов не делает. Ловит перерасход предела при повторном запуске.
 # EN: Daily limit of MAX_CALLS calls (fixture of MAX_CALLS+5 pairs): the first run makes MAX_CALLS, leaves 5 queued and sends one alert; a same-day repeat makes no calls. Catches limit overrun on rerun.
 def test_real_judge_budget_and_repeat(self):
  def step():return judge.run(self.db,self.journal,self.state/'judge',lambda a,b:{'verdict':'same','reason':'fixture'},lambda _:None)
  sent=[]
  a,code=r.execute(self.state,timer=lambda:'enabled',step=step,notify=sent.append)
  self.assertEqual(a['judge']['calls'],judge.MAX_CALLS);self.assertEqual(a['judge']['pending'],5);self.assertEqual(len(sent),1)
  b,code=r.execute(self.state,timer=lambda:'enabled',step=step,notify=sent.append)
  self.assertEqual(b['judge']['calls'],0);self.assertEqual(b['judge']['pending'],5)
 # RU: Судья дольше предела (0,3 с) даёт статус timeout; очередь из MAX_CALLS+5 пар сохраняется, учтён ровно один начатый вызов. Ловит потерю очереди и неучтённый вызов при обрыве.
 # EN: A judge exceeding the limit (0.3 s) yields status timeout; the MAX_CALLS+5-pair queue is kept and exactly one started call is counted. Catches queue loss and an uncounted call on abort.
 def test_real_judge_timeout_reservation_and_queue(self):
  def model(a,b):time.sleep(10)
  def step():return judge.run(self.db,self.journal,self.state/'judge',model,lambda _:None)
  a,code=r.execute(self.state,timer=lambda:'enabled',step=step,notify=lambda _:None,timeout=.3)
  self.assertEqual(a['judge']['status'],'timeout');self.assertEqual(a['queue_audit']['pending'],judge.MAX_CALLS+5)
  d=json.loads((self.state/'judge/state.json').read_text());self.assertEqual(sum(d['calls'].values()),1)
 # RU: Два одновременных запуска: второй получает busy с кодом 3, не запускает работника и не шлёт тревогу. Ловит двойной прогон без замка.
 # EN: Two concurrent starts: the second gets busy with code 3, starts no worker and sends no alert. Catches a double run without a lock.
 def test_two_actual_starts_one_worker(self):
  ready=self.p/'ready'
  def step():ready.write_text('worker');time.sleep(1);return {'pending':0}
  def first():r.execute(self.state,timer=lambda:'enabled',step=step,notify=lambda _:None)
  p=mp.get_context('fork').Process(target=first);p.start()
  try:
   for _ in range(200):
    if ready.exists():break
    time.sleep(.01)
   self.assertTrue(ready.exists())
   second,code=r.execute(self.state,timer=lambda:'enabled',step=lambda:self.fail('second worker'),notify=lambda _:self.fail('second alert'))
   self.assertEqual(second['status'],'busy');self.assertEqual(code,3)
   p.join(5);self.assertEqual(p.exitcode,0)
  finally:
   if p.is_alive():p.terminate();p.join()
 # RU: Отказ этапа уроков (embedding_degraded) не останавливает судью, но делает код ненулевым. Ловит отказ одного этапа, скрывающий остальные или выдающий зелёный итог.
 # EN: A lessons stage refusal (embedding_degraded) does not stop the judge but makes the exit code non-zero. Catches one stage failure hiding the others or reporting green.
 def test_lesson_refusal_does_not_stop_judge(self):
  from lessons_store import Refused
  def refused():raise Refused('embedding_degraded')
  report,code=r.execute(self.state,timer=lambda:'enabled',lesson_step=refused,step=lambda:{'pending':7},notify=lambda _:None)
  self.assertEqual(report['lessons']['status'],'error');self.assertEqual(report['lessons']['reason'],'embedding_degraded')
  self.assertEqual(report['judge']['pending'],7);self.assertNotEqual(code,0)
if __name__=='__main__':unittest.main(verbosity=2)
