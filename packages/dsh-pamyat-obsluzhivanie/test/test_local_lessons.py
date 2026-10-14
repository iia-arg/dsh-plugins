# RU: Проверяет local_lessons.mjs настоящим путём вызова: lessons.local запускает node с модулем, запрос идёт на
#     stdin, ответ читается со stdout. Ядро памяти — настоящее, его модуль должен находиться по имени
#     dsh-pamyat-core (как у теста memory_count). Операция prepare пишет только в базу в памяти.
#     Ловит: порчу многобайтных знаков на границе кусков stdin и отказ «input_limit», не доходящий до вызывающего.
#     НЕ ловит: вход, который не является UTF-8; операции get и save с живой базой.
# EN: Tests local_lessons.mjs through its real call path: lessons.local starts node with the module, the request goes
#     to stdin, the reply is read from stdout. The memory core is real; its module must resolve by the name
#     dsh-pamyat-core (as for the memory_count test). The prepare operation writes only to an in-memory database.
#     Catches: corruption of multi-byte characters at stdin chunk boundaries and an "input_limit" refusal that never
#     reaches the caller. Does NOT catch: non-UTF-8 input; get and save operations against a live database.
import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import lessons

class LocalStdinTests(unittest.TestCase):
 # RU: Урок больше 64 КиБ из кириллицы возвращается prepare без единого U+FFFD. Два сдвига на один знак:
 #     при одном из них граница куска stdin режет двухбайтный знак пополам.
 # EN: A Cyrillic lesson larger than 64 KiB comes back from prepare without a single U+FFFD. Two one-character
 #     shifts: in one of them the stdin chunk boundary splits a two-byte character in half.
 def test_large_cyrillic_body_round_trip(self):
  for pad in ('','x'):
   body='п'+pad+'ж'*150000
   r=lessons.local('prepare','proba','/nonexistent',{'source':'proba#1','body':body})
   self.assertEqual(r['text'].count('\ufffd'),0,f'pad={pad!r}')
   self.assertEqual(r['text'],body,f'pad={pad!r}')

 # RU: Вход длиннее предела даёт вызывающему именно отказ input_limit, а не общий local_protocol_unknown.
 # EN: Input longer than the limit gives the caller exactly the input_limit refusal, not a generic local_protocol_unknown.
 def test_input_limit_reaches_caller(self):
  with self.assertRaisesRegex(lessons.Refused,'^input_limit$'):
   lessons.local('prepare','proba','/nonexistent',{'source':'proba#2','body':'я'*1000001})

 # RU: Короткий урок с кириллицей проходит как прежде (правка не ломает обычный путь).
 # EN: A short Cyrillic lesson passes as before (the fix does not break the ordinary path).
 def test_short_body_unchanged(self):
  r=lessons.local('prepare','proba','/nonexistent',{'source':'proba#3','body':'Урок: правило.'})
  self.assertEqual(r['text'],'Урок: правило.')

if __name__=='__main__':unittest.main()
