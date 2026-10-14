# RU: Тесты переноса уроков агентов в OMEGA (src/lessons.py, src/lessons_store.py): разбор блоков файла уроков, ключ источника, переписанный источник, отказы встраиваний, проверка записи, пометка уроков гостевого агента.
# EN: Tests for moving agent lessons into OMEGA (src/lessons.py, src/lessons_store.py): lesson block parsing, source key, rewritten source, embedding refusals, write verification, guest agent lesson mark.
# RU: Подставлено: файл уроков и реестр агентов — во временном каталоге; писатель OMEGA — класс-заглушка Writer; локальная запись — метод local; assert_omega и local подменены mock.patch; API встраиваний — mock.
# EN: Substituted: the lesson file and agent registry live in a temporary directory; the OMEGA writer is a stub Writer class; local storage is the local method; assert_omega and local are patched; the embedding API is a mock.
# RU: Не проверяет: настоящую OMEGA и модель встраиваний, боевые файлы уроков и реестр.
# EN: Does not check: the real OMEGA and embedding model, production lesson files and registry.
import unittest,sys,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import lessons
BLOCK='### 2026-09-28 12:00Z\n- Что случилось: Факт.\n- Урок: Правило.\n- Откуда знаю: Проба.\n'
class ParserTests(unittest.TestCase):
 # RU: Полный блок разбирается, незавершённый хвост отмечается как ожидающий (pending).
 # EN: A complete block is parsed; an unfinished tail is flagged as pending.
 def test_complete_and_partial(self):
  blocks,pending=lessons.parse_blocks(BLOCK.encode(),'/data/agent-m/UROKI-AGENT-M.md','agent-m');self.assertEqual(len(blocks),1);self.assertFalse(pending)
  blocks,pending=lessons.parse_blocks((BLOCK+'\n### 2026-09-28 13:00Z\n- Что случилось: Ещё').encode(),'/data/agent-m/UROKI-AGENT-M.md','agent-m');self.assertEqual(len(blocks),1);self.assertTrue(pending)
 # RU: Ключ источника меняется и от текста, и от пути файла.
 # EN: The source key changes with both the text and the file path.
 def test_source_key_changes_with_text_or_source(self):
  key=lambda s,p:lessons.parse_blocks(s.encode(),p,'agent-m')[0][0]['key']
  self.assertNotEqual(key(BLOCK,'/a'),key(BLOCK,'/b'));self.assertNotEqual(key(BLOCK,'/a'),key(BLOCK.replace('Правило','Поправка'),'/a'))
 # RU: Переписанное начало источника называется source_rewritten, дописанный хвост принимается.
 # EN: A rewritten source prefix is named source_rewritten; an appended tail is accepted.
 def test_old_prefix_rewrite_is_named(self):
  d={'prefix_bytes':len(BLOCK.encode()),'prefix_sha':hashlib.sha256(BLOCK.encode()).hexdigest()};lessons.check_prefix(BLOCK.encode()+b'\n',d)
  with self.assertRaisesRegex(lessons.Refused,'source_rewritten'):lessons.check_prefix(BLOCK.replace('Факт','Беда').encode(),d)
 # RU: Заголовок с отступом и заголовок внутри блока кода уроками не считаются.
 # EN: An indented heading and a heading inside a code fence are not lessons.
 def test_template_and_fenced_heading_not_lessons(self):
  self.assertEqual(len(lessons.parse_blocks(('    ### пример\n```\n### образец\n```\n'+BLOCK).encode(),'/a','agent-m')[0]),1)

from unittest import mock
import tempfile,json
from lessons_store import checked_embedding,verify,integrity
class ContractTests(unittest.TestCase):
 # RU: Деградированное встраивание или неизвестный бэкенд — отказ embedding_degraded; нормальное — вектор из 1024 чисел.
 # EN: A degraded embedding or unknown backend is refused as embedding_degraded; a normal one is a 1024-value vector.
 def test_degraded_embedding_refused(self):
  api=mock.Mock();api.generate_embedding.return_value=[1.0]*1024;api.is_embedding_degraded.return_value=True;api.get_active_backend.return_value='onnx'
  with self.assertRaisesRegex(lessons.Refused,'embedding_degraded'):checked_embedding(api,'test')
  api.is_embedding_degraded.return_value=False;api.get_active_backend.return_value=None
  with self.assertRaisesRegex(lessons.Refused,'embedding_degraded'):checked_embedding(api,'test')
  api.get_active_backend.return_value='onnx';self.assertEqual(len(checked_embedding(api,'test')),1024)
 # RU: Запись чужого корня (foreign_root) и дубль source_key — отказ; одна своя запись возвращает свой id.
 # EN: A record of a foreign root (foreign_root) and a duplicate source_key are refused; a single own record returns its id.
 def test_foreign_and_duplicate_refused(self):
  row={'metadata':json.dumps({'source_key':'k'}),'entity_id':'other','content':'t','status':'active','event_type':'lesson_learned','source_uri':'s','node_id':'one'}
  with self.assertRaisesRegex(lessons.Refused,'foreign_root'):verify([row],'t','beta','s','k')
  row['entity_id']='beta'
  with self.assertRaisesRegex(lessons.Refused,'omega_duplicate_source_key'):verify([row,row],'t','beta','s','k')
  self.assertEqual(verify([row],'t','beta','s','k')['id'],'one')

