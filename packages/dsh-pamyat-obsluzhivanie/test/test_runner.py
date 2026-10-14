# RU: Тесты оркестратора runner.execute и heartbeat: замок, маска таймера, предел времени, доставка тревоги, сводка.
# EN: Tests for the runner.execute orchestrator and heartbeat: lock, timer mask, time limit, alert delivery, summary.
# RU: Подставлено: этап судьи — лямбды; тревога — список self.sent; таймер — лямбда или systemctl --root на временном корне.
# EN: Substituted: the judge stage is a lambda; alerts go to self.sent; the timer is a lambda or systemctl --root on a temporary root.
# RU: Не проверяет: настоящие этапы (уроки, чистка, судья, сверка счёта) и отправку через agent-alert. Тесту маски нужен systemctl на машине.
# EN: Does not check: the real stages (lessons, cleanup, judge, count check) or sending via agent-alert. The mask test needs systemctl on the host.
import unittest,tempfile,sys,json,time,fcntl,subprocess,datetime,os
from unittest import mock
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
import runner as r
class RunnerTests(unittest.TestCase):
 def setUp(self):
  # B-N-2028: судья не читает живую запись решения /etc/dsh-pamyat-obsluzhivanie/vyklyucheno — «записи нет».
  p=mock.patch.object(sys.modules['heartbeat'],'read_decision',lambda:None,create=True);p.start();self.addCleanup(p.stop)
  self.tmp=tempfile.TemporaryDirectory();self.p=Path(self.tmp.name);self.state=self.p/'state';self.sent=[]
 def tearDown(self):self.tmp.cleanup()
 # RU: Запуск с подставным этапом судьи; по умолчанию очередь 3, вызовов 40.
 # EN: Run with a stub judge stage; default queue 3, calls 40.
 def run_it(self,step=lambda:{'pending':3,'daily_calls':40},**kw):
  return r.execute(self.state,timer=lambda:'enabled',step=step,notify=self.sent.append,**kw)
 # RU: Настоящая маска (systemctl --root mask) блокирует запуск: статус disabled, этап не вызван, тревоги нет, отчёт прогона записан; после unmask — ok. Ловит работу при замаскированном таймере.
 # EN: A real mask (systemctl --root mask) blocks the run: status disabled, stage not called, no alert, run report written; after unmask — ok. Catches running while the timer is masked.
 def test_real_mask_blocks_manual_execution(self):
  root=self.p/'root';unit=root/'usr/local/lib/systemd/system'/r.TIMER;unit.parent.mkdir(parents=True)
  unit.write_text('[Unit]\nDescription=probe\n[Timer]\nOnCalendar=daily\n')
  subprocess.run(['systemctl','--root',str(root),'mask',r.TIMER],check=True,capture_output=True)
  def query():return r.timer_state(['systemctl','--root',str(root)])
  trace=self.p/'called'
  report,code=r.execute(self.state,timer=query,step=lambda:trace.touch(),notify=self.sent.append)
  self.assertEqual(report['status'],'disabled');self.assertIn('masked',report['reason']);self.assertFalse(trace.exists());self.assertEqual(self.sent,[])
  self.assertTrue(list((self.state/'runs').glob('*.json')))
  subprocess.run(['systemctl','--root',str(root),'unmask',r.TIMER],check=True,capture_output=True)
  report,code=r.execute(self.state,timer=query,step=lambda:{'pending':0},notify=self.sent.append)
  self.assertEqual(code,0);self.assertEqual(report['status'],'ok')
 # RU: Один прогон — ровно одна однострочная тревога; latest.json совпадает с отчётом, delivery=accepted;
 # RU: предел вызовов в сводке — из judge.MAX_CALLS, а не постоянное число (B-N-1618 r2).
 # EN: One run — exactly one single-line alert; latest.json matches the report, delivery=accepted;
 # EN: the call cap in the summary comes from judge.MAX_CALLS, not a constant (B-N-1618 r2).
 def test_single_notification_and_result(self):
  report,code=self.run_it();self.assertEqual(code,0);self.assertEqual(len(self.sent),1)
  self.assertNotIn('\n',self.sent[0]);self.assertEqual(report['judge']['pending'],3)
  self.assertIn(f'вызовов 40/{r.judge.MAX_CALLS};',self.sent[0])
  saved=json.loads((self.state/'latest.json').read_text());self.assertEqual(saved['run_id'],report['run_id']);self.assertEqual(saved['delivery'],'accepted')
 # RU: Занятый замок run.lock: статус busy, ненулевой код, тревоги нет. Ловит параллельный прогон.
 # EN: Held run.lock: status busy, non-zero code, no alert. Catches a parallel run.
 def test_busy_flock(self):
  self.state.mkdir()
  with (self.state/'run.lock').open('w') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
   report,code=self.run_it()
  self.assertEqual(report['status'],'busy');self.assertNotEqual(code,0);self.assertEqual(self.sent,[])
 # RU: Ошибка этапа не скрывает сохранённую очередь (queue_audit), текст исключения не попадает в отчёт, тревога одна. Ловит утечку текста исключения и потерю остатка очереди.
 # EN: A stage error does not hide the saved queue (queue_audit), the exception text stays out of the report, one alert. Catches exception text leaks and loss of the queue remainder.
 def test_stage_error_does_not_hide_queue_audit(self):
  q=self.state/'judge';q.mkdir(parents=True);(q/'state.json').write_text(json.dumps({'version':1,'queue':{'a':{}},'calls':{}}))
  def fail():raise RuntimeError('never-print-secret')
  report,code=self.run_it(step=fail);self.assertNotEqual(code,0);self.assertEqual(report['queue_audit']['pending'],1)
  self.assertNotIn('never-print-secret',json.dumps(report));self.assertEqual(len(self.sent),1)
 # RU: Отказ (Refused) в самом раннере, до ступеней (как registry_not_set из load_agents), — в отчёте его текст; прочее исключение — только имя класса, текст не попадает. Ловит потерю причины отказа (B-N-1598).
 # EN: A refusal (Refused) in the runner itself, before the stages (like registry_not_set from load_agents), keeps its text in the report; any other exception keeps only the class name, not its text. Catches losing the refusal reason (B-N-1598).
 def test_refusal_reason_text_kept_in_runner(self):
  from lessons_store import Refused
  def refuse():raise Refused('registry_not_set')
  report,code=r.execute(self.state,timer=refuse,step=lambda:{'pending':0},notify=self.sent.append)
  self.assertNotEqual(code,0);self.assertEqual(report['status'],'error');self.assertEqual(report['reason'],'registry_not_set')
  def other():raise RuntimeError('never-print-secret')
  report,code=r.execute(self.state,timer=other,step=lambda:{'pending':0},notify=self.sent.append)
  self.assertEqual(report['reason'],'RuntimeError');self.assertNotIn('never-print-secret',json.dumps(report))
 # RU: Предел времени: статус timeout, очередь из 2 сохраняется, код ненулевой. Ловит «неизвестно», выданное за ноль.
 # EN: Time limit: status timeout, the 2-item queue is kept, non-zero code. Catches "unknown" reported as zero.
 def test_timeout_keeps_queue_and_unknown_not_zero(self):
  q=self.state/'judge';q.mkdir(parents=True);(q/'state.json').write_text(json.dumps({'version':1,'queue':{'a':{},'b':{}},'calls':{}}))
  report,code=self.run_it(step=lambda:time.sleep(5),timeout=.05)
  self.assertNotEqual(code,0);self.assertEqual(report['judge']['status'],'timeout');self.assertEqual(report['queue_audit']['pending'],2)
 # RU: heartbeat: маска младше предела — 0 и disabled; нет состояния — 2; после прогона — 0; через сутки без нового прогона — не 0. Ловит молчание о пропущенном прогоне.
 # EN: heartbeat: mask younger than the limit — 0 and disabled; no state — 2; after a run — 0; a day later without a new run — non-zero. Catches silence about a missed run.
 def test_heartbeat_mask_missing_stale_and_restore(self):
  now=datetime.datetime(2026,9,29,2,6,tzinfo=datetime.timezone.utc)
  code,msg=r.heartbeat(self.state,timer=lambda:'masked',now=now,mask_seen=lambda:now-datetime.timedelta(days=1));self.assertEqual(code,0);self.assertIn('disabled',msg)
  code,msg=r.heartbeat(self.state,timer=lambda:'enabled',now=now);self.assertEqual(code,2)
  report,code=self.run_it(now=now);self.assertEqual(code,0)
  code,msg=r.heartbeat(self.state,timer=lambda:'enabled',now=now);self.assertEqual(code,0)
  code,msg=r.heartbeat(self.state,timer=lambda:'enabled',now=now+datetime.timedelta(days=1));self.assertNotEqual(code,0)
 # RU: Сбой доставки тревоги: код 2, delivery=unknown, текст исключения не в отчёте. Ловит несостоявшуюся доставку, принятую за успех.
 # EN: Alert delivery failure: code 2, delivery=unknown, exception text not in the report. Catches a failed delivery taken for success.
 def test_delivery_failure_is_visible(self):
  def fail(msg):raise OSError('never-print-secret')
  report,code=r.execute(self.state,timer=lambda:'enabled',step=lambda:{'pending':0},notify=fail)
  self.assertEqual(code,2);self.assertEqual(report['delivery'],'unknown');self.assertNotIn('never-print-secret',json.dumps(report))
 # RU: Поля-предупреждения (рост очереди, секретные, длинные, просмотрено, без векторов) переводят статус в finding и все попадают в одну сводку.
 # EN: Warning fields (queue growth, secret, oversize, reviewed, without vectors) turn the status into finding and all appear in one summary.
 def test_warning_fields_survive_single_summary(self):
  report,code=self.run_it(step=lambda:{'pending':5,'growth':True,'secret_pairs':2,'oversize':3,'prosmotreno':7,'coverage':{'without_vectors':4}})
  self.assertEqual(report['status'],'finding')
  for text in ['рост очереди=True','секретных=2','длинных=3','просмотрено=7','без векторов=4']:self.assertIn(text,self.sent[0])
 # RU: Маска, появившаяся во время прогона, останавливает работника: статус disabled, тревоги нет.
 # EN: A mask appearing mid-run stops the worker: status disabled, no alert.
 def test_mask_during_run_stops_worker(self):
  ticks=[]
  def timer():
   ticks.append(1);return 'enabled' if len(ticks)<=2 else 'masked'
  report,code=r.execute(self.state,timer=timer,step=lambda:time.sleep(10),notify=self.sent.append)
  self.assertEqual(report['status'],'disabled');self.assertEqual(self.sent,[])
 # RU: По пределу времени убивается и потомок, игнорирующий SIGTERM. Ловит осиротевший процесс после обрыва.
 # EN: On timeout a descendant ignoring SIGTERM is killed too. Catches an orphaned process after abort.
 def test_timeout_kills_term_ignoring_descendant(self):
  pidfile=self.p/'pid'
  def step():
   subprocess.Popen([sys.executable,'-B','-c',"import signal,time,os,pathlib;signal.signal(signal.SIGTERM,signal.SIG_IGN);pathlib.Path("+repr(str(pidfile))+").write_text(str(os.getpid()));time.sleep(60)"])
   while not pidfile.exists():time.sleep(.01)
   time.sleep(60)
  report,code=self.run_it(step=step,timeout=.3)
  pid=int(pidfile.read_text())
  def alive():
   try:return Path('/proc/'+str(pid)+'/stat').read_text().split()[2]!='Z'
   except FileNotFoundError:return False
  try:
   for _ in range(100):
    if not alive():break
    time.sleep(.01)
   self.assertFalse(alive(),'descendant remains alive')
  finally:
   if alive():os.kill(pid,9)
if __name__=='__main__':unittest.main(verbosity=2)
