# RU: Тесты даты маски таймера в heartbeat и чтения ключа модели судьёй.
# EN: Tests for the timer mask date in heartbeat and for the judge reading the model credential.
# RU: Подставлено: каталог маски — временный, ссылка ведёт на /dev/null; сеть модели — mock urlopen; ключ — синтетический файл через DEEPSEEK_CREDENTIAL_FILE.
# EN: Substituted: the mask directory is temporary with a link to /dev/null; the model network call is a mocked urlopen; the key is a synthetic file via DEEPSEEK_CREDENTIAL_FILE.
# RU: Не проверяет: настоящий systemctl, настоящий API модели, права файла ключа.
# EN: Does not check: the real systemctl, the real model API, key file permissions.
import unittest,tempfile,sys,os,json,datetime
from unittest import mock
from pathlib import Path
from unittest import mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import judge,heartbeat as h
class CredentialsTests(unittest.TestCase):
 # B-N-2028: судья не читает живую запись решения /etc/dsh-pamyat-obsluzhivanie/vyklyucheno — «записи нет».
 def setUp(self):
  p=mock.patch.object(h,'read_decision',lambda:None,create=True);p.start();self.addCleanup(p.stop)
 # RU: Возраст маски берётся из mtime символьной ссылки: 0 сут → 0, 4 сут → 1, снова 0 → 0; без ссылки — 2 (не измерено). Ловит дату «первого наблюдения» и молчаливый ноль без ссылки.
 # EN: Mask age comes from the symlink mtime: 0 days → 0, 4 days → 1, back to 0 → 0; no link → 2 (not measured). Catches a "first seen" date and a silent zero when the link is gone.
 def test_mask_date_real_link_old_new_and_return(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);link=root/h.TIMER;link.symlink_to('/dev/null')
   now=datetime.datetime.now(datetime.timezone.utc)
   seen=lambda:h.mask_timestamp((root,))
   for age,code in [(0,0),(4,1),(0,0)]:
    stamp=(now-datetime.timedelta(days=age)).timestamp();os.utime(link,(stamp,stamp),follow_symlinks=False)
    rc,msg=h.heartbeat(root,timer=lambda:'masked',now=now,mask_seen=seen)
    self.assertEqual(rc,code);self.assertIn('masked_since=',msg)
   link.unlink()
   rc,msg=h.heartbeat(root,timer=lambda:'masked',now=now,mask_seen=seen);self.assertEqual(rc,2)
 # RU: Судья читает ключ из файла DEEPSEEK_CREDENTIAL_FILE и не вызывает runuser/subprocess. Ловит возврат к чтению ключа через подъём прав.
 # EN: The judge reads the key from DEEPSEEK_CREDENTIAL_FILE without calling runuser/subprocess. Catches a regression to privilege-switching key reads.
 def test_model_reads_credential_without_root_runuser(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'deepseek';p.write_text('synthetic-key-only')
   record={'node_id':'id','entity_id':'beta','content':'Обычный текст','created_at':'2026-09-28'}
   response=mock.MagicMock();response.__enter__.return_value.read.return_value=json.dumps({'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'verdict':'same','reason':'fixture'})}}]}).encode()
   with mock.patch.dict(os.environ,{'DEEPSEEK_CREDENTIAL_FILE':str(p)}),mock.patch.object(judge.subprocess,'run',side_effect=AssertionError('runuser forbidden')) as run,mock.patch.object(judge.urllib.request,'urlopen',return_value=response):
    result=judge.DeepSeek()(record,record)
   self.assertEqual(result['verdict'],'same');run.assert_not_called()