class StageTests(unittest.TestCase):
 # RU: Каждый тест: один агент в реестре, один блок в файле уроков; Writer считает записи в OMEGA.
 # EN: Each test: one agent in the registry, one block in the lesson file; Writer counts OMEGA writes.
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.home=self.root/'home';self.home.mkdir();self.source=self.home/'UROKI-AGENT-M.md';self.source.write_text(BLOCK)
  self.db=self.root/'omega.db';self.db.touch();self.registry=self.root/'agents.yaml'
  self.registry.write_text('shema: 1\nagenty:\n- imya: agent-m\n  namerenie:\n    dom: '+str(self.home)+'\n    polzovatel: agent-m\n    uroki_file: '+str(self.source)+'\n')
  self.local_rows={};self.remote={};self.writes=0
  test=self
  class Writer:
   def __init__(self,db):pass
   def lookup(self,a,s,k,t):return test.remote.get(k)
   def embedding(self,t):return [1.0]*1024
   def put(self,a,s,k,t,v,raw,path):test.writes+=1;test.remote[k]={'id':'mem-'+str(test.writes)};return test.remote[k]
   def close(self):pass
  self.Writer=Writer
 def tearDown(self):self.tmp.cleanup()
 def local(self,op,agent,db,b,expected=None):
  if op=='prepare':return {'text':b['body'],'sha':hashlib.sha256(b['body'].encode()).hexdigest()}
  if op=='save':self.local_rows[b['source']]={'id':len(self.local_rows)+1,'text':expected}
  return self.local_rows.get(b['source'],{'id':None})
 def go(self,limit=200):
  with mock.patch.object(lessons,'assert_omega'), mock.patch.object(lessons,'local',side_effect=self.local):return lessons.run_stage(self.root/'state',self.registry,self.db,self.Writer,limit=limit)
 # RU: Повтор не пишет второй раз; дописанный блок пишется; переписанный источник — source_rewritten без записи.
 # EN: A rerun does not write again; an appended block is written; a rewritten source is source_rewritten with no write.
 def test_repeat_append_and_rewrite(self):
  self.assertEqual(self.go()['omega_verified'],1);self.assertEqual(self.go()['cached_verified'],1);self.assertEqual(self.writes,1)
  self.source.write_text(BLOCK+'\n'+BLOCK.replace('12:00','13:00'));self.assertEqual(self.go()['omega_verified'],1);self.assertEqual(self.writes,2)
  self.source.write_text(self.source.read_text().replace('Факт.','Исправлено.',1));r=self.go();self.assertEqual(r['agents'][0]['reason'],'source_rewritten');self.assertEqual(self.writes,2)
 # RU: Деградация встраивания — ноль записей и локально, и в OMEGA.
 # EN: Embedding degradation means zero writes both locally and in OMEGA.
 def test_degraded_causes_zero_local_and_remote_writes(self):
  self.Writer.embedding=lambda self,text:(_ for _ in ()).throw(lessons.Refused('embedding_degraded'))
  r=self.go();self.assertEqual(self.writes,0);self.assertEqual(self.local_rows,{});self.assertIn('embedding_degraded',r['reasons'])
 # RU: Дописывание к уже принятому блоку считается переписыванием.
 # EN: Appending to an already accepted block counts as a rewrite.
 def test_append_to_already_accepted_block_is_rewrite(self):
  self.go();self.source.write_text(BLOCK+'Дополнение к прежнему уроку.\n');r=self.go();self.assertEqual(r['agents'][0]['reason'],'source_rewritten')

 # RU: Постоянный отказ одного блока не блокирует следующий (limit=1). Ловит голодание очереди.
 # EN: A permanent refusal of one block does not block the next one (limit=1). Catches queue starvation.
 def test_permanent_refusal_does_not_starve_later_block(self):
  self.source.write_text(BLOCK+'\n'+BLOCK.replace('12:00','13:00'))
  self.Writer.embedding=lambda self,text:(_ for _ in ()).throw(lessons.Refused('embedding_degraded')) if '12:00Z' in text else [1.0]*1024
  self.assertEqual(self.go(limit=1)['omega_verified'],0)
  self.assertEqual(self.go(limit=1)['omega_verified'],1)

 # RU: Отвергнутый источник не копируется в файл состояния. Ловит утечку текста в состояние.
 # EN: A rejected source is not copied into the state file. Catches text leaking into state.
 def test_rejected_source_not_copied_into_state(self):
  self.source.write_text(BLOCK.replace('12:00Z','12:00Z fixture-secret'))
  def reject(*a,**kw):raise lessons.Refused('unsafe_source')
  with mock.patch.object(lessons,'assert_omega'),mock.patch.object(lessons,'local',side_effect=reject):
   lessons.run_stage(self.root/'state',self.registry,self.db,self.Writer)
  self.assertNotIn('fixture-secret',(self.root/'state/lessons.json').read_text())

