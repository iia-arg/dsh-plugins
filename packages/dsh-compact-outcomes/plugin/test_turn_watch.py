import unittest,tempfile,json,subprocess
from pathlib import Path
from turn_watch import classify_drop, monitor
class TurnWatch(unittest.TestCase):
 def point(self,t,n,platform=-1):return dict(agent='gamma',session='s',created=1,turn=t,seq=t*10,time=t*1000,tokens=n,threshold=950000,window=1000000,auto=True,uuid='u',platform_seq=platform,error=None)
 def test_growth(self):self.assertIsNone(classify_drop(self.point(1,700000),self.point(2,800000),.5))
 def test_platform(self):self.assertEqual(classify_drop(self.point(1,900000),self.point(2,100000,15),.5)['kind'],'platform')
 def test_codex_signal(self):
  r=classify_drop(self.point(1,900000),self.point(2,100000),.5);self.assertEqual((r['kind'],r['before'],r['after'],r['threshold']),('codex-suspected',900000,100000,950000))
 def test_boundary(self):self.assertIsNone(classify_drop(self.point(1,800000),self.point(2,400000),.5))
 def test_unknown(self):
  for change in [dict(uuid='other'),dict(uuid=None),dict(turn=4),dict(error='missing'),dict(tokens=None),dict(created=2)]:
   self.assertIsNone(classify_drop(self.point(1,900000),dict(self.point(2,100000),**change),.5))
 def test_channel_and_dedup(self):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td);logs=p/'logs';logs.mkdir();state=p/'state';state.mkdir();sink=p/'sink';trace=p/'trace'
   sink.write_text('#!/bin/sh\nprintf "%s\\n" "$1" >> '+str(trace)+'\n');sink.chmod(0o700)
   f=logs/'gamma.jsonl';config={'agents':[{'name':'gamma'}]}
   f.write_text('\n'.join(json.dumps(self.point(t,n)) for t,n in [(1,700000),(2,800000),(3,900000)])+'\n');monitor(config,state,logs,str(sink));self.assertFalse(trace.exists())
   with f.open('a') as out:out.write(json.dumps(self.point(4,100000,35))+'\n')
   monitor(config,state,logs,str(sink));self.assertFalse(trace.exists());self.assertIn('platform',(state/'turn-alerts.jsonl').read_text())
   with f.open('a') as out:
    out.write(json.dumps(self.point(5,900000,35))+'\n');out.write(json.dumps(self.point(6,100000,35))+'\n')
   monitor(config,state,logs,str(sink));text=trace.read_text();self.assertIn('900000 → стало 100000',text);self.assertIn('950000',text)
   monitor(config,state,logs,str(sink));self.assertEqual(trace.read_text(),text)
 def test_done_does_not_stop_turn_monitor(self):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td);logs=p/'logs';logs.mkdir();state=p/'state';state.mkdir();(state/'DONE').write_text('old observation finished')
   cfg=p/'agents.json';cfg.write_text(json.dumps({'agents':[{'name':'gamma'}]}));(logs/'gamma.jsonl').write_text(json.dumps(self.point(1,900000))+'\n')
   r=subprocess.run(['python3',str(Path(__file__).with_name('collector.py')),'--config',str(cfg),'--state-dir',str(state),'--turn-log-dir',str(logs),'--alert','/bin/false'],capture_output=True,text=True)
   self.assertEqual(r.returncode,0,r.stderr);self.assertTrue((state/'turn-watch-state.json').exists());self.assertTrue((state/'DONE').exists())
if __name__=='__main__':unittest.main()
