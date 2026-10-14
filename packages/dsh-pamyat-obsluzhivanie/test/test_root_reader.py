# RU: Тесты безопасного чтения latest.json корневым heartbeat (read_latest): файл пишет непривилегированная служба, root не должен ходить по ссылкам и читать неограниченный поток.
# EN: Tests for safe reading of latest.json by the root heartbeat (read_latest): the file is written by an unprivileged service, so root must not follow links or read an unbounded stream.
# RU: Подставлено: временный каталог состояния. Не проверяет: владельца и права каталога, чтение под настоящим root.
# EN: Substituted: a temporary state directory. Does not check: directory owner and mode, reading as real root.
import unittest,tempfile,sys,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import heartbeat as h
class RootReader(unittest.TestCase):
 # RU: Файл больше 1 МиБ отвергается до разбора JSON. Ловит чтение без предела.
 # EN: A file over 1 MiB is refused before JSON decoding. Catches unbounded reads.
 def test_large_state_refused_before_json_decode(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'latest.json';p.write_bytes(b'{"x":"'+b'a'*(1024*1024)+b'"}')
   with self.assertRaises((ValueError,OSError)):h.read_latest(Path(d))
 # RU: Символьная ссылка и FIFO вместо файла отвергаются. Ловит переход по ссылке и зависание на FIFO.
 # EN: A symlink or a FIFO in place of the file is refused. Catches link following and hanging on a FIFO.
 def test_symlink_and_fifo_refused(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'latest.json';target=Path(d)/'target';target.write_text('{}');p.symlink_to(target)
   with self.assertRaises(OSError):h.read_latest(Path(d))
   p.unlink();os.mkfifo(p)
   with self.assertRaises((OSError,ValueError)):h.read_latest(Path(d))