class GuestMarkTests(unittest.TestCase):
 """RU: Урок гостевого агента ложится в OMEGA и локально с пометкой в начале, урок системного агента — без пометки (по решению владельца). / EN: A guest agent lesson is stored in OMEGA and locally with a leading mark; a system agent lesson has no mark (owner decision)."""
 local=StageTests.local;go=StageTests.go;tearDown=StageTests.tearDown
 # RU: Каждый тест: к системному агенту добавлен гостевой агент с признаком гостя в реестре; put запоминает записанный текст.
 # EN: Each test: a guest agent with the guest flag is added to the registry next to the system agent; put records the written text.
 def setUp(self):
  StageTests.setUp(self)
  self.ghome=self.root/'ghome';self.ghome.mkdir();self.gsource=self.ghome/'UROKI-GOST-V.md';self.gsource.write_text(BLOCK)
  self.registry.write_text(self.registry.read_text()+'- imya: gost-v\n  namerenie:\n    dom: '+str(self.ghome)+'\n    polzovatel: gost-v\n    uroki_file: '+str(self.gsource)
    +'\n    raskladka:\n      semejstvo: sdk-claude\n      otlichiya:\n        prichina: gost\n        parametry:\n          GOST: true\n')
  self.texts={};test=self;base_put=self.Writer.put
  def put(w,a,s,k,t,v,raw,path):test.texts[a]=t;return base_put(w,a,s,k,t,v,raw,path)
  self.Writer.put=put
 # RU: Гостевой урок помечен и в OMEGA, и локально, сумма содержимого в состоянии — от помеченного текста; системный урок без пометки.
 # EN: The guest lesson is marked both in OMEGA and locally, the state content hash is of the marked text; the system lesson is unmarked.
 def test_guest_marked_system_not(self):
  ag={a['agent']:a for a in lessons.load_agents(self.registry)}
  self.assertTrue(ag['gost-v']['gost']);self.assertFalse(ag['agent-m']['gost'])
  r=self.go();self.assertEqual(r['omega_verified'],2)
  self.assertTrue(self.texts['gost-v'].startswith(lessons.POMETKA_GOSTYA));self.assertFalse(self.texts['agent-m'].startswith(lessons.POMETKA_GOSTYA))
  gl=[v['text'] for s,v in self.local_rows.items() if 'UROKI-GOST-V' in s][0];self.assertEqual(gl,self.texts['gost-v'])
  st=json.loads((self.root/'state/lessons.json').read_text())['records'];g=[v for v in st.values() if v['agent']=='gost-v'][0]
  self.assertEqual(g['content_sha'],hashlib.sha256(self.texts['gost-v'].encode()).hexdigest())
 # RU: Ключ гостевого урока считается по непомеченному тексту.
 # EN: The guest lesson key is computed from the unmarked text.
 def test_guest_key_from_unmarked_body(self):
  bez=lessons.parse_blocks(BLOCK.encode(),str(self.gsource),'gost-v')[0][0]['key'];self.go()
  st=json.loads((self.root/'state/lessons.json').read_text())['records'];self.assertIn(bez,st)

class VectorStoreTests(unittest.TestCase):
 # RU: Нет векторного хранилища — отказ до вызова модели встраиваний. Ловит лишний расход на встраивание, которое некуда положить.
 # EN: No vector store — refusal before the embedding model is called. Catches wasted embedding work with nowhere to store it.
 def test_missing_vector_backend_refused_before_inference(self):
  from lessons_store import Writer
  w=object.__new__(Writer);w.store=mock.Mock(_vec_available=False);w.api=mock.Mock();w.api.generate_embedding.return_value=[1.0]*1024;w.api.is_embedding_degraded.return_value=False;w.api.get_active_backend.return_value='onnx'
  with self.assertRaisesRegex(lessons.Refused,'embedding_store_unavailable'):w.embedding('text')
  w.api.generate_embedding.assert_not_called()

class HistoricalFormat(unittest.TestCase):
 # RU: Закрытый блок с иной подписью строки доказательства сохраняется целиком; одиночный такой блок остаётся незавершённым.
 # EN: A closed block with a different evidence-line label is kept whole; a single such block stays unfinished.
 def test_closed_block_preserves_alternative_evidence_label(self):
  text=BLOCK.replace('Откуда знаю','Слово приёмки')+'\n'+BLOCK.replace('12:00','13:00')
  blocks,pending=lessons.parse_blocks(text.encode(),'/a','agent-z')
  self.assertEqual(len(blocks),2);self.assertIn('Слово приёмки',blocks[0]['body'])
  blocks,pending=lessons.parse_blocks(BLOCK.replace('Откуда знаю','Слово приёмки').encode(),'/a','agent-z')
  self.assertTrue(pending);self.assertEqual(blocks,[])

if __name__=='__main__':unittest.main(verbosity=2)
