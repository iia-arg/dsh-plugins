# RU: Тесты судьи heartbeat при записи решения «выключено владельцем» (B-N-2028): маска + запись — 0 громкой строкой;
# RU: маска без записи — прежний предел; запись без маски и негодная запись — 1; возврат (запись снята) — снова прежнее.
# EN: Tests for the heartbeat judge with the "disabled by the owner" decision record (B-N-2028): mask + record — 0 with a
# EN: loud line; mask without record — the old limit; record without mask and an invalid record — 1; removal — back to old.
# RU: Подставлено: таймер, время и дата маски — лямбды; запись — временный файл, владелец — текущая учётка (owner=getuid).
# RU: Не проверяет: настоящий /etc и владельца root (это — проба в unshare на машине), зовущего sadik-watch.
import unittest,tempfile,sys,os,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
import heartbeat as h
UTC=datetime.timezone.utc
NOW=datetime.datetime(2026,10,14,3,0,tzinfo=UTC)
ZAPIS='kto=Забава\nkogda=2026-10-09T20:56:00+00:00\nslovo=владелец 09.10 23:55 МСК: обслуживание выключить\n'
class ReshenieTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.d=Path(self.tmp.name)/'etc';self.d.mkdir(mode=0o755);os.chmod(self.d,0o755)
  self.f=self.d/'vyklyucheno';self.state=Path(self.tmp.name)/'state'
 def tearDown(self):self.tmp.cleanup()
 def polozhit(self,text=ZAPIS,mode=0o644):
  self.f.write_text(text);os.chmod(self.f,mode)
 def sudit(self,timer='masked',dnej=6):
  return h.heartbeat(self.state,timer=lambda:timer,now=NOW,mask_seen=lambda:NOW-datetime.timedelta(days=dnej),
                     decision=lambda:h.read_decision(self.f,owner=os.getuid()))
 # RU: маска + годная запись — 0 при маске старше предела, строка называет слово, руку и дату.
 def test_maska_i_zapis_zelenoe_gromko(self):
  self.polozhit();code,msg=self.sudit(dnej=6)
  self.assertEqual(code,0,msg);self.assertIn('выключено владельцем',msg);self.assertIn('Забава',msg);self.assertIn('2026-10-09T20:56:00+00:00',msg)
 # RU: маска без записи — прежнее: младше предела 0, старше 1.
 def test_maska_bez_zapisi_prezhnee(self):
  self.assertEqual(self.sudit(dnej=1)[0],0);code,msg=self.sudit(dnej=6);self.assertEqual(code,1);self.assertIn('limit_days=3',msg)
 # RU: запись без маски — 1, названа причина.
 def test_zapis_bez_maski_krasnoe(self):
  self.polozhit();code,msg=self.sudit(timer='enabled');self.assertEqual(code,1);self.assertIn('не замаскирован',msg)
 # RU: негодная запись при маске — 1, не 0: нет поля; пишется не только root; каталог пишется не только root; ссылка; дата без пояса.
 def test_negodnaya_zapis_krasnoe(self):
  for name,prep in (('нет полей',lambda:self.polozhit('kto=Забава\n')),
                    ('пишется не только root',lambda:self.polozhit(mode=0o666)),
                    ('каталог',lambda:(self.polozhit(),os.chmod(self.d,0o777))),
                    ('не открывается',lambda:(self.polozhit(),self.f.rename(self.d/'nastoyashchij'),self.f.symlink_to(self.d/'nastoyashchij'))),
                    ('без пояса',lambda:self.polozhit(ZAPIS.replace('+00:00','')))):
   with self.subTest(name):
    for p in (self.f,self.d/'nastoyashchij'):
     if p.is_symlink() or p.exists():p.unlink()
    os.chmod(self.d,0o755);prep()
    code,msg=self.sudit(dnej=6);self.assertEqual(code,1,msg);self.assertIn('негодна',msg);self.assertIn(name,msg)
 # RU: kogda из будущего — 1.
 def test_kogda_iz_budushchego(self):
  self.polozhit(ZAPIS.replace('2026-10-09','2026-10-20'));code,msg=self.sudit();self.assertEqual(code,1);self.assertIn('будущего',msg)
 # RU: возврат: запись снята при маске старше предела — снова 1 «limit_days»; запись снята и маска снята — прежний путь
 # RU: по состоянию (нет latest.json — 2), а не «не замаскирован».
 def test_vozvrat(self):
  self.polozhit();self.assertEqual(self.sudit()[0],0);self.f.unlink()
  code,msg=self.sudit();self.assertEqual(code,1);self.assertIn('limit_days',msg)
  code,msg=self.sudit(timer='enabled');self.assertEqual(code,2,msg)
 # RU: записи нет — None; по умолчанию судья читает DECISION (путь в /etc).
 def test_net_zapisi_i_put(self):
  self.assertIsNone(h.read_decision(self.f,owner=os.getuid()));self.assertEqual(str(h.DECISION),'/etc/dsh-pamyat-obsluzhivanie/vyklyucheno')
if __name__=='__main__':unittest.main()
