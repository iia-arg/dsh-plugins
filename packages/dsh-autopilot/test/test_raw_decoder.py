"""Streaming real projection codec: discarded prompt bytes never enter checkpoints."""
import json, unittest
from test_raw_index import module
class Decoder(unittest.TestCase):
 def parse(self,record,chunk=127):
  m=module('raw_decoder.py');d=m.Decoder();out=[]
  body=(json.dumps(record,ensure_ascii=False)+'\n').encode()
  for i in range(0,len(body),chunk):
   out+=d.feed(body[i:i+chunk]);saved=d.checkpoint()
   self.assertNotIn('PRIVATE_PROMPT',saved)
   d=m.Decoder(saved)
  return out
 def test_large_discarded_text_and_tool_input_resume_without_private_bytes(self):
  row=dict(type='assistant',sessionId='s',timestamp='t',uuid='u',message=dict(id='msg_real',model='m',usage=dict(input_tokens=1),content=[dict(type='text',text='PRIVATE_PROMPT'+('Ж😀\\\"'*50000)),dict(type='tool_use',id='tool',name='Agent',input=dict(secret='PRIVATE_PROMPT'))]))
  result=self.parse(row,65536)
  self.assertEqual(result,[dict(type='assistant',sessionId='s',timestamp='t',uuid='u',message=dict(id='msg_real',model='m',usage=dict(input_tokens=1),content=[dict(type='text'),dict(type='tool_use',id='tool',name='Agent')]))])
 def test_each_utf8_escape_and_structural_split_matches_projection(self):
  self.assertEqual(self.parse(dict(type='user',sessionId='s',uuid='Ж😀'),1),[dict(type='user',sessionId='s',uuid='Ж😀')])
 def test_depth_duplicate_and_bad_json_named(self):
  m=module('raw_decoder.py')
  for raw,reason in [(b'{"type":"user","type":"assistant"}\n','SOURCE_JSON_INVALID'),(b'{"type": NaN}\n','SOURCE_JSON_INVALID'),(b'{"message": [1,]}\n','SOURCE_JSON_INVALID'),(('{"ignored":'+'['*65+'0'+']'*65+'}\n').encode(),'RAW_DECODER_LIMIT_EXCEEDED')]:
   with self.subTest(raw=raw[:30]),self.assertRaisesRegex(m.DecodeError,reason):m.Decoder().feed(raw)
 def test_partial_unicode_uses_same_serialized_byte_unit(self):
  m=module('raw_decoder.py');d=m.Decoder()
  raw=('{"sessionId":"'+('Ж'*50000)).encode()
  with self.assertRaisesRegex(m.DecodeError,'RAW_DECODER_LIMIT_EXCEEDED'):
   for i in range(0,len(raw),65536):d.feed(raw[i:i+65536])
 def test_partial_projection_obeys_same256KiB_limit(self):
  m=module('raw_decoder.py')
  raw=('{"uuid":"'+('a'*150000)+'","promptId":"'+('b'*150000)).encode()
  with self.assertRaisesRegex(m.DecodeError,'RAW_DECODER_LIMIT_EXCEEDED'):m.Decoder().feed(raw)
 def test_incomplete_row_is_resumable_not_a_completed_record(self):
  m=module('raw_decoder.py');d=m.Decoder()
  self.assertEqual(d.feed(b'{"type":"user","sessionId":"s","message":{"content":"PRIVATE_PROMPT'),[])
  saved=d.checkpoint();self.assertNotIn('PRIVATE_PROMPT',saved)
  self.assertEqual(m.Decoder(saved).feed(b'"}}\n'),[dict(type='user',sessionId='s')])
if __name__=='__main__':unittest.main()
